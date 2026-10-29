// Balances shown as one-liners: the total card, "Bina owes you ₹300", and the amount on the right of a row.
import { router } from 'expo-router';
import { View } from 'react-native';

import { between, type Map } from '@/lib/money';
import { expOf, membersOf, myId, personName, S, totals, type Group } from '@/lib/store';
import { fmt, fmtMulti } from '@/lib/util';

import { Icon } from './icons';
import { IconButton, Txt } from './kit';
import { useTheme } from './theme';

export function TotalCard(){
  const {c} = useTheme();
  const {owed, owe} = totals();
  const any = Object.keys(owed).length || Object.keys(owe).length;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 16}}>
      <View style={{width: 48, height: 48, borderRadius: 14, backgroundColor: c.accent + '1f', alignItems: 'center', justifyContent: 'center'}}>
        <Icon name="wallet" size={26} color={c.accent} />
      </View>
      <View style={{flex: 1, gap: 2}}>
        <Txt small muted weight="semi">Total balance</Txt>
        {Object.keys(owe).length > 0 && <Txt weight="semi" color={c.owe}>You owe {fmtMulti(owe)}</Txt>}
        {Object.keys(owed).length > 0 && <Txt weight="semi" color={c.owed}>You are owed {fmtMulti(owed)}</Txt>}
        {!any && <Txt muted>You’re all settled up</Txt>}
      </View>
      <View style={{borderRadius: 21, backgroundColor: S.filter !== 'all' ? c.accent + '22' : 'transparent'}}>
        <IconButton icon="sliders-horizontal" label="Filter" color={S.filter !== 'all' ? c.accent : c.ink} size={20} onPress={() => router.push('/filter')} />
      </View>
    </View>
  );
}

// "Bina owes you ₹300 in Goa trip" / "You owe Ravi ₹50", one line per currency.
export function PersonLines({name, amt, where, big}: {name: string; amt: Map; where?: string; big?: boolean}){
  const {c} = useTheme();
  const list = Object.entries(amt).filter(([, v]) => v);
  if (!list.length) return null;
  return <>{list.map(([cur, v]) => (
    <Txt key={cur} small={!big} muted style={big ? {fontSize: 16, lineHeight: 23} : undefined}>
      {v > 0 ? <>{name} owes you <Txt small={!big} weight="bold" color={c.owed} style={big ? {fontSize: 16} : undefined}>{fmt(v, cur)}</Txt></>
             : <>You owe {name} <Txt small={!big} weight="bold" color={c.owe} style={big ? {fontSize: 16} : undefined}>{fmt(v, cur)}</Txt></>}
      {where ? ` ${where}` : ''}
    </Txt>
  ))}</>;
}

// The right side of a row: "owes you ₹200" in green, "you owe $5" in orange, or "settled up".
export function RightLabel({map, they = 'owes you'}: {map: Map; they?: string}){
  const {c} = useTheme();
  const pos = Object.entries(map || {}).filter(([, v]) => v > 0), neg = Object.entries(map || {}).filter(([, v]) => v < 0);
  if (!pos.length && !neg.length) return <Txt small muted>settled up</Txt>;
  const block = (color: string, label: string, list: [string, number][]) => list.length ? (
    <View style={{alignItems: 'flex-end'}}>
      <Txt small color={color}>{label}</Txt>
      <Txt weight="bold" color={color}>{list.map(([cur, v]) => fmt(v, cur)).join(' + ')}</Txt>
    </View>) : null;
  return <View style={{alignItems: 'flex-end', gap: 4, maxWidth: 140}}>{block(c.owed, they, pos)}{block(c.owe, 'you owe', neg)}</View>;
}

// Members of a group I have a balance with, and how much.
export function groupLineData(g: Group){
  const me = myId(g.id); if (!me) return [];
  const exps = expOf(g.id);
  return membersOf(g.id).filter(m => m.id !== me)
    .map(m => ({m, amt: between(exps, g, me, m.id)})).filter(x => Object.values(x.amt).some(v => v));
}
// What each member and I owe each other in this group, at most `max` lines.
export function GroupLines({g, max = 2, big}: {g: Group; max?: number; big?: boolean}){
  const lines = groupLineData(g);
  return <>
    {lines.slice(0, max).map(x => <PersonLines key={x.m.id} name={personName(x.m)} amt={x.amt} big={big} />)}
    {lines.length > max && <Txt small={!big} muted>Plus {lines.length - max} more balance{lines.length - max > 1 ? 's' : ''}</Txt>}
  </>;
}
