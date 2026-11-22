#!/usr/bin/env node
/* OSOS load test: fake students and trainers join the meet server in stages, with fake cameras.
   Runs on a separate test machine (never on the meet server itself).
   The meet key is typed in when it starts and is never saved.
   Settings (environment variables, all optional):
     STAGES="20,50,100,150,200"  total students at each stage (all machines together)
     HOLD=180                    seconds to hold each stage
     ROOMS=9                     rooms = trainers (one trainer bot per room)
     CAM=on|off                  students' cameras
     RES=360                     students' camera height (trainers send 720)
     MACHINE=1/1                 this machine's share when several machines run together (1/3, 2/3, 3/3)
     START_AT=21:30              wait until this time (so several machines start together)
     STOP_LOSS=8                 stop when average packet loss passes this %
     DOMAIN=meet.osustl.com */
import {chromium} from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

const E = process.env;
const DOMAIN = E.DOMAIN || "meet.osustl.com", BASE = (E.BASE || "https://" + DOMAIN).replace(/\/+$/, "");
const STAGES = (E.STAGES || "20,50,100,150,200").split(",").map(Number).filter(n => n > 0);
const HOLD = +E.HOLD || 180, ROOMS = +E.ROOMS || 9, CAM = E.CAM !== "off", RES = +E.RES || 360;
const [MI, MN] = (E.MACHINE || "1/1").split("/").map(Number);
const STOP_LOSS = +E.STOP_LOSS || 8, PER_BROWSER = +E.PER_BROWSER || 10, TICK = 10;
const JOIN_WAIT = 60, STAMP = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const OUT = `result-${STAMP}-m${MI}.csv`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64u = b => Buffer.from(b).toString("base64url");
function jwt(secret, room, id, name, moderator){
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({alg: "HS256", typ: "JWT"}));
  const p = b64u(JSON.stringify({aud: "jitsi", iss: "osos", sub: "*", room, nbf: now - 60, exp: now + 4 * 3600, context: {user: {id, name, moderator}}}));
  return h + "." + p + "." + crypto.createHmac("sha256", secret).update(h + "." + p).digest("base64url");
}
async function askSecret(){
  if (E.MEET_SECRET) return E.MEET_SECRET;
  process.stdout.write("Meet key (MEET_SECRET), hidden while typing: ");
  const stdin = process.stdin; stdin.setRawMode && stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
  return new Promise(ok => { let s = ""; const on = c => { for (const ch of c) {
    if (ch === "\r" || ch === "\n") { stdin.setRawMode && stdin.setRawMode(false); stdin.pause(); stdin.off("data", on); process.stdout.write("\n"); return ok(s.trim()); }
    if (ch === "\u0003") process.exit(1); if (ch === "\u007f") s = s.slice(0, -1); else s += ch; } }; stdin.on("data", on); });
}

/* measuring inside each page: every WebRTC connection is kept so its traffic can be read */
const PAGE_INIT = () => {
  const Orig = window.RTCPeerConnection; window.__pcs = [];
  if (Orig) { window.RTCPeerConnection = function(...a){ const pc = new Orig(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = Orig.prototype; Object.setPrototypeOf(window.RTCPeerConnection, Orig); }
  window.__stat = async (wantCam) => {
    let rb = 0, sb = 0, lost = 0, recv = 0, rtt = [], fps = [], vin = 0;
    for (const pc of window.__pcs) { if (pc.connectionState === "closed") continue;
      (await pc.getStats()).forEach(s => {
        if (s.type === "inbound-rtp") { rb += s.bytesReceived || 0; lost += Math.max(0, s.packetsLost || 0); recv += s.packetsReceived || 0; if (s.kind === "video" && s.framesPerSecond) { fps.push(s.framesPerSecond); vin++; } }
        if (s.type === "outbound-rtp") sb += s.bytesSent || 0;
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime != null) rtt.push(s.currentRoundTripTime * 1000);
      }); }
    let joined = false, members = 0, camOn = false;
    try { const c = window.APP && APP.conference; joined = !!c.isJoined(); members = c.membersCount || 0; camOn = !c.isLocalVideoMuted();
      if (joined && wantCam && !camOn) c.muteVideo(false); } catch {}
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return {rb, sb, lost, recv, rtt: avg(rtt), fps: avg(fps), vin, joined, members, camOn};
  };
};

const browsers = [], bots = [];
let stopping = false;
async function freePage(){
  let b = browsers.find(x => x.n < PER_BROWSER);
  if (!b) {
    const br = await chromium.launch({headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage", "--no-sandbox"]});
    b = {br, n: 0}; browsers.push(b);
  }
  b.n++;
  const ctx = await b.br.newContext({permissions: ["camera", "microphone"], ignoreHTTPSErrors: !!E.BASE});
  await ctx.addInitScript(PAGE_INIT);
  return {b, ctx, page: await ctx.newPage()};
}
async function join(secret, who){
  const room = `osos-loadtest-${who.room}`;
  const tok = jwt(secret, room, who.id, who.name, who.trainer);
  const cfg = {"config.prejoinConfig.enabled": false, "config.prejoinPageEnabled": false, "config.startWithAudioMuted": !who.trainer, "config.startWithVideoMuted": !(who.trainer || CAM),
    "config.resolution": who.trainer ? 720 : RES, "config.constraints": {video: {height: {ideal: who.trainer ? 720 : RES, max: who.trainer ? 720 : RES, min: 180}}},
    "config.disableDeepLinking": true, "config.analytics.disabled": true, "userInfo.displayName": who.name};
  const hash = Object.entries(cfg).map(([k, v]) => k + "=" + encodeURIComponent(JSON.stringify(v))).join("&");
  const bot = {...who, t0: Date.now(), ok: false, last: null, rate: null};
  bots.push(bot);
  try {
    Object.assign(bot, await freePage());
    await bot.page.goto(`${BASE}/${room}?jwt=${tok}#${hash}`, {timeout: 45000, waitUntil: "domcontentloaded"});
    for (let i = 0; i < JOIN_WAIT && !stopping; i++) { const s = await bot.page.evaluate(w => window.__stat(w), who.trainer || CAM).catch(() => null);
      if (s && s.joined) { bot.ok = true; bot.joinSec = (Date.now() - bot.t0) / 1000; bot.last = {...s, at: Date.now()}; return; } await sleep(1000); }
    bot.fail = "ما دخل خلال دقيقة";
  } catch (e) { bot.fail = String(e.message || e).split("\n")[0].slice(0, 80); }
}
async function sample(){
  const live = bots.filter(b => b.ok && !b.gone);
  await Promise.all(live.map(async b => {
    const s = await Promise.race([b.page.evaluate(w => window.__stat(w), b.trainer || CAM), sleep(6000).then(() => null)]).catch(() => null);
    if (!s) { b.slow = (b.slow || 0) + 1; return; }
    if (!s.joined) { b.dropped = (b.dropped || 0) + 1; }
    const p = b.last, dt = (Date.now() - p.at) / 1000;
    b.rate = {inK: (s.rb - p.rb) * 8 / dt / 1000, outK: (s.sb - p.sb) * 8 / dt / 1000, loss: (() => { const l = s.lost - p.lost, r = s.recv - p.recv; return l + r > 0 ? 100 * l / (l + r) : 0; })(),
      rtt: s.rtt, fps: s.fps, vin: s.vin, members: s.members, cam: s.camOn, joined: s.joined};
    b.last = {...s, at: Date.now()};
  }));
}
const cpuSnap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return {idle: a.idle + c.times.idle, all: a.all + t}; }, {idle: 0, all: 0});
let cpuPrev = cpuSnap();
function myCpu(){ const c = cpuSnap(), v = 100 * (1 - (c.idle - cpuPrev.idle) / Math.max(1, c.all - cpuPrev.all)); cpuPrev = c; return v; }

function summary(stage){
  const st = bots.filter(b => !b.trainer), live = bots.filter(b => b.ok && b.rate && b.rate.joined);
  const avg = (a, f) => a.length ? a.reduce((x, b) => x + f(b), 0) / a.length : 0;
  const lossy = live.filter(b => b.rate.loss > 5).length;
  return {stage, mine: st.length, inRoom: live.filter(b => !b.trainer).length, trainers: live.filter(b => b.trainer).length,
    failed: bots.filter(b => b.fail).length, dropped: bots.filter(b => b.ok && b.rate && !b.rate.joined).length,
    joinSec: avg(bots.filter(b => b.joinSec), b => b.joinSec), inK: avg(live, b => b.rate.inK), outK: avg(live, b => b.rate.outK),
    loss: avg(live, b => b.rate.loss), lossy, rtt: avg(live, b => b.rate.rtt), fps: avg(live.filter(b => b.rate.vin), b => b.rate.fps),
    videos: avg(live, b => b.rate.vin), cams: live.filter(b => b.rate.cam).length, cpu: myCpu(), mem: 100 * (1 - os.freemem() / os.totalmem())};
}
const f0 = n => Math.round(n), f1 = n => (Math.round(n * 10) / 10).toFixed(1);
function line(s){
  return `[${new Date().toTimeString().slice(0, 8)}] مرحلة ${s.stage} | داخل ${s.inRoom}/${s.mine} طالب + ${s.trainers} مدرب | فشل ${s.failed} طاح ${s.dropped} | دخول ${f1(s.joinSec)}ث | ` +
    `نازل ${f0(s.inK)}k طالع ${f0(s.outK)}k | فقد ${f1(s.loss)}% (${s.lossy} متأثر) | تأخير ${f0(s.rtt)}ms | فيديوهات ${f1(s.videos)} @${f0(s.fps)}fps | كاميرات ${s.cams} | جهاز البوتات CPU ${f0(s.cpu)}% RAM ${f0(s.mem)}%`;
}
const CSVH = "time,stage,students_mine,in_room,trainers,failed,dropped,join_sec,in_kbps,out_kbps,loss_pct,lossy,rtt_ms,fps,videos,cams,tester_cpu,tester_ram\n";
const csv = s => [new Date().toISOString(), s.stage, s.mine, s.inRoom, s.trainers, s.failed, s.dropped, f1(s.joinSec), f0(s.inK), f0(s.outK), f1(s.loss), s.lossy, f0(s.rtt), f0(s.fps), f1(s.videos), s.cams, f0(s.cpu), f0(s.mem)].join(",") + "\n";

async function closeAll(){ stopping = true; await Promise.all(browsers.map(b => b.br.close().catch(() => {}))); }
process.on("SIGINT", async () => { console.log("\nإيقاف… نسكّر كل البوتات"); await closeAll(); process.exit(0); });

(async () => {
  const secret = await askSecret(); if (!secret) { console.log("ما انكتب المفتاح."); process.exit(1); }
  if (E.START_AT) { const [h, m] = E.START_AT.split(":").map(Number), t = new Date(); t.setHours(h, m, 0, 0); const w = t - Date.now(); if (w > 0) { console.log(`ننتظر لين ${E.START_AT}…`); await sleep(w); } }
  fs.writeFileSync(OUT, CSVH);
  console.log(`جهاز ${MI}/${MN} | الغرف ${ROOMS} | المراحل ${STAGES.join("→")} | كل مرحلة ${HOLD}ث | كاميرات الطلاب ${CAM ? "شغالة " + RES + "p" : "مطفية"} | النتائج: ${OUT}`);
  if (MI === 1) for (let r = 1; r <= ROOMS; r++) await join(secret, {trainer: true, room: r, id: "t-load" + r, name: "مدرب تجربة " + r});
  const results = []; let next = 1;
  for (const stage of STAGES) {
    const want = [];   // students numbered 1..stage across all machines; this machine takes its share
    for (; next <= stage; next++) if ((next - 1) % MN === MI - 1) want.push(next);
    for (const n of want) { if (stopping) break; join(secret, {trainer: false, room: (n - 1) % ROOMS + 1, id: "s-load" + n, name: "طالب تجربة " + n}); await sleep(1200); }
    for (let i = 0; i < JOIN_WAIT / 5 && bots.some(b => !b.ok && !b.fail); i++) await sleep(5000);
    let last;
    for (let t = 0; t < HOLD && !stopping; t += TICK) { await sleep(TICK * 1000); await sample(); last = summary(stage); console.log(line(last)); fs.appendFileSync(OUT, csv(last)); }
    results.push(last);
    const st = last || summary(stage);
    if (st.cpu > 85) console.log("⚠️  جهاز البوتات نفسه مضغوط (CPU فوق 85%) — النتيجة هنا غير دقيقة، أضف جهاز ثاني (MACHINE=1/2 و 2/2).");
    if (st.loss > STOP_LOSS || st.failed + st.dropped > Math.max(3, 0.1 * (st.mine + (MI === 1 ? ROOMS : 0)))) { console.log(`⛔ وقفنا عند مرحلة ${stage}: ${st.loss > STOP_LOSS ? "فقد الحزم " + f1(st.loss) + "%" : "فشل/طاح " + (st.failed + st.dropped)}`); break; }
  }
  console.log("\n========== الخلاصة ==========");
  for (const s of results.filter(Boolean)) console.log(`${String(s.stage).padStart(4)} طالب: داخل ${s.inRoom}/${s.mine} | فشل ${s.failed} طاح ${s.dropped} | فقد ${f1(s.loss)}% | تأخير ${f0(s.rtt)}ms | نازل ${f0(s.inK)}k لكل طالب | ${f1(s.videos)} فيديو @${f0(s.fps)}fps`);
  const fails = {}; bots.filter(b => b.fail).forEach(b => fails[b.fail] = (fails[b.fail] || 0) + 1);
  if (Object.keys(fails).length) { console.log("أسباب الفشل:"); for (const [k, v] of Object.entries(fails)) console.log(`  ${v} × ${k}`); }
  console.log(`النتائج التفصيلية: ${OUT}`);
  await closeAll(); process.exit(0);
})();
