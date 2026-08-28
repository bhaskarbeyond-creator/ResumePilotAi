'use strict';

const { setPoolForTests } = require('../../database/mysql');
const { setRepositoryForTests } = require('../../repositories');
const { configureAbuseCounterStoreForTests } = require('../../security/abuse');
const { clearProviderConfigurationCache } = require('../../services/aiRuntime');
const { InMemoryAtomicCounterStore } = require('./inMemoryAtomicCounterStore');

class AiRouteMariaDbContract {
  constructor({ settings = {}, users = {} } = {}) {
    this.settings = {
      ai_providers: { gemini: { apiKey: 'server-only-gemini-key', model: 'gemini-2.0-flash' } },
      public_config: { ai: { provider: 'gemini', enableGemini: true, enableFallback: true, maxTokens: 2048 } },
      system_settings: {},
      ...settings,
    };
    this.users = new Map(Object.entries(users));
    this.usage = new Map();
    this.notifications = [];
  }

  resetAdmission() {
    this.usage.clear();
    configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
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
        if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
          const configured = contract.users.get(String(params[0]));
          return [[configured || { id: params[0], membership: 'Premium', paymentStatus: 'ACTIVE' }], []];
        }
        if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(normalized)) {
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
