// App state, the Supabase connection, and everything derived from the data.
import { balances, between, addMaps } from './money.js';

const cfg = window.EVENLY_CONFIG || {};
// Accept common copy-paste variants: a trailing slash, /rest/v1/, or the dashboard address.
function projectUrl(raw){
  try {
    const u = new URL(String(raw || '').trim());
    const dash = u.pathname.match(/\/project\/([a-z0-9]{10,})/i);
    if (/(^|\.)supabase\.com$/i.test(u.hostname) && dash) return `https://${dash[1]}.supabase.co`;
    return u.origin;
  } catch { return ''; }
}
const SB_URL = projectUrl(cfg.SUPABASE_URL), SB_KEY = String(cfg.SUPABASE_ANON_KEY || '').trim();
const configured = SB_URL && !/YOUR-PROJECT/i.test(SB_URL) && SB_KEY && !/YOUR-ANON/.test(SB_KEY);
export const sb = configured && window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;

const ls = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
};
export { ls };

export const S = {
  session: null, ready: false, recovery: false,
  groups: {}, members: {}, expenses: {}, profiles: {}, activity: [], notifications: [],
  view: 'home', gid: null, fkey: null, tab: 'expenses', authMode: 'signin',
  homeTab: ls.get('evenly.homeTab', 'friends'),
  pendingInvite: ls.get('evenly.invite', null),
};

let listener = () => {};
export const onChange = fn => { listener = fn; };
export const emit = () => listener();

export const uid = () => S.session?.user?.id;
export const myProfile = () => S.profiles[uid()] || null;
export const myName = () => myProfile()?.name || S.session?.user?.user_metadata?.name || (S.session?.user?.email || '').split('@')[0] || 'Me';
export const unreadCount = () => S.notifications.filter(n => !n.read_at).length;
export const defaultCurrency = () => myProfile()?.default_currency || 'INR';

/* ---------- loading ---------- */
async function fetchAll(table){
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const {data, error} = await sb.from(table).select('*').range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}
export async function loadAll(){
  const recent = (table, n) => sb.from(table).select('*').order('created_at', {ascending: false}).limit(n).then(r => { if (r.error) throw r.error; return r.data; });
  const [g, m, e, p, a, nt] = await Promise.all([
    fetchAll('groups'), fetchAll('group_members'), fetchAll('expenses'), fetchAll('profiles'), recent('activity', 300),
    // Older databases (before phase 3) have no notifications table yet.
    recent('notifications', 100).catch(() => []),
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
let reloadT = null;
export const scheduleReload = () => { clearTimeout(reloadT); reloadT = setTimeout(() => loadAll().catch(err => toastHook(friendly(err))), 250); };

let toastHook = () => {};
export const setToast = fn => { toastHook = fn; };

export function friendly(err){
  const m = (err && (err.message || err.error_description)) || String(err);
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/User already registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Use a password with at least 6 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
  if (/violates foreign key/i.test(m)) return 'That person still has expenses in this group.';
  if (/Could not find the function|schema cache/i.test(m)) return 'The database needs updating: run supabase/schema.sql again in Supabase.';
  if (/column .* does not exist|relation .* does not exist/i.test(m)) return 'The database needs updating: run supabase/schema.sql again in Supabase.';
  return m;
}
// Run a write; on success refresh data, on failure show why.
export async function run(promise, okMsg){
  const {data, error} = await promise;
  if (error) { toastHook(friendly(error)); return null; }
  if (okMsg) toastHook(okMsg);
  scheduleReload();
  return data ?? true;
}

/* ---------- derived data ---------- */
export const groupList = () => Object.values(S.groups).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
export const membersOf = gid => S.members[gid] || [];
export const memberIds = gid => membersOf(gid).map(m => m.id);
export const expOf = gid => Object.values(S.expenses).filter(e => e.group_id === gid)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
export const member = (gid, id) => membersOf(gid).find(m => m.id === id);
export const nameOf = (gid, id) => {
  const m = member(gid, id); if (!m) return 'Former member';
  if (m.user_id === uid()) return 'You';
  return (m.user_id && S.profiles[m.user_id]?.name) || m.name;
};
export const myId = gid => membersOf(gid).find(m => m.user_id === uid())?.id || null;
export const friendOf = gid => membersOf(gid).find(m => m.user_id !== uid()) || null;
export const titleOf = g => g.is_direct ? (personName(friendOf(g.id)) || 'Friend') : g.name;
export const personName = m => m ? ((m.user_id && S.profiles[m.user_id]?.name) || m.name) : '';
export const avatarUrl = m => (m?.user_id && S.profiles[m.user_id]?.avatar_url) || null;

// Balances per currency for a group: {INR: {memberId: amount}}.
export const groupBalances = gid => balances(expOf(gid), memberIds(gid), S.groups[gid]);
// My balance in a group, per currency: positive means I'm owed.
export function myBalance(gid){
  const me = myId(gid); const out = {};
  if (!me) return out;
  for (const [cur, b] of Object.entries(groupBalances(gid))) if (b[me]) out[cur] = b[me];
  return out;
}

// Everyone I share a group or a friend ledger with, merged into one person each.
// key: u:<account id> for people with accounts, e:<email> for invited people, d:<ledger id> for name-only friends.
export function personKey(m, g){
  if (m.user_id) return 'u:' + m.user_id;
  if (m.email) return 'e:' + m.email.toLowerCase();
  return g.is_direct ? 'd:' + g.id : null;
}
export function friendsIndex(){
  const out = new Map();
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
