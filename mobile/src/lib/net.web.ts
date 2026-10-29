// Is there a connection? The browser's online and offline events.
const subs = new Set<(on: boolean) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => subs.forEach(f => f(true)));
  window.addEventListener('offline', () => subs.forEach(f => f(false)));
}
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;
export const onNetChange = (fn: (on: boolean) => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
