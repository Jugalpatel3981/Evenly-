// A person you only share groups with: no one-to-one ledger yet. Shows the groups, and offers an expense just between you.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ensureLedger } from '@/lib/actions';
import { friendly, friendsIndex, loadAll, S, useStore } from '@/lib/store';
import { PersonLines } from '@/ui/balances';
import { Chip } from '@/ui/controls';
import { Avatar, Button, Empty, Screen, Title, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

import { Banner } from '../group/[id]';

export default function FriendPage(){
  useStore();
  const {c} = useTheme();
  const {key} = useLocalSearchParams<{key: string}>();
  const f = friendsIndex().get(key);
  const [busy, setBusy] = useState(false);
  if (!f) return <Screen top={false}><Banner back="friends" /><Empty title="Not found" text="This person isn’t in any of your groups any more." /></Screen>;
  // Once a one-to-one ledger exists (say, after the first expense), show that instead.
  if (f.ledger) return <Redirect href={{pathname: '/group/[id]', params: {id: f.ledger}}} />;
  const lines = f.groups.filter(x => Object.values(x.amt).some(v => v));
  const add = async () => {
    setBusy(true);
    try { const gid = await ensureLedger(f); await loadAll(); router.push({pathname: '/expense-form', params: {gid}}); }
    catch (err) { toast(friendly(err)); }
    setBusy(false);
  };
  return (
    <Screen top={false}>
      <Banner back="friends" />
      <View style={{marginTop: -64, gap: 6}}>
        <View style={{borderWidth: 4, borderColor: c.bg, backgroundColor: c.bg, borderRadius: 50, alignSelf: 'flex-start'}}>
          <Avatar name={f.name} url={f.userId ? S.profiles[f.userId]?.avatar_url : null} size={84} /></View>
        <Title style={{fontSize: 28, lineHeight: 34}}>{f.name}</Title>
        <View style={{gap: 2}}>
          {lines.length ? lines.map(x => <PersonLines key={x.gid} big name={f.name} amt={x.amt} where={`in ${S.groups[x.gid].name}`} />)
            : <Txt muted style={{fontSize: 16}}>You’re all settled up.</Txt>}
        </View>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {f.groups.map(x => <Chip key={x.gid} title={S.groups[x.gid].name} onPress={() => router.push({pathname: '/group/[id]', params: {id: x.gid}})} />)}
      </View>
      <Empty title="Nothing just between you two" text={`Add an expense with ${f.name} that isn’t part of a group, like a coffee or a cab.`}
        action={<Button kind="primary" title={`Add an expense with ${f.name}`} onPress={add} busy={busy} />} />
    </Screen>
  );
}
