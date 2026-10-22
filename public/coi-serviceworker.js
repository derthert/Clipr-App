// Makes the page cross-origin isolated on hosts that cannot set response headers (GitHub
// Pages). Isolation unlocks SharedArrayBuffer, which the multi-threaded ffmpeg.wasm core
// needs. Registered from index.html; the dev and preview servers send the headers directly.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const { request } = event
  // A cross-origin only-if-cached request throws when fetched; let the browser handle it.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

  event.respondWith(
    fetch(request).then((response) => {
      // Opaque responses cannot be rewritten (and are blocked under COEP anyway).
      if (response.status === 0) return response
      const headers = new Headers(response.headers)
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }),
  )
})
