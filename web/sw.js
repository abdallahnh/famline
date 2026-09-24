
const CACHE='famline-ios-v5';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(clients.claim()); caches.keys().then(keys=>keys.forEach(k=>{if(k!==CACHE) caches.delete(k)}))});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Never cache index.html or API on iOS - fixes old messages not loading
  if(url.pathname.endsWith('index.html') || url.pathname==='/' || url.search.includes('family')){
    e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',e=>{
  let data={}; try{data=e.data.json()}catch{data={title:'FamLine',body:'Incoming call'}}
  const isCall=data.type==='call';
  const title=data.title||(isCall?`Incoming ${data.isVideo?'video':'voice'} call`:'FamLine');
  const body=data.body||(isCall?`${data.from} calling - Tap to answer`:'New message');
  e.waitUntil(self.registration.showNotification(title,{body,icon:'/icon-192.png',badge:'/icon-192.png',tag:isCall?'famline-call':'msg',requireInteraction:isCall,vibrate:isCall?[300,100,300]:[100],data}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const d=e.notification.data||{};
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if(c.url.includes('famline')) return c.focus();}
    return clients.openWindow(`/?family=${encodeURIComponent(d.familyCode||'Nehme')}&autojoin=1`);
  }));
});
