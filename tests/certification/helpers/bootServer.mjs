/**
 * Certification harness — boots the REAL production backend (backend/index.js)
 * as a child process in a controlled environment.
 *
 * The environment is constructed to model the zero-Firestore acceptance
 * environment of mission §3:
 *   - NO Firebase service-account credentials of any kind
 *   - NO Firestore data-plane flag
 *   - MySQL/MariaDB as the only configured data store
 *   - non-production identity verification via the certification HMAC verifier
 *     (production deployments verify Firebase ID tokens instead)
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BACKEND_ENTRY = path.join(ROOT, 'backend', 'index.js');

export const CERT_SECRET = 'certification-hmac-secret-' + crypto.randomBytes(12).toString('hex');

export function buildCertEnv({ port, extra = {}, db: dbEnv } = {}) {
  if (!dbEnv || !dbEnv.host || !dbEnv.port || !dbEnv.user || !dbEnv.name
      || !Object.prototype.hasOwnProperty.call(dbEnv, 'password')) {
    throw new Error('Certification server startup requires an explicit isolated MariaDB configuration');
  }
  return {
    // Minimal inherited environment; deliberately NOT spreading process.env so
    // no ambient Firebase/Firestore configuration can leak into the server.
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    PORT: String(port),
    PROTOCOL: 'http',
    WEBSITE_NAME: 'certification.local',
    CORS_ALLOWED_ORIGINS: 'http://certification.local',
    // Zero Firebase/Firestore configuration:
    //   FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL / GOOGLE_APPLICATION_CREDENTIALS
    //   / FIREBASE_DATA_PLANE are all intentionally ABSENT.
    FIREBASE_PROJECT_ID: 'firestore-unreachable-certification',
    // MySQL is the sole authoritative store.
    DB_HOST: String(dbEnv.host),
    DB_PORT: String(dbEnv.port),
    DB_USER: String(dbEnv.user),
    DB_PASSWORD: String(dbEnv.password),
    DB_NAME: String(dbEnv.name),
    // Certification identity verifier (inert outside this process tree).
    TEST_AUTH_HMAC_SECRET: CERT_SECRET,
    REQUIRE_RECENT_AUTH_IN_TEST: 'true',
    SUPER_ADMIN_MFA_REQUIRED: 'true',
    // Durable workers under test:
    NOTIFICATION_OUTBOX_WORKER_ENABLED: 'true',
    NOTIFICATION_OUTBOX_INTERVAL_MS: '5000',
    ...extra,
  };
}

export async function bootServer({ port = 8300, extraEnv = {}, db, timeoutMs = 30_000 } = {}) {
  // Fail fast if another process already serves this port: silently attaching to
  // a stale instance (different HMAC secret / schema state) produces confusing
  // 401s instead of a clean boot.
  const occupied = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);
  if (occupied) {
    throw new Error(`certification port ${port} is already occupied; stop the stale server first`);
  }

  const env = buildCertEnv({ port, extra: extraEnv, db });
  const proc = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: path.join(ROOT, 'backend'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout.on('data', chunk => { output += chunk.toString(); });
  proc.stderr.on('data', chunk => { output += chunk.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (proc.exitCode !== null) {
      throw new Error(`Certification server exited early (code ${proc.exitCode}).\n${output}`);
    }
    try {
      const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (res.status === 200) {
        return {
          base,
          proc,
          logs: () => output,
          async stop() {
            if (proc.exitCode === null) {
              proc.kill('SIGTERM');
              await new Promise(resolve => {
                const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 6000);
                proc.once('exit', () => { clearTimeout(timer); resolve(); });
              });
            }
            return output;
          },
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  proc.kill('SIGKILL');
  throw new Error(`Certification server did not become healthy within ${timeoutMs}ms: ${lastError}\n${output}`);
}

/** Issue a certification identity token for the booted server. */
export function certToken(claims, { expSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email_verified: true,
    auth_time: now,
    exp: now + expSeconds,
    ...claims,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', CERT_SECRET).update(body).digest('hex');
  return `rptest.${body}.${sig}`;
}
