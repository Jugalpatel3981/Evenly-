// Pure money maths: no DOM, no network. Amounts are integers in minor units (paise, cents).
import { fmt } from './util';

export type Map = Record<string, number>;
export type Expense = {id?: string; amount: number | string; paid_by: string; payers?: Map | null; split: Map; currency?: string | null; kind?: string; [k: string]: any};
export type Transfer = {from: string; to: string; amount: number};
export type SplitResult = {split?: Map; error?: string; msg?: string; total?: number};
type Parse = (s: any) => number;

// Who paid how much: {memberId: amount}.
export const payersOf = (e: Expense): Map => (e.payers && Object.keys(e.payers).length) ? e.payers : {[e.paid_by]: Number(e.amount)};
export const curOf = (e: Expense, group?: {currency?: string} | null): string => e.currency || group?.currency || 'INR';

// Split `total` in proportion to `weights` ({id: weight}), handing leftover units
// to the largest remainders so the parts always add up exactly.
export function allocate(total: number, weights: Map): Map {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const tw = entries.reduce((a, [, w]) => a + w, 0);
  const out: Map = {};
  if (!tw) return out;
  const parts = entries.map(([id, w]) => { const raw = total * w / tw; return {id, c: Math.floor(raw), frac: raw - Math.floor(raw)}; });
  let rem = total - parts.reduce((a, p) => a + p.c, 0);
  parts.slice().sort((a, b) => b.frac - a.frac).forEach(p => { if (rem > 0) { p.c++; rem--; } });
  parts.forEach(p => { if (p.c) out[p.id] = p.c; });
  return out;
}

// Balances per currency: {INR: {memberId: +owed / -owes}}.
export function balances(expenses: Expense[], memberIds: string[], group?: {currency?: string} | null){
  const out: Record<string, Map> = {};
  const book = (cur: string) => out[cur] || (out[cur] = Object.fromEntries(memberIds.map(id => [id, 0])));
  for (const e of expenses) {
    const b = book(curOf(e, group));
    for (const [id, v] of Object.entries(payersOf(e))) b[id] = (b[id] || 0) + Number(v);
    for (const [id, v] of Object.entries(e.split || {})) b[id] = (b[id] || 0) - Number(v);
  }
  return out;
}

// Fewest payments that settle one currency's balances: greedy biggest debtor to biggest creditor.
export function simplify(b: Map): Transfer[] {
  const cred: [string, number][] = [], debt: [string, number][] = [];
  for (const id in b) { if (b[id] > 0) cred.push([id, b[id]]); else if (b[id] < 0) debt.push([id, -b[id]]); }
  cred.sort((x, y) => y[1] - x[1]); debt.sort((x, y) => y[1] - x[1]);
  const out: Transfer[] = []; let i = 0, j = 0;
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
export function pairwise(expenses: Expense[], group?: {currency?: string} | null){
  const net: Record<string, Map> = {};
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
  const out: Record<string, Transfer[]> = {};
  for (const [cur, m] of Object.entries(net)) {
    out[cur] = Object.entries(m).filter(([, v]) => v).map(([k, v]) => {
      const [x, y] = k.split('|');
      return v > 0 ? {from: x, to: y, amount: v} : {from: y, to: x, amount: -v};
    });
  }
  return out;
}

// What `me` and `them` owe each other across expenses, per currency. Positive: they owe me.
export function between(expenses: Expense[], group: {currency?: string} | null | undefined, me: string, them: string){
  const out: Map = {};
  for (const [cur, list] of Object.entries(pairwise(expenses, group))) {
    for (const t of list) {
      if (t.from === them && t.to === me) out[cur] = (out[cur] || 0) + t.amount;
      if (t.from === me && t.to === them) out[cur] = (out[cur] || 0) - t.amount;
    }
  }
  return out;
}

export const addMaps = (a: Map, b?: Map): Map => { const o = {...a}; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };

// The split of `total` among `ids` for a split mode.
// inputs: per-person values typed into the form (exact amounts, %, shares or +/- adjustments).
// toMinor: parses a typed amount in this expense's currency.
export function computeSplit(total: number, mode: string, ids: string[], inc: Set<string>, inputs: any, cur: string, toMinor: Parse): SplitResult {
  if (mode === 'items') return computeItems(total, ids, inputs, cur, toMinor);
  if (!(total > 0)) return {error: 'Enter an amount above zero.'};
  if (mode === 'equal' || mode === 'adjust') {
    const sel = ids.filter(id => inc.has(id));
    if (!sel.length) return {error: 'Pick at least one person to split with.'};
    const adj: Map = {}; let sumAdj = 0;
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
    const split: Map = {};
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
    const split: Map = {}; let sum = 0;
    for (const id of ids) {
      const raw = inputs[id]; if (raw == null || String(raw).trim() === '') continue;
      const c = toMinor(raw); if (isNaN(c) || c < 0) return {error: 'Each amount must be a number.'};
      if (c > 0) { split[id] = c; sum += c; }
    }
    if (sum !== total) return {error: sum < total ? `${fmt(total - sum, cur)} still to assign` : `${fmt(sum - total, cur)} more than the total`};
    return {split, msg: 'Amounts match the total'};
  }
  const w: Map = {}; let tw = 0;
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
export function computePayers(total: number, ids: string[], inputs: any, cur: string, toMinor: Parse): {payers?: Map; error?: string} {
  const payers: Map = {}; let sum = 0;
  for (const id of ids) {
    const raw = inputs[id]; if (raw == null || String(raw).trim() === '') continue;
    const v = toMinor(raw); if (isNaN(v) || v < 0) return {error: 'Each paid amount must be a number.'};
    if (v > 0) { payers[id] = v; sum += v; }
  }
  if (!Object.keys(payers).length) return {error: 'Enter how much each person paid.'};
  if (sum !== total) return {error: sum < total ? `Payments are ${fmt(total - sum, cur)} short of the total` : `Payments are ${fmt(sum - total, cur)} over the total`};
  return {payers};
}

// Split by items: each item is shared equally by the people who had it. Whatever the bill adds on top
// of the items (tax, tip, service) is shared in proportion to each person's items.
// input: {list: [{name, amount: "600", people: [ids]}]}. With no total entered, the items' sum is the total.
export function computeItems(total: number, ids: string[], input: any, cur: string, toMinor: Parse): SplitResult {
  const list = (input?.list || []).filter((it: any) => String(it.amount ?? '').trim() !== '' || (it.name || '').trim());
  if (!list.length) return {error: 'Add the items on the bill.'};
  const base: Map = {}; let sub = 0;
  for (const it of list) {
    const amt = toMinor(it.amount);
    if (isNaN(amt) || amt <= 0) return {error: `Enter a price for ${it.name ? `“${it.name}”` : 'each item'}.`};
    const who = (it.people || []).filter((id: string) => ids.includes(id));
    if (!who.length) return {error: `Choose who had ${it.name ? `“${it.name}”` : 'each item'}.`};
    for (const [id, v] of Object.entries(allocate(amt, Object.fromEntries(who.map((id: string) => [id, 1]))))) base[id] = (base[id] || 0) + v;
    sub += amt;
  }
  const t = total > 0 ? total : sub;
  if (sub > t) return {error: `Items add up to ${fmt(sub, cur)}, more than the total of ${fmt(t, cur)}.`};
  const extra = t - sub, split = {...base};
  for (const [id, v] of Object.entries(allocate(extra, base))) split[id] = (split[id] || 0) + v;
  return {split, total: t, msg: extra > 0 ? `Items ${fmt(sub, cur)} + ${fmt(extra, cur)} tax, tip and charges, shared in proportion` : `Items add up to ${fmt(t, cur)}`};
}

// Converts an amount between currencies with rates relative to one base: rates[c] = units of c per 1 base.
export function convert(minor: number, from: string, to: string, rates: Map | null | undefined, digitsOf: (c: string) => number){
  if (from === to) return minor;
  const rf = rates?.[from], rt = rates?.[to];
  if (!rf || !rt) return null;
  return Math.round(minor / 10 ** digitsOf(from) / rf * rt * 10 ** digitsOf(to));
}
