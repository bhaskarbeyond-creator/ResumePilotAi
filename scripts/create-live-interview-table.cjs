const { execFileSync } = require('child_process');
const path = require('path');
const SSH_KEY = path.join(__dirname, '..', 'dev_key');

function runSsh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

console.log('Creating live_interview_sessions table on live MariaDB...');
const remoteScript = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
const fs = require("fs");

async function main() {
  const sql = \`
CREATE TABLE IF NOT EXISTS live_interview_sessions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT "active",
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    state_json MEDIUMTEXT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_live_interview_status CHECK (status IN ("active", "completed")),
    CONSTRAINT fk_live_interview_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_live_interview_owner_active (user_id, status, updated_at),
    INDEX idx_live_interview_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
\`;
  await pool.query(sql);
  console.log("✅ live_interview_sessions table created successfully.");

  const [desc] = await pool.query("DESCRIBE live_interview_sessions;");
  console.log("Table columns:", desc.map(c => c.Field));
  process.exit(0);
}
main().catch(e => { console.error("Error creating table:", e); process.exit(1); });
'
`;

console.log(runSsh(remoteScript));
