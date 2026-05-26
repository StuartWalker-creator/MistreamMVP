const CACHE = 'mistream-v3';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => clients.claim());
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'MiStream';
  const options = {
    body: data.body || 'Something is happening on MiStream',
    icon: data.icon || '/icon-192.png',
    badge: '/badge.png',
    data: data.url || '/',
    vibrate: [100, 50, 100],
    actions: data.actions || []
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});
