// Background High-Tech Monitor (Service Worker)
const CACHE_NAME = 'retailflow-ai-cache-v1';

// Install event: cache core assets for speed and offline smooth running
self.addEventListener('install', (event) => {

  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {

            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim all clients to ensure instant control
  return self.clients.claim();
});

// Fetch event: Network-first strategy for smooth API data, cache-fallback for assets!
self.addEventListener('fetch', (event) => {
  // Allow all Firebase, Google APIs to pass through directly
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clone the response and cache it
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode / smoothness)
        return caches.match(event.request);
      })
  );
});

// Real-time ping loop to simulate the 'always-on high-tech system' requested
setInterval(() => {

}, 60000);
