// Writes to the database and the wording that goes with them, shared by the forms.
import { toast } from '@/ui/toast';

import { catOf } from './categories';
import { payersOf } from './money';
import { defaultCurrency, expOf, friendly, loadAll, membersOf, myId, myName, nameOf, S, scheduleReload, titleOf, uid,
  type Friend, type Group } from './store';
import { sb } from './supabase';
import { fmt, niceDate } from './util';

export const REPEATS: [string, string][] = [['never', 'Doesn’t repeat'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
export const MODES: [string, string][] = [['equal', 'Equally'], ['exact', 'Exact'], ['percent', '%'], ['shares', 'Shares'], ['adjust', '+/−'], ['items', 'Items']];
export const MODE_WORDS: Record<string, string> = {equal: 'equally', exact: 'by exact amounts', percent: 'by percentages', shares: 'by shares', adjust: 'with adjustments', items: 'by items'};

// Run a write; on success refresh the data and say so, on failure say why.
export async function run<T>(promise: PromiseLike<{data: T; error: any}>, okMsg?: string): Promise<T | true | null> {
  const {data, error} = await promise;
  if (error) { toast(friendly(error)); return null; }
  if (okMsg) toast(okMsg);
  scheduleReload();
  return (data ?? true) as T | true;
}

// A friend's one-to-one ledger, made on first use.
export async function ensureLedger(f: Friend): Promise<string> {
  if (f.ledger) return f.ledger;
  const {data, error} = await sb.rpc('add_friend', {p_my_name: myName(), p_name: f.name, p_email: f.email || null, p_currency: defaultCurrency(), p_friend_user: f.userId || null});
  if (error) throw error;
  return data as string;
}

export async function restoreExpense(activityId: number){
  return run(sb.rpc('restore_expense', {p_activity: Number(activityId)}), 'Restored');
}

// "you" for me, otherwise the name.
export const nm = (gid: string, id: string) => { const n = nameOf(gid, id); return n === 'You' ? 'you' : n; };
export function whoDid(gid: string, actor: string | null){
  if (actor === uid()) return 'You';
  return (actor && S.profiles[actor]?.name) || membersOf(gid).find(m => m.user_id === actor)?.name || 'Someone';
}

// Members who appear in any expense: they can't be removed from the group.
export function usedMembers(gid: string){
  const used = new Set<string>();
  expOf(gid).forEach(e => { used.add(e.paid_by); Object.keys(payersOf(e)).forEach(k => used.add(k)); Object.keys(e.split || {}).forEach(k => used.add(k)); });
  return used;
}

// ": Asha 50%, Bina 30%" after "New expenses start split by percentages".
export function defaultSummary(g: Group){
  const d = g.default_split, ids = membersOf(g.id).map(m => m.id);
  if (!d || d.mode === 'equal') return d?.inc?.length && d.inc.length < ids.length ? ` among ${d.inc.map((id: string) => nameOf(g.id, id)).join(', ')}` : '';
  const vals = Object.entries(d.input || {}).filter(([id, v]) => ids.includes(id) && String(v).trim() !== '');
  const unit = d.mode === 'percent' ? '%' : d.mode === 'shares' ? ' shares' : '';
  return vals.length ? `: ${vals.map(([id, v]) => `${nameOf(g.id, id)} ${v}${unit}`).join(', ')}` : '';
}

// What changed in an edit, in plain words: "the amount from ₹900.00 to ₹1,200.00", "Bina’s share from …".
export function changes(a: {data: any}, gid: string){
  const o = a.data?.old || {}, n = a.data?.new || {}, out: string[] = [];
  const oc = o.currency || S.groups[gid]?.currency || 'INR', nc = n.currency || S.groups[gid]?.currency || 'INR';
  const name = (id: string) => { const x = nameOf(gid, id); return x === 'You' ? 'your' : `${x}’s`; };
  const payer = (e: any) => { const p = payersOf(e), ks = Object.keys(p); return ks.length > 1 ? `${ks.length} people` : nameOf(gid, ks[0]); };
  if (o.description !== n.description) out.push(`the description from “${o.description}” to “${n.description}”`);
  if (Number(o.amount) !== Number(n.amount) || oc !== nc) out.push(`the amount from ${fmt(Number(o.amount), oc)} to ${fmt(Number(n.amount), nc)}`);
  if (o.date !== n.date) out.push(`the date from ${niceDate(o.date)} to ${niceDate(n.date)}`);
  if (o.category !== n.category) out.push(`the category to ${catOf(n.category).label}`);
  if (o.paid_by !== n.paid_by || JSON.stringify(o.payers) !== JSON.stringify(n.payers)) out.push(`who paid from ${payer(o)} to ${payer(n)}`);
  if (JSON.stringify(o.split) !== JSON.stringify(n.split) && Number(o.amount) === Number(n.amount)) {
    const ids = [...new Set([...Object.keys(o.split || {}), ...Object.keys(n.split || {})])]
      .filter(id => Number(o.split?.[id] || 0) !== Number(n.split?.[id] || 0));
    ids.slice(0, 3).forEach(id => out.push(`${name(id)} share from ${fmt(Number(o.split?.[id] || 0), nc)} to ${fmt(Number(n.split?.[id] || 0), nc)}`));
    if (ids.length > 3) out.push(`${ids.length - 3} more shares`);
  } else if (JSON.stringify(o.split) !== JSON.stringify(n.split)) {
    // An equal split just follows a new amount: only mention it if who's in it changed.
    const sameEqual = o.split_mode === 'equal' && n.split_mode === 'equal'
      && JSON.stringify(Object.keys(o.split || {}).sort()) === JSON.stringify(Object.keys(n.split || {}).sort());
    if (!sameEqual) out.push('the split');
  }
  if ((o.notes || '') !== (n.notes || '')) out.push(n.notes ? 'the notes' : 'removed the notes');
  if ((o.receipt_path || null) !== (n.receipt_path || null)) out.push(n.receipt_path ? 'the receipt photo' : 'removed the receipt photo');
  if (o.repeat !== n.repeat) out.push(n.repeat === 'never' ? 'it to stop repeating' : `it to repeat ${n.repeat}`);
  if (!out.length) return 'this expense';
  return out.length === 1 ? out[0] : `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`;
}

// "Goa trip: who owes whom" for pasting into a group chat.
export function summaryText(g: Group, transfers: Record<string, {from: string; to: string; amount: number}[]>, appUrl: string){
  const lines: string[] = [];
  for (const [cur, tx] of Object.entries(transfers))
    tx.forEach(t => lines.push(`• ${nameOf(g.id, t.from)} ${t.from === myId(g.id) ? 'pay' : 'pays'} ${nameOf(g.id, t.to)} ${fmt(t.amount, cur)}`));
  return `${g.is_direct ? `You and ${titleOf(g)}` : g.name}: who owes whom\n` + (lines.join('\n') || 'Everyone is settled up.') + `\n\nSee the details: ${appUrl}`;
}

export { loadAll };
