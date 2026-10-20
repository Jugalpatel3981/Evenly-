// Startup, sign-in and every click on the page.
import { S, sb, uid, myName, myProfile, onChange, loadAll, scheduleReload, setToast, friendly, run, ls } from './state.js';
import { validEmail, appUrl } from './util.js';
import { $, toast, initSheet, busy, resizeImage, copyText } from './ui.js';
import { renderSetup, renderAuth, renderRecovery, renderApp } from './views.js';
import { openExpenseSheet, openPickSheet, expenseWithFriend, openExpenseDetail, openSettleSheet, openDeletedSheet,
         restoreExpense, openGroupSheet, openFriendSheet, openJoinSheet, copySummary } from './sheets.js';

setToast(toast);
initSheet();

function render(){
  const app = $('#app');
  // Keep typing in the whiteboard and settings fields when live updates re-render the page.
  const keep = document.activeElement && ['boardText', 'sName', 'sEmail', 'sPass', 'sDel'].includes(document.activeElement.id) ? document.activeElement.id : null;
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

/* ---------- boot after sign-in ---------- */
let booted = null, channel = null;
async function boot(){
  if (booted === uid()) return;
  booted = uid(); S.ready = false; render();
  try { await sb.rpc('claim_invites'); } catch {}
  try {
    await loadAll();
    if (!myProfile()) {
      await sb.from('profiles').upsert({id: uid(), name: myName()}, {onConflict: 'id', ignoreDuplicates: true});
    }
    const {data: made} = await sb.rpc('process_recurring');
    if (made || !myProfile()) await loadAll();
  } catch (err) { toast(friendly(err)); }
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('evenly-' + uid())
    .on('postgres_changes', {event: '*', schema: 'public'}, scheduleReload)
    .subscribe();
  if (S.pendingInvite) openJoinSheet(S.pendingInvite);
}
function teardown(){
  booted = null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  Object.assign(S, {groups: {}, members: {}, expenses: {}, profiles: {}, activity: [], ready: false, view: 'home', gid: null});
}

/* ---------- auth forms ---------- */
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

/* ---------- clicks ---------- */
const go = (view, extra = {}) => { Object.assign(S, {view}, extra); render(); window.scrollTo(0, 0); };
$('#app').addEventListener('click', ev => {
  const au = ev.target.closest('[data-auth]');
  if (au) { S.authMode = au.dataset.auth; render(); $('#aEmail')?.focus(); return; }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, g = S.groups[S.gid];
  switch (a) {
    case 'open-group': go('group', {gid: el.dataset.id, tab: 'expenses'}); break;
    case 'open-friend': {
      const key = el.dataset.key;
      const ledger = Object.values(S.groups).find(x => x.is_direct && (S.members[x.id] || []).some(mm => mm.user_id !== uid() &&
        (key === 'u:' + mm.user_id || key === 'e:' + (mm.email || '').toLowerCase() || key === 'd:' + x.id)));
      ledger ? go('group', {gid: ledger.id, tab: 'expenses'}) : go('friend', {fkey: key});
      break;
    }
    case 'home': S.homeTab = g?.is_direct || S.view === 'friend' ? 'friends' : S.view === 'group' ? 'groups' : S.homeTab; go('home'); break;
    case 'home-tab': S.homeTab = el.dataset.tab; ls.set('evenly.homeTab', S.homeTab); render(); break;
    case 'tab': S.tab = el.dataset.tab; render(); break;
    case 'settings': go('settings'); break;
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
  else if (['nameForm', 'emailForm', 'passForm', 'deleteForm', 'boardForm'].includes(id)) onSettingsSubmit(id, ev);
});
$('#app').addEventListener('change', ev => {
  if (ev.target.id === 'avatarFile' && ev.target.files[0]) onAvatar(ev.target.files[0]);
  if (ev.target.id === 'sCur') run(sb.from('profiles').upsert({id: uid(), name: myName(), default_currency: ev.target.value}, {onConflict: 'id'}), 'Default currency saved');
});

/* ---------- start ---------- */
if (!sb) render();
else sb.auth.onAuthStateChange((event, session) => {
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (!session) { teardown(); render(); return; }
  render();
  // Defer: calling Supabase inside this callback can deadlock the auth lock.
  if (!S.recovery) setTimeout(boot, 0);
});
