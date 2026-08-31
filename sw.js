const CACHE_NAME = 'fast-app-shell-v7';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logbeep-mark-transparent.png',
  './assets/icons.svg',
  './src/styles/app.css',
  './src/js/core.js',
  './src/js/data/demo.js',
  './src/js/config.js',
  './src/js/api.js',
  './src/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request.mode === 'navigate' ? './index.html' : request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? './index.html' : request))
  );
});
