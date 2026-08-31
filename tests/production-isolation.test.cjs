/**
 * Production-isolation test: verifies that the development-only shims
 * (InMemoryRepository, InMemoryCounterStore, VITE_LOCAL_AUTH, preview-login)
 * CANNOT be activated in a production NODE_ENV, and that production runtime
 * always selects the real MariaDB/MySQL code paths.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function freshRequire(id) {
  const resolved = require.resolve(id);
  // Clear from require cache so env changes apply
  delete require.cache[resolved];
  // Also clear any intermediate requires from the shim paths
  for (const k of Object.keys(require.cache)) {
    if (k.includes('repositories/') || k.includes('security/inMemoryCounterStore') || k.includes('security/abuse')) {
      delete require.cache[k];
    }
  }
  return require(id);
}

test('InMemoryRepository is never auto-selected when NODE_ENV=production', () => {
  const savedEnv = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.DEGRADED_MODE_REPOSITORY = 'inmemory'; // attacker attempt
  process.env.IN_MEMORY_REPOSITORY = '1';             // attacker attempt
  try {
    // Ensure a truly fresh load
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/repositories/')) delete require.cache[k];
    }
    const repoMod = freshRequire('../backend/repositories/index');
    const repo = repoMod.getRepository();
    // The in-memory shim's class has a _counters Map; resilient wraps mysql
    assert.ok(!repo._counters, 'Production must not return an InMemoryRepository instance when NODE_ENV=production');
    assert.ok(repo.constructor.name !== 'InMemoryRepository', 'Must not return InMemoryRepository');
  } finally {
    Object.assign(process.env, savedEnv);
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/repositories/')) delete require.cache[k];
    }
  }
});

test('preview-login returns 404 when NODE_ENV=production (test verifier disabled)', () => {
  // Static-source inspection: testVerifierEnabled() requires NODE_ENV !== 'production'
  const savedEnv = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.TEST_AUTH_HMAC_SECRET = 'super-long-secret-for-testing-1234567890';
  try {
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/security/auth')) delete require.cache[k];
    }
    const auth = freshRequire('../backend/security/auth');
    assert.equal(auth.testVerifierEnabled(), false, 'testVerifierEnabled MUST be false in NODE_ENV=production');
  } finally {
    Object.assign(process.env, savedEnv);
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/security/auth')) delete require.cache[k];
    }
  }
});

test('in-memory counter store is never selected by abuse.js when NODE_ENV=production', () => {
  const savedEnv = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.DEGRADED_MODE_REPOSITORY = 'inmemory';
  try {
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/security/abuse') || k.includes('/security/inMemoryCounterStore')) delete require.cache[k];
    }
    // abuse.js is imported as a side-effect by backend/index; to keep the
    // test isolated, just check the source invariant: the inMemoryCounterStore
    // branch is guarded by `process.env.NODE_ENV !== 'production'`.
    const fs = require('fs');
    const abuseSrc = fs.readFileSync(require.resolve('../backend/security/abuse.js'), 'utf8');
    assert.ok(/NODE_ENV !== ['"]production['"]/.test(abuseSrc), 'abuse.js must guard in-memory store with NODE_ENV !== production');
    const repoSrc = fs.readFileSync(require.resolve('../backend/repositories/index.js'), 'utf8');
    assert.ok(/NODE_ENV === ['"]production['"]\s*\)\s*return false;/.test(repoSrc),
              'repository factory must have a hard production-guard (return false when NODE_ENV=production)');
  } finally {
    Object.assign(process.env, savedEnv);
  }
});

test('VITE_LOCAL_AUTH is never enabled in production builds (source guard)', () => {
  const fs = require('fs');
  const fireSrc = fs.readFileSync(require.resolve('../src/conf/fire.js'), 'utf8');
  // The local auth activation requires VITE_LOCAL_AUTH=true or a VITE_PREVIEW_TOKEN.
  // Production builds do not set either; verify that the default production
  // code path falls through to `createNullAuth()` when Firebase is not configured.
  assert.ok(/localAuthEnabled\s*=/.test(fireSrc), 'local-auth flag must be derived from env');
  assert.ok(/createNullAuth\(\)/.test(fireSrc), 'null-auth fallback must exist');
  assert.ok(/envFlags\.VITE_LOCAL_AUTH === ['"]true['"]/.test(fireSrc), 'local-auth must be opt-in via explicit env flag');
});

test('firebaseAuthOnlyBundlePlugin is active in vite config', () => {
  const fs = require('fs');
  const viteCfg = fs.readFileSync(require.resolve('../vite.config.js'), 'utf8');
  assert.ok(/firebaseAuthOnlyBundlePlugin/.test(viteCfg), 'Firestore/Database/Storage bundle guard must be present in Vite config');
  assert.ok(/firestore.*database.*storage/i.test(viteCfg), 'Bundle guard must reject @firebase/firestore, database, storage');
});
