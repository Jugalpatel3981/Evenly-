// Screens. Each returns HTML for #app; clicks are handled in main.js through data-act attributes.
// Layout: a bottom tab bar (Groups, Friends, Activity, Account) on the home screens, and pages
// for a group or friend with a banner, a big avatar, one-line balances and a row of pill buttons.
import { S, uid, myName, myProfile, unreadCount, member, groupList, membersOf, expOf, nameOf, myId, friendOf, titleOf,
         personName, avatarUrl, groupBalances, myBalance, friendsIndex } from './state.js';
import { esc, fmt, fmtMulti, ago } from './util.js';
import { simplify, pairwise, payersOf, curOf, between } from './money.js';
import { catOf, CATEGORY_GROUPS, typeOf } from './categories.js';
import { icon } from './icons.js';
import { avatar, catIcon, payIcon, balanceLines, currencyOptions } from './ui.js';
import { noteText, noteIcon } from './messages.js';
import { sumIn, rates, toCurrency } from './rates.js';
import { outbox } from './state.js';

// nameOf() gives "You"; in the middle of a sentence it should read "you".
const nm = (gid, id) => { const n = nameOf(gid, id); return n === 'You' ? 'you' : n; };
const brand = `<div class="brand"><span class="mark" aria-hidden="true">E</span>Evenly</div>`;
const chev = `<span class="chev" aria-hidden="true">${icon('chevron-right', 18)}</span>`;

export function renderSetup(){
  return `<header class="top">${brand}</header><div class="empty"><h1>Almost there</h1>
    <p>Evenly needs its free Supabase database. Open <code>config.js</code> and paste your project URL and anon key, then reload this page.</p></div>`;
}

// Google's own "G" mark, which its sign-in button guidelines ask for.
const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
export function renderAuth(){
  const m = S.authMode;
  const title = m === 'signup' ? 'Create your account' : m === 'reset' ? 'Reset your password' : 'Sign in';
  const invite = S.pendingInvite ? `<div class="banner ok">You’ve been invited to split expenses on Evenly. Sign in or create an account to join.</div>` : '';
  return `<div class="auth">${brand}${invite}
    <form class="card" id="authForm" novalidate>
      <h1 style="font-size:28px">${title}</h1>
      <p class="muted">${m === 'signup' ? 'Split trips, rent and dinners with friends. Free.' : m === 'reset' ? 'We’ll email you a link to choose a new password.' : 'Welcome back. Your balances are waiting.'}</p>
      ${m !== 'reset' ? `<button type="button" class="btn google" data-auth-google>${GOOGLE_G}<span>Continue with Google</span></button>
      <div class="or-line"><span>or with email</span></div>` : ''}
      ${m === 'signup' ? `<label class="f">Your name<input id="aName" autocomplete="name" maxlength="40" placeholder="Asha Patel"></label>` : ''}
      <label class="f">Email<input id="aEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
      ${m !== 'reset' ? `<label class="f">Password<input id="aPass" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}" placeholder="${m === 'signup' ? 'At least 6 characters' : ''}"></label>` : ''}
      <p class="hint err" id="aHint"></p>
      <button class="btn primary" type="submit" style="justify-content:center">${m === 'signup' ? 'Create account' : m === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      ${m === 'signin' ? `<p style="font-size:14px"><button type="button" class="linkbtn" data-auth="reset">Forgot your password?</button></p>` : ''}
    </form>
    <p style="text-align:center;font-size:14px">${m === 'signup' ? 'Already have an account? <button type="button" class="linkbtn" data-auth="signin">Sign in</button>'
      : m === 'reset' ? '<button type="button" class="linkbtn" data-auth="signin">Back to sign in</button>'
      : 'New here? <button type="button" class="linkbtn" data-auth="signup">Create an account</button>'}</p>
    <p class="muted small" style="text-align:center"><a href="privacy.html">Privacy policy</a></p>
  </div>`;
}

export function renderRecovery(){
  return `<div class="auth">${brand}<form class="card" id="recForm" novalidate>
    <h1 style="font-size:28px">Choose a new password</h1>
    <label class="f">New password<input id="rPass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label>
    <p class="hint err" id="rHint"></p>
    <button class="btn primary" type="submit" style="justify-content:center">Save password</button></form></div>`;
}

/* ---------- app shell ---------- */
const TABS = [['groups', 'Groups', 'users'], ['friends', 'Friends', 'user'], ['activity', 'Activity', 'activity'], ['account', 'Account', 'circle-user']];
function tabBar(){
  const n = unreadCount();
  return `<nav class="tabbar" aria-label="Main">${TABS.map(([k, l, ic]) => `<button class="tabbar-btn" data-act="home-tab" data-tab="${k}" aria-current="${S.homeTab === k ? 'page' : 'false'}">
    <span class="tb-ico">${k === 'account' && myProfile()?.avatar_url ? avatar(myName(), myProfile().avatar_url, 'av tiny') : icon(ic, 22)}${k === 'activity' && n ? `<span class="dot-count">${n > 99 ? '99+' : n}</span>` : ''}</span>
    <span>${l}</span></button>`).join('')}</nav>`;
}
const appBar = (left, right) => `<header class="appbar">${left || '<span></span>'}${right || '<span></span>'}</header>`;
const searchBtn = `<button class="btn ghost icon-btn" data-act="search" aria-label="Search">${icon('search', 22)}</button>`;
const fab = act => `<button class="fab" data-act="${act}">${icon('receipt', 20)} Add expense</button>`;

export function renderApp(){
  if (!S.ready) return `<p class="loading">Opening your balances…</p>`;
  if (S.view === 'settings') { S.view = 'home'; S.homeTab = 'account'; }
  if (S.view === 'notifications') { S.view = 'home'; S.homeTab = 'activity'; S.actTab = 'foryou'; }
  if (!TABS.some(t => t[0] === S.homeTab)) S.homeTab = 'friends';
  if (S.view === 'group' && !S.groups[S.gid]) S.view = 'home';
  if (S.view === 'friend') {
    const f = friendsIndex().get(S.fkey);
    // Once a one-to-one ledger exists (say, after the first expense), show that instead.
    if (!f) S.view = 'home';
    else if (f.ledger) Object.assign(S, {view: 'group', gid: f.ledger, tab: 'expenses'});
  }
  document.body.classList.toggle('with-tabbar', S.view === 'home');
  const off = offlineBar();
  if (S.view === 'group') return off + renderGroup(S.groups[S.gid]);
  if (S.view === 'friend') return off + renderFriendOnly(friendsIndex().get(S.fkey));
  if (S.view === 'spending') return off + renderSpending();
  const t = S.homeTab;
  const body = t === 'groups' ? renderGroupsTab() : t === 'activity' ? renderActivityTab() : t === 'account' ? renderSettings() : renderFriendsTab();
  return off + body + (t === 'account' ? '' : fab('pick-exp')) + tabBar();
}
function offlineBar(){
  const n = outbox().length;
  if (!S.offline && navigator.onLine && !n) return '';
  return `<div class="offline-bar">${icon('refresh-cw', 15)}<span>${S.offline || !navigator.onLine ? 'You’re offline. Showing your last saved balances.' : 'Syncing…'}
    ${n ? ` ${n} change${n > 1 ? 's' : ''} will sync when you’re back online.` : ''}</span></div>`;
}

/* ---------- balances shown as one-liners ---------- */
function totals(){
  const owed = {}, owe = {};
  for (const g of Object.values(S.groups)) {
    for (const [c, v] of Object.entries(myBalance(g.id))) { if (v > 0) owed[c] = (owed[c] || 0) + v; else owe[c] = (owe[c] || 0) - v; }
  }
  return {owed, owe};
}
function totalCard(){
  const {owed, owe} = totals();
  const any = Object.keys(owed).length || Object.keys(owe).length;
  const filt = FILTERS.find(f => f[0] === S.filter) || FILTERS[0];
  return `<div class="total-card"><div class="tc-mark" aria-hidden="true">${icon('wallet', 26)}</div>
    <div class="tc-text"><div class="tc-lbl">Total balance</div>
      ${Object.keys(owe).length ? `<div class="neg">You owe ${fmtMulti(owe)}</div>` : ''}
      ${Object.keys(owed).length ? `<div class="pos">You are owed ${fmtMulti(owed)}</div>` : ''}
      ${any ? '' : `<div class="muted">You’re all settled up</div>`}${overallLine(owed, owe)}</div>
    <button class="btn ghost icon-btn tc-filter${S.filter && S.filter !== 'all' ? ' on' : ''}" data-act="filter" aria-label="Filter: ${filt[1]}">${icon('sliders-horizontal', 20)}</button></div>`;
}
// With balances in more than one currency, also show the overall total in your default currency.
function overallLine(owed, owe){
  const curs = new Set([...Object.keys(owed), ...Object.keys(owe)]), mine = myProfile()?.default_currency || 'INR';
  if (!curs.size || (curs.size === 1 && curs.has(mine))) return '';
  const a = sumIn(owed, mine), b = sumIn(owe, mine);
  if (a == null || b == null) return '';
  const net = a - b;
  return `<div class="tc-overall small">${net >= 0 ? 'Overall you are owed' : 'Overall you owe'} ≈ <b>${fmt(net, mine)}</b> <span class="muted">· ${esc(rates()?.source || '')} rates</span></div>`;
}
export const FILTERS = [['all', 'All'], ['outstanding', 'Outstanding balances'], ['owe', 'People you owe'], ['owed', 'People who owe you']];
const passes = map => {
  const v = Object.values(map || {});
  switch (S.filter) {
    case 'outstanding': return v.some(x => x);
    case 'owe': return v.some(x => x < 0);
    case 'owed': return v.some(x => x > 0);
    default: return true;
  }
};
// "Bina owes you ₹300" / "You owe Ravi ₹50" for one person, per currency.
function personLine(name, amt, where = ''){
  return Object.entries(amt).filter(([, v]) => v).map(([c, v]) => v > 0
    ? `<span class="line">${esc(name)} owes you <b class="pos">${fmt(v, c)}</b>${where}</span>`
    : `<span class="line">You owe ${esc(name)} <b class="neg">${fmt(v, c)}</b>${where}</span>`).join('');
}
// My one-liners for a group: what each member and I owe each other.
function groupLines(g, max = 3){
  const me = myId(g.id); if (!me) return [];
  const exps = expOf(g.id), out = [];
  for (const m of membersOf(g.id)) {
    if (m.id === me) continue;
    const l = personLine(personName(m), between(exps, g, me, m.id));
    if (l) out.push(l);
  }
  return out.length > max ? [...out.slice(0, max), `<span class="line muted">Plus ${out.length - max} more balance${out.length - max > 1 ? 's' : ''}</span>`] : out;
}
const rightLabel = (map, they = 'owes you') => {
  const vals = Object.entries(map || {}).filter(([, v]) => v);
  if (!vals.length) return `<span class="amt"><span class="muted">settled up</span></span>`;
  return `<span class="amt">${balanceLines(map, {they, you: 'you owe'})}</span>`;
};

/* ---------- Friends tab ---------- */
function renderFriendsTab(){
  const friends = [...friendsIndex().values()].sort((a, b) => {
    const za = !Object.values(a.total).some(v => v), zb = !Object.values(b.total).some(v => v);
    return za - zb || a.name.localeCompare(b.name);
  });
  const shown = friends.filter(f => passes(f.total));
  const bar = appBar(searchBtn, `<button class="btn ghost bar-action" data-act="new-friend">${icon('user-plus', 18)} Add friends</button>`);
  if (!friends.length) return bar + `<h1 class="page-title">Friends</h1>${pushBanner()}<div class="empty"><h2>Split with one friend</h2>
    <p>Paid for a friend’s coffee or a cab? Add them and keep track between just the two of you, no group needed.</p>
    <button class="btn primary" data-act="new-friend">${icon('user-plus', 16)} Add a friend</button></div>`;
  return bar + `<h1 class="page-title">Friends</h1>${pushBanner()}${totalCard()}
    <div class="list plain">${shown.map(f => {
      const inGroups = f.groups.filter(x => Object.values(x.amt).some(v => v));
      const direct = f.ledger && inGroups.length ? personLine(f.name, myBalance(f.ledger), ` <span class="muted">outside groups</span>`) : '';
      const groupLinesHtml = direct + inGroups.slice(0, 2).map(x => personLine(f.name, x.amt, ` <span class="muted">in ${esc(S.groups[x.gid].name)}</span>`)).join('');
      return `<button class="row frow" data-act="open-friend" data-key="${esc(f.key)}">
        ${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url, 'av md')}
        <span class="main"><span class="title">${esc(f.name)}</span>${f.userId ? '' : `<span class="sub">${f.email ? 'Invited' : 'Not on Evenly yet'}</span>`}${groupLinesHtml ? `<span class="lines">${groupLinesHtml}</span>` : ''}</span>
        ${rightLabel(f.total)}${chev}</button>`; }).join('') || `<div class="row static muted">Nobody matches this filter.</div>`}</div>`;
}

/* ---------- Groups tab ---------- */
function groupAvatar(g, cls = 'gav'){
  const t = typeOf(g.type);
  return g.cover_url ? `<span class="${cls} photo" aria-hidden="true"><img src="${esc(g.cover_url)}" alt="" loading="lazy"></span>`
                     : `<span class="${cls} type-${t[0]}" aria-hidden="true">${icon(t[2], cls === 'gav' ? 24 : 34)}</span>`;
}
function renderGroupsTab(){
  const groups = groupList().filter(g => !g.is_direct);
  const bar = appBar(searchBtn, `<button class="btn ghost bar-action" data-act="new-group">${icon('users', 18)} Create group</button>`);
  if (!groups.length) return bar + `<h1 class="page-title">Groups</h1>${pushBanner()}<div class="empty"><h2>Split with a group</h2>
    <p>Make a group for a trip, your flat or a dinner. Everyone you add sees the same expenses and balances.</p>
    <button class="btn primary" data-act="new-group">${icon('plus', 16)} Create a group</button></div>`;
  const shown = groups.filter(g => passes(myBalance(g.id)));
  return bar + `<h1 class="page-title">Groups</h1>${pushBanner()}${totalCard()}
    <div class="list plain">${shown.map(g => {
      const lines = groupLines(g, 2);
      const bal = myBalance(g.id);
      const empty = !expOf(g.id).length;
      return `<button class="row grow" data-act="open-group" data-id="${esc(g.id)}">${groupAvatar(g)}
        <span class="main"><span class="title">${esc(g.name)}</span>
        ${empty ? `<span class="sub">No expenses yet</span>` : lines.length ? `<span class="lines">${lines.join('')}</span>` : ''}</span>
        ${empty ? '' : rightLabel(bal, 'you are owed')}${chev}</button>`; }).join('') || `<div class="row static muted">Nobody matches this filter.</div>`}</div>`;
}

/* ---------- Activity tab ---------- */
function actorName(a){
  if (a.actor && a.actor === uid()) return 'You';
  const m = membersOf(a.group_id).find(x => x.user_id === a.actor);
  return (a.actor && S.profiles[a.actor]?.name) || m?.name || 'Someone';
}
function whereLabel(gid, a){
  const g = S.groups[gid]; if (!g) return '';
  if (!g.is_direct) return `in “${esc(g.name)}”`;
  return a && a.actor && a.actor !== uid() ? '' : `with ${esc(titleOf(g))}`;
}
export function activityText(a){
  const who = `<b>${esc(actorName(a))}</b>`, e = a.data?.new || a.data?.old || {};
  const what = e.kind === 'payment'
    ? `a payment: ${esc(nameOf(a.group_id, e.paid_by))} paid ${esc(nm(a.group_id, Object.keys(e.split || {})[0]))}`
    : `“${esc(e.description)}”`;
  switch (a.kind) {
    case 'expense_added': return `${who} added ${what} ${whereLabel(a.group_id, a)}`;
    case 'expense_recurring': return `${what} repeated ${whereLabel(a.group_id, a)}`;
    case 'expense_updated': return `${who} updated ${what} ${whereLabel(a.group_id, a)}`;
    case 'expense_deleted': return `${who} deleted ${what} ${whereLabel(a.group_id, a)}`;
    case 'expense_restored': return `${who} restored ${what} ${whereLabel(a.group_id, a)}`;
    case 'comment': return `${who} commented on “${esc(a.data?.description)}”: <span class="muted">${esc(a.data?.body)}</span>`;
    case 'group_created': return `${who} created the group “${esc(a.data?.name)}”`;
    case 'friend_added': return actorName(a) === 'You' ? `You started keeping track ${whereLabel(a.group_id, a)}` : `${who} added you as a friend`;
    case 'member_added': return `${who} added ${esc(a.data?.name)} ${whereLabel(a.group_id, a)}`;
    case 'member_joined': return `<b>${esc(a.data?.name)}</b> joined ${whereLabel(a.group_id, a)}`;
    case 'member_left': return `<b>${esc(a.data?.name)}</b> left ${whereLabel(a.group_id, a)}`;
    default: return '';
  }
}
// "You get back ₹300" / "You owe ₹300" under an expense in the feed, from my side.
function activityImpact(a){
  const e = a.data?.new; if (!e || !/expense_added|expense_restored|expense_recurring/.test(a.kind)) return '';
  const g = S.groups[a.group_id], me = myId(a.group_id); if (!me) return '';
  const cur = curOf(e, g), net = Number(payersOf(e)[me] || 0) - Number(e.split?.[me] || 0);
  if (e.kind === 'payment') return '';
  return net > 0 ? `<span class="pos">You get back ${fmt(net, cur)}</span>` : net < 0 ? `<span class="neg">You owe ${fmt(net, cur)}</span>` : '';
}
function activityIcon(a){
  const e = a.data?.new || a.data?.old;
  if (a.kind === 'comment') return `<span class="ico" style="--c:var(--accent)">${icon('message-square')}</span>`;
  if (a.kind === 'expense_deleted') return `<span class="ico" style="--c:var(--owe)">${icon('trash-2')}</span>`;
  if (/^member|group_created|friend_added/.test(a.kind)) return `<span class="ico" style="--c:var(--accent)">${icon('users')}</span>`;
  if (e?.kind === 'payment') return payIcon();
  return e ? catIcon(e.category) : `<span class="ico" style="--c:var(--accent)">${icon('activity')}</span>`;
}
export function renderActivityFeed(list){
  const rows = list.filter(a => S.groups[a.group_id]).map(a => {
    const text = activityText(a); if (!text) return '';
    const exists = a.expense_id && S.expenses[a.expense_id];
    const restore = a.kind === 'expense_deleted' && !exists ? `<button class="btn sm" data-act="restore" data-id="${a.id}">${icon('rotate-ccw', 15)} Restore</button>` : '';
    const [open, close] = exists ? [`<button class="row arow" data-act="open-exp" data-id="${esc(a.expense_id)}">`, '</button>'] : ['<div class="row static arow">', '</div>'];
    return `${open}${activityIcon(a)}
      <span class="main"><span class="wrap-text">${text}</span>${activityImpact(a) ? `<span class="wrap-text small">${activityImpact(a)}</span>` : ''}<span class="sub">${esc(ago(a.created_at))}</span></span>
      ${restore ? `<span class="amt">${restore}</span>` : ''}${close}`;
  }).join('');
  return rows ? `<div class="list plain">${rows}</div>` : `<div class="empty"><h2>Nothing yet</h2><p>Expenses, payments, comments and changes from all your friends and groups show up here.</p></div>`;
}
function renderActivityTab(){
  const sub = S.actTab || 'all', n = unreadCount();
  const seg = `<div class="seg wide" role="tablist">
    <button type="button" data-act="act-tab" data-tab="all" aria-pressed="${sub === 'all'}">All activity</button>
    <button type="button" data-act="act-tab" data-tab="foryou" aria-pressed="${sub === 'foryou'}">For you${n ? ` <span class="pill-count">${n}</span>` : ''}</button></div>`;
  return appBar(searchBtn, '') + `<h1 class="page-title">Activity</h1>${pushBanner()}${seg}` + (sub === 'foryou' ? renderNotifications() : renderActivityFeed(S.activity));
}
function renderNotifications(){
  const rows = S.notifications.map(n => {
    const t = noteText(n);
    const target = n.expense_id && S.expenses[n.expense_id] ? `data-act="open-exp" data-id="${esc(n.expense_id)}"` : n.group_id && S.groups[n.group_id] ? `data-act="open-group" data-id="${esc(n.group_id)}"` : '';
    const [open, close] = target ? [`<button class="row arow${n.read_at ? '' : ' unread'}" ${target}>`, '</button>'] : [`<div class="row static arow${n.read_at ? '' : ' unread'}">`, '</div>'];
    return `${open}<span class="ico" style="--c:var(--accent)">${icon(noteIcon(n))}</span>
      <span class="main"><span class="wrap-text"><b>${esc(t.title)}</b></span>${t.body ? `<span class="wrap-text muted small">${esc(t.body)}</span>` : ''}<span class="sub">${esc(ago(n.created_at))}</span></span>${close}`;
  }).join('');
  return rows ? `<div class="list plain">${rows}</div>` : `<div class="empty"><h2>You’re all caught up</h2><p>When friends add expenses with you, comment, pay you or send a reminder, it shows up here.</p></div>`;
}

/* ---------- group and friend pages ---------- */
function friendKeyOf(g){
  const f = friendOf(g.id); if (!f) return null;
  return f.user_id ? 'u:' + f.user_id : f.email ? 'e:' + f.email.toLowerCase() : 'd:' + g.id;
}
function banner(g, back, settingsAct){
  const style = g?.cover_url ? ` style="background-image:url('${esc(g.cover_url)}')"` : '';
  return `<div class="banner-head${g?.cover_url ? ' has-photo' : ` pattern-${g ? typeOf(g.type)[0] : 'other'}`}"${style}>
    <button class="btn ghost icon-btn on-banner" data-act="home" aria-label="Back to ${back}">${icon('chevron-left', 24)}</button>
    ${settingsAct ? `<button class="btn ghost icon-btn on-banner" data-act="${settingsAct}" aria-label="Settings">${icon('settings', 22)}</button>` : '<span></span>'}</div>`;
}
const chip = (act, label, {primary, on, attrs = ''} = {}) => `<button class="pchip${primary ? ' primary' : ''}${on ? ' on' : ''}" data-act="${act}" ${attrs}>${label}</button>`;

function renderGroup(g){
  const me = myId(g.id);
  const f = g.is_direct ? friendOf(g.id) : null;
  const valid = g.is_direct ? ['expenses', 'insights'] : ['expenses', 'balances', 'insights', 'board'];
  if (!valid.includes(S.tab)) S.tab = 'expenses';
  const mine = myBalance(g.id);
  let lines;
  if (g.is_direct) {
    lines = [personLine(titleOf(g), mine)].filter(Boolean);
    const fi = friendsIndex().get(friendKeyOf(g));
    (fi?.groups || []).filter(x => Object.values(x.amt).some(v => v)).forEach(x => lines.push(personLine(titleOf(g), x.amt, ` <span class="muted">in ${esc(S.groups[x.gid].name)}</span>`)));
  } else lines = groupLines(g, 4);
  const hasExp = expOf(g.id).length > 0;
  const summary = lines.length ? lines.join('') : `<span class="line muted">${hasExp ? 'You’re all settled up.' : 'No expenses yet.'}</span>`;
  const owed = Object.entries(mine).filter(([, v]) => v > 0);
  const chips = [chip('settle', 'Settle up', {primary: true})];
  if (g.is_direct && owed.length && f && canRemind(g.id, f.id))
    chips.push(...owed.map(([c, v]) => chip('remind', `${icon('bell', 14)} Remind`, {attrs: `data-gid="${esc(g.id)}" data-member="${esc(f.id)}" data-amt="${v}" data-cur="${c}"`})));
  if (!g.is_direct) chips.push(chip('tab', 'Balances', {on: S.tab === 'balances', attrs: 'data-tab="balances"'}));
  chips.push(chip('tab', 'Totals', {on: S.tab === 'insights', attrs: 'data-tab="insights"'}));
  if (!g.is_direct) chips.push(chip('tab', 'Whiteboard', {on: S.tab === 'board', attrs: 'data-tab="board"'}));
  if (!g.is_direct || (f && !f.user_id)) chips.push(chip('invite', `${icon('share-2', 14)} Invite`, {attrs: `data-id="${esc(g.id)}"`}));
  if (hasExp) chips.push(chip('export', `${icon('copy', 14)} Export`, {attrs: `data-id="${esc(g.id)}"`}));
  const big = g.is_direct ? avatar(personName(f), avatarUrl(f), 'av hero') : groupAvatar(g, 'gav hero');
  let html = `${banner(g.is_direct ? null : g, g.is_direct ? 'friends' : 'groups', g.is_direct ? 'edit-friend' : 'edit-group')}
    <div class="page-head">${big}<h1>${esc(titleOf(g))}</h1>
      ${g.is_direct && f && !f.user_id ? `<p class="muted small" style="margin:0">${f.email ? `Invited · ${esc(f.email)}` : 'Not on Evenly yet'}</p>` : ''}
      <div class="lines big">${summary}</div></div>
    <div class="chip-row">${chips.join('')}</div>`;
  if (g.is_direct && f && !f.user_id) html += `<div class="banner ok invite-nudge">${icon('user-plus', 18)}<span>${esc(personName(f))} won’t see these expenses or get notifications until they join. Send them an invite link.</span>
      <span class="actions nowrap"><button class="btn sm primary" data-act="invite" data-id="${esc(g.id)}">${icon('share-2', 15)} Invite</button></span></div>`;
  if (S.tab !== 'expenses') html += `<button class="linkbtn small back-exp" data-act="tab" data-tab="expenses">${icon('chevron-left', 14)} Back to expenses</button>`;
  if (S.tab === 'expenses') html += renderExpenses(g, me);
  else if (S.tab === 'balances') html += renderBalances(g);
  else if (S.tab === 'insights') html += renderInsights(g);
  else html += renderBoard(g);
  return html + fab('add-exp');
}
// A person you only share groups with: no one-to-one ledger yet.
function renderFriendOnly(f){
  const lines = f.groups.filter(x => Object.values(x.amt).some(v => v)).map(x => personLine(f.name, x.amt, ` <span class="muted">in ${esc(S.groups[x.gid].name)}</span>`));
  return `${banner(null, 'friends', null)}
    <div class="page-head">${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url, 'av hero')}<h1>${esc(f.name)}</h1>
      <div class="lines big">${lines.join('') || '<span class="line muted">You’re all settled up.</span>'}</div></div>
    <div class="chip-row">${f.groups.map(x => chip('open-group', esc(S.groups[x.gid].name), {attrs: `data-id="${esc(x.gid)}"`})).join('')}</div>
    <div class="empty"><h2>Nothing just between you two</h2><p>Add an expense with ${esc(f.name)} that isn’t part of a group, like a coffee or a cab.</p>
      <button class="btn primary" data-act="friend-exp" data-key="${esc(f.key)}">Add an expense with ${esc(f.name)}</button></div>`;
}

function paidLabel(g, e){
  const payers = Object.keys(payersOf(e));
  const names = payers.map(id => nameOf(g.id, id));
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} people`;
  return `${esc(who)} paid ${fmt(Number(e.amount), curOf(e, g))}`;
}
function myPart(g, e, me){
  const cur = curOf(e, g), paid = Number(payersOf(e)[me] || 0), share = Number(e.split?.[me] || 0), net = paid - share;
  if (e.kind === 'payment') {
    const to = Object.keys(e.split)[0];
    if (me === e.paid_by) return `<span>you paid</span><b>${fmt(e.amount, cur)}</b>`;
    if (me === to) return `<span>you received</span><b>${fmt(e.amount, cur)}</b>`;
    return `<b>${fmt(e.amount, cur)}</b>`;
  }
  if (net > 0) return `<span class="pos">you lent</span><b class="pos">${fmt(net, cur)}</b>`;
  if (net < 0) return `<span class="neg">you borrowed</span><b class="neg">${fmt(net, cur)}</b>`;
  return `<span class="muted">not involved</span>`;
}
export function expenseRow(g, e, me){
  const d = new Date(e.date + 'T00:00');
  const dt = `<span class="date">${esc(d.toLocaleDateString(undefined, {month: 'short'}))}<b>${String(d.getDate()).padStart(2, '0')}</b></span>`;
  const title = e.kind === 'payment' ? `${esc(nameOf(g.id, e.paid_by))} paid ${esc(nm(g.id, Object.keys(e.split)[0]))}` : esc(e.description);
  const sub = e.kind === 'payment' ? 'Payment' : paidLabel(g, e);
  const badges = (e.repeat !== 'never' && e.repeat ? `<span class="badge">${icon('repeat', 12)} ${e.repeat}</span>` : '')
    + (e.receipt_path ? `<span class="badge">${icon('paperclip', 12)}</span>` : '')
    + (e.notes ? `<span class="badge">${icon('notebook-pen', 12)}</span>` : '')
    + (e.pending ? `<span class="badge warn">${icon('refresh-cw', 12)} waiting to sync</span>` : '');
  return `<button class="row erow" data-act="open-exp" data-id="${esc(e.id)}">${dt}${e.kind === 'payment' ? payIcon() : catIcon(e.category)}
    <span class="main"><span class="title">${title}</span><span class="sub">${sub} ${badges}</span></span>
    <span class="amt">${myPart(g, e, me)}</span></button>`;
}
function renderExpenses(g, me){
  const exps = expOf(g.id);
  const deleted = S.activity.filter(a => a.group_id === g.id && a.kind === 'expense_deleted' && !S.expenses[a.expense_id]).length;
  const trash = deleted ? `<button class="linkbtn small" data-act="deleted">${icon('rotate-ccw', 14)} Recently deleted (${deleted})</button>` : '';
  if (!exps.length) return `<div class="empty"><h2>No expenses yet</h2><p>Add the first bill: who paid, how much, and who it was for.${g.is_direct ? '' : ' Everyone in the group sees it straight away.'}</p>
    <button class="btn primary" data-act="add-exp">${icon('receipt', 16)} Add an expense</button>${trash}</div>`;
  let lastMonth = '', out = '';
  for (const e of exps) {
    const month = new Date(e.date + 'T00:00').toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    if (month !== lastMonth) { out += `<div class="month">${esc(month)}</div>`; lastMonth = month; }
    out += expenseRow(g, e, me);
  }
  return `<div class="list plain ledger">${out}</div>${trash ? `<div class="pad">${trash}</div>` : ''}`;
}
function renderBalances(g){
  const all = groupBalances(g.id), me = myId(g.id);
  const curs = Object.keys(all).filter(c => Object.values(all[c]).some(v => v));
  if (!curs.length) return `<div class="empty"><h2>All settled up</h2><p>Nobody owes anything in this group right now.</p></div>`;
  const pw = g.simplify ? null : pairwise(expOf(g.id), g);
  let html = '';
  for (const cur of curs) {
    const bal = all[cur];
    const tx = g.simplify ? simplify(bal) : (pw[cur] || []);
    const rows = membersOf(g.id).map(m => {
      const b = bal[m.id] || 0;
      const who = m.id === me ? 'You' : personName(m);
      const head = b > 0 ? `${esc(who)} ${m.id === me ? 'get back' : 'gets back'} <b class="pos">${fmt(b, cur)}</b> in total`
                 : b < 0 ? `${esc(who)} ${m.id === me ? 'owe' : 'owes'} <b class="neg">${fmt(b, cur)}</b> in total` : `${esc(who)} ${m.id === me ? 'are' : 'is'} settled up`;
      const mine = tx.filter(t => t.from === m.id || t.to === m.id).map(t => {
        const text = `${esc(nameOf(g.id, t.from))} ${t.from === me ? 'owe' : 'owes'} ${esc(nm(g.id, t.to))} <b class="${t.from === m.id ? 'neg' : 'pos'}">${fmt(t.amount, cur)}</b>`;
        const acts = t.from === m.id ? `<span class="actions nowrap">${t.to === me && canRemind(g.id, t.from) ? `<button class="btn sm ghost" data-act="remind" data-gid="${esc(g.id)}" data-member="${esc(t.from)}" data-amt="${t.amount}" data-cur="${cur}">${icon('bell', 14)} Remind</button>` : ''}
          <button class="btn sm" data-act="record" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-amt="${t.amount}" data-cur="${cur}">Settle up</button></span>` : '';
        return `<div class="tree-line"><span class="wrap-text small">${text}</span>${acts}</div>`;
      }).join('');
      return `<div class="bal-card">${avatar(personName(m), avatarUrl(m), 'av md')}<div class="bal-main"><div class="wrap-text">${head}</div>
        ${mine ? `<div class="tree">${mine}</div>` : ''}</div></div>`;
    }).join('');
    html += `<div class="section"><h3>${curs.length > 1 ? `${cur} · ` : ''}Balances</h3><div class="list plain">${rows}</div></div>`;
  }
  return html + `<div class="actions pad"><button class="btn sm" data-act="copy">${icon('copy', 15)} Copy for group chat</button>
    <span class="muted small">${g.simplify ? 'Debts are simplified. Change this in group settings.' : 'Debts are not simplified. Change this in group settings.'}</span></div>`;
}
function renderInsights(g){
  const real = expOf(g.id).filter(e => e.kind !== 'payment');
  if (!real.length) return `<div class="empty"><h2>Nothing to total yet</h2><p>Spending by category and by person shows up here once you add expenses.</p></div>`;
  const me = myId(g.id);
  const byCur = {}; real.forEach(e => (byCur[curOf(e, g)] ||= []).push(e));
  return Object.entries(byCur).map(([cur, list]) => {
    const total = list.reduce((a, e) => a + Number(e.amount), 0);
    const myShare = list.reduce((a, e) => a + Number(e.split?.[me] || 0), 0);
    const myPaid = list.reduce((a, e) => a + Number(payersOf(e)[me] || 0), 0);
    const byParent = {};
    list.forEach(e => { const c = catOf(e.category); (byParent[c.parent] ||= {label: c.parentLabel, color: c.color, icon: CATEGORY_GROUPS.find(x => x.key === c.parent).items[0][2], v: 0}).v += Number(e.amount); });
    const cats = Object.values(byParent).sort((a, b) => b.v - a.v), cmax = cats[0].v;
    const catRows = cats.map(c => `<div class="row static" style="--c:var(--c-${c.color})"><span class="ico">${icon(c.icon)}</span>
      <span class="main"><span class="spread"><b>${esc(c.label)}</b><span class="num">${fmt(c.v, cur)} <span class="muted">· ${Math.round(c.v / total * 100)}%</span></span></span>
      <span class="bar"><i style="width:${(c.v / cmax * 100).toFixed(1)}%"></i></span></span></div>`).join('');
    const paid = {}, share = {};
    list.forEach(e => { for (const [k, v] of Object.entries(payersOf(e))) paid[k] = (paid[k] || 0) + Number(v); for (const [k, v] of Object.entries(e.split)) share[k] = (share[k] || 0) + Number(v); });
    const pRows = membersOf(g.id).map(m => `<div class="row static">${avatar(personName(m), avatarUrl(m))}
      <span class="main"><span class="title">${esc(nameOf(g.id, m.id))}</span>
      <span class="sub num">paid ${fmt(paid[m.id] || 0, cur)} · share ${fmt(share[m.id] || 0, cur)}</span></span></div>`).join('');
    return `<div class="totals-grid">
        <div class="stat"><div class="lbl">Total ${g.is_direct ? 'spent together' : 'group spending'}</div><div class="val">${fmt(total, cur)}</div></div>
        ${me ? `<div class="stat"><div class="lbl">Total you paid for</div><div class="val">${fmt(myPaid, cur)}</div></div>
        <div class="stat"><div class="lbl">Your total share</div><div class="val">${fmt(myShare, cur)}</div></div>` : ''}</div>
      <div class="section"><h3>Month by month</h3>${monthBars(list, cur, e => Number(e.amount), me ? e => Number(e.split?.[me] || 0) : null)}</div>
      <div class="section"><h3>Spending by category</h3><div class="list">${catRows}</div></div>
      <div class="section"><h3>Paid versus share</h3><div class="list">${pRows}</div></div>`;
  }).join('');
}
// Last six months as bars: the total, and optionally your share inside it.
function lastMonths(n = 6, end = new Date()){
  return Array.from({length: n}, (_, i) => { const d = new Date(end.getFullYear(), end.getMonth() - (n - 1 - i), 1);
    return {key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, {month: 'short'})}; });
}
function monthBars(list, cur, total, mine){
  const months = lastMonths().map(m => ({...m, t: 0, m: 0}));
  list.forEach(e => { const mm = months.find(x => x.key === String(e.date).slice(0, 7)); if (mm) { mm.t += total(e); if (mine) mm.m += mine(e); } });
  const max = Math.max(1, ...months.map(m => m.t));
  return `<div class="bars" role="img" aria-label="Spending per month">${months.map(m => `<div class="bar-col" title="${esc(m.label)}: ${fmt(m.t, cur)}">
      <span class="bar-v small">${m.t ? fmt(m.t, cur).replace(/\.00$/, '') : ''}</span>
      <span class="bar-track"><i style="height:${(m.t / max * 100).toFixed(1)}%">${mine && m.t ? `<em style="height:${(m.m / m.t * 100).toFixed(1)}%"></em>` : ''}</i></span>
      <span class="bar-l small">${esc(m.label)}</span></div>`).join('')}</div>
    ${mine ? `<div class="legend small"><span class="key total"></span> Everyone <span class="key mine"></span> Your share</div>` : ''}`;
}
function renderBoard(g){
  const by = g.whiteboard_by ? (g.whiteboard_by === uid() ? 'you' : (membersOf(g.id).find(m => m.user_id === g.whiteboard_by)?.name || 'someone')) : null;
  return `<form class="section pad" id="boardForm"><h3>Group whiteboard</h3>
    <p class="muted small" style="margin:0">Shared notes for everyone in the group: Wi-Fi password, trip plan, house rules.</p>
    <textarea id="boardText" rows="10" maxlength="5000" placeholder="Write anything the group should know…">${esc(g.whiteboard || '')}</textarea>
    <div class="actions"><span class="muted small">${by ? `Last edited by ${esc(by)}, ${esc(ago(g.whiteboard_at))}` : 'Nobody has written here yet.'}</span><span class="sp"></span>
    <button class="btn primary sm" type="submit">Save</button></div></form>`;
}

/* ---------- Account tab ---------- */
function renderSettings(){
  const p = myProfile() || {}, email = S.session.user.email;
  return appBar('', '') + `<h1 class="page-title">Account</h1>
  <section class="card-sec">
    <div class="profile-row">
      <label class="avatar-edit" title="Change photo">${avatar(myName(), p.avatar_url, 'av xxl')}<span class="cam">${icon('camera', 16)}</span>
        <input type="file" id="avatarFile" accept="image/*" hidden></label>
      <div style="min-width:0"><b style="font-size:18px">${esc(myName())}</b><div class="muted" style="overflow-wrap:anywhere">${esc(email)}</div>
      ${p.avatar_url ? `<button class="linkbtn small" data-act="remove-avatar">Remove photo</button>` : ''}</div>
    </div>
    <form id="nameForm" class="inline-form"><label class="f">Your name<input id="sName" maxlength="40" value="${esc(myName())}"></label><button class="btn" type="submit">Save</button></form>
    <label class="f">Default currency for new groups and friends<select id="sCur">${currencyOptions(p.default_currency || 'INR')}</select></label>
  </section>
  <section class="card-sec"><h3>${icon(currentTheme() === 'dark' ? 'moon' : currentTheme() === 'light' ? 'sun' : 'smartphone', 15)} Appearance</h3>
    <div class="seg wide" role="radiogroup" aria-label="Theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) =>
      `<button type="button" role="radio" data-act="theme" data-theme="${k}" aria-pressed="${currentTheme() === k}" aria-checked="${currentTheme() === k}">${icon(k === 'system' ? 'smartphone' : k === 'light' ? 'sun' : 'moon', 15)} ${l}</button>`).join('')}</div>
    <p class="hint muted small" style="margin:0">System follows your phone’s light or dark setting. Saved on this device.</p>
  </section>
  <section class="card-sec"><h3>${icon('bell', 15)} Notifications</h3>
    <div class="spread wrapflex"><span><b>Phone notifications</b><br><span class="muted small">${pushHelp()}</span></span>${pushButton()}</div>
    <label class="switch"><input type="checkbox" id="sEmailNotes" ${p.notify_email === false ? '' : 'checked'}><span><b>Email notifications</b><br><span class="muted small">An email when someone adds, changes or deletes an expense you’re in, comments, or reminds you.</span></span></label>
  </section>
  <section class="card-sec"><h3>${icon('wallet', 15)} How friends can pay you</h3>
    <p class="muted small" style="margin:0">Friends who owe you see a pay button when they settle up. Leave blank anything you don’t use.</p>
    <form id="payForm" class="sheet-in" style="padding:0">
      <label class="f">UPI ID<input id="sUpi" placeholder="yourname@okaxis" value="${esc(p.upi_id || '')}" autocomplete="off"></label>
      <div class="grid2"><label class="f">PayPal.me username<input id="sPaypal" placeholder="jugalpatel" value="${esc(p.paypal_me || '')}" autocomplete="off"></label>
      <label class="f">Venmo username<input id="sVenmo" placeholder="jugal-patel" value="${esc(p.venmo || '')}" autocomplete="off"></label></div>
      <div class="actions"><span class="sp"></span><button class="btn" type="submit">Save</button></div>
    </form>
  </section>
  <section class="card-sec"><h3>${icon('mail', 15)} Email</h3>
    <form id="emailForm" class="inline-form"><label class="f">New email<input id="sEmail" type="email" placeholder="${esc(email)}"></label><button class="btn" type="submit">Change</button></form>
    <p class="hint muted small">We’ll send a confirmation link to the new address. Groups that invited your old email keep working.</p>
  </section>
  <section class="card-sec"><h3>${icon('key-round', 15)} Password</h3>
    <form id="passForm" class="inline-form"><label class="f">New password<input id="sPass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label><button class="btn" type="submit">Change</button></form>
  </section>
  <section class="card-sec"><h3>${icon('chart-column', 15)} Spending and budgets</h3>
    <p class="muted small" style="margin:0">Your share of everything this month, by category, with optional monthly budgets.</p>
    <button class="btn" data-act="spending">${icon('trending-up', 16)} See your spending</button>
  </section>
  <section class="card-sec"><h3>${icon('history', 15)} Your data</h3>
    <p class="muted small" style="margin:0">Download everything you can see in Evenly as one file, to keep as a backup. Each group can also be exported as a spreadsheet from its page.</p>
    <button class="btn" data-act="backup">${icon('copy', 16)} Download a backup</button>
  </section>
  <section class="card-sec"><h3>${icon('share-2', 15)} Invite friends to Evenly</h3>
    <div class="actions"><code class="grow">${esc(location.origin)}</code><button class="btn sm" data-act="copy-app">${icon('copy', 15)} Copy link</button></div>
  </section>
  <section class="card-sec">
    <button class="btn" data-act="signout">${icon('log-out', 16)} Sign out</button>
    <a class="muted small" href="privacy.html">Privacy policy</a>
  </section>
  <section class="card-sec danger-zone"><h3>Delete account</h3>
    <p class="muted small" style="margin:0">Your login is deleted. Groups and expenses stay for your friends, under your name. This can’t be undone.</p>
    <form id="deleteForm" class="inline-form"><label class="f">Type DELETE to confirm<input id="sDel" autocomplete="off"></label><button class="btn danger" type="submit">Delete my account</button></form>
  </section>`;
}

export function currentTheme(){ try { return localStorage.getItem('evenly.theme') || 'system'; } catch { return 'system'; } }

/* ---------- notifications ---------- */
// Can Evenly reach this member? Only people with an account or an email address.
function canRemind(gid, mid){ const m = member(gid, mid); return !!(m && (m.user_id || m.email)); }

function pushHelp(){
  const st = S.pushStatus;
  return st === 'on' ? 'On for this device.' : st === 'blocked' ? 'Blocked in your browser settings. Allow notifications for this site, then come back.'
    : st === 'install' ? 'On iPhone: tap Share, then Add to Home Screen, and open Evenly from there to turn these on.'
    : st === 'unsupported' ? 'This browser can’t show notifications.' : 'Get an alert on this device when friends add expenses with you.';
}
function pushButton(){
  if (S.pushStatus === 'on') return `<button class="btn sm" data-act="push-off">Turn off</button>`;
  if (S.pushStatus === 'off') return `<button class="btn sm primary" data-act="push-on">Turn on</button>`;
  return '';
}
function pushBanner(){
  let dismissed = false; try { dismissed = !!localStorage.getItem('evenly.pushAsked'); } catch {}
  if (dismissed) return '';
  if (S.pushStatus === 'off' && 'Notification' in window && Notification.permission === 'default')
    return `<div class="banner ok push-banner">${icon('bell', 18)}<span>Get a notification when friends add an expense with you.</span>
      <span class="actions nowrap"><button class="btn sm primary" data-act="push-on">Turn on</button><button class="btn sm ghost" data-act="push-later">Not now</button></span></div>`;
  if (S.pushStatus === 'install')
    return `<div class="banner ok push-banner">${icon('smartphone', 18)}<span>To get notifications on iPhone, tap <b>Share</b> then <b>Add to Home Screen</b>, and open Evenly from your Home Screen.</span>
      <span class="actions nowrap"><button class="btn sm ghost" data-act="push-later">OK</button></span></div>`;
  return '';
}

/* ---------- your spending and budgets ---------- */
// Your share of every expense in a month, in your default currency, by category group.
export function spendingByMonth(n = 6){
  const mine = myProfile()?.default_currency || 'INR';
  const months = lastMonths(n, monthDate()).map(m => ({...m, total: 0, byParent: {}}));
  let skipped = 0;
  for (const g of Object.values(S.groups)) {
    const me = myId(g.id); if (!me) continue;
    for (const e of expOf(g.id)) {
      if (e.kind === 'payment') continue;
      const mm = months.find(x => x.key === String(e.date).slice(0, 7)); if (!mm) continue;
      const share = Number(e.split?.[me] || 0); if (!share) continue;
      const v = toCurrency(share, curOf(e, g), mine);
      if (v == null) { skipped++; continue; }
      const parent = catOf(e.category).parent;
      mm.total += v; mm.byParent[parent] = (mm.byParent[parent] || 0) + v;
    }
  }
  return {months, cur: mine, skipped};
}
const monthDate = () => { const [y, m] = (S.spendMonth || '').split('-').map(Number); return y ? new Date(y, m - 1, 1) : new Date(); };
function renderSpending(){
  const {months, cur, skipped} = spendingByMonth();
  const now = months[months.length - 1], prev = months[months.length - 2];
  const budgets = myProfile()?.budgets || {};
  const thisMonth = new Date().toISOString().slice(0, 7) === now.key;
  const delta = prev.total ? Math.round((now.total - prev.total) / prev.total * 100) : null;
  const rows = CATEGORY_GROUPS.map(cg => {
    const v = now.byParent[cg.key] || 0, b = Number(budgets[cg.key] || 0);
    if (!v && !b) return '';
    const pct = b ? v / b * 100 : 0, over = b && v > b, near = b && pct >= 80 && !over;
    return `<button class="row" data-act="budget" data-key="${cg.key}" style="--c:var(--c-${cg.color})"><span class="ico">${icon(cg.items[0][2])}</span>
      <span class="main"><span class="spread"><b>${esc(cg.label)}</b><span class="num">${fmt(v, cur)}${b ? ` <span class="muted">of ${fmt(b, cur)}</span>` : ''}</span></span>
      ${b ? `<span class="bar budget${over ? ' over' : near ? ' near' : ''}"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></span>
        <span class="sub">${over ? `<span class="neg">${fmt(v - b, cur)} over budget</span>` : `${fmt(b - v, cur)} left`}</span>` : `<span class="sub">Tap to set a monthly budget</span>`}</span></button>`;
  }).join('');
  const unbudgeted = CATEGORY_GROUPS.filter(cg => !now.byParent[cg.key] && !budgets[cg.key]);
  const max = Math.max(1, ...months.map(m => m.total));
  const label = new Date(now.key + '-01T00:00').toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
  return `<div class="appbar"><button class="btn ghost" data-act="home">${icon('chevron-left')} Account</button><span></span></div>
    <h1 class="page-title">Your spending</h1>
    <div class="month-nav"><button class="btn ghost icon-btn" data-act="spend-month" data-step="-1" aria-label="Previous month">${icon('chevron-left')}</button>
      <b>${esc(label)}</b><button class="btn ghost icon-btn" data-act="spend-month" data-step="1" aria-label="Next month" ${thisMonth ? 'disabled' : ''}>${icon('chevron-right')}</button></div>
    <div class="stat"><div class="lbl">Your share ${thisMonth ? 'so far this month' : 'this month'}</div><div class="val">${fmt(now.total, cur)}</div>
      ${delta != null ? `<div class="small ${delta > 0 ? 'neg' : 'pos'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% on ${esc(prev.label)}</div>` : ''}</div>
    <div class="section"><h3>Last six months</h3><div class="bars">${months.map(m => `<div class="bar-col${m.key === now.key ? ' current' : ''}">
      <span class="bar-v small">${m.total ? fmt(m.total, cur).replace(/\.00$/, '') : ''}</span><span class="bar-track"><i style="height:${(m.total / max * 100).toFixed(1)}%"></i></span>
      <span class="bar-l small">${esc(m.label)}</span></div>`).join('')}</div></div>
    <div class="section"><h3>By category</h3>${rows ? `<div class="list">${rows}</div>` : `<p class="muted" style="margin:0">Nothing spent this month yet.</p>`}
      ${unbudgeted.length ? `<div class="chip-row">${unbudgeted.map(cg => `<button class="pchip" data-act="budget" data-key="${cg.key}">${icon('plus', 13)} ${esc(cg.label)} budget</button>`).join('')}</div>` : ''}</div>
    ${skipped ? `<p class="muted small">${skipped} expense${skipped > 1 ? 's' : ''} in other currencies aren’t included yet: exchange rates haven’t loaded.</p>` : ''}
    <p class="muted small">Your share is what you owe for each expense, whoever paid. Amounts are in ${esc(cur)}${rates() ? `, converted with ${esc(rates().source)} rates` : ''}.</p>`;
}
