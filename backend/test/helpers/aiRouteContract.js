'use strict';

const { setPoolForTests } = require('../../database/mysql');
const { setRepositoryForTests } = require('../../repositories');
const { configureAbuseCounterStoreForTests } = require('../../security/abuse');
const { clearProviderConfigurationCache } = require('../../services/aiRuntime');
const { InMemoryAtomicCounterStore } = require('./inMemoryAtomicCounterStore');

class AiRouteMariaDbContract {
  constructor({ settings = {}, users = {}, tenants = {}, tenantConfigs = {}, memberships = {} } = {}) {
    this.settings = {
      ai_providers: { gemini: { apiKey: 'server-only-gemini-key', model: 'gemini-2.0-flash' } },
      public_config: { ai: { provider: 'gemini', enableGemini: true, enableFallback: true, maxTokens: 2048 } },
      system_settings: {},
      feature_flags: { ENTERPRISE_TENANCY_ENABLED: true },
      ...settings,
    };
    this.users = new Map(Object.entries(users));
    this.usage = new Map();
    this.notifications = [];
    // AI Governance tables
    this.tenants = new Map(Object.entries(tenants));
    this.tenantConfigs = new Map(Object.entries(tenantConfigs));
    this.memberships = new Map(Object.entries(memberships));
  }

  resetAdmission() {
    this.usage.clear();
    configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
  }

  /**
   * Re-assert the repository override after resetRepositoryCacheForTests()
   * (which clears the test override along with the repository cache). The
   * pool override lives in database/mysql and is not affected by that reset.
   */
  reinstallOverrides() {
    const contract = this;
    setRepositoryForTests({
      async getSetting(category) { return contract.settings[category] || null; },
    });
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO notification_outbox /i.test(normalized)) {
      this.notifications.push({ sql: normalized, params: [...params] });
      return [{ affectedRows: 1 }, []];
    }
    if (/^INSERT INTO admin_audit_logs /i.test(normalized)) {
      return [{ affectedRows: 1 }, []];
    }
    // aiGovernance.js: resolveAiGovernance uses pool().query() for users and ai_quota
    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const configured = this.users.get(String(params[0]));
      console.log('[aiRouteContract.query] users query for uid:', params[0], 'configured:', !!configured);
      return [[configured || { id: params[0], membership: 'Premium', paymentStatus: 'ACTIVE', role: 'USER' }], []];
    }
    if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(normalized)) {
      console.log('[aiRouteContract.query] ai_quota query');
      const data = this.settings.ai_quota;
      return [data ? [{ data }] : [], []];
    }
    // aiGovernance.js: loadApplicableTenantMembership query via pool().query()
    if (/SELECT m\.tenantId, m\.workspaceId, m\.status AS membershipStatus, m\.personalTenant,.*FROM enterprise_memberships m.*JOIN enterprise_tenants t ON t\.id = m\.tenantId.*LEFT JOIN enterprise_tenant_configurations c ON c\.tenantId = m\.tenantId/i.test(normalized)) {
      const uid = params[0];
      console.log('[aiRouteContract.query] loadApplicableTenantMembership query for uid:', uid);
      console.log('[aiRouteContract.query] contract.memberships keys:', [...this.memberships.keys()]);
      console.log('[aiRouteContract.query] contract.tenants keys:', [...this.tenants.keys()]);
      console.log('[aiRouteContract.query] contract.tenantConfigs keys:', [...this.tenantConfigs.keys()]);
      const memberships = [];
      for (const [key, m] of this.memberships.entries()) {
        console.log('[aiRouteContract.query] Checking membership:', key, 'principalId:', m.principalId, 'matches:', m.principalId === uid);
        if (m.principalId === uid) {
          const tenant = this.tenants.get(m.tenantId);
          const config = this.tenantConfigs.get(m.tenantId) || {};
          console.log('[aiRouteContract.query] Found membership for uid, tenant:', m.tenantId, 'tenant found:', !!tenant);
          if (tenant) {
            memberships.push({
              tenantId: m.tenantId,
              workspaceId: m.workspaceId,
              membershipStatus: m.status,
              personalTenant: m.personalTenant || false,
              membershipUpdatedAt: m.updatedAt || new Date().toISOString(),
              slug: tenant.slug,
              lifecycleState: tenant.lifecycleState || 'ACTIVE',
              decommissionedAt: tenant.decommissionedAt || null,
              policyVersion: tenant.policyVersion || 1,
              aiPolicy: config.aiPolicy || {},
              quotaPolicy: config.quotaPolicy || {},
              configRevision: config.revision || 1,
            });
          }
        }
      }
      console.log('[aiRouteContract.query] Returning memberships:', memberships);
      return [memberships, []];
    }
    throw new Error(`Unexpected direct AI route SQL: ${normalized}`);
  }

  async getConnection() {
    const contract = this;
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();

        // aiGovernance.js: loadApplicableTenantMembership query
        if (/SELECT m\.tenantId, m\.workspaceId, m\.status AS membershipStatus, m\.personalTenant,.*FROM enterprise_memberships m.*JOIN enterprise_tenants t ON t\.id = m\.tenantId.*LEFT JOIN enterprise_tenant_configurations c ON c\.tenantId = m\.tenantId/i.test(normalized)) {
          const uid = params[0];
          console.log('[aiRouteContract] loadApplicableTenantMembership query for uid:', uid);
          console.log('[aiRouteContract] contract.memberships keys:', [...contract.memberships.keys()]);
          console.log('[aiRouteContract] contract.tenants keys:', [...contract.tenants.keys()]);
          console.log('[aiRouteContract] contract.tenantConfigs keys:', [...contract.tenantConfigs.keys()]);
          const memberships = [];
          for (const [key, m] of contract.memberships.entries()) {
            console.log('[aiRouteContract] Checking membership:', key, 'principalId:', m.principalId, 'matches:', m.principalId === uid);
            if (m.principalId === uid) {
              const tenant = contract.tenants.get(m.tenantId);
              const config = contract.tenantConfigs.get(m.tenantId) || {};
              console.log('[aiRouteContract] Found membership for uid, tenant:', m.tenantId, 'tenant found:', !!tenant);
              if (tenant) {
                memberships.push({
                  tenantId: m.tenantId,
                  workspaceId: m.workspaceId,
                  membershipStatus: m.status,
                  personalTenant: m.personalTenant || false,
                  membershipUpdatedAt: m.updatedAt || new Date().toISOString(),
                  slug: tenant.slug,
                  lifecycleState: tenant.lifecycleState || 'ACTIVE',
                  decommissionedAt: tenant.decommissionedAt || null,
                  policyVersion: tenant.policyVersion || 1,
                  aiPolicy: config.aiPolicy || {},
                  quotaPolicy: config.quotaPolicy || {},
                  configRevision: config.revision || 1,
                });
              }
            }
          }
          console.log('[aiRouteContract] Returning memberships:', memberships);
          return [memberships, []];
        }

        if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
          const configured = contract.users.get(String(params[0]));
          console.log('[aiRouteContract] users query for uid:', params[0], 'configured:', !!configured);
          return [[configured || { id: params[0], membership: 'Premium', paymentStatus: 'ACTIVE', role: 'USER' }], []];
        }
        if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(normalized)) {
          console.log('[aiRouteContract] ai_quota query');
          const data = contract.settings.ai_quota;
          return [data ? [{ data }] : [], []];
        }
        if (/^SELECT count FROM ai_usage /i.test(normalized)) {
          const key = `${params[0]}:${params[1]}`;
          return [contract.usage.has(key) ? [{ count: contract.usage.get(key) }] : [], []];
        }
        if (/^INSERT INTO ai_usage /i.test(normalized)) {
          contract.usage.set(`${params[0]}:${params[1]}`, Number(params[4]));
          return [{ affectedRows: 1 }, []];
        }
        if (/^INSERT INTO notification_outbox /i.test(normalized)) {
          contract.notifications.push({ sql: normalized, params: [...params] });
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected AI route transaction SQL: ${normalized}`);
      },
    };
  }

  async end() {}
}

function installAiRouteContract(options = {}) {
  const contract = new AiRouteMariaDbContract(options);
  setPoolForTests(contract);
  setRepositoryForTests({
    async getSetting(category) { return contract.settings[category] || null; },
  });
  contract.resetAdmission();
  clearProviderConfigurationCache();
  return contract;
}

function resetAiRouteContract() {
  configureAbuseCounterStoreForTests(null);
  clearProviderConfigurationCache();
}

module.exports = { AiRouteMariaDbContract, installAiRouteContract, resetAiRouteContract };
