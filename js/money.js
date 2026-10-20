// Pure money maths: no DOM, no network. Amounts are integers in minor units (paise, cents).
import { fmt } from './util.js';

// Who paid how much: {memberId: amount}.
export const payersOf = e => (e.payers && Object.keys(e.payers).length) ? e.payers : {[e.paid_by]: Number(e.amount)};
export const curOf = (e, group) => e.currency || group?.currency || 'INR';

// Split `total` in proportion to `weights` ({id: weight}), handing leftover units
// to the largest remainders so the parts always add up exactly.
export function allocate(total, weights){
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const tw = entries.reduce((a, [, w]) => a + w, 0);
  const out = {};
  if (!tw) return out;
  const parts = entries.map(([id, w]) => { const raw = total * w / tw; return {id, c: Math.floor(raw), frac: raw - Math.floor(raw)}; });
  let rem = total - parts.reduce((a, p) => a + p.c, 0);
  parts.slice().sort((a, b) => b.frac - a.frac).forEach(p => { if (rem > 0) { p.c++; rem--; } });
  parts.forEach(p => { if (p.c) out[p.id] = p.c; });
  return out;
}

// Balances per currency: {INR: {memberId: +owed / -owes}}.
export function balances(expenses, memberIds, group){
  const out = {};
  const book = cur => out[cur] || (out[cur] = Object.fromEntries(memberIds.map(id => [id, 0])));
  for (const e of expenses) {
    const b = book(curOf(e, group));
    for (const [id, v] of Object.entries(payersOf(e))) b[id] = (b[id] || 0) + Number(v);
    for (const [id, v] of Object.entries(e.split || {})) b[id] = (b[id] || 0) - Number(v);
  }
  return out;
}

// Fewest payments that settle one currency's balances: greedy biggest debtor to biggest creditor.
export function simplify(b){
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

// Who owes whom directly, expense by expense, netted per pair: {INR: [{from, to, amount}]}.
// Each person's share is owed to the payers in proportion to what each paid.
export function pairwise(expenses, group){
  const net = {};
  for (const e of expenses) {
    const cur = curOf(e, group), payers = payersOf(e);
    const m = net[cur] || (net[cur] = {});
    for (const [d, s] of Object.entries(e.split || {})) {
      for (const [p, a] of Object.entries(allocate(Number(s), Object.fromEntries(Object.entries(payers).map(([k, v]) => [k, Number(v)]))))) {
        if (p === d) continue;
        const [x, y, sign] = d < p ? [d, p, 1] : [p, d, -1];
        m[x + '|' + y] = (m[x + '|' + y] || 0) + sign * a;   // positive: x owes y
      }
    }
  }
  const out = {};
  for (const [cur, m] of Object.entries(net)) {
    out[cur] = Object.entries(m).filter(([, v]) => v).map(([k, v]) => {
      const [x, y] = k.split('|');
      return v > 0 ? {from: x, to: y, amount: v} : {from: y, to: x, amount: -v};
    });
  }
  return out;
}

// What `me` and `them` owe each other across expenses, per currency. Positive: they owe me.
export function between(expenses, group, me, them){
  const out = {};
  for (const [cur, list] of Object.entries(pairwise(expenses, group))) {
    for (const t of list) {
      if (t.from === them && t.to === me) out[cur] = (out[cur] || 0) + t.amount;
      if (t.from === me && t.to === them) out[cur] = (out[cur] || 0) - t.amount;
    }
  }
  return out;
}

export const addMaps = (a, b) => { const o = {...a}; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };

// The split of `total` among `ids` for a split mode.
// inputs: per-person values typed into the form (exact amounts, %, shares or +/- adjustments).
// toMinor: parses a typed amount in this expense's currency.
export function computeSplit(total, mode, ids, inc, inputs, cur, toMinor){
  if (!(total > 0)) return {error: 'Enter an amount above zero.'};
  if (mode === 'equal' || mode === 'adjust') {
    const sel = ids.filter(id => inc.has(id));
    if (!sel.length) return {error: 'Pick at least one person to split with.'};
    let adj = {}, sumAdj = 0;
    if (mode === 'adjust') {
      for (const id of sel) {
        const raw = inputs[id];
        if (raw == null || String(raw).trim() === '') continue;
        const v = toMinor(raw);
        if (isNaN(v)) return {error: 'Each adjustment must be a number, like 100 or -50.'};
        adj[id] = v; sumAdj += v;
      }
      if (sumAdj > total) return {error: `Adjustments add up to ${fmt(sumAdj, cur)}, more than the total.`};
    }
    const base = allocate(total - sumAdj, Object.fromEntries(sel.map(id => [id, 1])));
    const split = {};
    for (const id of sel) {
      const v = (base[id] || 0) + (adj[id] || 0);
      if (v < 0) return {error: 'An adjustment leaves someone with less than zero to pay.'};
      if (v > 0) split[id] = v;
    }
    if (!Object.keys(split).length) return {error: 'Nobody ends up paying anything.'};
    const msg = mode === 'equal'
      ? (sel.length === 1 ? `${fmt(total, cur)} for one person` : `${fmt(Math.floor(total / sel.length), cur)} each, split ${sel.length} ways`)
      : `${fmt(total - sumAdj, cur)} split equally, plus adjustments`;
    return {split, msg};
  }
  if (mode === 'exact') {
    const split = {}; let sum = 0;
    for (const id of ids) {
      const raw = inputs[id]; if (raw == null || String(raw).trim() === '') continue;
      const c = toMinor(raw); if (isNaN(c) || c < 0) return {error: 'Each amount must be a number.'};
      if (c > 0) { split[id] = c; sum += c; }
    }
    if (sum !== total) return {error: sum < total ? `${fmt(total - sum, cur)} still to assign` : `${fmt(sum - total, cur)} more than the total`};
    return {split, msg: 'Amounts match the total'};
  }
  const w = {}; let tw = 0;
  for (const id of ids) {
    const raw = inputs[id]; if (raw == null || String(raw).trim() === '') continue;
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0) return {error: 'Each value must be a number.'};
    if (v > 0) { w[id] = v; tw += v; }
  }
  if (mode === 'percent') {
    if (Math.abs(tw - 100) > 0.001) return {error: `Percentages add up to ${+tw.toFixed(2)}%. They need to reach 100%.`};
    return {split: allocate(total, w), msg: 'Percentages add up to 100%'};
  }
  if (tw <= 0) return {error: 'Give at least one person a share.'};
  return {split: allocate(total, w), msg: `${+tw.toFixed(2)} shares in total`};
}

// Several payers: amounts typed per person must add up to the total.
export function computePayers(total, ids, inputs, cur, toMinor){
  const payers = {}; let sum = 0;
  for (const id of ids) {
    const raw = inputs[id]; if (raw == null || String(raw).trim() === '') continue;
    const v = toMinor(raw); if (isNaN(v) || v < 0) return {error: 'Each paid amount must be a number.'};
    if (v > 0) { payers[id] = v; sum += v; }
  }
  if (!Object.keys(payers).length) return {error: 'Enter how much each person paid.'};
  if (sum !== total) return {error: sum < total ? `Payments are ${fmt(total - sum, cur)} short of the total` : `Payments are ${fmt(sum - total, cur)} over the total`};
  return {payers};
}
