const CACHE_NAME = 'image-editor-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname === '/') {
    e.respondWith(
      (async () => {
        const formData = await e.request.formData();
        const file = formData.get('image');
        if (file) {
          const db = await openDB();
          const tx = db.transaction('sharedImages', 'readwrite');
          tx.objectStore('sharedImages').put({ id: 'latestShared', file: file });
          await new Promise(resolve => { tx.oncomplete = resolve; });

          const clientsList = await clients.matchAll({ type: 'window' });
          for (const client of clientsList) {
            client.postMessage({ type: 'shared-image', file: file });
          }
        }
        return Response.redirect('./', 303);
      })()
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('ImageEditorDB', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('sharedImages', { keyPath: 'id' });
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}