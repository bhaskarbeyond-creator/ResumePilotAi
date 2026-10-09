#!/usr/bin/env node
/**
 * DIR-055 S9 — guarded remediation for pre-DIR-048 notification placeholders.
 *
 * THE DEFECT
 *   Before DIR-048 the message producer wrote a bodyless placeholder:
 *     type='message', title='New message', message='You have a new message.'
 *   with `data` carrying only a `conversationId` — no sender, no snippet. The
 *   rows pile up (17 for one uid in the live DB), every one of them unread, so
 *   the header badge sticks at a number that can never go down, and the popover
 *   shows N identical "New message" lines with no attribution.
 *
 * SAFETY CONTRACT (why this script is safe to run)
 *   1. DRY-RUN BY DEFAULT. It prints exactly what it WOULD change and writes
 *      nothing. `--apply` is required to mutate a single row.
 *   2. ONE EXPLICIT `--uid` IS MANDATORY. There is no "all users" mode, so it
 *      can never sweep the whole table by accident.
 *   3. NEVER DELETES. Every statement is an UPDATE constrained by
 *      `user_id = ?`; there is no DELETE anywhere in this file.
 *   4. NO FABRICATION. A sender is only written when it is derived from the real
 *      conversation participants. A row whose conversation is missing or has no
 *      counterpart is REPORTED as unresolvable and left byte-for-byte alone.
 *   5. IDEMPOTENT. Re-running is a no-op because the placeholder predicate no
 *      longer matches rows that were already remediated.
 *
 * USAGE
 *   node scripts/dir055-remediate-notifications.mjs --uid <uid>            # dry run
 *   node scripts/dir055-remediate-notifications.mjs --uid <uid> --apply    # mark read
 *   node scripts/dir055-remediate-notifications.mjs --uid <uid> --apply --enrich
 *   node scripts/dir055-remediate-notifications.mjs --uid <uid> --json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch { /* env is optional */ }
const mysql = require(path.join(ROOT, 'node_modules', 'mysql2', 'promise'));

/** The exact pre-DIR-048 placeholder signature. Deliberately narrow: a row must
 *  match ALL THREE fields, so an enriched or genuinely-worded row is untouched. */
const PLACEHOLDER = { type: 'message', title: 'New message', message: 'You have a new message.' };

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

const uid = value('--uid');
const apply = flag('--apply');
const enrich = flag('--enrich');
const asJson = flag('--json');

if (!uid) {
  console.error('REFUSED: --uid <uid> is required. This script is scoped to ONE explicit uid by design.');
  console.error('Usage: node scripts/dir055-remediate-notifications.mjs --uid <uid> [--apply] [--enrich] [--json]');
  process.exit(2);
}

const dbConfig = () => ({
  host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_resume_builder'
});

/** Resolve the real counterpart of a conversation — grounded, never guessed. */
async function resolveSender(conn, row) {
  let data = {};
  try { data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch { data = {}; }
  const conversationId = data?.conversationId;
  if (!conversationId) return { resolvable: false, reason: 'NO_CONVERSATION_ID' };

  const [participants] = await conn.query('SELECT user_id FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
  if (!participants.length) return { resolvable: false, reason: 'CONVERSATION_HAS_NO_PARTICIPANTS' };

  const counterpartId = participants.map((p) => p.user_id).find((id) => id !== uid);
  if (!counterpartId) return { resolvable: false, reason: 'NO_COUNTERPART' };

  const [people] = await conn.query('SELECT displayName, firstname, lastname, email FROM users WHERE id = ? LIMIT 1', [counterpartId]);
  if (!people.length) return { resolvable: false, reason: 'COUNTERPART_NOT_IN_USERS' };

  const p = people[0];
  const name = String(p.displayName || '').trim()
    || `${String(p.firstname || '').trim()} ${String(p.lastname || '').trim()}`.trim()
    || String(p.email || '').split('@')[0];
  if (!name) return { resolvable: false, reason: 'COUNTERPART_HAS_NO_NAME' };

  const [messages] = await conn.query(
    'SELECT text FROM conversation_messages WHERE conversation_id = ? AND sender_id = ? ORDER BY created_at DESC LIMIT 1',
    [conversationId, counterpartId]
  );
  const snippet = messages.length ? String(messages[0].text || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';

  return {
    resolvable: true,
    conversationId,
    senderId: counterpartId,
    title: `Message from ${name}`,
    message: snippet || `You have a new message from ${name}.`
  };
}

(async () => {
  const conn = await mysql.createConnection(dbConfig());
  const report = { uid, apply, enrich, placeholders: 0, resolvable: 0, unresolvable: 0, markedRead: 0, enriched: 0, rows: [], refusals: [] };

  try {
    const [owners] = await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1', [uid]);
    if (!owners.length) {
      console.error(`REFUSED: uid ${uid} does not exist in \`users\`.`);
      process.exit(2);
    }

    const [rows] = await conn.query(
      `SELECT id, data, is_read, created_at FROM notifications
        WHERE user_id = ? AND type = ? AND title = ? AND message = ?
        ORDER BY created_at ASC`,
      [uid, PLACEHOLDER.type, PLACEHOLDER.title, PLACEHOLDER.message]
    );
    report.placeholders = rows.length;

    for (const row of rows) {
      const entry = { id: row.id, isRead: row.is_read === 1, createdAt: row.created_at };
      if (enrich) {
        const r = await resolveSender(conn, row);
        entry.resolution = r.resolvable ? { title: r.title, message: r.message, senderId: r.senderId } : { reason: r.reason };
        if (r.resolvable) { report.resolvable += 1; entry.next = r; }
        else { report.unresolvable += 1; report.refusals.push({ id: row.id, reason: r.reason }); }
      }
      report.rows.push(entry);
    }

    if (apply) {
      await conn.beginTransaction();
      try {
        // (a) Every placeholder goes read — this is what unsticks the badge.
        const ids = rows.map((r) => r.id);
        if (ids.length) {
          const [res] = await conn.query(
            'UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0 AND id IN (?)',
            [uid, ids]
          );
          report.markedRead = Number(res.affectedRows) || 0;
        }
        // (b) Only GROUNDED enrichment is written; refusals are left untouched.
        if (enrich) {
          for (const entry of report.rows) {
            if (!entry.next) continue;
            const [res] = await conn.query(
              'UPDATE notifications SET title = ?, message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
              [entry.next.title, entry.next.message, entry.id, uid]
            );
            if (Number(res.affectedRows)) report.enriched += 1;
          }
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    if (asJson) {
      console.log(JSON.stringify({ ...report, rows: report.rows.map(({ next, ...rest }) => rest) }, null, 2));
    } else {
      console.log(`\nDIR-055 notification remediation — uid ${uid}`);
      console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN (nothing was written)'}${enrich ? ' + enrich' : ''}\n`);
      console.log(`placeholder rows found : ${report.placeholders}`);
      if (enrich) {
        console.log(`  sender resolvable    : ${report.resolvable}`);
        console.log(`  unresolvable (kept)  : ${report.unresolvable}`);
        for (const r of report.refusals) console.log(`    ! ${r.id} — ${r.reason} (left untouched, no fabrication)`);
      }
      if (apply) {
        console.log(`rows marked read       : ${report.markedRead}`);
        if (enrich) console.log(`rows enriched          : ${report.enriched}`);
      }
      if (report.placeholders === 0) console.log('\nNothing to do — no placeholder rows match for this uid.\n');
    }
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('REMEDIATION FAILED:', err.message);
  process.exit(1);
});

