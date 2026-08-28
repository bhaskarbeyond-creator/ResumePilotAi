'use strict';

const { setPoolForTests } = require('../../database/mysql');
const { setRepositoryForTests } = require('../../repositories');
const { configureAbuseCounterStoreForTests } = require('../../security/abuse');
const { clearProviderConfigurationCache } = require('../../services/aiRuntime');
const { InMemoryAtomicCounterStore } = require('./inMemoryAtomicCounterStore');

class RoutesIntegrationMariaDbContract {
  constructor() {
    this.settings = {
      public_config: {
        smtp: { enabled: true },
        ai: { provider: 'gemini', enableGemini: true, enableFallback: true },
      },
      admin_configuration: {},
      ai_providers: {},
      system_settings: {},
      payment_providers: {},
      subscriptions: {},
    };
    this.auditEvents = [];
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^SELECT 1 AS alive, VERSION\(\) AS version$/i.test(normalized)) {
      return [[{ alive: 1, version: '11.4-contract' }], []];
    }
    if (/^SELECT data, revision FROM system_settings WHERE category = \? LIMIT 1$/i.test(normalized)) {
      const category = String(params[0]);
      const data = this.settings[category];
      return [data ? [{ data, revision: Number(data.revision || 0) }] : [], []];
    }
    if (/^INSERT INTO admin_audit_logs /i.test(normalized)) {
      return [{ affectedRows: 1 }, []];
    }
    if (/^DELETE FROM export_render_tokens WHERE expires_at /i.test(normalized)) {
      return [{ affectedRows: 0 }, []];
    }
    throw new Error(`Unexpected routes integration SQL: ${normalized}`);
  }

  async getConnection() {
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      async query(sql) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        if (/^SELECT payload, expires_at FROM export_render_tokens /i.test(normalized)) return [[], []];
        if (/^SELECT data, revision FROM system_settings WHERE category = \? FOR UPDATE$/i.test(normalized)) return [[], []];
        if (/^DELETE FROM export_render_tokens /i.test(normalized)) return [{ affectedRows: 0 }, []];
        throw new Error(`Unexpected routes integration transaction SQL: ${normalized}`);
      },
    };
  }

  async end() {}
}

function installRoutesIntegrationContract() {
  const contract = new RoutesIntegrationMariaDbContract();
  setPoolForTests(contract);
  setRepositoryForTests({
    async getSetting(category) { return contract.settings[category] || null; },
    async recordAdminAuditLog(event) { contract.auditEvents.push(event); return event; },
  });
  configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
  clearProviderConfigurationCache();
  return contract;
}

module.exports = { RoutesIntegrationMariaDbContract, installRoutesIntegrationContract };
