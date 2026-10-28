// Groups tab: every group with my balance in it, under the total card.
import { View } from 'react-native';

import { between } from '@/lib/money';
import { expOf, groupList, membersOf, myBalance, myId, personName, useStore, type Group } from '@/lib/store';
import { PersonLines, RightLabel, TotalCard } from '@/ui/balances';
import { Empty, GroupAvatar, Hint, Loading, Row, Screen, Title, Txt } from '@/ui/kit';
import { usePullToRefresh } from '@/ui/refresh';

// What each member and I owe each other in this group, at most `max` lines.
function GroupLines({g, max = 2}: {g: Group; max?: number}){
  const me = myId(g.id); if (!me) return null;
  const exps = expOf(g.id);
  const lines = membersOf(g.id).filter(m => m.id !== me)
    .map(m => ({m, amt: between(exps, g, me, m.id)})).filter(x => Object.values(x.amt).some(v => v));
  return <>
    {lines.slice(0, max).map(x => <PersonLines key={x.m.id} name={personName(x.m)} amt={x.amt} />)}
    {lines.length > max && <Txt small muted>Plus {lines.length - max} more balance{lines.length - max > 1 ? 's' : ''}</Txt>}
  </>;
}

export default function GroupsTab(){
  const S = useStore();
  const refresh = usePullToRefresh();
  if (!S.ready) return <Loading text="Opening your balances…" />;
  const groups = groupList().filter(g => !g.is_direct);
  return (
    <Screen refresh={refresh}>
      <Title>Groups</Title>
      <Hint text={S.loadError} />
      {!groups.length ? <Empty title="Split with a group" text="Make a group for a trip, your flat or a dinner. Everyone you add sees the same expenses and balances." /> : <>
        <TotalCard />
        <View>
          {groups.map(g => {
            const empty = !expOf(g.id).length;
            return (
              <Row key={g.id} accessibilityLabel={g.name}>
                <GroupAvatar type={g.type} cover={g.cover_url} />
                <View style={{flex: 1, gap: 2}}>
                  <Txt weight="semi" style={{fontSize: 16}}>{g.name}</Txt>
                  {empty ? <Txt small muted>No expenses yet</Txt> : <GroupLines g={g} />}
                </View>
                {!empty && <RightLabel map={myBalance(g.id)} they="you are owed" />}
              </Row>
            );
          })}
        </View>
      </>}
    </Screen>
  );
}
