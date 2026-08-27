'use strict';

/**
 * Resilient repository — MySQL/MariaDB is the single authoritative store.
 *
 * Application code depends on this interface, not on MySQL or Firestore
 * adapters. Every read and every write goes to MySQL only. There is NO
 * Firestore fallback in this class: a Firestore handle is never consulted on
 * the synchronous path, so a Firestore outage (or its complete absence)
 * cannot affect application behavior.
 *
 * MySQL outage semantics (mission §6):
 *  - failures are detected quickly (pool timeouts, connection errors)
 *  - reads/writes surface controlled 503 errors (code DATABASE_UNAVAILABLE /
 *    SERVICE_DEGRADED) — never fabricated success, never a silent switch to
 *    another database, never a lost acknowledged transaction
 *  - the durable sync_outbox (committed inside MySQL transactions by the
 *    adapter) keeps standby replication recoverable when it is enabled
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
    'getApplication', 'getDocument', 'listDocuments', 'getReview',
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
    'deleteApplication', 'saveDocument', 'deleteDocument',
    'saveReview', 'deleteReview',
]);

function classifyUnavailable(err) {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    const code = err.code;
    // Transport failures AND transient server-state errors (shutdown in
    // progress, query interrupted mid-flight, broken pipe) all mean the
    // authoritative store cannot serve this request right now: degrade with a
    // controlled 503 instead of leaking a generic 500.
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST',
        'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN', 'ER_QUERY_INTERRUPTED', 'ER_NET_READ_ERROR',
        'ER_NET_WRITE_INTERRUPTED', 'ER_NET_ERROR_ON_WRITE', 'POOL_CLOSED'].includes(code)) return true;
    return /unavailable|econnreset|etimedout|socket hang up|timeout|pool is closed|connect econnrefused|too many connections|server shutdown|shutdown in progress|mariadb|mysql/.test(msg);
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
    constructor({ mysqlRepo, _firestoreRepo = null, _firestoreDb = null } = {}) {
        if (!mysqlRepo) {
            throw new Error('ResilientRepository requires a MySQL repository — MySQL is the authoritative database.');
        }
        this.mysqlRepo = mysqlRepo;
        // The Firestore adapter is deliberately never used by this class. The
        // parameter exists only to preserve constructor compatibility.
        this.firestoreRepo = null;
        this.firestoreDb = null;
        this._bindInterface();
    }

    async _invoke(method, args) {
        if (!this.mysqlRepo || typeof this.mysqlRepo[method] !== 'function') {
            const err = new Error(`Repository method ${method} is not implemented on the MySQL repository`);
            err.code = 'METHOD_NOT_IMPLEMENTED';
            throw err;
        }
        return this.mysqlRepo[method](...args);
    }

    async _read(method, args) {
        try {
            const raw = await this._invoke(method, args);
            authority.recordSuccess('mysql', 'read');
            const normalized = normalizeResult(method, raw);
            return withReadMetadata(normalized, {
                dataSource: 'mysql',
                stale: false,
                failover: false,
                lastSyncedAt: new Date().toISOString(),
                dataVersion: normalized && typeof normalized === 'object' ? normalized.revision ?? null : null,
            });
        } catch (err) {
            if (classifyUnavailable(err)) {
                authority.recordFailure('mysql', 'read', err);
                err.code = err.code || 'DATABASE_UNAVAILABLE';
                err.status = err.status || 503;
            }
            throw err;
        }
    }

    async _write(method, args) {
        if (!authority.canAcceptWrites()) {
            authority.noteRejectedWrite();
            const err = new Error('Service degraded: the authoritative MySQL database is unavailable. Write was not accepted.');
            err.code = 'SERVICE_DEGRADED';
            err.status = 503;
            throw err;
        }
        const fenceGeneration = fencing.currentGeneration();
        fencing.assertFence(fenceGeneration);
        try {
            const raw = await this._invoke(method, args);
            authority.recordSuccess('mysql', 'write');
            return normalizeResult(method, raw);
        } catch (err) {
            authority.recordFailure('mysql', 'write', err);
            if (!classifyUnavailable(err)) throw err;
            authority.noteRejectedWrite();
            err.code = err.code || 'DATABASE_UNAVAILABLE';
            err.status = err.status || 503;
            throw err;
        }
    }

    _bindInterface() {
        const sample = this.mysqlRepo || {};
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
