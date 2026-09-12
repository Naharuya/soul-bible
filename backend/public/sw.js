const CACHE = 'onaria-admin-shell-v6';
const SHELL = ['/admin/', '/assets/onaria-emblem.svg', '/admin/admin.css', '/admin/admin.js', '/admin/install.js', '/admin/manifest.webmanifest', '/admin/icons/icon-192.png', '/admin/icons/icon-512.png', '/admin/icons/icon-maskable.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith('onaria-admin-shell-') || key.startsWith('soul-bible-admin-shell-')) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only public shell files are cached; authenticated requests always use the network.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.headers.has('authorization') || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
