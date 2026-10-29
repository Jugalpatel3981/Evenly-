// Search-as-you-type over Evenly accounts. onPick gets {user, name, avatar} for an account,
// {email, name} for a typed email, or {name} for someone who isn't on Evenly yet. Mirrors personPicker() on the website.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { friendly } from '@/lib/store';
import { sb } from '@/lib/supabase';
import { validEmail } from '@/lib/util';

import { Icon } from './icons';
import { Avatar, Field, Row, Txt } from './kit';
import { useTheme } from './theme';

export type Picked = {user?: string; email?: string; name: string; avatar?: string | null};
type Found = {id: string; name: string; avatar_url: string | null; hint: string; shared: boolean};

export function PersonPicker({label, placeholder, onPick, exclude, inviteLabel, autoFocus}: {label: string; placeholder: string;
  onPick: (p: Picked) => void; exclude: () => Set<string>; inviteLabel: (q: string) => string; autoFocus?: boolean}){
  const {c} = useTheme();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim(), mine = ++seq.current;
    if (text.length < 2) return;
    const t = setTimeout(async () => {
      const {data, error: err} = await sb.rpc('search_people', {p_q: text});
      if (mine !== seq.current) return;          // a newer search has started
      setFound(err ? [] : (data as Found[]) || []);
      // Say so if search itself failed, rather than looking like nobody matched.
      setError(err ? friendly(err) : null);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const text = q.trim(), looksEmail = validEmail(text.toLowerCase());
  // Results only count while two or more letters are typed.
  const hits = text.length >= 2 ? found : [], err = text.length >= 2 ? error : null;
  const shown = hits.filter(p => !exclude().has(p.id));
  const pick = (p: Picked) => { onPick(p); setQ(''); setFound([]); };
  const first = () => {
    if (shown[0]) return pick({user: shown[0].id, name: shown[0].name, avatar: shown[0].avatar_url});
    if (text && looksEmail && !hits.length) return pickEmail();
    if (text && !looksEmail && text.length >= 2) pick({name: text.slice(0, 40)});
  };
  const pickEmail = () => {
    const local = text.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    pick({email: text.toLowerCase(), name: local.slice(0, 40)});
  };
  const iconBox = (name: string) => <View style={{width: 44, height: 44, borderRadius: 22, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center'}}>
    <Icon name={name} size={20} color={c.accent} /></View>;

  return (
    <View style={{gap: 6}}>
      <Field label={label} value={q} onChangeText={setQ} placeholder={placeholder} autoComplete="off" autoCorrect={false} autoCapitalize="words"
        autoFocus={autoFocus} onSubmitEditing={first} returnKeyType="search" />
      <View>
        {!!err && <Txt small color={c.owe} style={{paddingVertical: 8}}>{err}</Txt>}
        {shown.map(p => (
          <Row key={p.id} onPress={() => pick({user: p.id, name: p.name, avatar: p.avatar_url})} accessibilityLabel={`Add ${p.name}`}>
            <Avatar name={p.name} url={p.avatar_url} />
            <View style={{flex: 1}}><Txt weight="semi">{p.name}</Txt><Txt small muted>{p.hint}{p.shared ? ' · in your groups' : ''}</Txt></View>
            <View style={{backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6}}><Txt small weight="semi" color={c.accentInk}>Add</Txt></View>
          </Row>
        ))}
        {!!text && looksEmail && !hits.length && (
          <Row onPress={pickEmail}>{iconBox('mail')}
            <View style={{flex: 1}}><Txt weight="semi">Add {text}</Txt><Txt small muted>Not on Evenly yet. They’re connected when they sign up with this email.</Txt></View></Row>
        )}
        {!!text && !looksEmail && text.length >= 2 && (
          <Row onPress={() => pick({name: text.slice(0, 40)})}>{iconBox('share-2')}
            <View style={{flex: 1}}><Txt weight="semi">{inviteLabel(text)}</Txt><Txt small muted>Not on Evenly yet? Send them a link to join.</Txt></View></Row>
        )}
      </View>
    </View>
  );
}
