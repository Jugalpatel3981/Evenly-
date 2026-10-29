// Friend settings for a one-to-one ledger: their name and email (until they join), currency, remove friend.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { run } from '@/lib/actions';
import { friendOf, loadAll, myBalance, S, uid, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { validEmail } from '@/lib/util';
import { ConfirmButton, FormBar, Select } from '@/ui/controls';
import { Field, Txt } from '@/ui/kit';
import { CURRENCY_OPTIONS } from '@/ui/options';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

export default function FriendForm(){
  useStore();
  const {gid} = useLocalSearchParams<{gid: string}>();
  if (!S.groups[gid]) return null;
  return <Form gid={gid} />;
}

function Form({gid}: {gid: string}){
  const {c} = useTheme();
  const g = S.groups[gid], f = friendOf(g.id);
  const settled = !Object.values(myBalance(g.id)).some(v => v);
  const [name, setName] = useState(f?.name || ''), [email, setEmail] = useState(f?.email || ''), [cur, setCur] = useState(g.currency);
  const [hint, setHint] = useState<string | null>(null), [busy, setBusy] = useState(false);

  async function submit(){
    const n = name.trim(), em = email.trim().toLowerCase();
    if (!n) return setHint('Enter your friend’s name.');
    if (em && !validEmail(em)) return setHint('That email doesn’t look right.');
    if (em && em === (S.session?.user.email || '').toLowerCase()) return setHint('That’s your own email. Enter your friend’s.');
    setHint(null); setBusy(true);
    let ok = true;
    const emailAdded = !!(f && !f.user_id && em && em !== (f.email || ''));
    if (f && !f.user_id && (n !== f.name || (em || null) !== (f.email || null)))
      ok = !!(await run(sb.from('group_members').update({name: n, email: em || null}).eq('id', f.id))) && ok;
    if (cur !== g.currency) ok = !!(await run(sb.from('groups').update({currency: cur}).eq('id', g.id))) && ok;
    setBusy(false);
    if (!ok) return;
    router.back();
    if (emailAdded) {
      await loadAll();
      const linked = Object.values(S.members).flat().some(m => m.email === em && m.user_id && m.user_id !== uid());
      toast(linked ? `Connected: ${n} can see your expenses now` : `Saved. ${n} will be connected when they sign up with ${em}.`);
    } else toast('Saved');
  }
  async function remove(){
    const ok = g.created_by === uid() ? await run(sb.from('groups').delete().eq('id', g.id), 'Friend removed') : await run(sb.rpc('leave_group', {p_group: g.id}), 'Friend removed');
    if (ok) router.replace('/friends');
  }

  return (
    <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormBar title="Friend settings" onClose={() => router.back()} onSave={submit} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <Field label="Friend’s name" value={f?.user_id ? (S.profiles[f.user_id]?.name || name) : name} onChangeText={setName} maxLength={40} placeholder="Rahul Mehta" editable={!f?.user_id} />
        <Field label="Their email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="rahul@example.com" editable={!f?.user_id} />
        <Txt small muted>{f?.user_id ? 'They’re on Evenly and see everything you share.' : 'Their email connects you. If they’re already on Evenly they see your expenses straight away and get notified. If not, everything appears when they sign up with this email.'}</Txt>
        <Select label="Default currency" value={cur} options={CURRENCY_OPTIONS} search onChange={setCur} />
        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
        <ConfirmButton title="Remove friend" disabled={!settled} onConfirm={remove} style={{alignSelf: 'flex-start'}} />
        {!settled && <Txt small muted>You can remove a friend once you’re settled up.</Txt>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
