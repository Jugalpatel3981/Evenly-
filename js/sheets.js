// Forms and detail panels that open in the bottom sheet.
import { S, sb, uid, myName, defaultCurrency, run, loadAll, emit, friendly, ls, membersOf, expOf, member, nameOf,
         myId, friendOf, titleOf, personName, avatarUrl, myBalance, groupBalances, friendsIndex } from './state.js';
import { esc, fmt, toMinor, fromMinor, today, niceDate, ago, validEmail, appUrl } from './util.js';
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
export function openExpenseSheet(gid, eid){
  const g = S.groups[gid], e = eid ? S.expenses[eid] : null, members = membersOf(gid);
  const people = members.map(m => ({id: m.id, name: nameOf(gid, m.id)}));
  const multiPay = e?.payers && Object.keys(e.payers).length > 1;
  const payer = e?.paid_by || myId(gid) || members[0].id;
  const cur0 = e ? curOf(e, g) : g.currency;
  const mode0 = e?.split_mode || 'equal';
  let catTouched = !!e;
  openSheet(`<form class="sheet-in" id="eForm" novalidate>${head(e ? 'Edit expense' : `Add expense ${g.is_direct ? 'with ' + esc(titleOf(g)) : 'in ' + esc(g.name)}`)}
    <label class="f">What was it for?<input id="eDesc" maxlength="80" placeholder="Dinner at the beach shack" value="${esc(e?.description || '')}" ${e ? '' : 'autofocus'}></label>
    <div class="grid2">
      <label class="f">Amount<input id="eAmt" class="amount-input" inputmode="decimal" placeholder="0.00" value="${e ? fromMinor(Number(e.amount), cur0) : ''}"></label>
      <label class="f">Currency<select id="eCur">${currencyOptions(cur0)}</select></label>
    </div>
    <div class="grid2">
      <label class="f">Paid by<select id="ePaid">${people.map(p => `<option value="${esc(p.id)}"${!multiPay && p.id === payer ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="__multi"${multiPay ? ' selected' : ''}>Several people…</option></select></label>
      <label class="f">Date<input id="eDate" type="date" value="${esc(e?.date || today())}"></label>
    </div>
    <div id="payBox" ${multiPay ? '' : 'hidden'}><div class="f-l">How much each person paid</div><div class="split-rows" id="payRows"></div><p class="hint" id="payHint"></p></div>
    <div><div class="f-l">Split</div><div class="seg" id="eMode"></div></div>
    <div class="split-rows" id="eRows"></div>
    <p class="hint" id="eHint"></p>
    <div class="grid2">
      <label class="f">Category<select id="eCat">${categoryOptions(e?.category || 'general')}</select></label>
      <label class="f">Repeats<select id="eRep">${REPEATS.map(([k, l]) => `<option value="${k}"${(e?.repeat || 'never') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="f">Notes<textarea id="eNotes" rows="2" maxlength="1000" placeholder="Optional: what it covered, who booked it…">${esc(e?.notes || '')}</textarea></label>
    <div><div class="f-l">Receipt photo</div><div class="cover-edit" id="rBox"><span class="muted small" id="rName">${e?.receipt_path ? 'A receipt is attached' : 'No photo'}</span>
      <label class="btn sm">${icon('paperclip', 15)} ${e?.receipt_path ? 'Replace' : 'Attach'}<input type="file" id="eReceipt" accept="image/*" hidden></label>
      ${e?.receipt_path ? `<button type="button" class="btn sm ghost" id="eReceiptRm">Remove</button>` : ''}</div></div>
    <div class="actions">${e ? `<button type="button" class="btn danger" id="eDel">${icon('trash-2', 16)} Delete</button>` : ''}<span class="sp"></span><button class="btn primary" type="submit">Save</button></div>
  </form>`);
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
  payRows.addEventListener('input', ev => { if (ev.target.dataset.pay) { payInputs[ev.target.dataset.pay] = ev.target.value; updatePay(); } });
  $('#ePaid').addEventListener('change', () => { $('#payBox').hidden = $('#ePaid').value !== '__multi'; drawPay(); });
  $('#eAmt').addEventListener('input', () => { editor.update(); updatePay(); });
  $('#eCur').addEventListener('change', () => { editor.draw(); drawPay(); });
  $('#eCat').addEventListener('change', () => { catTouched = true; });
  $('#eDesc').addEventListener('input', () => { if (catTouched) return; const k = guessCategory($('#eDesc').value); if (k) $('#eCat').value = k; });
  drawPay();
  const receipt = {file: null, removed: false};
  $('#eReceipt').addEventListener('change', ev => { receipt.file = ev.target.files[0] || null; if (receipt.file) $('#rName').textContent = receipt.file.name; });
  $('#eReceiptRm')?.addEventListener('click', ev => { receipt.removed = true; receipt.file = null; $('#rName').textContent = 'Will be removed when you save'; ev.target.remove(); });
  if (e) armDelete($('#eDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', e.id), 'Expense deleted. You can restore it from Activity.')) closeSheet(); });
  $('#eForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const hint = $('#eHint');
    const description = $('#eDesc').value.trim();
    if (!description) { hint.className = 'hint err'; hint.textContent = 'Say what the expense was for.'; $('#eDesc').focus(); return; }
    const r = editor.update(); if (r.error) { $('#eAmt').focus(); return; }
    const p = updatePay(); if (p.error) return;
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
function changes(a){
  const o = a.data?.old || {}, n = a.data?.new || {};
  const out = [];
  if (o.description !== n.description) out.push(`description to “${esc(n.description)}”`);
  if (Number(o.amount) !== Number(n.amount) || o.currency !== n.currency) out.push(`amount from ${fmt(Number(o.amount), o.currency || 'INR')} to ${fmt(Number(n.amount), n.currency || 'INR')}`);
  if (o.date !== n.date) out.push(`date to ${esc(niceDate(n.date))}`);
  if (o.category !== n.category) out.push(`category to ${esc(catOf(n.category).label)}`);
  if (JSON.stringify(o.split) !== JSON.stringify(n.split)) out.push('the split');
  if (o.paid_by !== n.paid_by || JSON.stringify(o.payers) !== JSON.stringify(n.payers)) out.push('who paid');
  if (o.notes !== n.notes) out.push('the notes');
  if (o.repeat !== n.repeat) out.push(n.repeat === 'never' ? 'it to stop repeating' : `it to repeat ${n.repeat}`);
  return out.length ? out.join(', ') : 'details';
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
  const created = S.activity.find(a => a.expense_id === e.id && (a.kind === 'expense_added' || a.kind === 'expense_recurring'));
  const lines = isPay
    ? `<div class="row static">${payIcon()}<span class="main"><span class="title">${esc(nameOf(g.id, e.paid_by))} paid ${esc(nameOf(g.id, Object.keys(e.split)[0]))}</span></span><span class="amt"><b>${fmt(Number(e.amount), cur)}</b></span></div>`
    : Object.entries(payers).map(([id, v]) => `<div class="row static">${avatar(personName(member(g.id, id)), avatarUrl(member(g.id, id)))}<span class="main"><span class="title">${esc(nameOf(g.id, id))} paid ${fmt(Number(v), cur)}</span></span></div>`).join('')
      + Object.entries(e.split).map(([id, v]) => `<div class="row static indent">${avatar(personName(member(g.id, id)), avatarUrl(member(g.id, id)))}<span class="main"><span class="title">${esc(nameOf(g.id, id))} ${id === me ? 'owe' : 'owes'} ${fmt(Number(v), cur)}</span></span></div>`).join('');
  const b = openSheet(`<div class="sheet-in">${head(isPay ? 'Payment' : esc(e.description))}
    <div class="detail-top">${isPay ? payIcon() : catIcon(e.category)}<div><div class="big num">${fmt(Number(e.amount), cur)}</div>
      <div class="muted small">${esc(niceDate(e.date))}${isPay ? '' : ` · ${esc(catOf(e.category).label)}`} · ${esc(g.is_direct ? 'with ' + titleOf(g) : g.name)}</div>
      ${created ? `<div class="muted small">Added by ${esc(whoDid(g.id, created.actor))}, ${esc(ago(created.created_at))}</div>` : ''}</div></div>
    ${e.repeat && e.repeat !== 'never' ? `<div class="banner ok">${icon('repeat', 15)} Repeats ${esc(REPEATS.find(r => r[0] === e.repeat)[1].toLowerCase())}${e.next_date ? `. Next on ${esc(niceDate(e.next_date))}.` : ''}</div>` : ''}
    ${e.repeat_parent ? `<div class="muted small">${icon('repeat', 13)} Added automatically from a repeating expense.</div>` : ''}
    ${e.bill ? `<div class="muted small">${icon('users', 13)} Part of a ${fmt(Number(e.bill.total), cur)} bill with ${esc((e.bill.people || []).join(', '))}.</div>` : ''}
    <div class="list">${lines}</div>
    ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ''}
    ${e.receipt_path ? `<a class="receipt" id="dReceipt" target="_blank" rel="noopener">${icon('receipt', 15)} Loading receipt…</a>` : ''}
    <div class="actions"><button class="btn" id="dEdit">${icon('pencil', 15)} Edit</button><button class="btn danger" id="dDel">${icon('trash-2', 15)} Delete</button></div>
    <h3 style="margin:6px 0 -6px">${icon('message-square', 14)} Comments</h3>
    <div class="list" id="cList"><div class="row static muted">Loading…</div></div>
    <form id="cForm" class="inline-form"><label class="f" style="flex:1"><span class="sr">Add a comment</span><input id="cBody" maxlength="1000" placeholder="Add a comment"></label><button class="btn" type="submit">${icon('send', 15)}<span class="sr">Post</span></button></form>
    <h3 style="margin:6px 0 -6px">${icon('history', 14)} History</h3>
    <div class="list" id="hList"><div class="row static muted">Loading…</div></div>
  </div>`);
  $('#dEdit').addEventListener('click', () => isPay ? openSettleSheet(g.id, {id: e.id}) : openExpenseSheet(g.id, e.id));
  armDelete($('#dDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', e.id), 'Deleted. You can restore it from Activity.')) closeSheet(); });
  const loadComments = async () => {
    const {data, error} = await sb.from('comments').select('*').eq('expense_id', e.id).order('created_at');
    const list = $('#cList'); if (!list) return;
    if (error) { list.innerHTML = `<div class="row static muted">${esc(friendly(error))}</div>`; return; }
    list.innerHTML = data.length ? data.map(c => `<div class="row static comment">${avatar(c.user_id === uid() ? myName() : whoDid(g.id, c.user_id), S.profiles[c.user_id]?.avatar_url)}
      <span class="main"><span class="sub"><b>${esc(whoDid(g.id, c.user_id))}</b> · ${esc(ago(c.created_at))}</span><span class="wrap-text">${esc(c.body)}</span></span>
      ${c.user_id === uid() ? `<button class="btn ghost icon-btn" data-delc="${esc(c.id)}" aria-label="Delete comment">${icon('x', 16)}</button>` : ''}</div>`).join('')
      : `<div class="row static muted">No comments yet.</div>`;
  };
  const loadHistory = async () => {
    const {data, error} = await sb.from('activity').select('*').eq('expense_id', e.id).order('created_at', {ascending: false});
    const list = $('#hList'); if (!list) return;
    if (error) { list.innerHTML = `<div class="row static muted">${esc(friendly(error))}</div>`; return; }
    const rows = data.filter(a => a.kind !== 'comment').map(a => {
      const who = esc(whoDid(g.id, a.actor));
      const text = a.kind === 'expense_added' ? `${who} added this` : a.kind === 'expense_recurring' ? 'Added by a repeating expense'
        : a.kind === 'expense_restored' ? `${who} restored this` : a.kind === 'expense_updated' ? `${who} changed ${changes(a)}` : `${who} deleted this`;
      return `<div class="row static"><span class="main"><span class="wrap-text">${text}</span><span class="sub">${esc(ago(a.created_at))}</span></span></div>`;
    });
    list.innerHTML = rows.join('') || `<div class="row static muted">No changes recorded yet.</div>`;
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
  loadComments(); loadHistory();
  if (e.receipt_path) sb.storage.from('receipts').createSignedUrl(e.receipt_path, 3600).then(({data, error}) => {
    const a = $('#dReceipt'); if (!a) return;
    if (error) { a.textContent = 'Couldn’t load the receipt.'; return; }
    a.href = data.signedUrl; a.innerHTML = `<img src="${esc(data.signedUrl)}" alt="Receipt photo"><span>${icon('external-link', 14)} Open full size</span>`;
  });
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
  openSheet(`<form class="sheet-in" id="pForm" novalidate>${head(p ? 'Edit payment' : 'Record a payment')}
    <div class="grid2"><label class="f">Who paid${sel('pFrom', from)}</label><label class="f">Paid to${sel('pTo', to)}</label></div>
    <div class="grid2"><label class="f">Amount<input id="pAmt" class="amount-input" inputmode="decimal" placeholder="0.00" value="${amt ? fromMinor(amt, cur) : ''}" autofocus></label>
    <label class="f">Currency<select id="pCur">${currencyOptions(cur)}</select></label></div>
    <label class="f">Date<input id="pDate" type="date" value="${esc(p?.date || today())}"></label>
    <div id="payLinks"></div>
    <p class="hint muted small">Record cash, UPI or bank transfers here once the money has actually moved.</p>
    <p class="hint err" id="pHint"></p>
    <div class="actions">${p ? `<button type="button" class="btn danger" id="pDel">${icon('trash-2', 15)} Delete</button>` : ''}<span class="sp"></span><button class="btn primary" type="submit">Save payment</button></div>
  </form>`);
  if (p) armDelete($('#pDel'), async () => { if (await run(sb.from('expenses').delete().eq('id', p.id), 'Payment deleted')) closeSheet(); });
  const links = () => {
    const box = $('#payLinks'); if (!box) return;
    const f = $('#pFrom').value, t = $('#pTo').value, c = $('#pCur').value, a = toMinor($('#pAmt').value, c);
    const to = member(gid, t), prof = to?.user_id ? S.profiles[to.user_id] : null;
    if (f !== me || !prof || !(a > 0)) { box.innerHTML = ''; return; }
    const amt = fromMinor(a, c), name = personName(to), out = [];
    if (prof.upi_id && c === 'INR') out.push(`<a class="btn primary" href="upi://pay?pa=${encodeURIComponent(prof.upi_id)}&pn=${encodeURIComponent(name)}&am=${amt}&cu=INR&tn=${encodeURIComponent('Evenly: ' + (g.is_direct ? 'settle up' : g.name))}">${icon('smartphone', 16)} Pay ${fmt(a, c)} with UPI</a>`);
    if (prof.paypal_me) out.push(`<a class="btn" target="_blank" rel="noopener" href="https://paypal.me/${encodeURIComponent(prof.paypal_me)}/${amt}${c}">${icon('credit-card', 16)} PayPal</a>`);
    if (prof.venmo && c === 'USD') out.push(`<a class="btn" target="_blank" rel="noopener" href="https://venmo.com/${encodeURIComponent(prof.venmo)}?txn=pay&amount=${amt}&note=${encodeURIComponent('Evenly')}">${icon('credit-card', 16)} Venmo</a>`);
    box.innerHTML = out.length ? `<div class="actions">${out.join('')}</div><p class="hint muted small">Opens your payment app with ${esc(name)}’s details filled in. Come back and tap Save payment once it’s done.</p>` : '';
    if (prof.upi_id && c === 'INR') box.insertAdjacentHTML('beforeend', `<p class="hint muted small">UPI ID: <code>${esc(prof.upi_id)}</code></p>`);
  };
  ['#pFrom', '#pTo', '#pCur'].forEach(sel => $(sel).addEventListener('change', links));
  $('#pAmt').addEventListener('input', links);
  links();
  $('#pForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = $('#pFrom').value, t = $('#pTo').value, c = $('#pCur').value, a = toMinor($('#pAmt').value, c), h = $('#pHint');
    if (f === t) { h.textContent = 'Pick two different people.'; return; }
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
    <div class="mem-add"><input id="gNewName" maxlength="40" placeholder="Name" aria-label="New person’s name"><input id="gNewEmail" type="email" placeholder="Email (optional)" aria-label="New person’s email"><button type="button" class="btn" id="gAdd">Add</button></div>
    <p class="hint muted small">Add an email so that person can sign in and see this group. Or share the invite link.</p>
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
    const ad = F.added.map((m, i) => `<div class="ms">${avatar(m.name)}<span class="nm">${esc(m.name)}${m.email ? ` <span class="muted" style="font-weight:500">${esc(m.email)}</span>` : ''}</span>
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
    if ($('#gNewName').value.trim() && !add()) return;
    const name = $('#gName').value.trim();
    if (!name) { hint.textContent = 'Give the group a name.'; return; }
    const form = e.target; busy(form, true);
    if (!g) {
      const id = await run(sb.rpc('create_group', {p_name: name, p_currency: $('#gCur').value, p_my_name: myName(), p_members: F.added}));
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
    for (const m of F.added) ok = !!(await run(sb.rpc('add_member', {p_group: g.id, p_name: m.name, p_email: m.email || null}))) && ok;
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
  const g = gid ? S.groups[gid] : null, f = g ? friendOf(g.id) : null;
  const settled = g ? !Object.values(myBalance(g.id)).some(v => v) : true;
  openSheet(`<form class="sheet-in" id="fForm" novalidate>${head(g ? 'Friend settings' : 'Add a friend')}
    <label class="f">Friend’s name<input id="fName" maxlength="40" placeholder="Rahul Mehta" value="${esc(f?.name || '')}" ${f?.user_id ? 'disabled' : 'autofocus'}></label>
    <label class="f">Their email (optional)<input id="fEmail" type="email" placeholder="rahul@example.com" value="${esc(f?.email || '')}" ${f?.user_id ? 'disabled' : ''}></label>
    <p class="hint muted small">${f?.user_id ? 'They’re on Evenly and see everything you share.' : 'With their email, or with an invite link, they can sign in and see everything you share.'}</p>
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
    if (!f.user_id && (name !== f.name || (email || null) !== (f.email || null)))
      ok = !!(await run(sb.from('group_members').update({name, email: email || null}).eq('id', f.id))) && ok;
    if (cur !== g.currency) ok = !!(await run(sb.from('groups').update({currency: cur}).eq('id', g.id))) && ok;
    busy(ev.target, false);
    if (ok) { closeSheet(); toast('Saved'); }
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
