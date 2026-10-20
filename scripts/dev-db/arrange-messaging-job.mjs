#!/usr/bin/env node
/**
 * TEST-ENVIRONMENT ARRANGEMENT ONLY. A conversation can only be opened for a job
 * application, so the candidate Messages E2E needs one job owned by a second test
 * identity. In a local sandbox the employer route that normally creates that job
 * cannot run: preview identities (POST /api/auth/preview-login) never carry the
 * `employer` claim that POST /api/employer/companies and POST /api/employer/jobs
 * require (both answer 403), and that claim is only granted as a Firebase custom
 * claim. This helper inserts exactly that one prerequisite row. Everything after
 * it goes through the real API: the application, the conversation, the messages
 * and the read cursors.
 *
 *   node scripts/dev-db/arrange-messaging-job.mjs --create --job-id job_e2e_msg_<suffix> \
 *     --owner-uid local_<22 hex> --title "Platform Engineer" --company "Example Test Co"
 *   node scripts/dev-db/arrange-messaging-job.mjs --remove
 *
 * --remove deletes what this flow can leave behind for every job_e2e_msg_* job:
 * the conversations opened for its applications (messages, participants, rows),
 * the notifications that name the job, the applications and the jobs. Security
 * audit records written by the real routes are left in place.
 *
 * Connection: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (as for the backend;
 * see scripts/dev-db/README.md). Refuses to run unless the host is loopback and the
 * database name contains "sandbox", "test" or "acceptance". The owner must be an
 * existing preview identity (uid local_<22 hex>) that has signed in once.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend', 'package.json'));
const mysql = backendRequire('mysql2/promise');

const JOB_ID = /^job_e2e_msg_[a-z0-9_]{1,40}$/;
const PREVIEW_UID = /^local_[a-f0-9]{22}$/;
const JOB_PATTERN = 'job\\_e2e\\_msg\\_%';
const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);

const create = process.argv.includes('--create');
const remove = process.argv.includes('--remove');
const jobId = arg('job-id');
const ownerUid = arg('owner-uid');
const title = text(arg('title'), 120);
const company = text(arg('company'), 120);
if (create === remove || (create && (!JOB_ID.test(jobId || '') || !PREVIEW_UID.test(ownerUid || '') || !title || !company))) {
  console.error('usage: --create --job-id job_e2e_msg_<a-z0-9_> --owner-uid local_<22 hex> --title <text> --company <text>  |  --remove');
  process.exit(2);
}

const host = process.env.DB_HOST || '127.0.0.1';
const database = process.env.DB_NAME || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !/(sandbox|test|acceptance)/i.test(database)) {
  console.error(`refusing: host "${host}" / database "${database}" is not a local sandbox or test database`);
  process.exit(3);
}

const connection = await mysql.createConnection({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database,
});

async function removeArrangedRows() {
  const [jobs] = await connection.query('SELECT id FROM jobs WHERE id LIKE ?', [JOB_PATTERN]);
  const jobIds = jobs.map((row) => row.id);
  const counts = { jobs: jobIds.length, applications: 0, conversations: 0, notifications: 0 };
  if (!jobIds.length) return counts;
  const [applications] = await connection.query('SELECT id FROM applications WHERE job_id IN (?)', [jobIds]);
  const applicationIds = applications.map((row) => row.id);
  counts.applications = applicationIds.length;
  if (applicationIds.length) {
    const [conversations] = await connection.query('SELECT id FROM conversations WHERE application_id IN (?)', [applicationIds]);
    const conversationIds = conversations.map((row) => row.id);
    counts.conversations = conversationIds.length;
    if (conversationIds.length) {
      await connection.query('DELETE FROM conversation_messages WHERE conversation_id IN (?)', [conversationIds]);
      await connection.query('DELETE FROM conversation_participants WHERE conversation_id IN (?)', [conversationIds]);
      await connection.query('DELETE FROM conversations WHERE id IN (?)', [conversationIds]);
    }
  }
  const [notifications] = await connection.query(
    "SELECT id FROM notifications WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.jobId')) IN (?)",
    [jobIds],
  );
  counts.notifications = notifications.length;
  if (notifications.length) await connection.query('DELETE FROM notifications WHERE id IN (?)', [notifications.map((row) => row.id)]);
  if (applicationIds.length) await connection.query('DELETE FROM applications WHERE id IN (?)', [applicationIds]);
  await connection.query('DELETE FROM jobs WHERE id IN (?)', [jobIds]);
  return counts;
}

try {
  if (remove) {
    console.log(JSON.stringify({ database, removed: await removeArrangedRows() }));
  } else {
    const [owners] = await connection.query('SELECT id FROM users WHERE id = ? LIMIT 1', [ownerUid]);
    if (!owners.length) {
      console.error(`owner ${ownerUid} does not exist; sign it in once through POST /api/auth/preview-login first`);
      process.exitCode = 4;
    } else {
      await connection.query(
        `INSERT INTO jobs (id, employer_id, company_name, title, description, location, status, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          jobId, ownerUid, company, title,
          'Test-environment job created by scripts/dev-db/arrange-messaging-job.mjs for the Messages E2E.',
          'Remote',
          JSON.stringify({ testArrangement: 'scripts/dev-db/arrange-messaging-job.mjs' }),
        ],
      );
      console.log(JSON.stringify({ database, created: jobId, owner: ownerUid }));
    }
  }
} finally {
  await connection.end();
}
