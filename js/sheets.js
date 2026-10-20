// Forms and detail panels that open in the bottom sheet.
import { S, sb, uid, myName, defaultCurrency, run, loadAll, emit, friendly, ls, membersOf, expOf, member, nameOf,
         myId, friendOf, titleOf, personName, avatarUrl, myBalance, groupBalances, friendsIndex } from './state.js';
import { esc, fmt, toMinor, fromMinor, today, niceDate, ago, validEmail, appUrl, curSymbol } from './util.js';
import { computeSplit, computePayers, payersOf, curOf, simplify, pairwise } from './money.js';
import { catOf, categoryOptions, guessCategory, GROUP_TYPES } from './categories.js';
import { icon } from './icons.js';
import { $, toast, openSheet, closeSheet, head, busy, armDelete, avatar, catIcon, payIcon, currencyOptions, resizeImage, copyText } from './ui.js';

const REPEATS = [['never', 'Doesn’t repeat'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
const MODES = [['equal', 'Equally'], ['exact', 'Exact'], ['percent', '%'], ['shares', 'Shares'], ['adjust', '+/−']];
const go = (view, extra = {}) => { Object.assign(S, {view}, extra); emit(); window.scrollTo(0, 0); };

/* ---------- split editor, shared by the group and multi-friend forms ---------- */
// people: [{id, name}]. Renders mode buttons into modeEl and per-person rows into rowsEl.
function splitEditor({modeEl, rowsEl, hintEl, people, mode, inc, inputs, getTotal, getCur}){
  const st = {mode, inc, inputs: {exact: {}, percent: {}, shares: {}, adjust: {}, ...inputs}};
  const ids = people.map(p => p.id);
  modeEl.innerHTML = MODES.map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${st.mode === k}" title="${{equal: 'Split equally', exact: 'Exact amounts', percent: 'By percentage', shares: 'By shares', adjust: 'Equally, with adjustments'}[k]}">${l}</button>`).join('');
  const compute = () => computeSplit(getTotal(), st.mode, ids, st.inc, st.inputs[st.mode] || {}, getCur(), s => toMinor(s, getCur()));
  const update = () => {
    const r = compute();
    rowsEl.querySelectorAll('[data-share]').forEach(s => { const v = r.split ? r.split[s.dataset.share] : null; s.textContent = v ? fmt(v, getCur()) : ''; });
    hintEl.className = 'hint ' + (r.error ? 'err' : 'ok');
    hintEl.textContent = r.error || r.msg || '';
    return r;
  };
  const draw = () => {
    const inp = st.inputs[st.mode] || {};
    if (st.mode === 'shares') ids.forEach(id => { if (inp[id] == null) inp[id] = '1'; });
    rowsEl.innerHTML = people.map(p => {
      const share = `<span class="share" data-share="${esc(p.id)}"></span>`;
      if (st.mode === 'equal') return `<label class="ms"><input type="checkbox" data-inc="${esc(p.id)}" ${st.inc.has(p.id) ? 'checked' : ''}><span class="nm">${esc(p.name)}</span>${share}</label>`;
      if (st.mode === 'adjust') return `<label class="ms"><input type="checkbox" data-inc="${esc(p.id)}" ${st.inc.has(p.id) ? 'checked' : ''}><span class="nm">${esc(p.name)}</span>
        <input type="text" inputmode="decimal" data-in="${esc(p.id)}" value="${esc(inp[p.id] ?? '')}" placeholder="+0" aria-label="Adjustment for ${esc(p.name)}">${share}</label>`;
      const suf = st.mode === 'exact' ? esc(getCur()) : st.mode === 'percent' ? '%' : 'shares';
      return `<label class="ms"><span class="nm">${esc(p.name)}</span><input type="text" inputmode="decimal" data-in="${esc(p.id)}" value="${esc(inp[p.id] ?? '')}" placeholder="0" aria-label="${esc(p.name)}"><span class="suf">${suf}</span>${st.mode === 'exact' ? '' : share}</label>`;
    }).join('') + (st.mode === 'adjust' ? `<p class="hint muted small" style="padding:8px 12px;margin:0">Type extra (+) or less (−) for anyone. The rest is split equally.</p>` : '');
    update();
  };
  modeEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-mode]'); if (!b) return;
    st.mode = b.dataset.mode;
    modeEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  });
  rowsEl.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.inc) { t.checked ? st.inc.add(t.dataset.inc) : st.inc.delete(t.dataset.inc); }
    if (t.dataset.in) (st.inputs[st.mode] ||= {})[t.dataset.in] = t.value;
    update();
  });
  draw();
  return {update, draw, get mode(){ return st.mode; }, get input(){ return st.mode === 'equal' ? {} : {...(st.inputs[st.mode] || {})}; }};
}

/* ---------- add / edit an expense in a group or friend ledger ---------- */
// Full-screen, phone-app style: description and amount up top, a "Paid by you and split equally"
// button that opens the details, and a toolbar for date, repeat, receipt and notes.
const MODE_WORDS = {equal: 'equally', exact: 'by exact amounts', percent: 'by percentages', shares: 'by shares', adjust: 'with adjustments'};
const dayLabel = d => d === today() ? 'Today' : new Date(d + 'T00:00').toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
const sheetBar = (title, save = 'Save') => `<div class="sheet-bar"><button type="button" class="btn ghost icon-btn" data-close aria-label="Close">${icon('x', 22)}</button>
  <b>${title}</b>${save ? `<button class="btn ghost bar-save" type="submit">${save}</button>` : '<span></span>'}</div>`;
export function openExpenseSheet(gid, eid){
  const g = S.groups[gid], e = eid ? S.expenses[eid] : null, members = membersOf(gid);
  const people = members.map(m => ({id: m.id, name: nameOf(gid, m.id)}));
  const multiPay = e?.payers && Object.keys(e.payers).length > 1;
  const payer = e?.paid_by || myId(gid) || members[0].id;
  const cur0 = e ? curOf(e, g) : g.currency;
  const mode0 = e?.split_mode || 'equal';
  const cat0 = e?.category || 'general';
  let catTouched = !!e;
  const withChip = g.is_direct ? `${avatar(titleOf(g), avatarUrl(friendOf(g.id)), 'av tiny')} ${esc(titleOf(g))}` : `${icon(GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users', 15)} All of ${esc(g.name)}`;
  openSheet(`<form class="sheet-in full-form" id="eForm" novalidate>${sheetBar(e ? 'Edit expense' : 'Add an expense')}
    <div class="with-row">With <b>you</b> and: <span class="pchip static">${withChip}</span></div>
    <div class="big-fields">
      <div class="bf"><label class="sq-btn" id="catBtn" title="Category">${catIcon(cat0)}<select id="eCat" aria-label="Category">${categoryOptions(cat0)}</select></label>
        <input id="eDesc" class="line-input" maxlength="80" placeholder="Enter a description" value="${esc(e?.description || '')}" ${e ? '' : 'autofocus'}></div>
      <div class="bf"><label class="sq-btn cur" title="Currency"><span id="curSym">${esc(curSymbol(cur0))}</span><select id="eCur" aria-label="Currency">${currencyOptions(cur0)}</select></label>
        <input id="eAmt" class="line-input amount" inputmode="decimal" placeholder="0.00" value="${e ? fromMinor(Number(e.amount), cur0) : ''}"></div>
      <button type="button" class="pill" id="splitPill"></button>
      <div class="per-person muted small" id="perPerson"></div>
    </div>
    <div id="splitPanel" class="split-panel" hidden>
      <label class="f">Paid by<select id="ePaid">${people.map(p => `<option value="${esc(p.id)}"${!multiPay && p.id === payer ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="__multi"${multiPay ? ' selected' : ''}>Several people…</option></select></label>
      <div id="payBox" ${multiPay ? '' : 'hidden'}><div class="f-l">How much each person paid</div><div class="split-rows" id="payRows"></div><p class="hint" id="payHint"></p></div>
      <div><div class="f-l">Split</div><div class="seg" id="eMode"></div></div>
      <div class="split-rows" id="eRows"></div>
      <button type="button" class="btn sm" id="splitDone" style="align-self:flex-end">Done</button>
    </div>
    <p class="hint" id="eHint"></p>
    <div id="notesBox" ${e?.notes ? '' : 'hidden'}><label class="f">Notes<textarea id="eNotes" rows="3" maxlength="1000" placeholder="What it covered, who booked it…">${esc(e?.notes || '')}</textarea></label></div>
    <div class="muted small" id="rName">${e?.receipt_path ? `${icon('paperclip', 13)} A receipt is attached. <button type="button" class="linkbtn small" id="eReceiptRm">Remove</button>` : ''}</div>
    ${e ? `<button type="button" class="btn danger" id="eDel" style="align-self:flex-start">${icon('trash-2', 16)} Delete expense</button>` : ''}
    <div class="toolbar">
      <label class="tool">${icon('calendar', 18)}<span id="dateLbl">${dayLabel(e?.date || today())}</span><input id="eDate" type="date" value="${esc(e?.date || today())}" aria-label="Date"></label>
      <label class="tool">${icon('repeat', 18)}<span id="repLbl">${e?.repeat && e.repeat !== 'never' ? esc(REPEATS.find(r => r[0] === e.repeat)[1]) : 'Once'}</span><select id="eRep" aria-label="Repeats">${REPEATS.map(([k, l]) => `<option value="${k}"${(e?.repeat || 'never') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="sp"></span>
      <label class="tool icon-only" title="Receipt photo">${icon('camera', 20)}<input type="file" id="eReceipt" accept="image/*" hidden></label>
      <button type="button" class="tool icon-only" id="notesBtn" title="Notes">${icon('notebook-pen', 20)}</button>
    </div>
  </form>`, {full: true});
  const cur = () => $('#eCur').value;
  const total = () => toMinor($('#eAmt').value, cur());
  const editor = splitEditor({
    modeEl: $('#eMode'), rowsEl: $('#eRows'), hintEl: $('#eHint'), people, mode: mode0,
    inc: new Set(e && (mode0 === 'equal' || mode0 === 'adjust') ? Object.keys(e.split) : members.map(m => m.id)),
    inputs: e && mode0 !== 'equal' ? {[mode0]: {...(e.split_input || {})}} : {}, getTotal: total, getCur: cur,
  });
  // Several payers
  const payInputs = multiPay ? Object.fromEntries(Object.entries(e.payers).map(([k, v]) => [k, fromMinor(Number(v), cur0)])) : {};
  const payRows = $('#payRows'), payHint = $('#payHint');
  const drawPay = () => {
    payRows.innerHTML = people.map(p => `<label class="ms"><span class="nm">${esc(p.name)}</span><input type="text" inputmode="decimal" data-pay="${esc(p.id)}" value="${esc(payInputs[p.id] ?? '')}" placeholder="0"><span class="suf">${esc(cur())}</span></label>`).join('');
    updatePay();
  };
  const updatePay = () => {
    if ($('#ePaid').value !== '__multi') return {payers: null};
    const r = computePayers(total(), people.map(p => p.id), payInputs, cur(), s => toMinor(s, cur()));
    payHint.className = 'hint ' + (r.error ? 'err' : 'ok'); payHint.textContent = r.error || 'Payments match the total';
    return r;
  };
  // "Paid by you and split equally" and "(₹300.00/person)"
  const pill = () => {
    const pv = $('#ePaid').value, who = pv === '__multi' ? 'several people' : pv === myId(gid) ? 'you' : nameOf(gid, pv);
    $('#splitPill').innerHTML = `Paid by <b>${esc(who)}</b> and split <b>${MODE_WORDS[editor.mode]}</b>`;
    const r = editor.update(), n = r.split ? Object.keys(r.split).length : 0;
    $('#perPerson').textContent = editor.mode === 'equal' && n && total() > 0 ? `(${fmt(Math.floor(total() / n), cur())}/person)` : '';
  };
  const setCat = k => { $('#catBtn').querySelector('.ico')?.replaceWith(document.createRange().createContextualFragment(catIcon(k))); };
  payRows.addEventListener('input', ev => { if (ev.target.dataset.pay) { payInputs[ev.target.dataset.pay] = ev.target.value; updatePay(); } });
  $('#ePaid').addEventListener('change', () => { $('#payBox').hidden = $('#ePaid').value !== '__multi'; drawPay(); pill(); });
  $('#eAmt').addEventListener('input', () => { pill(); updatePay(); });
  $('#eCur').addEventListener('change', () => { $('#curSym').textContent = curSymbol(cur()); editor.draw(); drawPay(); pill(); });
  $('#eMode').addEventListener('click', () => setTimeout(pill));
  $('#eRows').addEventListener('input', () => setTimeout(pill));
  $('#eCat').addEventListener('change', () => { catTouched = true; setCat($('#eCat').value); });
  $('#eDesc').addEventListener('input', () => { if (catTouched) return; const k = guessCategory($('#eDesc').value); if (k) { $('#eCat').value = k; setCat(k); } });
  $('#splitPill').addEventListener('click', () => { $('#splitPanel').hidden = !$('#splitPanel').hidden; });
  $('#splitDone').addEventListener('click', () => { $('#splitPanel').hidden = true; });
  $('#notesBtn').addEventListener('click', () => { $('#notesBox').hidden = false; $('#eNotes').focus(); });
  $('#eDate').addEventListener('change', () => { $('#dateLbl').textContent = dayLabel($('#eDate').value || today()); });
  $('#eRep').addEventListener('change', () => { const v = $('#eRep').value; $('#repLbl').textContent = v === 'never' ? 'Once' : REPEATS.find(r => r[0] === v)[1]; });
  drawPay(); pill();
  const receipt = {file: null, removed: false};
  $('#eReceipt').addEventListener('change', ev => { receipt.file = ev.target.files[0] || null; if (receipt.file) $('#rName').innerHTML = `${icon('paperclip', 13)} ${esc(receipt.file.name)}`; });
  $('#eReceiptRm')?.addEventListener('click', () => { receipt.removed = true; receipt.file = null; $('#rName').textContent = 'The receipt will be removed when you save.'; });
  if (e) armDelete($('#eDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', e.id), 'Expense deleted. You can restore it from Activity.')) closeSheet(); });
  $('#eForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const hint = $('#eHint');
    const description = $('#eDesc').value.trim();
    if (!description) { hint.className = 'hint err'; hint.textContent = 'Enter a description.'; $('#eDesc').focus(); return; }
    if (!(total() > 0)) { hint.className = 'hint err'; hint.textContent = 'Enter an amount above zero.'; $('#eAmt').focus(); return; }
    const r = editor.update(); if (r.error) { $('#splitPanel').hidden = false; return; }
    const p = updatePay(); if (p.error) { $('#splitPanel').hidden = false; return; }
    const payers = p.payers;
    const paid_by = payers ? Object.entries(payers).sort((a, b) => b[1] - a[1])[0][0] : $('#ePaid').value;
    const row = {group_id: g.id, kind: 'expense', description, amount: total(), paid_by, payers: payers && Object.keys(payers).length > 1 ? payers : null,
      split: r.split, split_mode: editor.mode, split_input: editor.input, category: $('#eCat').value, date: $('#eDate').value || today(),
      currency: cur(), notes: $('#eNotes').value.trim(), repeat: $('#eRep').value};
    busy(ev.target, true);
    const id = e ? e.id : crypto.randomUUID();
    if (receipt.file) {
      try { row.receipt_path = await uploadReceipt(g.id, id, receipt.file); }
      catch (err) { busy(ev.target, false); toast(friendly(err)); return; }
    } else if (receipt.removed) row.receipt_path = null;
    const ok = await run(e ? sb.from('expenses').update(row).eq('id', e.id) : sb.from('expenses').insert({...row, id}), e ? 'Expense updated' : 'Expense added');
    if (ok && e?.receipt_path && (receipt.file || receipt.removed)) sb.storage.from('receipts').remove([e.receipt_path]);
    busy(ev.target, false);
    if (ok) closeSheet();
  });
}

/* ---------- one bill with several friends, outside any group ---------- */
async function ensureLedger(f){
  if (f.ledger) return f.ledger;
  const {data, error} = await sb.rpc('add_friend', {p_my_name: myName(), p_name: f.name, p_email: f.email || null, p_currency: defaultCurrency(), p_friend_user: f.userId || null});
  if (error) throw error;
  return data;
}
export async function openMultiExpenseSheet(keys){
  openSheet(`<div class="sheet-in">${head('Add expense')}<p class="loading">Getting ready…</p></div>`);
  const idx = friendsIndex();
  let friends;
  try {
    friends = [];
    for (const k of keys) { const f = idx.get(k); friends.push({...f, gid: await ensureLedger(f)}); }
    await loadAll();
  } catch (err) { toast(friendly(err)); closeSheet(); return; }
  friends.forEach(f => { f.mymid = myId(f.gid); f.fmid = friendOf(f.gid)?.id; });
  const people = [{id: 'me', name: 'You'}, ...friends.map(f => ({id: f.key, name: f.name}))];
  const cur0 = defaultCurrency();
  let catTouched = false;
  openSheet(`<form class="sheet-in" id="mForm" novalidate>${head(`Add expense with ${friends.length} friends`)}
    <label class="f">What was it for?<input id="mDesc" maxlength="80" placeholder="Dinner" autofocus></label>
    <div class="grid2">
      <label class="f">Amount<input id="mAmt" class="amount-input" inputmode="decimal" placeholder="0.00"></label>
      <label class="f">Currency<select id="mCur">${currencyOptions(cur0)}</select></label>
    </div>
    <div class="grid2">
      <label class="f">Paid by<select id="mPaid">${people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f">Date<input id="mDate" type="date" value="${today()}"></label>
    </div>
    <div><div class="f-l">Split</div><div class="seg" id="mMode"></div></div>
    <div class="split-rows" id="mRows"></div>
    <p class="hint" id="mHint"></p>
    <p class="hint muted small" id="mNote" hidden></p>
    <label class="f">Category<select id="mCat">${categoryOptions('general')}</select></label>
    <label class="f">Notes<textarea id="mNotes" rows="2" maxlength="1000"></textarea></label>
    <div class="actions"><span class="sp"></span><button class="btn primary" type="submit">Save</button></div>
  </form>`);
  const cur = () => $('#mCur').value, total = () => toMinor($('#mAmt').value, cur());
  const editor = splitEditor({modeEl: $('#mMode'), rowsEl: $('#mRows'), hintEl: $('#mHint'), people, mode: 'equal',
    inc: new Set(people.map(p => p.id)), inputs: {}, getTotal: total, getCur: cur});
  const note = () => {
    const p = $('#mPaid').value, n = $('#mNote');
    n.hidden = p === 'me';
    n.textContent = p === 'me' ? '' : `Only your share is recorded with ${people.find(x => x.id === p).name}. What the others owe them stays between them: use a group if you want to track that too.`;
  };
  $('#mPaid').addEventListener('change', note);
  $('#mAmt').addEventListener('input', editor.update);
  $('#mCur').addEventListener('change', editor.draw);
  $('#mCat').addEventListener('change', () => { catTouched = true; });
  $('#mDesc').addEventListener('input', () => { if (catTouched) return; const k = guessCategory($('#mDesc').value); if (k) $('#mCat').value = k; });
  $('#mForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const description = $('#mDesc').value.trim(), hint = $('#mHint');
    if (!description) { hint.className = 'hint err'; hint.textContent = 'Say what the expense was for.'; return; }
    const r = editor.update(); if (r.error) return;
    const payer = $('#mPaid').value, t = total();
    const base = {kind: 'expense', description, split_mode: 'exact', split_input: {}, category: $('#mCat').value, date: $('#mDate').value || today(),
      currency: cur(), notes: $('#mNotes').value.trim(), bill: {total: t, people: people.map(p => p.id === 'me' ? myName() : p.name)}};
    const rows = [];
    if (payer === 'me') {
      for (const f of friends) { const s = r.split[f.key] || 0; if (s > 0) rows.push({...base, group_id: f.gid, amount: s, paid_by: f.mymid, split: {[f.fmid]: s}}); }
    } else {
      const f = friends.find(x => x.key === payer), s = r.split.me || 0;
      if (s > 0) rows.push({...base, group_id: f.gid, amount: s, paid_by: f.fmid, split: {[f.mymid]: s}});
    }
    if (!rows.length) { hint.className = 'hint err'; hint.textContent = 'Nobody owes anyone anything with this split.'; return; }
    busy(ev.target, true);
    const ok = await run(sb.from('expenses').insert(rows), `Added to ${rows.length} ${rows.length === 1 ? 'friend' : 'friends'}`);
    busy(ev.target, false);
    if (ok) closeSheet();
  });
}

/* ---------- pick who an expense is with ---------- */
export function openPickSheet(){
  const friends = [...friendsIndex().values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = Object.values(S.groups).filter(g => !g.is_direct).sort((a, b) => a.name.localeCompare(b.name));
  const b = openSheet(`<div class="sheet-in">${head('Add an expense with…')}
    <div class="list">
      <button class="row" type="button" data-pick="new-friend"><span class="av">${icon('user-plus')}</span><span class="main"><span class="title">A new friend</span><span class="sub">Just the two of you</span></span></button>
      <button class="row" type="button" data-pick="new-group"><span class="av lg">${icon('users')}</span><span class="main"><span class="title">A new group</span><span class="sub">Trip, flat, dinner</span></span></button>
    </div>
    ${friends.length ? `<h3 style="margin:4px 0 -6px">Friends <span class="muted small" style="text-transform:none;letter-spacing:0">· tick one or more</span></h3>
      <div class="list">${friends.map(f => `<label class="row"><input type="checkbox" data-fkey="${esc(f.key)}">
        ${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url)}<span class="main"><span class="title">${esc(f.name)}</span></span></label>`).join('')}</div>
      <button class="btn primary" id="pickGo" type="button" disabled style="justify-content:center">Choose friends above</button>` : ''}
    ${groups.length ? `<h3 style="margin:4px 0 -6px">Groups</h3><div class="list">${groups.map(g => `<button class="row" type="button" data-pick="${esc(g.id)}">
      <span class="av lg">${icon(GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users')}</span><span class="main"><span class="title">${esc(g.name)}</span><span class="sub">${membersOf(g.id).length} people</span></span></button>`).join('')}</div>` : ''}
  </div>`);
  const sel = () => [...b.querySelectorAll('[data-fkey]:checked')].map(x => x.dataset.fkey);
  b.addEventListener('change', () => {
    const btn = $('#pickGo'); if (!btn) return;
    const n = sel().length; btn.disabled = !n;
    btn.textContent = n === 0 ? 'Choose friends above' : n === 1 ? 'Continue with 1 friend' : `Continue with ${n} friends`;
  });
  $('#pickGo')?.addEventListener('click', async () => {
    const keys = sel();
    if (keys.length === 1) {
      try { const gid = await ensureLedger(friendsIndex().get(keys[0])); await loadAll(); openExpenseSheet(gid, null); }
      catch (err) { toast(friendly(err)); }
    } else openMultiExpenseSheet(keys);
  });
  b.querySelectorAll('[data-pick]').forEach(x => x.addEventListener('click', () => {
    const v = x.dataset.pick;
    if (v === 'new-friend') openFriendSheet(null, id => openExpenseSheet(id, null));
    else if (v === 'new-group') openGroupSheet(null);
    else openExpenseSheet(v, null);
  }));
}
export async function expenseWithFriend(key){
  try { const gid = await ensureLedger(friendsIndex().get(key)); await loadAll(); openExpenseSheet(gid, null); }
  catch (err) { toast(friendly(err)); }
}

/* ---------- expense details: shares, notes, comments, history ---------- */
// What changed in an edit, in plain words: "the amount from ₹900.00 to ₹1,200.00", "Bina’s share from …".
function changes(a, gid){
  const o = a.data?.old || {}, n = a.data?.new || {}, out = [];
  const oc = o.currency || S.groups[gid]?.currency || 'INR', nc = n.currency || S.groups[gid]?.currency || 'INR';
  const name = id => { const x = nameOf(gid, id); return x === 'You' ? 'your' : `${x}’s`; };
  const payer = e => { const p = payersOf(e), ks = Object.keys(p); return ks.length > 1 ? `${ks.length} people` : nameOf(gid, ks[0]); };
  if (o.description !== n.description) out.push(`the description from “${esc(o.description)}” to “${esc(n.description)}”`);
  if (Number(o.amount) !== Number(n.amount) || oc !== nc) out.push(`the amount from ${fmt(Number(o.amount), oc)} to ${fmt(Number(n.amount), nc)}`);
  if (o.date !== n.date) out.push(`the date from ${esc(niceDate(o.date))} to ${esc(niceDate(n.date))}`);
  if (o.category !== n.category) out.push(`the category to ${esc(catOf(n.category).label)}`);
  if (o.paid_by !== n.paid_by || JSON.stringify(o.payers) !== JSON.stringify(n.payers)) out.push(`who paid from ${esc(payer(o))} to ${esc(payer(n))}`);
  if (JSON.stringify(o.split) !== JSON.stringify(n.split) && Number(o.amount) === Number(n.amount)) {
    const ids = [...new Set([...Object.keys(o.split || {}), ...Object.keys(n.split || {})])]
      .filter(id => Number(o.split?.[id] || 0) !== Number(n.split?.[id] || 0));
    ids.slice(0, 3).forEach(id => out.push(`${esc(name(id))} share from ${fmt(Number(o.split?.[id] || 0), nc)} to ${fmt(Number(n.split?.[id] || 0), nc)}`));
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
function whoDid(gid, actor){
  if (actor === uid()) return 'You';
  return S.profiles[actor]?.name || membersOf(gid).find(m => m.user_id === actor)?.name || 'Someone';
}
export async function openExpenseDetail(eid){
  const e = S.expenses[eid]; if (!e) return;
  const g = S.groups[e.group_id], cur = curOf(e, g), me = myId(g.id);
  const isPay = e.kind === 'payment';
  const payers = payersOf(e);
  const hist = S.activity.filter(a => a.expense_id === e.id);
  const created = hist.find(a => a.kind === 'expense_added' || a.kind === 'expense_recurring');
  const updated = hist.find(a => a.kind === 'expense_updated');
  const who = id => nameOf(g.id, id), av = id => avatar(personName(member(g.id, id)), avatarUrl(member(g.id, id)), 'av sm');
  const tree = isPay
    ? `<div class="payer">${av(e.paid_by)}<b>${esc(who(e.paid_by))} paid ${esc(who(Object.keys(e.split)[0]))} ${fmt(Number(e.amount), cur)}</b></div>`
    : Object.entries(payers).map(([id, v]) => `<div class="payer">${av(id)}<b>${esc(who(id))} paid ${fmt(Number(v), cur)}</b></div>`).join('')
      + `<div class="tree">${Object.entries(e.split).map(([id, v]) => `<div class="tree-line">${av(id)}<span>${esc(who(id))} ${id === me ? 'owe' : 'owes'} ${fmt(Number(v), cur)}</span></div>`).join('')}</div>`;
  const b = openSheet(`<div class="sheet-in full-form">
    <div class="sheet-bar"><button type="button" class="btn ghost icon-btn" data-close aria-label="Close">${icon('chevron-left', 24)}</button><b>Details</b>
      <span class="actions nowrap"><button class="btn ghost icon-btn" id="dDel" aria-label="Delete">${icon('trash-2', 20)}</button><button class="btn ghost icon-btn" id="dEdit" aria-label="Edit">${icon('pencil', 20)}</button></span></div>
    <div class="detail-head">
      ${isPay ? payIcon() : catIcon(e.category)}
      <div class="dh-main"><div class="dh-title">${esc(isPay ? 'Payment' : e.description)}</div><div class="big num">${fmt(Number(e.amount), cur)}</div>
        <span class="pchip static">${g.is_direct ? `${icon('user', 14)} ${esc(titleOf(g))}` : `${icon(GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users', 14)} ${esc(g.name)}`}</span>
        <div class="muted small">${esc(niceDate(e.date))}</div>
        ${created ? `<div class="muted small">Added by ${esc(whoDid(g.id, created.actor).replace(/^You$/, 'you'))} on ${esc(niceDate(created.created_at.slice(0, 10)))}</div>` : ''}
        ${updated ? `<div class="muted small">Last updated by ${esc(whoDid(g.id, updated.actor).replace(/^You$/, 'you'))} on ${esc(niceDate(updated.created_at.slice(0, 10)))}</div>` : ''}</div>
      ${e.receipt_path ? `<a class="receipt-thumb" id="dReceipt" target="_blank" rel="noopener" aria-label="Open receipt">${icon('receipt', 20)}</a>` : ''}
    </div>
    ${e.repeat && e.repeat !== 'never' ? `<div class="banner ok">${icon('repeat', 15)} Repeats ${esc(REPEATS.find(r => r[0] === e.repeat)[1].toLowerCase())}${e.next_date ? `. Next on ${esc(niceDate(e.next_date))}.` : ''}</div>` : ''}
    ${e.repeat_parent ? `<div class="muted small">${icon('repeat', 13)} Added automatically from a repeating expense.</div>` : ''}
    ${e.bill ? `<div class="muted small">${icon('users', 13)} Part of a ${fmt(Number(e.bill.total), cur)} bill with ${esc((e.bill.people || []).join(', '))}.</div>` : ''}
    <div class="detail-tree">${tree}</div>
    ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ''}
    ${isPay ? '' : categoryChart(g, e, cur)}
    <h3 class="sec-h">${icon('message-square', 14)} Comments</h3>
    <div class="thread" id="cList"><div class="muted small">Loading…</div></div>
    <form id="cForm" class="inline-form comment-box"><label class="f" style="flex:1"><span class="sr">Add a comment</span><input id="cBody" maxlength="1000" placeholder="Add a comment"></label><button class="btn primary" type="submit">${icon('send', 15)}<span class="sr">Post</span></button></form>
  </div>`, {full: true});
  $('#dEdit').addEventListener('click', () => isPay ? openSettleSheet(g.id, {id: e.id}) : openExpenseSheet(g.id, e.id));
  armDelete($('#dDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', e.id), 'Deleted. You can restore it from Activity.')) closeSheet(); }, 'Tap again');
  // Comments and every change to the expense, in one thread, oldest first.
  const loadComments = async () => {
    const [c, h] = await Promise.all([
      sb.from('comments').select('*').eq('expense_id', e.id).order('created_at'),
      sb.from('activity').select('*').eq('expense_id', e.id).order('created_at'),
    ]);
    const list = $('#cList'); if (!list) return;
    if (c.error || h.error) { list.innerHTML = `<div class="muted small">${esc(friendly(c.error || h.error))}</div>`; return; }
    const items = [
      ...c.data.map(x => ({at: x.created_at, html: `<div class="msg${x.user_id === uid() ? ' mine' : ''}">${avatar(x.user_id === uid() ? myName() : whoDid(g.id, x.user_id), S.profiles[x.user_id]?.avatar_url, 'av sm')}
        <div class="bubble"><div class="sub"><b>${esc(whoDid(g.id, x.user_id))}</b> · ${esc(ago(x.created_at))}</div><div class="wrap-text">${esc(x.body)}</div></div>
        ${x.user_id === uid() ? `<button class="btn ghost icon-btn" data-delc="${esc(x.id)}" aria-label="Delete comment">${icon('x', 15)}</button>` : ''}</div>`})),
      ...h.data.filter(a => a.kind !== 'comment').map(a => {
        const who = `<b>${esc(whoDid(g.id, a.actor))}</b>`;
        const text = a.kind === 'expense_added' ? `${who} added this ${isPay ? 'payment' : 'expense'}`
          : a.kind === 'expense_recurring' ? 'Added automatically by a repeating expense'
          : a.kind === 'expense_restored' ? `${who} restored this expense`
          : a.kind === 'expense_updated' ? `${who} changed ${changes(a, g.id)}`
          : `${who} deleted this expense`;
        return {at: a.created_at, html: `<div class="sysmsg">${icon(a.kind === 'expense_updated' ? 'pencil' : a.kind === 'expense_restored' ? 'rotate-ccw' : 'receipt', 13)}<span class="wrap-text">${text} <span class="muted">· ${esc(ago(a.created_at))}</span></span></div>`};
      }),
    ].sort((x, y) => String(x.at).localeCompare(String(y.at)));
    list.innerHTML = items.map(i => i.html).join('') || `<div class="muted small">No comments yet.</div>`;
  };
  b.querySelector('#cList').addEventListener('click', async ev => {
    const x = ev.target.closest('[data-delc]'); if (!x) return;
    if (await run(sb.from('comments').delete().eq('id', x.dataset.delc))) loadComments();
  });
  $('#cForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = $('#cBody').value.trim(); if (!body) return;
    busy(ev.target, true);
    const ok = await run(sb.from('comments').insert({expense_id: e.id, group_id: g.id, body}));
    busy(ev.target, false);
    if (ok) { $('#cBody').value = ''; loadComments(); }
  });
  loadComments();
  if (e.receipt_path) sb.storage.from('receipts').createSignedUrl(e.receipt_path, 3600).then(({data, error}) => {
    const a = $('#dReceipt'); if (!a) return;
    if (error) { a.title = 'Couldn’t load the receipt.'; return; }
    a.href = data.signedUrl; a.innerHTML = `<img src="${esc(data.signedUrl)}" alt="Receipt photo">`;
  });
}
// Spending in this expense's category in this group, for the three months up to it.
function categoryChart(g, e, cur){
  const c = catOf(e.category), end = new Date(e.date + 'T00:00');
  const months = [2, 1, 0].map(k => { const d = new Date(end.getFullYear(), end.getMonth() - k, 1); return {key: d.toISOString().slice(0, 7), label: d.toLocaleDateString(undefined, {month: 'long'}), v: 0}; });
  expOf(g.id).forEach(x => { if (x.kind === 'payment' || catOf(x.category).key !== c.key || curOf(x, g) !== cur) return;
    const m = months.find(mm => mm.key === x.date.slice(0, 7)); if (m) m.v += Number(x.amount); });
  const max = Math.max(1, ...months.map(m => m.v));
  return `<div class="cat-chart"><h3 class="sec-h">Spending by category</h3>
    <div class="muted small">${esc(g.is_direct ? titleOf(g) : g.name)} :: ${esc(c.label)}</div>
    ${months.map(m => `<div class="cc-row"><span>${esc(m.label)}</span><span class="cc-bar" style="--c:var(--c-${c.color})"><i style="width:${(m.v / max * 100).toFixed(1)}%"></i></span><span class="num">${fmt(m.v, cur)}</span></div>`).join('')}</div>`;
}

/* ---------- settle up ---------- */
export function openSettleSheet(gid, pre = {}){
  const g = S.groups[gid], members = membersOf(gid), p = pre.id ? S.expenses[pre.id] : null;
  const me = myId(gid);
  let from = p ? p.paid_by : pre.from, to = p ? Object.keys(p.split)[0] : pre.to, cur = p ? curOf(p, g) : pre.cur, amt = p ? Number(p.amount) : pre.amount;
  if (!from) {
    const all = groupBalances(gid);
    const tx = Object.entries(all).flatMap(([c, b]) => (g.simplify ? simplify(b) : (pairwise(expOf(gid), g)[c] || [])).map(t => ({...t, cur: c})));
    const t = tx.find(t => t.from === me) || tx.find(t => t.to === me) || tx[0];
    if (t) { from = t.from; to = t.to; amt = t.amount; cur = t.cur; } else from = me || members[0].id;
  }
  if (!to) to = members.find(m => m.id !== from)?.id;
  cur = cur || g.currency;
  const sel = (id, val) => `<select id="${id}">${members.map(m => `<option value="${esc(m.id)}"${m.id === val ? ' selected' : ''}>${esc(nameOf(gid, m.id))}</option>`).join('')}</select>`;
  openSheet(`<form class="sheet-in full-form" id="pForm" novalidate>${sheetBar(p ? 'Edit payment' : 'Settle up')}
    <div class="settle-hero" id="pHero"></div>
    <p class="settle-text"><span id="pText"></span> <button type="button" class="linkbtn small" id="pChange">Change</button></p>
    <div class="grid2" id="pPeople" hidden><label class="f">Who paid${sel('pFrom', from)}</label><label class="f">Paid to${sel('pTo', to)}</label></div>
    <div class="big-fields center"><div class="bf"><label class="sq-btn cur" title="Currency"><span id="pSym">${esc(curSymbol(cur))}</span><select id="pCur" aria-label="Currency">${currencyOptions(cur)}</select></label>
      <input id="pAmt" class="line-input amount" inputmode="decimal" placeholder="0.00" value="${amt ? fromMinor(amt, cur) : ''}"></div></div>
    <div id="payLinks"></div>
    <p class="hint muted small" style="text-align:center">Record cash, UPI or bank transfers here once the money has actually moved.</p>
    <p class="hint err" id="pHint"></p>
    ${p ? `<button type="button" class="btn danger" id="pDel" style="align-self:flex-start">${icon('trash-2', 15)} Delete payment</button>` : ''}
    <div class="toolbar">
      <label class="tool">${icon('calendar', 18)}<span id="pDateLbl">${dayLabel(p?.date || today())}</span><input id="pDate" type="date" value="${esc(p?.date || today())}" aria-label="Date"></label>
      <span class="tool static">${icon(g.is_direct ? 'user' : 'users', 18)} ${esc(g.is_direct ? 'No group' : g.name)}</span>
    </div>
  </form>`, {full: true});
  const hero = () => {
    const f = $('#pFrom').value, t = $('#pTo').value, fm = member(gid, f), tm = member(gid, t);
    $('#pHero').innerHTML = `${avatar(personName(fm), avatarUrl(fm), 'av lgc')}<span class="arrow">${icon('arrow-right', 28)}</span>${avatar(personName(tm), avatarUrl(tm), 'av lgc')}`;
    const tn = nameOf(gid, t);
    $('#pText').innerHTML = `<b>${esc(nameOf(gid, f))}</b> paid <b>${esc(tn === 'You' ? 'you' : tn)}</b>`;
  };
  $('#pChange').addEventListener('click', () => { $('#pPeople').hidden = !$('#pPeople').hidden; });
  $('#pDate').addEventListener('change', () => { $('#pDateLbl').textContent = dayLabel($('#pDate').value || today()); });
  $('#pCur').addEventListener('change', () => { $('#pSym').textContent = curSymbol($('#pCur').value); });
  if (p) armDelete($('#pDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', p.id), 'Payment deleted')) closeSheet(); });
  const links = () => {
    hero();
    const box = $('#payLinks'); if (!box) return;
    const f = $('#pFrom').value, t = $('#pTo').value, c = $('#pCur').value, a = toMinor($('#pAmt').value, c);
    const to = member(gid, t), prof = to?.user_id ? S.profiles[to.user_id] : null;
    if (f !== me || !prof || !(a > 0)) { box.innerHTML = ''; return; }
    const amt = fromMinor(a, c), name = personName(to), out = [];
    if (prof.upi_id && c === 'INR') out.push(`<a class="btn primary" href="upi://pay?pa=${encodeURIComponent(prof.upi_id)}&pn=${encodeURIComponent(name)}&am=${amt}&cu=INR&tn=${encodeURIComponent('Evenly: ' + (g.is_direct ? 'settle up' : g.name))}">${icon('smartphone', 16)} Pay ${fmt(a, c)} with UPI</a>`);
    if (prof.paypal_me) out.push(`<a class="btn" target="_blank" rel="noopener" href="https://paypal.me/${encodeURIComponent(prof.paypal_me)}/${amt}${c}">${icon('credit-card', 16)} PayPal</a>`);
    if (prof.venmo && c === 'USD') out.push(`<a class="btn" target="_blank" rel="noopener" href="https://venmo.com/${encodeURIComponent(prof.venmo)}?txn=pay&amount=${amt}&note=${encodeURIComponent('Evenly')}">${icon('credit-card', 16)} Venmo</a>`);
    box.innerHTML = out.length ? `<div class="actions center">${out.join('')}</div><p class="hint muted small" style="text-align:center">Opens your payment app with ${esc(name)}’s details filled in. Come back and tap Save once it’s done.</p>` : '';
    if (prof.upi_id && c === 'INR') box.insertAdjacentHTML('beforeend', `<p class="hint muted small" style="text-align:center">UPI ID: <code>${esc(prof.upi_id)}</code></p>`);
  };
  ['#pFrom', '#pTo', '#pCur'].forEach(sel => $(sel).addEventListener('change', links));
  $('#pAmt').addEventListener('input', links);
  links();
  $('#pForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = $('#pFrom').value, t = $('#pTo').value, c = $('#pCur').value, a = toMinor($('#pAmt').value, c), h = $('#pHint');
    if (f === t) { h.textContent = 'Pick two different people.'; $('#pPeople').hidden = false; return; }
    if (!(a > 0)) { h.textContent = 'Enter an amount above zero.'; return; }
    const row = {group_id: g.id, kind: 'payment', description: 'Payment', amount: a, paid_by: f, payers: null, split: {[t]: a},
      split_mode: 'exact', split_input: {}, category: 'general', currency: c, date: $('#pDate').value || today()};
    busy(ev.target, true);
    const ok = await run(p ? sb.from('expenses').update(row).eq('id', p.id) : sb.from('expenses').insert(row), `Payment of ${fmt(a, c)} recorded`);
    busy(ev.target, false);
    if (ok) closeSheet();
  });
}

/* ---------- restore deleted expenses ---------- */
export function openDeletedSheet(gid){
  const g = S.groups[gid];
  const list = S.activity.filter(a => a.group_id === gid && a.kind === 'expense_deleted' && !S.expenses[a.expense_id]);
  openSheet(`<div class="sheet-in">${head('Recently deleted')}
    <p class="muted small" style="margin:0">Bring back anything deleted by mistake. Balances update as soon as it’s restored.</p>
    <div class="list">${list.map(a => { const e = a.data.old; return `<div class="row static">${e.kind === 'payment' ? payIcon() : catIcon(e.category)}
      <span class="main"><span class="title">${esc(e.kind === 'payment' ? 'Payment' : e.description)}</span><span class="sub">${fmt(Number(e.amount), curOf(e, g))} · deleted by ${esc(whoDid(gid, a.actor))} ${esc(ago(a.created_at))}</span></span>
      <button class="btn sm" data-act="restore" data-id="${a.id}">${icon('rotate-ccw', 15)} Restore</button></div>`; }).join('') || '<div class="row static muted">Nothing to restore.</div>'}</div></div>`);
}
export async function restoreExpense(activityId){
  const ok = await run(sb.rpc('restore_expense', {p_activity: Number(activityId)}), 'Restored');
  if (ok && $('#sheet').open) closeSheet();
}

/* ---------- find people on Evenly by name ---------- */
// Search-as-you-type over Evenly accounts. onPick gets {user, name, avatar} for an account,
// {email, name} for a typed email, or {name} for someone who isn't on Evenly yet.
function personPicker({input, results, onPick, exclude = () => new Set(), inviteLabel}){
  let seq = 0, timer = null, last = [];
  const draw = q => {
    const looksEmail = validEmail(q.toLowerCase());
    const rows = last.filter(p => !exclude().has(p.id)).map((p, i) => `<button type="button" class="row" data-pick-i="${i}">
      ${avatar(p.name, p.avatar_url)}<span class="main"><span class="title">${esc(p.name)}</span>
      <span class="sub">${esc(p.hint)}${p.shared ? ' · in your groups' : ''}</span></span><span class="btn sm primary">Add</span></button>`);
    if (q && looksEmail && !last.length) rows.push(`<button type="button" class="row" data-pick-email>
      <span class="av">${icon('mail')}</span><span class="main"><span class="title">Add ${esc(q)}</span><span class="sub">Not on Evenly yet. They’re connected when they sign up with this email.</span></span></button>`);
    if (q && !looksEmail && q.length >= 2) rows.push(`<button type="button" class="row" data-pick-name>
      <span class="av">${icon('share-2')}</span><span class="main"><span class="title">${inviteLabel(q)}</span><span class="sub">Not on Evenly yet? Send them a link to join.</span></span></button>`);
    results.innerHTML = rows.join('');
    results.hidden = !rows.length;
  };
  const search = async () => {
    const q = input.value.trim(), mine = ++seq;
    if (q.length < 2) { last = []; draw(q); return; }
    const {data, error} = await sb.rpc('search_people', {p_q: q});
    if (mine !== seq) return;          // a newer search has started
    last = error ? [] : data || [];
    draw(q);
    // Say so if search itself failed, rather than looking like nobody matched.
    if (error) results.insertAdjacentHTML('afterbegin', `<div class="row static"><span class="main"><span class="wrap-text neg small">${esc(friendly(error))}</span></span></div>`), results.hidden = false;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); results.querySelector('.row')?.click(); } });
  results.addEventListener('click', e => {
    const r = e.target.closest('.row'); if (!r) return;
    const q = input.value.trim();
    if (r.dataset.pickI != null) { const p = last.filter(x => !exclude().has(x.id))[+r.dataset.pickI]; onPick({user: p.id, name: p.name, avatar: p.avatar_url}); }
    else if ('pickEmail' in r.dataset) { const local = q.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); onPick({email: q.toLowerCase(), name: local.slice(0, 40)}); }
    else if ('pickName' in r.dataset) onPick({name: q.slice(0, 40)});
    input.value = ''; last = []; draw('');
  });
  results.hidden = true;
}

/* ---------- groups ---------- */
function memberTag(m){
  if (m.user_id === uid()) return '<span class="tag on">you</span>';
  if (m.user_id) return '<span class="tag on">joined</span>';
  if (m.email) return '<span class="tag">invited</span>';
  return '<span class="tag">not on Evenly</span>';
}
const usedMembers = gid => {
  const used = new Set();
  expOf(gid).forEach(e => { used.add(e.paid_by); Object.keys(payersOf(e)).forEach(k => used.add(k)); Object.keys(e.split || {}).forEach(k => used.add(k)); });
  return used;
};
export function openGroupSheet(gid){
  const g = gid ? S.groups[gid] : null;
  const used = g ? usedMembers(g.id) : new Set();
  const F = {existing: g ? membersOf(g.id).map(m => ({...m})) : [], added: [], type: g?.type || 'trip'};
  const settled = g ? !Object.values(myBalance(g.id)).some(v => v) : true;
  openSheet(`<form class="sheet-in" id="gForm" novalidate>${head(g ? 'Group settings' : 'New group')}
    <label class="f">Group name<input id="gName" maxlength="60" placeholder="Goa trip, Flat 4B, Friday dinners" value="${esc(g?.name || '')}" ${g ? '' : 'autofocus'}></label>
    <div><div class="f-l">Type</div><div class="seg" id="gType">${GROUP_TYPES.map(([k, l, ic]) => `<button type="button" data-type="${k}" aria-pressed="${F.type === k}">${icon(ic, 15)} ${l}</button>`).join('')}</div></div>
    <label class="f">Default currency<select id="gCur">${currencyOptions(g?.currency || defaultCurrency())}</select></label>
    ${g ? `<label class="switch"><input type="checkbox" id="gSimplify" ${g.simplify ? 'checked' : ''}><span><b>Simplify debts</b><br><span class="muted small">Combine debts so everyone settles with as few payments as possible.</span></span></label>
      <div><div class="f-l">Cover photo</div><div class="cover-edit">${g.cover_url ? `<img src="${esc(g.cover_url)}" alt="">` : `<span class="muted small">No photo yet</span>`}
        <label class="btn sm">${icon('image', 15)} ${g.cover_url ? 'Change' : 'Add photo'}<input type="file" id="gCover" accept="image/*" hidden></label>
        ${g.cover_url ? `<button type="button" class="btn sm ghost" id="gCoverRm">Remove</button>` : ''}</div></div>
      <button type="button" class="btn" id="gInvite">${icon('qr-code', 16)} Invite link and QR code</button>` : ''}
    <div><div class="f-l">People</div><div class="split-rows" id="gMembers"></div></div>
    <label class="f">Add people<input id="gFind" placeholder="Type a name or email" autocomplete="off"></label>
    <div class="list" id="gResults"></div>
    <p class="hint muted small">Find friends who are on Evenly by name. Anyone else can join with the group’s invite link.</p>
    <p class="hint err" id="gHint"></p>
    <div class="actions">
      ${g ? `<button type="button" class="btn" id="gLeave" ${settled ? '' : 'disabled title="Settle up before leaving"'}>${icon('door-open', 15)} Leave</button>` : ''}
      ${g && g.created_by === uid() ? `<button type="button" class="btn danger" id="gDel">${icon('trash-2', 15)} Delete</button>` : ''}
      <span class="sp"></span><button class="btn primary" type="submit">${g ? 'Save' : 'Create group'}</button></div>
    ${g && !settled ? `<p class="hint muted small" style="margin:0">You can leave once your balance in this group is settled.</p>` : ''}
  </form>`);
  $('#gType').addEventListener('click', ev => { const b = ev.target.closest('[data-type]'); if (!b) return; F.type = b.dataset.type; $('#gType').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const list = $('#gMembers'), hint = $('#gHint');
  const draw = () => {
    const meRow = g ? '' : `<div class="ms">${avatar(myName())}<span class="nm">${esc(myName())}</span><span class="tag on">you</span></div>`;
    const ex = F.existing.map((m, i) => m.removed ? '' : `<div class="ms">${avatar(personName(m), avatarUrl(m))}
      <input type="text" value="${esc(m.name)}" data-ex="${i}" aria-label="Name" style="flex:1;width:auto;text-align:left" ${m.user_id ? 'disabled' : ''}>${memberTag(m)}
      ${m.user_id ? '' : `<button type="button" class="btn ghost sm" data-rmex="${i}" ${used.has(m.id) ? 'disabled title="Has expenses in this group"' : ''}>Remove</button>`}</div>`).join('');
    const ad = F.added.map((m, i) => `<div class="ms">${avatar(m.name, m.avatar)}<span class="nm">${esc(m.name)}${m.email ? ` <span class="muted" style="font-weight:500">${esc(m.email)}</span>` : ''}</span>
      ${m.user ? '<span class="tag on">on Evenly</span>' : m.email ? '<span class="tag">invited</span>' : '<span class="tag">needs invite link</span>'}
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
  personPicker({input: $('#gFind'), results: $('#gResults'),
    exclude: () => new Set([uid(), ...F.existing.map(m => m.user_id).filter(Boolean), ...F.added.map(m => m.user).filter(Boolean)]),
    inviteLabel: q => `Add “${esc(q)}” and invite them later`,
    onPick: m => { F.added.push(m); hint.textContent = ''; draw(); $('#gFind').focus(); }});
  if (g) {
    $('#gInvite').addEventListener('click', () => openInviteSheet(g.id));
    $('#gCover').addEventListener('change', async ev => {
      const file = ev.target.files[0]; if (!file) return;
      try {
        toast('Uploading photo…');
        const blob = await resizeImage(file, 1400);
        const path = `${g.id}/cover-${Date.now()}.jpg`;
        const up = await sb.storage.from('covers').upload(path, blob, {contentType: 'image/jpeg', upsert: true});
        if (up.error) throw up.error;
        const url = sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
        if (await run(sb.from('groups').update({cover_url: url}).eq('id', g.id), 'Cover photo updated')) closeSheet();
      } catch (err) { toast(friendly(err)); }
    });
    $('#gCoverRm')?.addEventListener('click', async () => { if (await run(sb.from('groups').update({cover_url: null}).eq('id', g.id), 'Cover photo removed')) closeSheet(); });
    if (settled) armDelete($('#gLeave'), async () => {
      if (await run(sb.rpc('leave_group', {p_group: g.id}), `You left ${g.name}`)) { closeSheet(); go('home'); }
    }, 'Tap again to leave');
    if ($('#gDel')) armDelete($('#gDel'), async () => {
      if (await run(sb.from('groups').delete().eq('id', g.id), 'Group deleted')) { closeSheet(); go('home'); }
    }, 'Tap again: deletes for everyone');
  }
  $('#gForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#gName').value.trim();
    if (!name) { hint.textContent = 'Give the group a name.'; return; }
    const form = e.target; busy(form, true);
    if (!g) {
      const id = await run(sb.rpc('create_group', {p_name: name, p_currency: $('#gCur').value, p_my_name: myName(), p_members: F.added.map(m => ({name: m.name, email: m.email || null, user: m.user || null}))}));
      if (id) {
        await sb.from('groups').update({type: F.type}).eq('id', id);
        await loadAll();
        closeSheet(); go('group', {gid: id, tab: 'expenses'});
        toast('Group created. Share the invite link from group settings.');
      }
      busy(form, false);
      return;
    }
    if (F.existing.some(m => !m.removed && !m.name.trim())) { hint.textContent = 'Everyone needs a name.'; busy(form, false); return; }
    let ok = true;
    const patch = {name, currency: $('#gCur').value, type: F.type, simplify: $('#gSimplify').checked};
    if (Object.entries(patch).some(([k, v]) => g[k] !== v)) ok = !!(await run(sb.from('groups').update(patch).eq('id', g.id))) && ok;
    for (const m of F.existing) {
      const orig = member(g.id, m.id);
      if (m.removed) ok = !!(await run(sb.from('group_members').delete().eq('id', m.id))) && ok;
      else if (orig && !m.user_id && orig.name !== m.name.trim()) ok = !!(await run(sb.from('group_members').update({name: m.name.trim()}).eq('id', m.id))) && ok;
    }
    for (const m of F.added) ok = !!(await run(sb.rpc('add_member', {p_group: g.id, p_name: m.name, p_email: m.email || null, p_user: m.user || null}))) && ok;
    busy(form, false);
    if (ok) { closeSheet(); toast('Saved'); }
  });
}

/* ---------- invite links ---------- */
export const inviteUrl = g => `${appUrl()}#join-${g.invite_code}`;
export function openInviteSheet(gid){
  const g = S.groups[gid], url = inviteUrl(g);
  let svg = '';
  try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({cellSize: 6, margin: 3, scalable: true}); } catch {}
  const who = g.is_direct ? titleOf(g) : g.name;
  openSheet(`<div class="sheet-in">${head(g.is_direct ? `Invite ${esc(who)}` : 'Invite people')}
    <p class="muted" style="margin:0">${g.is_direct ? `Send this to ${esc(who)}. When they open it and sign in, they’ll see everything you’ve shared.` : 'Anyone with this link can join the group after signing in. They can pick their name from the list or join as someone new.'}</p>
    ${svg ? `<div class="qr">${svg}</div>` : ''}
    <div class="actions"><code class="grow" id="invUrl">${esc(url)}</code></div>
    <div class="actions"><button class="btn primary" id="invCopy">${icon('copy', 16)} Copy link</button>
      <button class="btn" id="invShare">${icon('share-2', 16)} Share</button><span class="sp"></span>
      <button class="btn ghost sm" id="invReset">${icon('refresh-cw', 14)} New link</button></div>
    <p class="hint muted small">“New link” stops the old one from working.</p></div>`);
  $('#invCopy').addEventListener('click', () => copyText(url, 'Copy the invite link'));
  $('#invShare').addEventListener('click', async () => {
    const text = g.is_direct ? `Let’s keep track of what we owe each other on Evenly: ${url}` : `Join “${g.name}” on Evenly to split expenses: ${url}`;
    try { if (navigator.share) await navigator.share({title: 'Evenly', text, url}); else copyText(text, 'Copy this message'); } catch {}
  });
  armDelete($('#invReset'), async () => { if (await run(sb.rpc('reset_invite', {p_group: g.id}), 'New link made. The old one no longer works.')) { await loadAll(); openInviteSheet(gid); } });
}
export async function openJoinSheet(code){
  openSheet(`<div class="sheet-in">${head('Joining…')}<p class="loading">Checking the invite…</p></div>`);
  const {data, error} = await sb.rpc('invite_info', {p_code: code});
  S.pendingInvite = null; ls.set('evenly.invite', null);
  if (error) { openSheet(`<div class="sheet-in">${head('Invite')}<p>${esc(friendly(error))}</p></div>`); return; }
  if (!data) { openSheet(`<div class="sheet-in">${head('Invite link expired')}<p>This invite link isn’t valid any more. Ask your friend for a new one.</p></div>`); return; }
  if (data.already_member) { closeSheet(); await loadAll(); go('group', {gid: data.group_id, tab: 'expenses'}); toast('You’re already in this group'); return; }
  const open = data.members.filter(m => !m.joined);
  const title = data.is_direct ? `${esc(data.inviter || 'A friend')} wants to split expenses with you` : `Join ${esc(data.name)}`;
  const b = openSheet(`<form class="sheet-in" id="jForm">${head(title)}
    ${data.is_direct ? `<p class="muted" style="margin:0">You’ll both see the same expenses and balance.</p>` : `<p class="muted" style="margin:0">${data.members.length} people in this group. Are you one of them?</p>`}
    <div class="list">${open.map((m, i) => `<label class="row"><input type="radio" name="jm" value="${esc(m.id)}" ${i === 0 && data.is_direct ? 'checked' : ''}>${avatar(m.name)}<span class="main"><span class="title">I’m ${esc(m.name)}</span></span></label>`).join('')}
      ${data.is_direct ? '' : `<label class="row"><input type="radio" name="jm" value="" ${open.length ? '' : 'checked'}>${avatar(myName())}<span class="main"><span class="title">I’m someone new</span><span class="sub">Join as ${esc(myName())}</span></span></label>`}</div>
    <p class="hint err" id="jHint"></p>
    <div class="actions"><span class="sp"></span><button class="btn primary" type="submit">Join</button></div></form>`);
  $('#jForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const pick = b.querySelector('input[name="jm"]:checked');
    if (!pick) { $('#jHint').textContent = 'Choose who you are.'; return; }
    busy(ev.target, true);
    const {data: gid, error: err} = await sb.rpc('join_group', {p_code: code, p_member: pick.value || null, p_my_name: myName()});
    busy(ev.target, false);
    if (err) { $('#jHint').textContent = friendly(err); return; }
    closeSheet(); await loadAll(); go('group', {gid, tab: 'expenses'});
    toast(data.is_direct ? 'You’re connected' : `Welcome to ${data.name}`);
  });
}

/* ---------- friends ---------- */
export function openFriendSheet(gid, then){
  if (!gid) return openFindFriendSheet(then);
  const g = gid ? S.groups[gid] : null, f = g ? friendOf(g.id) : null;
  const settled = g ? !Object.values(myBalance(g.id)).some(v => v) : true;
  openSheet(`<form class="sheet-in" id="fForm" novalidate>${head(g ? 'Friend settings' : 'Add a friend')}
    <label class="f">Friend’s name<input id="fName" maxlength="40" placeholder="Rahul Mehta" value="${esc(f?.name || '')}" ${f?.user_id ? 'disabled' : 'autofocus'}></label>
    <label class="f">Their email<input id="fEmail" type="email" placeholder="rahul@example.com" value="${esc(f?.email || '')}" ${f?.user_id ? 'disabled' : ''}></label>
    <p class="hint muted small">${f?.user_id ? 'They’re on Evenly and see everything you share.' : 'Their email connects you. If they’re already on Evenly they see your expenses straight away and get notified. If not, everything appears when they sign up with this email.'}</p>
    <label class="f">Default currency<select id="fCur">${currencyOptions(g?.currency || defaultCurrency())}</select></label>
    ${g && !f?.user_id ? `<button type="button" class="btn" id="fInvite">${icon('qr-code', 16)} Invite link for ${esc(f?.name || 'them')}</button>` : ''}
    <p class="hint err" id="fHint"></p>
    <div class="actions">${g ? `<button type="button" class="btn danger" id="fDel" ${settled ? '' : 'disabled title="Settle up first"'}>${icon('trash-2', 15)} Remove friend</button>` : ''}<span class="sp"></span><button class="btn primary" type="submit">${g ? 'Save' : 'Add friend'}</button></div>
    ${g && !settled ? `<p class="hint muted small" style="margin:0">You can remove a friend once you’re settled up.</p>` : ''}
  </form>`);
  $('#fInvite')?.addEventListener('click', () => openInviteSheet(g.id));
  if (g && settled) armDelete($('#fDel'), async () => {
    const ok = g.created_by === uid() ? await run(sb.from('groups').delete().eq('id', g.id), 'Friend removed') : await run(sb.rpc('leave_group', {p_group: g.id}), 'Friend removed');
    if (ok) { closeSheet(); go('home'); }
  });
  $('#fForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const name = $('#fName').value.trim(), email = $('#fEmail').value.trim().toLowerCase(), cur = $('#fCur').value, hint = $('#fHint');
    if (!name) { hint.textContent = 'Enter your friend’s name.'; return; }
    if (!email && !f?.user_id && !g) { hint.textContent = 'Enter their email, so they can see these expenses and get notified.'; $('#fEmail').focus(); return; }
    if (email && !validEmail(email)) { hint.textContent = 'That email doesn’t look right.'; return; }
    if (email && email === (S.session.user.email || '').toLowerCase()) { hint.textContent = 'That’s your own email. Enter your friend’s.'; return; }
    busy(ev.target, true);
    if (!g) {
      const id = await run(sb.rpc('add_friend', {p_my_name: myName(), p_name: name, p_email: email || null, p_currency: cur}));
      busy(ev.target, false);
      if (!id) return;
      closeSheet(); await loadAll();
      if (then) then(id); else go('group', {gid: id, tab: 'expenses'});
      toast(`${name} added`);
      return;
    }
    let ok = true;
    const emailAdded = !f.user_id && email && email !== (f.email || '');
    if (!f.user_id && (name !== f.name || (email || null) !== (f.email || null)))
      ok = !!(await run(sb.from('group_members').update({name, email: email || null}).eq('id', f.id))) && ok;
    if (cur !== g.currency) ok = !!(await run(sb.from('groups').update({currency: cur}).eq('id', g.id))) && ok;
    busy(ev.target, false);
    if (!ok) return;
    closeSheet();
    if (emailAdded) {
      await loadAll();
      const linked = Object.values(S.members).flat().some(m => m.email === email && m.user_id && m.user_id !== uid());
      toast(linked ? `Connected: ${name} can see your expenses now` : `Saved. ${name} will be connected when they sign up with ${email}.`);
    } else toast('Saved');
  });
}

/* ---------- copy balances for a group chat ---------- */
export function copySummary(g){
  const all = groupBalances(g.id);
  const lines = [];
  for (const [cur, b] of Object.entries(all)) {
    const tx = g.simplify ? simplify(b) : (pairwise(expOf(g.id), g)[cur] || []);
    tx.forEach(t => lines.push(`• ${nameOf(g.id, t.from)} ${t.from === myId(g.id) ? 'pay' : 'pays'} ${nameOf(g.id, t.to)} ${fmt(t.amount, cur)}`));
  }
  const text = `${g.is_direct ? `You and ${titleOf(g)}` : g.name}: who owes whom\n` + (lines.join('\n') || 'Everyone is settled up.') + `\n\nSee the details: ${appUrl()}`;
  copyText(text, 'Copy this summary');
}

/* ---------- receipts ---------- */
async function uploadReceipt(gid, expenseId, file){
  const blob = await resizeImage(file, 1800);
  const path = `${gid}/${expenseId}-${Date.now()}.jpg`;
  const {error} = await sb.storage.from('receipts').upload(path, blob, {contentType: 'image/jpeg', upsert: true});
  if (error) throw error;
  return path;
}

/* ---------- reminders ---------- */
export async function sendReminder(gid, mid, amount, cur){
  const ok = await run(sb.rpc('send_reminder', {p_group: gid, p_member: mid, p_amount: Number(amount), p_currency: cur}));
  if (ok) toast(`Reminder sent to ${nameOf(gid, mid)}`);
}

/* ---------- add a friend: search by name ---------- */
function openFindFriendSheet(then){
  openSheet(`<div class="sheet-in">${head('Add a friend')}
    <label class="f">Find your friend<input id="fFind" placeholder="Type their name or email" autocomplete="off" autofocus></label>
    <div class="list" id="fResults"></div>
    <p class="hint muted small" id="fHelp">Search everyone on Evenly by name. Not on Evenly yet? You can send them a link.</p>
    <p class="hint err" id="fHint"></p></div>`);
  const known = new Set([...friendsIndex().values()].filter(f => f.ledger && f.userId).map(f => f.userId));
  personPicker({input: $('#fFind'), results: $('#fResults'),
    exclude: () => new Set([uid()]),
    inviteLabel: q => `Invite “${esc(q)}” with a link`,
    onPick: async m => {
      $('#fHint').textContent = '';
      const {data: id, error} = await sb.rpc('add_friend', {p_my_name: myName(), p_name: m.name, p_email: m.email || null, p_currency: defaultCurrency(), p_friend_user: m.user || null});
      if (error) { $('#fHint').textContent = friendly(error); return; }
      await loadAll();
      if (!m.user && !m.email) {
        // Not on Evenly: show the invite link straight away.
        go('group', {gid: id, tab: 'expenses'}); openInviteSheet(id); return;
      }
      closeSheet();
      if (then) then(id); else go('group', {gid: id, tab: 'expenses'});
      toast(m.user ? (known.has(m.user) ? `You and ${m.name} are already friends` : `Connected with ${m.name}`) : `${m.name} added. They’re connected when they sign up with ${m.email}.`);
    }});
}

/* ---------- search everything ---------- */
export function openSearchSheet(){
  const b = openSheet(`<div class="sheet-in">${head('Search')}
    <input id="qIn" placeholder="Friends, groups or expenses" autocomplete="off" autofocus>
    <div id="qOut"></div></div>`);
  const out = b.querySelector('#qOut');
  const draw = () => {
    const q = $('#qIn').value.trim().toLowerCase();
    if (q.length < 1) { out.innerHTML = ''; return; }
    const friends = [...friendsIndex().values()].filter(f => f.name.toLowerCase().includes(q)).slice(0, 6);
    const groups = Object.values(S.groups).filter(g => !g.is_direct && g.name.toLowerCase().includes(q)).slice(0, 6);
    const exps = Object.values(S.expenses).filter(e => (e.kind === 'payment' ? 'payment' : (e.description || '')).toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q))
      .sort((a, c) => String(c.date).localeCompare(String(a.date))).slice(0, 20);
    const sec = (t, rows) => rows ? `<h3 class="sec-h">${t}</h3><div class="list">${rows}</div>` : '';
    out.innerHTML = sec('Friends', friends.map(f => `<button class="row" data-q-friend="${esc(f.key)}">${avatar(f.name, f.userId && S.profiles[f.userId]?.avatar_url)}<span class="main"><span class="title">${esc(f.name)}</span></span></button>`).join(''))
      + sec('Groups', groups.map(g => `<button class="row" data-q-group="${esc(g.id)}"><span class="av">${icon(GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users')}</span><span class="main"><span class="title">${esc(g.name)}</span></span></button>`).join(''))
      + sec('Expenses', exps.map(e => { const g = S.groups[e.group_id]; return `<button class="row" data-q-exp="${esc(e.id)}">${e.kind === 'payment' ? payIcon() : catIcon(e.category)}<span class="main"><span class="title">${esc(e.kind === 'payment' ? 'Payment' : e.description)}</span><span class="sub">${esc(niceDate(e.date))} · ${esc(g ? titleOf(g) : '')}</span></span><span class="amt"><b>${fmt(Number(e.amount), curOf(e, g))}</b></span></button>`; }).join(''))
      || `<p class="muted">Nothing matches “${esc($('#qIn').value.trim())}”.</p>`;
  };
  $('#qIn').addEventListener('input', draw);
  out.addEventListener('click', ev => {
    const r = ev.target.closest('.row'); if (!r) return;
    if (r.dataset.qFriend) { closeSheet(); document.querySelector('#app').dispatchEvent(new CustomEvent('evenly-open', {detail: {friend: r.dataset.qFriend}})); }
    else if (r.dataset.qGroup) { closeSheet(); go('group', {gid: r.dataset.qGroup, tab: 'expenses'}); }
    else if (r.dataset.qExp) { const e = S.expenses[r.dataset.qExp]; go('group', {gid: e.group_id, tab: 'expenses'}); openExpenseDetail(e.id); }
  });
}

/* ---------- filter the Friends and Groups lists ---------- */
export function openFilterSheet(){
  const opts = [['all', 'All'], ['outstanding', 'Outstanding balances'], ['owe', 'People you owe'], ['owed', 'People who owe you']];
  const b = openSheet(`<div class="sheet-in">${head('Show')}<div class="list">${opts.map(([k, l]) => `<button class="row" data-f="${k}">
    <span class="main"><span class="title">${l}</span></span>${S.filter === k ? `<span class="pos">${icon('check', 18)}</span>` : ''}</button>`).join('')}</div></div>`);
  b.querySelectorAll('[data-f]').forEach(x => x.addEventListener('click', () => { S.filter = x.dataset.f; closeSheet(); emit(); }));
}
