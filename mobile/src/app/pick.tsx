// "Add an expense with…": a new friend, a new group, one or more friends, or a group.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ensureLedger } from '@/lib/actions';
import { GROUP_TYPES } from '@/lib/categories';
import { friendly, friendsIndex, loadAll, membersOf, S, useStore } from '@/lib/store';
import { FormBar } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Avatar, Button, H2, Row, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

export default function Pick(){
  useStore();
  const {c} = useTheme();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const friends = [...friendsIndex().values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = Object.values(S.groups).filter(g => !g.is_direct).sort((a, b) => a.name.localeCompare(b.name));
  const circle = (icon: string, size = 44) => <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center'}}>
    <Icon name={icon} size={20} color={c.accent} /></View>;

  async function go(){
    if (sel.length === 1) {
      setBusy(true);
      try { const gid = await ensureLedger(friendsIndex().get(sel[0])!); await loadAll(); router.replace({pathname: '/expense-form', params: {gid}}); }
      catch (err) { toast(friendly(err)); }
      setBusy(false);
    } else router.replace({pathname: '/multi', params: {keys: sel.join(',')}});
  }
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title="Add an expense with…" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{padding: 16, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 40}}>
        <Row onPress={() => router.replace({pathname: '/add-friend', params: {then: 'expense'}})}>{circle('user-plus')}
          <View><Txt weight="semi">A new friend</Txt><Txt small muted>Just the two of you</Txt></View></Row>
        <Row onPress={() => router.replace('/group-form')}>{circle('users')}
          <View><Txt weight="semi">A new group</Txt><Txt small muted>Trip, flat, dinner</Txt></View></Row>
        {friends.length > 0 && <>
          <H2 style={{fontSize: 17, marginTop: 6}}>Friends <Txt small muted>· tick one or more</Txt></H2>
          {friends.map(f => {
            const on = sel.includes(f.key);
            return (
              <Pressable key={f.key} onPress={() => setSel(on ? sel.filter(k => k !== f.key) : [...sel, f.key])} accessibilityRole="checkbox" accessibilityState={{checked: on}}
                style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12, backgroundColor: pressed ? c.hover : 'transparent'})}>
                <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                  {on && <Icon name="check" size={14} color={c.accentInk} strokeWidth={3} />}</View>
                <Avatar name={f.name} url={f.userId ? S.profiles[f.userId]?.avatar_url : null} />
                <Txt weight="semi">{f.name}</Txt>
              </Pressable>);
          })}
          <Button kind="primary" disabled={!sel.length} busy={busy} onPress={go}
            title={sel.length === 0 ? 'Choose friends above' : sel.length === 1 ? 'Continue with 1 friend' : `Continue with ${sel.length} friends`} />
        </>}
        {groups.length > 0 && <>
          <H2 style={{fontSize: 17, marginTop: 6}}>Groups</H2>
          {groups.map(g => (
            <Row key={g.id} onPress={() => router.replace({pathname: '/expense-form', params: {gid: g.id}})}>
              {circle(GROUP_TYPES.find(t => t[0] === g.type)?.[2] || 'users')}
              <View><Txt weight="semi">{g.name}</Txt><Txt small muted>{membersOf(g.id).length} people</Txt></View>
            </Row>))}
        </>}
      </ScrollView>
    </View>
  );
}
