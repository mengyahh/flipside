// 離線快取：網站外殼先快取；資料採「先用網路、失敗用快取」；商品圖片採「先用快取」
const VERSION = 'v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg',
  'data/products.json', 'data/substances.json', 'data/categories.json', 'data/brands.json', 'data/labels.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(`shell-${VERSION}`).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 同源：網路優先，離線時用快取
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(`shell-${VERSION}`).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else if (req.destination === 'image') {
    // 商品圖片：快取優先，最多保留約 400 張
    e.respondWith(caches.open(`img-${VERSION}`).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          c.put(req, res.clone());
          c.keys().then((k) => { if (k.length > 400) c.delete(k[0]); });
        }
        return res;
      } catch { return new Response('', { status: 504 }); }
    }));
  }
});
