// Evenly's service worker on the website: phone notifications, and tapping one to open the right expense.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = {title: 'Evenly', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Evenly', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, data: {url: d.url || '/'},
  }));
});
// Tapping one opens Evenly on that expense, reusing an open window if there is one.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({type: 'open', url}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
