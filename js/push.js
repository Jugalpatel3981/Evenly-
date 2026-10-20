// Phone notifications: ask permission, subscribe this device, and save it so the server can reach it.
import { sb, uid } from './state.js';

const KEY = (window.EVENLY_CONFIG || {}).VAPID_PUBLIC_KEY || '';
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => !!KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhones only allow notifications for apps added to the Home Screen.
export const needsInstallFirst = () => isIOS() && !installed();

const ready = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('The app is still loading. Try again in a moment.')), 8000))]);

export async function pushStatus(){
  if (!pushSupported()) return needsInstallFirst() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try { const reg = await ready(); return (await reg.pushManager.getSubscription()) ? 'on' : 'off'; }
  catch { return 'off'; }
}

function keyBytes(b64){
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

export async function enablePush(){
  if (!pushSupported()) throw new Error(needsInstallFirst() ? 'On iPhone, add Evenly to your Home Screen first, then turn on notifications from there.' : 'This browser can’t show notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  const reg = await ready();
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(KEY)});
  const j = sub.toJSON();
  // A device used by someone else before: replace their entry with yours.
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const {error} = await sb.from('push_subscriptions').insert({user_id: uid(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth});
  if (error && !/duplicate/i.test(error.message)) throw error;
}

export async function disablePush(){
  const reg = await ready();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
