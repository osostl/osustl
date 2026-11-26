#!/bin/bash
# OSOS classroom: connect a second video server (only the video bridge) to this main server.
# Run on the MAIN server (meet.osustl.com) as root:   bash meet-jvb2-main.sh <IP of the second server>
# Nothing secret is stored in this file. The bridge password is made here and shown once, for the second server.
# Best run when no lecture is on (prosody may restart for a moment).
set -e
DOMAIN="meet.osustl.com"
NCFG="/etc/nginx/sites-available/$DOMAIN.conf"
PCFG="/etc/prosody/conf.avail/$DOMAIN.cfg.lua"
PMAIN="/etc/prosody/prosody.cfg.lua"
JCFG="/etc/jitsi/jicofo/jicofo.conf"
REC="/opt/osos-rec/server.py"
say(){ echo; echo "=== $* ==="; }
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
IP2="$1"
[[ "$IP2" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "Usage: bash meet-jvb2-main.sh <IP of the second server>"; exit 1; }
for f in "$NCFG" "$PCFG" "$JCFG" "$REC"; do [ -f "$f" ] || { echo "Missing $f: this is not the main classroom server."; exit 1; }; done

say "1/6 Backup"
STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p /root/osos-backup/$STAMP
cp -a "$NCFG" "$PCFG" "$PMAIN" "$JCFG" "$REC" /root/osos-backup/$STAMP/ && echo "saved in /root/osos-backup/$STAMP"

say "2/6 Bridge account and room"
BREW=$(grep -oP 'brewery-jid\s*[:=]\s*"\K[^"]+' "$JCFG" | head -1 || true)
[ -n "$BREW" ] || BREW=$(grep -ohP 'MUC_JIDS\s*=\s*\K\S+' /etc/jitsi/videobridge/sip-communicator.properties 2>/dev/null | head -1 || true)
[ -n "$BREW" ] || BREW=$(grep -ohP 'MUC_JIDS\s*=\s*"\K[^"]+' /etc/jitsi/videobridge/jvb.conf 2>/dev/null | head -1 || true)
[ -n "$BREW" ] || BREW="JvbBrewery@internal.auth.$DOMAIN"
echo "bridge room: $BREW"
if [ -s /root/osos-jvb2-pass ]; then PASS=$(cat /root/osos-jvb2-pass); else PASS=$(openssl rand -hex 24); echo "$PASS" > /root/osos-jvb2-pass; chmod 600 /root/osos-jvb2-pass; fi
prosodyctl register jvb2 "auth.$DOMAIN" "$PASS"
echo "account jvb2@auth.$DOMAIN ready"
VER=$(dpkg-query -W -f='${Version}' jitsi-videobridge2 2>/dev/null || echo "")
echo "bridge version here: ${VER:-unknown}"

say "3/6 Let the second server reach this one (only its IP)"
ufw allow from "$IP2" to any port 5222 proto tcp comment "osos jvb2 xmpp" >/dev/null
echo "port 5222 open for $IP2 only"
# prosody must listen beyond this machine for the bridge to log in
RESTART_PROSODY=0
if ! ss -ltn '( sport = :5222 )' | grep -qE '(0\.0\.0\.0|\*|\[::\]):5222'; then
  grep -q '^c2s_interfaces' "$PMAIN" || { sed -i '1i c2s_interfaces = { "*", "::" }  -- osos: second video server logs in from outside' "$PMAIN"; RESTART_PROSODY=1; }
fi

say "4/6 Web path for the second server's data channel"
python3 - "$NCFG" "$IP2" <<'PY'
import re, sys
p, ip = sys.argv[1], sys.argv[2]; s = open(p).read()
blk = '''    # OSOS: data channel of the second video server (jvb2), through this server's HTTPS
    location ~ ^/colibri-ws/jvb2/(.*) {
        proxy_pass http://%s:9090/colibri-ws/jvb2/$1$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 900s;
        tcp_nodelay on;
    }
''' % ip
if "/colibri-ws/jvb2/" in s:
    s = re.sub(r'proxy_pass http://[0-9.]+:9090/colibri-ws/jvb2/', 'proxy_pass http://%s:9090/colibri-ws/jvb2/' % ip, s)
    open(p, 'w').write(s); print("jvb2 path updated")
else:
    m = re.search(r'^[ \t]*location\s*~\s*\^?/colibri-ws/', s, re.M) or re.search(r'^[ \t]*location\s*=\s*/external_api\.js', s, re.M)
    if not m: sys.exit("place not found in nginx config")
    s = s[:m.start()] + blk + s[m.start():]
    open(p, 'w').write(s); print("jvb2 path added")
PY
if ! nginx -t 2>/dev/null; then cp -a /root/osos-backup/$STAMP/$(basename "$NCFG") "$NCFG"; nginx -t; echo "nginx config restored, stopping."; exit 1; fi
systemctl reload nginx

say "5/6 Server health in the portal shows both servers"
echo "$IP2" > /etc/osos-rec/bridges; chmod 644 /etc/osos-rec/bridges
python3 - "$REC" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
if "OSOS-BRIDGES" not in s:
    anchor = "            return self.send(200, out)\n        if r == \"/stats\":"
    if anchor not in s: sys.exit("place not found in the recording service")
    add = '''            # OSOS-BRIDGES: other video servers listed in /etc/osos-rec/bridges, each with a small load service on port 8091
            try: extra = [l.strip() for l in open("/etc/osos-rec/bridges") if re.match(r"^\\d{1,3}(\\.\\d{1,3}){3}$", l.strip())]
            except Exception: extra = []
            if extra:
                own = {k: out[k] for k in ("participants", "conferences", "cpu", "mem", "netIn", "netOut", "linkMbps", "cores") if k in out}
                own["name"] = "1"; br = [own]
                for i, ip in enumerate(extra):
                    b = {"name": str(i + 2)}
                    try: b.update(json.loads(urlopen("http://%s:8091/load" % ip, timeout=2).read().decode()))
                    except Exception: b["down"] = True
                    if b.get("bridge"): b["down"] = True   # the server answers but its video bridge does not
                    br.append(b)
                    if not b.get("down"):
                        out["participants"] = out.get("participants", 0) + int(b.get("participants") or 0)
                        out["conferences"] = out.get("conferences", 0) + int(b.get("conferences") or 0)
                out["bridges"] = br
'''
    s = s.replace(anchor, add + anchor, 1)
    open(p, 'w').write(s); print("health now includes the second server")
PY
python3 -m py_compile "$REC"
systemctl restart osos-rec

say "6/6 Finishing"
if [ "$RESTART_PROSODY" = 1 ]; then
  echo "Prosody must restart once (lectures running now would drop for a few seconds)."
  read -rp "Restart prosody now? (y/n) " A
  if [ "$A" = "y" ]; then systemctl restart prosody; sleep 3; systemctl restart jicofo; else echo "Later run: systemctl restart prosody jicofo"; fi
fi
for s in prosody jicofo jitsi-videobridge2 nginx osos-rec; do printf "%-20s %s\n" "$s" "$(systemctl is-active $s)"; done
echo
echo "================================================================"
echo "Now on the SECOND server ($IP2), as root, run these two lines:"
echo
echo "curl -fsSLO https://osustl.com/meet-jvb2.sh"
echo "bash meet-jvb2.sh $(hostname -I | awk '{print $1}') '$PASS' '$BREW' '$VER'"
echo
echo "Keep that line to yourself: it holds the bridge password. Do not paste it in chats."
echo "================================================================"
