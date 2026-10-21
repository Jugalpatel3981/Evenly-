// Startup, sign-in and every click on the page.
import { S, sb, uid, myName, myProfile, onChange, loadAll, scheduleReload, setToast, friendly, run, ls, loadSnapshot, flushOutbox, isNetworkError } from './state.js';
import { pushStatus, enablePush, disablePush } from './push.js';
import { refreshRates } from './rates.js';
import { validEmail, appUrl } from './util.js';
import { $, toast, initSheet, busy, resizeImage, copyText } from './ui.js';
import { renderSetup, renderAuth, renderRecovery, renderApp } from './views.js';
import { openExpenseSheet, openPickSheet, expenseWithFriend, openExpenseDetail, openSettleSheet, openDeletedSheet,
         restoreExpense, openGroupSheet, openFriendSheet, openJoinSheet, openInviteSheet, copySummary, sendReminder, openSearchSheet, openFilterSheet, openBudgetSheet, exportGroupCsv, downloadBackup } from './sheets.js';

setToast(toast);
initSheet();

function render(){
  const app = $('#app');
  // Keep typing in the whiteboard and settings fields when live updates re-render the page.
  const keep = document.activeElement && ['boardText', 'sName', 'sEmail', 'sPass', 'sDel', 'sUpi', 'sPaypal', 'sVenmo'].includes(document.activeElement.id) ? document.activeElement.id : null;
  if (keep && S.view !== 'home') return;
  if (!sb) app.innerHTML = renderSetup();
  else if (S.recovery) app.innerHTML = renderRecovery();
  else if (!S.session) app.innerHTML = renderAuth();
  else app.innerHTML = renderApp();
}
onChange(render);

/* ---------- invite links: #join-<code> ---------- */
const m = location.hash.match(/^#join-([a-f0-9]{8,32})$/i);
if (m) {
  S.pendingInvite = m[1]; ls.set('evenly.invite', m[1]);
  history.replaceState(null, '', location.pathname + location.search);
}
/* ---------- links from notifications: #open-<expense> or #group-<group> ---------- */
let pendingOpen = null;
function readTarget(hash){
  const t = String(hash || '').match(/#(open|group)-([0-9a-f-]{36})/i);
  return t ? {type: t[1], id: t[2]} : null;
}
pendingOpen = readTarget(location.hash);
if (pendingOpen) history.replaceState(null, '', location.pathname + location.search);
function openTarget(t){
  if (!t || !S.ready) { pendingOpen = t; return; }
  pendingOpen = null;
  if (t.type === 'open' && S.expenses[t.id]) { const e = S.expenses[t.id]; go('group', {gid: e.group_id, tab: 'expenses'}); openExpenseDetail(t.id); }
  else if (t.type === 'group' && S.groups[t.id]) go('group', {gid: t.id, tab: 'expenses'});
  else if (t.type === 'open') { S.homeTab = 'activity'; go('home'); toast('That expense has been deleted.'); }
}
// A tapped notification while Evenly is already open: the service worker hands over the link.
navigator.serviceWorker?.addEventListener('message', ev => { if (ev.data?.type === 'open') openTarget(readTarget(ev.data.url)); });
window.addEventListener('hashchange', () => { const t = readTarget(location.hash); if (t) { history.replaceState(null, '', location.pathname); openTarget(t); } });

async function refreshPush(){ S.pushStatus = await pushStatus(); render(); }
async function markRead(){
  if (!S.notifications.some(n => !n.read_at)) return;
  const at = new Date().toISOString();
  S.notifications.forEach(n => { if (!n.read_at) n.read_at = at; });
  render();
  await sb.from('notifications').update({read_at: at}).is('read_at', null);
}

/* ---------- boot after sign-in ---------- */
let booted = null, channel = null;
async function boot(){
  if (booted === uid()) return;
  booted = uid(); S.ready = false; render();
  try { await sb.rpc('claim_invites'); } catch {}
  try {
    await flushOutbox();
    await loadAll();
    if (!myProfile()) {
      await sb.from('profiles').upsert({id: uid(), name: myName()}, {onConflict: 'id', ignoreDuplicates: true});
    }
    const {data: made} = await sb.rpc('process_recurring');
    if (made || !myProfile()) await loadAll();
  } catch (err) {
    // No connection: open with the copy saved on this device.
    if (isNetworkError(err) && loadSnapshot()) toast('You’re offline. Showing your last saved balances.');
    else toast(friendly(err));
  }
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('evenly-' + uid())
    .on('postgres_changes', {event: '*', schema: 'public'}, scheduleReload)
    .subscribe();
  refreshPush();
  refreshRates().then(r => { if (r) render(); });
  if (S.pendingInvite) openJoinSheet(S.pendingInvite);
  else if (pendingOpen) openTarget(pendingOpen);
}
function teardown(){
  booted = null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  Object.assign(S, {groups: {}, members: {}, expenses: {}, profiles: {}, activity: [], ready: false, view: 'home', gid: null});
}

/* ---------- auth forms ---------- */
// Google sign-in leaves for Google and comes back here. If something went wrong, the reason is in the address.
const oauthError = (() => {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const msg = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  if (msg) history.replaceState(null, '', location.pathname);
  return msg ? msg.replace(/\+/g, ' ') : null;
})();
async function signInWithGoogle(btn){
  btn.disabled = true;
  const {error} = await sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: appUrl(), queryParams: {prompt: 'select_account'}}});
  if (error) { btn.disabled = false; const h = $('#aHint'); h.className = 'hint err'; h.textContent = friendly(error); }
}
async function onAuthSubmit(ev){
  ev.preventDefault();
  const mode = S.authMode, hint = $('#aHint'), form = ev.target;
  const email = $('#aEmail').value.trim().toLowerCase(), pass = $('#aPass')?.value || '', name = $('#aName')?.value.trim();
  hint.className = 'hint err'; hint.textContent = '';
  if (mode === 'signup' && !name) { hint.textContent = 'Tell us your name so friends recognise you.'; return; }
  if (!validEmail(email)) { hint.textContent = 'Enter a valid email address.'; return; }
  if (mode !== 'reset' && pass.length < 6) { hint.textContent = 'Use a password with at least 6 characters.'; return; }
  busy(form, true);
  let res;
  if (mode === 'signup') res = await sb.auth.signUp({email, password: pass, options: {data: {name}, emailRedirectTo: appUrl()}});
  else if (mode === 'reset') res = await sb.auth.resetPasswordForEmail(email, {redirectTo: appUrl()});
  else res = await sb.auth.signInWithPassword({email, password: pass});
  busy(form, false);
  if (res.error) { hint.textContent = friendly(res.error); return; }
  hint.className = 'hint ok';
  if (mode === 'signup' && !res.data.session) hint.textContent = `Check ${email} for a confirmation link, then come back and sign in.`;
  else if (mode === 'reset') hint.textContent = `If an account exists for ${email}, a reset link is on its way.`;
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

/* ---------- settings forms ---------- */
async function onSettingsSubmit(id, ev){
  ev.preventDefault();
  const form = ev.target;
  if (id === 'nameForm') {
    const name = $('#sName').value.trim();
    if (!name) return toast('Enter your name.');
    busy(form, true);
    const ok = await run(sb.rpc('update_my_name', {p_name: name}), 'Name updated');
    if (ok) await sb.auth.updateUser({data: {name}});
    busy(form, false);
  } else if (id === 'emailForm') {
    const email = $('#sEmail').value.trim().toLowerCase();
    if (!validEmail(email)) return toast('Enter a valid email address.');
    busy(form, true);
    const {error} = await sb.auth.updateUser({email}, {emailRedirectTo: appUrl()});
    busy(form, false);
    toast(error ? friendly(error) : `Check ${email} (and your current inbox) for a confirmation link.`);
    if (!error) $('#sEmail').value = '';
  } else if (id === 'passForm') {
    const pass = $('#sPass').value;
    if (pass.length < 6) return toast('Use a password with at least 6 characters.');
    busy(form, true);
    const {error} = await sb.auth.updateUser({password: pass});
    busy(form, false);
    toast(error ? friendly(error) : 'Password changed');
    if (!error) $('#sPass').value = '';
  } else if (id === 'deleteForm') {
    if ($('#sDel').value.trim() !== 'DELETE') return toast('Type DELETE in capitals to confirm.');
    busy(form, true);
    const {error} = await sb.rpc('delete_my_account');
    busy(form, false);
    if (error) return toast(friendly(error));
    await sb.auth.signOut();
    toast('Your account has been deleted');
  } else if (id === 'payForm') {
    const upi = $('#sUpi').value.trim(), paypal = $('#sPaypal').value.trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, ''), venmo = $('#sVenmo').value.trim().replace(/^@/, '');
    if (upi && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(upi)) return toast('A UPI ID looks like name@bank, for example jugal@okaxis.');
    if (paypal && !/^[A-Za-z0-9]{1,40}$/.test(paypal)) return toast('Enter just your PayPal.me username, letters and numbers only.');
    if (venmo && !/^[A-Za-z0-9_-]{1,40}$/.test(venmo)) return toast('Enter just your Venmo username, without the @.');
    busy(form, true);
    await run(sb.from('profiles').upsert({id: uid(), name: myName(), upi_id: upi || null, paypal_me: paypal || null, venmo: venmo || null}, {onConflict: 'id'}), 'Payment details saved');
    busy(form, false);
  } else if (id === 'boardForm') {
    const g = S.groups[S.gid]; if (!g) return;
    busy(form, true);
    await run(sb.from('groups').update({whiteboard: $('#boardText').value}).eq('id', g.id), 'Whiteboard saved');
    busy(form, false);
    document.activeElement?.blur();
  }
}
async function onAvatar(file){
  try {
    toast('Uploading photo…');
    const blob = await resizeImage(file, 480);
    const path = `${uid()}/avatar-${Date.now()}.jpg`;
    const up = await sb.storage.from('avatars').upload(path, blob, {contentType: 'image/jpeg', upsert: true});
    if (up.error) throw up.error;
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    await run(sb.from('profiles').upsert({id: uid(), name: myName(), avatar_url: url}, {onConflict: 'id'}), 'Photo updated');
  } catch (err) { toast(friendly(err)); }
}

/* ---------- light / dark ---------- */
function setTheme(t){
  ls.set('evenly.theme', t === 'system' ? null : t);
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  // Keep the phone's status bar colour in step.
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1412' : '#0e6650');
  render();
}

/* ---------- back online ---------- */
window.addEventListener('online', async () => { if (!S.session) return; await flushOutbox(); loadAll().catch(() => {}); });
window.addEventListener('offline', () => { if (S.session) { S.offline = true; render(); } });

/* ---------- clicks ---------- */
const go = (view, extra = {}) => { Object.assign(S, {view}, extra); render(); window.scrollTo(0, 0); };
function openFriend(key){
  const ledger = Object.values(S.groups).find(x => x.is_direct && (S.members[x.id] || []).some(mm => mm.user_id !== uid() &&
    (key === 'u:' + mm.user_id || key === 'e:' + (mm.email || '').toLowerCase() || key === 'd:' + x.id)));
  ledger ? go('group', {gid: ledger.id, tab: 'expenses'}) : go('friend', {fkey: key});
}
// The search sheet asks for a friend's page this way.
$('#app').addEventListener('evenly-open', ev => { if (ev.detail?.friend) openFriend(ev.detail.friend); });
$('#app').addEventListener('click', ev => {
  const gg = ev.target.closest('[data-auth-google]');
  if (gg) { signInWithGoogle(gg); return; }
  const au = ev.target.closest('[data-auth]');
  if (au) { S.authMode = au.dataset.auth; render(); $('#aEmail')?.focus(); return; }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, g = S.groups[S.gid];
  switch (a) {
    case 'open-group': go('group', {gid: el.dataset.id, tab: 'expenses'}); break;
    case 'open-friend': openFriend(el.dataset.key); break;
    case 'home': if (S.view === 'spending') { S.homeTab = 'account'; go('home'); break; }
      S.homeTab = g?.is_direct || S.view === 'friend' ? 'friends' : S.view === 'group' ? 'groups' : S.homeTab; go('home'); break;
    case 'home-tab': S.homeTab = el.dataset.tab; if (S.homeTab !== 'account') ls.set('evenly.homeTab', S.homeTab); go('home'); if (S.homeTab === 'activity' && S.actTab === 'foryou') markRead(); break;
    case 'act-tab': S.actTab = el.dataset.tab; render(); if (S.actTab === 'foryou') markRead(); break;
    case 'search': openSearchSheet(); break;
    case 'filter': openFilterSheet(); break;
    case 'tab': S.tab = el.dataset.tab; render(); break;
    case 'settings': S.homeTab = 'account'; go('home'); break;
    case 'notifications': S.homeTab = 'activity'; S.actTab = 'foryou'; go('home'); markRead(); break;
    case 'push-on': enablePush().then(() => { ls.set('evenly.pushAsked', '1'); toast('Notifications are on for this device'); }, err => toast(friendly(err))).finally(refreshPush); break;
    case 'push-off': disablePush().then(() => toast('Notifications are off for this device'), err => toast(friendly(err))).finally(refreshPush); break;
    case 'push-later': ls.set('evenly.pushAsked', '1'); render(); break;
    case 'theme': setTheme(el.dataset.theme); break;
    case 'spending': S.spendMonth = null; go('spending'); break;
    case 'spend-month': { const [y, m] = (S.spendMonth || '').split('-').map(Number), d = y ? new Date(y, m - 1, 1) : new Date();
      d.setDate(1); d.setMonth(d.getMonth() + Number(el.dataset.step)); S.spendMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; render(); break; }
    case 'budget': openBudgetSheet(el.dataset.key); break;
    case 'export': exportGroupCsv(el.dataset.id); break;
    case 'backup': downloadBackup(); break;
    case 'invite': openInviteSheet(el.dataset.id); break;
    case 'remind': sendReminder(el.dataset.gid, el.dataset.member, el.dataset.amt, el.dataset.cur); break;
    case 'signout': sb.auth.signOut(); break;
    case 'copy-app': copyText(location.origin, 'Copy the Evenly link'); break;
    case 'remove-avatar': run(sb.from('profiles').update({avatar_url: null}).eq('id', uid()), 'Photo removed'); break;
    case 'new-group': openGroupSheet(null); break;
    case 'edit-group': openGroupSheet(S.gid); break;
    case 'new-friend': openFriendSheet(null); break;
    case 'edit-friend': openFriendSheet(S.gid); break;
    case 'pick-exp': openPickSheet(); break;
    case 'friend-exp': expenseWithFriend(el.dataset.key); break;
    case 'add-exp': openExpenseSheet(S.gid, null); break;
    case 'open-exp': openExpenseDetail(el.dataset.id); break;
    case 'settle': openSettleSheet(S.gid, {}); break;
    case 'record': openSettleSheet(S.gid, {from: el.dataset.from, to: el.dataset.to, amount: +el.dataset.amt, cur: el.dataset.cur}); break;
    case 'deleted': openDeletedSheet(S.gid); break;
    case 'restore': restoreExpense(el.dataset.id); break;
    case 'copy': if (g) copySummary(g); break;
  }
});
// Restore buttons also live inside sheets.
$('#sheetBody').addEventListener('click', ev => {
  const el = ev.target.closest('[data-act="restore"]'); if (el) restoreExpense(el.dataset.id);
});
$('#app').addEventListener('submit', ev => {
  const id = ev.target.id;
  if (id === 'authForm') onAuthSubmit(ev);
  else if (id === 'recForm') onRecoverySubmit(ev);
  else if (['nameForm', 'emailForm', 'passForm', 'deleteForm', 'boardForm', 'payForm'].includes(id)) onSettingsSubmit(id, ev);
});
$('#app').addEventListener('change', ev => {
  if (ev.target.id === 'avatarFile' && ev.target.files[0]) onAvatar(ev.target.files[0]);
  if (ev.target.id === 'sEmailNotes') run(sb.from('profiles').upsert({id: uid(), name: myName(), notify_email: ev.target.checked}, {onConflict: 'id'}), ev.target.checked ? 'Email notifications on' : 'Email notifications off');
  if (ev.target.id === 'sCur') run(sb.from('profiles').upsert({id: uid(), name: myName(), default_currency: ev.target.value}, {onConflict: 'id'}), 'Default currency saved');
});

/* ---------- start ---------- */
if (oauthError) toast(`Google sign-in didn’t finish: ${friendly(oauthError)}`);
if (!sb) render();
else sb.auth.onAuthStateChange((event, session) => {
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (!session) { teardown(); render(); return; }
  render();
  // Defer: calling Supabase inside this callback can deadlock the auth lock.
  if (!S.recovery) setTimeout(boot, 0);
});
