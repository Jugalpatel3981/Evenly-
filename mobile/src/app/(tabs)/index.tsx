// Groups tab: every group with my balance in it, under the total card.
import { router } from 'expo-router';
import { View } from 'react-native';

import { expOf, groupList, myBalance, passes, useStore } from '@/lib/store';
import { GroupLines, RightLabel, TotalCard } from '@/ui/balances';
import { AppBar, Button, Chevron, Empty, Fab, GroupAvatar, Hint, IconButton, Loading, Row, Screen, Title, Txt } from '@/ui/kit';
import { PushBanner } from '@/ui/push-ui';
import { usePullToRefresh } from '@/ui/refresh';

export default function GroupsTab(){
  const S = useStore();
  const refresh = usePullToRefresh();
  if (!S.ready) return <Loading text="Opening your balances…" />;
  const groups = groupList().filter(g => !g.is_direct);
  const shown = groups.filter(g => passes(myBalance(g.id)));
  return (
    <View style={{flex: 1}}>
      <Screen refresh={refresh}>
        <AppBar left={<IconButton icon="search" label="Search" onPress={() => router.push('/search')} />}
          right={<Button kind="ghost" small icon="users" title="Create group" onPress={() => router.push('/group-form')} />} />
        <Title>Groups</Title>
        <PushBanner />
        <Hint text={S.loadError} />
        {!groups.length ? <Empty title="Split with a group" text="Make a group for a trip, your flat or a dinner. Everyone you add sees the same expenses and balances."
          action={<Button kind="primary" icon="plus" title="Create a group" onPress={() => router.push('/group-form')} />} /> : <>
          <TotalCard />
          <View>
            {shown.map(g => {
              const empty = !expOf(g.id).length;
              return (
                <Row key={g.id} accessibilityLabel={g.name} onPress={() => router.push({pathname: '/group/[id]', params: {id: g.id}})}>
                  <GroupAvatar type={g.type} cover={g.cover_url} />
                  <View style={{flex: 1, gap: 2}}>
                    <Txt weight="semi" style={{fontSize: 16}}>{g.name}</Txt>
                    {empty ? <Txt small muted>No expenses yet</Txt> : <GroupLines g={g} />}
                  </View>
                  {!empty && <RightLabel map={myBalance(g.id)} they="you are owed" />}
                  <Chevron />
                </Row>
              );
            })}
            {!shown.length && <Txt muted style={{padding: 12}}>Nobody matches this filter.</Txt>}
          </View>
        </>}
      </Screen>
      <Fab inset={false} onPress={() => router.push('/pick')} />
    </View>
  );
}
