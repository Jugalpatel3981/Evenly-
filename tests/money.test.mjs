// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, balances, simplify, pairwise, between, computeSplit, computePayers, computeItems, convert } from '../js/money.js';
import { toMinor, digits, fmtMulti } from '../js/util.js';

const g = {currency: 'INR'};
const tm = cur => s => toMinor(s, cur);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

test('allocate always adds up exactly', () => {
  const a = allocate(1000, {a: 1, b: 1, c: 1});
  assert.equal(sum(a), 1000);
  assert.deepEqual(Object.values(a).sort(), [333, 333, 334]);
});

test('currency digits', () => {
  assert.equal(digits('INR'), 2);
  assert.equal(digits('JPY'), 0);
  assert.equal(digits('KWD'), 3);
  assert.equal(toMinor('1,234.5', 'USD'), 123450);
  assert.equal(toMinor('1500', 'JPY'), 1500);
});

test('equal split', () => {
  const r = computeSplit(120000, 'equal', ['a', 'b', 'c', 'd'], new Set(['a', 'b', 'c', 'd']), {}, 'INR', tm('INR'));
  assert.deepEqual(r.split, {a: 30000, b: 30000, c: 30000, d: 30000});
});

test('adjustment split: Rahul pays 100 extra', () => {
  const r = computeSplit(90000, 'adjust', ['a', 'r', 'p'], new Set(['a', 'r', 'p']), {r: '100'}, 'INR', tm('INR'));
  assert.equal(sum(r.split), 90000);
  assert.ok(Math.abs(r.split.r - r.split.a - 10000) <= 1);
  assert.ok(Math.abs(r.split.a - r.split.p) <= 1);
});

test('adjustment split rejects negatives and overshoot', () => {
  assert.ok(computeSplit(10000, 'adjust', ['a', 'b'], new Set(['a', 'b']), {a: '200'}, 'INR', tm('INR')).error);
  assert.ok(computeSplit(10000, 'adjust', ['a', 'b'], new Set(['a', 'b']), {a: '-120'}, 'INR', tm('INR')).error);
  // A discount within reason is fine: total 100, a gets 80 off.
  assert.deepEqual(computeSplit(10000, 'adjust', ['a', 'b'], new Set(['a', 'b']), {a: '-80'}, 'INR', tm('INR')).split, {a: 1000, b: 9000});
});

test('exact, percent and shares', () => {
  assert.ok(computeSplit(10000, 'exact', ['a', 'b'], new Set(), {a: '30'}, 'INR', tm('INR')).error);
  assert.deepEqual(computeSplit(10000, 'exact', ['a', 'b'], new Set(), {a: '30', b: '70'}, 'INR', tm('INR')).split, {a: 3000, b: 7000});
  assert.deepEqual(computeSplit(10000, 'percent', ['a', 'b'], new Set(), {a: '25', b: '75'}, 'INR', tm('INR')).split, {a: 2500, b: 7500});
  assert.ok(computeSplit(10000, 'percent', ['a', 'b'], new Set(), {a: '25', b: '70'}, 'INR', tm('INR')).error);
  assert.deepEqual(computeSplit(90000, 'shares', ['a', 'b'], new Set(), {a: '2', b: '1'}, 'INR', tm('INR')).split, {a: 60000, b: 30000});
});

test('several payers must add up to the total', () => {
  assert.deepEqual(computePayers(80000, ['a', 'r'], {a: '500', r: '300'}, 'INR', tm('INR')).payers, {a: 50000, r: 30000});
  assert.ok(computePayers(80000, ['a', 'r'], {a: '500'}, 'INR', tm('INR')).error);
});

test('balances with several payers and several currencies', () => {
  const exps = [
    {amount: 80000, paid_by: 'a', payers: {a: 50000, r: 30000}, split: {a: 40000, r: 40000}, currency: 'INR'},
    {amount: 1000, paid_by: 'r', split: {a: 500, r: 500}, currency: 'USD'},
  ];
  const b = balances(exps, ['a', 'r'], g);
  assert.deepEqual(b.INR, {a: 10000, r: -10000});
  assert.deepEqual(b.USD, {a: -500, r: 500});
});

test('expenses without a currency use the group currency', () => {
  const b = balances([{amount: 100, paid_by: 'a', split: {b: 100}}], ['a', 'b'], {currency: 'EUR'});
  assert.deepEqual(b.EUR, {a: 100, b: -100});
});

test('simplify settles everything in at most n-1 payments', () => {
  const b = {a: 90000, b: 0, c: -60000, d: -30000};
  const tx = simplify(b);
  assert.equal(tx.length, 2);
  const after = {...b};
  tx.forEach(t => { after[t.from] += t.amount; after[t.to] -= t.amount; });
  assert.ok(Object.values(after).every(v => v === 0));
});

test('pairwise and between: who owes whom directly', () => {
  const exps = [
    {amount: 90000, paid_by: 'a', split: {a: 30000, r: 30000, p: 30000}},     // r and p each owe a 300
    {amount: 20000, paid_by: 'r', split: {a: 20000}},                           // a owes r 200
  ];
  const pw = pairwise(exps, g).INR;
  const find = (f, t) => pw.find(x => x.from === f && x.to === t)?.amount;
  assert.equal(find('r', 'a'), 10000);
  assert.equal(find('p', 'a'), 30000);
  assert.deepEqual(between(exps, g, 'a', 'r'), {INR: 10000});
  assert.deepEqual(between(exps, g, 'r', 'a'), {INR: -10000});
});

test('pairwise with several payers splits each debt by what each paid', () => {
  const exps = [{amount: 90000, paid_by: 'a', payers: {a: 60000, r: 30000}, split: {a: 30000, r: 30000, p: 30000}}];
  const pw = pairwise(exps, g).INR;
  const find = (f, t) => pw.find(x => x.from === f && x.to === t)?.amount || 0;
  assert.equal(find('p', 'a'), 20000);
  assert.equal(find('p', 'r'), 10000);
  assert.equal(find('r', 'a'), 10000);   // r owes a 200, a owes r 100: net 100
  // Pairwise debts agree with balances.
  const b = balances(exps, ['a', 'r', 'p'], g).INR;
  const fromPairs = {a: 0, r: 0, p: 0};
  pw.forEach(t => { fromPairs[t.from] -= t.amount; fromPairs[t.to] += t.amount; });
  assert.deepEqual(fromPairs, b);
});

test('fmtMulti joins currencies', () => {
  assert.match(fmtMulti({INR: 20000, USD: 500}), /200\.00.*\+.*5\.00/);
  assert.equal(fmtMulti({INR: 0}), '');
});

test('split by items: shared items, tax and tip in proportion', () => {
  const input = {list: [{name: 'Pizza', amount: '600', people: ['a', 'b']}, {name: 'Beer', amount: '400', people: ['b']}]};
  // items 1000, bill 1100: 100 extra shared 300:700
  const r = computeItems(110000, ['a', 'b', 'c'], input, 'INR', tm('INR'));
  assert.deepEqual(r.split, {a: 33000, b: 77000});
  assert.equal(sum(r.split), 110000);
});
test('split by items: no total entered uses the items sum', () => {
  const r = computeItems(NaN, ['a', 'b'], {list: [{name: 'Tea', amount: '50', people: ['a', 'b']}]}, 'INR', tm('INR'));
  assert.equal(r.total, 5000); assert.deepEqual(r.split, {a: 2500, b: 2500});
});
test('split by items: errors', () => {
  assert.ok(computeItems(10000, ['a'], {list: []}, 'INR', tm('INR')).error);
  assert.ok(computeItems(10000, ['a'], {list: [{name: 'X', amount: '50', people: []}]}, 'INR', tm('INR')).error);
  assert.ok(computeItems(10000, ['a'], {list: [{name: 'X', amount: '500', people: ['a']}]}, 'INR', tm('INR')).error);
  assert.ok(computeItems(10000, ['a'], {list: [{name: 'X', amount: 'abc', people: ['a']}]}, 'INR', tm('INR')).error);
});
test('computeSplit routes items mode', () => {
  const r = computeSplit(30000, 'items', ['a', 'b'], new Set(), {list: [{name: 'X', amount: '300', people: ['a', 'b', 'zz']}]}, 'INR', tm('INR'));
  assert.deepEqual(r.split, {a: 15000, b: 15000});
});
test('currency conversion through a common base', () => {
  const rates = {EUR: 1, INR: 90, USD: 1.08, JPY: 160};
  assert.equal(convert(1000, 'USD', 'INR', rates, digits), Math.round(10 / 1.08 * 90 * 100));
  assert.equal(convert(160, 'JPY', 'EUR', rates, digits), 100);
  assert.equal(convert(500, 'INR', 'INR', rates, digits), 500);
  assert.equal(convert(500, 'INR', 'XYZ', rates, digits), null);
});
