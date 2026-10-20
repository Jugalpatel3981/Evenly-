// Wording for the in-app notification list. Mirrors message() in supabase/functions/notify/index.ts.
import { fmt } from './util.js';

export function noteText(n){
  const d = n.data || {};
  const who = d.actor || 'Someone';
  const where = d.is_direct ? '' : ` in ${d.group}`;
  const what = `“${d.description}”`;
  const cur = d.currency || 'INR';
  const net = Number(d.net || 0);
  const share = net < 0 ? `You owe ${fmt(net, cur)}.` : net > 0 ? `You get back ${fmt(net, cur)}.` : '';
  const total = d.amount != null ? fmt(Number(d.amount), cur) : '';
  switch (n.kind) {
    case 'expense_added':
      if (d.expense_kind === 'payment') return {title: `${who} recorded a payment`, body: net < 0 ? `You received ${fmt(net, cur)}${where}.` : `You paid ${fmt(net, cur)}${where}.`};
      return {title: `${who} added ${what}${where}`, body: `${total} in total. ${share}`.trim()};
    case 'expense_updated':
      return {title: `${who} changed ${d.expense_kind === 'payment' ? 'a payment' : what}${where}`,
        body: d.removed ? 'You’re no longer part of this expense.' : net < 0 ? `You now owe ${fmt(net, cur)}.` : net > 0 ? `You now get back ${fmt(net, cur)}.` : `${total} in total.`};
    case 'expense_deleted': return {title: `${who} deleted ${d.expense_kind === 'payment' ? 'a payment' : what}${where}`, body: 'Your balance has been updated.'};
    case 'expense_restored': return {title: `${who} restored ${what}${where}`, body: share || 'Your balance has been updated.'};
    case 'comment': return {title: `${who} commented on ${what}`, body: String(d.body || '')};
    case 'reminder': return {title: `Reminder from ${who}`, body: `You owe ${who} ${fmt(Number(d.amount || 0), cur)}${where}. Settle up when you can.`};
    case 'added_to_group': return {title: d.is_direct ? `${who} added you as a friend` : `${who} added you to ${d.group}`, body: 'Open it to see your shared expenses.'};
    default: return {title: 'Evenly', body: ''};
  }
}
export const noteIcon = n => ({comment: 'message-square', reminder: 'bell', added_to_group: 'users', expense_deleted: 'trash-2'}[n.kind]
  || (n.data?.expense_kind === 'payment' ? 'arrow-left-right' : 'receipt'));
