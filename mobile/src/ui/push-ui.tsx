// Turning phone notifications on and off: the banner on the main tabs and the switch in Account.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { disablePush, enablePush, pushStatus, type PushStatus } from '@/lib/push';
import { friendly, uid } from '@/lib/store';

import { Icon } from './icons';
import { Button, Txt } from './kit';
import { useTheme } from './theme';
import { toast } from './toast';

const ASKED = 'evenly.pushAsked';
let status: PushStatus | null = null, asked = true;
const subs = new Set<() => void>();
const set = (s: Partial<{status: PushStatus; asked: boolean}>) => { if (s.status) status = s.status; if (s.asked != null) asked = s.asked; subs.forEach(f => f()); };
export const refreshPush = () => pushStatus().then(s => set({status: s})).catch(() => set({status: 'unsupported'}));
AsyncStorage.getItem(ASKED).then(v => set({asked: !!v})).catch(() => {});
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
function usePush(){
  const s = useSyncExternalStore(subscribe, () => status, () => status);
  const a = useSyncExternalStore(subscribe, () => asked, () => asked);
  useEffect(() => { if (status == null) refreshPush(); }, []);
  return {status: s, asked: a};
}
const later = () => { AsyncStorage.setItem(ASKED, '1').catch(() => {}); set({asked: true}); };
export async function turnOn(){
  try { await enablePush(uid()!); later(); toast('Notifications are on for this device'); }
  catch (err) { toast(friendly(err)); }
  refreshPush();
}
async function turnOff(){
  try { await disablePush(); toast('Notifications are off for this device'); } catch (err) { toast(friendly(err)); }
  refreshPush();
}

export function pushHelp(st: PushStatus | null){
  return st === 'on' ? 'On for this device.' : st === 'blocked' ? 'Blocked in your settings. Allow notifications for Evenly, then come back.'
    : st === 'install' ? 'On iPhone: tap Share, then Add to Home Screen, and open Evenly from there to turn these on.'
    : st === 'unsupported' ? 'This device can’t show notifications from Evenly.' : 'Get an alert on this device when friends add expenses with you.';
}

// The "Phone notifications" row in Account.
export function PushRow(){
  const {status: st} = usePush();
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
      <View style={{flex: 1, minWidth: 180}}><Txt weight="semi">Phone notifications</Txt><Txt small muted>{pushHelp(st)}</Txt></View>
      {st === 'on' && <Button small title="Turn off" onPress={turnOff} />}
      {st === 'off' && <Button small kind="primary" title="Turn on" onPress={turnOn} />}
    </View>
  );
}

// Shown once on the main tabs until the person turns notifications on or says not now.
export function PushBanner(){
  const {c} = useTheme();
  const {status: st, asked: a} = usePush();
  if (a || (st !== 'off' && st !== 'install')) return null;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accent + '1a', borderRadius: 14, padding: 12, flexWrap: 'wrap'}}>
      <Icon name={st === 'install' ? 'smartphone' : 'bell'} size={18} color={c.accent} />
      <Txt small style={{flex: 1, minWidth: 180}}>{st === 'install' ? 'To get notifications on iPhone, tap Share then Add to Home Screen, and open Evenly from your Home Screen.'
        : 'Get a notification when friends add an expense with you.'}</Txt>
      <View style={{flexDirection: 'row', gap: 6}}>
        {st === 'off' && <Button small kind="primary" title="Turn on" onPress={turnOn} />}
        <Button small kind="ghost" title={st === 'install' ? 'OK' : 'Not now'} onPress={later} />
      </View>
    </View>
  );
}
