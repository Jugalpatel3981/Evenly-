// Bar charts: six months of spending, and horizontal bars for categories and budgets.
import { View } from 'react-native';

import { fmt } from '@/lib/util';

import { Txt } from './kit';
import { useTheme } from './theme';

// The last `n` months as {key: "2026-10", label: "Oct"}, oldest first.
export function lastMonths(n = 6, end = new Date()){
  return Array.from({length: n}, (_, i) => { const d = new Date(end.getFullYear(), end.getMonth() - (n - 1 - i), 1);
    return {key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, {month: 'short'})}; });
}

// Six bars: the total per month, and optionally my share as a darker bar inside it.
export function MonthBars<T extends {date: string}>({list, cur, total, mine, highlight}: {list: T[]; cur: string; total: (e: T) => number;
  mine?: ((e: T) => number) | null; highlight?: string}){
  const {c} = useTheme();
  const months = lastMonths().map(m => ({...m, t: 0, m: 0}));
  list.forEach(e => { const mm = months.find(x => x.key === String(e.date).slice(0, 7)); if (mm) { mm.t += total(e); if (mine) mm.m += mine(e); } });
  const max = Math.max(1, ...months.map(m => m.t));
  const light = c.accent + '73';
  return (
    <View style={{gap: 8}}>
      <View accessibilityRole="image" accessibilityLabel={`Spending per month: ${months.map(m => `${m.label} ${fmt(m.t, cur)}`).join(', ')}`}
        style={{flexDirection: 'row', gap: 8, height: 170, alignItems: 'flex-end', paddingTop: 8}}>
        {months.map(m => (
          <View key={m.key} style={{flex: 1, alignItems: 'center', gap: 4, height: '100%'}}>
            <Txt small muted numberOfLines={1} style={{fontSize: 11}}>{m.t ? fmt(m.t, cur).replace(/\.00$/, '') : ' '}</Txt>
            <View style={{flex: 1, width: '100%', maxWidth: 40, backgroundColor: c.chip, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end'}}>
              <View style={{height: `${(m.t / max) * 100}%`, minHeight: m.t ? 2 : 0, backgroundColor: highlight === m.key || !mine ? c.accent : light,
                borderTopLeftRadius: 8, borderTopRightRadius: 8, justifyContent: 'flex-end'}}>
                {mine && m.t > 0 && <View style={{height: `${(m.m / m.t) * 100}%`, backgroundColor: c.accent, borderTopLeftRadius: 8, borderTopRightRadius: 8}} />}
              </View>
            </View>
            <Txt small muted>{m.label}</Txt>
          </View>
        ))}
      </View>
      {mine && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
          <View style={{width: 10, height: 10, borderRadius: 3, backgroundColor: light}} /><Txt small muted>Everyone</Txt>
          <View style={{width: 10, height: 10, borderRadius: 3, backgroundColor: c.accent, marginLeft: 8}} /><Txt small muted>Your share</Txt>
        </View>
      )}
    </View>
  );
}

// A thin horizontal bar, filled to `pct` percent.
export function Bar({pct, color, track}: {pct: number; color: string; track?: string}){
  const {c} = useTheme();
  return <View style={{height: 8, borderRadius: 4, backgroundColor: track || c.chip, overflow: 'hidden'}}>
    <View style={{width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color, borderRadius: 4}} />
  </View>;
}
