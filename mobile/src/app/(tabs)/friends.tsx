// Friends tab: everyone I share expenses with, one row each, with what we owe each other overall.
import { View } from 'react-native';

import { friendsIndex, myBalance, S as State, useStore } from '@/lib/store';
import { PersonLines, RightLabel, TotalCard } from '@/ui/balances';
import { Avatar, Empty, Hint, Loading, Row, Screen, Title, Txt } from '@/ui/kit';
import { usePullToRefresh } from '@/ui/refresh';

export default function FriendsTab(){
  const S = useStore();
  const refresh = usePullToRefresh();
  if (!S.ready) return <Loading text="Opening your balances…" />;
  const settled = (m: Record<string, number>) => !Object.values(m).some(v => v);
  const friends = [...friendsIndex().values()].sort((a, b) => Number(settled(a.total)) - Number(settled(b.total)) || a.name.localeCompare(b.name));
  return (
    <Screen refresh={refresh}>
      <Title>Friends</Title>
      <Hint text={S.loadError} />
      {!friends.length ? <Empty title="Split with one friend" text="Paid for a friend’s coffee or a cab? Add them and keep track between just the two of you, no group needed." /> : <>
        <TotalCard />
        <View>
          {friends.map(f => {
            const inGroups = f.groups.filter(x => Object.values(x.amt).some(v => v));
            return (
              <Row key={f.key} accessibilityLabel={f.name}>
                <Avatar name={f.name} url={f.userId ? State.profiles[f.userId]?.avatar_url : null} size={46} />
                <View style={{flex: 1, gap: 2}}>
                  <Txt weight="semi" style={{fontSize: 16}}>{f.name}</Txt>
                  {!f.userId && <Txt small muted>{f.email ? 'Invited' : 'Not on Evenly yet'}</Txt>}
                  {f.ledger && inGroups.length > 0 && <PersonLines name={f.name} amt={myBalance(f.ledger)} where="outside groups" />}
                  {inGroups.slice(0, 2).map(x => <PersonLines key={x.gid} name={f.name} amt={x.amt} where={`in ${State.groups[x.gid].name}`} />)}
                </View>
                <RightLabel map={f.total} />
              </Row>
            );
          })}
        </View>
      </>}
    </Screen>
  );
}
