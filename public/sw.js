const CACHE_NAME = 'pc-huelva-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/ayuntamientologo-white.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { titulo: 'Protección Civil Huelva', mensaje: '', tipo: 'sistema', data: {} };
  try {
    if (event.data) {
      const raw = event.data.json();
      payload = {
        titulo: raw.titulo || raw.title || payload.titulo,
        mensaje: raw.mensaje || raw.body || '',
        tipo: raw.tipo || 'sistema',
        data: raw.data || {},
      };
    }
  } catch {
    payload.mensaje = event.data ? event.data.text() : '';
  }

  const iconMap = {
    alerta: '/icon-192.png',
    servicio: '/icon-192.png',
    reunion: '/icon-192.png',
    sistema: '/icon-192.png',
  };

  const badgeMap = {
    alerta: '/icon-192.png',
    servicio: '/icon-192.png',
    reunion: '/icon-192.png',
    sistema: '/icon-192.png',
  };

  const tagMap = {
    alerta: 'alerta',
    servicio: 'servicio',
    reunion: 'reunion',
    sistema: 'sistema',
  };

  const options = {
    body: payload.mensaje,
    icon: iconMap[payload.tipo] || iconMap.sistema,
    badge: badgeMap[payload.tipo] || badgeMap.sistema,
    tag: tagMap[payload.tipo] || 'sistema',
    renotify: payload.tipo === 'alerta',
    data: { ...payload.data, tipo: payload.tipo, url: '/' },
    vibrate: payload.tipo === 'alerta' ? [200, 100, 200, 100, 200] : [100],
    requireInteraction: payload.tipo === 'alerta',
  };

  event.waitUntil(
    self.registration.showNotification(payload.titulo, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data: event.notification.data });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
