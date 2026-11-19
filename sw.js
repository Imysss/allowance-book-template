// 오프라인 캐시 서비스 워커 — 파일을 고치면 VERSION을 올려야 폰에 새 버전이 반영됨
// 같은 github.io 주소의 다른 앱 캐시를 지우지 않도록 이름 앞에 PREFIX를 붙이고, 내 것만 정리해요
const PREFIX = 'allowance-template-';
const VERSION = PREFIX + 'v11';
const FILES = ['./', 'index.html', 'style.css', 'history.js', 'config.js', 'legacy.js', 'data.js', 'chart.js', 'app.js', 'form.js', 'fixed.js',
  'setup-steps.js', 'setup.js', 'sheets.js', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 네트워크 우선, 실패하면(오프라인) 캐시 사용
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
