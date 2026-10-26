'use strict';
/**
 * InMemoryRepository — a deterministic, in-process repository used ONLY when
 * MariaDB is not available at boot. It preserves the authorization semantics
 * (owner checks, idempotency, simple revision guards) that the Playwright
 * zero-trust suite and the dev UI exercise so that role-based flows can be
 * verified in a browser without a running MySQL server.
 *
 * DESIGN CONSTRAINTS:
 *   1. Production runtime NEVER uses this. It is selected exclusively by
 *      `repositories/index.js` when the live MariaDB connection probe fails
 *      AND either NODE_ENV !== 'production' or IN_MEMORY_REPOSITORY=1.
 *   2. It does not attempt full SQL parity — only the access patterns used by
 *      the existing routes need to work. Missing methods throw
 *      NOT_IMPLEMENTED (HTTP 501 via ResilientRepository) rather than
 *      returning falsy data.
 *   3. Owner/isolation checks are mirrored from MySQLRepository so that IDOR
 *      and cross-tenant tests behave identically.
 */

const crypto = require('crypto');

function _uid(prefix) {
    return `${prefix}_${crypto.randomBytes(9).toString('hex')}`;
}

class InMemoryRepository {
    constructor() {
        this._users = new Map();
        this._resumes = new Map();
        this._liveInterviewSessions = new Map();
        this._covers = new Map();
        this._portfolios = new Map();
        this._companies = new Map();
        this._jobs = new Map();
        this._applications = new Map();
        this._paymentOrders = new Map();
        this._coupons = new Map();
        this._couponRedemptions = new Map();
        this._settings = new Map();
        this._notifications = [];
        this._blogPosts = new Map();
        this._customPages = new Map();
        this._trustedBy = new Map();
        this._reviews = new Map();
        this._documents = new Map();
        this._trackedJobs = new Map();
        this._favourites = new Map(); // userId -> Set of ids
        this._stats = new Map();
        this._contactMessages = [];
        this._adminAuditLogs = [];
        this._securityAuditLogs = [];
        this._webhookEvents = [];
        this._nextId = 1;
        this._seedDefaults();
    }

    /** Seed minimal default settings required for the public UI to boot when
     *  running in local/E2E mode without a live MariaDB. */
    _seedDefaults() {
        const now = new Date().toISOString();
        if (!this._settings.has('public_config')) {
            this._settings.set('public_config', {
                _settingsSource: 'mariadb-inmemory',
                modules: {
                    ai: { enabled: true, provider: 'mock' },
                    payments: { enabled: false },
                    blog: { enabled: true },
                    jobs: { enabled: true },
                    enterprise: { enabled: true },
                    analytics: { enabled: false },
                    templates: { enabled: true },
                    portfolio: { enabled: true },
                    chat: { enabled: false },
                    careers: { enabled: true },
                    employer: { enabled: true },
                    interviewCoach: { enabled: false },
                    ats: { enabled: false },
                    coverLetter: { enabled: true },
                },
                maintenanceMode: false,
                defaultLanguage: 'en',
                supportedLanguages: ['en'],
                systemHealth: { maintenanceMode: false },
                createdAt: now,
            });
        }
        if (!this._settings.has('website_meta')) {
            this._settings.set('website_meta', {
                websiteName: 'localhost:5173',
                supportEmail: 'support@resumepilot.test',
                logoUrl: null,
                brandColor: '#694aff',
            });
        }
        if (!this._settings.has('system_health')) {
            this._settings.set('system_health', { maintenanceMode: false });
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    _id(prefix) {
        return `${prefix}_${this._nextId++}_${crypto.randomBytes(3).toString('hex')}`;
    }

    _reject(message, code = 'NOT_FOUND', status = 404) {
        throw Object.assign(new Error(message), { code, status });
    }

    _assertOwner(entity, userId) {
        if (!entity || entity.userId !== userId) {
            this._reject('Resource not found', 'NOT_FOUND', 404);
        }
    }

    // ---------------------------------------------------------------------
    // Users
    // ---------------------------------------------------------------------
    async getUser(userId) {
        return this._users.get(userId) || null;
    }
    async getUsersByIds(userIds = []) {
        return userIds.map(id => this._users.get(id)).filter(Boolean);
    }
    async getUserByEmail(email) {
        const needle = String(email || '').trim().toLowerCase();
        for (const u of this._users.values()) {
            if (String(u.email || '').toLowerCase() === needle) return u;
        }
        return null;
    }
    async getUsers({ limit = 50, q = '', role, plan, tenantId, status } = {}) {
        let rows = Array.from(this._users.values());
        if (q) {
            const ql = String(q).toLowerCase();
            rows = rows.filter(u =>
                String(u.email || '').toLowerCase().includes(ql) ||
                String(u.displayName || u.firstname || '').toLowerCase().includes(ql));
        }
        if (role && role !== 'ALL') rows = rows.filter(u => String(u.role || 'USER').toUpperCase() === String(role).toUpperCase());
        if (plan && plan !== 'ALL') rows = rows.filter(u => String(u.membership || '').toUpperCase() === String(plan).toUpperCase());
        if (tenantId) rows = rows.filter(u => u.tenantId === tenantId);
        if (status && status !== 'all') rows = rows.filter(u => String(u.status || '').toLowerCase() === String(status).toLowerCase());
        return { users: rows.slice(0, limit), nextPageToken: null };
    }
    async saveUser(userId, userData = {}) {
        const existing = this._users.get(userId) || null;
        const now = new Date().toISOString();
        const merged = {
            userId,
            uid: userId,
            role: 'USER',
            membership: 'Basic',
            paymentStatus: 'INACTIVE',
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            ...(existing || {}),
            ...userData,
        };
        // Ensure email is stored
        if (userData.email) merged.email = String(userData.email).trim().toLowerCase();
        if (merged.membershipEnds && !(merged.membershipEnds instanceof Date) && typeof merged.membershipEnds === 'string') {
            merged.membershipEnds = new Date(merged.membershipEnds);
        }
        this._users.set(userId, merged);
        return { isNewUser: !existing };
    }
    async saveUserWithRevisionGuard(userId, userData, expectedRevision = null) {
        const existing = this._users.get(userId);
        const currentRev = existing?.revision || 1;
        if (expectedRevision !== null && expectedRevision !== undefined && Number(currentRev) !== Number(expectedRevision)) {
            this._reject('Revision conflict', 'STALE_WRITE', 409);
        }
        const res = await this.saveUser(userId, { ...userData, revision: currentRev + 1 });
        return { user: this._users.get(userId), isNewUser: res.isNewUser, currentRevision: currentRev + 1 };
    }
    async deleteUser(userId) {
        this._users.delete(userId);
        // Cascade: remove all owned records
        for (const [k, v] of this._resumes) if (v.userId === userId) this._resumes.delete(k);
        for (const [k, v] of this._liveInterviewSessions) if (v.userId === userId) this._liveInterviewSessions.delete(k);
        for (const [k, v] of this._covers) if (v.userId === userId) this._covers.delete(k);
        for (const [k, v] of this._portfolios) if (v.userId === userId) this._portfolios.delete(k);
        for (const [k, v] of this._trackedJobs) if (v.userId === userId) this._trackedJobs.delete(k);
        this._notifications = this._notifications.filter(n => n.userId !== userId);
        return { deleted: true };
    }

    // ---------------------------------------------------------------------
    // Resumes
    // ---------------------------------------------------------------------
    async getResumes(userId) {
        return Array.from(this._resumes.values()).filter(r => r.userId === userId).map(r => ({
            id: r.id, title: r.title || '', template: r.template || '', updatedAt: r.updatedAt, revision: r.revision || 1,
        }));
    }
    async getResume(userId, resumeId) {
        const r = this._resumes.get(resumeId);
        if (!r || r.userId !== userId) return null;
        return r;
    }
    async saveResume(userId, resumeId, data = {}, { expectedRevision = null } = {}) {
        const existing = this._resumes.get(resumeId);
        if (existing && existing.userId !== userId) this._reject('Resume not found', 'NOT_FOUND', 404);
        const currentRev = existing?.revision || 0;
        if (expectedRevision !== null && Number(currentRev) !== Number(expectedRevision)) {
            this._reject('Revision conflict', 'STALE_WRITE', 409);
        }
        const now = new Date().toISOString();
        const saved = {
            id: resumeId,
            title: data.title || existing?.title || 'Untitled Resume',
            template: data.template || existing?.template || 'modern',
            content: data.content || existing?.content || {},
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            revision: currentRev + 1,
            publicationRevision: existing?.publicationRevision || 0,
            isPublished: existing?.isPublished || false,
            pbId: existing?.pbId || null,
            ...existing,
            ...data,
            userId, // enforced: owner cannot be changed via save
        };
        this._resumes.set(resumeId, saved);
        return { id: resumeId, revision: saved.revision };
    }
    async deleteResume(userId, resumeId) {
        const r = this._resumes.get(resumeId);
        if (!r || r.userId !== userId) return 0;
        this._resumes.delete(resumeId);
        return 1;
    }

    // ---------------------------------------------------------------------
    // Live interview sessions (non-production repository parity)
    // ---------------------------------------------------------------------
    async createLiveInterviewSession(userId, session = {}) {
        const id = String(session.id || '');
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(id) || !session.state || typeof session.state !== 'object') {
            this._reject('Invalid live interview session', 'INVALID_LIVE_INTERVIEW_SESSION', 400);
        }
        const stored = {
            id,
            userId,
            ownerUid: userId,
            status: session.status || 'active',
            revision: 1,
            state: JSON.parse(JSON.stringify(session.state)),
            createdAt: session.createdAt || new Date().toISOString(),
            expiresAt: session.expiresAt,
            completedAt: session.status === 'completed' ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
        };
        this._liveInterviewSessions.set(id, stored);
        return JSON.parse(JSON.stringify(stored));
    }

    async getLiveInterviewSession(userId, sessionId) {
        const record = this._liveInterviewSessions.get(sessionId);
        if (!record || record.userId !== userId) return null;
        return JSON.parse(JSON.stringify(record));
    }

    async saveLiveInterviewSession(userId, sessionId, session = {}, { expectedRevision } = {}) {
        const current = this._liveInterviewSessions.get(sessionId);
        if (!current || current.userId !== userId || Number(current.revision) !== Number(expectedRevision)) return null;
        const stored = {
            ...current,
            status: session.status || current.status,
            revision: Number(current.revision) + 1,
            state: JSON.parse(JSON.stringify(session.state || current.state)),
            expiresAt: session.expiresAt || current.expiresAt,
            completedAt: session.status === 'completed' ? (current.completedAt || new Date().toISOString()) : current.completedAt,
            updatedAt: new Date().toISOString(),
        };
        this._liveInterviewSessions.set(sessionId, stored);
        return JSON.parse(JSON.stringify(stored));
    }

    async deleteLiveInterviewSession(userId, sessionId) {
        const record = this._liveInterviewSessions.get(sessionId);
        if (!record || record.userId !== userId) return false;
        this._liveInterviewSessions.delete(sessionId);
        return true;
    }

    async deleteExpiredLiveInterviewSessions() {
        const now = Date.now();
        let deleted = 0;
        for (const [id, record] of this._liveInterviewSessions.entries()) {
            if (Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) <= now) {
                this._liveInterviewSessions.delete(id);
                deleted += 1;
                if (deleted >= 500) break;
            }
        }
        return deleted;
    }

    // ---------------------------------------------------------------------
    // Covers
    // ---------------------------------------------------------------------
    async getCovers(userId) {
        return Array.from(this._covers.values()).filter(c => c.userId === userId);
    }
    async getCover(userId, coverId) {
        const c = this._covers.get(coverId);
        if (!c || c.userId !== userId) return null;
        return c;
    }
    async saveCover(userId, coverId, data = {}) {
        const existing = this._covers.get(coverId);
        if (existing && existing.userId !== userId) this._reject('Not found', 'NOT_FOUND', 404);
        const now = new Date().toISOString();
        const saved = { id: coverId, userId, createdAt: existing?.createdAt || now, updatedAt: now, ...existing, ...data};
        this._covers.set(coverId, saved);
        return saved;
    }
    async deleteCover(userId, coverId) {
        const c = this._covers.get(coverId);
        if (!c || c.userId !== userId) return 0;
        this._covers.delete(coverId);
        return 1;
    }

    // ---------------------------------------------------------------------
    // Portfolios (minimal)
    // ---------------------------------------------------------------------
    async getPortfolios(userId) {
        return Array.from(this._portfolios.values()).filter(p => p.userId === userId);
    }
    async getPortfolio(userId, portfolioId) {
        const p = this._portfolios.get(portfolioId);
        if (!p || p.userId !== userId) return null;
        return p;
    }
    async getPublishedPortfolioBySlug(slug) {
        for (const p of this._portfolios.values()) if (p.slug === slug && p.isPublished) return p;
        return null;
    }
    async getPublishedPortfolios(limit = 50, theme = null) {
        return Array.from(this._portfolios.values()).filter(p => p.isPublished && (!theme || p.theme === theme)).slice(0, limit);
    }
    async savePortfolio(userId, portfolioId, data = {}, { expectedRevision } = {}) {
        const existing = this._portfolios.get(portfolioId);
        if (existing && existing.userId !== userId) this._reject('Not found', 'NOT_FOUND', 404);
        const cur = existing?.revision || 0;
        if (expectedRevision !== undefined && Number(expectedRevision) !== Number(cur)) this._reject('Revision conflict', 'STALE_WRITE', 409);
        const saved = { id: portfolioId, userId, revision: cur + 1, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data};
        this._portfolios.set(portfolioId, saved);
        return { id: portfolioId, revision: saved.revision };
    }
    async deletePortfolio(userId, portfolioId, expectedRevision) {
        const p = this._portfolios.get(portfolioId);
        if (!p || p.userId !== userId) return { deleted: false };
        if (expectedRevision !== undefined && Number(expectedRevision) !== Number(p.revision || 1)) this._reject('Revision conflict', 'STALE_WRITE', 409);
        this._portfolios.delete(portfolioId);
        return { deleted: true };
    }

    // ---------------------------------------------------------------------
    // Jobs / Companies / Applications
    // ---------------------------------------------------------------------
    async getJobs({ publicOnly, employerId, limit = 50 } = {}) {
        let rows = Array.from(this._jobs.values());
        if (publicOnly) rows = rows.filter(j => j.isPublic);
        if (employerId) rows = rows.filter(j => j.employerId === employerId);
        return rows.slice(0, limit);
    }
    async getJob(jobId) {
        return this._jobs.get(jobId) || null;
    }
    async saveJob(jobId, data = {}) {
        const existing = this._jobs.get(jobId);
        const saved = { id: jobId, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._jobs.set(jobId, saved);
        return saved;
    }
    async deleteJob(userId, jobId) {
        const j = this._jobs.get(jobId);
        if (!j || j.userId !== userId) return 0;
        this._jobs.delete(jobId);
        return 1;
    }
    async getCompanies(employerId) {
        const rows = Array.from(this._companies.values());
        return employerId ? rows.filter(c => c.ownerUid === employerId) : rows;
    }
    async getCompany(companyId) {
        return this._companies.get(companyId) || null;
    }
    async saveCompany(companyId, data = {}) {
        const existing = this._companies.get(companyId);
        const saved = { id: companyId, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._companies.set(companyId, saved);
        return saved;
    }
    async deleteCompany(userId, companyId) {
        const c = this._companies.get(companyId);
        if (!c || c.ownerUid !== userId) return 0;
        this._companies.delete(companyId);
        return 1;
    }
    async getApplications({ jobId, employerId, userId } = {}) {
        let rows = Array.from(this._applications.values());
        if (jobId) rows = rows.filter(a => a.jobId === jobId);
        if (userId) rows = rows.filter(a => a.userId === userId);
        if (employerId) rows = rows.filter(a => a.employerId === employerId);
        return rows;
    }
    async getApplication(applicationId) {
        return this._applications.get(applicationId) || null;
    }
    async saveApplication(applicationId, data = {}) {
        const existing = this._applications.get(applicationId);
        const saved = { id: applicationId, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._applications.set(applicationId, saved);
        return saved;
    }
    async deleteApplication(applicationId) {
        this._applications.delete(applicationId);
        return { deleted: true };
    }
    async getTrackedJobs(userId) {
        return Array.from(this._trackedJobs.values()).filter(j => j.userId === userId);
    }
    async createTrackedJob(userId, trackerId, data = {}) {
        this._trackedJobs.set(trackerId, { id: trackerId, userId, ...data });
        return this._trackedJobs.get(trackerId);
    }
    async updateTrackedJob(userId, trackerId, data = {}) {
        const t = this._trackedJobs.get(trackerId);
        if (!t || t.userId !== userId) return null;
        Object.assign(t, data);
        return t;
    }
    async deleteTrackedJob(userId, trackerId) {
        const t = this._trackedJobs.get(trackerId);
        if (!t || t.userId !== userId) return 0;
        this._trackedJobs.delete(trackerId);
        return 1;
    }

    // ---------------------------------------------------------------------
    // Payment orders
    // ---------------------------------------------------------------------
    async getPaymentOrder(orderId) {
        return this._paymentOrders.get(orderId) || null;
    }
    async getUserPaymentOrders(userId) {
        return Array.from(this._paymentOrders.values()).filter(p => p.uid === userId);
    }
    async savePaymentOrder(order) {
        if (!order || !order.id) this._reject('Order id required', 'BAD_REQUEST', 400);
        const existing = this._paymentOrders.get(order.id);
        const saved = { createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...order };
        this._paymentOrders.set(order.id, saved);
        return saved;
    }
    async findPaymentOrderByProviderIntent(provider, intentId) {
        for (const p of this._paymentOrders.values()) {
            if (p.provider === provider && (p.intentId === intentId || p.providerOrderId === intentId)) return p;
        }
        return null;
    }
    async activatePaymentOrderAtomic({ id, paymentStatus = 'ACTIVE', membership, membershipEnds, invoiceSnapshot }) {
        const o = this._paymentOrders.get(id);
        if (!o) this._reject('Order not found', 'ORDER_NOT_FOUND', 404);
        o.status = 'ACTIVE';
        o.paymentStatus = paymentStatus;
        o.activatedAt = new Date().toISOString();
        if (membership) o.membership = membership;
        if (membershipEnds) o.membershipEnds = membershipEnds;
        if (invoiceSnapshot) o.billingSnapshotVersion = 1, o.invoiceSnapshot = invoiceSnapshot;
        // Update user membership
        const u = this._users.get(o.uid);
        if (u) {
            u.membership = o.membership || u.membership;
            u.paymentStatus = paymentStatus;
            if (membershipEnds) u.membershipEnds = membershipEnds;
        }
        return o;
    }
    async claimPaymentRefundAtomic({ paymentOrderId }) {
        const o = this._paymentOrders.get(paymentOrderId);
        if (!o) this._reject('Order not found', 'ORDER_NOT_FOUND', 404);
        o.refundClaimedAt = new Date().toISOString();
        return o;
    }
    async recordPaymentRefundSubmittedAtomic({ paymentOrderId }) {
        const o = this._paymentOrders.get(paymentOrderId);
        if (!o) return null;
        o.refundSubmittedAt = new Date().toISOString();
        return o;
    }
    async releasePaymentRefundClaimAtomic({ paymentOrderId }) {
        const o = this._paymentOrders.get(paymentOrderId);
        if (!o) return null;
        delete o.refundClaimedAt;
        return o;
    }
    async reversePaymentEntitlementAtomic({ paymentOrderId, reason }) {
        const o = this._paymentOrders.get(paymentOrderId);
        if (!o) return null;
        o.status = 'REFUNDED';
        o.refundedAt = new Date().toISOString();
        o.refundReason = reason;
        const u = this._users.get(o.uid);
        if (u) {
            u.membership = 'Basic';
            u.paymentStatus = 'REFUNDED';
        }
        return o;
    }
    async claimWebhookEvent({ provider, eventId }) {
        const key = `${provider}:${eventId}`;
        const exists = this._webhookEvents.includes(key);
        if (!exists) this._webhookEvents.push(key);
        return { claimed: !exists, alreadyClaimed: exists };
    }
    async deleteWebhookEvent({ provider, eventId }) {
        const key = `${provider}:${eventId}`;
        this._webhookEvents = this._webhookEvents.filter(k => k !== key);
        return true;
    }

    // ---------------------------------------------------------------------
    // Coupons
    // ---------------------------------------------------------------------
    async getCoupon(code) {
        return this._coupons.get(String(code).toUpperCase()) || null;
    }
    async saveCoupon(coupon) {
        if (!coupon || !coupon.code) this._reject('Coupon code required', 'BAD_REQUEST', 400);
        const code = String(coupon.code).toUpperCase();
        this._coupons.set(code, { code, ...coupon });
        return this._coupons.get(code);
    }
    async deleteCoupon(code) {
        const cCode = String(code).toUpperCase();
        this._coupons.delete(cCode);
        return { success: true, deleted: true, code: cCode };
    }
    async getCouponRedemption({ couponCode, userId }) {
        const key = `${couponCode}:${userId}`;
        return this._couponRedemptions.get(key) || null;
    }
    async saveCouponRedemption(r) {
        const key = `${r.couponCode}:${r.userId}`;
        this._couponRedemptions.set(key, r);
        return r;
    }
    async deleteCouponRedemption({ couponCode, userId }) {
        const key = `${couponCode}:${userId}`;
        this._couponRedemptions.delete(key);
        return true;
    }

    // ---------------------------------------------------------------------
    // Settings / Notifications / CMS / Reviews / etc.
    // ---------------------------------------------------------------------
    async getSetting(key, defaultValue = null) {
        return this._settings.has(key) ? this._settings.get(key) : defaultValue;
    }
    async saveSetting(key, value) {
        this._settings.set(key, value);
        return { key, value };
    }
    async getNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
        let rows = this._notifications.filter(n => n.userId === userId);
        if (unreadOnly) rows = rows.filter(n => !n.readAt);
        return rows.slice(-limit);
    }
    async saveNotification(n) {
        const id = n.id || this._id('ntf');
        const saved = { id, readAt: null, createdAt: new Date().toISOString(), ...n };
        this._notifications.push(saved);
        return saved;
    }
    async getBlogPosts({ publishedOnly = false, limit = 100 } = {}) {
        let rows = Array.from(this._blogPosts.values());
        if (publishedOnly) rows = rows.filter(p => p.publishedAt);
        return rows.slice(-limit);
    }
    async getBlogPostBySlug(slug) {
        for (const p of this._blogPosts.values()) if (p.slug === slug) return p;
        return null;
    }
    async getBlogPostById(id) {
        return this._blogPosts.get(id) || null;
    }
    async saveBlogPost(id, data) {
        const existing = this._blogPosts.get(id);
        const saved = { id, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._blogPosts.set(id, saved);
        return saved;
    }
    async publishDueBlogPostsAtomic() { return []; }
    async deleteBlogPost(id) {
        this._blogPosts.delete(id);
        return true;
    }
    async getCustomPages() {
        return Array.from(this._customPages.values());
    }
    async getCustomPageBySlug(slug) {
        for (const p of this._customPages.values()) if (p.slug === slug) return p;
        return null;
    }
    async getCustomPageById(id) { return this._customPages.get(id) || null; }
    async saveCustomPage(id, data) {
        const existing = this._customPages.get(id);
        const saved = { id, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._customPages.set(id, saved);
        return saved;
    }
    async deleteCustomPage(id) { this._customPages.delete(id); return true; }
    async getTrustedBy() { return Array.from(this._trustedBy.values()); }
    async getTrustedById(id) { return this._trustedBy.get(id) || null; }
    async saveTrustedBy(id, data) {
        this._trustedBy.set(id, { id, ...data });
        return this._trustedBy.get(id);
    }
    async deleteTrustedBy(id) { this._trustedBy.delete(id); return true; }
    async getReviews({ approvedOnly = false, limit = 50 } = {}) {
        let rows = Array.from(this._reviews.values());
        if (approvedOnly) rows = rows.filter(r => r.approved);
        return rows.slice(-limit);
    }
    async getReview(id) { return this._reviews.get(id) || null; }
    async saveReview(id, data) {
        this._reviews.set(id, { id, approved: false, createdAt: new Date().toISOString(), ...data });
        return this._reviews.get(id);
    }
    async deleteReview(id) { this._reviews.delete(id); return true; }
    async getFavourites(userId) { return Array.from(this._favourites.get(userId) || []); }
    async addFavourite(userId, itemId) {
        if (!this._favourites.has(userId)) this._favourites.set(userId, new Set());
        this._favourites.get(userId).add(itemId);
        return true;
    }
    async removeFavourite(userId, itemId) {
        this._favourites.get(userId)?.delete(itemId);
        return true;
    }
    async isFavourite(userId, itemId) {
        return (this._favourites.get(userId) || new Set()).has(itemId);
    }
    async getStats() { return Object.fromEntries(this._stats); }
    async incrementStat(key, amount = 1) {
        const cur = this._stats.get(key) || 0;
        this._stats.set(key, cur + amount);
        return true;
    }
    async saveContactMessage(arg1, arg2) {
        const msg = (arg2 && typeof arg2 === 'object') ? { id: arg1, ...arg2 } : (arg1 || {});
        const saved = { id: msg.id || this._id('msg'), createdAt: new Date().toISOString(), ...msg };
        this._contactMessages.push(saved);
        return saved;
    }
    async getContactMessages() { return this._contactMessages.slice(); }
    async recordAdminAuditLog(entry) {
        this._adminAuditLogs.push({ id: this._id('adlog'), createdAt: new Date().toISOString(), ...entry });
        return true;
    }
    async getAdminAuditLogs({ limit = 100 } = {}) {
        return this._adminAuditLogs.slice(-limit);
    }
    async getAdminAuditLog(id) {
        return this._adminAuditLogs.find(l => l.id === id) || null;
    }
    async recordSecurityAuditLog(entry) {
        this._securityAuditLogs.push({ id: this._id('slog'), createdAt: new Date().toISOString(), ...entry });
        return true;
    }
    async getSecurityAuditLogs({ limit = 100 } = {}) {
        return this._securityAuditLogs.slice(-limit);
    }
    async getUserContentCounts(userId) {
        return {
            resumes: Array.from(this._resumes.values()).filter(r => r.userId === userId).length,
            covers: Array.from(this._covers.values()).filter(c => c.userId === userId).length,
            portfolios: Array.from(this._portfolios.values()).filter(p => p.userId === userId).length,
            jobs: Array.from(this._trackedJobs.values()).filter(j => j.userId === userId).length,
        };
    }
    async publishResume(userId, resumeId, { pbId, expectedRevision, expectedPublicationRevision }) {
        const r = this._resumes.get(resumeId);
        if (!r || r.userId !== userId) this._reject('Resume not found', 'NOT_FOUND', 404);
        const curRev = r.revision || 1;
        if (expectedRevision !== null && Number(expectedRevision) !== Number(curRev)) this._reject('Revision conflict', 'STALE_WRITE', 409);
        const pubRev = (r.publicationRevision || 0) + 1;
        if (expectedPublicationRevision !== null && expectedPublicationRevision !== undefined && Number(expectedPublicationRevision) !== Number(pubRev - 1)) {
            this._reject('Publication revision conflict', 'STALE_WRITE', 409);
        }
        r.isPublished = true;
        r.pbId = pbId || r.pbId || `pb_${resumeId}`;
        r.publicationRevision = pubRev;
        r.publishedAt = new Date().toISOString();
        return { publicationRevision: pubRev, pbId: r.pbId };
    }
    async unpublishResume(userId, resumeId, { expectedPublicationRevision = null } = {}) {
        const r = this._resumes.get(resumeId);
        if (!r || r.userId !== userId) return { isPublished: false, publicationRevision: 0 };
        if (expectedPublicationRevision !== null && Number(expectedPublicationRevision) !== Number(r.publicationRevision || 0)) this._reject('Stale publication revision', 'STALE_WRITE', 409);
        r.isPublished = false;
        r.publicationRevision = (r.publicationRevision || 0) + 1;
        return { isPublished: false, publicationRevision: r.publicationRevision };
    }
    async getPublicResume(resumeId) {
        const r = this._resumes.get(resumeId);
        if (!r || !r.isPublished) return null;
        const snapshot = { ...r };
        delete snapshot.userId;
        delete snapshot.user_id;
        delete snapshot.deleted_at;
        return {
            id: resumeId,
            ownerUid: r.userId || r.ownerUid || 'anonymous',
            isPublished: true,
            publicationMode: 'explicit',
            data: snapshot,
            sourceRevision: r.revision || 1,
            publicationRevision: r.publicationRevision || 1,
            publishedAt: r.publishedAt || new Date().toISOString(),
        };
    }
    async getResumePublication(userId, resumeId) {
        const r = this._resumes.get(resumeId);
        if (!r || r.userId !== userId) return { isPublished: false };
        return { isPublished: !!r.isPublished, publicationRevision: r.publicationRevision || 0, pbId: r.pbId || null };
    }

    // ---------------------------------------------------------------------
    // Documents / Exports (minimal, content stored in-memory as Buffer)
    // ---------------------------------------------------------------------
    async _assertCanonicalDocumentOwner(doc, userId) {
        if (!doc || doc.userId !== userId) this._reject('Document not found', 'NOT_FOUND', 404);
    }
    async listDocuments(userId, { kind } = {}) {
        let rows = Array.from(this._documents.values()).filter(d => d.userId === userId);
        if (kind) rows = rows.filter(d => d.kind === kind);
        return rows;
    }
    async getDocument(userId, documentId) {
        const d = this._documents.get(documentId);
        if (!d || d.userId !== userId) return null;
        return d;
    }
    async saveDocument(documentId, data = {}) {
        const existing = this._documents.get(documentId);
        const saved = { id: documentId, createdAt: existing?.createdAt || new Date().toISOString(), ...existing, ...data };
        this._documents.set(documentId, saved);
        return saved;
    }
    async deleteDocument(userId, documentId) {
        const d = this._documents.get(documentId);
        if (!d || d.userId !== userId) return 0;
        this._documents.delete(documentId);
        return 1;
    }
}

module.exports = InMemoryRepository;
