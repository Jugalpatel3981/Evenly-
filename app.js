(() => {
const CURRENCIES = ['INR','USD','EUR','GBP','AED','CAD','AUD','SGD','NZD','CHF'];
const CATS = [
  ['food','Food & drink','F'],['groceries','Groceries','G'],['travel','Travel','T'],['stay','Stay & rent','R'],
  ['bills','Bills','B'],['shopping','Shopping','S'],['fun','Fun','E'],['other','Other','O']];
const catOf = k => CATS.find(c => c[0] === k) || CATS[7];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const toCents = s => { const n = parseFloat(String(s ?? '').replace(/[, ]/g, '')); return isFinite(n) ? Math.round(n * 100) : NaN; };
const fmts = {};
const fmt = (c, cur = 'INR') => {
  const f = fmts[cur] || (fmts[cur] = new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {style:'currency', currency:cur}));
  return f.format(Math.abs(c) / 100);
};
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const appUrl = () => location.origin + location.pathname;

const S = {
  session: null, ready: false, recovery: false,
  groups: {}, members: {}, expenses: {},
  view: 'home', gid: null, tab: 'activity', authMode: 'signin'
};

/* ---------- backend ---------- */
const cfg = window.EVENLY_CONFIG || {};
const configured = cfg.SUPABASE_URL && !/YOUR-PROJECT/.test(cfg.SUPABASE_URL) && cfg.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(cfg.SUPABASE_ANON_KEY);
const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let channel = null, reloadT = null, booted = null;

const uid = () => S.session?.user?.id;
const myName = () => S.session?.user?.user_metadata?.name || (S.session?.user?.email || '').split('@')[0] || 'Me';

async function fetchAll(table){
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const {data, error} = await sb.from(table).select('*').range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}
async function loadAll(){
  try {
    const [g, m, e] = await Promise.all([fetchAll('groups'), fetchAll('group_members'), fetchAll('expenses')]);
    S.groups = Object.fromEntries(g.map(r => [r.id, r]));
    S.members = {};
    m.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
     .forEach(r => (S.members[r.group_id] ||= []).push(r));
    S.expenses = Object.fromEntries(e.map(r => [r.id, r]));
    S.ready = true;
    render();
  } catch (err) {
    toast(friendly(err));
  }
}
const scheduleReload = () => { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 250); };

async function boot(){
  if (booted === uid()) return;
  booted = uid(); S.ready = false; render();
  try { await sb.rpc('claim_invites'); } catch {}
  await loadAll();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('evenly-' + uid())
    .on('postgres_changes', {event: '*', schema: 'public'}, scheduleReload)
    .subscribe();
}
function teardown(){
  booted = null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  S.groups = {}; S.members = {}; S.expenses = {}; S.ready = false; S.view = 'home'; S.gid = null;
}
function friendly(err){
  const m = (err && (err.message || err.error_description)) || String(err);
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/User already registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Use a password with at least 6 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Can’t reach the server. Check your connection.';
  if (/violates foreign key/i.test(m)) return 'That person still has expenses in this group.';
  return m;
}
// Run a write; on success refresh data, on failure show why.
async function run(promise, okMsg){
  const {data, error} = await promise;
  if (error) { toast(friendly(error)); return null; }
  if (okMsg) toast(okMsg);
  scheduleReload();
  return data ?? true;
}

/* ---------- money logic ---------- */
const groupList = () => Object.values(S.groups).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
const membersOf = gid => S.members[gid] || [];
const expOf = gid => Object.values(S.expenses).filter(e => e.group_id === gid)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
const nameOf = (gid, id) => membersOf(gid).find(m => m.id === id)?.name || 'Former member';
const myId = gid => membersOf(gid).find(m => m.user_id === uid())?.id || null;

function balances(gid){
  const b = {};
  membersOf(gid).forEach(m => b[m.id] = 0);
  for (const e of expOf(gid)) {
    b[e.paid_by] = (b[e.paid_by] || 0) + Number(e.amount);
    for (const k in e.split) b[k] = (b[k] || 0) - Number(e.split[k]);
  }
  return b;
}
// Greedy match of biggest debtor with biggest creditor: at most n-1 payments.
function simplify(b){
  const cred = [], debt = [];
  for (const id in b) { if (b[id] > 0) cred.push([id, b[id]]); else if (b[id] < 0) debt.push([id, -b[id]]); }
  cred.sort((x, y) => y[1] - x[1]); debt.sort((x, y) => y[1] - x[1]);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i][1], cred[j][1]);
    if (amt > 0) out.push({from: debt[i][0], to: cred[j][0], amount: amt});
    debt[i][1] -= amt; cred[j][1] -= amt;
    if (debt[i][1] === 0) i++;
    if (cred[j][1] === 0) j++;
  }
  return out;
}
function allocate(total, weights){
  const tw = Object.values(weights).reduce((a, b) => a + b, 0);
  const parts = Object.entries(weights).map(([id, w]) => { const raw = total * w / tw; return {id, c: Math.floor(raw), frac: raw - Math.floor(raw)}; });
  let rem = total - parts.reduce((a, p) => a + p.c, 0);
  parts.slice().sort((a, b) => b.frac - a.frac).forEach(p => { if (rem > 0) { p.c++; rem--; } });
  const split = {}; parts.forEach(p => { if (p.c > 0) split[p.id] = p.c; });
  return split;
}
function computeSplit(total, mode, members, inc, inputs, cur){
  if (!(total > 0)) return {error: 'Enter an amount above zero.'};
  const ids = members.map(m => m.id);
  if (mode === 'equal') {
    const sel = ids.filter(id => inc.has(id));
    if (!sel.length) return {error: 'Pick at least one person to split with.'};
    const w = {}; sel.forEach(id => w[id] = 1);
    return {split: allocate(total, w), msg: sel.length === 1 ? `${fmt(total, cur)} for one person` : `${fmt(Math.floor(total / sel.length), cur)} each, split ${sel.length} ways`};
  }
  if (mode === 'exact') {
    const split = {}; let sum = 0;
    for (const id of ids) {
      const v = inputs[id]; if (v == null || String(v).trim() === '') continue;
      const c = toCents(v); if (isNaN(c) || c < 0) return {error: 'Each amount must be a number.'};
      if (c > 0) { split[id] = c; sum += c; }
    }
    if (sum !== total) return {error: sum < total ? `${fmt(total - sum, cur)} still to assign` : `${fmt(sum - total, cur)} more than the total`};
    return {split, msg: 'Amounts match the total'};
  }
  const w = {}; let tw = 0;
  for (const id of ids) { const v = parseFloat(inputs[id]); if (v > 0) { w[id] = v; tw += v; } else if (inputs[id] && isNaN(v)) return {error: 'Each value must be a number.'}; }
  if (mode === 'percent') {
    if (Math.abs(tw - 100) > 0.001) return {error: `Percentages add up to ${+tw.toFixed(2)}%. They need to reach 100%.`};
    return {split: allocate(total, w), msg: 'Percentages add up to 100%'};
  }
  if (tw <= 0) return {error: 'Give at least one person a share.'};
  return {split: allocate(total, w), msg: `${+tw.toFixed(2)} shares in total`};
}

/* ---------- rendering ---------- */
const brand = `<div class="brand"><span class="mark" aria-hidden="true">E</span>Evenly</div>`;
function render(){
  const app = $('#app');
  if (!sb) { app.innerHTML = renderSetup(); return; }
  if (S.recovery) { app.innerHTML = renderRecovery(); return; }
  if (!S.session) { app.innerHTML = renderAuth(); return; }
  if (S.view === 'group' && S.ready && !S.groups[S.gid]) { S.view = 'home'; S.gid = null; }
  let html = `<header class="top">${brand}<div class="account"><span class="muted" style="font-size:13px">${esc(S.session.user.email)}</span><button class="btn sm" data-act="signout">Sign out</button></div></header>`;
  if (!S.ready) html += `<p class="loading">Opening your groups…</p>`;
  else html += S.view === 'group' ? renderGroup(S.groups[S.gid]) : renderHome();
  app.innerHTML = html;
}
function renderSetup(){
  return `<header class="top">${brand}</header><div class="empty"><h1>Almost there</h1>
    <p>Evenly needs its free Supabase database. Open <code>config.js</code> and paste your project URL and anon key, then reload this page.</p>
    <p>The full steps are in <code>README.md</code>.</p></div>`;
}
function renderAuth(){
  const m = S.authMode;
  const title = m === 'signup' ? 'Create your account' : m === 'reset' ? 'Reset your password' : 'Sign in';
  return `<div class="auth">${brand}
    <form class="card" id="authForm" novalidate>
      <h1 style="font-size:28px">${title}</h1>
      <p class="muted">${m === 'signup' ? 'Split trips, rent and dinners with friends. Free.' : m === 'reset' ? 'We’ll email you a link to choose a new password.' : 'Welcome back. Your groups are waiting.'}</p>
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
function renderRecovery(){
  return `<div class="auth">${brand}<form class="card" id="recForm" novalidate>
    <h1 style="font-size:28px">Choose a new password</h1>
    <label class="f">New password<input id="rPass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label>
    <p class="hint err" id="rHint"></p>
    <button class="btn primary" type="submit" style="justify-content:center">Save password</button></form></div>`;
}
function renderHome(){
  const gs = groupList();
  const fab = `<button class="btn primary fab" data-act="new-group">+ New group</button>`;
  if (!gs.length) {
    return `<div class="empty">
      <h1>Hi ${esc(myName())}. Split bills without the awkward maths.</h1>
      <p>Make a group for a trip, your flat or a dinner. Add friends by email so they can sign in and see it too, or just by name if they don’t need an account.</p>
      <p>If a friend already added you, their group appears here automatically once you sign in with that email.</p>
      <button class="btn primary" data-act="new-group">Create your first group</button>
    </div>`;
  }
  let owed = 0, owe = 0, cur = null, mixed = false;
  const rows = gs.map(g => {
    const exps = expOf(g.id);
    const spent = exps.filter(e => e.kind !== 'payment').reduce((a, e) => a + Number(e.amount), 0);
    const me = myId(g.id); let right = '';
    if (me) {
      const b = balances(g.id)[me] || 0;
      if (cur && cur !== g.currency) mixed = true; cur = cur || g.currency;
      if (b > 0) owed += b; else owe -= b;
      right = b > 0 ? `<span class="pos">you get back</span><b class="pos">${fmt(b, g.currency)}</b>` :
              b < 0 ? `<span class="neg">you owe</span><b class="neg">${fmt(b, g.currency)}</b>` : `<b>settled up</b>`;
    }
    return `<button class="row" data-act="open-group" data-id="${esc(g.id)}">
      <span class="av lg" aria-hidden="true">${esc(initials(g.name))}</span>
      <span class="main"><span class="title" style="display:block">${esc(g.name)}</span>
      <span class="sub" style="display:block">${membersOf(g.id).length} people · ${fmt(spent, g.currency)} spent</span></span>
      <span class="amt">${right}</span></button>`;
  }).join('');
  const stats = cur && !mixed ? `<div class="stats">
      <div class="stat"><div class="lbl">You get back</div><div class="val pos">${fmt(owed, cur)}</div></div>
      <div class="stat"><div class="lbl">You owe</div><div class="val neg">${fmt(owe, cur)}</div></div></div>` : '';
  return `<h1>Your groups</h1>${stats}<div class="list">${rows}</div>${fab}`;
}
function renderGroup(g){
  const exps = expOf(g.id), cur = g.currency, me = myId(g.id), bal = balances(g.id);
  const spent = exps.filter(e => e.kind !== 'payment').reduce((a, e) => a + Number(e.amount), 0);
  const myBal = me ? bal[me] || 0 : 0;
  let html = `<div class="ghead">
    <div class="crumbs"><button class="btn ghost" data-act="home">‹ All groups</button>
      <span class="actions"><button class="btn sm" data-act="settle">Settle up</button><button class="btn sm" data-act="edit-group">Edit group</button></span></div>
    <h1>${esc(g.name)}</h1>
    <div class="chips">${membersOf(g.id).map(m => `<span class="chip">${esc(m.name)}${m.id === me ? ' (you)' : ''}</span>`).join('')}</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="lbl">${myBal > 0 ? 'You get back' : myBal < 0 ? 'You owe' : 'Your balance'}</div>
      <div class="val ${myBal > 0 ? 'pos' : myBal < 0 ? 'neg' : ''}">${myBal === 0 ? 'Settled up' : fmt(myBal, cur)}</div></div>
    <div class="stat"><div class="lbl">Group spending</div><div class="val">${fmt(spent, cur)}</div></div>
  </div>
  <div class="tabs" role="tablist">
    ${[['activity','Activity'],['balances','Balances'],['insights','Insights']].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}
  </div>`;
  if (S.tab === 'activity') html += renderActivity(g, exps, me);
  else if (S.tab === 'balances') html += renderBalances(g, bal);
  else html += renderInsights(g, exps);
  html += `<button class="btn primary fab" data-act="add-exp">+ Add expense</button>`;
  return html;
}
function renderActivity(g, exps, me){
  if (!exps.length) return `<div class="empty"><h2>No expenses yet</h2><p>Add the first bill: who paid, how much, and who it was for. Everyone in the group sees it straight away.</p>
    <button class="btn primary" data-act="add-exp">Add an expense</button></div>`;
  const cur = g.currency; let lastMonth = '', out = '';
  for (const e of exps) {
    const amount = Number(e.amount);
    const d = new Date(e.date + 'T00:00');
    const month = d.toLocaleDateString(undefined, {month:'long', year:'numeric'});
    if (month !== lastMonth) { out += `<div class="month">${esc(month)}</div>`; lastMonth = month; }
    const dt = `<span class="date">${esc(d.toLocaleDateString(undefined, {month:'short'}))}<b>${d.getDate()}</b></span>`;
    if (e.kind === 'payment') {
      const to = Object.keys(e.split)[0];
      let right = `<b>${fmt(amount, cur)}</b>`;
      if (me === e.paid_by) right = `<span>you paid</span><b>${fmt(amount, cur)}</b>`;
      else if (me === to) right = `<span>you received</span><b>${fmt(amount, cur)}</b>`;
      out += `<button class="row" data-act="edit-pay" data-id="${esc(e.id)}">${dt}
        <span class="ico" style="--c:var(--accent)" aria-hidden="true">⇄</span>
        <span class="main"><span class="title" style="display:block">${esc(nameOf(g.id, e.paid_by))} paid ${esc(nameOf(g.id, to))}</span><span class="sub" style="display:block">Payment</span></span>
        <span class="amt">${right}</span></button>`;
      continue;
    }
    const c = catOf(e.category);
    const mine = Number(e.split[me] || 0);
    let right;
    if (e.paid_by === me && amount - mine > 0) right = `<span class="pos">you lent</span><b class="pos">${fmt(amount - mine, cur)}</b>`;
    else if (e.paid_by !== me && mine > 0) right = `<span class="neg">you borrowed</span><b class="neg">${fmt(mine, cur)}</b>`;
    else right = `<span>not involved</span><b class="muted">${fmt(0, cur)}</b>`;
    out += `<button class="row" data-act="edit-exp" data-id="${esc(e.id)}">${dt}
      <span class="ico" style="--c:var(--c-${c[0]})" aria-hidden="true">${c[2]}</span>
      <span class="main"><span class="title" style="display:block">${esc(e.description)}</span>
      <span class="sub" style="display:block">${esc(nameOf(g.id, e.paid_by))} paid ${fmt(amount, cur)}</span></span>
      <span class="amt">${right}</span></button>`;
  }
  return `<div class="list">${out}</div>`;
}
function renderBalances(g, bal){
  const cur = g.currency;
  const max = Math.max(1, ...Object.values(bal).map(Math.abs));
  const rows = membersOf(g.id).map(m => {
    const b = bal[m.id] || 0, w = (Math.abs(b) / max * 100).toFixed(1);
    const txt = b > 0 ? `<b class="pos">gets back ${fmt(b, cur)}</b>` : b < 0 ? `<b class="neg">owes ${fmt(b, cur)}</b>` : `<span class="muted">settled up</span>`;
    return `<div class="bal-row"><span class="av" aria-hidden="true">${esc(initials(m.name))}</span>
      <div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(m.name)}</div>
      <div class="diverge" aria-hidden="true"><span class="l">${b < 0 ? `<i style="width:${w}%"></i>` : ''}</span><span class="r">${b > 0 ? `<i style="width:${w}%"></i>` : ''}</span></div></div>
      <div class="num" style="text-align:right">${txt}</div></div>`;
  }).join('');
  const tx = simplify(bal);
  const txRows = tx.length ? tx.map(t => `<div class="row static">
      <span class="main"><span class="title" style="display:block">${esc(nameOf(g.id, t.from))} pays ${esc(nameOf(g.id, t.to))}</span>
      <span class="sub num" style="display:block">${fmt(t.amount, cur)}</span></span>
      <button class="btn sm" data-act="record" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-amt="${t.amount}">Record payment</button></div>`).join('')
    : `<div class="row static"><span class="main muted">Everyone is settled up. Nothing to pay.</span></div>`;
  return `<div class="section"><h3>Who's up and who's down</h3><div class="list">${rows}</div></div>
    <div class="section"><div class="section-h"><h3 style="margin:0">Fewest payments to settle</h3>
      <button class="btn sm" data-act="copy">Copy for group chat</button></div>
      <div class="list">${txRows}</div></div>`;
}
function renderInsights(g, exps){
  const cur = g.currency, real = exps.filter(e => e.kind !== 'payment');
  if (!real.length) return `<div class="empty"><h2>Nothing to chart yet</h2><p>Spending by category and by person shows up here once you add expenses.</p></div>`;
  const byCat = {}; real.forEach(e => byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + Number(e.amount));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const cmax = cats[0][1];
  const total = real.reduce((a, e) => a + Number(e.amount), 0);
  const catRows = cats.map(([k, v]) => { const c = catOf(k); return `<div class="row static" style="--c:var(--c-${c[0]})">
    <span class="ico" aria-hidden="true">${c[2]}</span>
    <span class="main"><span style="display:flex;justify-content:space-between;gap:8px"><b>${esc(c[1])}</b><span class="num">${fmt(v, cur)} <span class="muted">· ${Math.round(v / total * 100)}%</span></span></span>
    <span class="bar" style="display:block"><i style="width:${(v / cmax * 100).toFixed(1)}%"></i></span></span></div>`; }).join('');
  const paid = {}, share = {};
  real.forEach(e => { paid[e.paid_by] = (paid[e.paid_by] || 0) + Number(e.amount); for (const k in e.split) share[k] = (share[k] || 0) + Number(e.split[k]); });
  const pRows = membersOf(g.id).map(m => `<div class="row static"><span class="av" aria-hidden="true">${esc(initials(m.name))}</span>
    <span class="main"><span class="title" style="display:block">${esc(m.name)}</span>
    <span class="sub num" style="display:block">paid ${fmt(paid[m.id] || 0, cur)} · their share ${fmt(share[m.id] || 0, cur)}</span></span></div>`).join('');
  return `<div class="section"><h3>Spending by category</h3><div class="list">${catRows}</div></div>
    <div class="section"><h3>Paid versus share</h3><div class="list">${pRows}</div></div>`;
}

/* ---------- sheets ---------- */
const sheet = $('#sheet'), body = $('#sheetBody');
function openSheet(html){ body.innerHTML = html; if (!sheet.open) sheet.showModal(); const f = body.querySelector('[autofocus]'); if (f) f.focus(); }
function closeSheet(){ if (sheet.open) sheet.close(); body.innerHTML = ''; }
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener('close', () => { body.innerHTML = ''; });
body.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
function armDelete(btn, fn){
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { fn(); return; }
    btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = 'Tap again to delete';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = t; } }, 3500);
  });
}
const head = t => `<div class="sheet-h"><h2>${t}</h2><button type="button" class="btn ghost" data-close>Close</button></div>`;
const busy = (form, on) => form.querySelectorAll('button[type="submit"]').forEach(b => b.disabled = on);

function memberTag(m){
  if (m.user_id === uid()) return '<span class="tag on">you</span>';
  if (m.user_id) return '<span class="tag on">joined</span>';
  if (m.email) return '<span class="tag">invited</span>';
  return '';
}
function openGroupSheet(gid){
  const g = gid ? S.groups[gid] : null;
  const used = new Set();
  if (g) expOf(g.id).forEach(e => { used.add(e.paid_by); Object.keys(e.split).forEach(k => used.add(k)); });
  // New group: people to add. Existing group: current members (edits saved per row) plus new ones.
  const F = {existing: g ? membersOf(g.id).map(m => ({...m})) : [], added: []};
  openSheet(`<form class="sheet-in" id="gForm" novalidate>${head(g ? 'Edit group' : 'New group')}
    <label class="f">Group name<input id="gName" maxlength="60" placeholder="Goa trip, Flat 4B, Friday dinners" value="${esc(g?.name || '')}" ${g ? '' : 'autofocus'}></label>
    <label class="f">Currency<select id="gCur">${CURRENCIES.map(c => `<option${(g?.currency || 'INR') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <div><div class="f-l">People</div><div class="split-rows" id="gMembers"></div></div>
    <div class="mem-add"><input id="gNewName" maxlength="40" placeholder="Name" aria-label="New person’s name"><input id="gNewEmail" type="email" placeholder="Email (optional)" aria-label="New person’s email"><button type="button" class="btn" id="gAdd">Add</button></div>
    <p class="hint muted" style="font-weight:500">Add an email to let that person sign in and see this group. Without one, they’re just a name you can split with.</p>
    <p class="hint err" id="gHint"></p>
    <div class="actions">${g && g.created_by === uid() ? '<button type="button" class="btn danger" id="gDel">Delete group</button>' : ''}<span class="sp"></span><button class="btn primary" type="submit">${g ? 'Save changes' : 'Create group'}</button></div>
  </form>`);
  const list = $('#gMembers'), hint = $('#gHint');
  const draw = () => {
    const meRow = g ? '' : `<div class="ms"><span class="av" aria-hidden="true">${esc(initials(myName()))}</span><span class="nm">${esc(myName())}</span><span class="tag on">you</span></div>`;
    const ex = F.existing.map((m, i) => m.removed ? '' : `<div class="ms"><span class="av" aria-hidden="true">${esc(initials(m.name))}</span>
      <input type="text" value="${esc(m.name)}" data-ex="${i}" aria-label="Name" style="flex:1;width:auto;text-align:left">${memberTag(m)}
      ${m.user_id ? '' : `<button type="button" class="btn ghost sm" data-rmex="${i}" ${used.has(m.id) ? 'disabled title="Has expenses in this group"' : ''}>Remove</button>`}</div>`).join('');
    const ad = F.added.map((m, i) => `<div class="ms"><span class="av" aria-hidden="true">${esc(initials(m.name))}</span>
      <span class="nm">${esc(m.name)}${m.email ? ` <span class="muted" style="font-weight:500">${esc(m.email)}</span>` : ''}</span>
      <button type="button" class="btn ghost sm" data-rmad="${i}">Remove</button></div>`).join('');
    list.innerHTML = meRow + ex + ad || `<div class="ms muted">Add everyone who shares costs.</div>`;
  };
  draw();
  list.addEventListener('input', e => { const i = e.target.dataset.ex; if (i != null) F.existing[i].name = e.target.value; });
  list.addEventListener('click', e => {
    const a = e.target.closest('[data-rmad]'), x = e.target.closest('[data-rmex]');
    if (a) { F.added.splice(+a.dataset.rmad, 1); draw(); }
    if (x && !x.disabled) { F.existing[+x.dataset.rmex].removed = true; draw(); }
  });
  const add = () => {
    const n = $('#gNewName').value.trim(), em = $('#gNewEmail').value.trim().toLowerCase();
    if (!n) { hint.textContent = 'Type a name first.'; return false; }
    if (em && !validEmail(em)) { hint.textContent = 'That email doesn’t look right.'; return false; }
    hint.textContent = '';
    F.added.push({name: n, email: em}); $('#gNewName').value = ''; $('#gNewEmail').value = ''; draw(); $('#gNewName').focus();
    return true;
  };
  $('#gAdd').addEventListener('click', add);
  ['#gNewName', '#gNewEmail'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
  if (g && $('#gDel')) armDelete($('#gDel'), async () => {
    if (await run(sb.from('groups').delete().eq('id', g.id), 'Group deleted')) { closeSheet(); S.view = 'home'; render(); }
  });
  $('#gForm').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('#gNewName').value.trim() && !add()) return;
    const name = $('#gName').value.trim();
    if (!name) { hint.textContent = 'Give the group a name.'; return; }
    const form = e.target; busy(form, true);
    if (!g) {
      if (F.added.length < 1) { hint.textContent = 'Add at least one other person to split with.'; busy(form, false); return; }
      const id = await run(sb.rpc('create_group', {p_name: name, p_currency: $('#gCur').value, p_my_name: myName(), p_members: F.added}));
      busy(form, false);
      if (id) { closeSheet(); S.view = 'group'; S.gid = id; S.tab = 'activity'; await loadAll(); toast('Group created'); }
      return;
    }
    if (F.existing.some(m => !m.removed && !m.name.trim())) { hint.textContent = 'Everyone needs a name.'; busy(form, false); return; }
    let ok = true;
    if (name !== g.name || $('#gCur').value !== g.currency)
      ok = !!(await run(sb.from('groups').update({name, currency: $('#gCur').value}).eq('id', g.id))) && ok;
    for (const m of F.existing) {
      const orig = membersOf(g.id).find(o => o.id === m.id);
      if (m.removed) ok = !!(await run(sb.from('group_members').delete().eq('id', m.id))) && ok;
      else if (orig && orig.name !== m.name.trim()) ok = !!(await run(sb.from('group_members').update({name: m.name.trim()}).eq('id', m.id))) && ok;
    }
    for (const m of F.added) ok = !!(await run(sb.rpc('add_member', {p_group: g.id, p_name: m.name, p_email: m.email || null}))) && ok;
    busy(form, false);
    if (ok) { closeSheet(); toast('Group saved'); }
  });
}

function openExpenseSheet(gid, eid){
  const g = S.groups[gid], e = eid ? S.expenses[eid] : null, cur = g.currency, members = membersOf(gid);
  const mode0 = e?.split_mode || 'equal';
  const F = {
    mode: mode0,
    inc: new Set(e && mode0 === 'equal' ? Object.keys(e.split) : members.map(m => m.id)),
    inputs: {exact:{}, percent:{}, shares:{}}
  };
  if (e && mode0 !== 'equal') F.inputs[mode0] = {...(e.split_input || {})};
  const payer = e?.paid_by || myId(gid) || members[0].id;
  openSheet(`<form class="sheet-in" id="eForm" novalidate>${head(e ? 'Edit expense' : 'Add expense')}
    <label class="f">What was it for?<input id="eDesc" maxlength="80" placeholder="Dinner at the beach shack" value="${esc(e?.description || '')}" ${e ? '' : 'autofocus'}></label>
    <div class="grid2">
      <label class="f">Amount (${esc(cur)})<input id="eAmt" class="amount-input" inputmode="decimal" placeholder="0.00" value="${e ? (Number(e.amount) / 100).toFixed(2) : ''}"></label>
      <label class="f">Date<input id="eDate" type="date" value="${esc(e?.date || today())}"></label>
    </div>
    <div class="grid2">
      <label class="f">Paid by<select id="ePaid">${members.map(m => `<option value="${esc(m.id)}"${m.id === payer ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="f">Category<select id="eCat">${CATS.map(c => `<option value="${c[0]}"${(e?.category || 'food') === c[0] ? ' selected' : ''}>${c[1]}</option>`).join('')}</select></label>
    </div>
    <div><div class="f-l">Split</div><div class="seg" id="eMode">
      ${[['equal','Equally'],['exact','Exact'],['percent','Percent'],['shares','Shares']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${F.mode === k}">${l}</button>`).join('')}
    </div></div>
    <div class="split-rows" id="eRows"></div>
    <p class="hint" id="eHint"></p>
    <div class="actions">${e ? '<button type="button" class="btn danger" id="eDel">Delete</button>' : ''}<span class="sp"></span><button class="btn primary" type="submit">Save</button></div>
  </form>`);
  const rows = $('#eRows'), hint = $('#eHint');
  const drawRows = () => {
    const inp = F.inputs[F.mode];
    if (F.mode === 'shares') members.forEach(m => { if (inp[m.id] == null) inp[m.id] = '1'; });
    rows.innerHTML = members.map(m => {
      if (F.mode === 'equal') return `<label class="ms"><input type="checkbox" data-inc="${esc(m.id)}" ${F.inc.has(m.id) ? 'checked' : ''}><span class="nm">${esc(m.name)}</span><span class="share" data-share="${esc(m.id)}"></span></label>`;
      const suf = F.mode === 'exact' ? esc(cur) : F.mode === 'percent' ? '%' : 'shares';
      return `<label class="ms"><span class="nm">${esc(m.name)}</span><input type="text" inputmode="decimal" data-in="${esc(m.id)}" value="${esc(inp[m.id] ?? '')}" placeholder="0" aria-label="${esc(m.name)}"><span class="suf">${suf}</span><span class="share" data-share="${esc(m.id)}" style="min-width:76px;text-align:right"></span></label>`;
    }).join('');
    update();
  };
  const update = () => {
    const r = computeSplit(toCents($('#eAmt').value), F.mode, members, F.inc, F.inputs[F.mode], cur);
    rows.querySelectorAll('[data-share]').forEach(s => {
      const v = r.split ? r.split[s.dataset.share] : null;
      s.textContent = v ? fmt(v, cur) : '';
    });
    hint.className = 'hint ' + (r.error ? 'err' : 'ok');
    hint.textContent = r.error || r.msg || '';
    return r;
  };
  $('#eMode').addEventListener('click', ev => {
    const b = ev.target.closest('[data-mode]'); if (!b) return;
    F.mode = b.dataset.mode;
    $('#eMode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawRows();
  });
  rows.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.inc) { t.checked ? F.inc.add(t.dataset.inc) : F.inc.delete(t.dataset.inc); }
    if (t.dataset.in) F.inputs[F.mode][t.dataset.in] = t.value;
    update();
  });
  $('#eAmt').addEventListener('input', update);
  drawRows();
  if (e) armDelete($('#eDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', e.id), 'Expense deleted')) closeSheet(); });
  $('#eForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const description = $('#eDesc').value.trim();
    if (!description) { hint.className = 'hint err'; hint.textContent = 'Say what the expense was for.'; $('#eDesc').focus(); return; }
    const r = update();
    if (r.error) { $('#eAmt').focus(); return; }
    const row = {group_id: g.id, kind: 'expense', description, amount: toCents($('#eAmt').value), paid_by: $('#ePaid').value, split: r.split,
      split_mode: F.mode, split_input: F.mode === 'equal' ? {} : {...F.inputs[F.mode]},
      category: $('#eCat').value, date: $('#eDate').value || today()};
    busy(ev.target, true);
    const ok = await run(e ? sb.from('expenses').update(row).eq('id', e.id) : sb.from('expenses').insert(row), e ? 'Expense updated' : 'Expense added');
    busy(ev.target, false);
    if (ok) closeSheet();
  });
}

function openSettleSheet(gid, pre = {}){
  const g = S.groups[gid], cur = g.currency, members = membersOf(gid), p = pre.id ? S.expenses[pre.id] : null;
  const me = myId(gid);
  let from = p ? p.paid_by : pre.from, to = p ? Object.keys(p.split)[0] : pre.to;
  if (!from) {
    const tx = simplify(balances(gid));
    const t = tx.find(t => t.from === me) || tx[0];
    if (t) { from = t.from; to = t.to; pre.amount = t.amount; } else { from = me || members[0].id; }
  }
  if (!to) to = members.find(m => m.id !== from)?.id;
  const amt = p ? Number(p.amount) : pre.amount;
  const sel = (id, val) => `<select id="${id}">${members.map(m => `<option value="${esc(m.id)}"${m.id === val ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
  openSheet(`<form class="sheet-in" id="pForm" novalidate>${head(p ? 'Edit payment' : 'Record a payment')}
    <div class="grid2"><label class="f">Who paid${sel('pFrom', from)}</label><label class="f">Paid to${sel('pTo', to)}</label></div>
    <div class="grid2"><label class="f">Amount (${esc(cur)})<input id="pAmt" class="amount-input" inputmode="decimal" placeholder="0.00" value="${amt ? (amt / 100).toFixed(2) : ''}" autofocus></label>
    <label class="f">Date<input id="pDate" type="date" value="${esc(p?.date || today())}"></label></div>
    <p class="hint muted" style="font-weight:500">Record cash, UPI or bank transfers here once the money has actually moved.</p>
    <p class="hint err" id="pHint"></p>
    <div class="actions">${p ? '<button type="button" class="btn danger" id="pDel">Delete</button>' : ''}<span class="sp"></span><button class="btn primary" type="submit">Save payment</button></div>
  </form>`);
  if (p) armDelete($('#pDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', p.id), 'Payment deleted')) closeSheet(); });
  $('#pForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = $('#pFrom').value, t = $('#pTo').value, a = toCents($('#pAmt').value), h = $('#pHint');
    if (f === t) { h.textContent = 'Pick two different people.'; return; }
    if (!(a > 0)) { h.textContent = 'Enter an amount above zero.'; return; }
    const row = {group_id: g.id, kind: 'payment', description: 'Payment', amount: a, paid_by: f, split: {[t]: a},
      split_mode: 'exact', split_input: {}, category: 'other', date: $('#pDate').value || today()};
    busy(ev.target, true);
    const ok = await run(p ? sb.from('expenses').update(row).eq('id', p.id) : sb.from('expenses').insert(row), `Payment of ${fmt(a, cur)} recorded`);
    busy(ev.target, false);
    if (ok) closeSheet();
  });
}

function copySummary(g){
  const tx = simplify(balances(g.id));
  const text = `${g.name}: who owes whom\n` + (tx.length ? tx.map(t => `• ${nameOf(g.id, t.from)} pays ${nameOf(g.id, t.to)} ${fmt(t.amount, g.currency)}`).join('\n') : 'Everyone is settled up.')
    + `\n\nSee the details: ${appUrl()}`;
  const fallback = () => {
    openSheet(`<div class="sheet-in">${head('Copy this summary')}<textarea class="copybox" id="cBox" readonly>${esc(text)}</textarea></div>`);
    const b = $('#cBox'); b.focus(); b.select();
  };
  try { navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into your group chat.'), fallback); } catch { fallback(); }
}

/* ---------- auth ---------- */
async function onAuthSubmit(ev){
  ev.preventDefault();
  const m = S.authMode, hint = $('#aHint'), form = ev.target;
  const email = $('#aEmail').value.trim().toLowerCase(), pass = $('#aPass')?.value || '', name = $('#aName')?.value.trim();
  hint.className = 'hint err'; hint.textContent = '';
  if (m === 'signup' && !name) { hint.textContent = 'Tell us your name so friends recognise you.'; return; }
  if (!validEmail(email)) { hint.textContent = 'Enter a valid email address.'; return; }
  if (m !== 'reset' && pass.length < 6) { hint.textContent = 'Use a password with at least 6 characters.'; return; }
  busy(form, true);
  let res;
  if (m === 'signup') res = await sb.auth.signUp({email, password: pass, options: {data: {name}, emailRedirectTo: appUrl()}});
  else if (m === 'reset') res = await sb.auth.resetPasswordForEmail(email, {redirectTo: appUrl()});
  else res = await sb.auth.signInWithPassword({email, password: pass});
  busy(form, false);
  if (res.error) { hint.textContent = friendly(res.error); return; }
  hint.className = 'hint ok';
  if (m === 'signup' && !res.data.session) hint.textContent = `Check ${email} for a confirmation link, then come back and sign in.`;
  else if (m === 'reset') hint.textContent = `If an account exists for ${email}, a reset link is on its way.`;
}
async function onRecoverySubmit(ev){
  ev.preventDefault();
  const pass = $('#rPass').value, hint = $('#rHint');
  if (pass.length < 6) { hint.textContent = 'Use a password with at least 6 characters.'; return; }
  busy(ev.target, true);
  const {error} = await sb.auth.updateUser({password: pass});
  busy(ev.target, false);
  if (error) { hint.textContent = friendly(error); return; }
  S.recovery = false; toast('Password updated'); render(); boot();
}

/* ---------- events ---------- */
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3600); }

$('#app').addEventListener('click', ev => {
  const au = ev.target.closest('[data-auth]');
  if (au) { S.authMode = au.dataset.auth; render(); $('#aEmail')?.focus(); return; }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, g = S.groups[S.gid];
  if (a === 'open-group') { S.view = 'group'; S.gid = el.dataset.id; S.tab = 'activity'; render(); window.scrollTo(0, 0); }
  else if (a === 'home') { S.view = 'home'; S.gid = null; render(); window.scrollTo(0, 0); }
  else if (a === 'tab') { S.tab = el.dataset.tab; render(); }
  else if (a === 'signout') sb.auth.signOut();
  else if (a === 'new-group') openGroupSheet(null);
  else if (a === 'edit-group') openGroupSheet(S.gid);
  else if (a === 'add-exp') openExpenseSheet(S.gid, null);
  else if (a === 'edit-exp') openExpenseSheet(S.gid, el.dataset.id);
  else if (a === 'edit-pay') openSettleSheet(S.gid, {id: el.dataset.id});
  else if (a === 'settle') openSettleSheet(S.gid, {});
  else if (a === 'record') openSettleSheet(S.gid, {from: el.dataset.from, to: el.dataset.to, amount: +el.dataset.amt});
  else if (a === 'copy' && g) copySummary(g);
});
$('#app').addEventListener('submit', ev => {
  if (ev.target.id === 'authForm') onAuthSubmit(ev);
  else if (ev.target.id === 'recForm') onRecoverySubmit(ev);
});

if (!sb) { render(); return; }
sb.auth.onAuthStateChange((event, session) => {
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (!session) { teardown(); render(); return; }
  render();
  // Defer: calling Supabase inside this callback can deadlock the auth lock.
  if (!S.recovery) setTimeout(boot, 0);
});
})();
