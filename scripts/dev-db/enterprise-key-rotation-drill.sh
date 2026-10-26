#!/usr/bin/env bash
# H.1 (R14.1) — ENTERPRISE_ENCRYPTION_KEY rotation + fail-closed rehearsal.
# Sandbox-only. NEVER run against a production database.
#
# Part 1: provider-level rehearsal (no DB, no engine):
#   encrypt@v1 -> decrypt@v1 -> rotate bundle {v1,v2} active v2 ->
#   encrypt@v2 -> decrypt v1-envelope with BOTH keys -> drop v1 ->
#   decrypt MUST fail closed (throw, never plaintext).
# Part 2: service-level A.12 restatement (sandbox MariaDB bridge, DB ime365_h1):
#   real production write path (services/aiAdmin.saveAiAdminSettings) seals
#   provider secrets; raw SQL read asserts the envelope shape and ZERO
#   plaintext; rotation window; re-wrap under the new active key; fail-closed
#   on the stale envelope after the old key is dropped.
#
# Usage: bash scripts/dev-db/enterprise-key-rotation-drill.sh [--part1-only]
# Exit 0 = every checkpoint PASS. Expected transcript:
# developer-review/packages/h1-security-drill/expected-transcript.md
set -u -o pipefail
cd "$(dirname "$0")/../.."
BACKEND="$PWD/backend"
PART1_ONLY=0
[ "${1:-}" = "--part1-only" ] && PART1_ONLY=1

K1=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
K2=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
B1="{\"v1\":\"$K1\"}"
B12="{\"v1\":\"$K1\",\"v2\":\"$K2\"}"
B2="{\"v2\":\"$K2\"}"
S1="sk-h1-drill-v1-000111222333"
S2="sk-h1-drill-v2-444555666777"

echo "== H.1 enterprise key rotation drill: $(date -u '+%Y-%m-%dT%H:%M:%SZ') =="
echo "== tree: $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"

echo "-- PART 1: provider-level fail-closed rehearsal"
BACKEND="$BACKEND" B1="$B1" B12="$B12" B2="$B2" node -e '
const assert = require("assert");
const { createEncryptionProvider } = require(process.env.BACKEND + "/enterprise/encryptionProvider");
const p1 = createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEYS: process.env.B1 });
assert(p1, "provider must construct with a configured key");
const env1 = p1.encryptValue("sk-drill-secret-v1");
assert.strictEqual(env1.keyVersion, "v1");
console.log("PASS encrypt@v1 envelope:", JSON.stringify({ __enterpriseEncrypted: env1.__enterpriseEncrypted, alg: env1.alg, keyVersion: env1.keyVersion }));
assert.strictEqual(p1.decryptValue(env1), "sk-drill-secret-v1");
console.log("PASS decrypt@v1 roundtrip");
const p2 = createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEYS: process.env.B12, ENTERPRISE_ENCRYPTION_ACTIVE_KEY: "v2" });
const env2 = p2.encryptValue("sk-drill-secret-v2");
assert.strictEqual(env2.keyVersion, "v2");
console.log("PASS encrypt@v2 after rotation (active key honored):", env2.keyVersion);
assert.strictEqual(p2.decryptValue(env1), "sk-drill-secret-v1");
console.log("PASS decrypt v1-envelope during rotation window {v1,v2}");
const p3 = createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEYS: process.env.B2 });
let threw = null;
try { p3.decryptValue(env1); } catch (err) { threw = err; }
assert(threw, "dropped key MUST fail closed");
assert(!/sk-drill/.test(String(threw.message)), "error must not leak plaintext");
console.log("PASS fail-closed after v1 dropped:", threw.code || threw.message);
' 2>&1 | sed 's/^/   /'
PART1_EXIT=${PIPESTATUS[0]}
echo "PART1_EXIT=$PART1_EXIT"
[ "$PART1_ONLY" = 1 ] && exit "$PART1_EXIT"

echo "-- PART 2: service-level A.12 restatement (sandbox bridge, DB ime365_h1)"
rm -rf /tmp/h1-datadir && mkdir -p /tmp/h1-datadir
BRIDGE_DATA_DIR=/tmp/h1-datadir node scripts/dev-db/mariadb-sandbox-bridge.mjs > /tmp/h1-bridge.log 2>&1 &
BRIDGE_PID=$!
trap 'kill $BRIDGE_PID 2>/dev/null' EXIT
for _ in $(seq 1 60); do (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null && break; sleep 0.5; done
sleep 8
(cd "$BACKEND" && DB_NAME=ime365_h1 DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
  timeout 120 node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>process.exit(r.success?0:1))" >/dev/null 2>&1)
echo "   schema init exit $?"

BACKEND="$BACKEND" B1="$B1" B12="$B12" B2="$B2" S1="$S1" S2="$S2" node -e '
const assert = require("assert");
process.env.DB_HOST = "127.0.0.1"; process.env.DB_PORT = "3306";
process.env.DB_USER = "root"; process.env.DB_PASSWORD = "";
process.env.DB_NAME = "ime365_h1"; process.env.NODE_ENV = "development";

(async () => {
  const { saveAiAdminSettings, loadAiAdminSettings } = require(process.env.BACKEND + "/services/aiAdmin");
  const mysql2 = require(process.env.BACKEND + "/node_modules/mysql2/promise");

  process.env.ENTERPRISE_ENCRYPTION_KEYS = process.env.B1;
  await saveAiAdminSettings({ input: { openaiApiKey: process.env.S1, force: true, forceReason: "H.1 drill write v1" }, actorUid: "local_h1drill", requestId: "h1-drill-1" });
  console.log("PASS save@v1 via aiAdmin.saveAiAdminSettings (production write path)");

  const conn = await mysql2.createConnection({ host: "127.0.0.1", port: 3306, user: "root", password: "", database: "ime365_h1" });
  const rawRead = async () => {
    const [rows] = await conn.query("SELECT data FROM system_settings WHERE category = \u0027ai_providers\u0027");
    return typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
  };

  let data = await rawRead();
  assert(!JSON.stringify(data).includes(process.env.S1), "A.12: plaintext secret found in SQL read");
  const env = data.openai?.apiKey ?? data.providers?.openai?.apiKey;
  assert(env && env.__enterpriseEncrypted === true, "A.12: envelope expected");
  for (const field of ["alg", "keyVersion", "wrappedKey", "iv", "tag", "ciphertext"]) {
    assert(env[field] !== undefined, "A.12: envelope field " + field);
  }
  assert.strictEqual(env.keyVersion, "v1");
  console.log("PASS A.12 SQL read: envelope", JSON.stringify({ __enterpriseEncrypted: true, alg: env.alg, keyVersion: env.keyVersion }), "plaintext occurrences: 0");

  await loadAiAdminSettings();
  console.log("PASS load@v1 decrypts the in-memory view (storage stays sealed)");

  process.env.ENTERPRISE_ENCRYPTION_KEYS = process.env.B12;
  process.env.ENTERPRISE_ENCRYPTION_ACTIVE_KEY = "v2";
  await loadAiAdminSettings();
  console.log("PASS rotation window {v1,v2} active=v2: v1 envelope still readable");

  await saveAiAdminSettings({ input: { openaiApiKey: process.env.S2, force: true, forceReason: "H.1 drill rewrap v2" }, actorUid: "local_h1drill", requestId: "h1-drill-2" });
  data = await rawRead();
  const env2 = data.openai?.apiKey ?? data.providers?.openai?.apiKey;
  assert.strictEqual(env2.keyVersion, "v2", "re-wrap must seal under the active key");
  assert(!JSON.stringify(data).includes(process.env.S2), "plaintext after rewrap");
  console.log("PASS re-wrap under v2: keyVersion=v2, plaintext occurrences: 0");

  process.env.ENTERPRISE_ENCRYPTION_KEYS = process.env.B2;
  delete process.env.ENTERPRISE_ENCRYPTION_ACTIVE_KEY;
  await loadAiAdminSettings();
  console.log("PASS post-rotation: v2-only bundle serves current data");

  const { createEncryptionProvider } = require(process.env.BACKEND + "/enterprise/encryptionProvider");
  const pV2Only = createEncryptionProvider(process.env);
  let threw = null;
  try { pV2Only.decryptValue(env); } catch (e) { threw = e; }
  assert(threw, "v1 envelope under v2-only bundle MUST fail closed");
  assert(!/sk-h1-drill/.test(String(threw.message)), "fail-closed error must not leak plaintext");
  console.log("PASS fail-closed on stale v1 envelope:", threw.code || threw.message);

  await conn.end();
  process.exit(0);
})().catch(err => { console.error("FAIL", err && err.message ? err.message : err); process.exit(1); });
' 2>&1 | sed 's/^/   /'
PART2_EXIT=${PIPESTATUS[0]}
echo "=============================="
echo "H1_DRILL_EXIT=$((PART1_EXIT + PART2_EXIT))"
[ "$PART1_EXIT" = 0 ] && [ "$PART2_EXIT" = 0 ] && exit 0 || exit 1
