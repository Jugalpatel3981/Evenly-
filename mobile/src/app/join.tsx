// Joining a group (or a friend's ledger) from an invite link: pick who you are, then join.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { setInvite } from '@/lib/pending';
import { friendly, loadAll, myName } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { FormBar } from '@/ui/controls';
import { Avatar, Button, Loading, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

type Info = {group_id: string; name: string; is_direct: boolean; already_member: boolean; inviter: string | null; members: {id: string; name: string; joined: boolean}[]};

export default function Join(){
  const {c} = useTheme();
  const {code} = useLocalSearchParams<{code: string}>();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null), [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    sb.rpc('invite_info', {p_code: code}).then(async ({data, error}) => {
      setInvite(null);
      if (!live) return;
      if (error) { setErr(friendly(error)); return; }
      const d = data as Info | null;
      if (d?.already_member) { await loadAll(); router.replace({pathname: '/group/[id]', params: {id: d.group_id}}); toast('You’re already in this group'); return; }
      if (d) { const open = d.members.filter(m => !m.joined); setPick(d.is_direct ? open[0]?.id ?? null : open.length ? null : ''); }
      setInfo(d);
    });
    return () => { live = false; };
  }, [code]);

  async function join(){
    if (pick == null) return setHint('Choose who you are.');
    setBusy(true);
    const {data: gid, error} = await sb.rpc('join_group', {p_code: code, p_member: pick || null, p_my_name: myName()});
    setBusy(false);
    if (error) return setHint(friendly(error));
    await loadAll();
    router.replace({pathname: '/group/[id]', params: {id: gid as string}});
    toast(info!.is_direct ? 'You’re connected' : `Welcome to ${info!.name}`);
  }

  if (info === undefined && !err) return <Loading text="Checking the invite…" />;
  const title = err ? 'Invite' : !info ? 'Invite link expired' : info.is_direct ? `${info.inviter || 'A friend'} wants to split expenses with you` : `Join ${info.name}`;
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title={title} onClose={() => router.replace('/')} />
      <ScrollView contentContainerStyle={{padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        {err ? <Txt>{err}</Txt> : !info ? <Txt>This invite link isn’t valid any more. Ask your friend for a new one.</Txt> : <>
          <Txt muted>{info.is_direct ? 'You’ll both see the same expenses and balance.' : `${info.members.length} people in this group. Are you one of them?`}</Txt>
          <View accessibilityRole="radiogroup">
            {info.members.filter(m => !m.joined).map(m => <Option key={m.id} id={m.id} name={m.name} title={`I’m ${m.name}`} pick={pick} setPick={setPick} />)}
            {!info.is_direct && <Option id="" name={myName()} title="I’m someone new" sub={`Join as ${myName()}`} pick={pick} setPick={setPick} />}
          </View>
          {!!hint && <Txt small color={c.owe}>{hint}</Txt>}
          <Button kind="primary" title="Join" onPress={join} busy={busy} />
        </>}
      </ScrollView>
    </View>
  );
}

function Option({id, name, title, sub, pick, setPick}: {id: string; name: string; title: string; sub?: string; pick: string | null; setPick: (v: string) => void}){
  const {c} = useTheme();
  return (
    <Pressable onPress={() => setPick(id)} accessibilityRole="radio" accessibilityState={{checked: pick === id}}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: pressed ? c.hover : 'transparent'})}>
      <View style={{width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: pick === id ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center'}}>
        {pick === id && <View style={{width: 11, height: 11, borderRadius: 6, backgroundColor: c.accent}} />}</View>
      <Avatar name={name} size={40} />
      <View style={{flex: 1}}><Txt weight="semi">{title}</Txt>{!!sub && <Txt small muted>{sub}</Txt>}</View>
    </Pressable>
  );
}
