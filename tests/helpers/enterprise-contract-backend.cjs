'use strict';

/**
 * Real Express/middleware harness backed by explicit in-memory test doubles for
 * the MariaDB enterprise contracts. It proves HTTP wiring and RBAC without
 * claiming a real database or production result.
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

async function startEnterpriseContractBackend() {
  const { InMemoryTenantRegistry } = require(path.join(backendRoot, 'test/helpers/inMemoryTenantRegistry'));
  const { InMemoryEnterpriseRepository } = require(path.join(backendRoot, 'test/helpers/inMemoryEnterpriseRepository'));
  const { InMemoryAtomicCounterStore } = require(path.join(backendRoot, 'test/helpers/inMemoryAtomicCounterStore'));
  const { InMemoryServiceAccountStore } = require(path.join(backendRoot, 'enterprise/serviceAccountStore'));
  const { InMemorySupportGrantStore } = require(path.join(backendRoot, 'enterprise/supportAccessStore'));
  const { TenantQuotaGuard } = require(path.join(backendRoot, 'enterprise/tenantQuota'));
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
    return { ...user, auth_time: claims.auth_time || Math.floor(Date.now() / 1000), claims: { ...claims, role: user.role } };
  });

  const registry = new InMemoryTenantRegistry();
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const repository = new InMemoryEnterpriseRepository({ encryptionProvider });
  const serviceAccountStore = new InMemoryServiceAccountStore();
  const supportGrantStore = new InMemorySupportGrantStore();
  const identityDirectory = {
    auth: () => ({
      async getUser(uid) {
        const user = USERS[uid];
        if (!user) throw Object.assign(new Error('identity not found'), { code: 'auth/user-not-found' });
        return { ...user, disabled: false, customClaims: { role: user.role } };
      },
      async getUserByEmail(email) {
        const user = Object.values(USERS).find(candidate => candidate.email === email);
        if (!user) throw Object.assign(new Error('identity not found'), { code: 'auth/user-not-found' });
        return { ...user, disabled: false, customClaims: { role: user.role } };
      },
    }),
  };
  const service = new TenantService({
    registry,
    admin: identityDirectory,
    repository,
    serviceAccountStore,
    supportGrantStore,
    quotaGuard: new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore() }),
    encryptionProvider,
    dataProviderName: 'test-memory-mariadb-contract',
  });
  app.set('firebaseAdmin', identityDirectory);
  app.set('tenantService', service);

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    registry,
    repository,
    service,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = { startEnterpriseContractBackend, USERS };
