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
  'browser-superadmin': { uid: 'browser-superadmin', email: 'superadmin@northwind.example', email_verified: true, role: 'SUPER_ADMIN', name: 'Platform Super Admin' },
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
  // Browser `/adm` tests exercise identity provisioning as well as the
  // enterprise control plane. This remains a Firebase Admin-shaped in-memory
  // directory; real production authentication is never replaced outside test.
  const identities = new Map(Object.values(USERS).map(user => [user.uid, { ...user, disabled: false, emailVerified: true, customClaims: { role: user.role } }]));
  admin.auth = () => ({
    async getUser(uid) {
      const user = identities.get(uid);
      if (!user) { const error = new Error('User not found'); error.code = 'auth/user-not-found'; throw error; }
      return { ...user, customClaims: { ...(user.customClaims || {}) } };
    },
    async listUsers() {
      return {
        users: [...identities.values()].map(user => ({ ...user, customClaims: { ...(user.customClaims || {}) } })),
      };
    },
    async createUser(input) {
      if ([...identities.values()].some(user => user.email === input.email)) { const error = new Error('Email exists'); error.code = 'auth/email-already-exists'; throw error; }
      const uid = `fixture-user-${crypto.randomUUID()}`;
      const user = { uid, email: input.email, displayName: input.displayName || '', disabled: input.disabled === true, emailVerified: input.emailVerified === true, customClaims: {} };
      identities.set(uid, user);
      return { ...user, customClaims: {} };
    },
    async deleteUser(uid) { identities.delete(uid); },
    async updateUser(uid, patch) { const user = await this.getUser(uid); identities.set(uid, { ...user, ...patch }); },
    async revokeRefreshTokens() {},
    async setCustomUserClaims(uid, claims) { const user = await this.getUser(uid); identities.set(uid, { ...user, customClaims: { ...claims } }); },
  });
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
