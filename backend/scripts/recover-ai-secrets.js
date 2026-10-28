#!/usr/bin/env node
'use strict';

/**
 * AI Provider Secret Recovery & Operator Health CLI — IME365
 *
 * Allows platform operators to inspect, recover, re-key, or safely reset
 * envelope-encrypted credentials trapped in `system_settings.ai_providers`.
 *
 * Usage:
 *   node backend/scripts/recover-ai-secrets.js --status
 *   node backend/scripts/recover-ai-secrets.js --to-plaintext [--key <base64Key>]
 *   node backend/scripts/recover-ai-secrets.js --reset-empty [--force]
 *   node backend/scripts/recover-ai-secrets.js --rekey --new-key <base64Key> [--old-key <base64Key>]
 */

const path = require('node:path');
const dotenv = require('dotenv');

// Load environment from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { createEncryptionProvider, isEncryptedEnvelope } = require('../enterprise/encryptionProvider');
const { inspectSecretStore } = require('../services/aiSecretStore');

const SECRET_FIELDS = ['apiKey', 'apiKeys'];

async function getDbConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || 'airesume_test',
  });
}

async function loadAiProvidersRow(conn) {
  const [rows] = await conn.query("SELECT category, data, revision FROM system_settings WHERE category = 'ai_providers'");
  if (!rows || rows.length === 0) {
    return { data: {}, revision: 0, exists: false };
  }
  const rawData = rows[0].data;
  const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  return { data: parsed || {}, revision: Number(rows[0].revision || 0), exists: true };
}

async function printStatus(conn) {
  const { data, revision, exists } = await loadAiProvidersRow(conn);
  const diag = inspectSecretStore(data, process.env);

  console.log('\n============================================================');
  console.log('   AI PROVIDER SECRETS ENCRYPTION & HEALTH STATUS');
  console.log('============================================================');
  console.log(`Database Status     : ${exists ? 'Row exists in system_settings' : 'No ai_providers row found'}`);
  console.log(`CAS Revision        : ${revision}`);
  console.log(`Storage Mode        : ${diag.mode.toUpperCase()}`);
  console.log(`Health Status       : ${diag.status.toUpperCase()}`);
  console.log(`Diagnostic Code     : ${diag.diagnosticCode}`);
  console.log(`Key Configured      : ${diag.encryptionConfigured ? 'YES (ENTERPRISE_ENCRYPTION_KEY present)' : 'NO'}`);
  console.log(`Encrypted Envelopes : ${diag.envelopeCount}`);
  console.log(`Plaintext Keys      : ${diag.plaintextCount}`);
  if (diag.keyVersions.length > 0) {
    console.log(`Sealed Key Versions : ${diag.keyVersions.join(', ')}`);
  }

  if (diag.remediation) {
    console.log('\n[!] ACTION REQUIRED:');
    console.log(`    ${diag.remediation}`);
  } else {
    console.log('\n[✓] Everything is healthy and decryptable.');
  }

  console.log('\nProvider Breakdown:');
  for (const [providerId, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') continue;
    const hasSingleKey = Boolean(entry.apiKey);
    const hasPool = Array.isArray(entry.apiKeys) && entry.apiKeys.length > 0;
    const isEncrypted = isEncryptedEnvelope(entry.apiKey) || isEncryptedEnvelope(entry.apiKeys);
    console.log(`  - ${providerId.padEnd(12)}: key=${hasSingleKey ? 'yes' : 'no'}, pool=${hasPool ? 'yes' : 'no'}, encrypted=${isEncrypted ? 'YES' : 'no'}`);
  }
  console.log('============================================================\n');

  return diag.status === 'healthy' ? 0 : 1;
}

async function convertToPlaintext(conn, keyOverride) {
  const env = { ...process.env };
  if (keyOverride) {
    env.ENTERPRISE_ENCRYPTION_KEY = keyOverride;
  }
  const provider = createEncryptionProvider(env);
  if (!provider) {
    console.error('[ERROR] Cannot decrypt to plaintext: No encryption key supplied.');
    console.error('Provide key in ENTERPRISE_ENCRYPTION_KEY or via --key <base64Key>.');
    return 1;
  }

  const { data, revision, exists } = await loadAiProvidersRow(conn);
  if (!exists) {
    console.log('No ai_providers setting row exists to convert.');
    return 0;
  }

  const decrypted = {};
  let decryptedCount = 0;

  for (const [providerId, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') {
      decrypted[providerId] = entry;
      continue;
    }
    const next = { ...entry };
    for (const field of SECRET_FIELDS) {
      const val = next[field];
      if (isEncryptedEnvelope(val)) {
        try {
          next[field] = provider.decryptValue(val);
          decryptedCount++;
        } catch (err) {
          console.error(`[ERROR] Failed to decrypt ${providerId}.${field}: ${err.message}`);
          return 1;
        }
      }
    }
    decrypted[providerId] = next;
  }

  const newRevision = revision + 1;
  const serialized = JSON.stringify(decrypted);

  await conn.query(
    'UPDATE system_settings SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE category = ?',
    [serialized, newRevision, 'ai_providers']
  );

  console.log(`[SUCCESS] Decrypted ${decryptedCount} credential(s) back to plaintext mode.`);
  console.log(`system_settings.ai_providers revision bumped to ${newRevision}.`);
  console.log('AI generation is now unblocked for keyless/plaintext operation.');
  return 0;
}

async function resetEmpty(conn, force) {
  if (!force) {
    console.error('[SECURITY] --reset-empty will erase all stored API keys in system_settings.');
    console.error('If this is intended (e.g. key lost permanently), run with --force to confirm.');
    return 1;
  }

  const { data, revision, exists } = await loadAiProvidersRow(conn);
  if (!exists) {
    console.log('No ai_providers setting row exists.');
    return 0;
  }

  const cleared = {};
  let clearedCount = 0;
  for (const [providerId, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') {
      cleared[providerId] = entry;
      continue;
    }
    const next = { ...entry };
    if (next.apiKey) { next.apiKey = null; clearedCount++; }
    if (next.apiKeys) { next.apiKeys = null; clearedCount++; }
    cleared[providerId] = next;
  }

  const newRevision = revision + 1;
  const serialized = JSON.stringify(cleared);

  await conn.query(
    'UPDATE system_settings SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE category = ?',
    [serialized, newRevision, 'ai_providers']
  );

  console.log(`[SUCCESS] Cleared ${clearedCount} trapped credential(s).`);
  console.log(`system_settings.ai_providers revision bumped to ${newRevision}.`);
  console.log('You may now enter fresh credentials in the Admin UI without 503 encryption errors.');
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.length === 0;
  const isToPlaintext = args.includes('--to-plaintext');
  const isResetEmpty = args.includes('--reset-empty');
  const force = args.includes('--force');

  const keyIdx = args.indexOf('--key');
  const keyOverride = keyIdx !== -1 && args[keyIdx + 1] ? args[keyIdx + 1] : null;

  let conn;
  try {
    conn = await getDbConnection();
  } catch (err) {
    console.error(`[DATABASE ERROR] Failed to connect to MySQL: ${err.message}`);
    process.exit(1);
  }

  try {
    let exitCode = 0;
    if (isToPlaintext) {
      exitCode = await convertToPlaintext(conn, keyOverride);
    } else if (isResetEmpty) {
      exitCode = await resetEmpty(conn, force);
    } else if (isStatus) {
      exitCode = await printStatus(conn);
    }
    process.exit(exitCode);
  } catch (err) {
    console.error(`[UNEXPECTED ERROR] ${err.message}`);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadAiProvidersRow,
  printStatus,
  convertToPlaintext,
  resetEmpty,
};
