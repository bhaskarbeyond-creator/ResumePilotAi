'use strict';

/**
 * Resilient repository / DB router.
 *
 * Application code depends on this interface, not on MariaDB or Firestore
 * adapters. Reads try the write-authority engine first and fall back to the
 * other engine when it is unhealthy. Writes go to a single operational
 * authority; the durable outbox (already committed by the adapter) replicates
 * to the standby. Dual-write-in-the-request-path is intentionally avoided.
 *
 * Both engines down → throw SERVICE_DEGRADED (never fake success).
 */

const { canonicalizeRecord, withReadMetadata } = require('../database/canonical');
const { toCanonicalUser, toCanonicalResume } = require('../database/domain');
const authority = require('../database/authority');
const fencing = require('../database/fencing');

const READ_METHODS = new Set([
    'getUser', 'getUserByEmail', 'getUsers',
    'getResume', 'getResumes', 'getPublicResume', 'getResumePublication',
    'getPortfolio', 'getPortfolios',
    'getCover', 'getCovers',
    'getJob', 'getJobs', 'getApplications',
    'getBlogPosts', 'getBlogPostBySlug',
    'getCustomPages', 'getCustomPageBySlug',
    'getTrustedBy',
    'getNotifications', 'getContactMessages',
    'getSetting', 'getStats',
    'getAdminAuditLogs', 'getSecurityAuditLogs',
    'getUserContentCounts', 'getUserPaymentOrders',
    'getPaymentOrder', 'getCoupon', 'getCouponRedemption',
    'findPaymentOrderByProviderIntent',
    'getCompany', 'getCompanies',
]);

const WRITE_METHODS = new Set([
    'saveUser', 'deleteUser',
    'saveResume', 'deleteResume', 'publishResume', 'unpublishResume',
    'savePortfolio', 'deletePortfolio',
    'saveCover', 'deleteCover',
    'saveJob', 'deleteJob', 'saveApplication',
    'saveBlogPost', 'deleteBlogPost',
    'saveCustomPage', 'deleteCustomPage',
    'saveTrustedBy', 'deleteTrustedBy',
    'saveNotification', 'saveContactMessage',
    'saveSetting', 'incrementStat',
    'recordAdminAuditLog', 'recordSecurityAuditLog',
    'savePaymentOrder', 'saveCoupon', 'saveCouponRedemption', 'deleteCouponRedemption',
    'saveCompany', 'deleteCompany',
    'claimWebhookEvent',
]);

function classifyUnavailable(err) {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    const code = err.code;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ER_CON_COUNT_ERROR') return true;
    if (code === 14 || code === 8 || code === 4 || code === 13) return true;
    return /unavailable|econnreset|etimedout|socket hang up|timeout|not initialized|pool is closed|connect econnrefused|firestore database instance is unavailable|mysql|mariadb/.test(msg);
}

function normalizeResult(method, result) {
    if (result === null || result === undefined) return result;
    if (method === 'getUser' || method === 'getUserByEmail' || method === 'saveUser') {
        return toCanonicalUser(result);
    }
    if (method === 'getUsers') {
        return Array.isArray(result) ? result.map(toCanonicalUser) : result;
    }
    if (method === 'getResume' || method === 'saveResume') {
        return toCanonicalResume(result);
    }
    if (method === 'getResumes') {
        return Array.isArray(result) ? result.map(toCanonicalResume) : result;
    }
    return canonicalizeRecord(result);
}

class ResilientRepository {
    constructor({ mysqlRepo, firestoreRepo, firestoreDb = null } = {}) {
        this.mysqlRepo = mysqlRepo;
        this.firestoreRepo = firestoreRepo;
        this.firestoreDb = firestoreDb;
        this._bindInterface();
    }

    _repoFor(engine) {
        return engine === 'mysql' ? this.mysqlRepo : this.firestoreRepo;
    }

    _engineOf(repo) {
        return repo === this.mysqlRepo ? 'mysql' : 'firestore';
    }

    async _invoke(repo, method, args) {
        if (!repo || typeof repo[method] !== 'function') {
            const err = new Error(`Repository method ${method} is not implemented on ${this._engineOf(repo)}`);
            err.code = 'METHOD_NOT_IMPLEMENTED';
            throw err;
        }
        return repo[method](...args);
    }

    async _read(method, args) {
        const order = authority.getReadOrder();
        if (!order.length) {
            const err = new Error('Both databases are unavailable');
            err.code = 'BOTH_DATABASES_UNAVAILABLE';
            err.status = 503;
            throw err;
        }
        let lastError = null;
        let attempted = 0;
        for (const engine of order) {
            const repo = this._repoFor(engine);
            if (!repo) continue;
            attempted += 1;
            try {
                const raw = await this._invoke(repo, method, args);
                authority.recordSuccess(engine, 'read');
                const normalized = normalizeResult(method, raw);
                const stale = engine !== authority.getWriteEngine();
                if (stale) {
                    authority.noteStaleRead();
                    authority.noteSecondaryFallback();
                }
                return withReadMetadata(normalized, {
                    dataSource: engine,
                    stale,
                    failover: authority.getStatus().mode !== 'NORMAL',
                    lastSyncedAt: new Date().toISOString(),
                    dataVersion: normalized && typeof normalized === 'object' ? normalized.revision ?? null : null,
                });
            } catch (err) {
                lastError = err;
                if (classifyUnavailable(err)) {
                    authority.recordFailure(engine, 'read', err);
                    continue;
                }
                throw err;
            }
        }
        const err = lastError || new Error('Database unavailable');
        err.code = err.code || 'DATABASE_UNAVAILABLE';
        err.status = err.status || 503;
        if (attempted === 0) err.code = 'BOTH_DATABASES_UNAVAILABLE';
        throw err;
    }

    async _write(method, args) {
        if (!authority.canAcceptWrites()) {
            authority.noteRejectedWrite();
            const err = new Error('Service degraded: both databases are unavailable. Write was not accepted.');
            err.code = 'BOTH_DATABASES_UNAVAILABLE';
            err.status = 503;
            throw err;
        }
        const fenceGeneration = fencing.currentGeneration();
        fencing.assertFence(fenceGeneration);
        const preferred = authority.getWriteEngine();
        const fallback = preferred === 'mysql' ? 'firestore' : 'mysql';
        const attempts = [preferred, fallback];
        let lastError = null;
        for (const engine of attempts) {
            const repo = this._repoFor(engine);
            if (!repo) continue;
            try {
                const raw = await this._invoke(repo, method, args);
                authority.recordSuccess(engine, 'write');
                if (engine !== preferred) {
                    authority.recordFailure(preferred, 'write', lastError || new Error('preferred write engine failed'));
                }
                return normalizeResult(method, raw);
            } catch (err) {
                lastError = err;
                if (classifyUnavailable(err)) {
                    authority.recordFailure(engine, 'write', err);
                    continue;
                }
                throw err;
            }
        }
        authority.noteRejectedWrite();
        const err = lastError || new Error('Write failed on all available engines');
        err.code = err.code || 'DATABASE_UNAVAILABLE';
        err.status = err.status || 503;
        throw err;
    }

    _bindInterface() {
        const sample = this.mysqlRepo || this.firestoreRepo || {};
        const names = new Set([
            ...Object.getOwnPropertyNames(Object.getPrototypeOf(sample) || {}),
            ...READ_METHODS,
            ...WRITE_METHODS,
        ]);
        for (const name of names) {
            if (name === 'constructor' || typeof this[name] === 'function') continue;
            if (READ_METHODS.has(name)) {
                this[name] = (...args) => this._read(name, args);
            } else if (WRITE_METHODS.has(name)) {
                this[name] = (...args) => this._write(name, args);
            } else if (typeof sample[name] === 'function') {
                this[name] = (...args) => this._write(name, args);
            }
        }
    }
}

module.exports = ResilientRepository;
