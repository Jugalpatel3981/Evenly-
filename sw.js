// Evenly service worker: makes the app installable and lets it open without a connection.
// Network first, so friends always get the latest version; the cache is only a fallback.
const CACHE = 'evenly-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'vendor/qrcode.js',
  'js/main.js', 'js/state.js', 'js/views.js', 'js/sheets.js', 'js/ui.js', 'js/money.js', 'js/util.js', 'js/categories.js', 'js/icons.js', 'js/messages.js', 'js/push.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only the app's own files. Supabase data and sign-in always go straight to the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Phone notifications sent by the notify Edge Function.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = {title: 'Evenly', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Evenly', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag, data: {url: d.url || './'},
  }));
});
// Tapping one opens Evenly on that expense, reusing an open window if there is one.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({type: 'open', url}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
