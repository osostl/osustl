// Offline shell for the portal: opens instantly from the saved copy, then quietly fetches the newest
// version in the background (stale-while-revalidate). When a new version arrives the page is told,
// and offers a one-tap refresh. Firebase and other cross-origin requests are never touched.
const CACHE = "asas-v3";
const SHELL = ["./", "index.html", "app.js?v=75", "config.js", "logo-mark.png", "logo.jpg", "icon-192.png", "icon-512.png", "manifest.webmanifest"];
const SKIP = /\/(doffee-[^/]*|.*\.sh|firestore\.rules|README\.md)$/;   // the café has its own worker; scripts/rules are never needed offline
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("asas-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const tell = async () => {   // remember when it happened (a page that starts later checks this) and tell open pages now
  await caches.open(CACHE).then(c => c.put("__asas_updated", new Response(String(Date.now()))));
  (await self.clients.matchAll({type: "window"})).forEach(w => w.postMessage({type: "asas-updated"}));
};
/* on every open of the portal: fetch the newest index.html + the app.js it points to, keep them, and announce a change */
async function refreshShell(){
  const c = await caches.open(CACHE), same = async (key, r) => { const h = await c.match(key); return !!h && (await h.text()) === (await r.clone().text()); };
  const ri = await fetch("index.html", {cache: "no-cache"}); if (!ri.ok) return;
  const m = (await ri.clone().text()).match(/src="\.?\/?(app\.js\?v=[\w.]+)"/), appKey = new Request(new URL(m ? m[1] : "app.js", location).href);
  const ra = await fetch(appKey, {cache: "no-cache"}); if (!ra.ok) return;
  const changed = !(await same("index.html", ri)) || !(await same(appKey, ra));
  await c.put("index.html", ri); await c.put(appKey, ra);
  if (changed) await tell();
}
let lastCheck = 0, checking = false;
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin || SKIP.test(u.pathname)) return;
  const root = u.pathname.endsWith("/") || u.pathname.endsWith("/index.html");
  if (root && req.mode === "navigate" && !checking && Date.now() - lastCheck > 15000) { checking = true; e.waitUntil(refreshShell().then(() => { lastCheck = Date.now(); }).catch(() => {}).finally(() => { checking = false; })); }
  const key = root ? "index.html" : new Request(u.origin + u.pathname + (u.pathname.endsWith(".js") ? u.search : ""));   // ?pay=… and similar never split the cache
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key);
    const net = fetch(req, {cache: "no-cache"}).then(async r => {
      if (r.ok && r.type === "basic") {
        const fresh = r.clone();
        if (!root && !/\/app\.js$/.test(u.pathname)) await c.put(key, fresh);   // the portal page and app.js are refreshed (and compared) by refreshShell
      }
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => c.match("index.html"));
  }));
});

// push notifications from Cloud Functions (data messages: title, body, link)
self.addEventListener("push", e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch { d = {body: e.data ? e.data.text() : ""}; }
  e.waitUntil(self.registration.showNotification(d.title || "معهد أسس", {body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", dir: "rtl", lang: "ar", data: {link: d.link || "./"}}));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.link) || "./";
  e.waitUntil(clients.matchAll({type: "window", includeUncontrolled: true}).then(ws => {
    for (const w of ws) { if ("focus" in w) { if (w.navigate) w.navigate(url).catch(() => {}); return w.focus(); } }
    return clients.openWindow(url);
  }));
});
