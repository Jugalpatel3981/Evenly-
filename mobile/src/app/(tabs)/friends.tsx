// Friends tab: everyone I share expenses with, one row each, with what we owe each other overall.
import { router } from 'expo-router';
import { View } from 'react-native';

import { friendsIndex, myBalance, passes, S as State, useStore } from '@/lib/store';
import { PersonLines, RightLabel, TotalCard } from '@/ui/balances';
import { AppBar, Avatar, Button, Chevron, Empty, Fab, Hint, IconButton, Loading, Row, Screen, Title, Txt } from '@/ui/kit';
import { openFriend } from '@/ui/nav';
import { usePullToRefresh } from '@/ui/refresh';

export default function FriendsTab(){
  const S = useStore();
  const refresh = usePullToRefresh();
  if (!S.ready) return <Loading text="Opening your balances…" />;
  const settled = (m: Record<string, number>) => !Object.values(m).some(v => v);
  const friends = [...friendsIndex().values()].sort((a, b) => Number(settled(a.total)) - Number(settled(b.total)) || a.name.localeCompare(b.name));
  const shown = friends.filter(f => passes(f.total));
  return (
    <View style={{flex: 1}}>
      <Screen refresh={refresh}>
        <AppBar left={<IconButton icon="search" label="Search" onPress={() => router.push('/search')} />}
          right={<Button kind="ghost" small icon="user-plus" title="Add friends" onPress={() => router.push('/add-friend')} />} />
        <Title>Friends</Title>
        <Hint text={S.loadError} />
        {!friends.length ? <Empty title="Split with one friend" text="Paid for a friend’s coffee or a cab? Add them and keep track between just the two of you, no group needed."
          action={<Button kind="primary" icon="user-plus" title="Add a friend" onPress={() => router.push('/add-friend')} />} /> : <>
          <TotalCard />
          <View>
            {shown.map(f => {
              const inGroups = f.groups.filter(x => Object.values(x.amt).some(v => v));
              return (
                <Row key={f.key} accessibilityLabel={f.name} onPress={() => openFriend(f.key)}>
                  <Avatar name={f.name} url={f.userId ? State.profiles[f.userId]?.avatar_url : null} size={46} />
                  <View style={{flex: 1, gap: 2}}>
                    <Txt weight="semi" style={{fontSize: 16}}>{f.name}</Txt>
                    {!f.userId && <Txt small muted>{f.email ? 'Invited' : 'Not on Evenly yet'}</Txt>}
                    {f.ledger && inGroups.length > 0 && <PersonLines name={f.name} amt={myBalance(f.ledger)} where="outside groups" />}
                    {inGroups.slice(0, 2).map(x => <PersonLines key={x.gid} name={f.name} amt={x.amt} where={`in ${State.groups[x.gid].name}`} />)}
                  </View>
                  <RightLabel map={f.total} />
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
