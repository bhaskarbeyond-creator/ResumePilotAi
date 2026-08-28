'use strict';

const { setPoolForTests } = require('../../database/mysql');
const { setRepositoryForTests } = require('../../repositories');
const { clearProviderConfigurationCache } = require('../../services/aiRuntime');

class AiSettingsMariaDbContract {
  constructor() {
    this.settings = new Map();
    this.auditEvents = [];
  }

  reset(entries = {}) {
    this.settings = new Map(Object.entries(entries).map(([category, data]) => [category, {
      data,
      revision: Number(data?.aiRevision || data?._revision || 1),
    }]));
    this.auditEvents = [];
    clearProviderConfigurationCache();
  }

  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO admin_audit_logs /i.test(normalized)) return [{ affectedRows: 1 }, []];
    throw new Error(`Unexpected direct AI settings SQL: ${normalized}`);
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
        if (/^SELECT category, data, revision FROM system_settings/i.test(normalized)) {
          return [[...contract.settings].map(([category, row]) => ({
            category,
            data: row.data,
            revision: row.revision,
          })), []];
        }
        if (/^INSERT INTO system_settings /i.test(normalized)) {
          contract.settings.set(params[0], { data: JSON.parse(params[1]), revision: Number(params[2]) });
          return [{ affectedRows: 1 }, []];
        }
        if (/^INSERT INTO admin_audit_logs /i.test(normalized)) {
          contract.auditEvents.push({
            action: 'AI_PROVIDER_SETTINGS_UPDATED',
            metadata: JSON.parse(params[2]),
          });
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected AI settings transaction SQL: ${normalized}`);
      },
    };
  }

  async end() {}
}

function installAiSettingsContract(entries = {}) {
  const contract = new AiSettingsMariaDbContract();
  contract.reset(entries);
  setPoolForTests(contract);
  setRepositoryForTests({
    async getSetting(category) { return contract.settings.get(category)?.data || null; },
  });
  return contract;
}

module.exports = { AiSettingsMariaDbContract, installAiSettingsContract };
