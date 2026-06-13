// MiStream Service Worker
// NO caching of app files — always fetch fresh from network
// Only handles push notifications

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => clients.claim());

// Do NOT intercept fetch — let browser handle all requests normally
// This means updates to app.js, style.css, index.html always load fresh

self.addEventListener('push', e => {
  let d = { title: 'MiStream', body: 'Something is happening in the arena!' };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/icon-192.png',
      data: { url: d.url || '/' },
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(c => {
      for (const w of c) if ('focus' in w) return w.focus();
      if (clients.openWindow) return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});

