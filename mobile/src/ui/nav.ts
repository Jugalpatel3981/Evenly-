// Opening a friend: their one-to-one ledger if there is one, otherwise a page of the groups you share.
import { router } from 'expo-router';

import { friendsIndex } from '@/lib/store';

export function openFriend(key: string, replace = false){
  const f = friendsIndex().get(key);
  const go = replace ? router.replace : router.push;
  if (f?.ledger) go({pathname: '/group/[id]', params: {id: f.ledger}});
  else go({pathname: '/friend/[key]', params: {key}});
}
