const CACHE_NAME = 'image-editor-pwa-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    // アイコンもキャッシュに含める
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/maskable-icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    // 共有ターゲットからのリクエストを処理
    const url = new URL(event.request.url);
    if (url.pathname === '/share-target/' && event.request.method === 'POST') {
        event.respondWith(Response.redirect('/')); // 処理後、メインページにリダイレクト
        event.waitUntil(async function() {
            const formData = await event.request.formData();
            const file = formData.get('image');
            if (file) {
                console.log('Service Worker received shared file:', file.name);
                // IndexedDB に画像を保存
                const db = await openDB();
                const transaction = db.transaction('sharedImages', 'readwrite');
                const store = transaction.objectStore('sharedImages');
                store.put({ id: 'latestShared', file: file });

                // クライアント（PWAのページ）にメッセージを送信
                const allClients = await clients.matchAll({ type: 'window' });
                for (const client of allClients) {
                    client.postMessage({
                        type: 'shared-image',
                        file: file
                    });
                }
            }
        }());
        return;
    }

    // 通常のキャッシュ戦略
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// --- IndexedDB の設定 (Service Worker用) ---
const DB_NAME = 'ImageEditorDB';
const STORE_NAME = 'sharedImages';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };

        request.onsuccess = event => {
            resolve(event.target.result);
        };

        request.onerror = event => {
            console.error('IndexedDB error in service worker:', event.target.error);
            reject(event.target.error);
        };
    });
}