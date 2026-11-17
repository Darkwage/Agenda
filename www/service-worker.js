// Service worker — permet à Agenda de fonctionner hors-ligne une fois installée.
var CACHE_NAME = 'agenda-cache-v9';
var CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './premium.js',
  './admin.js',
  './analytics.js',
  './theme.js',
  './calendar-sync.js',
  './backup.js',
  './fonts/fonts.css',
  './fonts/fraunces-latin-opsz-italic.woff2',
  './fonts/fraunces-latin-opsz-normal.woff2',
  './fonts/fredoka-latin-500-normal.woff2',
  './fonts/fredoka-latin-600-normal.woff2',
  './fonts/fredoka-latin-700-normal.woff2',
  './fonts/ibm-plex-mono-latin-400-normal.woff2',
  './fonts/ibm-plex-mono-latin-500-normal.woff2',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-500-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './fonts/press-start-2p-latin-400-normal.woff2',
  './fonts/righteous-latin-400-normal.woff2',
  './themes.css',
  './premium.css',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(CORE_ASSETS);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Stratégie : réseau d'abord pour rester à jour, cache en secours si hors-ligne.
self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then(function(response){
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
      return response;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){
        return cached || caches.match('./index.html');
      });
    })
  );
});
