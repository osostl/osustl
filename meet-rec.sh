#!/bin/bash
# OSOS classroom, step 3: lecture recordings stored on this server.
# Trainers upload the file they recorded; students of the course watch it inside the portal.
# Every upload/view/delete needs a short-lived ticket signed by the portal service with the shared key
# (/root/osos-meet-secret, made by meet-link.sh). Run as root: bash meet-rec.sh
set -e
DOMAIN="meet.osustl.com"
NCFG="/etc/nginx/sites-available/$DOMAIN.conf"
say(){ echo; echo "=== $* ==="; }
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
[ -s /root/osos-meet-secret ] || { echo "Run meet-link.sh first."; exit 1; }

say "1/4 Storage and service user"
id ososrec >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ososrec
mkdir -p /var/osos-rec /opt/osos-rec /etc/osos-rec
chown ososrec:ososrec /var/osos-rec && chmod 755 /var/osos-rec
install -m 640 -o root -g ososrec /root/osos-meet-secret /etc/osos-rec/secret

say "2/4 Recording service"
cat > /opt/osos-rec/server.py <<'PY'
#!/usr/bin/env python3
# Small upload/download service for lecture recordings, behind nginx at /rec/.
import hmac, hashlib, json, base64, os, re, shutil, time, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import urlopen, Request

ROOT = "/var/osos-rec"
SECRET = open("/etc/osos-rec/secret").read().strip().encode()
OK_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
OK_RID = re.compile(r"^(\d{8})-[A-Za-z0-9]{6,20}$")

def ticket(raw, op):
    try:
        body, sig = raw.split(".", 1)
        good = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(good, sig): return None
        t = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if t.get("op") != op or t.get("exp", 0) < time.time(): return None
        return t
    except Exception:
        return None

def path_of(t):
    gid, rid = str(t.get("gid", "")), str(t.get("rid", ""))
    if not OK_ID.match(gid) or not OK_RID.match(rid): return None
    # mail attachments ("k": "mail") are kept apart from recordings and are never touched by /purge
    return os.path.join(ROOT, gid, rid + (".att" if t.get("k") == "mail" else ".webm"))

def dir_size(p):
    n = 0
    for d, _, fs in os.walk(p):
        for f in fs:
            try: n += os.path.getsize(os.path.join(d, f))
            except OSError: pass
    return n

NET = {"t": 0, "rx": 0, "tx": 0, "rate": {}}
def net_iface():
    try:
        for line in open("/proc/net/route").read().splitlines()[1:]:
            f = line.split()
            if f[1] == "00000000": return f[0]
    except Exception: pass
    return "eth0"
def net_bytes(ifc):
    for line in open("/proc/net/dev"):
        if line.strip().startswith(ifc + ":"):
            f = line.split(":", 1)[1].split(); return int(f[0]), int(f[8])
    return 0, 0
def net_rate():
    """megabits per second since the last reading (readings 3+ seconds apart; the portal asks every 20 seconds)"""
    ifc = net_iface(); rx, tx = net_bytes(ifc); now = time.time()
    if not NET["t"] or now - NET["t"] > 300:
        NET.update(t=now, rx=rx, tx=tx); time.sleep(1); rx, tx = net_bytes(ifc); now = time.time()
    dt = now - NET["t"]
    if dt >= 1:
        NET["rate"] = {"netIn": round((rx - NET["rx"]) * 8 / dt / 1e6, 1), "netOut": round((tx - NET["tx"]) * 8 / dt / 1e6, 1)}
        NET.update(t=now, rx=rx, tx=tx)
    r = dict(NET["rate"])
    try:
        sp = int(open("/sys/class/net/%s/speed" % ifc).read().strip())
        if sp > 0: r["linkMbps"] = sp
    except Exception: pass
    return r

class H(BaseHTTPRequestHandler):
    server_version = "osos-rec"
    def log_message(self, *a): pass
    def send(self, code, obj=None, headers=None):
        b = json.dumps(obj or {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def t(self, op):
        q = parse_qs(urlparse(self.path).query)
        return ticket((q.get("t") or [""])[0], op)
    def route(self): return urlparse(self.path).path.rstrip("/")
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Max-Age", "3600")
        self.end_headers()
    def do_PUT(self):
        if self.route() != "/up": return self.send(404)
        t = self.t("up"); p = path_of(t) if t else None
        if not p: return self.send(403, {"error": "ticket"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > int(t.get("max", 0)): return self.send(413, {"error": "size"})
        if shutil.disk_usage(ROOT).free < n + 2 * 1024 ** 3: return self.send(507, {"error": "full"})
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp, left = p + ".part", n
        with open(tmp, "wb") as f:
            while left > 0:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk: break
                f.write(chunk); left -= len(chunk)
        if left: os.remove(tmp); return self.send(400, {"error": "cut"})
        os.replace(tmp, p)
        self.send(200, {"ok": True, "size": n})
    def do_GET(self):
        r = self.route()
        if r == "/get":
            t = self.t("get"); p = path_of(t) if t else None
            if not p or not os.path.exists(p): return self.send(404, {"error": "missing"})
            self.send_response(200)
            self.send_header("X-Accel-Redirect", "/_osos_rec/" + os.path.relpath(p, ROOT))
            if t.get("k") == "mail":
                ct = str(t.get("ct", ""))
                if not re.match(r"^[\w.+-]+/[\w.+-]+$", ct): ct = "application/octet-stream"
                fn = quote(str(t.get("fn", "file"))[:150], safe="")
                self.send_header("Content-Type", ct)
                self.send_header("Content-Disposition", ("inline" if t.get("inl") else "attachment") + "; filename*=UTF-8''" + fn)
            else:
                self.send_header("Content-Type", "video/webm")
            self.end_headers(); return
        if r == "/load":
            # people in the classroom right now, read from the bridge's own metrics (for the automatic switch to Teams)
            n, used, vals = 0, None, {}
            try:
                req = Request("http://127.0.0.1:8080/metrics", headers={"Accept": "text/plain"})
                txt = urlopen(req, timeout=2).read().decode("utf-8", "replace")
                vals = {}
                if txt.lstrip().startswith("{"):      # some bridge versions answer in JSON
                    for k, v in json.loads(txt).items():
                        if isinstance(v, (int, float)): vals["jitsi_jvb_" + k if not k.startswith("jitsi_jvb_") else k] = float(v)
                else:
                    for line in txt.splitlines():
                        if line.startswith("#") or " " not in line: continue
                        k, v = line.rsplit(" ", 1); k = k.split("{")[0]
                        try: vals[k] = vals.get(k, 0) + float(v)
                        except ValueError: pass
                for k in ("jitsi_jvb_current_endpoints", "jitsi_jvb_local_endpoints", "jitsi_jvb_endpoints", "jitsi_jvb_participants"):
                    if k in vals: n, used = int(vals[k]), k; break
                if used is None: used = "none: " + ",".join(sorted(x for x in vals if "endpoint" in x))[:200]
            except Exception as e:
                used = "error: " + str(e)[:120]
            out = {"participants": n, "metric": used, "conferences": int(vals.get("jitsi_jvb_conferences", 0))}
            # server health for the portal: processor, memory and disk, in percent
            try: out["cpu"] = round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100)
            except Exception: pass
            try:
                mi = {}
                for line in open("/proc/meminfo"):
                    k, v = line.split(":", 1); mi[k] = int(v.split()[0])
                out["mem"] = round((1 - mi["MemAvailable"] / mi["MemTotal"]) * 100); out["memGB"] = round(mi["MemTotal"] / 1024 ** 2, 1)
            except Exception: pass
            try:
                u = shutil.disk_usage(ROOT); out["disk"] = round((u.total - u.free) / u.total * 100); out["diskFreeGB"] = round(u.free / 1024 ** 3); out["diskGB"] = round(u.total / 1024 ** 3)
            except Exception: pass
            out["cores"] = os.cpu_count() or 1
            # internet in and out of this server, in megabits per second (the first thing to run out with many cameras)
            try: out.update(net_rate())
            except Exception: pass
            return self.send(200, out)
        if r == "/stats":
            if not self.t("stats"): return self.send(403, {"error": "ticket"})
            u = shutil.disk_usage(ROOT)
            files = sum(len([f for f in fs if f.endswith(".webm")]) for _, _, fs in os.walk(ROOT))
            return self.send(200, {"total": u.total, "free": u.free, "rec": dir_size(ROOT), "files": files})
        self.send(404)
    def do_POST(self):
        r = self.route()
        if r == "/del":
            t = self.t("del"); p = path_of(t) if t else None
            if not p: return self.send(403, {"error": "ticket"})
            if os.path.exists(p): os.remove(p)
            return self.send(200, {"ok": True})
        if r == "/purge":
            t = self.t("purge")
            before = str((t or {}).get("before", "")).replace("-", "")
            if not t or not re.match(r"^\d{8}$", before): return self.send(403, {"error": "ticket"})
            n = 0
            for d, _, fs in os.walk(ROOT):
                for f in fs:
                    m = OK_RID.match(f[:-5]) if f.endswith(".webm") else None
                    if m and m.group(1) <= before:
                        os.remove(os.path.join(d, f)); n += 1
            return self.send(200, {"ok": True, "deleted": n})
        self.send(404)

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8090), H).serve_forever()
PY
cat > /etc/systemd/system/osos-rec.service <<'EOF'
[Unit]
Description=OSOS lecture recordings
After=network.target
[Service]
User=ososrec
Group=ososrec
UMask=0022
ExecStart=/usr/bin/python3 /opt/osos-rec/server.py
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/osos-rec
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now osos-rec
systemctl restart osos-rec

say "3/4 Web paths"
python3 - "$NCFG" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
if "/_osos_rec/" not in s:
    blk = '''    # OSOS: lecture recordings (upload, watch, delete) - every request needs a signed ticket
    location ^~ /rec/ {
        proxy_pass http://127.0.0.1:8090/;
        client_max_body_size 4g;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    location ^~ /_osos_rec/ {
        internal;
        alias /var/osos-rec/;
        types { video/webm webm; }
        add_header Cache-Control "private, no-store" always;
    }
'''
    m = re.search(r'^[ \t]*location\s*=\s*/external_api\.js', s, re.M)
    if not m: sys.exit("place not found in nginx config")
    s = s[:m.start()] + blk + s[m.start():]
    open(p, 'w').write(s); print("recording paths added")
s = open(p).read()
if "8080/colibri/stats" in s:
    s = s.replace("proxy_pass http://127.0.0.1:8080/colibri/stats;", "proxy_pass http://127.0.0.1:8090/load;")
    open(p, 'w').write(s); print("load counter moved to the bridge metrics")
s = open(p).read()
# the load service sends its own CORS header; a second one from nginx makes browsers refuse the answer
# files opened by the portal itself (signing, archive) are read from the page, so they need a CORS header
if "/_osos_rec/" in s and "osos-files-cors" not in s:
    s = s.replace('add_header Cache-Control "private, no-store" always;', 'add_header Cache-Control "private, no-store" always;\n        add_header Access-Control-Allow-Origin "*" always;  # osos-files-cors', 1)
    open(p, 'w').write(s); print("file downloads: CORS header added")
s = open(p).read()
if "8090/load;" in s and "proxy_hide_header Access-Control-Allow-Origin" not in s:
    s = s.replace("proxy_pass http://127.0.0.1:8090/load;", "proxy_pass http://127.0.0.1:8090/load;\n        proxy_hide_header Access-Control-Allow-Origin;")
    open(p, 'w').write(s); print("load counter: duplicate CORS header fixed")
PY
nginx -t
systemctl reload nginx

say "4/4 Check"
sleep 2
printf "%-12s %s\n" "osos-rec" "$(systemctl is-active osos-rec)"
printf "%-12s %s\n" "nginx" "$(systemctl is-active nginx)"
echo "Ticket check (403 is correct here): $(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/rec/stats)"
echo "Load counter: $(curl -s -m 3 https://$DOMAIN/osos-load)"
echo "CORS headers (must be exactly 1): $(curl -s -m 3 -D - -o /dev/null -H 'Origin: https://osustl.com' https://$DOMAIN/osos-load | grep -ci '^access-control-allow-origin')"
df -h /var/osos-rec | tail -1
echo
echo "DONE. Recordings are stored in /var/osos-rec"
