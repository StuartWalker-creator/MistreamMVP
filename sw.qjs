const CACHE='mistream-v4';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html','/style.css','/app.js'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});
self.addEventListener('push',e=>{let d={title:'MiStream',body:'Something is happening in the arena!'};try{if(e.data)d={...d,...e.data.json()};}catch(err){}e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'/icon-192.png',data:{url:d.url||'/'},vibrate:[100,50,100]}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(c=>{for(const w of c)if('focus' in w)return w.focus();if(clients.openWindow)return clients.openWindow(e.notification.data?.url||'/');  }));});
