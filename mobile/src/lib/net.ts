// Is there a connection? The phone's network state; changes are passed on to whoever is listening.
import * as Network from 'expo-network';

let online = true;
const subs = new Set<(on: boolean) => void>();
const set = (on: boolean) => { if (on === online) return; online = on; subs.forEach(f => f(on)); };
const read = (s: Network.NetworkState) => s.isConnected !== false && s.isInternetReachable !== false;
Network.getNetworkStateAsync().then(s => set(read(s))).catch(() => {});
Network.addNetworkStateListener(s => set(read(s)));

export const isOnline = () => online;
export const onNetChange = (fn: (on: boolean) => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
