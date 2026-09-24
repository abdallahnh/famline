
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'FamLine', body: 'Your family is calling!' };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon.png', badge: '/icon.png', vibrate: [200,100,200], tag: 'famline' }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('/')); });
