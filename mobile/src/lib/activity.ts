// Wording for the activity feed, as pieces so the screen can bold names. Mirrors activityText() on the website.
import { curOf, payersOf } from './money';
import { myId, nameOf, S, titleOf, uid, membersOf, type Activity } from './store';
import { fmt } from './util';

export type Part = {t: string; b?: boolean; muted?: boolean};

function actorName(a: Activity){
  if (a.actor && a.actor === uid()) return 'You';
  const m = membersOf(a.group_id).find(x => x.user_id === a.actor);
  return (a.actor && S.profiles[a.actor]?.name) || m?.name || 'Someone';
}
function where(a: Activity){
  const g = S.groups[a.group_id]; if (!g) return '';
  if (!g.is_direct) return ` in “${g.name}”`;
  return a.actor && a.actor !== uid() ? '' : ` with ${titleOf(g)}`;
}
const nm = (gid: string, id: string) => { const n = nameOf(gid, id); return n === 'You' ? 'you' : n; };

export function activityParts(a: Activity): Part[] {
  const who: Part = {t: actorName(a), b: true}, e = a.data?.new || a.data?.old || {};
  const what = e.kind === 'payment' ? `a payment: ${nameOf(a.group_id, e.paid_by)} paid ${nm(a.group_id, Object.keys(e.split || {})[0])}` : `“${e.description}”`;
  const w = where(a);
  switch (a.kind) {
    case 'expense_added': return [who, {t: ` added ${what}${w}`}];
    case 'expense_recurring': return [{t: `${what} repeated${w}`}];
    case 'expense_updated': return [who, {t: ` updated ${what}${w}`}];
    case 'expense_deleted': return [who, {t: ` deleted ${what}${w}`}];
    case 'expense_restored': return [who, {t: ` restored ${what}${w}`}];
    case 'comment': return [who, {t: ` commented on “${a.data?.description}”: `}, {t: String(a.data?.body ?? ''), muted: true}];
    case 'group_created': return [who, {t: ` created the group “${a.data?.name}”`}];
    case 'friend_added': return who.t === 'You' ? [{t: `You started keeping track${w}`}] : [who, {t: ' added you as a friend'}];
    case 'member_added': return [who, {t: ` added ${a.data?.name}${w}`}];
    case 'member_joined': return [{t: String(a.data?.name), b: true}, {t: ` joined${w}`}];
    case 'member_left': return [{t: String(a.data?.name), b: true}, {t: ` left${w}`}];
    default: return [];
  }
}
// "You get back ₹300" / "You owe ₹300" under a new expense, from my side.
export function activityImpact(a: Activity): {text: string; pos: boolean} | null {
  const e = a.data?.new; if (!e || !/expense_added|expense_restored|expense_recurring/.test(a.kind) || e.kind === 'payment') return null;
  const me = myId(a.group_id); if (!me) return null;
  const cur = curOf(e, S.groups[a.group_id]), net = Number(payersOf(e)[me] || 0) - Number(e.split?.[me] || 0);
  return net > 0 ? {text: `You get back ${fmt(net, cur)}`, pos: true} : net < 0 ? {text: `You owe ${fmt(net, cur)}`, pos: false} : null;
}
// Which icon and category colour to show beside an activity.
export function activityIcon(a: Activity): {cat?: string; icon?: string; tone?: 'accent' | 'owe'} {
  const e = a.data?.new || a.data?.old;
  if (a.kind === 'comment') return {icon: 'message-square', tone: 'accent'};
  if (a.kind === 'expense_deleted') return {icon: 'trash', tone: 'owe'};
  if (/^member|group_created|friend_added/.test(a.kind)) return {icon: 'users', tone: 'accent'};
  if (e?.kind === 'payment') return {icon: 'arrow-left-right', tone: 'accent'};
  return e ? {cat: e.category} : {icon: 'activity', tone: 'accent'};
}
