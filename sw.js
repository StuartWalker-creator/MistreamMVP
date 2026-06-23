// MiStream Service Worker
// Handles: background push via OneSignal + in-app push fallback

// ── OneSignal SDK merge ───────────────────────────
// OneSignal requires its code to run inside your service worker.
// importScripts pulls in their worker code at install time.
// This is the official OneSignal merge pattern for existing SWs.
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch(e) {
  console.warn('OneSignal SW import failed (expected in dev without App ID):', e);
}

// ── Standard SW lifecycle ─────────────────────────
// NO caching of app files — always fetch fresh from network
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => clients.claim());

// Do NOT intercept fetch — let browser handle all requests normally
// This means updates to app.js, style.css, index.html always load fresh

// ── Fallback push handler ─────────────────────────
// Handles push events NOT coming from OneSignal (e.g. direct Firebase push
// if you ever upgrade to Blaze, or any other push source)
self.addEventListener('push', e => {
  // OneSignal handles its own push events — this catches everything else
  if(e.data){
    let d = {title: 'MiStream', body: 'Something is happening in the arena!' };
    try { d = { ...d, ...e.data.json() }; } catch(err) {}
    e.waitUntil(
      self.registration.showNotification(d.title, {
        body: d.body,
        icon: '/icon-192.png',
        data: { url: d.url || '/' },
        vibrate: [100, 50, 100]
      })
    );
  }
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
