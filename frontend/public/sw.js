// Donut PWA Service Worker — fast shell caching with zero interference to SSE & private APIs
const CACHE_NAME = 'donut-portal-shell-v24'
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never intercept API calls, SSE streams, uploads, or I-land game routes
  if (
    url.pathname.startsWith('/portal-api/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/island')
  ) {
    return
  }

  // Immutable hashed bundles & icons -> cache-first with background refresh
  if (url.pathname.startsWith('/portal-assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
      }),
    )
    return
  }

  // HTML navigation & manifest -> network-first, fallback to cache if offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === 'navigate') {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put('/', copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('/'))),
  )
})
