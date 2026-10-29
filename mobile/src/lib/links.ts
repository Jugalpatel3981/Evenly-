// Links into the app: the site address, invite links, and the #open-/#group-/#join- targets used by notifications.
import { Platform } from 'react-native';

export const SITE = 'https://evenly-tracker.netlify.app';
export const siteUrl = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : SITE);
export const inviteUrl = (code: string) => `${siteUrl()}/#join-${code}`;

export type Target = {type: 'open' | 'group' | 'join'; id: string};
// "#open-<expense>", "#group-<group>" or "#join-<invite code>" at the end of a link.
export function readTarget(link?: string | null): Target | null {
  const t = String(link || '').match(/#(open|group)-([0-9a-f-]{36})/i);
  if (t) return {type: t[1].toLowerCase() as 'open' | 'group', id: t[2]};
  const j = String(link || '').match(/#join-([a-f0-9]{8,32})$/i);
  return j ? {type: 'join', id: j[1]} : null;
}
