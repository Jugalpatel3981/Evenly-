// Balances shown as one-liners: the total card, "Bina owes you ₹300", and the amount on the right of a row.
import { View } from 'react-native';

import type { Map } from '@/lib/money';
import { totals } from '@/lib/store';
import { fmt, fmtMulti } from '@/lib/util';

import { Icon } from './icons';
import { Txt } from './kit';
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
    </View>
  );
}

// "Bina owes you ₹300 in Goa trip" / "You owe Ravi ₹50", one line per currency.
export function PersonLines({name, amt, where}: {name: string; amt: Map; where?: string}){
  const {c} = useTheme();
  const list = Object.entries(amt).filter(([, v]) => v);
  if (!list.length) return null;
  return <>{list.map(([cur, v]) => (
    <Txt key={cur} small muted>
      {v > 0 ? <>{name} owes you <Txt small weight="bold" color={c.owed}>{fmt(v, cur)}</Txt></>
             : <>You owe {name} <Txt small weight="bold" color={c.owe}>{fmt(v, cur)}</Txt></>}
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
