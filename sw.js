const CACHE_NAME = 'webp-converter-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icon.svg'
];

const DB_NAME = 'ImageEditorDB';
const STORE_NAME = 'sharedImages';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (
    e.request.method === 'POST' &&
    url.pathname.endsWith('share-target')
  ) {
    e.respondWith(
      (async () => {
        try {
          const formData = await e.request.formData();
          const file = formData.get('image');

          if (file) {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            store.put({
              id: 'latestShared',
              file: file,
              timestamp: Date.now()
            });

            const allClients = await clients.matchAll({
              type: 'window',
              includeUncontrolled: true
            });

            for (const client of allClients) {
              client.postMessage({
                type: 'shared-image',
                file: file
              });
            }
          }
        } catch (err) {
          console.error('Error handling shared target POST:', err);
        }

        return Response.redirect('./index.html', 303);
      })()
    );

    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});