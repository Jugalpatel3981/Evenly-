// Account tab: who you are, your name, light or dark, and sign out. More settings arrive in later phases.
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { friendly, loadAll, myName, myProfile, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { Avatar, Button, Card, Field, H2, Hint, LinkText, Screen, Seg, Title, Txt } from '@/ui/kit';
import { setThemePref, useThemePref, type ThemePref } from '@/ui/theme';

const PRIVACY = 'https://evenly-tracker.netlify.app/privacy.html';

export default function AccountTab(){
  const S = useStore();
  const pref = useThemePref();
  const [name, setName] = useState<string | null>(null);
  const [hint, setHint] = useState<{text: string; ok?: boolean} | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = name ?? myName();

  async function saveName(){
    const n = shown.trim();
    if (!n) return setHint({text: 'Enter your name.'});
    setBusy(true);
    const {error} = await sb.rpc('update_my_name', {p_name: n});
    if (!error) await sb.auth.updateUser({data: {name: n}});
    setBusy(false);
    if (error) return setHint({text: friendly(error)});
    setHint({ok: true, text: 'Name updated'}); setName(null); loadAll().catch(() => {});
  }
  const openPrivacy = () => Platform.OS === 'web' ? window.open(PRIVACY, '_blank') : WebBrowser.openBrowserAsync(PRIVACY);

  return (
    <Screen>
      <Title>Account</Title>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
        <Avatar name={myName()} url={myProfile()?.avatar_url} size={64} />
        <View style={{flex: 1}}>
          <H2>{myName()}</H2>
          <Txt muted>{S.session?.user?.email}</Txt>
        </View>
      </View>
      <Card>
        <H2>Your name</H2>
        <Field label="Name friends see" value={shown} onChangeText={t => { setName(t); setHint(null); }} maxLength={40} autoComplete="name" />
        <Hint text={hint?.text} ok={hint?.ok} />
        <Button kind="primary" title="Save name" onPress={saveName} busy={busy} disabled={name == null || name.trim() === myName()} />
      </Card>
      <Card>
        <H2>Appearance</H2>
        <Seg<ThemePref> value={pref} onChange={setThemePref} options={[['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']]} />
        <Txt small muted>Automatic follows your phone’s setting.</Txt>
      </Card>
      <Card>
        <Button title="Sign out" icon="log-out" onPress={() => sb.auth.signOut()} />
        <LinkText small title="Privacy policy" onPress={openPrivacy} />
      </Card>
    </Screen>
  );
}
