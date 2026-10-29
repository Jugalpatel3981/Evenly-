// Invite people with a link or QR code. "New link" stops the old one from working.
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'qrcode';
import { useMemo } from 'react';
import { ScrollView, Share, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { run } from '@/lib/actions';
import { inviteUrl } from '@/lib/links';
import { loadAll, S, titleOf, useStore } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { ConfirmButton, FormBar } from '@/ui/controls';
import { Button, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { toast } from '@/ui/toast';

// A QR code drawn as one SVG path: a 1×1 square for every dark module.
function QR({text, size = 220}: {text: string; size?: number}){
  const {path, n} = useMemo(() => {
    const q = QRCode.create(text, {errorCorrectionLevel: 'M'}), n = q.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) d += `M${x + 3} ${y + 3}h1v1h-1z`;
    return {path: d, n: n + 6};
  }, [text]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="QR code for the invite link">
      <Rect width={n} height={n} fill="#ffffff" />
      <Path d={path} fill="#13211c" />
    </Svg>
  );
}

export default function Invite(){
  useStore();
  const {c} = useTheme();
  const {gid} = useLocalSearchParams<{gid: string}>();
  const g = S.groups[gid];
  if (!g?.invite_code) return null;
  const url = inviteUrl(g.invite_code), who = g.is_direct ? titleOf(g) : g.name;
  const copy = async () => { await Clipboard.setStringAsync(url); toast('Copied'); };
  const share = async () => {
    const text = g.is_direct ? `Let’s keep track of what we owe each other on Evenly: ${url}` : `Join “${g.name}” on Evenly to split expenses: ${url}`;
    try { await Share.share({message: text, url, title: 'Evenly'}); }
    catch { await Clipboard.setStringAsync(text); toast('Copied'); }
  };
  const reset = async () => { if (await run(sb.rpc('reset_invite', {p_group: g.id}), 'New link made. The old one no longer works.')) await loadAll(); };
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      <FormBar title={g.is_direct ? `Invite ${who}` : 'Invite people'} onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center'}}>
        <Txt muted>{g.is_direct ? `Send this to ${who}. When they open it and sign in, they’ll see everything you’ve shared.`
          : 'Anyone with this link can join the group after signing in. They can pick their name from the list or join as someone new.'}</Txt>
        <View style={{alignSelf: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.line}}><QR text={url} /></View>
        <View style={{backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12}}>
          <Txt selectable small>{url}</Txt>
        </View>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
          <Button kind="primary" icon="copy" title="Copy link" onPress={copy} />
          <Button icon="share-2" title="Share" onPress={share} />
          <View style={{flex: 1}} />
          <ConfirmButton small kind="plain" icon="refresh-cw" title="New link" onConfirm={reset} />
        </View>
        <Txt small muted>“New link” stops the old one from working.</Txt>
      </ScrollView>
    </View>
  );
}
