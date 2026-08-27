#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Local/certification MySQL bootstrap (no root package manager required).
#
# Provisions a REAL MySQL 5.7 server from the npm-published binary package
# (mysql-server-5.7-lin-x64), building the single missing system library
# (libaio) from source. Used by the zero-Firestore certification suite when
# the host has no system MySQL/MariaDB. Production deployments use the
# managed MySQL/MariaDB instance configured via backend/.env instead.
#
# Artifacts live in $HOME/.cache (outside the repository).
# ---------------------------------------------------------------------------
set -euo pipefail

CACHE="${HOME}/.cache/resumepilot-mysql"
PKG_DIR="${CACHE}/mysql-server"
DATA_DIR="${PKG_DIR}/data/mysql"
SOCKET="${PKG_DIR}/temp/mysql.sock"
PORT="${MYSQL_CERT_PORT:-3306}"
DB_NAME="${DB_NAME:-ai_resume_builder}"
DB_USER="${DB_USER:-resumepilot}"
DB_PASSWORD="${DB_PASSWORD:-resumepilot_sandbox_pw}"

mkdir -p "${CACHE}"

# 1. libaio (only missing dependency of the mysqld binary).
if [ ! -f /usr/lib/x86_64-linux-gnu/libaio.so.1 ]; then
  echo "[setup] building libaio from source..."
  if [ ! -d "${CACHE}/libaio" ]; then
    curl -sL -o "${CACHE}/libaio.tar.gz" "https://codeload.github.com/crossbuild/libaio/tar.gz/refs/heads/master"
    mkdir -p "${CACHE}/libaio"
    tar xzf "${CACHE}/libaio.tar.gz" -C "${CACHE}/libaio" --strip-components=1
  fi
  make -C "${CACHE}/libaio" >/dev/null
  sudo cp "${CACHE}/libaio/src/libaio.so.1.0.1" /usr/lib/x86_64-linux-gnu/
  sudo ln -sf /usr/lib/x86_64-linux-gnu/libaio.so.1.0.1 /usr/lib/x86_64-linux-gnu/libaio.so.1
fi

# 2. MySQL server binary (npm registry).
if [ ! -x "${PKG_DIR}/mysqld" ]; then
  echo "[setup] downloading MySQL 5.7 server from the npm registry..."
  mkdir -p "${CACHE}/npm-pkg"
  (cd "${CACHE}/npm-pkg" && npm pack mysql-server-5.7-lin-x64 >/dev/null)
  mkdir -p "${PKG_DIR}"
  tar xzf "${CACHE}/npm-pkg/mysql-server-5.7-lin-x64-"*.tgz -C "${PKG_DIR}" --strip-components=2
  mkdir -p "${PKG_DIR}/temp" "${PKG_DIR}/mysql-files" "${DATA_DIR}"
fi

# 3. Initialize the data directory once.
if [ ! -d "${DATA_DIR}/mysql" ]; then
  echo "[setup] initializing MySQL data directory..."
  "${PKG_DIR}/mysqld" --initialize-insecure --explicit_defaults_for_timestamp \
    --user="$(whoami)" --datadir="${DATA_DIR}" --basedir="${PKG_DIR}"
fi

# 4. Start the server if the port is free.
if ! (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  echo "[setup] starting mysqld on port ${PORT}..."
  nohup "${PKG_DIR}/mysqld" --no-defaults \
    --user="$(whoami)" --basedir="${PKG_DIR}" --datadir="${DATA_DIR}" \
    --tmpdir="${PKG_DIR}/temp" --socket="${SOCKET}" --port="${PORT}" \
    --bind-address=127.0.0.1 --log_syslog=0 --explicit_defaults_for_timestamp \
    --skip-name-resolve --secure-file-priv="${PKG_DIR}/mysql-files" \
    > "${CACHE}/mysqld.log" 2>&1 &
  for i in $(seq 1 30); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then break; fi
    sleep 1
  done
fi

# 5. Provision database + application user.
node - "${SOCKET}" "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}" <<'EOF'
const mysql = require(require('path').join(process.cwd(), 'backend', 'node_modules', 'mysql2', 'promise'));
const [socketPath, dbName, dbUser, dbPassword] = process.argv.slice(2);
(async () => {
  const conn = await mysql.createConnection({ socketPath, user: 'root', password: '', multipleStatements: true });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${dbPassword}'`);
  await conn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}'`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
  await conn.query('FLUSH PRIVILEGES');
  const [rows] = await conn.query('SELECT VERSION() AS v');
  console.log(`[setup] MySQL ${rows[0].v} ready on port ${process.env.MYSQL_CERT_PORT || 3306} (db: ${dbName})`);
  await conn.end();
})().catch(err => { console.error('[setup] FAILED:', err.message); process.exit(1); });
EOF
