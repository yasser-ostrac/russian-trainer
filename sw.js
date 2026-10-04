const V = 'ru-trainer-v9';
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/style.css', './js/backend.js',
  './js/app.js', './js/dictionary.js', './js/quiz.js', './js/reference.js', './js/reading.js', './data/texts.txt', './js/extras.js', './js/readcheck.js', './js/fixes.js', './data/words.txt', './data/dialogues.txt', './data/reference.json', './data/days.json', './data/days_extra.txt', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Network first (so lesson updates arrive), cache as the offline fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});
