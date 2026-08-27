#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FIRESTORE FAILURE INJECTION — network level (mission §9)
#
# Blackholes every Google Firebase/Firestore endpoint in /etc/hosts so that:
#   - Firestore credentials are absent        (no service account in env)
#   - Firestore DNS is unavailable             (NXDOMAIN-equivalent blackhole)
#   - Firestore endpoints are unreachable      (127.0.0.2 discard address)
#   - Firebase Auth endpoints are unreachable  (identitytoolkit/securetoken)
#
# Then runs the full Firestore-OFF runtime certification chain. The app must
# start, authenticate, and serve every certified journey with ZERO reachability
# of any Google endpoint. Restores /etc/hosts afterwards (trap-guaranteed).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../.."

HOSTS=/etc/hosts
MARKER="# resumepilot-firestore-blackhole"

cleanup() {
  if grep -q "$MARKER" "$HOSTS" 2>/dev/null; then
    sudo sed -i "/$MARKER/d" "$HOSTS"
    echo "[hosts] blackhole entries removed"
  fi
}
trap cleanup EXIT

echo "[hosts] blackholing Google Firebase/Firestore endpoints..."
sudo tee -a "$HOSTS" > /dev/null <<EOF
127.0.0.2 firestore.googleapis.com $MARKER
127.0.0.2 firebasestorage.googleapis.com $MARKER
127.0.0.2 firebaserules.googleapis.com $MARKER
127.0.0.2 identitytoolkit.googleapis.com $MARKER
127.0.0.2 securetoken.googleapis.com $MARKER
127.0.0.2 www.googleapis.com $MARKER
127.0.0.2 oauth2.googleapis.com $MARKER
127.0.0.2 firebase.googleapis.com $MARKER
127.0.0.2 clouderrorreporting.googleapis.com $MARKER
EOF

echo "[verify] DNS resolution now blackholed:"
getent hosts firestore.googleapis.com || echo "  firestore.googleapis.com -> not resolvable via getent (blocked)"
python3 - <<'PY'
import socket
for host in ("firestore.googleapis.com", "identitytoolkit.googleapis.com"):
    try:
        ip = socket.gethostbyname(host)
        print(f"  {host} -> {ip}")
        if not ip.startswith("127.0.0.2"):
            raise SystemExit(f"BLACKHOLE FAILED for {host}")
    except socket.gaierror:
        print(f"  {host} -> NXDOMAIN (blocked)")
print("[verify] all Google endpoints blackholed")
PY

echo "[run] executing Firestore-OFF runtime certification with endpoints unreachable..."
node --test --test-force-exit --test-concurrency=1 tests/certification/firestore-off-boot.test.mjs
RC=$?

echo "[result] certification exit code: $RC"
exit $RC
