/* 考卷排版工作台的離線快取（安裝工作台用）。測試站與正式站各自註冊、各自存放。
   原則：本站頁面「先連網、連不上才用快取」，老師連網時一定拿到最新版；
   外部套件網址都固定版號，「有快取就用快取」。wasm/（編譯 PDF，檔案很大）不經過這裡。 */
'use strict';
const SCOPE = self.registration.scope;
const PREFIX = 'exam-studio:' + SCOPE + ':';
const CACHE = PREFIX + '1';
const CORE = ['./', 'manual.html', 'icon-192.png', 'icon-512.png'];

const MJ = 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/';
const FONT = 'https://cdn.jsdelivr.net/npm/@mathjax/mathjax-stix2-font@4.1.3/';
const ML = 'https://cdn.jsdelivr.net/npm/mathlive@0.111.4/';
const LIBS = [
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@400;500;700&display=swap',
  MJ + 'tex-svg-nofont.js', FONT + 'svg.js', ML + 'mathlive.min.mjs',
  ...('accents-other accents arrows calligraphic cyrillic dingbats double-struck enclosed fraktur greek latin-b latin-bi latin-i latin math ' +
    'monospace phonetics sans-serif script shapes stretchy symbols-other symbols upright variants').split(' ').map(n => FONT + 'svg/dynamic/' + n + '.js'),
  ...('action ams amscd bbox boldsymbol braket cancel cases centernot color enclose extpfeil gensymb html mathtools mhchem newcommand ' +
    'noerrors noundefined physics textcomp textmacros unicode units upgreek verb').split(' ').map(n => MJ + 'input/tex/extensions/' + n + '.js'),
  ...['speech-worker.js', 'mathmaps/base.json', 'mathmaps/en.json', 'mathmaps/nemeth.json'].map(n => MJ + 'sre/' + n),
  ...('Main-Regular Main-BoldItalic Main-Bold Main-Italic Math-Italic Math-BoldItalic AMS-Regular Caligraphic-Regular Caligraphic-Bold ' +
    'Fraktur-Regular Fraktur-Bold SansSerif-Regular SansSerif-Bold SansSerif-Italic Script-Regular Typewriter-Regular ' +
    'Size1-Regular Size2-Regular Size3-Regular Size4-Regular').split(' ').map(n => ML + 'fonts/KaTeX_' + n + '.woff2')
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/* 外部套件：缺哪個抓哪個；某一個抓不到不影響其他，下次開啟再補 */
async function fillLibs() {
  const c = await caches.open(CACHE);
  await Promise.allSettled(LIBS.map(async u => {
    if (await c.match(u, {ignoreVary: true})) return;
    const r = await fetch(u, {mode: 'cors', credentials: 'omit'});
    if (r.ok) await c.put(u, r);
  }));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, {cache: 'reload'})));
    await fillLibs();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'fill') e.waitUntil(fillLibs()); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(SCOPE)) {
    const path = url.href.slice(SCOPE.length);
    if (/^(wasm|staging)(\/|$|\?|#)/.test(path)) return;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      /* 網址參數不分開存；/ 與 /index.html 是同一頁 */
      const key = url.origin + url.pathname.replace(/\/index\.html$/, '/');
      try {
        const r = await fetch(req);
        if (r.ok) await c.put(key, r.clone());
        return r;
      } catch (err) {
        const hit = await c.match(key, {ignoreVary: true});
        if (hit) return hit;
        throw err;
      }
    })());
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req.url, {ignoreVary: true});
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) await c.put(req.url, r.clone());
      return r;
    })());
  }
});
