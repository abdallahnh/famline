const CACHE='famline-v6-final';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('index.html') || url.pathname==='/' || url.search.includes('family')){
    e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',e=>{
  let data={}; try{data=e.data.json()}catch{data={title:'FamLine',body:'Incoming call'}}
  const isCall=data.type==='call';
  const title=data.title||(isCall?`Incoming ${data.isVideo?'video':'voice'} call - Nehme`:'FamLine');
  const body=data.body||(isCall?`${data.from} calling - Tap to answer`:'New message');
  e.waitUntil(self.registration.showNotification(title,{
    body, icon:'/icon-192.png', badge:'/icon-192.png',
    tag:isCall?'famline-call':'famline-msg',
    requireInteraction:isCall,
    vibrate:isCall?[300,100,300,100,300]:[100],
    data:data,
    actions:isCall?[{action:'answer',title:'✅ Answer'},{action:'decline',title:'❌ Decline'}]:[{action:'open',title:'Open'}]
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const d=e.notification.data||{};
  e.waitUntil(clients.matchAll({type:'window'}).then(list=>{
    for(const c of list){if(c.url.includes('famline')) return c.focus();}
    return clients.openWindow(`/?family=${encodeURIComponent(d.familyCode||'Nehme')}&autojoin=1`);
  }));
});