// Once signed in and loaded: open a pending invite, or the expense or group a notification pointed at.
import { router } from 'expo-router';
import { useEffect, useReducer, useRef } from 'react';

import { onPending, pendingInvite, takeOpen } from '@/lib/pending';
import { S, useStore } from '@/lib/store';

import { toast } from './toast';

export function Targets(){
  const st = useStore();
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  const shown = useRef<string | null>(null);
  useEffect(() => onPending(bump), []);
  useEffect(() => {
    if (!st.session || !st.ready) return;
    const code = pendingInvite();
    if (code) { if (shown.current !== code) { shown.current = code; router.push({pathname: '/join', params: {code}}); } return; }
    const t = takeOpen(); if (!t) return;
    if (t.type === 'open' && S.expenses[t.id]) router.push({pathname: '/expense/[id]', params: {id: t.id}});
    else if (t.type === 'group' && S.groups[t.id]) router.push({pathname: '/group/[id]', params: {id: t.id}});
    else if (t.type === 'open') { router.push('/activity'); toast('That expense has been deleted.'); }
  }, [st.session, st.ready, tick]);
  return null;
}
