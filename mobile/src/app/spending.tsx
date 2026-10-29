// Your spending: your share of every expense this month, in your default currency, by category, with monthly budgets.
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CATEGORY_GROUPS, catOf } from '@/lib/categories';
import { curOf } from '@/lib/money';
import { rates, toCurrency } from '@/lib/rates';
import { defaultCurrency, expOf, myId, myProfile, S, useStore } from '@/lib/store';
import { fmt } from '@/lib/util';
import { Bar, lastMonths } from '@/ui/charts';
import { Chip } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Button, Card, IconButton, Label, Row, Screen, Title, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

// My share of each expense per month, converted to my default currency, by category group.
function spendingByMonth(end: Date, n = 6){
  const cur = defaultCurrency();
  const months = lastMonths(n, end).map(m => ({...m, total: 0, byParent: {} as Record<string, number>}));
  let skipped = 0;
  for (const g of Object.values(S.groups)) {
    const me = myId(g.id); if (!me) continue;
    for (const e of expOf(g.id)) {
      if (e.kind === 'payment') continue;
      const mm = months.find(x => x.key === String(e.date).slice(0, 7)); if (!mm) continue;
      const share = Number(e.split?.[me] || 0); if (!share) continue;
      const v = toCurrency(share, curOf(e, g), cur);
      if (v == null) { skipped++; continue; }
      const parent = catOf(e.category).parent;
      mm.total += v; mm.byParent[parent] = (mm.byParent[parent] || 0) + v;
    }
  }
  return {months, cur, skipped};
}

export default function Spending(){
  useStore();
  const {c} = useTheme();
  const [end, setEnd] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const {months, cur, skipped} = spendingByMonth(end);
  const now = months[months.length - 1], prev = months[months.length - 2];
  const budgets = myProfile()?.budgets || {};
  const today = new Date(), thisMonth = end.getFullYear() === today.getFullYear() && end.getMonth() === today.getMonth();
  const delta = prev.total ? Math.round((now.total - prev.total) / prev.total * 100) : null;
  const max = Math.max(1, ...months.map(m => m.total));
  const label = end.toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
  const step = (k: number) => setEnd(new Date(end.getFullYear(), end.getMonth() + k, 1));
  const rows = CATEGORY_GROUPS.filter(cg => (now.byParent[cg.key] || 0) || Number(budgets[cg.key] || 0));
  const unbudgeted = CATEGORY_GROUPS.filter(cg => !now.byParent[cg.key] && !budgets[cg.key]);
  const budget = (key: string) => router.push({pathname: '/budget', params: {key}});

  return (
    <Screen>
      <View style={{flexDirection: 'row'}}><Button kind="ghost" small icon="chevron-left" title="Account" onPress={() => router.canGoBack() ? router.back() : router.replace('/account')} /></View>
      <Title>Your spending</Title>
      <Card pad={false} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 4}}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => step(-1)} />
        <Txt weight="bold" style={{fontSize: 16}}>{label}</Txt>
        {thisMonth ? <View style={{width: 42}} /> : <IconButton icon="chevron-right" label="Next month" onPress={() => step(1)} />}
      </Card>
      <Card style={{gap: 4}}>
        <Label>Your share {thisMonth ? 'so far this month' : 'this month'}</Label>
        <Txt weight="bold" style={{fontSize: 28, lineHeight: 34}}>{fmt(now.total, cur)}</Txt>
        {delta != null && <Txt small weight="semi" color={delta > 0 ? c.owe : c.owed}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}% on {prev.label}</Txt>}
      </Card>
      <View style={{gap: 8}}>
        <Label>Last six months</Label>
        <View accessibilityRole="image" accessibilityLabel={`Your share per month: ${months.map(m => `${m.label} ${fmt(m.total, cur)}`).join(', ')}`}
          style={{flexDirection: 'row', gap: 8, height: 170, alignItems: 'flex-end'}}>
          {months.map(m => (
            <View key={m.key} style={{flex: 1, alignItems: 'center', gap: 4, height: '100%'}}>
              <Txt small muted numberOfLines={1} style={{fontSize: 11}}>{m.total ? fmt(m.total, cur).replace(/\.00$/, '') : ' '}</Txt>
              <View style={{flex: 1, width: '100%', maxWidth: 40, backgroundColor: c.chip, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end'}}>
                <View style={{height: `${m.total / max * 100}%`, minHeight: m.total ? 2 : 0, borderTopLeftRadius: 8, borderTopRightRadius: 8,
                  backgroundColor: m.key === now.key ? c.accent : c.accent + '73'}} />
              </View>
              <Txt small muted>{m.label}</Txt>
            </View>))}
        </View>
      </View>
      <View style={{gap: 8}}>
        <Label>By category</Label>
        {rows.length ? <Card pad={false}>{rows.map((cg, i) => {
          const v = now.byParent[cg.key] || 0, b = Number(budgets[cg.key] || 0);
          const pct = b ? v / b * 100 : 0, over = b && v > b, near = b && pct >= 80 && !over;
          const tint = c.cat[cg.color];
          return (
            <Row key={cg.key} onPress={() => budget(cg.key)} accessibilityLabel={`${cg.label} budget`} style={{paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, borderRadius: 0}}>
              <View style={{width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tint + '22'}}>
                <Icon name={cg.items[0][2]} size={20} color={tint} /></View>
              <View style={{flex: 1, gap: 4}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 8}}>
                  <Txt weight="bold">{cg.label}</Txt>
                  <Txt>{fmt(v, cur)}{b ? <Txt muted> of {fmt(b, cur)}</Txt> : null}</Txt>
                </View>
                {b ? <>
                  <Bar pct={pct} color={over ? c.owe : near ? c.cat.utilities : c.accent} />
                  {over ? <Txt small color={c.owe}>{fmt(v - b, cur)} over budget</Txt> : <Txt small muted>{fmt(b - v, cur)} left</Txt>}
                </> : <Txt small muted>Tap to set a monthly budget</Txt>}
              </View>
            </Row>);
        })}</Card> : <Txt muted>Nothing spent this month yet.</Txt>}
        {unbudgeted.length > 0 && <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {unbudgeted.map(cg => <Chip key={cg.key} icon="plus" title={`${cg.label} budget`} onPress={() => budget(cg.key)} />)}</View>}
      </View>
      {skipped > 0 && <Txt small muted>{skipped} expense{skipped > 1 ? 's' : ''} in other currencies aren’t included yet: exchange rates haven’t loaded.</Txt>}
      <Txt small muted>Your share is what you owe for each expense, whoever paid. Amounts are in {cur}{rates() ? `, converted with ${rates()!.source} rates` : ''}.</Txt>
    </Screen>
  );
}
