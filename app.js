import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, doc, collection, query, where, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc, getDocs, addDoc, orderBy, limit, serverTimestamp, runTransaction, getCountFromServer, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

/* ---------- constants ---------- */
const DOMAIN = "osostl.local";                       // login emails are internal, never mailed
const MAIL_STAFF = ["admission", "business", "hr"];      // accounts that only use their own mailbox
const ROLE_EMAIL = {admin: "admin@" + DOMAIN, academic: "acadmic@" + DOMAIN, finance: "finance@" + DOMAIN, auditor: "audit@" + DOMAIN,
  ...Object.fromEntries(MAIL_STAFF.map(r => [r, `m-${r}@` + DOMAIN]))};
const ROLES = {admin: "الإدارة", academic: "مسؤول الشؤون الأكاديمية", finance: "المالية", auditor: "الجهة الرقابية",
  admission: "القبول والتسجيل وخدمة العملاء", business: "الشراكات وقطاع الشركات", hr: "الموارد البشرية"};
const RO = () => S.adminRole === "auditor";
const FIN = () => S.adminRole === "finance";
const MAILONLY = () => MAIL_STAFF.includes(S.adminRole);
const SEES_FIN = () => S.adminRole === "finance" || S.adminRole === "admin";
const STATUS = {p: "حاضر", l: "متأخر", a: "غائب", e: "مستأذن"};
const GENDER = {m: "طالب", f: "طالبة"};
const GSTAT = {none: "لم تُرصد", draft: "مسودة عند المدرب", submitted: "بانتظار الاعتماد", returned: "معادة للمدرب", approved: "معتمدة ومنشورة"};
const GSTAT_PILL = {none: "", draft: "", submitted: "l", returned: "a", approved: "p"};
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const TZ = "Asia/Riyadh";
const PASS = 60;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => new Date().toLocaleDateString("en-CA", {timeZone: TZ});
const nowHM = () => new Date().toLocaleTimeString("en-GB", {timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false});
const fmtTime = hm => { if (!hm) return "—"; let [h, m] = hm.split(":").map(Number); const s = h < 12 ? "ص" : "م"; h = h % 12 || 12; return `${h}:${String(m).padStart(2,"0")} ${s}`; };
const hijriShort = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", {day: "numeric", month: "long"}); } catch { return ""; } };
const fmtDate = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {weekday: "long", day: "numeric", month: "long"}) + " · " + hijriShort(d); } catch { return d; } };
/* a stored YYYY-MM-DD shown with its Hijri date beside it */
const dH = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return esc(d || ""); try { return `${esc(d)} <span class="muted" style="font-size:12px">(${esc(new Date(d + "T12:00:00").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", {day: "numeric", month: "numeric", year: "numeric"}))})</span>`; } catch { return esc(d); } };
const uid = () => Math.random().toString(36).slice(2, 9);
const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
const clone = o => JSON.parse(JSON.stringify(o));
const digits = s => String(s || "").trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const norm = s => String(s || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ـ/g, "").replace(/عبد ال/g, "عبدال");
const letter = m => m >= 90 ? "ممتاز" : m >= 80 ? "جيد جداً" : m >= 70 ? "جيد" : m >= PASS ? "مقبول" : "راسب";
const validLink = u => /^https:\/\/\S+$/i.test(String(u || "").trim());
/* the cyber lab page (lab.html) is uploaded next to the portal, so it needs no link setting; a link typed in the camp settings still overrides it */
const labLink = (c, admin) => (validLink((c || {}).labUrl) ? c.labUrl : new URL("lab.html", location.href).href.split("?")[0]) + (admin ? "?admin=1" : "");
const isTeams = u => /teams\.(microsoft|live)\.com/i.test(String(u || ""));
const meetLabel = u => isTeams(u) ? "على Teams" : "";
const addMin = (hm, m) => { const [h, mm] = hm.split(":").map(Number); const t = Math.max(0, h * 60 + mm + m); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
const todayDay = () => ({Sun: "الأحد", Mon: "الاثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس"})[new Date().toLocaleDateString("en-US", {timeZone: "Asia/Riyadh", weekday: "short"})] || "";
function toast(msg, long){ const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), long ? 9000 : 3000); }

/* ---------- firebase ---------- */
const configured = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("PASTE");
let app, auth, db;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // local cache: a page reload (or a second tab) resumes from the browser copy and
  // Firestore bills only the documents that changed, instead of re-reading everything
  try { db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}); }
  catch { db = getFirestore(app); }
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
const ref = path => doc(db, ...path.split("/"));
/* staff sessions: they end when the browser closes (login above), and after 30 minutes without any activity */
const IDLE_MS = 30 * 60e3; let _lastAct = Date.now();
["pointerdown", "keydown", "touchstart", "wheel"].forEach(ev => addEventListener(ev, () => { _lastAct = Date.now(); }, {passive: true, capture: true}));
setInterval(() => {
  if (S.view === "admin" && S.authUser && !S.room && Date.now() - _lastAct > IDLE_MS) {
    _lastAct = Date.now(); try { sessionStorage.setItem("idleOut", "1"); } catch {} logout();
  }
}, 60000);
/* the general administration and academic affairs hear about a struggling classroom server even when on another tab */
setInterval(async () => {
  if (S.view !== "admin" || !["admin", "academic"].includes(S.adminRole) || !MEET() || S.aTab === "live") return;
  const x = await srvHealth(); if (srvLevel(x) < 2 || Date.now() - (S._srvWarned || 0) < 10 * 60e3) return;
  S._srvWarned = Date.now();
  toast(x.down ? "⚠️ سيرفر القاعة ما يرد. افتح «المحاضرات والتسجيلات»" : "⚠️ ضغط عالي على سيرفر القاعة. افتح «المحاضرات والتسجيلات» وانقل لـ Teams");
}, 120000);
try { if (sessionStorage.getItem("lockOut")) { sessionStorage.removeItem("lockOut"); setTimeout(() => toast("انتهت جلستك: الإدارة غيّرت رمز الحساب أو أوقفته"), 1500); } } catch {}
try { if (sessionStorage.getItem("idleOut")) { sessionStorage.removeItem("idleOut"); setTimeout(() => toast("طلعت من البوابة تلقائياً بعد 30 دقيقة بدون نشاط"), 1500); } } catch {}
/* sign out and wipe the cached copy, so nothing stays on a shared computer */
async function logout(){
  try { await signOut(auth); } catch {}
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch {}
  location.reload();
}

/* per-document write queue: latest data wins, one write in flight per path */
const Q = {};
function saveDoc(path, data){
  const q = Q[path] || (Q[path] = {busy: false, next: null});
  q.next = clone(data);
  if (q.busy) return;
  (async () => {
    q.busy = true;
    while (q.next) {
      const d = q.next; q.next = null;
      try { await setDoc(ref(path), d); if (path.startsWith("att/")) notify("att", path.slice(4), 20000); }
      catch (e) { handleWriteErr(e); q.next = null; }
    }
    q.busy = false;
  })();
}
/* push notifications go through the Cloudflare worker: the portal only says "this record changed",
   the worker re-reads it with its own key, decides who should hear about it, and never sends the same thing twice */
const NT = {};
async function notifyNow(kind, id){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url || !S.authUser) return null;
  const t = await S.authUser.getIdToken();
  const r = await fetch(url + "/notify", {method: "POST", keepalive: true, headers: {"content-type": "application/json", authorization: "Bearer " + t}, body: JSON.stringify({kind, id})});
  return r.ok ? r.json() : null;
}
/* ---------- الدفع الإلكتروني (Tap): الصفحة تطلب رابط الدفع من خدمة Cloudflare، والمفتاح السري ما يوصل للمتصفح أبداً ---------- */
const finShown = () => (S.site || {}).finStudents !== false;   // the administration can hide «المالية والدفع» from students (e.g. while invoices are being revised)
async function payApi(path, body){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url || !S.authUser) throw new Error("NOURL");
  const r = await fetch(url + path, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || "failed"), {info: j, status: r.status}); return j;
}
async function startPay(body, btn){
  if (btn) { btn.disabled = true; btn.textContent = "⏳ جاري فتح صفحة الدفع…"; }
  try { const j = await payApi("/pay/create", {...body, back: location.origin + location.pathname}); location.href = j.url; }
  catch (e) { if (btn) { btn.disabled = false; btn.textContent = "💳 ادفع إلكترونياً"; }
    const t = (e.info || {}).tap || {};
    toast(e.message === "NOURL" ? "رابط خدمة الإشعارات غير مضبوط في النظام" : e.status === 503 ? "الدفع الإلكتروني مو مفعّل للحين — مفتاح Tap ما انحط في Cloudflare" : e.status === 404 && e.message === "not found" ? "خدمة الدفع ما انرفعت — حدّث worker في Cloudflare لآخر نسخة" : e.message === "amount" ? `المبلغ لازم يكون بين 1 و${(e.info || {}).remaining ?? ""} ر.س` : e.message === "closed" ? "الدفع الإلكتروني مقفول حالياً" : e.message === "already paid" ? "الطلب مدفوع من قبل" : e.message === "tap" ? `Tap رفضت الطلب (${t.status || ""}${t.code ? " · " + t.code : ""}): ${t.msg || "تأكد من المفتاح"}` : e.message === "no account" ? "ما فيه حساب مالي لهذا الطالب" : `تعذّر فتح صفحة الدفع (${e.status || "شبكة"}${(e.info || {}).detail ? " · " + e.info.detail : ""})`, 1); }
}
async function checkPayReturn(){   // back from Tap's page: ?pay=pi…
  const pi = new URLSearchParams(location.search).get("pay"); if (!pi || S._payChecked === pi || S.role !== "student" || !(S.site || {}).pushUrl) return;
  S._payChecked = pi; history.replaceState(null, "", location.pathname + location.hash); toast("⏳ جاري التأكد من الدفع…");
  for (let i = 0; i < 4; i++) { try { const j = await payApi("/pay/verify", {pi});
      if (j.status === "CAPTURED") return toast(j.kind === "coffee" ? "✅ انقبل الدفع — طلبك مدفوع" : `✅ انقبلت دفعتك (${j.amount} ر.س) ونزل لك سند في «المالية»`);
      if (/DECLINED|CANCELLED|FAILED|ABANDONED|VOID|RESTRICTED|TIMEDOUT/.test(j.status || "")) return toast("❌ ما تمت عملية الدفع — ما انخصم منك شيء");
    } catch (e) {} await new Promise(r => setTimeout(r, 2500)); }
  toast("الدفع قيد المعالجة — بيظهر خلال دقائق إذا انخصم المبلغ");
}
/* new version of the portal arrived in the background → offer a one-tap refresh (never interrupts typing) */
function updBar(){
  if (document.querySelector("#updBar")) return;
  const b = document.createElement("div"); b.id = "updBar"; b.setAttribute("role", "status");
  b.style.cssText = "position:fixed;inset-inline:12px;bottom:14px;z-index:9999;max-width:480px;margin:auto;background:#1F5136;color:#fff;padding:12px 16px;border-radius:14px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.25)";
  b.innerHTML = `<span style="flex:1">✨ نزل تحديث جديد للبوابة</span><button style="background:#fff;color:#1F5136;border:0;border-radius:10px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer">تحديث</button><button aria-label="لاحقاً" style="background:transparent;color:#fff;border:0;font-size:18px;cursor:pointer">×</button>`;
  b.children[1].onclick = () => location.reload(); b.children[2].onclick = () => b.remove(); document.body.appendChild(b);
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "asas-updated") updBar(); });
  const chk = () => caches.open("asas-v3").then(c => c.match("__asas_updated")).then(r => r && r.text()).then(t => { if (Number(t) > performance.timeOrigin) updBar(); }).catch(() => {});
  setTimeout(chk, 1500); setTimeout(chk, 6000);   // the newer copy may have arrived while this page was starting
}
function notify(kind, id, delay = 0){
  if (!(S.site || {}).pushUrl || !S.authUser || !id) return;
  const k = kind + "/" + id; clearTimeout(NT[k]);
  NT[k] = setTimeout(() => { delete NT[k]; notifyNow(kind, id).catch(() => {}); }, delay);   // attendance waits a little, so a trainer's quick corrections become one notification
}
addEventListener("pagehide", () => Object.keys(NT).forEach(k => { clearTimeout(NT[k]); delete NT[k]; const [kind, ...rest] = k.split("/"); notifyNow(kind, rest.join("/")).catch(() => {}); }));
/* ---------- virtual classroom: Jitsi on the institute's own server, Teams as the fallback ----------
   The worker hands out a signed pass per course group (trainer and administration = moderators; a student
   only while the lecture is live). live/{gid} says whether a lecture is running and where (osos | teams). */
const MEET = () => ((S.site || {}).meetDomain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const LIVE_MS = 5 * 3600e3;
const liveOn = l => !!(l && l.on && Date.now() - new Date(l.at).getTime() < LIVE_MS);
let _jitsiP = null;
function loadJitsi(domain){
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);
  if (_jitsiP) return _jitsiP;
  _jitsiP = new Promise((ok, no) => {
    const sc = document.createElement("script"), t = setTimeout(() => { sc.remove(); no(new Error("timeout")); }, 7000);
    sc.src = `https://${domain}/external_api.js`;
    sc.onload = () => { clearTimeout(t); window.JitsiMeetExternalAPI ? ok(window.JitsiMeetExternalAPI) : no(new Error("no api")); };
    sc.onerror = () => { clearTimeout(t); sc.remove(); no(new Error("load")); };
    document.head.appendChild(sc);
  }).catch(e => { _jitsiP = null; throw e; });
  return _jitsiP;
}
async function meetLoad(domain){   // people in all rooms right now; 0 when unknown
  try { const c = new AbortController(); setTimeout(() => c.abort(), 3000); const j = await (await fetch(`https://${domain}/osos-load`, {signal: c.signal, cache: "no-store"})).json(); return Number(j.participants ?? j.endpoints ?? 0) || 0; } catch { return 0; }
}
async function meetToken(gid){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const r = await fetch(url + "/meet-token", {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify({gid})});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "token"); e.code = j.error; throw e; }
  return j;
}
function recordJoin(g){
  if (S.role !== "student") return;
  const date = today(), id = `${g.id}_${date}_${S.myNum}`;
  if (S._joined && S._joined[id]) return;
  S._joined = {...(S._joined || {}), [id]: 1};
  setDoc(ref("joins/" + id), {groupId: g.id, date, num: S.myNum, time: nowHM(), at: new Date().toISOString()}).catch(() => {});
}
/* opening Teams after a check needs a fresh tap (browsers block pop-ups that follow a wait) */
function teamsPrompt(g, why){
  if (!validLink(g.meetLink)) return toast((why ? why + ". " : "") + "وما فيه رابط Teams للمقرر، تواصل مع المدرب");
  const w = document.createElement("div"); w.className = "roomAsk";
  w.innerHTML = `<div class="card" style="max-width:420px;margin:0"><h2>المحاضرة على Teams</h2><p>${why ? esc(why) + "، فالمحاضرة على Teams." : "المحاضرة على Teams."}</p><div class="row"><a class="btn pri" style="text-decoration:none" href="${esc(g.meetLink.trim())}" target="_blank" rel="noopener" id="raGo">افتح Teams</a><button class="btn" id="raNo">إغلاق</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector("#raGo").onclick = () => setTimeout(() => w.remove(), 300);
  w.querySelector("#raNo").onclick = () => w.remove();
}
const setLive = (g, mode) => setDoc(ref("live/" + g.id), {gid: g.id, on: true, mode, at: new Date().toISOString(), by: S.me || S.adminRole || "", course: g.course || ""})
  .then(() => { notify("live", g.id); logAction(mode === "osos" ? "بدء محاضرة في القاعة" : "بدء محاضرة على Teams", g.course); return true; })
  .catch(e => { handleWriteErr(e); return false; });
/* trainer (or administration) starts the lecture; falls back to Teams when the room is down, overloaded or switched off */
async function startLecture(g, btn){
  const d = MEET(), site = S.site || {};
  if (btn) btn.disabled = true;
  try {
    if (!d || site.meetForceTeams) { await setLive(g, "teams"); return teamsPrompt(g, d ? "قاعة المعهد موقفة مؤقتاً من الإدارة" : ""); }
    let why = "", tok = null;
    try { await loadJitsi(d); } catch { why = "قاعة المعهد ما تستجيب الحين"; }
    if (!why && await meetLoad(d) >= (Number(site.meetMax) || 180)) why = "قاعة المعهد عليها ضغط الحين";
    if (!why) { const h = await srvHealth(); if (h && !h.down && (srvNetPct(h) >= 80 || (h.cpu || 0) >= 90)) why = "إنترنت سيرفر القاعة عليه ضغط الحين"; }
    if (!why) { try { tok = await meetToken(g.id); } catch (e) { console.error(e); why = "تعذّر فتح قاعة المعهد"; } }
    if (why) { await setLive(g, "teams"); return teamsPrompt(g, why); }
    if (await setLive(g, "osos")) openRoom(g, tok);
  } finally { if (btn) btn.disabled = false; }
}
/* a student (or an observer) joins whatever is running */
async function joinLecture(g, btn){
  const d = MEET();
  if (!d) { if (!validLink(g.meetLink)) return toast("رابط المحاضرة غير صالح، تواصل مع المدرب"); window.open(g.meetLink.trim(), "_blank", "noopener"); recordJoin(g); return toast("انسجل دخولك للمحاضرة"); }
  if (btn) btn.disabled = true;
  try {
    let l = null; try { const x = await getDoc(ref("live/" + g.id)); l = x.exists() ? x.data() : null; } catch {}
    if (!liveOn(l)) return toast("المحاضرة ما بدأت للحين. أول ما يبدأها المدرب يوصلك إشعار");
    if (l.mode === "teams") { recordJoin(g); return teamsPrompt(g); }
    try { await loadJitsi(d); } catch { recordJoin(g); return teamsPrompt(g, "قاعة المعهد ما تستجيب الحين"); }
    await srvHealth().catch(() => null);
    let tok; try { tok = await meetToken(g.id); } catch (e) { return toast(e.code === "not live" ? "المحاضرة ما بدأت للحين" : "تعذّر الدخول للقاعة، حاول مرة ثانية"); }
    recordJoin(g); openRoom(g, tok);
  } finally { if (btn) btn.disabled = false; }
}
/* lighter video so more people fit on the server's internet: the trainer sends up to 720p, students' cameras 360p,
   and each person receives only a few cameras (the speaker plus the last ones who talked). Under load it shrinks further. */
function roomVideoCfg(mod){
  const site = S.site || {}; if (site.meetLite === false) return {};
  const x = S._srv && Date.now() - S._srv.at < 120000 ? S._srv : null, busy = x && !x.down && srvNetPct(x) >= 65;
  const h = mod ? 720 : busy ? 180 : 360, lastN = mod ? (busy ? 4 : 6) : (busy ? 1 : 3);
  return {resolution: h, constraints: {video: {height: {ideal: h, max: h, min: 180}}}, channelLastN: lastN, disableSimulcast: false, enableLayerSuspension: true,
    maxFullResolutionParticipants: 1, ...(mod ? {} : {disableSelfViewSettings: false})};
}
function openRoom(g, tok){
  closeRoom();
  const mod = !!tok.moderator, w = document.createElement("div"); w.id = "roomWrap";
  w.innerHTML = `<div class="roomBar"><b class="grow">${esc(g.course || "المحاضرة")}</b>${mod && !tok.observer ? `<button class="btn sm" id="rmRec">⏺ ابدأ التسجيل</button>` : ""}${mod ? `<button class="btn sm" id="rmTeams">نقل المحاضرة لـ Teams</button><button class="btn sm danger" id="rmEnd">إنهاء المحاضرة للكل</button>` : ""}<button class="btn sm" id="rmOut">خروج</button></div><div id="roomBox"></div>`;
  document.body.appendChild(w); document.body.style.overflow = "hidden";
  const api = new window.JitsiMeetExternalAPI(tok.domain, {
    roomName: tok.room, jwt: tok.jwt, parentNode: w.querySelector("#roomBox"), width: "100%", height: "100%", lang: "ar",
    userInfo: {displayName: tok.name},
    configOverwrite: {prejoinConfig: {enabled: false}, startWithAudioMuted: !mod, startWithVideoMuted: !mod, disableDeepLinking: true, subject: g.course || "", ...roomVideoCfg(mod),
      localRecording: {disable: !mod || !!tok.observer, notifyAllParticipants: true}},
    interfaceConfigOverwrite: {MOBILE_APP_PROMO: false, SHOW_JITSI_WATERMARK: false}
  });
  S.room = {api, gid: g.id, mod, rec: !!(mod && !tok.observer), recOn: false, recUsed: false};
  // students cannot turn their camera on until the trainer allows it; the trainer is asked to start recording straight away
  if (mod && !tok.observer) api.addListener("videoConferenceJoined", () => { try { api.executeCommand("toggleModeration", true, "video"); } catch {} setTimeout(() => recAsk(g), 1200); });
  if (S.room.rec) api.addListener("recordingStatusChanged", e => {
    if (!S.room || S.room.api !== api || (e && e.mode && e.mode !== "local")) return;
    S.room.recOn = !!(e && e.on); if (S.room.recOn) { S.room.recUsed = true; clearTimeout(S.room.recWait); }
    recBtn();
  });
  api.addListener("readyToClose", () => { const used = S.room && S.room.recUsed; closeRoom(); if (used) recAfter(g); });
  // everyone in the room follows the lecture if it moves to Teams or ends
  S.room.unsub = onSnapshot(ref("live/" + g.id), x => {
    const l = x.exists() ? x.data() : null; if (!S.room || S.room.gid !== g.id) return;
    if (l && l.on && l.mode === "teams" && !S.room.leaving) { closeRoom(); teamsPrompt(g, "انتقلت المحاضرة"); }
    else if (l && !l.on && !mod) { closeRoom(); toast("انتهت المحاضرة"); }
  }, () => {});
  w.querySelector("#rmOut").onclick = async () => { const used = await recStop(); closeRoom(); if (used) recAfter(g); };
  if (S.room.rec) w.querySelector("#rmRec").onclick = () => S.room.recOn ? recStop().then(() => recBtn()) : recStart();
  if (mod) {
    w.querySelector("#rmTeams").onclick = async () => {
      if (!validLink(g.meetLink)) return toast("حط رابط Teams للمقرر أول، من صفحة المقرر");
      S.room.leaving = true;
      try { await setDoc(ref("live/" + g.id), {gid: g.id, on: true, mode: "teams", at: new Date().toISOString(), by: S.me || S.adminRole || "", course: g.course || ""}); notify("live", g.id); logAction("نقل محاضرة لـ Teams", g.course); } catch (e) { handleWriteErr(e); }
      const used = await recStop(); closeRoom(); teamsPrompt(g, ""); if (used) recAfter(g);
    };
    w.querySelector("#rmEnd").onclick = async e => {
      if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = "متأكد؟ تنتهي للكل"; return; }
      S.room.leaving = true; e.target.disabled = true;
      const used = await recStop();
      try { api.executeCommand("endConference"); } catch {}
      await endLive(g);
      setTimeout(() => { closeRoom(); if (used) recAfter(g); }, 800);
    };
  }
}
/* ---------- semi-automatic recording: the trainer is asked to record when the lecture opens, and to upload when it ends ---------- */
function recBtn(){
  const b = $("#rmRec"); if (!b || !S.room) return;
  b.textContent = S.room.recOn ? "⏹ إيقاف التسجيل" : "⏺ ابدأ التسجيل";
  b.style.background = S.room.recOn ? "#c0392b" : ""; b.style.color = S.room.recOn ? "#fff" : ""; b.style.borderColor = S.room.recOn ? "#c0392b" : "";
}
function recStart(){
  const r = S.room; if (!r || !r.rec) return;
  try { r.api.executeCommand("startRecording", {mode: "local"}); } catch (e) { console.error(e); }
  clearTimeout(r.recWait);
  r.recWait = setTimeout(() => { if (S.room === r && !r.recOn) toast("إذا ما بدأ التسجيل: من القائمة (…) داخل القاعة اختر «بدء التسجيل»، ووافق على مشاركة هذي الصفحة"); }, 15000);
}
/* stop a running recording and give the browser time to save the file; returns whether anything was recorded */
async function recStop(){
  const r = S.room; if (!r || !r.rec) return false;
  if (r.recOn) { try { r.api.executeCommand("stopRecording", "local"); } catch {} await new Promise(ok => setTimeout(ok, 3000)); r.recOn = false; }
  return r.recUsed;
}
function recAsk(g){
  const r = S.room; if (!r || !r.rec || r.recOn || r.asked || $("#recAskW")) return; r.asked = true;
  const w = document.createElement("div"); w.className = "roomAsk"; w.id = "recAskW";
  w.innerHTML = `<div class="card" style="max-width:420px;width:100%;margin:0;text-align:center"><h2>تسجيل المحاضرة</h2><p class="muted">سجّل المحاضرة عشان الطلاب يرجعون لها. بعد ما تضغط، اختر «علامة التبويب هذي» ووافق. التسجيل ينحفظ على جهازك، وبعد ما تنهي المحاضرة نطلب منك ترفعه.</p><div class="row" style="justify-content:center"><button class="btn pri" id="raGo">⏺ ابدأ التسجيل</button><button class="btn" id="raNo">بدون تسجيل</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector("#raGo").onclick = () => { w.remove(); recStart(); };
  w.querySelector("#raNo").onclick = () => w.remove();
}
async function saveRecList(g, list){
  try { await setDoc(ref("groups/" + g.id), {recordings: list}, {merge: true}); if (S.groups[g.id]) S.groups[g.id].recordings = list; logAction("تسجيلات المحاضرات", g.course); return true; }
  catch (e) { handleWriteErr(e); return false; }
}
function recAfter(g){
  if ($("#recUpW")) return;
  const w = document.createElement("div"); w.className = "roomAsk"; w.id = "recUpW";
  w.innerHTML = `<div class="card" style="max-width:460px;width:100%;margin:0"><h2>ارفع تسجيل المحاضرة الحين</h2><p class="muted" style="margin-top:0">التسجيل انحفظ في «التنزيلات» بجهازك (ملف ينتهي بـ .webm). اختره وارفعه، ويظهر لطلاب المقرر مباشرة.</p>
    <label class="f" for="ruT">العنوان<input type="text" id="ruT" value="${esc((g.course || "محاضرة") + " - " + today())}"></label>
    <label class="f" for="ruD">التاريخ<input type="date" id="ruD" value="${today()}"></label>
    <input type="file" id="ruF" accept="video/webm,video/mp4,.webm,.mp4" style="margin:8px 0;width:100%">
    <div class="muted" id="ruP"></div>
    <div class="row" style="margin-top:10px"><button class="btn pri" id="ruGo">رفع</button><button class="btn" id="ruX">بعدين من صفحة المقرر</button></div></div>`;
  document.body.appendChild(w);
  const f = w.querySelector("#ruF"); setTimeout(() => { try { f.click(); } catch {} }, 300);
  w.querySelector("#ruX").onclick = () => w.remove();
  w.querySelector("#ruGo").onclick = async e => {
    const file = f.files[0]; if (!file) return toast("اختر ملف التسجيل");
    if (file.size > 4 * 1024 ** 3) return toast("الملف أكبر من 4 جيجا");
    e.target.disabled = true; w.querySelector("#ruX").disabled = true;
    try {
      const r = await recUpload(g, file, pct => { w.querySelector("#ruP").textContent = `جاري الرفع… ${pct}% (لا تقفل الصفحة)`; });
      const cur = (S.groups[g.id] || g).recordings || [];
      const item = {date: w.querySelector("#ruD").value || today(), title: w.querySelector("#ruT").value.trim() || "محاضرة", rid: r.rid, size: file.size, by: S.me || S.adminRole || ""};
      if (await saveRecList(g, [...cur, item].sort((a, b) => b.date.localeCompare(a.date)))) { w.remove(); toast("انرفع التسجيل، وطلاب المقرر يشوفونه الحين"); render(); }
      else e.target.disabled = false;
    } catch (x) { console.error(x); w.querySelector("#ruP").textContent = ""; toast(x.message === "full" ? "مساحة السيرفر ما تكفي، كلم الإدارة" : "تعذّر رفع التسجيل، حاول مرة ثانية"); e.target.disabled = false; }
    finally { w.querySelector("#ruX").disabled = false; }
  };
}
/* ---------- staff account security (general administration) ---------- */
function askCode(title){
  return new Promise(done => {
    const w = document.createElement("div"); w.className = "roomAsk";
    w.innerHTML = `<form class="card" style="max-width:380px;width:100%;margin:0" autocomplete="off"><h2>${esc(title)}</h2><label class="f" for="rcC">رمز الإدارة العامة<input type="password" id="rcC" inputmode="numeric" required></label><div class="row" style="margin-top:10px"><button class="btn pri" type="submit">تأكيد</button><button class="btn" type="button" id="rcX">إلغاء</button></div></form>`;
    document.body.appendChild(w); w.querySelector("#rcC").focus();
    w.querySelector("#rcX").onclick = () => { w.remove(); done(null); };
    w.querySelector("form").onsubmit = e => { e.preventDefault(); const c = digits(w.querySelector("#rcC").value); w.remove(); done(c); };
  });
}
async function reauthAdmin(){
  const c = await askCode("للأمان، اكتب رمزك مرة ثانية"); if (!c) return false;
  try { await signInWithEmailAndPassword(auth, ROLE_EMAIL.admin, c); return true; } catch { toast("الرمز غير صحيح"); return false; }
}
async function staffSec(body){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const call = async () => { const r = await fetch(url + "/staff-security", {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken(true)}, body: JSON.stringify(body)}); return [r, await r.json().catch(() => ({}))]; };
  let [r, j] = await call();
  if (r.status === 401 && j.error === "reauth") { if (!await reauthAdmin()) throw new Error("cancel"); [r, j] = await call(); }
  if (!r.ok) throw Object.assign(new Error(j.error || "failed"), {detail: j.detail || "", status: r.status});
  return j;
}
function showCode(role, code, self){
  const w = document.createElement("div"); w.className = "roomAsk";
  w.innerHTML = `<div class="card" style="max-width:400px;width:100%;margin:0;text-align:center"><h2>${self ? "رمزك الجديد" : "الرمز الجديد: " + esc(ROLES[role])}</h2><div dir="ltr" style="font-size:30px;font-weight:700;letter-spacing:4px;margin:12px 0">${esc(code)}</div><p class="muted">${self ? "احفظه الحين، ما بيظهر مرة ثانية. الرمز القديم وقف." : "أرسله للموظف بطريقة آمنة (مكالمة أو رسالة مباشرة). ما بيظهر مرة ثانية."}</p><div class="row" style="justify-content:center"><button class="btn pri" id="scC">نسخ</button><button class="btn" id="scX">إغلاق</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector("#scC").onclick = () => navigator.clipboard.writeText(code).then(() => toast("انتسخ")).catch(() => {});
  w.querySelector("#scX").onclick = () => w.remove();
}
/* after the general administration's own code changes, sign straight back in with it */
async function reloginAdmin(code){
  S._selfRotate = true;
  await new Promise(r => setTimeout(r, 1500));
  try { await signInWithEmailAndPassword(auth, ROLE_EMAIL.admin, code); } catch (e) { console.error(e); }
  setTimeout(() => { S._selfRotate = false; }, 4000);
}
function secCard(){
  const st = S._secSt, fmt = ms => ms ? new Date(ms).toLocaleString("ar-SA-u-ca-gregory", {day: "numeric", month: "short", hour: "numeric", minute: "2-digit"}) : "—";
  const rows = st && st.roles ? Object.entries(st.roles).map(([r, x]) => `<div class="item" style="flex-wrap:wrap"><div class="grow" style="min-width:180px"><div class="t">${esc(ROLES[r])}</div><div class="muted">${!x.exists ? "الحساب مو موجود" : `آخر دخول: ${esc(fmt(x.lastLogin))}${x.lockedAt ? ` · آخر تغيير أمان: ${esc(fmt(x.lockedAt * 1000))}` : ""}`}</div></div>
    ${x.exists ? `<span class="pill ${x.disabled ? "a" : "p"}">${x.disabled ? "موقوف" : "مفعّل"}</span><button class="btn sm" data-snew="${r}">رمز جديد</button>${r === "admin" ? "" : x.disabled ? `<button class="btn sm" data-sen="${r}">تفعيل</button>` : `<button class="btn sm danger" data-sdis="${r}">إيقاف</button>`}` : MAIL_STAFF.includes(r) ? `<button class="btn sm pri" data-snew="${r}">إنشاء الحساب</button>` : ""}</div>`).join("") : `<div class="muted">جاري التحميل…</div>`;
  return `<div class="card" id="secCard"><h2>أمان حسابات الإدارات</h2>
    <p class="muted" style="margin-top:0">لو شكّيت إن أحد دخل حساب إدارة بدون إذن، اضغط «رمز جديد» أو «إيقاف». الرمز القديم يوقف، وكل من كان داخل بالحساب يطلع فوراً من كل الأجهزة.</p>
    <div class="list">${rows}</div>
    <button class="btn danger" id="secAll" style="margin-top:10px;width:100%">طوارئ: إيقاف كل حسابات الإدارات</button>
    <p class="muted" style="margin:6px 0 0">يوقف كل حسابات الإدارات والبريد (الأكاديمية والمالية والجهة الرقابية والقبول وخدمة العملاء والشراكات والموارد البشرية)، ويغيّر رمز الإدارة العامة. وبعدين ترجّع كل حساب بـ «تفعيل» و«رمز جديد».</p></div>`;
}
function bindSecCard(el){
  if (!$("#secCard")) return;
  const reload = () => { S._secSt = null; S._secAt = 0; render(); };
  if (!S._secSt && !S._secBusy && Date.now() - (S._secAt || 0) > 60000) {
    S._secBusy = true; S._secAt = Date.now();
    staffSec({action: "status"}).then(j => { S._secSt = j; }).catch(e => { console.error(e); S._secSt = {roles: {}}; toast("تعذّر قراءة حالة الحسابات"); }).finally(() => { S._secBusy = false; if (S.aTab === "system" && !busyEditing()) render(); });
  }
  const act = async (btn, body, label, after) => {
    if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "متأكد؟"; return; }
    btn.disabled = true;
    try { const j = await staffSec(body); logAction("أمان الحسابات: " + label, ROLES[body.role] || "الكل"); await after(j); reload(); }
    catch (e) { if (e.message !== "cancel") toast("ما تم التنفيذ: " + (e.message === "cannot stop own account" ? "ما تقدر توقف حساب الإدارة العامة" : e.message === "not allowed" ? "الجلسة قديمة، اطلع وادخل من جديد بحساب الإدارة" : e.message === "no service" ? "رابط خدمة الإشعارات غير مضبوط" : e.detail ? e.detail : `حاول مرة ثانية (${e.status || "شبكة"} · ${e.message})`), 1); btn.disabled = false; }
  };
  el.querySelectorAll("[data-snew]").forEach(b => b.onclick = () => { const r = b.dataset.snew; act(b, {action: "newcode", role: r}, "رمز جديد", async j => { if (r === "admin") { await reloginAdmin(j.code); showCode(r, j.code, true); } else showCode(r, j.code); }); });
  el.querySelectorAll("[data-sdis]").forEach(b => b.onclick = () => act(b, {action: "disable", role: b.dataset.sdis}, "إيقاف حساب", async () => toast("انوقف الحساب، وطلع كل من كان داخل فيه")));
  el.querySelectorAll("[data-sen]").forEach(b => b.onclick = () => act(b, {action: "enable", role: b.dataset.sen}, "تفعيل حساب", async () => toast("انفعّل الحساب. يفضّل تعطيه رمز جديد")));
  const all = $("#secAll");
  if (all) all.onclick = async () => {
    const typed = prompt("للتأكيد اكتب: إيقاف"); if ((typed || "").trim() !== "إيقاف") return;
    all.disabled = true; all.dataset.sure = 1;
    act(all, {action: "lockall"}, "إيقاف طوارئ لكل الحسابات", async j => { await reloginAdmin(j.code); showCode("admin", j.code, true); toast("انوقفت كل حسابات الإدارات"); });
  };
}
/* ---------- recordings on the classroom server ---------- */
const fmtSize = n => !n ? "" : n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + " جيجا" : Math.max(1, Math.round(n / 1024 ** 2)) + " ميغا";
async function recTicket(body){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const r = await fetch(url + "/rec-ticket", {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "ticket"); return j;
}
function recUpload(g, file, onPct){
  return recTicket({op: "up", gid: g.id}).then(t => new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open("PUT", t.url);
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.floor(e.loaded / e.total * 100)); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status === 200 ? ok({rid: t.rid}) : no(new Error(j.error || "upload " + x.status)); };
    x.onerror = () => no(new Error("network"));
    x.send(file);
  }));
}
async function recDelete(g, r){ const t = await recTicket({op: "del", gid: g.id, rid: r.rid}); const x = await fetch(t.url, {method: "POST"}); if (!x.ok && x.status !== 404) throw new Error("del " + x.status); logAction("حذف تسجيل محاضرة", `${g.course} · ${r.title}`); }
async function playRec(g, r){
  if (!r) return;
  if (!r.rid) { if (validLink(r.url)) window.open(r.url, "_blank", "noopener"); return; }
  let t; try { t = await recTicket({op: "get", gid: g.id, rid: r.rid}); } catch (e) { console.error(e); return toast("تعذّر فتح التسجيل"); }
  const w = document.createElement("div"); w.className = "roomAsk";
  w.innerHTML = `<div class="card" style="max-width:960px;width:100%;margin:0"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b>${esc(g.course || "")} · ${esc(r.title)}</b><button class="btn sm" id="rpX">إغلاق</button></div><video controls autoplay playsinline controlslist="nodownload" style="width:100%;max-height:75vh;background:#000;border-radius:8px"></video></div>`;
  document.body.appendChild(w);
  const v = w.querySelector("video"); v.src = t.url; v.oncontextmenu = e => e.preventDefault();
  v.onerror = () => toast("تعذّر تشغيل التسجيل");
  w.querySelector("#rpX").onclick = () => { v.pause(); v.removeAttribute("src"); w.remove(); };
}
const endLive = g => setDoc(ref("live/" + g.id), {gid: g.id, on: false, mode: "osos", at: new Date().toISOString(), by: S.me || S.adminRole || "", course: g.course || "", endedAt: new Date().toISOString()})
  .then(() => logAction("إنهاء محاضرة", g.course)).catch(handleWriteErr);
function closeRoom(){
  const r = S.room; S.room = null;
  if (r) { clearTimeout(r.recWait); try { r.unsub && r.unsub(); } catch {} try { r.api.dispose(); } catch {} }
  const ra = $("#recAskW"); if (ra) ra.remove();
  const w = $("#roomWrap"); if (w) w.remove(); document.body.style.overflow = "";
}
/* ---------- classroom server health: people in the room, processor, memory, disk ---------- */
async function srvHealth(){
  const d = MEET(); if (!d) return null;
  try { const c = new AbortController(); setTimeout(() => c.abort(), 4000); const j = await (await fetch(`https://${d}/osos-load`, {signal: c.signal, cache: "no-store"})).json(); S._srv = {at: Date.now(), ...j}; }
  catch { S._srv = {at: Date.now(), down: true}; }
  return S._srv;
}
const srvMax = () => Number((S.site || {}).meetMax) || 180;
/* the server's internet capacity: what the director typed in, else the network card's speed, else 500 Mbit/s */
const srvCap = x => Number((S.site || {}).meetMbps) || (x && x.linkMbps > 0 && x.linkMbps <= 10000 ? x.linkMbps : 500);
const srvNetPct = x => x && x.netOut != null ? Math.round(x.netOut / srvCap(x) * 100) : 0;
function srvLevel(x){   // 0 fine, 1 watch, 2 act now
  if (!x) return 0; if (x.down) return 2;
  const p = (x.participants || 0) / srvMax() * 100;
  const worst = Math.max(p, x.cpu || 0, x.mem || 0, x.disk || 0, srvNetPct(x) * 85 / 80);   // internet: red from 80%
  return worst >= 85 ? 2 : worst >= 65 ? 1 : 0;
}
const SRV_COL = ["#1F7A4D", "#C98A00", "#C0392B"];
function srvCard(){
  const x = S._srv, col = v => SRV_COL[v >= 85 ? 2 : v >= 65 ? 1 : 0];
  const bar = (label, pct, txt) => `<div style="margin:8px 0"><div class="row" style="justify-content:space-between"><span>${label}</span><b style="color:${col(pct)}">${txt}</b></div><div style="height:8px;background:var(--line);border-radius:6px;overflow:hidden;margin-top:4px"><div style="width:${Math.min(100, Math.max(2, pct))}%;height:100%;background:${col(pct)}"></div></div></div>`;
  const lv = srvLevel(x), force = !!(S.site || {}).meetForceTeams, nOsos = (S.lives || []).filter(l => liveOn(l) && l.mode === "osos").length;
  const head = !x ? `<p class="muted">جاري القراءة…</p>` : x.down ? `<div class="notice" style="background:#fdecea;border-color:#f5c2c0">⚠️ سيرفر القاعة ما يرد. أي محاضرة جديدة تتحول لـ Teams تلقائياً، وانقل الشغالة الحين.</div>`
    : lv === 2 ? `<div class="notice" style="background:#fdecea;border-color:#f5c2c0">⚠️ الضغط عالي على السيرفر. انقل المحاضرات لـ Teams قبل ما يتأثر الصوت والصورة.</div>`
    : lv === 1 ? `<div class="notice">انتبه: السيرفر قرّب من حده. راقبه، وإذا زاد انقل بعض المحاضرات لـ Teams.</div>` : `<div class="muted">✓ السيرفر مرتاح.</div>`;
  const pp = x && !x.down ? Math.round((x.participants || 0) / srvMax() * 100) : 0;
  return `<div class="card" id="srvCard" style="border-color:${SRV_COL[lv]}"><div class="row" style="justify-content:space-between"><h2 style="margin:0">حالة سيرفر القاعة</h2><span class="muted" style="font-size:13px">${x ? "آخر قراءة " + esc(new Date(x.at).toLocaleTimeString("ar-SA-u-nu-latn", {hour: "numeric", minute: "2-digit", second: "2-digit"})) : ""} <a href="#" id="srvRe">تحديث</a></span></div>
    <div style="margin-top:8px">${head}</div>
    ${x && !x.down ? bar("الموجودين في القاعة الحين", pp, `${x.participants || 0} من ${srvMax()}${x.conferences ? ` · ${x.conferences} محاضرة` : ""}`)
      + (x.netOut != null ? bar("الإنترنت الطالع (أول شي ينضغط)", srvNetPct(x) * 85 / 80, `${x.netOut} من ${srvCap(x)} ميغابت · ${srvNetPct(x)}%`) + `<div class="muted" style="font-size:12.5px;margin-top:-4px">الداخل: ${x.netIn ?? 0} ميغابت</div>` : `<div class="muted" style="font-size:12.5px">الإنترنت: يظهر بعد تحديث سكربت السيرفر (meet-rec.sh)</div>`)
      + (x.cpu != null ? bar("المعالج", x.cpu, x.cpu + "%") : "") + (x.mem != null ? bar("الذاكرة", x.mem, x.mem + "%") : "")
      + (x.disk != null ? bar("التخزين (التسجيلات والمرفقات)", x.disk, `${x.disk}% · باقي ${x.diskFreeGB} من ${x.diskGB} جيجا`) : "") : ""}
    ${RO() ? "" : `<div class="row" style="margin-top:10px;gap:6px">${nOsos ? `<button class="btn sm ${lv === 2 ? "danger" : ""}" id="srvAll">نقل كل المحاضرات الشغالة لـ Teams (${nOsos})</button>` : ""}
      <button class="btn sm ${force ? "pri" : ""}" id="srvForce">${force ? "✓ القاعة موقفة: المحاضرات الجديدة على Teams (اضغط للتشغيل)" : "إيقاف القاعة مؤقتاً: المحاضرات الجديدة تفتح على Teams"}</button></div>`}
    <p class="muted" style="margin:8px 0 0;font-size:13px">أخضر مرتاح، برتقالي قرّب من الحد (65%)، أحمر انقل لـ Teams (85%، والإنترنت من 80%). المحاضرات الجديدة تتحول لـ Teams لحالها إذا الإنترنت وصل 80% أو المعالج 90%. الحد الأعلى للحاضرين تعدّله من «النظام» ← القاعة الافتراضية.</p></div>`;
}
function bindSrvCard(el){
  if (!S._srvTimer) S._srvTimer = setInterval(() => { if (S.view !== "admin" || S.aTab !== "live") { clearInterval(S._srvTimer); S._srvTimer = null; return; } srvHealth().then(() => { const c = $("#srvCard"); if (c && !busyEditing()) render(); }); }, 20000);
  if (!S._srv || Date.now() - S._srv.at > 20000) srvHealth().then(() => { if (S.aTab === "live" && !busyEditing()) render(); });
  const re = el.querySelector("#srvRe"); if (re) re.onclick = e => { e.preventDefault(); srvHealth().then(() => render()); };
  const all = el.querySelector("#srvAll");
  if (all) all.onclick = async () => {
    if (!all.dataset.sure) { all.dataset.sure = 1; all.textContent = "متأكد؟ كل الطلاب ينتقلون لـ Teams"; return; }
    all.disabled = true; let moved = 0, noLink = [];
    for (const l of (S.lives || []).filter(x => liveOn(x) && x.mode === "osos")) {
      const g = S.groups[l.gid]; if (!g) continue;
      if (!validLink(g.meetLink)) { noLink.push(g.course || g.id); continue; }
      if (await setLive(g, "teams")) moved++;
    }
    logAction("نقل كل المحاضرات لـ Teams", `${moved} محاضرة`);
    toast(`انتقلت ${moved} محاضرة لـ Teams${noLink.length ? ` · ما لها رابط Teams: ${noLink.join("، ")}` : ""}`); render();
  };
  const fo = el.querySelector("#srvForce");
  if (fo) fo.onclick = () => saveSite({meetForceTeams: !(S.site || {}).meetForceTeams}, "إيقاف/تشغيل القاعة").then(() => render());
}
/* administration and academic affairs: every lecture running now, to watch, move or end */
function liveTab(el){
  if (!S._liveSub) S._liveSub = onSnapshot(collection(db, "live"), x => { S.lives = x.docs.map(d => d.data()); if (S.aTab === "live" && !busyEditing()) render(); }, () => {});
  if (S._joinDay !== today()) { if (S._joinSub) S._joinSub(); S._joinDay = today(); S._joinSub = onSnapshot(query(collection(db, "joins"), where("date", "==", today())), x => { S.joinsToday = x.docs.map(d => d.data()); if (S.aTab === "live" && !busyEditing()) render(); }, () => {}); }
  const joined = gid => (S.joinsToday || []).filter(j => j.groupId === gid).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const list = (S.lives || []).filter(liveOn).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const day = iso => { try { return new Date(iso).toLocaleDateString("en-CA"); } catch { return ""; } };
  const recToday = gid => ((S.groups[gid] || {}).recordings || []).some(r => r.date === today());
  const endedNoRec = (S.lives || []).filter(l => !l.on && l.mode === "osos" && day(l.endedAt || l.at) === today() && !recToday(l.gid));
  const allRecs = Object.values(S.groups).filter(g => (g.recordings || []).length).sort((a, b) => (a.course || "").localeCompare(b.course || "", "ar"));
  const rf = S._recFilter || "";
  el.innerHTML = srvCard() + `<div class="card"><h2>المحاضرات الآن (${list.length})</h2><p class="muted" style="margin:0">تشوف مين دخل من الطلاب بدون ما تدخل القاعة. ولو دخلت كمشرف، تدخل والكاميرا والمايك مطفيين، واسمك يظهر في قائمة المشاركين «الإدارة». وتقدر تنقل المحاضرة لـ Teams أو تنهيها، وداخل القاعة تكتم أو تطرد أي مشارك.</p></div>
  <div class="list">${list.map(l => { const g = S.groups[l.gid] || {}; return `<div class="item" style="flex-wrap:wrap"><div class="grow" style="min-width:200px"><div class="t">${esc(g.course || l.course || l.gid)}</div><div class="muted">${esc(tName(g.trainerId || ""))} · بدأت ${esc(fmtTime(new Date(l.at).toTimeString().slice(0, 5)))} · ${l.mode === "teams" ? "على Teams" : "قاعة المعهد"}</div>
    ${(js => js.length ? `<details style="margin-top:4px"><summary class="muted" style="cursor:pointer">دخل ${js.length} من ${(g.memberNums || []).length} طالب</summary><div class="muted" style="margin-top:4px">${js.map(j => `${esc((S.students[j.num] || {}).name || j.num)} (${esc(fmtTime(j.time))})`).join("، ")}</div></details>` : `<div class="muted">ما دخل أحد من الطلاب للحين</div>`)(joined(l.gid))}</div>
    ${l.mode === "osos" ? `<button class="btn sm pri" data-lvw="${esc(l.gid)}">دخول كمشرف</button>` : validLink(g.meetLink) ? `<a class="btn sm" style="text-decoration:none" href="${esc(g.meetLink)}" target="_blank" rel="noopener">فتح Teams</a>` : ""}
    ${RO() ? "" : `${l.mode === "osos" ? `<button class="btn sm" data-lvt="${esc(l.gid)}">نقل لـ Teams</button>` : ""}<button class="btn sm danger" data-lve="${esc(l.gid)}">إنهاء</button>`}</div>`; }).join("") || `<div class="card empty">ما فيه محاضرات شغالة الحين.</div>`}</div>
  ${endedNoRec.length ? `<div class="card" style="border-color:#e0a800"><h2>محاضرات اليوم بدون تسجيل مرفوع (${endedNoRec.length})</h2><div class="list">${endedNoRec.map(l => { const g = S.groups[l.gid] || {}; return `<div class="item"><div class="grow"><div class="t">${esc(g.course || l.course || l.gid)}</div><div class="muted">${esc(tName(g.trainerId || ""))} · انتهت ${esc(fmtTime(new Date(l.endedAt || l.at).toTimeString().slice(0, 5)))}</div></div><span class="pill a">ما انرفع تسجيل</span></div>`; }).join("")}</div></div>` : ""}
  <div class="card"><h2>تسجيلات المحاضرات</h2>
    <p class="muted" style="margin-top:0">كل التسجيلات المرفوعة لكل المقررات. ${RO() ? "" : "الحذف يمسح الملف من سيرفر القاعة ويختفي عن الطلاب، ويُكتب في السجل."}</p>
    <input type="search" id="rcF" placeholder="ابحث باسم المقرر أو المدرب" value="${esc(rf)}" style="width:100%;margin-bottom:8px">
    <div class="list">${allRecs.filter(g => !rf || (g.course || "").includes(rf) || tName(g.trainerId || "").includes(rf)).map(g => `<details class="item" style="display:block"><summary style="cursor:pointer"><b>${esc(g.course || g.id)}</b> <span class="muted">· ${esc(tName(g.trainerId || ""))} · ${(g.recordings || []).length} تسجيل</span></summary>
      ${(g.recordings || []).map((r, i) => `<div class="row" style="margin-top:6px;flex-wrap:wrap"><span class="grow">${esc(r.date)} · ${esc(r.title)}${r.size ? ` <span class="muted">(${esc(fmtSize(r.size))})</span>` : ""}${recToday(g.id) && r.date === today() ? ` <span class="pill p">اليوم</span>` : ""}</span><button class="btn sm" data-arp="${esc(g.id)}:${i}">تشغيل</button>${RO() ? "" : `<button class="btn sm danger" data-ard="${esc(g.id)}:${i}">حذف</button>`}</div>`).join("")}</details>`).join("") || `<div class="empty muted">ما فيه تسجيلات للحين.</div>`}</div></div>`;
  bindSrvCard(el);
  const rcF = el.querySelector("#rcF"); if (rcF) rcF.oninput = () => { S._recFilter = rcF.value.trim(); clearTimeout(S._rcT); S._rcT = setTimeout(() => { render(); const x = $("#rcF"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 300); };
  const pick = v => { const [gid, i] = v.split(":"), g = S.groups[gid]; return g ? [g, (g.recordings || [])[Number(i)], Number(i)] : []; };
  el.querySelectorAll("[data-arp]").forEach(b => b.onclick = () => { const [g, r] = pick(b.dataset.arp); if (r) playRec(g, r); });
  el.querySelectorAll("[data-ard]").forEach(b => b.onclick = async () => {
    const [g, r, i] = pick(b.dataset.ard); if (!r) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟ ينحذف نهائياً"; return; }
    b.disabled = true;
    if (r.rid) { try { await recDelete(g, r); } catch (e) { console.error(e); b.disabled = false; return toast("تعذّر حذف الملف من السيرفر"); } }
    const l = [...(g.recordings || [])]; l.splice(i, 1);
    if (await saveRecList(g, l)) { toast("انحذف التسجيل"); render(); } else b.disabled = false;
  });
  el.querySelectorAll("[data-lvw]").forEach(b => b.onclick = async () => {
    const g = S.groups[b.dataset.lvw]; if (!g) return; b.disabled = true;
    try { await loadJitsi(MEET()); const tok = await meetToken(g.id); openRoom(g, tok); logAction("دخول محاضرة كمشرف", g.course); }
    catch (e) { console.error(e); toast("تعذّر الدخول للقاعة"); } finally { b.disabled = false; }
  });
  el.querySelectorAll("[data-lvt]").forEach(b => b.onclick = async () => {
    const g = S.groups[b.dataset.lvt]; if (!g) return; if (!validLink(g.meetLink)) return toast("المقرر ما له رابط Teams");
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    await setLive(g, "teams"); toast("انتقلت المحاضرة لـ Teams، والطلاب يتحولون تلقائياً");
  });
  el.querySelectorAll("[data-lve]").forEach(b => b.onclick = async () => {
    const g = S.groups[b.dataset.lve]; if (!g) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    await endLive(g); toast("انتهت المحاضرة، والطلاب يطلعون تلقائياً");
  });
}
const pending = path => { const q = Q[path]; return !!(q && (q.busy || q.next)); };
function handleWriteErr(e){
  console.error(e);
  if (e && e.code === "permission-denied") toast("ما عندك صلاحية تحفظ هذا التعديل");
  else toast("تعذّر الحفظ، تأكد من الاتصال وحاول مرة ثانية");
}

/* accounts are created through a second Firebase app so the admin stays signed in */
let secAuth = null;
async function createAccount(prefix, oldVer, password){
  if (!secAuth) secAuth = getAuth(initializeApp(firebaseConfig, "secondary"));
  let ver = (oldVer || 0) + 1;
  for (let tries = 0; tries < 4; tries++, ver++) {
    const email = `${prefix}.v${ver}@${DOMAIN}`;
    try {
      const cred = await createUserWithEmailAndPassword(secAuth, email, password);
      await signOut(secAuth);
      return {uid: cred.user.uid, email, ver};
    } catch (e) {
      if (e.code !== "auth/email-already-in-use") throw e;
    }
  }
  throw new Error("email-in-use");
}
const accountErr = e => (e && e.code === "auth/too-many-requests")
  ? "Firebase وقف إنشاء الحسابات مؤقتاً (حد الساعة). انتظر ساعة وكمّل، أو ارفع الحد من Authentication ← Settings."
  : "تعذّر إنشاء الحساب: " + ((e && (e.code || e.message)) || "?");

/* ---------- state ---------- */
const S = {
  authUser: null, role: null, adminRole: null, me: null, myNum: null, authReady: false,
  pub: null, trainers: {}, groups: {}, secrets: {}, students: {}, stSecrets: {}, grades: {},
  myStudent: null, myAtt: [], myResults: [],
  loaded: {trainers: false, groups: false},
  view: "home", subs: [],
  tGroup: null, tDate: today(), tTab: "roll",
  att: null, attPath: null, unsubAtt: null, groupAtt: [], unsubGroupAtt: null,
  sys: null, ann: {all: [], trainers: [], students: []}, logs: [],
  aTab: "dash", aDash: [], unsubDash: null, aReportGroup: null, aReport: [], unsubReport: null, aGradeGroup: null,
};

/* ---------- boot ---------- */
if (!configured) {
  $("#app").innerHTML = `<div class="notice err">البوابة تحتاج إعدادات Firebase في ملف config.js.</div>`;
} else {
  onSnapshot(ref("public/stamp"), snap => { S.stamp = snap.exists() ? snap.data().img || "" : ""; }, () => {});
  S.sigs = {}; ["director", "academic"].forEach(k => onSnapshot(ref("sigs/" + k), snap => { S.sigs[k] = snap.exists() ? snap.data().img || "" : ""; }, () => {}));
  onSnapshot(ref("public/site"), snap => { S.site = snap.exists() ? snap.data() : {}; licQR(); if (!S.authUser && S.view === "home") render(); }, () => { S.site = {}; });
  onSnapshot(ref("public/stats"), snap => { S.stats = snap.exists() ? snap.data() : null; if (!S.authUser && S.view === "home") render(); }, () => {});
  onSnapshot(ref("public/survey"), snap => { S.survey = snap.exists() ? snap.data() : null; if (S.role === "student" && !busyEditing()) render(); }, () => {});
  S.policy = new URLSearchParams(location.search).has("policy");
  S.idv = (new URLSearchParams(location.search).get("id") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || null;
  S.verify = (new URLSearchParams(location.search).get("verify") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || null;
  onSnapshot(ref("public/system"), snap => { S.sys = snap.exists() ? snap.data() : {}; render(); }, () => { S.sys = {}; render(); });
  onSnapshot(ref("ann/all"), snap => { S.ann.all = (snap.exists() && snap.data().items) || []; renderAnn(); }, () => {});
  onAuthStateChanged(auth, user => {
    stopAll();
    S.authUser = user; S.role = null; S.adminRole = null; S.me = null; S.myNum = null; S.authReady = true;
    if (S.cfUnsub) { try { S.cfUnsub(); } catch {} } S.cfUnsub = null; S.cfMine = []; S.cfMenu = undefined; S.cfOffers = undefined; S.cfBasket = []; S.cfNote = "";
    if (!user) { if (["trainer","admin","student"].includes(S.view)) S.view = "home"; render(); return; }
    const local = (user.email || "").split("@")[0];
    const role = Object.keys(ROLE_EMAIL).find(k => ROLE_EMAIL[k] === user.email);
    if (role) { S.role = "admin"; S.adminRole = role; S.view = "admin"; if (role === "auditor") S.aTab = "tasks"; }
    else if (local.startsWith("st-")) { S.role = "student"; S.myNum = local.split(".")[0].slice(3); S.view = "student"; }
    else { S.role = "trainer"; S.view = "trainer"; }
    if (S.role !== "admin") {
      const myId = S.role === "student" ? S.myNum : local.split(".")[0];
      getDoc(ref("public/disabled")).then(snap => { if (snap.exists() && (snap.data().list || {})[myId]) { S.disabledMsg = true; signOut(auth); } }).catch(() => {});
    }
    startData();
    setTimeout(() => { if (typeof Notification !== "undefined" && Notification.permission === "granted") enablePush(true); }, 2500);
    getDoc(ref("sigs/finance")).then(x => { S.sigs.finance = x.exists() ? x.data().img || "" : ""; }).catch(() => {});
    S._loginLog = S.role !== "student";
    render();
  });
}

function sub(q, fn){ S.subs.push(onSnapshot(q, fn, err => fail(err))); }
function watchStaffLock(){
  S.subs.push(onSnapshot(ref("public/staffLock"), async snap => {
    if (S._selfRotate || !S.authUser) return;
    const t = (snap.exists() && snap.data()[S.adminRole]) || 0; if (!t) return;
    let at = 0; try { at = Number((await S.authUser.getIdTokenResult()).claims.auth_time || 0); } catch {}
    if (t >= at) { try { sessionStorage.setItem("lockOut", "1"); } catch {} logout(); }
  }, () => {}));
}
function startData(){
  S.loaded = {trainers: false, groups: false};
  if (S.role === "admin" && MAILONLY()) { S.loaded = {trainers: true, groups: true}; watchStaffLock(); S.mail = null; mailSubs(); watchMemos();
    S.subs.push(onSnapshot(collection(db, "trainers"), snap => { S.trainers = {}; snap.docs.forEach(d => S.trainers[d.id] = {id: d.id, ...d.data()}); if (isChatTab() && $("#mmList")) memoPaint(); }, () => {}));
    return; }
  const annDocs = S.role === "admin" ? ["trainers", "students"] : S.role === "trainer" ? ["trainers"] : ["students"];
  annDocs.forEach(k => S.subs.push(onSnapshot(ref("ann/" + k), snap => { S.ann[k] = (snap.exists() && snap.data().items) || []; renderAnn(); }, () => {})));
  sub(collection(db, "trainers"), snap => {
    S.trainers = {}; snap.docs.forEach(d => S.trainers[d.id] = {id: d.id, ...d.data()});
    if (S.role === "trainer") { const t = Object.values(S.trainers).find(t => t.uid === S.authUser.uid); S.me = t ? t.id : null; if (S.me) { watchMsgs(); watchTrMsgs(); watchStaffReqs(); watchMemos(); if (!S.mail && trMe()) mailSubs(); } }
    S.loaded.trainers = true; afterData();
  });
  if (S.role === "student") {
    sub(ref("students/" + S.myNum), snap => { S.myStudent = snap.exists() ? snap.data() : null; afterData(); });
    sub(query(collection(db, "groups"), where("memberNums", "array-contains", S.myNum)), snap => {
      S.groups = {}; snap.docs.forEach(d => S.groups[d.id] = {id: d.id, ...d.data()}); S.loaded.groups = true; afterData();
    });
    S.subs.push(onSnapshot(query(collection(db, "att"), where("memberNums", "array-contains", S.myNum)), snap => { S.myAtt = snap.docs.map(d => d.data()); render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "results"), where("num", "==", S.myNum)), snap => { S.myResults = snap.docs.map(d => d.data()); render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "excuses"), where("num", "==", S.myNum)), snap => { S.myExc = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "warnings"), where("num", "==", S.myNum)), snap => { S.myWarn = snap.docs.map(d => d.data()); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(ref("finAccounts/" + S.myNum), snap => { S.myFin = snap.exists() ? snap.data() : null; if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "payments"), where("num", "==", S.myNum)), snap => { S.myPay = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "acReqs"), where("num", "==", S.myNum)), snap => { S.myAReq = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "finReqs"), where("num", "==", S.myNum)), snap => { S.myFReq = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "idcards"), where("num", "==", S.myNum)), snap => { const t = snap.docs[0] ? snap.docs[0].id : null; if (t !== S.myIdTok) { S.myIdTok = t; if (S.sTab === "card" && !busyEditing()) render(); } }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "certs"), where("num", "==", S.myNum)), snap => { S.myCerts = snap.docs.map(d => d.data()).filter(c => !c.revoked); if (!busyEditing()) render(); }, () => {}));
    S.subs.push(onSnapshot(query(collection(db, "evals"), where("num", "==", S.myNum)), snap => { S.myEvals = snap.docs.map(d => d.data()); if (!busyEditing()) render(); }, () => {}));
    watchCamp(); watchMsgs(); setTimeout(checkPayReturn, 1500);
    S.subs.push(onSnapshot(query(collection(db, "exams"), where("memberNums", "array-contains", S.myNum)), snap => { S.myExams = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!S.exTake && !busyEditing()) render(); }, e => console.error(e)));
    S.subs.push(onSnapshot(query(collection(db, "examSubs"), where("num", "==", S.myNum)), snap => {
      const old = S.mySubs || {}; S.mySubs = {}; snap.docs.forEach(d => { const x = d.data({serverTimestamps: "estimate"}); S.mySubs[x.eid] = x; });
      // while answering, only redraw when the attempt first appears or gets submitted
      if (S.exTake) { const a = old[S.exTake], b = S.mySubs[S.exTake]; if (!a !== !b || (a && b && a.done !== b.done) || (a && b && tsMs(a.startedAt) !== tsMs(b.startedAt))) render(); }
      else if (!busyEditing()) render();
    }, e => console.error(e)));
    return;
  }
  sub(collection(db, "groups"), snap => {
    S.groups = {}; snap.docs.forEach(d => S.groups[d.id] = {id: d.id, ...d.data()});
    S.loaded.groups = true; afterData();
  });
  S.subs.push(onSnapshot(collection(db, "grades"), snap => { S.grades = {}; snap.docs.forEach(d => S.grades[d.id] = d.data()); afterData(); }, () => {}));
  if (S.role === "admin" && !FIN() && !MAILONLY()) { watchCamp(); S.subs.push(onSnapshot(ref("exams/" + CAMP_EID), snap => { S.campExam = snap.exists() ? {id: CAMP_EID, ...snap.data()} : null; if (S.aTab === "camp" && !busyEditing()) render(); }, () => {})); }
  if (S.role === "admin") {
    S.subs.push(onSnapshot(ref("public/disabled"), snap => { S.disabled = (snap.exists() && snap.data().list) || {}; afterData(); }, () => {}));
    // emergency lock: a session that signed in before its role's lock time leaves at once
    watchStaffLock(); watchMsgs(); watchTasks(); watchTrMsgs(); watchStaffReqs();
    if (!RO()) { S.mail = null; mailSubs(); }
    watchMemos();
    if (!FIN()) S.subs.push(onSnapshot(collection(db, "acReqs"), snap => { S.aReqs = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
    if (!FIN()) S.subs.push(onSnapshot(collection(db, "waivers"), snap => { S.waivers = {}; snap.docs.forEach(d => S.waivers[d.id] = d.data()); afterData(); }, () => {}));
    if (SEES_FIN()) startFinance();
    if (!RO()) S.subs.push(onSnapshot(collection(db, "finClear"), snap => { S.finClear = {}; snap.docs.forEach(d => S.finClear[d.id] = d.data()); S.finClearLoaded = true; afterData(); }, () => {}));
    if (FIN()) {
      S.subs.push(onSnapshot(collection(db, "students"), snap => { S.students = {}; snap.docs.forEach(d => S.students[d.id] = d.data()); afterData(); }, () => {}));
      return;
    }
    if (RO()) {
      startFinance();
      S.subs.push(onSnapshot(collection(db, "students"), snap => { S.students = {}; snap.docs.forEach(d => S.students[d.id] = d.data()); afterData(); }, () => {}));
      S.subs.push(onSnapshot(collection(db, "warnings"), snap => { S.warnings = {}; snap.docs.forEach(d => S.warnings[d.id] = d.data()); afterData(); }, () => {}));
      S.subs.push(onSnapshot(collection(db, "certs"), snap => { S.certs = {}; snap.docs.forEach(d => { const c = d.data(); S.certs[c.key] = c; }); afterData(); }, () => {}));
      return;
    }
    S.subs.push(onSnapshot(collection(db, "certs"), snap => { S.certs = {}; snap.docs.forEach(d => { const c = d.data(); S.certs[c.key] = c; }); afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "idcards"), snap => { S.idTok = {}; S.idDocs = {}; snap.docs.forEach(d => { const v = d.data(); S.idDocs[d.id] = v; if (v.num) S.idTok[v.num] = d.id; }); S.idLoaded = true; afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "excuses"), snap => { S.excuses = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "warnings"), snap => { S.warnings = {}; snap.docs.forEach(d => S.warnings[d.id] = d.data()); afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "secrets"), snap => { S.secrets = {}; S.trPhones = {}; snap.docs.forEach(d => { S.secrets[d.id] = d.data().code; if (d.data().phone) S.trPhones[d.id] = d.data().phone; }); afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "students"), snap => { S.students = {}; snap.docs.forEach(d => S.students[d.id] = d.data()); afterData(); }, () => {}));
    S.subs.push(onSnapshot(collection(db, "studentSecrets"), snap => { S.stSecrets = {}; S.stPhones = {}; S.stProf = {}; snap.docs.forEach(d => { const v = d.data(); S.stSecrets[d.id] = v.code; S.stProf[d.id] = v; if (v.phone) S.stPhones[d.id] = v.phone; }); afterData(); }, () => {}));
  }
}
function fail(err){ console.error(err); $("#app").innerHTML = `<div class="notice err">تعذّر تحميل البيانات. ${err && err.code === "permission-denied" ? "حسابك ما عنده صلاحية، أو قواعد الحماية في Firebase تحتاج تحديث." : "تأكد من الاتصال وحدّث الصفحة."}</div>`; }
function stopAll(){ S.subs.forEach(u => u()); S.subs = []; S.courses = null; S._crsOpen = null; S.signReqs = null; stopAtt(); stopAdminSubs(); S.trainers = {}; S.groups = {}; S.secrets = {}; S.students = {}; S.stSecrets = {}; S.grades = {}; S.myStudent = null; S.myAtt = []; S.myResults = []; S.myExc = []; S.myWarn = []; S.myEvals = []; S.myExams = []; S.mySubs = {}; S.exTake = null; S._exAns = null; clearInterval(S._exTimer); S.exams = {}; S.exView = null; S.hrStaff = null; S.hrAtt = null; S.camp = null; S._campOn = false; S.campExam = null; S._campLes = null; S.excuses = []; S.warnings = {}; S.sTab = "home"; S._trainerSynced = false; S.ann.trainers = []; S.ann.students = []; renderAnn(); S._msgSub = false; S.inbox = []; S.inboxRead = new Set(); renderInboxBar(); }

function afterData(){
  if (S._finModal && $("#modal").classList.contains("on") && S._finDraw && !busyEditing()) S._finDraw();
  if (S._loginLog && S.loaded.trainers) { S._loginLog = false; logAction("تسجيل دخول", ""); }
  if (S.role === "admin" && !MAILONLY()) syncTrainerNumbers();
  if (SEES_FIN()) syncFinClear();
  if (S.role === "admin" && !RO() && !FIN() && !MAILONLY()) { syncPublicStats(); syncIdCards(); }
  if (S.view === "trainer" && S.tGroup && !S.groups[S.tGroup]) { S.tGroup = null; stopAtt(); }
  if (S.view === "admin" && $("#modal").classList.contains("on") && S._modalGroup) renderModalStudents();
  if (busyEditing()) return;
  render();
}
function busyEditing(){
  if ([...document.querySelectorAll("#app input[type=file], #modalBox input[type=file]")].some(i => i.files && i.files.length)) return true;   // a picked image not sent yet
  const a = document.activeElement;
  if (!a || !a.closest) return false;
  if (S._busy) return true;
  return (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && (["fqS","arT","arP","mmT","mcTo","mcCc","mcS","mcT","mlQ","mlink","recT","recU","recD","wm","wp","mMsg","lockH","aText","aExp","lq","th1","th2","th3","th4","hLabel","hFrom","hTo","repM","exR","exN","arName","arOk","faQ","prN","prF","pAmt","pRef","pN","pvR","fFee","fDis","fDisN","fPh","sB","sAdd","sDed","sNote","salM","exA","exT","exVR","xL","xA","etN","etF","ptN","ptP","ptV","cA","cN","exRef","cdL","cdA","vapK","evL","evD","accN","licU","pfNid","pfPh","pfG","pfE","pfEdu","pfCity","pfN","aeN","crT","crF","crTo","crH","crTr","crP","crS","crXN","crXP","srT","srN","srRR","nwT","nwU","nwX","so-maps","so-whatsapp","so-website","so-x","so-instagram","so-snapchat","so-tiktok","so-linkedin"].includes(a.id) || !!a.closest("#roll, #gradesBox, #ab, #sb, #modalBox"));
}

/* ---------- audit log ---------- */
const _logT = {};
function whoAmI(){
  if (S.role === "admin") return ROLES[S.adminRole] || "الإدارة";
  if (S.role === "trainer") { const t = S.trainers[S.me]; return t ? trainerTitle(t) : "مدرب"; }
  return "";
}
function logAction(action, details, throttleKey){
  if (!S.authUser || S.role === "student" || RO()) return;
  if (throttleKey) { const now = Date.now(); if (_logT[throttleKey] && now - _logT[throttleKey] < 180000) return; _logT[throttleKey] = now; }
  addDoc(collection(db, "logs"), {at: serverTimestamp(), uid: S.authUser.uid, role: S.role === "admin" ? S.adminRole : "trainer", who: whoAmI() || S.authUser.email, action, details: String(details || "").slice(0, 300)}).catch(() => {});
}

/* ---------- attendance lock (also enforced in Firestore rules) ---------- */
const lockHours = () => { const h = S.sys && S.sys.lockHours; return typeof h === "number" && h >= 0 ? h : null; };
function isLocked(date){
  const h = lockHours(); if (h === null || S.role === "admin") return false;
  const [y, m, d] = date.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d) - 3 * 3600e3 + (24 + h) * 3600e3;   // end of the day in Riyadh + h hours
  return Date.now() > end;
}

/* ---------- announcements ---------- */
const AUD = {all: "الكل", trainers: "المدربين", students: "الطلاب"};
function liveAnn(list){ const t = today(); return (list || []).filter(a => !a.expires || a.expires >= t); }
function renderAnn(){
  let bar = $("#annBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "annBar"; bar.style.cssText = "max-width:1040px;margin:12px auto 0;padding:0 16px;display:grid;gap:8px"; $("#app").before(bar); }
  const items = [...liveAnn(S.ann.all), ...liveAnn(S.ann.trainers), ...liveAnn(S.ann.students)];
  bar.innerHTML = items.map(a => `<div class="notice" role="status"><b>إعلان${a.audience && a.audience !== "all" ? " · " + AUD[a.audience] : ""}:</b> ${esc(a.text)}</div>`).join("");
}


/* ---------- push notifications (sent by the Cloudflare worker; the portal only registers the device) ---------- */
const pushId = t => t.replace(/[^\w:-]/g, "_").slice(0, 1400);
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// one device can hold several accounts (e.g. a trainer who also runs academic affairs): each account gets its own record for this device
const pushDocId = token => pushId(token).slice(0, 1300) + "__" + String(S.authUser.email || "").split("@")[0].replace(/[^\w-]/g, "_").slice(0, 60);
const pushMine = () => { try { const v = localStorage.getItem("asasPush") || ""; return v.startsWith("[") ? JSON.parse(v) : v ? [v] : []; } catch { return []; } };
const pushOn = () => pushSupported() && Notification.permission === "granted" && pushMine().includes(S.authUser.email);
async function enablePush(silent){
  if (!S.authUser) return;
  if (!pushSupported()) { if (!silent) toast(isIOS() ? "على الآيفون: ثبّت البوابة على الشاشة الرئيسية من Safari أول، وافتحها من الأيقونة، وبعدها فعّل الإشعارات" : "متصفحك ما يدعم الإشعارات، جرّب Chrome"); return; }
  const vapid = S.site && S.site.vapid;
  if (!vapid) { if (!silent) toast("الإشعارات ما تفعّلت من إدارة المعهد للحين"); return; }
  try {
    if (Notification.permission !== "granted") { if (silent) return; const p = await Notification.requestPermission(); if (p !== "granted") return toast("ما سمحت بالإشعارات. تقدر تسمح لها من إعدادات المتصفح"); }
    const reg = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready;
    const M = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    if (!(await M.isSupported())) { if (!silent) toast("متصفحك ما يدعم الإشعارات"); return; }
    const token = await M.getToken(M.getMessaging(app), {vapidKey: vapid, serviceWorkerRegistration: reg});
    if (!token) return;
    await setDoc(ref("pushTokens/" + pushDocId(token)), {token, email: S.authUser.email, role: S.role === "admin" ? S.adminRole : S.role, num: S.myNum || "", tid: S.role === "trainer" ? (S.me || "") : "", at: new Date().toISOString()});
    try { localStorage.setItem("asasPush", JSON.stringify([...new Set([...pushMine(), S.authUser.email])].slice(-6))); } catch {}
    if (!silent) { toast("تفعّلت الإشعارات ✓"); renderTop(); }
  } catch (e) { console.error(e); if (!silent) toast("تعذّر تفعيل الإشعارات"); }
}

/* ---------- user guides (PDFs on the classroom server), for everyone by audience ---------- */
const GUIDE_AUD = {all: "الكل", trainer: "المدربين", student: "الطلاب", staff: "الإدارات"};
const guideKind = () => S.role === "trainer" ? "trainer" : S.role === "student" ? "student" : "staff";
const guideEditor = () => S.role === "admin" && ["admin", "academic"].includes(S.adminRole);
async function loadGuides(){
  try { const sn = await getDocs(collection(db, "guides")); S.guides = sn.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (a.order || 0) - (b.order || 0) || String(b.at).localeCompare(String(a.at))); }
  catch (e) { console.error(e); S.guides = S.guides || []; }
}
async function guidesModal(){
  $("#modalBox").innerHTML = `<p class="muted">جاري التحميل…</p>`; $("#modal").classList.add("on");
  await loadGuides(); guidesRender();
}
function guidesRender(){
  const k = guideKind(), ed = guideEditor();
  const L = (S.guides || []).filter(g => ed || S.role === "admin" || (g.aud || ["all"]).some(a => a === "all" || a === k));
  const F = S._gF = S._gF || {title: "", aud: ["all"]};
  $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📘 أدلة الاستخدام</h2><button class="btn sm" id="gX">إغلاق</button></div>
    <div class="list" style="margin-top:10px">${L.map(g => `<div class="item" style="flex-wrap:wrap"><span class="grow" style="min-width:180px"><b>${esc(g.title)}</b><div class="muted" style="font-size:13px">${esc(fmtSize(g.size) || "")}${ed ? ` · يظهر لـ: ${(g.aud || ["all"]).map(a => GUIDE_AUD[a] || a).join("، ")}` : ""}</div></span>
      <button class="btn sm pri" data-gget="${esc(g.id)}">⬇️ تنزيل</button>${ed ? `<button class="btn sm danger" data-gdel="${esc(g.id)}">حذف</button>` : ""}</div>`).join("") || `<div class="empty">ما فيه أدلة للحين.</div>`}</div>
    ${ed ? `<div class="card" style="margin-top:12px;padding:12px"><h3 style="margin:0 0 6px">إضافة دليل</h3>
      <input type="text" id="gT" maxlength="100" placeholder="اسم الدليل، مثل: دليل المدرب" value="${esc(F.title)}" style="width:100%">
      <div class="row" style="gap:12px;margin:8px 0;flex-wrap:wrap"><span class="muted">يظهر لـ:</span>${Object.entries(GUIDE_AUD).map(([a, v]) => `<label class="row" style="gap:4px"><input type="checkbox" data-gaud="${a}" ${F.aud.includes(a) ? "checked" : ""}> ${v}</label>`).join("")}</div>
      <input type="file" id="gF" accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,image/*">
      <p class="muted" style="margin:6px 0 0;font-size:13px">PDF أو Word أو فيديو، لين 50 ميجا. «الإدارات» تعني كل الإدارات، والإدارة العامة والشؤون الأكاديمية يشوفون كل الأدلة.</p>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="gUp">رفع الدليل</button><span class="muted" id="gPct"></span></div></div>` : ""}`;
  $("#gX").onclick = closeModal;
  $("#modalBox").querySelectorAll("[data-gget]").forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = "جاري…";
    try { const j = await pushApi("/guides", {action: "get", id: b.dataset.gget}); const a = document.createElement("a"); a.href = j.url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { toast(e.status === 404 ? "حدّث worker في Cloudflare لآخر نسخة" : "تعذّر التنزيل، حاول مرة ثانية"); }
    b.disabled = false; b.textContent = "⬇️ تنزيل";
  });
  if (!ed) return;
  $("#gT").oninput = e => { F.title = e.target.value; };
  $("#modalBox").querySelectorAll("[data-gaud]").forEach(c => c.onchange = () => {
    const a = c.dataset.gaud; F.aud = c.checked ? (a === "all" ? ["all"] : [...F.aud.filter(x => x !== "all"), a]) : F.aud.filter(x => x !== a); if (!F.aud.length) F.aud = ["all"]; guidesRender(); });
  $("#modalBox").querySelectorAll("[data-gdel]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    b.disabled = true; const g = S.guides.find(x => x.id === b.dataset.gdel);
    try { await pushApi("/guides", {action: "del", id: b.dataset.gdel}); logAction("حذف دليل استخدام", g ? g.title : ""); await loadGuides(); guidesRender(); }
    catch (e) { b.disabled = false; toast("تعذّر الحذف"); }
  });
  $("#gUp").onclick = async e => {
    const file = $("#gF").files[0], title = (F.title || "").trim();
    if (!title) return toast("اكتب اسم الدليل"); if (!file) return toast("اختر الملف");
    if (file.size > 50 * 1024 ** 2) return toast("الملف أكبر من 50 ميجا");
    e.target.disabled = true;
    try {
      const t = await pushApi("/guides", {action: "up", size: file.size});
      await new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("PUT", t.url);
        x.upload.onprogress = ev => { if (ev.lengthComputable && $("#gPct")) $("#gPct").textContent = Math.floor(ev.loaded / ev.total * 100) + "%"; };
        x.onload = () => x.status === 200 ? ok() : no(new Error("up " + x.status)); x.onerror = () => no(new Error("net")); x.send(file); });
      await setDoc(ref("guides/g" + uid() + uid()), {title: title.slice(0, 100), aud: F.aud, rid: t.rid, name: file.name.slice(0, 150), size: file.size, type: file.type || "application/octet-stream", at: new Date().toISOString(), by: ROLES[S.adminRole] || S.adminRole});
      logAction("إضافة دليل استخدام", `${title} · ${F.aud.map(a => GUIDE_AUD[a]).join("، ")}`);
      S._gF = null; toast("انرفع الدليل ✓"); await loadGuides(); guidesRender();
    } catch (x) { console.error(x); e.target.disabled = false; toast(x.status === 404 ? "حدّث worker في Cloudflare لآخر نسخة" : x.status === 503 ? "سيرفر القاعة مو مربوط" : "تعذّر الرفع: " + (x.detail || x.message), 1); }
  };
}

/* ---------- top bar ---------- */
const trainerTitle = t => (t.gender === "f" ? "المدربة " : "المدرب ") + t.name;
function renderTop(){
  const w = $("#topWho"), sub = $("#topSub");
  const label = {trainer: "بوابة المدربين", admin: "بوابة الشؤون المالية والأكاديمية", student: "بوابة الطلاب", trainerLogin: "بوابة المدربين", adminLogin: "بوابة الشؤون المالية والأكاديمية", studentLogin: "بوابة الطلاب"}[S.view] || "البوابة الإلكترونية";
  sub.textContent = label;
  if (S.authUser) {
    let who = "";
    if (S.role === "trainer" && S.trainers[S.me]) who = trainerTitle(S.trainers[S.me]);
    if (S.role === "admin") who = ROLES[S.adminRole];
    if (S.role === "student" && S.myStudent) who = S.myStudent.name;
    w.innerHTML = `<span>${esc(who)}</span>${S.role ? `<button class="btn ghost sm" id="guideBtn">📘 الأدلة</button>` : ""}${S.site && S.site.vapid && !pushOn() ? `<button class="btn ghost sm" id="pushBtn">تفعيل الإشعارات</button>` : ""}<button class="btn ghost sm" id="out">خروج</button>`;
    if ($("#pushBtn")) $("#pushBtn").onclick = () => enablePush(false);
    if ($("#guideBtn")) $("#guideBtn").onclick = () => guidesModal();
    $("#out").onclick = () => { S.view = "home"; logout(); };
  } else if (S.view !== "home") {
    w.innerHTML = `<button class="btn ghost sm" id="homeBtn">الرئيسية</button>`;
    $("#homeBtn").onclick = () => go("home");
  } else w.innerHTML = "";
}
function go(v){ S.view = v; render(); window.scrollTo(0, 0); }

/* ---------- render root ---------- */
function renderFab(){
  let box = $("#waFab");
  const list = waList(S.site), show = list.length > 0 && (!S.authUser || S.role === "student") && !S.verify;
  if (!show) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement("div"); box.id = "waFab"; box.className = "waWrap"; document.body.appendChild(box); }
  const sig = JSON.stringify(list); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  if (list.length === 1) {
    box.innerHTML = `<a class="waFab" href="${esc(socialUrl("whatsapp", list[0].num))}" target="_blank" rel="noopener" aria-label="تواصل معنا على واتساب" title="${esc(list[0].label || "واتساب")}">${ICON.whatsapp}</a>`;
    return;
  }
  box.innerHTML = `<div class="waMenu" id="waMenu" hidden>${list.map(w => `<a href="${esc(socialUrl("whatsapp", w.num))}" target="_blank" rel="noopener">${ICON.whatsapp}<span>${esc(w.label || "واتساب")}</span></a>`).join("")}</div>
    <button class="waFab" id="waBtn" aria-label="تواصل معنا على واتساب" aria-expanded="false" aria-controls="waMenu">${ICON.whatsapp}</button>`;
  const btn = box.querySelector("#waBtn"), menu = box.querySelector("#waMenu");
  btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", ev => { if (!box.contains(ev.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
}
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("[data-policy]"); if (!a) return; e.preventDefault(); S.policy = true; history.pushState(null, "", "?policy"); render(); window.scrollTo(0, 0); });
window.addEventListener("popstate", () => { S.policy = new URLSearchParams(location.search).has("policy"); render(); });
function render(){
  if (!configured) return;
  renderTop(); renderFab();
  const app = $("#app");
  if (S.idv) { $("#topSub").textContent = "التحقق من بطاقة المتدرب"; return renderIdVerify(app); }
  if (S.verify) { $("#topSub").textContent = "التحقق من الشهادات"; return renderVerify(app); }
  if (S.policy) return renderPolicy(app);
  if (!S.authReady || !S.sys) { app.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  if (S.sys.maintenance && S.role !== "admin" && S.view !== "adminLogin") {
    app.innerHTML = `<div class="card" style="text-align:center;padding:36px 16px"><h2>الموقع تحت الصيانة</h2>
      <p style="white-space:pre-line">${esc(S.sys.maintenanceMsg || "نعمل على تحسين البوابة، وبنرجع قريباً.")}</p>
      ${S.authUser ? `` : `<button class="btn sm" id="mAdm" style="margin-top:12px">دخول الإدارة</button>`}</div>`;
    if ($("#mAdm")) $("#mAdm").onclick = () => go("adminLogin");
    return;
  }
  if (!S.authUser) {
    if (S.view === "trainerLogin") return renderTrainerLogin(app);
    if (S.view === "adminLogin") return renderAdminLogin(app);
    if (S.view === "studentLogin") return renderStudentLogin(app);
    return renderHome(app);
  }
  if (!S.loaded.groups || !S.loaded.trainers) { app.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري تحميل البيانات…</p></div>`; return; }
  if (S.role === "admin") return renderAdmin(app);
  if (S.role === "student") return renderStudent(app);
  return renderTrainer(app);
}


/* ---------- home page: content and helpers ---------- */
const dayOfYear = () => { const [y, m, d] = today().split("-").map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5); };
const QUOTES = [
  "كل محاضرة تحضرها خطوة أقرب لهدفك.",
  "التعلّم استثمار ما يخسر أبداً.",
  "المهارة تُبنى بالتكرار، والتميّز يُبنى بالالتزام.",
  "خطوة صغيرة كل يوم، تصنع فرق كبير آخر الفصل.",
  "النجاح ما هو صدفة، هو حضور والتزام كل يوم.",
  "المعرفة اللي تتعلمها اليوم، تفتح لك باب بكرة.",
  "اللي يتعلّم باستمرار، ما يوقف عن التقدّم.",
  "الانضباط جسر بين أهدافك وإنجازاتك.",
  "كل خبير كان في يوم مبتدئ ما استسلم.",
  "اسأل، وجرّب، وتعلّم من الخطأ؛ هذي طريق الإتقان.",
  "وقتك في التدريب يصنع فرقك في سوق العمل.",
  "التزامك اليوم شهادتك بكرة.",
  "الطموح يبدأ بقرار، ويكتمل بالمثابرة.",
  "كل يوم فرصة جديدة تتعلّم فيها شي جديد.",
  "القانون يحمي الحقوق، والمعرفة تحمي صاحبها.",
  "اجعل فضولك أكبر من خوفك من الغلط.",
  "الإتقان ما يجي مرة وحدة، يجي محاضرة بعد محاضرة.",
  "استثمر في نفسك، فهي المشروع اللي ما يخسر.",
  "اللي يحضر بانتظام، يحصد بثقة.",
  "التطوير المهني رحلة، وأنت الحين على الطريق الصح."
];

/* TVTC training calendar 1448-1449, split-semester system (النظام النصفي المجزأ), Gregorian dates as printed */
const TVTC_1448 = {
  holidays: [
    {from: "2026-09-23", to: "2026-09-24", label: "إجازة اليوم الوطني"},
    {from: "2026-10-25", to: "2026-10-25", label: "إجازة مطوّلة"},
    {from: "2026-11-22", to: "2026-11-26", label: "إجازة الخريف"},
    {from: "2026-11-29", to: "2026-11-29", label: "إجازة مطوّلة"},
    {from: "2027-01-07", to: "2027-01-16", label: "إجازة منتصف العام التدريبي"},
    {from: "2027-02-21", to: "2027-02-22", label: "إجازة يوم التأسيس"},
    {from: "2027-02-26", to: "2027-03-13", label: "إجازة عيد الفطر"},
    {from: "2027-04-11", to: "2027-04-11", label: "إجازة مطوّلة"},
    {from: "2027-05-07", to: "2027-05-22", label: "إجازة عيد الأضحى"}
  ],
  events: [
    ["2026-07-19", "بداية تسجيل المستجدين وطلبات التجسير واستعادة القيد، وبداية تسجيل المقررات"],
    ["2026-08-20", "نهاية تسجيل المستجدين وطلبات التجسير"],
    ["2026-08-23", "بداية التدريب، ونهاية تسجيل المقررات وطلبات التحويل"],
    ["2026-09-06", "آخر موعد لحذف المقررات"],
    ["2026-09-20", "آخر فترة للانسحاب، وبداية تسجيل المستجدين للجزء الثاني"],
    ["2026-10-18", "بداية الاختبارات وتسجيل النتائج، وبداية تسجيل المقررات"],
    ["2026-10-22", "نهاية الفترة التدريبية ونهاية تسجيل النتائج"],
    ["2026-11-01", "بداية التدريب، ونهاية تسجيل المقررات وطلبات التحويل"],
    ["2026-11-15", "آخر موعد لحذف المقررات"],
    ["2026-12-06", "آخر فترة للانسحاب، وبداية تسجيل المستجدين وطلبات التجسير واستعادة القيد"],
    ["2027-01-03", "بداية الاختبارات وتسجيل النتائج، وبداية تسجيل المقررات"],
    ["2027-01-06", "نهاية تسجيل النتائج ونهاية الفترة التدريبية"],
    ["2027-01-14", "نهاية تسجيل المستجدين وطلبات التجسير"],
    ["2027-01-17", "بداية التدريب، ونهاية تسجيل المقررات ورفع الجداول وطلبات التحويل"],
    ["2027-01-31", "آخر موعد لحذف المقررات"],
    ["2027-02-14", "آخر فترة للانسحاب، وبداية تسجيل المستجدين للجزء الثاني"],
    ["2027-03-28", "بداية الاختبارات وتسجيل النتائج، وبداية تسجيل المقررات"],
    ["2027-04-01", "نهاية الفترة التدريبية ونهاية تسجيل النتائج"],
    ["2027-04-12", "بداية التدريب، ونهاية تسجيل المقررات وطلبات التحويل"],
    ["2027-04-26", "آخر موعد لحذف المقررات"],
    ["2027-05-02", "بداية تسجيل المستجدين للفصل الصيفي وطلبات التجسير واستعادة القيد"],
    ["2027-05-24", "آخر فترة للانسحاب"],
    ["2027-06-20", "بداية الاختبارات وتسجيل النتائج، وبداية تسجيل المقررات"],
    ["2027-06-24", "نهاية الفترة التدريبية وتسجيل النتائج، وبداية إجازة نهاية العام التدريبي"],
    ["2027-06-27", "بداية التدريب للفصل الصيفي، ونهاية تسجيل المقررات وطلبات التحويل"],
    ["2027-07-11", "الفصل الصيفي: آخر موعد لحذف المقررات"],
    ["2027-07-25", "الفصل الصيفي: آخر فترة للانسحاب، وبداية تسجيل المستجدين"],
    ["2027-08-15", "الفصل الصيفي: بداية الاختبارات وتسجيل النتائج"],
    ["2027-08-19", "الفصل الصيفي: نهاية تسجيل النتائج والفترة التدريبية"]
  ].map(([date, label]) => ({date, label}))
};
/* QR that points at the institute's official license page on the TVTC site */
async function licQR(){
  const url = S.site && S.site.licUrl; if (!url || !/^https:\/\//.test(url)) return "";
  if (S._licQR && S._licQRurl === url) return S._licQR;
  try { const qrcode = await loadQR(); const q = qrcode(0, "M"); q.addData(url); q.make(); S._licQR = q.createSvgTag({cellSize: 3, margin: 0}); S._licQRurl = url; return S._licQR; } catch { return ""; }
}
/* upcoming holidays (they also stop attendance) and academic-calendar events (they don't), nearest first */
function upcomingCal(){
  const t = today(), [y1, m1, d1] = t.split("-").map(Number), base = Date.UTC(y1, m1 - 1, d1);
  const days = d => { const [y, m, dd] = d.split("-").map(Number); return Math.max(0, Math.round((Date.UTC(y, m - 1, dd) - base) / 864e5)); };
  const hol = ((S.sys && S.sys.holidays) || []).filter(h => (h.to || h.from) >= t).map(h => ({label: h.label || "إجازة", from: h.from, to: h.to, hol: true}));
  const ev = ((S.sys && S.sys.events) || []).filter(e => e.date >= t).map(e => ({label: e.label, from: e.date}));
  return [...hol, ...ev].sort((a, b) => a.from.localeCompare(b.from) || (b.hol ? 1 : 0) - (a.hol ? 1 : 0)).map(u => ({...u, days: days(u.from < t ? t : u.from)}));
}
function nextHoliday(){
  const t = today(), list = ((S.sys && S.sys.holidays) || []).filter(h => (h.to || h.from) >= t).sort((a, b) => a.from.localeCompare(b.from));
  const h = list[0]; if (!h) return null;
  const [y1, m1, d1] = t.split("-").map(Number), [y2, m2, d2] = h.from.split("-").map(Number);
  return {...h, days: Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5))};
}
const waList = site => ((site && site.whatsapps) || (site && site.whatsapp ? [{label: "واتساب", num: site.whatsapp}] : [])).filter(x => x && x.num);
const SOCIAL = [["maps", "موقعنا (رابط خرائط Google)"], ["whatsapp", "واتساب"], ["website", "الموقع"], ["x", "إكس"], ["instagram", "إنستغرام"], ["snapchat", "سناب شات"], ["tiktok", "تيك توك"], ["linkedin", "لينكدإن"]];
function socialUrl(k, v){
  v = String(v || "").trim(); if (/^https:\/\//i.test(v)) return v;
  if (k === "maps") return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
  const u = v.replace(/^@/, "");
  return {whatsapp: `https://wa.me/${normPhone(v)}`, website: `https://${u.replace(/^https?:\/\//i, "")}`, x: `https://x.com/${u}`, instagram: `https://instagram.com/${u}`, snapchat: `https://snapchat.com/add/${u}`, tiktok: `https://tiktok.com/@${u}`, linkedin: `https://linkedin.com/company/${u}`}[k] || "#";
}
const svgI = (body, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  maps: svgI(`<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>`),
  clock: svgI(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  news: svgI(`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>`),
  help: svgI(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17v.01"/>`),
  student: svgI(`<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>`, "pico"),
  trainer: svgI(`<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 20l3-4M17 20l-3-4M7 9h6M7 12h9"/>`, "pico"),
  admin: svgI(`<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z"/><path d="M8 21h8"/>`, "pico"),
  seal: svgI(`<circle cx="12" cy="9" r="6"/><path d="M9.5 9l1.8 1.8L15 7.5"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>`),
  cal: svgI(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  whatsapp: svgI(`<path d="M4 20l1.3-3.8A8 8 0 1112 20a8 8 0 01-4.2-1.2z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>`),
  website: svgI(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`),
  x: svgI(`<path d="M4 4l16 16M20 4L4 20"/>`),
  instagram: svgI(`<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>`),
  snapchat: svgI(`<path d="M12 3c3 0 5 2.2 5 5.5v2l2 1-2 1.2c-.5 1.8-2 3-2 3l3 1.3-3 .8-1 1.7c-1-.4-2-.5-2-.5s-1 .1-2 .5l-1-1.7-3-.8 3-1.3s-1.5-1.2-2-3L5 11.5l2-1v-2C7 5.2 9 3 12 3z"/>`),
  tiktok: svgI(`<path d="M14 3v11.5a3.5 3.5 0 11-3.5-3.5"/><path d="M14 3c.5 2.5 2.5 4.5 5 4.5"/>`),
  linkedin: svgI(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 014 0v4M12 10v7"/>`)
};

const cdCells = ms => { const s = Math.max(0, Math.floor(ms / 1000)), parts = [[Math.floor(s / 86400), "يوم"], [Math.floor(s % 86400 / 3600), "ساعة"], [Math.floor(s % 3600 / 60), "دقيقة"], [s % 60, "ثانية"]]; return parts.map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`).join(""); };
const DEFAULT_FAQ = [
  {q: "نسيت رمز الدخول، وش أسوي؟", a: "تواصل مع الشؤون الأكاديمية، ويعطونك رمز جديد على طول."},
  {q: "يطلع لي «حسابك موقوف مؤقتاً»", a: "تواصل مع الشؤون الأكاديمية عشان يوضحون لك السبب ويفعّلون حسابك."},
  {q: "كيف أثبّت البوابة على جوالي؟", a: "اضغط «تثبيت التطبيق» في الشريط الأخضر فوق. على الآيفون: من Safari اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية»."},
  {q: "متى ينحسب علي غياب؟", a: "الغياب بدون عذر ينحسب. التأخير ينحسب حضور، والعذر المقبول ما ينحسب غياب، وأيام الإجازات الرسمية ما فيها تحضير."},
  {q: "كم أقدر أغيب قبل الحرمان؟", a: "افتح «حضوري» في بوابة الطلاب، ويطلع لك نسب الإنذار والحرمان، وكم غياب باقي لك في كل مقرر."},
  {q: "كيف أرفع عذر غياب؟", a: "من بوابة الطلاب، افتح «الأعذار»، واختر المحاضرة، واكتب السبب، وأرفق صورة العذر."},
  {q: "رفعت عذر، كيف أعرف إنه انقبل؟", a: "الشؤون الأكاديمية تراجعه، وحالته تطلع لك في «الأعذار»: قيد المراجعة أو مقبول أو مرفوض."},
  {q: "حضوري مسجّل غلط، وش أسوي؟", a: "كلّم مدرب المقرر أو الشؤون الأكاديمية بأسرع وقت، لأن التحضير يتقفل على المدرب بعد مدة."},
  {q: "وين ألقى جدولي ورابط المحاضرة عن بُعد؟", a: "في الصفحة الرئيسية لبوابة الطلاب: الجدول الأسبوعي، وتحت كل مقرر زر دخول المحاضرة على Teams وتسجيلات المحاضرات."},
  {q: "متى تظهر درجاتي؟", a: "بعد ما يرفعها المدرب وتعتمدها الشؤون الأكاديمية، وتظهر لك في الصفحة الرئيسية."},
  {q: "وين ألقى مواعيد الاختبارات والإجازات؟", a: "في «المواعيد القادمة» بالصفحة الرئيسية، حسب التقويم المعتمد من المؤسسة العامة للتدريب التقني والمهني."},
  {q: "كيف أعرف المبلغ المتبقي علي؟", a: "من بوابة الطلاب افتح «طلبات المالية» وأرسل «استفسار مالي»، ومسؤول المالية يتواصل معك على الواتساب."},
  {q: "كيف آخذ فاتورة نهائية بعد السداد؟", a: "بعد سداد كامل الرسوم يظهر لك زر «طلب الفاتورة النهائية» في «طلبات المالية». تنعتمد وتنختم، وبعدها تقدر تطبعها."},
  {q: "وين بطاقتي التدريبية؟", a: "في تبويب «بطاقتي» ببوابة الطلاب. تقدر تحفظها صورة، وأي جهة تقدر تتحقق منها من الباركود."},
  {q: "وين ألقى شهاداتي؟", a: "آخر الصفحة الرئيسية في بوابة الطلاب، وتقدر تطبعها أو تحفظها PDF."},
  {q: "كيف تتحقق جهة من شهادتي؟", a: "تكتب رمز الشهادة في «التحقق من الشهادات» بالصفحة الرئيسية للموقع، أو تصوّر الباركود اللي على الشهادة."},
  {q: "البوابة ما تتحدث أو فيها شي غريب", a: "سكّر المتصفح أو التطبيق وافتحه مرة ثانية. وإذا استمرت المشكلة تواصل معنا."},
  {q: "أبي أكلم المعهد", a: "اضغط زر الواتساب الأخضر تحت الصفحة، واختر القسم اللي تبيه."}
];
/* staff keep the public counters on the home page fresh (no names, counts only) */
async function syncPublicStats(){
  if (S._statsDone || !S.loaded.groups || !S.loaded.trainers || !Object.keys(S.students || {}).length) return;
  S._statsDone = true;
  try {
    const lectures = (await getCountFromServer(collection(db, "att"))).data().count;
    const d = {students: Object.keys(S.students).length, trainers: Object.keys(S.trainers).length, groups: Object.keys(S.groups).length, lectures, at: today()};
    const cur = S.stats || {};
    if (["students", "trainers", "groups", "lectures"].some(k => cur[k] !== d[k])) await setDoc(ref("public/stats"), d);
  } catch (e) { console.warn("stats", e); }
}


/* ---------- terms of use & privacy (public page: ?policy) ---------- */
const POLICY_DATE = "2026-11-17";
const POLICY = [
  ["التعريف والنطاق", [
    "هذه السياسة تنظّم استخدام البوابة الإلكترونية لمعهد أسس التقنية والقانون العالي للتدريب، وتشمل بوابة الطلاب، وبوابة المدربين، وبوابة الشؤون المالية والأكاديمية، وصفحة التحقق من الشهادات.",
    "استخدامك للبوابة أو دخولك لحسابك يعني موافقتك على هذه السياسة."
  ]],
  ["الحسابات ورموز الدخول", [
    "يصدر المعهد لكل متدرب رقماً تدريبياً ورمز دخول، ولكل مدرب رقماً ورمز دخول، ولكل موظف صفة ورمز دخول.",
    "الرمز شخصي وسري، ولا يجوز مشاركته أو استخدام حساب شخص آخر. صاحب الحساب مسؤول عن كل ما يتم من خلاله.",
    "إذا فقدت رمزك أو اشتبهت أن أحداً عرفه، تواصل مع الشؤون الأكاديمية لإصدار رمز جديد، ويتوقف الرمز القديم مباشرة.",
    "للمعهد إيقاف أي حساب مؤقتاً أو نهائياً عند مخالفة هذه السياسة أو انتهاء علاقة صاحبه بالمعهد."
  ]],
  ["الاستخدام المقبول", [
    "تُستخدم البوابة لأغراض التدريب والإدارة في المعهد فقط.",
    "يُمنع: انتحال شخصية أي أحد، أو رفع مستندات أو صور غير صحيحة أو معدّلة، أو محاولة الوصول لبيانات أو صلاحيات لا تخصك، أو تعطيل البوابة، أو نشر محتوى مسيء.",
    "يُمنع نسخ بيانات المتدربين أو المدربين أو نشرها خارج الغرض الذي أُتيحت له."
  ]],
  ["التحضير والسجلات", [
    "يسجّل المدرب حضور المتدربين وانصرافهم، ويُقفل التعديل بعد مدة تحددها الإدارة من نهاية يوم المحاضرة.",
    "تُحتسب نسب الغياب والإنذارات والحرمان وفق النسب المعتمدة في المعهد، ولا تُحتسب أيام الإجازات الرسمية.",
    "كل عملية في البوابة (تحضير، تعديل، اعتماد، دفعة، إصدار شهادة…) تُسجَّل باسم من قام بها ووقتها، ويطّلع على السجل الإدارة فقط."
  ]],
  ["الأعذار والمستندات", [
    "يرفع المتدرب عذر الغياب مع صورته، وتقرّر الشؤون الأكاديمية قبوله أو رفضه.",
    "تقديم عذر أو مستند غير صحيح مخالفة يترتب عليها إجراءات نظامية وفق لوائح المعهد."
  ]],
  ["الدرجات والشهادات", [
    "تظهر الدرجات للمتدرب بعد اعتمادها من الشؤون الأكاديمية.",
    "تحمل كل شهادة رمز تحقق ورمز QR، ويحق لأي جهة التحقق منها عبر صفحة التحقق في البوابة.",
    "للمعهد إلغاء أي شهادة صدرت بالخطأ أو بناءً على بيانات غير صحيحة، وتظهر عندها في صفحة التحقق بأنها ملغاة.",
    "التوقيعات والختم الإلكتروني على المستندات خاصة بالمعهد، ولا يجوز نسخها أو استخدامها خارج البوابة."
  ]],
  ["الرسوم والمدفوعات", [
    "تُسجَّل الرسوم والدفعات وطرق السداد في حساب المتدرب، ويستطيع الاطلاع على جدول دفعاته وطباعة سنداته من بوابته.",
    "سند القبض الصادر من البوابة سند داخلي، وليس فاتورة ضريبية.",
    "الدفعة المسجّلة بالخطأ لا تُحذف، وإنما تُلغى مع ذكر السبب، ويبقى أثرها في السجل.",
    "قد يُشترط سداد الرسوم كاملة لإصدار الشهادة، حسب ما تقرره إدارة المعهد."
  ]],
  ["البيانات الشخصية التي نجمعها", [
    "بيانات التعريف: الاسم، والرقم التدريبي، والجنس، ورقم الهوية أو الإقامة، وتاريخ الميلاد، والجنسية، والمؤهل، والمدينة.",
    "بيانات التواصل: جوال المتدرب، وجوال ولي الأمر، والبريد الإلكتروني.",
    "بيانات التدريب: الحضور والغياب، والأعذار وصورها، والإنذارات، والدرجات، والتقييمات، والشهادات.",
    "البيانات المالية: الرسوم، والخصومات، والدفعات، وصور إيصالات التحويل.",
    "لا نطلب بيانات بطاقات بنكية، ولا نحفظ كلمات مرور أو صوراً شخصية."
  ]],
  ["الغرض من البيانات ومن يطّلع عليها", [
    "تُستخدم البيانات لإدارة التدريب: التحضير، والمتابعة، والدرجات، والشهادات، والرسوم، والتواصل مع المتدرب أو ولي أمره، والتقارير المطلوبة نظاماً.",
    "يطّلع كل مستخدم على ما يخص عمله فقط: المتدرب على بياناته، والمدرب على متدربي مقرراته، والشؤون الأكاديمية على البيانات التدريبية، والمالية على البيانات المالية، والإدارة على الكل.",
    "لا يبيع المعهد البيانات ولا يشاركها مع جهات تسويقية. قد تُشارك مع الجهات الحكومية المختصة، مثل المؤسسة العامة للتدريب التقني والمهني، عندما يتطلب النظام ذلك.",
    "تقييم المتدرب للمدرب واستبيان الرضا سريّان، ولا يطّلع المدرب على اسم من قيّمه."
  ]],
  ["حفظ البيانات وحمايتها", [
    "تُحفظ البيانات في خدمات Google Firebase السحابية، ويُتحكم في الوصول إليها بقواعد صلاحيات لكل صفة.",
    "يأخذ المعهد نسخاً احتياطية دورية، ويحفظها في مكان آمن.",
    "تُحتفظ البيانات طوال علاقة المتدرب بالمعهد، ثم المدة التي يتطلبها النظام أو تقتضيها مصلحة المتدرب (مثل التحقق من الشهادات)."
  ]],
  ["حقوقك في بياناتك", [
    "وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية، لك الحق في العلم بكيفية جمع بياناتك والغرض منه، والاطلاع عليها والحصول على نسخة منها، وطلب تصحيح الخاطئ منها أو إكماله، وطلب إتلاف ما انتهت الحاجة إليه، في حدود ما يسمح به النظام.",
    "لممارسة أي من هذه الحقوق أو للاستفسار، تواصل مع الشؤون الأكاديمية في المعهد."
  ]],
  ["تعديل السياسة", [
    "قد يحدّث المعهد هذه السياسة عند الحاجة، ويُنشر التحديث في هذه الصفحة مع تاريخه. استمرارك في استخدام البوابة بعد التحديث يعني موافقتك عليه."
  ]]
];
function renderPolicy(app){
  $("#topSub").textContent = "سياسة الاستخدام والخصوصية";
  app.innerHTML = `<article class="card policy"><h2>سياسة الاستخدام والخصوصية</h2>
    <p class="muted" style="margin-top:0">${esc(INST_AR)} · آخر تحديث ${esc(bothDates(POLICY_DATE))}</p>
    ${POLICY.map(([h, ps], i) => `<section><h3>${i + 1}. ${esc(h)}</h3>${ps.length > 1 ? `<ul>${ps.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p>${esc(ps[0])}</p>`}</section>`).join("")}
    <div class="row" style="margin-top:14px"><button class="btn sm" id="polBack">رجوع</button><button class="btn sm" id="polPrint">طباعة</button></div></article>`;
  $("#polBack").onclick = () => { S.policy = false; history.replaceState(null, "", location.pathname); go(S.authUser ? (S.role || "home") : "home"); render(); };
  $("#polPrint").onclick = () => { const w = openPrint(); fillPrint(w, "سياسة الاستخدام والخصوصية", [{html: `<h1>سياسة الاستخدام والخصوصية</h1><p style="text-align:center;color:#666">آخر تحديث ${esc(bothDates(POLICY_DATE))}</p>${POLICY.map(([h, ps], i) => `<h3 style="color:#1F5136">${i + 1}. ${esc(h)}</h3><ul style="line-height:1.9">${ps.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`).join("")}`}]); };
}
const policyLink = () => `<a href="?policy" data-policy class="polLink">سياسة الاستخدام والخصوصية</a>`;

/* ---------- home & logins ---------- */
function renderHome(app){
  const site = S.site || {}, st = S.stats, upcoming = upcomingCal();
  const h = Number(new Intl.DateTimeFormat("en-GB", {timeZone: TZ, hour: "numeric", hourCycle: "h23"}).format(new Date()));
  const greet = h < 12 ? "صباح الخير" : "مساء الخير";
  const links = SOCIAL.filter(([k]) => site[k] && k !== "maps" && k !== "whatsapp");
  const was = waList(site);
  const news = (site.news || []).filter(n => n.title && (!n.until || n.until >= today())).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 4);
  const faq = (site.faq || DEFAULT_FAQ).filter(f => f.q && f.a);
  const cdT = site.countdown && site.countdown.at ? Date.parse(site.countdown.at + ":00+03:00") : NaN;
  const cd = cdT > Date.now() && site.countdown.label ? {label: site.countdown.label, t: cdT} : null;
  const counters = st ? [["students", "متدرب ومتدربة"], ["lectures", "محاضرة منعقدة"]].filter(([k]) => st[k] > 0) : [];
  app.innerHTML = `${S.disabledMsg ? `<div class="notice err">حسابك موقوف مؤقتاً. تواصل مع الشؤون الأكاديمية.</div>` : ""}
  <section class="hero rise">
    <img class="heroLogo" src="logo-mark.png" alt="">
    <div class="heroTxt">
      <span class="greet">${greet}</span>
      <h2>${esc(INST_AR)}</h2>
      <span class="heroEn">${esc(INST_EN)}</span>
      ${site.accNo ? `<span class="accNo">${ICON.seal} مرخّص من المؤسسة العامة للتدريب التقني والمهني · رقم الرخصة ${esc(site.accNo)}</span>` : ""}
      <span class="heroDate">${esc(hijri(today()))} · ${esc(greg(today()))}</span>
    </div>
  </section>
  ${cd ? `<section class="countdown rise" style="--d:1"><span class="cdLbl">${ICON.clock} باقي على ${esc(cd.label)}</span><div class="cdBox" id="cdBox" data-at="${cd.t}">${cdCells(cd.t - Date.now())}</div></section>` : ""}
  <div class="portals">
    <button class="portal pS rise" style="--d:1" id="goS">${ICON.student}<b>بوابة الطلاب</b></button>
    <button class="portal pT rise" style="--d:2" id="goT">${ICON.trainer}<b>بوابة المدربين</b></button>
    <button class="portal pA rise" style="--d:3" id="goA">${ICON.admin}<b>بوابة الشؤون المالية والأكاديمية</b></button>
  </div>
  ${counters.length ? `<section class="counters rise" style="--d:4">${counters.map(([k, l]) => `<div class="ctr"><b data-count="${Number(st[k])}">0</b><span>${l}</span></div>`).join("")}</section>` : ""}
  <div class="duo">
    <form class="card rise" style="--d:5" id="verF"><h2>${ICON.seal} تحقق من شهادة</h2>
      <p class="muted" style="margin-top:0">اكتب رمز التحقق المطبوع على الشهادة.</p>
      <div class="row"><input type="text" id="verC" class="grow" dir="ltr" placeholder="مثل AB12CD34" autocomplete="off" aria-label="رمز التحقق"><button class="btn pri" type="submit">تحقق</button></div></form>
    <div class="card rise" style="--d:6"><h2>${ICON.cal} القادم في التقويم</h2>
      ${upcoming.length ? `<div class="upc">${upcoming.slice(0, 4).map(u => `<div class="upI ${u.hol ? "hol" : ""}"><span class="upD">${u.days === 0 ? "اليوم" : u.days === 1 ? "بكرة" : `بعد ${u.days} ${u.days <= 10 ? "أيام" : "يوم"}`}</span><b>${esc(u.label)}</b><span class="muted">${esc(fmtDate(u.from))}${u.to && u.to !== u.from ? " ← " + esc(fmtDate(u.to)) : ""}</span></div>`).join("")}</div>
        ${upcoming.length > 4 ? `<details class="upMore"><summary>التقويم كامل (${upcoming.length})</summary><div class="upc">${upcoming.slice(4).map(u => `<div class="upI ${u.hol ? "hol" : ""}"><b>${esc(u.label)}</b><span class="muted">${esc(fmtDate(u.from))}${u.to && u.to !== u.from ? " ← " + esc(fmtDate(u.to)) : ""}</span></div>`).join("")}</div></details>` : ""}` : `<p class="muted" style="margin:0">ما فيه مواعيد قادمة مسجّلة.</p>`}</div>
  </div>
  ${site.licUrl && /^https:\/\//.test(site.licUrl) ? `<section class="card licCard rise" style="--d:7"><div class="licQR" id="licQR"></div><div class="grow"><h2>${ICON.seal} ترخيص المعهد</h2><p class="muted" style="margin:0 0 10px">امسح الرمز أو اضغط الزر للتحقق من ترخيص المعهد وبرامجه التدريبية المعتمدة في موقع المؤسسة العامة للتدريب التقني والمهني.</p>${site.accNo ? `<p style="margin:0 0 10px">رقم الرخصة: <b dir="ltr">${esc(site.accNo)}</b></p>` : ""}<a class="btn pri sm" href="${esc(site.licUrl)}" target="_blank" rel="noopener">التحقق من الترخيص</a></div></section>` : ""}
  ${news.length ? `<section class="rise" style="--d:7"><h3 class="secT">${ICON.news} آخر الأخبار</h3><div class="news">${news.map(n => `<article class="nItem"><span class="nDate">${esc(fmtDate(n.date))}</span><b>${esc(n.title)}</b>${n.text ? `<p>${esc(n.text)}</p>` : ""}</article>`).join("")}</div></section>` : ""}
  <blockquote class="quote rise" style="--d:8">${esc(QUOTES[dayOfYear() % QUOTES.length])}</blockquote>
  ${faq.length ? `<section class="card rise" style="--d:9"><h2>${ICON.help} أسئلة شائعة</h2><div class="faq">${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>` : ""}
  <footer class="foot rise" style="--d:9"><img src="logo-mark.png" alt=""><span>${esc(INST_AR)}</span>${policyLink()}
    ${was.length ? `<div class="waRow">${was.map(w => `<a class="mapBtn" href="${esc(socialUrl("whatsapp", w.num))}" target="_blank" rel="noopener">${ICON.whatsapp} ${esc(w.label || "واتساب")}</a>`).join("")}</div>` : ""}
    ${site.maps ? `<a class="mapBtn" href="${esc(socialUrl("maps", site.maps))}" target="_blank" rel="noopener">${ICON.maps} موقعنا على الخريطة</a>` : ""}
    ${links.length ? `<div class="soc">${links.map(([k, label]) => `<a href="${esc(socialUrl(k, site[k]))}" target="_blank" rel="noopener" aria-label="${label}" title="${label}">${ICON[k] || label}</a>`).join("")}</div>` : ""}</footer>`;
  if ($("#licQR")) licQR().then(svg => { if (svg && $("#licQR")) $("#licQR").innerHTML = svg; });
  clearInterval(S._cdTimer);
  if ($("#cdBox")) S._cdTimer = setInterval(() => { const b = $("#cdBox"); if (!b) return clearInterval(S._cdTimer); const left = Number(b.dataset.at) - Date.now(); if (left <= 0) { clearInterval(S._cdTimer); return render(); } b.innerHTML = cdCells(left); }, 1000);
  $("#verF").onsubmit = e => { e.preventDefault(); const c = $("#verC").value.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!c) return toast("اكتب رمز التحقق"); location.href = `${SITE()}?verify=${c}`; };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  app.querySelectorAll("[data-count]").forEach(n => {
    const to = Number(n.dataset.count); if (reduce) { n.textContent = to.toLocaleString("en-US"); return; }
    const t0 = performance.now(), dur = 1200;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3))); n.textContent = v.toLocaleString("en-US"); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  $("#goS").onclick = () => go("studentLogin");
  $("#goT").onclick = () => go("trainerLogin");
  $("#goA").onclick = () => go("adminLogin");
}
function loginErr(e){
  const c = (e && e.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-login")) return "الرمز غير صحيح.";
  if (c.includes("too-many-requests")) return "محاولات كثيرة، انتظر شوي وحاول مرة ثانية.";
  if (c.includes("network")) return "ما فيه اتصال بالإنترنت.";
  if (c.includes("unauthorized-domain")) return "رابط الموقع غير مضاف في Firebase ← Authentication ← Settings ← Authorized domains.";
  return "تعذّر الدخول. (" + (c || (e && e.message) || "?") + ")";
}
function loginCard(title, fields, onSubmit){
  return `<div class="card" style="max-width:460px;width:100%;justify-self:center"><h2>${title}</h2>
    <form id="lf" class="list" autocomplete="off">${fields}<div id="lerr"></div><button class="btn pri" type="submit" id="lb">دخول</button></form>
    <p class="muted" style="margin:10px 0 0;font-size:12.5px">بالدخول، أنت توافق على ${policyLink()}.</p></div>`;
}
async function doLogin(fn, back){
  $("#lb").disabled = true;
  try { await fn(); }
  catch (err) { S.view = back; render(); $("#lerr").innerHTML = `<div class="notice err">${esc(err.userMsg || loginErr(err))}</div>`; }
}
function renderTrainerLogin(app){
  app.innerHTML = loginCard("دخول المدربين", `
    <label class="f" for="tn">رقم المدرب<input type="text" id="tn" inputmode="numeric" required placeholder="مثل 1001"></label>
    <label class="f" for="lc">الرمز<input type="password" id="lc" inputmode="numeric" required></label>`);
  $("#lf").onsubmit = e => {
    e.preventDefault();
    const num = digits($("#tn").value), code = digits($("#lc").value);
    doLogin(async () => {
      const snap = await getDoc(ref("public/trainerLogin"));
      const email = snap.exists() && snap.data().map && snap.data().map[num];
      if (!email) { const er = new Error("no"); er.userMsg = "رقم المدرب غير موجود. تأكد منه من الشؤون الأكاديمية."; throw er; }
      await signInWithEmailAndPassword(auth, email, code);
    }, "trainerLogin");
  };
}
function renderAdminLogin(app){
  app.innerHTML = loginCard("دخول الشؤون المالية والأكاديمية", `
    <label class="f" for="ar">الصفة<select id="ar">${Object.entries(ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <label class="f" for="ac">الرمز<input type="password" id="ac" inputmode="numeric" required></label>`);
  $("#lf").onsubmit = e => { e.preventDefault(); const email = ROLE_EMAIL[$("#ar").value], code = digits($("#ac").value); doLogin(async () => { await setPersistence(auth, browserSessionPersistence).catch(() => {}); return signInWithEmailAndPassword(auth, email, code); }, "adminLogin"); };
}
function renderStudentLogin(app){
  app.innerHTML = loginCard("دخول الطلاب", `
    <label class="f" for="sn">الرقم الأكاديمي<input type="text" id="sn" inputmode="numeric" required placeholder="مثل 20260001"></label>
    <label class="f" for="sc">الرمز<input type="password" id="sc" inputmode="numeric" required></label>`);
  $("#lf").onsubmit = e => {
    e.preventDefault();
    const num = digits($("#sn").value), code = digits($("#sc").value);
    doLogin(async () => {
      const snap = await getDoc(ref("public/studentLogin"));
      const ver = snap.exists() && snap.data().map && snap.data().map[num];
      if (!ver) { const er = new Error("no"); er.userMsg = "الرقم الأكاديمي غير موجود. تأكد منه من الشؤون الأكاديمية."; throw er; }
      await signInWithEmailAndPassword(auth, `st-${num}.v${ver}@${DOMAIN}`, code);
    }, "studentLogin");
  };
}

/* ---------- shared: schedule ---------- */
const sessionsFor = (g, gender) => (g.sessions || []).filter(s => !s.g || !gender || s.g === gender);
const slot = s => `${s.day} ${fmtTime(s.from)} – ${fmtTime(s.to)}${s.room ? " · " + s.room : ""}`;
function weekTable(rows){
  // rows: [{course, trainer, s}]
  if (!rows.length) return `<div class="card empty">ما فيه جدول مسجّل بعد.</div>`;
  const shifts = [...new Set(rows.map(r => r.s.shift || ""))];
  return shifts.map(sh => {
    const rs = rows.filter(r => (r.s.shift || "") === sh).sort((a,b) => DAYS.indexOf(a.s.day) - DAYS.indexOf(b.s.day) || a.s.from.localeCompare(b.s.from));
    return `<h3 style="margin:12px 0 6px">${esc(sh ? "الفترة " + sh.replace("صباحي","الصباحية").replace("مسائي","المسائية") : "الجدول")}</h3>
    <div class="tbl"><table><thead><tr><th>اليوم</th><th>الوقت</th><th class="nm">المقرر</th><th class="nm">المدرب/ة</th><th>القاعة</th></tr></thead><tbody>
    ${rs.map(r => `<tr><td>${esc(r.s.day)}</td><td>${fmtTime(r.s.from)} – ${fmtTime(r.s.to)}</td><td class="nm">${esc(r.course)}</td><td class="nm">${esc(r.trainer)}</td><td>${esc(r.s.room || "—")}</td></tr>`).join("")}
    </tbody></table></div>`;
  }).join("");
}

/* ---------- exams: the trainer builds them, students take them in the portal, timed and marked automatically ----------
   exams/{id}      title, times and settings (students of the course see it once it is published)
   examQs/{id}     the questions without answers (students can open them only once the exam has opened)
   examKeys/{id}   the right answers (trainer of the course and administration only)
   examSubs/{id_num} a student's attempt: start time from the server, answers saved as they go */
const EXQ = {mc: "اختيار من متعدد", tf: "صح أو خطأ", es: "مقالي"};
const exId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const tsMs = t => !t ? 0 : t.toMillis ? t.toMillis() : t.seconds ? t.seconds * 1000 : Number(t) || 0;
const dtLocal = ms => ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const fmtDT = ms => ms ? new Date(ms).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"}) : "—";
const exTotal = e => (e.qs || []).reduce((a, q) => a + (Number(q.p) || 0), 0);
/* a student's own closing time: the exam's, or later if the trainer reopened it for that student (exams.extra[num]) */
const exEnd = (e, num) => Math.max(tsMs(e.end), num ? tsMs((e.extra || {})[num]) : 0);
function exState(e, now = Date.now(), num){
  if (e.status === "draft") return "draft";
  if (e.status === "closed") return "ended";
  return now < tsMs(e.start) ? "soon" : now < exEnd(e, num) ? "open" : "ended";
}
const EXST = {draft: ["مسودة", ""], soon: ["قادم", "e"], open: ["مفتوح الحين", "p"], ended: ["انتهى", "a"]};
function exAuto(e, key, ans){
  let s = 0;
  (e.qs || []).forEach(q => { if (q.t === "es") return; const a = (ans || {})[q.id]; if (a !== undefined && a !== null && a !== "" && key && key[q.id] !== undefined && String(a) === String(key[q.id])) s += Number(q.p) || 0; });
  return s;
}
/* the same student always gets the same order */
function seeded(arr, seed){
  let h = 2166136261 >>> 0; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const subDeadline = (e, sub) => Math.min(tsMs(sub.startedAt) + (Number(e.mins) || 0) * 60000, exEnd(e, sub.num));
/* question order for one student: always mixed. The first question rotates with the student's place in the list,
   so two students with neighbouring numbers never start with the same question; the rest is shuffled per student,
   and a retake (exams.retakes[num]) gives a fresh order */
function exOrder(e, allQ, num){
  if (allQ.length < 2) return allQ;
  const base = seeded(allQ, e.id), nums = [...(e.memberNums || [])].sort(), rank = Math.max(0, nums.indexOf(num)), round = Number((e.retakes || {})[num]) || 0;
  const k = (rank + round) % base.length;
  return [base[k], ...seeded(base.filter((_, i) => i !== k), e.id + num + round)];
}
const exOptSeed = (e, q, num) => q.id + num + (Number((e.retakes || {})[num]) || 0);

/* trainer and administration: the exams of one course */
function watchExams(gid){
  S.exams = S.exams || {}; S._exL = S._exL || {};
  if (S._exL[gid]) return;
  let meta = null, qs = null;
  const merge = () => { if (!meta || !qs) return; S.exams[gid] = meta.map(e => ({...e, qs: (qs[e.id] || {}).qs || []})).sort((a, b) => tsMs(b.start) - tsMs(a.start)); if (!busyEditing() && !$("#modal").classList.contains("on")) render(); };
  const u1 = onSnapshot(query(collection(db, "exams"), where("gid", "==", gid)), snap => { meta = snap.docs.map(d => ({id: d.id, ...d.data()})); merge(); }, e => console.error(e));
  const u2 = onSnapshot(query(collection(db, "examQs"), where("gid", "==", gid)), snap => { qs = {}; snap.docs.forEach(d => qs[d.id] = d.data()); merge(); }, e => console.error(e));
  S._exL[gid] = () => { u1(); u2(); };
  S.subs.push(() => { try { S._exL[gid](); } catch {} delete S._exL[gid]; });
}
function examsTab(g){
  watchExams(g.id);
  const list = (S.exams || {})[g.id];
  if (S.exView && S.exView.gid === g.id) return examResults(g);
  return `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">الاختبارات</h2>${RO() ? "" : `<button class="btn pri" id="exNew">+ اختبار جديد</button>`}</div>
    <p class="muted" style="margin:6px 0 0">الطالب يدخل الاختبار من بوابته في الوقت اللي تحدده، وعنده مدة محددة من لحظة ما يبدأ. الاختيار من متعدد والصح والخطأ يتصححون لحالهم، والمقالي تصححه أنت.</p></div>
  <div class="list">${!list ? `<div class="card empty">جاري التحميل…</div>` : list.map(e => { const s = exState(e); return `<div class="item" style="flex-wrap:wrap">
      <div class="grow"><div class="t">${esc(e.title)} <span class="pill ${EXST[s][1]}">${EXST[s][0]}</span>${e.resultsOut ? ` <span class="pill p">النتائج ظاهرة للطلاب</span>` : ""}${e.audience === "some" ? ` <span class="pill">لـ ${(e.memberNums || []).length} طالب محدّد</span>` : ""}${(n => n ? ` <span class="pill e">مفتوح من جديد لـ ${n} طالب</span>` : "")(Object.values(e.extra || {}).filter(t => tsMs(t) > Date.now()).length)}</div>
      <div class="muted">${(e.qs || []).length} سؤال · ${exTotal(e)} درجة · ${e.mins} دقيقة · من ${esc(fmtDT(tsMs(e.start)))} إلى ${esc(fmtDT(tsMs(e.end)))}</div></div>
      <button class="btn sm pri" data-exres="${e.id}">النتائج والتصحيح</button>${RO() ? "" : `<button class="btn sm" data-exed="${e.id}">تعديل</button>`}</div>`; }).join("") || `<div class="card empty">ما فيه اختبارات لهذا المقرر.</div>`}</div>`;
}
function bindExamsTab(g){
  const n = $("#exNew"); if (n) n.onclick = () => examEditor(g, null);
  document.querySelectorAll("[data-exed]").forEach(b => b.onclick = () => examEditor(g, ((S.exams || {})[g.id] || []).find(e => e.id === b.dataset.exed)));
  document.querySelectorAll("[data-exres]").forEach(b => b.onclick = () => { S.exView = {gid: g.id, eid: b.dataset.exres}; S.exSubs = null; S.exKey = null; render(); window.scrollTo(0, 0); });
  if (S.exView && S.exView.gid === g.id) bindExamResults(g);
}
async function examEditor(g, e){
  let key = {};
  if (e) { try { const k = await getDoc(ref("examKeys/" + e.id)); key = k.exists() ? (k.data().ans || {}) : {}; } catch (x) { console.error(x); return toast("تعذّر فتح الاختبار"); } }
  const now = Date.now(), d = e ? JSON.parse(JSON.stringify({...e, start: tsMs(e.start), end: tsMs(e.end)})) : {title: "", mins: 30, start: now + 3600e3, end: now + 3 * 3600e3, shuffle: true, qs: [], status: "draft"};
  d.qs.forEach(q => { q.k = key[q.id]; });
  d.audience = d.audience === "some" ? "some" : "all"; d.pick = d.pick || [];
  S._exExtra = e ? {extra: e.extra || {}, retakes: e.retakes || {}} : {extra: {}, retakes: {}};   // kept as real Timestamps, not the JSON copy
  S._exEd = {g, d, isNew: !e};
  examEditorRender();
}
function exSync(){
  const ed = S._exEd; if (!ed) return; const d = ed.d, v = s => { const x = $(s); return x ? x.value : ""; };
  d.title = v("#exT").trim(); d.mins = Math.max(1, Math.min(600, Math.round(Number(v("#exM")) || 0)));
  d.start = v("#exS") ? new Date(v("#exS")).getTime() : 0; d.end = v("#exE") ? new Date(v("#exE")).getTime() : 0;
  d.shuffle = true;   // always: every student gets a different order
  const aud = document.querySelector('input[name="exAud"]:checked'); if (aud) d.audience = aud.value;
  const picks = document.querySelectorAll("[data-pick]"); if (picks.length) d.pick = [...picks].filter(x => x.checked).map(x => x.dataset.pick);
  d.qs.forEach((q, i) => {
    q.q = v(`#qq${i}`).trim(); q.p = Math.max(0, Number(v(`#qp${i}`)) || 0);
    if (q.t === "mc") { q.o = q.o.map((_, j) => v(`#qo${i}_${j}`).trim()); const c = document.querySelector(`input[name="qk${i}"]:checked`); q.k = c ? Number(c.value) : undefined; }
    if (q.t === "tf") { const c = document.querySelector(`input[name="qk${i}"]:checked`); q.k = c ? c.value === "1" : undefined; }
  });
}
function examEditorRender(){
  const {g, d} = S._exEd, pub = d.status !== "draft";
  $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">${S._exEd.isNew ? "اختبار جديد" : "تعديل الاختبار"} · ${esc(g.course)}</h2><button class="btn sm" id="exX">إغلاق</button></div>
    ${pub ? `<div class="notice" style="margin:8px 0">الاختبار منشور. تعديل الأسئلة أو الإجابات يأثر على الطلاب اللي بدأوا.</div>` : ""}
    <label class="f" for="exT">عنوان الاختبار<input type="text" id="exT" maxlength="120" value="${esc(d.title)}" placeholder="مثال: الاختبار الفصلي الأول"></label>
    <div class="row">
      <label class="f grow" for="exS">يفتح من<input type="datetime-local" id="exS" value="${dtLocal(d.start)}"></label>
      <label class="f grow" for="exE">ويقفل<input type="datetime-local" id="exE" value="${dtLocal(d.end)}"></label>
      <label class="f" for="exM" style="width:130px">المدة (دقيقة)<input type="number" id="exM" min="1" max="600" value="${d.mins}"></label>
    </div>
    <div class="notice" style="margin:6px 0">🔀 ترتيب الأسئلة والخيارات يختلف تلقائياً لكل طالب، والطلاب اللي أرقامهم متتالية ما يطلع لهم نفس السؤال الأول.</div>
    ${(() => { const stu = (g.students || []).filter(s => s.sid).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar")), some = d.audience === "some";
      return `<div class="card" style="margin:8px 0;padding:12px"><b>مين يدخل الاختبار؟</b>
      <div class="row" style="gap:16px;margin:6px 0;flex-wrap:wrap"><label class="row" style="gap:6px;cursor:pointer"><input type="radio" name="exAud" value="all" ${some ? "" : "checked"}> كل طلاب المقرر (${stu.length})</label><label class="row" style="gap:6px;cursor:pointer"><input type="radio" name="exAud" value="some" ${some ? "checked" : ""}> طلاب محدّدين فقط</label></div>
      ${some ? `<p class="muted" style="margin:4px 0">شيل علامة أي طالب ما تبيه يدخل (مثلاً محروم وحرمانه ما انرفع للنظام). اللي ما تحدّده ما يشوف الاختبار أبداً.</p>
        <div class="row" style="gap:6px"><button class="btn sm" id="exPickAll">تحديد الكل</button><button class="btn sm" id="exPickNone">إلغاء الكل</button><span class="muted">محدّد: <b id="exPickN">${d.pick.length}</b> من ${stu.length}</span></div>
        <div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 8px;margin-top:6px">${stu.map(s => `<label class="row" style="gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px dashed var(--line)"><input type="checkbox" data-pick="${esc(s.sid)}" ${d.pick.includes(s.sid) ? "checked" : ""}> <span class="grow">${esc(s.name)}</span> <span class="muted">${esc(s.sid)}</span></label>`).join("") || `<span class="muted">ما فيه طلاب بأرقام تدريبية في المقرر.</span>`}</div>` : ""}</div>`; })()}
    <div class="list" style="margin-top:8px">${d.qs.map((q, i) => `<div class="card" style="margin:0;padding:12px">
      <div class="row" style="justify-content:space-between"><b>سؤال ${i + 1} · ${EXQ[q.t]}</b><span class="row" style="gap:6px"><label class="row" style="gap:4px">الدرجة<input type="number" id="qp${i}" min="0" step="0.5" value="${q.p}" style="width:70px"></label><button class="btn sm danger" data-qdel="${i}">حذف</button></span></div>
      <textarea id="qq${i}" style="min-height:52px;margin-top:6px" placeholder="نص السؤال">${esc(q.q || "")}</textarea>
      ${q.t === "mc" ? `<div style="margin-top:6px">${q.o.map((o, j) => `<div class="row" style="gap:6px;margin:4px 0"><input type="radio" name="qk${i}" value="${j}" ${q.k === j ? "checked" : ""} title="الإجابة الصحيحة"><input type="text" id="qo${i}_${j}" class="grow" value="${esc(o)}" placeholder="الخيار ${j + 1}">${q.o.length > 2 ? `<button class="btn sm" data-odel="${i}_${j}">✕</button>` : ""}</div>`).join("")}
        ${q.o.length < 6 ? `<button class="btn sm" data-oadd="${i}">+ خيار</button>` : ""} <span class="muted">اختر الدائرة جنب الإجابة الصحيحة</span></div>` : ""}
      ${q.t === "tf" ? `<div class="row" style="gap:14px;margin-top:6px"><span class="muted">الإجابة الصحيحة:</span><label><input type="radio" name="qk${i}" value="1" ${q.k === true ? "checked" : ""}> صح</label><label><input type="radio" name="qk${i}" value="0" ${q.k === false ? "checked" : ""}> خطأ</label></div>` : ""}
      ${q.t === "es" ? `<p class="muted" style="margin:6px 0 0">الطالب يكتب إجابته، وأنت تصححها من «النتائج والتصحيح».</p>` : ""}
    </div>`).join("")}</div>
    <div class="row" style="margin-top:8px;gap:6px"><button class="btn sm" data-qadd="mc">+ اختيار من متعدد</button><button class="btn sm" data-qadd="tf">+ صح أو خطأ</button><button class="btn sm" data-qadd="es">+ مقالي</button><span class="muted">المجموع: ${exTotal(d)} درجة</span></div>
    <div class="row" style="margin-top:14px;gap:6px">
      ${pub ? `<button class="btn pri" id="exSave">حفظ التعديلات</button><button class="btn" id="exClose">${d.status === "closed" ? "إعادة فتح" : "قفل الاختبار الحين"}</button>` : `<button class="btn pri" id="exPub">نشر للطلاب</button><button class="btn" id="exSave">حفظ كمسودة</button>`}
      ${S._exEd.isNew ? "" : `<button class="btn danger" id="exDel">حذف الاختبار</button>`}
    </div>`;
  $("#modal").classList.add("on");
  $("#exX").onclick = () => { S._exEd = null; S._exExtra = null; closeModal(); };
  document.querySelectorAll('input[name="exAud"]').forEach(r => r.onchange = () => { exSync(); if (d.audience === "some" && !d.pick.length) d.pick = (g.students || []).map(s => s.sid).filter(Boolean); examEditorRender(); });
  const pickN = () => { const n = $("#exPickN"); if (n) n.textContent = document.querySelectorAll("[data-pick]:checked").length; };
  document.querySelectorAll("[data-pick]").forEach(x => x.onchange = pickN);
  if ($("#exPickAll")) $("#exPickAll").onclick = () => { document.querySelectorAll("[data-pick]").forEach(x => x.checked = true); pickN(); };
  if ($("#exPickNone")) $("#exPickNone").onclick = () => { document.querySelectorAll("[data-pick]").forEach(x => x.checked = false); pickN(); };
  document.querySelectorAll("[data-qadd]").forEach(b => b.onclick = () => { exSync(); const t = b.dataset.qadd; d.qs.push({id: Math.random().toString(36).slice(2, 8), t, q: "", p: t === "es" ? 5 : 1, ...(t === "mc" ? {o: ["", "", "", ""]} : {})}); examEditorRender(); });
  document.querySelectorAll("[data-qdel]").forEach(b => b.onclick = () => { exSync(); d.qs.splice(Number(b.dataset.qdel), 1); examEditorRender(); });
  document.querySelectorAll("[data-oadd]").forEach(b => b.onclick = () => { exSync(); d.qs[Number(b.dataset.oadd)].o.push(""); examEditorRender(); });
  document.querySelectorAll("[data-odel]").forEach(b => b.onclick = () => { exSync(); const [i, j] = b.dataset.odel.split("_").map(Number), q = d.qs[i]; q.o.splice(j, 1); if (q.k === j) q.k = undefined; else if (q.k > j) q.k--; examEditorRender(); });
  const save = async status => {
    exSync();
    if (!d.title) return toast("اكتب عنوان الاختبار");
    if (!d.start || !d.end || d.end <= d.start) return toast("وقت القفل لازم يكون بعد وقت الفتح");
    if (!d.qs.length) return toast("أضف سؤال واحد على الأقل");
    for (const [i, q] of d.qs.entries()) {
      if (!q.q) return toast(`اكتب نص السؤال ${i + 1}`);
      if (q.t === "mc") { if (q.o.filter(Boolean).length < 2 || q.o.some(o => !o)) return toast(`السؤال ${i + 1}: عبّ كل الخيارات أو احذف الفاضي`); if (q.k === undefined) return toast(`السؤال ${i + 1}: اختر الإجابة الصحيحة`); }
      if (q.t === "tf" && q.k === undefined) return toast(`السؤال ${i + 1}: اختر صح أو خطأ`);
    }
    const id = (S._exEd.isNew ? (S._exEd.newId = S._exEd.newId || exId()) : d.id);
    const qs = d.qs.map(q => ({id: q.id, t: q.t, q: q.q.slice(0, 2000), p: q.p, ...(q.t === "mc" ? {o: q.o.map(o => o.slice(0, 400))} : {})}));
    const ans = {}; d.qs.forEach(q => { if (q.t !== "es") ans[q.id] = q.k; });
    const st = status || d.status;
    if (st === "open" && d.end <= Date.now()) return toast("وقت «ويقفل» فات — غيّره لوقت جاي عشان ينفتح الاختبار");
    const grp = g.memberNums || [], kept = S._exExtra || {extra: {}, retakes: {}};
    const pick = d.audience === "some" ? d.pick.filter(n => grp.includes(n)) : [];
    if (d.audience === "some" && st !== "draft" && !pick.length) return toast("اختر طالب واحد على الأقل يدخل الاختبار");
    const mem = st === "draft" ? [] : [...new Set([...(d.audience === "some" ? pick : grp), ...Object.keys(kept.extra || {}).filter(n => grp.includes(n))])];
    const ex = {gid: g.id, tid: g.trainerId || "", course: g.course || "", title: d.title, mins: d.mins, start: Timestamp.fromMillis(d.start), end: Timestamp.fromMillis(d.end), shuffle: true, nq: qs.length, total: exTotal(d), status: st,
      memberNums: mem, audience: d.audience, pick, extra: kept.extra || {}, retakes: kept.retakes || {}, resultsOut: !!d.resultsOut, updatedAt: new Date().toISOString(), by: S.me || S.adminRole || ""};
    try {
      const b = writeBatch(db); b.set(ref("exams/" + id), ex); b.set(ref("examQs/" + id), {gid: g.id, tid: g.trainerId || "", qs}); b.set(ref("examKeys/" + id), {gid: g.id, tid: g.trainerId || "", ans}); await b.commit();
      logAction(st === "draft" ? "حفظ اختبار" : "نشر اختبار", `${g.course} · ${d.title}`);
      if (st !== "draft" && d.status === "draft") notify("exam", id);
      toast(st === "draft" ? "انحفظ كمسودة" : d.audience === "some" ? `انحفظ، ويشوفه ${mem.length} طالب محدّد` : "انحفظ، والطلاب يشوفونه في بوابتهم"); S._exEd = null; S._exExtra = null; closeModal();
    } catch (x) { handleWriteErr(x); }
  };
  if ($("#exPub")) $("#exPub").onclick = () => save("open");
  $("#exSave").onclick = () => save();
  if ($("#exClose")) $("#exClose").onclick = () => save(d.status === "closed" ? "open" : "closed");
  if ($("#exDel")) $("#exDel").onclick = async ev => {
    if (!ev.target.dataset.sure) { ev.target.dataset.sure = 1; ev.target.textContent = "متأكد؟ ينحذف مع إجاباته"; return; }
    try { const b = writeBatch(db); b.delete(ref("exams/" + d.id)); b.delete(ref("examQs/" + d.id)); b.delete(ref("examKeys/" + d.id)); await b.commit(); logAction("حذف اختبار", `${g.course} · ${d.title}`); S._exEd = null; closeModal(); }
    catch (x) { handleWriteErr(x); }
  };
}
/* results: automatic marks, essay marking, publishing to students, Excel */
function examResults(g){
  const e = ((S.exams || {})[g.id] || []).find(x => x.id === S.exView.eid);
  if (!e) return `<div class="card empty">الاختبار انحذف. <button class="btn sm" id="exBack">رجوع</button></div>`;
  if (!S.exSubs || S.exSubs.eid !== e.id) {
    S.exSubs = {eid: e.id, list: null};
    if (S._exSubL) try { S._exSubL(); } catch {}
    const q = S.role === "trainer" ? query(collection(db, "examSubs"), where("eid", "==", e.id), where("tid", "==", S.me)) : query(collection(db, "examSubs"), where("eid", "==", e.id));
    S._exSubL = onSnapshot(q, snap => { if (!S.exSubs || S.exSubs.eid !== e.id) return; S.exSubs.list = snap.docs.map(d => ({id: d.id, ...d.data({serverTimestamps: "estimate"})})); if (!busyEditing()) render(); }, x => console.error(x));
    S.subs.push(() => { try { S._exSubL && S._exSubL(); } catch {} });
    getDoc(ref("examKeys/" + e.id)).then(k => { S.exKey = {eid: e.id, ans: k.exists() ? k.data().ans || {} : {}}; render(); }).catch(x => console.error(x));
  }
  const subs = S.exSubs.list, key = S.exKey && S.exKey.eid === e.id ? S.exKey.ans : null, es = (e.qs || []).filter(q => q.t === "es"), total = exTotal(e);
  const byNum = {}; (subs || []).forEach(s => byNum[s.num] = s);
  const stu = (g.students || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  const now = Date.now();
  const stTxt = s => !s ? `<span class="pill">ما دخل</span>` : s.done ? `<span class="pill p">سلّم</span>` : now < subDeadline(e, s) ? `<span class="pill e">يحل الحين</span>` : `<span class="pill l">انتهى وقته</span>`;
  const pub = e.status !== "draft", mem = e.memberNums || [], ext = e.extra || {}, rt = e.retakes || {};
  if (!S._reSel || S._reSel.eid !== e.id) S._reSel = {eid: e.id, nums: new Set(), until: "", wipe: true, open: false};
  const sel = S._reSel, canRe = !RO() && pub;
  const rows = stu.map(st => { const s = byNum[st.sid]; const auto = s && key ? exAuto(e, key, s.ans) : null; const esSum = s ? es.reduce((a, q) => a + (Number((s.es || {})[q.id]) || 0), 0) : 0;
    const out = pub && st.sid && !mem.includes(st.sid), xt = st.sid ? tsMs(ext[st.sid]) : 0;
    return `<div class="item" style="display:block${out ? ";opacity:.6" : ""}">
      <div class="row" style="justify-content:space-between"><div>${canRe && st.sid ? `<input type="checkbox" data-rsel="${esc(st.sid)}" ${sel.nums.has(st.sid) ? "checked" : ""} style="margin-left:6px;width:17px;height:17px;vertical-align:middle" title="حدّد لإعادة الفتح">` : ""}<b>${esc(st.name)}</b> <span class="muted">${esc(st.sid || "")}</span> ${out ? `<span class="pill a">مستبعد من الاختبار</span>` : stTxt(s)}${s && s.away ? ` <span class="pill a" title="خرج من صفحة الاختبار">خرج ${s.away} مرة</span>` : ""}${xt > now ? ` <span class="pill e">مفتوح له حتى ${esc(fmtDT(xt))}</span>` : ""}${st.sid && rt[st.sid] ? ` <span class="pill" title="عدد مرات إعادة الاختبار">أعاد ${rt[st.sid]}×</span>` : ""}</div>
      <div><b>${s ? (auto === null ? "…" : auto + esSum) : "—"}</b> <span class="muted">/ ${total}</span>${s && s.graded ? ` <span class="pill p">مصحّح</span>` : ""}</div></div>
      ${s && es.length ? es.map(q => `<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:6px"><div class="muted">${esc(q.q)} (${q.p} درجة)</div><div style="white-space:pre-wrap;margin:4px 0">${esc((s.ans || {})[q.id] || "— ما كتب شي —")}</div>
        ${RO() ? `<span>${Number((s.es || {})[q.id]) || 0}</span>` : `<label class="row" style="gap:6px">الدرجة<input type="number" min="0" max="${q.p}" step="0.5" data-esg="${esc(s.id)}|${q.id}" value="${(s.es || {})[q.id] ?? ""}" style="width:80px"></label>`}</div>`).join("") : ""}
    </div>`; }).join("");
  const done = (subs || []).length;
  return `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><button class="btn sm" id="exBack">→ الاختبارات</button><span class="pill ${EXST[exState(e)][1]}">${EXST[exState(e)][0]}</span></div>
    <h2 style="margin:10px 0 4px">${esc(e.title)}</h2><p class="muted" style="margin:0">${done} من ${stu.length} دخلوا · ${total} درجة · ${es.length ? `فيه ${es.length} سؤال مقالي يحتاج تصحيح` : "كل الأسئلة تتصحح لحالها"}</p>
    ${RO() ? "" : `<div class="row" style="margin-top:10px;gap:6px"><button class="btn pri" id="exGrade">حفظ التصحيح</button><button class="btn ${e.resultsOut ? "" : "gold"}" id="exOut">${e.resultsOut ? "إخفاء النتائج عن الطلاب" : "إظهار النتائج للطلاب"}</button><button class="btn" id="exXls">Excel</button></div>`}
    ${canRe ? `<details id="reBox" style="margin-top:12px;border:1px solid var(--gold);border-radius:12px;padding:10px 12px" ${sel.open ? "open" : ""}><summary style="cursor:pointer;font-weight:700">🔁 إعادة فتح الاختبار لطالب أو أكثر</summary>
      <p class="muted" style="margin:8px 0">حدّد الطلاب من المربعات جنب الأسماء تحت، أو استخدم التحديد السريع. باقي الطلاب ما يتأثرون، ولو الاختبار مقفل يبقى مقفل عليهم.</p>
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-rq="all">كل المسجّلين</button><button class="btn sm" data-rq="none">اللي ما دخلوا</button><button class="btn sm" data-rq="late">اللي انتهى وقتهم بدون تسليم</button><button class="btn sm" data-rq="done">اللي سلّموا</button><button class="btn sm" data-rq="clear">إلغاء التحديد</button></div>
      <div class="row" style="margin-top:8px;align-items:flex-end;gap:10px;flex-wrap:wrap"><label class="f grow" for="reUntil" style="margin:0">مفتوح لهم حتى<input type="datetime-local" id="reUntil" value="${sel.until || dtLocal(now + Math.max((Number(e.mins) || 0) + 30, 60) * 60000)}"></label>
        <span class="muted" style="padding-bottom:10px">مدة الاختبار لكل طالب تبقى ${e.mins} دقيقة من لحظة ما يبدأ</span></div>
      <label class="row" style="gap:6px;margin:8px 0;cursor:pointer"><input type="checkbox" id="reWipe" ${sel.wipe ? "checked" : ""}> اللي عنده محاولة سابقة تنمسح ويعيد من البداية بترتيب أسئلة جديد (درجته القديمة تنحفظ في السجل)</label>
      <button class="btn gold" id="reGo">🔁 افتح الاختبار للمحدّدين (<span id="reN">${sel.nums.size}</span>)</button></details>` : ""}
  </div><div class="list">${subs === null ? `<div class="card empty">جاري التحميل…</div>` : rows || `<div class="card empty">ما فيه طلاب في المقرر.</div>`}</div>`;
}
function bindExamResults(g){
  $("#exBack").onclick = () => { S.exView = null; try { S._exSubL && S._exSubL(); } catch {} S._exSubL = null; S.exSubs = null; render(); };
  const e = ((S.exams || {})[g.id] || []).find(x => x.id === (S.exView || {}).eid); if (!e) return;
  const key = S.exKey && S.exKey.eid === e.id ? S.exKey.ans : null, es = (e.qs || []).filter(q => q.t === "es");
  if ($("#exGrade")) $("#exGrade").onclick = async ev => {
    if (!key) return toast("انتظر شوي، الإجابات تتحمّل");
    const marks = {}; document.querySelectorAll("[data-esg]").forEach(x => { const [sid, qid] = x.dataset.esg.split("|"); const q = es.find(y => y.id === qid); let v = x.value === "" ? null : Math.max(0, Math.min(Number(q.p) || 0, Number(x.value) || 0)); (marks[sid] = marks[sid] || {})[qid] = v; });
    ev.target.disabled = true;
    try {
      const b = writeBatch(db); let n = 0;
      (S.exSubs.list || []).forEach(s => { const m = {...(s.es || {}), ...(marks[s.id] || {})}; Object.keys(m).forEach(k => { if (m[k] === null) delete m[k]; }); const auto = exAuto(e, key, s.ans); const essayDone = es.every(q => m[q.id] !== undefined);
        b.set(ref("examSubs/" + s.id), {auto, es: m, score: auto + es.reduce((a, q) => a + (Number(m[q.id]) || 0), 0), graded: essayDone, gradedAt: new Date().toISOString()}, {merge: true}); n++; });
      if (n) await b.commit(); logAction("تصحيح اختبار", `${g.course} · ${e.title}`); toast(`انحفظ تصحيح ${n} طالب`);
    } catch (x) { handleWriteErr(x); } finally { ev.target.disabled = false; }
  };
  if ($("#exOut")) $("#exOut").onclick = async () => {
    try { await setDoc(ref("exams/" + e.id), {resultsOut: !e.resultsOut}, {merge: true}); if (!e.resultsOut) notify("examres", e.id); toast(e.resultsOut ? "النتائج انخفت" : "النتائج ظاهرة للطلاب الحين"); }
    catch (x) { handleWriteErr(x); }
  };
  if ($("#exXls")) $("#exXls").onclick = () => {
    const byNum = {}; (S.exSubs.list || []).forEach(s => byNum[s.num] = s);
    const rows = (g.students || []).map(st => { const s = byNum[st.sid]; const auto = s && key ? exAuto(e, key, s.ans) : ""; const esSum = s ? es.reduce((a, q) => a + (Number((s.es || {})[q.id]) || 0), 0) : "";
      return [st.sid || "", st.name, s ? (s.done ? "سلّم" : "ما سلّم") : "ما دخل", auto, esSum, s ? (auto === "" ? "" : auto + esSum) : "", exTotal(e), s ? (s.away || 0) : ""]; });
    excelDownload(`نتائج ${e.title} - ${g.course}`, [{title: "النتائج", rows: [[INST_AR], [`${g.course} · ${e.title}`], [], ["الرقم", "الاسم", "الحالة", "التلقائي", "المقالي", "المجموع", "من", "خرج من الصفحة"], ...rows], widths: [12, 26, 10, 10, 10, 10, 8, 12]}]);
  };
  bindReopen(g, e, key, es);
}
/* reopen an exam for chosen students: a personal closing time (exams.extra[num]), and their old attempt wiped so they start again */
function bindReopen(g, e, key, es){
  const sel = S._reSel; if (!sel || sel.eid !== e.id || !$("#reBox")) return;
  const cnt = () => { const n = $("#reN"); if (n) n.textContent = sel.nums.size; };
  $("#reBox").ontoggle = () => { sel.open = $("#reBox").open; };
  $("#reUntil").onchange = () => { sel.until = $("#reUntil").value; };
  $("#reWipe").onchange = () => { sel.wipe = $("#reWipe").checked; };
  document.querySelectorAll("[data-rsel]").forEach(x => x.onchange = () => { if (x.checked) sel.nums.add(x.dataset.rsel); else sel.nums.delete(x.dataset.rsel); cnt(); });
  const byNum = {}; ((S.exSubs || {}).list || []).forEach(s => byNum[s.num] = s);
  const nums = (g.students || []).map(s => s.sid).filter(Boolean), mem = e.memberNums || [];
  document.querySelectorAll("[data-rq]").forEach(b => b.onclick = () => {
    const q = b.dataset.rq, now = Date.now();
    const pick = q === "clear" ? [] : nums.filter(n => mem.includes(n)).filter(n => { const s = byNum[n];
      return q === "all" ? true : q === "none" ? !s : q === "done" ? s && s.done : q === "late" ? s && !s.done && now >= subDeadline(e, s) : false; });
    sel.nums = new Set(pick); document.querySelectorAll("[data-rsel]").forEach(x => x.checked = sel.nums.has(x.dataset.rsel)); cnt();
    if (q !== "clear" && !pick.length) toast("ما فيه طلاب بهالحالة");
  });
  $("#reGo").onclick = async ev => {
    const list = [...sel.nums], now = Date.now(), until = new Date($("#reUntil").value).getTime();
    if (!list.length) return toast("حدّد طالب واحد على الأقل من المربعات");
    if (!until || until < now + 5 * 60000) return toast("خلّ وقت القفل بعد ٥ دقائق على الأقل من الحين");
    if (now < tsMs(e.start)) return toast("الاختبار ما بدأ للحين — يقدرون يدخلونه في وقته");
    const wipe = $("#reWipe").checked, had = list.filter(n => byNum[n]), blocked = wipe ? [] : had;
    const name = n => ((g.students || []).find(s => s.sid === n) || {}).name || n;
    if (!ev.target.dataset.sure) { ev.target.dataset.sure = 1; ev.target.textContent = `متأكد؟ ينفتح لـ ${list.length} طالب حتى ${fmtDT(until)}${wipe && had.length ? ` وتنمسح محاولة ${had.length}` : ""}`; return; }
    const extra = {...(e.extra || {})}, retakes = {...(e.retakes || {})};
    list.forEach(n => { extra[n] = Timestamp.fromMillis(until); });
    const patch = {extra, memberNums: [...new Set([...(e.memberNums || []), ...list])], updatedAt: new Date().toISOString(), by: S.me || S.adminRole || ""};
    if (e.audience === "some") patch.pick = [...new Set([...(e.pick || []), ...list])];
    if (e.status === "closed") { patch.status = "open"; patch.end = Timestamp.fromMillis(Math.min(tsMs(e.end), now)); }   // stays shut for everyone else
    const old = [];
    if (wipe) had.forEach(n => { const s = byNum[n]; retakes[n] = (Number(retakes[n]) || 0) + 1;
      const sc = s.graded ? s.score : key ? exAuto(e, key, s.ans) + es.reduce((a, q) => a + (Number((s.es || {})[q.id]) || 0), 0) : "؟";
      old.push(`${name(n)} (${n}): ${s.done ? "سلّم" : "ما سلّم"} ${sc}/${exTotal(e)}`); });
    patch.retakes = retakes;
    ev.target.disabled = true;
    try {
      const b = writeBatch(db); b.set(ref("exams/" + e.id), patch, {merge: true});
      if (wipe) had.forEach(n => b.delete(ref(`examSubs/${e.id}_${n}`)));
      await b.commit();
      logAction("إعادة فتح اختبار", `${g.course} · ${e.title} · ${list.map(name).join("، ")} · حتى ${fmtDT(until)}${old.length ? " · المحاولات الممسوحة: " + old.join(" | ") : ""}`);
      S._reSel = {eid: e.id, nums: new Set(), until: "", wipe: true, open: false};
      toast(`انفتح الاختبار لـ ${list.length} طالب حتى ${fmtDT(until)}${blocked.length ? ` · تنبيه: ${blocked.length} عندهم محاولة سابقة وما انمسحت فما يقدرون يعيدون` : ""}`);
      render();
    } catch (x) { handleWriteErr(x); ev.target.disabled = false; delete ev.target.dataset.sure; }
  };
}

/* student: list, take, results */
function studentExams(el){
  const list = (S.myExams || []).filter(e => e.status !== "draft").sort((a, b) => tsMs(b.start) - tsMs(a.start)), now = Date.now();
  if (S.exTake) { const e = list.find(x => x.id === S.exTake); if (e) return studentTakeExam(el, e); S.exTake = null; }
  el.innerHTML = `<div class="card"><h2 style="margin:0">الاختبارات</h2><p class="muted" style="margin:6px 0 0">الاختبار يفتح في وقته. أول ما تضغط «ابدأ» يبدأ العداد، وإجاباتك تنحفظ أول بأول.</p></div>
  <div class="list">${list.map(e => { const s = (S.mySubs || {})[e.id], st = exState(e, now, S.myNum), dl = s ? subDeadline(e, s) : 0, live = s && !s.done && now < dl && st === "open";
    const res = e.resultsOut && s && s.graded ? `<b>${s.score}</b> / ${e.total}` : e.resultsOut && s ? "النتيجة تحت التصحيح" : "";
    const mine = tsMs((e.extra || {})[S.myNum]) > tsMs(e.end);
    return `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="t">${esc(e.title)}${mine && st === "open" ? ` <span class="pill e">انفتح لك من جديد</span>` : ""}</div><div class="muted">${esc(e.course || "")} · ${e.nq || 0} سؤال · ${e.mins} دقيقة · ${st === "soon" ? "يفتح " + esc(fmtDT(tsMs(e.start))) : "يقفل " + esc(fmtDT(exEnd(e, S.myNum)))}</div>${res ? `<div style="margin-top:4px">النتيجة: ${res}</div>` : ""}</div>
      ${st === "open" && !s ? `<button class="btn pri" data-exstart="${e.id}">ابدأ الاختبار</button>` : live ? `<button class="btn gold" data-excont="${e.id}">كمّل الاختبار</button>` : s ? `<span class="pill p">${s.done ? "سلّمت" : "انتهى وقتك"}</span>` : st === "soon" ? `<span class="pill e">قادم</span>` : `<span class="pill a">فاتك</span>`}</div>`; }).join("") || `<div class="card empty">ما فيه اختبارات للحين.</div>`}</div>`;
  el.querySelectorAll("[data-exstart]").forEach(b => b.onclick = async () => {
    const e = list.find(x => x.id === b.dataset.exstart); if (!e) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = `متأكد؟ عندك ${e.mins} دقيقة من الحين`; return; }
    b.disabled = true;
    try { await setDoc(ref(`examSubs/${e.id}_${S.myNum}`), {eid: e.id, gid: e.gid, tid: e.tid, num: S.myNum, startedAt: serverTimestamp(), ans: {}, done: false, away: 0}); S.exTake = e.id; render(); window.scrollTo(0, 0); }
    catch (x) { console.error(x); b.disabled = false; toast("ما قدرت أفتح الاختبار. تأكد إن وقته مفتوح"); }
  });
  el.querySelectorAll("[data-excont]").forEach(b => b.onclick = () => { S.exTake = b.dataset.excont; render(); window.scrollTo(0, 0); });
}
function studentTakeExam(el, e){
  const s = (S.mySubs || {})[e.id];
  if (!s) { el.innerHTML = `<div class="card empty">جاري فتح الاختبار…</div>`; return; }
  const dl = subDeadline(e, s);
  if (s.done || Date.now() >= dl) { S.exTake = null; S._exAns = null; clearInterval(S._exTimer); return studentExams(el); }
  S._exQs = S._exQs || {};
  if (!S._exQs[e.id]) {
    el.innerHTML = `<div class="card empty">جاري فتح الأسئلة…</div>`;
    if (!S._exQsL) { S._exQsL = true; const get = n => getDoc(ref("examQs/" + e.id)).then(d => { S._exQsL = false; S._exQs[e.id] = (d.data() || {}).qs || []; render(); }).catch(x => { console.error(x); if (n < 4) setTimeout(() => get(n + 1), 3000); else { S._exQsL = false; el.innerHTML = `<div class="card empty">ما قدرت أفتح الأسئلة. حدّث الصفحة وجرّب مرة ثانية.</div>`; } }); get(0); }
    return;
  }
  S._exAns = S._exAns && S._exAns.eid === e.id ? S._exAns : {eid: e.id, ans: {...(s.ans || {})}};
  const allQ = S._exQs[e.id], ans = S._exAns.ans, qs = exOrder(e, allQ, S.myNum);
  el.innerHTML = `<div class="card" style="position:sticky;top:0;z-index:5"><div class="row" style="justify-content:space-between;align-items:center"><div><b>${esc(e.title)}</b><div class="muted">${esc(e.course || "")} · ${e.total} درجة</div></div><div style="font-size:22px;font-weight:700" id="exClock">--:--</div></div><div class="muted" id="exSaved" style="font-size:13px">إجاباتك تنحفظ أول بأول</div></div>
  ${qs.map((q, i) => { const opts = q.t === "mc" ? seeded(q.o.map((o, j) => [o, j]), exOptSeed(e, q, S.myNum)) : null;
    return `<div class="card"><div class="row" style="justify-content:space-between"><b>سؤال ${i + 1}</b><span class="muted">${q.p} درجة</span></div><p style="white-space:pre-wrap;margin:6px 0 10px;font-size:16px">${esc(q.q)}</p>
    ${q.t === "mc" ? opts.map(([o, j]) => `<label class="item" style="cursor:pointer;gap:10px;margin:4px 0"><input type="radio" name="a${q.id}" value="${j}" data-exa="${q.id}" ${String(ans[q.id]) === String(j) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("") : ""}
    ${q.t === "tf" ? `<div class="row" style="gap:10px">${[["true", "صح"], ["false", "خطأ"]].map(([v, l]) => `<label class="item" style="cursor:pointer;gap:10px;flex:1"><input type="radio" name="a${q.id}" value="${v}" data-exa="${q.id}" ${String(ans[q.id]) === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>` : ""}
    ${q.t === "es" ? `<textarea id="exTa${q.id}" data-exa="${q.id}" style="min-height:120px" placeholder="اكتب إجابتك">${esc(ans[q.id] || "")}</textarea>` : ""}</div>`; }).join("")}
  <div class="card"><button class="btn pri" id="exSubmit" style="width:100%">تسليم الاختبار</button><p class="muted" style="margin:6px 0 0">بعد التسليم ما تقدر تعدّل. وإذا خلص الوقت ينسلّم لحاله.</p></div>`;
  const ref1 = ref(`examSubs/${e.id}_${S.myNum}`);
  const flush = async (done) => {
    clearTimeout(S._exSaveT);
    try { await setDoc(ref1, {ans: S._exAns ? S._exAns.ans : ans, ...(done ? {done: true, doneAt: serverTimestamp()} : {})}, {merge: true}); const x = $("#exSaved"); if (x) x.textContent = "✓ انحفظت " + new Date().toLocaleTimeString("ar-SA-u-nu-latn", {hour: "numeric", minute: "2-digit", second: "2-digit"}); return true; }
    catch (x) { console.error(x); const y = $("#exSaved"); if (y) y.textContent = "⚠️ ما انحفظت، تأكد من النت"; return false; }
  };
  el.querySelectorAll("[data-exa]").forEach(x => { const h = () => { const qid = x.dataset.exa; const q = qs.find(y => y.id === qid); ans[qid] = q.t === "mc" ? Number(x.value) : q.t === "tf" ? x.value === "true" : x.value.slice(0, 8000); clearTimeout(S._exSaveT); S._exSaveT = setTimeout(() => flush(false), q.t === "es" ? 1500 : 300); }; x.onchange = h; if (x.tagName === "TEXTAREA") x.oninput = h; });
  $("#exSubmit").onclick = async ev => {
    if (!ev.target.dataset.sure) { const left = qs.filter(q => ans[q.id] === undefined || ans[q.id] === "").length; ev.target.dataset.sure = 1; ev.target.textContent = left ? `باقي ${left} سؤال ما جاوبته. متأكد؟` : "متأكد؟ تسليم نهائي"; return; }
    ev.target.disabled = true; if (await flush(true)) { clearInterval(S._exTimer); S.exTake = null; S._exAns = null; toast("انسلّم الاختبار ✓"); render(); } else ev.target.disabled = false;
  };
  clearInterval(S._exTimer);
  const tick = () => { const left = dl - Date.now(), c = $("#exClock"); if (!c) { clearInterval(S._exTimer); return; }
    if (left <= 0) { clearInterval(S._exTimer); c.textContent = "00:00"; flush(true).then(() => { S.exTake = null; S._exAns = null; toast("خلص الوقت وانسلّم الاختبار"); render(); }); return; }
    const m = Math.floor(left / 60000), sec = Math.floor(left % 60000 / 1000); c.textContent = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; c.style.color = left < 60000 ? "#C0392B" : ""; };
  tick(); S._exTimer = setInterval(tick, 1000);
  if (!S._exVis) { S._exVis = true; document.addEventListener("visibilitychange", () => { if (document.hidden && S.exTake && S.myNum) { const sub = (S.mySubs || {})[S.exTake]; if (sub && !sub.done) setDoc(ref(`examSubs/${S.exTake}_${S.myNum}`), {away: (sub.away || 0) + 1}, {merge: true}).catch(() => {}); } }); }
}

/* ---------- human resources: staff list, daily attendance (typed in or imported from Excel), monthly report ----------
   hrStaff/{id}  employee: name, job, dept, phone, shift from/to, grace minutes, work days, active
   hrAtt/{date}  one day: rec[staffId] = {in, out, st, note}  st: p present, l late, a absent, v leave, x excused */
const HR_ST = {p: "حاضر", l: "متأخر", a: "غائب", v: "إجازة", x: "مستأذن"};
const HR_PILL = {p: "p", l: "l", a: "a", v: "e", x: "e"};
const WDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hmStr = n => n == null ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
/* the shift that applies on a day: the base fields, then every scheduled change (sched[]) dated on or before it */
function hrSh(s, d){
  let o = {from: s.from || "08:00", to: s.to || "16:00", grace: Number(s.grace) || 0, days: s.days || [0, 1, 2, 3, 4]};
  (s.sched || []).filter(x => x && x.at && x.at <= (d || today())).sort((a, b) => a.at.localeCompare(b.at))
    .forEach(x => { ["from", "to", "grace", "days"].forEach(k => { if (x[k] !== undefined && x[k] !== "" && x[k] !== null) o[k] = k === "grace" ? Number(x[k]) || 0 : x[k]; }); });
  return o;
}
const hrHoliday = d => ((S.hrCal || {}).holidays || []).find(h => h && d >= h.from && d <= (h.to || h.from));
const hrLeaveOn = (id, d) => (S.hrLeaves || []).find(l => l.staffId === id && !l.void && d >= l.from && d <= (l.to || l.from));
const LV_T = {annual: "سنوية", sick: "مرضية", emergency: "اضطرارية", unpaid: "بدون راتب", perm: "استئذان", other: "أخرى"};
function hrAuto(s, r, d){
  const lv = hrLeaveOn(s.id, d || today()); if (lv) return lv.type === "perm" ? "x" : "v";
  if (r && (r.st === "v" || r.st === "x")) return r.st;
  const i = hm(r && r.in); if (i === null) return "a";
  const sh = hrSh(s, d); return i > (hm(sh.from) ?? 480) + sh.grace ? "l" : "p";
}
const hrLateMin = (s, r, d) => { if (hrLeaveOn(s.id, d || today())) return 0; const i = hm(r && r.in), sh = hrSh(s, d); return i === null ? 0 : Math.max(0, i - (hm(sh.from) ?? 480) - sh.grace); };
const hrWorks = (s, d) => hrSh(s, d).days.includes(new Date(d + "T12:00:00").getDay()) && (!s.start || d >= s.start) && !hrHoliday(d);
const hrDaysLeft = iso => iso ? Math.round((Date.parse(iso + "T12:00:00") - Date.parse(today() + "T12:00:00")) / 864e5) : null;
/* papers that end soon: contract and ID / residency, within 30 days or already ended */
const hrExpiring = () => { const out = []; (S.hrStaff || []).filter(s => s.active !== false).forEach(s => [["contractEnd", "العقد"], ["idEnd", "الهوية / الإقامة"]].forEach(([k, n]) => { const left = hrDaysLeft(s[k]); if (left !== null && left <= 30) out.push({s, k, n, left, date: s[k]}); })); return out.sort((a, b) => a.left - b.left); };
const hrWa = (s, text) => s.phone ? `https://wa.me/${s.phone}?text=${encodeURIComponent(text)}` : "";
function hrSubs(){
  if (S._hrOn) return; S._hrOn = true;
  S.subs.push(onSnapshot(collection(db, "hrStaff"), snap => { S.hrStaff = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar")); afterData(); }, e => console.error(e)));
  S.subs.push(onSnapshot(collection(db, "hrLeaves"), snap => { S.hrLeaves = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (b.from || "").localeCompare(a.from || "")); afterData(); }, e => console.error(e)));
  S.subs.push(onSnapshot(ref("hrCfg/cal"), snap => { S.hrCal = snap.exists() ? snap.data() : {holidays: []}; afterData(); }, e => console.error(e)));
  S.subs.push(onSnapshot(ref("hrCfg/pay"), snap => { S.hrPay = snap.exists() ? snap.data() : {}; afterData(); }, e => console.error(e)));
  S.subs.push(() => { S._hrOn = false; if (S._hrMonL) try { S._hrMonL(); } catch {} S._hrMonL = null; S._hrMon = null; });
}
function hrMonth(m){
  if (S._hrMon === m) return; S._hrMon = m; S.hrAtt = null;
  if (S._hrMonL) try { S._hrMonL(); } catch {}
  S._hrMonL = onSnapshot(query(collection(db, "hrAtt"), where("date", ">=", m + "-01"), where("date", "<=", m + "-31")), snap => { S.hrAtt = {}; snap.docs.forEach(d => S.hrAtt[d.id] = d.data()); afterData(); }, e => console.error(e));
}
function hrTab(el){
  hrSubs();
  const t = S.hrTab || "att";
  el.innerHTML = `<div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${[["att", "الحضور والانصراف"], ["staff", "الموظفين"], ["leave", "الإجازات"], ["notice", "التعاميم"], ["rep", "التقرير الشهري والرواتب"], ["bio", "جهاز البصمة"], ["set", "العطل والخصومات"]].map(([k, v]) => `<button class="tab ${t === k ? "on" : ""}" data-hrt="${k}">${v}</button>`).join("")}</div></div><div id="hrb"></div>`;
  el.querySelectorAll("[data-hrt]").forEach(b => b.onclick = () => { S.hrTab = b.dataset.hrt; render(); });
  ({att: hrAttView, staff: hrStaffView, leave: hrLeaveView, notice: hrNoticeView, rep: hrRepView, bio: hrBioView, set: hrSetView})[t]($("#hrb"));
}
function hrAttView(el){
  const d = S.hrDate || today(); hrMonth(d.slice(0, 7));
  const staff = (S.hrStaff || []).filter(s => s.active !== false), day = (S.hrAtt || {})[d] || {rec: {}}, rec = day.rec || {};
  const draft = S._hrDraft && S._hrDraft.d === d && S._hrDraft.dirty ? S._hrDraft.rec : (S._hrDraft = {d, rec: JSON.parse(JSON.stringify(rec))}).rec;   // untouched: follows new punches from the clock
  const working = staff.filter(s => hrWorks(s, d));
  const cnt = {p: 0, l: 0, a: 0, v: 0, x: 0}; working.forEach(s => cnt[hrAuto(s, draft[s.id], d)]++);
  el.innerHTML = `<div class="card"><div class="row" style="align-items:end;gap:8px">
      <label class="f" for="hrD" style="width:170px">التاريخ<input type="date" id="hrD" value="${d}" max="${today()}"></label>
      <span class="muted">${WDAYS[new Date(d + "T12:00:00").getDay()]} · ${working.length} موظف دوامهم اليوم</span><span class="grow"></span>
      <button class="btn sm" id="hrTpl">نموذج Excel</button><label class="btn sm" for="hrX" style="cursor:pointer">استيراد من Excel</label><input type="file" id="hrX" accept=".xlsx,.xls,.csv" style="display:none">
    </div>
    ${Object.keys(day.unk || {}).length ? `<div class="notice" style="margin-top:8px">بصمات وصلت اليوم من أرقام ما هي مربوطة بموظف: ${Object.entries(day.unk).map(([p, t]) => `<b>${esc(p)}</b> (${esc(t.join("، "))})`).join(" · ")}. اربطها من «الموظفين» ← رقم البصمة.</div>` : ""}
    <div class="stats" style="margin-top:10px">${["p", "l", "a", "v", "x"].map(k => `<div class="stat"><div class="n">${cnt[k]}</div><div class="l">${HR_ST[k]}</div></div>`).join("")}</div></div>
  ${d === today() ? hrAlertsCard(working, draft, d) : ""}
  ${!staff.length ? `<div class="card empty">ما فيه موظفين. أضفهم من تبويب «الموظفين».</div>` : `<div class="list">${working.map(s => { const r = draft[s.id] || {}, st = hrAuto(s, r, d), late = hrLateMin(s, r, d), sh = hrSh(s, d), lv = hrLeaveOn(s.id, d);
    return `<div class="item" style="flex-wrap:wrap;gap:8px"><div class="grow" style="min-width:160px"><b>${esc(s.name)}</b>${r.src === "bio" ? ` <span title="من جهاز البصمة${(r.punches || []).length ? ": " + esc(r.punches.join("، ")) : ""}">🖐</span>` : ""}<div class="muted">${esc(s.job || "")} · الدوام ${esc(sh.from)}–${esc(sh.to)}${lv ? ` · <b>إجازة ${esc(LV_T[lv.type] || "")}</b>` : ""}${(r.early || []).length && !r.in ? ` · <span style="color:var(--abs)">بصمة مبكرة ما انحسبت ${esc(r.early.join("، "))}</span>` : ""}</div></div>
      <label class="row" style="gap:4px">دخول<input type="time" data-hin="${s.id}" value="${esc(r.in || "")}" style="width:110px"></label>
      <label class="row" style="gap:4px">خروج<input type="time" data-hout="${s.id}" value="${esc(r.out || "")}" style="width:110px"></label>
      <select data-hst="${s.id}" style="width:auto"><option value="">تلقائي</option>${["v", "x"].map(k => `<option value="${k}" ${r.st === k ? "selected" : ""}>${HR_ST[k]}</option>`).join("")}</select>
      <span class="pill ${HR_PILL[st]}">${HR_ST[st]}${st === "l" ? ` ${late} د` : ""}</span>
      <input type="text" data-hnote="${s.id}" value="${esc(r.note || "")}" placeholder="ملاحظة" style="width:150px"></div>`; }).join("") || `<div class="card empty">ما فيه أحد دوامه هذا اليوم.</div>`}</div>
    <div class="row" style="margin:10px 0;gap:6px"><button class="btn pri" id="hrSave">حفظ اليوم</button><button class="btn sm" id="hrNow">سجّل دخول اللي ما سجّلوا بالوقت الحالي</button></div>`}`;
  $("#hrD").onchange = e => { S.hrDate = e.target.value || today(); S._hrDraft = null; render(); };
  const upd = (id, k, v) => { (draft[id] = draft[id] || {})[k] = v; S._hrDraft.dirty = true; };
  el.querySelectorAll("[data-hin]").forEach(x => x.onchange = () => { upd(x.dataset.hin, "in", x.value); render(); });
  el.querySelectorAll("[data-hout]").forEach(x => x.onchange = () => { upd(x.dataset.hout, "out", x.value); });
  el.querySelectorAll("[data-hst]").forEach(x => x.onchange = () => { upd(x.dataset.hst, "st", x.value); render(); });
  el.querySelectorAll("[data-hnote]").forEach(x => x.oninput = () => upd(x.dataset.hnote, "note", x.value.slice(0, 200)));
  if ($("#hrNow")) $("#hrNow").onclick = () => { const n = new Date(), t = hmStr(n.getHours() * 60 + n.getMinutes()); working.forEach(s => { const r = draft[s.id] || {}; if (!r.in && !r.st) upd(s.id, "in", t); }); render(); };
  if ($("#hrSave")) $("#hrSave").onclick = async () => {
    const out = {}; working.forEach(s => { const r = draft[s.id] || {}; out[s.id] = {in: r.in || "", out: r.out || "", st: hrAuto(s, r, d), note: r.note || "", late: hrLateMin(s, r, d)}; });
    try { await setDoc(ref("hrAtt/" + d), {date: d, rec: out, by: S.adminRole, at: new Date().toISOString()}, {merge: true}); logAction("حضور الموظفين", d); S._hrDraft = null; toast("انحفظ حضور اليوم"); }
    catch (e) { handleWriteErr(e); }
  };
  $("#hrTpl").onclick = () => excelDownload("نموذج حضور الموظفين", [{title: "الحضور", rows: [["الرقم", "الاسم", "التاريخ", "الدخول", "الخروج", "ملاحظة"], ...staff.map(s => [s.id, s.name, today(), "08:00", "16:00", ""])], widths: [14, 26, 12, 9, 9, 20]}]);
  $("#hrX").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (f) hrImport(f); };
}
/* Excel: one row per employee per day; columns found by their header (الرقم/الاسم، التاريخ، الدخول، الخروج، ملاحظة) */
async function hrImport(f){
  let rows; try { const X = await loadXLSX(); const wb = X.read(await f.arrayBuffer(), {cellDates: true}); rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd"}); }
  catch (x) { console.error(x); return toast("ما قدرت أقرأ الملف"); }
  const hi = rows.findIndex(r => r.some(c => /التاريخ|date/i.test(String(c)))); if (hi < 0) return toast("ما لقيت عمود «التاريخ» في الملف");
  const h = rows[hi].map(c => String(c).trim()), col = re => h.findIndex(c => re.test(c));
  const cId = col(/^(الرقم|رقم|id)/i), cName = col(/الاسم|name/i), cDate = col(/التاريخ|date/i), cIn = col(/الدخول|حضور|in/i), cOut = col(/الخروج|انصراف|out/i), cNote = col(/ملاحظ|note/i);
  const staff = S.hrStaff || [], byId = Object.fromEntries(staff.map(s => [s.id, s])), byName = Object.fromEntries(staff.map(s => [String(s.name).trim(), s]));
  const normD = v => { v = String(v).trim(); let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(v); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`; m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(v); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  const normT = v => { v = String(v).trim(); const m = /(\d{1,2}):(\d{2})/.exec(v); if (!m) return ""; let H = Number(m[1]); if (/م|pm/i.test(v) && H < 12) H += 12; if (/ص|am/i.test(v) && H === 12) H = 0; return `${String(H).padStart(2, "0")}:${m[2]}`; };
  const days = {}, miss = new Set(); let n = 0;
  rows.slice(hi + 1).forEach(r => { const d = normD(r[cDate]); if (!d) return; const s = (cId >= 0 && byId[String(r[cId]).trim()]) || (cName >= 0 && byName[String(r[cName]).trim()]); if (!s) { const nm = String(r[cName] ?? r[cId] ?? "").trim(); if (nm) miss.add(nm); return; }
    const rec = {in: cIn >= 0 ? normT(r[cIn]) : "", out: cOut >= 0 ? normT(r[cOut]) : "", note: cNote >= 0 ? String(r[cNote]).slice(0, 200) : ""}; rec.st = hrAuto(s, rec, d); rec.late = hrLateMin(s, rec, d);
    (days[d] = days[d] || {})[s.id] = rec; n++; });
  const ds = Object.keys(days).sort(); if (!n) return toast("ما لقيت صفوف تنطبق على الموظفين المسجلين");
  if (!confirm(`بيتسجل ${n} سجل حضور في ${ds.length} يوم (${ds[0]} إلى ${ds[ds.length - 1]}).${miss.size ? `\nما لقيت هالأسماء في قائمة الموظفين: ${[...miss].slice(0, 8).join("، ")}` : ""}\nالسجلات الموجودة لنفس الموظف ونفس اليوم تتبدّل. نكمل؟`)) return;
  try { for (let i = 0; i < ds.length; i += 400) { const b = writeBatch(db); ds.slice(i, i + 400).forEach(d => b.set(ref("hrAtt/" + d), {date: d, rec: days[d], by: S.adminRole, at: new Date().toISOString()}, {merge: true})); await b.commit(); }
    logAction("استيراد حضور الموظفين", `${n} سجل`); toast(`انضاف ${n} سجل`); S._hrDraft = null; }
  catch (x) { handleWriteErr(x); }
}
/* the fingerprint clock (ZKTeco, Cloud Server/ADMS): the device sends punches to the push service by itself */
function hrBioView(el){
  if (!S._bioSub) { S._bioSub = true; S.subs.push(onSnapshot(ref("hrCfg/bio"), snap => { S.bioCfg = snap.exists() ? snap.data() : {}; if (S.hrTab === "bio" && !busyEditing()) render(); }, e => console.error(e)), () => { S._bioSub = false; S.bioCfg = null; }); }
  const c = S.bioCfg; if (!c) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  const host = (() => { try { return new URL((S.site || {}).pushUrl || "").host; } catch { return ""; } })();
  const sns = c.sns || [], seen = c.seen || {}, ago = t => { if (!t) return "ما اتصل"; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 2 ? "متصل الحين ✓" : m < 60 ? `قبل ${m} دقيقة` : m < 1440 ? `قبل ${Math.round(m / 60)} ساعة` : `قبل ${Math.round(m / 1440)} يوم`; };
  const fresh = t => t && Date.now() - Date.parse(t) < 15 * 60000;
  const pending = Object.keys(seen).filter(k => !sns.includes(k));
  const staff = S.hrStaff || [], noPin = staff.filter(s => s.active !== false && !s.pin);
  const unkAll = {}; Object.values(S.hrAtt || {}).forEach(d => Object.entries(d.unk || {}).forEach(([p, t]) => unkAll[p] = (unkAll[p] || 0) + t.length));
  const cmd = c.cmd || {};
  el.innerHTML = `<div class="card"><h2>جهاز البصمة</h2>
      <p class="muted" style="margin-top:0">الجهاز يرسل البصمات للنظام بنفسه أول بأول، وتنحسب في «الحضور والانصراف»: أول بصمة باليوم دخول، وآخر بصمة خروج. لازم يكون لكل موظف «رقم البصمة» نفس رقمه في الجهاز.</p>
      ${sns.length ? sns.map(k => `<div class="item"><div class="grow"><b>🖐 ${esc(k)}</b><div class="muted">آخر اتصال: ${esc(ago((seen[k] || {}).at))}${(seen[k] || {}).lastPunch ? ` · آخر بصمات وصلت: ${esc(ago(seen[k].lastPunch))}` : ""}</div></div><span class="pill ${fresh((seen[k] || {}).at) ? "p" : "a"}">${fresh((seen[k] || {}).at) ? "متصل" : "غير متصل"}</span><button class="btn sm danger" data-biorm="${esc(k)}">إلغاء</button></div>`).join("") : `<div class="notice">ما فيه جهاز معتمد للحين.</div>`}
      ${pending.map(k => `<div class="notice" style="margin-top:8px">جهاز جديد يحاول يتصل: <b dir="ltr">${esc(k)}</b> (${esc(ago(seen[k].at))}). تأكد إن الرقم نفسه المكتوب ورا جهازك (SN). <button class="btn sm pri" data-bioadd="${esc(k)}">اعتماد</button></div>`).join("")}
      <div class="row" style="margin-top:10px;gap:6px"><input type="text" id="bioSn" dir="ltr" placeholder="أو اكتب الرقم التسلسلي SN من ورا الجهاز" maxlength="40" class="grow"><button class="btn" id="bioAdd">اعتماد الرقم</button></div></div>
    <div class="card"><h3 style="margin-top:0">إعداد الجهاز (مرة وحدة)</h3>
      <ol style="margin:0;padding-inline-start:20px;line-height:2">
        <li>في الجهاز: <b>M/OK</b> ← <b>COMM.</b> (الاتصال) ← <b>Cloud Server Setting</b>.</li>
        <li><b>Server Mode</b>: ADMS · <b>Enable Domain Name</b>: ON</li>
        <li><b>Server Address</b>: <code dir="ltr" style="user-select:all">http://${esc(host || "— اضبط رابط خدمة الإشعارات أول —")}</code></li>
        <li>لو جهازك فيه خانة <b>Server Port</b>: اكتب <code>80</code>. <b>Enable Proxy Server</b>: OFF.</li>
        <li>اطلع من القائمة وانتظر دقيقة. يطلع هنا «جهاز جديد يحاول يتصل»، اضغط «اعتماد».</li>
      </ol></div>
    <div class="card"><h3 style="margin-top:0">ربط الموظفين بأرقام البصمة</h3>
      ${noPin.length ? `<div class="notice err">موظفين بدون رقم بصمة (بصماتهم ما تنحسب): ${noPin.map(s => esc(s.name)).join("، ")}. أضف الرقم من تبويب «الموظفين» ← تعديل.</div>` : `<p class="muted" style="margin:0">كل الموظفين مربوطين ✓</p>`}
      ${Object.keys(unkAll).length ? `<div class="notice" style="margin-top:8px">أرقام بصمة وصلت من الجهاز هذا الشهر وما هي مربوطة بأي موظف: ${Object.entries(unkAll).map(([p, n]) => `<b>${esc(p)}</b> (${n})`).join("، ")}. اكتب الرقم عند الموظف الصحيح، وبصماته الجاية تنحسب له.</div>` : ""}</div>
    <div class="card"><h3 style="margin-top:0">سحب سجلات قديمة من الجهاز</h3>
      <p class="muted" style="margin-top:0">لو الجهاز كان فيه بصمات قبل الربط، أو انقطع النت فترة: اختر الفترة، والجهاز يرسلها في اتصاله الجاي.</p>
      <div class="row" style="align-items:end;gap:8px"><label class="f" for="bioF" style="width:170px">من<input type="date" id="bioF" value="${esc(today().slice(0, 7) + "-01")}"></label><label class="f" for="bioT" style="width:170px">إلى<input type="date" id="bioT" value="${today()}" max="${today()}"></label><button class="btn" id="bioPull">اطلب السجلات</button></div>
      ${cmd.id ? `<p class="muted" style="margin:8px 0 0">آخر طلب: ${esc(cmd.from)} → ${esc(cmd.to)} · ${cmd.sent === cmd.id ? "وصل للجهاز ✓" : "ينتظر اتصال الجهاز…"}</p>` : ""}</div>`;
  const save = async (patch, msg) => { try { await setDoc(ref("hrCfg/bio"), patch, {merge: true}); logAction("جهاز البصمة", msg); toast("انحفظ"); } catch (x) { handleWriteErr(x); } };
  const add = k => { k = String(k || "").trim().toUpperCase().replace(/[^\w-]/g, ""); if (k.length < 6) return toast("الرقم التسلسلي قصير، انسخه من الملصق ورا الجهاز"); if (sns.includes(k)) return toast("معتمد من قبل"); save({sns: [...sns, k]}, "اعتماد جهاز " + k); };
  el.querySelectorAll("[data-bioadd]").forEach(b => b.onclick = () => add(b.dataset.bioadd));
  el.querySelectorAll("[data-biorm]").forEach(b => b.onclick = () => { if (confirm("إلغاء اعتماد الجهاز؟ بصماته الجاية ما تنحسب لين تعتمده من جديد.")) save({sns: sns.filter(x => x !== b.dataset.biorm)}, "إلغاء جهاز " + b.dataset.biorm); });
  $("#bioAdd").onclick = () => add($("#bioSn").value);
  $("#bioPull").onclick = () => { const f = $("#bioF").value, t = $("#bioT").value; if (!f || !t || f > t) return toast("اختر فترة صحيحة"); save({cmd: {id: String(Math.floor(Date.now() / 1000) % 100000000), from: f, to: t, at: new Date().toISOString()}}, `سحب سجلات ${f} → ${t}`); };
}
function hrStaffView(el){
  const list = S.hrStaff || [], ed = S._hrEd;
  el.innerHTML = `<div class="card"><h2>${ed && ed.id ? "تعديل موظف" : "إضافة موظف"}</h2>
    <div class="row"><label class="f grow" for="hsN">الاسم<input type="text" id="hsN" value="${esc(ed ? ed.name : "")}"></label><label class="f grow" for="hsJ">الوظيفة<input type="text" id="hsJ" value="${esc(ed ? ed.job || "" : "")}" placeholder="مدرب، محاسب، استقبال…"></label><label class="f grow" for="hsDp">القسم<input type="text" id="hsDp" value="${esc(ed ? ed.dept || "" : "")}"></label></div>
    <div class="row"><label class="f grow" for="hsP">الجوال<input type="tel" id="hsP" dir="ltr" value="${esc(ed ? ed.phone || "" : "")}" placeholder="05xxxxxxxx"></label><label class="f" for="hsF" style="width:120px">بداية الدوام<input type="time" id="hsF" value="${esc(ed ? ed.from || "08:00" : "08:00")}"></label><label class="f" for="hsT" style="width:120px">نهاية الدوام<input type="time" id="hsT" value="${esc(ed ? ed.to || "16:00" : "16:00")}"></label><label class="f" for="hsG" style="width:120px">سماح التأخير (د)<input type="number" id="hsG" min="0" max="120" value="${ed ? ed.grace ?? 15 : 15}"></label><label class="f" for="hsS" style="width:150px">تاريخ المباشرة<input type="date" id="hsS" value="${esc(ed ? ed.start || "" : "")}"></label><label class="f" for="hsPin" style="width:130px">رقم البصمة<input type="text" id="hsPin" dir="ltr" inputmode="numeric" maxlength="24" value="${esc(ed ? ed.pin || "" : "")}" placeholder="رقمه في الجهاز"></label></div>
    <div class="row" style="gap:10px;margin:6px 0">أيام الدوام: ${WDAYS.map((w, i) => `<label class="row" style="gap:3px"><input type="checkbox" data-hday="${i}" ${(ed ? ed.days || [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4]).includes(i) ? "checked" : ""}>${w}</label>`).join("")}</div>
    <details ${ed && (ed.nid || ed.salary || ed.contractEnd) ? "open" : ""} style="margin:6px 0"><summary style="cursor:pointer"><b>ملف الموظف</b> <span class="muted">(الهوية والعقد والراتب والإجازات)</span></summary>
      <div class="row" style="margin-top:6px"><label class="f grow" for="hsNid">رقم الهوية / الإقامة<input type="text" id="hsNid" dir="ltr" inputmode="numeric" maxlength="12" value="${esc(ed ? ed.nid || "" : "")}"></label><label class="f grow" for="hsNat">الجنسية<input type="text" id="hsNat" maxlength="30" value="${esc(ed ? ed.nat || "" : "")}"></label><label class="f" for="hsIdE" style="width:170px">انتهاء الهوية / الإقامة<input type="date" id="hsIdE" value="${esc(ed ? ed.idEnd || "" : "")}"></label><label class="f" for="hsCE" style="width:170px">انتهاء العقد<input type="date" id="hsCE" value="${esc(ed ? ed.contractEnd || "" : "")}"></label></div>
      <div class="row"><label class="f" for="hsSal" style="width:150px">الراتب الأساسي<input type="number" id="hsSal" min="0" step="0.01" value="${esc(ed ? ed.salary ?? "" : "")}"></label><label class="f" for="hsAl" style="width:150px">البدلات<input type="number" id="hsAl" min="0" step="0.01" value="${esc(ed ? ed.allow ?? "" : "")}"></label><label class="f" for="hsAn" style="width:170px">رصيد الإجازة السنوية (يوم)<input type="number" id="hsAn" min="0" max="90" value="${esc(ed ? ed.annual ?? 30 : 30)}"></label><label class="f grow" for="hsNo">ملاحظات<input type="text" id="hsNo" maxlength="300" value="${esc(ed ? ed.notes || "" : "")}"></label></div>
    </details>
    <div class="row" style="gap:6px"><button class="btn pri" id="hsSave">${ed && ed.id ? "حفظ" : "+ إضافة"}</button>${ed ? `<button class="btn" id="hsCancel">إلغاء</button>` : ""}</div></div>
  ${list.length ? hrBulkCard(list) : ""}
  <div class="list">${list.map(s => `<div class="item"><div class="grow"><b>${esc(s.name)}</b> ${s.active === false ? `<span class="pill a">موقوف</span>` : ""}<div class="muted">${esc(s.job || "")}${s.dept ? " · " + esc(s.dept) : ""} · ${(sh => `${esc(sh.from)}–${esc(sh.to)} · ${sh.days.map(i => WDAYS[i]).join("، ")}`)(hrSh(s))}${(s.sched || []).filter(x => x.at > today()).map(x => ` · <span class="pill e">من ${esc(x.at)}: ${esc(x.from || "")}–${esc(x.to || "")}</span>`).join("")}${[["contractEnd", "العقد"], ["idEnd", "الهوية"]].map(([k, n]) => { const l = hrDaysLeft(s[k]); return l !== null && l <= 30 ? ` · <span class="pill a">${n} ${l < 0 ? "منتهي" : `ينتهي بعد ${l} يوم`}</span>` : ""; }).join("")}${s.pin ? ` · 🖐 بصمة ${esc(s.pin)}` : ` · <span style="color:var(--abs)">بدون رقم بصمة</span>`}</div></div>
    <button class="btn sm" data-hsed="${s.id}">تعديل</button><button class="btn sm" data-hsact="${s.id}">${s.active === false ? "تفعيل" : "إيقاف"}</button></div>`).join("") || `<div class="card empty">ما فيه موظفين للحين.</div>`}</div>`;
  $("#hsSave").onclick = async () => {
    const d = {name: $("#hsN").value.trim().slice(0, 80), job: $("#hsJ").value.trim().slice(0, 60), dept: $("#hsDp").value.trim().slice(0, 60), phone: $("#hsP").value.trim() ? normPhone($("#hsP").value) : "", from: $("#hsF").value || "08:00", to: $("#hsT").value || "16:00", grace: Math.max(0, Math.min(120, Number($("#hsG").value) || 0)), start: $("#hsS").value || "", nid: $("#hsNid").value.trim().replace(/\D/g, "").slice(0, 12), nat: $("#hsNat").value.trim().slice(0, 30), idEnd: $("#hsIdE").value || "", contractEnd: $("#hsCE").value || "", salary: Math.max(0, Number($("#hsSal").value) || 0), allow: Math.max(0, Number($("#hsAl").value) || 0), annual: Math.max(0, Math.min(90, Number($("#hsAn").value) || 0)), notes: $("#hsNo").value.trim().slice(0, 300), pin: $("#hsPin").value.trim().replace(/[^\w]/g, "").slice(0, 24), days: [...el.querySelectorAll("[data-hday]:checked")].map(x => Number(x.dataset.hday))};
    if (!d.name) return toast("اكتب اسم الموظف"); if (d.pin && list.some(s => s.pin === d.pin && (!ed || s.id !== ed.id))) return toast("رقم البصمة هذا مستخدم لموظف ثاني"); if (!d.days.length) return toast("اختر أيام الدوام");
    const id = ed && ed.id ? ed.id : "e" + Date.now().toString(36);
    try { await setDoc(ref("hrStaff/" + id), {...d, active: ed && ed.id ? ed.active !== false : true}, {merge: true}); logAction("بيانات موظف", d.name); S._hrEd = null; toast("انحفظ"); render(); }
    catch (x) { handleWriteErr(x); }
  };
  if ($("#hsCancel")) $("#hsCancel").onclick = () => { S._hrEd = null; render(); };
  bindHrBulk(el, list);
  el.querySelectorAll("[data-hsed]").forEach(b => b.onclick = () => { S._hrEd = {...list.find(s => s.id === b.dataset.hsed)}; render(); window.scrollTo(0, 0); });
  el.querySelectorAll("[data-hsact]").forEach(b => b.onclick = async () => { const s = list.find(x => x.id === b.dataset.hsact); try { await setDoc(ref("hrStaff/" + s.id), {active: s.active === false}, {merge: true}); } catch (x) { handleWriteErr(x); } });
}
/* change the working hours of several employees at once, from a date on; the days before keep the old hours */
function hrBulkCard(list){
  const B = S._hrBulk = S._hrBulk || {mode: "all", depts: [], ids: [], at: today(), from: "", to: "", grace: "", days: null, notice: true};
  const act = list.filter(s => s.active !== false), depts = [...new Set(act.map(s => s.dept || "بدون قسم"))].sort((a, b) => a.localeCompare(b, "ar"));
  return `<details class="card" id="hbCard" ${S._hrBulkOpen ? "open" : ""}><summary style="cursor:pointer"><b>⏰ تغيير الدوام لأكثر من موظف</b> <span class="muted">(مثل دوام رمضان أو الصيف)</span></summary>
    <div class="row" style="margin-top:10px;gap:14px;flex-wrap:wrap">${[["all", "كل الموظفين"], ["dept", "قسم"], ["pick", "أختارهم"]].map(([k, v]) => `<label class="row" style="gap:5px"><input type="radio" name="hbM" value="${k}" ${B.mode === k ? "checked" : ""}> ${v}</label>`).join("")}</div>
    ${B.mode === "dept" ? `<div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px">${depts.map(d => `<label class="row" style="gap:4px"><input type="checkbox" data-hbd="${esc(d)}" ${B.depts.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div>` : ""}
    ${B.mode === "pick" ? `<div class="list" style="max-height:200px;overflow:auto;margin-top:6px">${act.map(s => `<label class="item" style="gap:8px;padding:6px 10px"><input type="checkbox" data-hbi="${esc(s.id)}" ${B.ids.includes(s.id) ? "checked" : ""}><span class="grow">${esc(s.name)} <span class="muted">· ${esc(s.dept || "")}</span></span></label>`).join("")}</div>` : ""}
    <div class="row" style="margin-top:8px"><label class="f" for="hbAt" style="width:170px">يبدأ من تاريخ<input type="date" id="hbAt" value="${esc(B.at)}"></label><label class="f" for="hbF" style="width:130px">بداية الدوام<input type="time" id="hbF" value="${esc(B.from)}"></label><label class="f" for="hbT" style="width:130px">نهاية الدوام<input type="time" id="hbT" value="${esc(B.to)}"></label><label class="f" for="hbG" style="width:140px">سماح التأخير (د)<input type="number" id="hbG" min="0" max="120" value="${esc(B.grace)}" placeholder="بدون تغيير"></label></div>
    <label class="row" style="gap:6px;margin:6px 0"><input type="checkbox" id="hbDy" ${B.days ? "checked" : ""}> أغيّر أيام الدوام بعد</label>
    ${B.days ? `<div class="row" style="gap:10px;margin:0 0 6px">${WDAYS.map((w, i) => `<label class="row" style="gap:3px"><input type="checkbox" data-hbday="${i}" ${B.days.includes(i) ? "checked" : ""}>${w}</label>`).join("")}</div>` : ""}
    <label class="row" style="gap:6px;margin:6px 0"><input type="checkbox" id="hbN" ${B.notice ? "checked" : ""}> بعد الحفظ أجهّز تعميم واتساب للموظفين المعنيين</label>
    <div class="row" style="gap:6px"><span class="muted" id="hbInfo"></span><span class="grow"></span><button class="btn pri" id="hbSave">حفظ الدوام الجديد</button></div>
    <p class="muted" style="margin:6px 0 0">الأيام اللي قبل التاريخ تبقى على الدوام القديم، والتأخير من التاريخ هذا ينحسب على الوقت الجديد. ولو بتسوي دوام مؤقت (مثل رمضان)، سوّ تغيير ثاني يرجّع الوقت القديم من تاريخ نهايته.</p></details>`;
}
function bindHrBulk(el, list){
  const B = S._hrBulk, card = $("#hbCard"); if (!B || !card) return;
  card.ontoggle = () => { S._hrBulkOpen = card.open; };
  const act = list.filter(s => s.active !== false);
  const who = () => B.mode === "all" ? act : B.mode === "dept" ? act.filter(s => B.depts.includes(s.dept || "بدون قسم")) : act.filter(s => B.ids.includes(s.id));
  const sync = () => { B.at = $("#hbAt").value || today(); B.from = $("#hbF").value; B.to = $("#hbT").value; B.grace = $("#hbG").value; B.notice = $("#hbN").checked; if (B.days) B.days = [...el.querySelectorAll("[data-hbday]:checked")].map(x => Number(x.dataset.hbday)); };
  const info = () => { const n = who().length; $("#hbInfo").textContent = `${n} موظف`; };
  el.querySelectorAll('input[name="hbM"]').forEach(r => r.onchange = () => { sync(); B.mode = r.value; S._hrBulkOpen = true; render(); });
  el.querySelectorAll("[data-hbd]").forEach(c => c.onchange = () => { B.depts = c.checked ? [...B.depts, c.dataset.hbd] : B.depts.filter(x => x !== c.dataset.hbd); info(); });
  el.querySelectorAll("[data-hbi]").forEach(c => c.onchange = () => { B.ids = c.checked ? [...B.ids, c.dataset.hbi] : B.ids.filter(x => x !== c.dataset.hbi); info(); });
  $("#hbDy").onchange = () => { sync(); B.days = $("#hbDy").checked ? [0, 1, 2, 3, 4] : null; S._hrBulkOpen = true; render(); };
  info();
  $("#hbSave").onclick = async e => {
    sync(); const L = who();
    if (!L.length) return toast("اختر الموظفين");
    if (!B.from || !B.to) return toast("اكتب بداية ونهاية الدوام الجديد");
    if (B.days && !B.days.length) return toast("اختر أيام الدوام");
    if (!confirm(`يتغيّر دوام ${L.length} موظف إلى ${B.from}–${B.to} من تاريخ ${B.at}. نكمل؟`)) return;
    e.target.disabled = true;
    const ch = {at: B.at, from: B.from, to: B.to, ...(B.grace !== "" ? {grace: Math.max(0, Math.min(120, Number(B.grace) || 0))} : {}), ...(B.days ? {days: B.days} : {}), by: ROLES[S.adminRole] || S.adminRole, on: new Date().toISOString()};
    try {
      for (let i = 0; i < L.length; i += 400) { const b = writeBatch(db); L.slice(i, i + 400).forEach(s => b.set(ref("hrStaff/" + s.id), {sched: [...(s.sched || []).filter(x => x.at !== B.at), ch].sort((a, c) => a.at.localeCompare(c.at)).slice(-24)}, {merge: true})); await b.commit(); }
      logAction("تغيير دوام موظفين", `${L.length} موظف · ${B.from}–${B.to} من ${B.at}`); toast(`تغيّر دوام ${L.length} موظف ✓`);
      if (B.notice) {
        S._hrNotice = {mode: "pick", ids: L.map(s => s.id), title: "تعديل وقت الدوام",
          text: `السلام عليكم {الاسم}\n\nنفيدكم بأن وقت الدوام ابتداءً من ${greg(B.at)} سيكون من الساعة ${fmtTime(B.from)} إلى الساعة ${fmtTime(B.to)}${B.days ? `، أيام: ${B.days.map(i => WDAYS[i]).join("، ")}` : ""}.\n\nشاكرين التزامكم.\nالموارد البشرية\n${INST_AR}`};
        S.hrTab = "notice";
      }
      S._hrBulk = null; S._hrBulkOpen = false; render();
    } catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
/* working days in a period for one employee (their days, without official holidays) */
function hrWorkDays(s, from, to){ let n = 0, d = from; for (let k = 0; k < 400 && d <= to; k++) { if (hrWorks(s, d)) n++; d = addDaysISO(d, 1); } return n; }
const addDaysISO = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
function hrLeaveUsed(s, year, type){ return (S.hrLeaves || []).filter(l => l.staffId === s.id && !l.void && l.type === type && (l.from || "").startsWith(year)).reduce((a, l) => a + (Number(l.days) || 0), 0); }
/* today's alerts: who has not punched in after the start of their shift, who came late, and papers that end soon */
function hrAlertsCard(working, rec, d){
  const n = new Date(), now = Number(new Intl.DateTimeFormat("en-GB", {timeZone: TZ, hour: "numeric", hourCycle: "h23"}).format(n)) * 60 + n.getMinutes();
  const miss = working.filter(s => { const r = rec[s.id] || {}, sh = hrSh(s, d); return !hrLeaveOn(s.id, d) && !r.in && !r.st && now > (hm(sh.from) ?? 480) + sh.grace; });
  const late = working.filter(s => hrAuto(s, rec[s.id], d) === "l");
  const exp = hrExpiring();
  if (!miss.length && !late.length && !exp.length) return "";
  const row = (s, txt, msg) => `<div class="item" style="padding:6px 10px"><span class="grow">${esc(s.name)} <span class="muted">· ${txt}</span></span>${s.phone ? `<a class="btn sm" href="${esc(hrWa(s, msg))}" target="_blank" rel="noopener">واتساب</a>` : `<span class="muted">بدون جوال</span>`}</div>`;
  return `<div class="card" style="border-inline-start:4px solid var(--abs)"><h3 style="margin-top:0">🔔 تنبيهات اليوم</h3>
    ${miss.length ? `<b>ما بصموا للحين (${miss.length})</b><div class="list" style="margin:4px 0 8px">${miss.map(s => row(s, `دوامه ${fmtTime(hrSh(s, d).from)}`, `السلام عليكم ${s.name}\n\nما سجّلت بصمة الحضور اليوم ${greg(d)}. إذا عندك ظرف أو إجازة بلغنا.\n\nالموارد البشرية`)).join("")}</div>` : ""}
    ${late.length ? `<b>متأخرين اليوم (${late.length})</b><div class="list" style="margin:4px 0 8px">${late.map(s => row(s, `تأخر ${hrLateMin(s, rec[s.id], d)} دقيقة`, `السلام عليكم ${s.name}\n\nسُجّل عليك تأخير ${hrLateMin(s, rec[s.id], d)} دقيقة اليوم ${greg(d)}. نأمل الالتزام بوقت الدوام.\n\nالموارد البشرية`)).join("")}</div>` : ""}
    ${exp.length ? `<b>أوراق تنتهي قريب</b><div class="list" style="margin:4px 0 0">${exp.map(x => row(x.s, `${x.n} ${x.left < 0 ? `منتهي من ${-x.left} يوم` : x.left === 0 ? "ينتهي اليوم" : `ينتهي بعد ${x.left} يوم`} (${x.date})`, `السلام عليكم ${x.s.name}\n\nنذكّرك إن ${x.n} ${x.left < 0 ? "منتهي" : `ينتهي بتاريخ ${greg(x.date)}`}. نأمل تجديده وتزويدنا بنسخة.\n\nالموارد البشرية`)).join("")}</div>` : ""}</div>`;
}
function hrLeaveView(el){
  const staff = (S.hrStaff || []).filter(s => s.active !== false), yr = today().slice(0, 4), L = S._hrLv = S._hrLv || {type: "annual", from: today(), to: today()};
  const fS = S.hrLvF || "";
  const list = (S.hrLeaves || []).filter(l => !fS || l.staffId === fS).slice(0, 80), name = id => ((S.hrStaff || []).find(s => s.id === id) || {}).name || id;
  el.innerHTML = `${RO() ? "" : `<div class="card"><h2>تسجيل إجازة أو استئذان</h2>
      <div class="row"><label class="f grow" for="lvS">الموظف<select id="lvS"><option value="">— اختر —</option>${staff.map(s => `<option value="${esc(s.id)}" ${L.staffId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <label class="f" for="lvT" style="width:160px">النوع<select id="lvT">${Object.entries(LV_T).map(([k, v]) => `<option value="${k}" ${L.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f" for="lvF" style="width:160px">من<input type="date" id="lvF" value="${esc(L.from)}"></label><label class="f" for="lvTo" style="width:160px">إلى<input type="date" id="lvTo" value="${esc(L.to)}"></label></div>
      <label class="f" for="lvN">ملاحظة<input type="text" id="lvN" maxlength="200" placeholder="مثال: تقرير طبي من مستشفى…"></label>
      <div class="row" style="gap:8px;margin-top:6px"><span class="muted" id="lvInfo"></span><span class="grow"></span><button class="btn pri" id="lvSave">حفظ الإجازة</button></div>
      <p class="muted" style="margin:6px 0 0">الإجازة تنعكس لحالها في «الحضور والانصراف» والتقرير الشهري: ما تنحسب غياب، والإجازة «بدون راتب» تنخصم من الراتب.</p></div>`}
    <div class="card"><h2>أرصدة الإجازات · ${yr}</h2><div class="tbl"><table><thead><tr><th>الموظف</th><th>رصيد السنوية</th><th>المستخدم</th><th>المتبقي</th><th>مرضية</th><th>اضطرارية</th><th>بدون راتب</th></tr></thead><tbody>${staff.map(s => { const tot = Number(s.annual ?? 30), u = hrLeaveUsed(s, yr, "annual");
      return `<tr><td class="nm">${esc(s.name)}</td><td>${tot}</td><td>${u}</td><td${tot - u < 0 ? ` style="color:#B3261E;font-weight:700"` : ""}>${tot - u}</td><td>${hrLeaveUsed(s, yr, "sick")}</td><td>${hrLeaveUsed(s, yr, "emergency")}</td><td>${hrLeaveUsed(s, yr, "unpaid")}</td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">ما فيه موظفين</td></tr>`}</tbody></table></div></div>
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">سجل الإجازات</h2><select id="lvFil" style="width:auto"><option value="">كل الموظفين</option>${(S.hrStaff || []).map(s => `<option value="${esc(s.id)}" ${fS === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
      <div class="list" style="margin-top:8px">${list.map(l => `<div class="item" style="${l.void ? "opacity:.5" : ""}"><div class="grow"><b>${esc(name(l.staffId))}</b> · <span class="pill ${l.type === "unpaid" ? "a" : l.type === "sick" ? "l" : "e"}">${esc(LV_T[l.type] || l.type)}</span>${l.void ? ` <span class="pill a">ملغاة</span>` : ""}${l.req ? ` <span class="pill p">من طلب معتمد</span>` : ""}
        <div class="muted">${esc(l.from)}${l.to && l.to !== l.from ? ` → ${esc(l.to)}` : ""} · ${Number(l.days) || 0} يوم عمل${l.note ? " · " + esc(l.note) : ""}</div></div>${RO() || l.void ? "" : `<button class="btn sm danger" data-lvx="${esc(l.id)}">إلغاء</button>`}</div>`).join("") || `<div class="empty">ما فيه إجازات مسجّلة.</div>`}</div></div>`;
  $("#lvFil").onchange = e => { S.hrLvF = e.target.value; render(); };
  el.querySelectorAll("[data-lvx]").forEach(b => b.onclick = async () => { if (!confirm("إلغاء الإجازة؟ ترجع أيامها تنحسب حسب البصمة.")) return;
    try { await setDoc(ref("hrLeaves/" + b.dataset.lvx), {void: true, voidAt: new Date().toISOString(), voidBy: ROLES[S.adminRole] || S.adminRole}, {merge: true}); logAction("إلغاء إجازة موظف", name((S.hrLeaves.find(x => x.id === b.dataset.lvx) || {}).staffId)); } catch (x) { handleWriteErr(x); } });
  if (RO()) return;
  const info = () => { L.staffId = $("#lvS").value; L.type = $("#lvT").value; L.from = $("#lvF").value; L.to = $("#lvTo").value || L.from; const s = staff.find(x => x.id === L.staffId);
    if (!s || !L.from) return $("#lvInfo").textContent = "";
    const n = hrWorkDays(s, L.from, L.to), left = Number(s.annual ?? 30) - hrLeaveUsed(s, L.from.slice(0, 4), "annual");
    $("#lvInfo").textContent = `${n} يوم عمل${L.type === "annual" ? ` · المتبقي من السنوية بعدها: ${left - n}` : ""}`; };
  ["#lvS", "#lvT", "#lvF", "#lvTo"].forEach(x => $(x).onchange = info); info();
  $("#lvSave").onclick = async e => {
    info(); const s = staff.find(x => x.id === L.staffId); if (!s) return toast("اختر الموظف"); if (!L.from || L.to < L.from) return toast("التاريخ غير صحيح");
    if ((S.hrLeaves || []).some(l => l.staffId === s.id && !l.void && l.from <= L.to && (l.to || l.from) >= L.from)) return toast("عنده إجازة مسجّلة في نفس الفترة");
    const days = hrWorkDays(s, L.from, L.to);
    if (L.type === "annual" && days > Number(s.annual ?? 30) - hrLeaveUsed(s, L.from.slice(0, 4), "annual") && !confirm("الإجازة أكبر من الرصيد المتبقي. نكمل؟")) return;
    e.target.disabled = true;
    try { await setDoc(ref("hrLeaves/lv-" + uid() + uid()), {staffId: s.id, type: L.type, from: L.from, to: L.to, days, note: $("#lvN").value.trim().slice(0, 200), by: ROLES[S.adminRole] || S.adminRole, at: new Date().toISOString(), void: false});
      logAction("تسجيل إجازة موظف", `${s.name} · ${LV_T[L.type]} · ${L.from} → ${L.to}`); toast("انحفظت الإجازة ✓"); S._hrLv = null; render(); }
    catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
/* ready-made HR messages; {الاسم} {الدوام} {التاريخ} fill in per employee */
const HR_TPL_SIGN = () => "\n\nالموارد البشرية\n" + INST_AR;
const HR_TPL = [
  ["general", "تعميم عام", "تعميم", "السلام عليكم {الاسم}\n\n"],
  ["shift", "تعديل وقت الدوام", "تعديل وقت الدوام", "السلام عليكم {الاسم}\n\nنفيدكم بأن وقت الدوام ابتداءً من تاريخ ____ سيكون من الساعة ____ إلى الساعة ____.\n\nشاكرين التزامكم."],
  ["late", "تنبيه تأخير", "تنبيه تأخير", "السلام عليكم {الاسم}\n\nسُجّل عليك تأخير عن بداية الدوام بتاريخ {التاريخ}، ودوامك {الدوام}. نأمل الالتزام بوقت الحضور."],
  ["absent", "تنبيه غياب", "تنبيه غياب", "السلام عليكم {الاسم}\n\nسُجّل عليك غياب بتاريخ {التاريخ} بدون إشعار مسبق. نأمل تزويد الموارد البشرية بالعذر خلال يومين، وإلا يُحتسب غياباً بدون عذر."],
  ["fingerprint", "تذكير بالبصمة", "تذكير بالبصمة", "السلام عليكم {الاسم}\n\nنذكّرك بإثبات الحضور والانصراف بالبصمة يومياً، والأيام بدون بصمة تُحتسب غياباً."],
  ["warn1", "لفت نظر", "لفت نظر", "السلام عليكم {الاسم}\n\nنلفت نظرك إلى ____.\nنأمل الالتزام بأنظمة المعهد، وتكرار ذلك يترتب عليه إنذار رسمي."],
  ["warn2", "إنذار رسمي", "إنذار رسمي", "السلام عليكم {الاسم}\n\nنوجّه لك إنذاراً رسمياً بسبب ____، بعد لفت النظر السابق.\nتكرار المخالفة يترتب عليه الإجراء النظامي حسب لائحة تنظيم العمل."],
  ["leaveOk", "اعتماد إجازة", "اعتماد إجازة", "السلام عليكم {الاسم}\n\nنفيدك باعتماد إجازتك من تاريخ ____ إلى تاريخ ____، ومباشرتك بتاريخ ____.\n\nنتمنى لك إجازة سعيدة."],
  ["holiday", "إجازة رسمية", "إجازة رسمية", "السلام عليكم {الاسم}\n\nنفيدكم بأن إجازة ____ تبدأ من تاريخ ____ إلى تاريخ ____، والعودة للدوام بتاريخ ____.\n\nكل عام وأنتم بخير."],
  ["meeting", "دعوة اجتماع", "دعوة اجتماع", "السلام عليكم {الاسم}\n\nندعوكم لحضور اجتماع ____ يوم ____ الساعة ____ في ____.\n\nنأمل الحضور في الموعد."],
  ["papers", "تجديد العقد / الإقامة", "تجديد مستندات", "السلام عليكم {الاسم}\n\nنذكّرك بأن ____ ينتهي بتاريخ ____، نأمل تجديده وتزويد الموارد البشرية بنسخة قبل الموعد."],
  ["docs", "طلب مستندات", "طلب مستندات", "السلام عليكم {الاسم}\n\nنأمل تزويد الموارد البشرية بالمستندات التالية: ____ خلال ____ أيام."],
  ["salary", "إيداع الرواتب", "إيداع الرواتب", "السلام عليكم {الاسم}\n\nنفيدكم بأنه تم إيداع راتب شهر ____ في حساباتكم.\n\nشاكرين جهودكم."],
  ["thanks", "شكر وتقدير", "شكر وتقدير", "السلام عليكم {الاسم}\n\nيسعدنا أن نتقدم لك بالشكر والتقدير على ____، متمنين لك دوام التوفيق."],
  ["welcome", "ترحيب بموظف جديد", "ترحيب", "السلام عليكم {الاسم}\n\nيسعدنا انضمامك لفريق معهد أسس. دوامك {الدوام}، ونأمل تسجيل البصمة يومياً عند الحضور والانصراف.\n\nبالتوفيق."],
];
/* notices to the institute's employees: WhatsApp, one by one, with every notice kept */
function hrNoticeView(el){
  const staff = (S.hrStaff || []).filter(s => s.active !== false), N = S._hrNotice = S._hrNotice || {mode: "all", depts: [], ids: [], title: "", text: "السلام عليكم {الاسم}\n\n\n\nالموارد البشرية\n" + INST_AR};
  if (!S._hrNot) { S._hrNot = []; getDocs(collection(db, "hrNotices")).then(sn => { S._hrNot = sn.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (b.at || "").localeCompare(a.at || "")); if (S.hrTab === "notice") render(); }).catch(() => {}); }
  const Q = S._hrQ, depts = [...new Set(staff.map(s => s.dept || "بدون قسم"))].sort((a, b) => a.localeCompare(b, "ar"));
  const who = () => N.mode === "all" ? staff : N.mode === "dept" ? staff.filter(s => N.depts.includes(s.dept || "بدون قسم")) : staff.filter(s => N.ids.includes(s.id));
  if (Q) {
    el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">إرسال التعميم: ${esc(Q.title)}</h2><button class="btn sm" id="nqX">رجوع</button></div>
      <p class="muted">اضغط «واتساب» عند كل موظف، يفتح الرسالة جاهزة باسمه، وبعدها اضغط إرسال في الواتساب.</p>
      <div class="list">${Q.items.map((x, i) => `<div class="item"><span class="grow">${i + 1}. ${esc(x.name)} ${x.done ? `<span class="pill p">انفتح ✓</span>` : ""}</span>${x.url ? `<a class="btn sm ${x.done ? "" : "gold"}" href="${esc(x.url)}" target="_blank" rel="noopener" data-nq="${i}">واتساب</a>` : `<span class="muted">بدون جوال</span>`}</div>`).join("")}</div></div>`;
    $("#nqX").onclick = () => { S._hrQ = null; render(); };
    el.querySelectorAll("[data-nq]").forEach(a => a.onclick = () => setTimeout(() => { Q.items[+a.dataset.nq].done = true; render(); }, 300));
    return;
  }
  el.innerHTML = `${RO() ? "" : `<div class="card"><h2>تعميم جديد للموظفين</h2>
      <div class="row" style="gap:14px;flex-wrap:wrap">${[["all", "كل الموظفين"], ["dept", "قسم أو أكثر"], ["pick", "شخص أو أكثر بالاسم"]].map(([k, v]) => `<label class="row" style="gap:5px"><input type="radio" name="nM" value="${k}" ${N.mode === k ? "checked" : ""}> ${v}</label>`).join("")}</div>
      ${N.mode === "dept" ? `<div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px">${depts.map(d => `<label class="row" style="gap:4px"><input type="checkbox" data-nd="${esc(d)}" ${N.depts.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div>` : ""}
      ${N.mode === "pick" ? `<div class="list" style="max-height:200px;overflow:auto;margin-top:6px">${staff.map(s => `<label class="item" style="gap:8px;padding:6px 10px"><input type="checkbox" data-ni="${esc(s.id)}" ${N.ids.includes(s.id) ? "checked" : ""}><span class="grow">${esc(s.name)} <span class="muted">· ${esc(s.dept || "")}</span></span><span class="muted" dir="ltr">${esc(s.phone || "بدون جوال")}</span></label>`).join("")}</div>` : ""}
      <label class="f" for="nTpl" style="margin-top:8px">رسالة جاهزة<select id="nTpl"><option value="">— اختر رسالة جاهزة أو اكتب بنفسك —</option>${HR_TPL.map(([k, v]) => `<option value="${k}" ${N.tpl === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="f" for="nT">العنوان (للسجل)<input type="text" id="nT" maxlength="100" value="${esc(N.title)}" placeholder="مثال: تعديل وقت الدوام"></label>
      <label class="f" for="nX">نص الرسالة <span class="muted">(تقدر تكتب {الاسم} و{الدوام} و{التاريخ}، وعبّي الفراغات ____)</span><textarea id="nX" style="min-height:170px">${esc(N.text)}</textarea></label>
      <div class="row" style="gap:8px"><span class="muted" id="nInfo"></span><span class="grow"></span><button class="btn pri" id="nGo">حفظ وتجهيز الواتساب</button></div></div>`}
    <div class="card"><h2>التعاميم السابقة</h2><div class="list">${(S._hrNot || []).map(n => `<div class="item" style="align-items:flex-start"><div class="grow"><b>${esc(n.title)}</b><div class="muted">${esc(n.label || "")} · ${n.count || 0} موظف · ${esc(fmtIso(n.at))} · ${esc(n.by || "")}</div><details><summary class="muted" style="cursor:pointer">النص</summary><pre style="white-space:pre-wrap;font-family:inherit;margin:4px 0">${esc(n.text)}</pre></details></div>${RO() ? "" : `<button class="btn sm" data-nre="${esc(n.id)}">إرسال مرة ثانية</button>`}</div>`).join("") || `<div class="empty">ما فيه تعاميم للحين.</div>`}</div></div>`;
  const fill = (t, s) => t.replace(/\{التاريخ\}/g, greg(today())).replace(/\{الاسم\}/g, s.name || "").replace(/\{الدوام\}/g, (sh => `${fmtTime(sh.from)} إلى ${fmtTime(sh.to)}`)(hrSh(s)));
  const startQ = (title, text, L) => { S._hrQ = {title, items: L.map(s => ({id: s.id, name: s.name, url: hrWa(s, fill(text, s))}))}; render(); window.scrollTo(0, 0); };
  el.querySelectorAll("[data-nre]").forEach(b => b.onclick = () => { const n = S._hrNot.find(x => x.id === b.dataset.nre); startQ(n.title, n.text, (S.hrStaff || []).filter(s => (n.ids || []).includes(s.id))); });
  if (RO()) return;
  const sync = () => { N.title = $("#nT").value; N.text = $("#nX").value; };
  const info = () => { const L = who(); $("#nInfo").textContent = `${L.length} موظف · ${L.filter(s => s.phone).length} عندهم جوال`; };
  el.querySelectorAll('input[name="nM"]').forEach(r => r.onchange = () => { sync(); N.mode = r.value; render(); });
  $("#nTpl").onchange = e => { const t = HR_TPL.find(x => x[0] === e.target.value); if (!t) return; sync(); if (N.text.replace(/السلام عليكم|\{الاسم\}|الموارد البشرية|معهد أسس التقنية والقانون|\s/g, "").length > 3 && !confirm("تبدّل النص المكتوب بالرسالة الجاهزة؟")) { e.target.value = N.tpl || ""; return; }
    N.tpl = t[0]; N.title = t[2]; N.text = t[3] + HR_TPL_SIGN(); render(); };
  el.querySelectorAll("[data-nd]").forEach(c => c.onchange = () => { N.depts = c.checked ? [...N.depts, c.dataset.nd] : N.depts.filter(x => x !== c.dataset.nd); info(); });
  el.querySelectorAll("[data-ni]").forEach(c => c.onchange = () => { N.ids = c.checked ? [...N.ids, c.dataset.ni] : N.ids.filter(x => x !== c.dataset.ni); info(); });
  info();
  $("#nGo").onclick = async e => {
    sync(); const L = who(); if (!L.length) return toast("اختر الموظفين"); if (N.title.trim().length < 3) return toast("اكتب عنوان التعميم");
    if (/____/.test(N.text) && !confirm("فيه فراغات ____ ما تعبّت في النص. ترسل كذا؟")) return;
    e.target.disabled = true;
    const label = N.mode === "all" ? "كل الموظفين" : N.mode === "dept" ? "قسم: " + N.depts.join("، ") : "موظفين محددين";
    const d = {title: N.title.trim().slice(0, 100), text: N.text.slice(0, 3000), ids: L.map(s => s.id), label, count: L.length, at: new Date().toISOString(), by: ROLES[S.adminRole] || S.adminRole};
    try { await setDoc(ref("hrNotices/n-" + uid() + uid()), d); S._hrNot = null; logAction("تعميم للموظفين", `${d.title} → ${label} (${L.length})`); S._hrNotice = null; startQ(d.title, d.text, L); }
    catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
/* official holidays (no absence counted) and the payroll deduction rules */
function hrSetView(el){
  const C = S.hrCal || {holidays: []}, P = S.hrPay || {}, H = (C.holidays || []).slice().sort((a, b) => (b.from || "").localeCompare(a.from || ""));
  el.innerHTML = `<div class="card"><h2>العطل الرسمية</h2><p class="muted" style="margin-top:0">الأيام هذي ما تنحسب دوام لأي موظف: ما ينحسب فيها غياب، ولا تنخصم من رصيد الإجازات.</p>
      ${RO() ? "" : `<div class="row" style="align-items:end"><label class="f grow" for="hhL">المناسبة<input type="text" id="hhL" maxlength="60" placeholder="مثال: إجازة اليوم الوطني"></label><label class="f" for="hhF" style="width:160px">من<input type="date" id="hhF"></label><label class="f" for="hhT" style="width:160px">إلى<input type="date" id="hhT"></label><button class="btn pri" id="hhAdd">+ إضافة</button></div>`}
      <div class="list" style="margin-top:8px">${H.map((h, i) => `<div class="item"><span class="grow"><b>${esc(h.label)}</b> <span class="muted">· ${esc(h.from)}${h.to && h.to !== h.from ? ` → ${esc(h.to)}` : ""}</span></span>${RO() ? "" : `<button class="btn sm danger" data-hhx="${esc(h.from)}|${esc(h.label)}">حذف</button>`}</div>`).join("") || `<div class="empty">ما فيه عطل مسجّلة.</div>`}</div></div>
    <div class="card"><h2>وقت البصمة</h2>
      <label class="f" for="pyEarly" style="width:300px">يقدر الموظف يبصم قبل بداية دوامه بـ (دقيقة)<input type="number" id="pyEarly" min="0" max="180" value="${esc(P.earlyMin ?? 10)}" ${RO() ? "disabled" : ""}></label>
      <p class="muted" style="margin:4px 0 0">مثال: الدوام 8:00 والوقت 10 دقائق، فالبصمة تنحسب من 7:50. البصمة قبلها ما تنحسب حضور، ويطلع جنب الموظف «بصمة مبكرة ما انحسبت»، ويلزمه يبصم مرة ثانية بعد ما يفتح الوقت.</p>
      ${RO() ? "" : `<button class="btn pri" id="pyEarlySave" style="margin-top:8px">حفظ</button>`}</div>
    <div class="card"><h2>خصومات الرواتب</h2><p class="muted" style="margin-top:0">تُستخدم في «التقرير الشهري والرواتب». أجر اليوم = (الراتب الأساسي + البدلات) ÷ 30.</p>
      <label class="row" style="gap:6px;margin:6px 0"><input type="checkbox" id="pyAbs" ${P.absOff ? "" : "checked"} ${RO() ? "disabled" : ""}> خصم الغياب (يوم بيوم)</label>
      <label class="row" style="gap:6px;margin:6px 0"><input type="checkbox" id="pyLate" ${P.lateOn ? "checked" : ""} ${RO() ? "disabled" : ""}> خصم التأخير بالدقيقة</label>
      <label class="f" for="pyFree" style="width:260px">دقائق تأخير مسموحة في الشهر قبل الخصم<input type="number" id="pyFree" min="0" max="600" value="${esc(P.lateFree ?? 0)}" ${RO() ? "disabled" : ""}></label>
      <p class="muted" style="margin:4px 0 0">الإجازة «بدون راتب» تنخصم دائماً يوم بيوم. والمرضية والسنوية والاضطرارية ما تنخصم.</p>
      ${RO() ? "" : `<button class="btn pri" id="pySave" style="margin-top:8px">حفظ</button>`}</div>`;
  if (RO()) return;
  const saveH = async list => { try { await setDoc(ref("hrCfg/cal"), {holidays: list}, {merge: true}); logAction("العطل الرسمية للموظفين", `${list.length} عطلة`); } catch (x) { handleWriteErr(x); } };
  $("#hhAdd").onclick = () => { const label = $("#hhL").value.trim(), from = $("#hhF").value, to = $("#hhT").value || from; if (!label || !from) return toast("اكتب المناسبة وتاريخها"); if (to < from) return toast("التاريخ غير صحيح"); saveH([...(C.holidays || []), {label: label.slice(0, 60), from, to}]); };
  el.querySelectorAll("[data-hhx]").forEach(b => b.onclick = () => { const [f, l] = b.dataset.hhx.split("|"); saveH((C.holidays || []).filter(h => !(h.from === f && h.label === l))); });
  $("#pyEarlySave").onclick = async () => { try { await setDoc(ref("hrCfg/pay"), {earlyMin: Math.max(0, Math.min(180, Number($("#pyEarly").value) || 0))}, {merge: true}); logAction("وقت البصمة قبل الدوام", $("#pyEarly").value + " دقيقة"); toast("انحفظ"); } catch (x) { handleWriteErr(x); } };
  $("#pySave").onclick = async () => { try { await setDoc(ref("hrCfg/pay"), {absOff: !$("#pyAbs").checked, lateOn: $("#pyLate").checked, lateFree: Math.max(0, Number($("#pyFree").value) || 0)}, {merge: true}); logAction("خصومات الرواتب", ""); toast("انحفظ"); } catch (x) { handleWriteErr(x); } };
}
function hrRepRows(m){
  const days = []; const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  // absence only counts from the first day attendance was recorded at all (the clock was connected mid-month, or the system is new)
  const tracked = Object.keys(S.hrAtt || {}).filter(k => Object.keys((S.hrAtt[k] || {}).rec || {}).length).sort()[0] || "9999";
  const since = S.hrTrackFrom && S.hrTrackFrom < tracked ? S.hrTrackFrom : tracked;
  for (let i = 1; i <= last; i++) { const d = `${m}-${String(i).padStart(2, "0")}`; if (d <= today() && d >= since) days.push(d); }
  return (S.hrStaff || []).filter(s => s.active !== false || Object.values(S.hrAtt || {}).some(x => (x.rec || {})[s.id])).map(s => { const c = {work: 0, p: 0, l: 0, a: 0, v: 0, x: 0, late: 0, mins: 0, unpaid: 0};
    days.forEach(d => { if (!hrWorks(s, d)) return; c.work++; const r = (((S.hrAtt || {})[d] || {}).rec || {})[s.id], lv = hrLeaveOn(s.id, d);
      const st = lv ? (lv.type === "perm" ? "x" : "v") : r ? (r.st || hrAuto(s, r, d)) : "a"; c[st]++;
      if (lv && lv.type === "unpaid") c.unpaid++;
      if (st === "l") c.late += r.late ?? hrLateMin(s, r, d);
      const i = hm(r && r.in), o = hm(r && r.out); if (i !== null && o !== null && o > i) c.mins += o - i; });
    return {s, c, pay: hrPayCalc(s, c)}; });
}
/* deductions follow «العطل والخصومات»: a day's pay = (salary + allowances) / 30; a late minute = a day's pay / the shift's minutes */
function hrPayCalc(s, c){
  const P = S.hrPay || {}, sal = Number(s.salary) || 0, al = Number(s.allow) || 0, gross = sal + al;
  const sh = hrSh(s), mins = Math.max(60, (hm(sh.to) ?? 960) - (hm(sh.from) ?? 480)), day = gross / 30;
  const freeLate = Number(P.lateFree) || 0, lateMin = Math.max(0, c.late - freeLate);
  const absDed = P.absOff === true ? 0 : c.a * day, lateDed = P.lateOn ? lateMin * day / mins : 0, unpaidDed = c.unpaid * day;
  const r2 = v => Math.round(v * 100) / 100, ded = r2(absDed + lateDed + unpaidDed);
  return {sal, al, gross, absDed: r2(absDed), lateDed: r2(lateDed), unpaidDed: r2(unpaidDed), ded, net: r2(gross - ded)};
}
function hrRepView(el){
  const m = S.hrRepM || today().slice(0, 7); hrMonth(m);
  const rows = S.hrAtt ? hrRepRows(m) : null, anySal = (rows || []).some(r => r.pay.gross > 0);
  if (!S._hrPayDocs) { S._hrPayDocs = {}; getDocs(collection(db, "hrPayroll")).then(sn => { sn.docs.forEach(d => S._hrPayDocs[d.id] = d.data()); if (S.hrTab === "rep") render(); }).catch(() => {}); }
  const sent = (S._hrPayDocs || {})[m];
  el.innerHTML = `<div class="card"><div class="row" style="align-items:end;gap:8px;flex-wrap:wrap"><label class="f" for="hrM" style="width:170px">الشهر<input type="month" id="hrM" value="${m}"></label><span class="grow"></span><button class="btn sm" id="hrXls">Excel</button><button class="btn sm" id="hrPrt">طباعة</button>${anySal && !RO() ? `<button class="btn gold" id="hrPaySend">${sent ? "تحديث كشف الرواتب عند المالية" : "إرسال كشف الرواتب للمالية"}</button>` : ""}</div>
    ${sent ? `<p class="muted" style="margin:6px 0 0">كشف ${esc(m)} عند المالية: <span class="pill ${sent.status === "paid" ? "p" : "l"}">${sent.status === "paid" ? "انصرف ✓" : "بانتظار الصرف"}</span> · أُرسل ${esc(fmtIso(sent.at))}</p>` : ""}
    ${(() => { const t = Object.keys(S.hrAtt || {}).filter(k => Object.keys((S.hrAtt[k] || {}).rec || {}).length).sort()[0]; return t && t > m + "-01" ? `<p class="muted" style="margin:6px 0 0">الحساب يبدأ من ${esc(t)} (أول يوم وصل فيه حضور هالشهر)، والأيام قبله ما تنحسب غياب.</p>` : ""; })()}
    ${!anySal ? `<p class="muted" style="margin:6px 0 0">عشان يطلع كشف الرواتب: اكتب الراتب والبدلات لكل موظف في «الموظفين» ← تعديل.</p>` : ""}</div>
  <div class="card">${!rows ? `<p class="muted">جاري التحميل…</p>` : `<div class="tbl"><table><thead><tr><th>الموظف</th><th>أيام الدوام</th><th>حاضر</th><th>متأخر</th><th>دقائق التأخير</th><th>غائب</th><th>إجازة</th><th>بدون راتب</th><th>مستأذن</th><th>ساعات العمل</th>${anySal ? `<th>الإجمالي</th><th>الخصم</th><th>الصافي</th>` : ""}</tr></thead><tbody>${rows.map(({s, c, pay}) => `<tr><td style="text-align:right">${esc(s.name)}</td><td>${c.work}</td><td>${c.p}</td><td>${c.l}</td><td>${c.late}</td><td${c.a ? ` style="color:#B3261E;font-weight:700"` : ""}>${c.a}</td><td>${c.v}</td><td>${c.unpaid}</td><td>${c.x}</td><td>${(c.mins / 60).toFixed(1)}</td>${anySal ? `<td>${SAR(pay.gross)}</td><td title="غياب ${SAR(pay.absDed)} · تأخير ${SAR(pay.lateDed)} · بدون راتب ${SAR(pay.unpaidDed)}"${pay.ded ? ` style="color:#B3261E"` : ""}>${SAR(pay.ded)}</td><td><b>${SAR(pay.net)}</b></td>` : ""}</tr>`).join("")}</tbody></table></div>
    ${anySal ? `<p class="muted" style="margin:8px 0 0">طريقة الخصم من «العطل والخصومات»: أجر اليوم = (الراتب + البدلات) ÷ 30${(S.hrPay || {}).absOff ? "، الغياب بدون خصم" : "، الغياب يوم بيوم"}${(S.hrPay || {}).lateOn ? `، التأخير بالدقيقة${Number((S.hrPay || {}).lateFree) ? ` بعد ${Number(S.hrPay.lateFree)} دقيقة سماح في الشهر` : ""}` : "، التأخير بدون خصم"}، والإجازة بدون راتب يوم بيوم. وقف على الخصم تشوف تفاصيله.</p>` : ""}`}</div>`;
  $("#hrM").onchange = e => { S.hrRepM = e.target.value || today().slice(0, 7); render(); };
  const data = () => (rows || []).map(({s, c, pay}) => [s.name, s.job || "", c.work, c.p, c.l, c.late, c.a, c.v, c.unpaid, c.x, +(c.mins / 60).toFixed(1), ...(anySal ? [pay.gross, pay.absDed, pay.lateDed, pay.unpaidDed, pay.net] : [])]);
  const head = ["الموظف", "الوظيفة", "أيام الدوام", "حاضر", "متأخر", "دقائق التأخير", "غائب", "إجازة", "بدون راتب", "مستأذن", "ساعات العمل", ...(anySal ? ["الإجمالي", "خصم الغياب", "خصم التأخير", "خصم بدون راتب", "الصافي"] : [])];
  $("#hrXls").onclick = () => rows && excelDownload(`حضور الموظفين ${m}`, [{title: m, rows: [[INST_AR], [`تقرير حضور الموظفين${anySal ? " والرواتب" : ""} · ${m}`], [], head, ...data()], widths: [26, 18, 10, 8, 8, 12, 8, 8, 10, 8, 10, 12, 12, 12, 12, 12]}]);
  $("#hrPrt").onclick = () => { if (!rows) return; const w = openPrint(); if (!w) return; fillPrint(w, `حضور الموظفين ${m}`, [{html: `<h1>تقرير حضور الموظفين${anySal ? " والرواتب" : ""} · ${esc(m)}</h1><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${data().map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ` class="n"` : ""}>${esc(typeof c === "number" && i > 10 ? SAR(c) : c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`}]); };
  if ($("#hrPaySend")) $("#hrPaySend").onclick = async e => {
    if (m >= today().slice(0, 7) && !confirm("الشهر للحين ما خلص. ترسل الكشف بالأرقام اللي لحد اليوم؟ (تقدر تحدّثه بعدين)")) return;
    e.target.disabled = true;
    const list = rows.filter(r => r.pay.gross > 0).map(({s, c, pay}) => ({id: s.id, name: s.name, job: s.job || "", dept: s.dept || "", absent: c.a, lateMin: c.late, unpaid: c.unpaid, ...pay}));
    const doc = {month: m, rows: list, total: Math.round(list.reduce((a, r) => a + r.net, 0) * 100) / 100, count: list.length, at: new Date().toISOString(), by: ROLES[S.adminRole] || S.adminRole, status: "sent"};
    try { await setDoc(ref("hrPayroll/" + m), doc); S._hrPayDocs[m] = doc; notify("payroll", m); logAction("كشف رواتب الموظفين للمالية", `${m} · ${list.length} موظف · ${SAR(doc.total)}`); toast("وصل الكشف للمالية ✓"); render(); }
    catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}

/* ---------- معسكر الأمن السيبراني: شعبة تدريبية داخل البوابة — منهج + مقاطع فيديو + دليل + اختبار نظري ----------
   camp/config: { enabled, intro, guideUrl, lessons:[{id,week,title,type,url,dur,desc}] }
   الاختبار النظري يُنشأ كـ exams/cyber-theory (gid="camp") فيظهر للطلاب تلقائياً في تبويب الاختبارات */
const CAMP_WEEKS = [
  [1, "مدخل الأمن السيبراني وبناء المختبر", "مبادئ CIA، أنواع المهاجمين، الأخلاقيات، تثبيت بيئة المختبر المعزولة", 70],
  [2, "لينكس والشبكات", "سطر أوامر لينكس، الصلاحيات، TCP/IP وOSI، المنافذ والخدمات", 75],
  [3, "الويب من الداخل والبرمجة النصية", "HTTP/HTTPS، DNS، إعداد Burp Suite، أساسيات Python وBash", 75],
  [4, "الاستطلاع وجمع المعلومات", "OSINT، الفحص بـ nmap، التعداد، رسم سطح الهجوم", 80],
  [5, "ثغرات الحقن — SQL وCommand Injection", "اكتشاف واستغلال وترقيع الحقن على DVWA", 80],
  [6, "XSS وCSRF", "البرمجة عبر المواقع وتزوير الطلب: الهجوم والدفاع", 80],
  [7, "المصادقة والصلاحيات ورفع الملفات", "كسر المصادقة، IDOR، تجاوز الصلاحيات، رفع الملفات الخبيثة", 80],
  [8, "ثغرات متقدمة", "SSRF، XXE، كشف البيانات، سوء الإعداد الأمني", 75],
  [9, "اختراق الشبكات والأنظمة", "Metasploit، تصعيد الصلاحيات، ما بعد الاستغلال في المختبر", 80],
  [10, "مواضيع متخصّصة (محاكاة مختبرية)", "Active Directory، أمن الواي فاي، أمن إنترنت الأشياء/الكاميرات، مقدمة تحليل البرمجيات الخبيثة", 70],
  [11, "الفريق الأزرق والدفاع", "التحصين، التسجيل والمراقبة، SIEM، الاستجابة للحوادث، الكود الآمن", 70],
  [12, "المشروع الختامي والاختبار", "شبكة شركة وهمية: اختراق + تحصين + تقرير فني + الاختبار النهائي", 90]
];
/* الاختبار النظري — كله تلقائي التصحيح (اختيار وصح/خطأ) */
const CAMP_EXAM = {
  title: "الاختبار النظري — معسكر الأمن السيبراني", mins: 30,
  qs: [
    {id: "c1", t: "mc", q: "أي مبدأ من مثلث أمن المعلومات (CIA) يُنتهك عند تسريب بيانات العملاء؟", p: 1, o: ["السرية Confidentiality", "السلامة Integrity", "التوافر Availability", "عدم الإنكار"], k: 0},
    {id: "c2", t: "mc", q: "ما أول مرحلة في منهجية البحث عن الثغرة؟", p: 1, o: ["الاستغلال", "الاستطلاع وجمع المعلومات", "كتابة التقرير", "الترقيع"], k: 1},
    {id: "c3", t: "mc", q: "أي الدفاعات أقوى ضد حقن SQL؟", p: 1, o: ["إخفاء رسائل الخطأ", "منع علامة الاقتباس فقط", "الاستعلامات المُعاملة (Prepared Statements)", "تغيير اسم الجدول"], k: 2},
    {id: "c4", t: "tf", q: "خاصية HttpOnly للكوكي تمنع جافاسكربت من قراءتها، فتقلّل أثر ثغرة XSS.", p: 1, k: true},
    {id: "c5", t: "mc", q: "ثغرة IDOR تنتمي لعائلة:", p: 1, o: ["التحكم بالصلاحيات (Access Control)", "التشفير", "سوء الإعداد", "الحقن"], k: 0},
    {id: "c6", t: "tf", q: "يجوز تجربة أدوات الاختراق على أي موقع حقيقي طالما النية التعلّم.", p: 1, k: false},
    {id: "c7", t: "mc", q: "أفضل دفاع ضد رفع الملفات الخبيثة:", p: 1, o: ["فحص امتداد الاسم فقط", "التحقق من المحتوى الحقيقي وإعادة التسمية والتخزين خارج جذر الويب ومنع التنفيذ", "تصغير حجم الصورة", "منع الصور فقط"], k: 1},
    {id: "c8", t: "mc", q: "ثغرة SSRF تسمح للمهاجم بأن:", p: 1, o: ["يسرق كوكي الضحية", "يجبر الخادم على طلب خدمات داخلية", "يكسر التشفير", "يعطّل الموقع فقط"], k: 1},
    {id: "c9", t: "tf", q: "رمز CSRF الفريد لكل جلسة وخاصية SameSite يدافعان عن ثغرة تزوير الطلب.", p: 1, k: true},
    {id: "c10", t: "mc", q: "ما الذي يجب أن يتضمنه التقرير الفني لكل ثغرة؟", p: 1, o: ["الوصف والخطورة وخطوات الإعادة والدليل والتوصية", "اسم المهاجم فقط", "رأي شخصي", "إعلان تسويقي"], k: 0},
    {id: "c11", t: "tf", q: "مبدأ «أقل صلاحية» يقلّل الضرر إذا اختُرق حساب أو خدمة.", p: 1, k: true},
    {id: "c12", t: "mc", q: "الفحص اليدوي ضروري لأن:", p: 1, o: ["الماسحات الآلية تكتشف كل شيء", "الماسحات قد تفوّت ثغرات منطقية وتعطي إيجابيات كاذبة", "لا فائدة من الأدوات", "يمنعه النظام"], k: 1}
  ]
};
const CAMP_EID = "cyber-theory";
function watchCamp(){
  if (S._campOn) return; S._campOn = true;
  S.subs.push(onSnapshot(ref("camp/config"), snap => { S.camp = snap.exists() ? snap.data() : {enabled: false, lessons: []}; if (!busyEditing()) render(); }, () => { S.camp = {enabled: false, lessons: []}; }));
}
const campOn = () => S.camp && S.camp.enabled;
const ytId = u => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/.exec(u || ""); return m ? m[1] : ""; };
function campPlayer(url){
  const y = ytId(url);
  if (y) return `<iframe style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px" src="https://www.youtube.com/embed/${esc(y)}" allowfullscreen loading="lazy"></iframe>`;
  if (/\.(mp4|webm|ogg|m4v)(\?|$)/i.test(url)) return `<video controls style="width:100%;border-radius:10px" src="${esc(url)}"></video>`;
  return `<a class="btn pri" href="${esc(url)}" target="_blank" rel="noopener">فتح المقطع ↗</a>`;
}
function campLessonsByWeek(){ const by = {}; ((S.camp || {}).lessons || []).forEach(l => (by[l.week || 0] = by[l.week || 0] || []).push(l)); return by; }

/* ---- بوابة الطالب: تبويب المعسكر ---- */
function studentCamp(el){
  const c = S.camp || {}, by = campLessonsByWeek();
  const ex = (S.myExams || []).find(e => e.id === CAMP_EID && e.status !== "draft"), sub = ex && (S.mySubs || {})[CAMP_EID];
  el.innerHTML = `<div class="card" style="background:linear-gradient(135deg,#17352a,#0f251c);color:#fff;border:0">
      <div style="display:flex;align-items:center;gap:10px"><span style="font-size:26px">🛡️</span><div><h2 style="margin:0;color:#fff">معسكر الأمن السيبراني الاحترافي</h2><div style="color:#cfe0d6;font-size:13px">برنامج مكثّف ٣ أشهر · ٧٥٪ تطبيقي · من المبتدئ إلى الاحتراف</div></div></div>
      ${c.intro ? `<p style="color:#e6efe9;margin:12px 0 0;white-space:pre-wrap">${esc(c.intro)}</p>` : ""}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${validLink(c.guideUrl) ? `<a class="btn gold" style="display:inline-block;text-decoration:none" href="${esc(c.guideUrl)}" target="_blank" rel="noopener">📖 افتح دليل المعسكر الكامل</a>` : ""}
        <a class="btn" style="display:inline-block;text-decoration:none;background:#b3303c;color:#fff;border:0" href="${esc(labLink(c))}" target="_blank" rel="noopener">🧪 ادخل المختبر التفاعلي</a>
      </div>
    </div>
    ${ex ? `<div class="card" style="border:1px solid var(--gold)"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b>${esc(ex.title)}</b><div class="muted">${(ex.nq || 0)} سؤال · ${ex.mins} دقيقة · ${exState(ex, Date.now(), S.myNum) === "open" ? "متاح الآن" : exState(ex, Date.now(), S.myNum) === "soon" ? "يفتح " + esc(fmtDT(tsMs(ex.start))) : "مقفل"}</div></div>
      ${sub && sub.done ? `<span class="pill p">سلّمت${ex.resultsOut && sub.graded ? ` · ${sub.score}/${ex.total}` : ""}</span>` : `<button class="btn pri" id="campGoExam">${sub ? "كمّل الاختبار" : "ابدأ الاختبار النظري"}</button>`}</div></div>` : ""}
    <div class="card"><h2 style="margin:0 0 4px">المنهج · ١٢ أسبوعاً</h2><p class="muted" style="margin:0 0 10px">كل أسبوع فيه نظري وتطبيقي. التطبيق كله على مختبر معزول قانوني. المقاطع تظهر تحت كل أسبوع لما يرفعها المدرب.</p>
      <div class="list">${CAMP_WEEKS.map(([n, t, d, pr]) => { const vids = by[n] || []; return `<details class="wk" style="border:1px solid var(--line);border-radius:12px;margin:8px 0;background:var(--card)">
        <summary style="list-style:none;cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:10px"><span class="pill g" style="min-width:34px;text-align:center">${n}</span><span class="grow"><b>${esc(t)}</b><div class="muted" style="font-size:12.5px">${esc(d)}</div></span>${vids.length ? `<span class="pill b">▶ ${vids.length}</span>` : ""}<span class="pill gold">تطبيقي ${pr}٪</span></summary>
        <div style="padding:0 14px 14px">${vids.length ? vids.map(v => `<div style="margin:10px 0"><b>${v.type === "read" ? "📄" : "▶"} ${esc(v.title)}</b>${v.dur ? ` <span class="muted">· ${esc(v.dur)}</span>` : ""}${v.desc ? `<div class="muted" style="font-size:12.5px;margin:2px 0 6px">${esc(v.desc)}</div>` : ""}${v.type === "read" ? (validLink(v.url) ? `<a class="btn sm" href="${esc(v.url)}" target="_blank" rel="noopener">فتح</a>` : "") : campPlayer(v.url)}</div>`).join("") : `<p class="muted" style="margin:8px 0">ما نُزّلت مقاطع لهذا الأسبوع بعد.</p>`}</div></details>`; }).join("")}</div></div>`;
  if ($("#campGoExam")) $("#campGoExam").onclick = () => { S.sTab = "exams"; S.exTake = CAMP_EID; render(); window.scrollTo(0, 0); };
}

/* ---- بوابة الإدارة: إدارة المعسكر ---- */
function campTab(el){
  const c = S.camp || {enabled: false, lessons: []}, ed = S._campLes;
  const examLive = S.campExam;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">معسكر الأمن السيبراني</h2>
      <label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="campEn" ${c.enabled ? "checked" : ""}> <b>${c.enabled ? "ظاهر للطلاب" : "مخفي"}</b></label></div>
    <p class="muted" style="margin:8px 0 0">لما تفعّله يظهر للطلاب تبويب «معسكر الأمن السيبراني» تلقائياً فيه المنهج والمقاطع والدليل والاختبار.</p></div>
  <div class="card"><h3 style="margin-top:0">مقدمة ورابط الدليل</h3>
    <label class="f" for="campIntro">نبذة تظهر للطلاب<textarea id="campIntro" style="min-height:70px">${esc(c.intro || "")}</textarea></label>
    <label class="f" for="campGuide">رابط دليل المعسكر (الصفحة التفاعلية)<input type="url" id="campGuide" dir="ltr" value="${esc(c.guideUrl || "")}" placeholder="https://..."></label>
    <div class="row" style="gap:6px;margin:4px 0 10px;flex-wrap:wrap"><a class="btn" style="text-decoration:none;background:#b3303c;color:#fff;border:0" href="${esc(labLink(c))}" target="_blank" rel="noopener">🧪 افتح المختبر</a><a class="btn gold" style="text-decoration:none" href="${esc(labLink(c, true))}" target="_blank" rel="noopener">📊 لوحة متابعة المختبر والسيناريو</a></div>
    <label class="f" for="campLab">رابط المختبر (اختياري — اتركه فاضي ويشتغل تلقائياً)<input type="url" id="campLab" dir="ltr" value="${esc(c.labUrl || "")}" placeholder="تلقائي: lab.html بجانب البوابة"></label>
    <button class="btn pri" id="campSaveTop">حفظ</button></div>
  <div class="card"><h3 style="margin-top:0">${ed ? (ed.id ? "تعديل مقطع" : "إضافة مقطع / درس") : "إضافة مقطع / درس"}</h3>
    <div class="row"><label class="f" for="lesWk" style="width:120px">الأسبوع<select id="lesWk">${CAMP_WEEKS.map(([n, t]) => `<option value="${n}" ${ed && ed.week === n ? "selected" : ""}>${n} · ${esc(t.slice(0, 18))}</option>`).join("")}</select></label>
      <label class="f" for="lesType" style="width:130px">النوع<select id="lesType"><option value="video" ${!ed || ed.type !== "read" ? "selected" : ""}>مقطع فيديو</option><option value="read" ${ed && ed.type === "read" ? "selected" : ""}>مادة للقراءة</option></select></label>
      <label class="f grow" for="lesTitle">العنوان<input type="text" id="lesTitle" value="${esc(ed ? ed.title || "" : "")}" placeholder="مثال: شرح حقن SQL عملي"></label>
      <label class="f" for="lesDur" style="width:110px">المدة<input type="text" id="lesDur" value="${esc(ed ? ed.dur || "" : "")}" placeholder="12:30"></label></div>
    <label class="f" for="lesUrl">الرابط (يوتيوب أو رابط مباشر mp4)<input type="url" id="lesUrl" dir="ltr" value="${esc(ed ? ed.url || "" : "")}" placeholder="https://youtu.be/..."></label>
    <label class="f" for="lesDesc">وصف مختصر (اختياري)<input type="text" id="lesDesc" value="${esc(ed ? ed.desc || "" : "")}"></label>
    <div class="row" style="gap:6px"><button class="btn pri" id="lesSave">${ed && ed.id ? "حفظ المقطع" : "+ إضافة"}</button>${ed ? `<button class="btn" id="lesCancel">إلغاء</button>` : ""}</div></div>
  <div class="card"><h3 style="margin-top:0">المقاطع المرفوعة (${(c.lessons || []).length})</h3>
    <div class="list">${(c.lessons || []).slice().sort((a, b) => (a.week - b.week) || 0).map(l => `<div class="item"><div class="grow"><b>${l.type === "read" ? "📄" : "▶"} ${esc(l.title)}</b> <span class="pill g">أسبوع ${l.week}</span>${l.dur ? ` <span class="muted">${esc(l.dur)}</span>` : ""}<div class="muted" style="font-size:12px;direction:ltr;text-align:right">${esc((l.url || "").slice(0, 60))}</div></div><button class="btn sm" data-lese="${esc(l.id)}">تعديل</button><button class="btn sm danger" data-lesd="${esc(l.id)}">حذف</button></div>`).join("") || `<div class="card empty">ما فيه مقاطع بعد. أضف أول مقطع من فوق.</div>`}</div></div>
  <div class="card"><h3 style="margin-top:0">الاختبار النظري</h3>
    <p class="muted" style="margin-top:0">اختبار من ${CAMP_EXAM.qs.length} أسئلة يتصحّح تلقائياً. لما تصدره ينزل لكل الطلاب في تبويب «الاختبارات» وتبويب المعسكر.</p>
    ${examLive ? `<div class="notice">الاختبار منشور · ${examLive.memberNums ? examLive.memberNums.length : 0} طالب · <b>${examLive.resultsOut ? "النتائج ظاهرة" : "النتائج مخفية"}</b></div>
      <div class="row" style="gap:6px"><button class="btn pri" id="campExRefresh">تحديث قائمة الطلاب</button><button class="btn ${examLive.resultsOut ? "" : "gold"}" id="campExOut">${examLive.resultsOut ? "إخفاء النتائج" : "إظهار النتائج للطلاب"}</button><button class="btn" id="campExRes">النتائج</button><button class="btn danger" id="campExDel">سحب الاختبار</button></div>` : `<button class="btn gold" id="campExMake">📝 إصدار الاختبار النظري للطلاب</button>`}
    <div id="campResBox"></div></div>`;
  $("#campEn").onchange = async e => { try { await setDoc(ref("camp/config"), {enabled: e.target.checked}, {merge: true}); logAction("المعسكر", e.target.checked ? "تفعيل" : "إخفاء"); toast(e.target.checked ? "ظهر للطلاب" : "انخفى"); } catch (x) { handleWriteErr(x); e.target.checked = !e.target.checked; } };
  $("#campSaveTop").onclick = async () => { const g = $("#campGuide").value.trim(); const lb = $("#campLab").value.trim(); if (g && !validLink(g)) return toast("رابط الدليل لازم يبدأ بـ https://"); if (lb && !validLink(lb)) return toast("رابط المختبر لازم يبدأ بـ https://"); try { await setDoc(ref("camp/config"), {intro: $("#campIntro").value.trim().slice(0, 1500), guideUrl: g, labUrl: lb}, {merge: true}); logAction("المعسكر", "تعديل المقدمة"); toast("انحفظ"); } catch (x) { handleWriteErr(x); } };
  $("#lesSave").onclick = async () => {
    const url = $("#lesUrl").value.trim(); if (!$("#lesTitle").value.trim()) return toast("اكتب عنوان المقطع"); if (!validLink(url)) return toast("حط رابط صحيح يبدأ بـ https://");
    const les = {id: ed && ed.id ? ed.id : "L" + Date.now().toString(36), week: Number($("#lesWk").value), type: $("#lesType").value, title: $("#lesTitle").value.trim().slice(0, 140), url: url.slice(0, 400), dur: $("#lesDur").value.trim().slice(0, 20), desc: $("#lesDesc").value.trim().slice(0, 200)};
    const list = (c.lessons || []).filter(x => x.id !== les.id); list.push(les);
    try { await setDoc(ref("camp/config"), {lessons: list}, {merge: true}); logAction("المعسكر", "مقطع: " + les.title); S._campLes = null; toast("انحفظ"); render(); } catch (x) { handleWriteErr(x); }
  };
  if ($("#lesCancel")) $("#lesCancel").onclick = () => { S._campLes = null; render(); };
  el.querySelectorAll("[data-lese]").forEach(b => b.onclick = () => { S._campLes = {...(c.lessons || []).find(l => l.id === b.dataset.lese)}; render(); window.scrollTo(0, 0); });
  el.querySelectorAll("[data-lesd]").forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } try { await setDoc(ref("camp/config"), {lessons: (c.lessons || []).filter(l => l.id !== b.dataset.lesd)}, {merge: true}); logAction("المعسكر", "حذف مقطع"); render(); } catch (x) { handleWriteErr(x); } });
  if ($("#campExMake")) $("#campExMake").onclick = () => campMakeExam();
  if ($("#campExRefresh")) $("#campExRefresh").onclick = () => campMakeExam(true);
  if ($("#campExDel")) $("#campExDel").onclick = async b => { if (!b.target.dataset.sure) { b.target.dataset.sure = 1; b.target.textContent = "متأكد؟ ينسحب من الطلاب"; return; } try { const w = writeBatch(db); w.delete(ref("exams/" + CAMP_EID)); w.delete(ref("examQs/" + CAMP_EID)); w.delete(ref("examKeys/" + CAMP_EID)); await w.commit(); logAction("المعسكر", "سحب الاختبار"); toast("انسحب"); } catch (x) { handleWriteErr(x); } };
  if ($("#campExOut")) $("#campExOut").onclick = async () => { try { await setDoc(ref("exams/" + CAMP_EID), {resultsOut: !examLive.resultsOut}, {merge: true}); if (!examLive.resultsOut) notify("examres", CAMP_EID); toast(examLive.resultsOut ? "انخفت" : "ظهرت للطلاب"); } catch (x) { handleWriteErr(x); } };
  if ($("#campExRes")) $("#campExRes").onclick = () => campResults($("#campResBox"));
}
async function campMakeExam(refresh){
  const nums = Object.keys(S.students || {}); if (!nums.length) return toast("ما فيه طلاب مسجلين بعد");
  const now = Date.now(), qs = CAMP_EXAM.qs.map(q => ({id: q.id, t: q.t, q: q.q, p: q.p, ...(q.t === "mc" ? {o: q.o} : {})})), ans = {}; CAMP_EXAM.qs.forEach(q => ans[q.id] = q.k);
  const prev = S.campExam;
  const ex = {gid: "camp", tid: "", course: "معسكر الأمن السيبراني", title: CAMP_EXAM.title, mins: CAMP_EXAM.mins, start: Timestamp.fromMillis(prev ? tsMs(prev.start) : now), end: Timestamp.fromMillis(now + 180 * 864e5), shuffle: true, nq: qs.length, total: qs.reduce((a, q) => a + q.p, 0), status: "open", memberNums: nums, resultsOut: prev ? !!prev.resultsOut : false, updatedAt: new Date().toISOString(), by: S.adminRole};
  try { const b = writeBatch(db); b.set(ref("exams/" + CAMP_EID), ex); b.set(ref("examQs/" + CAMP_EID), {gid: "camp", tid: "", qs}); b.set(ref("examKeys/" + CAMP_EID), {gid: "camp", tid: "", ans}); await b.commit(); if (!prev) notify("exam", CAMP_EID); logAction("المعسكر", refresh ? "تحديث طلاب الاختبار" : "إصدار الاختبار النظري"); toast(refresh ? `تحدّثت القائمة (${nums.length} طالب)` : `انصدر الاختبار لـ ${nums.length} طالب`); render(); }
  catch (x) { handleWriteErr(x); }
}
function campResults(box){
  if (!box) return; box.innerHTML = `<p class="muted">جاري التحميل…</p>`;
  Promise.all([getDocs(query(collection(db, "examSubs"), where("eid", "==", CAMP_EID))), getDoc(ref("examKeys/" + CAMP_EID))]).then(([snap, k]) => {
    const key = k.exists() ? k.data().ans : {}, subs = snap.docs.map(d => d.data()), byNum = {}; subs.forEach(s => byNum[s.num] = s);
    const rows = Object.keys(S.students || {}).sort().map(n => { const s = byNum[n]; const sc = s ? exAuto({qs: CAMP_EXAM.qs}, key, s.ans) : null; return [n, (S.students[n] || {}).name || "", s ? (s.done ? "سلّم" : "ما سلّم") : "ما دخل", s ? sc : "—", CAMP_EXAM.qs.length]; });
    box.innerHTML = `<div class="row" style="justify-content:space-between;margin-top:12px"><b>النتائج (${subs.filter(s => s.done).length} سلّموا)</b><button class="btn sm" id="campXls">Excel</button></div>
      <div class="tbl" style="margin-top:8px"><table><thead><tr><th>الرقم</th><th>الاسم</th><th>الحالة</th><th>الدرجة</th><th>من</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td style="text-align:right">${esc(r[1])}</td><td>${r[2]}</td><td><b>${r[3]}</b></td><td>${r[4]}</td></tr>`).join("")}</tbody></table></div>`;
    $("#campXls").onclick = () => excelDownload("نتائج اختبار المعسكر", [{title: "النتائج", rows: [[INST_AR], ["الاختبار النظري — معسكر الأمن السيبراني"], [], ["الرقم", "الاسم", "الحالة", "الدرجة", "من"], ...rows], widths: [12, 26, 10, 8, 6]}]);
  }).catch(x => { console.error(x); box.innerHTML = `<p class="muted">تعذّر تحميل النتائج</p>`; });
}

/* ---------- student portal ---------- */
const EVAL_Q = ["وضوح شرح المدرب", "التزام المدرب بالوقت", "تفاعل المدرب مع الطلاب", "فائدة محتوى المقرر", "رضاك العام عن المقرر"];
const EXC_ST = {pending: "قيد المراجعة", accepted: "مقبول", rejected: "مرفوض"};
const EXC_PILL = {pending: "l", accepted: "p", rejected: "a"};
function studentTabs(){
  const open = Object.values(S.groups).filter(g => g.evalOpen && !(S.myEvals || []).some(e => e.groupId === g.id)).length;
  const tabs = [["home", "الرئيسية"], ...(campOn() ? [["camp", "🛡️ معسكر الأمن السيبراني"]] : []), ["msgs", "📨 رسائلي" + (unreadMsgs().length ? ` (${unreadMsgs().length})` : "")], ...(S.cfMenu ? [["coffee", "☕ كوفي دوفي" + ((S.cfMine || []).some(r => r.status === "ready") ? " (جاهز)" : "")]] : []), ["card", "بطاقتي"], ["att", "حضوري"], ["exams", "الاختبارات" + ((S.myExams || []).some(e => exState(e, Date.now(), S.myNum) === "open" && !(S.mySubs || {})[e.id]) ? " (1)" : "")], ["exc", "الأعذار"], ["warn", "الإنذارات" + ((S.myWarn || []).length ? ` (${S.myWarn.length})` : "")], ["eval", "التقييم" + (open ? ` (${open})` : "")], ["areq", "طلبات الأكاديمية" + ((S.myAReq || []).some(r => r.status === "done" && r.reply && !r.seen) ? " (1)" : "")], ...(finShown() ? [["freq", "المالية والدفع" + ((S.myFReq || []).some(r => r.type === "invoice" && r.status === "approved" && !r.seen) ? " (1)" : "")]] : []), ...(S.survey && S.survey.open ? [["survey", "الاستبيان" + (S.surveyDone === S.survey.id ? "" : " (1)")]] : [])];
  return `<div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${tabs.map(([k, v]) => `<button class="tab ${(S.sTab || "home") === k ? "on" : ""}" data-stab="${k}">${v}</button>`).join("")}</div></div>`;
}
function bindStudentTabs(app){ app.querySelectorAll("[data-stab]").forEach(b => b.onclick = () => { S.sTab = b.dataset.stab; render(); window.scrollTo(0, 0); }); }
function myCourseStats(){
  return Object.values(S.groups).sort((a,b) => (a.course||"").localeCompare(b.course||"","ar")).map(g => {
    const entry = (g.students || []).find(s => s.sid === S.myNum);
    const docs = countable(S.myAtt.filter(d => d.groupId === g.id)).sort((a, b) => a.date.localeCompare(b.date));
    return {g, entry, docs, ab: absStats(g, entry ? entry.id : "", docs)};
  });
}
function renderStudent(app){
  const st = S.myStudent;
  if (!st) { app.innerHTML = `<div class="notice err">ما لقينا سجلك. تواصل مع الشؤون الأكاديمية.</div>`; return; }
  if (S.cfMenu === undefined) { S.cfMenu = null; Promise.all([getDoc(ref("coffeePub/menu")), getDoc(ref("coffeePub/offers")).catch(() => null)]).then(([d, o]) => {
      const off = o && o.exists() ? o.data() : {}; S.cfOffers = off.items || [];
      if (d.exists() && (d.data().items || []).length && d.data().show !== false && !off.hidden) { S.cfMenu = d.data(); if (S.view === "student") render(); } }).catch(() => {}); }
  if (S.sTab === "coffee" && !S.cfMenu) S.sTab = "home";
  if (S.sTab === "freq" && !finShown()) S.sTab = "home";
  if ((S.sTab || "home") !== "home") { app.innerHTML = studentTabs() + `<div id="sb"></div>`; bindStudentTabs(app); ({msgs: studentMsgs, coffee: studentCoffee, camp: studentCamp, card: studentCard, att: studentAtt, exams: studentExams, exc: studentExc, warn: studentWarn, eval: studentEval, fin: studentFinReq, areq: studentAcReq, freq: studentFinReq, survey: studentSurvey})[S.sTab]($("#sb")); return; }
  const gs = Object.values(S.groups).sort((a,b) => (a.course||"").localeCompare(b.course||"","ar"));
  const res = {}; S.myResults.forEach(r => res[r.groupId] = r);
  const cards = gs.map(g => {
    const entry = (g.students || []).find(s => s.sid === S.myNum);
    const docs = countable(S.myAtt.filter(d => d.groupId === g.id));
    const ab = absStats(g, entry ? entry.id : "", docs);
    const pres = ab.p + ab.l, rate = ab.attPct;
    const d = todayDay(), now = nowHM();
    const live = sessionsFor(g, st.gender).find(x => x.day === d && addMin(x.from, -15) <= now && now <= x.to);
    return {g, rate, sessions: docs.length, pres, r: res[g.id], live, ab};
  });
  const rated = cards.filter(c => c.rate !== null);
  const avgAtt = rated.length ? Math.round(rated.reduce((a,c) => a + c.rate, 0) / rated.length) : null;
  const approved = cards.filter(c => c.r);
  const avgMark = approved.length ? (approved.reduce((a,c) => a + c.r.mark, 0) / approved.length).toFixed(1) : null;
  const rows = []; gs.forEach(g => sessionsFor(g, st.gender).forEach(s => rows.push({course: g.course, trainer: tName(g.trainerId), s})));
  app.innerHTML = `
  <div class="card">
    <h2>${esc(st.name)}</h2>
    <div class="row"><span class="code">${esc(st.num)}</span><span class="pill ${st.gender}">${GENDER[st.gender] || ""}</span></div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="n">${gs.length}</div><div class="l">مقررات</div></div>
      <div class="stat"><div class="n">${avgAtt === null ? "—" : avgAtt + "%"}</div><div class="l">متوسط الحضور</div></div>
      <div class="stat"><div class="n">${approved.length}/${gs.length}</div><div class="l">درجات معتمدة</div></div>
      <div class="stat"><div class="n">${avgMark === null ? "—" : avgMark}</div><div class="l">متوسط الدرجات</div></div>
    </div>
  </div>
  <div class="card"><h2>مقرراتي ودرجاتي</h2>
    <div class="list">${cards.map(c => `
      <div class="item" style="align-items:flex-start">
        <div class="grow">
          <div class="t">${esc(c.g.course)}</div>
          <div class="muted">${esc(tName(c.g.trainerId))}${c.g.mode ? " · " + esc(c.g.mode) : ""}</div>
          <div class="muted" style="margin-top:4px">الحضور: ${c.rate === null ? "ما بدأ التحضير" : `${c.pres} من ${c.sessions} محاضرة (${c.rate}%)`}</div>
          ${c.rate === null ? "" : `<span class="bar" style="display:block;margin-top:6px;max-width:220px"><i style="width:${c.rate}%"></i></span>
          <div class="muted" style="margin-top:6px">الغياب: ${c.ab.a} (${c.ab.absPct}%) ${levelPill(c.ab)}${c.ab.remaining !== null ? ` · باقي لك ${c.ab.remaining} غياب قبل الحرمان` : ""}</div>`}
          ${(c.g.recordings || []).length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">تسجيلات المحاضرات (${c.g.recordings.length})</summary><div class="list" style="margin-top:6px">${c.g.recordings.map((r, i) => r.rid ? `<button class="item" style="padding:8px 10px;width:100%;text-align:start;background:none;border:0;cursor:pointer;color:inherit" data-splay="${esc(c.g.id)}|${i}"><span class="grow">${dH(r.date)} · ${esc(r.title)}</span><span class="btn sm">مشاهدة</span></button>` : validLink(r.url) ? `<a class="item" style="padding:8px 10px;text-decoration:none;color:inherit" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="grow">${dH(r.date)} · ${esc(r.title)}</span><span class="btn sm">مشاهدة</span></a>` : "").join("")}</div></details>` : ""}
          ${c.g.meetLink || MEET() ? `<div style="margin-top:10px"><button class="btn sm ${c.live ? "gold" : ""}" data-join="${esc(c.g.id)}">${c.live ? "الآن · " : ""}دخول المحاضرة${MEET() ? "" : " " + meetLabel(c.g.meetLink)}</button>${c.live ? ` <span class="muted">${fmtTime(c.live.from)} – ${fmtTime(c.live.to)}</span>` : ""}</div>` : ""}
        </div>
        <div style="text-align:center;min-width:92px">
          ${c.r ? `<div style="font-size:26px;font-weight:700;color:var(--green)">${c.r.mark}</div><span class="pill ${c.r.mark >= PASS ? "p" : "a"}">${letter(c.r.mark)}</span>` : `<span class="pill">لم تُعتمد بعد</span>`}
        </div>
      </div>`).join("") || `<div class="empty">ما فيه مقررات مسجلة لك بعد.</div>`}</div>
  </div>
  <div class="card"><h2>جدولي الأسبوعي</h2>${weekTable(rows)}</div>
  ${(S.myCerts || []).length ? `<div class="card"><h2>شهاداتي</h2><div class="list">${S.myCerts.map(c => `<div class="item"><div class="grow"><div class="t">${esc(c.course)}</div><div class="muted">${c.kind === "course" ? `دورة${c.hours ? " · " + esc(c.hours) + " ساعة" : ""}` : `حضور ${c.attPct}%`} · ${esc(greg(c.date))}</div></div><button class="btn sm gold" data-cert="${esc(c.code)}">طباعة الشهادة</button></div>`).join("")}</div></div>` : ""}`;
  app.querySelectorAll("[data-cert]").forEach(b => b.onclick = () => { const c = S.myCerts.find(x => x.code === b.dataset.cert); if (c) printCerts([c]); });
  app.querySelector(".card").insertAdjacentHTML("afterend", studentTabs()); bindStudentTabs(app);
  app.querySelectorAll("[data-join]").forEach(b => b.onclick = () => { const g = S.groups[b.dataset.join]; if (g) joinLecture(g, b); });
  app.querySelectorAll("[data-splay]").forEach(b => b.onclick = () => { const [gid, i] = b.dataset.splay.split("|"), g = S.groups[gid]; if (g) playRec(g, (g.recordings || [])[Number(i)]); });
}

function studentAtt(el){
  const cs = myCourseStats(), th = TH();
  el.innerHTML = `<div class="card"><h2>حضوري</h2><p class="muted" style="margin:0">الإنذار الأول عند ${th.warn1}% غياب، والثاني عند ${th.warn2}%، والحرمان عند ${th.deny}%. التأخير يُحسب حضور، والعذر المقبول ما يُحسب غياب.</p></div>
  ${cs.map(({g, entry, docs, ab}) => `<div class="card">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(g.course)}</h2>${levelPill(ab)}</div>
    <p class="muted" style="margin:6px 0 10px">${esc(tName(g.trainerId))}</p>
    <div class="stats">
      <div class="stat"><div class="n">${ab.attPct === null ? "—" : ab.attPct + "%"}</div><div class="l">الحضور</div></div>
      <div class="stat"><div class="n">${ab.a}</div><div class="l">غياب (${ab.absPct}%)</div></div>
      <div class="stat"><div class="n">${ab.l}</div><div class="l">تأخير</div></div>
      <div class="stat"><div class="n">${ab.e}</div><div class="l">مستأذن / عذر</div></div>
      <div class="stat"><div class="n">${ab.remaining === null ? "—" : ab.remaining}</div><div class="l">باقي قبل الحرمان</div></div>
    </div>
    ${docs.length ? `<div class="tbl" style="margin-top:10px"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th></tr></thead><tbody>
      ${docs.map(d => { const r = (entry && d.rec && d.rec[entry.id]) || {}; const k = r.st || "a"; return `<tr><td>${esc(fmtDate(d.date))}</td><td><span class="pill ${k}">${STATUS[k]}</span></td><td>${fmtTime(r.in)}</td><td>${fmtTime(r.out)}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<p class="muted">ما بدأ التحضير في هذا المقرر.</p>`}
  </div>`).join("") || `<div class="card empty">ما فيه مقررات</div>`}`;
}
async function compressImage(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    let max = 1400, q = 0.7, out = "";
    for (let t = 0; t < 6; t++) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
      out = c.toDataURL("image/jpeg", q);
      if (out.length < 650000) return out;
      max = Math.round(max * 0.75); q = Math.max(0.4, q - 0.1);
    }
    throw new Error("too-big");
  } finally { URL.revokeObjectURL(url); }
}
function studentExc(el){
  const cs = myCourseStats();
  const absences = [];
  cs.forEach(({g, entry, docs}) => docs.forEach(d => { const r = entry && d.rec && d.rec[entry.id]; if (!r || !r.st || r.st === "a") absences.push({g, date: d.date}); }));
  const sent = new Set((S.myExc || []).map(x => x.groupId + "_" + x.date));
  const opts = absences.filter(a => !sent.has(a.g.id + "_" + a.date)).sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `<div class="card"><h2>تقديم عذر غياب</h2>
    ${opts.length ? `<form id="exF" class="list" autocomplete="off">
      <label class="f" for="exW">الغياب<select id="exW">${opts.map(a => `<option value="${esc(a.g.id)}|${esc(a.date)}">${esc(a.g.course)} · ${esc(fmtDate(a.date))}</option>`).join("")}</select></label>
      <label class="f" for="exR">سبب الغياب<textarea id="exR" required style="min-height:80px" placeholder="مثل: مراجعة طبية"></textarea></label>
      <label class="f" for="exI">صورة العذر (تقرير طبي أو غيره)<input type="file" id="exI" accept="image/*"></label>
      <button class="btn pri" type="submit" id="exB">إرسال العذر</button>
    </form>` : `<p class="muted" style="margin:0">ما عندك غياب بدون عذر مقدم.</p>`}</div>
  <div class="card"><h2>أعذاري</h2>
    <div class="list">${(S.myExc || []).sort((a, b) => b.date.localeCompare(a.date)).map(x => `<div class="item"><div class="grow"><div class="t">${esc(x.course)} · ${esc(fmtDate(x.date))}</div><div class="muted">${esc(x.reason)}</div>${x.note ? `<div class="muted">رد الشؤون الأكاديمية: ${esc(x.note)}</div>` : ""}</div>
      <span class="pill ${EXC_PILL[x.status]}">${EXC_ST[x.status]}</span>${x.status === "pending" ? `<button class="btn sm danger" data-exdel="${esc(x.id)}">سحب</button>` : ""}</div>`).join("") || `<span class="muted">ما قدمت أعذار</span>`}</div></div>`;
  if ($("#exF")) $("#exF").onsubmit = async e => {
    e.preventDefault();
    const [gid, date] = $("#exW").value.split("|"), g = S.groups[gid], reason = $("#exR").value.trim();
    if (!reason) return toast("اكتب سبب الغياب");
    $("#exB").disabled = true; S._busy = true;
    try {
      let img = "";
      if ($("#exI").files[0]) { $("#exB").textContent = "جاري ضغط الصورة…"; img = await compressImage($("#exI").files[0]); }
      await setDoc(ref(`excuses/${S.myNum}_${gid}_${date}`), {num: S.myNum, name: S.myStudent.name, groupId: gid, course: g.course, date, reason: reason.slice(0, 500), img, status: "pending", note: "", at: new Date().toISOString()}); notify("excuse", `${S.myNum}_${gid}_${date}`);
      toast("انرسل العذر للشؤون الأكاديمية");
    } catch (er) { console.error(er); toast(er.message === "too-big" ? "الصورة كبيرة، جرّب صورة أوضح بحجم أصغر" : "تعذّر إرسال العذر"); }
    S._busy = false; render();
  };
  el.querySelectorAll("[data-exdel]").forEach(b => b.onclick = () => deleteDoc(ref("excuses/" + b.dataset.exdel)).then(() => toast("انسحب العذر")).catch(() => toast("تعذّر السحب")));
}
function studentWarn(el){
  const w = (S.myWarn || []).sort((a, b) => b.date.localeCompare(a.date) || b.level - a.level);
  el.innerHTML = `<div class="card"><h2>الإنذارات</h2>
    <div class="list">${w.map(x => `<div class="item"><div class="grow"><div class="t">${esc(x.levelName)} · ${esc(x.course)}</div><div class="muted">صدر ${esc(fmtDate(x.date))} · نسبة الغياب وقتها ${x.absPct}%</div></div><span class="pill ${LEVEL_PILL[x.level]}">${esc(x.levelName)}</span></div>`).join("") || `<p class="muted" style="margin:0">ما صدر لك أي إنذار.</p>`}</div></div>`;
}
function studentEval(el){
  const open = Object.values(S.groups).filter(g => g.evalOpen);
  const done = new Set((S.myEvals || []).map(e => e.groupId));
  el.innerHTML = `<div class="card"><h2>تقييم المدرب والمقرر</h2><p class="muted" style="margin:0">تقييمك سري، ما يشوفه المدرب. يوصل للشؤون الأكاديمية فقط.</p></div>
  ${open.map(g => done.has(g.id) ? `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(g.course)}</h2><span class="pill p">تم التقييم، شكراً لك</span></div></div>` : `
  <form class="card" data-ev="${esc(g.id)}"><h2>${esc(g.course)}</h2><p class="muted" style="margin-top:0">${esc(tName(g.trainerId))} · من 1 (ضعيف) إلى 5 (ممتاز)</p>
    ${EVAL_Q.map((q, i) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>${q}</span><div class="seg" role="radiogroup" aria-label="${q}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${i}" data-v="${n}">${n}</button>`).join("")}</div></div>`).join("")}
    <label class="f" for="evc-${esc(g.id)}">ملاحظات (اختياري)<textarea id="evc-${esc(g.id)}" style="min-height:70px"></textarea></label>
    <button class="btn pri" type="submit" style="margin-top:8px">إرسال التقييم</button>
  </form>`).join("") || `<div class="card empty">ما فيه تقييم مفتوح حالياً.</div>`}`;
  el.querySelectorAll("form[data-ev]").forEach(f => {
    const ans = {};
    f.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
      ans[b.dataset.q] = Number(b.dataset.v);
      f.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach(x => { const on = x === b; x.style.background = on ? "var(--green)" : ""; x.style.color = on ? "#fff" : ""; });
    });
    f.onsubmit = async e => {
      e.preventDefault();
      if (EVAL_Q.some((_, i) => !ans[i])) return toast("جاوب على كل الأسئلة");
      const gid = f.dataset.ev;
      try { await setDoc(ref(`evals/${gid}_${S.myNum}`), {groupId: gid, num: S.myNum, ratings: EVAL_Q.map((_, i) => ans[i]), comment: $("#evc-" + gid).value.trim().slice(0, 600), at: new Date().toISOString()}); toast("انرسل تقييمك، شكراً لك"); }
      catch (er) { console.error(er); toast("تعذّر إرسال التقييم"); }
    };
  });
}


/* ---------- end-of-program satisfaction survey ---------- */
const SURVEY_Q = ["سهولة إجراءات التسجيل والقبول", "تعامل الشؤون الأكاديمية والإدارة", "مستوى المدربين بشكل عام", "مناسبة البرامج لسوق العمل", "القاعات والتجهيزات والمنصة الإلكترونية", "بوابة الطلاب وسهولة استخدامها", "رضاك العام عن المعهد"];
const RECOMMEND = {yes: "أنصح فيه", maybe: "يمكن", no: "ما أنصح فيه"};
function studentSurvey(el){
  const sv = S.survey;
  if (!sv || !sv.open) { el.innerHTML = `<div class="card empty">ما فيه استبيان مفتوح.</div>`; return; }
  if (S.surveyDone === sv.id) { el.innerHTML = `<div class="card" style="text-align:center"><h2>شكراً لك</h2><p class="muted" style="margin:0">وصلنا رأيك، ويساعدنا نطوّر المعهد.</p></div>`; return; }
  if (S.surveyChecked !== sv.id) {
    S.surveyChecked = sv.id;
    getDoc(ref(`surveys/${sv.id}_${S.myNum}`)).then(x => { if (x.exists()) { S.surveyDone = sv.id; render(); } }).catch(() => {});
  }
  const ans = S._svAns || (S._svAns = {});
  el.innerHTML = `<form class="card" id="svF"><h2>${esc(sv.title || "استبيان رضا المتدربين")}</h2><p class="muted" style="margin-top:0">الاستبيان سري. من 1 (ضعيف) إلى 5 (ممتاز).</p>
    ${SURVEY_Q.map((q, i) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span>${q}</span><div class="seg" role="radiogroup" aria-label="${q}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-sq="${i}" data-v="${n}" style="${ans[i] === n ? "background:var(--green);color:#fff" : ""}">${n}</button>`).join("")}</div></div>`).join("")}
    <div class="row" style="justify-content:space-between;margin:6px 0 10px"><span>تنصح أحد يسجّل في المعهد؟</span><div class="seg" role="radiogroup" aria-label="التوصية">${Object.entries(RECOMMEND).map(([k, v]) => `<button type="button" data-rec="${k}" style="${ans.rec === k ? "background:var(--green);color:#fff" : ""}">${v}</button>`).join("")}</div></div>
    <label class="f" for="svC">وش أكثر شي عجبك؟ ووش نحسّن؟ (اختياري)<textarea id="svC" style="min-height:80px" maxlength="800"></textarea></label>
    <button class="btn pri" type="submit" style="margin-top:8px">إرسال</button></form>`;
  const paint = () => { el.querySelectorAll("[data-sq]").forEach(b => { const on = ans[b.dataset.sq] === Number(b.dataset.v); b.style.background = on ? "var(--green)" : ""; b.style.color = on ? "#fff" : ""; }); el.querySelectorAll("[data-rec]").forEach(b => { const on = ans.rec === b.dataset.rec; b.style.background = on ? "var(--green)" : ""; b.style.color = on ? "#fff" : ""; }); };
  el.querySelectorAll("[data-sq]").forEach(b => b.onclick = () => { ans[b.dataset.sq] = Number(b.dataset.v); paint(); });
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => { ans.rec = b.dataset.rec; paint(); });
  $("#svF").onsubmit = async e => {
    e.preventDefault();
    if (SURVEY_Q.some((_, i) => !ans[i]) || !ans.rec) return toast("جاوب على كل الأسئلة");
    try { await setDoc(ref(`surveys/${sv.id}_${S.myNum}`), {sid: sv.id, num: S.myNum, ratings: SURVEY_Q.map((_, i) => ans[i]), rec: ans.rec, comment: $("#svC").value.trim().slice(0, 800), at: new Date().toISOString()}); S.surveyDone = sv.id; S._svAns = null; render(); }
    catch (er) { if (er && er.code === "permission-denied") { S.surveyDone = sv.id; render(); } else toast("تعذّر الإرسال"); }
  };
}
function adminSurvey(){
  const sv = S.survey || {};
  const box = $("#svBox"); if (!box) return;
  const list = S.surveyAll || [];
  const ids = [...new Set(list.map(x => x.sid))];
  const cur = S.svSel || sv.id || ids[0];
  const l = list.filter(x => x.sid === cur);
  const avg = i => l.length ? (l.reduce((a, x) => a + (x.ratings[i] || 0), 0) / l.length).toFixed(1) : "—";
  const recC = k => l.filter(x => x.rec === k).length;
  box.innerHTML = `<div class="card"><h2>استبيان رضا المتدربين (نهاية البرنامج)</h2>
    <p class="muted" style="margin-top:0">سري. يظهر للطلاب تبويب «الاستبيان» لما يكون مفتوح.</p>
    <div class="row"><input type="text" id="svT" class="grow" placeholder="عنوان الاستبيان، مثل: استبيان نهاية الفصل الأول 1448" value="${esc(sv.title || "")}">
    ${sv.open ? `<span class="pill p">مفتوح</span>${RO() ? "" : `<button class="btn sm" id="svClose">قفل الاستبيان</button>`}` : RO() ? "" : `<button class="btn pri sm" id="svOpen">فتح استبيان جديد</button>`}</div>
    ${ids.length > 1 ? `<label class="f" for="svSel" style="margin-top:8px">النتائج<select id="svSel">${ids.map(i => `<option value="${esc(i)}" ${i === cur ? "selected" : ""}>${esc((list.find(x => x.sid === i) || {}).title || i)}</option>`).join("")}</select></label>` : ""}
    ${l.length ? `<p style="margin:10px 0 4px"><b>${l.length}</b> مشارك من ${Object.keys(S.students || {}).length} طالب · ينصحون: <b>${Math.round(recC("yes") / l.length * 100)}%</b> · يمكن ${recC("maybe")} · ما ينصحون ${recC("no")}</p>
      <div class="tbl"><table><tbody>${SURVEY_Q.map((q, i) => `<tr><td class="nm">${q}</td><td><b>${avg(i)}</b></td><td style="width:40%"><span class="bar" style="display:block"><i style="width:${avg(i) === "—" ? 0 : avg(i) / 5 * 100}%"></i></span></td></tr>`).join("")}</tbody></table></div>
      ${l.filter(x => x.comment).length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">الملاحظات (${l.filter(x => x.comment).length})</summary><div class="list" style="margin-top:6px">${l.filter(x => x.comment).map(x => `<div class="item" style="padding:8px 12px">${esc(x.comment)}</div>`).join("")}</div></details>` : ""}
      <div class="row" style="margin-top:8px"><button class="btn sm" id="svX">تنزيل Excel</button></div>` : `<p class="muted">ما وصلت ردود بعد.</p>`}</div>`;
  const saveSv = (d, msg) => setDoc(ref("public/survey"), d, {merge: true}).then(() => { logAction(msg, d.title || ""); toast("انحفظ"); }).catch(handleWriteErr);
  if ($("#svOpen")) $("#svOpen").onclick = () => { const title = $("#svT").value.trim() || "استبيان رضا المتدربين"; saveSv({id: "sv-" + today().replace(/-/g, "") + "-" + uid(), title, open: true}, "فتح استبيان الرضا"); };
  if ($("#svClose")) $("#svClose").onclick = () => saveSv({open: false}, "قفل استبيان الرضا");
  if ($("#svSel")) $("#svSel").onchange = e => { S.svSel = e.target.value; adminSurvey(); };
  if ($("#svX")) $("#svX").onclick = () => excelDownload("استبيان الرضا", [{title: "الردود", rows: [[INST_AR], ["استبيان رضا المتدربين"], [], [...SURVEY_Q, "التوصية", "الملاحظة"], ...l.map(x => [...x.ratings, RECOMMEND[x.rec] || "", x.comment || ""]), [], [...SURVEY_Q.map((_, i) => Number(avg(i)) || 0), "المتوسط"]], widths: [...SURVEY_Q.map(() => 14), 12, 40]}]);
}

/* ---------- trainer portal ---------- */
const myGroups = () => Object.values(S.groups).filter(g => g.trainerId === S.me).sort((a,b) => (a.course||"").localeCompare(b.course||"", "ar"));
const countG = (g, gen) => (g.students||[]).filter(s => s.gender === gen).length;
const gradeStatus = gid => (S.grades[gid] && S.grades[gid].status) || "none";
function startAtt(){
  stopAtt();
  if (!S.tGroup) return;
  const path = `att/${S.tGroup}_${S.tDate}`; S.attPath = path; S.att = null;
  S.unsubAtt = onSnapshot(ref(path), snap => {
    if (pending(path)) return;
    S.att = snap.exists() ? snap.data() : null;
    if (!busyEditing()) render();
  }, () => toast("تعذّر تحميل التحضير"));
  S.unsubGroupAtt = onSnapshot(query(collection(db, "att"), where("groupId", "==", S.tGroup)), snap => {
    S.groupAtt = snap.docs.map(d => d.data()); if (S.tTab === "hist") render();
  }, () => {});
  S.joins = {};
  S.unsubJoins = onSnapshot(query(collection(db, "joins"), where("groupId", "==", S.tGroup), where("date", "==", S.tDate)), snap => {
    S.joins = {}; snap.docs.forEach(d => { const j = d.data(); S.joins[j.num] = j.time; });
    if (S.tTab === "roll" && !busyEditing()) render();
  }, () => {});
}
function stopAtt(){ if (S.unsubAtt) S.unsubAtt(); if (S.unsubGroupAtt) S.unsubGroupAtt(); if (S.unsubJoins) S.unsubJoins(); S.unsubAtt = S.unsubGroupAtt = S.unsubJoins = null; S.att = null; S.groupAtt = []; S.joins = {}; }
function attData(){
  const g = S.groups[S.tGroup];
  return S.att ? clone(S.att) : {groupId: g.id, trainerId: g.trainerId || "", course: g.course, date: S.tDate, rec: {}};
}
function commitAtt(d){
  const hol = isHoliday(S.tDate);
  if (hol) { toast(`هذا اليوم إجازة (${hol.label || "إجازة رسمية"})، ما ينحسب فيه تحضير`); render(); return; }
  if (isLocked(S.tDate)) { toast(`التحضير مقفل لهذا التاريخ (بعد ${lockHours()} ساعة من نهاية يوم المحاضرة). تواصل مع الشؤون الأكاديمية`); render(); return; }
  logAction("تحضير", `${S.groups[S.tGroup].course} · ${S.tDate}`, "att:" + S.tGroup + ":" + S.tDate);
  const g = S.groups[S.tGroup];
  d.trainerId = g.trainerId || ""; d.memberNums = g.memberNums || []; d.updatedAt = new Date().toISOString();
  S.att = d; saveDoc(S.attPath, d);
}
function setRec(sid, patch){
  const d = attData(); d.rec = d.rec || {};
  const r = Object.assign({}, d.rec[sid] || {}, patch);
  Object.keys(r).forEach(k => { if (r[k] === null || r[k] === "" || r[k] === undefined) delete r[k]; });
  d.rec[sid] = r; commitAtt(d);
}

function renderTrainer(app){
  const t = S.trainers[S.me];
  if (!t) { app.innerHTML = `<div class="notice err">هذا الحساب غير مربوط بمدرب. تواصل مع الشؤون الأكاديمية.</div>`; return; }
  if (!S.tGroup && S.trmOpen) return trainerMsgs(app);
  if (!S.tGroup && S.sreqOpen) { app.innerHTML = `<div id="srBox"></div>`; return staffReqsView($("#srBox"), true); }
  if (!S.tGroup && S.trChat) {
    app.innerHTML = `<div class="card" style="padding:10px 14px"><div class="row" style="justify-content:space-between;align-items:center"><b>💬 المراسلات</b><button class="btn sm" id="tcBack">→ رجوع</button></div></div><div id="tcBox"></div>`;
    $("#tcBack").onclick = () => { S.trChat = false; S.memoChat = null; render(); };
    return memosTab($("#tcBox"));
  }
  if (!S.tGroup && S.trMail && trMe()) {
    if (!S.mail) mailSubs();
    app.innerHTML = `<div class="card" style="padding:10px 14px"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>📧 بريدي</b> <span class="muted" dir="ltr">${esc(trAddr(trMe()))}</span></div><button class="btn sm" id="tmBack">→ رجوع</button></div></div><div id="tmBox"></div>`;
    $("#tmBack").onclick = () => { S.trMail = false; S.mailDraft = null; S.mailOpen = null; render(); };
    return mailTab($("#tmBox"));
  }
  if (!S.tGroup) {
    const gs = myGroups();
    const rows = []; gs.forEach(g => (g.sessions || []).forEach(s => rows.push({course: g.course + (s.g ? ` (${s.g === "f" ? "طالبات" : "طلاب"})` : ""), trainer: trainerTitle(t), s})));
    app.innerHTML = `
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><h2 style="margin:0">أهلاً ${esc(trainerTitle(t))}</h2><p class="muted" style="margin:4px 0 0">اختر المقرر للتحضير أو رصد الدرجات.</p></div>
      <div class="row" style="gap:6px"><button class="btn ${trmUnread().length ? "gold" : ""}" id="trmOpen">💬 مراسلة الشؤون الأكاديمية${trmBadge()}</button><button class="btn ${memoUnread().length ? "gold" : ""}" id="tcOpen">💬 المراسلات${memoBadge()}</button>${trMe() ? `<button class="btn ${trMe() && S.mail && mailUnread().length ? "gold" : ""}" id="tmOpen">📧 بريدي${S.mail ? mailBadge() : ""}</button>` : ""}<button class="btn" id="srOpen">📝 إجازة / عذر طبي${srBadge()}</button></div></div></div>
    ${gs.length ? `<div class="ggrid">${gs.map(g => `
      <button class="groupcard" data-g="${esc(g.id)}">
        <span style="font-weight:700;color:var(--green)">${esc(g.course)}</span>
        <span class="muted">${(g.students||[]).length} متدرب ${g.mode ? "· " + esc(g.mode) : ""}</span>
        <span><span class="pill ${GSTAT_PILL[gradeStatus(g.id)]}">الدرجات: ${GSTAT[gradeStatus(g.id)]}</span></span>
      </button>`).join("")}</div>
      <div class="card"><h2>جدولي</h2>${weekTable(rows)}</div>`
      : `<div class="card empty">ما فيه مقررات مسجلة باسمك حتى الآن.</div>`}`;
    app.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { S.tGroup = b.dataset.g; S.tDate = today(); S.tTab = "roll"; startAtt(); render(); });
    $("#trmOpen").onclick = () => { S.trmOpen = true; render(); window.scrollTo(0, 0); };
    $("#srOpen").onclick = () => { S.sreqOpen = true; render(); window.scrollTo(0, 0); };
    if ($("#tmOpen")) $("#tmOpen").onclick = () => { S.trMail = true; render(); window.scrollTo(0, 0); };
    $("#tcOpen").onclick = () => { S.trChat = true; render(); window.scrollTo(0, 0); };
    return;
  }
  const g = S.groups[S.tGroup];
  if (!S.unsubAtt) startAtt();
  const st = g.students || [];
  const rec = (S.att && S.att.rec) || {};
  const c = {p:0,l:0,a:0,e:0,n:0}; st.forEach(s => { const r = rec[s.id]; if (r && r.st) c[r.st]++; else c.n++; });
  const head = `
  <div class="card">
    <div class="row"><button class="btn sm" id="back">→ المقررات</button><span class="pill">${esc(g.mode || "—")}</span></div>
    <h2 style="margin-top:10px">${esc(g.course)}</h2>
    <div class="row" style="margin-bottom:10px">
      ${MEET() ? `<button class="btn pri" id="startLec" style="width:100%;margin-bottom:8px">ابدأ المحاضرة في قاعة المعهد</button>` : ""}
      <input type="url" id="mlink" class="grow" dir="ltr" placeholder="${MEET() ? "رابط Teams للمقرر (احتياط لو تعطلت القاعة)" : "رابط اجتماع Teams للمقرر"}" value="${esc(g.meetLink || "")}">
      <button class="btn sm" id="mlSave">حفظ الرابط</button>
      ${validLink(g.meetLink) ? `<a class="btn sm pri" href="${esc(g.meetLink.trim())}" target="_blank" rel="noopener">فتح Teams</a>` : ""}
    </div>
    <details style="margin-bottom:10px"><summary class="muted" style="cursor:pointer">تسجيلات المحاضرات (${(g.recordings || []).length})</summary>
      <div class="list" style="margin-top:8px">${(g.recordings || []).map((r, i) => `<div class="item" style="padding:8px 10px"><span class="grow">${dH(r.date)} · ${esc(r.title)}${r.rid ? ` <span class="muted">· ${esc(fmtSize(r.size))}</span>` : ""}</span>${r.rid ? `<button class="btn sm" data-rplay="${i}">تشغيل</button>` : `<a class="btn sm" href="${esc(validLink(r.url) ? r.url : "#")}" target="_blank" rel="noopener">فتح</a>`}<button class="btn sm danger" data-rrec="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه تسجيلات</span>`}</div>
      ${MEET() && (S.site || {}).pushUrl ? `<div class="notice" style="margin:8px 0 0">أول ما تبدأ المحاضرة يطلب منك تبدأ التسجيل، ولما تنهيها يطلب منك ترفعه. والملف ينحفظ في «التنزيلات» بجهازك. وإذا فاتك الرفع، ارفعه من هنا ويظهر لطلاب المقرر بس.</div>
      <div class="row" style="margin-top:8px">
        <input type="date" id="rfD" value="${today()}" style="width:150px">
        <input type="text" id="rfT" class="grow" placeholder="عنوان المحاضرة">
        <input type="file" id="rfF" accept="video/webm,video/mp4,.webm,.mp4" class="grow">
        <button class="btn sm pri" id="rfUp">رفع التسجيل</button>
      </div>
      <div id="rfP" class="muted" style="margin-top:6px"></div>
      <p class="muted" style="margin:10px 0 0">أو أضف رابط تسجيل من مكان ثاني:</p>` : ""}
      <div class="row" style="margin-top:8px">
        <input type="date" id="recD" value="${today()}" style="width:150px">
        <input type="text" id="recT" class="grow" placeholder="عنوان المحاضرة">
        <input type="url" id="recU" class="grow" dir="ltr" placeholder="رابط التسجيل (OneDrive / Stream / YouTube)">
        <button class="btn sm pri" id="recAdd">+ إضافة</button>
      </div>
    </details>
    <div class="row">
      ${S.tTab === "roll" ? `<label class="f" for="d" style="min-width:170px">تاريخ المحاضرة<input type="date" id="d" value="${esc(S.tDate)}" max="${today()}"></label>${isLocked(S.tDate) ? `<span class="pill a">مقفل للتعديل</span>` : ""}${isHoliday(S.tDate) ? `<span class="pill e">إجازة: ${esc(isHoliday(S.tDate).label || "رسمية")}</span>` : ""}` : ""}
      <div class="tabs" style="border:0;padding:0;margin-inline-start:auto">
        <button class="tab ${S.tTab==="roll"?"on":""}" data-tab="roll">التحضير</button>
        <button class="tab ${S.tTab==="hist"?"on":""}" data-tab="hist">سجل الحضور</button>
        <button class="tab ${S.tTab==="grades"?"on":""}" data-tab="grades">الدرجات</button>
        <button class="tab ${S.tTab==="exams"?"on":""}" data-tab="exams">الاختبارات</button>
      </div>
    </div>
  </div>`;
  let body;
  if (S.tTab === "roll") {
    body = `
    <div class="sticky"><div class="card" style="padding:12px">
      <div class="stats">
        <div class="stat"><div class="n">${c.p}</div><div class="l">حاضر</div></div>
        <div class="stat"><div class="n">${c.l}</div><div class="l">متأخر</div></div>
        <div class="stat"><div class="n">${c.a}</div><div class="l">غائب</div></div>
        <div class="stat"><div class="n">${c.e}</div><div class="l">مستأذن</div></div>
        <div class="stat"><div class="n">${c.n}</div><div class="l">لم يُحضّر</div></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn pri sm" id="allP">تحضير الباقي حاضر الآن</button>
        <button class="btn sm" id="allOut">انصراف الحاضرين الآن</button>
        <button class="btn sm" id="allA">الباقي غائب</button>
        ${Object.keys(S.joins || {}).length ? `<button class="btn gold sm" id="allJ">تحضير اللي دخلوا Teams (${st.filter(s => s.sid && S.joins[s.sid]).length})</button>` : ""}
      </div>
    </div></div>
    <div class="list" id="roll">${st.length ? st.map((s,i) => stuRow(s,i,rec[s.id]||{})).join("") : `<div class="card empty">ما فيه طلاب في هذا المقرر بعد.</div>`}</div>`;
  } else if (S.tTab === "hist") body = `<div class="card"><h2>سجل الحضور</h2>${matrixTable(g, S.groupAtt)}</div>`;
  else if (S.tTab === "exams") body = examsTab(g);
  else body = gradesEditor(g, "trainer");
  app.innerHTML = head + body;
  $("#back").onclick = () => { S.tGroup = null; stopAtt(); render(); };
  const saveRecs = async list => {
    try { await setDoc(ref("groups/" + g.id), {recordings: list}, {merge: true}); S.groups[g.id].recordings = list; logAction("تسجيلات المحاضرات", g.course); render(); return true; }
    catch (e) { handleWriteErr(e); return false; }
  };
  $("#recAdd").onclick = async () => {
    const r = {date: $("#recD").value || today(), title: $("#recT").value.trim() || "محاضرة", url: $("#recU").value.trim()};
    if (!validLink(r.url)) return toast("رابط التسجيل لازم يبدأ بـ https://");
    if (await saveRecs([...(g.recordings || []), r].sort((a, b) => b.date.localeCompare(a.date)))) toast("انضاف التسجيل، والطلاب يشوفونه الحين");
  };
  document.querySelectorAll("[data-rrec]").forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.rrec), r = (g.recordings || [])[i]; if (!r) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    if (r.rid) { b.disabled = true; try { await recDelete(g, r); } catch (e) { console.error(e); b.disabled = false; return toast("تعذّر حذف الملف من السيرفر"); } }
    const l = [...(g.recordings || [])]; l.splice(i, 1); saveRecs(l);
  });
  document.querySelectorAll("[data-rplay]").forEach(b => b.onclick = () => playRec(g, (g.recordings || [])[Number(b.dataset.rplay)]));
  if ($("#rfUp")) $("#rfUp").onclick = async e => {
    const f = $("#rfF").files[0]; if (!f) return toast("اختر ملف التسجيل");
    if (f.size > 4 * 1024 ** 3) return toast("الملف أكبر من 4 جيجا");
    const btn = e.target; btn.disabled = true;
    try {
      const r = await recUpload(g, f, pct => { $("#rfP").textContent = `جاري الرفع… ${pct}% (لا تقفل الصفحة)`; });
      const item = {date: $("#rfD").value || today(), title: $("#rfT").value.trim() || "محاضرة", rid: r.rid, size: f.size, by: S.me || S.adminRole || ""};
      if (await saveRecs([...(g.recordings || []), item].sort((a, b) => b.date.localeCompare(a.date)))) toast("انرفع التسجيل، وطلاب المقرر يشوفونه الحين");
    } catch (x) { console.error(x); $("#rfP").textContent = ""; toast(x.message === "full" ? "مساحة السيرفر ما تكفي، كلم الإدارة" : "تعذّر رفع التسجيل، حاول مرة ثانية"); }
    finally { btn.disabled = false; }
  };
  if ($("#startLec")) $("#startLec").onclick = e => startLecture(g, e.target);
  $("#mlSave").onclick = async () => {
    const v = $("#mlink").value.trim();
    if (v && !validLink(v)) return toast("الرابط لازم يبدأ بـ https://");
    try { await setDoc(ref("groups/" + g.id), {meetLink: v}, {merge: true}); S.groups[g.id].meetLink = v; logAction("رابط Teams", g.course); toast(v ? "انحفظ رابط المحاضرة، والطلاب يشوفونه الحين" : "انشال الرابط"); render(); }
    catch (e) { handleWriteErr(e); }
  };
  if ($("#d")) $("#d").onchange = e => { if (e.target.value) { S.tDate = e.target.value; startAtt(); render(); } };
  app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.tTab = b.dataset.tab; render(); });
  if (S.tTab === "roll") {
    bindRoll(st, rec);
    if (isLocked(S.tDate) || isHoliday(S.tDate)) app.querySelectorAll("#roll button, #roll input, #allP, #allOut, #allA, #allJ").forEach(x => x.disabled = true);
  }
  else if (S.tTab === "hist") bindCopy();
  else if (S.tTab === "exams") bindExamsTab(g);
  else bindGrades(g, "trainer");
}
function stuRow(s, i, r){
  const stc = r.st || "";
  return `<div class="stu ${stc}" data-s="${esc(s.id)}">
    <span class="num">${i+1}</span>
    <span class="nm">${esc(s.name)} <span class="pill ${s.gender}">${GENDER[s.gender]||""}</span>${s.sid && S.joins && S.joins[s.sid] ? ` <span class="pill e">دخل Teams ${fmtTime(S.joins[s.sid])}</span>` : ""}</span>
    <div class="ctl">
      <div class="seg" role="group" aria-label="الحالة">${["p","l","a","e"].map(k => `<button class="${k} ${stc===k?"on":""}" data-st="${k}">${STATUS[k]}</button>`).join("")}</div>
      <div class="times">
        <label for="in-${esc(s.id)}">حضور</label><input type="time" id="in-${esc(s.id)}" data-in value="${esc(r.in||"")}">
        <label for="out-${esc(s.id)}">انصراف</label><input type="time" id="out-${esc(s.id)}" data-out value="${esc(r.out||"")}">
        <button class="btn sm" data-outnow>انصراف الآن</button>
      </div>
    </div>
  </div>`;
}
function bindRoll(st, rec){
  $("#roll").querySelectorAll(".stu").forEach(row => {
    const sid = row.dataset.s, cur = rec[sid] || {};
    row.querySelectorAll("[data-st]").forEach(b => b.onclick = () => {
      const k = b.dataset.st;
      if (cur.st === k) setRec(sid, {st: null});
      else {
        const patch = {st: k};
        if ((k === "p" || k === "l") && !cur.in) patch.in = nowHM();
        if (k === "a") { patch.in = null; patch.out = null; }
        setRec(sid, patch);
      }
      render();
    });
    row.querySelector("[data-in]").onchange = e => { const v = e.target.value; setRec(sid, {in: v || null, st: v && !cur.st ? "p" : cur.st}); render(); };
    row.querySelector("[data-out]").onchange = e => { setRec(sid, {out: e.target.value || null}); render(); };
    row.querySelector("[data-outnow]").onclick = () => { const patch = {out: nowHM()}; if (!cur.st) patch.st = "p"; setRec(sid, patch); render(); };
  });
  const bulk = fn => { const d = attData(); d.rec = d.rec || {}; st.forEach(s => fn(s, d.rec)); commitAtt(d); render(); };
  $("#allP").onclick = () => bulk((s, R) => { if (!R[s.id] || !R[s.id].st) R[s.id] = {st: "p", in: nowHM()}; });
  $("#allOut").onclick = () => bulk((s, R) => { const r = R[s.id]; if (r && (r.st === "p" || r.st === "l") && !r.out) r.out = nowHM(); });
  $("#allA").onclick = () => bulk((s, R) => { if (!R[s.id] || !R[s.id].st) R[s.id] = {st: "a"}; });
  if ($("#allJ")) $("#allJ").onclick = () => bulk((s, R) => { const t = s.sid && S.joins[s.sid]; if (t && (!R[s.id] || !R[s.id].st)) R[s.id] = {st: "p", in: t}; });
}

/* ---------- grades (trainer + admin) ---------- */
function gradesEditor(g, who){
  const gd = S.grades[g.id] || {};
  const status = gd.status || "none";
  const marks = gd.marks || {};
  const editable = who === "admin" ? status !== "approved" : ["none", "draft", "returned"].includes(status);
  const st = g.students || [];
  const filled = st.filter(s => typeof marks[s.id] === "number").length;
  return `<div class="card" id="gradesBox">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">الدرجات · ${esc(g.course)}</h2><span class="pill ${GSTAT_PILL[status]}">${GSTAT[status]}</span></div>
    ${who === "admin" ? `<p class="muted" style="margin:6px 0 0">${esc(tName(g.trainerId))}</p>` : ""}
    ${status === "returned" && gd.note ? `<div class="notice" style="margin-top:10px"><b>ملاحظة الشؤون الأكاديمية:</b> ${esc(gd.note)}</div>` : ""}
    ${who === "trainer" && status === "submitted" ? `<div class="notice" style="margin-top:10px">رفعت الدرجات، وهي الحين عند الشؤون الأكاديمية للاعتماد. ما تقدر تعدّلها إلا إذا رجعوها لك.</div>` : ""}
    ${status === "approved" ? `<div class="notice" style="margin-top:10px">الدرجات معتمدة وتظهر للطلاب في بوابتهم.</div>` : ""}
    <p class="muted">الدرجة من 100، والنجاح من ${PASS}. مرصود ${filled} من ${st.length}.</p>
    <div class="tbl"><table><thead><tr><th>م</th><th class="nm">الاسم</th><th>الرقم</th><th>الدرجة</th><th>التقدير</th></tr></thead><tbody>
    ${st.map((s,i) => { const m = marks[s.id]; return `<tr><td>${i+1}</td><td class="nm">${esc(s.name)}</td><td>${esc(s.sid || "—")}</td>
      <td>${editable ? `<input type="number" min="0" max="100" step="0.5" data-mark="${esc(s.id)}" value="${typeof m === "number" ? m : ""}" style="width:84px;padding:6px">` : (typeof m === "number" ? `<b>${m}</b>` : "—")}</td>
      <td>${typeof m === "number" ? `<span class="pill ${m >= PASS ? "p" : "a"}">${letter(m)}</span>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">${gradeButtons(who, status)}</div>
    ${who === "admin" && status !== "approved" ? `<label class="f" for="gnote" style="margin-top:10px">ملاحظة للمدرب عند الإرجاع<input type="text" id="gnote" value="${esc(gd.note || "")}"></label>` : ""}
  </div>`;
}
function gradeButtons(who, status){
  if (who === "trainer") {
    if (!["none", "draft", "returned"].includes(status)) return "";
    return `<button class="btn" id="gSave">حفظ كمسودة</button><button class="btn pri" id="gSubmit">رفع للشؤون الأكاديمية</button>`;
  }
  if (status === "approved") return `<button class="btn danger" id="gUnapprove">إلغاء الاعتماد وإخفاؤها عن الطلاب</button>`;
  return `<button class="btn" id="gSave">حفظ</button><button class="btn pri" id="gApprove">اعتماد ونشر للطلاب</button>${status === "submitted" ? `<button class="btn danger" id="gReturn">إرجاع للمدرب</button>` : ""}`;
}
function readMarks(g){
  const marks = {}; let bad = false;
  document.querySelectorAll("[data-mark]").forEach(inp => {
    const v = inp.value.trim(); if (v === "") return;
    const n = Number(v);
    if (isNaN(n) || n < 0 || n > 100) { bad = true; inp.style.borderColor = "var(--abs)"; } else marks[inp.dataset.mark] = n;
  });
  return bad ? null : marks;
}
function bindGrades(g, who){
  const gd = () => S.grades[g.id] || {};
  const base = status => {
    const marks = readMarks(g); if (!marks) { toast("فيه درجة غير صحيحة، لازم تكون بين 0 و100"); return null; }
    return {groupId: g.id, trainerId: g.trainerId || "", course: g.course, status, marks, memberNums: g.memberNums || [], note: gd().note || "", updatedAt: new Date().toISOString()};
  };
  const put = async d => { S.grades[g.id] = d; try { await setDoc(ref("grades/" + g.id), d); logAction("الدرجات: " + GSTAT[d.status], g.course); return true; } catch (e) { handleWriteErr(e); return false; } };
  const allFilled = d => (g.students || []).every(s => typeof d.marks[s.id] === "number");
  document.querySelectorAll("[data-mark]").forEach(inp => inp.oninput = () => { const v = Number(inp.value); const td = inp.closest("tr").lastElementChild; td.innerHTML = inp.value === "" || isNaN(v) ? "" : `<span class="pill ${v >= PASS ? "p" : "a"}">${letter(v)}</span>`; });
  if ($("#gSave")) $("#gSave").onclick = async () => { const d = base(who === "trainer" ? "draft" : (gd().status && gd().status !== "none" ? gd().status : "draft")); if (d && await put(d)) { toast("انحفظت الدرجات"); render(); } };
  if ($("#gSubmit")) $("#gSubmit").onclick = async () => {
    const d = base("submitted"); if (!d) return;
    if (!allFilled(d)) return toast("ارصد درجات كل الطلاب قبل الرفع");
    d.submittedAt = new Date().toISOString();
    if (await put(d)) { notify("gradesub", g.id); toast("ارتفعت الدرجات للشؤون الأكاديمية"); render(); }
  };
  if ($("#gReturn")) $("#gReturn").onclick = async () => {
    const d = base("returned"); if (!d) return; d.note = $("#gnote").value.trim();
    if (await put(d)) { toast("رجعت الدرجات للمدرب"); render(); }
  };
  if ($("#gApprove")) $("#gApprove").onclick = async () => {
    const d = base("approved"); if (!d) return;
    if (!allFilled(d)) return toast("فيه طلاب بدون درجة");
    const missing = (g.students || []).filter(s => !s.sid);
    if (missing.length) return toast(`فيه ${missing.length} طالب بدون رقم أكاديمي، اربطهم أول من تبويب الطلاب`);
    d.approvedAt = new Date().toISOString(); d.approvedBy = S.adminRole; d.note = "";
    const b = writeBatch(db);
    b.set(ref("grades/" + g.id), d);
    (g.students || []).forEach(s => b.set(ref(`results/${s.sid}_${g.id}`), {num: s.sid, groupId: g.id, course: g.course, trainer: tName(g.trainerId), mark: d.marks[s.id], approvedAt: d.approvedAt}));
    try { await b.commit(); S.grades[g.id] = d; notify("grade", g.id); logAction("اعتماد الدرجات ونشرها", g.course); toast("اعتُمدت الدرجات وظهرت للطلاب"); render(); } catch (e) { handleWriteErr(e); }
  };
  if ($("#gUnapprove")) $("#gUnapprove").onclick = async () => {
    const btn = $("#gUnapprove");
    if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "متأكد؟ اضغط مرة ثانية"; return; }
    const d = clone(gd()); d.status = "returned"; d.note = "أُلغي الاعتماد للمراجعة";
    const b = writeBatch(db);
    b.set(ref("grades/" + g.id), d);
    try {
      const rs = await getDocs(query(collection(db, "results"), where("groupId", "==", g.id)));
      rs.docs.forEach(x => b.delete(x.ref));
      await b.commit(); S.grades[g.id] = d; logAction("إلغاء اعتماد الدرجات", g.course); toast("أُلغي الاعتماد"); render();
    } catch (e) { handleWriteErr(e); }
  };
}

/* ---------- absence rules (thresholds + holidays from public/system) ---------- */
const TH = () => ({warn1: 10, warn2: 15, deny: 20, certMin: 80, ...((S.sys && S.sys.thresholds) || {})});
const isHoliday = date => ((S.sys && S.sys.holidays) || []).find(h => date >= h.from && date <= (h.to || h.from));
const countable = docs => (docs || []).filter(d => d && d.date && !isHoliday(d.date));
const LEVEL = ["منتظم", "الإنذار الأول", "الإنذار الثاني", "حرمان"];
const LEVEL_PILL = ["p", "l", "a", "a"];
/* absences are counted against the course's planned total when set, otherwise against lectures held so far.
   late = present, excused = not absent, unmarked in a recorded lecture = absent */
function absStats(g, entryId, docs){
  let p = 0, l = 0, a = 0, e = 0;
  docs.forEach(d => { const r = d.rec && d.rec[entryId]; if (!r || !r.st || r.st === "a") a++; else if (r.st === "p") p++; else if (r.st === "l") l++; else e++; });
  const held = docs.length, total = Number(g.totalSessions) || 0, base = total || held;
  const absPct = base ? Math.round(a / base * 1000) / 10 : 0;
  const th = TH(), early = !total && held < 5;   // without a planned total, don't warn on the first few lectures
  const level = early ? 0 : absPct >= th.deny ? 3 : absPct >= th.warn2 ? 2 : absPct >= th.warn1 ? 1 : 0;
  const remaining = total ? Math.max(0, Math.ceil(total * th.deny / 100) - 1 - a) : null;
  return {p, l, a, e, held, total, absPct, attPct: held ? Math.round((p + l) / held * 100) : null, level, remaining};
}
const levelPill = st => `<span class="pill ${LEVEL_PILL[st.level]}">${LEVEL[st.level]}</span>`;


/* ================= printing, Excel export, certificates ================= */
const SITE = () => location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "");
const INST_AR = "معهد أسس التقنية والقانون العالي للتدريب", INST_EN = "OSOS Higher Institute of Technology & Law for Training";
const hijri = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", {day: "numeric", month: "long", year: "numeric"}).replace(/\s*هـ\s*$/, "") + " هـ"; } catch { return ""; } };
const greg = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {day: "numeric", month: "long", year: "numeric"}) + " م"; } catch { return d; } };
const bothDates = d => `${hijri(d)} · ${greg(d)}`;
/* open the window inside the click, fill it after any awaits (keeps popup blockers happy) */
function openPrint(){
  const w = window.open("", "_blank");
  if (!w) { toast("المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع"); return null; }
  w.document.write(`<p dir="rtl" style="font-family:sans-serif;padding:20px">جاري التجهيز…</p>`);
  return w;
}
const PRINT_CSS = `
@page{size:A4;margin:12mm}
*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;color:#1d2621;font-size:12.5px;background:#eef1ee}
.bar{position:sticky;top:0;background:#1F5136;color:#fff;padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;z-index:2}
.bar button{font:inherit;background:#C9A54C;color:#1F5136;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}
.page{background:#fff;width:210mm;min-height:297mm;margin:12px auto;padding:14mm 13mm;position:relative;page-break-after:always;break-after:page}
.page.land{width:297mm;min-height:210mm}
.hd{display:flex;align-items:center;gap:12px;border-bottom:2px solid #C9A54C;padding-bottom:10px;margin-bottom:14px}
.hd img{width:58px;height:58px;object-fit:contain}.hd .t{flex:1}.hd b{display:block;font-size:15px;color:#1F5136}.hd span{font-size:10.5px;color:#8a6d22;letter-spacing:.3px}
.hd .meta{font-size:11px;text-align:left;color:#555}
.hd .licq svg{width:52px;height:52px;display:block}
h1{font-size:19px;color:#1F5136;text-align:center;margin:6px 0 14px}
h2{font-size:14px;color:#1F5136;margin:14px 0 6px;border-bottom:1px solid #e3e8e4;padding-bottom:3px}
table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #c9d2cc;padding:5px 6px;text-align:center}
th{background:#1F5136;color:#fff;font-weight:600}td.n{text-align:right}tr:nth-child(even) td{background:#f6f8f6}
.info{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 18px;margin:0 0 12px;font-size:12.5px}.info div b{color:#1F5136}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px}.sig div{border-top:1px dashed #999;padding-top:6px;text-align:center;color:#444}
.ft{position:absolute;bottom:8mm;left:13mm;right:13mm;border-top:1px solid #e3e3e3;padding-top:5px;font-size:9.5px;color:#888;display:flex;justify-content:space-between}
.k-p{color:#1E7B46;font-weight:700}.k-a{color:#B3261E;font-weight:700}.k-l{color:#9A6A00;font-weight:700}.k-e{color:#2F5C9A;font-weight:700}
.letter p{font-size:14px;line-height:2}
.cert{border:3px double #C9A54C;outline:10px solid #1F5136;outline-offset:-22px;padding:22mm 20mm;text-align:center}
.cert img.logo{width:120px}.cert h1{font-size:30px;margin:8px 0 2px}.cert .en{color:#8a6d22;font-size:12px;letter-spacing:1px}
.cert .who{font-size:26px;color:#1F5136;font-weight:700;margin:16px 0 6px}.cert p{font-size:15px;line-height:2}
.cert .qr{position:absolute;bottom:20mm;left:22mm;text-align:center;font-size:9.5px;color:#555}.cert .qr svg{width:92px;height:92px}
.cert{position:relative;min-height:178mm}
.cert .sig3{grid-template-columns:1fr 36mm 1fr;align-items:end;margin:22px 32mm 0 32mm;gap:10px}.cert .sig3 .stc{border:0;padding:0;min-height:30mm;display:grid;place-items:center}
.cert .stamp{width:32mm;transform:rotate(-8deg);opacity:.92}
.cert .lic{position:absolute;bottom:12mm;right:0;left:0;text-align:center;font-size:9.5px;color:#777}
.page.cards{padding:8mm 6mm}
.cardsGrid{display:grid;grid-template-columns:repeat(2,85.6mm);gap:7mm 6mm;justify-content:center;align-content:start}
.idc{width:85.6mm;height:54mm;border-radius:3.2mm;overflow:hidden;position:relative;border:.3mm solid #c9d2cc;background:#fff;display:grid;grid-template-rows:13.5mm 1fr 1.6mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}
.idc .top{background:#1F5136;color:#fff;display:flex;align-items:center;gap:2.5mm;padding:0 3mm}
.idc .top img{width:9.5mm;height:9.5mm;background:#fff;border-radius:2mm;padding:.6mm;object-fit:contain}
.idc .top b{display:block;font-size:7.6pt;line-height:1.25}.idc .top span{display:block;font-size:4.9pt;color:#E3C77C;letter-spacing:.2px;line-height:1.3}
.idc .body{display:flex;gap:2.6mm;padding:2.6mm 3mm;align-items:center;position:relative;overflow:hidden}
.idc .ph{flex:none;width:17mm;height:20.5mm;border-radius:1.6mm;overflow:hidden;border:.3mm solid #E3C77C;position:relative;z-index:1}.idc .ph svg{width:100%;height:100%;display:block}
.idc .wm{position:absolute;left:50%;top:50%;width:30mm;transform:translate(-50%,-50%);opacity:.06;z-index:0}
.idc .inf,.idc .qr{position:relative;z-index:1}
.idc .qr svg{width:18mm;height:18mm;display:block}
.idc .inf{flex:1;display:grid;gap:.6mm;min-width:0}
.idc .tag{font-size:6.4pt;color:#8a6d22;font-weight:700}
.idc .nm{font-size:10pt;font-weight:700;color:#1F5136;line-height:1.3}
.idc .no{font-size:6.6pt;color:#555}.idc .no b{font-family:ui-monospace,Menlo,monospace;font-size:10.5pt;color:#1d2621;letter-spacing:.6px}
.idc .yr{font-size:6pt;color:#777}
.idc .strip{background:linear-gradient(90deg,#C9A54C,#E3C77C,#C9A54C)}
.sig div{position:relative}.sig .sgi{position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);max-height:20mm;max-width:58mm}
.sig .stp{position:absolute;bottom:calc(100% - 8mm);left:50%;transform:translateX(-10%) rotate(-8deg);width:28mm;opacity:.9}
img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page.certp{padding:7mm}
.c2{position:relative;height:184mm;background:#FCFAF3;border:2.2mm solid #1F5136;outline:.5mm solid #C9A54C;outline-offset:-4.2mm;padding:9mm 18mm 7mm;text-align:center;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;flex-direction:column;align-items:center}
.c2::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(201,165,76,.16),transparent 55%),radial-gradient(circle at 50% 100%,rgba(31,81,54,.08),transparent 50%);pointer-events:none}
.c2 .cn{position:absolute;width:20mm;height:20mm}.c2 .cn svg{width:100%;height:100%}
.c2 .tl{top:5.5mm;left:5.5mm;transform:scaleX(1)}.c2 .tr{top:5.5mm;right:5.5mm;transform:scaleX(-1)}.c2 .bl{bottom:5.5mm;left:5.5mm;transform:scaleY(-1)}.c2 .br{bottom:5.5mm;right:5.5mm;transform:scale(-1,-1)}
.c2wm{position:absolute;width:105mm;left:50%;top:52%;transform:translate(-50%,-50%);opacity:.05}
.c2 > :not(.cn):not(.c2wm){position:relative}
.c2hd{display:flex;align-items:center;gap:4mm;justify-content:center}.c2hd img{height:17mm}.c2hd b{display:block;font-family:"Reem Kufi","IBM Plex Sans Arabic",sans-serif;font-size:15pt;color:#1F5136;line-height:1.3;text-align:right}.c2hd span{display:block;font-size:7.5pt;color:#9A7A2E;letter-spacing:.6px;text-align:right}
.c2title{display:flex;align-items:center;gap:5mm;margin-top:5mm}.c2title i{display:block;width:32mm;height:.5mm;background:linear-gradient(90deg,transparent,#C9A54C)}.c2title i:last-child{background:linear-gradient(90deg,#C9A54C,transparent)}
.c2title h1{font-family:"Reem Kufi","IBM Plex Sans Arabic",sans-serif;font-size:31pt;color:#B48E3A;margin:0;line-height:1.15}
.c2en{font-size:8.5pt;letter-spacing:5px;color:#1F5136;margin-top:1mm}
.c2lead{font-size:12.5pt;margin:5mm 0 1mm;color:#333}
.c2name{font-family:"Reem Kufi","IBM Plex Sans Arabic",sans-serif;font-size:27pt;color:#1F5136;line-height:1.3;padding:0 10mm 1.5mm;border-bottom:.6mm solid #C9A54C}
.c2num{font-size:9.5pt;color:#777;margin-top:1.2mm}
.c2body{font-size:12.5pt;margin:3.5mm 0 0;color:#333}
.c2course{font-size:16pt;font-weight:700;color:#1F5136;margin-top:1mm}
.c2facts{display:flex;gap:3mm;justify-content:center;flex-wrap:wrap;margin-top:3.5mm}
.c2facts span{border:.35mm solid #E3D3A6;background:#fff;border-radius:3mm;padding:1.4mm 4mm;font-size:10pt;color:#1d2621;display:grid}.c2facts small{font-size:7pt;color:#9A7A2E}
.c2date{font-size:10.5pt;color:#555;margin:3.5mm 0 0}
.c2sig{margin-top:auto;width:100%;display:grid;grid-template-columns:1fr 34mm 1fr;align-items:end;gap:10mm}
.c2sig .s{position:relative;border-top:.35mm solid #9A7A2E;padding-top:1.5mm;font-size:10pt;color:#333;min-height:9mm}
.c2sig .s .sgi{position:absolute;bottom:calc(100% + 1mm);left:50%;transform:translateX(-50%);max-height:17mm;max-width:52mm}
.c2sig .s .stp{position:absolute;bottom:calc(100% - 3mm);left:14%;transform:rotate(-10deg);width:28mm;opacity:.88}
.c2sig .q{display:grid;justify-items:center;gap:1mm}.c2sig .q svg{width:22mm;height:22mm;display:block;background:#fff;padding:1mm}.c2sig .q small{font-size:7pt;color:#666;direction:ltr}
.c2lic{font-size:8pt;color:#8a8a8a;margin-top:3mm}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;width:auto;min-height:auto}}
`;
const fillPrintFin = (w, title, pages, land) => fillPrint(w, title, pages, land, "المالية");
function fillPrint(w, title, pages, land, dept){
  if (!w) return;
  const head = `<header class="hd"><img src="${SITE()}logo-mark.png" alt=""><div class="t"><b>${INST_AR}</b><span>${INST_EN}</span></div><div class="meta">${esc(dept || "الشؤون الأكاديمية")}<br>${esc(bothDates(today()))}${S.site && S.site.accNo ? `<br>رقم الرخصة: ${esc(S.site.accNo)}` : ""}</div>${S._licQR && S.site && S.site.licUrl === S._licQRurl ? `<div class="licq">${S._licQR}</div>` : ""}</header>`;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Reem+Kufi:wght@600;700&display=swap" rel="stylesheet">
  <style>${PRINT_CSS}${land ? "@page{size:A4 landscape}" : ""}</style></head><body>
  <div class="bar"><span>${esc(title)}</span><button onclick="print()">طباعة / حفظ PDF</button></div>
  ${pages.map(pg => `<section class="page${land ? " land" : ""}${pg.cls ? " " + pg.cls : ""}">${pg.noHead ? "" : head}${pg.html}${pg.noFoot ? "" : `<div class="ft"><span>${INST_AR}</span><span>${esc(title)}</span></div>`}</section>`).join("")}
  <script>(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>print(),400))<\/script></body></html>`);
  w.document.close();
}
const KS = {p: "ح", l: "ت", a: "غ", e: "م"};
function groupSheetData(g, docs){
  const {sessions, rows} = matrix(g, docs);
  return {sessions, rows: rows.map(r => ({...r, cells: r.cells.map(c => c.st || "a")}))};
}
function printGroupSheet(g, docs){
  const w = openPrint(); if (!w) return;
  const {sessions, rows} = groupSheetData(g, docs);
  const html = `<h1>كشف الحضور والغياب</h1>
    <div class="info"><div><b>المقرر:</b> ${esc(g.course)}</div><div><b>المدرب/ة:</b> ${esc(tName(g.trainerId))}</div>
    <div><b>عدد المتدربين:</b> ${(g.students || []).length}</div><div><b>المحاضرات:</b> ${sessions.length}${g.totalSessions ? " من " + g.totalSessions : ""} · الحرمان عند ${TH().deny}% غياب</div></div>
    <table><thead><tr><th>م</th><th>الاسم</th><th>الرقم</th>${sessions.map(d => `<th>${esc(d.date.slice(5))}</th>`).join("")}<th>حضور</th><th>غياب</th><th>النسبة</th><th>الحالة</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.i + 1}</td><td class="n">${esc(r.s.name)}</td><td>${esc(r.s.sid || "")}</td>${r.cells.map(k => `<td class="k-${k}">${KS[k]}</td>`).join("")}<td>${r.st.attPct === null ? "—" : r.st.attPct + "%"}</td><td>${r.st.a}</td><td>${r.st.absPct}%</td><td>${LEVEL[r.st.level]}</td></tr>`).join("")}
    </tbody></table><p style="font-size:10.5px;color:#666">ح حاضر · ت متأخر · غ غائب · م مستأذن/عذر مقبول</p>
    <div class="sig"><div>المدرب/ة</div>${sigSlot("الشؤون الأكاديمية", "academic")}</div>`;
  fillPrint(w, `كشف حضور ${g.course}`, [{html}], sessions.length > 8);
  logAction("طباعة كشف حضور", g.course);
}
let _xlsx = null;
const loadXLSX = async () => _xlsx || (_xlsx = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"));
async function excelDownload(name, sheets){
  let X; try { X = await loadXLSX(); } catch { return toast("تعذّر تحميل أداة Excel، تأكد من الاتصال"); }
  const wb = X.utils.book_new();
  sheets.forEach(({title, rows, widths}) => { const ws = X.utils.aoa_to_sheet(rows); if (widths) ws["!cols"] = widths.map(wch => ({wch})); X.utils.book_append_sheet(wb, ws, title.slice(0, 31)); });
  wb.Workbook = {Views: [{RTL: true}]};
  X.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, "-") + ".xlsx");
}
function excelGroupSheet(g, docs){
  const {sessions, rows} = groupSheetData(g, docs);
  const data = [[INST_AR], [`كشف الحضور والغياب · ${g.course} · ${tName(g.trainerId)}`], [`تاريخ الإصدار: ${bothDates(today())}`], [],
    ["م", "الاسم", "الرقم", ...sessions.map(d => d.date), "حضور %", "غياب", "نسبة الغياب %", "الحالة"],
    ...rows.map(r => [r.i + 1, r.s.name, r.s.sid || "", ...r.cells.map(k => STATUS[k]), r.st.attPct, r.st.a, r.st.absPct, LEVEL[r.st.level]])];
  excelDownload(`كشف حضور - ${g.course} - ${tName(g.trainerId)}`, [{title: "الحضور", rows: data, widths: [5, 28, 11, ...sessions.map(() => 11), 8, 7, 12, 14]}]);
  logAction("تصدير Excel", g.course);
}
async function studentReportData(num){
  const snap = await getDocs(query(collection(db, "att"), where("memberNums", "array-contains", num)));
  const docs = snap.docs.map(d => d.data());
  const gs = Object.values(S.groups).filter(g => (g.memberNums || []).includes(num)).sort((a, b) => (a.course || "").localeCompare(b.course || "", "ar"));
  return gs.map(g => { const e = (g.students || []).find(x => x.sid === num); const ds = countable(docs.filter(d => d.groupId === g.id)).sort((a, b) => a.date.localeCompare(b.date)); return {g, e, ds, st: absStats(g, e ? e.id : "", ds)}; });
}
async function printStudentReport(num){
  const w = openPrint(); if (!w) return;
  const s = S.students[num]; const data = await studentReportData(num);
  const html = `<h1>كشف حضور متدرب</h1>
    <div class="info"><div><b>الاسم:</b> ${esc(s.name)}</div><div><b>الرقم الأكاديمي:</b> ${esc(num)}</div></div>
    <table><thead><tr><th>المقرر</th><th>المدرب/ة</th><th>المحاضرات</th><th>حضور</th><th>تأخير</th><th>غياب</th><th>عذر</th><th>نسبة الغياب</th><th>الحالة</th></tr></thead><tbody>
    ${data.map(({g, st}) => `<tr><td class="n">${esc(g.course)}</td><td class="n">${esc(tName(g.trainerId))}</td><td>${st.held}${st.total ? "/" + st.total : ""}</td><td>${st.p}</td><td>${st.l}</td><td>${st.a}</td><td>${st.e}</td><td>${st.absPct}%</td><td>${LEVEL[st.level]}</td></tr>`).join("")}
    </tbody></table>
    ${data.map(({g, e, ds}) => ds.length ? `<h3 style="color:#1F5136;margin:16px 0 6px">${esc(g.course)}</h3><table><thead><tr>${ds.map(d => `<th>${esc(d.date.slice(5))}</th>`).join("")}</tr></thead><tbody><tr>${ds.map(d => { const k = (e && d.rec && d.rec[e.id] && d.rec[e.id].st) || "a"; return `<td class="k-${k}">${KS[k]}</td>`; }).join("")}</tr></tbody></table>` : "").join("")}
    <div class="sig">${sigSlot("الشؤون الأكاديمية", "academic")}${sigSlot("الختم", "", true)}</div>`;
  fillPrint(w, `كشف حضور ${s.name}`, [{html}]);
  logAction("طباعة كشف متدرب", `${s.name} · ${num}`);
}
async function excelStudentReport(num){
  const s = S.students[num]; const data = await studentReportData(num);
  const rows = [[INST_AR], [`كشف حضور: ${s.name} · ${num}`], [`تاريخ الإصدار: ${bothDates(today())}`], [], ["المقرر", "المدرب/ة", "المحاضرات", "حضور", "تأخير", "غياب", "عذر", "نسبة الغياب %", "الحالة"],
    ...data.map(({g, st}) => [g.course, tName(g.trainerId), st.held, st.p, st.l, st.a, st.e, st.absPct, LEVEL[st.level]])];
  excelDownload(`كشف حضور - ${s.name}`, [{title: "الحضور", rows, widths: [28, 22, 10, 7, 7, 7, 7, 12, 14]}]);
}
function warningLetter(w){
  const deny = w.level === 3, title = deny ? "إشعار حرمان بسبب الغياب" : `${w.levelName} بسبب الغياب`;
  return `<div class="letter"><h1>${title}</h1>
    <div class="info"><div><b>المتدرب/ة:</b> ${esc(w.name)}</div><div><b>الرقم الأكاديمي:</b> ${esc(w.num)}</div>
    <div><b>المقرر:</b> ${esc(w.course)}</div><div><b>تاريخ الإصدار:</b> ${esc(bothDates(w.date))}</div></div>
    <p>نفيدكم بأن غيابكم في المقرر المذكور بلغ <b>(${w.absences ?? "—"})</b> محاضرة، بنسبة <b>${w.absPct}%</b>${(S.groups[w.groupId] || {}).totalSessions ? ` من إجمالي محاضرات المقرر (${S.groups[w.groupId].totalSessions})` : ""}.</p>
    <p>وبناءً على لائحة الحضور والغياب المعتمدة في المعهد، فقد صدر بحقكم <b>${esc(w.levelName)}</b>${deny ? "، وتُطبَّق بحقكم إجراءات الحرمان وفق اللائحة." : `، علماً بأن الحرمان يقع عند بلوغ نسبة الغياب ${TH().deny}%. نأمل منكم الالتزام بالحضور.`}</p>
    <p>والله ولي التوفيق.</p>
    <div class="sig">${sigSlot("الشؤون الأكاديمية<br><small>الاسم والتوقيع والختم</small>", "academic", true)}<div>المتدرب/ة<br><small>اطلعت · التوقيع · التاريخ</small></div></div></div>`;
}
function printWarnings(list){
  const w = openPrint(); if (!w) return;
  fillPrint(w, list.length === 1 ? `${list[0].levelName} · ${list[0].name}` : `الإنذارات (${list.length})`, list.map(x => ({html: warningLetter(x)})));
  logAction("طباعة إنذارات", list.map(x => x.name).join("، "));
}
let _qr = null;
const loadQR = () => _qr || (_qr = new Promise((ok, no) => { if (window.qrcode) return ok(window.qrcode); const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"; sc.onload = () => ok(window.qrcode); sc.onerror = no; document.head.appendChild(sc); }));
const verifyUrl = code => `${SITE()}?verify=${code}`;
const CORNER = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M2 58V14Q2 2 14 2h44" fill="none" stroke="#C9A54C" stroke-width="1.6"/><path d="M8 58V18Q8 8 18 8h40" fill="none" stroke="#C9A54C" stroke-width=".7"/><path d="M14 14l6-6 6 6-6 6z" fill="#C9A54C"/><circle cx="20" cy="14" r="1.6" fill="#1F5136"/></svg>`;
async function certPage(c){
  let svg = "";
  try { const qrcode = await loadQR(); const q = qrcode(0, "M"); q.addData(verifyUrl(c.code)); q.make(); svg = q.createSvgTag({cellSize: 3, margin: 0}); } catch {}
  const f = c.gender === "f", course = c.kind === "course";
  const facts = course
    ? [c.hours ? ["المدة", `${esc(c.hours)} ساعة تدريبية`] : null, c.from ? ["الفترة", `${esc(greg(c.from))}${c.to && c.to !== c.from ? " – " + esc(greg(c.to)) : ""}`] : null, c.trainer ? ["المدرب/ة", esc(c.trainer)] : null].filter(Boolean)
    : [["المدرب/ة", esc(c.trainer || "")], ["نسبة الحضور", `${c.attPct}%`]];
  const body = course
    ? `قد ${f ? "حضرت" : "حضر"} الدورة التدريبية`
    : `قد ${f ? "حضرت" : "حضر"} المقرر التدريبي`;
  return {noHead: true, noFoot: true, cls: "certp", html: `<div class="c2">
    <span class="cn tl">${CORNER}</span><span class="cn tr">${CORNER}</span><span class="cn bl">${CORNER}</span><span class="cn br">${CORNER}</span>
    <img class="c2wm" src="${SITE()}logo-mark-t.png" alt="">
    <header class="c2hd"><img src="${SITE()}logo-mark-t.png" alt=""><div><b>${INST_AR}</b><span>${INST_EN}</span></div></header>
    <div class="c2title"><i></i><h1>شهادة حضور</h1><i></i></div>
    <div class="c2en">CERTIFICATE OF ATTENDANCE</div>
    <p class="c2lead">يشهد ${INST_AR} بأن ${f ? "المتدربة" : "المتدرب"}</p>
    <div class="c2name">${esc(c.name)}</div>
    ${c.num ? `<div class="c2num">الرقم التدريبي ${esc(c.num)}</div>` : ""}
    <p class="c2body">${body}</p>
    <div class="c2course">«${esc(c.course)}»</div>
    <div class="c2facts">${facts.map(([k, v]) => `<span><small>${k}</small>${v}</span>`).join("")}</div>
    <p class="c2date">وأُصدرت ${f ? "لها" : "له"} هذه الشهادة بتاريخ ${esc(bothDates(c.date))}</p>
    <div class="c2sig">
      <div class="s">${sgImg("academic")}<span>مسؤول الشؤون الأكاديمية</span></div>
      <div class="q">${svg}<small>للتحقق: ${esc(c.code)}</small></div>
      <div class="s">${sgImg("director")}${stpImg()}<span>مدير المعهد</span></div>
    </div>
    ${S.site && S.site.accNo ? `<div class="c2lic">مرخّص من المؤسسة العامة للتدريب التقني والمهني · رقم الرخصة ${esc(S.site.accNo)}</div>` : ""}
  </div>`};
}
async function printCerts(list){
  const w = openPrint(); if (!w) return;
  const pages = []; for (const c of list) pages.push(await certPage(c));
  fillPrint(w, list.length === 1 ? `شهادة حضور · ${list[0].name}` : `شهادات حضور (${list.length})`, pages, true);
}
const certCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(10)); r.forEach(x => s += a[x % a.length]); return s; };
function renderVerify(app){
  const bindV = () => { const b = $("#vPrint"); if (b) b.onclick = () => printCerts([S._vCert]); };
  if (S._vHTML) { app.innerHTML = S._vHTML; bindV(); return; }
  if (S._vBusy) return; S._vBusy = true;
  app.innerHTML = `<div class="card" style="max-width:560px;width:100%;justify-self:center;text-align:center"><p class="muted">جاري التحقق…</p></div>`;
  const done = () => { S._vHTML = app.innerHTML; };
  getDoc(ref("certs/" + S.verify)).then(snap => {
    if (!snap.exists() || snap.data().revoked) { app.innerHTML = `<div class="card" style="max-width:560px;width:100%;justify-self:center;text-align:center"><h2 style="color:var(--abs)">الشهادة غير موجودة</h2><p>رمز التحقق <b dir="ltr">${esc(S.verify)}</b> غير صحيح، أو الشهادة ملغاة.</p></div>`; return done(); }
    const c = snap.data();
    app.innerHTML = `<div class="card" style="max-width:560px;width:100%;justify-self:center;text-align:center">
      <img src="logo-mark.png" alt="" style="width:90px"><h2 style="color:var(--ok)">✓ شهادة حضور صحيحة</h2>
      <div class="list" style="text-align:right">
        <div class="item"><span class="grow">الاسم</span><b>${esc(c.name)}</b></div>
        ${c.num ? `<div class="item"><span class="grow">الرقم التدريبي</span><b>${esc(c.num)}</b></div>` : ""}
        <div class="item"><span class="grow">${c.kind === "course" ? "الدورة" : "المقرر"}</span><b>${esc(c.course)}</b></div>
        ${c.kind === "course" ? `${c.hours ? `<div class="item"><span class="grow">عدد الساعات</span><b>${esc(c.hours)}</b></div>` : ""}${c.from ? `<div class="item"><span class="grow">الفترة</span><b>${esc(c.from)}${c.to && c.to !== c.from ? " ← " + esc(c.to) : ""}</b></div>` : ""}` : `<div class="item"><span class="grow">نسبة الحضور</span><b>${c.attPct}%</b></div>`}
        <div class="item"><span class="grow">تاريخ الإصدار</span><b>${esc(bothDates(c.date))}</b></div>
        <div class="item"><span class="grow">رمز التحقق</span><b dir="ltr">${esc(c.code)}</b></div>
      </div><p class="muted">صادرة من ${INST_AR}</p>
      <button class="btn gold" id="vPrint">عرض الشهادة وطباعتها</button></div>`;
    S._vCert = c;
    done(); bindV();
  }).catch(() => { app.innerHTML = `<div class="notice err">تعذّر التحقق، حاول مرة ثانية.</div>`; });
}

/* ---------- attendance matrix ---------- */
function matrix(g, docs){
  const sessions = countable(docs).sort((a,b) => a.date.localeCompare(b.date));
  const rows = (g.students||[]).map((s,i) => {
    const cells = sessions.map(d => (d.rec && d.rec[s.id]) || {});
    const st = absStats(g, s.id, sessions);
    return {s, i, cells, k: st, st, rate: st.attPct};
  });
  return {sessions, rows};
}
function matrixTable(g, docs){
  const {sessions, rows} = matrix(g, docs);
  if (!sessions.length) return `<div class="card empty">ما فيه محاضرات مسجلة لهذا المقرر بعد.</div>`;
  const cell = r => r.st ? `<span class="pill ${r.st}">${STATUS[r.st]}</span>${r.in ? `<div class="muted" style="font-size:11.5px">${fmtTime(r.in)}${r.out ? " ← " + fmtTime(r.out) : ""}</div>` : ""}` : `<span class="muted">—</span>`;
  return `<div class="row" style="justify-content:space-between"><span class="muted">${sessions.length} محاضرة مسجلة${g.totalSessions ? ` من ${g.totalSessions}` : ""} · الخانة الفاضية تُحسب غياب · الحرمان عند ${TH().deny}% غياب</span><button class="btn sm" id="copyT">نسخ الجدول</button></div>
  <div class="tbl"><table id="mt"><thead><tr><th>م</th><th class="nm">الاسم</th><th>الحضور</th><th>غياب</th><th>نسبة الغياب</th><th>الحالة</th><th>تأخير</th><th>استئذان</th>${sessions.map(d => `<th>${esc(d.date.slice(5))}</th>`).join("")}</tr></thead>
  <tbody>${rows.map(r => `<tr><td>${r.i+1}</td><td class="nm">${esc(r.s.name)}</td>
    <td><div class="row" style="gap:6px;flex-wrap:nowrap"><b>${r.rate}%</b><span class="bar"><i style="width:${r.rate}%"></i></span></div></td>
    <td>${r.k.a}</td><td>${r.st.absPct}%</td><td>${levelPill(r.st)}</td><td>${r.k.l}</td><td>${r.k.e}</td>${r.cells.map(c => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function bindCopy(){
  const b = $("#copyT"); if (!b) return;
  b.onclick = async () => {
    const tsv = [...$("#mt").rows].map(tr => [...tr.cells].map(td => td.innerText.replace(/\s+/g, " ").trim()).join("\t")).join("\n");
    try { await navigator.clipboard.writeText(tsv); toast("انتسخ الجدول، الصقه في Excel"); } catch { toast("المتصفح منع النسخ"); }
  };
}

/* ---------- admin portal ---------- */
function stopAdminSubs(){ if (S.unsubDash) S.unsubDash(); if (S.unsubReport) S.unsubReport(); if (S.unsubLogs) S.unsubLogs(); S.unsubDash = S.unsubReport = S.unsubLogs = null; }
const tName = id => id && S.trainers[id] ? trainerTitle(S.trainers[id]) : "بدون مدرب";
const sortedGroups = () => Object.values(S.groups).sort((a,b) => (a.course||"").localeCompare(b.course||"","ar") || tName(a.trainerId).localeCompare(tName(b.trainerId),"ar"));
const memberNums = students => [...new Set((students || []).map(s => s.sid).filter(Boolean))];
const nextNum = () => { const nums = Object.keys(S.students).map(Number).filter(n => n > 20260000); return String(Math.max(20260000, ...nums) + 1); };
function findStudent(name, gender){
  const k = norm(name);
  return Object.values(S.students).find(s => norm(s.name) === k && (!gender || s.gender === gender));
}
async function createStudent(name, gender, num, code){
  num = num || nextNum(); code = code || newCode();
  S.students[num] = {num, name, gender};             // reserve the number locally
  const acc = await createAccount("st-" + num, 0, code);
  const d = {num, name, gender, ...acc};
  const pubSnap = await getDoc(ref("public/studentLogin"));
  const map = (pubSnap.exists() && pubSnap.data().map) || {};
  map[num] = acc.ver;
  const b = writeBatch(db);
  b.set(ref("students/" + num), d); b.set(ref("studentSecrets/" + num), {code}); b.set(ref("public/studentLogin"), {map});
  await b.commit();
  S.students[num] = d; S.stSecrets[num] = code; logAction("إضافة طالب", `${name} · ${num}`);
  return d;
}
function writeGroup(gid, d){
  logAction("تعديل شعبة", d.course, "grp:" + gid);
  delete d.id; d.memberNums = memberNums(d.students);
  S.groups[gid] = {id: gid, ...d}; saveDoc("groups/" + gid, d);
}

function renderAdmin(app){
  if (RO()) {
    const tabsRO = [["tasks", "المهام" + taskBadge()], ["memos", "المراسلات" + memoBadge()], ["weekly", "التقرير الأسبوعي"], ["dash", "لوحة اليوم"], ["kpi", "المؤشرات"], ["follow", "المتابعة"], ["report", "التقارير"], ["finance", "المالية"], ["hr", "الموارد البشرية"], ["trmsgs", "رسائل المدربين"], ["sreq", "طلبات الإجازة"], ["logs", "سجل الإدارات"], ["archive", "الأرشيف"]];
    if (!tabsRO.some(([k]) => k === S.aTab)) S.aTab = "tasks";
    app.innerHTML = `<div class="notice">بوابة الجهة الرقابية: تطّلع على كل أعمال المعهد وتصدّرها، وترسل مهام للإدارات وتستلم تقاريرها. التعديل على البيانات يبقى عند الإدارات.</div><div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${tabsRO.map(([k,v]) => `<button class="tab ${S.aTab===k?"on":""}" data-at="${k}">${v}</button>`).join("")}</div></div><div id="ab"></div>`;
    app.querySelectorAll("[data-at]").forEach(b => b.onclick = () => { S.aTab = b.dataset.at; render(); });
    ({tasks: tasksTab, memos: memosTab, weekly: weeklyTab, dash: adminDash, kpi: adminKpi, follow: adminFollow, report: adminReport, finance: adminFinance, hr: hrTab, trmsgs: adminTrMsgs, sreq: staffReqsView, logs: adminLogs, archive: adminArchive})[S.aTab]($("#ab"));
    if (["finance", "hr", "logs"].includes(S.aTab)) ownerReadOnly($("#ab"));
    if (RO()) app.querySelectorAll("#ab [data-issue], #issueAll, #cIssue, [data-rc], [data-twa], [data-wabs], [data-warn]").forEach(x => x.remove());
    return;
  }
  if (FIN()) {
    app.innerHTML = `<div id="ab"></div>`; adminFinance($("#ab")); return;
  }
  if (MAILONLY()) {
    const mt = [...(S.adminRole === "hr" ? [["hr", "الموارد البشرية"]] : []), ["memos", "المراسلات" + memoBadge()], ["mail", "البريد" + mailBadge()], ["tasks", "مهام الجهة الرقابية" + taskBadge()], ["sreq", "طلبات الإجازة" + srBadge()]];
    if (!mt.some(([k]) => k === S.aTab)) S.aTab = mt[0][0];
    app.innerHTML = `<div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${mt.map(([k, v]) => `<button class="tab ${S.aTab === k ? "on" : ""}" data-at="${k}">${v}</button>`).join("")}</div></div><div id="ab"></div>`;
    app.querySelectorAll("[data-at]").forEach(b => b.onclick = () => { S.aTab = b.dataset.at; render(); });
    ({hr: hrTab, memos: memosTab, mail: mailTab, tasks: tasksTab, sreq: staffReqsView})[S.aTab]($("#ab")); return;
  }
  const tabs = [["dash","لوحة اليوم"],["kpi","المؤشرات"],["groups","المقررات والطلاب"],["students","الطلاب"],["msgs","الرسائل الجماعية"],["trainers","المدربين والرموز"],["grades","الدرجات"],["exams","الاختبارات"],["camp","المعسكر"],["follow","المتابعة"],["excuses","الأعذار"],["areqs","طلبات الطلاب" + ((S.aReqs || []).some(r => r.status === "new") ? ` (${S.aReqs.filter(r => r.status === "new").length})` : "")],["evals","التقييمات"],["report","التقارير"],["courses","الدورات والشهادات"],["sign","طلبات التوقيع"],["tasks","مهام الجهة الرقابية" + taskBadge()],["trmsgs","رسائل المدربين" + trmBadge()],["sreq","طلبات الإجازة" + srBadge()],["memos","المراسلات" + memoBadge()],["mail","البريد" + mailBadge()],...(MEET() ? [["live","المحاضرات والتسجيلات"]] : []),["system","النظام"],...(S.adminRole === "admin" ? [["hr","الموارد البشرية"]] : []),...(SEES_FIN() ? [["finance","المالية" + ((S.fReqs || []).some(r => r.status === "fin_signed") ? ` (${(S.fReqs || []).filter(r => r.status === "fin_signed").length})` : "")]] : []),["archive","الأرشيف"],...(S.adminRole === "admin" ? [["weekly","التقرير الأسبوعي"],["logs","السجل"]] : [])];
  if (!tabs.some(([k]) => k === S.aTab)) S.aTab = "dash";
  const waiting = Object.values(S.grades).filter(x => x.status === "submitted").length;
  app.innerHTML = `${backupNag()}${quotaNag()}${absNag()}${S.sys && S.sys.maintenance ? `<div class="notice err">وضع الصيانة شغّال: الموقع مقفل على الكل ما عدا الإدارة. تطفيه من تبويب "النظام".</div>` : ""}<div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${tabs.map(([k,v]) => `<button class="tab ${S.aTab===k?"on":""}" data-at="${k}">${v}${k === "grades" && waiting ? ` (${waiting})` : ""}${k === "follow" && S.allAtt && ["academic", "admin"].includes(S.adminRole) ? (n => n ? ` (${n})` : "")(absAlerts().alerts.filter(alertWaiting).length) : ""}${k === "excuses" && (S.excuses || []).filter(x => x.status === "pending").length ? ` (${S.excuses.filter(x => x.status === "pending").length})` : ""}</button>`).join("")}</div></div><div id="ab"></div>`;
  app.querySelectorAll("[data-at]").forEach(b => b.onclick = () => { S.aTab = b.dataset.at; render(); });
  if ($("#nagAbs")) $("#nagAbs").onclick = () => { S.aTab = "follow"; render(); };
  if ($("#nagBk")) $("#nagBk").onclick = async e => { e.target.disabled = true; try { await backupAll(); toast("نزلت النسخة الاحتياطية"); render(); } catch (x) { console.error(x); toast("تعذّر أخذ النسخة"); e.target.disabled = false; } };
  ({dash: adminDash, kpi: adminKpi, groups: adminGroups, students: adminStudents, msgs: adminMessages, trainers: adminTrainers, grades: adminGrades, exams: adminExams, camp: campTab, hr: hrTab, follow: adminFollow, excuses: adminExcuses, areqs: adminAcReqs, evals: adminEvals, report: adminReport, courses: adminCourses, sign: signRequests, tasks: tasksTab, weekly: weeklyTab, trmsgs: adminTrMsgs, sreq: staffReqsView, memos: memosTab, mail: mailTab, live: liveTab, system: el => { adminSystem(el); attArchiveCard(el); }, archive: adminArchive, finance: adminFinance, logs: adminLogs})[S.aTab]($("#ab"));
}

function adminDash(el){
  if (!S.unsubDash) {
    S.unsubDash = onSnapshot(query(collection(db, "att"), where("date", "==", today())), snap => { S.aDash = snap.docs.map(d => d.data()); if (S.view === "admin" && S.aTab === "dash") render(); }, () => {});
  }
  const byG = {}; S.aDash.forEach(d => byG[d.groupId] = d);
  const gs = sortedGroups();
  const absentToday = [];
  gs.forEach(g => { const d = byG[g.id]; if (!d) return; (g.students || []).forEach(s => { const r = d.rec && d.rec[s.id]; if (r && r.st === "a") absentToday.push({name: s.name, sid: s.sid, course: g.course}); }); });
  let pres = 0, abs = 0, done = 0;
  const rows = gs.map(g => {
    const d = byG[g.id], n = (g.students||[]).length;
    const c = {p:0,l:0,a:0,e:0}; if (d) { done++; Object.values(d.rec||{}).forEach(r => r.st && c[r.st]++); }
    pres += c.p + c.l; abs += c.a;
    return `<tr><td class="nm">${esc(g.course)}</td><td class="nm">${esc(tName(g.trainerId))}</td><td>${n}</td>
      <td>${d ? `<span class="pill p">${c.p + c.l}</span>` : "—"}</td><td>${d ? `<span class="pill a">${c.a}</span>` : "—"}</td><td>${d ? c.e : "—"}</td>
      <td>${d ? `<span class="pill p">تم التحضير</span>` : `<span class="pill">لم يُحضّر</span>`}</td></tr>`;
  }).join("");
  const nStu = Object.keys(S.students).length;
  let excused = 0; S.aDash.forEach(d => Object.values(d.rec || {}).forEach(r => { if (r.st === "e") excused++; }));
  const todayRate = pres + abs + excused ? Math.round(pres / (pres + abs + excused) * 100) : null;
  const dname = todayDay(), now = nowHM(), hol = isHoliday(today());
  const due = hol ? [] : gs.flatMap(g => (g.sessions || []).filter(x => x.day === dname).map(x => ({g, x}))).filter(({g}) => !byG[g.id]);
  const seen = new Set(), missing = due.filter(({g}) => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => a.x.from.localeCompare(b.x.from));
  el.innerHTML = `
  <div class="card"><h2>لوحة اليوم · ${esc(fmtDate(today()))}</h2>
    <div class="stats">
      <div class="stat"><div class="n">${done}/${gs.length}</div><div class="l">شعب تم تحضيرها</div></div>
      <div class="stat"><div class="n">${pres}</div><div class="l">حاضر ومتأخر</div></div>
      <div class="stat"><div class="n">${abs}</div><div class="l">غائب</div></div>
      <div class="stat"><div class="n">${nStu}</div><div class="l">طالب وطالبة</div></div>
      <div class="stat"><div class="n">${todayRate === null ? "—" : todayRate + "%"}</div><div class="l">نسبة حضور اليوم</div></div>
    </div>
    ${hol ? `<div class="notice" style="margin-top:10px">اليوم إجازة: ${esc(hol.label || "رسمية")}</div>` : ""}</div>
  ${missing.length ? `<div class="card"><h2>متابعة المدربين · ما حضّروا اليوم (${missing.length})</h2>
    <div class="list">${missing.map(({g, x}) => `<div class="item"><div class="grow"><div class="t">${esc(tName(g.trainerId))}</div><div class="muted">${esc(g.course)} · ${fmtTime(x.from)} – ${fmtTime(x.to)}</div></div>
      <span class="pill ${now > x.to ? "a" : now >= x.from ? "l" : ""}">${now > x.to ? "انتهت المحاضرة" : now >= x.from ? "المحاضرة الآن" : "لم تبدأ"}</span>
      ${g.trainerId && S.trainers[g.trainerId] ? `<button class="btn sm gold" data-twa="${esc(g.trainerId)}">واتساب</button>` : ""}</div>`).join("")}</div></div>` : ""}
  ${nStu ? "" : `<div class="notice">ما فيه حسابات طلاب بعد. روح لتبويب "الطلاب" واستورد ملف asas-students.json.</div>`}
  <div class="tbl"><table><thead><tr><th class="nm">المقرر</th><th class="nm">المدرب/ة</th><th>العدد</th><th>حاضر</th><th>غائب</th><th>مستأذن</th><th>الحالة</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">ما فيه مقررات بعد</td></tr>`}</tbody></table></div>
  ${absentToday.length ? `<div class="card"><h2>غياب اليوم (${absentToday.length})</h2>
    <p class="muted" style="margin-top:0">اضغط واتساب، وتفتح محادثة الطالب ورسالة الغياب جاهزة.</p>
    <div class="list">${absentToday.map(a => `<div class="item"><div class="grow"><div class="t">${esc(a.name)}</div><div class="muted">${esc(a.course)}${a.sid ? " · " + esc(a.sid) : ""}</div></div>
      ${a.sid && (S.stPhones || {})[a.sid] ? "" : `<span class="pill">بدون جوال</span>`}
      ${a.sid ? `<button class="btn sm gold" data-wabs="${esc(a.sid)}" data-course="${esc(a.course)}">واتساب</button>` : ""}</div>`).join("")}</div></div>` : ""}`;
  el.querySelectorAll("[data-twa]").forEach(b => b.onclick = () => openWhatsAppTrainer(b.dataset.twa));
  el.querySelectorAll("[data-wabs]").forEach(b => b.onclick = () => openWhatsApp(b.dataset.wabs, {type: "absence", course: b.dataset.course}));
}

function adminExams(el){
  const gs = sortedGroups();
  if (S.aExG && !S.groups[S.aExG]) S.aExG = null;
  const g = S.aExG ? S.groups[S.aExG] : null;
  el.innerHTML = `<div class="card"><label class="f" for="aexg">المقرر<select id="aexg"><option value="">اختر الشعبة…</option>${gs.map(x => `<option value="${esc(x.id)}" ${x.id === S.aExG ? "selected" : ""}>${esc(x.course)} · ${esc(tName(x.trainerId))}</option>`).join("")}</select></label></div>${g ? examsTab(g) : `<div class="card empty">اختر الشعبة عشان تشوف اختباراتها، أو تنشئ لها اختبار.</div>`}`;
  $("#aexg").onchange = e => { S.aExG = e.target.value || null; S.exView = null; render(); };
  if (g) bindExamsTab(g);
}
function adminGroups(el){
  const gs = sortedGroups();
  const unassigned = gs.filter(g => !g.trainerId || !S.trainers[g.trainerId]).length;
  el.innerHTML = `
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">المقررات والطلاب</h2><button class="btn gold" id="newG">+ شعبة مقرر جديدة</button></div>
  <p class="muted" style="margin:8px 0 0">كل شعبة = مقرر + مدرب أو مدربة + طلابهم + جدولها. أي تعديل يظهر للمدرب والطالب فوراً.</p>
  ${unassigned ? `<div class="notice" style="margin-top:10px">فيه ${unassigned} شعبة بدون مدرب.</div>` : ""}
  <div class="row" style="margin-top:10px"><input type="text" id="gq" class="grow" placeholder="ابحث باسم مقرر أو مدرب أو طالب أو رقم"></div></div>
  <div class="list" id="glist"></div>`;
  const draw = q => {
    q = norm(q || "");
    const list = gs.filter(g => !q || norm(g.course).includes(q) || norm(tName(g.trainerId)).includes(q) || (g.students||[]).some(s => norm(s.name).includes(q) || (s.sid || "").includes(q)));
    $("#glist").innerHTML = list.map(g => `
      <div class="item"><div class="grow"><div class="t">${esc(g.course)}</div>
        <div class="muted">${esc(tName(g.trainerId))} ${g.mode ? "· " + esc(g.mode) : ""} · ${(g.students||[]).length} متدرب (${countG(g,"m")} طالب، ${countG(g,"f")} طالبة) · ${(g.sessions||[]).length} موعد</div></div>
        ${!g.trainerId || !S.trainers[g.trainerId] ? `<span class="pill warn">بدون مدرب</span>` : ""}
        <button class="btn sm" data-eg="${esc(g.id)}">فتح وتعديل</button></div>`).join("") || `<div class="card empty">ما فيه نتائج</div>`;
    $("#glist").querySelectorAll("[data-eg]").forEach(b => b.onclick = () => openGroup(b.dataset.eg));
  };
  draw(""); $("#gq").oninput = e => draw(e.target.value);
  $("#newG").onclick = () => openGroup(null);
}

function trainerOptions(sel){ return `<option value="">بدون مدرب</option>` + Object.values(S.trainers).sort((a,b)=>a.name.localeCompare(b.name,"ar")).map(t => `<option value="${esc(t.id)}" ${t.id===sel?"selected":""}>${esc(trainerTitle(t))}</option>`).join(""); }
function closeModal(){ S._crsOpen = null; $("#modal").classList.remove("on"); S._modalGroup = null; render(); }
function openGroup(id){
  const g = id ? S.groups[id] : null;
  S._modalGroup = id || ("g-" + uid());
  const courses = [...new Set(Object.values(S.groups).map(x => x.course))].sort((a,b)=>a.localeCompare(b,"ar"));
  $("#modalBox").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">${g ? "تعديل شعبة" : "شعبة مقرر جديدة"}</h2><button class="btn sm" id="mx">إغلاق</button></div>
    <div class="row">
      <label class="f grow" for="mc">المقرر<input type="text" id="mc" list="courses" value="${esc(g ? g.course : "")}"></label>
      <datalist id="courses">${courses.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <label class="f grow" for="mt2">المدرب/ة<select id="mt2">${trainerOptions(g ? g.trainerId : "")}</select></label>
      <label class="f" for="mts" style="min-width:150px">عدد المحاضرات الكلي<input type="number" id="mts" min="0" value="${esc(g && g.totalSessions || "")}" placeholder="لحساب الحرمان"></label>
      <label class="f grow" for="mlk" style="min-width:220px">رابط Teams<input type="url" id="mlk" dir="ltr" value="${esc(g && g.meetLink || "")}" placeholder="https://teams.microsoft.com/..."></label>
      <label class="f" for="mm" style="min-width:130px">نمط الحضور<select id="mm"><option value="">—</option>${["حضوري","عن بعد"].map(m => `<option ${g && g.mode===m?"selected":""}>${m}</option>`).join("")}</select></label>
    </div>
    <label class="row" for="mev" style="gap:8px;cursor:pointer"><input type="checkbox" id="mev" ${g && g.evalOpen ? "checked" : ""}> فتح تقييم المدرب والمقرر للطلاب</label>
    <div class="row"><button class="btn pri" id="msave">حفظ بيانات الشعبة</button>${g ? `<button class="btn danger" id="mdel">حذف الشعبة</button>` : ""}</div>
    <hr style="border:0;border-top:1px solid var(--line);margin:0">
    <div><h3>الجدول</h3><div class="list" id="msess"></div>
      <div class="row" style="margin-top:8px">
        <select id="ssh" style="width:auto"><option>صباحي</option><option>مسائي</option></select>
        <select id="sday" style="width:auto">${DAYS.map(d => `<option>${d}</option>`).join("")}</select>
        <input type="time" id="sfrom" style="width:120px"><input type="time" id="sto" style="width:120px">
        <input type="text" id="sroom" placeholder="قاعة 1 / عن بعد" style="width:140px">
        <select id="sg" style="width:auto"><option value="">الكل</option><option value="m">طلاب</option><option value="f">طالبات</option></select>
        <button class="btn sm" id="saddS">+ موعد</button>
      </div></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:0">
    <div><h3>الطلاب (<span id="mcount">0</span>)</h3><div class="chips" id="mstu"></div></div>
    <div class="card" style="background:var(--bg)">
      <h3>إضافة طلاب</h3>
      <p class="muted" style="margin-top:0">اكتب الاسم أو الرقم الأكاديمي، كل واحد في سطر. إذا الطالب موجود ينربط بسجله، وإذا جديد ينعمل له رقم ورمز.</p>
      <label class="f" for="madd">الأسماء أو الأرقام<textarea id="madd"></textarea></label>
      <div class="row" style="margin-top:8px">
        <select id="mg" style="width:auto"><option value="m">طلاب</option><option value="f">طالبات</option></select>
        <button class="btn pri" id="maddB">إضافة للشعبة</button>
      </div>
      <div id="maddLog" class="muted" style="margin-top:6px"></div>
      <div class="row" style="margin-top:10px">
        <select id="mcopy" class="grow"><option value="">نسخ الطلاب من شعبة أخرى…</option>${sortedGroups().filter(x => x.id !== id).map(x => `<option value="${esc(x.id)}">${esc(x.course)} · ${esc(tName(x.trainerId))} (${(x.students||[]).length})</option>`).join("")}</select>
        <button class="btn" id="mcopyB">نسخ</button>
      </div>
    </div>`;
  $("#modal").classList.add("on");
  renderModalStudents();
  $("#mx").onclick = closeModal;
  const base = () => { const c = S.groups[S._modalGroup]; const d = c ? clone(c) : {course: "", trainerId: "", mode: "", students: [], sessions: []}; delete d.id; return d; };
  const header = d => { d.course = $("#mc").value.trim(); d.trainerId = $("#mt2").value; d.mode = $("#mm").value; const l = $("#mlk").value.trim(); d.meetLink = validLink(l) ? l : ""; d.totalSessions = Math.max(0, Math.round(Number($("#mts").value) || 0)); d.evalOpen = $("#mev").checked; return d; };
  const write = d => { writeGroup(S._modalGroup, d); renderModalStudents(); };
  $("#msave").onclick = () => { if (!$("#mc").value.trim()) return toast("اكتب اسم المقرر"); write(header(base())); toast("تم الحفظ"); };
  $("#saddS").onclick = () => {
    if (!$("#mc").value.trim()) return toast("اكتب اسم المقرر أولاً");
    const s = {shift: $("#ssh").value, day: $("#sday").value, from: $("#sfrom").value, to: $("#sto").value, room: $("#sroom").value.trim(), g: $("#sg").value};
    if (!s.from || !s.to) return toast("حدد وقت البداية والنهاية");
    const d = header(base()); d.sessions = [...(d.sessions || []), s]; write(d);
  };
  $("#maddB").onclick = async () => {
    if (!$("#mc").value.trim()) return toast("اكتب اسم المقرر أولاً");
    const lines = $("#madd").value.split(/\n+/).map(s => s.replace(/^[\s\-.)،]*(\d{1,3}[\s\-.)]+)?/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    const gen = $("#mg").value, log = m => { const l = $("#maddLog"); if (l) l.textContent = m; };
    $("#maddB").disabled = true; S._busy = true;
    const d = header(base()); let added = 0, created = 0;
    try {
      for (const line of lines) {
        let st = /^2026\d{4}$/.test(line) ? S.students[line] : findStudent(line, gen) || findStudent(line);
        if (!st || !st.uid) { if (/^\d+$/.test(line)) { log(`الرقم ${line} غير موجود`); continue; } log(`إنشاء رقم لـ ${line}…`); st = await createStudent(line, gen); created++; }
        if (d.students.some(x => x.sid === st.num)) continue;
        d.students.push({id: "s" + uid(), name: st.name, gender: st.gender, sid: st.num}); added++;
      }
      write(d); $("#madd").value = ""; log(`انضاف ${added}، منهم ${created} طالب جديد بأرقام جديدة.`);
    } catch (e) { write(d); log(accountErr(e)); }
    $("#maddB").disabled = false; S._busy = false;
  };
  $("#mcopyB").onclick = () => {
    const src = S.groups[$("#mcopy").value]; if (!src) return;
    if (!$("#mc").value.trim()) return toast("اكتب اسم المقرر أولاً");
    const d = header(base()); let n = 0;
    (src.students||[]).forEach(s => { if (!d.students.some(x => (s.sid && x.sid === s.sid) || norm(x.name) === norm(s.name))) { d.students.push({id: "s" + uid(), name: s.name, gender: s.gender, sid: s.sid || ""}); n++; } });
    write(d); toast(`انضاف ${n} متدرب`);
  };
  if (g) $("#mdel").onclick = () => {
    const b = $("#mdel");
    if (b.dataset.sure) { deleteDoc(ref("groups/" + S._modalGroup)).then(() => { logAction("حذف شعبة", (S.groups[S._modalGroup] || {}).course || ""); toast("انحذفت الشعبة"); }).catch(handleWriteErr); delete S.groups[S._modalGroup]; closeModal(); }
    else { b.dataset.sure = "1"; b.textContent = "متأكد؟ اضغط مرة ثانية للحذف"; }
  };
}
function renderModalStudents(){
  const g = S.groups[S._modalGroup]; const st = (g && g.students) || []; const ss = (g && g.sessions) || [];
  const box = $("#mstu"); if (!box) return;
  $("#mcount").textContent = st.length;
  box.innerHTML = st.length ? st.map(s => `<span class="chip"><span class="pill ${s.gender}">${GENDER[s.gender]}</span>${esc(s.name)} <span class="muted">${esc(s.sid || "بدون رقم")}</span><button aria-label="حذف ${esc(s.name)}" data-rm="${esc(s.id)}">×</button></span>`).join("") : `<span class="muted">ما فيه طلاب بعد</span>`;
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => {
    const d = clone(S.groups[S._modalGroup]); d.students = d.students.filter(s => s.id !== b.dataset.rm); writeGroup(S._modalGroup, d); renderModalStudents();
  });
  const sb = $("#msess");
  sb.innerHTML = ss.length ? ss.map((s,i) => `<div class="item" style="padding:8px 10px"><span class="grow">${esc(s.shift || "")} · ${esc(slot(s))}${s.g ? ` · ${s.g === "f" ? "طالبات" : "طلاب"}` : ""}</span><button class="btn sm danger" data-rs="${i}">حذف</button></div>`).join("") : `<span class="muted">ما فيه مواعيد</span>`;
  sb.querySelectorAll("[data-rs]").forEach(b => b.onclick = () => {
    const d = clone(S.groups[S._modalGroup]); d.sessions.splice(Number(b.dataset.rs), 1); writeGroup(S._modalGroup, d); renderModalStudents();
  });
}

/* students tab */
function adminStudents(el){
  const list = Object.values(S.students).sort((a,b) => a.num.localeCompare(b.num));
  const groupsOf = num => Object.values(S.groups).filter(g => (g.memberNums || []).includes(num));
  el.innerHTML = `
  <div class="card"><h2>الطلاب</h2>
    <p class="muted" style="margin-top:0">كل طالب له رقم أكاديمي يبدأ بـ 2026 ورمز دخول. أرسل للطالب رسالته من زر "نسخ".</p>
    <form id="ns" class="row" autocomplete="off">
      <input type="text" id="nsn" class="grow" placeholder="اسم طالب جديد" required>
      <select id="nsg" style="width:auto"><option value="m">طالب</option><option value="f">طالبة</option></select>
      <button class="btn gold" type="submit" id="nsb">+ إضافة</button>
    </form>
    <div class="row" style="margin-top:10px"><input type="text" id="sq" class="grow" placeholder="ابحث بالاسم أو الرقم"><button class="btn sm" id="copyAll">نسخ كل الأرقام والرموز</button></div>
  </div>
  <div class="list" id="slist"></div>
  <div class="card"><h2>بطاقات المتدربين</h2>
    <p class="muted" style="margin-top:0">بطاقة بمقاس البطاقة البنكية، فيها الشعار والاسم والرقم التدريبي وQR. 8 بطاقات في كل صفحة A4، تطبعها وتقصها أو تطبعها على طابعة بطاقات.</p>
    <div class="row"><select id="idSel" class="grow"><option value="all">كل المتدربين (${list.length})</option>${sortedGroups().map(g => `<option value="g:${esc(g.id)}">${esc(g.course)} · ${esc(tName(g.trainerId))} (${(g.memberNums || []).length})</option>`).join("")}</select><button class="btn gold sm" id="idPrint">طباعة البطاقات</button></div>
    <p class="muted">لبطاقة متدرب واحد: زر «الملف» قدام اسمه ثم «طباعة بطاقته».</p></div>
  <div class="card"><h2>بيانات المتدربين</h2>
    <p class="muted" style="margin-top:0">رقم الهوية وتاريخ الميلاد والجنسية وجوال ولي الأمر وغيرها. تعبّيها من زر «الملف» قدام كل متدرب، أو من ملف Excel تحت.</p>
    <button class="btn sm" id="pfX">تنزيل بيانات كل المتدربين Excel</button></div>
  <div class="card"><h2>استيراد متدربين من Excel</h2>
    <p class="muted" style="margin-top:0">الملف فيه أعمدة: <b>الاسم</b> و<b>الجنس</b> (طالب/طالبة)، واختياري <b>الجوال</b> و<b>رقم الهوية</b> و<b>تاريخ الميلاد</b> و<b>الجنسية</b> و<b>جوال ولي الأمر</b>. كل متدرب ينعمل له رقم ورمز. الأسماء الموجودة من قبل تنربط بدون تكرار.</p>
    <div class="row"><input type="file" id="xF" accept=".xlsx,.xls,.csv" class="grow"><button class="btn sm" id="xTpl">تنزيل نموذج</button></div>
    <div class="row" style="margin-top:8px"><select id="xG" class="grow"><option value="">بدون شعبة (أضيفهم بعدين)</option>${sortedGroups().map(g => `<option value="${esc(g.id)}">إضافتهم لشعبة: ${esc(g.course)} · ${esc(tName(g.trainerId))}</option>`).join("")}</select><button class="btn pri" id="xRun">استيراد</button></div>
    <div id="xLog" class="muted" style="margin-top:8px;white-space:pre-line"></div>
  </div>
  <div class="card"><h2>استيراد الطلاب (مرة وحدة)</h2>
    <p class="muted" style="margin-top:0">اختر ملف <b>asas-students.json</b>. ينشئ أرقام الطلاب وحساباتهم، ويربطهم بالشعب، ويضيف الجدول ومقرر نظام المعاملات المدنية. إذا وقف في النص شغّله مرة ثانية ويكمل من مكانه.</p>
    <div class="row"><input type="file" id="upF" accept=".json,application/json" class="grow"><button class="btn pri" id="upB">تشغيل</button></div>
    <div id="upLog" class="muted" style="margin-top:8px;white-space:pre-line"></div>
  </div>`;
  const draw = q => {
    q = norm(q || "");
    const items = list.filter(s => !q || norm(s.name).includes(q) || s.num.includes(q));
    $("#slist").innerHTML = items.slice(0, 200).map(s => {
      const gs = groupsOf(s.num);
      return `<div class="item"><div class="grow"><div class="t">${esc(s.name)} <span class="pill ${s.gender}">${GENDER[s.gender]}</span>${(S.disabled || {})[s.num] ? ` <span class="pill a">موقوف</span>` : ""}</div>
        <div class="muted">${gs.length} مقرر${gs.length ? " · " + gs.map(g => esc(g.course)).join("، ") : ""}</div></div>
        <span class="code">${esc(s.num)}</span><span class="code">${esc(S.stSecrets[s.num] || "••••••")}</span>
        <span class="pill ${(S.stPhones || {})[s.num] ? "p" : ""}" dir="ltr">${esc((S.stPhones || {})[s.num] || "بدون جوال")}</span>
        <button class="btn sm gold" data-wa="${esc(s.num)}">واتساب</button>
        <button class="btn sm" data-srep="${esc(s.num)}">كشف PDF</button><button class="btn sm" data-sxls="${esc(s.num)}">Excel</button>
        <button class="btn sm" data-sprof="${esc(s.num)}">الملف</button><button class="btn sm" data-scopy="${esc(s.num)}">نسخ</button><button class="btn sm" data-snew="${esc(s.num)}">رمز جديد</button><button class="btn sm" data-sdis="${esc(s.num)}">${(S.disabled || {})[s.num] ? "تفعيل" : "تعطيل"}</button><button class="btn sm danger" data-sdel="${esc(s.num)}">حذف</button></div>`;
    }).join("") || `<div class="card empty">${list.length ? "ما فيه نتائج" : "ما فيه طلاب بعد. استورد الملف من تحت."}</div>`;
    el.querySelectorAll("[data-wa]").forEach(b => b.onclick = () => openWhatsApp(b.dataset.wa));
    el.querySelectorAll("[data-sprof]").forEach(b => b.onclick = () => openProfile(b.dataset.sprof));
    el.querySelectorAll("[data-srep]").forEach(b => b.onclick = () => printStudentReport(b.dataset.srep).catch(() => toast("تعذّر تجهيز الكشف")));
    el.querySelectorAll("[data-sxls]").forEach(b => b.onclick = () => excelStudentReport(b.dataset.sxls).catch(() => toast("تعذّر تجهيز الملف")));
    el.querySelectorAll("[data-sdis]").forEach(b => b.onclick = () => setDisabled("students", b.dataset.sdis, !(S.disabled || {})[b.dataset.sdis], (S.students[b.dataset.sdis] || {}).name));
    el.querySelectorAll("[data-sdel]").forEach(b => b.onclick = async () => {
      const num = b.dataset.sdel, st = S.students[num];
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "متأكد؟ يحذف من كل المقررات"; return; }
      b.disabled = true;
      try {
        const bt = writeBatch(db);
        Object.values(S.groups).filter(g => (g.memberNums || []).includes(num)).forEach(g => {
          const d = clone(g); delete d.id; d.students = (d.students || []).filter(x => x.sid !== num); d.memberNums = memberNums(d.students);
          bt.set(ref("groups/" + g.id), d);
        });
        const rs = await getDocs(query(collection(db, "results"), where("num", "==", num)));
        rs.docs.forEach(x => bt.delete(x.ref));
        const pubSnap = await getDoc(ref("public/studentLogin")); const map = (pubSnap.exists() && pubSnap.data().map) || {}; delete map[num];
        bt.set(ref("public/studentLogin"), {map});
        bt.delete(ref("students/" + num)); bt.delete(ref("studentSecrets/" + num));
        await bt.commit();
        delete S.students[num]; logAction("حذف طالب", `${st ? st.name : ""} · ${num}`); toast(`انحذف ${st ? st.name : num}`); render();
      } catch (e) { handleWriteErr(e); b.disabled = false; }
    });
    el.querySelectorAll("[data-scopy]").forEach(b => b.onclick = async () => {
      const s = S.students[b.dataset.scopy];
      const msg = `${s.name}\nرقمك الأكاديمي: ${s.num}\nرمز الدخول: ${S.stSecrets[s.num] || "—"}\nبوابة الطلاب: ${location.href.split("#")[0].split("?")[0]}`;
      try { await navigator.clipboard.writeText(msg); toast("انتسخت رسالة الطالب"); } catch { toast("المتصفح منع النسخ"); }
    });
    el.querySelectorAll("[data-snew]").forEach(b => b.onclick = async () => {
      const num = b.dataset.snew, s = S.students[num], code = newCode(); b.disabled = true;
      try {
        const acc = await createAccount("st-" + num, s.ver || 0, code);
        const pubSnap = await getDoc(ref("public/studentLogin")); const map = (pubSnap.exists() && pubSnap.data().map) || {}; map[num] = acc.ver;
        const bt = writeBatch(db);
        bt.set(ref("students/" + num), {...s, ...acc}); bt.set(ref("studentSecrets/" + num), {code}); bt.set(ref("public/studentLogin"), {map});
        await bt.commit(); logAction("رمز جديد لطالب", `${s.name} · ${num}`); toast("انعمل رمز جديد: " + code);
      } catch (e) { toast(accountErr(e)); b.disabled = false; }
    });
  };
  draw(""); $("#sq").oninput = e => draw(e.target.value);
  $("#copyAll").onclick = async () => {
    const tsv = ["الرقم\tالاسم\tالرمز", ...list.map(s => `${s.num}\t${s.name}\t${S.stSecrets[s.num] || ""}`)].join("\n");
    try { await navigator.clipboard.writeText(tsv); toast("انتسخت القائمة، الصقها في Excel"); } catch { toast("المتصفح منع النسخ"); }
  };
  $("#ns").onsubmit = async e => {
    e.preventDefault(); const name = $("#nsn").value.trim(); if (!name) return;
    if (findStudent(name)) return toast("فيه طالب بنفس الاسم");
    $("#nsb").disabled = true;
    try { const s = await createStudent(name, $("#nsg").value); toast(`انضاف ${name} · ${s.num}`); } catch (er) { toast(accountErr(er)); }
    $("#nsb").disabled = false;
  };
  $("#upB").onclick = () => runStudentImport();
  $("#xTpl").onclick = () => excelDownload("نموذج استيراد المتدربين", [{title: "المتدربين", rows: [["الاسم", "الجنس", "الجوال", "رقم الهوية", "تاريخ الميلاد", "الجنسية", "جوال ولي الأمر"], ["محمد عبدالله الفايز", "طالب", "0551234567"], ["لجين عادل", "طالبة", ""]], widths: [32, 10, 14]}]);
  $("#xRun").onclick = () => runExcelImport();
  $("#idPrint").onclick = () => { const v = $("#idSel").value; printIdCards(v === "all" ? list.map(s => s.num) : ((S.groups[v.slice(2)] || {}).memberNums || []).slice().sort()); };
  $("#pfX").onclick = exportProfiles;
}

/* Excel dates arrive as serial numbers, Date objects or text; keep YYYY-MM-DD (Gregorian) only */
function xlDate(v){
  if (v === "" || v == null) return "";
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.toISOString().slice(0, 10); }
  const t = digits(String(v)).trim(), m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/) || t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return "";
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  if (Number(y) < 1900) return "";   // a Hijri date: skip rather than guess
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
async function runExcelImport(){
  const f = $("#xF").files[0]; if (!f) return toast("اختر ملف Excel");
  const lines = []; const log = m => { lines.push(m); const el = $("#xLog"); if (el) el.textContent = lines.slice(-8).join("\n"); };
  let rows;
  try { const X = await loadXLSX(); const wb = X.read(await f.arrayBuffer()); rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ""}); }
  catch (e) { console.error(e); return toast("تعذّر قراءة الملف"); }
  const head = (rows[0] || []).map(h => norm(h));
  const col = names => head.findIndex(h => names.some(n => h.includes(norm(n))));
  const cGp = col(["ولي الامر", "ولي الأمر", "جوال الولي"]);
  const cN = col(["الاسم", "اسم"]), cG = col(["الجنس", "النوع", "الفئه", "الفئة"]);
  const cP = head.findIndex((h, i) => i !== cGp && ["الجوال", "جوال", "الهاتف"].some(n => h.includes(norm(n))));
  const cId = col(["الهويه", "الهوية", "الاقامه", "الإقامة", "السجل المدني"]), cDob = col(["الميلاد"]), cNat = col(["الجنسيه", "الجنسية"]);
  if (cN < 0) return toast("ما لقيت عمود الاسم في أول صف");
  const data = rows.slice(1).map(r => ({name: String(r[cN] || "").trim().replace(/\s+/g, " "), g: cG >= 0 ? String(r[cG] || "") : "", phone: cP >= 0 ? String(r[cP] || "") : "", nid: cId >= 0 ? digits(r[cId]) : "", dob: cDob >= 0 ? xlDate(r[cDob]) : "", nat: cNat >= 0 ? String(r[cNat] || "").trim() : "", gphone: cGp >= 0 ? String(r[cGp] || "") : ""})).filter(r => r.name);
  if (!data.length) return toast("الملف فاضي");
  const gid = $("#xG").value; S._busy = true; $("#xRun").disabled = true;
  let made = 0, linked = 0, phones = 0; const nums = [];
  try {
    for (const [i, r] of data.entries()) {
      const gender = /طالبه|طالبة|انثى|أنثى|female|^f$/i.test(r.g.trim()) ? "f" : "m";
      let st = findStudent(r.name, gender) || findStudent(r.name);
      if (!st) { log(`(${i + 1}/${data.length}) إنشاء ${r.name}`); st = await createStudent(r.name, gender); made++; } else linked++;
      nums.push(st);
      const ph = normPhone(r.phone);
      const prof = {};
      if (/^9665\d{8}$/.test(ph) && (S.stPhones || {})[st.num] !== ph) { prof.phone = ph; phones++; }
      if (/^[12]\d{9}$/.test(r.nid)) prof.nid = r.nid;
      if (r.dob) prof.dob = r.dob;
      if (r.nat) prof.nat = /غير|non/i.test(r.nat) ? "غير سعودي" : /سعود|saudi/i.test(r.nat) ? "سعودي" : r.nat.slice(0, 30);
      const gp = normPhone(r.gphone); if (/^9665\d{8}$/.test(gp)) prof.gphone = gp;
      if (Object.keys(prof).length) await setDoc(ref("studentSecrets/" + st.num), prof, {merge: true});
    }
  } catch (e) { console.error(e); log(accountErr(e) + " · شغّل الاستيراد مرة ثانية ويكمل من مكانه."); }
  if (gid && S.groups[gid] && nums.length) {
    const d = clone(S.groups[gid]); delete d.id; let n = 0;
    nums.forEach(st => { if (!(d.students || []).some(x => x.sid === st.num)) { d.students = [...(d.students || []), {id: "s" + uid(), name: st.name, gender: st.gender, sid: st.num}]; n++; } });
    if (n) { writeGroup(gid, d); log(`انضاف ${n} للشعبة.`); }
  }
  log(`تم: ${made} جديد، ${linked} موجود من قبل، ${phones} جوال.`);
  logAction("استيراد Excel", `${made} جديد · ${linked} موجود`);
  S._busy = false; const b = $("#xRun"); if (b) b.disabled = false;
}
async function runStudentImport(){
  const f = $("#upF").files[0]; if (!f) return toast("اختر الملف أولاً");
  let data; try { data = JSON.parse(await f.text()); } catch { return toast("الملف غير صالح"); }
  if (data.kind !== "asas-students-v1") return toast("هذا مو ملف الطلاب الصحيح");
  const lines = []; const log = m => { lines.push(m); const el = $("#upLog"); if (el) el.textContent = lines.slice(-8).join("\n"); };
  S._busy = true; $("#upB").disabled = true;
  const alias = {}; Object.entries(data.aliases || {}).forEach(([a, c]) => alias[norm(a)] = norm(c));
  const byName = {};
  try {
    // 1) student accounts
    const pubSnap = await getDoc(ref("public/studentLogin"));
    const map = (pubSnap.exists() && pubSnap.data().map) || {};
    let made = 0, i = 0, quotaHit = false;
    for (const s of data.students) {
      i++;
      byName[norm(s.name)] = s.num;
      if (S.students[s.num] && S.students[s.num].uid) continue;
      if (quotaHit) continue;
      log(`(${i}/${data.students.length}) إنشاء حساب ${s.name} · ${s.num}`);
      let acc;
      try { acc = await createAccount("st-" + s.num, 0, s.code); }
      catch (e) {
        if (e && e.code === "auth/too-many-requests") { quotaHit = true; log("Firebase وقف إنشاء الحسابات مؤقتاً. بكمل ربط الطلاب الموجودين، وشغّل الاستيراد بعد ساعة عشان تنعمل الحسابات الباقية."); continue; }
        throw e;
      }
      map[s.num] = acc.ver;
      const b = writeBatch(db);
      b.set(ref("students/" + s.num), {num: s.num, name: s.name, gender: s.gender, ...acc});
      b.set(ref("studentSecrets/" + s.num), {code: s.code});
      b.set(ref("public/studentLogin"), {map});
      await b.commit();
      S.students[s.num] = {num: s.num, name: s.name, gender: s.gender, ...acc}; made++;
    }
    const left = data.students.filter(s => !(S.students[s.num] && S.students[s.num].uid)).length;
    log(`الحسابات: انعمل ${made} الحين${left ? `، وباقي ${left} بدون حساب` : "، وكل الطلاب لهم حسابات"}.`);
    // 2) new groups
    for (const g of data.newGroups || []) {
      if (S.groups[g.id]) continue;
      const d = clone(g); delete d.id; d.memberNums = memberNums(d.students);
      await setDoc(ref("groups/" + g.id), d); S.groups[g.id] = {id: g.id, ...d};
      log(`انضاف مقرر ${g.course}.`);
    }
    // 3) link every group entry to a student number + schedule
    const unmatched = new Set(); let changed = 0;
    for (const g of Object.values(S.groups)) {
      const d = clone(g); delete d.id; let dirty = false;
      (d.students || []).forEach(s => {
        if (s.sid) return;
        const k = alias[norm(s.name)] || norm(s.name);
        const num = byName[k] || (findStudent(s.name, s.gender) || {}).num;
        if (num) { s.sid = num; dirty = true; } else unmatched.add(s.name);
      });
      if (!d.sessions && data.sessions && data.sessions[g.id]) { d.sessions = data.sessions[g.id]; dirty = true; }
      if (!d.trainerId && data.trainerIfEmpty && data.trainerIfEmpty[g.id] && S.trainers[data.trainerIfEmpty[g.id]]) { d.trainerId = data.trainerIfEmpty[g.id]; dirty = true; }
      const mn = memberNums(d.students);
      if (JSON.stringify(mn) !== JSON.stringify(g.memberNums || [])) { d.memberNums = mn; dirty = true; }
      if (dirty) { await setDoc(ref("groups/" + g.id), d); S.groups[g.id] = {id: g.id, ...d}; changed++; }
    }
    log(`الشعب المحدثة: ${changed}.`);
    // 3b) trainer corrections and course splits from the schedule
    for (const [gid, p] of Object.entries(data.setTrainer || {})) {
      const g = S.groups[gid];
      if (!g || g.trainerId !== p.from || !S.trainers[p.to]) continue;
      const d = clone(g); delete d.id; d.trainerId = p.to;
      await setDoc(ref("groups/" + gid), d); S.groups[gid] = {id: gid, ...d};
      log(`${g.course}: المدرب صار ${tName(p.to)}.`);
    }
    for (const sp of data.splits || []) {
      const src = S.groups[sp.from];
      if (!src || S.groups[sp.newId]) continue;
      const moving = (src.students || []).filter(s => s.gender === sp.gender);
      if (!moving.length) continue;
      const nd = {course: src.course, trainerId: sp.trainerId, mode: sp.mode || "", students: moving, sessions: sp.sessions || [], memberNums: memberNums(moving)};
      const od = clone(src); delete od.id;
      od.students = (src.students || []).filter(s => s.gender !== sp.gender);
      od.sessions = (src.sessions || []).filter(s => s.g !== sp.gender);
      od.memberNums = memberNums(od.students);
      const b = writeBatch(db); b.set(ref("groups/" + sp.newId), nd); b.set(ref("groups/" + sp.from), od); await b.commit();
      S.groups[sp.newId] = {id: sp.newId, ...nd}; S.groups[sp.from] = {id: sp.from, ...od};
      log(`${src.course}: ${sp.gender === "f" ? "الطالبات" : "الطلاب"} انتقلوا لشعبة مستقلة مع ${tName(sp.trainerId)}.`);
    }
    // 4) old attendance docs get memberNums so students can see them
    const atts = await getDocs(collection(db, "att")); let fixed = 0;
    for (const a of atts.docs) {
      const d = a.data(), g = S.groups[d.groupId];
      if (!g || (d.memberNums && d.memberNums.length)) continue;
      await setDoc(a.ref, {...d, memberNums: g.memberNums || []}); fixed++;
    }
    if (fixed) log(`سجلات حضور سابقة تحدثت: ${fixed}.`);
    log(unmatched.size ? `أسماء ما انربطت برقم: ${[...unmatched].join("، ")}` : "تم. كل الطلاب مربوطين بأرقامهم.");
    if (left) log(`باقي ${left} طالب بدون حساب دخول. شغّل الاستيراد مرة ثانية بعد ساعة.`);
    toast("اكتمل الاستيراد");
  } catch (e) { console.error(e); log("توقف: " + accountErr(e)); }
  S._busy = false; const b = $("#upB"); if (b) b.disabled = false;
  const keep = $("#upLog") ? $("#upLog").textContent : ""; render(); if ($("#upLog")) $("#upLog").textContent = keep;
}

/* ---------- WhatsApp (opens a ready message; the admin presses send) ---------- */
function normPhone(p){
  let d = digits(p).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = "966" + d.slice(1);
  else if (d.startsWith("5") && d.length === 9) d = "966" + d;
  return d;
}
const SIGN = "\n\nالشؤون الأكاديمية\nمعهد أسس التقنية والقانون";
async function waText(num, type, opt){
  const st = S.students[num] || {}, hi = `${st.gender === "f" ? "المتدربة" : "المتدرب"}: ${st.name}\nالرقم الأكاديمي: ${num}\n\n`;
  const gs = Object.values(S.groups).filter(g => (g.memberNums || []).includes(num)).sort((a,b) => (a.course||"").localeCompare(b.course||"","ar"));
  if (type === "absence") return `${hi}نفيدكم بتسجيل غيابكم عن محاضرة (${opt.course}) اليوم ${fmtDate(today())}.\nللاستفسار تواصلوا مع الشؤون الأكاديمية.${SIGN}`;
  if (type === "warning") return `${hi}نفيدكم بصدور (${opt.level}) في مقرر (${opt.course})، حيث بلغت نسبة الغياب ${opt.pct}%.\nنسبة الحرمان ${TH().deny}%، نأمل الالتزام بالحضور.${SIGN}`;
  if (type === "login") return `${hi}بيانات دخولكم لبوابة الطلاب:\nالرقم الأكاديمي: ${num}\nرمز الدخول: ${S.stSecrets[num] || "—"}\nالرابط: ${location.href.split("#")[0].split("?")[0]}${SIGN}`;
  if (type === "note") return `${hi}${opt.note || ""}${SIGN}`;
  if (type === "att") {
    const snap = await getDocs(query(collection(db, "att"), where("memberNums", "array-contains", num)));
    const docs = snap.docs.map(d => d.data());
    const lines = gs.map(g => {
      const e = (g.students || []).find(s => s.sid === num); const ds = docs.filter(d => d.groupId === g.id);
      if (!ds.length) return `• ${g.course}: ما بدأ التحضير`;
      const k = {p:0,l:0,a:0,e:0}; ds.forEach(d => { const r = e && d.rec && d.rec[e.id]; if (r && r.st) k[r.st]++; else k.a++; });
      return `• ${g.course}: حضور ${k.p + k.l} من ${ds.length} (${Math.round((k.p + k.l) / ds.length * 100)}%)، غياب ${k.a}${k.l ? `، تأخير ${k.l}` : ""}${k.e ? `، استئذان ${k.e}` : ""}`;
    });
    return `${hi}سجل الحضور حتى ${fmtDate(today())}:\n${lines.join("\n") || "ما فيه مقررات"}${SIGN}`;
  }
  if (type === "grades") {
    const snap = await getDocs(query(collection(db, "results"), where("num", "==", num)));
    const res = {}; snap.docs.forEach(d => { const r = d.data(); res[r.groupId] = r; });
    const lines = gs.map(g => res[g.id] ? `• ${g.course}: ${res[g.id].mark} من 100 (${letter(res[g.id].mark)})` : `• ${g.course}: لم تُعتمد بعد`);
    return `${hi}الدرجات المعتمدة:\n${lines.join("\n") || "ما فيه مقررات"}${SIGN}`;
  }
  return hi + SIGN;
}
function openWhatsApp(num, preset){
  const st = S.students[num]; if (!st) return;
  S._modalGroup = null;
  const phone = (S.stPhones || {})[num] || "";
  $("#modalBox").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">واتساب · ${esc(st.name)}</h2><button class="btn sm" id="wx">إغلاق</button></div>
    <div class="row">
      <label class="f grow" for="wp">رقم الجوال<input type="tel" id="wp" dir="ltr" value="${esc(phone)}" placeholder="05xxxxxxxx"></label>
      <button class="btn sm" id="wpSave" style="align-self:flex-end">حفظ الرقم</button>
    </div>
    <div class="row">
      <button class="btn sm" data-wt="att">سجل الحضور</button>
      <button class="btn sm" data-wt="grades">الدرجات</button>
      <button class="btn sm" data-wt="login">بيانات الدخول</button>
      <button class="btn sm" data-wt="note">ملاحظة</button>
    </div>
    <label class="f" for="wm">الرسالة (تقدر تعدّلها)<textarea id="wm" style="min-height:200px"></textarea></label>
    <div class="row"><a class="btn pri" id="wgo" target="_blank" rel="noopener">فتح واتساب وإرسال</a><span class="muted" id="whint"></span></div>
    <div class="card" style="background:var(--bg)">
      <h3>إرفاق ملف (اختياري)</h3>
      <p class="muted" style="margin-top:0">مثل خطاب أو تقرير PDF أو صورة. من الجوال يفتح لك قائمة المشاركة: اختر واتساب ثم الطالب.</p>
      <div class="row"><input type="file" id="wf" class="grow"><button class="btn sm gold" id="wshare">مشاركة الملف مع الرسالة</button></div>
    </div>`;
  $("#modal").classList.add("on");
  $("#wx").onclick = closeModal;
  const link = () => {
    const p = normPhone($("#wp").value), a = $("#wgo");
    if (!/^9665\d{8}$/.test(p)) { a.removeAttribute("href"); a.classList.add("disabled"); $("#whint").textContent = "اكتب رقم جوال سعودي صحيح"; return; }
    a.href = `https://wa.me/${p}?text=${encodeURIComponent($("#wm").value)}`; $("#whint").textContent = "";
  };
  const fill = async (type, opt) => {
    $("#wm").value = "جاري التجهيز…";
    try { $("#wm").value = await waText(num, type, opt || {}); } catch (e) { console.error(e); $("#wm").value = ""; toast("تعذّر تجهيز الرسالة"); }
    if (type === "note") { const t = $("#wm"); t.focus(); t.setSelectionRange(t.value.indexOf("\n\n") + 2, t.value.indexOf("\n\n") + 2); }
    link();
  };
  $("#modalBox").querySelectorAll("[data-wt]").forEach(b => b.onclick = () => fill(b.dataset.wt));
  $("#wm").oninput = link; $("#wp").oninput = link;
  $("#wpSave").onclick = async () => {
    const p = normPhone($("#wp").value);
    if (!/^9665\d{8}$/.test(p)) return toast("رقم الجوال غير صحيح");
    try { await setDoc(ref("studentSecrets/" + num), {phone: p}, {merge: true}); S.stPhones = {...(S.stPhones || {}), [num]: p}; logAction("جوال طالب", `${st.name} · ${num}`); $("#wp").value = p; toast("انحفظ الرقم"); link(); }
    catch (e) { handleWriteErr(e); }
  };
  $("#wgo").onclick = e => { if (!$("#wgo").getAttribute("href")) { e.preventDefault(); toast("اكتب رقم جوال صحيح أولاً"); } };
  $("#wshare").onclick = async () => {
    const f = $("#wf").files[0]; if (!f) return toast("اختر الملف أولاً");
    const data = {files: [f], text: $("#wm").value};
    if (navigator.canShare && navigator.canShare(data)) {
      try { await navigator.share(data); } catch (e) { if (e.name !== "AbortError") toast("تعذّرت المشاركة"); }
    } else {
      toast("هالجهاز ما يدعم مشاركة الملفات. افتح واتساب من الزر، وأرفق الملف من داخل المحادثة");
    }
  };
  fill(preset ? preset.type : "att", preset);
}

function trainerText(tid, type, note){
  const t = S.trainers[tid] || {}, hi = `${t.gender === "f" ? "الأستاذة" : "الأستاذ"} ${t.name}\n\n`;
  if (type === "login") return `${hi}بيانات دخولك لبوابة المدربين:\nرقم المدرب: ${t.num || "—"}\n${t.num ? `بريدك في المعهد: ${trAddr(t)}\n` : ""}رمز الدخول: ${S.secrets[tid] || "—"}\nالرابط: ${location.href.split("#")[0].split("?")[0]}${SIGN}`;
  return `${hi}${note || ""}${SIGN}`;
}
function openWhatsAppTrainer(tid){
  const t = S.trainers[tid]; if (!t) return;
  S._modalGroup = null;
  $("#modalBox").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">واتساب · ${esc(trainerTitle(t))}</h2><button class="btn sm" id="wx">إغلاق</button></div>
    <div class="row">
      <label class="f grow" for="wp">رقم الجوال<input type="tel" id="wp" dir="ltr" value="${esc((S.trPhones || {})[tid] || "")}" placeholder="05xxxxxxxx"></label>
      <button class="btn sm" id="wpSave" style="align-self:flex-end">حفظ الرقم</button>
    </div>
    <div class="row"><button class="btn sm" data-wt="login">بيانات الدخول</button><button class="btn sm" data-wt="note">ملاحظة</button></div>
    <label class="f" for="wm">الرسالة (تقدر تعدّلها)<textarea id="wm" style="min-height:180px"></textarea></label>
    <div class="row"><a class="btn pri" id="wgo" target="_blank" rel="noopener">فتح واتساب وإرسال</a><span class="muted" id="whint"></span></div>`;
  $("#modal").classList.add("on");
  $("#wx").onclick = closeModal;
  const link = () => {
    const p = normPhone($("#wp").value), a = $("#wgo");
    if (!/^9665\d{8}$/.test(p)) { a.removeAttribute("href"); $("#whint").textContent = "اكتب رقم جوال سعودي صحيح"; return; }
    a.href = `https://wa.me/${p}?text=${encodeURIComponent($("#wm").value)}`; $("#whint").textContent = "";
  };
  $("#modalBox").querySelectorAll("[data-wt]").forEach(b => b.onclick = () => { $("#wm").value = trainerText(tid, b.dataset.wt); link(); });
  $("#wm").oninput = link; $("#wp").oninput = link;
  $("#wpSave").onclick = async () => {
    const p = normPhone($("#wp").value);
    if (!/^9665\d{8}$/.test(p)) return toast("رقم الجوال غير صحيح");
    try { await setDoc(ref("secrets/" + tid), {phone: p}, {merge: true}); S.trPhones = {...(S.trPhones || {}), [tid]: p}; logAction("جوال مدرب", t.name); $("#wp").value = p; toast("انحفظ الرقم"); link(); }
    catch (e) { handleWriteErr(e); }
  };
  $("#wgo").onclick = e => { if (!$("#wgo").getAttribute("href")) { e.preventDefault(); toast("اكتب رقم جوال صحيح أولاً"); } };
  $("#wm").value = trainerText(tid, "note"); link();
}

/* bulk messages: prepare every message first, then open WhatsApp one student per click */
function fillVars(t, num){
  const st = S.students[num] || {};
  return t.replace(/\{الاسم\}/g, st.name || "").replace(/\{الرقم\}/g, num).replace(/\{الرمز\}/g, S.stSecrets[num] || "—")
          .replace(/\{الرابط\}/g, location.href.split("#")[0].split("?")[0]);
}
function fillTrainerVars(tpl, tid){
  const t = S.trainers[tid] || {};
  return tpl.replace(/\{الاسم\}/g, t.name ? trainerTitle(t) : "").replace(/\{الرقم\}/g, t.num || "—").replace(/\{الرمز\}/g, S.secrets[tid] || "—")
            .replace(/\{الرابط\}/g, location.href.split("#")[0].split("?")[0]);
}
function adminMessages(el){
  const q = S.msgQ;
  const gs = sortedGroups();
  if (q && q.items.length) {
    const done = q.items.filter(i => i.sent).length, cur = q.items[q.idx];
    el.innerHTML = `
    <div class="card"><h2>الإرسال · ${done} من ${q.items.length}</h2>
      <span class="bar" style="display:block;max-width:none"><i style="width:${Math.round(done / q.items.length * 100)}%"></i></span>
      ${cur ? `<div class="item" style="margin-top:12px"><div class="grow"><div class="t">التالي: ${esc(cur.name)}</div><div class="muted" dir="ltr" style="text-align:right">${esc(cur.phone)}</div></div>
        <a class="btn gold" id="qNext" href="https://wa.me/${cur.phone}?text=${encodeURIComponent(cur.text)}" target="_blank" rel="noopener">فتح واتساب (${q.idx + 1})</a>
        <button class="btn sm" id="qSkip">تخطي</button></div>
        <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">نص الرسالة</summary><pre style="white-space:pre-wrap;font-family:inherit">${esc(cur.text)}</pre></details>`
      : `<div class="notice" style="margin-top:12px">خلصت القائمة.</div>`}
      <div class="row" style="margin-top:12px"><button class="btn sm danger" id="qStop">${cur ? "إيقاف وإلغاء" : "رسالة جديدة"}</button></div>
    </div>
    <div class="list">${q.items.map((i, k) => `<div class="item" style="padding:8px 12px"><span class="grow">${k + 1}. ${esc(i.name)}</span><span class="pill ${i.sent ? "p" : i.skipped ? "a" : ""}">${i.sent ? "انفتح" : i.skipped ? "متخطى" : "بالانتظار"}</span></div>`).join("")}</div>`;
    const adv = mark => { q.items[q.idx][mark] = true; q.idx++; while (q.idx < q.items.length && (q.items[q.idx].sent || q.items[q.idx].skipped)) q.idx++; };
    if ($("#qNext")) $("#qNext").onclick = () => setTimeout(() => { adv("sent"); render(); }, 300);
    if ($("#qSkip")) $("#qSkip").onclick = () => { adv("skipped"); render(); };
    $("#qStop").onclick = () => { S.msgQ = null; render(); };
    return;
  }
  const M = S.msgF = S.msgF || {kind: "st_all", groups: [], pick: [], tpick: [], roles: [], abs: 1, chP: true, chW: false, q: ""};
  M.epick = M.epick || []; M.depts = M.depts || [];
  const EMP_OK = S.adminRole === "admin" || S.adminRole === "hr"; if (EMP_OK) hrSubs();   // the institute's employees (HR list) reach them on WhatsApp
  const emps = () => (S.hrStaff || []).filter(e => e.active !== false), empById = id => (S.hrStaff || []).find(e => e.id === id);
  const ROLE_N = {admin: "الإدارة العامة", academic: "الشؤون الأكاديمية", finance: "المالية", auditor: "المراجع", admission: "القبول والتسجيل", business: "الأعمال", hr: "الموارد البشرية"};
  const KINDS = [["st_all", "كل الطلاب"], ["st_m", "الطلاب (ذكور)"], ["st_f", "الطالبات"], ["st_group", "طلاب مقرر أو شعبة"], ["st_pick", "طلاب أختارهم بالاسم"], ["st_warn", "الطلاب اللي عليهم إنذار"], ["st_abs", "الطلاب اللي غيابهم عالي"], ...(SEES_FIN() && S.finAcc ? [["st_fee", "الطلاب اللي عليهم رسوم متبقية"]] : []), ["tr_all", "كل المدربين"], ["tr_pick", "مدربين أختارهم"], ["staff", "موظفي الإدارات (حسابات البوابة)"], ...(EMP_OK ? [["emp_all", "👥 كل موظفي المنشأة"], ["emp_dept", "👥 موظفي قسم"], ["emp_pick", "👥 موظفين أختارهم"]] : [])];
  const stName = n => (S.students[n] || {}).name || n, trName = t => (S.trainers[t] && trainerTitle(S.trainers[t])) || t;
  el.innerHTML = `
  <div class="card"><h2>الرسائل الجماعية</h2>
    <p class="muted" style="margin-top:0">اختار المستلمين، واكتب الرسالة، واختار توصل وين: <b>في البوابة + إشعار على الجوال</b> (ويبيّن لك مين قرأها)، أو <b>واتساب</b> (تمر عليهم واحد واحد)، أو الاثنين.</p>
    <label class="f" for="mKind">المستلمون<select id="mKind">${KINDS.map(([k, v]) => `<option value="${k}" ${M.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <div id="mPick" style="margin-top:8px"></div>
    <div class="row" style="margin-top:10px;gap:16px;flex-wrap:wrap">
      <label class="row" style="gap:6px"><input type="checkbox" id="chP" ${M.chP ? "checked" : ""}> 📲 في البوابة + إشعار</label>
      <label class="row" style="gap:6px"><input type="checkbox" id="chW" ${M.chW ? "checked" : ""}> 💬 واتساب</label></div>
    <label class="f" for="mTitle" style="margin-top:10px">عنوان الرسالة (للبوابة والإشعار)<input id="mTitle" maxlength="80" placeholder="مثال: تغيير موعد محاضرة الأحد" value="${esc(M.title || "")}"></label>
    <label class="f grow" for="mType" style="margin-top:10px">نوع رسالة الواتساب<select id="mType">
        <option value="custom">رسالة عامة</option>
        <option value="login">الرموز: بيانات الدخول لكل شخص</option>
        <option value="att">سجل الحضور لكل طالب</option>
        <option value="grades">الدرجات المعتمدة لكل طالب</option>
      </select></label>
    <label class="f" for="mText" style="margin-top:10px">نص الرسالة <span class="muted">(تقدر تستخدم {الاسم} و{الرقم}${M.chW ? " و{الرمز} و{الرابط}" : ""})</span><textarea id="mText" style="min-height:170px"></textarea></label>
    <div id="mInfo" class="muted" style="margin:8px 0"></div>
    <div class="row"><button class="btn pri" id="mSend">إرسال</button><button class="btn sm" id="mCopy">نسخ النص (لقائمة بث في واتساب)</button></div>
  </div>
  <div class="card" id="mHist"><h2>الرسائل المرسلة</h2><div class="muted">جاري التحميل…</div></div>`;
  const presets = {
    login: "السلام عليكم {الاسم}\n\nبيانات دخولكم لبوابة الطلاب:\nالرقم الأكاديمي: {الرقم}\nرمز الدخول: {الرمز}\nالرابط: {الرابط}" + SIGN,
    custom: "السلام عليكم {الاسم}\n\n" + SIGN,
    trLogin: "السلام عليكم {الاسم}\n\nبيانات دخولك لبوابة المدربين:\nرقم المدرب: {الرقم}\nرمز الدخول: {الرمز}\nالرابط: {الرابط}" + SIGN,
    att: "(يتجهز سجل الحضور لكل طالب حسب بياناته)",
    grades: "(تتجهز الدرجات المعتمدة لكل طالب حسب بياناته)",
  };
  const isTr = () => M.kind.startsWith("tr"), isStaffK = () => M.kind === "staff", isEmp = () => M.kind.startsWith("emp");
  const phoneOf = n => isEmp() ? ((empById(n) || {}).phone || "") : isTr() ? (S.trPhones || {})[n] : (S.stPhones || {})[n];
  const nameOf = n => isEmp() ? ((empById(n) || {}).name || n) : isTr() ? trName(n) : isStaffK() ? (ROLE_N[n] || n) : stName(n);
  const unitN = () => isEmp() ? "موظف" : isStaffK() ? "قسم" : isTr() ? "مدرب" : "طالب";
  const absNums = () => { const out = new Set(); (S.allAtt ? absAlerts().alerts : []).forEach(x => { if (x.s.sid && x.st.level >= M.abs) out.add(x.s.sid); }); return [...out]; };
  const recips = () => {
    const k = M.kind, all = Object.keys(S.students);
    if (k === "tr_all") return Object.keys(S.trainers);
    if (k === "tr_pick") return M.tpick.filter(t => S.trainers[t]);
    if (k === "staff") return M.roles.slice();
    if (k === "emp_all") return emps().map(e => e.id);
    if (k === "emp_dept") return emps().filter(e => M.depts.includes(e.dept || "بدون قسم")).map(e => e.id);
    if (k === "emp_pick") return M.epick.filter(id => empById(id));
    if (k === "st_m" || k === "st_f") return all.filter(n => S.students[n].gender === k.slice(3)).sort();
    if (k === "st_group") return [...new Set(M.groups.flatMap(g => (S.groups[g] || {}).memberNums || []))].sort();
    if (k === "st_pick") return M.pick.filter(n => S.students[n]);
    if (k === "st_warn") return [...new Set(Object.values(S.warnings || {}).map(w => w.num).filter(n => n && S.students[n]))].sort();
    if (k === "st_abs") return absNums().filter(n => S.students[n]).sort();
    if (k === "st_fee") return Object.entries(S.finAcc || {}).filter(([n, acc]) => S.students[n] && accStatus(acc, paysOf(n)).remaining > 0).map(([n]) => n).sort();
    return all.sort();
  };
  const label = () => { const k = M.kind, base = (KINDS.find(x => x[0] === k) || [, ""])[1];
    if (k === "st_group") return "طلاب: " + M.groups.map(g => (S.groups[g] || {}).course).filter(Boolean).join("، ");
    if (k === "staff") return M.roles.map(r => ROLE_N[r]).join("، ");
    if (k === "emp_dept") return "موظفي: " + M.depts.join("، ");
    if (k === "st_abs") return base + (M.abs >= 3 ? " (محرومين)" : M.abs === 2 ? " (إنذار ثاني فأكثر)" : " (إنذار أول فأكثر)");
    return base; };
  const drawPick = () => {
    const box = $("#mPick"), k = M.kind; box.innerHTML = "";
    if (k === "st_group") box.innerHTML = `<div class="list" style="max-height:260px;overflow:auto">${gs.map(g => `<label class="item" style="gap:8px;padding:8px 12px"><input type="checkbox" data-mg="${esc(g.id)}" ${M.groups.includes(g.id) ? "checked" : ""}><span class="grow">${esc(g.course)} · ${esc(tName(g.trainerId))}</span><span class="muted">${(g.memberNums || []).length}</span></label>`).join("")}</div>`;
    if (k === "st_pick" || k === "tr_pick") { const tr = k === "tr_pick", sel = tr ? M.tpick : M.pick, q = M.q.trim();
      const pool = tr ? Object.keys(S.trainers).map(t => [t, trName(t)]) : Object.keys(S.students).map(n => [n, stName(n)]);
      const shown = pool.filter(([id, nm]) => !q || nm.includes(q) || id.includes(q)).sort((a, b) => a[1].localeCompare(b[1], "ar")).slice(0, 60);
      box.innerHTML = `<input type="search" id="mQ" placeholder="ابحث بالاسم أو الرقم…" value="${esc(M.q)}">
        ${sel.length ? `<div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">${sel.map(id => `<span class="pill p" style="cursor:pointer" data-mx="${esc(id)}">${esc(tr ? trName(id) : stName(id))} ✕</span>`).join("")}</div>` : ""}
        <div class="list" style="max-height:240px;overflow:auto;margin-top:6px">${shown.map(([id, nm]) => `<label class="item" style="gap:8px;padding:8px 12px"><input type="checkbox" data-mp="${esc(id)}" ${sel.includes(id) ? "checked" : ""}><span class="grow">${esc(nm)}</span><span class="muted">${esc(id)}</span></label>`).join("")}</div>`; }
    if (k === "st_abs") box.innerHTML = `<select id="mAbs"><option value="1" ${M.abs === 1 ? "selected" : ""}>وصلوا الإنذار الأول فأكثر</option><option value="2" ${M.abs === 2 ? "selected" : ""}>وصلوا الإنذار الثاني فأكثر</option><option value="3" ${M.abs === 3 ? "selected" : ""}>وصلوا الحرمان</option></select>${S.allAtt ? "" : `<div class="muted" style="margin-top:6px">جاري حساب الغياب…</div>`}`;
    if (isEmp()) { const all = emps();
      if (!S.hrStaff) box.innerHTML = `<div class="muted">جاري تحميل قائمة الموظفين…</div>`;
      else if (!all.length) box.innerHTML = `<div class="notice">ما فيه موظفين مسجّلين. أضفهم من «الموارد البشرية» ← «الموظفين» (الاسم والجوال والقسم).</div>`;
      else if (k === "emp_dept") { const ds = [...new Set(all.map(e => e.dept || "بدون قسم"))].sort((a, b) => a.localeCompare(b, "ar"));
        box.innerHTML = `<div class="list">${ds.map(d => `<label class="item" style="gap:8px;padding:8px 12px"><input type="checkbox" data-md="${esc(d)}" ${M.depts.includes(d) ? "checked" : ""}><span class="grow">${esc(d)}</span><span class="muted">${all.filter(e => (e.dept || "بدون قسم") === d).length}</span></label>`).join("")}</div>`; }
      else if (k === "emp_pick") box.innerHTML = `<div class="list" style="max-height:260px;overflow:auto">${all.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar")).map(e => `<label class="item" style="gap:8px;padding:8px 12px"><input type="checkbox" data-me="${esc(e.id)}" ${M.epick.includes(e.id) ? "checked" : ""}><span class="grow">${esc(e.name)}<span class="muted"> · ${esc(e.job || "")}${e.dept ? " · " + esc(e.dept) : ""}</span></span><span class="muted" dir="ltr">${esc(e.phone || "بدون جوال")}</span></label>`).join("")}</div>`;
      box.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:6px 0 0">موظفو المنشأة ما عندهم حساب في البوابة، فالرسالة توصلهم <b>واتساب</b>. القائمة من «الموارد البشرية» ← «الموظفين».</p>`); }
    if (k === "staff") box.innerHTML = `<div class="list">${Object.entries(ROLE_N).map(([r, n]) => `<label class="item" style="gap:8px;padding:8px 12px"><input type="checkbox" data-mr="${r}" ${M.roles.includes(r) ? "checked" : ""}><span class="grow">${n}</span></label>`).join("")}</div>`;
    box.querySelectorAll("[data-mg]").forEach(c => c.onchange = () => { M.groups = c.checked ? [...M.groups, c.dataset.mg] : M.groups.filter(x => x !== c.dataset.mg); info(); });
    box.querySelectorAll("[data-md]").forEach(c => c.onchange = () => { M.depts = c.checked ? [...M.depts, c.dataset.md] : M.depts.filter(x => x !== c.dataset.md); info(); });
    box.querySelectorAll("[data-me]").forEach(c => c.onchange = () => { M.epick = c.checked ? [...M.epick, c.dataset.me] : M.epick.filter(x => x !== c.dataset.me); info(); });
    box.querySelectorAll("[data-mr]").forEach(c => c.onchange = () => { M.roles = c.checked ? [...M.roles, c.dataset.mr] : M.roles.filter(x => x !== c.dataset.mr); info(); });
    box.querySelectorAll("[data-mp]").forEach(c => c.onchange = () => { const key = k === "tr_pick" ? "tpick" : "pick"; M[key] = c.checked ? [...M[key], c.dataset.mp] : M[key].filter(x => x !== c.dataset.mp); drawPick(); info(); });
    box.querySelectorAll("[data-mx]").forEach(c => c.onclick = () => { const key = k === "tr_pick" ? "tpick" : "pick"; M[key] = M[key].filter(x => x !== c.dataset.mx); drawPick(); info(); });
    const qq = $("#mQ"); if (qq) { qq.oninput = () => { M.q = qq.value; const pos = qq.selectionStart; drawPick(); const x = $("#mQ"); x.focus(); x.setSelectionRange(pos, pos); }; }
    const ab = $("#mAbs"); if (ab) ab.onchange = () => { M.abs = +ab.value; info(); };
    if (k === "st_abs" && !S.allAtt) loadAllAtt().then(() => { if (S.aTab === "msgs" && M.kind === "st_abs") { drawPick(); info(); } }).catch(() => toast("تعذّر تحميل سجلات الحضور"));
  };
  const info = () => {
    const ids = recips(), wa = M.chW && !isStaffK(), withP = wa ? ids.filter(n => phoneOf(n)) : [];
    const miss = wa ? ids.filter(n => !phoneOf(n)).map(nameOf).filter(Boolean) : [];
    $("#mInfo").innerHTML = `<b>${ids.length}</b> ${unitN()}${wa ? ` · ${withP.length} منهم عندهم رقم جوال للواتساب${miss.length ? ` <span>(بدون جوال: ${esc(miss.slice(0, 6).join("، "))}${miss.length > 6 ? ` و${miss.length - 6} غيرهم` : ""})</span>` : ""}` : ""}${isStaffK() && M.chW ? " · <span>الواتساب ما يشمل الأقسام — توصلهم في البوابة</span>" : ""}`;
  };
  const setType = () => { const t = $("#mType").value; if (!M.chW && t !== "custom") { $("#mType").value = "custom"; return setType(); }
    if ((isTr() || isStaffK()) && (t === "att" || t === "grades")) { toast("سجل الحضور والدرجات للطلاب فقط"); $("#mType").value = "custom"; return setType(); }
    if ((isStaffK() || isEmp()) && t !== "custom") { if (t === "att" || t === "grades" || isEmp()) toast("للموظفين: رسالة عامة بس"); $("#mType").value = "custom"; return setType(); }
    $("#mText").value = isTr() && t === "login" ? presets.trLogin : presets[t]; $("#mText").disabled = t === "att" || t === "grades";
    $("#mType").closest("label").style.display = M.chW ? "" : "none"; };
  const empLock = () => { const e = isEmp(); if (e) { M.chP = false; M.chW = true; } $("#chP").checked = M.chP; $("#chW").checked = M.chW; $("#chP").disabled = e; $("#chW").disabled = e; };
  $("#mKind").onchange = () => { M.kind = $("#mKind").value; M.q = ""; empLock(); drawPick(); setType(); info(); };
  $("#chP").onchange = () => { M.chP = $("#chP").checked; info(); };
  $("#chW").onchange = () => { M.chW = $("#chW").checked; setType(); info(); };
  $("#mTitle").oninput = () => M.title = $("#mTitle").value;
  $("#mType").onchange = setType; empLock(); setType(); drawPick(); info();
  if (EMP_OK && !S.hrStaff && isEmp() && !S._empWait) { S._empWait = setInterval(() => { if (S.hrStaff) { clearInterval(S._empWait); S._empWait = null; if (S.aTab === "msgs") { drawPick(); info(); } } }, 400); }
  $("#mCopy").onclick = async () => { try { await navigator.clipboard.writeText($("#mText").value.replace(/\{الاسم\}/g, "").replace(/السلام عليكم \n/, "السلام عليكم\n")); toast("انتسخ النص"); } catch { toast("المتصفح منع النسخ"); } };
  $("#mSend").onclick = async () => {
    const type = $("#mType").value, tpl = $("#mText").value, ids = recips(), tr = isTr(), title = $("#mTitle").value.trim();
    if (!M.chP && !M.chW) return toast("اختار وين توصل الرسالة: البوابة أو الواتساب");
    if (!ids.length) return toast("ما فيه مستلمين — اختار المستلمين أول");
    if (M.chP && (title.length < 3 || type !== "custom" || tpl.replace(/السلام عليكم|\{الاسم\}|الشؤون الأكاديمية|معهد أسس التقنية والقانون|\s/g, "").length < 3)) return toast(type !== "custom" ? "الرسالة في البوابة لازم تكون «رسالة عامة»" : "اكتب عنوان ونص الرسالة");
    if (M.chP && /\{الرمز\}/.test(tpl)) return toast("ما ينفع ترسل {الرمز} في البوابة — شيله أو أرسله واتساب بس");
    if (!confirm(`ترسل «${title || "رسالة"}» إلى ${ids.length} ${unitN()}${M.chP ? " في البوابة مع إشعار" : ""}${M.chW ? (M.chP ? " + " : " ") + "واتساب" : ""}؟`)) return;
    $("#mSend").disabled = true; S._busy = true;
    try {
      if (M.chP) {
        const id = "m-" + Date.now().toString(36) + uid(), who = ROLE_N[S.adminRole] || "الإدارة";
        await setDoc(ref("msgs/" + id), {title: title.slice(0, 80), text: tpl.slice(0, 2000), at: new Date().toISOString(), by: who, kind: M.kind, label: label(), count: ids.length,
          nums: tr || isStaffK() ? [] : ids, tids: tr ? ids : [], roles: isStaffK() ? ids : []});
        notify("msg", id); logAction("رسالة جماعية", `${title} → ${label()} (${ids.length})`); toast(`📨 وصلت الرسالة في البوابة لـ ${ids.length}`); S._msgHist = null;
      }
      if (M.chW && !isStaffK()) {
        const nums = ids.filter(n => /^9665\d{8}$/.test(phoneOf(n) || ""));
        if (!nums.length) toast(tr ? "ما فيه مدربين عندهم رقم جوال" : "ما فيه مستلمين عندهم رقم جوال");
        else { const items = [];
          for (const [k, n] of nums.entries()) { $("#mInfo").textContent = `تجهيز واتساب ${k + 1} من ${nums.length}…`;
            const text = isEmp() ? tpl.replace(/\{الاسم\}/g, nameOf(n)).replace(/\{الرقم\}/g, "").replace(/\{الرمز\}/g, "").replace(/\{الرابط\}/g, location.origin + location.pathname) : tr ? fillTrainerVars(tpl, n) : (type === "att" || type === "grades") ? await waText(n, type, {}) : fillVars(tpl, n);
            items.push({num: n, name: nameOf(n), phone: phoneOf(n), text}); }
          S.msgQ = {items, idx: 0}; }
      }
      M.title = ""; 
    } catch (e) { console.error(e); handleWriteErr(e); }
    S._busy = false; render();
  };
  msgHistory($("#mHist"));
}
/* sent portal messages + who read them */
async function msgHistory(box){
  if (!box) return;
  try { if (!S._msgHist) S._msgHist = (await getDocs(collection(db, "msgs"))).docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30); }
  catch (e) { box.innerHTML = `<h2>الرسائل المرسلة</h2><div class="notice err">تعذّر التحميل — تأكد إن قواعد Firestore الجديدة منشورة.</div>`; return; }
  const L = S._msgHist;
  box.innerHTML = `<h2>الرسائل المرسلة في البوابة</h2>${L.length ? `<div class="list">${L.map(m => `<div class="item" style="align-items:flex-start"><div class="grow"><b>${esc(m.title)}</b><div class="muted">${esc(m.label || "")} · ${m.count} مستلم · ${esc(bothDates(m.at.slice(0, 10)))} · ${esc(m.by || "")}</div><div id="rd-${esc(m.id)}"></div></div><button class="btn sm" data-rd="${esc(m.id)}">مين قرأ؟</button>${RO() ? "" : `<button class="btn sm danger" data-mdel="${esc(m.id)}">حذف</button>`}</div>`).join("")}</div>` : `<div class="muted">ما أرسلت رسائل في البوابة للحين.</div>`}`;
  box.querySelectorAll("[data-rd]").forEach(b => b.onclick = async () => {
    const m = L.find(x => x.id === b.dataset.rd), out = $("#rd-" + m.id); out.innerHTML = `<span class="muted">…</span>`;
    try { const rs = (await getDocs(query(collection(db, "msgReads"), where("msg", "==", m.id)))).docs.map(d => d.data()), seen = new Set(rs.map(r => r.who));
      const ids = [...(m.nums || []), ...(m.tids || []), ...(m.roles || [])], nm = id => (S.students[id] || {}).name || (S.trainers[id] && trainerTitle(S.trainers[id])) || id, not = ids.filter(id => !seen.has(id));
      out.innerHTML = `<div style="margin-top:6px"><span class="pill p">قرأها ${seen.size} من ${ids.length}</span>${not.length ? `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">ما قرأها (${not.length})</summary><div class="muted">${esc(not.map(nm).join("، "))}</div></details>` : ""}</div>`;
    } catch (e) { out.innerHTML = `<span class="muted">تعذّر</span>`; } });
  box.querySelectorAll("[data-mdel]").forEach(b => b.onclick = async () => { if (!confirm("تحذف الرسالة من البوابة عند كل المستلمين؟")) return;
    try { await deleteDoc(ref("msgs/" + b.dataset.mdel)); S._msgHist = null; msgHistory(box); toast("انحذفت"); } catch (e) { handleWriteErr(e); } });
}

/* ---------- inbox: portal messages for students, trainers and staff ---------- */
function msgFill(t){ const me = S.role === "student" ? {n: (S.myStudent || {}).name || "", id: S.myNum} : S.role === "trainer" ? {n: (S.trainers[S.me] && trainerTitle(S.trainers[S.me])) || "", id: S.me} : {n: "", id: ""};
  return String(t || "").replace(/\{الاسم\}/g, me.n).replace(/\{الرقم\}/g, me.id || "").replace(/\{الرابط\}/g, location.origin + location.pathname).replace(/\{الرمز\}/g, ""); }
function watchMsgs(){
  if (S._msgSub || !S.authUser) return;
  const field = S.role === "student" ? ["nums", S.myNum] : S.role === "trainer" ? (S.me ? ["tids", S.me] : null) : S.adminRole ? ["roles", S.adminRole] : null;
  if (!field) return; S._msgSub = true;
  S.subs.push(onSnapshot(query(collection(db, "msgs"), where(field[0], "array-contains", field[1])), snap => { S.inbox = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => b.at.localeCompare(a.at)); renderInboxBar(); if (S.sTab === "msgs" && !busyEditing()) render(); }, () => {}));
  S.subs.push(onSnapshot(query(collection(db, "msgReads"), where("uid", "==", S.authUser.uid)), snap => { S.inboxRead = new Set(snap.docs.map(d => d.data().msg)); renderInboxBar(); if (S.role === "student" && !busyEditing()) render(); }, () => {}));
}
const unreadMsgs = () => (S.inbox || []).filter(m => !(S.inboxRead || new Set()).has(m.id));
async function markMsgRead(m){
  if ((S.inboxRead || new Set()).has(m.id)) return; S.inboxRead = new Set([...(S.inboxRead || []), m.id]);
  const who = S.role === "student" ? S.myNum : S.role === "trainer" ? S.me : S.adminRole;
  try { await setDoc(ref(`msgReads/${m.id}_${S.authUser.uid}`), {msg: m.id, uid: S.authUser.uid, who, name: S.role === "student" ? ((S.myStudent || {}).name || "") : "", at: new Date().toISOString()}); } catch (e) { console.error(e); }
}
function renderInboxBar(){
  let bar = $("#inboxBar"); if (!bar) { bar = document.createElement("div"); bar.id = "inboxBar"; bar.style.cssText = "max-width:1040px;margin:12px auto 0;padding:0 16px;display:grid;gap:8px"; $("#app").before(bar); }
  if (S.role === "student") { bar.innerHTML = ""; return; }   // students read them in their «رسائلي» tab
  const U = unreadMsgs().slice(0, 3);
  bar.innerHTML = U.map(m => `<div class="notice" role="status" style="border-inline-start:4px solid #c8873a"><b>📨 ${esc(m.title)}</b> <span class="muted">· ${esc(m.by || "")}</span><div style="white-space:pre-wrap;margin:6px 0">${esc(msgFill(m.text))}</div><button class="btn sm" data-mread="${esc(m.id)}">قرأتها ✓</button></div>`).join("");
  bar.querySelectorAll("[data-mread]").forEach(b => b.onclick = () => { markMsgRead((S.inbox || []).find(x => x.id === b.dataset.mread)); renderInboxBar(); });
}
function studentMsgs(el){
  const L = S.inbox || [];
  el.innerHTML = `<div class="card"><h2>📨 رسائلي</h2>${L.length ? `<div class="list">${L.map(m => { const nw = !(S.inboxRead || new Set()).has(m.id);
    return `<div class="item" style="display:block;${nw ? "border-inline-start:4px solid #c8873a" : ""}"><div class="row" style="justify-content:space-between"><b>${nw ? "🔵 " : ""}${esc(m.title)}</b><span class="muted">${esc(bothDates(m.at.slice(0, 10)))}</span></div><div class="muted">${esc(m.by || "")}</div><div style="white-space:pre-wrap;margin-top:6px">${esc(msgFill(m.text))}</div></div>`; }).join("")}</div>` : `<p class="muted">ما وصلتك رسائل للحين.</p>`}</div>`;
  L.forEach(m => markMsgRead(m));
}

/* ---------- system tab ---------- */
async function saveSite(patch, label){
  try { await setDoc(ref("public/site"), patch, {merge: true}); S.site = {...(S.site || {}), ...patch}; logAction("الصفحة الرئيسية", label); toast("انحفظ"); render(); }
  catch (e) { handleWriteErr(e); }
}
function adminSystem(el){
  const sys = S.sys || {};
  const annRows = k => liveAnnAll(k).map((a, i) => `<div class="item" style="padding:8px 12px"><span class="grow">${esc(a.text)}<div class="muted">${AUD[k]}${a.expires ? " · ينتهي " + esc(a.expires) : " · بدون انتهاء"}</div></span><button class="btn sm danger" data-adel="${k}:${i}">حذف</button></div>`).join("");
  el.innerHTML = `${quotaCard()}${usageCard()}
  <div class="card"><h2>نسخة احتياطية</h2>
    <p class="muted" style="margin-top:0">ينزّل ملف فيه كل بيانات البوابة: المدربين، والطلاب، والرموز، والجوالات، والحضور، والدرجات، والسجل. احفظه في مكان آمن لأن فيه بيانات حساسة.</p>
    <button class="btn pri" id="bkB">تنزيل نسخة احتياطية الآن</button>
    ${S.adminRole === "admin" ? autoBkHTML() : ""}
    ${S.adminRole === "admin" ? `<h3 style="margin-top:18px">استعادة من نسخة احتياطية</h3><p class="muted" style="margin-top:0">ارفع ملف نسخة احتياطية (asas-backup-….json أو ‎.json.gz من النسخ التلقائية) عشان ترجع البيانات مثل ما كانت وقتها.</p><input type="file" id="rsF" accept=".json,application/json"><div id="rsOut"></div>` : ""}
  </div>
  <div class="card"><h2>أرشفة الفصل وبدء فصل جديد</h2>
    <p class="muted" style="margin-top:0">ينزّل نسخة احتياطية، ويحفظ ملخص الفصل (حضور ودرجات كل متدرب) في "الأرشيف"، وبعدها يمسح الحضور والدرجات والأعذار والإنذارات والتقييمات. المدربين والطلاب وحساباتهم والشهادات الصادرة تبقى.</p>
    <div class="row"><input type="text" id="arName" class="grow" placeholder="اسم الفصل، مثل: الفصل الأول 1448"></div>
    <label class="row" for="arS" style="gap:8px;margin-top:8px"><input type="checkbox" id="arS"> إفراغ الشعب من الطلاب</label>
    <label class="row" for="arC" style="gap:8px"><input type="checkbox" id="arC"> مسح الجداول وروابط Teams والتسجيلات</label>
    <div class="row" style="margin-top:8px"><input type="text" id="arOk" placeholder='اكتب "أرشفة" للتأكيد' style="width:200px"><button class="btn danger" id="arB">أرشفة وبدء فصل جديد</button></div>
    <div id="arLog" class="muted" style="margin-top:8px;white-space:pre-line"></div>
  </div>
  <div class="card"><h2>وضع الصيانة</h2>
    <p class="muted" style="margin-top:0">يقفل الموقع على المدربين والطلاب، والإدارة تقدر تدخل عادي.</p>
    <label class="f" for="mMsg">رسالة الصيانة<textarea id="mMsg" style="min-height:80px">${esc(sys.maintenanceMsg || "نعمل على تحسين البوابة، وبنرجع قريباً.")}</textarea></label>
    <div class="row" style="margin-top:8px">
      ${sys.maintenance ? `<button class="btn pri" id="mOff">إيقاف الصيانة وفتح الموقع</button>` : `<button class="btn danger" id="mOn">تشغيل وضع الصيانة</button>`}
      <button class="btn sm" id="mSaveMsg">حفظ الرسالة</button>
    </div>
  </div>
  <div class="card"><h2>الصفحة الرئيسية</h2>
    <p class="muted" style="margin-top:0">اللي تكتبه هنا يظهر لأي أحد يفتح البوابة. الخانة الفاضية ما تظهر.</p>
    <h3>ترخيص المعهد</h3>
    <div class="row"><label class="f grow" for="accN">رقم الرخصة<input type="text" id="accN" dir="ltr" value="${esc((S.site || {}).accNo || "")}" placeholder="رقم الرخصة من المؤسسة العامة للتدريب التقني والمهني"></label>
      <label class="f grow" for="licU">رابط التحقق (من باركود الرخصة)<input type="url" id="licU" dir="ltr" value="${esc((S.site || {}).licUrl || "")}" placeholder="https://pt-web.tvtc.gov.sa/..."></label>
      <button class="btn pri sm" id="accSave" style="align-self:flex-end">حفظ</button></div>
    <p class="muted">رقم الرخصة والباركود يظهرون في الصفحة الرئيسية وعلى كل المطبوعات. الباركود يفتح صفحة الرخصة الرسمية في موقع المؤسسة.</p>
    <h3 style="margin-top:16px">أرقام الواتساب</h3>
    <div class="list" id="waL">${(S._waEdit || waList(S.site)).map((w, i) => `<div class="item" style="padding:8px 12px"><input type="text" data-wal="${i}" value="${esc(w.label || "")}" placeholder="القسم، مثل: القبول والتسجيل" class="grow"><input type="tel" data-wan="${i}" dir="ltr" value="${esc(w.num || "")}" placeholder="05xxxxxxxx" style="width:160px"><button class="btn sm danger" data-wadel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه أرقام</span>`}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="waAdd">+ رقم</button><button class="btn pri sm" id="waSave">حفظ الأرقام</button></div>
    <h3 style="margin-top:16px">الروابط</h3>
    <div class="row">${SOCIAL.filter(([k]) => k !== "whatsapp").map(([k, l]) => `<label class="f" for="so-${k}" style="flex:1;min-width:150px">${l}<input type="text" id="so-${k}" dir="ltr" value="${esc((S.site || {})[k] || "")}" placeholder="${k === "whatsapp" ? "05xxxxxxxx" : k === "website" ? "example.com" : k === "maps" ? "https://maps.app.goo.gl/..." : "@account"}"></label>`).join("")}</div>
    <div class="row" style="margin-top:8px"><button class="btn pri sm" id="siteSave">حفظ الروابط</button><span class="muted">عدد المتدربين والمحاضرات يتحدث تلقائي.</span></div>
    <h3 style="margin-top:16px">العدّاد التنازلي</h3>
    <div class="row"><input type="text" id="cdL" class="grow" placeholder="مثل: بداية الفصل الثاني" value="${esc(((S.site || {}).countdown || {}).label || "")}"><input type="datetime-local" id="cdA" value="${esc(((S.site || {}).countdown || {}).at || "")}" style="width:220px" aria-label="موعد العدّاد"><button class="btn pri sm" id="cdSave">حفظ</button>${((S.site || {}).countdown || {}).label ? `<button class="btn sm danger" id="cdDel">إيقاف</button>` : ""}</div>
    <p class="muted">يختفي لحاله بعد ما يمر الموعد. الوقت بتوقيت الرياض.</p>
    <h3 style="margin-top:16px">آخر الأخبار</h3>
    <div class="list">${((S.site || {}).news || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(n => `<div class="item" style="padding:8px 12px"><div class="grow"><b>${esc(n.title)}</b><div class="muted">${esc(n.date)}${n.until ? " · يختفي بعد " + esc(n.until) : ""}${n.until && n.until < today() ? " · <b>منتهي</b>" : ""}</div></div><button class="btn sm danger" data-ndel="${esc(n.id)}">حذف</button></div>`).join("") || `<span class="muted">ما فيه أخبار</span>`}</div>
    <div class="row" style="margin-top:8px"><input type="text" id="nwT" class="grow" placeholder="عنوان الخبر" maxlength="90"><input type="date" id="nwU" style="width:170px" aria-label="يختفي بعد"></div>
    <div class="row" style="margin-top:8px"><input type="text" id="nwX" class="grow" placeholder="تفاصيل قصيرة (اختياري)" maxlength="240"><button class="btn gold sm" id="nwAdd">+ إضافة خبر</button></div>
    <p class="muted">تاريخ «يختفي بعد» اختياري. يظهر آخر 4 أخبار.</p>
    <h3 style="margin-top:16px">الأسئلة الشائعة</h3>
    <div class="list" id="fqL">${((S.site || {}).faq || DEFAULT_FAQ).map((f, i) => `<div class="item" style="padding:8px 12px;align-items:flex-start"><div class="grow" style="display:grid;gap:6px"><input type="text" data-fq="${i}" value="${esc(f.q)}" placeholder="السؤال"><textarea data-fa="${i}" style="min-height:50px" placeholder="الجواب">${esc(f.a)}</textarea></div><button class="btn sm danger" data-fdel="${i}">حذف</button></div>`).join("")}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="fqAdd">+ سؤال</button><button class="btn sm" id="fqDef">إضافة الأسئلة المقترحة</button><button class="btn pri sm" id="fqSave">حفظ الأسئلة</button></div>
  </div>
  ${S.adminRole === "admin" ? sigCard("director", "توقيع مدير المعهد", "يظهر على الشهادات في خانة مدير المعهد.") + sigCard("stamp", "الختم الإلكتروني", "يظهر على الشهادات في خانة مدير المعهد، وعلى السندات والكشوف في خانة الختم.") : ""}
  ${S.adminRole === "academic" || S.adminRole === "admin" ? sigCard("academic", "توقيع مسؤول الشؤون الأكاديمية", "يظهر على الشهادات وكشوف الحضور والإنذارات في خانة الشؤون الأكاديمية.") : ""}
  ${S.adminRole === "admin" ? `<div class="card"><h2>الإشعارات</h2>
    <p class="muted" style="margin-top:0">إشعارات تلقائية على جوال المتدرب والمدرب: الغياب، والإنذارات، واعتماد الدرجات، وقرار العذر، والشهادات، والإعلانات، وتذكير الأقساط، ومواعيد التقويم، وتذكير المدرب إذا ما حضّر. كل واحد يفعّلها من زر «تفعيل الإشعارات» فوق بعد ما يدخل.</p>
    <label class="f" for="vapK">مفتاح Web Push (من Firebase: إعدادات المشروع ← Cloud Messaging ← Web Push certificates)<input type="text" id="vapK" dir="ltr" value="${esc((S.site || {}).vapid || "")}" placeholder="BKx…"></label>
    <label class="f" for="pushU" style="margin-top:8px">رابط خدمة الإشعارات (Cloudflare)<input type="url" id="pushU" dir="ltr" value="${esc((S.site || {}).pushUrl || "")}" placeholder="https://osos-push.….workers.dev"></label>
    <div class="row" style="margin-top:8px"><button class="btn pri sm" id="vapSave">حفظ</button>${(S.site || {}).vapid ? `<button class="btn sm" id="pushTest">إرسال إشعار تجريبي لي</button>` : ""}</div></div>` : ""}
  ${S.adminRole === "admin" && (S.site || {}).pushUrl ? secCard() : ""}
  ${S.adminRole === "admin" ? `<div class="card"><h2>القاعة الافتراضية</h2>
    <p class="muted" style="margin-top:0">محاضرات عن بُعد داخل البوابة على سيرفر المعهد. لو القاعة ما ردّت أو كان عليها ضغط، المحاضرة تنفتح على رابط Teams حق المقرر.</p>
    <label class="f" for="mtD">عنوان القاعة<input type="text" id="mtD" dir="ltr" value="${esc((S.site || {}).meetDomain || "")}" placeholder="meet.osustl.com"></label>
    <label class="f" for="mtM" style="margin-top:8px">أقصى عدد مشاركين بنفس الوقت قبل التحويل لـ Teams<input type="number" id="mtM" min="20" max="2000" value="${esc(String((S.site || {}).meetMax || 180))}"></label>
    <label class="f" for="mtB" style="margin-top:8px">سرعة إنترنت سيرفر القاعة (ميغابت) <span class="muted">— من شركة السيرفر. فاضي = تلقائي</span><input type="number" id="mtB" min="50" max="10000" value="${esc(String((S.site || {}).meetMbps || ""))}" placeholder="مثال: 1000"></label>
    <label class="row" for="mtL" style="gap:8px;cursor:pointer;margin-top:8px"><input type="checkbox" id="mtL" ${(S.site || {}).meetLite === false ? "" : "checked"}> توفير الإنترنت في القاعة (كاميرات الطلاب 360p، وكل طالب يشوف المدرب + 3 كاميرات، ويخفّ أكثر لحاله وقت الضغط)</label>
    <label class="row" for="mtT" style="gap:8px;cursor:pointer;margin-top:8px"><input type="checkbox" id="mtT" ${(S.site || {}).meetForceTeams ? "checked" : ""}> كل المحاضرات على Teams (للطوارئ أو صيانة السيرفر)</label>
    <label class="f" for="mtE" style="margin-top:8px">نهاية الفصل التدريبي الحالي (تسجيلاته تنحذف تلقائياً بعد شهر منه)<input type="date" id="mtE" value="${esc((S.site || {}).recEnd || "")}"></label>
    ${(S.site || {}).recPurged ? `<p class="muted" style="margin:6px 0 0">آخر حذف تلقائي: تسجيلات الفصل اللي انتهى ${esc((S.site || {}).recPurged)}.</p>` : ""}
    <div id="mtDisk" class="muted" style="margin-top:8px"></div>
    <div class="row" style="margin-top:8px"><button class="btn pri sm" id="mtSave">حفظ</button></div></div>` : ""}
  <div class="card"><h2>الشهادات والمالية</h2>
    <p class="muted" style="margin-top:0">إذا شغّلته، ما تطلع شهادة الحضور إلا للطالب اللي سدد رسومه كاملة. الطالب اللي ما انفتح له حساب في المالية ما تطلع له شهادة.</p>
    ${sys.certNeedsFee ? `<button class="btn sm" id="cfOff">إيقاف شرط السداد</button> <span class="pill p">شغّال</span>` : `<button class="btn pri sm" id="cfOn">اشتراط السداد لإصدار الشهادة</button>`}
  </div>
  <div class="card"><h2>قفل التحضير</h2>
    <p class="muted" style="margin-top:0">بعد نهاية يوم المحاضرة بعدد الساعات هذا، المدرب ما يقدر يعدّل التحضير. الإدارة تقدر تعدّل دائماً. فاضي = بدون قفل.</p>
    <div class="row"><input type="number" id="lockH" min="0" max="720" step="1" value="${typeof sys.lockHours === "number" && sys.lockHours >= 0 ? sys.lockHours : ""}" style="width:120px" placeholder="مثل 24"><span class="muted">ساعة</span><button class="btn pri sm" id="lockSave">حفظ</button></div>
    <p class="muted">مثال: 0 = يقدر يعدّل لين نهاية يوم المحاضرة بس. 24 = لين نهاية اليوم اللي بعده.</p>
  </div>
  <div class="card"><h2>نسب الإنذار والحرمان</h2>
    <p class="muted" style="margin-top:0">نسب <b>الغياب</b> من عدد محاضرات المقرر. التأخير يُحسب حضور، والاستئذان ما يُحسب غياب.</p>
    <div class="row">
      <label class="f" for="th1">الإنذار الأول %<input type="number" id="th1" min="0" max="100" value="${TH().warn1}" style="width:110px"></label>
      <label class="f" for="th2">الإنذار الثاني %<input type="number" id="th2" min="0" max="100" value="${TH().warn2}" style="width:110px"></label>
      <label class="f" for="th3">الحرمان %<input type="number" id="th3" min="0" max="100" value="${TH().deny}" style="width:110px"></label>
      <label class="f" for="th4">أقل حضور للشهادة %<input type="number" id="th4" min="0" max="100" value="${TH().certMin}" style="width:130px"></label>
      <button class="btn pri sm" id="thSave" style="align-self:flex-end">حفظ النسب</button>
    </div>
  </div>
  <div class="card"><h2>أيام الإجازات</h2>
    <p class="muted" style="margin-top:0">الأيام هذي ما ينحسب فيها غياب، وما يقدر المدرب يحضّر فيها.</p>
    <div class="list">${((sys.holidays) || []).map((h, i) => `<div class="item" style="padding:8px 12px"><span class="grow">${esc(h.label || "إجازة")}<div class="muted">${esc(h.from)}${h.to && h.to !== h.from ? " ← " + esc(h.to) : ""}</div></span><button class="btn sm danger" data-hdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه إجازات</span>`}</div>
    <div class="row" style="margin-top:8px">
      <input type="text" id="hLabel" class="grow" placeholder="مثل: اليوم الوطني">
      <label class="muted" for="hFrom">من</label><input type="date" id="hFrom" style="width:160px">
      <label class="muted" for="hTo">إلى</label><input type="date" id="hTo" style="width:160px">
      <button class="btn gold sm" id="hAdd">+ إضافة</button>
    </div>
  </div>
  <div class="card"><h2>التقويم الأكاديمي</h2>
    <p class="muted" style="margin-top:0">مواعيد مثل بداية التدريب والاختبارات وتسجيل المقررات. تظهر في «القادم في التقويم» بالصفحة الرئيسية، وما تأثر على الحضور.</p>
    <div class="row" style="margin-bottom:10px"><button class="btn gold sm" id="tvtcImp">إضافة تقويم المؤسسة 1448-1449 (النصفي المجزأ)</button><span class="muted">يضيف ${TVTC_1448.events.length} موعد و${TVTC_1448.holidays.length} إجازات، وما يكرر الموجود.</span></div>
    <details><summary class="muted" style="cursor:pointer">المواعيد (${((sys.events) || []).length})</summary>
    <div class="list" style="margin-top:8px">${((sys.events) || []).map((e, i) => `<div class="item" style="padding:8px 12px"><span class="grow">${esc(e.label)}<div class="muted">${dH(e.date)}</div></span><button class="btn sm danger" data-evdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه مواعيد</span>`}</div></details>
    <div class="row" style="margin-top:8px"><input type="text" id="evL" class="grow" placeholder="مثل: بداية الاختبارات النهائية"><input type="date" id="evD" style="width:160px" aria-label="التاريخ"><button class="btn gold sm" id="evAdd">+ إضافة</button></div>
  </div>
  <div class="card"><h2>الإعلانات</h2>
    <p class="muted" style="margin-top:0">تظهر شريط أعلى الموقع، وتختفي تلقائياً بعد تاريخ الانتهاء.</p>
    <label class="f" for="aText">نص الإعلان<textarea id="aText" style="min-height:70px"></textarea></label>
    <div class="row" style="margin-top:8px">
      <select id="aAud" style="width:auto"><option value="all">الكل</option><option value="trainers">المدربين</option><option value="students">الطلاب</option></select>
      <label class="muted" for="aExp">ينتهي</label><input type="date" id="aExp" style="width:160px" min="${today()}">
      <button class="btn gold" id="aAdd">+ نشر الإعلان</button>
    </div>
    <div class="list" style="margin-top:12px">${annRows("all")}${annRows("trainers")}${annRows("students")}</div>
  </div>`;
  if ($("#rsF")) $("#rsF").onchange = e => { const f = e.target.files[0]; if (f) restoreRead(f); };
  bindAutoBk(el);
  $("#bkB").onclick = async () => { $("#bkB").disabled = true; try { await backupAll(); toast("نزلت النسخة الاحتياطية"); } catch (e) { console.error(e); toast("تعذّر أخذ النسخة"); } $("#bkB").disabled = false; };
  $("#arB").onclick = async () => {
    const term = $("#arName").value.trim();
    if (!term) return toast("اكتب اسم الفصل");
    if ($("#arOk").value.trim() !== "أرشفة") return toast('اكتب كلمة "أرشفة" للتأكيد');
    const lines = []; const log = m => { lines.push(m); const e = $("#arLog"); if (e) e.textContent = lines.join("\n"); };
    S._busy = true; $("#arB").disabled = true;
    try { await archiveTerm(term, {clearStudents: $("#arS").checked, clearSchedule: $("#arC").checked}, log); toast("انأرشف الفصل"); }
    catch (e) { console.error(e); log("توقف: " + (e.code || e.message)); }
    S._busy = false;
  };
  const saveSys = async (patch, label) => {
    try { await setDoc(ref("public/system"), patch, {merge: true}); S.sys = {...(S.sys || {}), ...patch}; logAction(label, JSON.stringify(patch).slice(0, 200)); toast("انحفظ"); render(); }
    catch (e) { handleWriteErr(e); }
  };
  if ($("#mOn")) $("#mOn").onclick = () => { const b = $("#mOn"); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟ يقفل الموقع على الكل"; return; } saveSys({maintenance: true, maintenanceMsg: $("#mMsg").value.trim()}, "تشغيل وضع الصيانة"); };
  if ($("#mOff")) $("#mOff").onclick = () => saveSys({maintenance: false}, "إيقاف وضع الصيانة");
  $("#mSaveMsg").onclick = () => saveSys({maintenanceMsg: $("#mMsg").value.trim()}, "تعديل رسالة الصيانة");
  if ($("#cfOn")) $("#cfOn").onclick = () => saveSys({certNeedsFee: true}, "تشغيل شرط السداد للشهادات");
  if ($("#cfOff")) $("#cfOff").onclick = () => saveSys({certNeedsFee: false}, "إيقاف شرط السداد للشهادات");
  bindSigCards(el);
  bindSecCard(el);
  if ($("#mtDisk") && MEET() && (S.site || {}).pushUrl) {
    const show = d => { const box = $("#mtDisk"); if (!box) return; const used = d.total - d.free, pct = Math.round(used / d.total * 100);
      box.innerHTML = `مساحة سيرفر القاعة: <b>${fmtSize(used)}</b> مستخدمة من ${fmtSize(d.total)} (${pct}%) · التسجيلات ${d.files} ملف بحجم ${fmtSize(d.rec) || "0"}${pct >= 85 ? ` <span class="pill a">المساحة قربت تخلص</span>` : ""}`; };
    if (S._disk && Date.now() - S._disk.at < 300000) show(S._disk.d);
    else recTicket({op: "stats"}).then(t => fetch(t.url)).then(r => r.json()).then(d => { if (d && d.total) { S._disk = {at: Date.now(), d}; show(d); } }).catch(() => { const b = $("#mtDisk"); if (b) b.textContent = "مساحة سيرفر القاعة: ما قدرت أقرأها (تأكد إن خدمة التسجيلات مركّبة)."; });
  }
  if ($("#mtSave")) $("#mtSave").onclick = () => {
    const d = $("#mtD").value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (d && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) return toast("العنوان غير صحيح، مثال: meet.osustl.com");
    saveSite({meetDomain: d, meetMax: Math.max(20, Math.round(Number($("#mtM").value) || 180)), meetForceTeams: $("#mtT").checked, meetMbps: Math.round(Number($("#mtB").value) || 0) || null, meetLite: $("#mtL").checked, recEnd: $("#mtE").value || ""}, "إعدادات القاعة الافتراضية");
  };
  if ($("#vapSave")) $("#vapSave").onclick = () => { const v = $("#vapK").value.trim(); if (v && !/^[A-Za-z0-9_-]{60,120}$/.test(v)) return toast("المفتاح غير صحيح، انسخه كامل"); const u = $("#pushU").value.trim().replace(/\/+$/, ""); if (u && !/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u)) return toast("الرابط غير صحيح، لازم يبدأ بـ https://"); saveSite({vapid: v, pushUrl: u, portalUrl: SITE()}, "إعدادات الإشعارات"); };
  if ($("#pushTest")) $("#pushTest").onclick = async () => { if (!pushOn()) { await enablePush(false); if (!pushOn()) return; } if (!(S.site || {}).pushUrl) return toast("حط رابط خدمة الإشعارات أول واحفظه"); try { const r = await notifyNow("test", "me"); toast(r && r.sent ? "انرسل، المفروض يوصلك خلال ثواني" : r ? "الخدمة شغّالة بس ما لقت جهاز مفعّل باسمك. فعّل الإشعارات من الزر فوق" : "ما قدرت أوصل لخدمة الإشعارات. تأكد من الرابط"); } catch { toast("ما قدرت أوصل لخدمة الإشعارات. تأكد من الرابط"); } };
  $("#siteSave").onclick = async () => {
    const d = {};
    SOCIAL.filter(([k]) => k !== "whatsapp").forEach(([k]) => d[k] = $("#so-" + k).value.trim().slice(0, 120));
    saveSite(d, "تعديل روابط التواصل");
  };
  $("#accSave").onclick = () => {
    const u = $("#licU").value.trim();
    if (u && !/^https:\/\/[^/]*tvtc\.gov\.sa\//i.test(u)) return toast("رابط التحقق لازم يكون من موقع المؤسسة (tvtc.gov.sa)");
    saveSite({accNo: $("#accN").value.trim().slice(0, 40), licUrl: u.slice(0, 300)}, "ترخيص المعهد");
  };
  const readWa = () => [...el.querySelectorAll("[data-wan]")].map(x => ({label: el.querySelector(`[data-wal="${x.dataset.wan}"]`).value.trim().slice(0, 40), num: x.value.trim()}));
  $("#waAdd").onclick = () => { S._waEdit = [...readWa(), {label: "", num: ""}]; render(); };
  el.querySelectorAll("[data-wadel]").forEach(b => b.onclick = () => { const l = readWa(); l.splice(Number(b.dataset.wadel), 1); S._waEdit = l; render(); });
  $("#waSave").onclick = () => {
    const l = readWa().filter(w => w.num);
    const bad = l.find(w => !/^9665\d{8}$/.test(normPhone(w.num))); if (bad) return toast(`رقم غير صحيح: ${bad.num}`);
    S._waEdit = null; saveSite({whatsapps: l.map(w => ({label: w.label || "واتساب", num: w.num})).slice(0, 8), whatsapp: ""}, "أرقام الواتساب");
  };
  $("#cdSave").onclick = () => { const label = $("#cdL").value.trim(), at = $("#cdA").value; if (!label || !at) return toast("اكتب اسم المناسبة وموعدها"); saveSite({countdown: {label, at}}, "العدّاد التنازلي: " + label); };
  if ($("#cdDel")) $("#cdDel").onclick = () => saveSite({countdown: {label: "", at: ""}}, "إيقاف العدّاد");
  $("#nwAdd").onclick = () => { const title = $("#nwT").value.trim(); if (!title) return toast("اكتب عنوان الخبر"); saveSite({news: [...((S.site || {}).news || []), {id: "n-" + uid(), title, text: $("#nwX").value.trim(), date: today(), until: $("#nwU").value || ""}].slice(-30)}, "خبر جديد: " + title); };
  el.querySelectorAll("[data-ndel]").forEach(b => b.onclick = () => saveSite({news: ((S.site || {}).news || []).filter(n => n.id !== b.dataset.ndel)}, "حذف خبر"));
  const readFaq = () => [...el.querySelectorAll("[data-fq]")].map(x => ({q: x.value.trim(), a: el.querySelector(`[data-fa="${x.dataset.fq}"]`).value.trim()}));
  $("#fqSave").onclick = () => saveSite({faq: readFaq().filter(f => f.q && f.a).slice(0, 30)}, "الأسئلة الشائعة");
  $("#fqDef").onclick = () => { const cur = readFaq().filter(f => f.q && f.a), have = new Set(cur.map(f => norm(f.q))), add = DEFAULT_FAQ.filter(f => !have.has(norm(f.q))); if (!add.length) return toast("كل الأسئلة المقترحة موجودة"); S.site = {...(S.site || {}), faq: [...cur, ...add].slice(0, 30)}; render(); toast(`انضاف ${add.length} سؤال. راجعها واضغط «حفظ الأسئلة»`); };
  $("#fqAdd").onclick = () => { S.site = {...(S.site || {}), faq: [...readFaq(), {q: "", a: ""}]}; render(); };
  el.querySelectorAll("[data-fdel]").forEach(b => b.onclick = () => { const l = readFaq(); l.splice(Number(b.dataset.fdel), 1); saveSite({faq: l.filter(f => f.q && f.a)}, "حذف سؤال"); });
  $("#tvtcImp").onclick = () => {
    const hs = [...((S.sys && S.sys.holidays) || [])], es = [...((S.sys && S.sys.events) || [])];
    let nh = 0, ne = 0;
    TVTC_1448.holidays.forEach(h => { if (!hs.some(x => x.from === h.from && (x.to || x.from) === h.to)) { hs.push(h); nh++; } });
    TVTC_1448.events.forEach(e => { if (!es.some(x => x.date === e.date && x.label === e.label)) { es.push(e); ne++; } });
    if (!nh && !ne) return toast("التقويم مضاف من قبل");
    saveSys({holidays: hs.sort((a, b) => a.from.localeCompare(b.from)), events: es.sort((a, b) => a.date.localeCompare(b.date))}, `تقويم المؤسسة: ${ne} موعد و${nh} إجازة`);
  };
  $("#evAdd").onclick = () => { const label = $("#evL").value.trim(), date = $("#evD").value; if (!label || !date) return toast("اكتب الموعد وتاريخه"); saveSys({events: [...((S.sys && S.sys.events) || []), {date, label}].sort((a, b) => a.date.localeCompare(b.date))}, "موعد: " + label); };
  el.querySelectorAll("[data-evdel]").forEach(b => b.onclick = () => { const l = [...((S.sys && S.sys.events) || [])]; l.splice(Number(b.dataset.evdel), 1); saveSys({events: l}, "حذف موعد"); });
  $("#lockSave").onclick = () => {
    const v = $("#lockH").value.trim();
    if (v !== "" && !(Number(v) >= 0)) return toast("اكتب عدد ساعات صحيح");
    saveSys({lockHours: v === "" ? -1 : Math.round(Number(v))}, "قفل التحضير");
  };
  $("#thSave").onclick = () => {
    const v = ["th1", "th2", "th3", "th4"].map(id => Number($("#" + id).value));
    if (v.some(x => !(x >= 0 && x <= 100))) return toast("النسب لازم تكون بين 0 و100");
    if (!(v[0] < v[1] && v[1] < v[2])) return toast("لازم: الإنذار الأول أقل من الثاني، والثاني أقل من الحرمان");
    saveSys({thresholds: {warn1: v[0], warn2: v[1], deny: v[2], certMin: v[3]}}, "نسب الإنذار والحرمان");
  };
  $("#hAdd").onclick = () => {
    const from = $("#hFrom").value, to = $("#hTo").value || from, label = $("#hLabel").value.trim();
    if (!from) return toast("حدد تاريخ البداية");
    if (to < from) return toast("تاريخ النهاية قبل البداية");
    const list = [...((S.sys && S.sys.holidays) || []), {from, to, label}].sort((a, b) => a.from.localeCompare(b.from));
    saveSys({holidays: list}, "إضافة إجازة");
  };
  el.querySelectorAll("[data-hdel]").forEach(b => b.onclick = () => { const list = [...((S.sys && S.sys.holidays) || [])]; list.splice(Number(b.dataset.hdel), 1); saveSys({holidays: list}, "حذف إجازة"); });
  const saveAnn = async (k, items, label) => {
    try { await setDoc(ref("ann/" + k), {items}); S.ann[k] = items; notify("ann", k); logAction(label, AUD[k]); renderAnn(); render(); }
    catch (e) { handleWriteErr(e); }
  };
  $("#aAdd").onclick = () => {
    const text = $("#aText").value.trim(), k = $("#aAud").value, exp = $("#aExp").value;
    if (!text) return toast("اكتب نص الإعلان");
    saveAnn(k, [...liveAnnAll(k), {text, audience: k, expires: exp || "", at: today()}], "نشر إعلان");
  };
  el.querySelectorAll("[data-adel]").forEach(b => b.onclick = () => {
    const [k, i] = b.dataset.adel.split(":"); const items = liveAnnAll(k); items.splice(Number(i), 1); saveAnn(k, items, "حذف إعلان");
  });
}
const liveAnnAll = k => liveAnn(S.ann[k]);   // expired ones are dropped on the next save

/* ---------- follow-up tab: deprivation alerts, most absent courses, monthly report ---------- */
async function loadAllAtt(force){
  if (S.allAtt && !force) return;
  const snap = await getDocs(collection(db, "att"));
  S.allAtt = snap.docs.map(d => d.data()); S.allAttAt = new Date();
}
/* every student who reached a warning level; shared by the follow-up tab and the alert banner */
function absAlerts(){
  const byGroup = {}; (S.allAtt || []).forEach(d => (byGroup[d.groupId] = byGroup[d.groupId] || []).push(d));
  const gs = sortedGroups(), alerts = [], courses = [];
  gs.forEach(g => {
    const docs = countable(byGroup[g.id]);
    let sum = 0, n = 0;
    (g.students || []).forEach(s => {
      const st = absStats(g, s.id, docs); if (docs.length) { sum += st.absPct; n++; }
      if (st.level) alerts.push({g, s, st, wid: s.sid ? `${s.sid}_${g.id}_${st.level}` : ""});
    });
    if (docs.length) courses.push({g, avg: Math.round(sum / Math.max(n, 1) * 10) / 10, held: docs.length});
  });
  alerts.sort((a, b) => b.st.level - a.st.level || b.st.absPct - a.st.absPct);
  return {gs, alerts, courses};
}
/* waiting = reached a level, has an academic number, no warning issued and not waived by academic affairs */
const alertWaiting = a => a.wid && !(S.warnings || {})[a.wid] && !(S.waivers || {})[a.wid];
function absNag(){
  if (!["academic", "admin"].includes(S.adminRole)) return "";
  if (!S.allAtt) { if (!S._attLoading && S.loaded && S.loaded.groups) { S._attLoading = true; loadAllAtt().then(() => { if (S.view === "admin" && !busyEditing()) render(); }).catch(() => {}).finally(() => { S._attLoading = false; }); } return ""; }
  const w = absAlerts().alerts.filter(alertWaiting); if (!w.length || S.aTab === "follow") return "";
  const n3 = w.filter(a => a.st.level === 3).length;
  return `<div class="notice err" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="grow">تنبيه غياب: ${w.length} طالب وصلوا نسبة ${n3 ? `حرمان (${n3}) أو إنذار` : "إنذار"} وما صدر لهم إنذار.</span><button class="btn sm pri" id="nagAbs">افتح المتابعة</button></div>`;
}
function adminFollow(el){
  if (!S.allAtt) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري تحميل سجلات الحضور…</p></div>`;
    loadAllAtt().then(() => { if (S.aTab === "follow") render(); }).catch(e => { console.error(e); el.innerHTML = `<div class="notice err">تعذّر تحميل السجلات.</div>`; });
    return;
  }
  const {gs, alerts, courses} = absAlerts();
  courses.sort((a, b) => b.avg - a.avg);
  const noTotal = gs.filter(g => !g.totalSessions).length;
  const month = S.repMonth || today().slice(0, 7);
  const mDocs = S.allAtt.filter(d => d.date.startsWith(month) && !isHoliday(d.date));
  const mRows = gs.map(g => {
    const docs = mDocs.filter(d => d.groupId === g.id); if (!docs.length) return null;
    let p = 0, a = 0, e = 0, tot = 0;
    (g.students || []).forEach(s => docs.forEach(d => { const r = d.rec && d.rec[s.id]; tot++; if (!r || !r.st || r.st === "a") a++; else if (r.st === "e") e++; else p++; }));
    return {g, held: docs.length, rate: tot ? Math.round(p / tot * 100) : 0, a, e};
  }).filter(Boolean);
  const mStu = [];
  gs.forEach(g => { const docs = mDocs.filter(d => d.groupId === g.id); (g.students || []).forEach(s => { const a = docs.filter(d => { const r = d.rec && d.rec[s.id]; return !r || !r.st || r.st === "a"; }).length; if (a) mStu.push({g, s, a, held: docs.length}); }); });
  mStu.sort((x, y) => y.a - x.a);
  el.innerHTML = `
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">المتابعة</h2>
    <button class="btn sm" id="fRef">تحديث${S.allAttAt ? " · آخر تحميل " + S.allAttAt.toLocaleTimeString("ar-SA-u-nu-latn", {hour: "2-digit", minute: "2-digit"}) : ""}</button></div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="n">${alerts.filter(a => a.st.level === 3).length}</div><div class="l">حرمان</div></div>
      <div class="stat"><div class="n">${alerts.filter(a => a.st.level === 2).length}</div><div class="l">إنذار ثاني</div></div>
      <div class="stat"><div class="n">${alerts.filter(a => a.st.level === 1).length}</div><div class="l">إنذار أول</div></div>
      <div class="stat"><div class="n">${Object.keys(S.students).length}</div><div class="l">طالب وطالبة</div></div>
    </div>
    ${noTotal ? `<p class="muted">فيه ${noTotal} مقرر بدون "عدد المحاضرات الكلي"، فنسبته محسوبة من المحاضرات اللي صارت لين الحين. حدده من "المقررات والطلاب" عشان تكون النسب أدق.</p>` : ""}
  </div>
  <div class="card"><h2>تنبيه الحرمان (${alerts.length})</h2>
    ${alerts.length ? `<div class="tbl"><table><thead><tr><th class="nm">الطالب</th><th class="nm">المقرر</th><th>غياب</th><th>النسبة</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${alerts.map(({g, s, st}) => `<tr><td class="nm">${esc(s.name)}</td><td class="nm">${esc(g.course)}</td><td>${st.a}${st.total ? "/" + st.total : ""}</td><td>${st.absPct}%</td><td>${levelPill(st)}</td>
      <td>${s.sid ? (() => { const wid = `${s.sid}_${g.id}_${st.level}`, w = (S.warnings || {})[wid];
        const wv = (S.waivers || {})[wid];
        if (!w && wv) return `<span class="pill">متغاضى عنه${wv.at ? " " + esc(wv.at.slice(5, 10)) : ""}</span>${RO() ? "" : ` <button class="btn sm" data-unwaive="${esc(wid)}">تراجع</button>`}`;
        return `${w ? `<span class="pill p">صدر ${esc(w.date.slice(5))}</span> <button class="btn sm" data-pw="${esc(wid)}">طباعة</button>` : `<button class="btn sm" data-issue="${esc(wid)}">إصدار</button>${RO() ? "" : ` <button class="btn sm" data-waive="${esc(wid)}">تغاضي</button>`}`} <button class="btn sm gold" data-warn="${esc(s.sid)}" data-c="${esc(g.course)}" data-l="${esc(LEVEL[st.level])}" data-p="${st.absPct}">واتساب</button>`; })() : ""}</td></tr>`).join("")}</tbody></table></div>
    ${alerts.some(alertWaiting) ? `<div class="row" style="margin-top:10px"><button class="btn pri sm" id="issueAll">إصدار كل الإنذارات غير الصادرة</button><span class="muted">الإنذار الصادر يظهر للطالب في بوابته.</span></div>` : ""}`
    : `<p class="muted" style="margin:0">ما فيه طلاب وصلوا نسبة الإنذار.</p>`}
  </div>
  ${Object.values(S.warnings || {}).some(x => x.date === today()) ? `<div class="row"><button class="btn sm" id="pwToday">طباعة الإنذارات الصادرة اليوم (${Object.values(S.warnings).filter(x => x.date === today()).length})</button></div>` : ""}
  <div class="card"><h2>أكثر المقررات غياباً</h2>
    ${courses.length ? `<div class="list">${courses.slice(0, 6).map(c => `<div class="item"><div class="grow"><div class="t">${esc(c.g.course)}</div><div class="muted">${esc(tName(c.g.trainerId))} · ${c.held} محاضرة</div></div><b>${c.avg}%</b><span class="bar" style="width:120px"><i style="width:${Math.min(100, c.avg * 3)}%;background:var(--abs)"></i></span></div>`).join("")}</div>` : `<p class="muted" style="margin:0">ما فيه سجلات بعد.</p>`}
  </div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">التقرير الشهري</h2>
    <div class="row"><input type="month" id="repM" value="${esc(month)}" style="width:170px"><button class="btn sm" id="copyM">نسخ للـ Excel</button></div></div>
    ${mRows.length ? `<div class="tbl" style="margin-top:10px"><table id="mtM"><thead><tr><th class="nm">المقرر</th><th class="nm">المدرب/ة</th><th>محاضرات</th><th>نسبة الحضور</th><th>مرات الغياب</th><th>استئذان</th></tr></thead><tbody>
      ${mRows.map(r => `<tr><td class="nm">${esc(r.g.course)}</td><td class="nm">${esc(tName(r.g.trainerId))}</td><td>${r.held}</td><td>${r.rate}%</td><td>${r.a}</td><td>${r.e}</td></tr>`).join("")}</tbody></table></div>
      <h3 style="margin:14px 0 6px">الغياب حسب الطالب</h3>
      <div class="tbl"><table id="mtS"><thead><tr><th class="nm">الطالب</th><th>الرقم</th><th class="nm">المقرر</th><th>غياب</th><th>من</th></tr></thead><tbody>
      ${mStu.map(r => `<tr><td class="nm">${esc(r.s.name)}</td><td>${esc(r.s.sid || "—")}</td><td class="nm">${esc(r.g.course)}</td><td>${r.a}</td><td>${r.held}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">ما فيه غياب في هذا الشهر</td></tr>`}</tbody></table></div>`
    : `<p class="muted">ما فيه تحضير مسجل في هذا الشهر.</p>`}
  </div>`;
  $("#fRef").onclick = () => { S.allAtt = null; render(); };
  $("#repM").onchange = e => { S.repMonth = e.target.value; render(); };
  $("#copyM").onclick = async () => {
    const t = ["#mtM", "#mtS"].map(id => $(id)).filter(Boolean).map(tb => [...tb.rows].map(tr => [...tr.cells].map(td => td.innerText.trim()).join("\t")).join("\n")).join("\n\n");
    if (!t) return toast("ما فيه بيانات");
    try { await navigator.clipboard.writeText(`التقرير الشهري ${month}\n\n` + t); toast("انتسخ التقرير، الصقه في Excel"); } catch { toast("المتصفح منع النسخ"); }
  };
  const issue = async list => {
    const b = writeBatch(db);
    list.forEach(({g, s, st}) => b.set(ref(`warnings/${s.sid}_${g.id}_${st.level}`), {num: s.sid, name: s.name, groupId: g.id, course: g.course, level: st.level, levelName: LEVEL[st.level], absPct: st.absPct, absences: st.a, date: today(), by: S.adminRole}));
    try { await b.commit(); list.forEach(({g, s, st}) => notify("warning", `${s.sid}_${g.id}_${st.level}`)); logAction("إصدار إنذارات", list.map(x => `${x.s.name} (${LEVEL[x.st.level]})`).join("، ")); toast(`صدر ${list.length} إنذار`); } catch (e) { handleWriteErr(e); }
  };
  el.querySelectorAll("[data-pw]").forEach(b => b.onclick = () => printWarnings([S.warnings[b.dataset.pw]]));
  if ($("#pwToday")) $("#pwToday").onclick = () => printWarnings(Object.values(S.warnings || {}).filter(x => x.date === today()));
  el.querySelectorAll("[data-issue]").forEach(b => b.onclick = () => { const a = alerts.find(({g, s, st}) => `${s.sid}_${g.id}_${st.level}` === b.dataset.issue); if (a) issue([a]); });
  if ($("#issueAll")) $("#issueAll").onclick = () => issue(alerts.filter(alertWaiting));
  el.querySelectorAll("[data-waive]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟ ما بيصدر إنذار"; return; }
    const a = alerts.find(x => x.wid === b.dataset.waive); if (!a) return;
    const d = {num: a.s.sid, name: a.s.name, groupId: a.g.id, course: a.g.course, level: a.st.level, absPct: a.st.absPct, by: S.adminRole, at: new Date().toISOString()};
    try { await setDoc(ref("waivers/" + a.wid), d); S.waivers[a.wid] = d; logAction("تغاضي عن إنذار", `${a.s.name} · ${a.g.course} · ${LEVEL[a.st.level]}`); toast("تم، ما بيجيك تنبيه عنه في هذا المستوى"); render(); } catch (e) { handleWriteErr(e); }
  });
  el.querySelectorAll("[data-unwaive]").forEach(b => b.onclick = async () => {
    const id = b.dataset.unwaive, x = (S.waivers || {})[id];
    try { await deleteDoc(ref("waivers/" + id)); delete S.waivers[id]; logAction("إلغاء التغاضي عن إنذار", x ? `${x.name} · ${x.course}` : id); render(); } catch (e) { handleWriteErr(e); }
  });
  el.querySelectorAll("[data-warn]").forEach(b => b.onclick = () => openWhatsApp(b.dataset.warn, {type: "warning", course: b.dataset.c, level: b.dataset.l, pct: b.dataset.p}));
}

/* ---------- excuses tab ---------- */
/* ---------- institute mail (@osustl.com) inside the portal ----------
   Each department reads and sends from its own address; the general administration sees every box.
   Messages arrive through Cloudflare Email Routing into the push service, which stores them in mbox/{role}/m (list) and mbox/{role}/b (body). */
const MAIL_DOMAIN = "osustl.com";
const MBOXES = {ceo: ["admin", "الإدارة العامة"], info: ["admin", "الإيميل العام"], academic: ["academic", "الشؤون الأكاديمية"], finance: ["finance", "المالية"],
  admission: ["admission", "القبول والتسجيل"], support: ["admission", "خدمة العملاء"], hr: ["hr", "الموارد البشرية"], business: ["business", "قطاع الشركات"]};
const MAIL_ROLES_ALL = ["admin", "academic", "finance", ...MAIL_STAFF];
// a trainer's own mailbox: tr{number}@osustl.com, kept under mbox/{trainer id}
// the address is the name the administration chose (t.mail), else tr{number}; tr{number} keeps working as a second address
const trLocal = t => t ? (t.mail || (t.num ? "tr" + t.num : "")) : "";
const trMe = () => S.role === "trainer" && S.me && S.trainers && S.trainers[S.me] && trLocal(S.trainers[S.me]) ? S.trainers[S.me] : null;
const trAddr = t => trLocal(t) ? `${trLocal(t)}@${MAIL_DOMAIN}` : "";
const MAIL_RESERVED = ["ceo", "info", "academic", "finance", "admission", "support", "hr", "business", "admin", "postmaster", "abuse", "noreply", "no-reply", "root", "webmaster", "hostmaster", "security", "mail", "contact", "sales"];
const myMailRoles = () => trMe() ? [S.me] : S.adminRole === "admin" ? MAIL_ROLES_ALL : MAIL_ROLES_ALL.includes(S.adminRole) ? [S.adminRole] : [];
const myBoxes = () => trMe() ? [trLocal(trMe())] : Object.keys(MBOXES).filter(b => S.adminRole === "admin" || MBOXES[b][0] === S.adminRole);
const mailAll = () => Object.values(S.mail || {}).flat().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
const mailUnread = () => mailAll().filter(m => m.dir === "in" && !m.read && !m.trash);
const mailBadge = () => { const n = mailUnread().length; return n ? ` (${n})` : ""; };
/* saved addresses: one book per mailbox owner (department role, or the trainer's id) in mailBook/{key} */
const bookKey = () => trMe() ? S.me : S.adminRole;
const bookList = () => ((S.book || {}).list || []);
const bookHas = a => bookList().some(x => x.addr === String(a).toLowerCase());
async function bookSave(list){
  list = list.filter(x => x && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.addr)).map(x => ({name: String(x.name || "").trim().slice(0, 80) || x.addr.split("@")[0], addr: String(x.addr).trim().toLowerCase()}))
    .filter((x, i, a) => a.findIndex(y => y.addr === x.addr) === i).sort((a, b) => a.name.localeCompare(b.name, "ar")).slice(0, 500);
  S.book = {list}; await setDoc(doc(db, "mailBook", bookKey()), {list, at: new Date().toISOString()});
}
function mailSubs(){
  S.mail = {}; S.mailLim = S.mailLim || 120;
  if (S._bookSub) { try { S._bookSub(); } catch {} }
  if (bookKey()) S._bookSub = onSnapshot(doc(db, "mailBook", bookKey()), x => { S.book = x.exists() ? x.data() : {list: []}; if (S.mailDraft && !busyEditing()) render(); }, () => { S.book = {list: []}; });
  (S._mailSubs || []).forEach(u => { try { u(); } catch {} });
  S._mailSubs = myMailRoles().map(r => onSnapshot(query(collection(db, "mbox", r, "m"), orderBy("at", "desc"), limit(S.mailLim)), snap => {
    const old = (S.mail[r] || []).length;
    S.mail[r] = snap.docs.map(d => ({id: d.id, r, ...d.data()}));
    if (S._mailReady && S.mail[r].length > old && snap.docChanges().some(c => c.type === "added" && c.doc.data().dir === "in") && !isMailTab()) toast("وصلك بريد جديد");
    afterData();
  }, e => console.error(e)));
  S.subs.push(() => { (S._mailSubs || []).forEach(u => { try { u(); } catch {} }); S._mailSubs = []; });
  setTimeout(() => { S._mailReady = true; }, 4000);
}
const isMailTab = () => S.role === "trainer" ? !!S.trMail : (FIN() ? S.finTab === "mail" : S.aTab === "mail");
async function mailApi(body){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const r = await fetch(url + "/mail", {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || "failed"); e.code = j.error; throw e; } return j;
}
const mailWhen = iso => { if (!iso) return ""; const d = new Date(iso), t = d.toLocaleDateString("en-CA"); return t === today() ? d.toLocaleTimeString("ar-SA-u-nu-latn", {hour: "numeric", minute: "2-digit"}) : d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {day: "numeric", month: "short"}); };
const mailWhenFull = iso => iso ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit"}) : "";
const boxLabel = b => MBOXES[b] ? `${MBOXES[b][1]} (${b}@)` : trMe() ? `بريدي (${b}@)` : b;
const MAIL_ERR = {"bad address": "فيه عنوان إيميل غير صحيح", "unknown address": "فيه عنوان داخلي @osustl.com مو موجود. اختره من «دليل البريد»", "too big": "المرفقات أكبر من 20 ميجا", "attachment missing": "مرفق ما انرفع، احذفه وأعد إرفاقه", "sending off": "الإرسال ما تفعّل للحين في Cloudflare",
  E_RECIPIENT_PLAN_RESTRICTED: "الإرسال للخارج يحتاج خطة Workers المدفوعة", E_SENDER_DOMAIN_NOT_CONFIGURED: "الدومين ما تجهّز للإرسال في Cloudflare", E_EMAIL_SENDING_NOT_READY: "الإرسال للحين يتجهّز في Cloudflare، جرّب بعد شوي",
  E_RECIPIENT_SUPPRESSED: "هذا العنوان موقوف عنه الإرسال (رجع منه بريد قبل)", E_DAILY_LIMIT_EXCEEDED: "وصلتوا حد الإرسال اليومي", E_RATE_LIMIT_EXCEEDED: "إرسال كثير بوقت قصير، انتظر شوي"};
function mailTab(el){
  if (!S.mail) mailSubs();
  const boxes = myBoxes(), all = mailAll();
  if (S.mailDraft) return mailCompose(el);
  if (S.mailBookOpen) return mailBookView(el);
  if (S.mailOpen) { const m = all.find(x => x.id === S.mailOpen.id && x.r === S.mailOpen.r); if (m) return mailView(el, m); S.mailOpen = null; }
  const f = S.mailF || "in", bx = boxes.includes(S.mailBox) ? S.mailBox : "", q = (S.mailQ || "").trim().toLowerCase();
  const inBox = m => !bx || m.box === bx;
  const list = all.filter(inBox).filter(m => f === "trash" ? m.trash : !m.trash && (f === "star" ? m.star : m.dir === f))
    .filter(m => !q || [m.subject, m.fromName, m.from, (m.to || []).join(" "), m.snip].join(" ").toLowerCase().includes(q));
  const un = b => all.filter(m => (!b || m.box === b) && m.dir === "in" && !m.read && !m.trash).length;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">البريد</h2><div class="row" style="gap:6px"><button class="btn" id="mlBook">📒 العناوين المحفوظة</button><button class="btn pri" id="mlNew">✉️ رسالة جديدة</button></div></div>
    ${boxes.length > 1 ? `<div class="row" style="margin-top:10px;gap:6px">${["", ...boxes].map(b => `<button class="btn sm ${bx === b ? "pri" : ""}" data-mlbx="${b}">${b ? esc(MBOXES[b][1]) : "الكل"}${un(b) ? ` <b>(${un(b)})</b>` : ""}</button>`).join("")}</div>` : `<p class="muted" style="margin:6px 0 0" dir="ltr">${esc(boxes[0] || "")}@${MAIL_DOMAIN}</p>`}
    <div class="row" style="margin-top:10px;gap:6px">${[["in", "الوارد"], ["out", "المرسل"], ["star", "★ المميزة"], ["trash", "المحذوفات"]].map(([k, v]) => `<button class="btn sm ${f === k ? "pri" : ""}" data-mlf="${k}">${v}${k === "in" && un(bx) ? ` (${un(bx)})` : ""}</button>`).join("")}</div>
    <input type="search" id="mlQ" placeholder="بحث بالاسم أو الإيميل أو العنوان" value="${esc(S.mailQ || "")}" style="margin-top:10px;width:100%"></div>
  <div class="list" style="grid-template-columns:minmax(0,1fr)">${list.map(m => `<div class="item mlRow" data-mlo="${m.r}:${m.id}" style="cursor:pointer;align-items:flex-start;flex-wrap:nowrap;${m.dir === "in" && !m.read ? "border-inline-start:4px solid var(--g);" : ""}">
      <button class="btn sm" data-mlstar="${m.r}:${m.id}" title="تمييز" style="padding:2px 8px;${m.star ? "color:#B08D3C" : ""}">${m.star ? "★" : "☆"}</button>
      <div class="grow" style="min-width:0;flex:1">
        <div class="row" style="justify-content:space-between;gap:6px;flex-wrap:nowrap"><span style="min-width:0;flex:1;${m.dir === "in" && !m.read ? "font-weight:700" : ""};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.dir === "out" ? "إلى: " + (m.to || []).join("، ") : (m.fromName || m.from))}</span><span class="muted" style="white-space:nowrap;font-size:13px">${esc(mailWhen(m.at))}</span></div>
        <div style="${m.dir === "in" && !m.read ? "font-weight:700" : ""};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.atts || []).length ? "📎 " : ""}${esc(m.subject || "(بدون عنوان)")}</div>
        <div class="muted" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${!bx && boxes.length > 1 ? `<span class="pill" style="margin-inline-end:4px">${esc(MBOXES[m.box] ? MBOXES[m.box][1] : m.box)}</span>` : ""}${m.sus ? `<span class="pill a" style="margin-inline-end:4px">مشبوه</span>` : ""}${m.replied ? `<span class="pill p" style="margin-inline-end:4px">تم الرد</span>` : ""}${esc(m.snip || "")}</div>
      </div></div>`).join("") || `<div class="card empty">${f === "in" ? "ما فيه رسائل واردة." : f === "out" ? "ما أرسلت شي للحين." : f === "star" ? "ما ميّزت أي رسالة." : "المحذوفات فاضية."}</div>`}</div>
  ${all.length >= S.mailLim * 0.9 ? `<div style="text-align:center;margin:10px 0"><button class="btn" id="mlMore">عرض رسائل أقدم</button></div>` : ""}`;
  $("#mlNew").onclick = () => { S.mailDraft = {box: bx || boxes[0], to: "", cc: "", subject: "", body: "", atts: [], _dir: true}; loadMailDir(); render(); };
  if ($("#mlBook")) $("#mlBook").onclick = () => { S.mailBookOpen = true; render(); };
  el.querySelectorAll("[data-mlbx]").forEach(b => b.onclick = () => { S.mailBox = b.dataset.mlbx; render(); });
  el.querySelectorAll("[data-mlf]").forEach(b => b.onclick = () => { S.mailF = b.dataset.mlf; render(); });
  const q2 = $("#mlQ"); q2.oninput = () => { S.mailQ = q2.value; clearTimeout(S._mlT); S._mlT = setTimeout(() => { render(); const x = $("#mlQ"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 300); };
  el.querySelectorAll("[data-mlstar]").forEach(b => b.onclick = e => { e.stopPropagation(); const [r, id] = b.dataset.mlstar.split(":"), m = all.find(x => x.id === id && x.r === r); if (m) mailMark(m, {star: !m.star}); });
  el.querySelectorAll("[data-mlo]").forEach(b => b.onclick = () => { const [r, id] = b.dataset.mlo.split(":"); S.mailOpen = {r, id}; S.mailBody = null; render(); window.scrollTo(0, 0); });
  if ($("#mlMore")) $("#mlMore").onclick = () => { S.mailLim += 150; mailSubs(); };
}
function mailMark(m, ch){
  Object.assign(m, ch);
  return setDoc(doc(db, "mbox", m.r, "m", m.id), ch, {merge: true}).catch(e => { console.error(e); toast("ما انحفظ التغيير"); }).then(() => { if (!busyEditing()) render(); });
}
function mailView(el, m){
  const key = m.r + ":" + m.id;
  if (!S.mailBody || S.mailBody.key !== key) {
    S.mailBody = {key, loading: true};
    getDoc(doc(db, "mbox", m.r, "b", m.id)).then(x => { if (S.mailBody && S.mailBody.key === key) { S.mailBody = {key, ...(x.exists() ? x.data() : {text: ""})}; render(); } })
      .catch(e => { console.error(e); if (S.mailBody && S.mailBody.key === key) { S.mailBody = {key, text: "تعذّر تحميل الرسالة."}; render(); } });
  }
  if (m.dir === "in" && !m.read) mailMark(m, {read: true});
  const b = S.mailBody || {}, addr = (arr) => (arr || []).map(x => `<span dir="ltr">${esc(x)}</span>`).join("، ");
  el.innerHTML = `<div class="card">
    <div class="row" style="gap:6px;margin-bottom:10px"><button class="btn sm" id="mvBack">→ رجوع</button><span class="grow"></span>
      ${m.trash ? `<button class="btn sm" id="mvRestore">استرجاع</button><button class="btn sm danger" id="mvKill">حذف نهائي</button>` : `<button class="btn sm" id="mvStar">${m.star ? "★ مميزة" : "☆ تمييز"}</button>${m.dir === "in" ? `<button class="btn sm" id="mvUnread">غير مقروءة</button>` : ""}<button class="btn sm danger" id="mvTrash">حذف</button>`}</div>
    <h2 style="margin:0 0 8px">${esc(m.subject || "(بدون عنوان)")}</h2>
    ${m.sus ? `<div class="notice" style="background:#fdecea;border-color:#f5c2c0;margin-bottom:8px">⚠️ هذي الرسالة ما اجتازت فحص المرسل، ممكن تكون احتيال. لا تفتح روابطها ولا مرفقاتها ولا ترسل أي بيانات.</div>` : ""}
    <div class="muted" style="line-height:1.9">
      <div><b>من:</b> ${m.dir === "out" ? esc(boxLabel(m.box)) : `${esc(m.fromName || "")} <span dir="ltr">&lt;${esc(m.from)}&gt;</span>${!String(m.from || "").endsWith("@" + MAIL_DOMAIN) && !bookHas(m.replyTo || m.from) && !m.sus ? ` <button class="btn sm" id="mvSave" style="padding:1px 8px">⭐ حفظ</button>` : ""}`}</div>
      <div><b>إلى:</b> ${addr(m.to)}</div>${(m.cc || []).length ? `<div><b>نسخة:</b> ${addr(m.cc)}</div>` : ""}
      <div><b>التاريخ:</b> ${esc(mailWhenFull(m.at))}${myBoxes().length > 1 ? ` · <b>الصندوق:</b> ${esc(boxLabel(m.box))}` : ""}</div></div>
    ${(m.atts || []).length ? `<div class="row" style="margin-top:10px;gap:6px">${m.atts.map((a, i) => a.rid ? `<button class="btn sm" data-mvatt="${i}">📎 ${esc(a.name)} <span class="muted">${esc(fmtSize(a.size))}</span></button>` : `<span class="pill">📎 ${esc(a.name)} (ما انحفظ)</span>`).join("")}</div>` : ""}
    <div id="mvBody" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">${b.loading ? `<p class="muted">جاري التحميل…</p>` : b.html ? "" : `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.8">${linkify(esc(b.text || ""))}</div>`}</div>
    ${m.trash ? "" : `<div class="row" style="margin-top:14px;gap:6px"><button class="btn pri" id="mvRe">↩ رد</button>${m.dir === "in" && ((m.to || []).length + (m.cc || []).length) > 1 ? `<button class="btn" id="mvReAll">رد على الكل</button>` : ""}<button class="btn" id="mvFw">↪ إعادة توجيه</button></div>`}</div>`;
  if (b.html) {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox"); f.setAttribute("referrerpolicy", "no-referrer");
    f.style.cssText = "width:100%;height:65vh;border:0;background:#fff;border-radius:8px";
    f.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; form-action 'none'"><base target="_blank"><style>body{font-family:Tahoma,Arial,sans-serif;margin:8px;word-break:break-word}img{max-width:100%;height:auto}</style>` + b.html;
    $("#mvBody").appendChild(f);
  }
  $("#mvBack").onclick = () => { S.mailOpen = null; render(); };
  const reply = all => {
    const me = [...myBoxes().map(x => x + "@" + MAIL_DOMAIN)], to = m.dir === "out" ? (m.to || []) : [m.replyTo || m.from];
    const cc = all ? [...(m.to || []), ...(m.cc || [])].filter(x => !me.includes(x) && !to.includes(x)) : [];
    S.mailDraft = {box: m.box, to: to.join(", "), cc: cc.join(", "), subject: /^(re|رد)\s*:/i.test(m.subject || "") ? m.subject : "رد: " + (m.subject || ""), body: "\n\n" + mailQuote(m, b), atts: [], replyId: m.id, replyR: m.r};
    render(); window.scrollTo(0, 0);
  };
  if ($("#mvRe")) $("#mvRe").onclick = () => reply(false);
  if ($("#mvSave")) $("#mvSave").onclick = async () => { try { await bookSave([...bookList(), {name: m.fromName || m.from.split("@")[0], addr: m.replyTo || m.from}]); toast("انحفظ في العناوين ✓"); render(); } catch (e) { handleWriteErr(e); } };
  if ($("#mvReAll")) $("#mvReAll").onclick = () => reply(true);
  if ($("#mvFw")) $("#mvFw").onclick = () => { S.mailDraft = {box: m.box, to: "", cc: "", subject: "إعادة توجيه: " + (m.subject || ""), body: "\n\n" + mailQuote(m, b, true), atts: (m.atts || []).filter(a => a.rid).map(a => ({...a, done: true}))}; render(); window.scrollTo(0, 0); };
  if ($("#mvStar")) $("#mvStar").onclick = () => mailMark(m, {star: !m.star});
  if ($("#mvUnread")) $("#mvUnread").onclick = () => { S.mailOpen = null; mailMark(m, {read: false}); };
  if ($("#mvTrash")) $("#mvTrash").onclick = () => { S.mailOpen = null; mailMark(m, {trash: true}); toast("انتقلت للمحذوفات"); };
  if ($("#mvRestore")) $("#mvRestore").onclick = () => { S.mailOpen = null; mailMark(m, {trash: false}); };
  if ($("#mvKill")) $("#mvKill").onclick = async e => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = "متأكد؟ ما ترجع"; return; }
    e.target.disabled = true;
    try { await mailApi({action: "del", r: m.r, id: m.id}); S.mailOpen = null; toast("انحذفت نهائياً"); render(); } catch (x) { console.error(x); e.target.disabled = false; toast("تعذّر الحذف"); }
  };
  el.querySelectorAll("[data-mvatt]").forEach(x => x.onclick = async () => {
    x.disabled = true;
    try { const j = await mailApi({action: "attGet", r: m.r, id: m.id, i: Number(x.dataset.mvatt)}); window.open(j.url, "_blank", "noopener"); } catch (e) { console.error(e); toast("تعذّر فتح المرفق"); } finally { x.disabled = false; }
  });
}
const linkify = s => s.replace(/(https?:\/\/[^\s<>"']+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
function mailQuote(m, b, fw){
  const txt = String(b.text || "").trim() || "";
  const head = fw ? `---------- رسالة محوّلة ----------\nمن: ${m.fromName ? m.fromName + " " : ""}<${m.from}>\nالتاريخ: ${mailWhenFull(m.at)}\nالعنوان: ${m.subject || ""}\nإلى: ${(m.to || []).join(", ")}\n\n`
    : `في ${mailWhenFull(m.at)} كتب ${m.fromName || m.from}:\n`;
  const body = txt.slice(0, 4000);
  return head + (fw ? body : body.split("\n").map(l => "> " + l).join("\n"));
}
/* the institute's address book (departments and trainers), from the push service */
function loadMailDir(force){
  if ((S.mailDir && !force) || S._mdBusy || (S.mailDirErr && !force)) return; S._mdBusy = true;
  mailApi({action: "dir"}).then(j => { S.mailDir = j.dir || []; S.mailDirErr = null; }).catch(e => { console.error(e); S.mailDir = null; S.mailDirErr = "failed"; })
    .finally(() => { S._mdBusy = false; if (S.mailDraft || !busyEditing()) render(); });
}
function mailDirHTML(){
  const q = (S.mailDirQ || "").trim().toLowerCase(), hit = x => !q || (x.name + " " + x.addr).toLowerCase().includes(q);
  const chip = x => `<button type="button" class="btn sm" data-mdadd="${esc(x.addr)}" style="margin:0 0 4px 4px">${esc(x.name)} <span class="muted" dir="ltr">${esc(x.addr)}</span></button>`;
  const sec = (t, a, empty) => `<div class="muted" style="margin:8px 0 4px;font-weight:700">${t}</div>${a.length ? a.map(chip).join("") : `<div class="muted" style="font-size:13px">${empty}</div>`}`;
  const saved = bookList().filter(hit), dir = S.mailDir || [];
  return `<div class="card" style="margin:6px 0;padding:10px;max-height:300px;overflow:auto"><input type="search" id="mdQ" placeholder="بحث بالاسم أو الإيميل" value="${esc(S.mailDirQ || "")}" style="width:100%">
    ${sec("⭐ المحفوظة", saved, q ? "ما فيه نتائج." : "للحين ما حفظت عناوين. أي إيميل خارجي ترسل له ينحفظ هنا لحاله، أو أضفه من «العناوين المحفوظة».")}
    ${S.mailDir ? sec("الإدارات", dir.filter(x => x.kind === "dept" && hit(x)), "ما فيه نتائج.") + sec("المدربين", dir.filter(x => x.kind === "trainer" && hit(x)), "ما فيه نتائج.")
      : `<p class="muted" style="margin:8px 0 0">${S._mdBusy ? "جاري تحميل الإدارات والمدربين…" : "تعذّر تحميل الإدارات والمدربين. تأكد إن worker في Cloudflare محدّث."}</p>`}
    <p class="muted" style="margin:6px 0 0;font-size:12px">اضغط الاسم ينضاف للمستلمين. الرسائل بين عناوين المعهد توصل فوراً داخل البوابة.</p></div>`;
}
function mailBookView(el){
  const L = bookList(), F = S._bkF = S._bkF || {name: "", addr: ""};
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📒 العناوين المحفوظة</h2><button class="btn sm" id="bkBack">→ رجوع للبريد</button></div>
    <p class="muted" style="margin:6px 0 0">تطلع لك في «رسالة جديدة» عشان تختار بدل ما تكتب. الإدارات والمدربين موجودين هناك لحالهم، ما يحتاج تضيفهم.</p>
    <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap"><input type="text" id="bkN" class="grow" placeholder="الاسم (مثل: شركة الأفق)" maxlength="80" value="${esc(F.name)}"><input type="text" inputmode="email" id="bkA" dir="ltr" class="grow" placeholder="name@example.com" value="${esc(F.addr)}"><button class="btn pri" id="bkAdd">+ إضافة</button></div></div>
  <div class="list">${L.map((x, i) => `<div class="item"><span class="grow"><b>${esc(x.name)}</b> <span class="muted" dir="ltr">${esc(x.addr)}</span></span><button class="btn sm" data-bkw="${i}">✉️ رسالة</button><button class="btn sm" data-bke="${i}">تعديل الاسم</button><button class="btn sm danger" data-bkd="${i}">حذف</button></div>`).join("") || `<div class="card empty">للحين ما فيه عناوين محفوظة.</div>`}</div>`;
  const sync = () => { F.name = $("#bkN").value; F.addr = $("#bkA").value; };
  $("#bkN").oninput = $("#bkA").oninput = sync;
  $("#bkBack").onclick = () => { S.mailBookOpen = false; render(); };
  $("#bkAdd").onclick = async () => { sync(); const a = F.addr.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) return toast("اكتب إيميل صحيح"); if (bookHas(a)) return toast("هذا الإيميل محفوظ من قبل");
    try { await bookSave([...L, {name: F.name, addr: a}]); S._bkF = null; toast("انحفظ ✓"); render(); } catch (e) { handleWriteErr(e); } };
  el.querySelectorAll("[data-bkd]").forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } try { await bookSave(L.filter((_, i) => i !== Number(b.dataset.bkd))); render(); } catch (e) { handleWriteErr(e); } });
  el.querySelectorAll("[data-bke]").forEach(b => b.onclick = async () => { const x = L[Number(b.dataset.bke)], n = prompt("الاسم", x.name); if (n == null) return; try { await bookSave(L.map((y, i) => i === Number(b.dataset.bke) ? {...y, name: n} : y)); render(); } catch (e) { handleWriteErr(e); } });
  el.querySelectorAll("[data-bkw]").forEach(b => b.onclick = () => { S.mailBookOpen = false; S.mailDraft = {box: myBoxes()[0], to: L[Number(b.dataset.bkw)].addr, cc: "", subject: "", body: "", atts: []}; render(); });
}
function mailCompose(el){
  const d = S.mailDraft, boxes = myBoxes();
  if (d._dir) loadMailDir();
  if (!boxes.includes(d.box)) d.box = boxes[0];
  const busy = d.atts.some(a => !a.done && !a.err);
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${d.replyId ? "رد" : "رسالة جديدة"}</h2><button class="btn sm" id="mcX">إلغاء</button></div>
    <label for="mcB">من</label>${boxes.length > 1 ? `<select id="mcB">${boxes.map(b => `<option value="${b}" ${d.box === b ? "selected" : ""}>${esc(MBOXES[b][1])} — ${b}@${MAIL_DOMAIN}</option>`).join("")}</select>` : `<div dir="ltr" style="padding:6px 0">${esc(d.box)}@${MAIL_DOMAIN}</div>`}
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:8px"><label for="mcTo" style="margin:0">إلى</label><button class="btn sm" id="mcDir" type="button">📒 اختر من العناوين</button></div>
    ${d._dir ? mailDirHTML() + `<label class="row" style="gap:6px;margin:0 0 6px;font-size:13px"><input type="checkbox" id="mdCc" ${S.mailPickCc ? "checked" : ""}> اللي أختاره يروح «نسخة» بدل «إلى»</label>` : ""}
    <input type="text" id="mcTo" dir="ltr" inputmode="email" placeholder="name@example.com" value="${esc(d.to)}">
    <label for="mcCc">نسخة (اختياري)</label><input type="text" id="mcCc" dir="ltr" inputmode="email" placeholder="افصل بين العناوين بفاصلة" value="${esc(d.cc)}">
    <label for="mcS">العنوان</label><input type="text" id="mcS" maxlength="300" value="${esc(d.subject)}">
    <label for="mcT">الرسالة</label><textarea id="mcT" rows="12" style="line-height:1.8">${esc(d.body)}</textarea>
    <p class="muted" style="margin:4px 0 0">التوقيع (${trMe() ? "اسمك" : "اسم القسم"} والمعهد والموقع) ينضاف تلقائياً تحت رسالتك.</p>
    <div style="margin-top:10px"><label class="btn sm" for="mcF" style="cursor:pointer">📎 إرفاق ملف</label><input type="file" id="mcF" multiple style="display:none"> <span class="muted">حتى 20 ميجا للرسالة</span></div>
    <div class="row" style="gap:6px;margin-top:8px">${d.atts.map((a, i) => `<span class="pill ${a.err ? "a" : a.done ? "p" : ""}" style="padding:4px 10px">📎 ${esc(a.name)} ${a.err ? "· فشل" : a.done ? `· ${esc(fmtSize(a.size))}` : `· ${a.pct || 0}%`} <a href="#" data-mcrm="${i}" style="margin-inline-start:6px">✕</a></span>`).join("")}</div>
    <div class="row" style="margin-top:14px"><button class="btn pri" id="mcSend" ${busy ? "disabled" : ""}>إرسال</button>${busy ? `<span class="muted">انتظر يخلص رفع المرفقات…</span>` : ""}</div></div>`;
  const sync = () => { d.to = $("#mcTo").value; d.cc = $("#mcCc").value; d.subject = $("#mcS").value; d.body = $("#mcT").value; if ($("#mcB")) d.box = $("#mcB").value; };
  ["#mcTo", "#mcCc", "#mcS", "#mcT", "#mcB"].forEach(s => { const x = $(s); if (x) x.oninput = x.onchange = sync; });
  if (!d.to) $("#mcTo").focus(); else if (d.replyId) { const t = $("#mcT"); t.focus(); t.setSelectionRange(0, 0); t.scrollTop = 0; }
  $("#mcDir").onclick = () => { sync(); d._dir = !d._dir; loadMailDir(!!S.mailDirErr); render(); };
  if ($("#mdQ")) { const q = $("#mdQ"); q.oninput = () => { S.mailDirQ = q.value; clearTimeout(S._mdT); S._mdT = setTimeout(() => { render(); const x = $("#mdQ"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250); }; }
  el.querySelectorAll("[data-mdadd]").forEach(x => x.onclick = () => { sync(); const a = x.dataset.mdadd, k = S.mailPickCc ? "cc" : "to", cur = d[k].split(/[,;،\s]+/).filter(Boolean); if (!cur.includes(a)) d[k] = [...cur, a].join(", "); render(); });
  if ($("#mdCc")) $("#mdCc").onchange = e => { S.mailPickCc = e.target.checked; };
  $("#mcX").onclick = () => { if ((d.body || "").trim().length > 20 && !d._sure) { d._sure = 1; $("#mcX").textContent = "متأكد؟ تنحذف المسودة"; return; } S.mailDraft = null; render(); };
  el.querySelectorAll("[data-mcrm]").forEach(x => x.onclick = e => { e.preventDefault(); sync(); d.atts.splice(Number(x.dataset.mcrm), 1); render(); });
  $("#mcF").onchange = async e => {
    sync(); const files = [...e.target.files]; e.target.value = "";
    for (const file of files) {
      const used = d.atts.filter(a => !a.err).reduce((n, a) => n + (a.size || 0), 0);
      if (used + file.size > 20 * 1024 ** 2) { toast(`«${file.name}» يخلي المرفقات أكبر من 20 ميجا`); continue; }
      const a = {name: file.name, type: file.type || "application/octet-stream", size: file.size, pct: 0}; d.atts.push(a); render();
      try {
        const t = await mailApi({action: "attUp", box: d.box, name: a.name, type: a.type, size: a.size});
        await new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("PUT", t.url); x.upload.onprogress = ev => { if (ev.lengthComputable) { a.pct = Math.floor(ev.loaded / ev.total * 100); const p = S.mailDraft === d && !busyEditing(); if (p) render(); } }; x.onload = () => x.status === 200 ? ok() : no(new Error("up " + x.status)); x.onerror = () => no(new Error("network")); x.send(file); });
        a.rid = t.rid; a.done = true;
      } catch (x) { console.error(x); a.err = true; toast("تعذّر رفع " + a.name); }
      if (S.mailDraft === d) render();
    }
  };
  $("#mcSend").onclick = async e => {
    sync();
    const split = v => v.split(/[,;،\s]+/).map(x => x.trim()).filter(Boolean), to = split(d.to), cc = split(d.cc), bad = [...to, ...cc].find(x => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x));
    if (!to.length) return toast("اكتب إيميل المستلم"); if (bad) return toast("هذا العنوان غير صحيح: " + bad);
    if (!d.subject.trim() && !d._noSubj) { d._noSubj = 1; return toast("ما كتبت عنوان. اضغط إرسال مرة ثانية للإرسال بدونه"); }
    if (d.atts.some(a => a.err)) return toast("احذف المرفق اللي فشل رفعه أول");
    e.target.disabled = true; e.target.textContent = "جاري الإرسال…";
    try {
      await mailApi({action: "send", box: d.box, to, cc, subject: d.subject.trim(), body: d.body, atts: d.atts.filter(a => a.done).map(a => ({rid: a.rid, name: a.name, type: a.type})), ...(d.replyId ? {replyId: d.replyId, replyR: d.replyR} : {})});
      logAction("إرسال بريد", `${d.box}@ ← ${to.join("، ")}`);
      const fresh = [...to, ...cc].map(x => x.toLowerCase()).filter(x => !x.endsWith("@" + MAIL_DOMAIN) && !bookHas(x));
      if (fresh.length) bookSave([...bookList(), ...fresh.map(a => ({name: a.split("@")[0], addr: a}))]).catch(e => console.error(e));   // new outside addresses are kept for next time
      S.mailDraft = null; S.mailOpen = null; S.mailF = "out"; toast("انرسلت ✓"); render();
    } catch (x) { console.error(x); e.target.disabled = false; e.target.textContent = "إرسال"; toast("ما انرسلت: " + (MAIL_ERR[x.code] || "حاول مرة ثانية")); }
  };
}
/* ---------- internal messages between general administration, academic affairs and finance ---------- */
/* ---------- department chat (WhatsApp-like): one conversation with each department, and a group for all of them.
   memos/{id}: from, to (a department, or "all"), text, at, readAt (direct messages). The general administration
   and the auditor can read every message; the others only their own and the group's. */
const CHAT_ROLES = ["admin", "academic", "finance", "hr", "admission", "business", "auditor"];
const CHAT_TOP = ["admin", "auditor"];                                   // reached only by the departments, never by trainers
const CHAT_TR_DEPTS = ["academic", "finance", "hr", "admission", "business"];
const chatMe = () => S.role === "trainer" ? S.me : S.adminRole;
const chatName = k => CHAT_N[k] || (S.trainers && S.trainers[k] ? trainerTitle(S.trainers[k]) : /^t-/.test(k) ? "مدرب" : k);
const chatTrainers = () => Object.values(S.trainers || {}).filter(t => t.id !== chatMe() && !(S.disabled || {})[t.id] && !t.disabled).sort((a, b) => String(a.name).localeCompare(String(b.name), "ar")).map(t => t.id);
function chatContacts(){
  const me = chatMe();
  if (S.role === "trainer") return [...CHAT_TR_DEPTS, ...chatTrainers()];
  if (CHAT_TOP.includes(me)) return ["all", ...CHAT_ROLES.filter(r => r !== me)];
  return ["all", ...CHAT_ROLES.filter(r => r !== me), ...chatTrainers()];
}
const CHAT_N = {all: "👥 كل الإدارات", admin: "الإدارة العامة", academic: "الشؤون الأكاديمية", finance: "المالية", hr: "الموارد البشرية", admission: "القبول والتسجيل", business: "الشراكات وقطاع الشركات", auditor: "الجهة الرقابية"};
const MEMO_ROLES = CHAT_ROLES;
const memoSeenKey = () => "memoSeenAll_" + chatMe();
const memoSeenAll = () => { try { return localStorage.getItem(memoSeenKey()) || ""; } catch { return ""; } };
const memoThread = k => { const me = chatMe(); return (S.memos || []).filter(m => k === "all" ? m.to === "all" : (m.from === me && m.to === k) || (m.from === k && m.to === me)).sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))); };
const memoUnreadIn = k => { const me = chatMe(); return k === "all" ? memoThread("all").filter(m => m.from !== me && String(m.at || "") > memoSeenAll()) : memoThread(k).filter(m => m.to === me && !m.readAt); };
const memoUnread = () => chatContacts().flatMap(memoUnreadIn);
const memoBadge = () => { const n = memoUnread().length; return n ? ` (${n})` : ""; };
const isChatTab = () => S.role === "trainer" ? !!S.trChat : FIN() ? S.finTab === "memos" : S.aTab === "memos";
function watchMemos(){
  if (S._memoSub || !S.authUser) return;
  if (!(S.role === "trainer" && S.me) && !(S.role === "admin" && CHAT_ROLES.includes(S.adminRole))) return; S._memoSub = true;
  const me = chatMe(), parts = {}, first = {};
  const qs = {f: query(collection(db, "memos"), where("from", "==", me)), t: query(collection(db, "memos"), where("to", "==", me)),
    ...(S.role === "trainer" ? {} : {g: query(collection(db, "memos"), where("to", "==", "all"))})};
  Object.entries(qs).forEach(([k, q]) => S.subs.push(onSnapshot(q, snap => {
    const fresh = first[k] ? snap.docChanges().filter(c => c.type === "added").map(c => c.doc.data()).filter(m => m.from !== me && (m.to === me || m.to === "all")) : [];
    first[k] = true; parts[k] = snap.docs.map(d => ({id: d.id, ...d.data()}));
    const mp = new Map(); Object.values(parts).flat().forEach(x => mp.set(x.id, x)); S.memos = [...mp.values()];
    if (fresh.length && !(isChatTab() && S.memoChat === (fresh[0].to === "all" ? "all" : fresh[0].from))) toast("💬 " + (fresh[0].to === "all" ? "كل الإدارات · " : "") + chatName(fresh[0].from) + ": " + String(fresh[0].text || "").slice(0, 60));
    if (isChatTab() && $("#mmThread")) memoPaint(); else afterData();
  }, e => console.error(e))));
  S.subs.push(() => { S._memoSub = false; });
}
function memoCss(){
  if ($("#memoCss")) return;
  const st = document.createElement("style"); st.id = "memoCss";
  st.textContent = `.chat{display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;align-items:start}
  .chat .cl{padding:6px}.chat .ci{display:flex;gap:8px;align-items:center;width:100%;text-align:start;background:none;border:0;border-radius:10px;padding:10px;cursor:pointer;color:inherit;font:inherit}
  .chat .ci:hover{background:var(--line)}.chat .ci.on{background:rgba(31,81,54,.12)}.chat .ci .nm{font-weight:700}.chat .ci .lt{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
  .chat .bd{background:#1F5136;color:#fff;border-radius:999px;font-size:12px;min-width:20px;padding:1px 7px;text-align:center;margin-inline-start:auto}
  .chat .th{height:56vh;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,.025);border-radius:10px}
  .chat .bb{max-width:78%;padding:7px 11px;border-radius:14px;white-space:pre-wrap;word-break:break-word;line-height:1.7;box-shadow:0 1px 1px rgba(0,0,0,.06)}
  .chat .bb.me{align-self:flex-start;background:#dcf3e2;color:#111;border-start-start-radius:4px}.chat .bb.ot{align-self:flex-end;background:#fff;color:#111;border-start-end-radius:4px}
  .chat .bb .mt{font-size:11px;color:#667;margin-top:2px;text-align:end}.chat .bb .wh{font-size:12px;font-weight:700;color:#1F5136}
  .chat .dy{align-self:center;font-size:12px;color:var(--muted);background:var(--card);padding:2px 10px;border-radius:999px;margin:4px 0}
  .chat .cmp{display:flex;gap:8px;align-items:flex-end;margin-top:8px}.chat .cmp textarea{flex:1;resize:none;min-height:44px;max-height:140px}
  @media (max-width:760px){.chat{grid-template-columns:1fr}.chat.open .cl{display:none}.chat:not(.open) .pane{display:none}}`;
  document.head.appendChild(st);
}
function memoListHTML(){
  const me = chatMe(), q = (S.chatQ || "").trim(), keys = chatContacts().filter(k => !q || chatName(k).includes(q));
  const last = k => { const t = memoThread(k); return t[t.length - 1]; };
  const isTr = k => /^t-/.test(k);
  keys.sort((a, b) => a === "all" ? -1 : b === "all" ? 1 : String((last(b) || {}).at || "").localeCompare(String((last(a) || {}).at || "")) || (isTr(a) - isTr(b)));
  return keys.map(k => { const l = last(k), n = memoUnreadIn(k).length;
    return `<button class="ci ${S.memoChat === k ? "on" : ""}" data-mmc="${esc(k)}"><span style="min-width:0;flex:1"><div class="nm">${esc(chatName(k))}</div><div class="lt">${l ? esc((l.from === me ? "أنت: " : k === "all" ? chatName(l.from) + ": " : "") + l.text) : "ابدأ المحادثة"}</div></span>${n ? `<span class="bd">${n}</span>` : ""}</button>`; }).join("") || `<div class="muted" style="padding:8px">ما فيه نتائج.</div>`;
}
function memoThreadHTML(k){
  const me = chatMe(), T = memoThread(k); let day = "";
  const t = iso => { try { return new Date(iso).toLocaleTimeString("ar-SA-u-nu-latn", {hour: "numeric", minute: "2-digit"}); } catch { return ""; } };
  return T.map(m => { const d = String(m.at || "").slice(0, 10), sep = d !== day ? `<div class="dy">${esc(d === today() ? "اليوم" : bothDates(d))}</div>` : ""; day = d;
    const mine = m.from === me;
    return sep + `<div class="bb ${mine ? "me" : "ot"}">${!mine && k === "all" ? `<div class="wh">${esc(chatName(m.from))}</div>` : ""}${linkify(esc(m.text))}<div class="mt">${esc(t(m.at))}${mine && k !== "all" ? ` <span style="color:${m.readAt ? "#2b8a3e" : "#889"}">${m.readAt ? "✓✓" : "✓"}</span>` : ""}</div></div>`; }).join("")
    || `<div class="muted" style="margin:auto">${k === "all" ? "رسائل هنا توصل لكل الإدارات." : "ما فيه رسائل للحين. اكتب أول رسالة."}</div>`;
}
function memoMarkRead(k){
  const me = chatMe();
  if (k === "all") { const l = memoThread("all").slice(-1)[0]; if (l) try { localStorage.setItem(memoSeenKey(), String(l.at || "")); } catch {} return; }
  memoThread(k).filter(m => m.to === me && !m.readAt).forEach(m => { m.readAt = new Date().toISOString(); setDoc(ref("memos/" + m.id), {readAt: m.readAt}, {merge: true}).catch(() => {}); });
}
function memoPaint(){   // refresh the list and the open conversation without touching what is being typed
  const k = S.memoChat;
  if ($("#mmList")) { $("#mmList").innerHTML = memoListHTML(); bindMemoList(); }
  if (k && $("#mmThread")) { const th = $("#mmThread"), atEnd = th.scrollHeight - th.scrollTop - th.clientHeight < 80; th.innerHTML = memoThreadHTML(k); if (atEnd || S._mmJump) { th.scrollTop = th.scrollHeight; S._mmJump = false; } memoMarkRead(k); if ($("#mmList")) { $("#mmList").innerHTML = memoListHTML(); bindMemoList(); } }
  document.querySelectorAll("[data-at='memos'],[data-ft='memos']").forEach(b => { b.textContent = "المراسلات" + memoBadge(); });
}
function bindMemoList(){ document.querySelectorAll("#mmList [data-mmc]").forEach(b => b.onclick = () => { S.memoChat = b.dataset.mmc; S._mmJump = true; render(); setTimeout(() => $("#mmT") && $("#mmT").focus(), 30); }); }
function memosTab(el){
  watchMemos(); memoCss();
  if (S.memoChat && !chatContacts().includes(S.memoChat)) S.memoChat = null;
  const k = S.memoChat, me = chatMe();
  el.innerHTML = `<div class="chat ${k ? "open" : ""}"><div class="card cl"><div style="padding:6px 8px 8px;font-weight:700">💬 المراسلات</div>
    ${chatContacts().length > 9 ? `<input type="search" id="chQ" placeholder="بحث بالاسم" value="${esc(S.chatQ || "")}" style="width:100%;margin:0 0 6px">` : ""}
    <div id="mmList">${memoListHTML()}</div>
    ${S.role === "trainer" ? `<p class="muted" style="font-size:12px;margin:8px 6px 4px">الإدارة العامة والجهة الرقابية توصلها عن طريق الإدارات. وإذا ما انحلت مشكلتك أرسل لهم من «📧 بريدي».</p>` : ""}</div>
    <div class="card pane">${k ? `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:17px">${esc(chatName(k))}</b><button class="btn sm" id="mmBack">→ المحادثات</button></div>
      <div class="th" id="mmThread"></div>
      <div class="cmp"><textarea id="mmT" rows="1" maxlength="1000" placeholder="اكتب رسالة… (Enter للإرسال، Shift+Enter لسطر جديد)">${esc(S._mmDraft && S._mmDraft[k] || "")}</textarea><button class="btn pri" id="mmSend">إرسال</button></div>
      <p class="muted" style="margin:6px 0 0;font-size:12px">${k === "all" ? "توصل لكل الإدارات مع إشعار." : "توصلهم مع إشعار. ✓ انرسلت · ✓✓ انقرأت."}</p>`
      : `<div class="empty" style="padding:40px 10px">اختر محادثة من القائمة.</div>`}</div></div>`;
  bindMemoList();
  if ($("#chQ")) $("#chQ").oninput = e => { S.chatQ = e.target.value; $("#mmList").innerHTML = memoListHTML(); bindMemoList(); };
  if (!k) return;
  S._mmJump = true; memoPaint();
  $("#mmBack").onclick = () => { S.memoChat = null; render(); };
  const ta = $("#mmT");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; }; grow();
  ta.oninput = () => { S._mmDraft = S._mmDraft || {}; S._mmDraft[k] = ta.value; grow(); };
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    const btn = $("#mmSend"); btn.disabled = true;
    const id = "mm-" + Date.now().toString(36) + uid(), d = {from: me, to: k, text: text.slice(0, 1000), at: new Date().toISOString()};
    try { await setDoc(ref("memos/" + id), d); notify("memo", id); ta.value = ""; if (S._mmDraft) S._mmDraft[k] = ""; grow(); S._mmJump = true;
      if (!(S.memos || []).some(m => m.id === id)) S.memos = [...(S.memos || []), {id, ...d}]; memoPaint(); }
    catch (x) { handleWriteErr(x); }
    btn.disabled = false; ta.focus();
  };
  $("#mmSend").onclick = send;
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
}

/* ---------- trainers ↔ academic affairs: one conversation per trainer ----------
   trMsgs/{id}: tid, from (trainer | academic | admin), text, at, readAt. A trainer sees only his own conversation. */
const TRM_FROM = {trainer: "المدرب", academic: "الشؤون الأكاديمية", admin: "الإدارة العامة"};
function watchTrMsgs(){
  if (S._trmSub || !S.authUser) return;
  let q = null;
  if (S.role === "trainer" && S.me) q = query(collection(db, "trMsgs"), where("tid", "==", S.me));
  else if (S.role === "admin" && ["admin", "academic", "auditor"].includes(S.adminRole)) q = collection(db, "trMsgs");
  if (!q) return; S._trmSub = true;
  S.subs.push(onSnapshot(q, snap => { S.trMsgs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))); if (!busyEditing()) render(); }, e => console.error(e)));
  S.subs.push(() => { S._trmSub = false; S.trMsgs = null; });
}
const trmUnread = () => (S.trMsgs || []).filter(m => !m.readAt && (S.role === "trainer" ? m.from !== "trainer" : m.from === "trainer"));
const trmBadge = () => { const n = trmUnread().length; return n ? ` (${n})` : ""; };
function trmThread(el, tid, canSend){
  const L = (S.trMsgs || []).filter(m => m.tid === tid), mineSide = S.role === "trainer" ? "trainer" : "staff";
  el.innerHTML = `<div id="trmList" style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow:auto;padding:4px">${L.map(m => { const me = mineSide === "trainer" ? m.from === "trainer" : m.from !== "trainer";
      return `<div style="align-self:${me ? "flex-start" : "flex-end"};max-width:80%;background:${me ? "var(--soft, #eef5f0)" : "var(--card, #fff)"};border:1px solid var(--line, #e2e8e4);border-radius:12px;padding:8px 12px">
        <div class="muted" style="font-size:.8em">${esc(m.from === "trainer" ? (S.role === "trainer" ? "أنت" : tName(m.tid)) : TRM_FROM[m.from] || "")} · ${esc(fmtIso(m.at))}${me && m.readAt ? " · ✓ انقرأت" : ""}</div>
        <div style="white-space:pre-wrap">${esc(m.text)}</div></div>`; }).join("") || `<p class="muted" style="text-align:center">ما فيه رسائل للحين.</p>`}</div>
    ${canSend ? `<div class="row" style="margin-top:10px;gap:6px;align-items:flex-end"><textarea id="trmT" rows="2" maxlength="2000" class="grow" placeholder="${S.role === "trainer" ? "اكتب رسالتك للشؤون الأكاديمية…" : "اكتب ردك للمدرب…"}"></textarea><button class="btn pri" id="trmSend">إرسال</button></div>` : ""}`;
  const box = $("#trmList"); if (box) box.scrollTop = box.scrollHeight;
  // what the other side wrote is now read
  L.filter(m => !m.readAt && (S.role === "trainer" ? m.from !== "trainer" : m.from === "trainer") && !RO()).forEach(m => setDoc(ref("trMsgs/" + m.id), {readAt: new Date().toISOString()}, {merge: true}).catch(() => {}));
  if (!canSend) return;
  $("#trmSend").onclick = async e => {
    const text = $("#trmT").value.trim(); if (text.length < 2) return toast("اكتب الرسالة");
    e.target.disabled = true;
    const id = "tm-" + uid() + uid(), from = S.role === "trainer" ? "trainer" : (S.adminRole === "admin" ? "admin" : "academic");
    try { await setDoc(ref("trMsgs/" + id), {tid, from, text: text.slice(0, 2000), at: new Date().toISOString()}); notify("trmsg", id); if (from !== "trainer") logAction("رد على مدرب", tName(tid)); toast("انرسلت ✓"); }
    catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
/* the trainer's side */
function trainerMsgs(app){
  app.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">💬 مراسلة الشؤون الأكاديمية</h2><button class="btn sm" id="trmBack">→ رجوع</button></div>
    <p class="muted" style="margin:6px 0 10px">استفسار، طلب، أو ملاحظة عن مقرر أو طالب. توصلهم إشعار، ويوصلك ردهم هنا.</p><div id="trmBox"></div></div>`;
  $("#trmBack").onclick = () => { S.trmOpen = false; render(); };
  if (!S.trMsgs) { $("#trmBox").innerHTML = `<p class="muted">جاري التحميل…</p>`; return; }
  trmThread($("#trmBox"), S.me, true);
}
/* academic affairs' side: every trainer's conversation */
function adminTrMsgs(el){
  if (!S.trMsgs) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  const by = {}; S.trMsgs.forEach(m => (by[m.tid] = by[m.tid] || []).push(m));
  const tids = Object.keys(by).sort((a, b) => String(by[b][by[b].length - 1].at).localeCompare(String(by[a][by[a].length - 1].at)));
  const sel = S.trmSel && (by[S.trmSel] || S.trainers[S.trmSel]) ? S.trmSel : null;
  const others = Object.values(S.trainers || {}).filter(t => !by[t.id] && !t.disabled).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  el.innerHTML = `<div class="card"><h2>رسائل المدربين</h2><p class="muted" style="margin-top:0">كل مدرب يراسل الشؤون الأكاديمية من بوابته، ويوصلكم إشعار. ردكم يوصله إشعار بعد.${RO() ? "" : " تقدر تبدأ محادثة مع أي مدرب."}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1 1 230px;min-width:220px"><div class="list">${tids.map(t => { const u = by[t].filter(m => m.from === "trainer" && !m.readAt).length, last = by[t][by[t].length - 1];
          return `<button class="item" data-trms="${esc(t)}" style="width:100%;text-align:start;cursor:pointer;${t === sel ? "outline:2px solid var(--green)" : ""}"><div class="grow"><b>${esc(tName(t))}</b>${u ? ` <span class="pill a">${u} جديدة</span>` : ""}<div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">${esc(last.text.slice(0, 60))}</div></div></button>`; }).join("") || `<p class="muted">ما فيه محادثات للحين.</p>`}</div>
          ${RO() || !others.length ? "" : `<select id="trmNew" style="margin-top:8px"><option value="">+ محادثة مع مدرب…</option>${others.map(t => `<option value="${esc(t.id)}">${esc(trainerTitle(t))}</option>`).join("")}</select>`}</div>
        <div style="flex:3 1 380px;min-width:280px">${sel ? `<h3 style="margin-top:0">${esc(tName(sel))}</h3><div id="trmBox"></div>` : `<div class="card empty" style="margin:0">اختر محادثة.</div>`}</div></div></div>`;
  el.querySelectorAll("[data-trms]").forEach(b => b.onclick = () => { S.trmSel = b.dataset.trms; render(); });
  if ($("#trmNew")) $("#trmNew").onchange = e => { if (e.target.value) { S.trmSel = e.target.value; render(); } };
  if (sel) trmThread($("#trmBox"), sel, !RO());
}

/* ---------- leave requests and medical excuses from trainers and department heads, approved step by step ----------
   staffReqs/{id}: the request moves along roles[] (cur = whose turn); each step approves or rejects with a note.
   trainer → academic affairs → human resources → general administration; department head → human resources → general administration */
const SR_CHAIN = r => r === "trainer" ? ["academic", "hr", "admin"] : r === "hr" ? ["admin"] : ["hr", "admin"];
const SR_CAN = () => S.role === "trainer" ? !!S.me : S.role === "admin" && ["academic", "finance", "hr", "admission", "business"].includes(S.adminRole);
const SR_APPROVER = () => S.role === "admin" && ["academic", "hr", "admin"].includes(S.adminRole);
const SR_ROLE_N = {academic: "الشؤون الأكاديمية", hr: "الموارد البشرية", admin: "الإدارة العامة"};
const SR_KIND = {leave: "طلب إجازة", sick: "عذر طبي"};
const SQ_ST = {pending: ["قيد الاعتماد", "l"], approved: ["معتمد ✓", "p"], rejected: ["مرفوض", "a"], cancelled: ["ملغى", ""]};
function watchStaffReqs(){
  if (S._srSub || !S.authUser) return;
  const me = S.authUser.email, put = (tag, snap) => { S._srParts = S._srParts || {}; S._srParts[tag] = snap.docs.map(d => ({id: d.id, ...d.data()}));
    const m = {}; Object.values(S._srParts).forEach(l => l.forEach(x => m[x.id] = x)); S.sReqs = Object.values(m).sort((a, b) => (b.at || "").localeCompare(a.at || "")); if (!busyEditing()) render(); };
  const qs = [];
  if (RO()) qs.push(["all", collection(db, "staffReqs")]);
  else {
    if (SR_CAN()) qs.push(["mine", query(collection(db, "staffReqs"), where("byEmail", "==", me))]);
    if (SR_APPROVER()) qs.push(["appr", query(collection(db, "staffReqs"), where("roles", "array-contains", S.adminRole))]);
  }
  if (!qs.length) return; S._srSub = true;
  qs.forEach(([tag, q]) => S.subs.push(onSnapshot(q, snap => put(tag, snap), e => console.error(e))));
  S.subs.push(() => { S._srSub = false; S.sReqs = null; S._srParts = null; });
}
const srMine = () => (S.sReqs || []).filter(r => r.byEmail === (S.authUser || {}).email);
const srWaiting = () => (S.sReqs || []).filter(r => r.status === "pending" && SR_APPROVER() && (r.roles || [])[r.cur] === S.adminRole);
const srBadge = () => { const n = srWaiting().length + srMine().filter(r => ["approved", "rejected"].includes(r.status) && !r.seen).length; return n ? ` (${n})` : ""; };
function srSteps(r){
  return `<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">${(r.steps || []).map((st, i) => { const on = r.status === "pending" && i === r.cur;
    const ic = st.st === "approved" ? "✓" : st.st === "rejected" ? "✗" : on ? "⏳" : "•";
    return `<span class="pill ${st.st === "approved" ? "p" : st.st === "rejected" ? "a" : on ? "l" : ""}" title="${esc(st.note || "")}">${ic} ${esc(SR_ROLE_N[st.role] || st.role)}${st.at ? ` · ${esc(fmtIso(st.at))}` : ""}</span>${i < r.steps.length - 1 ? `<span class="muted">←</span>` : ""}`; }).join("")}</div>
    ${(r.steps || []).filter(st => st.note).map(st => `<div class="muted" style="margin-top:4px">💬 ${esc(SR_ROLE_N[st.role] || st.role)}: ${esc(st.note)}</div>`).join("")}`;
}
const srDays = r => { const a = Date.parse(r.from + "T12:00:00"), b = Date.parse((r.to || r.from) + "T12:00:00"); return Math.round((b - a) / 864e5) + 1; };
function srCard(r, mode){   // mode: mine | approve | view
  const st = SQ_ST[r.status] || ["", ""];
  return `<div class="card" style="margin-bottom:10px;${mode === "approve" ? "border-inline-start:4px solid var(--gold)" : ""}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap"><div class="grow"><b>${esc(SR_KIND[r.kind] || r.kind)}${r.kind === "leave" && r.ltype ? ` · ${esc(LV_T[r.ltype] || r.ltype)}` : ""}</b>${mode !== "mine" ? ` — ${esc(r.byName || "")}` : ""}
      <div class="muted">${esc(r.from)}${r.to && r.to !== r.from ? ` → ${esc(r.to)}` : ""} · ${srDays(r)} يوم · قُدّم ${esc(fmtIso(r.at))}</div></div><span class="pill ${st[1]}">${st[0]}</span></div>
    ${r.reason ? `<p style="white-space:pre-wrap;margin:6px 0">${esc(r.reason)}</p>` : ""}
    ${r.file ? `<button class="btn sm" data-srf="${esc(r.id)}">📎 ${esc(r.file.name || "المرفق")}</button>` : ""}
    ${srSteps(r)}
    ${mode === "approve" ? `<div style="margin-top:8px">${S.adminRole === "hr" ? `<label class="f" for="srs-${esc(r.id)}">ربط بموظف في قائمة الموارد البشرية <span class="muted">(عشان تنحسب الإجازة في الحضور والرصيد)</span><select id="srs-${esc(r.id)}"><option value="">— بدون ربط —</option>${(S.hrStaff || []).filter(s => s.active !== false).map(s => `<option value="${esc(s.id)}" ${(r.staffId || srGuess(r)) === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>` : ""}
      <label class="f" for="srn-${esc(r.id)}">ملاحظة (اختياري، يشوفها مقدّم الطلب)<input type="text" id="srn-${esc(r.id)}" maxlength="300"></label>
      <div class="row" style="gap:6px"><button class="btn pri" data-sra="${esc(r.id)}">${r.cur === (r.roles || []).length - 1 ? "اعتماد نهائي" : "موافقة وتحويل لـ " + esc(SR_ROLE_N[(r.roles || [])[r.cur + 1]] || "")}</button><button class="btn danger" data-srr="${esc(r.id)}">رفض</button></div></div>` : ""}
    ${mode === "mine" && r.status === "pending" && r.cur === 0 ? `<button class="btn sm danger" data-src="${esc(r.id)}" style="margin-top:8px">سحب الطلب</button>` : ""}</div>`;
}
const srGuess = r => { const n = norm(String(r.byName || "").replace(/^(المدرب|المدربة)\s+/, "")); const s = (S.hrStaff || []).find(x => n && norm(x.name) === n); return s ? s.id : ""; };
function staffReqsView(el, trainerBack){
  watchStaffReqs(); if (S.adminRole === "hr" || S.adminRole === "admin") hrSubs();
  if (!S.sReqs) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  const F = S._srF = S._srF || {kind: "leave", ltype: "annual", from: today(), to: today()};
  const mine = srMine(), wait = srWaiting(), others = (S.adminRole === "hr" || S.adminRole === "admin" || RO()) ? (S.sReqs || []).filter(r => !mine.includes(r) && !wait.includes(r)) : [];
  mine.filter(r => ["approved", "rejected"].includes(r.status) && !r.seen).forEach(r => setDoc(ref("staffReqs/" + r.id), {seen: true}, {merge: true}).catch(() => {}));
  const chain = SR_CHAIN(S.role === "trainer" ? "trainer" : S.adminRole);
  el.innerHTML = `${trainerBack ? `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📝 الإجازات والأعذار الطبية</h2><button class="btn sm" id="srBack">→ رجوع</button></div></div>` : ""}
  ${wait.length ? `<h3 style="margin:6px 4px">بانتظار اعتمادك (${wait.length})</h3>${wait.map(r => srCard(r, "approve")).join("")}` : ""}
  ${SR_CAN() ? `<div class="card"><h2>طلب جديد</h2>
      <div class="row" style="gap:14px;flex-wrap:wrap">${Object.entries(SR_KIND).map(([k, v]) => `<label class="row" style="gap:5px"><input type="radio" name="srK" value="${k}" ${F.kind === k ? "checked" : ""}> ${v}</label>`).join("")}</div>
      <div class="row" style="margin-top:6px">${S.role === "trainer" ? "" : `<label class="f grow" for="srNm">اسمك<input type="text" id="srNm" maxlength="80" value="${esc(F.name || "")}" placeholder="اسم مقدّم الطلب"></label>`}
        ${F.kind === "leave" ? `<label class="f" for="srT" style="width:160px">نوع الإجازة<select id="srT">${["annual", "emergency", "unpaid", "other"].map(k => `<option value="${k}" ${F.ltype === k ? "selected" : ""}>${LV_T[k]}</option>`).join("")}</select></label>` : ""}
        <label class="f" for="srF" style="width:160px">من<input type="date" id="srF" value="${esc(F.from)}"></label><label class="f" for="srTo" style="width:160px">إلى<input type="date" id="srTo" value="${esc(F.to)}"></label></div>
      <label class="f" for="srR">${F.kind === "sick" ? "تفاصيل العذر" : "سبب الإجازة"}<textarea id="srR" rows="2" maxlength="800">${esc(F.reason || "")}</textarea></label>
      <label class="f" for="srFile">${F.kind === "sick" ? "التقرير الطبي (صورة أو PDF) — مطلوب" : "مرفق (اختياري)"}<input type="file" id="srFile" accept="image/*,application/pdf,.pdf"></label>
      <p class="muted" style="margin:4px 0">يمر الطلب بالترتيب على: ${chain.map(r => SR_ROLE_N[r]).join(" ← ")}، ويوصلك إشعار بكل خطوة.</p>
      <button class="btn pri" id="srSend">إرسال الطلب</button></div>` : ""}
  ${mine.length ? `<h3 style="margin:6px 4px">طلباتي</h3>${mine.map(r => srCard(r, "mine")).join("")}` : ""}
  ${others.length ? `<details class="card"><summary style="cursor:pointer"><b>كل الطلبات (${others.length})</b></summary><div style="margin-top:8px">${others.map(r => srCard(r, "view")).join("")}</div></details>` : ""}
  ${!wait.length && !mine.length && !others.length && !SR_CAN() ? `<div class="card empty">ما فيه طلبات.</div>` : ""}`;
  if ($("#srBack")) $("#srBack").onclick = () => { S.sreqOpen = false; render(); };
  el.querySelectorAll("[data-srf]").forEach(b => b.onclick = async () => { const w = window.open("", "_blank"); if (!w) return toast("اسمح بالنوافذ المنبثقة");
    try { const x = await getDoc(ref("staffReqFiles/" + b.dataset.srf)); openRcptData(w, x.exists() && x.data().data); } catch (e) { w.close(); toast("تعذّر فتح المرفق"); } });
  el.querySelectorAll("[data-src]").forEach(b => b.onclick = async () => { if (!confirm("تسحب الطلب؟")) return;
    try { await setDoc(ref("staffReqs/" + b.dataset.src), {status: "cancelled"}, {merge: true}); toast("انسحب الطلب"); } catch (x) { handleWriteErr(x); } });
  const decide = async (id, ok) => {
    const r = (S.sReqs || []).find(x => x.id === id); if (!r) return;
    const note = ($("#srn-" + id) || {}).value ? $("#srn-" + id).value.trim().slice(0, 300) : "";
    if (!ok && !note && !confirm("ترفض بدون ملاحظة؟")) return;
    const steps = (r.steps || []).map((s, i) => i === r.cur ? {...s, st: ok ? "approved" : "rejected", by: ROLES[S.adminRole] || S.adminRole, at: new Date().toISOString(), ...(note ? {note} : {})} : s);
    const last = r.cur === (r.roles || []).length - 1, staffId = $("#srs-" + id) ? $("#srs-" + id).value : (r.staffId || "");
    const upd = {steps, ...(ok && !last ? {cur: r.cur + 1} : {status: ok ? "approved" : "rejected", doneAt: new Date().toISOString()}), ...(S.adminRole === "hr" ? {staffId} : {})};
    try {
      await setDoc(ref("staffReqs/" + id), upd, {merge: true});
      // final approval with a linked employee: the leave goes into HR's records by itself
      const sid = upd.staffId !== undefined ? upd.staffId : r.staffId;
      if (ok && last && sid) { const s = (S.hrStaff || []).find(x => x.id === sid);
        if (s) await setDoc(ref("hrLeaves/lv-" + id), {staffId: sid, type: r.kind === "sick" ? "sick" : (r.ltype || "annual"), from: r.from, to: r.to || r.from, days: hrWorkDays(s, r.from, r.to || r.from), note: (SR_KIND[r.kind] + (r.reason ? ": " + r.reason : "")).slice(0, 200), by: ROLES[S.adminRole] || S.adminRole, at: new Date().toISOString(), void: false, req: id}); }
      notify("sreq", id); logAction(ok ? "موافقة على طلب إجازة" : "رفض طلب إجازة", `${r.byName} · ${SR_KIND[r.kind]} ${r.from}`); toast(ok ? (last ? "اعتمد نهائياً ✓" : "انحوّل للخطوة الجاية ✓") : "انرفض الطلب");
    } catch (x) { handleWriteErr(x); }
  };
  el.querySelectorAll("[data-sra]").forEach(b => b.onclick = () => { b.disabled = true; decide(b.dataset.sra, true); });
  el.querySelectorAll("[data-srr]").forEach(b => b.onclick = () => decide(b.dataset.srr, false));
  if (!SR_CAN()) return;
  const sync = () => { F.from = $("#srF").value; F.to = $("#srTo").value || F.from; F.reason = $("#srR").value; if ($("#srT")) F.ltype = $("#srT").value; if ($("#srNm")) F.name = $("#srNm").value; };
  el.querySelectorAll('input[name="srK"]').forEach(x => x.onchange = () => { sync(); F.kind = x.value; render(); });
  $("#srSend").onclick = async e => {
    sync(); const f = $("#srFile").files[0];
    if (!F.from || F.to < F.from) return toast("التاريخ غير صحيح");
    if (S.role !== "trainer" && (F.name || "").trim().length < 3) return toast("اكتب اسمك");
    if (F.kind === "sick" && !f) return toast("ارفع التقرير الطبي");
    if ((F.reason || "").trim().length < 3 && F.kind === "leave") return toast("اكتب سبب الإجازة");
    e.target.disabled = true;
    try {
      const data = f ? await rcptData(f) : null, id = "sr-" + uid() + uid(), role = S.role === "trainer" ? "trainer" : S.adminRole, roles = SR_CHAIN(role);
      const byName = S.role === "trainer" ? trainerTitle(S.trainers[S.me] || {name: ""}) : `${F.name.trim()} (${ROLES[role] || role})`;
      await setDoc(ref("staffReqs/" + id), {byEmail: S.authUser.email, byRole: role, byName: byName.slice(0, 120), tid: S.role === "trainer" ? S.me : "", kind: F.kind, ltype: F.kind === "leave" ? F.ltype : "", from: F.from, to: F.to, reason: (F.reason || "").trim().slice(0, 800),
        file: f ? {name: f.name.slice(0, 100), size: f.size} : null, roles, cur: 0, steps: roles.map(r => ({role: r, st: "pending"})), status: "pending", at: new Date().toISOString()});
      if (data) await setDoc(ref("staffReqFiles/" + id), {rid: id, data, name: f.name.slice(0, 100)});
      notify("sreq", id); if (S.role === "admin") logAction("طلب إجازة", SR_KIND[F.kind]); toast(`انرسل الطلب لـ ${SR_ROLE_N[roles[0]]} ✓`); S._srF = null; render();
    } catch (x) { e.target.disabled = false; x && ["too-big", "pdf-big", "srv-down"].includes(x.message) ? rcptErr(x) : handleWriteErr(x); }
  };
}

/* ---------- academic requests: a student asks academic affairs, who replies in the portal and/or on WhatsApp ---------- */
const AC_CATS = ["استفسار عام", "طلب خطاب تعريف", "الحضور والغياب", "الدرجات", "الجدول والمقررات", "أخرى"];
/* free "ask a question" search over the FAQ: light Arabic normalising + synonyms, no AI */
const FAQ_SYN = [["شهاده", "شهادات", "شهادتي", "افاده"], ["غياب", "غبت", "غايب", "حضور", "حضوري", "تحضير"], ["عذر", "اعذار", "عذري"], ["حرمان", "محروم", "انحرم"], ["انذار", "انذارات"],
  ["فاتوره", "رسوم", "مبلغ", "قسط", "اقساط", "دفع", "سداد", "فلوس", "ماليه", "مالي"], ["تطبيق", "تثبيت", "تنزيل", "ابلكيشن", "برنامج"], ["درجه", "درجات", "نتيجه", "نتايج", "علامات"],
  ["جدول", "محاضره", "محاضرات", "موعد", "مواعيد", "تيمز", "teams"], ["رمز", "كود", "باسورد", "كلمه", "دخول", "ادخل", "تسجيل"], ["بطاقه", "بطاقتي", "كرت"], ["اجازه", "اجازات", "تقويم", "عطله"], ["تواصل", "رقم", "واتساب", "جوال"]];
const FAQ_STOP = new Set(["كيف", "وش", "ايش", "متى", "هل", "ابي", "ابغى", "ابغي", "ممكن", "عن", "في", "من", "على", "علي", "اللي", "ما", "لي", "او", "انا", "عندي", "وين", "كم", "ليش", "اذا", "وشلون", "اعرف", "يعرف", "الفى", "القى", "الحين", "بعد", "قبل", "هذا", "هذي", "سوي", "اسوي"].map(w => norm(w)));
const faqTok = t => norm(t).toLowerCase().replace(/[\u064B-\u0652]/g, "").replace(/[^\u0600-\u06FFa-z0-9 ]/g, " ").split(" ").filter(Boolean)
  .map(w => w.replace(/^(وال|بال|فال|كال|لل|ال)/, "").replace(/^[وب](?=\S{3,})/, "")).filter(w => w.length > 1 && !FAQ_STOP.has(w));
const faqKey = w => { const g = FAQ_SYN.findIndex(l => l.some(x => w === x || (x.length > 3 && w.startsWith(x.slice(0, -1))) || (w.length > 3 && x.startsWith(w)))); return g >= 0 ? "#" + g : w; };
function faqSearch(q){
  const qs = [...new Set(faqTok(q).map(faqKey))]; if (!qs.length) return [];
  return ((S.site || {}).faq || DEFAULT_FAQ).filter(f => f.q && f.a).map(f => {
    const tq = new Set(faqTok(f.q).map(faqKey)), ta = new Set(faqTok(f.a).map(faqKey));
    return {f, score: qs.reduce((n, w) => n + (tq.has(w) ? 2 : ta.has(w) ? 1 : 0), 0)};
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.f);
}
/* ---------- ☕ كوفي دوفي: اطلب من داخل البوابة وهو في المحاضرة، ويوصله إشعار لما يجهز ---------- */
const CF_ST = {new: ["⏳ وصل للكاشير", ""], accepted: ["☕ يتجهز", ""], ready: ["✅ جاهز — تفضّل استلمه", "p"], done: ["تم الاستلام", ""], rejected: ["❌ معتذرين", "a"], cancelled: ["ألغيته", ""], noshow: ["🚫 انلغى", "a"]};
function studentCoffee(el){
  const M = S.cfMenu || {}, B = S.cfBasket = S.cfBasket || [], m2 = v => (Math.round((v || 0) * 100) / 100).toFixed(2);
  const cats = (M.cats || []).filter(c => (M.items || []).some(i => i.cat === c.id)); S.cfCat = S.cfCat && cats.some(c => c.id === S.cfCat) ? S.cfCat : (cats[0] || {}).id;
  const today = new Date().toISOString().slice(0, 10), offers = (S.cfOffers || []).filter(o => o.on && (!o.to || o.to >= today) && (!o.from || o.from <= today));
  const mine = (S.cfMine || []).slice().sort((x, y) => (y.at || "").localeCompare(x.at || "")), active = mine.find(r => ["new", "accepted", "ready"].includes(r.status));
  const unit = (it, sz, ops) => (sz ? sz.p : it.price) + ops.reduce((t, o) => t + (o.p || 0), 0), tot = B.reduce((t, b) => t + b.unit * b.qty, 0);
  el.innerHTML = `${offers.map(o => `<div class="card" style="border:2px solid #c8873a;background:#fff8ef"><h2 style="margin:0 0 4px">🎁 ${esc(o.title)}</h2>${o.text ? `<p style="margin:0">${esc(o.text)}</p>` : ""}${o.to ? `<p class="muted" style="margin:6px 0 0">العرض لين ${esc(o.to)}</p>` : ""}</div>`).join("")}
    ${mine.length ? `<div class="card"><h2>طلباتي</h2><div class="list">${mine.slice(0, 5).map(r => `<div class="item" style="align-items:flex-start"><div class="grow"><b>${(r.items || []).map(x => `${x.qty}× ${esc(x.name)}${x.size ? " " + esc(x.size) : ""}`).join("، ")}</b><div class="muted">${r.at ? esc(new Date(r.at).toTimeString().slice(0, 5)) : ""} · ${esc(r.pickup || "")}</div>${r.reason ? `<div class="notice err" style="margin-top:6px">${esc(r.reason)}</div>` : ""}</div><span class="pill ${CF_ST[r.status] ? CF_ST[r.status][1] : ""}">${CF_ST[r.status] ? CF_ST[r.status][0] : esc(r.status)}</span>${r.paid ? `<span class="pill p">💳 مدفوع ${esc(String(r.paidAmount || ""))}</span>` : M.pay && ["new", "accepted", "ready"].includes(r.status) ? `<button class="btn sm pri" data-cfpay="${r.id}">💳 ادفع الحين</button>` : ""}${r.status === "new" && !r.paid ? `<button class="btn sm" data-cfx="${r.id}">إلغاء</button>` : ""}</div>`).join("")}</div></div>` : ""}
    <div class="card"><h2>☕ ${esc(M.name || "كوفي دوفي")} — اطلب وأنت مكانك</h2>
    ${!M.open ? `<div class="notice">استقبال الطلبات من البوابة مقفول الحين — تقدر تطلب من الكاشير مباشرة.</div>` : active ? `<div class="notice">عندك طلب قيد التنفيذ — تقدر تطلب طلب ثاني بعد ما تستلمه.</div>` : `
      <p class="muted" style="margin-top:0">اختار طلبك، ويوصلك إشعار لما يجهز. ${M.pay ? "تقدر تدفع إلكترونياً بعد الإرسال أو عند الاستلام" : "الدفع عند الاستلام"}${M.osos ? ` · <b>خصم متدربي أسس ${M.osos}٪</b>` : ""}.</p>
      <div class="tabs" style="border:0;padding:0;margin-bottom:8px">${cats.map(c => `<button class="tab ${c.id === S.cfCat ? "on" : ""}" data-cfc="${c.id}">${esc(c.icon || "")} ${esc(c.name)}</button>`).join("")}</div>
      <div class="list">${(M.items || []).filter(i => i.cat === S.cfCat).map(i => `<div class="item" style="cursor:pointer" data-cfi="${i.id}"><span style="font-size:24px">${esc(i.icon || "☕")}</span><div class="grow"><b>${esc(i.name)}</b><div class="muted">${(i.sizes || []).length ? (i.sizes || []).map(s => `${esc(s.n)} ${m2(s.p)}`).join(" · ") : m2(i.price)} ر.س</div></div><span class="btn sm">إضافة</span></div><div id="cfo-${i.id}"></div>`).join("")}</div>
      ${B.length ? `<h3 style="margin-top:14px">سلتك</h3><div class="list">${B.map((b, k) => `<div class="item"><div class="grow"><b>${b.qty}× ${esc(b.name)}${b.size ? " · " + esc(b.size) : ""}</b>${b.opts.length ? `<div class="muted">${esc(b.opts.map(o => o.n).join("، "))}</div>` : ""}${b.note ? `<div class="muted">📝 ${esc(b.note)}</div>` : ""}</div><span>${m2(b.unit * b.qty)}</span><button class="btn sm" data-cfd="${k}">✕</button></div>`).join("")}</div>
        <label for="cfN">ملاحظة للكاشير (اختياري)</label><textarea id="cfN" rows="2" maxlength="200" placeholder="مثال: بطلع بعد المحاضرة الساعة ١١">${esc(S.cfNote || "")}</textarea>
        <label for="cfP">متى بتستلمه؟</label><select id="cfP">${["بعد المحاضرة", "الحين", "بعد ١٥ دقيقة", "بعد ٣٠ دقيقة", "بعد ساعة"].map(p => `<option>${p}</option>`).join("")}</select>
        <p style="margin:10px 0 0">المجموع التقريبي: <b>${m2(tot)} ر.س</b>${M.osos ? ` <span class="muted">قبل خصم المتدربين ${M.osos}٪</span>` : ""}</p>
        <div class="row" style="margin-top:10px"><button class="btn pri" id="cfSend">إرسال الطلب للكاشير ☕</button></div>` : ""}`}</div>`;
  if (!S.cfUnsub) S.cfUnsub = () => {}, S.cfUnsub = onSnapshot(query(collection(db, "coffeeReqs"), where("num", "==", S.myNum)), q => { S.cfMine = q.docs.map(d => ({id: d.id, ...d.data()})); if (S.sTab === "coffee") studentCoffee(el.isConnected ? el : $("#sb")); }, () => {});
  if (S.cfOffers === undefined) { S.cfOffers = []; getDoc(ref("coffeePub/offers")).then(d => { S.cfOffers = d.exists() ? d.data().items || [] : []; if (S.sTab === "coffee") studentCoffee($("#sb")); }).catch(() => {}); }
  el.querySelectorAll("[data-cfc]").forEach(b => b.onclick = () => { S.cfCat = b.dataset.cfc; studentCoffee(el); });
  el.querySelectorAll("[data-cfd]").forEach(b => b.onclick = () => { B.splice(+b.dataset.cfd, 1); studentCoffee(el); });
  el.querySelectorAll("[data-cfpay]").forEach(b => b.onclick = () => startPay({kind: "coffee", id: b.dataset.cfpay}, b));
  el.querySelectorAll("[data-cfx]").forEach(b => b.onclick = async () => { try { await setDoc(ref("coffeeReqs/" + b.dataset.cfx), {status: "cancelled"}, {merge: true}); toast("انلغى الطلب"); } catch (x) { handleWriteErr(x); } });
  el.querySelectorAll("[data-cfi]").forEach(row => row.onclick = () => {
    const it = (M.items || []).find(i => i.id === row.dataset.cfi), box = $("#cfo-" + it.id); if (box.innerHTML) { box.innerHTML = ""; return; }
    const gs = (it.groups || []).map(g => (M.groups || []).find(x => x.id === g)).filter(Boolean);
    box.innerHTML = `<div class="card" style="margin:4px 0 10px;background:#faf7f2">${(it.sizes || []).length ? `<label>الحجم</label><select data-sz>${it.sizes.map((s, k) => `<option value="${k}" ${k === Math.min(1, it.sizes.length - 1) ? "selected" : ""}>${esc(s.n)} — ${m2(s.p)}</option>`).join("")}</select>` : ""}
      ${gs.map(g => `<label>${esc(g.name)}</label>${g.multi ? `<div>${g.choices.map((c, k) => `<label style="display:inline-flex;gap:4px;margin-inline-end:12px;font-weight:400"><input type="checkbox" data-gm="${g.id}" value="${k}"> ${esc(c.n)}${c.p ? ` (+${m2(c.p)})` : ""}</label>`).join("")}</div>` : `<select data-gs="${g.id}">${g.choices.map((c, k) => `<option value="${k}">${esc(c.n)}${c.p ? ` (+${m2(c.p)})` : ""}</option>`).join("")}</select>`}`).join("")}
      <label>ملاحظة على الصنف</label><input data-nt maxlength="60" placeholder="مثال: ثلج خفيف"><div class="row" style="margin-top:8px"><select data-q style="width:90px">${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join("")}</select><button class="btn pri" data-add>أضف للسلة</button></div></div>`;
    box.onclick = e => e.stopPropagation();
    box.querySelector("[data-add]").onclick = () => {
      if (B.length >= 10) return toast("الحد ١٠ أصناف بالطلب");
      const sz = (it.sizes || []).length ? it.sizes[+box.querySelector("[data-sz]").value] : null;
      const ops = gs.flatMap(g => g.multi ? [...box.querySelectorAll(`[data-gm="${g.id}"]:checked`)].map(x => g.choices[+x.value]) : [g.choices[+box.querySelector(`[data-gs="${g.id}"]`).value]]).filter(o => o && !(o.p === 0 && /عادي/.test(o.n)));
      B.push({id: it.id, name: it.name, size: sz ? sz.n : "", opts: ops.map(o => ({n: o.n, p: o.p || 0})), qty: +box.querySelector("[data-q]").value, note: box.querySelector("[data-nt]").value.trim().slice(0, 60), unit: unit(it, sz, ops)});
      toast("➕ " + it.name); studentCoffee(el);
    };
  });
  const nt = $("#cfN"); if (nt) nt.oninput = () => S.cfNote = nt.value;
  const sd = $("#cfSend"); if (sd) sd.onclick = async () => {
    sd.disabled = true; const id = "cf-" + uid() + uid();
    try { await setDoc(ref("coffeeReqs/" + id), {num: S.myNum, name: (S.myStudent && S.myStudent.name) || "", items: B.map(b => ({id: b.id, name: b.name, size: b.size, opts: b.opts, qty: b.qty, note: b.note})),
        note: ($("#cfN").value || "").trim().slice(0, 200), pickup: $("#cfP").value, total: Math.round(tot * 100) / 100, status: "new", at: new Date().toISOString()});
      S.cfBasket = []; S.cfNote = ""; toast("☕ انرسل طلبك — يوصلك إشعار لما يجهز"); studentCoffee(el); }
    catch (x) { sd.disabled = false; handleWriteErr(x); }
  };
}
function studentAcReq(el){
  const reqs = (S.myAReq || []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const lastPhone = (reqs.find(r => r.phone) || {}).phone || "";
  el.innerHTML = `<div class="card"><h2>عندك سؤال؟</h2><p class="muted" style="margin-top:0">اكتب سؤالك بكلامك، وتطلع لك الإجابة على طول.</p>
    <input type="search" id="fqS" placeholder="مثال: كيف أطلع شهادتي؟" value="${esc(S._fqS || "")}"><div id="fqR" style="margin-top:8px"></div></div>
  <div class="card" id="arForm"><h2>طلب أو استفسار للشؤون الأكاديمية</h2><p class="muted" style="margin-top:0">اكتب طلبك، ويوصلك الرد هنا أو على الواتساب.</p>
    <label for="arC">النوع</label><select id="arC">${AC_CATS.map(c => `<option>${c}</option>`).join("")}</select>
    <label for="arT">طلبك أو استفسارك</label><textarea id="arT" rows="3" maxlength="800" placeholder="مثال: أبي خطاب تعريف لجهة عملي"></textarea>
    <label for="arP">جوالك للتواصل</label><input type="tel" id="arP" dir="ltr" placeholder="05xxxxxxxx" inputmode="numeric" value="${esc(lastPhone ? "0" + lastPhone.slice(3) : "")}">
    <div class="row" style="margin-top:10px"><button class="btn pri" id="arSend">إرسال للشؤون الأكاديمية</button></div></div>
  ${reqs.length ? `<div class="card"><h2>طلباتي</h2><div class="list">${reqs.map(r => `<div class="item" style="align-items:flex-start"><div class="grow"><div class="muted">${esc(r.cat || "")} · ${esc(bothDates((r.at || "").slice(0, 10)))}</div><div>${esc(r.text)}</div>${r.reply ? `<div class="notice" style="margin:8px 0 0"><b>رد الشؤون الأكاديمية:</b> ${esc(r.reply)}</div>` : ""}</div><span class="pill ${r.status === "done" ? "p" : ""}">${r.status === "done" ? "تم الرد" : "قيد المراجعة"}</span></div>`).join("")}</div></div>` : ""}`;
  const fqShow = () => {
    const q = $("#fqS").value.trim(); S._fqS = q;
    if (q.length < 2) { $("#fqR").innerHTML = ""; return; }
    const hits = faqSearch(q);
    $("#fqR").innerHTML = hits.length ? hits.map((f, i) => `<details class="item" style="display:block;padding:10px 12px" ${i === 0 ? "open" : ""}><summary style="cursor:pointer;font-weight:700">${esc(f.q)}</summary><p style="margin:8px 0 0">${esc(f.a)}</p></details>`).join("") + `<p class="muted" style="margin:8px 0 0">ما لقيت جوابك؟ <a href="#arForm" id="fqAsk">أرسل سؤالك للشؤون الأكاديمية</a></p>`
      : `<p class="muted" style="margin:0">ما لقيت إجابة جاهزة. <a href="#arForm" id="fqAsk">أرسل سؤالك للشؤون الأكاديمية</a> ويردون عليك.</p>`;
    $("#fqAsk").onclick = e => { e.preventDefault(); if (!$("#arT").value.trim()) $("#arT").value = q; $("#arForm").scrollIntoView({behavior: "smooth"}); $("#arT").focus(); };
  };
  let fqT; $("#fqS").oninput = () => { clearTimeout(fqT); fqT = setTimeout(fqShow, 250); }; if (S._fqS) fqShow();
  reqs.filter(r => r.status === "done" && r.reply && !r.seen).forEach(r => setDoc(ref("acReqs/" + r.id), {seen: true}, {merge: true}).catch(() => {}));
  $("#arSend").onclick = async e => {
    const text = $("#arT").value.trim(), ph = normPhone($("#arP").value), cat = $("#arC").value;
    if (text.length < 3) return toast("اكتب طلبك"); if (!/^9665\d{8}$/.test(ph)) return toast("اكتب رقم جوال صحيح");
    e.target.disabled = true;
    const id = "ar-" + uid() + uid();
    try { await setDoc(ref("acReqs/" + id), {num: S.myNum, name: (S.myStudent && S.myStudent.name) || "", status: "new", at: new Date().toISOString(), cat, text: text.slice(0, 800), phone: ph}); notify("acad", id); toast("انرسل طلبك للشؤون الأكاديمية"); }
    catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
function adminAcReqs(el){
  const all = (S.aReqs || []).slice().sort((a, b) => (a.status === "new") === (b.status === "new") ? (b.at || "").localeCompare(a.at || "") : a.status === "new" ? -1 : 1);
  const f = S.arFilter || "new", list = f === "all" ? all : all.filter(r => r.status === f);
  el.innerHTML = `<div class="card"><h2>طلبات واستفسارات الطلاب</h2><p class="muted" style="margin-top:0">اكتب ردك ويظهر للطالب في بوابته ويوصله إشعار، أو تواصل معه بالواتساب.</p>
    <div class="row">${[["new", "الجديدة"], ["done", "تم الرد"], ["all", "الكل"]].map(([k, v]) => `<button class="btn sm ${f === k ? "pri" : ""}" data-arf="${k}">${v} (${k === "all" ? all.length : all.filter(r => r.status === k).length})</button>`).join("")}</div></div>
  <div class="list">${list.map(r => `<div class="card" style="margin:0 0 10px"><div class="row" style="justify-content:space-between"><div><b>${esc((S.students[r.num] || {}).name || r.name)}</b> <span class="muted">${esc(r.num)} · ${esc(r.cat || "")} · ${esc(bothDates((r.at || "").slice(0, 10)))}</span></div><span class="pill ${r.status === "done" ? "p" : "l"}">${r.status === "done" ? "تم الرد" : "جديد"}</span></div>
    <p style="margin:8px 0">${esc(r.text)}</p>
    ${r.reply ? `<div class="notice" style="margin:0 0 8px"><b>الرد:</b> ${esc(r.reply)}</div>` : ""}
    ${RO() ? "" : `${r.status !== "done" ? `<textarea id="arr-${r.id}" rows="2" maxlength="600" placeholder="ردك (اختياري، يظهر للطالب)"></textarea>` : ""}
    <div class="row" style="margin-top:8px">${r.status !== "done" ? `<button class="btn sm pri" data-ardone="${r.id}">إرسال الرد / تم</button>` : ""}${r.phone ? `<a class="btn sm gold" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}?text=${encodeURIComponent(`السلام عليكم ${r.name}، بخصوص طلبك للشؤون الأكاديمية في ${INST_AR}:\n`)}">واتساب</a>` : ""}<button class="btn sm danger" data-ardel="${r.id}">حذف</button></div>`}
  </div>`).join("") || `<div class="card empty">ما فيه طلبات هنا.</div>`}</div>`;
  el.querySelectorAll("[data-arf]").forEach(b => b.onclick = () => { S.arFilter = b.dataset.arf; render(); });
  el.querySelectorAll("[data-ardone]").forEach(b => b.onclick = async () => {
    const id = b.dataset.ardone, r = all.find(x => x.id === id), reply = (($("#arr-" + id) || {}).value || "").trim().slice(0, 600);
    b.disabled = true;
    try { await setDoc(ref("acReqs/" + id), {status: "done", reply, doneAt: new Date().toISOString(), doneBy: S.adminRole}, {merge: true}); notify("acad", id); logAction("رد على طلب طالب", `${r.name} · ${r.cat || ""}`); toast("تم"); } catch (e) { b.disabled = false; handleWriteErr(e); }
  });
  el.querySelectorAll("[data-ardel]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    try { await deleteDoc(ref("acReqs/" + b.dataset.ardel)); toast("انحذف"); } catch (e) { handleWriteErr(e); }
  });
}
function adminExcuses(el){
  const f = S.excFilter || "pending";
  const list = (S.excuses || []).filter(x => f === "all" || x.status === f).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">أعذار الغياب</h2>
    <div class="tabs" style="border:0;padding:0">${[["pending", "قيد المراجعة"], ["accepted", "مقبولة"], ["rejected", "مرفوضة"], ["all", "الكل"]].map(([k, v]) => `<button class="tab ${f === k ? "on" : ""}" data-ef="${k}">${v}</button>`).join("")}</div></div>
    <p class="muted" style="margin:8px 0 0">قبول العذر يحوّل غياب ذاك اليوم إلى "مستأذن"، فما ينحسب غياب.</p></div>
  <div class="list">${list.map(x => `<div class="card" style="display:grid;gap:8px">
    <div class="row" style="justify-content:space-between"><div><div class="t" style="font-weight:700">${esc(x.name)} · ${esc(x.num)}</div><div class="muted">${esc(x.course)} · ${esc(fmtDate(x.date))}</div></div><span class="pill ${EXC_PILL[x.status]}">${EXC_ST[x.status]}</span></div>
    <div>${esc(x.reason)}</div>
    ${x.img ? `<img src="${esc(x.img)}" alt="صورة العذر" style="max-width:100%;max-height:420px;border-radius:10px;border:1px solid var(--line);justify-self:start">` : `<span class="muted">بدون صورة</span>`}
    ${x.status === "pending" ? `<div class="row"><input type="text" class="grow" id="exn-${esc(x.id)}" placeholder="ملاحظة للطالب (اختياري)"><button class="btn pri sm" data-exok="${esc(x.id)}">قبول</button><button class="btn danger sm" data-exno="${esc(x.id)}">رفض</button></div>` : x.note ? `<div class="muted">الملاحظة: ${esc(x.note)}</div>` : ""}
  </div>`).join("") || `<div class="card empty">ما فيه أعذار هنا.</div>`}</div>`;
  el.querySelectorAll("[data-ef]").forEach(b => b.onclick = () => { S.excFilter = b.dataset.ef; render(); });
  const decide = async (id, ok) => {
    const x = (S.excuses || []).find(y => y.id === id); if (!x) return;
    const note = ($("#exn-" + id) || {}).value || "";
    const b = writeBatch(db);
    b.update(ref("excuses/" + id), {status: ok ? "accepted" : "rejected", note: note.trim(), decidedAt: new Date().toISOString(), by: S.adminRole});
    let applied = false;
    if (ok) {
      const g = S.groups[x.groupId], entry = g && (g.students || []).find(s => s.sid === x.num);
      const aRef = ref(`att/${x.groupId}_${x.date}`), snap = await getDoc(aRef);
      if (entry && snap.exists()) { b.set(aRef, {rec: {[entry.id]: {st: "e", excuse: id}}}, {merge: true}); applied = true; }
    }
    try { await b.commit(); notify("excuse", id); if (applied) notify("att", `${x.groupId}_${x.date}`); logAction(ok ? "قبول عذر" : "رفض عذر", `${x.name} · ${x.course} · ${x.date}`); toast(ok ? (applied ? "انقبل العذر وتحوّل الغياب إلى مستأذن" : "انقبل العذر. ما فيه تحضير مسجل لذاك اليوم") : "انرفض العذر"); }
    catch (e) { handleWriteErr(e); }
  };
  el.querySelectorAll("[data-exok]").forEach(b => b.onclick = () => decide(b.dataset.exok, true));
  el.querySelectorAll("[data-exno]").forEach(b => b.onclick = () => decide(b.dataset.exno, false));
}

/* ---------- evaluations tab ---------- */
function adminEvals(el){
  if (!S.evalsAll) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري تحميل التقييمات…</p></div>`;
    getDocs(collection(db, "surveys")).then(snap => { S.surveyAll = snap.docs.map(d => d.data()).map(x => ({...x, title: x.sid === (S.survey || {}).id ? S.survey.title : x.sid})); if (S.aTab === "evals") adminSurvey(); }).catch(() => {});
    getDocs(collection(db, "evals")).then(snap => { S.evalsAll = snap.docs.map(d => d.data()); if (S.aTab === "evals") render(); }).catch(e => { console.error(e); el.innerHTML = `<div class="notice err">تعذّر تحميل التقييمات، تأكد من تحديث قواعد Firebase.</div>`; });
    return;
  }
  const byG = {}; S.evalsAll.forEach(e => (byG[e.groupId] = byG[e.groupId] || []).push(e));
  const gs = sortedGroups().filter(g => g.evalOpen || byG[g.id]);
  const avg = (list, i) => list.length ? (list.reduce((a, e) => a + (e.ratings[i] || 0), 0) / list.length).toFixed(1) : "—";
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">تقييمات المدربين والمقررات</h2><button class="btn sm" id="evRef">تحديث</button></div>
    <p class="muted" style="margin:8px 0 0">تفتح التقييم لأي مقرر من "المقررات والطلاب" ← فتح وتعديل ← "فتح تقييم المدرب والمقرر". التقييم سري عن المدرب.</p></div>
  ${gs.map(g => { const l = byG[g.id] || [], n = (g.memberNums || []).length, all = l.length ? (l.reduce((a, e) => a + e.ratings.reduce((x, y) => x + y, 0) / e.ratings.length, 0) / l.length).toFixed(1) : "—";
    return `<div class="card"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">${esc(g.course)}</h2><p class="muted" style="margin:4px 0 0">${esc(tName(g.trainerId))} · قيّم ${l.length} من ${n}${g.evalOpen ? "" : " · التقييم مقفل"}</p></div><div style="font-size:28px;font-weight:700;color:var(--green)">${all}<span class="muted" style="font-size:14px"> / 5</span></div></div>
      ${l.length ? `<div class="tbl" style="margin-top:10px"><table><tbody>${EVAL_Q.map((q, i) => `<tr><td class="nm">${q}</td><td><b>${avg(l, i)}</b></td><td style="width:40%"><span class="bar" style="display:block"><i style="width:${avg(l, i) === "—" ? 0 : avg(l, i) / 5 * 100}%"></i></span></td></tr>`).join("")}</tbody></table></div>
      ${l.filter(e => e.comment).length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">الملاحظات (${l.filter(e => e.comment).length})</summary><div class="list" style="margin-top:6px">${l.filter(e => e.comment).map(e => `<div class="item" style="padding:8px 12px">${esc(e.comment)}</div>`).join("")}</div></details>` : ""}` : `<p class="muted">ما وصلت تقييمات بعد.</p>`}
    </div>`; }).join("") || `<div class="card empty">ما فيه تقييمات مفتوحة. افتحها من "المقررات والطلاب".</div>`}`;
  el.insertAdjacentHTML("afterbegin", `<div id="svBox"></div>`); adminSurvey();
  $("#evRef").onclick = () => { S.evalsAll = null; S.surveyAll = null; render(); };
}


/* ---------- indicators dashboard ---------- */
function adminKpi(el){
  if (!S.kpiAtt) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري حساب المؤشرات…</p></div>`;
    Promise.all([getDocs(collection(db, "att")), S.evalsAll || RO() ? null : getDocs(collection(db, "evals")).catch(() => null)]).then(([a, e]) => {
      S.kpiAtt = a.docs.map(d => d.data()); if (e) S.evalsAll = e.docs.map(d => d.data());
      if (S.aTab === "kpi") render();
    }).catch(err => { console.error(err); el.innerHTML = `<div class="notice err">تعذّر تحميل البيانات.</div>`; });
    return;
  }
  const att = countable(S.kpiAtt), byG = {}; att.forEach(d => (byG[d.groupId] = byG[d.groupId] || []).push(d));
  const groups = sortedGroups().map(g => {
    const docs = byG[g.id] || [], st = (g.students || []).map(s => absStats(g, s.id, docs));
    const withAtt = st.filter(x => x.attPct !== null);
    const gd = S.grades[g.id] || {}, marks = gd.status === "approved" ? Object.values(gd.marks || {}).filter(x => typeof x === "number") : [];
    const ev = (S.evalsAll || []).filter(e => e.groupId === g.id);
    return {g, held: docs.length, n: st.length,
      att: withAtt.length ? Math.round(withAtt.reduce((a, x) => a + x.attPct, 0) / withAtt.length) : null,
      risk: st.filter(x => x.level === 1 || x.level === 2).length, deny: st.filter(x => x.level === 3).length,
      pass: marks.length ? Math.round(marks.filter(x => x >= PASS).length / marks.length * 100) : null,
      avgMark: marks.length ? Math.round(marks.reduce((a, x) => a + x, 0) / marks.length) : null,
      ev: ev.length ? ev.reduce((a, e) => a + e.ratings.reduce((x, y) => x + y, 0) / e.ratings.length, 0) / ev.length : null};
  });
  const live = groups.filter(x => x.att !== null);
  const overall = live.length ? Math.round(live.reduce((a, x) => a + x.att * x.n, 0) / Math.max(1, live.reduce((a, x) => a + x.n, 0))) : null;
  const trainers = {}; groups.forEach(x => { const k = x.g.trainerId || "_"; (trainers[k] = trainers[k] || []).push(x); });
  const avgOf = (l, k) => { const v = l.filter(x => x[k] !== null); return v.length ? v.reduce((a, x) => a + x[k], 0) / v.length : null; };
  const months = {}; att.forEach(d => { const m = d.date.slice(0, 7); const o = months[m] = months[m] || {pr: 0, all: 0}; const g = S.groups[d.groupId]; (g ? g.students || [] : []).forEach(s => { o.all++; const r = d.rec && d.rec[s.id]; if (r && (r.st === "p" || r.st === "l")) o.pr++; }); });
  const fin = SEES_FIN() && S.finAcc ? finRows().filter(r => r.acc) : null;
  const finT = fin ? {net: fin.reduce((a, r) => a + r.st.net, 0), paid: fin.reduce((a, r) => a + r.st.paid, 0), over: fin.reduce((a, r) => a + r.st.overdue, 0), late: fin.filter(r => r.st.status === "late").length} : null;
  const pctBar = v => v === null ? `<span class="muted">—</span>` : `<div class="row" style="gap:6px;flex-wrap:nowrap"><span class="bar" style="flex:1"><i style="width:${v}%;background:${v < 75 ? "var(--abs)" : v < 85 ? "#D9A400" : "var(--green-2)"}"></i></span><b>${v}%</b></div>`;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">المؤشرات</h2><button class="btn sm" id="kRef">تحديث</button></div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="n">${Object.keys(S.students || {}).length || groups.reduce((a, x) => a + x.n, 0)}</div><div class="l">متدرب</div></div>
      <div class="stat"><div class="n">${groups.length}</div><div class="l">مقرر</div></div>
      <div class="stat"><div class="n">${att.length}</div><div class="l">محاضرة منعقدة</div></div>
      <div class="stat"><div class="n" style="color:${overall !== null && overall < 80 ? "var(--abs)" : "var(--green)"}">${overall === null ? "—" : overall + "%"}</div><div class="l">نسبة الحضور العامة</div></div>
      <div class="stat"><div class="n">${groups.reduce((a, x) => a + x.risk, 0)}</div><div class="l">عليهم إنذار</div></div>
      <div class="stat"><div class="n" style="color:var(--abs)">${groups.reduce((a, x) => a + x.deny, 0)}</div><div class="l">حرمان</div></div>
      ${finT ? `<div class="stat"><div class="n">${finT.net ? Math.round(finT.paid / finT.net * 100) : 0}%</div><div class="l">نسبة التحصيل</div></div><div class="stat"><div class="n" style="color:var(--abs)">${SAR(finT.over)}</div><div class="l">متأخر السداد (${finT.late})</div></div>` : ""}
    </div></div>
  <div class="card"><h2>المقررات</h2><div class="tbl"><table><thead><tr><th class="nm">المقرر</th><th class="nm">المدرب/ة</th><th>المحاضرات</th><th style="min-width:150px">الحضور</th><th>إنذار</th><th>حرمان</th><th>النجاح</th><th>تقييم المدرب</th></tr></thead><tbody>
    ${groups.map(x => `<tr><td class="nm">${esc(x.g.course)}</td><td class="nm">${esc(tName(x.g.trainerId))}</td><td>${x.held}</td><td>${pctBar(x.att)}</td><td>${x.risk || "—"}</td><td style="color:${x.deny ? "var(--abs)" : "inherit"}">${x.deny || "—"}</td><td>${x.pass === null ? "—" : x.pass + "%"}</td><td>${x.ev === null ? "—" : x.ev.toFixed(1) + " / 5"}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">ما فيه مقررات</td></tr>`}
  </tbody></table></div><p class="muted">النجاح يظهر بعد اعتماد الدرجات. التقييم من استبيان تقييم المدرب.</p></div>
  <div class="card"><h2>المدربين</h2><div class="tbl"><table><thead><tr><th class="nm">المدرب/ة</th><th>المقررات</th><th style="min-width:150px">متوسط الحضور</th><th>متوسط التقييم</th></tr></thead><tbody>
    ${Object.entries(trainers).map(([k, l]) => { const a = avgOf(l, "att"), e = avgOf(l, "ev"); return `<tr><td class="nm">${esc(k === "_" ? "بدون مدرب" : tName(k))}</td><td>${l.length}</td><td>${pctBar(a === null ? null : Math.round(a))}</td><td>${e === null ? "—" : e.toFixed(1)}</td></tr>`; }).join("")}
  </tbody></table></div></div>
  <div class="card"><h2>الحضور حسب الشهر</h2>${Object.keys(months).length ? `<div class="list">${Object.entries(months).sort().map(([m, o]) => `<div class="item" style="padding:8px 12px"><span style="width:80px">${m}</span><span class="grow">${pctBar(o.all ? Math.round(o.pr / o.all * 100) : null)}</span></div>`).join("")}</div>` : `<p class="muted" style="margin:0">ما فيه تحضير بعد.</p>`}</div>`;
  $("#kRef").onclick = () => { S.kpiAtt = null; render(); };
}


/* ---------- full trainee profile (kept with the login secrets: administration only) ---------- */
const NATS = ["سعودي", "غير سعودي"];
/* ---------- student documents and the printable student file ---------- */
const DOC_KINDS = ["الهوية الوطنية / الإقامة", "شهادة الثانوي", "السجل الأكاديمي", "صورة شخصية", "أخرى"];
async function docsApi(body){
  const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const r = await fetch(url + "/docs", {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || "failed"); e.code = j.error; throw e; } return j;
}
const docSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + " ميجا" : Math.max(1, Math.round(n / 1024)) + " ك.ب";
function stuDocsBind(num){
  if (S._docL) try { S._docL(); } catch {}
  S._docL = onSnapshot(ref("studentDocs/" + num), snap => { S.stDocs = S.stDocs || {}; S.stDocs[num] = snap.exists() ? (snap.data().files || []) : []; draw(); }, e => { console.error(e); const x = $("#pfDocs"); if (x) x.innerHTML = `<div class="muted">ما قدرت أفتح المستندات</div>`; });
  const prev = S.subs.indexOf(S._docLp); if (prev >= 0) S.subs.splice(prev, 1);
  S._docLp = () => { try { S._docL && S._docL(); } catch {} }; S.subs.push(S._docLp);
  const draw = () => { const el = $("#pfDocs"); if (!el) { try { S._docL(); } catch {} S._docL = null; return; } const files = (S.stDocs || {})[num] || [];
    el.innerHTML = files.map(f => `<div class="item"><div class="grow"><b>${esc(f.kind)}</b><div class="muted">${esc(f.name)} · ${docSize(f.size || 0)} · ${esc((f.at || "").slice(0, 10))}</div></div><button class="btn sm" data-dget="${esc(f.rid)}">فتح</button><button class="btn sm danger" data-ddel="${esc(f.rid)}">حذف</button></div>`).join("") || `<div class="muted">ما فيه مستندات مرفوعة.</div>`;
    el.querySelectorAll("[data-dget]").forEach(b => b.onclick = async () => { const w = window.open("", "_blank"); try { const j = await docsApi({action: "get", num, rid: b.dataset.dget}); if (w) w.location = j.url; else location.href = j.url; } catch (x) { if (w) w.close(); toast("تعذّر فتح المستند"); } });
    el.querySelectorAll("[data-ddel]").forEach(b => b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
      const f = files.find(x => x.rid === b.dataset.ddel); b.disabled = true;
      try { await docsApi({action: "del", num, rid: f.rid}); await setDoc(ref("studentDocs/" + num), {files: files.filter(x => x.rid !== f.rid)}, {merge: true}); logAction("حذف مستند متدرب", `${(S.students[num] || {}).name || num} · ${f.kind}`); }
      catch (x) { console.error(x); b.disabled = false; toast("تعذّر الحذف"); }
    });
  };
  $("#pfDf").onchange = async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    if (file.size > 10 * 1024 ** 2) return toast("الملف أكبر من 10 ميجا");
    if (!/^(application\/pdf|image\/)/.test(file.type)) return toast("ارفع PDF أو صورة");
    const kind = $("#pfDk").value, pg = $("#pfDp");
    try {
      const t = await docsApi({action: "up", num, size: file.size});
      await new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("PUT", t.url); x.upload.onprogress = ev => { if (ev.lengthComputable && pg) pg.textContent = Math.floor(ev.loaded / ev.total * 100) + "%"; }; x.onload = () => x.status < 300 ? ok() : no(new Error("up " + x.status)); x.onerror = () => no(new Error("net")); x.send(file); });
      const files = (S.stDocs || {})[num] || [];
      await setDoc(ref("studentDocs/" + num), {files: [...files, {kind, name: file.name.slice(0, 120), type: file.type, size: file.size, rid: t.rid, at: new Date().toISOString(), by: S.adminRole}]}, {merge: true});
      logAction("رفع مستند متدرب", `${(S.students[num] || {}).name || num} · ${kind}`); if (pg) pg.textContent = "✓ انرفع";
    } catch (x) { console.error(x); if (pg) pg.textContent = ""; toast("تعذّر رفع الملف"); }
  };
}
function printStudentFile(num){
  const st = S.students[num]; if (!st) return;
  const w = openPrint(); if (!w) return;
  const p = (S.stProf || {})[num] || {}, files = (S.stDocs || {})[num] || [];
  const gs = Object.values(S.groups).filter(g => (g.memberNums || []).includes(num)).sort((a, b) => (a.course || "").localeCompare(b.course || "", "ar"));
  const ph = v => v ? "0" + String(v).replace(/^966/, "") : "—";
  const row = (k, v) => `<div><b>${k}:</b> ${esc(v || "—")}</div>`;
  let fin = "";
  const acc = SEES_FIN() && S.finAcc ? S.finAcc[num] : null;
  if (acc) { const a = accStatus(acc, paysOf(num));
    fin = `<h2>البيانات المالية</h2><div class="info">${row("البرنامج", (((S.finSet || {}).programs || []).find(x => x.id === acc.program) || {}).name || "")}${row("طريقة السداد", PLANS[acc.plan] || "")}${row("صافي الرسوم", SAR(a.net))}${row("المدفوع", SAR(a.paid))}${row("المتبقي", SAR(a.remaining))}${row("الحالة", FST[a.status])}</div>
    ${a.sched.length ? `<table><thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th>البيان</th><th>المبلغ</th><th>المسدد منه</th><th>الحالة</th></tr></thead><tbody>${a.sched.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(bothDates(i.due))}</td><td class="n">${esc(i.label || "قسط")}</td><td>${SAR(i.amount)}</td><td>${SAR(i.covered)}</td><td>${INST_ST[i.st]}</td></tr>`).join("")}</tbody></table>` : `<p>ما فيه أقساط مجدولة.</p>`}`; }
  const html = `<h1>ملف المتدرب</h1>
    <div class="info">${row("الاسم", st.name)}${row("الرقم الأكاديمي", num)}${row("رقم الهوية / الإقامة", p.nid)}${row("تاريخ الميلاد", p.dob ? bothDates(p.dob) : "")}${row("الجنسية", p.nat)}${row("الجنس", GENDER[st.gender] || "")}${row("جوال المتدرب", ph(p.phone))}${row("جوال ولي الأمر", ph(p.gphone))}${row("البريد الإلكتروني", p.email)}${row("المؤهل", p.edu)}${row("المدينة / الحي", p.city)}</div>
    <h2>المقررات المسجل فيها</h2>${gs.length ? `<table><thead><tr><th>#</th><th>المقرر</th><th>المدرب/ة</th><th>نمط الحضور</th></tr></thead><tbody>${gs.map((g, i) => `<tr><td>${i + 1}</td><td class="n">${esc(g.course)}</td><td class="n">${esc(tName(g.trainerId))}</td><td>${esc(g.mode || "—")}</td></tr>`).join("")}</tbody></table>` : `<p>ما هو مسجل في مقررات.</p>`}
    <h2>المستندات</h2><table><thead><tr><th>المستند</th><th>الحالة</th><th>تاريخ الرفع</th></tr></thead><tbody>${DOC_KINDS.filter(k => k !== "أخرى").map(k => { const f = files.find(x => x.kind === k); return `<tr><td class="n">${k}</td><td>${f ? "✓ مرفق" : "✗ غير مرفق"}</td><td>${f ? esc(bothDates(f.at.slice(0, 10))) : "—"}</td></tr>`; }).join("")}${files.filter(f => f.kind === "أخرى").map(f => `<tr><td class="n">أخرى: ${esc(f.name)}</td><td>✓ مرفق</td><td>${esc(bothDates(f.at.slice(0, 10)))}</td></tr>`).join("")}</tbody></table>
    ${fin}
    ${p.note ? `<h2>ملاحظات</h2><p style="white-space:pre-wrap">${esc(p.note)}</p>` : ""}
    <div class="sig"><div>الشؤون الأكاديمية</div>${acc ? "<div>المالية</div>" : ""}<div>مدير المعهد</div></div>`;
  fillPrint(w, `ملف المتدرب ${st.name}`, [{html}], false, "الشؤون الأكاديمية");
}
function openProfile(num){
  const st = S.students[num]; if (!st) return;
  const p = (S.stProf || {})[num] || {};
  S._modalGroup = null; S._finModal = null;
  $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">ملف المتدرب · ${esc(st.name)}</h2><button class="btn sm" id="pfx">إغلاق</button></div>
    <p class="muted" style="margin:0">الرقم الأكاديمي ${esc(num)} · البيانات هذي تشوفها الإدارة والشؤون الأكاديمية بس.</p>
    <div class="row">
      <label class="f grow" for="pfNid">رقم الهوية / الإقامة<input type="text" id="pfNid" inputmode="numeric" dir="ltr" maxlength="10" value="${esc(p.nid || "")}"></label>
      <label class="f grow" for="pfDob">تاريخ الميلاد<input type="date" id="pfDob" value="${esc(p.dob || "")}"></label>
      <label class="f grow" for="pfNat">الجنسية<select id="pfNat"><option value="">—</option>${NATS.map(n => `<option ${p.nat === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>
    <div class="row">
      <label class="f grow" for="pfPh">جوال المتدرب<input type="tel" id="pfPh" dir="ltr" value="${esc(p.phone || "")}" placeholder="05xxxxxxxx"></label>
      <label class="f grow" for="pfG">جوال ولي الأمر<input type="tel" id="pfG" dir="ltr" value="${esc(p.gphone || "")}" placeholder="05xxxxxxxx"></label>
      <label class="f grow" for="pfE">البريد الإلكتروني<input type="email" id="pfE" dir="ltr" value="${esc(p.email || "")}"></label>
    </div>
    <div class="row">
      <label class="f grow" for="pfEdu">المؤهل<input type="text" id="pfEdu" value="${esc(p.edu || "")}" placeholder="ثانوي، دبلوم، بكالوريوس…"></label>
      <label class="f grow" for="pfCity">المدينة / الحي<input type="text" id="pfCity" value="${esc(p.city || "")}"></label>
    </div>
    <label class="f" for="pfN">ملاحظات<textarea id="pfN" style="min-height:60px">${esc(p.note || "")}</textarea></label>
    <div class="row"><button class="btn pri" id="pfSave">حفظ</button><button class="btn sm" id="pfCard">طباعة بطاقته</button><button class="btn sm gold" id="pfPrint">طباعة ملف المتدرب</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
    <div><h3 style="margin:0 0 4px">المستندات</h3><p class="muted" style="margin:0 0 8px">الهوية وشهادة الثانوي والسجل الأكاديمي. تنحفظ على سيرفر المعهد وما يشوفها إلا الإدارة والشؤون الأكاديمية. PDF أو صورة، حتى 10 ميجا.</p>
      <div class="list" id="pfDocs"><div class="muted">جاري التحميل…</div></div>
      <div class="row" style="margin-top:8px;gap:6px"><select id="pfDk" style="width:auto">${DOC_KINDS.map(k => `<option>${k}</option>`).join("")}</select><label class="btn sm pri" for="pfDf" style="cursor:pointer">+ رفع مستند</label><input type="file" id="pfDf" accept=".pdf,image/*" style="display:none"><span class="muted" id="pfDp"></span></div></div>`;
  $("#modal").classList.add("on");
  $("#pfx").onclick = closeModal;
  $("#pfCard").onclick = () => printIdCards([num]);
  $("#pfPrint").onclick = () => printStudentFile(num);
  stuDocsBind(num);
  $("#pfSave").onclick = async () => {
    const nid = digits($("#pfNid").value), ph = $("#pfPh").value.trim() ? normPhone($("#pfPh").value) : "", gp = $("#pfG").value.trim() ? normPhone($("#pfG").value) : "";
    if (nid && !/^[12]\d{9}$/.test(nid)) return toast("رقم الهوية لازم يكون 10 أرقام ويبدأ بـ 1 أو 2");
    if (ph && !/^9665\d{8}$/.test(ph)) return toast("جوال المتدرب غير صحيح");
    if (gp && !/^9665\d{8}$/.test(gp)) return toast("جوال ولي الأمر غير صحيح");
    const d = {nid, dob: $("#pfDob").value, nat: $("#pfNat").value, phone: ph, gphone: gp, email: $("#pfE").value.trim().slice(0, 120), edu: $("#pfEdu").value.trim().slice(0, 60), city: $("#pfCity").value.trim().slice(0, 80), note: $("#pfN").value.trim().slice(0, 600)};
    try { await setDoc(ref("studentSecrets/" + num), d, {merge: true}); S.stProf[num] = {...p, ...d}; if (ph) S.stPhones[num] = ph; logAction("ملف متدرب", `${st.name} · ${num}`); toast("انحفظ الملف"); closeModal(); }
    catch (e) { handleWriteErr(e); }
  };
}
function exportProfiles(){
  const rows = Object.values(S.students).sort((a, b) => a.num.localeCompare(b.num)).map(st => { const p = (S.stProf || {})[st.num] || {}; const gs = Object.values(S.groups).filter(g => (g.memberNums || []).includes(st.num)).map(g => g.course).join("، ");
    return [st.num, st.name, GENDER[st.gender] || "", p.nid || "", p.dob || "", p.nat || "", p.phone || "", p.gphone || "", p.email || "", p.edu || "", p.city || "", gs]; });
  excelDownload("بيانات المتدربين", [{title: "المتدربين", rows: [[INST_AR], ["بيانات المتدربين"], [], ["الرقم الأكاديمي", "الاسم", "الجنس", "رقم الهوية", "تاريخ الميلاد", "الجنسية", "الجوال", "جوال ولي الأمر", "البريد", "المؤهل", "المدينة", "المقررات"], ...rows], widths: [13, 28, 8, 13, 12, 11, 14, 14, 24, 12, 14, 40]}]);
  logAction("تنزيل بيانات المتدربين", `${rows.length}`);
}

/* ---------- trainee ID cards: CR80 size, 8 per A4 page ---------- */
/* a neutral figure in the photo slot (no personal photos are stored) */
const ID_M = `<svg viewBox="0 0 60 72" aria-hidden="true"><rect width="60" height="72" rx="6" fill="#F4ECD6"/><circle cx="30" cy="27" r="12" fill="#C9A54C"/><path d="M8 72c2-15 11-23 22-23s20 8 22 23z" fill="#C9A54C"/></svg>`;
const ID_F = `<svg viewBox="0 0 60 72" aria-hidden="true"><rect width="60" height="72" rx="6" fill="#F4ECD6"/><path d="M30 12c-11 0-17 8-17 18v14c0 3 2 5 5 5h24c3 0 5-2 5-5V30c0-10-6-18-17-18z" fill="#B48E3A"/><circle cx="30" cy="29" r="9" fill="#F4ECD6"/><path d="M8 72c2-14 11-22 22-22s20 8 22 22z" fill="#C9A54C"/></svg>`;
async function printIdCards(nums){
  nums = nums.filter(n => S.students[n]); if (!nums.length) return toast("ما فيه متدربين");
  const w = openPrint(); if (!w) return;
  let qrcode = null; try { qrcode = await loadQR(); } catch {}
  const yr = hijriYearLabel();
  const card = num => {
    const st = S.students[num];
    let svg = ""; if (qrcode) { const q = qrcode(0, "M"); const t = (S.idTok || {})[num]; q.addData(t ? idVerifyUrl(t) : `OSOS:${num}`); q.make(); svg = q.createSvgTag({cellSize: 1, margin: 0}); }
    return `<div class="idc"><div class="top"><img src="${SITE()}logo-mark.png" alt=""><div><b>${esc(INST_AR)}</b><span>${esc(INST_EN)}</span></div></div>
      <div class="body"><div class="ph">${st.gender === "f" ? ID_F : ID_M}</div><div class="inf"><span class="tag">بطاقة ${st.gender === "f" ? "متدربة" : "متدرب"}</span><span class="nm">${esc(st.name)}</span><span class="no">الرقم التدريبي <b>${esc(num)}</b></span>${yr ? `<span class="yr">${esc(yr)}</span>` : ""}</div><div class="qr">${svg}</div><img class="wm" src="${SITE()}logo-mark.png" alt=""></div>
      <div class="strip"></div></div>`;
  };
  const pages = []; for (let i = 0; i < nums.length; i += 8) pages.push({cls: "cards", noHead: true, noFoot: true, html: `<div class="cardsGrid">${nums.slice(i, i + 8).map(card).join("")}</div>`});
  fillPrint(w, nums.length === 1 ? `بطاقة ${S.students[nums[0]].name}` : `بطاقات المتدربين (${nums.length})`, pages);
  logAction("طباعة بطاقات المتدربين", `${nums.length}`);
}

/* ---------- digital trainee ID card (student portal) ---------- */
const hijriYearLabel = () => { try { const hy = Number(new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {year: "numeric"}).format(new Date(today() + "T12:00:00")).replace(/\D/g, "")); return hy ? `العام التدريبي ${hy}-${hy + 1} هـ` : ""; } catch { return ""; } };
let _logoData = null;
async function logoDataURL(){
  if (_logoData) return _logoData;
  try { const b = await (await fetch(SITE() + "logo-mark.png")).blob(); _logoData = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); }); } catch { _logoData = ""; }
  return _logoData;
}
async function idCardSVG(st, tok){
  const num = st.num, logo = await logoDataURL();
  let qr = ""; if (tok) try { const qrcode = await loadQR(); const q = qrcode(0, "M"); q.addData(idVerifyUrl(tok)); q.make(); const n = q.getModuleCount(), cs = 190 / n; let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${(c * cs).toFixed(2)} ${(r * cs).toFixed(2)}h${cs.toFixed(2)}v${cs.toFixed(2)}h-${cs.toFixed(2)}z`;
    qr = `<g transform="translate(34 172)"><rect x="-8" y="-8" width="206" height="206" rx="10" fill="#fff"/><path d="${d}" fill="#1d2621"/></g>`; } catch {}
  const sil = (st.gender === "f" ? ID_F : ID_M).replace("<svg ", `<svg x="658" y="168" width="164" height="196" preserveAspectRatio="xMidYMid slice" `);
  const nm = st.name || "", fs = nm.length > 26 ? 26 : nm.length > 18 ? 31 : 36, F = `font-family="Tahoma, 'Segoe UI', Arial, sans-serif"`, yr = hijriYearLabel();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 540" width="856" height="540" role="img" aria-label="بطاقة ${esc(nm)}">
  <defs><clipPath id="idcc"><rect width="856" height="540" rx="30"/></clipPath><linearGradient id="idcg" x1="0" x2="1"><stop offset="0" stop-color="#C9A54C"/><stop offset=".5" stop-color="#E3C77C"/><stop offset="1" stop-color="#C9A54C"/></linearGradient><clipPath id="idcp"><rect x="658" y="168" width="164" height="196" rx="14"/></clipPath></defs>
  <g clip-path="url(#idcc)"><rect width="856" height="540" fill="#fff"/>
  ${logo ? `<image href="${logo}" x="318" y="190" width="220" height="220" opacity=".06"/>` : ""}
  <rect width="856" height="132" fill="#1F5136"/>
  <rect x="728" y="20" width="96" height="92" rx="16" fill="#fff"/>${logo ? `<image href="${logo}" x="734" y="26" width="84" height="80"/>` : ""}
  <text x="706" y="64" direction="rtl" text-anchor="start" ${F} font-size="29" font-weight="700" fill="#fff">${esc(INST_AR)}</text>
  <text x="706" y="98" direction="ltr" text-anchor="end" ${F} font-size="17" fill="#E3C77C">${esc(INST_EN)}</text>
  <g clip-path="url(#idcp)">${sil}</g><rect x="658" y="168" width="164" height="196" rx="14" fill="none" stroke="#E3C77C" stroke-width="3"/>
  <text x="626" y="200" direction="rtl" text-anchor="start" ${F} font-size="23" font-weight="700" fill="#8a6d22">بطاقة ${st.gender === "f" ? "متدربة" : "متدرب"}</text>
  <text x="626" y="250" direction="rtl" text-anchor="start" ${F} font-size="${fs}" font-weight="700" fill="#1F5136">${esc(nm)}</text>
  <text x="626" y="300" direction="rtl" text-anchor="start" ${F} font-size="21" fill="#555">الرقم التدريبي</text>
  <text x="626" y="350" direction="ltr" text-anchor="end" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="42" font-weight="700" letter-spacing="3" fill="#1d2621">${esc(num)}</text>
  ${yr ? `<text x="626" y="398" direction="rtl" text-anchor="start" ${F} font-size="20" fill="#777">${esc(yr)}</text>` : ""}
  ${qr}
  <text x="428" y="478" text-anchor="middle" ${F} font-size="17" fill="#8a9a90">${tok ? "امسح الباركود للتحقق من صلاحية البطاقة" : "بطاقة إلكترونية · تُبرز عند الطلب"}</text>
  <rect y="516" width="856" height="24" fill="url(#idcg)"/></g>
  <rect x="1" y="1" width="854" height="538" rx="29" fill="none" stroke="#c9d2cc" stroke-width="2"/></svg>`;
}
async function studentCard(el){
  const st = {...S.myStudent, num: S.myStudent.num || S.myNum};
  el.innerHTML = `<div class="card"><h2>بطاقتي</h2><p class="muted" style="margin-top:0">بطاقتك التدريبية الإلكترونية. أبرزها من جوالك عند الطلب، أو احفظها صورة.</p><div id="idcBox" class="idcBox"><div class="empty">جاري تجهيز البطاقة…</div></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="idcSave">حفظ البطاقة صورة</button><button class="btn" id="idcFull">عرض بملء الشاشة</button></div></div>`;
  const svg = await idCardSVG(st, S.myIdTok); const box = $("#idcBox"); if (!box) return; box.innerHTML = svg;
  $("#idcFull").onclick = () => { const o = document.createElement("div"); o.className = "idcFull"; o.innerHTML = svg + `<span class="muted">اضغط في أي مكان للإغلاق</span>`; o.onclick = () => o.remove(); document.body.appendChild(o); try { o.requestFullscreen && o.requestFullscreen().catch(() => {}); } catch {} };
  $("#idcSave").onclick = async () => {
    try {
      const img = new Image(); const url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"}));
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const c = document.createElement("canvas"); c.width = 1712; c.height = 1080; const x = c.getContext("2d"); x.drawImage(img, 0, 0, 1712, 1080); URL.revokeObjectURL(url);
      const blob = await new Promise(ok => c.toBlob(ok, "image/png")); const name = `بطاقة-${st.num}.png`;
      const file = new File([blob], name, {type: "image/png"});
      if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: "بطاقتي"}); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { if (e && e.name === "AbortError") return; toast("ما قدرنا نحفظ الصورة. صوّر الشاشة بدالها"); }
  };
}

/* ---------- attendance correction by academic affairs (no lock applies to them) ---------- */
function attEditor(g){
  const box = $("#aeBox"); if (!box) return;
  const ae = S._ae && S._ae.gid === g.id ? S._ae : null;
  const dates = countable(S.aReport).map(d => d.date).sort().reverse();
  box.innerHTML = `<div class="card"><h2>تعديل التحضير</h2>
    <p class="muted" style="margin-top:0">للشؤون الأكاديمية: تصحيح تحضير أي محاضرة حتى لو انقفلت على المدرب. كل تعديل ينسجل في السجل.</p>
    <div class="row"><select id="aeD" style="width:auto"><option value="">اختر محاضرة مسجلة</option>${dates.map(d => `<option value="${d}" ${ae && ae.date === d ? "selected" : ""}>${esc(fmtDate(d))}</option>`).join("")}</select>
      <span class="muted">أو تاريخ ثاني</span><input type="date" id="aeN" max="${today()}" style="width:170px" value="${ae && !dates.includes(ae.date) ? ae.date : ""}"><button class="btn sm" id="aeOpen">فتح</button></div>
    ${ae ? `${isHoliday(ae.date) ? `<div class="notice" style="margin-top:10px">هذا اليوم إجازة (${esc(isHoliday(ae.date).label || "")})، وما ينحسب في الحضور حتى لو حفظته.</div>` : ""}
      <div class="tbl" style="margin-top:10px"><table><thead><tr><th class="nm">المتدرب</th><th>الحالة</th><th>حضور</th><th>انصراف</th></tr></thead><tbody>
      ${(g.students || []).map(s => { const r = ae.rec[s.id] || {}; return `<tr><td class="nm">${esc(s.name)}</td><td><div class="seg" role="group" aria-label="الحالة">${["p", "l", "a", "e"].map(k => `<button type="button" class="${k} ${r.st === k ? "on" : ""}" data-aes="${esc(s.id)}" data-v="${k}">${STATUS[k]}</button>`).join("")}</div></td>
        <td><input type="time" data-aei="${esc(s.id)}" value="${esc(r.in || "")}" style="width:110px;padding:4px" aria-label="وقت الحضور"></td><td><input type="time" data-aeo="${esc(s.id)}" value="${esc(r.out || "")}" style="width:110px;padding:4px" aria-label="وقت الانصراف"></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="aeSave">حفظ التعديل</button><button class="btn sm" id="aeAllP">الكل حاضر</button><button class="btn sm" id="aeRest">الباقي غائب</button><button class="btn sm" id="aeClose">إغلاق</button>${ae.dirty ? `<span class="pill l">فيه تعديلات ما انحفظت</span>` : ""}</div>` : ""}</div>`;
  const open = date => { if (!date) return toast("اختر المحاضرة أو التاريخ"); const d = S.aReport.find(x => x.date === date); S._ae = {gid: g.id, date, rec: clone((d && d.rec) || {}), dirty: false}; attEditor(g); };
  $("#aeOpen").onclick = () => open($("#aeN").value || $("#aeD").value);
  $("#aeD").onchange = e => e.target.value && open(e.target.value);
  if (!ae) return;
  const mark = () => { ae.dirty = true; };
  box.querySelectorAll("[data-aes]").forEach(b => b.onclick = () => { const r = ae.rec[b.dataset.aes] = {...(ae.rec[b.dataset.aes] || {})}; r.st = r.st === b.dataset.v ? undefined : b.dataset.v; if (r.st === "a") { delete r.in; delete r.out; } if (!r.st) delete ae.rec[b.dataset.aes]; mark(); attEditor(g); });
  box.querySelectorAll("[data-aei]").forEach(x => x.onchange = () => { const r = ae.rec[x.dataset.aei] = {...(ae.rec[x.dataset.aei] || {})}; if (x.value) { r.in = x.value; if (!r.st) r.st = "p"; } else delete r.in; mark(); });
  box.querySelectorAll("[data-aeo]").forEach(x => x.onchange = () => { const r = ae.rec[x.dataset.aeo] = {...(ae.rec[x.dataset.aeo] || {})}; if (x.value) r.out = x.value; else delete r.out; mark(); });
  $("#aeAllP").onclick = () => { (g.students || []).forEach(s => { ae.rec[s.id] = {...(ae.rec[s.id] || {}), st: "p"}; }); mark(); attEditor(g); };
  $("#aeRest").onclick = () => { (g.students || []).forEach(s => { if (!ae.rec[s.id] || !ae.rec[s.id].st) ae.rec[s.id] = {st: "a"}; }); mark(); attEditor(g); };
  $("#aeClose").onclick = () => { S._ae = null; attEditor(g); };
  $("#aeSave").onclick = async () => {
    const rec = {}; Object.entries(ae.rec).forEach(([k, r]) => { const c = {}; ["st", "in", "out", "excuse"].forEach(f => { if (r[f]) c[f] = r[f]; }); if (c.st) rec[k] = c; });
    const d = {groupId: g.id, trainerId: g.trainerId || "", course: g.course, date: ae.date, rec, memberNums: g.memberNums || [], updatedAt: new Date().toISOString(), editedBy: S.adminRole};
    try { await setDoc(ref(`att/${g.id}_${ae.date}`), d); notify("att", `${g.id}_${ae.date}`); logAction("تعديل تحضير (الشؤون الأكاديمية)", `${g.course} · ${ae.date}`, "att:" + g.id + ":" + ae.date); toast("انحفظ التعديل"); S._ae = null; }
    catch (e) { handleWriteErr(e); }
  };
}



/* ---------- signatures & stamp on printed documents ---------- */
const okImg = v => typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(v);
const sgImg = k => okImg((S.sigs || {})[k]) ? `<img class="sgi" src="${S.sigs[k]}" alt="">` : "";
const stpImg = () => okImg(S.stamp) ? `<img class="stp" src="${S.stamp}" alt="">` : "";
/* a signature slot: the image sits above the dashed line, the label below */
const sigSlot = (label, k, withStamp) => `<div>${k ? sgImg(k) : ""}${withStamp ? stpImg() : ""}${label}</div>`;
/* photos of a signature or stamp on white paper become transparent PNGs, trimmed to the ink */
async function inkImage(file, maxW){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    for (const max of [maxW || 700, 520, 400, 300]) {
      const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height), px = d.data;
      let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2], a0 = px[i + 3] / 255;
        let a = Math.max(255 - r, 255 - g, 255 - b) / 255; a = Math.min(1, Math.max(0, (a - 0.06) / 0.94));
        const A = a * a0;
        if (A > 0) { for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, (px[i + c] - 255 * (1 - a)) / (a || 1))); }
        px[i + 3] = Math.round(A * 255);
        if (A > 0.1) { const p = i / 4, x = p % cv.width, y = (p / cv.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) throw new Error("empty");
      cx.putImageData(d, 0, 0);
      const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      const res = out.toDataURL("image/png"); if (res.length < 650000) return res;
    }
    throw new Error("too-big");
  } finally { URL.revokeObjectURL(url); }
}
/* one upload card per signature, shown only to whoever owns it */
function sigCard(k, title, note){
  const v = k === "stamp" ? S.stamp : (S.sigs || {})[k];
  return `<div class="card"><h2>${title}</h2><p class="muted" style="margin-top:0">${note} صوّره على ورقة بيضاء، والبوابة تشيل الخلفية لحالها.</p>
    <div class="row">${okImg(v) ? `<img src="${v}" alt="${title}" style="max-width:200px;max-height:110px;object-fit:contain;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/14px 14px;border:1px solid var(--line);border-radius:10px;padding:6px">` : `<span class="muted">ما انرفع للحين</span>`}
    <label class="btn sm" style="cursor:pointer">${okImg(v) ? "تغيير" : "رفع"}<input type="file" accept="image/*" data-sigup="${k}" hidden></label>${okImg(v) ? `<button class="btn sm danger" data-sigdel="${k}">حذف</button>` : ""}</div></div>`;
}
function bindSigCards(root){
  const save = async (k, img) => { await setDoc(ref(k === "stamp" ? "public/stamp" : "sigs/" + k), {img, at: new Date().toISOString()}); if (k === "stamp") S.stamp = img; else S.sigs[k] = img; };
  root.querySelectorAll("[data-sigup]").forEach(inp => inp.onchange = async () => {
    const k = inp.dataset.sigup, f = inp.files[0]; if (!f) return;
    try { toast("جاري تجهيز الصورة…"); await save(k, await inkImage(f, k === "stamp" ? 600 : 700)); logAction(k === "stamp" ? "الختم الإلكتروني" : "التوقيع الإلكتروني", k); toast("انحفظ"); inp.value = ""; render(); }
    catch (e) { inp.value = ""; e && e.message === "too-big" ? toast("الصورة كبيرة، جرّب أصغر") : e && e.message === "empty" ? toast("ما لقيت توقيع في الصورة") : handleWriteErr(e); }
  });
  root.querySelectorAll("[data-sigdel]").forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } try { await save(b.dataset.sigdel, ""); logAction("حذف توقيع", b.dataset.sigdel); render(); } catch (e) { handleWriteErr(e); } });
}


/* ---------- signature requests: academic affairs / finance send a document, the administration signs, stamps and returns it ---------- */
const ADMIN_EMAIL = "admin@" + DOMAIN;
const SR_ST = {pending: "بانتظار الإدارة", signed: "موقّع ومختوم", rejected: "مرفوض"};
const SR_PILL = {pending: "l", signed: "p", rejected: "a"};
let _pdfLib = null;
const loadPdfLib = () => _pdfLib || (_pdfLib = new Promise((ok, no) => { if (window.PDFLib) return ok(window.PDFLib); const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"; sc.onload = () => ok(window.PDFLib); sc.onerror = no; document.head.appendChild(sc); }));
const fileToDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
const myMarks = () => { const r = S.adminRole; return r === "admin" ? [["director", "توقيع مدير المعهد"], ["stamp", "الختم"]] : r === "academic" ? [["academic", "توقيعي (الشؤون الأكاديمية)"]] : r === "finance" ? [["finance", "توقيعي (المالية)"]] : []; };
const markImg = k => k === "stamp" ? S.stamp : (S.sigs || {})[k];
/* draw the chosen marks onto the document: images on a canvas, PDFs with pdf-lib on the last page */
async function applyMarks(data, marks){
  if (/^data:application\/pdf/.test(data)) {
    const L = await loadPdfLib();
    const doc = await L.PDFDocument.load(Uint8Array.from(atob(data.split(",")[1]), c => c.charCodeAt(0)));
    const page = doc.getPages()[doc.getPageCount() - 1], {width, height} = page.getSize();
    for (const m of marks) {
      const png = await doc.embedPng(markImg(m.k)), w = width * m.w, h = w * png.height / png.width;
      page.drawImage(png, {x: width * m.x - w / 2, y: height * (1 - m.y) - h / 2, width: w, height: h, rotate: L.degrees(m.k === "stamp" ? 8 : 0), opacity: m.k === "stamp" ? 0.9 : 1});
    }
    const b64 = await doc.saveAsBase64();
    if (b64.length > 980000) throw new Error("too-big");
    return "data:application/pdf;base64," + b64;
  }
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = data; });
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0);
  for (const m of marks) {
    const mk = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = markImg(m.k); });
    const w = cv.width * m.w, h = w * mk.height / mk.width;
    cx.save(); cx.translate(cv.width * m.x, cv.height * m.y); if (m.k === "stamp") { cx.rotate(-8 * Math.PI / 180); cx.globalAlpha = 0.9; }
    cx.drawImage(mk, -w / 2, -h / 2, w, h); cx.restore();
  }
  for (const q of [0.85, 0.75, 0.6, 0.5]) { const out = cv.toDataURL("image/jpeg", q); if (out.length < 900000) return out; }
  throw new Error("too-big");
}
/* the placing screen: click on the document to put each mark; PDFs get preset spots on the last page */
function placeMarks(title, data, onDone){
  const isPdf = /^data:application\/pdf/.test(data), avail = myMarks().filter(([k]) => okImg(markImg(k)));
  const marks = []; let cur = avail[0] && avail[0][0];
  S._modalGroup = null; S._finModal = null;
  const draw = () => {
    $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">${esc(title)}</h2><button class="btn sm" id="pmx">إلغاء</button></div>
      ${avail.length ? `<div class="row"><span class="muted">اختر:</span>${avail.map(([k, l]) => `<button class="btn sm ${cur === k ? "pri" : ""}" data-mk="${k}">${l}</button>`).join("")}<input type="range" id="pmW" min="8" max="40" value="${cur === "stamp" ? 18 : 22}" aria-label="الحجم" style="width:120px"><span class="muted">الحجم</span></div>
      <p class="muted" style="margin:0">${isPdf ? "اضغط مكان من الأماكن تحت، ويتحط على آخر صفحة في الملف." : "اضغط على المكان في المستند اللي تبي يتحط فيه."}</p>` : `<div class="notice err">ما رفعت توقيعك أو الختم للحين. ارفعه من «النظام»${S.adminRole === "finance" ? " أو «الإعدادات» في المالية" : ""}.</div>`}
      ${isPdf ? `<div class="pdfPos">${[["أعلى يمين", .8, .12], ["أعلى يسار", .2, .12], ["وسط", .5, .5], ["أسفل يمين", .8, .86], ["أسفل الوسط", .5, .86], ["أسفل يسار", .2, .86]].map(([l, x, y]) => `<button class="btn sm" data-px="${x}" data-py="${y}">${l}</button>`).join("")}</div>
        <p class="muted">${marks.length ? marks.map(m => `${(avail.find(a => a[0] === m.k) || [, ""])[1]}: ${m.label}`).join(" · ") : "ما فيه شي محطوط"}</p>`
        : `<div class="pmWrap" id="pmWrap"><img src="${data}" alt="المستند" id="pmImg">${marks.map((m, i) => `<img class="pmMark" src="${markImg(m.k)}" alt="" style="left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;${m.k === "stamp" ? "transform:translate(-50%,-50%) rotate(-8deg)" : ""}" data-mi="${i}">`).join("")}</div>`}
      <div class="row">${marks.length ? `<button class="btn sm" id="pmUndo">تراجع</button>` : ""}<button class="btn gold" id="pmOk" ${marks.length ? "" : "disabled"}>اعتماد</button></div>`;
    $("#pmx").onclick = () => { closeModal(); onDone(null); };
    $("#modalBox").querySelectorAll("[data-mk]").forEach(b => b.onclick = () => { cur = b.dataset.mk; draw(); });
    const width = () => Number(($("#pmW") || {}).value || 20) / 100;
    if ($("#pmImg")) $("#pmImg").onclick = e => { if (!cur) return; const r = e.target.getBoundingClientRect(); marks.push({k: cur, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: width()}); draw(); };
    $("#modalBox").querySelectorAll("[data-px]").forEach(b => b.onclick = () => { if (!cur) return; marks.push({k: cur, x: Number(b.dataset.px), y: Number(b.dataset.py), w: width() * 0.8, label: b.textContent}); draw(); });
    if ($("#pmUndo")) $("#pmUndo").onclick = () => { marks.pop(); draw(); };
    $("#pmOk").onclick = async () => { const b = $("#pmOk"); b.disabled = true; b.textContent = "جاري التجهيز…"; try { const out = await applyMarks(data, marks); closeModal(); onDone(out); } catch (e) { console.error(e); b.disabled = false; b.textContent = "اعتماد"; toast(e && e.message === "too-big" ? "الملف كبير بعد التوقيع" : "تعذّر تجهيز الملف"); } };
  };
  $("#modal").classList.add("on"); draw();
}
const openData = (data, name) => { const a = document.createElement("a"); a.href = data; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
function signRequests(el){
  const admin = S.adminRole === "admin";
  if (!S.signReqs) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`;
    const q = admin ? collection(db, "signReqs") : query(collection(db, "signReqs"), where("byEmail", "==", S.authUser.email));
    S.subs.push(onSnapshot(q, snap => { S.signReqs = snap.docs.map(d => ({id: d.id, ...d.data()})); if (!busyEditing()) render(); }, e => { console.error(e); el.innerHTML = `<div class="notice err">تعذّر التحميل، تأكد من تحديث قواعد Firebase.</div>`; }));
    return;
  }
  const f = S.srF || (admin ? "pending" : "all");
  const list = S.signReqs.filter(r => f === "all" || r.status === f).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  el.innerHTML = `${admin ? "" : `<div class="card"><h2>إرسال مستند للتوقيع والختم</h2>
    <p class="muted" style="margin-top:0">خطاب أو عقد أو أي مستند يحتاج توقيع مدير المعهد والختم. ترفقه هنا، وتقدر تحط توقيعك عليه أول، ويوصل لبوابة الإدارة. لما توقّعه الإدارة وتختمه يرجع لك هنا جاهز للتنزيل.</p>
    <div class="row"><input type="text" id="srT" class="grow" placeholder="عنوان المستند، مثل: خطاب تعريف للمتدربة لجين" maxlength="120"></div>
    <div class="row" style="margin-top:8px"><label class="f grow" for="srF">المستند (صورة أو PDF، حتى 15 ميجا)<input type="file" id="srF" accept="image/*,application/pdf"></label></div>${ATT_NOTE}
    <label class="f" for="srN" style="margin-top:8px">ملاحظة للإدارة (اختياري)<input type="text" id="srN" maxlength="300"></label>
    <div class="row" style="margin-top:8px"><button class="btn gold" id="srSend">التالي: أحط توقيعي وأرسل</button><button class="btn sm" id="srSend2">أرسل بدون توقيعي</button></div></div>`}
  <div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${[["pending", "بانتظار الإدارة"], ["signed", "موقّعة"], ["rejected", "مرفوضة"], ["all", "الكل"]].map(([k, v]) => `<button class="tab ${f === k ? "on" : ""}" data-srf="${k}">${v} (${k === "all" ? S.signReqs.length : S.signReqs.filter(r => r.status === k).length})</button>`).join("")}</div></div>
  <div class="list">${list.map(r => `<div class="item"><div class="grow"><div class="t">${esc(r.title)} <span class="pill ${SR_PILL[r.status]}">${SR_ST[r.status]}</span></div>
      <div class="muted">${admin ? `من ${esc(ROLES[r.from] || r.from)} · ` : ""}${esc((r.at || "").slice(0, 10))}${r.note ? " · " + esc(r.note) : ""}${r.reason ? " · سبب الرفض: " + esc(r.reason) : ""}</div></div>
      <button class="btn sm" data-srv="${esc(r.id)}">المستند</button>
      ${r.status === "signed" ? `<button class="btn sm gold" data-srd="${esc(r.id)}">تنزيل الموقّع</button>` : ""}
      ${admin && r.status === "pending" ? `<button class="btn sm pri" data-srs="${esc(r.id)}">توقيع وختم</button><button class="btn sm danger" data-srr="${esc(r.id)}">رفض</button>` : ""}
      ${!admin && r.status !== "signed" ? `<button class="btn sm danger" data-srx="${esc(r.id)}">حذف</button>` : ""}</div>`).join("") || `<div class="card empty">ما فيه طلبات</div>`}</div>`;
  el.querySelectorAll("[data-srf]").forEach(b => b.onclick = () => { S.srF = b.dataset.srf; render(); });
  const getFile = async id => { const x = await getDoc(ref("signFiles/" + id)); return x.exists() ? srvData(x.data().data) : null; };
  const ext = d => /^data:application\/pdf/.test(d) ? "pdf" : "jpg";
  el.querySelectorAll("[data-srv]").forEach(b => b.onclick = async () => { const r = S.signReqs.find(x => x.id === b.dataset.srv); try { const d = await getFile(r.id); if (d) openData(d, `${r.title}.${ext(d)}`); else toast(r.filesArchived ? "الملف مؤرشف — موجود في نسخة المرفقات عند الإدارة العامة" : "الملف غير موجود"); } catch (e) { handleWriteErr(e); } });
  el.querySelectorAll("[data-srd]").forEach(b => b.onclick = async () => { const r = S.signReqs.find(x => x.id === b.dataset.srd); try { const d = await getFile(r.id + "_signed"); if (d) openData(d, `${r.title} - موقّع.${ext(d)}`); else toast(r.filesArchived ? "الملف مؤرشف — موجود في نسخة المرفقات عند الإدارة العامة" : "الملف غير موجود"); } catch (e) { handleWriteErr(e); } });
  el.querySelectorAll("[data-srx]").forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } const bt = writeBatch(db); bt.delete(ref("signReqs/" + b.dataset.srx)); bt.delete(ref("signFiles/" + b.dataset.srx)); try { await bt.commit(); } catch (e) { handleWriteErr(e); } });
  el.querySelectorAll("[data-srr]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.insertAdjacentHTML("beforebegin", `<input type="text" id="srRR" placeholder="سبب الرفض" style="width:160px">`); b.textContent = "تأكيد الرفض"; return; }
    const reason = (($("#srRR") || {}).value || "").trim(); if (!reason) return toast("اكتب سبب الرفض");
    try { await setDoc(ref("signReqs/" + b.dataset.srr), {status: "rejected", reason, doneAt: new Date().toISOString()}, {merge: true}); notify("sign", b.dataset.srr); logAction("رفض طلب توقيع", reason); } catch (e) { handleWriteErr(e); }
  });
  el.querySelectorAll("[data-srs]").forEach(b => b.onclick = async () => {
    const r = S.signReqs.find(x => x.id === b.dataset.srs); let d;
    try { d = await getFile(r.id); } catch (e) { return handleWriteErr(e); }
    if (!d) return toast("الملف غير موجود");
    placeMarks(`توقيع وختم: ${r.title}`, d, async out => {
      if (!out) return;
      const bt = writeBatch(db);
      let kept; try { kept = await keepData(out, r.title + " - موقّع.pdf"); } catch (e) { console.error(e); return toast("ما قدرنا نحفظ الملف الموقّع على سيرفر المعهد، حاول مرة ثانية", 1); }
      bt.set(ref("signFiles/" + r.id + "_signed"), {reqId: r.id, data: kept});
      bt.set(ref("signReqs/" + r.id), {status: "signed", doneAt: new Date().toISOString()}, {merge: true});
      try { await bt.commit(); notify("sign", r.id); logAction("توقيع وختم مستند", r.title); toast("انوقّع ورجع للمرسل"); } catch (e) { handleWriteErr(e); }
    });
  });
  const send = async withMine => {
    const title = $("#srT").value.trim(), file = $("#srF").files[0];
    if (!title) return toast("اكتب عنوان المستند"); if (!file) return toast("اختر المستند");
    let data;
    try {
      if (file.type === "application/pdf") { if (file.size > 15 * 1024 ** 2) return toast("ملف PDF كبير، لازم أقل من 15 ميجا"); data = await fileToDataURL(file); }
      else data = await compressImage(file);
    } catch { return toast("تعذّر قراءة الملف"); }
    const note = $("#srN").value.trim();
    const go = async doc => {
      if (!doc) return;
      const id = "sr-" + uid() + uid(), bt = writeBatch(db);
      bt.set(ref("signReqs/" + id), {title, note, from: S.adminRole, byEmail: S.authUser.email, status: "pending", at: new Date().toISOString()});
      let kept; try { kept = await keepData(doc, title + ".pdf"); } catch (e) { console.error(e); return toast("ما قدرنا نرفع الملف لسيرفر المعهد، حاول مرة ثانية", 1); }
      bt.set(ref("signFiles/" + id), {reqId: id, data: kept});
      try { await bt.commit(); notify("sign", id); logAction("طلب توقيع", title); toast("انرسل للإدارة"); render(); } catch (e) { handleWriteErr(e); }
    };
    if (withMine) placeMarks(`توقيعك على: ${title}`, data, go); else go(data);
  };
  if ($("#srSend")) { $("#srSend").onclick = () => send(true); $("#srSend2").onclick = () => send(false); }
}

/* ---------- short courses: participants, pass marks, certificates sent by WhatsApp ---------- */
function adminCourses(el){
  if (!S.courses) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`;
    S.subs.push(onSnapshot(collection(db, "courses"), snap => { S.courses = {}; snap.docs.forEach(d => S.courses[d.id] = {id: d.id, ...d.data()}); if (S.aTab === "courses" && !busyEditing()) { render(); if (S._crsOpen && $("#modal").classList.contains("on")) openCourse(S._crsOpen); } }, e => { console.error(e); el.innerHTML = `<div class="notice err">تعذّر التحميل، تأكد من تحديث قواعد Firebase.</div>`; }));
    return;
  }
  const list = Object.values(S.courses).sort((a, b) => (b.from || "").localeCompare(a.from || ""));
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">الدورات والشهادات</h2><button class="btn gold sm" id="crNew">+ دورة جديدة</button></div>
    <p class="muted" style="margin:8px 0 0">دورات قصيرة وورش عمل لها شهادة حضور خاصة: تحدد الدورة ومدتها، وتضيف المشاركين، وبعد ما تخلص تعلّم على المجتازين وتصدر لهم شهادات مختومة وترسلها بالواتساب.${S.stamp ? "" : ` <b>ارفع الختم الإلكتروني من «النظام» عشان يظهر على الشهادات.</b>`}</p></div>
  <div class="list">${list.map(c => { const ps = c.participants || [], pass = ps.filter(p => p.passed).length, iss = ps.filter(p => p.cert).length;
    return `<div class="item"><div class="grow"><div class="t">${esc(c.title)}</div><div class="muted">${c.from ? dH(c.from) : ""}${c.to && c.to !== c.from ? " ← " + dH(c.to) : ""}${c.hours ? ` · ${esc(c.hours)} ساعة` : ""}${c.trainer ? ` · ${esc(c.trainer)}` : ""}</div></div>
      <span class="pill">${ps.length} مشارك</span><span class="pill p">${pass} مجتاز</span>${iss ? `<span class="pill e">${iss} شهادة</span>` : ""}<button class="btn sm" data-cro="${esc(c.id)}">فتح</button></div>`; }).join("") || `<div class="card empty">ما فيه دورات بعد.</div>`}</div>`;
  $("#crNew").onclick = () => openCourse(null);
  el.querySelectorAll("[data-cro]").forEach(b => b.onclick = () => openCourse(b.dataset.cro));
}
const certMsg = (p, c, code) => `مبروك ${p.name}\n${p.gender === "f" ? "أتممتِ" : "أتممت"} دورة «${c.title}» في ${INST_AR}.\n\nشهادتك جاهزة، تقدر تعرضها وتطبعها من الرابط:\n${verifyUrl(code)}\n\nرمز التحقق: ${code}`;
function openCourse(id){
  const c = id ? clone(S.courses[id]) : {title: "", hours: "", from: today(), to: today(), trainer: "", place: "", participants: []};
  S._crsOpen = id; S._modalGroup = null; S._finModal = null;
  const save = async (msg, quiet) => {
    const d = {...c}; delete d.id;
    const nid = id || "c-" + uid() + uid();
    try { await setDoc(ref("courses/" + nid), d); if (!id) { id = nid; S._crsOpen = nid; } S.courses[nid] = {id: nid, ...d}; if (msg) logAction(msg, c.title); if (!quiet) toast("انحفظ"); draw(); return true; }
    catch (e) { handleWriteErr(e); return false; }
  };
  const draw = () => {
    const ps = c.participants || [];
    const studs = Object.values(S.students).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">${id ? esc(c.title) : "دورة جديدة"}</h2><button class="btn sm" id="crx">إغلاق</button></div>
    <div class="card" style="background:var(--bg)"><h3>بيانات الدورة</h3>
      <label class="f" for="crT">اسم الدورة<input type="text" id="crT" value="${esc(c.title)}" placeholder="مثل: مهارات كتابة العقود"></label>
      <div class="row" style="margin-top:8px">
        <label class="f" for="crF" style="width:160px">من<input type="date" id="crF" value="${esc(c.from || "")}"></label>
        <label class="f" for="crTo" style="width:160px">إلى<input type="date" id="crTo" value="${esc(c.to || "")}"></label>
        <label class="f" for="crH" style="width:120px">عدد الساعات<input type="number" id="crH" min="1" value="${esc(c.hours || "")}"></label>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="f grow" for="crTr">المدرب/ة<input type="text" id="crTr" list="crTrL" value="${esc(c.trainer || "")}"><datalist id="crTrL">${Object.values(S.trainers).map(t => `<option value="${esc(trainerTitle(t))}">`).join("")}</datalist></label>
        <label class="f grow" for="crP">المكان<input type="text" id="crP" value="${esc(c.place || "")}" placeholder="قاعة 1 / عن بُعد"></label>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn pri sm" id="crSave">حفظ البيانات</button>${id ? `<button class="btn sm danger" id="crDel">حذف الدورة</button>` : ""}</div></div>
    ${id ? `<div class="card" style="background:var(--bg)"><h3>إضافة مشاركين</h3>
      <div class="row"><input type="text" id="crS" list="crSL" class="grow" placeholder="اكتب اسم متدرب أو رقمه"><datalist id="crSL">${studs.map(s => `<option value="${esc(s.num)} · ${esc(s.name)}">`).join("")}</datalist><button class="btn sm" id="crSAdd">+ إضافة</button></div>
      <div class="row" style="margin-top:8px"><select id="crG" class="grow"><option value="">أو أضف كل طلاب مقرر…</option>${sortedGroups().map(g => `<option value="${esc(g.id)}">${esc(g.course)} · ${esc(tName(g.trainerId))} (${(g.memberNums || []).length})</option>`).join("")}</select><button class="btn sm" id="crGAdd">إضافة الكل</button></div>
      <div class="row" style="margin-top:8px"><input type="text" id="crXN" class="grow" placeholder="مشارك من خارج المعهد: الاسم الكامل"><select id="crXG" style="width:auto"><option value="m">ذكر</option><option value="f">أنثى</option></select><input type="tel" id="crXP" dir="ltr" placeholder="05xxxxxxxx" style="width:140px"><button class="btn sm" id="crXAdd">+ إضافة</button></div></div>
    <div><div class="row" style="justify-content:space-between"><h3 style="margin:0">المشاركين (${ps.length})</h3><div class="row"><button class="btn sm" id="crAllP">الكل مجتاز</button><button class="btn gold sm" id="crIssue">إصدار شهادات المجتازين (${ps.filter(p => p.passed && !p.cert).length})</button>${ps.some(p => p.cert) ? `<button class="btn sm" id="crPrint">طباعة كل الشهادات</button>` : ""}</div></div>
      <div class="list" style="margin-top:8px">${ps.map((p, i) => `<div class="item" style="padding:8px 12px"><label class="row" style="gap:6px;cursor:pointer" for="crp-${i}"><input type="checkbox" id="crp-${i}" data-pass="${i}" ${p.passed ? "checked" : ""} ${p.cert ? "disabled" : ""}> مجتاز</label>
        <div class="grow"><b>${esc(p.name)}</b> <span class="pill ${p.gender}">${GENDER[p.gender] || ""}</span><div class="muted">${p.num ? esc(p.num) : "من خارج المعهد"}${p.phone ? ` · <span dir="ltr">${esc(p.phone)}</span>` : ` · <span style="color:var(--abs)">بدون جوال</span>`}${p.cert ? ` · شهادة ${esc(p.cert)}` : ""}${p.sent ? " · أُرسلت" : ""}</div></div>
        ${p.cert && p.phone ? `<a class="btn sm gold" target="_blank" rel="noopener" data-send="${i}" href="https://wa.me/${normPhone(p.phone)}?text=${encodeURIComponent(certMsg(p, c, p.cert))}">إرسال بالواتساب</a>` : ""}
        ${p.cert ? `<button class="btn sm" data-cp="${i}">الشهادة</button>` : `<button class="btn sm danger" data-prm="${i}">حذف</button>`}</div>`).join("") || `<span class="muted">ما فيه مشاركين</span>`}</div>
      ${ps.some(p => p.cert) ? `<p class="muted">الواتساب يفتح رسالة جاهزة فيها رابط الشهادة لكل مشارك، تضغط إرسال. المتدرب المسجّل في المعهد يلقى الشهادة بعد في «شهاداتي» ببوابة الطلاب.</p>` : ""}</div>` : `<p class="muted">احفظ بيانات الدورة أول، وبعدها تضيف المشاركين.</p>`}`;
    $("#modal").classList.add("on");
    $("#crx").onclick = () => { S._crsOpen = null; closeModal(); };
    const readHead = () => { c.title = $("#crT").value.trim(); c.from = $("#crF").value; c.to = $("#crTo").value || c.from; c.hours = $("#crH").value.trim(); c.trainer = $("#crTr").value.trim(); c.place = $("#crP").value.trim(); };
    $("#crSave").onclick = () => { readHead(); if (!c.title) return toast("اكتب اسم الدورة"); if (c.to && c.from && c.to < c.from) return toast("تاريخ النهاية قبل البداية"); save(id ? "تعديل دورة" : "دورة جديدة"); };
    if ($("#crDel")) $("#crDel").onclick = async () => { const b = $("#crDel"); if ((c.participants || []).some(p => p.cert)) return toast("الدورة فيها شهادات صادرة. ألغِ الشهادات أول أو خلّها"); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } try { await deleteDoc(ref("courses/" + id)); delete S.courses[id]; logAction("حذف دورة", c.title); S._crsOpen = null; closeModal(); } catch (e) { handleWriteErr(e); } };
    if (!id) return;
    const has = p => (c.participants || []).some(x => (p.num && x.num === p.num) || (!p.num && !x.num && norm(x.name) === norm(p.name)));
    const addStudent = num => { const st = S.students[num]; if (!st) return false; const p = {pid: "p" + uid(), num, name: st.name, gender: st.gender, phone: (S.stPhones || {})[num] || "", passed: false}; if (has(p)) return false; c.participants = [...(c.participants || []), p]; return true; };
    $("#crSAdd").onclick = () => { const v = $("#crS").value.trim(), num = (v.match(/\d{8}/) || [])[0] || (Object.values(S.students).find(s => norm(s.name) === norm(v)) || {}).num; if (!num || !S.students[num]) return toast("ما لقيت المتدرب، اختره من القائمة"); if (!addStudent(num)) return toast("مضاف من قبل"); save("إضافة مشارك لدورة", true); };
    $("#crGAdd").onclick = () => { const g = S.groups[$("#crG").value]; if (!g) return toast("اختر المقرر"); let n = 0; (g.memberNums || []).forEach(num => { if (addStudent(num)) n++; }); if (!n) return toast("كلهم مضافين"); save(`إضافة ${n} مشارك لدورة`, true); };
    $("#crXAdd").onclick = () => { const name = $("#crXN").value.trim().replace(/\s+/g, " "), ph = $("#crXP").value.trim() ? normPhone($("#crXP").value) : ""; if (name.split(" ").length < 2) return toast("اكتب الاسم الكامل"); if (ph && !/^9665\d{8}$/.test(ph)) return toast("رقم الجوال غير صحيح"); const p = {pid: "p" + uid(), num: "", name, gender: $("#crXG").value, phone: ph, passed: false}; if (has(p)) return toast("مضاف من قبل"); c.participants = [...(c.participants || []), p]; save("إضافة مشارك خارجي لدورة", true); };
    $("#modalBox").querySelectorAll("[data-pass]").forEach(x => x.onchange = () => { c.participants[Number(x.dataset.pass)].passed = x.checked; save("", true); });
    $("#modalBox").querySelectorAll("[data-prm]").forEach(b => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } c.participants.splice(Number(b.dataset.prm), 1); save("حذف مشارك من دورة", true); });
    $("#crAllP").onclick = () => { c.participants.forEach(p => { if (!p.cert) p.passed = true; }); save("", true); };
    $("#modalBox").querySelectorAll("[data-send]").forEach(a => a.addEventListener("click", () => { const p = c.participants[Number(a.dataset.send)]; if (!p.sent) { p.sent = true; save("إرسال شهادة دورة", true); } }));
    const certOf = p => ({code: p.cert, kind: "course", key: `${id}_${p.pid}`, courseId: id, num: p.num || "", name: p.name, gender: p.gender, course: c.title, hours: c.hours || "", from: c.from || "", to: c.to || "", trainer: c.trainer || "", date: p.certDate || today(), issuedBy: S.adminRole, revoked: false});
    $("#modalBox").querySelectorAll("[data-cp]").forEach(b => b.onclick = () => printCerts([certOf(c.participants[Number(b.dataset.cp)])]));
    if ($("#crPrint")) $("#crPrint").onclick = () => printCerts(c.participants.filter(p => p.cert).map(certOf));
    $("#crIssue").onclick = async () => {
      readHead();
      const todo = c.participants.filter(p => p.passed && !p.cert); if (!todo.length) return toast("علّم على المجتازين أول");
      if (!c.title) return toast("اكتب اسم الدورة واحفظها");
      const b = writeBatch(db);
      todo.forEach(p => { p.cert = certCode(); p.certDate = today(); b.set(ref("certs/" + p.cert), certOf(p)); });
      const d = {...c}; delete d.id; b.set(ref("courses/" + id), d);
      try { await b.commit(); S.courses[id] = {id, ...d}; todo.forEach(p => notify("cert", p.cert)); logAction("إصدار شهادات دورة", `${c.title} · ${todo.length}`); toast(`انصدرت ${todo.length} شهادة. أرسلها بالواتساب أو اطبعها`); draw(); }
      catch (e) { todo.forEach(p => { delete p.cert; delete p.certDate; }); handleWriteErr(e); }
    };
  };
  draw();
}

/* ---------- audit log tab ---------- */
function adminLogs(el){
  S.logLimit = S.logLimit || 300;
  if (!S.unsubLogs) {
    S.unsubLogs = onSnapshot(query(collection(db, "logs"), orderBy("at", "desc"), limit(S.logLimit)), snap => {
      S.logs = snap.docs.map(d => d.data()); S.logsFull = snap.size < S.logLimit; if (S.view === "admin" && S.aTab === "logs" && !busyEditing()) render();
    }, e => { console.error(e); toast("تعذّر تحميل السجل، تأكد من تحديث قواعد Firebase"); });
  }
  const fmtAt = t => { try { return t.toDate().toLocaleString("ar-SA-u-ca-gregory-nu-latn", {timeZone: TZ, dateStyle: "medium", timeStyle: "short"}); } catch { return "…"; } };
  el.innerHTML = `<div class="card"><h2>سجل العمليات</h2>
    <p class="muted" style="margin-top:0">كل العمليات محفوظة: مين سوّاها، ووش، ومتى. السجل ما ينحذف ولا ينعدّل. يعرض هنا آخر ${S.logLimit} عملية، وتقدر تعرض الأقدم أو تنزّل السجل كامل.</p>
    <div class="row"><input type="text" id="lq" class="grow" placeholder="ابحث باسم أو عملية أو مقرر"><button class="btn sm" id="lAll">تنزيل السجل كامل Excel</button></div></div>
    <div class="tbl"><table><thead><tr><th>الوقت</th><th class="nm">مين</th><th class="nm">العملية</th><th class="nm">التفاصيل</th></tr></thead><tbody id="lbody"></tbody></table></div>`;
  const draw = q => {
    q = norm(q || "");
    const rows = S.logs.filter(l => !q || norm(`${l.who} ${l.action} ${l.details}`).includes(q));
    $("#lbody").innerHTML = rows.map(l => `<tr><td>${esc(fmtAt(l.at))}</td><td class="nm">${esc(l.who)}</td><td class="nm">${esc(l.action)}</td><td class="nm" style="white-space:normal">${esc(l.details)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">ما فيه عمليات بعد</td></tr>`;
  };
  draw(""); $("#lq").oninput = e => draw(e.target.value);
  if (!S.logsFull && (S.logs || []).length >= S.logLimit) el.insertAdjacentHTML("beforeend", `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="lMore">عرض ${300} عملية أقدم</button></div>`);
  if ($("#lMore")) $("#lMore").onclick = () => { S.logLimit += 300; if (S.unsubLogs) { S.unsubLogs(); S.unsubLogs = null; } render(); };
  $("#lAll").onclick = async e => {
    e.target.disabled = true; toast("جاري تجهيز السجل…");
    try {
      const snap = await getDocs(query(collection(db, "logs"), orderBy("at", "desc")));
      const rows = [["الوقت", "مين", "الصفة", "العملية", "التفاصيل"], ...snap.docs.map(d => { const l = d.data(); return [fmtAt(l.at), l.who || "", l.role || "", l.action || "", l.details || ""]; })];
      await excelDownload(`سجل العمليات ${today()}`, [{title: "سجل العمليات", rows, widths: [22, 26, 12, 26, 60]}]);
      logAction("تنزيل سجل العمليات", `${snap.size} عملية`);
    } catch (x) { console.error(x); toast("تعذّر تنزيل السجل"); }
    e.target.disabled = false;
  };
}

/* ---------- owner's portal: tasks to the departments and the weekly report ----------
   The owner (the oversight account) sends a task to one department. Only that department, the general administration
   and the owner see it. The department reports back (text + an optional file); the owner approves it or returns it. */
const TASK_TO = {admin: "الإدارة العامة", academic: "الشؤون الأكاديمية", finance: "المالية", admission: "القبول والتسجيل وخدمة العملاء", business: "الشراكات وقطاع الشركات", hr: "الموارد البشرية"};
const TASK_ST = {new: "جديدة", seen: "قيد التنفيذ", done: "منجزة · بانتظار اعتماد الجهة الرقابية", returned: "معادة للاستكمال", closed: "معتمدة ✓"};
const TASK_PILL = {new: "l", seen: "", done: "l", returned: "a", closed: "p"};
const TASK_MAX = 760 * 1024;
function watchTasks(){
  if (S._taskSub || !S.authUser || S.role !== "admin" || !S.adminRole) return; S._taskSub = true;
  const q = RO() || S.adminRole === "admin" ? collection(db, "tasks") : query(collection(db, "tasks"), where("to", "==", S.adminRole));
  S.subs.push(onSnapshot(q, snap => { S.tasks = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))); if (!busyEditing()) render(); }, e => console.error(e)));
  S.subs.push(() => { S._taskSub = false; S.tasks = null; S.weeks = null; });
}
const taskLate = t => t.due && t.due < today() && !["done", "closed"].includes(t.status);
const myTasks = () => (S.tasks || []).filter(t => t.to === S.adminRole);
const taskBadge = () => { const n = RO() ? (S.tasks || []).filter(t => t.status === "done").length : myTasks().filter(t => ["new", "returned"].includes(t.status)).length; return n ? ` (${n})` : ""; };
const fmtIso = s => { try { return s ? new Date(s).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit"}) : ""; } catch { return ""; } };
async function taskFilePut(tid, side, f){
  if (!f) return null;
  if (f.size > SRV_MAX || (f.size > TASK_MAX && !(S.site || {}).pushUrl)) throw new Error("big");
  const meta = {name: f.name.slice(0, 120), type: f.type || "application/octet-stream", size: f.size, at: new Date().toISOString()};
  const data = f.size > SRV_FROM ? await srvPut(f, meta.name, meta.type) : await fileToDataURL(f);
  await setDoc(ref(`taskFiles/${tid}_${side}`), {tid, side, ...meta, data, at: new Date().toISOString()});
  return meta;
}
async function taskFileOpen(tid, side){
  try {
    const s = await getDoc(ref(`taskFiles/${tid}_${side}`)); if (!s.exists()) return toast("الملف مو موجود");
    const x = s.data(); if (isSrv(x.data)) return srvOpen(x.data);
    const a = document.createElement("a"); a.href = x.data; a.download = x.name || "file"; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { console.error(e); toast("تعذّر فتح الملف"); }
}
function taskCard(t, mode){   // mode: owner | dept | view
  const late = taskLate(t), fileBtn = (side, f) => f && f.archived ? `<span class="pill" title="انحذف من النظام وهو محفوظ في نسخة المرفقات عند الإدارة">📦 ${esc(f.name)} · مؤرشف</span>` : f ? `<button class="btn sm" data-tfile="${esc(t.id)}|${side}">📎 ${esc(f.name)}${f.size ? ` <span class="muted">(${Math.max(1, Math.round(f.size / 1024))} ك.ب)</span>` : ""}</button>` : "";
  const canWork = mode === "dept" && t.status !== "closed";
  return `<div class="card" style="margin-bottom:10px;${t.pri === "high" ? "border-inline-start:4px solid var(--abs)" : ""}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
      <div class="grow" style="min-width:200px"><b>${t.pri === "high" ? "🔴 " : ""}${esc(t.title)}</b>
        <div class="muted">${mode === "dept" ? "من الجهة الرقابية" : "إلى " + esc(TASK_TO[t.to] || t.to)} · ${esc(fmtIso(t.at))}${t.due ? ` · التسليم <span style="${late ? "color:var(--abs);font-weight:600" : ""}">${esc(t.due)}${late ? " (متأخرة)" : ""}</span>` : ""}</div></div>
      <span class="pill ${TASK_PILL[t.status] || ""}">${esc(TASK_ST[t.status] || t.status)}</span></div>
    ${t.body ? `<p style="white-space:pre-wrap;margin:8px 0">${esc(t.body)}</p>` : ""}${fileBtn("o", t.ofile)}
    ${t.status === "returned" && t.note ? `<div class="notice err" style="margin-top:8px">ملاحظة الجهة الرقابية: ${esc(t.note)}</div>` : ""}
    ${t.report || t.rfile ? `<div style="margin-top:10px;padding:10px;border-radius:10px;background:var(--soft, #f4f6f4)"><b>تقرير الإدارة</b>${t.doneAt ? ` <span class="muted">· ${esc(fmtIso(t.doneAt))}${t.doneBy ? " · " + esc(t.doneBy) : ""}</span>` : ""}
      ${t.report ? `<p style="white-space:pre-wrap;margin:6px 0">${esc(t.report)}</p>` : ""}${fileBtn("r", t.rfile)}</div>` : ""}
    ${mode === "owner" ? `<div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
      ${t.status === "done" ? `<button class="btn sm pri" data-tok="${esc(t.id)}">اعتماد</button><button class="btn sm" data-tret="${esc(t.id)}">إعادة للاستكمال</button>` : ""}
      ${t.status === "closed" ? `<button class="btn sm" data-tret="${esc(t.id)}">إعادة فتحها</button>` : ""}
      <span class="grow"></span><button class="btn sm danger" data-tdel="${esc(t.id)}">حذف</button></div>` : ""}
    ${canWork ? `<div style="margin-top:10px"><label class="f" for="trp-${esc(t.id)}">${t.status === "done" ? "تعديل التقرير" : "تقرير الإنجاز"}<textarea id="trp-${esc(t.id)}" rows="3" maxlength="5000" placeholder="وش سويتوا، والنتيجة…">${esc(t.report || "")}</textarea></label>
      <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><input type="file" id="trf-${esc(t.id)}" style="max-width:260px"><span class="muted">ملف اختياري (PDF أو صورة أو Excel) حتى 20 ميجا</span><span class="grow"></span>
      <button class="btn pri" data-tdone="${esc(t.id)}">${t.status === "done" ? "تحديث التقرير" : "تسليم: المهمة خلصت"}</button></div>${ATT_NOTE}</div>` : ""}
  </div>`;
}
function bindTaskCards(el){
  el.querySelectorAll("[data-tfile]").forEach(b => b.onclick = () => { const [id, side] = b.dataset.tfile.split("|"); taskFileOpen(id, side); });
  el.querySelectorAll("[data-tok]").forEach(b => b.onclick = async () => {
    b.disabled = true; try { await setDoc(ref("tasks/" + b.dataset.tok), {status: "closed", closedAt: new Date().toISOString()}, {merge: true}); notify("task", b.dataset.tok); toast("اعتمدت المهمة"); } catch (e) { console.error(e); toast("تعذّر الحفظ"); b.disabled = false; }
  });
  el.querySelectorAll("[data-tret]").forEach(b => b.onclick = async () => {
    const note = prompt("وش الناقص؟ (يظهر للإدارة)"); if (note === null) return;
    try { await setDoc(ref("tasks/" + b.dataset.tret), {status: "returned", note: note.trim().slice(0, 600), returnedAt: new Date().toISOString()}, {merge: true}); notify("task", b.dataset.tret); toast("رجعت المهمة للإدارة"); } catch (e) { console.error(e); toast("تعذّر الحفظ"); }
  });
  el.querySelectorAll("[data-tdel]").forEach(b => b.onclick = async () => {
    if (!confirm("حذف المهمة نهائياً؟")) return;
    try { await deleteDoc(ref("tasks/" + b.dataset.tdel)); deleteDoc(ref(`taskFiles/${b.dataset.tdel}_o`)).catch(() => {}); deleteDoc(ref(`taskFiles/${b.dataset.tdel}_r`)).catch(() => {}); toast("انحذفت"); } catch (e) { console.error(e); toast("تعذّر الحذف"); }
  });
  el.querySelectorAll("[data-tdone]").forEach(b => b.onclick = async () => {
    const id = b.dataset.tdone, t = (S.tasks || []).find(x => x.id === id); if (!t) return;
    const report = $("#trp-" + id).value.trim(), f = $("#trf-" + id).files[0];
    if (!report && !f && !t.rfile) return toast("اكتب التقرير أو ارفع ملف");
    b.disabled = true;
    try {
      const rfile = f ? await taskFilePut(id, "r", f) : (t.rfile || null);
      await setDoc(ref("tasks/" + id), {status: "done", report, rfile, doneAt: new Date().toISOString(), doneBy: (ROLES[S.adminRole] || S.adminRole)}, {merge: true});
      logAction("تسليم مهمة من الجهة الرقابية", t.title); notify("task", id); toast("تسلّمت المهمة ✓ ووصلت للجهة الرقابية");
    } catch (e) { console.error(e); toast(e.message === "big" ? "الملف أكبر من 20 ميجا" : "تعذّر التسليم: " + (e.detail || e.message || "")); b.disabled = false; }
  });
}
function tasksTab(el){
  if (!S.tasks) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  if (RO()) return ownerTasks(el);
  const mine = myTasks();
  // opening the list tells the owner the department has seen its new tasks
  mine.filter(t => t.status === "new").forEach(t => setDoc(ref("tasks/" + t.id), {status: "seen", seenAt: new Date().toISOString()}, {merge: true}).catch(() => {}));
  const open = mine.filter(t => t.status !== "closed"), done = mine.filter(t => t.status === "closed");
  el.innerHTML = `<div class="card"><h2>مهام الجهة الرقابية</h2><p class="muted" style="margin:0">المهام اللي ترسلها الجهة الرقابية لإدارتك. ما يشوفها غيرك وغير الإدارة العامة والجهة الرقابية. لما تخلص المهمة اكتب التقرير وارفع الملف إن وجد واضغط «تسليم».</p></div>
    ${open.map(t => taskCard(t, "dept")).join("") || `<div class="card empty">ما عندك مهام مفتوحة 👍</div>`}
    ${done.length ? `<details class="card"><summary><b>المعتمدة (${done.length})</b></summary><div style="margin-top:10px">${done.map(t => taskCard(t, "view")).join("")}</div></details>` : ""}
    ${S.adminRole === "admin" ? `<details class="card"><summary><b>كل مهام الإدارات (اطلاع) · ${(S.tasks || []).filter(t => t.to !== "admin").length}</b></summary><div style="margin-top:10px">${(S.tasks || []).filter(t => t.to !== "admin").map(t => taskCard(t, "view")).join("") || `<p class="muted">ما فيه.</p>`}</div></details>` : ""}`;
  bindTaskCards(el);
}
function ownerTasks(el){
  const all = S.tasks || [], fD = S.tkD || "", fS = S.tkS || "open";
  const list = all.filter(t => (!fD || t.to === fD) && (fS === "all" || (fS === "open" ? !["closed"].includes(t.status) : fS === "late" ? taskLate(t) : t.status === fS)));
  const cnt = k => all.filter(t => t.status === k).length;
  el.innerHTML = `<div class="card"><h2>مهمة جديدة لإدارة</h2>
      <p class="muted" style="margin-top:0">توصل للإدارة المختارة بس (والإدارة العامة تطّلع). تجيها إشعار، وترد عليك بتقرير وملف.</p>
      <div class="row"><label class="f grow" for="tkTo">الإدارة<select id="tkTo">${Object.entries(TASK_TO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
        <label class="f" for="tkDue" style="width:170px">موعد التسليم<input type="date" id="tkDue" min="${today()}"></label>
        <label class="f" for="tkPri" style="width:130px">الأولوية<select id="tkPri"><option value="normal">عادية</option><option value="high">عاجلة</option></select></label></div>
      <label class="f" for="tkT">عنوان المهمة<input type="text" id="tkT" maxlength="150" placeholder="مثال: تقرير بالطلاب المتأخرين في السداد"></label>
      <label class="f" for="tkB">التفاصيل<textarea id="tkB" rows="4" maxlength="3000" placeholder="وش المطلوب بالضبط…"></textarea></label>
      <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap"><input type="file" id="tkF" style="max-width:260px"><span class="muted">مرفق اختياري حتى 20 ميجا</span><span class="grow"></span><button class="btn pri" id="tkSend">إرسال المهمة</button></div>${ATT_NOTE}</div>
    <div class="card"><div class="stats">
      <div class="stat"><div class="n">${all.filter(t => t.status !== "closed").length}</div><div class="l">مفتوحة</div></div>
      <div class="stat"><div class="n" style="color:var(--late, #b7791f)">${cnt("done")}</div><div class="l">بانتظار اعتمادك</div></div>
      <div class="stat"><div class="n" style="color:var(--abs)">${all.filter(taskLate).length}</div><div class="l">متأخرة</div></div>
      <div class="stat"><div class="n">${cnt("closed")}</div><div class="l">معتمدة</div></div></div>
      <div class="row" style="margin-top:10px;gap:8px"><select id="tkfD" style="width:auto"><option value="">كل الإدارات</option>${Object.entries(TASK_TO).map(([k, v]) => `<option value="${k}" ${fD === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
        <select id="tkfS" style="width:auto">${[["open", "المفتوحة"], ["done", "بانتظار اعتمادي"], ["late", "المتأخرة"], ["closed", "المعتمدة"], ["all", "الكل"]].map(([k, v]) => `<option value="${k}" ${fS === k ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
    ${list.map(t => taskCard(t, "owner")).join("") || `<div class="card empty">ما فيه مهام هنا.</div>`}`;
  $("#tkfD").onchange = e => { S.tkD = e.target.value; render(); };
  $("#tkfS").onchange = e => { S.tkS = e.target.value; render(); };
  $("#tkSend").onclick = async e => {
    const title = $("#tkT").value.trim(); if (!title) return toast("اكتب عنوان المهمة");
    const f = $("#tkF").files[0]; if (f && f.size > SRV_MAX) return toast("المرفق أكبر من 20 ميجا");
    e.target.disabled = true;
    const id = "t-" + uid() + uid();
    try {
      await setDoc(ref("tasks/" + id), {to: $("#tkTo").value, title, body: $("#tkB").value.trim(), due: $("#tkDue").value || "", pri: $("#tkPri").value, status: "new", at: new Date().toISOString(), by: "owner"});
      if (f) { const ofile = await taskFilePut(id, "o", f); await setDoc(ref("tasks/" + id), {ofile}, {merge: true}); }
      notify("task", id); toast("انرسلت المهمة ✓"); $("#tkT").value = ""; $("#tkB").value = ""; $("#tkF").value = "";
    } catch (x) { console.error(x); toast(x.code === "permission-denied" ? "ما فيه صلاحية — حدّث قواعد Firebase" : "تعذّر الإرسال"); }
    e.target.disabled = false;
  };
  bindTaskCards(el);
}

/* ---------- attachments shared between departments (task reports, signing files): kept until the director archives them ----------
   Everyone is told to keep their own copy of anything important after 30 days. When the files start weighing on the system,
   the director downloads one ZIP with all of them (and an index), then deletes them from the system. */
const ATT_NOTE = `<p class="muted" style="margin:4px 0 0;font-size:.85em">📌 المرفقات تبقى في النظام 30 يوم كحد أدنى، وبعدها ممكن تنأرشف وتنحذف من النظام. لو الملف مهم نزّل نسخة عندك.</p>`;
function crc32(b){
  const t = crc32.t || (crc32.t = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  let x = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) x = t[(x ^ b[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files){   // plain (stored) ZIP, UTF-8 names: opens on Windows, Mac and phones
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) {
    const n = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30)); [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [12, 0x21, 2], [14, crc, 4], [18, sz, 4], [22, sz, 4], [26, n.length, 2]].forEach(([o, v, w]) => w === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    parts.push(h, n, f.data);
    const c = new DataView(new ArrayBuffer(46)); [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [14, 0x21, 2], [16, crc, 4], [20, sz, 4], [24, sz, 4], [28, n.length, 2], [42, off, 4]].forEach(([o, v, w]) => w === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    cen.push(c, n); off += 30 + n.length + sz;
  }
  const cs = cen.reduce((a, x) => a + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, e], {type: "application/zip"});
}
const dataBytes = d => { const b = atob(String(d).split(",")[1] || ""); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const dataExt = d => { const m = /^data:([^;,]+)/.exec(d || ""); const t = m ? m[1] : ""; return t === "application/pdf" ? "pdf" : t.startsWith("image/") ? t.slice(6).replace("jpeg", "jpg") : ""; };
const safeName = s => String(s || "ملف").replace(/[\\/:*?"<>|\n\r]/g, "-").slice(0, 80).trim() || "ملف";
async function archCollect(days){
  const cut = days ? new Date(Date.now() - days * 864e5).toISOString() : "9999";
  const out = [];   // {kind, label, dept, date, path, fname, done}
  (S.tasks || []).forEach(t => ["o", "r"].forEach(side => { const f = side === "o" ? t.ofile : t.rfile; if (!f || f.archived) return;
    const date = f.at || (side === "r" ? t.doneAt : t.at) || t.at || ""; if (date >= cut) return;
    out.push({kind: "مهمة", dept: TASK_TO[t.to] || t.to, label: `${t.title} — ${side === "o" ? "مرفق الجهة الرقابية" : "تقرير الإدارة"}`, date, path: `taskFiles/${t.id}_${side}`, fname: f.name, task: t.id, side}); }));
  try {
    const snap = await getDocs(collection(db, "signReqs"));
    snap.docs.forEach(d => { const r = {id: d.id, ...d.data()}; if (r.filesArchived || r.status === "pending" || (r.at || "") >= cut) return;
      out.push({kind: "طلب توقيع", dept: ROLES[r.from] || r.from || "", label: r.title, date: r.at, path: "signFiles/" + r.id, fname: r.title, sign: r.id});
      if (r.status === "signed") out.push({kind: "طلب توقيع", dept: ROLES[r.from] || r.from || "", label: r.title + " — الموقّع", date: r.at, path: `signFiles/${r.id}_signed`, fname: r.title + " - موقّع", sign: r.id}); });
  } catch (e) { console.error(e); }
  return out;
}
function attArchiveCard(el){
  if (S.adminRole !== "admin") return;
  el.insertAdjacentHTML("beforeend", `<div class="card" id="archCard"><h2>أرشفة المرفقات بين الإدارات</h2>
    <p class="muted" style="margin-top:0">تقارير المهام ومرفقاتها وملفات طلبات التوقيع محفوظة داخل النظام. لما تحس إنها صارت تثقّل النظام: نزّلها كلها في ملف ZIP واحد (مع فهرس)، وبعدها احذفها من النظام. المهام والطلبات نفسها تبقى، وجنبها علامة «مؤرشف».</p>
    <div class="row" style="align-items:end;gap:8px"><label class="f" for="arD" style="width:200px">المرفقات الأقدم من<select id="arD"><option value="30">30 يوم</option><option value="60">60 يوم</option><option value="90">90 يوم</option><option value="0">الكل</option></select></label>
      <button class="btn" id="arScan">احسب</button><button class="btn pri" id="arZip" disabled>1) تنزيل نسخة ZIP</button><button class="btn danger" id="arDel" disabled>2) حذفها من النظام</button></div>
    <div id="arOut" class="muted" style="margin-top:8px"></div></div>`);
  let items = [], loaded = [];
  const out = $("#arOut");
  $("#arScan").onclick = async () => {
    out.textContent = "جاري الحساب…"; items = await archCollect(Number($("#arD").value)); loaded = [];
    out.textContent = items.length ? `${items.length} مرفق: ${items.filter(x => x.task).length} من المهام و${items.filter(x => x.sign).length} من طلبات التوقيع.` : "ما فيه مرفقات بهذا العمر.";
    $("#arZip").disabled = !items.length; $("#arDel").disabled = true;
  };
  $("#arD").onchange = () => { items = []; loaded = []; $("#arZip").disabled = $("#arDel").disabled = true; out.textContent = ""; };
  $("#arZip").onclick = async e => {
    e.target.disabled = true; const files = [], rows = [["النوع", "الإدارة", "العنوان", "التاريخ", "اسم الملف في الأرشيف"]]; loaded = []; let total = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; out.textContent = `جاري تجهيز ${i + 1} من ${items.length}…`;
      try { const s = await getDoc(ref(it.path)); if (!s.exists()) { loaded.push(it); continue; }
        const d = await srvData(s.data().data), bytes = dataBytes(d), ext = (it.fname.match(/\.[a-z0-9]{2,5}$/i) ? "" : dataExt(d)), name = `${String(i + 1).padStart(3, "0")} - ${safeName(it.dept)} - ${safeName(it.fname)}${ext ? "." + ext : ""}`;
        files.push({name: name, data: bytes}); total += bytes.length; rows.push([it.kind, it.dept, it.label, (it.date || "").slice(0, 10), name]); loaded.push(it);
      } catch (x) { console.error(x); }
    }
    const csv = "﻿" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    files.unshift({name: "000 - الفهرس.csv", data: new TextEncoder().encode(csv)});
    const a = document.createElement("a"); a.href = URL.createObjectURL(makeZip(files)); a.download = `مرفقات-أسس-${today()}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    out.innerHTML = `نزل الملف: ${files.length - 1} مرفق (${fmtSize(total) || "أقل من 1 ميغا"}). <b>افتح الملف وتأكد إنه سليم واحفظه في مكان آمن</b>، وبعدها اضغط «حذفها من النظام».`;
    e.target.disabled = false; $("#arDel").disabled = !loaded.length;
  };
  $("#arDel").onclick = async e => {
    if (!loaded.length || !confirm(`تأكدت إن ملف ZIP محفوظ عندك؟\nبيتحذف ${loaded.length} مرفق من النظام نهائياً.`)) return;
    e.target.disabled = true; out.textContent = "جاري الحذف…";
    try {
      const ops = []; const now = new Date().toISOString(), signs = new Set();
      loaded.forEach(it => { ops.push(b => b.delete(ref(it.path)));
        if (it.task) { const t = (S.tasks || []).find(x => x.id === it.task), k = it.side === "o" ? "ofile" : "rfile"; if (t && t[k]) ops.push(b => b.set(ref("tasks/" + it.task), {[k]: {...t[k], archived: true, archivedAt: now}}, {merge: true})); }
        if (it.sign) signs.add(it.sign); });
      signs.forEach(id => ops.push(b => b.set(ref("signReqs/" + id), {filesArchived: true, archivedAt: now}, {merge: true})));
      for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach(f => f(b)); await b.commit(); }
      logAction("أرشفة مرفقات الإدارات", `${loaded.length} مرفق`); out.textContent = `انحذف ${loaded.length} مرفق من النظام ✓`; items = []; loaded = []; $("#arZip").disabled = true;
    } catch (x) { console.error(x); out.textContent = "تعذّر الحذف — حدّث قواعد Firebase وجرّب مرة ثانية"; e.target.disabled = false; }
  };
}

/* the weekly report (built by the push service every Thursday evening, or now on request) */
async function weeklyTab(el){
  if (!S.weeks) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`;
    try { const snap = await getDocs(collection(db, "weekly")); S.weeks = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => b.id.localeCompare(a.id)); }
    catch (e) { console.error(e); S.weeks = []; }
    if (S.aTab === "weekly") render(); return;
  }
  const W = S.weeks, w = W.find(x => x.id === S.wkSel) || W[0];
  const n0 = v => Number(v || 0).toLocaleString("en-US");
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">التقرير الأسبوعي</h2>
      <div class="row" style="gap:6px">${W.length ? `<select id="wkSel" style="width:auto">${W.map(x => `<option value="${esc(x.id)}" ${w && x.id === w.id ? "selected" : ""}>${esc(x.from)} → ${esc(x.to)}</option>`).join("")}</select>` : ""}
        <button class="btn sm" id="wkNow">إنشاء تقرير الحين</button>${w ? `<button class="btn sm" id="wkX">Excel</button><button class="btn sm" id="wkP">طباعة</button>` : ""}</div></div>
      <p class="muted" style="margin:6px 0 0">ينسحب تلقائياً كل خميس الساعة 8 مساءً: كل اللي سوّته الإدارات خلال الأسبوع، ويوصلك إشعار.</p></div>
    ${!w ? `<div class="card empty">للحين ما انعمل تقرير. أول واحد يجي الخميس، أو اضغط «إنشاء تقرير الحين».</div>` : `<div id="wkBody">
    <div class="card"><h3 style="margin-top:0">الأسبوع ${esc(w.from)} → ${esc(w.to)}</h3><div class="stats">
      <div class="stat"><div class="n">${n0(w.total)}</div><div class="l">عملية للإدارات</div></div>
      <div class="stat"><div class="n">${n0((w.tasks || {}).sent)}</div><div class="l">مهام انرسلت</div></div>
      <div class="stat"><div class="n">${n0((w.tasks || {}).done)}</div><div class="l">مهام انسلّمت</div></div>
      <div class="stat"><div class="n" style="color:var(--abs)">${n0((w.tasks || {}).late)}</div><div class="l">مهام متأخرة</div></div>
      <div class="stat"><div class="n">${n0((w.att || {}).lectures)}</div><div class="l">محاضرة تحضّرت</div></div>
      <div class="stat"><div class="n">${n0((w.att || {}).a)}</div><div class="l">غياب طلاب</div></div>
      <div class="stat"><div class="n">${SAR((w.fin || {}).collected)}</div><div class="l">محصّل (${n0((w.fin || {}).payments)} دفعة)</div></div>
      <div class="stat"><div class="n">${SAR((w.fin || {}).expenses)}</div><div class="l">مصروفات</div></div>
      <div class="stat"><div class="n">${n0((w.reqs || {}).acNew)}</div><div class="l">طلبات أكاديمية (${n0((w.reqs || {}).acDone)} انرد)</div></div>
      <div class="stat"><div class="n">${n0((w.reqs || {}).finNew)}</div><div class="l">طلبات مالية</div></div></div>
      ${(w.fin || {}).voided ? `<p class="muted" style="margin:8px 0 0">⚠️ ${n0(w.fin.voided)} دفعة/مصروف انلغت هذا الأسبوع.</p>` : ""}</div>
    ${Object.values((w.tasks || {}).byDept || {}).some(d => d.late) ? `<div class="card"><h3 style="margin-top:0">مهام متأخرة</h3>${Object.values(w.tasks.byDept).filter(d => d.late).map(d => `<p style="margin:4px 0"><b>${esc(d.name)}</b>: ${d.lateList.map(x => `${esc(x.title)} <span class="muted">(${esc(x.due)})</span>`).join("، ")}</p>`).join("")}</div>` : ""}
    ${(w.depts || []).map(d => `<details class="card"><summary><b>${esc(d.name)}</b> · ${n0(d.n)} عملية${d.who && d.who.length ? ` <span class="muted">· ${d.who.slice(0, 3).map(x => esc(x.k)).join("، ")}</span>` : ""}</summary>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin:10px 0">${(d.kinds || []).map(k => `<span class="pill">${esc(k.k)} · ${k.n}</span>`).join("")}</div>
      <div class="tbl"><table><thead><tr><th>الوقت</th><th class="nm">مين</th><th class="nm">العملية</th><th class="nm">التفاصيل</th></tr></thead><tbody>${(d.last || []).map(l => `<tr><td>${esc(fmtIso(l.at))}</td><td class="nm">${esc(l.who)}</td><td class="nm">${esc(l.action)}</td><td class="nm" style="white-space:normal">${esc(l.details)}</td></tr>`).join("")}</tbody></table></div>
      ${d.n > (d.last || []).length ? `<p class="muted">يعرض آخر ${(d.last || []).length}. الباقي في «سجل الإدارات».</p>` : ""}</details>`).join("") || `<div class="card empty">ما فيه عمليات مسجّلة هذا الأسبوع.</div>`}</div>`}`;
  if ($("#wkSel")) $("#wkSel").onchange = e => { S.wkSel = e.target.value; render(); };
  $("#wkNow").onclick = async e => {
    const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) return toast("رابط خدمة الإشعارات غير مضبوط");
    e.target.disabled = true; toast("جاري تجهيز التقرير…");
    try { const r = await fetch(url + "/weekly", {method: "POST", headers: {authorization: "Bearer " + await S.authUser.getIdToken()}}); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 404 ? "old" : j.error || "x"); S.weeks = null; S.wkSel = j.id; render(); toast("جاهز ✓"); }
    catch (x) { console.error(x); toast(x.message === "old" ? "حدّث worker في Cloudflare لآخر نسخة" : "تعذّر إنشاء التقرير"); e.target.disabled = false; }
  };
  if (!w) return;
  $("#wkP").onclick = () => { const p = openPrint(); if (!p) return; p.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>التقرير الأسبوعي ${esc(w.to)}</title><style>body{font-family:system-ui,Tahoma;padding:20px}details{display:block}summary{font-size:1.1em;margin:14px 0 6px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ccc;padding:4px}.stats{display:flex;flex-wrap:wrap;gap:10px}.stat{border:1px solid #ddd;border-radius:8px;padding:8px;min-width:120px}.n{font-size:1.3em;font-weight:700}.pill{display:inline-block;border:1px solid #ccc;border-radius:20px;padding:2px 8px;margin:2px;font-size:12px}</style></head><body><h1>معهد أسس — التقرير الأسبوعي</h1>${$("#wkBody").innerHTML.replace(/<details/g, "<details open")}</body></html>`); p.document.close(); setTimeout(() => p.print(), 400); };
  $("#wkX").onclick = async () => {
    const rows = [["الإدارة", "الوقت", "مين", "العملية", "التفاصيل"]]; (w.depts || []).forEach(d => (d.last || []).forEach(l => rows.push([d.name, fmtIso(l.at), l.who, l.action, l.details])));
    const sum = [["البند", "القيمة"], ["الفترة", `${w.from} → ${w.to}`], ["عمليات الإدارات", w.total], ...(w.depts || []).map(d => ["  " + d.name, d.n]), ["مهام انرسلت", (w.tasks || {}).sent], ["مهام انسلّمت", (w.tasks || {}).done], ["مهام متأخرة", (w.tasks || {}).late], ["محاضرات تحضّرت", (w.att || {}).lectures], ["حضور", (w.att || {}).p], ["تأخير", (w.att || {}).l], ["غياب", (w.att || {}).a], ["المحصّل", (w.fin || {}).collected], ["المصروفات", (w.fin || {}).expenses], ["طلبات أكاديمية", (w.reqs || {}).acNew], ["طلبات مالية", (w.reqs || {}).finNew]];
    try { await excelDownload(`التقرير الأسبوعي ${w.to}`, [{title: "الملخص", rows: sum, widths: [28, 24]}, {title: "عمليات الإدارات", rows, widths: [22, 20, 24, 26, 60]}]); } catch (e) { console.error(e); toast("تعذّر التنزيل"); }
  };
}
/* the owner reads everything: in sections built for staff, anything that would change data is hidden */
function ownerReadOnly(el){
  if (!RO() || !el) return;
  el.querySelectorAll("textarea, input[type=text], input[type=number], input[type=tel], input[type=time], input[type=file], input[type=checkbox]").forEach(x => { if (!/ابحث|بحث/.test(x.placeholder || "")) x.disabled = true; });
  el.querySelectorAll("button, label.btn").forEach(b => { if (b.closest(".tabs") || b.dataset.tfile) return;
    if (!/تنزيل|Excel|طباعة|PDF|عرض|تفاصيل|فتح|إغلاق|السابق|التالي|أقدم|كشف|📎/.test(b.textContent || "")) b.style.display = "none"; });
}

async function setDisabled(coll, id, on, name){
  const b = writeBatch(db);
  b.set(ref(`${coll}/${id}`), {disabled: on}, {merge: true});
  b.set(ref("public/disabled"), {list: {[id]: on}}, {merge: true});
  try { await b.commit(); S.disabled = {...(S.disabled || {}), [id]: on}; logAction(on ? "تعطيل حساب" : "تفعيل حساب", `${name || ""} · ${id}`); toast(on ? "انوقف الحساب، وما يقدر يدخل لين تفعّله" : "رجع الحساب يشتغل"); render(); }
  catch (e) { handleWriteErr(e); }
}

/* ---------- backup ---------- */
const ALL_COLLS = ["public", "ann", "trainers", "groups", "students", "secrets", "studentSecrets", "att", "grades", "results", "joins", "excuses", "warnings", "evals", "certs", "idcards", "archives", "logs", "surveys", "fin", "finAccounts", "payments", "salaryPays", "expenses", "commPays", "finClear", "receipts", "courses", "finReqs", "sigs", "signReqs", "signFiles", "waivers", "acReqs", "memos", "live",
  "exams", "examQs", "examKeys", "examSubs", "msgs", "msgReads", "tasks", "taskFiles", "weekly", "trMsgs", "staffReqs", "staffReqFiles", "camp", "campLab", "labCfg", "studentDocs",
  "hrStaff", "hrAtt", "hrLeaves", "hrNotices", "hrCfg", "hrPayroll", "coffeePub", "coffeeReqs"];
// kept in the backup for the record, but brought back only by the people who wrote them (their own security rules)
const NO_RESTORE = ["logs", "weekly", "msgReads", "tasks", "taskFiles", "trMsgs", "staffReqs", "staffReqFiles", "examSubs", "coffeeReqs"];
const APPEND_ONLY = ["payments", "expenses", "commPays"];   // money records are never deleted or rewritten: a restore only brings back missing ones
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);   // the audit log is append-only; a restore never rewrites it
const toPlain = v => v && typeof v.toDate === "function" && "seconds" in v ? {__ts: v.toDate().toISOString()} : Array.isArray(v) ? v.map(toPlain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)])) : v;
const fromPlain = v => v && typeof v === "object" && !Array.isArray(v) && (typeof v.__ts === "string" || (typeof v.seconds === "number" && typeof v.nanoseconds === "number" && Object.keys(v).length <= 3)) ? (typeof v.__ts === "string" ? Timestamp.fromDate(new Date(v.__ts)) : new Timestamp(v.seconds, v.nanoseconds)) : Array.isArray(v) ? v.map(fromPlain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromPlain(x)])) : v;
/* storage estimate: measured for free from each full backup taken by general administration */
const QUOTA_BYTES = 1024 ** 3;
function saveUsage(out, total){
  if (S.adminRole !== "admin" || ["students", "att", "payments", "receipts"].some(c => !out.data[c])) return;   // partial backup (another role) would under-count
  const by = {}, docs = {};
  ALL_COLLS.forEach(c => { const d = out.data[c] || {}; by[c] = new Blob([JSON.stringify(d)]).size; docs[c] = Object.keys(d).length; });
  S.usage = {at: out.at, bytes: total, by, docs};
  setDoc(ref("public/usage"), S.usage).catch(() => {});
}
function loadUsage(){
  if (S.usage !== undefined) return;
  S.usage = null;
  getDoc(ref("public/usage")).then(x => { if (x.exists()) S.usage = x.data(); if (S.view === "admin" && !busyEditing()) render(); }).catch(() => {});
}
/* general administration gets a reminder when the last full backup is more than a week old */
/* automatic weekly backups (made by the push service every Friday, stored on the classroom server) */
function loadAutoBk(force){
  if (S.adminRole !== "admin" || (S._autoBkLoading && !force) || (S.autoBk && !force)) return;
  S._autoBkLoading = true;
  getDocs(collection(db, "backups")).then(sn => { S.autoBk = sn.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => String(b.at).localeCompare(String(a.at))); if (S.view === "admin" && !busyEditing()) render(); })
    .catch(() => { S.autoBk = []; }).finally(() => { S._autoBkLoading = false; });
}
const pushApi = async (path, body) => { const url = ((S.site || {}).pushUrl || "").replace(/\/+$/, ""); if (!url) throw new Error("no service");
  const r = await fetch(url + path, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + await S.authUser.getIdToken()}, body: JSON.stringify(body || {})});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || "failed"), {status: r.status, detail: j.detail || ""}); return j; };
function autoBkHTML(){
  loadAutoBk(); const L = S.autoBk || [];
  return `<h3 style="margin-top:18px">النسخ التلقائية</h3><p class="muted" style="margin-top:0">كل <b>جمعة الساعة 9 الصبح</b> تنحفظ نسخة كاملة لحالها على سيرفر القاعة (بدون صور الإيصالات والمرفقات)، وتبقى آخر 8 نسخ. لو فشلت يوصلك إشعار. نزّل نسخة كاملة يدوية (الزر فوق) مرة في الشهر بعد.</p>
    <div class="list">${L.slice(0, 8).map(b => `<div class="item"><span class="grow">${esc(fmtIso(b.at))} <span class="muted">· ${b.docs || 0} سجل · ${fmtSize(b.size) || Math.max(1, Math.round((b.size || 0) / 1024)) + " ك.ب"}${b.by && b.by !== "auto" ? " · يدوية" : ""}</span></span><button class="btn sm" data-abk="${esc(b.rid)}">تنزيل</button></div>`).join("") || `<div class="empty">للحين ما انعملت نسخة تلقائية.</div>`}</div>
    <button class="btn sm" id="abkNow" style="margin-top:8px">احفظ نسخة على السيرفر الحين</button>`;
}
function bindAutoBk(el){
  el.querySelectorAll("[data-abk]").forEach(b => b.onclick = async () => { b.disabled = true;
    try { const j = await pushApi("/backup", {action: "get", rid: b.dataset.abk}); const a = document.createElement("a"); a.href = j.url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { toast(e.status === 404 ? "حدّث worker في Cloudflare لآخر نسخة" : "تعذّر التنزيل"); } b.disabled = false; });
  if ($("#abkNow")) $("#abkNow").onclick = async e => { e.target.disabled = true; toast("جاري حفظ النسخة… (دقيقة تقريباً)");
    try { await pushApi("/backup", {action: "now"}); loadAutoBk(true); toast("انحفظت النسخة على السيرفر ✓"); logAction("نسخة احتياطية على السيرفر", ""); }
    catch (x) { toast(x.status === 404 ? "حدّث worker في Cloudflare لآخر نسخة" : x.status === 503 ? "مفتاح سيرفر القاعة ناقص في Cloudflare" : "تعذّر الحفظ: " + (x.detail || x.message), 1); e.target.disabled = false; } };
}
/* Firebase free daily quota (reads 50k, writes 20k): read from Google's monitoring by the push service */
function loadQuota(force){
  if (!["admin", "academic", "auditor"].includes(S.adminRole) || !(S.site || {}).pushUrl) return;
  if (!force && S._quota && Date.now() - S._quota.t < 15 * 60000) return;
  if (S._quotaBusy) return; S._quotaBusy = true;
  pushApi("/usage").then(j => { S._quota = {t: Date.now(), ...j}; }).catch(e => { S._quota = {t: Date.now(), error: e.status === 404 ? "old" : "failed"}; })
    .finally(() => { S._quotaBusy = false; if (S.view === "admin" && !busyEditing()) render(); });
}
function quotaCard(){
  loadQuota(); const q = S._quota; if (!q) return "";
  if (q.error) return `<div class="card"><h2>حد Firebase اليومي</h2><p class="muted" style="margin:0">${q.error === "permission" ? `لقراءة الاستخدام: ادخل <b>console.cloud.google.com</b> ← مشروع <b>osostl-attendance</b> ← <b>IAM</b> ← حساب الخدمة اللي ينتهي بـ <span dir="ltr">firebase-adminsdk…</span> ← ✏️ ← <b>Add role</b> ← <b>Monitoring Viewer</b> ← Save. بعدها حدّث الصفحة.` : q.error === "old" ? "حدّث worker في Cloudflare لآخر نسخة عشان يظهر الاستخدام." : "تعذّر قراءة الاستخدام الحين."}</p></div>`;
  const col = v => v >= 85 ? "#c0392b" : v >= 65 ? "#d68910" : "#1e8449";
  const bar = (label, n, max, pct) => `<div style="margin:8px 0"><div class="row" style="justify-content:space-between"><span>${label}</span><b style="color:${col(pct)}">${Number(n || 0).toLocaleString("en-US")} من ${max.toLocaleString("en-US")} · ${pct}%</b></div><div style="height:8px;background:var(--line);border-radius:6px;overflow:hidden;margin-top:4px"><div style="width:${Math.min(100, Math.max(1, pct))}%;height:100%;background:${col(pct)}"></div></div></div>`;
  const reset = new Date(q.resetAt).toLocaleTimeString("ar-SA-u-nu-latn", {timeZone: TZ, hour: "numeric", minute: "2-digit"});
  return `<div class="card"><h2>حد Firebase اليومي (المجاني)</h2>
    ${Math.max(q.readPct, q.writePct) >= 80 ? `<div class="notice err">قرّب الحد يخلص اليوم. لو خلص توقف البوابة لين يتجدد الساعة ${esc(reset)}. خفّف فتح الصفحات الثقيلة (التقارير والكشوف) لين يتجدد.</div>` : ""}
    ${bar("القراءة", q.read, 50000, q.readPct)}${bar("الكتابة", q.write, 20000, q.writePct)}${bar("الحذف", q["delete"], 20000, q.deletePct)}
    <p class="muted" style="margin:6px 0 0">يتجدد كل يوم الساعة ${esc(reset)} (منتصف الليل بتوقيت جوجل). إذا وصل 80% يوصل الإدارة العامة إشعار. الأرقام تتأخر دقائق.</p></div>`;
}
function quotaNag(){ if (S.adminRole !== "admin") return ""; loadQuota(); const q = S._quota; return q && !q.error && Math.max(q.readPct, q.writePct) >= 80 ? `<div class="notice err">⚠️ حد Firebase اليومي وصل ${Math.max(q.readPct, q.writePct)}%. شوف «النظام».</div>` : ""; }
function backupNag(){
  if (S.adminRole !== "admin") return "";
  loadUsage();
  if (S.usage === null && !S._usageTried) { S._usageTried = true; return ""; }   // first paint: wait for the read
  loadAutoBk();
  const lastAuto = ((S.autoBk || [])[0] || {}).at, lastMan = S.usage && S.usage.at;
  const at = lastAuto || lastMan ? new Date([lastAuto, lastMan].filter(Boolean).sort().pop()) : null, days = at ? Math.floor((Date.now() - at) / 864e5) : null;
  if (at && days < 7) return "";
  return `<div class="notice err" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="grow">${at ? `آخر نسخة احتياطية قبل ${days} يوم.` : "ما فيه نسخة احتياطية مسجّلة."} نزّل نسخة الحين واحفظها في مكان آمن.</span><button class="btn sm pri" id="nagBk">تنزيل نسخة احتياطية</button></div>`;
}
function usageCard(){
  loadUsage();
  const u = S.usage;
  if (!u) return `<div class="card"><h2>مساحة البيانات</h2><p class="muted" style="margin:0">ما انحسبت للحين. نزّل نسخة احتياطية من حساب الإدارة العامة وبيظهر الحجم هنا تلقائياً.</p></div>`;
  const est = u.bytes * 2, pct = Math.min(100, est / QUOTA_BYTES * 100);   // ×2: Firestore also stores indexes beside the data
  const mb = b => b < 1024 * 1024 ? (b / 1024).toFixed(0) + " كيلوبايت" : (b / 1024 / 1024).toFixed(1) + " ميغابايت";
  const NAMES = {receipts: "صور الإيصالات", signFiles: "ملفات التوقيع", logs: "السجل", att: "التحضير", students: "الطلاب", studentSecrets: "بيانات دخول الطلاب", payments: "الدفعات", sigs: "التواقيع", public: "إعدادات عامة", certs: "الشهادات", results: "النتائج", archives: "الأرشيف", evals: "التقييمات", groups: "الشعب", signReqs: "طلبات التوقيع", finReqs: "طلبات المالية", finAccounts: "الحسابات المالية", trainers: "المدربين", secrets: "رموز المدربين", grades: "الدرجات", excuses: "الأعذار", warnings: "الإنذارات", idcards: "البطاقات", expenses: "المصروفات", courses: "الدورات", joins: "الانضمام", surveys: "الاستبيانات", ann: "الإعلانات", fin: "إعدادات المالية", salaryPays: "الرواتب", commPays: "العمولات", finClear: "إخلاء الطرف"};
  const top = Object.entries(u.by || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const col = pct >= 85 ? "#c0392b" : pct >= 70 ? "#d68910" : "#1e8449";
  const when = u.at ? new Date(u.at).toLocaleDateString("ar-SA-u-ca-gregory", {day: "numeric", month: "long", year: "numeric"}) : "";
  return `<div class="card"><h2>مساحة البيانات</h2>
    ${pct >= 70 ? `<div class="notice err">المساحة قربت من الحد المجاني (1 جيجابايت). أكبر شي ياخذ مساحة تحت، كلم الدعم الفني قبل ما تمتلي.</div>` : ""}
    <div style="display:flex;justify-content:space-between;font-weight:700"><span>${mb(est)} تقريباً من 1 جيجابايت</span><span style="color:${col}">${pct < 0.1 ? "أقل من 0.1" : pct.toFixed(1)}%</span></div>
    <div style="height:10px;border-radius:6px;background:#e5e7eb;overflow:hidden;margin:8px 0"><div style="height:100%;width:${Math.max(pct, 0.5)}%;background:${col}"></div></div>
    <p class="muted" style="margin:0 0 8px">آخر قياس: ${esc(when)} (يتحدث كل ما نزّلت نسخة احتياطية من حساب الإدارة العامة).</p>
    ${top.map(([c, b]) => `<div class="item" style="padding:6px 12px"><span class="grow">${esc(NAMES[c] || c)}<span class="muted"> · ${(u.docs || {})[c] || 0} سجل</span></span><span class="muted">${mb(b * 2)}</span></div>`).join("")}
  </div>`;
}

async function backupAll(note){
  const out = {kind: "asas-backup-v1", at: new Date().toISOString(), note: note || "", data: {}};
  for (const c of ALL_COLLS) {
    let snap; try { snap = await getDocs(collection(db, c)); } catch { continue; }   // e.g. finance collections for the academic role
    out.data[c] = {}; snap.docs.forEach(d => { const v = d.data(); if (c === "logs" && v.at && v.at.toDate) v.at = v.at.toDate().toISOString(); out.data[c][d.id] = toPlain(v); });
  }
  const blob = new Blob([JSON.stringify(out)], {type: "application/json"});
  try { saveUsage(out, blob.size); } catch (e) { console.error(e); }   // the estimate must never block the backup itself
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `asas-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  logAction("نسخة احتياطية", note || "");
  return out;
}

/* ---------- restore: make the portal match a backup file exactly (general administration only) ---------- */
async function restoreRead(f){
  const out = $("#rsOut"); out.innerHTML = `<p class="muted">جاري قراءة الملف…</p>`;
  let bk; try { const txt = /\.gz$/i.test(f.name) ? await new Response(f.stream().pipeThrough(new DecompressionStream("gzip"))).text() : await f.text(); bk = JSON.parse(txt); } catch { out.innerHTML = ""; return toast("الملف مو نسخة احتياطية صحيحة"); }
  if (!bk || bk.kind !== "asas-backup-v1" || !bk.data) { out.innerHTML = ""; return toast("الملف مو نسخة احتياطية من البوابة"); }
  const colls = Object.keys(bk.data).filter(c => ALL_COLLS.includes(c) && !NO_RESTORE.includes(c));
  const n = c => Object.keys(bk.data[c] || {}).length;
  S._rs = {bk, colls};
  out.innerHTML = `<div class="notice" style="margin:10px 0">نسخة بتاريخ <b>${esc(bothDates((bk.at || "").slice(0, 10)))}</b> · الساعة ${esc((bk.at || "").slice(11, 16))} (UTC)${bk.note ? " · " + esc(bk.note) : ""}</div>
    <div class="stats">${[["students", "طالب"], ["trainers", "مدرب"], ["groups", "شعبة"], ["att", "تحضير"], ["finAccounts", "حساب مالي"], ["payments", "دفعة"]].map(([c, t]) => `<div class="stat"><b>${n(c)}</b><span>${t}</span></div>`).join("")}</div>
    <div class="notice err" style="margin:10px 0">الاستعادة ترجّع البوابة <b>بالضبط</b> مثل النسخة: أي شي انضاف أو تعدّل بعد تاريخها ينحذف. قبل ما تبدأ بتنزل لك نسخة من الوضع الحالي تلقائياً، احتياط.</div>
    <label for="rsC">للتأكيد اكتب كلمة: استعادة</label><input type="text" id="rsC" autocomplete="off">
    <div class="row" style="margin-top:10px"><button class="btn danger" id="rsGo">استعادة البيانات</button><span class="muted" id="rsLog"></span></div>`;
  $("#rsGo").onclick = restoreRun;
}
async function restoreRun(){
  if (S.adminRole !== "admin") return toast("الاستعادة من حساب الإدارة بس");
  if ($("#rsC").value.trim() !== "استعادة") return toast("اكتب كلمة: استعادة");
  const {bk, colls} = S._rs || {}; if (!bk) return;
  const btn = $("#rsGo"), log = t => { const l = $("#rsLog"); if (l) l.textContent = t; };
  btn.disabled = true;
  try { log("تنزيل نسخة من الوضع الحالي…"); await backupAll("قبل الاستعادة"); } catch { btn.disabled = false; log(""); return toast("ما قدرنا نأخذ نسخة من الوضع الحالي، الاستعادة توقفت"); }
  const failed = [], kept = {};
  for (const c of colls) {
    try {
      log(`جاري استعادة ${c}…`);
      const want = bk.data[c] || {}, cur = await getDocs(collection(db, c)), have = {};
      cur.docs.forEach(d => have[d.id] = canon(toPlain(d.data())));
      const ops = [], keep = APPEND_ONLY.includes(c);
      if (!keep) cur.docs.forEach(d => { if (!(d.id in want)) ops.push(b => b.delete(ref(`${c}/${d.id}`))); });
      Object.entries(want).forEach(([id, v]) => { if (id in have && (keep || have[id] === canon(v))) return; if (keep && (v.void || !(Number(v.amount) > 0))) return; ops.push(b => b.set(ref(`${c}/${id}`), fromPlain(v))); });
      if (keep) Object.keys(have).forEach(id => { if (!(id in want)) kept[c] = (kept[c] || 0) + 1; });
      for (let i = 0; i < ops.length; i += 300) { const b = writeBatch(db); ops.slice(i, i + 300).forEach(f => f(b)); await b.commit(); }
    } catch (e) { console.error(c, e); failed.push(c); }
  }
  logAction("استعادة نسخة احتياطية", `${(bk.at || "").slice(0, 16)}${failed.length ? " · تعذّر: " + failed.join("، ") : ""}`);
  log(""); btn.disabled = false;
  $("#rsOut").innerHTML = failed.length ? `<div class="notice err">انتهت الاستعادة، لكن تعذّرت هذه الأقسام: ${esc(failed.join("، "))}. حاول مرة ثانية.</div>` : `<div class="notice">تمت الاستعادة ✓ البوابة الحين مطابقة للنسخة. حدّث الصفحة.${Object.keys(kept).length ? `<br>السجلات المالية ما تنحذف أبداً، فبقت ${Object.values(kept).reduce((a, b) => a + b, 0)} دفعة/مصروف مسجّلة بعد تاريخ النسخة. إذا ما تبيها، ألغِها من المالية.` : ""}</div>`;
}

/* ---------- term archive ---------- */
async function archiveTerm(term, opts, log){
  log("1/4 تنزيل نسخة احتياطية كاملة…");
  const bk = await backupAll("قبل أرشفة " + term);
  const att = Object.values(bk.data.att || {}), results = Object.values(bk.data.results || {});
  log("2/4 حفظ ملخص الفصل…");
  const key = term.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60);
  for (const g of Object.values(S.groups)) {
    const docs = countable(att.filter(d => d.groupId === g.id));
    const rows = (g.students || []).map(s => { const st = absStats(g, s.id, docs); const r = results.find(x => x.groupId === g.id && x.num === s.sid); return {name: s.name, num: s.sid || "", att: st.attPct, abs: st.a, absPct: st.absPct, level: LEVEL[st.level], mark: r ? r.mark : null}; });
    if (rows.length) await setDoc(ref(`archives/${key}_${g.id}`), {term, termKey: key, groupId: g.id, course: g.course, trainer: tName(g.trainerId), held: docs.length, rows, at: today()});
  }
  log("3/4 مسح بيانات الفصل الحالي…");
  for (const c of ["att", "joins", "grades", "results", "excuses", "warnings", "waivers", "evals"]) {
    const ids = Object.keys(bk.data[c] || {});
    for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(db); ids.slice(i, i + 400).forEach(id => b.delete(ref(`${c}/${id}`))); await b.commit(); }
    log(`   ${c}: ${ids.length}`);
  }
  log("4/4 تجهيز الشعب للفصل الجديد…");
  const gb = writeBatch(db);
  Object.values(S.groups).forEach(g => {
    const d = clone(g); delete d.id; d.evalOpen = false;
    if (opts.clearStudents) { d.students = []; d.memberNums = []; }
    if (opts.clearSchedule) { d.sessions = []; d.meetLink = ""; d.recordings = []; }
    gb.set(ref("groups/" + g.id), d);
  });
  await gb.commit();
  S.allAtt = null; S.evalsAll = null; S.archives = null;
  logAction("أرشفة الفصل وبدء فصل جديد", term);
  log("تم. الشهادات الصادرة باقية وصفحة التحقق شغالة.");
}
function adminArchive(el){
  if (!S.archives) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري تحميل الأرشيف…</p></div>`;
    getDocs(collection(db, "archives")).then(snap => { S.archives = snap.docs.map(d => d.data()); if (S.aTab === "archive") render(); }).catch(e => { console.error(e); el.innerHTML = `<div class="notice err">تعذّر تحميل الأرشيف، تأكد من تحديث قواعد Firebase.</div>`; });
    return;
  }
  const terms = [...new Set(S.archives.map(a => a.term))];
  const t = S.archTerm && terms.includes(S.archTerm) ? S.archTerm : terms[0];
  const list = S.archives.filter(a => a.term === t).sort((a, b) => a.course.localeCompare(b.course, "ar"));
  el.innerHTML = `<div class="card"><h2>أرشيف الفصول</h2>
    ${terms.length ? `<div class="row"><select id="arT" class="grow">${terms.map(x => `<option ${x === t ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><button class="btn sm" id="arX">تنزيل Excel</button></div>` : `<p class="muted" style="margin:0">ما فيه فصول مؤرشفة. الأرشفة من تبويب "النظام".</p>`}</div>
  ${list.map(a => `<div class="card"><h2>${esc(a.course)}</h2><p class="muted" style="margin-top:0">${esc(a.trainer)} · ${a.held} محاضرة</p>
    <div class="tbl"><table><thead><tr><th class="nm">الاسم</th><th>الرقم</th><th>الحضور</th><th>غياب</th><th>الحالة</th><th>الدرجة</th></tr></thead><tbody>
    ${a.rows.map(r => `<tr><td class="nm">${esc(r.name)}</td><td>${esc(r.num)}</td><td>${r.att === null ? "—" : r.att + "%"}</td><td>${r.abs} (${r.absPct}%)</td><td>${esc(r.level)}</td><td>${r.mark === null ? "—" : r.mark}</td></tr>`).join("")}</tbody></table></div></div>`).join("")}`;
  if ($("#arT")) $("#arT").onchange = e => { S.archTerm = e.target.value; render(); };
  if ($("#arX")) $("#arX").onclick = () => excelDownload(`أرشيف ${t}`, list.map(a => ({title: a.course, rows: [[INST_AR], [`${t} · ${a.course} · ${a.trainer}`], [], ["الاسم", "الرقم", "الحضور %", "غياب", "نسبة الغياب %", "الحالة", "الدرجة"], ...a.rows.map(r => [r.name, r.num, r.att, r.abs, r.absPct, r.level, r.mark])], widths: [30, 12, 10, 8, 12, 14, 8]})));
}



/* ================= fee clearance (read by academic affairs for certificates) ================= */
/* every trainee gets one public, unguessable ID-card token; the QR on the card opens ?id=TOKEN */
const newIdToken = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(16)); return Array.from(r, x => A[x % A.length]).join(""); };
function syncIdCards(){
  if (S._idBusy || !S.idLoaded || !S.students || !Object.keys(S.students).length) return;
  const b = writeBatch(db); let n = 0;
  Object.entries(S.students).forEach(([num, st]) => {
    const t = (S.idTok || {})[num], cur = t && S.idDocs[t];
    if (!cur) { b.set(ref("idcards/" + newIdToken()), {num, name: st.name || "", gender: st.gender || "", at: today()}); n++; }
    else if (cur.name !== (st.name || "") || cur.gender !== (st.gender || "")) { b.set(ref("idcards/" + t), {name: st.name || "", gender: st.gender || ""}, {merge: true}); n++; }
  });
  Object.entries(S.idDocs || {}).forEach(([t, v]) => { if (!S.students[v.num] || S.idTok[v.num] !== t) { b.delete(ref("idcards/" + t)); n++; } });
  if (!n || n > 450) return;
  S._idBusy = true;
  b.commit().catch(() => {}).finally(() => { S._idBusy = false; });
}
const idVerifyUrl = t => `${SITE()}?id=${t}`;
function renderIdVerify(app){
  if (S._ivHTML) { app.innerHTML = S._ivHTML; return; }
  if (S._ivBusy) return; S._ivBusy = true;
  const box = inner => `<div class="card" style="max-width:520px;width:100%;justify-self:center;text-align:center"><img src="logo-mark.png" alt="" style="width:84px">${inner}<p class="muted" style="margin-bottom:0">${esc(INST_AR)} · تم التحقق ${esc(bothDates(today()))}</p></div>`;
  app.innerHTML = box(`<p class="muted">جاري التحقق…</p>`);
  Promise.all([getDoc(ref("idcards/" + S.idv)), getDoc(ref("public/disabled")).catch(() => null)]).then(([snap, dis]) => {
    const off = (dis && dis.exists() && dis.data().list) || {};
    if (!snap.exists()) app.innerHTML = box(`<div class="idv bad"><b>✕</b><h2>بطاقة غير صالحة</h2><p>هذي البطاقة غير مسجلة في المعهد، أو انلغت.</p></div>`);
    else { const c = snap.data();
      app.innerHTML = box(off[c.num] ? `<div class="idv bad"><b>✕</b><h2>بطاقة موقوفة</h2><p>حساب ${c.gender === "f" ? "المتدربة" : "المتدرب"} موقوف حالياً. للاستفسار تواصل مع الشؤون الأكاديمية.</p></div>
        <div class="list" style="text-align:right"><div class="item"><span class="grow">الاسم</span><b>${esc(c.name)}</b></div><div class="item"><span class="grow">الرقم التدريبي</span><b dir="ltr">${esc(c.num)}</b></div></div>`
        : `<div class="idv ok"><b>✓</b><h2>بطاقة صالحة</h2><p>${c.gender === "f" ? "متدربة مسجلة" : "متدرب مسجل"} حالياً في المعهد.</p></div>
        <div class="list" style="text-align:right"><div class="item"><span class="grow">الاسم</span><b>${esc(c.name)}</b></div><div class="item"><span class="grow">الرقم التدريبي</span><b dir="ltr">${esc(c.num)}</b></div><div class="item"><span class="grow">الصفة</span><b>${c.gender === "f" ? "متدربة" : "متدرب"}</b></div></div>`); }
    S._ivHTML = app.innerHTML;
  }).catch(() => { app.innerHTML = `<div class="notice err">تعذّر التحقق، حاول مرة ثانية.</div>`; S._ivBusy = false; });
}

function syncFinClear(){
  if (S._fcBusy || !S.finAcc || !S.pays || !S.finClearLoaded) return;
  const want = {};
  Object.entries(S.finAcc).forEach(([num, acc]) => { want[num] = accStatus(acc, paysOf(num)).remaining; });
  const b = writeBatch(db); let n = 0;
  Object.entries(want).forEach(([num, rem]) => { const cur = (S.finClear || {})[num]; if (!cur || Math.abs((cur.remaining || 0) - rem) > 0.001) { b.set(ref("finClear/" + num), {remaining: rem}); n++; } });
  Object.keys(S.finClear || {}).forEach(num => { if (!(num in want)) { b.delete(ref("finClear/" + num)); n++; } });
  if (!n || n > 450) return;
  S._fcBusy = true;
  b.commit().catch(() => {}).finally(() => { S._fcBusy = false; });
}

/* ================= finance ================= */
const PLANS = {full: "كامل المبلغ", half: "50% / 50%", monthly: "أقساط شهرية", qasima: "قسيمة بلس (تابي / تمارا)"};
const METHODS = ["تحويل بنكي", "نقد", "مدى / شبكة", "قسيمة بلس", "دفع إلكتروني"];
const SAR = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {maximumFractionDigits: 2}) + " ر.س";
const addMonths = (d, k) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + k, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dd, last)).padStart(2, "0")}`; };
function startFinance(){
  S.subs.push(onSnapshot(ref("fin/settings"), snap => { S.finSet = snap.exists() ? snap.data() : {programs: []}; afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "finAccounts"), snap => { S.finAcc = {}; snap.docs.forEach(d => S.finAcc[d.id] = d.data()); afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "payments"), snap => { S.pays = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "expenses"), snap => { S.exps = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "commPays"), snap => { S.commPays = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "salaryPays"), snap => { S.salPays = {}; snap.docs.forEach(d => S.salPays[d.id] = d.data()); afterData(); }, () => {}));
  S.subs.push(onSnapshot(collection(db, "finReqs"), snap => { S.fReqs = snap.docs.map(d => ({id: d.id, ...d.data()})); afterData(); }, () => {}));
}
/* what is waiting on the person looking: finance signs and approves, the director stamps */
const fReqWaiting = () => (S.fReqs || []).filter(r => r.type === "inquiry" ? (r.status === "new" && FIN()) : (S.adminRole === "admin" ? ["new", "fin_signed", "stamped"].includes(r.status) : ["new", "stamped"].includes(r.status))).length + (S.adminRole === "admin" ? (S.fReqs || []).filter(r => r.type === "inquiry" && r.status === "new").length : 0);
function buildPlan(net, plan, start, months, second){
  if (!net || !start) return [];
  if (plan === "half") { const a = Math.round(net / 2 * 100) / 100; return [{due: start, amount: a}, {due: second || addMonths(start, 2), amount: Math.round((net - a) * 100) / 100}]; }
  if (plan === "monthly") {
    const n = Math.max(2, Math.min(60, Number(months) || 4)), a = Math.floor(net / n * 100) / 100;
    return Array.from({length: n}, (_, i) => ({due: addMonths(start, i), amount: i === n - 1 ? Math.round((net - a * (n - 1)) * 100) / 100 : a}));
  }
  return [{due: start, amount: net}];
}
/* ---------- finance import from the prepared Excel (sheets: الطلاب + الدفعات) ---------- */
const nameToks = s => norm(s).split(" ").filter(t => t && !["بن", "بنت"].includes(t));
function guessStudent(name){
  const A = nameToks(name); if (!A.length) return {num: "", cands: []};
  const sc = Object.entries(S.students || {}).map(([num, st]) => { const B = nameToks(st.name); if (!B.length || A[0] !== B[0]) return [0, num]; const sb = new Set(B); return [A.filter(t => sb.has(t)).length + (B.length === 1 ? 0.5 : 0), num]; }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
  const top = sc.filter(x => x[0] === (sc[0] || [0])[0]);
  return {num: sc.length && sc[0][0] >= 1.5 && top.length === 1 ? sc[0][1] : "", cands: sc.slice(0, 6).map(x => x[1])};
}
async function finImportRead(f){
  const out = $("#fiOut"); out.innerHTML = `<p class="muted">جاري قراءة الملف…</p>`;
  let X; try { X = await loadXLSX(); } catch { out.innerHTML = ""; return toast("تعذّر تحميل أداة Excel، تأكد من الاتصال"); }
  let wb; try { wb = X.read(await f.arrayBuffer(), {cellDates: false}); } catch { out.innerHTML = ""; return toast("ما قدرنا نقرأ الملف"); }
  const sh = n => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], {defval: ""}) : null;
  const rows = sh("الطلاب"), prow = sh("الدفعات");
  if (!rows || !prow) { out.innerHTML = ""; return toast("هذا مو ملف الاستيراد الجاهز. لازم يكون فيه ورقتين: الطلاب والدفعات"); }
  const str = v => String(v == null ? "" : v).trim(), numv = v => Number(String(v).replace(/[^\d.]/g, "")) || 0;
  const isoD = v => { if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); } const t = str(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ""; };
  const list = rows.map((r, i) => {
    const name = str(r["الاسم في الإكسل"]); if (!name) return null;
    let num = digits(str(r["الرقم التدريبي"])); const g = guessStudent(name);
    if (!num || !S.students[num]) num = g.num;
    return {i, name, num, cands: g.cands, program: str(r["البرنامج"]), phone: str(r["الجوال"]), email: str(r["الإيميل"]).toLowerCase(), nid: digits(str(r["رقم الهوية"])), contract: str(r["رقم العقد"]), start: isoD(r["تاريخ البداية"]) || today(), total: numv(r["المبلغ الإجمالي"]), months: numv(r["عدد الأقساط"]) || 30, acc: str(r["حساب مالي؟"]) === "نعم", note: str(r["ملاحظات"]), excelNum: digits(str(r["الرقم التدريبي"]))};
  }).filter(Boolean);
  const pays = prow.map(r => ({excelNum: digits(str(r["الرقم التدريبي"])), name: str(r["الاسم في الإكسل"]), k: numv(r["رقم القسط"]), amount: numv(r["المبلغ"]), method: str(r["الطريقة"]) || "تحويل بنكي", date: isoD(r["التاريخ"]) || today()})).filter(p => p.amount > 0);
  list.forEach(x => { x.pays = pays.filter(p => p.name === x.name && p.excelNum === x.excelNum); });
  list.sort((a, b) => (a.num ? 1 : 0) - (b.num ? 1 : 0) || a.i - b.i);
  S._fi = list; finImportDraw();
}
function finImportPlan(x){
  const st = S.students[x.num]; if (!st) return null;
  const prof = (S.stProf || {})[x.num] || {}, canProf = S.adminRole === "admin";
  const ph = x.phone ? normPhone(x.phone) : "";
  const pf = canProf ? Object.fromEntries([["phone", /^9665\d{8}$/.test(ph) ? ph : ""], ["email", /@/.test(x.email) ? x.email.slice(0, 120) : ""], ["nid", /^[12]\d{9}$/.test(x.nid) ? x.nid : ""]].filter(([k, v]) => v && !prof[k])) : {};
  const hasAcc = !!(S.finAcc || {})[x.num], hasPays = paysOf(x.num).length > 0;
  const newAcc = x.acc && x.total > 0 && !hasAcc, addPays = !hasPays && (newAcc || hasAcc) ? x.pays : [];
  return {pf, newAcc, addPays, hasAcc, hasPays};
}
function finImportDraw(){
  const out = $("#fiOut"); if (!out) return; const list = S._fi || [];
  const opts = sel => `<option value="">— تخطي —</option>` + Object.entries(S.students).sort((a, b) => a[1].name.localeCompare(b[1].name, "ar")).map(([n, s]) => `<option value="${n}" ${n === sel ? "selected" : ""}>${esc(s.name)} · ${n}</option>`).join("");
  let nAcc = 0, nPay = 0, sPay = 0, nProf = 0, nSkip = 0;
  const rowsH = list.map((x, k) => {
    const pl = x.num ? finImportPlan(x) : null;
    if (!pl) nSkip++; else { nAcc += pl.newAcc ? 1 : 0; nPay += pl.addPays.length; sPay += pl.addPays.reduce((a, p) => a + p.amount, 0); nProf += Object.keys(pl.pf).length ? 1 : 0; }
    const what = !pl ? `<span class="muted">ما ينضاف</span>` : [Object.keys(pl.pf).length ? `بيانات: ${Object.keys(pl.pf).map(k => ({phone: "جوال", email: "إيميل", nid: "هوية"})[k]).join("، ")}` : "", pl.newAcc ? `حساب ${SAR(x.total)} · ${x.months} قسط` : (x.acc && pl.hasAcc ? "عنده حساب" : ""), pl.addPays.length ? `${pl.addPays.length} دفعة · ${SAR(pl.addPays.reduce((a, p) => a + p.amount, 0))}` : (pl.hasPays && x.pays.length ? "عنده دفعات" : "")].filter(Boolean).join(" · ") || `<span class="muted">ما فيه شي جديد</span>`;
    const sel = x.num && S.students[x.num] ? `<b>${esc(S.students[x.num].name)}</b> <span class="muted">${x.num}</span> <button class="btn sm" data-fich="${k}">تغيير</button>` : `<select data-fisel="${k}" style="max-width:240px">${opts("")}</select>`;
    return `<tr><td class="nm">${esc(x.name)}${x.note ? `<div class="muted" style="font-size:12px;white-space:normal">${esc(x.note)}</div>` : ""}</td><td class="nm" style="white-space:normal">${sel}</td><td class="nm" style="white-space:normal">${what}</td></tr>`;
  }).join("");
  out.innerHTML = `<div class="stats" style="margin:12px 0"><div class="stat"><b>${list.length - nSkip}</b><span>طالب مربوط</span></div><div class="stat"><b>${nAcc}</b><span>حساب جديد</span></div><div class="stat"><b>${nPay}</b><span>دفعة · ${SAR(sPay)}</span></div><div class="stat"><b>${nProf}</b><span>ملف يتعبّى</span></div><div class="stat"><b>${nSkip}</b><span>غير مربوط</span></div></div>
    ${S.adminRole !== "admin" ? `<div class="notice">الجوال والإيميل والهوية تنضاف من حساب الإدارة بس. من حسابك تنضاف الحسابات والدفعات.</div>` : ""}
    <p class="muted">«غير مربوط» = ما لقيناه في البوابة. اختر اسمه من القائمة، أو خلّه «تخطي» إذا ما هو مسجل.</p>
    <div class="tbl"><table><thead><tr><th class="nm">في الإكسل</th><th class="nm">في البوابة</th><th class="nm">وش بينضاف</th></tr></thead><tbody>${rowsH}</tbody></table></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="fiGo" ${nAcc + nPay + nProf ? "" : "disabled"}>اعتماد الاستيراد</button><span class="muted" id="fiLog"></span></div>`;
  out.querySelectorAll("[data-fisel]").forEach(s => s.onchange = () => { list[Number(s.dataset.fisel)].num = s.value; finImportDraw(); });
  out.querySelectorAll("[data-fich]").forEach(b => b.onclick = () => { list[Number(b.dataset.fich)].num = ""; finImportDraw(); });
  $("#fiGo").onclick = finImportRun;
}
async function finImportRun(){
  const list = (S._fi || []).filter(x => x.num), btn = $("#fiGo"), log = t => { const l = $("#fiLog"); if (l) l.textContent = t; };
  const dup = {}; list.forEach(x => dup[x.num] = (dup[x.num] || 0) + 1);
  const twice = Object.keys(dup).filter(n => dup[n] > 1); if (twice.length) return toast(`نفس الطالب مربوط بأكثر من صف: ${twice.map(n => S.students[n].name).join("، ")}`);
  if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "متأكد؟ اضغط مرة ثانية"; return; }
  btn.disabled = true;
  const plans = list.map(x => ({x, pl: finImportPlan(x)})).filter(o => o.pl);
  const progs = S.finSet.programs || [], progId = name => { const n = norm(name).replace(/^دبلوم ?/, ""); const p = progs.find(p => norm(p.name).includes(n) || n.includes(norm(p.name).replace(/^دبلوم ?/, ""))); return p ? p.id : ""; };
  const allPays = []; plans.forEach(o => o.pl.addPays.forEach(p => allPays.push({o, p})));
  try {
    let base = 0;
    if (allPays.length) { log("جاري حجز أرقام السندات…"); await runTransaction(db, async tx => { const c = await tx.get(ref("fin/counter")); base = (c.exists() && c.data().last) || 0; tx.set(ref("fin/counter"), {last: base + allPays.length}); }); }
    const ops = [];
    plans.forEach(({x, pl}) => {
      const st = S.students[x.num];
      if (Object.keys(pl.pf).length) ops.push(b => b.set(ref("studentSecrets/" + x.num), pl.pf, {merge: true}));
      if (pl.newAcc) {
        const months = Math.max(1, Math.min(60, Math.round(x.months))), plan = months === 1 ? "full" : months === 2 ? "half" : "monthly";
        const acc = {num: x.num, name: st.name, program: progId(x.program), fee: x.total, discount: 0, discountNote: "", plan, start: x.start, months: plan === "monthly" ? months : 4, installments: buildPlan(x.total, plan, x.start, months, plan === "half" ? addMonths(x.start, 1) : ""), phone: "", contractNo: x.contract, note: x.note.slice(0, 600), imported: true, updatedAt: new Date().toISOString()};
        ops.push(b => b.set(ref("finAccounts/" + x.num), acc));
      }
    });
    const yr = today().slice(0, 4);
    allPays.sort((a, b) => a.p.date.localeCompare(b.p.date) || a.p.k - b.p.k).forEach(({o, p}, i) => {
      const id = "p-" + uid() + uid(), x = o.x;
      const pay = {num: x.num, name: S.students[x.num].name, amount: p.amount, method: METHODS.includes(p.method) ? p.method : (/نقد|كاش/.test(p.method) ? "نقد" : "تحويل بنكي"), date: p.date, ref: x.contract, note: `مستورد من Excel · القسط ${p.k}`, program: progId(x.program), by: S.adminRole, void: false, imported: true, receiptNo: `${yr}-${String(base + i + 1).padStart(5, "0")}`, at: serverTimestamp()};
      ops.push(b => b.set(ref("payments/" + id), pay));
    });
    for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach(f => f(b)); log(`جاري الحفظ… ${Math.min(i + 400, ops.length)} من ${ops.length}`); await b.commit(); }
    logAction("استيراد مالي من Excel", `${plans.filter(o => o.pl.newAcc).length} حساب · ${allPays.length} دفعة`);
    toast("اكتمل الاستيراد"); S._fi = null; const out = $("#fiOut"); if (out) out.innerHTML = `<div class="notice ok">اكتمل الاستيراد: ${plans.filter(o => o.pl.newAcc).length} حساب جديد، و${allPays.length} دفعة. تقدر تراجعهم من «حسابات الطلاب».</div>`;
  } catch (e) { btn.disabled = false; log(""); handleWriteErr(e); }
}
/* ---------- student finance requests: final invoice (finance signs → director stamps → finance approves) and inquiries ---------- */
const FR_ST = {new: "طلب جديد", fin_signed: "وقّعتها المالية · بانتظار ختم الإدارة", stamped: "مختومة · بانتظار اعتماد المالية", approved: "معتمدة وظاهرة للطالب", rejected: "مرفوضة", done: "تم التواصل"};
function invoiceHTML(inv){
  return `<h1>الفاتورة النهائية</h1>
  <div class="info"><div><b>رقم الفاتورة:</b> ${esc(inv.no)}</div><div><b>التاريخ:</b> ${esc(bothDates(inv.date))}</div></div>
  <table><tbody>
    <tr><td class="n" style="width:30%"><b>المتدرب</b></td><td class="n">${esc(inv.name)} · الرقم التدريبي ${esc(inv.num)}</td></tr>
    <tr><td class="n"><b>البرنامج</b></td><td class="n">${esc(inv.program || "البرنامج التدريبي")}</td></tr>
    <tr><td class="n"><b>إجمالي الرسوم</b></td><td class="n">${SAR(inv.net)}${inv.discount ? ` <span style="color:#666;font-size:11px">(بعد خصم ${SAR(inv.discount)})</span>` : ""}</td></tr>
    <tr><td class="n"><b>المبلغ المسدَّد</b></td><td class="n"><b>${SAR(inv.paid)}</b></td></tr>
    <tr><td class="n"><b>المتبقي</b></td><td class="n"><b>${SAR(0)}</b> · مسدّد بالكامل</td></tr>
  </tbody></table>
  <h3 style="color:#1F5136">الدفعات</h3><table><thead><tr><th>السند</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>${(inv.pays || []).map(p => `<tr><td>${esc(p.receiptNo)}</td><td>${dH(p.date)}</td><td>${SAR(p.amount)}</td><td>${esc(p.method)}</td></tr>`).join("")}</tbody></table>
  <p style="font-size:11px;color:#444;margin-top:10px">نفيد بأن ${esc(inv.name)} سدّد كامل رسوم البرنامج الموضّح أعلاه، ولا توجد عليه مستحقات مالية للمعهد حتى تاريخه. وهذه الفاتورة ليست فاتورة ضريبية.</p>
  <div class="sig"><div>${okImg(inv.finSig) ? `<img class="sgi" src="${inv.finSig}" alt="">` : ""}المالية</div><div>${okImg(inv.stamp) ? `<img class="stp" src="${inv.stamp}" alt="">` : ""}الختم</div></div>`;
}
const printInvoice = inv => { const w = openPrint(); if (w) fillPrintFin(w, `الفاتورة النهائية ${inv.no}`, [{html: invoiceHTML(inv)}]); };
function studentFinReq(el){
  const reqs = (S.myFReq || []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const inv = reqs.find(r => r.type === "invoice" && r.status !== "rejected"), rej = reqs.find(r => r.type === "invoice" && r.status === "rejected");
  const st = S.myFin ? accStatus(S.myFin, S.myPay || []) : null, full = st && st.net > 0 && st.remaining <= 0.01;
  const steps = ["طلبك", "توقيع المالية", "ختم الإدارة", "الاعتماد"], at = inv ? ({new: 1, fin_signed: 2, stamped: 3, approved: 4})[inv.status] || 1 : 0;
  const invBox = inv && inv.status === "approved" ? `<div class="notice" style="margin:0 0 10px">فاتورتك النهائية جاهزة ✓</div><button class="btn pri" id="frPrint">عرض وطباعة الفاتورة</button>`
    : inv ? `<div class="frSteps">${steps.map((t, k) => `<span class="${k < at ? "on" : ""}">${k < at ? "✓ " : ""}${t}</span>`).join("")}</div><p class="muted" style="margin-bottom:0">طلبك تحت الإجراء. توصلك هنا أول ما تنعتمد.</p>`
    : full ? `${rej ? `<div class="notice err" style="margin:0 0 10px">طلبك السابق انرفض${rej.reason ? ": " + esc(rej.reason) : ""}</div>` : ""}<p style="margin-top:0">سدّدت كامل الرسوم ✓ تقدر تطلب فاتورتك النهائية الموقّعة والمختومة.</p><button class="btn pri" id="frInv">طلب الفاتورة النهائية</button>`
    : `<p class="muted" style="margin:0">زر طلب الفاتورة النهائية يظهر لك بعد سداد كامل الرسوم.</p>`;
  const inq = reqs.filter(r => r.type === "inquiry");
  const payBox = st && st.net > 0 ? `<div class="card"><h2>💳 رسومي</h2>
    <div class="stats"><div class="stat"><div class="n">${SAR(st.net)}</div><div class="l">الرسوم</div></div><div class="stat"><div class="n">${SAR(st.paid)}</div><div class="l">المدفوع</div></div><div class="stat"><div class="n">${SAR(st.remaining)}</div><div class="l">المتبقي</div></div>${st.overdue > 0 ? `<div class="stat"><div class="n" style="color:#b42318">${SAR(st.overdue)}</div><div class="l">مستحق الحين</div></div>` : ""}</div>
    ${(S.site || {}).payFees && st.remaining >= 1 ? `<div style="margin-top:12px;padding:12px;border-radius:12px;background:#f6faf7;border:1.5px solid #1f6f43"><b>ادفع إلكترونياً</b> <span class="muted">— مدى، Apple Pay، STC Pay، والبطاقات. السند ينزل لك تلقائياً.</span>
      <div class="row" style="margin-top:8px"><input type="number" id="payAmt" min="1" max="${st.remaining}" step="0.01" value="${st.overdue >= 1 ? st.overdue : st.remaining}" style="width:150px" aria-label="المبلغ"><span class="muted">ر.س</span><button class="btn pri" id="payGo">💳 ادفع إلكترونياً</button></div></div>` : ""}</div>` : "";
  el.innerHTML = `${payBox}<div class="card"><h2>الفاتورة النهائية</h2>${invBox}</div>
  <div class="card"><h2>استفسار مالي</h2><p class="muted" style="margin-top:0">اكتب استفسارك، ومسؤول المالية يتواصل معك على الواتساب.</p>
    <label for="frT">استفسارك</label><textarea id="frT" rows="3" maxlength="800" placeholder="مثال: أبي أعرف موعد القسط الجاي"></textarea>
    <label for="frP">جوالك للتواصل</label><input type="tel" id="frP" dir="ltr" placeholder="05xxxxxxxx" inputmode="numeric">
    <div class="row" style="margin-top:10px"><button class="btn pri" id="frSend">إرسال للمالية</button></div>
    ${inq.length ? `<h3>استفساراتك</h3><div class="list">${inq.map(r => `<div class="item"><div class="grow"><div>${esc(r.text)}</div><div class="muted">${esc(bothDates((r.at || "").slice(0, 10)))}</div></div><span class="pill">${r.status === "done" ? "تم التواصل" : "قيد المراجعة"}</span></div>`).join("")}</div>` : ""}</div>`;
  const add = async d => { const id = "fr-" + uid() + uid(); await setDoc(ref("finReqs/" + id), {num: S.myNum, name: (S.myStudent && S.myStudent.name) || "", status: "new", at: new Date().toISOString(), ...d}); notify("fin", id); };
  if ($("#payGo")) $("#payGo").onclick = () => { const v = Math.round(Number($("#payAmt").value) * 100) / 100; if (!(v >= 1) || v > st.remaining + 0.01) return toast(`اكتب مبلغ بين 1 و${st.remaining}`); startPay({kind: "fee", amount: v}, $("#payGo")); };
  if ($("#frPrint")) { $("#frPrint").onclick = () => printInvoice(inv.inv); if (!inv.seen) setDoc(ref("finReqs/" + inv.id), {seen: true}, {merge: true}).catch(() => {}); }
  if ($("#frInv")) $("#frInv").onclick = async e => { e.target.disabled = true; try { await add({type: "invoice"}); toast("انرسل طلبك للمالية"); } catch (x) { e.target.disabled = false; handleWriteErr(x); } };
  $("#frSend").onclick = async e => {
    const text = $("#frT").value.trim(), ph = normPhone($("#frP").value);
    if (text.length < 3) return toast("اكتب استفسارك"); if (!/^9665\d{8}$/.test(ph)) return toast("اكتب رقم جوال صحيح");
    e.target.disabled = true; try { await add({type: "inquiry", text: text.slice(0, 800), phone: ph}); toast("انرسل استفسارك"); } catch (x) { e.target.disabled = false; handleWriteErr(x); }
  };
}
function finReqTab(el){
  const all = (S.fReqs || []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const invs = all.filter(r => r.type === "invoice"), inq = all.filter(r => r.type === "inquiry");
  const isDir = S.adminRole === "admin", isFin = FIN() || isDir;
  const act = r => {
    const b = [];
    if (r.status === "new" && isFin) b.push(`<button class="btn sm pri" data-frsign="${r.id}">توقيع ورفع للإدارة</button>`, `<button class="btn sm danger" data-frrej="${r.id}">رفض</button>`);
    if (r.status === "fin_signed") b.push(isDir ? `<button class="btn sm pri" data-frstamp="${r.id}">ختم وإرجاع للمالية</button>` : `<span class="muted">بانتظار ختم الإدارة</span>`);
    if (r.status === "stamped" && isFin) b.push(`<button class="btn sm pri" data-frok="${r.id}">اعتماد وإظهار للطالب</button>`);
    if (r.status === "approved") b.push(`<button class="btn sm" data-frview="${r.id}">الفاتورة</button>`);
    return b.join("");
  };
  const stOf = r => { const acc = (S.finAcc || {})[r.num]; return acc ? accStatus(acc, paysOf(r.num)) : null; };
  el.innerHTML = `<div class="card"><h2>طلبات الفاتورة النهائية</h2><p class="muted" style="margin-top:0">المالية توقّع وترفع للإدارة، والإدارة تختم وترجعها، وبعدها المالية تعتمدها وتظهر للطالب.</p>
    <div class="list">${invs.map(r => { const st = stOf(r); return `<div class="item"><div class="grow"><b>${esc((S.students[r.num] || {}).name || r.name)}</b> <span class="muted">${esc(r.num)}</span><div class="muted">${esc(bothDates((r.at || "").slice(0, 10)))} · ${FR_ST[r.status] || r.status}${r.status === "rejected" && r.reason ? " · " + esc(r.reason) : ""}${st && st.remaining > 0.01 && r.status !== "approved" ? ` · <span style="color:var(--abs)">عليه متبقي ${SAR(st.remaining)}</span>` : ""}</div></div>${act(r)}</div>`; }).join("") || `<span class="muted">ما فيه طلبات.</span>`}</div></div>
  <div class="card"><h2>الاستفسارات</h2><div class="list">${inq.map(r => `<div class="item" style="${r.status === "done" ? "opacity:.6" : ""}"><div class="grow"><b>${esc((S.students[r.num] || {}).name || r.name)}</b> <span class="muted">${esc(r.num)} · ${esc(bothDates((r.at || "").slice(0, 10)))}</span><div>${esc(r.text)}</div></div><a class="btn sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}?text=${encodeURIComponent(`السلام عليكم ${r.name}، بخصوص استفسارك للمالية في ${INST_AR}:\n`)}">واتساب</a>${r.status !== "done" && isFin ? `<button class="btn sm" data-frdone="${r.id}">تم التواصل</button>` : ""}</div>`).join("") || `<span class="muted">ما فيه استفسارات.</span>`}</div></div>`;
  const upd = async (id, d, msg, log) => { try { await setDoc(ref("finReqs/" + id), {...d, [`${d.status || "x"}At`]: new Date().toISOString(), [`${d.status || "x"}By`]: S.adminRole}, {merge: true}); notify("fin", id); logAction(log, (all.find(r => r.id === id) || {}).name || ""); toast(msg); } catch (e) { handleWriteErr(e); } };
  el.querySelectorAll("[data-frsign]").forEach(b => b.onclick = () => {
    const r = all.find(x => x.id === b.dataset.frsign), st = stOf(r);
    if (!st || st.remaining > 0.01) return toast(st ? `ما سدّد كامل الرسوم، باقي ${SAR(st.remaining)}` : "ما له حساب مالي");
    if (!okImg((S.sigs || {}).finance)) return toast("ارفع توقيع المالية أول من «الإعدادات»");
    upd(r.id, {status: "fin_signed", finSig: S.sigs.finance}, "انرفعت للإدارة للختم", "توقيع فاتورة نهائية");
  });
  el.querySelectorAll("[data-frstamp]").forEach(b => b.onclick = () => { if (!okImg(S.stamp)) return toast("ارفع الختم أول من تبويب «النظام»"); upd(b.dataset.frstamp, {status: "stamped", stamp: S.stamp}, "انختمت ورجعت للمالية", "ختم فاتورة نهائية"); });
  el.querySelectorAll("[data-frrej]").forEach(b => b.onclick = () => { const reason = prompt("سبب الرفض (يظهر للطالب):"); if (reason === null) return; upd(b.dataset.frrej, {status: "rejected", reason: reason.trim().slice(0, 200)}, "انرفض الطلب", "رفض طلب فاتورة"); });
  el.querySelectorAll("[data-frdone]").forEach(b => b.onclick = () => upd(b.dataset.frdone, {status: "done"}, "تم", "رد على استفسار مالي"));
  el.querySelectorAll("[data-frview]").forEach(b => b.onclick = () => printInvoice(all.find(x => x.id === b.dataset.frview).inv));
  el.querySelectorAll("[data-frok]").forEach(b => b.onclick = async () => {
    const r = all.find(x => x.id === b.dataset.frok), acc = (S.finAcc || {})[r.num], st = stOf(r);
    if (!st || st.remaining > 0.01) return toast("ما سدّد كامل الرسوم");
    const prog = ((S.finSet && S.finSet.programs) || []).find(x => x.id === acc.program);
    const pays = paysOf(r.num).filter(p => !p.void).sort((a, c) => (a.date || "").localeCompare(c.date || "") || (a.receiptNo || "").localeCompare(c.receiptNo || "")).map(p => ({receiptNo: p.receiptNo || "", date: p.date || "", amount: Number(p.amount) || 0, method: p.method || ""}));
    b.disabled = true;
    try {
      await runTransaction(db, async tx => {
        const c = await tx.get(ref("fin/invCounter")), n = ((c.exists() && c.data().last) || 0) + 1;
        const inv = {no: `F-${today().slice(0, 4)}-${String(n).padStart(4, "0")}`, date: today(), name: r.name || (S.students[r.num] || {}).name || "", num: r.num, program: prog ? prog.name : "", net: st.net, paid: st.paid, discount: Number(acc.discount) || 0, pays, finSig: r.finSig || "", stamp: r.stamp || ""};
        tx.set(ref("fin/invCounter"), {last: n}); tx.set(ref("finReqs/" + r.id), {status: "approved", inv, approvedAt: new Date().toISOString(), approvedBy: S.adminRole}, {merge: true});
      });
      notify("fin", r.id); logAction("اعتماد فاتورة نهائية", r.name || r.num); toast("انعتمدت وظهرت للطالب");
    } catch (e) { b.disabled = false; handleWriteErr(e); }
  });
}
/* installments are named in words; extra fees keep their own name */
const ORD = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"];
const instKey = i => i.xi !== undefined ? "x" + i.xi : "i" + i.ix;
const instName = (i, sched) => { if (i.xi !== undefined) return i.label || "رسوم إضافية"; const n = sched ? sched.filter(x => x.xi === undefined).indexOf(i) : i.ix; return "القسط " + (ORD[n] || n + 1); };
/* paid vs schedule: overdue = what fell due by today minus what was paid */
function accStatus(acc, pays){
  const extras = acc.extras || [];
  const net = Math.round((Math.max(0, (Number(acc.fee) || 0) - (Number(acc.discount) || 0)) + extras.reduce((a, x) => a + (Number(x.amount) || 0), 0)) * 100) / 100;
  const paid = pays.filter(p => !p.void).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const inst = [...(acc.installments || []).map((x, ix) => ({...x, ix})), ...extras.map((x, xi) => ({due: x.date, amount: Number(x.amount) || 0, label: x.label, xi}))].sort((a, b) => a.due.localeCompare(b.due));
  let cum = 0, dueNow = 0, next = null;
  inst.forEach(i => { cum += Number(i.amount) || 0; if (i.due <= today()) dueNow = cum; else if (!next && cum > paid) next = i; });
  const remaining = Math.max(0, Math.round((net - paid) * 100) / 100), overdue = Math.max(0, Math.round((dueNow - paid) * 100) / 100);
  const status = !net ? "none" : remaining === 0 ? "paid" : overdue > 0 ? "late" : "ok";
  // a payment marked for an installment (p.inst = "i0", "x1"…) goes to it first; the rest fills the schedule in date order
  const sched = inst.map(i => ({...i, key: instKey(i), covered: 0, pays: []}));
  const live = pays.filter(p => !p.void).sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.receiptNo || "").localeCompare(b.receiptNo || ""));
  const room = i => Math.max(0, (Number(i.amount) || 0) - i.covered), put = (i, p, a) => { if (a <= 0.0001) return; i.covered = Math.round((i.covered + a) * 100) / 100; i.pays.push({p, amount: a}); };
  const pool = [];
  live.forEach(p => { let left = Number(p.amount) || 0; const t = p.inst && sched.find(i => i.key === p.inst);
    if (t) { const a = Math.min(left, room(t)); put(t, p, a); left = Math.round((left - a) * 100) / 100; }
    if (left > 0.0001) pool.push({p, left}); });
  pool.forEach(x => { for (const i of sched) { if (x.left <= 0.0001) break; const a = Math.min(x.left, room(i)); put(i, x.p, a); x.left = Math.round((x.left - a) * 100) / 100; } });
  sched.forEach(i => { i.st = i.covered >= (Number(i.amount) || 0) - 0.001 ? "paid" : i.due <= today() ? "late" : i.covered > 0 ? "part" : "due"; });
  return {net, paid, remaining, overdue, status, next, sched};
}
const FST = {none: "بدون خطة", paid: "مسدد", ok: "منتظم", late: "متأخر"};
const FST_PILL = {none: "", paid: "p", ok: "e", late: "a"};
const INST_ST = {paid: "مدفوع", late: "متأخر", part: "مدفوع جزئياً", due: "قادم"};
const INST_PILL = {paid: "p", late: "a", part: "l", due: ""};
const paysOf = num => (S.pays || []).filter(p => p.num === num);

function adminFinance(el){
  let t = S.finTab || "sum";
  const nW = fReqWaiting();
  const tabs = [["sum", "الملخص"], ["req", "طلبات الطلاب" + (nW ? ` (${nW})` : "")], ["acc", "حسابات الطلاب"], ["pay", "الدفعات"], ["rcpt", "الإيصالات"], ["late", "المتأخرين"], ["exp", "المصروفات"], ["sal", "رواتب المدربين"], ["part", "الشركاء والعمولات"], ["rep", "التقرير الشهري"], ["hrpay", "رواتب الموظفين"], ...(FIN() ? [["tasks", "مهام الجهة الرقابية" + taskBadge()], ["sreq", "طلبات الإجازة" + srBadge()], ["sign", "طلبات التوقيع"], ["memo", "المراسلات" + memoBadge()], ["mail", "البريد" + mailBadge()]] : []), ...(RO() ? [] : [["set", "الإعدادات"]])];
  if (RO()) { const keep = ["sum", "acc", "pay", "rcpt", "late", "exp", "sal", "part", "rep", "hrpay"]; for (let i = tabs.length - 1; i >= 0; i--) if (!keep.includes(tabs[i][0])) tabs.splice(i, 1); if (!keep.includes(S.finTab || "sum")) S.finTab = "sum"; t = S.finTab || "sum"; }
  el.innerHTML = `<div class="card" style="padding:10px 12px"><div class="tabs" style="border:0;padding:0">${tabs.map(([k, v]) => `<button class="tab ${t === k ? "on" : ""}" data-ft="${k}">${v}</button>`).join("")}</div></div><div id="fb"></div>`;
  el.querySelectorAll("[data-ft]").forEach(b => b.onclick = () => { S.finTab = b.dataset.ft; render(); });
  if (!S.finSet) { $("#fb").innerHTML = `<div class="card"><p class="muted" style="margin:0">جاري التحميل…</p></div>`; return; }
  ({sum: finSummary, req: finReqTab, acc: finAccounts, pay: finPayments, rcpt: finReceipts, late: finLate, exp: finExpenses, sal: finSalaries, part: finPartners, rep: finReport, sign: signRequests, memo: memosTab, mail: mailTab, set: finSettings, tasks: tasksTab, hrpay: finHrPay, sreq: staffReqsView})[S.finTab || "sum"]($("#fb"));
}
/* employees' payroll sheets sent by human resources (attendance deductions already applied) */
function finHrPay(el){
  if (!S._finPay) { S._finPay = []; getDocs(collection(db, "hrPayroll")).then(sn => { S._finPay = sn.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => b.id.localeCompare(a.id)); if (S.finTab === "hrpay" || S.aTab === "finance") render(); })
    .catch(e => { console.error(e); toast("تعذّر تحميل كشوف الرواتب — حدّث قواعد Firebase"); }); }
  const L = S._finPay || [], open = S._finPayOpen || (L[0] || {}).id;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">رواتب الموظفين</h2><button class="btn sm" id="fpR">تحديث</button></div>
    <p class="muted" style="margin:6px 0 0">الكشوف ترسلها الموارد البشرية من «التقرير الشهري والرواتب»، والخصومات (الغياب والتأخير والإجازة بدون راتب) محسوبة من البصمة. بعد ما تصرف الرواتب اضغط «تم الصرف».</p></div>
  ${L.map(p => `<details class="card" ${p.id === open ? "open" : ""} data-fpo="${esc(p.id)}"><summary style="cursor:pointer"><b>${esc(p.month)}</b> · ${p.count} موظف · الصافي <b>${SAR(p.total)}</b> <span class="pill ${p.status === "paid" ? "p" : "l"}">${p.status === "paid" ? "انصرف ✓" : "بانتظار الصرف"}</span></summary>
    <div class="tbl" style="margin-top:8px"><table><thead><tr><th>الموظف</th><th>الوظيفة</th><th>الأساسي</th><th>البدلات</th><th>غياب</th><th>تأخير (د)</th><th>بدون راتب</th><th>الخصم</th><th>الصافي</th></tr></thead><tbody>${(p.rows || []).map(r => `<tr><td class="nm">${esc(r.name)}</td><td>${esc(r.job)}</td><td>${SAR(r.sal)}</td><td>${SAR(r.al)}</td><td>${r.absent}</td><td>${r.lateMin}</td><td>${r.unpaid}</td><td${r.ded ? ` style="color:#B3261E"` : ""}>${SAR(r.ded)}</td><td><b>${SAR(r.net)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="muted">أرسلته ${esc(p.by || "")} · ${esc(fmtIso(p.at))}${p.paidAt ? ` · انصرف ${esc(fmtIso(p.paidAt))} (${esc(p.paidBy || "")})` : ""}</p>
    <div class="row" style="gap:6px"><button class="btn sm" data-fpx="${esc(p.id)}">Excel</button>${p.status !== "paid" && !RO() ? `<button class="btn sm pri" data-fpp="${esc(p.id)}">تم الصرف</button>` : ""}</div></details>`).join("") || `<div class="card empty">ما وصل كشف رواتب من الموارد البشرية للحين.</div>`}`;
  $("#fpR").onclick = () => { S._finPay = null; render(); };
  el.querySelectorAll("[data-fpo]").forEach(d => d.ontoggle = () => { if (d.open) S._finPayOpen = d.dataset.fpo; });
  el.querySelectorAll("[data-fpx]").forEach(b => b.onclick = () => { const p = L.find(x => x.id === b.dataset.fpx);
    excelDownload(`رواتب الموظفين ${p.month}`, [{title: p.month, rows: [[INST_AR], [`كشف رواتب الموظفين · ${p.month}`], [], ["الموظف", "الوظيفة", "القسم", "الأساسي", "البدلات", "أيام الغياب", "دقائق التأخير", "أيام بدون راتب", "خصم الغياب", "خصم التأخير", "خصم بدون راتب", "إجمالي الخصم", "الصافي"],
      ...(p.rows || []).map(r => [r.name, r.job, r.dept, r.sal, r.al, r.absent, r.lateMin, r.unpaid, r.absDed, r.lateDed, r.unpaidDed, r.ded, r.net]), [], ["الإجمالي", "", "", "", "", "", "", "", "", "", "", "", p.total]], widths: [24, 16, 14, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12]}]); });
  el.querySelectorAll("[data-fpp]").forEach(b => b.onclick = async () => { const p = L.find(x => x.id === b.dataset.fpp); if (!confirm(`تأكيد صرف رواتب ${p.month} (${SAR(p.total)})؟`)) return;
    try { const v = {status: "paid", paidAt: new Date().toISOString(), paidBy: ROLES[S.adminRole] || S.adminRole}; await setDoc(ref("hrPayroll/" + p.id), v, {merge: true}); Object.assign(p, v); logAction("صرف رواتب الموظفين", `${p.month} · ${SAR(p.total)}`); toast("تم ✓"); render(); } catch (x) { handleWriteErr(x); } });
}
function finRows(){
  return Object.values(S.students).map(s => { const acc = (S.finAcc || {})[s.num]; return {s, acc, st: acc ? accStatus(acc, paysOf(s.num)) : {net: 0, paid: 0, remaining: 0, overdue: 0, status: "none"}}; });
}
function finSummary(el){
  const rows = finRows(), m = today().slice(0, 7);
  const sum = k => rows.reduce((a, r) => a + r.st[k], 0);
  const monthPaid = (S.pays || []).filter(p => !p.void && (p.date || "").startsWith(m)).reduce((a, p) => a + Number(p.amount), 0);
  const progs = (S.finSet.programs || []).map(pr => { const rs = rows.filter(r => r.acc && r.acc.program === pr.id); return {pr, n: rs.length, net: rs.reduce((a, r) => a + r.st.net, 0), paid: rs.reduce((a, r) => a + r.st.paid, 0)}; });
  const methods = {}; (S.pays || []).filter(p => !p.void).forEach(p => methods[p.method] = (methods[p.method] || 0) + Number(p.amount));
  el.innerHTML = `<div class="card"><h2>الملخص المالي</h2>
    <div class="stats">
      <div class="stat"><div class="n">${SAR(sum("net"))}</div><div class="l">إجمالي المستحق</div></div>
      <div class="stat"><div class="n">${SAR(sum("paid"))}</div><div class="l">المحصّل</div></div>
      <div class="stat"><div class="n">${SAR(sum("remaining"))}</div><div class="l">المتبقي</div></div>
      <div class="stat"><div class="n" style="color:var(--abs)">${SAR(sum("overdue"))}</div><div class="l">متأخر السداد (${rows.filter(r => r.st.status === "late").length} طالب)</div></div>
      <div class="stat"><div class="n">${SAR(monthPaid)}</div><div class="l">محصّل هذا الشهر</div></div>
      <div class="stat"><div class="n">${SAR(monthFlow(m).out)}</div><div class="l">مصروف هذا الشهر</div></div>
      <div class="stat"><div class="n" style="color:${monthFlow(m).net < 0 ? "var(--abs)" : "var(--green)"}">${SAR(monthFlow(m).net)}</div><div class="l">صافي هذا الشهر</div></div>
      <div class="stat"><div class="n">${rows.filter(r => r.st.status === "none").length}</div><div class="l">طلاب بدون خطة سداد</div></div>
    </div></div>
  <div class="card"><h2>حسب البرنامج</h2>${progs.length ? `<div class="tbl"><table><thead><tr><th class="nm">البرنامج</th><th>الطلاب</th><th>المستحق</th><th>المحصّل</th><th>النسبة</th></tr></thead><tbody>${progs.map(x => `<tr><td class="nm">${esc(x.pr.name)}</td><td>${x.n}</td><td>${SAR(x.net)}</td><td>${SAR(x.paid)}</td><td>${x.net ? Math.round(x.paid / x.net * 100) : 0}%</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">أضف البرامج ورسومها من "البرامج والرسوم".</p>`}</div>
  <div class="card"><h2>حسب طريقة الدفع</h2>${Object.keys(methods).length ? `<div class="list">${Object.entries(methods).map(([k, v]) => `<div class="item"><span class="grow">${esc(k)}</span><b>${SAR(v)}</b></div>`).join("")}</div>` : `<p class="muted" style="margin:0">ما فيه دفعات بعد.</p>`}</div>`;
}
function finAccounts(el){
  const progName = id => ((S.finSet.programs || []).find(p => p.id === id) || {}).name || "—";
  el.innerHTML = `<div class="card"><h2>حسابات الطلاب</h2><div class="row"><input type="text" id="faQ" class="grow" placeholder="ابحث بالاسم أو الرقم"><select id="faF" style="width:auto"><option value="">الكل</option>${Object.entries(FST).map(([k, v]) => `<option value="${k}" ${S.faF === k ? "selected" : ""}>${v}</option>`).join("")}</select></div></div><div class="list" id="faL"></div>`;
  const draw = () => {
    const q = norm($("#faQ").value), f = $("#faF").value; S.faF = f;
    const rows = finRows().filter(r => (!q || norm(r.s.name).includes(q) || r.s.num.includes(q)) && (!f || r.st.status === f)).sort((a, b) => a.s.num.localeCompare(b.s.num));
    $("#faL").innerHTML = rows.slice(0, 200).map(r => `<div class="item"><div class="grow"><div class="t">${esc(r.s.name)} <span class="muted">${esc(r.s.num)}</span></div>
      <div class="muted">${r.acc ? `${esc(progName(r.acc.program))} · ${PLANS[r.acc.plan] || ""}` : "ما انفتح له حساب"}</div></div>
      ${r.acc ? `<span class="muted">مدفوع ${SAR(r.st.paid)} من ${SAR(r.st.net)}</span>` : ""}<span class="pill ${FST_PILL[r.st.status]}">${FST[r.st.status]}${r.st.overdue ? " · " + SAR(r.st.overdue) : ""}</span>
      <button class="btn sm ${r.acc ? "" : "gold"}" data-fa="${esc(r.s.num)}">${r.acc ? "فتح" : "فتح حساب"}</button></div>`).join("") || `<div class="card empty">ما فيه نتائج</div>`;
    $("#faL").querySelectorAll("[data-fa]").forEach(b => b.onclick = () => openFinAccount(b.dataset.fa));
  };
  draw(); $("#faQ").oninput = draw; $("#faF").onchange = draw;
}
function openFinAccount(num){
  const s = S.students[num]; if (!s) return;
  S._modalGroup = null; S._finModal = num;
  const acc = clone((S.finAcc || {})[num] || {num, name: s.name, program: "", fee: 0, discount: 0, discountNote: "", plan: "full", start: today(), months: 4, installments: [], phone: ""});
  const progs = S.finSet.programs || [];
  const draw = () => {
    const st = accStatus(acc, paysOf(num)), pays = paysOf(num).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    /* which payments covered which installment: payments fill the schedule in date order */
    const instCell = (i, k) => {
      const left = Math.max(0, Math.round((Number(i.amount) - i.covered) * 100) / 100);
      // a payment bigger than one installment covers several: each row says how much it took from that receipt
      const part = x => Math.abs(x.amount - Number(x.p.amount)) > 0.01 ? `<div class="muted" style="font-size:12px;white-space:nowrap">${SAR(x.amount)} من سند ${SAR(x.p.amount)}</div>` : "";
      return i.pays.map(x => { const p = x.p; return `<span style="display:inline-block;margin:2px">` + (p.hasImg ? `<button class="btn sm" data-rview="payments:${esc(p.id)}" title="سند ${esc(p.receiptNo)}">إيصال ${esc(p.receiptNo.split("-")[1] || "")}</button>` : `<span class="muted" style="font-size:12px">سند ${esc(p.receiptNo)} بدون إيصال</span>`) + part(x) + `</span>`; }).join(" ")
        + (left > 0 && (S.finAcc || {})[num] ? ` <button class="btn sm gold" data-payinst="${left}" data-instkey="${esc(i.key)}" data-instlbl="${esc(instName(i, st.sched))}">تسجيل الدفعة</button>` : "");
    };
    $("#modalBox").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">${esc(s.name)} · ${esc(num)}</h2><button class="btn sm" id="fx">إغلاق</button></div>
    <div class="stats"><div class="stat"><div class="n">${SAR(st.net)}</div><div class="l">الصافي</div></div><div class="stat"><div class="n">${SAR(st.paid)}</div><div class="l">مدفوع</div></div><div class="stat"><div class="n">${SAR(st.remaining)}</div><div class="l">متبقي</div></div><div class="stat"><div class="n" style="color:${st.overdue ? "var(--abs)" : "inherit"}">${SAR(st.overdue)}</div><div class="l">متأخر</div></div></div>
    <div class="card" style="background:var(--bg)"><h3>خطة السداد</h3>
      <div class="row">
        <label class="f grow" for="fP">البرنامج<select id="fP"><option value="">اختر البرنامج</option>${progs.map(p => `<option value="${esc(p.id)}" ${acc.program === p.id ? "selected" : ""}>${esc(p.name)} · ${SAR(p.fee)}</option>`).join("")}</select></label>
        <label class="f" for="fFee" style="width:130px">الرسوم<input type="number" id="fFee" min="0" value="${acc.fee || ""}"></label>
        <label class="f" for="fDis" style="width:120px">الخصم<input type="number" id="fDis" min="0" value="${acc.discount || ""}"></label>
        <label class="f grow" for="fDisN">سبب الخصم<input type="text" id="fDisN" value="${esc(acc.discountNote || "")}" placeholder="مثل: شراكة جامعة حائل"></label>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="f grow" for="fPl">طريقة السداد<select id="fPl">${Object.entries(PLANS).map(([k, v]) => `<option value="${k}" ${acc.plan === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f" for="fSt" style="width:160px">تاريخ أول دفعة<input type="date" id="fSt" value="${esc(acc.start || today())}"></label>
        <label class="f" for="fMo" style="width:110px;${acc.plan === "monthly" ? "" : "display:none"}">عدد الأشهر<input type="number" id="fMo" min="2" max="60" value="${acc.months || 4}"></label>
        <label class="f" for="fSec" style="width:160px;${acc.plan === "half" ? "" : "display:none"}">موعد الدفعة الثانية<input type="date" id="fSec" value="${esc(acc.second || "")}"></label>
        <button class="btn sm" id="fGen" style="align-self:flex-end">توليد الجدول</button>
      </div>
      ${acc.plan === "qasima" ? `<p class="muted">الطالب يقسّط مع قسيمة بلس، والمعهد يستلم المبلغ كامل. سجّل الدفعة بطريقة "قسيمة بلس" لما يوصل المبلغ.</p>` : ""}
      <div class="row" style="margin-top:8px">
        <label class="f grow" for="fPh">جوال للتذكير (الطالب أو ولي الأمر)<input type="tel" id="fPh" dir="ltr" value="${esc(acc.phone || "")}" placeholder="05xxxxxxxx"></label>
        <label class="f grow" for="fPar">سجّل عن طريق (للعمولة)<select id="fPar"><option value="">بدون شريك</option>${(S.finSet.partners || []).map(p => `<option value="${esc(p.id)}" ${acc.partner === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      </div>
      <div class="tbl" style="margin-top:10px"><table><thead><tr><th>القسط</th><th>الاستحقاق (تقدر تغيّره)</th><th>المبلغ</th><th>الحالة</th><th>الإيصال</th></tr></thead><tbody>
        ${st.sched.map((i, k) => i.xi !== undefined ? `<tr><td>${esc(i.label)}</td><td>${dH(i.due)}</td><td>${SAR(i.amount)}</td><td><span class="pill ${INST_PILL[i.st]}">${INST_ST[i.st]}</span></td><td>${instCell(i, k)}</td></tr>` : `<tr><td><b>${esc(instName(i, st.sched))}</b></td><td><input type="date" data-idue="${i.ix}" value="${esc(i.due)}" style="width:150px;padding:4px"></td><td><input type="number" data-iamt="${i.ix}" value="${i.amount}" style="width:110px;padding:4px"></td><td><span class="pill ${INST_PILL[i.st]}">${INST_ST[i.st]}</span></td><td>${instCell(i, k)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">اضغط "توليد الجدول"</td></tr>`}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="fSave">حفظ الحساب</button><span class="muted" id="fChk"></span></div>
    </div>
    <div class="card" style="background:var(--bg)"><h3>رسوم إضافية</h3>
      <div class="list">${(acc.extras || []).map((x, i) => `<div class="item" style="padding:8px 12px"><span class="grow">${esc(x.label)} · ${dH(x.date)}</span><b>${SAR(x.amount)}</b><button class="btn sm danger" data-xdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه رسوم إضافية</span>`}</div>
      <div class="row" style="margin-top:8px"><select id="xT" class="grow"><option value="">نوع الرسوم</option>${(S.finSet.extraTypes || []).map(t => `<option value="${esc(t.name)}" data-fee="${t.fee}">${esc(t.name)} · ${SAR(t.fee)}</option>`).join("")}<option value="_o">أخرى…</option></select>
        <input type="text" id="xL" placeholder="اسم الرسوم" style="width:150px;display:none"><input type="number" id="xA" min="0" placeholder="المبلغ" style="width:110px"><input type="date" id="xD" value="${today()}" style="width:150px">
        <button class="btn sm gold" id="xAdd" ${(S.finAcc || {})[num] ? "" : "disabled"}>+ إضافة</button></div>
    </div>
    <div class="card" style="background:var(--bg)"><h3>تسجيل دفعة</h3>
      <div class="row">
        <label class="f" for="pAmt" style="width:130px">المبلغ<input type="number" id="pAmt" min="0" step="0.01" value="${st.next ? Math.max(0, Math.min(st.remaining, st.overdue || st.next.amount)) : st.remaining || ""}"></label>
        <label class="f" for="pM" style="width:170px">الطريقة<select id="pM">${METHODS.map(m => `<option ${acc.plan === "qasima" && m === "قسيمة بلس" ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label class="f" for="pD" style="width:160px">التاريخ<input type="date" id="pD" value="${today()}" max="${today()}"></label>
        <label class="f grow" for="pRef">رقم العملية / المرجع<input type="text" id="pRef"></label>
        <label class="f" for="pInst" style="width:170px">عن أي قسط<select id="pInst"><option value="">تلقائي (الأقدم أول)</option>${st.sched.map(i => `<option value="${esc(i.key)}">${esc(instName(i, st.sched))}</option>`).join("")}</select></label>
      </div>
      <div class="row" style="margin-top:8px"><label class="f grow" for="pN">ملاحظة<input type="text" id="pN"></label><label class="f grow" for="pImg">الإيصال: صورة أو PDF (اختياري)<input type="file" id="pImg" accept="image/*,application/pdf,.pdf"></label></div>
      <div class="row" style="margin-top:8px"><button class="btn gold" id="pAdd" ${(S.finAcc || {})[num] ? "" : "disabled"}>تسجيل الدفعة وطباعة السند</button>${(S.finAcc || {})[num] ? "" : `<span class="muted">احفظ الحساب أول</span>`}</div>
    </div>
    <div><h3>الدفعات (${pays.length})</h3><div class="list">${pays.map(p => `<div class="item" style="${p.void ? "opacity:.55" : ""}"><div class="grow"><div class="t">${SAR(p.amount)} · ${esc(p.method)}</div><div class="muted">سند ${esc(p.receiptNo)} · ${dH(p.date)}${p.ref ? " · " + esc(p.ref) : ""}${p.void ? " · ملغى: " + esc(p.voidReason || "") : ""}</div></div>
      ${p.void ? "" : `<select data-pinst="${esc(p.id)}" title="عن أي قسط" style="width:auto;padding:4px 6px;font-size:13px"><option value="">القسط: تلقائي</option>${st.sched.map(i => `<option value="${esc(i.key)}" ${p.inst === i.key ? "selected" : ""}>${esc(instName(i, st.sched))}</option>`).join("")}</select>
      <button class="btn sm" data-pdate="${esc(p.id)}">تعديل التاريخ</button>`}
      ${rcptBtns("payments", p)}<button class="btn sm" data-prc="${esc(p.id)}">السند</button>${p.void ? `<button class="btn sm gold" data-pres="${esc(p.id)}">استرجاع</button>` : `<button class="btn sm danger" data-pv="${esc(p.id)}">إلغاء</button>`}</div>`).join("") || `<span class="muted">ما فيه دفعات</span>`}</div></div>
    <div class="row"><button class="btn sm" id="fStmt">كشف حساب PDF</button>${acc.phone ? `<a class="btn sm gold" target="_blank" rel="noopener" href="https://wa.me/${normPhone(acc.phone)}?text=${encodeURIComponent(finReminder(s, st))}">تذكير واتساب</a>` : ""}</div>`;
    $("#fx").onclick = () => { S._finModal = null; closeModal(); };
    const readForm = () => { acc.program = $("#fP").value; acc.fee = Number($("#fFee").value) || 0; acc.discount = Number($("#fDis").value) || 0; acc.discountNote = $("#fDisN").value.trim(); acc.plan = $("#fPl").value; acc.start = $("#fSt").value; acc.months = Number($("#fMo").value) || 4; acc.second = $("#fSec").value; acc.phone = $("#fPh").value.trim(); acc.partner = $("#fPar").value;
      document.querySelectorAll("[data-idue]").forEach(x => { const k = Number(x.dataset.idue); if (acc.installments[k]) acc.installments[k].due = x.value; });
      document.querySelectorAll("[data-iamt]").forEach(x => { const k = Number(x.dataset.iamt); if (acc.installments[k]) acc.installments[k].amount = Number(x.value) || 0; }); };
    $("#xT").onchange = () => { const o = $("#xT").selectedOptions[0]; $("#xL").style.display = $("#xT").value === "_o" ? "" : "none"; if (o && o.dataset.fee) $("#xA").value = o.dataset.fee; };
    const saveExtras = async (list, msg) => { try { await setDoc(ref("finAccounts/" + num), {extras: list}, {merge: true}); acc.extras = list; S.finAcc[num] = {...S.finAcc[num], extras: list}; logAction(msg, s.name); toast("انحفظ"); draw(); } catch (e) { handleWriteErr(e); } };
    $("#xAdd").onclick = () => { const label = $("#xT").value === "_o" ? $("#xL").value.trim() : $("#xT").value, amount = Number($("#xA").value) || 0; if (!label || amount <= 0) return toast("اختر النوع واكتب المبلغ"); saveExtras([...(acc.extras || []), {label, amount, date: $("#xD").value || today()}], `رسوم إضافية: ${label} ${amount}`); };
    $("#modalBox").querySelectorAll("[data-xdel]").forEach(b => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } const l = [...(acc.extras || [])]; const [x] = l.splice(Number(b.dataset.xdel), 1); saveExtras(l, `حذف رسوم إضافية: ${x.label}`); });
    $("#fP").onchange = () => { readForm(); const p = progs.find(x => x.id === acc.program); if (p) acc.fee = Number(p.fee) || 0; draw(); };
    $("#fPl").onchange = () => { readForm(); acc.installments = buildPlan(Math.max(0, acc.fee - acc.discount), acc.plan, acc.start, acc.months, acc.second); draw(); };
    $("#fGen").onclick = () => { readForm(); acc.installments = buildPlan(Math.max(0, acc.fee - acc.discount), acc.plan, acc.start, acc.months, acc.second); draw(); };
    $("#fSave").onclick = async () => {
      readForm();
      const net = Math.max(0, acc.fee - acc.discount), sumI = Math.round(acc.installments.reduce((a, i) => a + i.amount, 0) * 100) / 100;
      if (!acc.fee) return toast("حدد الرسوم");
      if (!acc.installments.length) acc.installments = buildPlan(net, acc.plan, acc.start, acc.months, acc.second);
      else if (Math.abs(sumI - net) > 0.01) return toast(`مجموع الدفعات ${SAR(sumI)} لازم يساوي الصافي ${SAR(net)}`);
      acc.num = num; acc.name = s.name; acc.updatedAt = new Date().toISOString();
      try { await setDoc(ref("finAccounts/" + num), acc); S.finAcc[num] = clone(acc); logAction("حفظ حساب مالي", `${s.name} · ${PLANS[acc.plan]} · ${SAR(net)}`); toast("انحفظ الحساب"); draw(); }
      catch (e) { handleWriteErr(e); }
    };
    $("#pAdd").onclick = async () => {
      const amount = Math.round((Number($("#pAmt").value) || 0) * 100) / 100;
      if (amount <= 0) return toast("اكتب المبلغ");
      if (amount > st.remaining + 0.01) return toast(`المبلغ أكبر من المتبقي (${SAR(st.remaining)})`);
      const w = openPrint(); if (!w) return;
      let img = null; try { img = await pickedImg("#pImg"); } catch (e) { w.close(); return rcptErr(e); }
      const pay = {...($("#pInst").value ? {inst: $("#pInst").value} : {}), num, name: s.name, amount, method: $("#pM").value, date: $("#pD").value || today(), ref: $("#pRef").value.trim(), note: $("#pN").value.trim(), program: acc.program, by: S.adminRole, void: false};
      try {
        const id = "p-" + uid() + uid();
        await runTransaction(db, async tx => {
          const c = await tx.get(ref("fin/counter")); const n = ((c.exists() && c.data().last) || 0) + 1;
          pay.receiptNo = `${today().slice(0, 4)}-${String(n).padStart(5, "0")}`;
          tx.set(ref("fin/counter"), {last: n}); tx.set(ref("payments/" + id), {...pay, ...(img ? {hasImg: true} : {}), at: serverTimestamp()});
          if (img) tx.set(ref("receipts/" + id), {img, coll: "payments", at: new Date().toISOString(), by: S.adminRole});
        });
        logAction("تسجيل دفعة", `${s.name} · ${SAR(amount)} · سند ${pay.receiptNo}`);
        const after = Math.max(0, Math.round((st.remaining - amount) * 100) / 100);
        fillPrintFin(w, `سند قبض ${pay.receiptNo}`, [{html: receiptHTML({...pay, id}, acc, [...paysOf(num).filter(x => x.id !== id), {...pay, id}])}]);
        toast("انسجلت الدفعة"); if ($("#pImg")) $("#pImg").value = ""; draw();
      } catch (e) { w.close(); handleWriteErr(e); }
    };
    bindRcpt($("#modalBox"));
    $("#modalBox").querySelectorAll("[data-payinst]").forEach(b => b.onclick = () => {
      $("#pAmt").value = b.dataset.payinst; $("#pN").value = b.dataset.instlbl; $("#pInst").value = b.dataset.instkey || "";
      $("#pAmt").closest(".card").scrollIntoView({behavior: "smooth", block: "center"});
      $("#pImg").focus(); toast("المبلغ جاهز، أرفق صورة الإيصال واضغط تسجيل الدفعة");
    });
    $("#modalBox").querySelectorAll("[data-prc]").forEach(b => b.onclick = () => { const p = pays.find(x => x.id === b.dataset.prc); const w = openPrint(); fillPrintFin(w, `سند قبض ${p.receiptNo}`, [{html: receiptHTML(p, acc, paysOf(num))}]); });
    $("#modalBox").querySelectorAll("[data-pv]").forEach(b => b.onclick = async () => {
      const reason = b.dataset.sure ? ($("#pvR") || {}).value : "";
      if (!b.dataset.sure) { b.dataset.sure = 1; b.insertAdjacentHTML("beforebegin", `<input type="text" id="pvR" placeholder="سبب الإلغاء" style="width:160px">`); b.textContent = "تأكيد الإلغاء"; return; }
      if (!reason || !reason.trim()) return toast("اكتب سبب الإلغاء");
      try { await setDoc(ref("payments/" + b.dataset.pv), {void: true, voidReason: reason.trim(), voidBy: S.adminRole, voidAt: new Date().toISOString()}, {merge: true}); logAction("إلغاء دفعة", `${s.name} · ${reason.trim()}`); toast("انلغت الدفعة"); }
      catch (e) { handleWriteErr(e); }
    });
    $("#modalBox").querySelectorAll("[data-pinst]").forEach(sl => sl.onchange = async () => {
      const p = pays.find(x => x.id === sl.dataset.pinst), v = sl.value, nm = v ? sl.selectedOptions[0].textContent : "تلقائي";
      try { await setDoc(ref("payments/" + p.id), {inst: v}, {merge: true}); p.inst = v; logAction("تحديد قسط دفعة", `${s.name} · سند ${p.receiptNo} ← ${nm}`); toast("انحفظ: " + nm); draw(); } catch (e) { handleWriteErr(e); }
    });
    $("#modalBox").querySelectorAll("[data-pdate]").forEach(b => b.onclick = () => {
      if (!b.dataset.open) { b.dataset.open = 1; b.insertAdjacentHTML("beforebegin", `<input type="date" id="pdv-${b.dataset.pdate}" value="${esc((pays.find(x => x.id === b.dataset.pdate) || {}).date || today())}" max="${today()}" style="width:150px">`); b.textContent = "حفظ التاريخ"; return; }
      const p = pays.find(x => x.id === b.dataset.pdate), v = ($("#pdv-" + p.id) || {}).value;
      if (!v || v > today()) return toast("اختر تاريخ صحيح"); if (v === p.date) return draw();
      setDoc(ref("payments/" + p.id), {date: v, dateWas: p.dateWas || p.date || "", dateBy: S.adminRole, dateAt: new Date().toISOString()}, {merge: true})
        .then(() => { logAction("تعديل تاريخ دفعة", `${s.name} · سند ${p.receiptNo} · ${p.date} ← ${v}`); toast("انعدّل التاريخ"); draw(); }).catch(handleWriteErr);
    });
    $("#modalBox").querySelectorAll("[data-pres]").forEach(b => b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟ ترجع الدفعة محسوبة"; return; }
      const p = pays.find(x => x.id === b.dataset.pres);
      try { await setDoc(ref("payments/" + p.id), {void: false, restoredBy: S.adminRole, restoredAt: new Date().toISOString()}, {merge: true}); logAction("استرجاع دفعة ملغاة", `${s.name} · سند ${p.receiptNo} · ${SAR(p.amount)}`); toast("رجعت الدفعة"); }
      catch (e) { handleWriteErr(e); }
    });
    $("#fStmt").onclick = () => { const w = openPrint(); fillPrintFin(w, `كشف حساب ${s.name}`, [{html: statementHTML(s, acc, accStatus(acc, paysOf(num)), paysOf(num))}]); };
  };
  $("#modal").classList.add("on");
  draw();
  S._finDraw = draw;
}
function finReminder(s, st){
  return `السلام عليكم ${s.name}\nالرقم الأكاديمي: ${s.num}\n\nنذكّركم بسداد المستحقات الدراسية.\nالمتأخر: ${SAR(st.overdue)}\nالمتبقي الكلي: ${SAR(st.remaining)}${st.next ? `\nالدفعة القادمة: ${SAR(st.next.amount)} بتاريخ ${st.next.due}` : ""}\n\nالمالية\n${INST_AR}`;
}
/* the receipt shows the account as it stood right after this payment: total, paid so far, remaining */
function receiptHTML(p, acc, allPays){
  const key = x => `${x.date || ""}|${x.receiptNo || ""}`;
  const net = accStatus(acc, []).net;
  const paidSoFar = Math.round((allPays || []).filter(x => !x.void && x.id !== p.id && key(x) <= key(p)).reduce((a, x) => a + Number(x.amount || 0), 0) * 100) / 100 + (p.void ? 0 : Number(p.amount || 0));
  const after = Math.max(0, Math.round((net - paidSoFar) * 100) / 100);
  const prog = ((S.finSet && S.finSet.programs) || []).find(x => x.id === (p.program || acc.program));
  return `<h1>سند قبض</h1>
  <div class="info"><div><b>رقم السند:</b> ${esc(p.receiptNo || "—")}</div><div><b>التاريخ:</b> ${esc(bothDates(p.date))}</div></div>
  ${p.void ? `<p style="color:#B3261E;font-weight:700;font-size:16px;text-align:center">سند ملغى · ${esc(p.voidReason || "")}</p>` : ""}
  <table><tbody>
    <tr><td class="n" style="width:30%"><b>استلمنا من</b></td><td class="n">${esc(p.name)} · الرقم الأكاديمي ${esc(p.num)}</td></tr>
    <tr><td class="n"><b>مبلغ وقدره</b></td><td class="n" style="font-size:16px"><b>${SAR(p.amount)}</b></td></tr>
    <tr><td class="n"><b>طريقة الدفع</b></td><td class="n">${esc(p.method)}${p.ref ? " · مرجع: " + esc(p.ref) : ""}</td></tr>
    <tr><td class="n"><b>وذلك عن</b></td><td class="n">رسوم ${esc(prog ? prog.name : "البرنامج التدريبي")}${p.note ? " · " + esc(p.note) : ""}</td></tr>
    <tr><td class="n"><b>المبلغ الإجمالي</b></td><td class="n">${SAR(net)}${acc.discount ? ` <span style="color:#666;font-size:11px">(بعد خصم ${SAR(acc.discount)})</span>` : ""}</td></tr>
    <tr><td class="n"><b>المبلغ المسدَّد</b></td><td class="n">${SAR(paidSoFar)} <span style="color:#666;font-size:11px">(شامل هذه الدفعة)</span></td></tr>
    <tr><td class="n"><b>المبلغ المتبقي</b></td><td class="n"><b>${SAR(after)}</b></td></tr>
  </tbody></table>
  <p style="font-size:10.5px;color:#666;margin-top:10px">سند قبض داخلي، وليس فاتورة ضريبية.</p>
  <div class="sig">${sigSlot("المحاسب", "finance")}${sigSlot("الختم", "", true)}</div>`;
}
function statementHTML(s, acc, st, pays){
  return `<h1>كشف حساب متدرب</h1>
  <div class="info"><div><b>الاسم:</b> ${esc(s.name)}</div><div><b>الرقم الأكاديمي:</b> ${esc(s.num)}</div><div><b>طريقة السداد:</b> ${PLANS[acc.plan] || ""}</div><div><b>الرسوم:</b> ${SAR(acc.fee)}${acc.discount ? ` · خصم ${SAR(acc.discount)}${acc.discountNote ? " (" + esc(acc.discountNote) + ")" : ""}` : ""}</div></div>
  <table><thead><tr><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th>المتأخر</th></tr></thead><tbody><tr><td>${SAR(st.net)}</td><td>${SAR(st.paid)}</td><td>${SAR(st.remaining)}</td><td>${SAR(st.overdue)}</td></tr></tbody></table>
  <h3 style="color:#1F5136">جدول الدفعات</h3><table><thead><tr><th>#</th><th>الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${st.sched.map((i, k) => `<tr><td>${i.label ? esc(i.label) : k + 1}</td><td>${dH(i.due)}</td><td>${SAR(i.amount)}</td><td>${INST_ST[i.st]}</td></tr>`).join("")}</tbody></table>
  <h3 style="color:#1F5136">الدفعات المستلمة</h3><table><thead><tr><th>السند</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>${pays.filter(p => !p.void).map(p => `<tr><td>${esc(p.receiptNo)}</td><td>${dH(p.date)}</td><td>${SAR(p.amount)}</td><td>${esc(p.method)}</td></tr>`).join("") || `<tr><td colspan="4">ما فيه دفعات</td></tr>`}</tbody></table>
  <div class="sig">${sigSlot("المالية", "finance")}${sigSlot("الختم", "", true)}</div>`;
}
function finPayments(el){
  const m = S.payM || today().slice(0, 7);
  const list = (S.pays || []).filter(p => (p.date || "").startsWith(m)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.receiptNo || "").localeCompare(a.receiptNo || ""));
  const tot = list.filter(p => !p.void).reduce((a, p) => a + Number(p.amount), 0);
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">الدفعات</h2><div class="row"><input type="month" id="payM" value="${esc(m)}" style="width:170px"><button class="btn sm" id="payX">تنزيل Excel</button></div></div>
    <p class="muted" style="margin:8px 0 0">${list.filter(p => !p.void).length} دفعة · المجموع <b>${SAR(tot)}</b></p></div>
  <div class="tbl"><table><thead><tr><th>السند</th><th>التاريخ</th><th class="nm">الطالب</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th></th></tr></thead><tbody>
  ${list.map(p => `<tr style="${p.void ? "opacity:.5;text-decoration:line-through" : ""}"><td>${esc(p.receiptNo)}</td><td>${dH(p.date)}</td><td class="nm">${esc(p.name)}</td><td>${SAR(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.ref || "")}</td><td>${p.hasImg ? `<button class="btn sm" data-rview="payments:${esc(p.id)}">الإيصال</button> ` : ""}<button class="btn sm" data-fo="${esc(p.num)}">الحساب</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">ما فيه دفعات في هذا الشهر</td></tr>`}</tbody></table></div>`;
  $("#payM").onchange = e => { S.payM = e.target.value; render(); };
  bindRcpt(el);
  el.querySelectorAll("[data-fo]").forEach(b => b.onclick = () => openFinAccount(b.dataset.fo));
  $("#payX").onclick = () => excelDownload(`الدفعات ${m}`, [{title: "الدفعات", rows: [[INST_AR], [`الدفعات · ${m}`], [], ["السند", "التاريخ", "الطالب", "الرقم", "المبلغ", "الطريقة", "المرجع", "الحالة"], ...list.map(p => [p.receiptNo, p.date, p.name, p.num, Number(p.amount), p.method, p.ref || "", p.void ? "ملغى" : "مستلم"]), [], ["", "", "المجموع", "", tot]], widths: [13, 12, 28, 11, 11, 14, 16, 9]}]);
}
function finLate(el){
  const all = finRows(), in3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const rows = all.filter(r => r.st.status === "late").sort((a, b) => b.st.overdue - a.st.overdue);
  const soon = all.filter(r => r.st.status === "ok" && r.st.next && r.st.next.due <= in3).sort((a, b) => a.st.next.due.localeCompare(b.st.next.due));
  const phoneOf = r => (r.acc && r.acc.phone) || (S.stPhones || {})[r.s.num] || "";
  const last = r => r.acc && r.acc.remindedAt ? `<span class="pill ${daysAgo(r.acc.remindedAt) < 7 ? "p" : ""}">ذُكّر ${daysAgo(r.acc.remindedAt) === 0 ? "اليوم" : `قبل ${daysAgo(r.acc.remindedAt)} يوم`}</span>` : `<span class="pill">ما ذُكّر</span>`;
  const wa = (r, text) => phoneOf(r) ? `<a class="btn sm gold" style="text-decoration:none" target="_blank" rel="noopener" data-rem="${esc(r.s.num)}" href="https://wa.me/${normPhone(phoneOf(r))}?text=${encodeURIComponent(text)}">تذكير واتساب</a>` : `<span class="pill">بدون جوال</span>`;
  const item = (r, info, text) => `<div class="item" style="flex-wrap:wrap"><div class="grow" style="min-width:min(100%,240px)"><div class="t">${esc(r.s.name)} <span class="muted">${esc(r.s.num)}</span></div><div class="muted">${info}</div></div>${last(r)}${wa(r, text)}<button class="btn sm" data-fo="${esc(r.s.num)}">الحساب</button></div>`;
  el.innerHTML = `<div class="card"><h2>المتأخرين عن السداد (${rows.length})</h2><p class="muted" style="margin:0">المجموع المتأخر: <b>${SAR(rows.reduce((a, r) => a + r.st.overdue, 0))}</b>. زر الواتساب يفتح رسالة جاهزة باسم الطالب والمبلغ، ويتسجل تاريخ التذكير.</p></div>
  <div class="list">${rows.map(r => item(r, `متأخر ${SAR(r.st.overdue)} · متبقي ${SAR(r.st.remaining)}`, finReminder(r.s, r.st))).join("") || `<div class="card empty">ما فيه متأخرين.</div>`}</div>
  ${soon.length ? `<div class="card" style="margin-top:14px"><h2>أقساط تستحق خلال 3 أيام (${soon.length})</h2><p class="muted" style="margin:0">تذكير ودّي قبل الموعد.</p></div>
  <div class="list">${soon.map(r => item(r, `${SAR(r.st.next.amount)} بتاريخ ${esc(r.st.next.due)}`, finSoonText(r.s, r.st))).join("")}</div>` : ""}`;
  el.querySelectorAll("[data-fo]").forEach(b => b.onclick = () => openFinAccount(b.dataset.fo));
  el.querySelectorAll("[data-rem]").forEach(a => a.addEventListener("click", () => { const n = a.dataset.rem; setDoc(ref("finAccounts/" + n), {remindedAt: today()}, {merge: true}).then(() => { if (S.finAcc[n]) S.finAcc[n].remindedAt = today(); logAction("تذكير سداد واتساب", (S.students[n] || {}).name || n); }).catch(() => {}); }));
}
const daysAgo = d => Math.max(0, Math.round((new Date(today()) - new Date(d)) / 864e5));
function finSoonText(s, st){
  return `السلام عليكم ${s.name}\nالرقم الأكاديمي: ${s.num}\n\nنذكّركم بموعد القسط القادم:\n${SAR(st.next.amount)} بتاريخ ${st.next.due}\nالمتبقي الكلي: ${SAR(st.remaining)}\n\nالمالية\n${INST_AR}`;
}
function finSettings(el){
  const progs = S.finSet.programs || [], canPay = ["admin", "academic"].includes(S.adminRole);
  el.innerHTML = `<div class="card"><h2>👁️ المالية عند الطلاب</h2>
    <p class="muted" style="margin-top:0">لو شلت الصح، يختفي تبويب «المالية والدفع» من بوابة كل الطلاب (رسومهم، الدفع، الفاتورة النهائية، الاستفسارات) لين ترجّعه — مفيد وقت تعديل الفواتير. بياناتكم ما تتأثر.</p>
    <label class="row" style="gap:8px"><input type="checkbox" id="finShow" ${finShown() ? "checked" : ""} ${canPay ? "" : "disabled"}> إظهار «المالية والدفع» للطلاب</label>
    ${canPay ? "" : `<p class="muted" style="margin:6px 0 0">الإظهار والإخفاء من حساب الإدارة العامة.</p>`}</div>
  <div class="card"><h2>💳 الدفع الإلكتروني (Tap)</h2>
    <p class="muted" style="margin-top:0">إذا تفعّل، يطلع للطالب في «المالية» زر يدفع فيه رسومه بمدى أو Apple Pay أو STC Pay أو البطاقة، وتنسجل الدفعة له تلقائياً بسند، ويوصلكم إشعار.</p>
    <label class="row" style="gap:8px"><input type="checkbox" id="payOn" ${(S.site || {}).payFees ? "checked" : ""} ${canPay ? "" : "disabled"}> تفعيل الدفع الإلكتروني للطلاب</label>
    ${canPay ? "" : `<p class="muted" style="margin:6px 0 0">التفعيل والإيقاف من حساب الإدارة العامة.</p>`}
    ${(S.site || {}).pushUrl ? "" : `<div class="notice err" style="margin-top:8px">لازم يُضبط رابط خدمة الإشعارات أول (تبويب النظام).</div>`}</div>
  <div class="card"><h2>البرامج والرسوم</h2>
    <div class="list">${progs.map((p, i) => `<div class="item"><span class="grow"><b>${esc(p.name)}</b></span><input type="number" data-pfee="${i}" value="${p.fee}" style="width:130px"><span class="muted">ر.س</span><button class="btn sm danger" data-pdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه برامج</span>`}</div>
    <div class="row" style="margin-top:10px"><input type="text" id="prN" class="grow" placeholder="اسم البرنامج، مثل: دبلوم القانون"><input type="number" id="prF" min="0" placeholder="الرسوم" style="width:130px"><button class="btn gold sm" id="prAdd">+ إضافة</button><button class="btn pri sm" id="prSave">حفظ الرسوم</button></div>
    <p class="muted">تغيير رسوم البرنامج ما يغيّر حسابات الطلاب المفتوحة من قبل.</p></div>
  <div class="card"><h2>أنواع الرسوم الإضافية</h2>
    <div class="list">${(S.finSet.extraTypes || []).map((t, i) => `<div class="item"><span class="grow"><b>${esc(t.name)}</b></span><span>${SAR(t.fee)}</span><button class="btn sm danger" data-etdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه أنواع. مثل: الشهادة، الحقيبة التدريبية، إعادة اختبار.</span>`}</div>
    <div class="row" style="margin-top:10px"><input type="text" id="etN" class="grow" placeholder="مثل: إعادة اختبار"><input type="number" id="etF" min="0" placeholder="المبلغ" style="width:130px"><button class="btn gold sm" id="etAdd">+ إضافة</button></div></div>
  <div class="card"><h2>الشركاء</h2>
    <p class="muted" style="margin-top:0">إعلاميين أو مدربين أو جهات يجيبون طلاب. اختر الشريك في حساب الطالب المالي، وتنحسب عمولته تلقائي.</p>
    <div class="list">${(S.finSet.partners || []).map((p, i) => `<div class="item"><div class="grow"><b>${esc(p.name)}</b> <span class="pill">${esc(p.type)}</span><div class="muted">${p.kind === "percent" ? `${p.value}% من المبلغ المحصّل من الطالب` : `${SAR(p.value)} عن كل طالب بعد أول دفعة`}${p.phone ? ` · <span dir="ltr">${esc(p.phone)}</span>` : ""}</div></div><button class="btn sm danger" data-ptdel="${i}">حذف</button></div>`).join("") || `<span class="muted">ما فيه شركاء</span>`}</div>
    <div class="row" style="margin-top:10px"><input type="text" id="ptN" class="grow" placeholder="اسم الشريك"><select id="ptT" style="width:auto"><option>إعلامي</option><option>مدرب</option><option>جهة</option><option>أخرى</option></select><input type="tel" id="ptP" dir="ltr" placeholder="الجوال" style="width:140px"></div>
    <div class="row" style="margin-top:8px"><select id="ptK" style="width:auto"><option value="fixed">مبلغ ثابت عن كل طالب</option><option value="percent">نسبة من المحصّل</option></select><input type="number" id="ptV" min="0" placeholder="المبلغ أو النسبة" style="width:150px"><button class="btn gold sm" id="ptAdd">+ إضافة شريك</button></div></div>`;
  el.insertAdjacentHTML("beforeend", sigCard("finance", "توقيع المالية", "يظهر على سندات القبض والصرف وكشوف الحساب والتقرير المالي."));
  bindSigCards(el);
  el.insertAdjacentHTML("beforeend", `<div class="card"><h2>استيراد الحسابات والدفعات من Excel</h2>
    <p class="muted" style="margin-top:0">ارفع ملف الاستيراد الجاهز. تطلع لك معاينة لكل طالب قبل ما ينحفظ أي شي. الاستيراد يعبّي الفاضي بس: ما يغيّر حساب موجود، وما يضيف دفعات لطالب عنده دفعات من قبل.</p>
    <input type="file" id="fiF" accept=".xlsx,.xls"><div id="fiOut"></div></div>`);
  $("#fiF").onchange = e => { const f = e.target.files[0]; if (f) finImportRead(f); };
  const saveKey = async (k, list, msg) => { try { await setDoc(ref("fin/settings"), {[k]: list}, {merge: true}); S.finSet[k] = list; logAction(msg, ""); toast("انحفظ"); render(); } catch (e) { handleWriteErr(e); } };
  $("#etAdd").onclick = () => { const name = $("#etN").value.trim(), fee = Number($("#etF").value); if (!name || !(fee > 0)) return toast("اكتب الاسم والمبلغ"); saveKey("extraTypes", [...(S.finSet.extraTypes || []), {name, fee}], "إضافة نوع رسوم: " + name); };
  el.querySelectorAll("[data-etdel]").forEach(b => b.onclick = () => { const l = clone(S.finSet.extraTypes || []); l.splice(Number(b.dataset.etdel), 1); saveKey("extraTypes", l, "حذف نوع رسوم"); });
  $("#ptAdd").onclick = () => { const name = $("#ptN").value.trim(), value = Number($("#ptV").value), kind = $("#ptK").value; if (!name || !(value > 0) || (kind === "percent" && value > 100)) return toast("اكتب الاسم والعمولة"); saveKey("partners", [...(S.finSet.partners || []), {id: "pa-" + uid(), name, type: $("#ptT").value, phone: $("#ptP").value.trim(), kind, value}], "إضافة شريك: " + name); };
  el.querySelectorAll("[data-ptdel]").forEach(b => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; } const l = clone(S.finSet.partners || []); l.splice(Number(b.dataset.ptdel), 1); saveKey("partners", l, "حذف شريك"); });
  const save = async list => { try { await setDoc(ref("fin/settings"), {programs: list}, {merge: true}); S.finSet.programs = list; logAction("البرامج والرسوم", list.map(p => `${p.name}: ${p.fee}`).join("، ")); toast("انحفظ"); render(); } catch (e) { handleWriteErr(e); } };
  $("#prAdd").onclick = () => { const name = $("#prN").value.trim(), fee = Number($("#prF").value); if (!name || !(fee >= 0)) return toast("اكتب الاسم والرسوم"); save([...progs, {id: "pr-" + uid(), name, fee}]); };
  if ($("#finShow") && ["admin", "academic"].includes(S.adminRole)) $("#finShow").onchange = e => saveSite({finStudents: e.target.checked}, e.target.checked ? "إظهار المالية للطلاب" : "إخفاء المالية عن الطلاب");
  if ($("#payOn") && ["admin", "academic"].includes(S.adminRole)) $("#payOn").onchange = e => saveSite({payFees: e.target.checked}, e.target.checked ? "تفعيل الدفع الإلكتروني" : "إيقاف الدفع الإلكتروني");
  $("#prSave").onclick = () => { const list = clone(progs); el.querySelectorAll("[data-pfee]").forEach(x => list[Number(x.dataset.pfee)].fee = Number(x.value) || 0); save(list); };
  el.querySelectorAll("[data-pdel]").forEach(b => b.onclick = () => { const l = clone(progs); l.splice(Number(b.dataset.pdel), 1); save(l); });
}


/* ---- receipt images (compressed into Firestore, kept apart from the payment record) ---- */
const rcptBtns = (coll, x) => x.hasImg ? `<button class="btn sm" data-rview="${coll}:${esc(x.id)}">الإيصال</button>${x.void ? "" : `<label class="btn sm" style="cursor:pointer" title="ارفع الإيصال الصحيح بدل الحالي">استبدال<input type="file" accept="image/*,application/pdf,.pdf" data-ratt="${coll}:${esc(x.id)}" data-rrep="1" hidden></label><button class="btn sm danger" data-rdel="${coll}:${esc(x.id)}" title="حذف الإيصال بس، والدفعة تبقى">حذف الإيصال</button>`}` : x.void ? "" : `<label class="btn sm" style="cursor:pointer">إرفاق إيصال<input type="file" accept="image/*,application/pdf,.pdf" data-ratt="${coll}:${esc(x.id)}" hidden></label>`;
function bindRcpt(root){
  root.querySelectorAll("[data-rview]").forEach(b => b.onclick = () => {
    const [, id] = b.dataset.rview.split(":");
    const w = window.open("", "_blank"); if (!w) return toast("المتصفح منع فتح النافذة. اسمح بالنوافذ المنبثقة");
    w.document.write("<p style='font-family:sans-serif'>جاري التحميل…</p>");
    getDoc(ref("receipts/" + id)).then(x => {
      openRcptData(w, x.exists() && x.data().img);
    }).catch(() => { w.close(); toast("تعذّر فتح الإيصال"); });
  });
  root.querySelectorAll("[data-rdel]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟ (الدفعة ما تنحذف)"; return; }
    const [coll, id] = b.dataset.rdel.split(":"); b.disabled = true;
    try { await delRcpt(coll, id); logAction("حذف إيصال", coll === "payments" ? "دفعة" : "مصروف"); toast("انحذف الإيصال، والدفعة باقية"); if (S._finDraw) S._finDraw(); else render(); }
    catch (e) { b.disabled = false; handleWriteErr(e); }
  });
  root.querySelectorAll("[data-ratt]").forEach(inp => inp.onchange = async () => {
    const [coll, id] = inp.dataset.ratt.split(":"), f = inp.files[0]; if (!f) return;
    try { toast(isPdfFile(f) ? "جاري رفع ملف PDF…" : "جاري ضغط الصورة ورفعها…"); await saveRcpt(coll, id, await rcptData(f)); logAction(inp.dataset.rrep ? "استبدال إيصال" : "إرفاق إيصال", coll === "payments" ? "دفعة" : "مصروف"); toast("انرفق الإيصال"); inp.value = ""; if (S._finModal && S._finDraw) S._finDraw(); else render(); }
    catch (e) { inp.value = ""; e && ["too-big", "pdf-big", "srv-down"].includes(e.message) ? rcptErr(e) : handleWriteErr(e); }
  });
}
async function delRcpt(coll, id){
  const b = writeBatch(db);
  b.delete(ref("receipts/" + id)); b.set(ref(`${coll}/${id}`), {hasImg: false}, {merge: true});
  await b.commit();
}
async function saveRcpt(coll, id, img){
  const b = writeBatch(db);
  b.set(ref("receipts/" + id), {img, coll, at: new Date().toISOString(), by: S.adminRole});
  b.set(ref(`${coll}/${id}`), {hasImg: true}, {merge: true});
  await b.commit();
}
/* ---- big files live on the classroom server (300 GB). Firestore keeps only a marker "srv:<rid>|<type>|<name>|<size>".
   Small ones (a compressed photo, a PDF under ~500 KB) stay inside the record as before, and old records keep working. ---- */
const SRV_MAX = 20 * 1024 ** 2, SRV_FROM = 500 * 1024;
const isSrv = d => typeof d === "string" && d.startsWith("srv:");
const srvMeta = d => { const [rid, type, name, size] = String(d).slice(4).split("|"); return {rid, type: type || "application/octet-stream", name: decodeURIComponent(name || "file"), size: Number(size) || 0}; };
async function srvPut(blob, name, type){
  if (blob.size > SRV_MAX) throw new Error("srv-big");
  const t = await pushApi("/files", {action: "up", size: blob.size});
  const r = await fetch(t.url, {method: "PUT", body: blob}); if (!r.ok) throw new Error("up " + r.status);
  return `srv:${t.rid}|${type || blob.type || "application/octet-stream"}|${encodeURIComponent(String(name || "file").replace(/\|/g, "-").slice(0, 120))}|${blob.size}`;
}
async function srvUrl(d, inline){ const m = srvMeta(d); return (await pushApi("/files", {action: "get", rid: m.rid, name: m.name, type: m.type, inline: !!inline})).url; }
async function srvData(d){   // a data URL for code that needs the bytes (signing, ZIP archive)
  if (!isSrv(d)) return d;
  const m = srvMeta(d), r = await fetch(await srvUrl(d)); if (!r.ok) throw new Error("get " + r.status);
  const blob = new Blob([await r.arrayBuffer()], {type: m.type});
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
}
async function keepData(d, name){   // a data URL too big for one record goes to the server
  if (!d || isSrv(d) || d.length < SRV_FROM * 1.37) return d;
  const m = /^data:([^;,]+)/.exec(d), type = m ? m[1] : "application/octet-stream";
  return srvPut(new Blob([dataBytes(d)], {type}), name, type);
}
async function srvOpen(d){   // download a server file in the same tab (it arrives as an attachment)
  const a = document.createElement("a"); a.href = await srvUrl(d); a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
}
/* a receipt is a photo (compressed) or a PDF kept as it is: a big PDF goes to the classroom server (up to 20 MB) */
const RCPT_PDF_MAX = 760 * 1024;   // without the server, one Firestore record holds 1 MB
const isPdfFile = f => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));
async function rcptData(f){
  if (!f) return null;
  if (isPdfFile(f)) {
    if (f.size > SRV_FROM) {
      try { return await srvPut(f, f.name || "file.pdf", "application/pdf"); }
      catch (e) { console.error(e); if (f.size > RCPT_PDF_MAX) throw new Error(f.size > SRV_MAX ? "pdf-big" : "srv-down"); }
    }
    const d = await fileToDataURL(f); return d.replace(/^data:[^;,]*/, "data:application/pdf");
  }
  return compressImage(f);
}
const rcptErr = e => toast(e && e.message === "pdf-big" ? "الملف أكبر من 20 ميجا" : e && e.message === "srv-down" ? "ما قدرنا نرفع الملف لسيرفر المعهد الحين. حاول بعد شوي، أو ارفع ملف أصغر من 760 كيلوبايت" : "الصورة كبيرة، صوّرها بدقة أقل", 1);
const pickedImg = async sel => { const f = $(sel) && $(sel).files[0]; return rcptData(f); };
const isPdfData = d => /^data:application\/pdf/.test(d || "");
function openRcptData(w, d){   // shows a stored receipt in a window opened by the click
  if (isSrv(d)) { srvUrl(d, true).then(u => { w.location.href = u; }).catch(e => { console.error(e); w.close(); toast("تعذّر فتح الملف من سيرفر المعهد"); }); return; }
  if (isPdfData(d)) {
    const b = atob(d.split(",")[1] || ""), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u], {type: "application/pdf"}));
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الإيصال PDF</title></head><body style="margin:0;font-family:sans-serif;background:#222;display:flex;flex-direction:column;height:100vh"><div style="padding:8px;text-align:center"><a href="${url}" download="إيصال.pdf" style="color:#fff;background:#1F5136;padding:8px 16px;border-radius:8px;text-decoration:none">تنزيل الإيصال PDF</a></div><iframe src="${url}" style="flex:1;border:0;background:#fff" title="الإيصال"></iframe></body></html>`);
    w.document.close(); return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>الإيصال</title></head><body style="margin:0;background:#222;display:grid;place-items:center;min-height:100vh">${d && /^data:image\//.test(d) ? `<img src="${d}" style="max-width:100%;max-height:100vh">` : `<p style="color:#fff;font-family:sans-serif">ما فيه إيصال</p>`}</body></html>`);
  w.document.close();
}


/* ---- receipts register: every attached receipt in one place, with its reference, printable ---- */
function finReceipts(el){
  const f = S.rcF || {who: "", m: "", kind: "all"};
  const studs = [...new Map((S.pays || []).filter(p => p.hasImg).map(p => [p.num, p.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const pays = (S.pays || []).filter(p => p.hasImg && (f.kind !== "exp") && (!f.who || p.num === f.who) && (!f.m || (p.date || "").startsWith(f.m)))
    .map(p => ({coll: "payments", id: p.id, date: p.date, title: `${p.name} · ${p.num}`, sub: `سند ${p.receiptNo} · ${p.method}`, amount: p.amount, ref: p.ref || "", voided: p.void, x: p}));
  const exps = f.who ? [] : (S.exps || []).filter(x => x.hasImg && f.kind !== "pay" && (!f.m || (x.date || "").startsWith(f.m)))
    .map(x => ({coll: "expenses", id: x.id, date: x.date, title: `مصروف: ${x.category}`, sub: `${x.desc || ""}${x.method ? " · " + x.method : ""}`, amount: x.amount, ref: x.ref || "", voided: x.void, x}));
  const list = [...pays, ...exps].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  el.innerHTML = `<div class="card"><h2>الإيصالات</h2>
    <p class="muted" style="margin-top:0">كل الإيصالات المرفقة في مكان واحد. اختر طالب أو اترك «كل الطلاب»، وتقدر تطبعها كلها مرة وحدة.</p>
    <div class="row">
      <select id="rcW" class="grow"><option value="">كل الطلاب</option>${studs.map(([n, nm]) => `<option value="${esc(n)}" ${f.who === n ? "selected" : ""}>${esc(nm)} · ${esc(n)}</option>`).join("")}</select>
      <input type="month" id="rcM" value="${esc(f.m)}" style="width:170px" aria-label="الشهر">
      <select id="rcK" style="width:auto"><option value="all" ${f.kind === "all" ? "selected" : ""}>الدفعات والمصروفات</option><option value="pay" ${f.kind === "pay" ? "selected" : ""}>دفعات الطلاب</option><option value="exp" ${f.kind === "exp" ? "selected" : ""}>المصروفات</option></select>
      ${f.m ? `<button class="btn sm" id="rcAllM">كل الشهور</button>` : ""}
    </div>
    <div class="row" style="margin-top:10px"><b class="grow">${list.length} إيصال · ${SAR(list.filter(x => !x.voided).reduce((a, x) => a + Number(x.amount), 0))}</b>${list.length ? `<button class="btn pri sm" id="rcPrint">طباعة ${list.length === 1 ? "الإيصال" : "الإيصالات (" + list.length + ")"}</button>` : ""}</div></div>
  <div class="list">${list.map(r => `<div class="item" style="${r.voided ? "opacity:.55" : ""}"><div class="grow"><div class="t">${esc(r.title)}${r.voided ? ` <span class="pill a">ملغى</span>` : ""}</div><div class="muted">${dH(r.date)} · ${SAR(r.amount)} · ${esc(r.sub)}</div></div>
      <label class="muted" for="rf-${esc(r.id)}">المرجع</label><input type="text" id="rf-${esc(r.id)}" data-rref="${r.coll}:${esc(r.id)}" value="${esc(r.ref)}" placeholder="رقم العملية" style="width:170px">
      <button class="btn sm" data-rview="${r.coll}:${esc(r.id)}">عرض</button><button class="btn sm" data-rprint="${r.coll}:${esc(r.id)}">طباعة</button></div>`).join("") || `<div class="card empty">ما فيه إيصالات مرفقة${f.who || f.m ? " بهذا الاختيار" : ""}.</div>`}</div>`;
  const setF = d => { S.rcF = {...f, ...d}; render(); };
  $("#rcW").onchange = e => setF({who: e.target.value, kind: e.target.value ? "pay" : f.kind});
  $("#rcM").onchange = e => setF({m: e.target.value});
  $("#rcK").onchange = e => setF({kind: e.target.value});
  if ($("#rcAllM")) $("#rcAllM").onclick = () => setF({m: ""});
  bindRcpt(el);
  el.querySelectorAll("[data-rref]").forEach(inp => inp.onchange = async () => {
    const [coll, id] = inp.dataset.rref.split(":"), v = inp.value.trim().slice(0, 80);
    try { await setDoc(ref(`${coll}/${id}`), {ref: v}, {merge: true}); logAction("مرجع إيصال", v); toast("انحفظ المرجع"); } catch (e) { handleWriteErr(e); }
  });
  const printList = async (items, title) => {
    const w = openPrint(); if (!w) return;
    try {
      const imgs = await Promise.all(items.map(r => getDoc(ref("receipts/" + r.id)).then(x => x.exists() ? x.data().img : null).catch(() => null)));
      const pages = items.map((r, i) => ({html: `<h1>${r.coll === "payments" ? "إيصال دفعة" : "إيصال مصروف"}</h1>
        <table><tbody>
          <tr><td class="n" style="width:28%"><b>${r.coll === "payments" ? "الطالب" : "البند"}</b></td><td class="n">${esc(r.title)}</td></tr>
          <tr><td class="n"><b>التاريخ</b></td><td class="n">${esc(bothDates(r.date))}</td></tr>
          <tr><td class="n"><b>المبلغ</b></td><td class="n"><b>${SAR(r.amount)}</b></td></tr>
          <tr><td class="n"><b>التفاصيل</b></td><td class="n">${esc(r.sub)}</td></tr>
          <tr><td class="n"><b>المرجع</b></td><td class="n">${esc(r.ref || "—")}</td></tr>
          ${r.voided ? `<tr><td class="n"><b>الحالة</b></td><td class="n" style="color:#B3261E"><b>ملغى</b></td></tr>` : ""}
        </tbody></table>
        <div style="text-align:center;margin-top:12px">${imgs[i] && /^data:image\//.test(imgs[i]) ? `<img src="${imgs[i]}" style="max-width:100%;max-height:165mm;border:1px solid #ddd;border-radius:6px">` : (isPdfData(imgs[i]) || isSrv(imgs[i])) ? `<p style="border:1px dashed #999;border-radius:8px;padding:14px">📄 الإيصال ملف PDF مرفق في النظام. افتحه من زر «الإيصال» واطبعه.</p>` : `<p>الصورة غير موجودة</p>`}</div>`}));
      fillPrintFin(w, title, pages);
    } catch (e) { w.close(); handleWriteErr(e); }
  };
  if ($("#rcPrint")) $("#rcPrint").onclick = () => printList(list, f.who ? `إيصالات ${(studs.find(x => x[0] === f.who) || [, ""])[1]}` : `الإيصالات${f.m ? " · " + f.m : ""}`);
  el.querySelectorAll("[data-rprint]").forEach(b => b.onclick = () => { const id = b.dataset.rprint.split(":")[1]; const r = list.find(x => x.id === id); printList([r], `إيصال · ${r.title}`); });
}

/* ---- expenses, partners, monthly report ---- */
const EXP_CATS = ["إيجار", "كهرباء وماء وإنترنت", "تسويق وإعلان", "مستلزمات وقرطاسية", "صيانة", "رسوم حكومية", "رواتب إدارية", "أخرى"];
const sumAmt = l => Math.round(l.reduce((a, x) => a + (Number(x.amount != null ? x.amount : x.net) || 0), 0) * 100) / 100;
function monthFlow(m){
  const inc = (S.pays || []).filter(p => !p.void && (p.date || "").startsWith(m));
  const exp = (S.exps || []).filter(x => !x.void && (x.date || "").startsWith(m));
  const sal = Object.values(S.salPays || {}).filter(x => (x.paidDate || "").startsWith(m));
  const com = (S.commPays || []).filter(x => !x.void && (x.date || "").startsWith(m));
  const income = sumAmt(inc), expT = sumAmt(exp), salT = sumAmt(sal), comT = sumAmt(com), out = Math.round((expT + salT + comT) * 100) / 100;
  return {inc, exp, sal, com, income, expT, salT, comT, out, net: Math.round((income - out) * 100) / 100};
}
function finExpenses(el){
  const m = S.expM || today().slice(0, 7);
  const list = (S.exps || []).filter(x => (x.date || "").startsWith(m)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const byCat = {}; list.filter(x => !x.void).forEach(x => byCat[x.category] = (byCat[x.category] || 0) + Number(x.amount));
  el.innerHTML = `<div class="card"><h2>تسجيل مصروف</h2>
    <div class="row"><select id="exC" style="width:auto">${EXP_CATS.map(c => `<option>${c}</option>`).join("")}</select><input type="number" id="exA" min="0" step="0.01" placeholder="المبلغ" style="width:130px"><input type="date" id="exD" value="${today()}" max="${today()}" style="width:160px"><select id="exM2" style="width:auto">${["تحويل بنكي", "نقد", "مدى / شبكة"].map(x => `<option>${x}</option>`).join("")}</select></div>
    <div class="row" style="margin-top:8px"><input type="text" id="exT" class="grow" placeholder="الوصف، مثل: إيجار شهر نوفمبر"><input type="text" id="exRef" placeholder="رقم الفاتورة أو المرجع" style="width:190px"></div>
    <div class="row" style="margin-top:8px"><label class="f grow" for="exImg">الفاتورة أو الإيصال: صورة أو PDF (اختياري)<input type="file" id="exImg" accept="image/*,application/pdf,.pdf"></label><button class="btn gold" id="exAdd" style="align-self:flex-end">+ تسجيل</button></div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">مصروفات الشهر</h2><input type="month" id="expM" value="${esc(m)}" style="width:170px"></div>
    <p class="muted">المجموع <b>${SAR(sumAmt(list.filter(x => !x.void)))}</b>${Object.keys(byCat).length ? " · " + Object.entries(byCat).map(([k, v]) => `${esc(k)}: ${SAR(v)}`).join(" · ") : ""}</p>
    <div class="list">${list.map(x => `<div class="item" style="${x.void ? "opacity:.5;text-decoration:line-through" : ""}"><div class="grow"><div class="t">${SAR(x.amount)} · ${esc(x.category)}</div><div class="muted">${dH(x.date)} · ${esc(x.method || "")}${x.desc ? " · " + esc(x.desc) : ""}${x.void ? " · ملغى: " + esc(x.voidReason || "") : ""}</div></div>${rcptBtns("expenses", x)}${x.void ? "" : `<button class="btn sm danger" data-exv="${esc(x.id)}">إلغاء</button>`}</div>`).join("") || `<span class="muted">ما فيه مصروفات في هذا الشهر</span>`}</div></div>`;
  $("#expM").onchange = e => { S.expM = e.target.value; render(); };
  bindRcpt(el);
  $("#exAdd").onclick = async () => {
    const amount = Math.round((Number($("#exA").value) || 0) * 100) / 100; if (amount <= 0) return toast("اكتب المبلغ");
    const d = {category: $("#exC").value, amount, date: $("#exD").value || today(), method: $("#exM2").value, desc: $("#exT").value.trim(), ref: $("#exRef").value.trim(), by: S.adminRole, void: false, at: new Date().toISOString()};
    let img = null; try { img = await pickedImg("#exImg"); } catch (e) { return rcptErr(e); }
    const id = "e-" + uid() + uid();
    try {
      $("#exAdd").disabled = true;
      await setDoc(ref("expenses/" + id), d);
      if (img) await saveRcpt("expenses", id, img);
      logAction("تسجيل مصروف", `${d.category} · ${SAR(amount)}`); toast("انسجل المصروف"); render();
    } catch (e) { $("#exAdd").disabled = false; handleWriteErr(e); }
  };
  el.querySelectorAll("[data-exv]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.insertAdjacentHTML("beforebegin", `<input type="text" id="exVR" placeholder="سبب الإلغاء" style="width:150px">`); b.textContent = "تأكيد الإلغاء"; return; }
    const reason = ($("#exVR") || {}).value || ""; if (!reason.trim()) return toast("اكتب سبب الإلغاء");
    try { await setDoc(ref("expenses/" + b.dataset.exv), {void: true, voidReason: reason.trim(), voidBy: S.adminRole, voidAt: new Date().toISOString()}, {merge: true}); logAction("إلغاء مصروف", reason.trim()); } catch (e) { handleWriteErr(e); }
  });
}
function partnerStats(p){
  const rows = Object.values(S.finAcc || {}).filter(a => a.partner === p.id).map(acc => {
    const st = accStatus(acc, paysOf(acc.num));
    const earned = p.kind === "percent" ? Math.round(st.paid * p.value) / 100 : (st.paid > 0 ? Number(p.value) : 0);
    return {acc, st, earned};
  });
  const earned = Math.round(rows.reduce((a, r) => a + r.earned, 0) * 100) / 100;
  const paidOut = sumAmt((S.commPays || []).filter(x => !x.void && x.partnerId === p.id));
  return {rows, earned, paidOut, balance: Math.round((earned - paidOut) * 100) / 100};
}
function finPartners(el){
  const ps = S.finSet.partners || [];
  if (!ps.length) { el.innerHTML = `<div class="card empty">أضف الشركاء من "الإعدادات"، وبعدها اختر الشريك في حساب كل طالب سجّل عن طريقه.</div>`; return; }
  const all = ps.map(p => ({p, ...partnerStats(p)}));
  el.innerHTML = `<div class="card"><h2>الشركاء والعمولات</h2>
    <div class="stats"><div class="stat"><div class="n">${SAR(all.reduce((a, x) => a + x.earned, 0))}</div><div class="l">عمولات مستحقة</div></div><div class="stat"><div class="n">${SAR(all.reduce((a, x) => a + x.paidOut, 0))}</div><div class="l">مصروفة</div></div><div class="stat"><div class="n">${SAR(all.reduce((a, x) => a + x.balance, 0))}</div><div class="l">باقي لهم</div></div></div>
    <p class="muted">النسبة تنحسب من المبلغ اللي دفعه الطالب فعلاً. المبلغ الثابت يستحق بعد أول دفعة من الطالب.</p></div>
  <div class="list">${all.map(x => `<div class="item" style="align-items:flex-start"><div class="grow"><div class="t">${esc(x.p.name)} <span class="pill">${esc(x.p.type)}</span></div>
      <div class="muted">${x.rows.length} طالب · مستحق ${SAR(x.earned)} · مصروف ${SAR(x.paidOut)} · <b>الباقي ${SAR(x.balance)}</b></div>
      ${x.rows.length ? `<details><summary class="muted" style="cursor:pointer">الطلاب</summary><div class="muted">${x.rows.map(r => `${esc(r.acc.name)}: دفع ${SAR(r.st.paid)} ← عمولة ${SAR(r.earned)}`).join("<br>")}</div></details>` : ""}</div>
      <button class="btn sm" data-pst="${esc(x.p.id)}">كشف</button>${x.balance > 0 ? `<button class="btn sm gold" data-ppay="${esc(x.p.id)}">صرف عمولة</button>` : ""}</div>`).join("")}</div>`;
  el.querySelectorAll("[data-pst]").forEach(b => b.onclick = () => { const x = all.find(y => y.p.id === b.dataset.pst); const w = openPrint(); fillPrintFin(w, `كشف عمولات ${x.p.name}`, [{html: partnerHTML(x)}]); });
  el.querySelectorAll("[data-ppay]").forEach(b => b.onclick = () => {
    const x = all.find(y => y.p.id === b.dataset.ppay);
    S._finModal = null; S._modalGroup = null;
    $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">صرف عمولة · ${esc(x.p.name)}</h2><button class="btn sm" id="cx">إغلاق</button></div>
      <p class="muted">الباقي له: ${SAR(x.balance)}</p>
      <div class="row"><label class="f" for="cA" style="width:140px">المبلغ<input type="number" id="cA" value="${x.balance}"></label><label class="f" for="cM" style="width:160px">الطريقة<select id="cM"><option>تحويل بنكي</option><option>نقد</option></select></label><label class="f" for="cD" style="width:160px">التاريخ<input type="date" id="cD" value="${today()}"></label></div>
      <label class="f" for="cN">ملاحظة<input type="text" id="cN"></label><button class="btn gold" id="cGo">تسجيل الصرف وطباعة السند</button>`;
    $("#modal").classList.add("on"); $("#cx").onclick = closeModal;
    $("#cGo").onclick = async () => {
      const amount = Math.round((Number($("#cA").value) || 0) * 100) / 100; if (amount <= 0 || amount > x.balance + 0.01) return toast("المبلغ لازم يكون بين صفر والباقي");
      const w = openPrint(); if (!w) return;
      const d = {partnerId: x.p.id, name: x.p.name, amount, method: $("#cM").value, date: $("#cD").value || today(), note: $("#cN").value.trim(), by: S.adminRole, void: false, at: new Date().toISOString()};
      try { await setDoc(ref("commPays/c-" + uid() + uid()), d); logAction("صرف عمولة", `${x.p.name} · ${SAR(amount)}`); fillPrintFin(w, `سند صرف عمولة ${x.p.name}`, [{html: `<h1>سند صرف عمولة</h1><div class="info"><div><b>الشريك:</b> ${esc(d.name)}</div><div><b>التاريخ:</b> ${esc(bothDates(d.date))}</div><div><b>الطريقة:</b> ${esc(d.method)}</div></div><table><tbody><tr><td class="n"><b>المبلغ</b></td><td style="font-size:16px"><b>${SAR(amount)}</b></td></tr><tr><td class="n"><b>الباقي بعد الصرف</b></td><td>${SAR(x.balance - amount)}</td></tr></tbody></table>${d.note ? `<p>ملاحظة: ${esc(d.note)}</p>` : ""}<div class="sig">${sigSlot("المالية", "finance")}<div>المستلم<br><small>الاسم والتوقيع</small></div></div>`}]); closeModal(); }
      catch (e) { w.close(); handleWriteErr(e); }
    };
  });
}
function partnerHTML(x){
  const pays = (S.commPays || []).filter(c => !c.void && c.partnerId === x.p.id).sort((a, b) => a.date.localeCompare(b.date));
  return `<h1>كشف عمولات شريك</h1><div class="info"><div><b>الشريك:</b> ${esc(x.p.name)} (${esc(x.p.type)})</div><div><b>العمولة:</b> ${x.p.kind === "percent" ? x.p.value + "% من المحصّل" : SAR(x.p.value) + " عن كل طالب"}</div></div>
  <table><thead><tr><th>الطالب</th><th>المدفوع</th><th>العمولة</th></tr></thead><tbody>${x.rows.map(r => `<tr><td>${esc(r.acc.name)}</td><td>${SAR(r.st.paid)}</td><td>${SAR(r.earned)}</td></tr>`).join("") || `<tr><td colspan="3">ما فيه طلاب</td></tr>`}</tbody></table>
  <h3 style="color:#1F5136">المصروف</h3><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>${pays.map(c => `<tr><td>${dH(c.date)}</td><td>${SAR(c.amount)}</td><td>${esc(c.method)}</td></tr>`).join("") || `<tr><td colspan="3">ما انصرف شي</td></tr>`}</tbody></table>
  <table><tbody><tr><td class="n"><b>المستحق</b></td><td>${SAR(x.earned)}</td><td class="n"><b>المصروف</b></td><td>${SAR(x.paidOut)}</td><td class="n"><b>الباقي</b></td><td><b>${SAR(x.balance)}</b></td></tr></tbody></table>`;
}
function finReport(el){
  const m = S.repM2 || today().slice(0, 7), f = monthFlow(m);
  const y = m.slice(0, 4), months = Array.from({length: 12}, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`).map(k => ({k, ...monthFlow(k)}));
  const byCat = {}; f.exp.forEach(x => byCat[x.category] = (byCat[x.category] || 0) + Number(x.amount));
  const html = () => `<h1>التقرير المالي الشهري</h1><div class="info"><div><b>الشهر:</b> ${esc(m)}</div></div>
    <table><tbody>
      <tr><td class="n"><b>الإيرادات (رسوم الطلاب)</b></td><td>${SAR(f.income)}</td></tr>
      ${Object.entries(byCat).map(([k, v]) => `<tr><td class="n">مصروف: ${esc(k)}</td><td>${SAR(v)}</td></tr>`).join("")}
      <tr><td class="n">رواتب المدربين</td><td>${SAR(f.salT)}</td></tr>
      <tr><td class="n">عمولات الشركاء</td><td>${SAR(f.comT)}</td></tr>
      <tr><td class="n"><b>إجمالي المصروفات</b></td><td><b>${SAR(f.out)}</b></td></tr>
      <tr><td class="n"><b>الصافي</b></td><td style="font-size:16px"><b>${SAR(f.net)}</b></td></tr>
    </tbody></table>
    <h3 style="color:#1F5136">سنة ${esc(y)}</h3><table><thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th></tr></thead><tbody>${months.map(x => `<tr><td>${x.k}</td><td>${SAR(x.income)}</td><td>${SAR(x.out)}</td><td>${SAR(x.net)}</td></tr>`).join("")}</tbody></table>
    <div class="sig">${sigSlot("المالية", "finance")}${sigSlot("الإدارة", "director", true)}</div>`;
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">التقرير المالي الشهري</h2><div class="row"><input type="month" id="rpM" value="${esc(m)}" style="width:170px"><button class="btn sm pri" id="rpP">طباعة / PDF</button><button class="btn sm" id="rpX">Excel</button></div></div>
    <div class="stats" style="margin-top:10px"><div class="stat"><div class="n">${SAR(f.income)}</div><div class="l">الإيرادات</div></div><div class="stat"><div class="n">${SAR(f.out)}</div><div class="l">المصروفات</div></div><div class="stat"><div class="n" style="color:${f.net < 0 ? "var(--abs)" : "var(--green)"}">${SAR(f.net)}</div><div class="l">الصافي</div></div></div></div>
  <div class="card"><h2>تفصيل المصروفات</h2><div class="list">${[...Object.entries(byCat), ["رواتب المدربين", f.salT], ["عمولات الشركاء", f.comT]].filter(([, v]) => v).map(([k, v]) => `<div class="item"><span class="grow">${esc(k)}</span><b>${SAR(v)}</b><span class="muted">${f.out ? Math.round(v / f.out * 100) : 0}%</span></div>`).join("") || `<span class="muted">ما فيه مصروفات</span>`}</div></div>
  <div class="card"><h2>سنة ${esc(y)}</h2><div class="tbl"><table><thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th></tr></thead><tbody>${months.map(x => `<tr><td>${x.k}</td><td>${SAR(x.income)}</td><td>${SAR(x.out)}</td><td style="color:${x.net < 0 ? "var(--abs)" : "inherit"}">${SAR(x.net)}</td></tr>`).join("")}
    <tr><td><b>المجموع</b></td><td><b>${SAR(months.reduce((a, x) => a + x.income, 0))}</b></td><td><b>${SAR(months.reduce((a, x) => a + x.out, 0))}</b></td><td><b>${SAR(months.reduce((a, x) => a + x.net, 0))}</b></td></tr></tbody></table></div></div>`;
  $("#rpM").onchange = e => { S.repM2 = e.target.value; render(); };
  $("#rpP").onclick = () => { const w = openPrint(); fillPrintFin(w, `التقرير المالي ${m}`, [{html: html()}]); };
  $("#rpX").onclick = () => excelDownload(`التقرير المالي ${m}`, [
    {title: "الشهر", rows: [[INST_AR], [`التقرير المالي · ${m}`], [], ["البند", "المبلغ"], ["الإيرادات", f.income], ...Object.entries(byCat).map(([k, v]) => ["مصروف: " + k, v]), ["رواتب المدربين", f.salT], ["عمولات الشركاء", f.comT], ["إجمالي المصروفات", f.out], ["الصافي", f.net], [], ["تفصيل المصروفات"], ["التاريخ", "البند", "المبلغ", "الوصف"], ...f.exp.map(x => [x.date, x.category, Number(x.amount), x.desc || ""]), ...f.sal.map(x => [x.paidDate, "راتب: " + x.name, Number(x.net), ""]), ...f.com.map(x => [x.date, "عمولة: " + x.name, Number(x.amount), x.note || ""])], widths: [14, 26, 12, 30]},
    {title: "السنة", rows: [[`سنة ${y}`], [], ["الشهر", "الإيرادات", "المصروفات", "الصافي"], ...months.map(x => [x.k, x.income, x.out, x.net])], widths: [12, 14, 14, 14]}]);
}

function finSalaries(el){
  const m = S.salM || today().slice(0, 7), rates = (S.finSet && S.finSet.salaries) || {};
  const ts = Object.values(S.trainers).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const rec = t => (S.salPays || {})[`${m}_${t.id}`];
  const total = ts.reduce((a, t) => a + (rec(t) ? Number(rec(t).net) : 0), 0), due = ts.reduce((a, t) => a + (rec(t) ? 0 : Number(rates[t.id]) || 0), 0);
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">رواتب المدربين</h2><div class="row"><input type="month" id="salM" value="${esc(m)}" style="width:170px"><button class="btn sm" id="salX">تنزيل Excel</button></div></div>
    <div class="stats" style="margin-top:10px"><div class="stat"><div class="n">${SAR(total)}</div><div class="l">مصروف لشهر ${esc(m)}</div></div><div class="stat"><div class="n">${SAR(due)}</div><div class="l">باقي ما انصرف</div></div><div class="stat"><div class="n">${ts.filter(t => rec(t)).length}/${ts.length}</div><div class="l">مدربين استلموا</div></div></div>
    <p class="muted">الرواتب يشوفها موظف المالية والإدارة بس.</p></div>
  <div class="list">${ts.map(t => { const r = rec(t); return `<div class="item"><div class="grow"><div class="t">${esc(trainerTitle(t))}</div><div class="muted">${r ? `انصرف ${SAR(r.net)} · ${dH(r.paidDate)} · ${esc(r.method)}${r.bonus ? ` · إضافي ${SAR(r.bonus)}` : ""}${r.deduct ? ` · خصم ${SAR(r.deduct)}` : ""}` : "ما انصرف لهذا الشهر"}</div></div>
    <label class="muted" for="sr-${esc(t.id)}">الراتب</label><input type="number" id="sr-${esc(t.id)}" data-rate="${esc(t.id)}" value="${rates[t.id] || ""}" style="width:110px">
    ${r ? `<button class="btn sm" data-svp="${esc(t.id)}">السند</button><button class="btn sm danger" data-sdl="${esc(t.id)}">إلغاء الصرف</button>` : `<button class="btn sm gold" data-spay="${esc(t.id)}">صرف</button>`}</div>`; }).join("")}</div>
  <div class="row"><button class="btn pri sm" id="rateSave">حفظ الرواتب</button></div>`;
  $("#salM").onchange = e => { S.salM = e.target.value; render(); };
  $("#rateSave").onclick = async () => {
    const r = {}; el.querySelectorAll("[data-rate]").forEach(x => { if (x.value !== "") r[x.dataset.rate] = Number(x.value) || 0; });
    try { await setDoc(ref("fin/settings"), {salaries: r}, {merge: true}); S.finSet.salaries = r; logAction("رواتب المدربين", "تعديل الرواتب"); toast("انحفظت الرواتب"); } catch (e) { handleWriteErr(e); }
  };
  el.querySelectorAll("[data-spay]").forEach(b => b.onclick = () => openSalaryPay(b.dataset.spay, m));
  el.querySelectorAll("[data-svp]").forEach(b => b.onclick = () => { const r = rec(S.trainers[b.dataset.svp]); const w = openPrint(); fillPrintFin(w, `سند صرف راتب ${r.name}`, [{html: salaryHTML(r)}]); });
  el.querySelectorAll("[data-sdl]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    try { await deleteDoc(ref(`salaryPays/${m}_${b.dataset.sdl}`)); logAction("إلغاء صرف راتب", `${(S.trainers[b.dataset.sdl] || {}).name} · ${m}`); toast("انلغى الصرف"); } catch (e) { handleWriteErr(e); }
  });
  $("#salX").onclick = () => excelDownload(`رواتب المدربين ${m}`, [{title: "الرواتب", rows: [[INST_AR], [`رواتب المدربين · ${m}`], [], ["المدرب", "الراتب", "إضافي", "خصم", "الصافي", "تاريخ الصرف", "الطريقة", "ملاحظة"], ...ts.map(t => { const r = rec(t); return [t.name, Number(rates[t.id]) || 0, r ? r.bonus || 0 : "", r ? r.deduct || 0 : "", r ? r.net : "", r ? r.paidDate : "لم يُصرف", r ? r.method : "", r ? r.note || "" : ""]; })], widths: [26, 11, 10, 10, 11, 13, 14, 24]}]);
}
function openSalaryPay(tid, m){
  const t = S.trainers[tid], base = Number(((S.finSet && S.finSet.salaries) || {})[tid]) || 0;
  S._modalGroup = null; S._finModal = null;
  $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0;font-family:var(--display);color:var(--green);font-weight:600">صرف راتب · ${esc(trainerTitle(t))}</h2><button class="btn sm" id="sx">إغلاق</button></div>
    <p class="muted" style="margin:0">شهر ${esc(m)}</p>
    <div class="row">
      <label class="f" for="sB" style="width:130px">الراتب<input type="number" id="sB" value="${base}"></label>
      <label class="f" for="sAdd" style="width:120px">إضافي<input type="number" id="sAdd" value="0"></label>
      <label class="f" for="sDed" style="width:120px">خصم<input type="number" id="sDed" value="0"></label>
      <label class="f" for="sMeth" style="width:160px">الطريقة<select id="sMeth">${["تحويل بنكي", "نقد"].map(x => `<option>${x}</option>`).join("")}</select></label>
      <label class="f" for="sD" style="width:160px">تاريخ الصرف<input type="date" id="sD" value="${today()}"></label>
    </div>
    <label class="f" for="sNote">ملاحظة<input type="text" id="sNote" placeholder="مثل: خصم غياب محاضرة"></label>
    <div class="row"><b id="sNet"></b><button class="btn gold" id="sGo">تسجيل الصرف وطباعة السند</button></div>`;
  $("#modal").classList.add("on");
  const net = () => Math.round(((Number($("#sB").value) || 0) + (Number($("#sAdd").value) || 0) - (Number($("#sDed").value) || 0)) * 100) / 100;
  const upd = () => $("#sNet").textContent = "الصافي: " + SAR(net()); upd();
  ["sB", "sAdd", "sDed"].forEach(id => $("#" + id).oninput = upd);
  $("#sx").onclick = closeModal;
  $("#sGo").onclick = async () => {
    if (net() <= 0) return toast("الصافي لازم يكون أكبر من صفر");
    const w = openPrint(); if (!w) return;
    const r = {tid, name: t.name, month: m, base: Number($("#sB").value) || 0, bonus: Number($("#sAdd").value) || 0, deduct: Number($("#sDed").value) || 0, net: net(), method: $("#sMeth").value, paidDate: $("#sD").value || today(), note: $("#sNote").value.trim(), by: S.adminRole, at: new Date().toISOString()};
    try { await setDoc(ref(`salaryPays/${m}_${tid}`), r); logAction("صرف راتب", `${t.name} · ${m} · ${SAR(r.net)}`); fillPrintFin(w, `سند صرف راتب ${t.name}`, [{html: salaryHTML(r)}]); closeModal(); }
    catch (e) { w.close(); handleWriteErr(e); }
  };
}
function salaryHTML(r){
  return `<h1>سند صرف راتب</h1>
  <div class="info"><div><b>المدرب/ة:</b> ${esc(r.name)}</div><div><b>عن شهر:</b> ${esc(r.month)}</div><div><b>تاريخ الصرف:</b> ${esc(bothDates(r.paidDate))}</div><div><b>الطريقة:</b> ${esc(r.method)}</div></div>
  <table><tbody><tr><td class="n"><b>الراتب</b></td><td>${SAR(r.base)}</td></tr><tr><td class="n"><b>إضافي</b></td><td>${SAR(r.bonus)}</td></tr><tr><td class="n"><b>خصم</b></td><td>${SAR(r.deduct)}</td></tr><tr><td class="n"><b>الصافي</b></td><td style="font-size:16px"><b>${SAR(r.net)}</b></td></tr></tbody></table>
  ${r.note ? `<p>ملاحظة: ${esc(r.note)}</p>` : ""}
  <div class="sig">${sigSlot("المالية", "finance")}<div>المستلم<br><small>الاسم والتوقيع</small></div></div>`;
}
function studentFin(el){
  const acc = S.myFin; if (!acc) { el.innerHTML = `<div class="card empty">ما فيه حساب مالي.</div>`; return; }
  const st = accStatus(acc, S.myPay || []), pays = (S.myPay || []).filter(p => !p.void).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  el.innerHTML = `<div class="card"><h2>المالية</h2><p class="muted" style="margin-top:0">${PLANS[acc.plan] || ""}${acc.discount ? ` · خصم ${SAR(acc.discount)}` : ""}</p>
    <div class="stats"><div class="stat"><div class="n">${SAR(st.net)}</div><div class="l">الرسوم</div></div><div class="stat"><div class="n">${SAR(st.paid)}</div><div class="l">المدفوع</div></div><div class="stat"><div class="n">${SAR(st.remaining)}</div><div class="l">المتبقي</div></div><div class="stat"><div class="n" style="color:${st.overdue ? "var(--abs)" : "inherit"}">${SAR(st.overdue)}</div><div class="l">متأخر</div></div></div>
    ${st.next ? `<div class="notice" style="margin-top:10px">الدفعة القادمة: <b>${SAR(st.next.amount)}</b> بتاريخ ${esc(fmtDate(st.next.due))}</div>` : ""}
</div>
  <div class="card"><h2>جدول الدفعات</h2><div class="tbl"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${st.sched.map((i, k) => `<tr><td>${i.label ? esc(i.label) : k + 1}</td><td>${dH(i.due)}</td><td>${SAR(i.amount)}</td><td><span class="pill ${INST_PILL[i.st]}">${INST_ST[i.st]}</span></td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h2>السندات</h2><div class="list">${pays.map(p => `<div class="item"><div class="grow"><div class="t">${SAR(p.amount)}</div><div class="muted">سند ${esc(p.receiptNo)} · ${dH(p.date)} · ${esc(p.method)}</div></div><button class="btn sm" data-myrc="${esc(p.id)}">طباعة</button></div>`).join("") || `<span class="muted">ما فيه دفعات</span>`}</div></div>`;
  el.querySelectorAll("[data-myrc]").forEach(b => b.onclick = () => { const p = pays.find(x => x.id === b.dataset.myrc); const w = openPrint(); fillPrintFin(w, `سند قبض ${p.receiptNo}`, [{html: receiptHTML(p, acc, S.myPay || [])}]); });
}

/* trainers tab */
function trainerLoginMap(over){
  const map = {};
  Object.values(over || S.trainers).forEach(t => { if (t.num && t.email) map[t.num] = t.email; });
  return {map};
}
const nextTrainerNum = (over) => String(Math.max(1000, ...Object.values(over || S.trainers).map(t => Number(t.num) || 0)) + 1);
/* give every trainer a number and publish number -> login only (no names) */
async function syncTrainerNumbers(){
  if (S._trainerSynced || S.role !== "admin" || RO() || FIN() || !S.loaded.trainers) return;
  S._trainerSynced = true;
  const all = clone(S.trainers);
  const missing = Object.values(all).filter(t => !t.num).sort((a,b) => a.name.localeCompare(b.name, "ar"));
  const b = writeBatch(db);
  missing.forEach(t => { t.num = nextTrainerNum(all); all[t.id].num = t.num; const d = clone(t); delete d.id; b.set(ref("trainers/" + t.id), d); });
  b.set(ref("public/trainerLogin"), trainerLoginMap(all));
  b.set(ref("public/trainers"), {list: {}});
  try { await b.commit(); if (missing.length) toast(`انعطى ${missing.length} مدرب أرقام دخول`); } catch (e) { S._trainerSynced = false; console.error(e); }
}
function editTrainer(tid){
  const t = S.trainers[tid]; if (!t) return;
  const ph = (S.trPhones || {})[tid] || "";
  $("#modalBox").innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">تعديل بيانات ${t.gender === "f" ? "المدربة" : "المدرب"}</h2><button class="btn sm" id="teX">إغلاق</button></div>
    <label for="teN">الاسم</label><input type="text" id="teN" value="${esc(t.name)}" maxlength="80">
    <label for="teG">الصفة</label><select id="teG"><option value="m" ${t.gender !== "f" ? "selected" : ""}>مدرب</option><option value="f" ${t.gender === "f" ? "selected" : ""}>مدربة</option></select>
    <label for="teP">الجوال</label><input type="tel" id="teP" dir="ltr" value="${esc(ph ? "0" + String(ph).replace(/^966/, "") : "")}" placeholder="05xxxxxxxx" inputmode="numeric">
    <label for="teM">بريد المعهد</label><div class="row" dir="ltr" style="gap:4px;flex-wrap:nowrap"><input type="text" id="teM" dir="ltr" class="grow" value="${esc(t.mail || "")}" placeholder="${esc(t.num ? "tr" + t.num : "ali.alqahtani")}" maxlength="32" autocapitalize="off" spellcheck="false"><span class="muted">@${MAIL_DOMAIN}</span></div>
    <p class="muted" style="margin:4px 0 0">حروف إنجليزية صغيرة وأرقام ونقطة، مثل <span dir="ltr">ali.alqahtani</span>. لو تركته فاضي يبقى <span dir="ltr">${esc(t.num ? "tr" + t.num : "")}@${MAIL_DOMAIN}</span>. والرسائل القديمة تبقى، والعنوان <span dir="ltr">${esc(t.num ? "tr" + t.num : "")}@</span> يظل يوصله بعد.</p>
    <p class="muted">رقم المدرب (${esc(t.num || "—")}) ورمز الدخول ما يتغيرون. لرمز جديد استخدم زر «رمز جديد».</p>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="teS">حفظ</button></div>`;
  $("#modal").classList.add("on");
  $("#teX").onclick = closeModal;
  $("#teS").onclick = async () => {
    const name = $("#teN").value.trim().replace(/\s+/g, " "), gender = $("#teG").value, raw = $("#teP").value.trim(), phone = raw ? normPhone(raw) : "";
    if (name.length < 2) return toast("اكتب الاسم");
    if (phone && !/^9665\d{8}$/.test(phone)) return toast("رقم الجوال غير صحيح");
    const mail = $("#teM").value.trim().toLowerCase().replace(/@.*$/, "");
    if (mail) {
      if (!/^[a-z][a-z0-9.-]{1,30}[a-z0-9]$/.test(mail) || /\.\.|--/.test(mail)) return toast("البريد: حروف إنجليزية صغيرة وأرقام ونقطة، يبدأ بحرف (3 خانات أو أكثر)");
      if (MAIL_RESERVED.includes(mail) || /^tr\d+$/.test(mail)) return toast("هذا العنوان محجوز، اختر غيره");
      const dup = Object.values(S.trainers).find(x => x.id !== tid && (x.mail === mail || (x.num && "tr" + x.num === mail)));
      if (dup) return toast("هذا العنوان مستخدم لـ " + trainerTitle(dup));
    }
    $("#teS").disabled = true;
    try {
      const b = writeBatch(db);
      b.set(ref("trainers/" + tid), {name, gender, mail}, {merge: true});
      b.set(ref("secrets/" + tid), {phone}, {merge: true});
      await b.commit();
      logAction("تعديل بيانات مدرب", (t.name === name ? name : `${t.name} ← ${name}`) + ((t.mail || "") !== mail ? ` · البريد: ${mail || "tr" + t.num}@` : ""));
      S.mailDir = null;
      toast("انحفظ التعديل"); closeModal();
    } catch (e) { $("#teS").disabled = false; handleWriteErr(e); }
  };
}
async function saveTrainer(tid, data, code){
  logAction(S.trainers[tid] ? "رمز جديد لمدرب" : "إضافة مدرب", data.name);
  const b = writeBatch(db);
  b.set(ref("trainers/" + tid), data);
  if (code) b.set(ref("secrets/" + tid), {code}, {merge: true});
  b.set(ref("public/trainerLogin"), trainerLoginMap({...S.trainers, [tid]: {id: tid, ...data}}));
  await b.commit();
}
function adminTrainers(el){
  const ts = Object.values(S.trainers).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  el.innerHTML = `
  <div class="card"><h2>المدربين والرموز</h2>
    <p class="muted" style="margin-top:0">كل مدرب يدخل برقمه ورمزه. أرسل له رسالته من زر "نسخ" بشكل خاص.</p>
    <form id="nt" class="row" autocomplete="off">
      <input type="text" id="ntn" class="grow" placeholder="اسم المدرب أو المدربة" required>
      <select id="ntg" style="width:auto"><option value="m">مدرب</option><option value="f">مدربة</option></select>
      <button class="btn gold" type="submit" id="ntb">+ إضافة</button>
    </form>
  </div>
  <div class="list">${ts.map(t => {
    const gs = Object.values(S.groups).filter(g => g.trainerId === t.id);
    const n = gs.reduce((a,g) => a + (g.students||[]).length, 0);
    return `<div class="item"><div class="grow"><div class="t">${esc(trainerTitle(t))}</div><div class="muted">${gs.length} شعبة · ${n} متدرب${gs.length ? " · " + gs.map(g => esc(g.course)).join("، ") : ""}</div>${t.num ? `<div class="muted" dir="ltr" style="text-align:right">📧 ${esc(trAddr(t))}</div>` : ""}</div>
      <span class="code">${esc(t.num || "—")}</span><span class="code">${esc(S.secrets[t.id] || "••••••")}</span>
      <span class="pill ${(S.trPhones || {})[t.id] ? "p" : ""}" dir="ltr">${esc((S.trPhones || {})[t.id] || "بدون جوال")}</span>
      <button class="btn sm" data-tedit="${esc(t.id)}">تعديل</button>
      <button class="btn sm gold" data-twa="${esc(t.id)}">واتساب</button>
      <button class="btn sm" data-copy="${esc(t.id)}">نسخ</button>
      <button class="btn sm" data-new="${esc(t.id)}">رمز جديد</button>
      <button class="btn sm" data-tdis="${esc(t.id)}">${(S.disabled || {})[t.id] ? "تفعيل" : "تعطيل"}</button>
      <button class="btn sm danger" data-del="${esc(t.id)}">حذف</button></div>`; }).join("")}</div>`;
  $("#nt").onsubmit = async e => {
    e.preventDefault();
    const name = $("#ntn").value.trim(); if (!name) return;
    $("#ntb").disabled = true;
    const tid = "t-" + uid(), code = newCode();
    try { const num = nextTrainerNum(); const acc = await createAccount(tid, 0, code); await saveTrainer(tid, {name, gender: $("#ntg").value, num, ...acc}, code); toast(`انضاف ${name} · الرقم ${num} · الرمز ${code}`); }
    catch (err) { toast(accountErr(err)); }
    $("#ntb").disabled = false;
  };
  el.querySelectorAll("[data-twa]").forEach(b => b.onclick = () => openWhatsAppTrainer(b.dataset.twa));
  el.querySelectorAll("[data-tedit]").forEach(b => b.onclick = () => editTrainer(b.dataset.tedit));
  el.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => {
    const t = S.trainers[b.dataset.copy], code = S.secrets[t.id];
    const msg = `${trainerTitle(t)}\nرقم المدرب: ${t.num || "—"}\nرمز الدخول: ${code}\nبوابة المدربين: ${location.href.split("#")[0].split("?")[0]}`;
    try { await navigator.clipboard.writeText(msg); toast("انتسخت رسالة الرمز"); } catch { toast("المتصفح منع النسخ"); }
  });
  el.querySelectorAll("[data-new]").forEach(b => b.onclick = async () => {
    const tid = b.dataset.new, code = newCode(); b.disabled = true;
    try {
      const data = clone(S.trainers[tid]); delete data.id;
      const acc = await createAccount(tid, data.ver || 0, code); Object.assign(data, acc);
      await saveTrainer(tid, data, code); toast("انعمل رمز جديد، الرمز القديم ما عاد يشتغل");
    } catch (err) { toast(accountErr(err)); b.disabled = false; }
  });
  el.querySelectorAll("[data-tdis]").forEach(b => b.onclick = () => setDisabled("trainers", b.dataset.tdis, !(S.disabled || {})[b.dataset.tdis], (S.trainers[b.dataset.tdis] || {}).name));
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "متأكد؟"; return; }
    const tid = b.dataset.del, batch = writeBatch(db);
    Object.values(S.groups).filter(g => g.trainerId === tid).forEach(g => batch.update(ref("groups/" + g.id), {trainerId: ""}));
    batch.delete(ref("trainers/" + tid)); batch.delete(ref("secrets/" + tid));
    logAction("حذف مدرب", (S.trainers[tid] || {}).name || tid);
    const rest = {...S.trainers}; delete rest[tid];
    batch.set(ref("public/trainerLogin"), trainerLoginMap(rest));
    try { await batch.commit(); toast("انحذف المدرب، وشعبه صارت بدون مدرب"); } catch (err) { handleWriteErr(err); }
  });
}

/* grades tab */
function adminGrades(el){
  const order = {submitted: 0, returned: 1, draft: 2, none: 3, approved: 4};
  const gs = sortedGroups().sort((a,b) => order[gradeStatus(a.id)] - order[gradeStatus(b.id)]);
  const cnt = k => gs.filter(g => gradeStatus(g.id) === k).length;
  if (!S.aGradeGroup || !S.groups[S.aGradeGroup]) S.aGradeGroup = null;
  el.innerHTML = `
  <div class="card"><h2>الدرجات</h2>
    <div class="stats">
      <div class="stat"><div class="n">${cnt("submitted")}</div><div class="l">بانتظار الاعتماد</div></div>
      <div class="stat"><div class="n">${cnt("approved")}</div><div class="l">معتمدة ومنشورة</div></div>
      <div class="stat"><div class="n">${cnt("draft") + cnt("returned")}</div><div class="l">عند المدربين</div></div>
      <div class="stat"><div class="n">${cnt("none")}</div><div class="l">لم تُرصد</div></div>
    </div>
    <p class="muted">المسار: المدرب يرصد ويرفع ← الشؤون الأكاديمية تعتمد أو ترجع ← بعد الاعتماد تظهر للطالب.</p>
  </div>
  ${S.aGradeGroup ? `<div class="row"><button class="btn sm" id="gBack">→ كل الشعب</button></div>${gradesEditor(S.groups[S.aGradeGroup], "admin")}` : `
  <div class="list">${gs.map(g => `<div class="item"><div class="grow"><div class="t">${esc(g.course)}</div><div class="muted">${esc(tName(g.trainerId))} · ${(g.students||[]).length} متدرب</div></div>
    <span class="pill ${GSTAT_PILL[gradeStatus(g.id)]}">${GSTAT[gradeStatus(g.id)]}</span><button class="btn sm" data-gg="${esc(g.id)}">فتح</button></div>`).join("")}</div>`}`;
  el.querySelectorAll("[data-gg]").forEach(b => b.onclick = () => { S.aGradeGroup = b.dataset.gg; render(); });
  if ($("#gBack")) { $("#gBack").onclick = () => { S.aGradeGroup = null; render(); }; bindGrades(S.groups[S.aGradeGroup], "admin"); }
}

/* report tab */
function adminReport(el){
  const gs = sortedGroups();
  if (!S.aReportGroup || !S.groups[S.aReportGroup]) S.aReportGroup = gs[0] && gs[0].id;
  el.innerHTML = `<div class="card"><h2>تقرير الحضور</h2>
    <label class="f" for="rg">الشعبة<select id="rg">${gs.map(g => `<option value="${esc(g.id)}" ${g.id===S.aReportGroup?"selected":""}>${esc(g.course)} · ${esc(tName(g.trainerId))}</option>`).join("")}</select></label></div>
    <div id="rbody"></div>`;
  $("#rg").onchange = e => { S.aReportGroup = e.target.value; if (S.unsubReport) S.unsubReport(); S.unsubReport = null; S.aReport = []; render(); };
  if (!S.aReportGroup) { $("#rbody").innerHTML = `<div class="card empty">ما فيه شعب بعد</div>`; return; }
  if (!S.unsubReport) {
    S.unsubReport = onSnapshot(query(collection(db, "att"), where("groupId", "==", S.aReportGroup)), snap => { S.aReport = snap.docs.map(d => d.data()); if (S.view === "admin" && S.aTab === "report") render(); }, () => {});
  }
  const g = S.groups[S.aReportGroup], docs = countable(S.aReport), th = TH();
  const needFee = !!(S.sys && S.sys.certNeedsFee);
  const feeOf = num => { const f = (S.finClear || {})[num]; return !needFee ? {ok: true} : !f ? {ok: false, why: "ما له حساب مالي"} : f.remaining > 0 ? {ok: false, why: "عليه " + SAR(f.remaining)} : {ok: true}; };
  const cand = (g.students || []).filter(s => s.sid).map(s => { const st = absStats(g, s.id, docs); const pct = Math.round((100 - st.absPct) * 10) / 10; const att = docs.length > 0 && pct >= th.certMin, fee = feeOf(s.sid); return {s, st, pct, att, fee, ok: att && fee.ok, c: (S.certs || {})[`${s.sid}_${g.id}`]}; });
  const toIssue = cand.filter(x => x.ok && !(x.c && !x.c.revoked));
  $("#rbody").innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><button class="btn pri sm" id="rPdf">طباعة / PDF</button><button class="btn sm" id="rXls">تنزيل Excel</button></div>${matrixTable(g, S.aReport)}</div>
  ${RO() ? "" : `<div id="aeBox"></div>`}
  <div class="card"><h2>شهادات الحضور</h2>
    <p class="muted" style="margin-top:0">يستحق الشهادة من حضوره ${th.certMin}% أو أكثر${needFee ? "، وسدّد رسومه كاملة" : ""}. كل شهادة عليها QR للتحقق منها.</p>
    ${docs.length ? `<div class="tbl"><table><thead><tr><th class="nm">الطالب</th><th>الحضور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${cand.map(x => `<tr><td class="nm">${esc(x.s.name)}</td><td>${x.pct}%</td><td>${x.c && !x.c.revoked ? `<span class="pill p">صادرة · ${esc(x.c.code)}</span>` : x.ok ? `<span class="pill">مستحق</span>` : !x.att ? `<span class="pill a">الحضور أقل من ${th.certMin}%</span>` : `<span class="pill l">موقوفة مالياً · ${esc(x.fee.why)}</span>`}</td>
        <td>${x.c && !x.c.revoked ? `<button class="btn sm" data-pc="${esc(x.c.key)}">طباعة</button> <button class="btn sm danger" data-rc="${esc(x.c.key)}">إلغاء</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <div class="row" style="margin-top:10px">${toIssue.length ? `<button class="btn gold" id="cIssue">إصدار شهادات المستحقين (${toIssue.length}) وطباعتها</button>` : ""}${cand.some(x => x.c && !x.c.revoked) ? `<button class="btn sm" id="cAll">طباعة كل الشهادات الصادرة</button>` : ""}</div>`
    : `<p class="muted" style="margin:0">ما فيه تحضير مسجل لهذا المقرر.</p>`}
  </div>`;
  bindCopy();
  if (!RO()) attEditor(g);
  $("#rPdf").onclick = () => printGroupSheet(g, S.aReport);
  $("#rXls").onclick = () => excelGroupSheet(g, S.aReport);
  if ($("#cIssue")) $("#cIssue").onclick = async () => {
    const w = openPrint(); if (!w) return;
    const b = writeBatch(db), made = [];
    toIssue.forEach(x => { const code = certCode(); const c = {code, key: `${x.s.sid}_${g.id}`, num: x.s.sid, name: x.s.name, gender: x.s.gender, groupId: g.id, course: g.course, trainer: tName(g.trainerId), attPct: x.pct, date: today(), issuedBy: S.adminRole, revoked: false}; b.set(ref("certs/" + code), c); made.push(c); });
    try { await b.commit(); made.forEach(c => { S.certs[c.key] = c; notify("cert", c.code); }); logAction("إصدار شهادات حضور", `${g.course} · ${made.length}`); }
    catch (e) { w.close(); return handleWriteErr(e); }
    const pages = []; for (const c of made) pages.push(await certPage(c));
    fillPrint(w, `شهادات حضور · ${g.course}`, pages, true);
  };
  if ($("#cAll")) $("#cAll").onclick = () => printCerts(cand.filter(x => x.c && !x.c.revoked).map(x => x.c));
  $("#rbody").querySelectorAll("[data-pc]").forEach(b => b.onclick = () => printCerts([S.certs[b.dataset.pc]]));
  $("#rbody").querySelectorAll("[data-rc]").forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "متأكد؟"; return; }
    const c = S.certs[b.dataset.rc];
    try { await setDoc(ref("certs/" + c.code), {revoked: true}, {merge: true}); logAction("إلغاء شهادة", `${c.name} · ${c.course}`); toast("أُلغيت الشهادة، وصفحة التحقق بتقول إنها ملغاة"); } catch (e) { handleWriteErr(e); }
  });
}

render();
