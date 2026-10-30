'use strict';

/**
 * Durable state for the SAML service provider.
 *
 * Two kinds of state, both single-use by construction rather than by convention:
 *   * request correlation — a response is only accepted if it answers a request
 *     this SP issued, and that request row is consumed atomically;
 *   * assertion replay memory — the primary key on `assertion_id` is what makes a
 *     second use of the same assertion impossible, including across processes.
 *
 * The interface is deliberately plain (no ORM, no transaction spanning) so the
 * router can be tested against an in-memory double with identical semantics.
 */

const { getPool } = require('../database/mysql');

function mapConfigRow(row) {
  if (!row) return null;
  let certificates = [];
  try {
    const parsed = typeof row.certificates === 'string' ? JSON.parse(row.certificates) : row.certificates;
    certificates = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_error) {
    certificates = [];
  }
  return Object.freeze({
    tenantId: row.tenant_id,
    provider: row.provider,
    entityId: row.entity_id,
    ssoUrl: row.sso_url,
    sloUrl: row.slo_url || null,
    certificates,
    nameIdFormat: row.name_id_format || null,
    defaultRole: row.default_role || 'MEMBER',
    jitProvisioning: Number(row.jit_provisioning) === 1,
    enabled: Number(row.enabled) === 1,
    updatedAt: row.updated_at || null,
  });
}

function createMysqlSamlStore({ pool = null } = {}) {
  const db = () => (typeof pool === 'function' ? pool() : (pool || getPool()));

  return {
    async loadConfig(tenantId) {
      const [rows] = await db().query(
        `SELECT tenant_id, provider, entity_id, sso_url, slo_url, certificates, name_id_format,
                default_role, jit_provisioning, enabled, updated_at
           FROM enterprise_sso_config WHERE tenant_id = ?`,
        [tenantId],
      );
      return mapConfigRow(rows && rows[0]);
    },

    async saveConfig(tenantId, config) {
      await db().query(
        `INSERT INTO enterprise_sso_config
           (tenant_id, provider, entity_id, sso_url, slo_url, certificates, name_id_format,
            default_role, jit_provisioning, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           entity_id = VALUES(entity_id), sso_url = VALUES(sso_url), slo_url = VALUES(slo_url),
           certificates = VALUES(certificates), name_id_format = VALUES(name_id_format),
           default_role = VALUES(default_role), jit_provisioning = VALUES(jit_provisioning),
           enabled = VALUES(enabled)`,
        [
          tenantId,
          'saml',
          config.entityId,
          config.ssoUrl,
          config.sloUrl || null,
          JSON.stringify(config.certificates),
          config.nameIdFormat || null,
          config.defaultRole || 'MEMBER',
          config.jitProvisioning ? 1 : 0,
          config.enabled ? 1 : 0,
        ],
      );
      return this.loadConfig(tenantId);
    },

    async createAuthnRequest({ id, tenantId, relayState, expiresAt }) {
      await db().query(
        `INSERT INTO saml_authn_requests (id, tenant_id, relay_state, expires_at)
         VALUES (?, ?, ?, ?)`,
        [id, tenantId, relayState || null, expiresAt],
      );
      return { id };
    },

    async readAuthnRequest(id) {
      const [rows] = await db().query(
        `SELECT id, tenant_id, relay_state, expires_at, consumed_at
           FROM saml_authn_requests WHERE id = ?`,
        [id],
      );
      const row = rows && rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        relayState: row.relay_state || null,
        expiresAt: Number(row.expires_at),
        consumedAt: row.consumed_at === null || row.consumed_at === undefined ? null : Number(row.consumed_at),
      };
    },

    /** Atomically marks a request consumed. Returns false if it already was. */
    async consumeAuthnRequest({ id, tenantId, now = Date.now() }) {
      const [result] = await db().query(
        `UPDATE saml_authn_requests
            SET consumed_at = ?
          WHERE id = ? AND tenant_id = ? AND consumed_at IS NULL AND expires_at > ?`,
        [now, id, tenantId, now],
      );
      return Number(result && result.affectedRows) === 1;
    },

    /** Records an assertion id. Returns false when it has already been used. */
    async rememberAssertion({ assertionId, tenantId, expiresAt }) {
      const [result] = await db().query(
        `INSERT IGNORE INTO saml_assertion_replay (assertion_id, tenant_id, expires_at)
         VALUES (?, ?, ?)`,
        [assertionId, tenantId, Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60 * 1000],
      );
      return Number(result && result.affectedRows) === 1;
    },

    async purgeExpired(now = Date.now()) {
      await db().query('DELETE FROM saml_authn_requests WHERE expires_at <= ?', [now]);
      await db().query('DELETE FROM saml_assertion_replay WHERE expires_at <= ?', [now]);
    },
  };
}

/** Same contract, process-local. Used by tests only — never by the server. */
function createInMemorySamlStore({ configs = new Map(), now = () => Date.now() } = {}) {
  const requests = new Map();
  const assertions = new Map();
  return {
    async loadConfig(tenantId) {
      return configs.get(tenantId) || null;
    },
    async saveConfig(tenantId, config) {
      const stored = Object.freeze({
        tenantId,
        provider: 'saml',
        entityId: config.entityId,
        ssoUrl: config.ssoUrl,
        sloUrl: config.sloUrl || null,
        certificates: [].concat(config.certificates),
        nameIdFormat: config.nameIdFormat || null,
        defaultRole: config.defaultRole || 'MEMBER',
        jitProvisioning: Boolean(config.jitProvisioning),
        enabled: Boolean(config.enabled),
        updatedAt: new Date(now()).toISOString(),
      });
      configs.set(tenantId, stored);
      return stored;
    },
    async createAuthnRequest({ id, tenantId, relayState, expiresAt }) {
      requests.set(id, { id, tenantId, relayState: relayState || null, expiresAt, consumedAt: null });
      return { id };
    },
    async readAuthnRequest(id) {
      return requests.get(id) || null;
    },
    async consumeAuthnRequest({ id, tenantId, now: at = now() }) {
      const row = requests.get(id);
      if (!row || row.consumedAt !== null || row.expiresAt <= at || row.tenantId !== tenantId) return false;
      row.consumedAt = at;
      return true;
    },
    async rememberAssertion({ assertionId, tenantId, expiresAt }) {
      if (assertions.has(assertionId)) return false;
      assertions.set(assertionId, { tenantId, expiresAt });
      return true;
    },
    async purgeExpired(at = now()) {
      for (const [id, row] of requests) if (row.expiresAt <= at) requests.delete(id);
      for (const [id, row] of assertions) if (row.expiresAt <= at) assertions.delete(id);
    },
    _debug: { requests, assertions },
  };
}

module.exports = { createMysqlSamlStore, createInMemorySamlStore, mapConfigRow };
