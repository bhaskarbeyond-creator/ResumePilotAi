'use strict';

/**
 * Resilient repository — MySQL/MariaDB is the single authoritative store.
 *
 * Application code depends on this interface, not on database-specific route
 * code. Every read and every write goes to MariaDB only; there is no alternate
 * owner, fallback, mirroring, or promotion path.
 *
 * MySQL outage semantics (mission §6):
 *  - failures are detected quickly (pool timeouts, connection errors)
 *  - reads/writes surface controlled 503 errors (code DATABASE_UNAVAILABLE /
 *    SERVICE_DEGRADED) — never fabricated success, never a silent switch to
 *    another database, never a lost acknowledged transaction
 */

const { canonicalizeRecord, withDatabaseMetadata } = require('../database/canonical');
const { toCanonicalUser, toCanonicalResume } = require('../database/domain');
const authority = require('../database/authority');

const READ_METHODS = new Set([
    'getUser', 'getUserByEmail', 'getUsers', 'getUsersByIds',
    'getResume', 'getResumes', 'getPublicResume', 'getResumePublication',
    'getPortfolio', 'getPortfolios', 'getPublishedPortfolioBySlug', 'getPublishedPortfolios',
    'getCover', 'getCovers',
    'getJob', 'getJobs', 'getApplications',
    'getBlogPosts', 'getBlogPostBySlug', 'getBlogPostById',
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
    'savePaymentOrder', 'saveCoupon', 'deleteCoupon', 'saveCouponRedemption', 'deleteCouponRedemption',
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
    return /(?:database|service|server) unavailable|econnreset|etimedout|socket hang up|(?:connect|connection).*timeout|pool is closed|connect econnrefused|too many connections|server shutdown|shutdown in progress|connection (?:lost|closed|terminated)|broken pipe/.test(msg);
}

function normalizeResult(method, result) {
    if (result === null || result === undefined) return result;
    if (method === 'getUser' || method === 'getUserByEmail' || method === 'saveUser') {
        return toCanonicalUser(result);
    }
    if (method === 'getUsers' || method === 'getUsersByIds') {
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
    constructor({ mysqlRepo } = {}) {
        if (!mysqlRepo) {
            throw new Error('ResilientRepository requires a MariaDB repository.');
        }
        this.mysqlRepo = mysqlRepo;
        this._bindInterface();
    }

    async _invoke(method, args) {
        if (!this.mysqlRepo || typeof this.mysqlRepo[method] !== 'function') {
            const err = new Error(`Repository method ${method} is not implemented on the MariaDB repository`);
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
            return withDatabaseMetadata(normalized, {
                dataSource: 'mysql',
                readAt: new Date().toISOString(),
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
            const err = new Error('Service degraded: the authoritative MariaDB database is unavailable. Write was not accepted.');
            err.code = 'SERVICE_DEGRADED';
            err.status = 503;
            throw err;
        }
        try {
            const raw = await this._invoke(method, args);
            authority.recordSuccess('mysql', 'write');
            return normalizeResult(method, raw);
        } catch (err) {
            // Validation, authorization, uniqueness, and optimistic-conflict
            // errors do not indicate an authority outage. Counting them as
            // transport failures could trip the circuit and reject unrelated
            // writes after two ordinary 4xx responses.
            if (!classifyUnavailable(err)) throw err;
            authority.recordFailure('mysql', 'write', err);
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
