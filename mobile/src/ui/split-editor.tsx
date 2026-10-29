// The split editor, shared by the group and several-friends forms: mode buttons, then one row per person
// (or one row per item when splitting by items), each with its share. Mirrors splitEditor() on the website.
import { Pressable, TextInput, View } from 'react-native';

import { MODES } from '@/lib/actions';
import { computeSplit, type SplitResult } from '@/lib/money';
import { fmt, toMinor } from '@/lib/util';

import { Icon } from './icons';
import { Button, Txt } from './kit';
import { F, useTheme } from './theme';

export type Person = {id: string; name: string};
export type Item = {name: string; amount: string; people: string[]};
export type SplitState = {mode: string; inc: string[]; inputs: {exact: Record<string, string>; percent: Record<string, string>;
  shares: Record<string, string>; adjust: Record<string, string>; items: {list: Item[]}}};

// The starting state: an existing expense's split, a group's saved default, or everyone equally.
export function initialSplit(people: Person[], mode = 'equal', inc?: string[] | null, input?: any): SplitState {
  const ids = people.map(p => p.id);
  const st: SplitState = {mode, inc: inc?.length ? inc.filter(id => ids.includes(id)) : ids,
    inputs: {exact: {}, percent: {}, shares: {}, adjust: {}, items: {list: []}}};
  if (mode !== 'equal' && input) (st.inputs as any)[mode] = JSON.parse(JSON.stringify(input));
  if (!st.inputs.items?.list?.length) st.inputs.items = {list: [{name: '', amount: '', people: [...ids]}]};
  return fillShares(st, ids);
}
// Shares start at 1 each.
function fillShares(st: SplitState, ids: string[]){
  if (st.mode !== 'shares') return st;
  const s = {...st.inputs.shares};
  ids.forEach(id => { if (s[id] == null) s[id] = '1'; });
  return {...st, inputs: {...st.inputs, shares: s}};
}
export const splitInput = (st: SplitState) => st.mode === 'equal' ? {} : JSON.parse(JSON.stringify((st.inputs as any)[st.mode] || {}));
export function computeFor(st: SplitState, people: Person[], total: number, cur: string): SplitResult {
  return computeSplit(total, st.mode, people.map(p => p.id), new Set(st.inc), (st.inputs as any)[st.mode] || {}, cur, s => toMinor(s, cur));
}

const short = (n: string) => n === 'You' ? 'You' : String(n).split(/\s+/)[0];

export function SplitEditor({people, st, set, result, cur}: {people: Person[]; st: SplitState; set: (s: SplitState) => void; result: SplitResult; cur: string}){
  const {c} = useTheme();
  const ids = people.map(p => p.id);
  const share = (id: string) => { const v = result.split ? result.split[id] : null; return v ? fmt(v, cur) : ''; };
  const setInput = (id: string, v: string) => set({...st, inputs: {...st.inputs, [st.mode]: {...(st.inputs as any)[st.mode], [id]: v}}});
  const toggleInc = (id: string) => set({...st, inc: st.inc.includes(id) ? st.inc.filter(x => x !== id) : [...st.inc, id]});
  const items = st.inputs.items.list;
  const setItems = (list: Item[]) => set({...st, inputs: {...st.inputs, items: {list}}});
  const field = {fontFamily: F.medium, fontSize: 16, color: c.ink, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10,
    paddingHorizontal: 10, minHeight: 40} as const;

  const rowBox = {flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8, paddingHorizontal: 12, minHeight: 52};
  const Check = ({on}: {on: boolean}) => (
    <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
      {on && <Icon name="check" size={14} color={c.accentInk} strokeWidth={3} />}
    </View>
  );
  const Share = ({id}: {id: string}) => <Txt weight="semi" style={{minWidth: 76, textAlign: 'right'}}>{share(id)}</Txt>;

  let rows;
  if (st.mode === 'items') {
    rows = <>
      {items.map((it, i) => (
        <View key={i} style={{padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.line}}>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
            <TextInput value={it.name} placeholder={`Item ${i + 1}`} placeholderTextColor={c.muted} maxLength={60} accessibilityLabel="Item name"
              onChangeText={v => setItems(items.map((x, j) => j === i ? {...x, name: v} : x))} style={[field, {flex: 1}]} />
            <TextInput value={it.amount} placeholder="0.00" placeholderTextColor={c.muted} keyboardType="decimal-pad" accessibilityLabel="Item price"
              onChangeText={v => setItems(items.map((x, j) => j === i ? {...x, amount: v} : x))} style={[field, {width: 96, textAlign: 'right'}]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove item" hitSlop={6} style={{padding: 6}}
              onPress={() => { const next = items.filter((_, j) => j !== i); setItems(next.length ? next : [{name: '', amount: '', people: [...ids]}]); }}>
              <Icon name="x" size={18} color={c.muted} />
            </Pressable>
          </View>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
            {people.map(p => {
              const on = it.people.includes(p.id);
              return <Pressable key={p.id} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={`${p.name} had ${it.name || `item ${i + 1}`}`}
                onPress={() => setItems(items.map((x, j) => j === i ? {...x, people: on ? x.people.filter(y => y !== p.id) : [...x.people, p.id]} : x))}
                style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : c.surface}}>
                <Txt small weight="semi" color={on ? c.accentInk : c.ink}>{short(p.name)}</Txt>
              </Pressable>;
            })}
          </View>
        </View>
      ))}
      <Button small icon="plus" title="Add item" style={{alignSelf: 'flex-start', margin: 12}}
        onPress={() => setItems([...items, {name: '', amount: '', people: [...ids]}])} />
      <View style={{borderTopWidth: 1, borderTopColor: c.line}}>
        {people.map(p => <View key={p.id} style={rowBox}><Txt style={{flex: 1}}>{p.name}</Txt><Share id={p.id} /></View>)}
      </View>
    </>;
  } else {
    const inp = (st.inputs as any)[st.mode] || {};
    rows = <>
      {people.map(p => {
        if (st.mode === 'equal') return (
          <Pressable key={p.id} onPress={() => toggleInc(p.id)} accessibilityRole="checkbox" accessibilityState={{checked: st.inc.includes(p.id)}} style={rowBox}>
            <Check on={st.inc.includes(p.id)} /><Txt style={{flex: 1}}>{p.name}</Txt><Share id={p.id} />
          </Pressable>);
        if (st.mode === 'adjust') return (
          <View key={p.id} style={rowBox}>
            <Pressable onPress={() => toggleInc(p.id)} accessibilityRole="checkbox" accessibilityState={{checked: st.inc.includes(p.id)}} accessibilityLabel={p.name}
              style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
              <Check on={st.inc.includes(p.id)} /><Txt style={{flex: 1}}>{p.name}</Txt>
            </Pressable>
            <TextInput value={inp[p.id] ?? ''} placeholder="+0" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" accessibilityLabel={`Adjustment for ${p.name}`}
              onChangeText={v => setInput(p.id, v)} style={[field, {width: 80, textAlign: 'right'}]} />
            <Share id={p.id} />
          </View>);
        const suf = st.mode === 'exact' ? cur : st.mode === 'percent' ? '%' : 'shares';
        return (
          <View key={p.id} style={rowBox}>
            <Txt style={{flex: 1}}>{p.name}</Txt>
            <TextInput value={inp[p.id] ?? ''} placeholder="0" placeholderTextColor={c.muted} keyboardType="decimal-pad" accessibilityLabel={p.name}
              onChangeText={v => setInput(p.id, v)} style={[field, {width: 90, textAlign: 'right'}]} />
            <Txt small muted style={{minWidth: 40}}>{suf}</Txt>
            {st.mode !== 'exact' && <Share id={p.id} />}
          </View>);
      })}
      {st.mode === 'adjust' && <Txt small muted style={{paddingHorizontal: 12, paddingVertical: 8}}>Type extra (+) or less (−) for anyone. The rest is split equally.</Txt>}
    </>;
  }

  return (
    <View style={{gap: 8}}>
      <Txt weight="semi" small muted>Split</Txt>
      <View style={{flexDirection: 'row', backgroundColor: c.chip, borderRadius: 12, padding: 4, gap: 2}} accessibilityRole="tablist">
        {MODES.map(([k, l]) => (
          <Pressable key={k} onPress={() => set(fillShares({...st, mode: k}, ids))} accessibilityRole="tab" accessibilityState={{selected: st.mode === k}}
            accessibilityLabel={{equal: 'Split equally', exact: 'Exact amounts', percent: 'By percentage', shares: 'By shares', adjust: 'Equally, with adjustments', items: 'Item by item'}[k]}
            style={{flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: st.mode === k ? c.surface : 'transparent'}}>
            <Txt weight="semi" small color={st.mode === k ? c.ink : c.muted}>{l}</Txt>
          </Pressable>
        ))}
      </View>
      <View style={{backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14, overflow: 'hidden'}}>{rows}</View>
      {!!(result.error || result.msg) && <Txt small color={result.error ? c.owe : c.owed}>{result.error || result.msg}</Txt>}
    </View>
  );
}
