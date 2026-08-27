// sw.js — deixa o app abrir offline. O que é da planilha nunca vai para o cache:
// saldo velho servido como novo seria pior do que uma tela de erro.

const CACHE = 'financas-v3';
const CASCA = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/main.js', './js/telas.js', './js/engine.js', './js/store.js', './js/sync.js', './js/qr.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('script.google.com')) return;   // API sempre pela rede

  // Rede primeiro, cache como rede de segurança.
  //
  // A ordem inversa (cache primeiro) abre mais rápido, mas faz toda correção
  // de código só aparecer no carregamento SEGUINTE — o tipo de coisa que
  // custa meia hora de "mas eu já arrumei isso". Como os arquivos são
  // pequenos, o ganho de velocidade não paga a confusão.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});

// Notificação empurrada pelo backend (contas a vencer).
self.addEventListener('push', (e) => {
  let d = { titulo: 'Meu Dinheiro', corpo: 'Você tem uma conta a vencer.' };
  try { d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.corpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [80, 40, 80],
    data: { url: './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.url || './'));
});
