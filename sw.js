// MiStream Service Worker
// NO caching of app files — always fetch fresh from network
// Only handles push notifications
importScripts(
'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'
);

importScripts(
'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js'
);

const firebaseConfig = {
  apiKey: "AIzaSyCHBo_6-GZi4M7p77-Tk8W32i24KuD-tqg",
  authDomain: "bodaboda-9a325.firebaseapp.com",
  projectId: "bodaboda-9a325",
  storageBucket: "bodaboda-9a325.firebasestorage.app",
  messagingSenderId: "860902193551",
  appId: "1:860902193571:web:e70a25b2c967e3c7570216"
};

firebase.initializeApp(firebaseConfig);


const messaging = firebase.messaging();

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

messaging.onBackgroundMessage(payload => {

  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon:'/icon-192.png'
    }
  );

});
