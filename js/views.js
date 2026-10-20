// Screens. Each returns HTML for #app; clicks are handled in main.js through data-act attributes.
import { S, uid, myName, myProfile, unreadCount, member, groupList, membersOf, expOf, nameOf, myId, friendOf, titleOf,
         personName, avatarUrl, groupBalances, myBalance, friendsIndex } from './state.js';
import { esc, fmt, fmtMulti, ago } from './util.js';
import { simplify, pairwise, payersOf, curOf } from './money.js';
import { catOf, CATEGORY_GROUPS, typeOf } from './categories.js';
import { icon } from './icons.js';
import { avatar, catIcon, payIcon, balanceLines, currencyOptions } from './ui.js';
import { noteText, noteIcon } from './messages.js';

const brand = `<div class="brand"><span class="mark" aria-hidden="true">E</span>Evenly</div>`;

export function renderSetup(){
  return `<header class="top">${brand}</header><div class="empty"><h1>Almost there</h1>
    <p>Evenly needs its free Supabase database. Open <code>config.js</code> and paste your project URL and anon key, then reload this page.</p></div>`;
}

export function renderAuth(){
  const m = S.authMode;
  const title = m === 'signup' ? 'Create your account' : m === 'reset' ? 'Reset your password' : 'Sign in';
  const invite = S.pendingInvite ? `<div class="banner ok">You’ve been invited to split expenses on Evenly. Sign in or create an account to join.</div>` : '';
  return `<div class="auth">${brand}${invite}
    <form class="card" id="authForm" novalidate>
      <h1 style="font-size:28px">${title}</h1>
      <p class="muted">${m === 'signup' ? 'Split trips, rent and dinners with friends. Free.' : m === 'reset' ? 'We’ll email you a link to choose a new password.' : 'Welcome back. Your balances are waiting.'}</p>
      ${m === 'signup' ? `<label class="f">Your name<input id="aName" autocomplete="name" maxlength="40" placeholder="Asha Patel"></label>` : ''}
      <label class="f">Email<input id="aEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
      ${m !== 'reset' ? `<label class="f">Password<input id="aPass" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}" placeholder="${m === 'signup' ? 'At least 6 characters' : ''}"></label>` : ''}
      <p class="hint err" id="aHint"></p>
      <button class="btn primary" type="submit" style="justify-content:center">${m === 'signup' ? 'Create account' : m === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      ${m === 'signin' ? `<p style="font-size:14px"><button type="button" class="linkbtn" data-auth="reset">Forgot your password?</button></p>` : ''}
    </form>
    <p style="text-align:center;font-size:14px">${m === 'signup' ? 'Already have an account? <button type="button" class="linkbtn" data-auth="signin">Sign in</button>'
      : 'New here? <button type="button" class="linkbtn" data-auth="signup">Create an account</button>'}</p>
  </div>`;
}

export function renderRecovery(){
  return `<div class="auth">${brand}<form class="card" id="recForm" novalidate>
    <h1 style="font-size:28px">Choose a new password</h1>
    <label class="f">New password<input id="rPass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label>
    <p class="hint err" id="rHint"></p>
    <button class="btn primary" type="submit" style="justify-content:center">Save password</button></form></div>`;
}

function topBar(){
  const p = myProfile();
  const n = unreadCount();
  return `<header class="top">${brand}<span class="top-actions">
    <button class="btn ghost icon-btn bell" data-act="notifications" aria-label="Notifications${n ? `, ${n} unread` : ''}">${icon('bell', 22)}${n ? `<span class="dot-count">${n > 99 ? '99+' : n}</span>` : ''}</button>
    <button class="me-btn" data-act="settings" aria-label="Account settings">${avatar(myName(), p?.avatar_url)}<span class="me-name">${esc(myName())}</span></button></span></header>`;
}

export function renderApp(){
  if (!S.ready) return topBar() + `<p class="loading">Opening your balances…</p>`;
  if (S.view === 'group' && !S.groups[S.gid]) S.view = 'home';
  if (S.view === 'friend') {
    const f = friendsIndex().get(S.fkey);
    // Once a one-to-one ledger exists (say, after the first expense), show that instead.
    if (!f) S.view = 'home';
    else if (f.ledger) Object.assign(S, {view: 'group', gid: f.ledger, tab: 'expenses'});
  }
  const body = S.view === 'group' ? renderGroup(S.groups[S.gid])
             : S.view === 'friend' ? renderFriendOnly(friendsIndex().get(S.fkey))
             : S.view === 'settings' ? renderSettings()
             : S.view === 'notifications' ? renderNotifications()
             : renderHome();
  return topBar() + body;
}

/* ---------- home ---------- */
function totals(){
  let owed = {}, owe = {};
  for (const g of Object.values(S.groups)) {
    for (const [c, v] of Object.entries(myBalance(g.id))) { if (v > 0) owed[c] = (owed[c] || 0) + v; else owe[c] = (owe[c] || 0) - v; }
  }
  return {owed, owe};
}
function renderHome(){
  const gs = groupList(), groups = gs.filter(g => !g.is_direct);
  const friends = [...friendsIndex().values()].sort((a, b) => {
    const za = !Object.values(a.total).some(v => v), zb = !Object.values(b.total).some(v => v);
    return za - zb || a.name.localeCompare(b.name);
  });
  const tab = S.homeTab;
  const {owed, owe} = totals();
  const stats = gs.length ? `<div class="stats">
      <div class="stat"><div class="lbl">You get back</div><div class="val pos">${fmtMulti(owed) || fmt(0, myProfile()?.default_currency || 'INR')}</div></div>
      <div class="stat"><div class="lbl">You owe</div><div class="val neg">${fmtMulti(owe) || fmt(0, myProfile()?.default_currency || 'INR')}</div></div></div>` : '';
  const tabs = `<div class="tabs" role="tablist">
    ${[['friends', `Friends${friends.length ? ` (${friends.length})` : ''}`], ['groups', `Groups${groups.length ? ` (${groups.length})` : ''}`], ['activity', 'Activity']]
      .map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-act="home-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body;
  if (tab === 'friends') {
    body = friends.length ? `<div class="section-h"><h3 style="margin:0">Friends</h3><button class="btn sm" data-act="new-friend">${icon('user-plus', 16)} Add friend</button></div>
      <div class="list">${friends.map(f => `<button class="row" data-act="open-friend" data-key="${esc(f.key)}">
        ${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url)}
        <span class="main"><span class="title">${esc(f.name)}</span><span class="sub">${esc(friendSub(f))}</span></span>
        <span class="amt">${balanceLines(f.total)}</span></button>`).join('')}</div>`
      : `<div class="empty"><h2>Split with one friend</h2>
        <p>Paid for a friend’s coffee or a cab? Add them here and keep track between just the two of you, no group needed. Add their email so they can sign in and see it too.</p>
        <button class="btn primary" data-act="new-friend">Add a friend</button></div>`;
  } else if (tab === 'groups') {
    body = groups.length ? `<div class="section-h"><h3 style="margin:0">Groups</h3><button class="btn sm" data-act="new-group">${icon('plus', 16)} New group</button></div>
      <div class="list">${groups.map(g => {
        const t = typeOf(g.type);
        return `<button class="row" data-act="open-group" data-id="${esc(g.id)}">
        ${g.cover_url ? `<span class="av lg photo" aria-hidden="true"><img src="${esc(g.cover_url)}" alt="" loading="lazy"></span>` : `<span class="av lg type-${t[0]}" aria-hidden="true">${icon(t[2], 20)}</span>`}
        <span class="main"><span class="title">${esc(g.name)}</span>
        <span class="sub">${membersOf(g.id).length} people · ${t[1]}</span></span>
        <span class="amt">${balanceLines(myBalance(g.id), {they: 'you get back'})}</span></button>`; }).join('')}</div>`
      : `<div class="empty"><h2>Split with a group</h2>
        <p>Make a group for a trip, your flat or a dinner. Everyone you add by email, or with an invite link, sees the same expenses and balances.</p>
        <button class="btn primary" data-act="new-group">Create a group</button></div>`;
  } else {
    body = renderActivityFeed(S.activity);
  }
  const greet = gs.length ? '' : `<p class="muted" style="margin:0">Hi ${esc(myName())}. If a friend already added you, it appears here automatically.</p>`;
  return `<h1>${gs.length ? 'Your balances' : 'Welcome to Evenly'}</h1>${greet}${pushBanner()}${stats}${tabs}${body}
    <button class="btn primary fab" data-act="pick-exp">${icon('plus', 20)} Add expense</button>`;
}
function friendSub(f){
  const bits = [];
  if (f.ledger) bits.push(f.userId ? 'Friend' : f.email ? 'Invited' : 'Not on Evenly');
  if (f.groups.length) bits.push(`${f.groups.length} shared group${f.groups.length > 1 ? 's' : ''}`);
  return bits.join(' · ') || 'Friend';
}

/* ---------- activity feed ---------- */
function actorName(a){
  if (a.actor && a.actor === uid()) return 'You';
  const m = membersOf(a.group_id).find(x => x.user_id === a.actor);
  return (a.actor && S.profiles[a.actor]?.name) || m?.name || 'Someone';
}
function whereLabel(gid){
  const g = S.groups[gid]; if (!g) return '';
  return g.is_direct ? `with ${esc(titleOf(g))}` : `in ${esc(g.name)}`;
}
export function activityText(a){
  const who = esc(actorName(a)), e = a.data?.new || a.data?.old || {};
  const what = e.kind === 'payment'
    ? `a payment: ${esc(nameOf(a.group_id, e.paid_by))} paid ${esc(nameOf(a.group_id, Object.keys(e.split || {})[0]))}`
    : `“${esc(e.description)}”`;
  switch (a.kind) {
    case 'expense_added': return `${who} added ${what} ${whereLabel(a.group_id)}`;
    case 'expense_recurring': return `${what} repeated ${whereLabel(a.group_id)}`;
    case 'expense_updated': return `${who} updated ${what} ${whereLabel(a.group_id)}`;
    case 'expense_deleted': return `${who} deleted ${what} ${whereLabel(a.group_id)}`;
    case 'expense_restored': return `${who} restored ${what} ${whereLabel(a.group_id)}`;
    case 'comment': return `${who} commented on “${esc(a.data?.description)}”: <span class="muted">${esc(a.data?.body)}</span>`;
    case 'group_created': return `${who} created the group ${esc(a.data?.name)}`;
    case 'friend_added': return who === 'You' ? `You started keeping track ${whereLabel(a.group_id)}` : `${who} added you as a friend`;
    case 'member_added': return `${who} added ${esc(a.data?.name)} ${whereLabel(a.group_id)}`;
    case 'member_joined': return `${esc(a.data?.name)} joined ${whereLabel(a.group_id)}`;
    case 'member_left': return `${esc(a.data?.name)} left ${whereLabel(a.group_id)}`;
    default: return '';
  }
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
    const e = a.data?.new || a.data?.old;
    const exists = a.expense_id && S.expenses[a.expense_id];
    const amount = e && a.kind !== 'comment' ? `<b class="num">${fmt(Number(e.amount), curOf(e, S.groups[a.group_id]))}</b>` : '';
    const restore = a.kind === 'expense_deleted' && !exists ? `<button class="btn sm" data-act="restore" data-id="${a.id}">${icon('rotate-ccw', 15)} Restore</button>` : '';
    const [open, close] = exists ? [`<button class="row" data-act="open-exp" data-id="${esc(a.expense_id)}">`, '</button>'] : ['<div class="row static">', '</div>'];
    return `${open}${activityIcon(a)}
      <span class="main"><span class="wrap-text">${text}</span><span class="sub">${esc(ago(a.created_at))}</span></span>
      <span class="amt">${amount}${restore}</span>${close}`;
  }).join('');
  return rows ? `<div class="list">${rows}</div>` : `<div class="empty"><h2>Nothing yet</h2><p>Expenses, payments, comments and changes from all your friends and groups show up here.</p></div>`;
}

/* ---------- group and friend ledgers ---------- */
function renderGroup(g){
  const me = myId(g.id), t = typeOf(g.type);
  const mine = myBalance(g.id);
  const spent = {}; expOf(g.id).filter(e => e.kind !== 'payment').forEach(e => { const c = curOf(e, g); spent[c] = (spent[c] || 0) + Number(e.amount); });
  const f = g.is_direct ? friendOf(g.id) : null;
  const tabs = g.is_direct ? [['expenses', 'Expenses'], ['insights', 'Insights']] : [['expenses', 'Expenses'], ['balances', 'Balances'], ['insights', 'Insights'], ['board', 'Board']];
  if (!tabs.some(([k]) => k === S.tab)) S.tab = 'expenses';
  const header = g.is_direct
    ? `<div class="friend-head">${avatar(personName(f), avatarUrl(f), 'av xl')}<div><h1>${esc(titleOf(g))}</h1>
        <p class="muted" style="margin:0">${f?.user_id ? 'On Evenly' : f?.email ? `Invited · ${esc(f.email)}` : 'Not on Evenly yet'}</p></div></div>
       ${f && !f.user_id ? `<div class="banner ok invite-nudge">${icon('user-plus', 18)}<span>${esc(personName(f))} won’t see these expenses or get notifications until they join. ${f.email ? 'They’ll be linked when they sign up with that email, or' : 'Add their email in settings, or'} send them an invite link.</span>
         <span class="actions nowrap"><button class="btn sm primary" data-act="invite" data-id="${esc(g.id)}">${icon('share-2', 15)} Invite</button></span></div>` : ''}`
    : `${g.cover_url ? `<div class="cover"><img src="${esc(g.cover_url)}" alt=""></div>` : ''}
       <div class="group-title"><span class="av lg type-${t[0]}" aria-hidden="true">${icon(t[2], 20)}</span><h1>${esc(g.name)}</h1></div>
       <div class="chips">${membersOf(g.id).map(m => `<span class="chip">${esc(m.id === me ? 'You' : personName(m))}${m.user_id || m.id === me ? '' : ' <span class="muted">· not joined</span>'}</span>`).join('')}</div>`;
  let html = `<div class="ghead">
    <div class="crumbs"><button class="btn ghost" data-act="home">${icon('chevron-left')} ${g.is_direct ? 'Friends' : 'Groups'}</button>
      <span class="actions"><button class="btn sm" data-act="settle">${icon('wallet', 16)} Settle up</button>
      <button class="btn sm" data-act="${g.is_direct ? 'edit-friend' : 'edit-group'}" aria-label="${g.is_direct ? 'Friend settings' : 'Group settings'}">${icon('settings', 16)}</button></span></div>
    ${header}
  </div>
  <div class="stats">
    <div class="stat"><div class="lbl">${g.is_direct ? 'Between you two' : 'Your balance'}</div><div class="val stack">${balanceLines(mine, {they: g.is_direct ? `${esc(titleOf(g))} owes you` : 'you get back'})}</div></div>
    <div class="stat"><div class="lbl">${g.is_direct ? 'Spent together' : 'Group spending'}</div><div class="val">${fmtMulti(spent) || fmt(0, g.currency)}</div></div>
  </div>`;
  if (g.is_direct) {
    const owed = Object.entries(mine).filter(([, v]) => v > 0);
    if (owed.length && f && canRemind(g.id, f.id)) html += `<div class="actions">${owed.map(([c, v]) => `<button class="btn sm" data-act="remind" data-gid="${esc(g.id)}" data-member="${esc(f.id)}" data-amt="${v}" data-cur="${c}">${icon('bell', 14)} Remind ${esc(titleOf(g))} about ${fmt(v, c)}</button>`).join('')}</div>`;
    html += acrossGroups(friendsIndex().get(friendKeyOf(g)));
  }
  html += `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  if (S.tab === 'expenses') html += renderExpenses(g, me);
  else if (S.tab === 'balances') html += renderBalances(g);
  else if (S.tab === 'insights') html += renderInsights(g);
  else html += renderBoard(g);
  html += `<button class="btn primary fab" data-act="add-exp">${icon('plus', 20)} Add expense</button>`;
  return html;
}
function friendKeyOf(g){
  const f = friendOf(g.id); if (!f) return null;
  return f.user_id ? 'u:' + f.user_id : f.email ? 'e:' + f.email.toLowerCase() : 'd:' + g.id;
}
function acrossGroups(f){
  if (!f || !f.groups.length) return '';
  return `<div class="section"><h3>In your groups</h3><div class="list">${f.groups.map(x => `<button class="row" data-act="open-group" data-id="${esc(x.gid)}">
      <span class="main"><span class="title">${esc(S.groups[x.gid].name)}</span></span><span class="amt">${balanceLines(x.amt)}</span></button>`).join('')}
    <div class="row static"><span class="main"><b>Overall</b></span><span class="amt">${balanceLines(f.total)}</span></div></div></div>`;
}
// A person you only share groups with: no one-to-one ledger yet.
function renderFriendOnly(f){
  return `<div class="ghead"><div class="crumbs"><button class="btn ghost" data-act="home">${icon('chevron-left')} Friends</button></div>
    <div class="friend-head">${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url, 'av xl')}<div><h1>${esc(f.name)}</h1><p class="muted" style="margin:0">${esc(friendSub(f))}</p></div></div></div>
    <div class="stats"><div class="stat"><div class="lbl">Overall</div><div class="val stack">${balanceLines(f.total, {they: `${esc(f.name)} owes you`})}</div></div></div>
    ${acrossGroups(f)}
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
  return `<span>not involved</span><b class="muted">${fmt(0, cur)}</b>`;
}
export function expenseRow(g, e, me){
  const d = new Date(e.date + 'T00:00');
  const dt = `<span class="date">${esc(d.toLocaleDateString(undefined, {month: 'short'}))}<b>${d.getDate()}</b></span>`;
  const title = e.kind === 'payment' ? `${esc(nameOf(g.id, e.paid_by))} paid ${esc(nameOf(g.id, Object.keys(e.split)[0]))}` : esc(e.description);
  const sub = e.kind === 'payment' ? 'Payment' : paidLabel(g, e);
  const badges = (e.repeat !== 'never' && e.repeat ? `<span class="badge">${icon('repeat', 12)} ${e.repeat}</span>` : '')
    + (e.notes ? `<span class="badge">${icon('notebook-pen', 12)}</span>` : '')
    + (e.bill ? `<span class="badge">${icon('users', 12)} shared bill</span>` : '');
  return `<button class="row" data-act="open-exp" data-id="${esc(e.id)}">${dt}${e.kind === 'payment' ? payIcon() : catIcon(e.category)}
    <span class="main"><span class="title">${title}</span><span class="sub">${sub} ${badges}</span></span>
    <span class="amt">${myPart(g, e, me)}</span></button>`;
}
function renderExpenses(g, me){
  const exps = expOf(g.id);
  const deleted = S.activity.filter(a => a.group_id === g.id && a.kind === 'expense_deleted' && !S.expenses[a.expense_id]).length;
  const trash = deleted ? `<button class="linkbtn small" data-act="deleted">${icon('rotate-ccw', 14)} Recently deleted (${deleted})</button>` : '';
  if (!exps.length) return `<div class="empty"><h2>No expenses yet</h2><p>Add the first bill: who paid, how much, and who it was for.${g.is_direct ? '' : ' Everyone in the group sees it straight away.'}</p>
    <button class="btn primary" data-act="add-exp">Add an expense</button>${trash}</div>`;
  let lastMonth = '', out = '';
  for (const e of exps) {
    const month = new Date(e.date + 'T00:00').toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    if (month !== lastMonth) { out += `<div class="month">${esc(month)}</div>`; lastMonth = month; }
    out += expenseRow(g, e, me);
  }
  return `<div class="list">${out}</div>${trash ? `<div>${trash}</div>` : ''}`;
}
function renderBalances(g){
  const all = groupBalances(g.id), me = myId(g.id);
  const curs = Object.keys(all).filter(c => Object.values(all[c]).some(v => v));
  if (!curs.length) return `<div class="empty"><h2>All settled up</h2><p>Nobody owes anything in this group right now.</p></div>`;
  const pw = g.simplify ? null : pairwise(expOf(g.id), g);
  let html = '';
  for (const cur of curs) {
    const bal = all[cur];
    const max = Math.max(1, ...Object.values(bal).map(Math.abs));
    const rows = membersOf(g.id).map(m => {
      const b = bal[m.id] || 0, w = (Math.abs(b) / max * 100).toFixed(1);
      const txt = b > 0 ? `<b class="pos">gets back ${fmt(b, cur)}</b>` : b < 0 ? `<b class="neg">owes ${fmt(b, cur)}</b>` : `<span class="muted">settled up</span>`;
      return `<div class="bal-row">${avatar(personName(m), avatarUrl(m))}
        <div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(m.id === me ? 'You' : personName(m))}</div>
        <div class="diverge" aria-hidden="true"><span class="l">${b < 0 ? `<i style="width:${w}%"></i>` : ''}</span><span class="r">${b > 0 ? `<i style="width:${w}%"></i>` : ''}</span></div></div>
        <div class="num" style="text-align:right">${txt}</div></div>`;
    }).join('');
    const tx = g.simplify ? simplify(bal) : (pw[cur] || []);
    const txRows = tx.map(t => `<div class="row static">
        <span class="main"><span class="title">${esc(nameOf(g.id, t.from))} ${t.from === me ? 'pay' : 'pays'} ${esc(nameOf(g.id, t.to))}</span>
        <span class="sub num">${fmt(t.amount, cur)}</span></span>
        <span class="actions nowrap">${t.to === me && canRemind(g.id, t.from) ? `<button class="btn sm ghost" data-act="remind" data-gid="${esc(g.id)}" data-member="${esc(t.from)}" data-amt="${t.amount}" data-cur="${cur}">${icon('bell', 14)} Remind</button>` : ''}
        <button class="btn sm" data-act="record" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-amt="${t.amount}" data-cur="${cur}">Record</button></span></div>`).join('');
    html += `<div class="section"><h3>${curs.length > 1 ? `${cur} · ` : ''}Who’s up and who’s down</h3><div class="list">${rows}</div></div>
      <div class="section"><h3>${g.simplify ? 'Fewest payments to settle' : 'Who owes whom'}</h3><div class="list">${txRows}</div></div>`;
  }
  return html + `<div class="actions"><button class="btn sm" data-act="copy">${icon('copy', 15)} Copy for group chat</button>
    <span class="muted small">${g.simplify ? 'Debts are simplified. Turn this off in group settings.' : 'Debts are not simplified. Turn this on in group settings.'}</span></div>`;
}
function renderInsights(g){
  const real = expOf(g.id).filter(e => e.kind !== 'payment');
  if (!real.length) return `<div class="empty"><h2>Nothing to chart yet</h2><p>Spending by category and by person shows up here once you add expenses.</p></div>`;
  const byCur = {}; real.forEach(e => (byCur[curOf(e, g)] ||= []).push(e));
  return Object.entries(byCur).map(([cur, list]) => {
    const total = list.reduce((a, e) => a + Number(e.amount), 0);
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
    return `<div class="section"><h3>${Object.keys(byCur).length > 1 ? `${cur} · ` : ''}Spending by category · ${fmt(total, cur)}</h3><div class="list">${catRows}</div></div>
      <div class="section"><h3>Paid versus share</h3><div class="list">${pRows}</div></div>`;
  }).join('');
}
function renderBoard(g){
  const by = g.whiteboard_by ? (g.whiteboard_by === uid() ? 'you' : (membersOf(g.id).find(m => m.user_id === g.whiteboard_by)?.name || 'someone')) : null;
  return `<form class="section" id="boardForm"><h3>Group whiteboard</h3>
    <p class="muted small" style="margin:0">Shared notes for everyone in the group: Wi-Fi password, trip plan, house rules.</p>
    <textarea id="boardText" rows="10" maxlength="5000" placeholder="Write anything the group should know…">${esc(g.whiteboard || '')}</textarea>
    <div class="actions"><span class="muted small">${by ? `Last edited by ${esc(by)}, ${esc(ago(g.whiteboard_at))}` : 'Nobody has written here yet.'}</span><span class="sp"></span>
    <button class="btn primary sm" type="submit">Save</button></div></form>`;
}

/* ---------- settings ---------- */
function renderSettings(){
  const p = myProfile() || {}, email = S.session.user.email;
  return `<div class="ghead"><div class="crumbs"><button class="btn ghost" data-act="home">${icon('chevron-left')} Back</button></div><h1>Your account</h1></div>
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
  <section class="card-sec"><h3>${icon('mail', 15)} Email</h3>
    <form id="emailForm" class="inline-form"><label class="f">New email<input id="sEmail" type="email" placeholder="${esc(email)}"></label><button class="btn" type="submit">Change</button></form>
    <p class="hint muted small">We’ll send a confirmation link to the new address. Groups that invited your old email keep working.</p>
  </section>
  <section class="card-sec"><h3>${icon('key-round', 15)} Password</h3>
    <form id="passForm" class="inline-form"><label class="f">New password<input id="sPass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label><button class="btn" type="submit">Change</button></form>
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
  <section class="card-sec"><h3>${icon('share-2', 15)} Invite friends to Evenly</h3>
    <div class="actions"><code class="grow">${esc(location.origin)}</code><button class="btn sm" data-act="copy-app">${icon('copy', 15)} Copy link</button></div>
  </section>
  <section class="card-sec">
    <button class="btn" data-act="signout">${icon('log-out', 16)} Sign out</button>
  </section>
  <section class="card-sec danger-zone"><h3>Delete account</h3>
    <p class="muted small" style="margin:0">Your login is deleted. Groups and expenses stay for your friends, under your name. This can’t be undone.</p>
    <form id="deleteForm" class="inline-form"><label class="f">Type DELETE to confirm<input id="sDel" autocomplete="off"></label><button class="btn danger" type="submit">Delete my account</button></form>
  </section>`;
}

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
function renderNotifications(){
  const list = S.notifications;
  const rows = list.map(n => {
    const t = noteText(n);
    const target = n.expense_id && S.expenses[n.expense_id] ? `data-act="open-exp" data-id="${esc(n.expense_id)}"` : n.group_id && S.groups[n.group_id] ? `data-act="open-group" data-id="${esc(n.group_id)}"` : '';
    const [open, close] = target ? [`<button class="row${n.read_at ? '' : ' unread'}" ${target}>`, '</button>'] : [`<div class="row static${n.read_at ? '' : ' unread'}">`, '</div>'];
    return `${open}<span class="ico" style="--c:var(--accent)">${icon(noteIcon(n))}</span>
      <span class="main"><span class="wrap-text"><b>${esc(t.title)}</b></span>${t.body ? `<span class="wrap-text muted small">${esc(t.body)}</span>` : ''}<span class="sub">${esc(ago(n.created_at))}</span></span>${close}`;
  }).join('');
  return `<div class="ghead"><div class="crumbs"><button class="btn ghost" data-act="home">${icon('chevron-left')} Back</button>
      <button class="btn sm ghost" data-act="settings">${icon('settings', 15)} Settings</button></div><h1>Notifications</h1></div>
    ${pushBanner()}
    ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><h2>You’re all caught up</h2><p>When friends add expenses with you, comment, pay you or send a reminder, it shows up here.</p></div>`}`;
}
