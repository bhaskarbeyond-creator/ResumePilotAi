'use strict';

/**
 * Real-backend harness for authenticated enterprise Playwright runs.
 *
 * Boots the ACTUAL Express application from backend/index.js — real routes,
 * real middleware chain, real enterprise control plane and Firestore-shaped
 * data plane (the memory Admin SDK harness used across backend tests) — on an
 * ephemeral port. The Firebase token verifier is swapped for a test verifier
 * (NODE_ENV=test only) that decodes the fixture mock JWTs, so the browser
 * session installed by installAuthenticatedSession() authenticates end-to-end
 * exactly like a real Firebase session: Authorization header -> middleware ->
 * verified claims -> membership resolution.
 *
 * This is TEST INFRASTRUCTURE. Production authentication is untouched.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const path = require('path');
const crypto = require('crypto');

const backendRoot = path.resolve(__dirname, '..', '..', 'backend');

const USERS = {
  'browser-owner': { uid: 'browser-owner', email: 'owner@northwind.example', email_verified: true, role: 'ADMIN', name: 'Northwind Owner' },
  'support-engineer': { uid: 'support-engineer', email: 'support.engineer@resumepilot.example', email_verified: true, role: 'SUPPORT', name: 'Support Engineer' },
  'member-user': { uid: 'member-user', email: 'member@northwind.example', email_verified: true, role: 'USER', name: 'Member User' },
};

async function startLiveEnterpriseBackend() {
  const { MemoryFirestore, createMemoryAdmin } = require(path.join(backendRoot, 'test/helpers/memoryFirestore'));
  const { FirestoreTenantRegistry } = require(path.join(backendRoot, 'enterprise/tenantRegistry'));
  const { FirestoreEnterpriseRepository } = require(path.join(backendRoot, 'enterprise/firestoreEnterpriseRepository'));
  const { FirestoreServiceAccountStore } = require(path.join(backendRoot, 'enterprise/serviceAccountStore'));
  const { FirestoreSupportGrantStore } = require(path.join(backendRoot, 'enterprise/supportAccessStore'));
  const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require(path.join(backendRoot, 'enterprise/tenantQuota'));
  const { ServerKeyEncryptionProvider } = require(path.join(backendRoot, 'enterprise/encryptionProvider'));
  const { TenantService } = require(path.join(backendRoot, 'enterprise/tenantService'));
  const { setTokenVerifierForTests } = require(path.join(backendRoot, 'security/auth'));
  const app = require(path.join(backendRoot, 'index'));

  setTokenVerifierForTests(async token => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('bad token');
    let claims;
    try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new Error('bad token'); }
    const user = USERS[claims.user_id || claims.sub];
    if (!user) throw new Error('unknown user');
    return { ...user, auth_time: claims.auth_time || Math.floor(Date.now() / 1000), claims };
  });

  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const service = new TenantService({
    registry: new FirestoreTenantRegistry({ db, admin }),
    db,
    admin,
    repository: new FirestoreEnterpriseRepository({ db, admin, encryptionProvider }),
    serviceAccountStore: new FirestoreServiceAccountStore({ db, admin }),
    supportGrantStore: new FirestoreSupportGrantStore({ db, admin }),
    quotaGuard: new TenantQuotaGuard({ store: new FirestoreAtomicCounterStore({ db, admin }) }),
    encryptionProvider,
    dataProviderName: 'firestore',
  });
  app.set('db', db);
  app.set('firebaseAdmin', admin);
  app.set('tenantService', service);

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    db,
    service,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = { startLiveEnterpriseBackend, USERS };
