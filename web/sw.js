
const CACHE_NAME='famline-v2';
const urlsToCache=['/','/index.html','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(urlsToCache)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
self.addEventListener('push',e=>{
  let data={}; try{data=e.data?e.data.json():{}}catch{data={title:'FamLine',body:e.data?e.data.text():'New message'}}
  const title=data.title||'FamLine';
  const opts={
    body:data.body||'New family message',
    icon:'/icon-192.png', badge:'/icon-192.png',
    tag:data.tag||'famline-msg',
    requireInteraction:data.type==='call',
    vibrate:data.type==='call'?[200,100,200,100,200]:[100],
    data:data,
    actions:data.type==='call'?[{action:'answer',title:'✅ Answer'},{action:'decline',title:'❌ Decline'}]:[{action:'open',title:'Open'}],
    renotify:true
  };
  e.waitUntil(self.registration.showNotification(title,opts));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const data=e.notification.data||{};
  e.waitUntil(clients.matchAll({type:'window'}).then(list=>{
    for(const c of list){if(c.url.includes('famline')&&'focus' in c){c.postMessage({type:data.type,from:data.from}); return c.focus();}}
    return clients.openWindow('/?family=Nehme');
  }));
});
