/* كاشير كوفي دوفي — يخلي الكاشير يفتح ويشتغل حتى لو انقطع الإنترنت */
const C = "doffee-v1";
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(["./"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (r.mode === "navigate" || (u.origin === location.origin && u.pathname.startsWith(new URL("./", location).pathname))) {
    // the page: try the network first (to get updates), fall back to the saved copy within 4 seconds
    e.respondWith(new Promise(res => {
      let done = false; const fb = () => caches.match(r, {ignoreSearch: true}).then(x => x || caches.match("./")).then(x => { if (!done && x) { done = true; res(x); } });
      const t = setTimeout(fb, 4000);
      fetch(r).then(n => { clearTimeout(t); if (n.ok) caches.open(C).then(c => c.put(r.mode === "navigate" ? "./" : r, n.clone())); if (!done) { done = true; res(n); } }).catch(() => { clearTimeout(t); fb().then(() => { if (!done) { done = true; res(Response.error()); } }); });
    }));
    return;
  }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/.test(u.hostname) && !/firestore|googleapis\.com\/(identitytoolkit|securetoken)/.test(u.href)) {
    e.respondWith(caches.open(C).then(c => c.match(r).then(hit => hit || fetch(r).then(n => { if (n.ok || n.type === "opaque") c.put(r, n.clone()); return n; }))));
  }
});
