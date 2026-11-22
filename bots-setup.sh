#!/bin/bash
# OSOS load test: prepares a temporary Ubuntu 24.04 test machine (NOT the meet server), then starts the bots.
#   bash bots-setup.sh                 → full test 20→50→100→150→200
#   STAGES=5 HOLD=60 bash bots-setup.sh → quick check with 5 students first
# For more than one machine: MACHINE=1/3 on the first, 2/3 on the second, 3/3 on the third, and the same START_AT on all.
set -e
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
cd "$(dirname "$0")"
if ! [ -d node_modules/playwright ]; then
  echo "=== Installing (first time only, a few minutes) ==="
  apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
  npm init -y >/dev/null && npm i playwright@1 >/dev/null
  npx playwright install --with-deps chromium
fi
echo "=== This machine: $(nproc) cores, $(free -g | awk '/Mem/{print $2}') GB memory ==="
exec node bots.mjs
