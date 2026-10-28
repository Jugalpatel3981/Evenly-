// Activity tab: everything that happened in my groups, and notifications meant for me.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { activityIcon, activityImpact, activityParts } from '@/lib/activity';
import { noteIcon, noteText } from '@/lib/messages';
import { emit, unreadCount, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { ago } from '@/lib/util';
import { CatIcon, Empty, Loading, Row, Screen, Seg, Title, Txt } from '@/ui/kit';
import { usePullToRefresh } from '@/ui/refresh';
import { useTheme } from '@/ui/theme';

export default function ActivityTab(){
  const S = useStore();
  const {c} = useTheme();
  const refresh = usePullToRefresh();
  const [tab, setTab] = useState<'all' | 'foryou'>('all');
  const n = unreadCount();

  // Opening "For you" marks everything there as read.
  useEffect(() => {
    if (tab !== 'foryou' || !S.notifications.some(x => !x.read_at)) return;
    const at = new Date().toISOString();
    S.notifications.forEach(x => { if (!x.read_at) x.read_at = at; });
    emit();
    sb.from('notifications').update({read_at: at}).is('read_at', null).then(() => {});
  }, [tab, S.notifications]);

  if (!S.ready) return <Loading text="Opening your balances…" />;
  const feed = S.activity.filter(a => S.groups[a.group_id]).map(a => ({a, parts: activityParts(a)})).filter(x => x.parts.length);
  return (
    <Screen refresh={refresh}>
      <Title>Activity</Title>
      <Seg value={tab} onChange={setTab} options={[['all', 'All activity'], ['foryou', n ? `For you (${n})` : 'For you']]} />
      {tab === 'all' ? (feed.length ? <View>{feed.map(({a, parts}) => {
        const ic = activityIcon(a), impact = activityImpact(a);
        return (
          <Row key={a.id} style={{alignItems: 'flex-start'}}>
            <CatIcon cat={ic.cat} icon={ic.icon} color={ic.tone === 'owe' ? c.owe : ic.tone ? c.accent : undefined} />
            <View style={{flex: 1, gap: 2}}>
              <Txt>{parts.map((p, i) => <Txt key={i} weight={p.b ? 'bold' : 'body'} muted={p.muted}>{p.t}</Txt>)}</Txt>
              {impact && <Txt small weight="semi" color={impact.pos ? c.owed : c.owe}>{impact.text}</Txt>}
              <Txt small muted>{ago(a.created_at)}</Txt>
            </View>
          </Row>
        );
      })}</View> : <Empty title="Nothing yet" text="Expenses, payments, comments and changes from all your friends and groups show up here." />)
      : (S.notifications.length ? <View>{S.notifications.map(x => {
        const t = noteText(x);
        return (
          <Row key={x.id} style={{alignItems: 'flex-start'}}>
            <CatIcon icon={noteIcon(x)} color={c.accent} />
            <View style={{flex: 1, gap: 2}}>
              <Txt weight="bold">{t.title}</Txt>
              {!!t.body && <Txt small muted>{t.body}</Txt>}
              <Txt small muted>{ago(x.created_at)}</Txt>
            </View>
          </Row>
        );
      })}</View> : <Empty title="You’re all caught up" text="When friends add expenses with you, comment, pay you or send a reminder, it shows up here." />)}
    </Screen>
  );
}
