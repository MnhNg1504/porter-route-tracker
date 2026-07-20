/* Porter — Service Worker v2: offline hoàn toàn, kể cả tile bản đồ đã tải gói.
   - Shell cùng origin: cache-first + cập nhật nền.
   - Tile CARTO/OSM: tra gói offline 'porter-tiles-v1' (URL chính tắc: subdomain a,
     bỏ @2x) trước, trượt thì ra mạng; mất mạng + có tile nào trùng thì vẫn hiện. */
const CACHE = 'porter-v2';
const TILE_CACHE = 'porter-tiles-v1';
const SHELL = [
  './',
  './index.html',
  './v2.html',
  './manifest.json',
  './lib/leaflet.js',
  './lib/leaflet.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './photos/bacha-pano.jpg',
  './photos/caobang-2.jpg',
  './photos/cb-d.jpg',
  './photos/yt-a.jpg',
  './photos/yt-b.jpg',
  './photos/yty-2.jpg',
  './photos/yty-4.jpg'
];

self.addEventListener('install', e => {
  /* add từng mục, mục hỏng không làm rớt cả gói precache */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin){
    /* tile bản đồ: chuẩn hóa URL về dạng gói offline rồi tra cache trước */
    if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|tile\.opentopomap\.org/.test(url.host)){
      const canon = e.request.url.replace(/\/\/[abcd]\./, '//a.').replace('@2x.png', '.png');
      e.respondWith(
        caches.open(TILE_CACHE)
          .then(c => c.match(canon))
          .then(hit => hit || fetch(e.request).catch(() => new Response('', {status: 408})))
      );
      return;
    }
    /* tài nguyên ngoài khác: chỉ mạng, lỗi thì bỏ qua êm */
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 408})));
    return;
  }
  /* cùng origin: cache-first, đồng thời cập nhật nền */
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
