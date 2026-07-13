/* ==============================================================
   SERVICE WORKER — Phatdatagency PWA
   Xử lý: nhận push notification, mở đúng trang khi bấm vào thông báo.
============================================================== */
const CACHE_NAME = 'pda-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* Nhận push notification từ server (Supabase Edge Function) */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch (e) { payload = { title: 'Phatdatagency', body: event.data.text() }; }

  const title = payload.title || 'Phatdatagency';
  const options = {
    body: payload.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Bấm vào thông báo -> mở/focus đúng trang (admin.html hoặc account.html) */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl.split('#')[0]) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});