#!/bin/bash
# OSOS classroom: the SECOND video server. It carries the video of some lectures; logins, rooms,
# recordings and files stay on the main server (meet.osustl.com).
# Run as root on a fresh Ubuntu 24.04 server, with the line printed by meet-jvb2-main.sh:
#   bash meet-jvb2.sh <main IP> '<bridge password>' '<bridge room>' '<version>'
# Nothing secret is stored in this file.
set -e
DOMAIN="meet.osustl.com"
MAIN="$1"; PASS="$2"; BREW="$3"; VER="$4"
say(){ echo; echo "=== $* ==="; }
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
[[ "$MAIN" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && [ -n "$PASS" ] && [ -n "$BREW" ] || { echo "Use the line printed by meet-jvb2-main.sh on the main server."; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || echo "Warning: this was tested for Ubuntu 24.04."
IP=$(curl -4 -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
echo "This server: $IP   |   main server: $MAIN"

say "1/6 Name and firewall"
hostnamectl set-hostname "jvb2.$DOMAIN"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y curl gnupg2 apt-transport-https ufw unattended-upgrades python3
ufw allow OpenSSH
ufw allow 10000/udp                                                   # lecture audio and video
ufw allow from "$MAIN" to any port 9090 proto tcp comment "osos data channel via main"
ufw allow from "$MAIN" to any port 8091 proto tcp comment "osos load for the portal"
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades

say "2/6 Jitsi repository"
curl -fsSL https://download.jitsi.org/jitsi-key.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/jitsi-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/jitsi-keyring.gpg] https://download.jitsi.org stable/" > /etc/apt/sources.list.d/jitsi-stable.list
apt-get update -y

say "3/6 Video bridge (same version as the main server)"
echo "jitsi-videobridge2 jitsi-videobridge/jvb-hostname string $DOMAIN" | debconf-set-selections
if [ -n "$VER" ] && apt-cache madison jitsi-videobridge2 | grep -q " $VER "; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y "jitsi-videobridge2=$VER"
  apt-mark hold jitsi-videobridge2 >/dev/null   # update it together with the main server, never alone
else
  echo "Version $VER not offered any more: installing the newest. Update the main server's bridge too (apt upgrade)."
  DEBIAN_FRONTEND=noninteractive apt-get install -y jitsi-videobridge2
fi

say "4/6 Connect to the main server"
SIP="/etc/jitsi/videobridge/sip-communicator.properties"
touch "$SIP"
sed -i '/org.jitsi.videobridge.xmpp.user\./d' "$SIP"
cat >> "$SIP" <<EOF
org.jitsi.videobridge.xmpp.user.shard.HOSTNAME=$MAIN
org.jitsi.videobridge.xmpp.user.shard.DOMAIN=auth.$DOMAIN
org.jitsi.videobridge.xmpp.user.shard.USERNAME=jvb2
org.jitsi.videobridge.xmpp.user.shard.PASSWORD=$PASS
org.jitsi.videobridge.xmpp.user.shard.MUC_JIDS=$BREW
org.jitsi.videobridge.xmpp.user.shard.MUC_NICKNAME=jvb2
org.jitsi.videobridge.xmpp.user.shard.DISABLE_CERTIFICATE_VERIFICATION=true
EOF
chmod 640 "$SIP"; chown root:jvb "$SIP" 2>/dev/null || true
cat > /etc/jitsi/videobridge/jvb.conf <<EOF
videobridge {
    http-servers {
        public {
            port = 9090
        }
    }
    # browsers reach this bridge's data channel through the main server: wss://$DOMAIN/colibri-ws/jvb2/...
    websockets {
        enabled = true
        domain = "$DOMAIN:443"
        tls = true
        server-id = "jvb2"
    }
}
EOF
# more memory for the bridge on a big server
CFG="/etc/jitsi/videobridge/config"
if [ -f "$CFG" ]; then
  MEMG=$(awk '/MemTotal/{print int($2/1024/1024)}' /proc/meminfo)
  if [ "${MEMG:-0}" -ge 16 ]; then grep -q '^VIDEOBRIDGE_MAX_MEMORY' "$CFG" && sed -i 's/^VIDEOBRIDGE_MAX_MEMORY=.*/VIDEOBRIDGE_MAX_MEMORY=8192m/' "$CFG" || echo 'VIDEOBRIDGE_MAX_MEMORY=8192m' >> "$CFG"; fi
fi

say "5/6 Load counter for the portal (reachable only from the main server)"
id ososjvb >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ososjvb
mkdir -p /opt/osos-jvb
cat > /opt/osos-jvb/load.py <<'PY'
#!/usr/bin/env python3
# People and lectures on this bridge, with processor, memory and internet, for the main server's /osos-load.
import json, os, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request

NET = {"t": 0, "rx": 0, "tx": 0, "rate": {}}
def iface():
    try:
        for line in open("/proc/net/route").read().splitlines()[1:]:
            f = line.split()
            if f[1] == "00000000": return f[0]
    except Exception: pass
    return "eth0"
def nbytes(ifc):
    for line in open("/proc/net/dev"):
        if line.strip().startswith(ifc + ":"):
            f = line.split(":", 1)[1].split(); return int(f[0]), int(f[8])
    return 0, 0
def net():
    ifc = iface(); rx, tx = nbytes(ifc); now = time.time()
    if not NET["t"] or now - NET["t"] > 300:
        NET.update(t=now, rx=rx, tx=tx); time.sleep(1); rx, tx = nbytes(ifc); now = time.time()
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

def load():
    out, vals = {"participants": 0, "conferences": 0}, {}
    try:
        txt = urlopen(Request("http://127.0.0.1:8080/metrics", headers={"Accept": "text/plain"}), timeout=2).read().decode("utf-8", "replace")
        if txt.lstrip().startswith("{"):
            for k, v in json.loads(txt).items():
                if isinstance(v, (int, float)): vals["jitsi_jvb_" + k if not k.startswith("jitsi_jvb_") else k] = float(v)
        else:
            for line in txt.splitlines():
                if line.startswith("#") or " " not in line: continue
                k, v = line.rsplit(" ", 1); k = k.split("{")[0]
                try: vals[k] = vals.get(k, 0) + float(v)
                except ValueError: pass
        for k in ("jitsi_jvb_current_endpoints", "jitsi_jvb_local_endpoints", "jitsi_jvb_endpoints", "jitsi_jvb_participants"):
            if k in vals: out["participants"] = int(vals[k]); break
        out["conferences"] = int(vals.get("jitsi_jvb_conferences", 0))
    except Exception:
        out["bridge"] = "not answering"
    try: out["cpu"] = round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100)
    except Exception: pass
    try:
        mi = {}
        for line in open("/proc/meminfo"):
            k, v = line.split(":", 1); mi[k] = int(v.split()[0])
        out["mem"] = round((1 - mi["MemAvailable"] / mi["MemTotal"]) * 100)
    except Exception: pass
    out["cores"] = os.cpu_count() or 1
    try: out.update(net())
    except Exception: pass
    return out

class H(BaseHTTPRequestHandler):
    server_version = "osos-jvb"
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.rstrip("/") != "/load":
            self.send_response(404); self.end_headers(); return
        b = json.dumps(load()).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8091), H).serve_forever()
PY
cat > /etc/systemd/system/osos-jvb.service <<'EOF'
[Unit]
Description=OSOS second video server: load counter
After=network.target
[Service]
User=ososjvb
Group=ososjvb
ExecStart=/usr/bin/python3 /opt/osos-jvb/load.py
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now osos-jvb

say "6/6 Starting the bridge"
systemctl enable jitsi-videobridge2 >/dev/null 2>&1 || true
systemctl restart jitsi-videobridge2 osos-jvb
sleep 15
printf "%-20s %s\n" "jitsi-videobridge2" "$(systemctl is-active jitsi-videobridge2)"
printf "%-20s %s\n" "osos-jvb" "$(systemctl is-active osos-jvb)"
LOG=/var/log/jitsi/jvb.log
if grep -qiE "Joined MUC|joined the MUC|MucClient.*[Jj]oined" "$LOG" 2>/dev/null; then echo "Connected to the main server ✓"
else
  echo "Not connected yet. Last lines of the log:"; tail -n 15 "$LOG" 2>/dev/null | cut -c1-220
  echo "Send a photo of this screen."
fi
echo "Load counter: $(curl -s -m 5 http://127.0.0.1:8091/load)"
echo
echo "DONE. Open the portal: المحاضرات والتسجيلات ← حالة سيرفر القاعة. It should show two servers."
