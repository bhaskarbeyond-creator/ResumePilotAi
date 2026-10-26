#!/usr/bin/env node
/**
 * MariaDB sandbox bridge — a loopback-only MySQL wire-protocol endpoint backed by
 * the real MariaDB server engine compiled to WebAssembly (`lite4mariadb`).
 *
 * WHY THIS EXISTS
 *   Some remote/CI-less sandboxes have no native MariaDB, no Docker and no apt
 *   mirror. The backend, however, must be exercised against a real SQL engine
 *   (migrations, constraints, transactions, persistence) — never against mocks.
 *   This bridge lets the UNMODIFIED backend connect with its normal `mysql2`
 *   pool over TCP (127.0.0.1:3306) while the SQL is executed by MariaDB itself.
 *
 *   It is a TEST/DEV harness only. Production and CI use a native MariaDB 11.4
 *   server (see scripts/start-ci-mariadb.sh). Evidence produced through this
 *   bridge is always labelled as "MariaDB <version>-embedded via sandbox bridge".
 *
 * FIDELITY CONTRACT (what the backend observes)
 *   - Text protocol result sets carry the engine's real column type / charset /
 *     flags, so mysql2 performs its normal parsing (DATETIME -> Date in the pool
 *     timezone, DECIMAL -> string, BLOB -> Buffer, BIGINT -> number).
 *   - ERR packets carry the engine's real errno and SQLSTATE, so mysql2 maps them
 *     to the usual `err.code` values (ER_DUP_ENTRY, ER_NO_SUCH_TABLE, ...).
 *   - OK packets follow CLIENT_FOUND_ROWS semantics (mysql2 default): UPDATE
 *     reports matched rows as affectedRows and changed rows in the info string;
 *     INSERT reports mysql_insert_id() semantics (0 when nothing was generated).
 *   - The embedded engine has a single session. Statements from different TCP
 *     connections are serialised; an open transaction owns the session until it
 *     commits/rolls back (or its connection drops -> implicit ROLLBACK). Other
 *     connections queue and receive ER_LOCK_WAIT_TIMEOUT (1205) after
 *     BRIDGE_LOCK_WAIT_MS, exactly like an InnoDB row-lock wait would.
 *
 * NOT SUPPORTED (rejected with an explicit error, never silently emulated)
 *   - Server-side prepared statements (COM_STMT_*). The backend uses only
 *     `pool.query()` (client-side escaping), never `.execute()`.
 *   - TLS, authentication (loopback only; any credentials are accepted).
 *
 * Usage:
 *   node scripts/dev-db/mariadb-sandbox-bridge.mjs
 *   env: BRIDGE_HOST (127.0.0.1) BRIDGE_PORT (3306) BRIDGE_DATA_DIR
 *        BRIDGE_DATABASES (comma list to create, default ime365_sandbox,airesume_test)
 *        BRIDGE_LOCK_WAIT_MS (20000) BRIDGE_LOG_SQL (0|1) LITE4MARIADB_MODULE
 */
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.BRIDGE_PORT || 3306);
const DATA_DIR = process.env.BRIDGE_DATA_DIR || path.join(os.homedir(), '.cache', 'ime365-tools', 'mariadb-data');
const DATABASES = String(process.env.BRIDGE_DATABASES || 'ime365_sandbox,airesume_test').split(',').map(s => s.trim()).filter(Boolean);
const LOCK_WAIT_MS = Number(process.env.BRIDGE_LOCK_WAIT_MS || 20_000);
const LOG_SQL = process.env.BRIDGE_LOG_SQL === '1';

if (!['127.0.0.1', '::1', 'localhost'].includes(HOST)) {
  console.error(`[bridge] refusing to bind ${HOST}: the sandbox bridge is loopback-only`);
  process.exit(2);
}

// ── capability / status constants (MySQL client/server protocol) ───────────────
const CLIENT = {
  LONG_PASSWORD: 0x1, FOUND_ROWS: 0x2, LONG_FLAG: 0x4, CONNECT_WITH_DB: 0x8,
  PROTOCOL_41: 0x200, TRANSACTIONS: 0x2000, SECURE_CONNECTION: 0x8000,
  MULTI_RESULTS: 0x20000, PS_MULTI_RESULTS: 0x40000, PLUGIN_AUTH: 0x80000,
  CONNECT_ATTRS: 0x100000, PLUGIN_AUTH_LENENC_CLIENT_DATA: 0x200000,
};
const SERVER_CAPABILITIES = CLIENT.LONG_PASSWORD | CLIENT.FOUND_ROWS | CLIENT.LONG_FLAG | CLIENT.CONNECT_WITH_DB
  | CLIENT.PROTOCOL_41 | CLIENT.TRANSACTIONS | CLIENT.SECURE_CONNECTION | CLIENT.MULTI_RESULTS
  | CLIENT.PS_MULTI_RESULTS | CLIENT.PLUGIN_AUTH | CLIENT.CONNECT_ATTRS | CLIENT.PLUGIN_AUTH_LENENC_CLIENT_DATA;
const STATUS_IN_TRANS = 0x0001;
const STATUS_AUTOCOMMIT = 0x0002;
const COM = { QUIT: 0x01, INIT_DB: 0x02, QUERY: 0x03, FIELD_LIST: 0x04, PING: 0x0e, STMT_PREPARE: 0x16, STMT_EXECUTE: 0x17, STMT_CLOSE: 0x19, STMT_RESET: 0x1a, RESET_CONNECTION: 0x1f };
const UTF8MB4_UNICODE_CI = 224;
const BINARY_CHARSET = 63;
const MAX_FRAME = 0xffffff;

// ── engine bootstrap ───────────────────────────────────────────────────────────
function resolveEngineModule() {
  const candidates = [
    process.env.LITE4MARIADB_MODULE,
    path.join(os.homedir(), '.cache', 'ime365-tools', 'node_modules', 'lite4mariadb', 'dist', 'index.mjs'),
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error('lite4mariadb not found. Run scripts/dev-db/setup-sandbox-tools.sh first (or set LITE4MARIADB_MODULE).');
}

const { Lite4MariaDB } = await import(pathToFileURL(resolveEngineModule()).href);
fs.mkdirSync(DATA_DIR, { recursive: true });
const engine = await Lite4MariaDB.create({ dataDir: DATA_DIR });

/** Execute one statement on the engine and return the raw envelope (strings + metadata). */
function rawQuery(sql) {
  const ptr = engine.mod.ccall('l4m_query', 'number', ['string'], [sql]);
  if (!ptr) return { ok: false, errno: 1105, sqlstate: 'HY000', error: 'empty result from engine' };
  const json = engine.mod.UTF8ToString(ptr);
  engine.mod._l4m_free(ptr);
  try { return JSON.parse(json); } catch { return { ok: false, errno: 1105, sqlstate: 'HY000', error: 'engine returned malformed JSON' }; }
}

function mustQuery(sql) {
  const result = rawQuery(sql);
  if (!result.ok) throw new Error(`${sql}: ${result.error}`);
  return result;
}

const versionRow = mustQuery('SELECT VERSION() AS v').rows[0];
const ENGINE_VERSION = String(versionRow.v);
mustQuery("SET time_zone = '+00:00'");
for (const database of DATABASES) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`invalid database name ${database}`);
  mustQuery(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

// ── session ownership (single embedded session shared by all TCP connections) ─
let currentSchema = null;
let owner = null; // connection id currently inside a transaction
const waiters = []; // { connId, resolve, timer }

/** Resolve when the session owner releases (or reject at the deadline). */
function waitForRelease(connId, deadline) {
  return new Promise((resolve, reject) => {
    const waiter = { connId, resolve, timer: null };
    waiter.timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      const error = Object.assign(new Error('Lock wait timeout exceeded; try restarting transaction'), { errno: 1205, sqlstate: 'HY000' });
      console.warn(`[bridge] conn ${connId} waited ${LOCK_WAIT_MS}ms for conn ${owner}'s open transaction -> ER_LOCK_WAIT_TIMEOUT`);
      reject(error);
    }, Math.max(0, deadline - Date.now()));
    waiters.push(waiter);
  });
}

/**
 * Wait until this connection may use the shared session. Callers MUST run the
 * statement synchronously after this resolves (no intervening await), so the
 * ownership check and the execution are atomic with respect to other sockets.
 */
async function acquire(connId) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (owner !== null && owner !== connId) await waitForRelease(connId, deadline);
}

function releaseOwnership(connId) {
  if (owner !== connId) return;
  owner = null;
  wakeWaiters();
}

function wakeWaiters() {
  // Wake everyone queued; each re-checks ownership in order of arrival.
  while (waiters.length && owner === null) {
    const waiter = waiters.shift();
    clearTimeout(waiter.timer);
    waiter.resolve();
  }
}

// ── SQL classification helpers ─────────────────────────────────────────────────
/** Strip leading comments/whitespace so classification sees the first keyword. */
function leading(sql) {
  let text = sql;
  for (;;) {
    const trimmed = text.replace(/^\s+/, '');
    if (trimmed.startsWith('/*')) { const end = trimmed.indexOf('*/'); text = end < 0 ? '' : trimmed.slice(end + 2); continue; }
    if (trimmed.startsWith('--') || trimmed.startsWith('#')) { const end = trimmed.indexOf('\n'); text = end < 0 ? '' : trimmed.slice(end + 1); continue; }
    return trimmed;
  }
}

const isBegin = s => /^(START\s+TRANSACTION\b|BEGIN(\s+WORK)?\s*;?\s*$)/i.test(s);
const isEnd = s => /^(COMMIT|ROLLBACK)\b(?!\s+TO\b)/i.test(s);
const isInsert = s => /^(INSERT|REPLACE)\b/i.test(s);
const isUpdate = s => /^UPDATE\b/i.test(s);
const isUse = s => /^USE\s+`?([A-Za-z0-9_]+)`?\s*;?$/i.exec(s);
// Statements that cause an implicit commit in MariaDB.
const isImplicitCommit = s => /^(CREATE|ALTER|DROP|RENAME|TRUNCATE|LOCK\s+TABLES|UNLOCK\s+TABLES)\b/i.test(s);

/**
 * Tokenise just enough of an UPDATE to find its top-level SET / WHERE / ORDER BY /
 * LIMIT clauses (outside quotes, comments and parentheses). Returns null when the
 * statement shape is not understood; callers then fall back to changed-rows.
 */
function deriveMatchedRowsQuery(sql) {
  const upper = sql.toUpperCase();
  const marks = [];
  let depth = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch; i += 1;
      while (i < sql.length) {
        if (sql[i] === '\\' && quote !== '`') { i += 2; continue; }
        if (sql[i] === quote) { if (sql[i + 1] === quote) { i += 2; continue; } break; }
        i += 1;
      }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') { const end = sql.indexOf('\n', i); if (end < 0) break; i = end; continue; }
    if (ch === '#') { const end = sql.indexOf('\n', i); if (end < 0) break; i = end; continue; }
    if (ch === '/' && sql[i + 1] === '*') { const end = sql.indexOf('*/', i + 2); if (end < 0) break; i = end + 1; continue; }
    if (ch === '(') { depth += 1; continue; }
    if (ch === ')') { depth -= 1; continue; }
    if (depth !== 0) continue;
    const before = i === 0 ? ' ' : sql[i - 1];
    if (!/[\s)]/.test(before)) continue;
    for (const keyword of ['SET', 'WHERE', 'ORDER BY', 'LIMIT']) {
      if (upper.startsWith(keyword, i) && /[\s(]/.test(sql[i + keyword.length] || ' ')) marks.push({ keyword, index: i });
    }
  }
  const setMark = marks.find(m => m.keyword === 'SET');
  if (!setMark) return null;
  let tableRefs = sql.slice(0, setMark.index).replace(/^\s*UPDATE\s+/i, '').replace(/^(LOW_PRIORITY\s+|IGNORE\s+)+/i, '').trim();
  if (!tableRefs) return null;
  const after = marks.filter(m => m.index > setMark.index && m.keyword !== 'SET');
  const where = after.find(m => m.keyword === 'WHERE');
  const tailStart = where ? where.index : (after[0]?.index ?? sql.length);
  const tail = sql.slice(tailStart).replace(/;\s*$/, '');
  return `SELECT COUNT(*) AS matched FROM (SELECT 1 AS one FROM ${tableRefs} ${tail}) AS __bridge_matched`;
}

// ── statement execution with protocol-level fidelity ───────────────────────────
function engineError(result) {
  return Object.assign(new Error(result.error || 'query failed'), { errno: Number(result.errno) || 1105, sqlstate: result.sqlstate || 'HY000' });
}

function executeStatement(conn, sql) {
  const head = leading(sql);
  const use = isUse(head);
  let matched = null;
  if (isUpdate(head)) {
    const countSql = deriveMatchedRowsQuery(head);
    if (countSql) {
      const count = rawQuery(countSql);
      if (count.ok) matched = Number(count.rows?.[0]?.matched ?? 0);
    }
  }
  if (isInsert(head)) rawQuery('SELECT LAST_INSERT_ID(0)');

  const result = rawQuery(sql);
  if (!result.ok) throw engineError(result);

  if (use) currentSchema = use[1];
  if (result.fields) return { kind: 'rows', result };

  const changed = Number(result.affected || 0);
  let affectedRows = changed;
  let info = '';
  if (isUpdate(head)) {
    affectedRows = matched !== null ? Math.max(matched, changed) : changed;
    info = `Rows matched: ${affectedRows}  Changed: ${changed}  Warnings: 0`;
  } else if (isInsert(head) && /ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(head) && changed === 0) {
    affectedRows = 1; // CLIENT_FOUND_ROWS: an existing row set to its current values counts as 1
  }
  let insertId = 0;
  if (isInsert(head)) {
    const last = rawQuery('SELECT LAST_INSERT_ID() AS id');
    if (last.ok) insertId = Number(last.rows?.[0]?.id || 0);
  }
  return { kind: 'ok', affectedRows, insertId, info };
}

// ── packet encoding ────────────────────────────────────────────────────────────
function lenencInt(n) {
  if (n < 251) return Buffer.from([n]);
  if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = 0xfc; b.writeUInt16LE(n, 1); return b; }
  if (n < 0x1000000) { const b = Buffer.alloc(4); b[0] = 0xfd; b.writeUIntLE(n, 1, 3); return b; }
  const b = Buffer.alloc(9); b[0] = 0xfe; b.writeBigUInt64LE(BigInt(n), 1); return b;
}
const lenencBytes = bytes => Buffer.concat([lenencInt(bytes.length), bytes]);
const lenencStr = s => lenencBytes(Buffer.from(String(s ?? ''), 'utf8'));

function okPayload({ affectedRows = 0, insertId = 0, status = STATUS_AUTOCOMMIT, warnings = 0, info = '' }) {
  const fixed = Buffer.alloc(4);
  fixed.writeUInt16LE(status, 0);
  fixed.writeUInt16LE(warnings, 2);
  return Buffer.concat([Buffer.from([0x00]), lenencInt(affectedRows), lenencInt(insertId), fixed, Buffer.from(info, 'utf8')]);
}

function errPayload(errno, sqlstate, message) {
  const head = Buffer.alloc(3);
  head[0] = 0xff;
  head.writeUInt16LE(errno & 0xffff, 1);
  const state = String(sqlstate || 'HY000').padEnd(5, '0').slice(0, 5);
  return Buffer.concat([head, Buffer.from(`#${state}`, 'ascii'), Buffer.from(String(message || ''), 'utf8')]);
}

function eofPayload(status) {
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt16LE(0, 1);
  b.writeUInt16LE(status, 3);
  return b;
}

const NUMERIC_TYPES = new Set([0, 1, 2, 3, 4, 5, 8, 9, 13, 16, 246]);
function columnPayload(name, [type, charset, flags], schema) {
  const resultCharset = charset === BINARY_CHARSET ? BINARY_CHARSET : UTF8MB4_UNICODE_CI;
  const fixed = Buffer.alloc(13);
  fixed[0] = 0x0c;
  fixed.writeUInt16LE(resultCharset, 1);
  fixed.writeUInt32LE(NUMERIC_TYPES.has(type) ? 20 : 0xffffff, 3);
  fixed[7] = type;
  fixed.writeUInt16LE(flags & 0xffff, 8);
  fixed[10] = type === 4 || type === 5 ? 0x1f : 0; // FLOAT/DOUBLE: NOT_FIXED_DEC
  fixed.writeUInt16LE(0, 11);
  return Buffer.concat([lenencStr('def'), lenencStr(schema || ''), lenencStr(''), lenencStr(''), lenencStr(name), lenencStr(name), fixed]);
}

function rowPayload(fields, row) {
  const parts = [];
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined) parts.push(Buffer.from([0xfb]));
    else if (typeof value === 'object' && typeof value.$h === 'string') parts.push(lenencBytes(Buffer.from(value.$h, 'hex')));
    else parts.push(lenencStr(value));
  }
  return Buffer.concat(parts);
}

// ── connection handling ────────────────────────────────────────────────────────
let nextConnectionId = 1;

function handshakePayload(connId, scramble) {
  const version = Buffer.from(`5.5.5-${ENGINE_VERSION}-sandbox-bridge\0`, 'utf8');
  const head = Buffer.alloc(4); head.writeUInt32LE(connId, 0);
  const caps = Buffer.alloc(19);
  caps.writeUInt16LE(SERVER_CAPABILITIES & 0xffff, 0);
  caps[2] = UTF8MB4_UNICODE_CI & 0xff;
  caps.writeUInt16LE(STATUS_AUTOCOMMIT, 3);
  caps.writeUInt16LE((SERVER_CAPABILITIES >>> 16) & 0xffff, 5);
  caps[7] = 21; // auth-plugin-data length (8 + 12 + NUL)
  // caps[8..17] reserved zeros
  return Buffer.concat([
    Buffer.from([10]), version, head, scramble.subarray(0, 8), Buffer.from([0]),
    caps.subarray(0, 18), scramble.subarray(8, 20), Buffer.from([0]),
    Buffer.from('mysql_native_password\0', 'ascii'),
  ]);
}

function parseHandshakeResponse(payload) {
  let offset = 0;
  const flags = payload.readUInt32LE(offset); offset += 4 + 4 + 1 + 23;
  const userEnd = payload.indexOf(0, offset); offset = userEnd + 1;
  if (flags & CLIENT.PLUGIN_AUTH_LENENC_CLIENT_DATA) {
    const first = payload[offset];
    let length = first; let size = 1;
    if (first === 0xfc) { length = payload.readUInt16LE(offset + 1); size = 3; } else if (first === 0xfd) { length = payload.readUIntLE(offset + 1, 3); size = 4; }
    offset += size + length;
  } else if (flags & CLIENT.SECURE_CONNECTION) {
    offset += 1 + payload[offset];
  } else {
    offset = payload.indexOf(0, offset) + 1;
  }
  let database = null;
  if ((flags & CLIENT.CONNECT_WITH_DB) && offset < payload.length) {
    const end = payload.indexOf(0, offset);
    database = payload.subarray(offset, end < 0 ? payload.length : end).toString('utf8') || null;
  }
  return { flags, database };
}

function handleConnection(socket) {
  const connId = nextConnectionId++;
  const scramble = crypto.randomBytes(20).map(b => (b % 94) + 33); // printable, no NUL
  let buffer = Buffer.alloc(0);
  let pending = [];
  let stage = 'handshake';
  let sequence = 0;
  let inTransaction = false;
  let database = null;
  let chain = Promise.resolve();
  let closed = false;

  const send = payload => {
    if (closed) return;
    let offset = 0;
    do {
      const chunk = payload.subarray(offset, offset + MAX_FRAME);
      const header = Buffer.alloc(4);
      header.writeUIntLE(chunk.length, 0, 3);
      header[3] = sequence & 0xff;
      sequence = (sequence + 1) & 0xff;
      socket.write(Buffer.concat([header, chunk]));
      offset += chunk.length;
      if (chunk.length === MAX_FRAME && offset === payload.length) {
        const empty = Buffer.alloc(4); empty[3] = sequence & 0xff; sequence = (sequence + 1) & 0xff; socket.write(empty);
      }
    } while (offset < payload.length);
  };
  const status = () => STATUS_AUTOCOMMIT | (inTransaction ? STATUS_IN_TRANS : 0);
  const sendError = (error) => send(errPayload(error.errno || 1105, error.sqlstate || 'HY000', error.message));

  async function runQuery(sql) {
    const head = leading(sql);
    for (;;) {
      try {
        await acquire(connId);
      } catch (error) {
        sendError(error);
        return;
      }
      // Synchronous revalidation (race fix, 2026-10-26): acquire() can pass while
      // owner === null, but between that check and this continuation another woken
      // socket may claim the session (its BEGIN ran first). Re-check in the same
      // synchronous block that will claim/execute; only proceed when the session
      // is still free or already ours.
      if (owner === null || owner === connId) break;
    }
    // From here to the end of the try block there is no await: the ownership
    // claim below and the statement execute atomically with respect to other
    // sockets.
    try {
      // Race fix: claim the session BEFORE executing a BEGIN, not after. The
      // old post-execute assignment let N sockets woken by one COMMIT all pass
      // acquire() with owner === null and then all run START TRANSACTION on the
      // single shared engine session — nested begins silently committed the
      // previous transaction, so serialized read-modify-write transactions
      // interleaved and lost updates (observed: 8 of 24 concurrent
      // SELECT-FOR-UPDATE increments survived, zero lock-wait warnings logged).
      const claimingBegin = isBegin(head) && owner === null;
      if (claimingBegin) owner = connId;
      if (database && currentSchema !== database) {
        const selected = rawQuery(`USE \`${database}\``);
        if (selected.ok) currentSchema = database;
      }
      if (LOG_SQL) console.log(`[bridge] conn ${connId}${inTransaction ? ' (tx)' : ''}: ${head.slice(0, 200).replace(/\s+/g, ' ')}`);
      const outcome = executeStatement({ connId }, sql);
      if (isBegin(head)) { inTransaction = true; owner = connId; }
      else if (isEnd(head) || (inTransaction && isImplicitCommit(head))) { inTransaction = false; releaseOwnership(connId); }
      const useMatch = isUse(head);
      if (useMatch) database = useMatch[1];
      // DROP DATABASE invalidates the engine session's selection even though the
      // per-connection cache would still consider it current; drop the cache so
      // the next statement re-issues USE instead of running "No database
      // selected" (observed 2026-10-26 during probe-harness iterations).
      const dropDbMatch = /^DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?/i.exec(head);
      if (dropDbMatch && dropDbMatch[1] === currentSchema) currentSchema = null;
      if (outcome.kind === 'rows') {
        const { fields, types, rows } = outcome.result;
        send(lenencInt(fields.length));
        fields.forEach((name, index) => send(columnPayload(name, types[index] || [253, UTF8MB4_UNICODE_CI, 0], currentSchema)));
        send(eofPayload(status()));
        for (const row of rows) send(rowPayload(fields, row));
        send(eofPayload(status()));
      } else {
        send(okPayload({ affectedRows: outcome.affectedRows, insertId: outcome.insertId, status: status(), info: outcome.info }));
      }
    } catch (error) {
      sendError(error);
    } finally {
      if (!inTransaction) releaseOwnership(connId);
    }
  }

  async function dispatch(payload) {
    const command = payload[0];
    const body = payload.subarray(1);
    switch (command) {
      case COM.QUERY: return runQuery(body.toString('utf8'));
      case COM.PING: return send(okPayload({ status: status() }));
      case COM.INIT_DB: {
        database = body.toString('utf8');
        return runQuery(`USE \`${database.replace(/`/g, '``')}\``);
      }
      case COM.RESET_CONNECTION: {
        if (inTransaction) {
          try { await acquire(connId); } catch (error) { return sendError(error); }
          rawQuery('ROLLBACK');
          inTransaction = false;
          releaseOwnership(connId);
        }
        return send(okPayload({ status: status() }));
      }
      case COM.QUIT: socket.end(); return undefined;
      case COM.STMT_PREPARE: case COM.STMT_EXECUTE: case COM.STMT_RESET:
        return sendError({ errno: 1295, sqlstate: 'HY000', message: 'Server-side prepared statements are not supported by the sandbox bridge (use pool.query)' });
      case COM.STMT_CLOSE: return undefined; // no response by protocol
      default:
        return sendError({ errno: 1047, sqlstate: '08S01', message: `Unknown command 0x${command.toString(16)}` });
    }
  }

  // The reply to a client packet carries the client's sequence id + 1
  // (handshake response arrives as seq 1 -> OK is seq 2; commands arrive as
  // seq 0 -> replies start at seq 1).
  function onPacket(payload, clientSequence) {
    const replySequence = (clientSequence + 1) & 0xff;
    if (stage === 'handshake') {
      const response = parseHandshakeResponse(payload);
      database = response.database;
      stage = 'command';
      sequence = replySequence;
      send(okPayload({ status: status() }));
      return;
    }
    chain = chain.then(() => { sequence = replySequence; return dispatch(payload); })
      .catch(error => { console.error(`[bridge] conn ${connId} dispatch failure:`, error); });
  }

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUIntLE(0, 3);
      if (buffer.length < 4 + length) break;
      const frameSequence = buffer[3];
      pending.push(buffer.subarray(4, 4 + length));
      buffer = buffer.subarray(4 + length);
      if (length === MAX_FRAME) continue; // multi-frame payload continues
      const payload = Buffer.concat(pending);
      pending = [];
      onPacket(payload, frameSequence);
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (inTransaction) {
      chain = chain.then(async () => {
        if (owner === connId) { rawQuery('ROLLBACK'); console.warn(`[bridge] conn ${connId} closed inside a transaction -> implicit ROLLBACK`); }
        inTransaction = false;
        releaseOwnership(connId);
      });
    }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  sequence = 0;
  send(handshakePayload(connId, scramble));
}

const server = net.createServer(handleConnection);
server.listen(PORT, HOST, () => {
  console.log(`[bridge] MariaDB ${ENGINE_VERSION} (WASM, lite4mariadb) listening on ${HOST}:${PORT}`);
  console.log(`[bridge] data dir: ${DATA_DIR}; databases: ${DATABASES.join(', ')}; lock wait ${LOCK_WAIT_MS}ms`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bridge] ${signal}: closing listener and shutting InnoDB down cleanly`);
  server.close();
  try { await engine.close(); } catch (error) { console.error('[bridge] engine close failed:', error.message); }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
