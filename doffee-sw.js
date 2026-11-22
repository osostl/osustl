/* كاشير كوفي دوفي — يخلي الكاشير يفتح ويشتغل حتى لو انقطع الإنترنت (نطاقه صفحة الكاشير بس، ما يلمس البوابة) */
const C = "doffee-v1", PAGE = () => self.registration.scope;
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.add(PAGE())).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("doffee-") && x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (r.mode === "navigate") {
    // the page: network first (updates arrive), the saved copy if the network is down or slow
    e.respondWith(new Promise(res => {
      let done = false; const give = x => { if (!done && x) { done = true; res(x); } };
      const fb = () => caches.match(PAGE()).then(give);
      const t = setTimeout(fb, 4000);
      fetch(r).then(n => { clearTimeout(t); if (n.ok) { const cp = n.clone(); caches.open(C).then(c => c.put(PAGE(), cp)); } give(n); })
        .catch(() => { clearTimeout(t); caches.match(PAGE()).then(x => give(x || Response.error())); });
    }));
    return;
  }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/.test(u.hostname)) {
    e.respondWith(caches.open(C).then(c => c.match(r).then(hit => hit || fetch(r).then(n => { if (n.ok || n.type === "opaque") c.put(r, n.clone()); return n; }))));
  }
});
