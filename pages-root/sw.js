// 以前はサイト直下（/<リポジトリ名>/）に試験アプリがあり、その Service Worker が
// 古い画面をキャッシュから出し続けてしまう。直下の Service Worker をこのファイルで置き換え、
// 自分のキャッシュを消して登録を解除し、開いている画面を読み込み直す。
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope
      // Workbox のキャッシュ名は「workbox-precache-v2-<scope>」。直下の分だけ消し、ap-prep/・meal/ の分は残す
      for (const key of await caches.keys()) {
        if (key.endsWith(scope)) await caches.delete(key)
      }
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const w of windows) w.navigate(w.url)
    })(),
  )
})
