#!/usr/bin/env python3
"""OSOS load test, server side: run on the meet server during the test.  python3 watch.py
Every 5 seconds it prints and saves: CPU, memory, network in/out, and the videobridge's own numbers.
Ctrl+C stops it and prints the peaks. Reads only; changes nothing on the server."""
import json, os, time, urllib.request, datetime, signal, sys

def iface():
    try:
        for l in open("/proc/net/route").read().splitlines()[1:]:
            p = l.split()
            if p[1] == "00000000": return p[0]
    except Exception: pass
    return "eth0"
IF = iface()
def cpu():
    v = [int(x) for x in open("/proc/stat").readline().split()[1:]]
    return v[3] + v[4], sum(v)
def net():
    for l in open("/proc/net/dev"):
        if l.strip().startswith(IF + ":"):
            p = l.split(":")[1].split(); return int(p[0]), int(p[8])
    return 0, 0
def mem():
    m = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
    return 100 * (1 - m["MemAvailable"] / m["MemTotal"])
def jvb():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/colibri/stats", timeout=2) as r: return json.load(r)
    except Exception: return {}

speed = "?"
try:
    v = int(open(f"/sys/class/net/{IF}/speed").read().strip())
    if v > 0: speed = f"{v} Mbps"
except Exception: pass
cores = os.cpu_count()
out = "server-" + datetime.datetime.now().strftime("%Y-%m-%d-%H-%M") + ".csv"
f = open(out, "w"); f.write("time,cpu_pct,load1,ram_pct,in_mbps,out_mbps,participants,conferences,largest,video_senders,stress,jvb_down_kbps,jvb_up_kbps,loss_pct\n")
print(f"السيرفر: {cores} أنوية | الشبكة {IF} سرعتها {speed} | النتائج: {out}  (Ctrl+C للإيقاف)")
peak = {"cpu": 0, "ram": 0, "inM": 0, "outM": 0, "people": 0, "stress": 0, "loss": 0}
pc, pn, pt = cpu(), net(), time.time()

def bye(*_):
    f.close()
    print("\n========== أعلى قيم وصلها السيرفر ==========")
    print(f"CPU {peak['cpu']:.0f}%  |  الذاكرة {peak['ram']:.0f}%  |  نازل {peak['inM']:.0f} Mbps  |  طالع {peak['outM']:.0f} Mbps  |  أشخاص {peak['people']}  |  ضغط الجسر {peak['stress']:.2f}  |  فقد {peak['loss']:.1f}%")
    w = []
    if peak["cpu"] > 85 or peak["stress"] > 0.8: w.append("المعالج هو الحد — السيرفر يحتاج أنوية أكثر أو جسر فيديو ثاني")
    if speed != "?" and speed[:-5].isdigit() and peak["outM"] > 0.8 * int(speed[:-5]): w.append("الإنترنت الطالع قرب حده — قلّل الدقة أو عدد الفيديوهات المعروضة")
    if peak["ram"] > 90: w.append("الذاكرة قربت تخلص")
    print("\n".join("⚠️  " + x for x in w) if w else "✅ السيرفر ما وصل لحده في هذي التجربة")
    print(f"أرسل لي الملف {out} أو صورة هذي الشاشة")
    sys.exit(0)
signal.signal(signal.SIGINT, bye); signal.signal(signal.SIGTERM, bye)

while True:
    time.sleep(5)
    c, n, t = cpu(), net(), time.time(); dt = t - pt
    cp = 100 * (1 - (c[0] - pc[0]) / max(1, c[1] - pc[1]))
    inM, outM = (n[0] - pn[0]) * 8 / dt / 1e6, (n[1] - pn[1]) * 8 / dt / 1e6
    pc, pn, pt = c, n, t
    j = jvb(); rm = mem(); ld = os.getloadavg()[0]
    people = int(j.get("participants", j.get("endpoints", 0)) or 0)
    stress = float(j.get("stress_level", 0) or 0)
    loss = 100 * float(j.get("overall_loss", j.get("loss_rate_download", 0)) or 0)
    row = [datetime.datetime.now().strftime("%H:%M:%S"), f"{cp:.0f}", f"{ld:.1f}", f"{rm:.0f}", f"{inM:.1f}", f"{outM:.1f}", people, j.get("conferences", ""), j.get("largest_conference", ""),
           j.get("endpoints_sending_video", ""), f"{stress:.2f}", j.get("bit_rate_download", ""), j.get("bit_rate_upload", ""), f"{loss:.1f}"]
    f.write(",".join(map(str, row)) + "\n"); f.flush()
    for k, v in (("cpu", cp), ("ram", rm), ("inM", inM), ("outM", outM), ("people", people), ("stress", stress), ("loss", loss)): peak[k] = max(peak[k], v)
    jv = f" | أشخاص {people} في {j.get('conferences', '?')} غرفة | ضغط الجسر {stress:.2f}" if j else " | (أرقام الجسر ما وصلت)"
    print(f"[{row[0]}] CPU {cp:3.0f}% | RAM {rm:3.0f}% | نازل {inM:6.1f} طالع {outM:6.1f} Mbps{jv}", flush=True)
