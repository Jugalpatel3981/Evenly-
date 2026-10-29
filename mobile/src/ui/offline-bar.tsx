// "You're offline" at the top of the pages, with how many changes are waiting to sync.
import { View } from 'react-native';

import { isOnline } from '@/lib/net';
import { useStore } from '@/lib/store';

import { Icon } from './icons';
import { Txt } from './kit';
import { useTheme } from './theme';

export function OfflineBar(){
  const S = useStore();
  const {c} = useTheme();
  const n = S.outbox.length, off = S.offline || !isOnline();
  if (!S.session || (!off && !n)) return null;
  return (
    <View accessibilityRole="alert" style={{flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.cta + '22', borderRadius: 12, padding: 10}}>
      <Icon name="refresh-cw" size={15} color={c.owe} />
      <Txt small style={{flex: 1}}>{off ? 'You’re offline. Showing your last saved balances.' : 'Syncing…'}
        {n ? ` ${n} change${n > 1 ? 's' : ''} will sync when you’re back online.` : ''}</Txt>
    </View>
  );
}
