// Phone notifications on the website: the browser's push service, through the service worker in public/sw.js.
import { takeLink } from './pending';
import { sb } from './supabase';

export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported' | 'install';
// Public half of the notification key pair. The private half is a secret in Supabase Edge Functions.
const KEY = 'BFzT2bv5JsOr82Fm0Eo9gBpv55QvU_RtJ3m8qHoyUE9N84ww6hIAZvLTE17aw5KwAoXAYiYrxhRMP2WZGfKYKz8';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhones only allow notifications for apps added to the Home Screen.
const needsInstallFirst = () => isIOS() && !installed();

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A tapped notification while Evenly is already open: the service worker hands over the link.
  navigator.serviceWorker.addEventListener('message', ev => { if (ev.data?.type === 'open') takeLink(ev.data.url); });
}
const ready = () => Promise.race([navigator.serviceWorker.ready,
  new Promise<never>((_, rej) => setTimeout(() => rej(new Error('The app is still loading. Try again in a moment.')), 8000))]);

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return needsInstallFirst() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  // Not registered (yet): there can't be a subscription, so don't wait for the service worker.
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!reg) return 'off';
  try { return (await reg.pushManager.getSubscription()) ? 'on' : 'off'; }
  catch { return 'off'; }
}

function keyBytes(b64: string){
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

export async function enablePush(userId: string){
  if (!supported()) throw new Error(needsInstallFirst() ? 'On iPhone, add Evenly to your Home Screen first, then turn on notifications from there.' : 'This browser can’t show notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  const reg = await ready();
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(KEY)});
  const j = sub.toJSON();
  // A device used by someone else before: replace their entry with yours.
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint!);
  const {error} = await sb.from('push_subscriptions').insert({user_id: userId, endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth});
  if (error && !/duplicate/i.test(error.message)) throw error;
}

export async function disablePush(){
  const reg = await ready();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
