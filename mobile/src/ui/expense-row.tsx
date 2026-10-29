// One expense in a ledger: date, category, description, who paid, and my part on the right.
import { router } from 'expo-router';
import { View } from 'react-native';

import { nm } from '@/lib/actions';
import { curOf, payersOf } from '@/lib/money';
import { nameOf, type ExpenseRow, type Group } from '@/lib/store';
import { fmt } from '@/lib/util';

import { Icon } from './icons';
import { CatIcon, Row, Txt } from './kit';
import { useTheme } from './theme';

function paidLabel(g: Group, e: ExpenseRow){
  const names = Object.keys(payersOf(e)).map(id => nameOf(g.id, id));
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} people`;
  return `${who} paid ${fmt(Number(e.amount), curOf(e, g))}`;
}
function MyPart({g, e, me}: {g: Group; e: ExpenseRow; me: string | null}){
  const {c} = useTheme();
  const cur = curOf(e, g), paid = Number(payersOf(e)[me || ''] || 0), share = Number(e.split?.[me || ''] || 0), net = paid - share;
  const two = (label: string, value: string, color?: string) => <View style={{alignItems: 'flex-end'}}>
    <Txt small color={color} muted={!color}>{label}</Txt><Txt weight="bold" color={color}>{value}</Txt></View>;
  if (e.kind === 'payment') {
    const to = Object.keys(e.split)[0];
    if (me === e.paid_by) return two('you paid', fmt(Number(e.amount), cur));
    if (me === to) return two('you received', fmt(Number(e.amount), cur));
    return <Txt weight="bold">{fmt(Number(e.amount), cur)}</Txt>;
  }
  if (net > 0) return two('you lent', fmt(net, cur), c.owed);
  if (net < 0) return two('you borrowed', fmt(net, cur), c.owe);
  return <Txt small muted>not involved</Txt>;
}
export function Badge({icon, text, warn}: {icon: string; text?: string; warn?: boolean}){
  const {c} = useTheme();
  const color = warn ? c.owe : c.muted;
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: c.chip}}>
    <Icon name={icon} size={11} color={color} />{!!text && <Txt small color={color} style={{fontSize: 11, lineHeight: 15}}>{text}</Txt>}
  </View>;
}

export function ExpenseLine({g, e, me}: {g: Group; e: ExpenseRow; me: string | null}){
  const {c} = useTheme();
  const d = new Date(e.date + 'T00:00');
  const title = e.kind === 'payment' ? `${nameOf(g.id, e.paid_by)} paid ${nm(g.id, Object.keys(e.split)[0])}` : e.description;
  const sub = e.kind === 'payment' ? 'Payment' : paidLabel(g, e);
  return (
    <Row onPress={() => router.push({pathname: '/expense/[id]', params: {id: e.id}})} accessibilityLabel={title}>
      <View style={{width: 34, alignItems: 'center'}}>
        <Txt small muted style={{fontSize: 11, lineHeight: 13, textTransform: 'uppercase'}}>{d.toLocaleDateString(undefined, {month: 'short'})}</Txt>
        <Txt weight="bold" style={{fontSize: 18, lineHeight: 22}}>{String(d.getDate()).padStart(2, '0')}</Txt>
      </View>
      {e.kind === 'payment' ? <CatIcon icon="arrow-left-right" color={c.accent} /> : <CatIcon cat={e.category} />}
      <View style={{flex: 1, gap: 2}}>
        <Txt weight="semi" numberOfLines={2}>{title}</Txt>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
          <Txt small muted>{sub}</Txt>
          {!!e.repeat && e.repeat !== 'never' && <Badge icon="repeat" text={e.repeat} />}
          {!!e.receipt_path && <Badge icon="paperclip" />}
          {!!e.notes && <Badge icon="notebook-pen" />}
          {e.pending && <Badge icon="refresh-cw" text="waiting to sync" warn />}
        </View>
      </View>
      <MyPart g={g} e={e} me={me} />
    </Row>
  );
}
