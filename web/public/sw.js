// Vibe PWA Service Worker
// Provides offline shell + push notification handling for loop alerts.
// Register from the dashboard page.

const CACHE = 'vibe-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/manifest.json',
      ])
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Push handling (web push via VAPID + /api/push/send)
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Vibe', body: event.data ? event.data.text() : 'Loop update' };
  }
  const title = payload.title || 'Vibe Loop';
  const body = payload.body || payload.message || 'Status update';
  const tag = payload.tag || 'vibe-loop';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/window.svg',
      badge: '/window.svg',
      data: payload,
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});