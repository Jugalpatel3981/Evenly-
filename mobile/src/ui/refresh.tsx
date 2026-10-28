// Pull down on a list to reload everything.
import { useState } from 'react';
import { RefreshControl } from 'react-native';

import { loadAll } from '@/lib/store';

import { useTheme } from './theme';

export function usePullToRefresh(){
  const {c} = useTheme();
  const [busy, setBusy] = useState(false);
  return <RefreshControl refreshing={busy} tintColor={c.accent} colors={[c.accent]}
    onRefresh={() => { setBusy(true); loadAll().catch(() => {}).finally(() => setBusy(false)); }} />;
}
