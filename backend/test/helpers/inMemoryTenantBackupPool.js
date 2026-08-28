'use strict';

const { TENANT_TABLES } = require('../../enterprise/enterpriseBackup');

function clone(value) { return structuredClone(value); }

// Schema-level alternate uniqueness relevant to logical restore conflicts. The
// real MariaDB ledger enforces one event key per tenant independently of its PK.
const ALTERNATE_UNIQUE_KEYS = Object.freeze({
  enterprise_ai_usage: [['tenantId', 'eventKey']],
  enterprise_outbox: [['tenantId', 'idempotencyKey']],
  notification_outbox: [['idempotency_key']],
});

class InMemoryTenantBackupPool {
  constructor(seed = {}) {
    this.rows = Object.fromEntries(TENANT_TABLES.map(({ table }) => [table, clone(seed[table] || [])]));
    this.columns = new Map(TENANT_TABLES.map(({ table, scopeColumn, keyColumns }) => {
      const names = new Set([scopeColumn, ...keyColumns]);
      for (const row of this.rows[table]) for (const name of Object.keys(row)) names.add(name);
      return [table, names];
    }));
    this.calls = [];
  }

  clearTenant(tenantId) {
    for (const definition of [...TENANT_TABLES].reverse()) {
      this.rows[definition.table] = this.rows[definition.table]
        .filter(row => String(row[definition.scopeColumn]) !== String(tenantId));
    }
  }

  async query(sql, params = []) { return this._query(sql, params); }

  async getConnection() {
    const pool = this;
    let snapshot = null;
    return {
      async beginTransaction() { snapshot = clone(pool.rows); pool.calls.push('BEGIN'); },
      async commit() { snapshot = null; pool.calls.push('COMMIT'); },
      async rollback() { if (snapshot) pool.rows = snapshot; snapshot = null; pool.calls.push('ROLLBACK'); },
      release() { pool.calls.push('RELEASE'); },
      query(sql, params) {
        if (/^START TRANSACTION/i.test(String(sql))) snapshot = clone(pool.rows);
        return pool._query(sql, params);
      },
    };
  }

  async _query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    this.calls.push(normalized);
    if (/^SET TRANSACTION|^START TRANSACTION/i.test(normalized)) return [[]];
    const select = normalized.match(/^SELECT \* FROM `([^`]+)` WHERE `([^`]+)` = \?/i);
    if (select) {
      const [, table, scopeColumn] = select;
      return [clone((this.rows[table] || []).filter(row => String(row[scopeColumn]) === String(params[0])))];
    }
    const keyedSelect = normalized.match(/^SELECT (.+) FROM `([^`]+)` WHERE (.+) FOR UPDATE$/i);
    if (keyedSelect) {
      const selectedColumns = [...keyedSelect[1].matchAll(/`([^`]+)`/g)].map(match => match[1]);
      const keyColumns = [...keyedSelect[3].matchAll(/`([^`]+)` = \?/g)].map(match => match[1]);
      const found = (this.rows[keyedSelect[2]] || []).find(row => keyColumns.every((column, index) => String(row[column]) === String(params[index])));
      return [[...(found ? [Object.fromEntries(selectedColumns.map(column => [column, clone(found[column])]))] : [])]];
    }
    const show = normalized.match(/^SHOW COLUMNS FROM `([^`]+)`/i);
    if (show) return [[...this.columns.get(show[1]) || []].map(Field => ({ Field }))];
    const insert = normalized.match(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES \(([^)]+)\)/i);
    if (insert) {
      const table = insert[1];
      const columns = [...insert[2].matchAll(/`([^`]+)`/g)].map(match => match[1]);
      const row = Object.fromEntries(columns.map((column, index) => [column, clone(params[index])]));
      const definition = TENANT_TABLES.find(item => item.table === table);
      if (!definition) throw new Error(`Unknown backup table ${table}`);
      for (const column of columns) this.columns.get(table).add(column);
      const primaryIndex = this.rows[table].findIndex(existing => definition.keyColumns.every(column => String(existing[column]) === String(row[column])));
      const alternateIndex = (ALTERNATE_UNIQUE_KEYS[table] || []).reduce((found, uniqueColumns) => {
        if (found >= 0 || uniqueColumns.some(column => row[column] === null || row[column] === undefined)) return found;
        return this.rows[table].findIndex(existing => uniqueColumns.every(column => String(existing[column]) === String(row[column])));
      }, -1);
      const existingIndex = primaryIndex >= 0 ? primaryIndex : alternateIndex;
      if (existingIndex >= 0) {
        if (definition.appendOnly) return [{ affectedRows: 0 }];
        this.rows[table][existingIndex] = { ...this.rows[table][existingIndex], ...row };
        return [{ affectedRows: 2 }];
      }
      this.rows[table].push(row);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected backup SQL: ${normalized}`);
  }
}

module.exports = { InMemoryTenantBackupPool };
