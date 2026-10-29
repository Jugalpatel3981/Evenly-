// Search friends, groups and expenses.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { GROUP_TYPES } from '@/lib/categories';
import { curOf } from '@/lib/money';
import { friendsIndex, S, titleOf, useStore } from '@/lib/store';
import { fmt, niceDate } from '@/lib/util';
import { FormBar } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Avatar, CatIcon, Label, Row, Txt } from '@/ui/kit';
import { openFriend } from '@/ui/nav';
import { F, useTheme } from '@/ui/theme';

export default function Search(){
  useStore();
  const {c} = useTheme();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const friends = t ? [...friendsIndex().values()].filter(f => f.name.toLowerCase().includes(t)).slice(0, 6) : [];
  const groups = t ? Object.values(S.groups).filter(g => !g.is_direct && g.name.toLowerCase().includes(t)).slice(0, 6) : [];
  const exps = t ? Object.values(S.expenses).filter(e => (e.kind === 'payment' ? 'payment' : (e.description || '')).toLowerCase().includes(t) || (e.notes || '').toLowerCase().includes(t))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20) : [];
  const none = t && !friends.length && !groups.length && !exps.length;
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title="Search" onClose={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <TextInput value={q} onChangeText={setQ} placeholder="Friends, groups or expenses" placeholderTextColor={c.muted} autoFocus accessibilityLabel="Search"
          style={{fontFamily: F.body, fontSize: 16, color: c.ink, backgroundColor: c.field, borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 46}} />
        {friends.length > 0 && <><Label>Friends</Label>{friends.map(f => (
          <Row key={f.key} onPress={() => openFriend(f.key, true)}><Avatar name={f.name} url={f.userId ? S.profiles[f.userId]?.avatar_url : null} /><Txt weight="semi">{f.name}</Txt></Row>))}</>}
        {groups.length > 0 && <><Label>Groups</Label>{groups.map(g => (
          <Row key={g.id} onPress={() => router.replace({pathname: '/group/[id]', params: {id: g.id}})}>
            <View style={{width: 44, height: 44, borderRadius: 22, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={GROUP_TYPES.find(x => x[0] === g.type)?.[2] || 'users'} size={20} color={c.accent} /></View>
            <Txt weight="semi">{g.name}</Txt></Row>))}</>}
        {exps.length > 0 && <><Label>Expenses</Label>{exps.map(e => { const g = S.groups[e.group_id]; return (
          <Row key={e.id} onPress={() => router.replace({pathname: '/expense/[id]', params: {id: e.id}})}>
            {e.kind === 'payment' ? <CatIcon icon="arrow-left-right" color={c.accent} /> : <CatIcon cat={e.category} />}
            <View style={{flex: 1}}><Txt weight="semi">{e.kind === 'payment' ? 'Payment' : e.description}</Txt><Txt small muted>{niceDate(e.date)} · {g ? titleOf(g) : ''}</Txt></View>
            <Txt weight="bold">{fmt(Number(e.amount), curOf(e, g))}</Txt>
          </Row>); })}</>}
        {none && <Txt muted>Nothing matches “{q.trim()}”.</Txt>}
      </ScrollView>
    </View>
  );
}
