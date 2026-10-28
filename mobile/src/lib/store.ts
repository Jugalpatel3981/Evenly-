// App state and everything derived from the data. Screens read it with useStore() and re-render on change.
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { addMaps, balances, between, type Expense, type Map } from './money';
import { sb } from './supabase';

export type Group = {id: string; name: string; currency: string; is_direct: boolean; type?: string; cover_url?: string | null;
  created_at: string; simplify?: boolean; whiteboard?: string; invite_code?: string; default_split?: any};
export type Member = {id: string; group_id: string; user_id: string | null; name: string; email: string | null; created_at: string};
export type Profile = {id: string; name: string; avatar_url?: string | null; default_currency?: string; budgets?: Map; [k: string]: any};
export type Activity = {id: number; group_id: string; expense_id: string | null; actor: string | null; kind: string; data: any; created_at: string};
export type Notification = {id: string; kind: string; data: any; read_at: string | null; created_at: string; group_id?: string; expense_id?: string};
export type ExpenseRow = Expense & {id: string; group_id: string; description: string; date: string; created_at: string; category?: string;
  split_mode?: string; repeat?: string; notes?: string; pending?: boolean};

export const S = {
  session: null as Session | null,
  ready: false,
  loadError: null as string | null,
  groups: {} as Record<string, Group>,
  members: {} as Record<string, Member[]>,
  expenses: {} as Record<string, ExpenseRow>,
  profiles: {} as Record<string, Profile>,
  activity: [] as Activity[],
  notifications: [] as Notification[],
};

/* ---------- change notifications for React ---------- */
let version = 0;
const listeners = new Set<() => void>();
export const emit = () => { version++; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
// Re-renders the calling screen whenever the data changes.
export function useStore(){ useSyncExternalStore(subscribe, () => version, () => version); return S; }

/* ---------- who am I ---------- */
export const uid = () => S.session?.user?.id;
export const myProfile = () => S.profiles[uid() || ''] || null;
export const myName = () => myProfile()?.name || S.session?.user?.user_metadata?.name || S.session?.user?.user_metadata?.full_name
  || (S.session?.user?.email || '').split('@')[0] || 'Me';
export const unreadCount = () => S.notifications.filter(n => !n.read_at).length;
export const defaultCurrency = () => myProfile()?.default_currency || 'INR';

/* ---------- loading ---------- */
async function fetchAll<T>(table: string): Promise<T[]> {
  const out: T[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const {data, error} = await sb.from(table).select('*').range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (data.length < size) return out;
  }
}
const recent = async <T>(table: string, n: number): Promise<T[]> => {
  const {data, error} = await sb.from(table).select('*').order('created_at', {ascending: false}).limit(n);
  if (error) throw error;
  return data as T[];
};
export async function loadAll(){
  const [g, m, e, p, a, nt] = await Promise.all([
    fetchAll<Group>('groups'), fetchAll<Member>('group_members'), fetchAll<ExpenseRow>('expenses'), fetchAll<Profile>('profiles'),
    recent<Activity>('activity', 300), recent<Notification>('notifications', 100).catch(() => []),
  ]);
  S.groups = Object.fromEntries(g.map(r => [r.id, r]));
  S.members = {};
  m.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))).forEach(r => (S.members[r.group_id] ||= []).push(r));
  S.expenses = Object.fromEntries(e.map(r => [r.id, r]));
  S.profiles = Object.fromEntries(p.map(r => [r.id, r]));
  S.activity = a;
  S.notifications = nt;
  S.ready = true;
  emit();
}
let reloadT: ReturnType<typeof setTimeout> | undefined;
export const scheduleReload = () => { clearTimeout(reloadT); reloadT = setTimeout(() => { loadAll().catch(() => {}); }, 250); };

// After sign-in: link pending invites, load everything, create any due repeats, then listen for live changes.
let booted: string | null = null, channel: RealtimeChannel | null = null;
export async function boot(){
  const me = uid();
  if (!me || booted === me) return;
  booted = me; S.ready = false; emit();
  try { await sb.rpc('claim_invites'); } catch {}
  try {
    await loadAll();
    if (!myProfile()) await sb.from('profiles').upsert({id: me, name: myName()}, {onConflict: 'id', ignoreDuplicates: true});
    const {data: made} = await sb.rpc('process_recurring');
    if (made || !myProfile()) await loadAll();
  } catch (err) {
    S.ready = true; S.loadError = friendly(err); emit();
  }
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('evenly-' + me).on('postgres_changes', {event: '*', schema: 'public'}, scheduleReload).subscribe();
}
export function teardown(){
  booted = null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  Object.assign(S, {groups: {}, members: {}, expenses: {}, profiles: {}, activity: [], notifications: [], ready: false, loadError: null});
  emit();
}
export function friendly(err: unknown){
  const m = (err && ((err as any).message || (err as any).error_description)) || String(err);
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Google sign-in isn’t switched on yet. Use your email and password for now.';
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/User already registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Use a password with at least 6 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
  if (/Could not find the function|schema cache|column .* does not exist|relation .* does not exist/i.test(m)) return 'The database needs updating: run supabase/schema.sql again in Supabase.';
  return m;
}

/* ---------- derived data ---------- */
export const groupList = () => Object.values(S.groups).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
export const membersOf = (gid: string) => S.members[gid] || [];
export const memberIds = (gid: string) => membersOf(gid).map(m => m.id);
export const expOf = (gid: string) => Object.values(S.expenses).filter(e => e.group_id === gid)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
export const member = (gid: string, id: string) => membersOf(gid).find(m => m.id === id);
export const personName = (m?: Member | null) => m ? ((m.user_id && S.profiles[m.user_id]?.name) || m.name) : '';
export const nameOf = (gid: string, id: string) => {
  const m = member(gid, id); if (!m) return 'Former member';
  if (m.user_id === uid()) return 'You';
  return personName(m);
};
export const myId = (gid: string) => membersOf(gid).find(m => m.user_id === uid())?.id || null;
export const friendOf = (gid: string) => membersOf(gid).find(m => m.user_id !== uid()) || null;
export const titleOf = (g: Group) => g.is_direct ? (personName(friendOf(g.id)) || 'Friend') : g.name;
export const avatarUrl = (m?: Member | null) => (m?.user_id && S.profiles[m.user_id]?.avatar_url) || null;

export const groupBalances = (gid: string) => balances(expOf(gid), memberIds(gid), S.groups[gid]);
// My balance in a group, per currency: positive means I'm owed.
export function myBalance(gid: string){
  const me = myId(gid); const out: Map = {};
  if (!me) return out;
  for (const [cur, b] of Object.entries(groupBalances(gid))) if (b[me]) out[cur] = b[me];
  return out;
}
// Everything I'm owed and owe, per currency, across all groups and friends.
export function totals(){
  const owed: Map = {}, owe: Map = {};
  for (const g of Object.values(S.groups)) {
    for (const [c, v] of Object.entries(myBalance(g.id))) { if (v > 0) owed[c] = (owed[c] || 0) + v; else owe[c] = (owe[c] || 0) - v; }
  }
  return {owed, owe};
}

// Everyone I share a group or a friend ledger with, merged into one person each.
// key: u:<account id> for people with accounts, e:<email> for invited people, d:<ledger id> for name-only friends.
export type Friend = {key: string; userId: string | null; email: string | null; name: string; member: Member; ledger: string | null;
  groups: {gid: string; amt: Map}[]; total: Map};
export function personKey(m: Member, g: Group){
  if (m.user_id) return 'u:' + m.user_id;
  if (m.email) return 'e:' + m.email.toLowerCase();
  return g.is_direct ? 'd:' + g.id : null;
}
export function friendsIndex(){
  const out = new Map<string, Friend>();
  for (const g of Object.values(S.groups)) {
    const me = myId(g.id); if (!me) continue;
    const exps = expOf(g.id);
    for (const m of membersOf(g.id)) {
      if (m.id === me) continue;
      const key = personKey(m, g); if (!key) continue;
      const f = out.get(key) || {key, userId: m.user_id, email: m.email, name: personName(m), member: m, ledger: null, groups: [], total: {}};
      if (m.user_id) f.userId = m.user_id;
      if (m.email && !f.email) f.email = m.email;
      const amt = between(exps, g, me, m.id);
      f.total = addMaps(f.total, amt);
      if (g.is_direct) { f.ledger = g.id; f.name = personName(m); f.member = m; }
      else f.groups.push({gid: g.id, amt});
      out.set(key, f);
    }
  }
  return out;
}
