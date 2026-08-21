#!/usr/bin/env bash
# =============================================================================
# Hostinger production release tool — ResumePilot AI (airesume.projectdemo.guru)
#
# Subcommands:
#   diagnose   Read-only production inspection (deployed SHA, PM2, index.html,
#              .htaccess, error logs). ALWAYS run this first.
#   backup     Full pre-deploy backup of backend + public_html on the server.
#   deploy     Build locally, deploy backend + frontend, update COMMIT_SHA,
#              restart PM2, then verify.
#   fix-500    Targeted remediation for the "every SPA route returns HTTP 500"
#              incident: re-upload dist (index.html!) and restore a known-good
#              SPA .htaccess, then verify.
#   verify     Post-deploy verification (HTTP 200s, SHA match, asset hashes).
#   rollback   Restore the most recent backup archives.
#
# Configuration (env or defaults):
#   PROD_SSH_HOST=82.112.232.112  PROD_SSH_PORT=65002  PROD_SSH_USER=u727965524
#   PROD_SSH_PASS=<password>      (omit to use interactive/ssh-agent auth)
#   PROD_DOMAIN=airesume.projectdemo.guru
#
# Requires: bash, ssh/scp (plus sshpass when PROD_SSH_PASS is set), curl, git,
# node+npm for `deploy`. A frontend build requires the production `.env`
# (VITE_FIREBASE_* values) in the repo root — NEVER commit that file.
# =============================================================================
set -euo pipefail

PROD_SSH_HOST="${PROD_SSH_HOST:-82.112.232.112}"
PROD_SSH_PORT="${PROD_SSH_PORT:-65002}"
PROD_SSH_USER="${PROD_SSH_USER:-u727965524}"
PROD_DOMAIN="${PROD_DOMAIN:-airesume.projectdemo.guru}"
REMOTE_WEBROOT="domains/${PROD_DOMAIN}/public_html"
STAMP="$(date +%Y%m%d-%H%M%S)"

SSH_BASE=(ssh -p "${PROD_SSH_PORT}" -o StrictHostKeyChecking=accept-new "${PROD_SSH_USER}@${PROD_SSH_HOST}")
SCP_BASE=(scp -P "${PROD_SSH_PORT}" -o StrictHostKeyChecking=accept-new)
if [[ -n "${PROD_SSH_PASS:-}" ]]; then
  command -v sshpass >/dev/null || { echo "PROD_SSH_PASS set but sshpass is not installed"; exit 1; }
  SSH_BASE=(sshpass -e ssh -p "${PROD_SSH_PORT}" -o StrictHostKeyChecking=accept-new "${PROD_SSH_USER}@${PROD_SSH_HOST}")
  SCP_BASE=(sshpass -e scp -P "${PROD_SSH_PORT}" -o StrictHostKeyChecking=accept-new)
  export SSHPASS="${PROD_SSH_PASS}"
fi

rssh() { "${SSH_BASE[@]}" "$@"; }

http_code() { curl -s -o /dev/null -w '%{http_code}' -m 25 "$1"; }

require_clean_tree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: working tree is not clean. Commit or stash before deploying."; exit 1
  fi
}

cmd_diagnose() {
  echo "=== DIAGNOSE ${PROD_DOMAIN} @ ${PROD_SSH_HOST}:${PROD_SSH_PORT} ==="
  rssh bash -s <<REMOTE
set -u
echo "--- whoami / node ---"
whoami; uname -sr
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:\$HOME/.local/bin:\$PATH
node --version 2>/dev/null || echo "node NOT on PATH"
echo "--- deployed backend COMMIT_SHA ---"
cat backend/COMMIT_SHA 2>/dev/null || echo "MISSING backend/COMMIT_SHA"
echo "--- PM2 ---"
~/.local/bin/pm2 ls 2>/dev/null || pm2 ls 2>/dev/null || echo "pm2 not reachable"
~/.local/bin/pm2 describe airesume-backend 2>/dev/null | grep -E "status|restarts|uptime|memory" || true
echo "--- webroot: index.html / .htaccess ---"
ls -la ${REMOTE_WEBROOT}/index.html 2>/dev/null || echo "!!! ${REMOTE_WEBROOT}/index.html IS MISSING — this alone explains HTTP 500 on every SPA route"
ls -la ${REMOTE_WEBROOT}/.htaccess 2>/dev/null || echo "!!! .htaccess missing"
echo "--- .htaccess content ---"
cat ${REMOTE_WEBROOT}/.htaccess 2>/dev/null || true
echo "--- newest assets ---"
ls -lat ${REMOTE_WEBROOT}/assets 2>/dev/null | head -8 || echo "assets dir missing"
echo "--- recent LiteSpeed / error logs ---"
for f in ${REMOTE_WEBROOT}/../logs/error_log logs/error_log .logs/error_log; do
  [ -f "\$f" ] && { echo "== \$f =="; tail -25 "\$f"; }
done
echo "--- disk ---"
df -h ~ | tail -1
REMOTE
  echo; echo "--- external HTTP truth ---"
  for p in "/" "/enterprise" "/robots.txt" "/api/healthz" "/api/readyz"; do
    printf '%-16s -> %s\n' "$p" "$(http_code "https://${PROD_DOMAIN}${p}")"
  done
}

cmd_backup() {
  echo "=== BACKUP (server-side, timestamp ${STAMP}) ==="
  rssh "mkdir -p backups && \
    tar -czf backups/backend-${STAMP}.tar.gz backend/COMMIT_SHA backend/index.js backend/package.json backend/routes backend/services backend/security backend/enterprise 2>/dev/null; \
    tar -czf backups/public_html-${STAMP}.tar.gz -C ${REMOTE_WEBROOT} . 2>/dev/null; \
    ls -la backups | tail -5"
  echo "Rollback: bash scripts/hostinger-release.sh rollback   (restores newest pair)"
}

write_known_good_htaccess() {
  # Known-good SPA fallback for LiteSpeed/Apache on Hostinger:
  # real files/dirs are served as-is; everything else rewrites to /index.html.
  # RewriteCond on -f prevents the rewrite loop that surfaces as HTTP 500
  # when index.html is missing.
  cat > /tmp/spa.htaccess <<'HTA'
Options -MultiViews
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
HTA
}

cmd_fix_500() {
  echo "=== FIX-500: restore SPA delivery ==="
  [[ -f dist/index.html ]] || { echo "dist/index.html missing — run 'npm run build' first (requires production .env)"; exit 1; }
  cmd_backup
  echo "--- uploading dist ---"
  tar -czf /tmp/dist-bundle.tar.gz -C dist .
  "${SCP_BASE[@]}" /tmp/dist-bundle.tar.gz "${PROD_SSH_USER}@${PROD_SSH_HOST}:dist-bundle.tar.gz"
  rssh "tar -xzf dist-bundle.tar.gz -C ${REMOTE_WEBROOT} && rm dist-bundle.tar.gz"
  echo "--- ensuring known-good .htaccess ---"
  write_known_good_htaccess
  "${SCP_BASE[@]}" /tmp/spa.htaccess "${PROD_SSH_USER}@${PROD_SSH_HOST}:${REMOTE_WEBROOT}/.htaccess"
  cmd_verify
}

cmd_deploy() {
  echo "=== DEPLOY $(git rev-parse --short HEAD) → ${PROD_DOMAIN} ==="
  require_clean_tree
  [[ -f .env ]] || echo "WARNING: no .env in repo root — the frontend build will lack VITE_FIREBASE_* values."
  echo "--- building frontend ---"
  npm run build
  [[ -f dist/index.html ]] || { echo "build produced no dist/index.html; aborting"; exit 1; }
  git rev-parse HEAD > backend/COMMIT_SHA
  cmd_backup
  echo "--- backend bundle ---"
  tar -czf /tmp/backend-bundle.tar.gz -C backend COMMIT_SHA index.js package.json routes services security enterprise
  "${SCP_BASE[@]}" /tmp/backend-bundle.tar.gz "${PROD_SSH_USER}@${PROD_SSH_HOST}:backend-bundle.tar.gz"
  rssh "tar -xzf backend-bundle.tar.gz -C backend && rm backend-bundle.tar.gz"
  echo "--- frontend bundle ---"
  tar -czf /tmp/dist-bundle.tar.gz -C dist .
  "${SCP_BASE[@]}" /tmp/dist-bundle.tar.gz "${PROD_SSH_USER}@${PROD_SSH_HOST}:dist-bundle.tar.gz"
  rssh "tar -xzf dist-bundle.tar.gz -C ${REMOTE_WEBROOT} && rm dist-bundle.tar.gz"
  write_known_good_htaccess
  "${SCP_BASE[@]}" /tmp/spa.htaccess "${PROD_SSH_USER}@${PROD_SSH_HOST}:${REMOTE_WEBROOT}/.htaccess"
  echo "--- PM2 restart ---"
  rssh "export PATH=/opt/alt/alt-nodejs20/root/usr/bin:\$HOME/.local/bin:\$PATH; pm2 restart airesume-backend --update-env && pm2 save"
  sleep 3
  cmd_verify
}

cmd_verify() {
  echo "=== VERIFY ==="
  local fail=0
  for p in "/" "/enterprise" "/api/healthz" "/api/readyz"; do
    local code; code="$(http_code "https://${PROD_DOMAIN}${p}")"
    printf '%-16s -> %s\n' "$p" "$code"
    [[ "$code" == "200" ]] || fail=1
  done
  echo "--- deployed SHA vs local HEAD ---"
  local remote_sha; remote_sha="$(rssh 'cat backend/COMMIT_SHA 2>/dev/null' | tr -d '[:space:]')"
  local local_sha; local_sha="$(git rev-parse HEAD)"
  echo "server: ${remote_sha:-<none>}"; echo "local : ${local_sha}"
  [[ "${remote_sha}" == "${local_sha}" ]] && echo "SHA MATCH ✓" || { echo "SHA MISMATCH ✗"; fail=1; }
  echo "--- entry asset hash matches local dist ---"
  if [[ -f dist/index.html ]]; then
    local local_entry; local_entry="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)"
    local live_entry;  live_entry="$(curl -s -m 25 "https://${PROD_DOMAIN}/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
    echo "local: ${local_entry:-<none>}  live: ${live_entry:-<none>}"
    [[ -n "$local_entry" && "$local_entry" == "$live_entry" ]] && echo "ASSET MATCH ✓" || { echo "ASSET MISMATCH ✗"; fail=1; }
  else
    echo "(no local dist — skipping asset comparison)"
  fi
  echo "--- next: authenticated live verification ---"
  echo "  node scripts/verify-live-production.mjs        (API walk + CRUD + isolation)"
  echo "  npx playwright test tests/enterprise-live.spec.js   (browser + visual)"
  [[ $fail -eq 0 ]] && echo "VERIFY: PASS" || { echo "VERIFY: FAIL"; exit 1; }
}

cmd_rollback() {
  echo "=== ROLLBACK to newest backups ==="
  rssh bash -s <<REMOTE
set -eu
latest_backend=\$(ls -1t backups/backend-*.tar.gz 2>/dev/null | head -1)
latest_front=\$(ls -1t backups/public_html-*.tar.gz 2>/dev/null | head -1)
[ -n "\$latest_backend" ] && tar -xzf "\$latest_backend" && echo "backend restored from \$latest_backend"
[ -n "\$latest_front" ] && tar -xzf "\$latest_front" -C ${REMOTE_WEBROOT} && echo "frontend restored from \$latest_front"
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:\$HOME/.local/bin:\$PATH
pm2 restart airesume-backend --update-env || true
REMOTE
  cmd_verify || true
}

case "${1:-}" in
  diagnose) cmd_diagnose ;;
  backup)   cmd_backup ;;
  deploy)   cmd_deploy ;;
  fix-500)  cmd_fix_500 ;;
  verify)   cmd_verify ;;
  rollback) cmd_rollback ;;
  *) grep '^#' "$0" | sed -n '2,30p'; exit 1 ;;
esac
