// New group, or group settings: name, type, currency, simplify debts, default split, people, leave or delete.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { defaultSummary, MODE_WORDS, run, usedMembers } from '@/lib/actions';
import { GROUP_TYPES } from '@/lib/categories';
import { avatarUrl, defaultCurrency, loadAll, member, membersOf, myBalance, myName, personName, S, uid, useStore, type Member } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { ConfirmButton, FormBar, Select, SwitchRow } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Field, Txt } from '@/ui/kit';
import { CURRENCY_OPTIONS } from '@/ui/options';
import { PersonPicker, type Picked } from '@/ui/person-picker';
import { F, useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

export default function GroupForm(){
  useStore();
  const {gid} = useLocalSearchParams<{gid?: string}>();
  if (gid && !S.groups[gid]) return null;
  return <Form key={gid || 'new'} gid={gid} />;
}

function Tag({text, on}: {text: string; on?: boolean}){
  const {c} = useTheme();
  return <View style={{borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: on ? c.accent + '22' : c.chip}}>
    <Txt small weight="semi" color={on ? c.accent : c.muted} style={{fontSize: 12}}>{text}</Txt></View>;
}
function memberTag(m: Member){
  if (m.user_id === uid()) return <Tag on text="you" />;
  if (m.user_id) return <Tag on text="joined" />;
  if (m.email) return <Tag text="invited" />;
  return <Tag text="not on Evenly" />;
}

function Form({gid}: {gid?: string}){
  const {c} = useTheme();
  const g = gid ? S.groups[gid] : null;
  const used = g ? usedMembers(g.id) : new Set<string>();
  const settled = g ? !Object.values(myBalance(g.id)).some(v => v) : true;
  const [name, setName] = useState(g?.name || '');
  const [type, setType] = useState(g?.type || 'trip');
  const [cur, setCur] = useState(g?.currency || defaultCurrency());
  const [simplifyOn, setSimplify] = useState(!!g?.simplify);
  const [existing, setExisting] = useState<(Member & {removed?: boolean})[]>(g ? membersOf(g.id).map(m => ({...m})) : []);
  const [added, setAdded] = useState<Picked[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(){
    const n = name.trim();
    if (!n) return setHint('Give the group a name.');
    setBusy(true);
    if (!g) {
      const id = await run(sb.rpc('create_group', {p_name: n, p_currency: cur, p_my_name: myName(), p_members: added.map(m => ({name: m.name, email: m.email || null, user: m.user || null}))}));
      if (id) {
        await sb.from('groups').update({type}).eq('id', id as string);
        await loadAll();
        router.replace({pathname: '/group/[id]', params: {id: id as string}});
        toast('Group created. Share the invite link from group settings.');
      }
      setBusy(false);
      return;
    }
    if (existing.some(m => !m.removed && !m.name.trim())) { setHint('Everyone needs a name.'); setBusy(false); return; }
    let ok = true;
    const patch: Record<string, any> = {name: n, currency: cur, type, simplify: simplifyOn};
    if (Object.entries(patch).some(([k, v]) => (g as any)[k] !== v)) ok = !!(await run(sb.from('groups').update(patch).eq('id', g.id))) && ok;
    for (const m of existing) {
      const orig = member(g.id, m.id);
      if (m.removed) ok = !!(await run(sb.from('group_members').delete().eq('id', m.id))) && ok;
      else if (orig && !m.user_id && orig.name !== m.name.trim()) ok = !!(await run(sb.from('group_members').update({name: m.name.trim()}).eq('id', m.id))) && ok;
    }
    for (const m of added) ok = !!(await run(sb.rpc('add_member', {p_group: g.id, p_name: m.name, p_email: m.email || null, p_user: m.user || null}))) && ok;
    setBusy(false);
    if (ok) { router.back(); toast('Saved'); }
  }
  const leave = async () => { if (await run(sb.rpc('leave_group', {p_group: g!.id}), `You left ${g!.name}`)) router.replace('/'); };
  const del = async () => { if (await run(sb.from('groups').delete().eq('id', g!.id), 'Group deleted')) router.replace('/'); };
  const clearDefault = async () => { if (await run(sb.from('groups').update({default_split: null}).eq('id', g!.id), 'Default split cleared')) router.back(); };

  const rowStyle = {flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 8, paddingHorizontal: 12, minHeight: 56};
  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title={g ? 'Group settings' : 'New group'} onClose={() => router.back()} onSave={submit} save={g ? 'Save' : 'Create'} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 40}}>
        <Field label="Group name" value={name} onChangeText={setName} maxLength={60} placeholder="Goa trip, Flat 4B, Friday dinners" autoFocus={!g} />
        <View style={{gap: 6}}>
          <Txt weight="semi" small muted>Type</Txt>
          <View style={{flexDirection: 'row', backgroundColor: c.chip, borderRadius: 12, padding: 4, gap: 4}} accessibilityRole="radiogroup">
            {GROUP_TYPES.map(([k, l, ic]) => (
              <Pressable key={k} onPress={() => setType(k)} accessibilityRole="radio" accessibilityState={{checked: type === k}}
                style={{flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, backgroundColor: type === k ? c.surface : 'transparent'}}>
                <Icon name={ic} size={15} color={type === k ? c.ink : c.muted} /><Txt weight="semi" small color={type === k ? c.ink : c.muted}>{l}</Txt>
              </Pressable>))}
          </View>
        </View>
        <Select label="Default currency" value={cur} options={CURRENCY_OPTIONS} search onChange={setCur} />
        {g && <SwitchRow value={simplifyOn} onChange={setSimplify} title="Simplify debts" sub="Combine debts so everyone settles with as few payments as possible." />}
        {g?.default_split?.mode && (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
            <View style={{flex: 1}}><Txt weight="semi">Default split</Txt>
              <Txt small muted>New expenses start split {MODE_WORDS[g.default_split.mode] || 'equally'}{defaultSummary(g)}.</Txt></View>
            <Button kind="ghost" small title="Clear" onPress={clearDefault} />
          </View>)}

        <View style={{gap: 6}}>
          <Txt weight="semi" small muted>People</Txt>
          <View style={{backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14}}>
            {!g && <View style={rowStyle}><Avatar name={myName()} size={36} /><Txt weight="semi" style={{flex: 1}}>{myName()}</Txt><Tag on text="you" /></View>}
            {existing.map((m, i) => m.removed ? null : (
              <View key={m.id} style={rowStyle}>
                <Avatar name={personName(m)} url={avatarUrl(m)} size={36} />
                <TextInput value={m.user_id ? personName(m) : m.name} editable={!m.user_id} accessibilityLabel="Name" maxLength={40}
                  onChangeText={v => setExisting(existing.map((x, j) => j === i ? {...x, name: v} : x))}
                  style={{flex: 1, fontFamily: F.semi, fontSize: 15, color: c.ink, paddingVertical: 6, borderBottomWidth: m.user_id ? 0 : 1, borderBottomColor: c.line}} />
                {memberTag(m)}
                {!m.user_id && <Button kind="ghost" small title="Remove" disabled={used.has(m.id)}
                  accessibilityLabel={used.has(m.id) ? 'Has expenses in this group' : `Remove ${m.name}`}
                  onPress={() => setExisting(existing.map((x, j) => j === i ? {...x, removed: true} : x))} />}
              </View>))}
            {added.map((m, i) => (
              <View key={'a' + i} style={rowStyle}>
                <Avatar name={m.name} url={m.avatar} size={36} />
                <View style={{flex: 1}}><Txt weight="semi">{m.name}</Txt>{!!m.email && <Txt small muted>{m.email}</Txt>}</View>
                {m.user ? <Tag on text="on Evenly" /> : m.email ? <Tag text="invited" /> : <Tag text="needs invite link" />}
                <Button kind="ghost" small title="Remove" onPress={() => setAdded(added.filter((_, j) => j !== i))} />
              </View>))}
            {g && !existing.some(m => !m.removed) && !added.length && <View style={rowStyle}><Txt muted>Add everyone who shares costs.</Txt></View>}
          </View>
        </View>
        <PersonPicker label="Add people" placeholder="Type a name or email"
          exclude={() => new Set([uid() || '', ...existing.map(m => m.user_id).filter(Boolean) as string[], ...added.map(m => m.user).filter(Boolean) as string[]])}
          inviteLabel={q => `Add “${q}” and invite them later`}
          onPick={m => { setAdded([...added, m]); setHint(null); }} />
        <Txt small muted>Find friends who are on Evenly by name. Anyone else can join with the group’s invite link.</Txt>
        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
        {g && (
          <View style={{flexDirection: 'row', gap: 10, flexWrap: 'wrap'}}>
            <ConfirmButton kind="plain" icon="door-open" title="Leave" armed="Tap again to leave" disabled={!settled} onConfirm={leave} />
            {g.created_by === uid() && <ConfirmButton title="Delete" armed="Tap again: deletes for everyone" onConfirm={del} />}
          </View>)}
        {g && !settled && <Txt small muted>You can leave once your balance in this group is settled.</Txt>}
        {!g && <Button kind="primary" title="Create group" onPress={submit} busy={busy} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
