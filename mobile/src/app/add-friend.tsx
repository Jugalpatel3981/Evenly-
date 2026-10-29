// Add a friend: search everyone on Evenly by name, or add someone who isn't on Evenly yet.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { defaultCurrency, friendly, friendsIndex, loadAll, myName, uid } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { FormBar } from '@/ui/controls';
import { Txt } from '@/ui/kit';
import { PersonPicker, type Picked } from '@/ui/person-picker';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

export default function AddFriend(){
  const {c} = useTheme();
  // then=expense: go straight on to add an expense with the new friend.
  const {then} = useLocalSearchParams<{then?: string}>();
  const [hint, setHint] = useState<string | null>(null);
  const [known] = useState(() => new Set([...friendsIndex().values()].filter(f => f.ledger && f.userId).map(f => f.userId)));

  async function pick(m: Picked){
    setHint(null);
    const {data: id, error} = await sb.rpc('add_friend', {p_my_name: myName(), p_name: m.name, p_email: m.email || null, p_currency: defaultCurrency(), p_friend_user: m.user || null});
    if (error) return setHint(friendly(error));
    await loadAll();
    if (!m.user && !m.email) {
      // Not on Evenly: show the invite link straight away.
      router.replace({pathname: '/group/[id]', params: {id: id as string}});
      router.push({pathname: '/invite', params: {gid: id as string}});
      return;
    }
    if (then === 'expense') router.replace({pathname: '/expense-form', params: {gid: id as string}});
    else router.replace({pathname: '/group/[id]', params: {id: id as string}});
    toast(m.user ? (known.has(m.user) ? `You and ${m.name} are already friends` : `Connected with ${m.name}`)
      : `${m.name} added. They’re connected when they sign up with ${m.email}.`);
  }
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title="Add a friend" onClose={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <PersonPicker label="Find your friend" placeholder="Type their name or email" autoFocus exclude={() => new Set([uid() || ''])}
          inviteLabel={q => `Invite “${q}” with a link`} onPick={pick} />
        <Txt small muted>Search everyone on Evenly by name. Not on Evenly yet? You can send them a link.</Txt>
        {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
      </ScrollView>
    </View>
  );
}
