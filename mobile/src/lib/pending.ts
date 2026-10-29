// Things to open once the person is signed in and their data has loaded: an invite to join, or an expense or group from a notification.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { readTarget, type Target } from './links';

const KEY = 'evenly.invite';     // the same key the website used, so an invite opened there still works here
let invite: string | null = null, open: Target | null = null;
const subs = new Set<() => void>();
const changed = () => subs.forEach(s => s());
export const onPending = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

AsyncStorage.getItem(KEY).then(v => { if (v && !invite) { invite = v; changed(); } }).catch(() => {});

// Web: read #join-, #open- or #group- from the address once, then tidy it away.
if (Platform.OS === 'web' && typeof window !== 'undefined') takeLink(window.location.href, true);

export function takeLink(link: string, clean = false){
  const t = readTarget(link); if (!t) return false;
  if (t.type === 'join') setInvite(t.id); else { open = t; changed(); }
  if (clean && Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}
export function setInvite(code: string | null){
  invite = code; changed();
  (code ? AsyncStorage.setItem(KEY, code) : AsyncStorage.removeItem(KEY)).catch(() => {});
}
export const pendingInvite = () => invite;
export function takeOpen(){ const t = open; open = null; return t; }
export const hasOpen = () => !!open;
