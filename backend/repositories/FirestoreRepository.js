const admin = require('../services/firebaseAdmin');
const crypto = require('crypto');
const { calculateContentHash } = require('../database/syncManager');

class FirestoreRepository {
    constructor(db) {
        this.db = db;
    }

    _ensureDb() {
        if (!this.db) {
            try {
                this.db = admin.firestore();
            } catch (e) {
                throw new Error('Firestore database instance is unavailable.');
            }
        }
        return this.db;
    }

    /**
     * Durable reverse-replication event (Firestore → MySQL standby).
     *
     * Every repository-mediated write appends an event document to the
     * `sync_outbox_fs` collection in the SAME transaction/batch as the data
     * write, so the standby database can never miss a committed change. The
     * background sync worker drains these events into MySQL with retry and
     * dead-letter handling; events survive process crashes because they are
     * committed alongside the data.
     */
    _buildReverseSyncEvent({ entityType, entityId, operation, payload, version }) {
        const plainPayload = JSON.parse(JSON.stringify(payload || {}));
        return {
            id: `evf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            entityType,
            entityId: String(entityId),
            operation: operation === 'DELETE' ? 'DELETE' : 'UPSERT',
            payload: plainPayload,
            version: Number(version || 1),
            contentHash: calculateContentHash(entityType, plainPayload),
            status: 'PENDING',
            attemptCount: 0,
            sourceEngine: 'firestore',
            createdAt: (this.db?.FieldValue || admin.firestore.FieldValue).serverTimestamp(),
            updatedAt: (this.db?.FieldValue || admin.firestore.FieldValue).serverTimestamp(),
        };
    }

    // ==========================================
    // 1. RESUMES
    // ==========================================
    async getResumes(userId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('resumes').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getResume(userId, resumeId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('resumes').doc(resumeId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async saveResume(userId, resumeId, data, { expectedRevision = null } = {}) {
        const db = this._ensureDb();
        const ref = db.collection('users').doc(userId).collection('resumes').doc(resumeId);

        let result = null;
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const existing = snap.exists ? snap.data() : {};
            const currentRev = Number(existing.revision) || 0;

            if (expectedRevision !== null && currentRev !== Number(expectedRevision)) {
                const conflict = new Error('Resume conflict: document updated in another session');
                conflict.code = 'RESUME_CONFLICT';
                conflict.remoteRevision = currentRev;
                throw conflict;
            }

            const nextRev = currentRev + 1;
            const now = admin.firestore.FieldValue.serverTimestamp();
            const payload = {
                ...data,
                revision: nextRev,
                created_at: existing.created_at || now,
                updatedAt: now,
            };

            tx.set(ref, payload, { merge: true });
            // Reverse-replication event committed atomically with the data.
            tx.set(
                db.collection('sync_outbox_fs').doc(),
                this._buildReverseSyncEvent({
                    entityType: 'resumes',
                    entityId: resumeId,
                    operation: 'UPSERT',
                    payload: { ...data, id: resumeId, user_id: userId, revision: nextRev },
                    version: nextRev,
                }),
            );
            result = { id: resumeId, revision: nextRev, ...payload };
        });

        return result;
    }

    async deleteResume(userId, resumeId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('users').doc(userId).collection('resumes').doc(resumeId));
        batch.delete(db.collection('pb').doc(resumeId));
        batch.delete(db.collection('users').doc(userId).collection('favourites').doc(resumeId));
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'resumes',
                entityId: resumeId,
                operation: 'DELETE',
                payload: { id: resumeId, user_id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return true;
    }

    async publishResume(userId, resumeId, data, { expectedRevision = null, expectedPublicationRevision = null } = {}) {
        const db = this._ensureDb();
        const ownerRef = db.collection('users').doc(userId).collection('resumes').doc(resumeId);
        const pbRef = db.collection('pb').doc(resumeId);
        
        let result = null;
        await db.runTransaction(async tx => {
            const [ownerSnap, pbSnap] = await Promise.all([tx.get(ownerRef), tx.get(pbRef)]);
            if (!ownerSnap.exists) throw new Error('Resume not found');
            
            const sourceRev = Number(ownerSnap.data()?.revision || 0);
            const pubRev = Number(pbSnap.data()?.publicationRevision || 0);
            
            if (expectedRevision !== null && sourceRev !== Number(expectedRevision)) {
                const err = new Error('Resume modified before publication');
                err.code = 'RESUME_CONFLICT';
                throw err;
            }
            if (expectedPublicationRevision !== null && pubRev !== Number(expectedPublicationRevision)) {
                const err = new Error('Publication link modified in another session');
                err.code = 'RESUME_PUBLICATION_CONFLICT';
                throw err;
            }

            const nextPubRev = pubRev + 1;
            const payload = {
                id: resumeId,
                ownerUid: userId,
                isPublished: true,
                publicationMode: 'explicit',
                object: typeof data === 'string' ? data : JSON.stringify(data || ownerSnap.data()),
                sourceRevision: sourceRev,
                publicationRevision: nextPubRev,
                publishedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            tx.set(pbRef, payload);
            result = { resumeId, isPublished: true, sourceRevision: sourceRev, publicationRevision: nextPubRev };
        });

        return result;
    }

    async unpublishResume(userId, resumeId, { expectedPublicationRevision = null } = {}) {
        const db = this._ensureDb();
        const ref = db.collection('pb').doc(resumeId);
        let pubRev = 0;
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            if (snap.data()?.ownerUid !== userId) throw new Error('Access denied');
            const current = Number(snap.data()?.publicationRevision || 0);
            if (expectedPublicationRevision !== null && current !== Number(expectedPublicationRevision)) {
                const err = new Error('Publication link modified in another session');
                err.code = 'RESUME_PUBLICATION_CONFLICT';
                throw err;
            }
            pubRev = current + 1;
            tx.set(ref, {
                isPublished: false,
                publicationRevision: pubRev,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        return { isPublished: false, publicationRevision: pubRev };
    }

    async getPublicResume(resumeId) {
        const db = this._ensureDb();
        const snap = await db.collection('pb').doc(resumeId).get();
        if (!snap.exists) return null;
        const data = snap.data();
        return {
            id: snap.id,
            ownerUid: data.ownerUid,
            isPublished: data.isPublished === true,
            publicationMode: data.publicationMode,
            data: typeof data.object === 'string' ? JSON.parse(data.object) : data.object,
            sourceRevision: data.sourceRevision,
            publicationRevision: data.publicationRevision,
            publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        };
    }

    async getResumePublication(userId, resumeId) {
        const db = this._ensureDb();
        const snap = await db.collection('pb').doc(resumeId).get();
        if (!snap.exists || snap.data()?.ownerUid !== userId) return { isPublished: false };
        const data = snap.data();
        return {
            isPublished: data.isPublished === true && data.publicationMode === 'explicit',
            publicationRevision: Number(data.publicationRevision || 0),
            sourceRevision: Number(data.sourceRevision || 0),
        };
    }

    // ==========================================
    // 2. USERS
    // ==========================================
    async getUser(userId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async getUserByEmail(email) {
        const db = this._ensureDb();
        const snap = await db.collection('users').where('email', '==', String(email).trim().toLowerCase()).limit(1).get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    async getUsers(options = {}) {
        const db = this._ensureDb();
        let query = db.collection('users');
        if (options.limit) query = query.limit(Number(options.limit));
        const snap = await query.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveUser(userId, userData) {
        const db = this._ensureDb();
        const ref = db.collection('users').doc(userId);
        const payload = {
            ...userData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'users',
                entityId: userId,
                operation: 'UPSERT',
                payload: { ...userData, id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return { id: userId, ...payload };
    }

    async deleteUser(userId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('users').doc(userId));
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'users',
                entityId: userId,
                operation: 'DELETE',
                payload: { id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return true;
    }

    // ==========================================
    // 3. PORTFOLIOS
    // ==========================================
    async getPortfolios(userId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('portfolios').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getPortfolio(userId, portfolioId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('portfolios').doc(portfolioId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async savePortfolio(userId, portfolioId, data) {
        const db = this._ensureDb();
        const ref = db.collection('users').doc(userId).collection('portfolios').doc(portfolioId);
        const payload = {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'portfolios',
                entityId: portfolioId,
                operation: 'UPSERT',
                payload: { ...data, id: portfolioId, user_id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return { id: portfolioId, ...payload };
    }

    async deletePortfolio(userId, portfolioId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('users').doc(userId).collection('portfolios').doc(portfolioId));
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'portfolios',
                entityId: portfolioId,
                operation: 'DELETE',
                payload: { id: portfolioId, user_id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return true;
    }

    // ==========================================
    // 4. COVER LETTERS
    // ==========================================
    async getCovers(userId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('covers').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getCover(userId, coverId) {
        const db = this._ensureDb();
        const snap = await db.collection('users').doc(userId).collection('covers').doc(coverId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async saveCover(userId, coverId, data) {
        const db = this._ensureDb();
        const ref = db.collection('users').doc(userId).collection('covers').doc(coverId);
        const payload = {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'covers',
                entityId: coverId,
                operation: 'UPSERT',
                payload: { ...data, id: coverId, user_id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return { id: coverId, ...payload };
    }

    async deleteCover(userId, coverId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('users').doc(userId).collection('covers').doc(coverId));
        batch.set(
            db.collection('sync_outbox_fs').doc(),
            this._buildReverseSyncEvent({
                entityType: 'covers',
                entityId: coverId,
                operation: 'DELETE',
                payload: { id: coverId, user_id: userId },
                version: 1,
            }),
        );
        await batch.commit();
        return true;
    }

    // ==========================================
    // 5. JOBS & APPLICATIONS
    // ==========================================
    async getJobs(filters = {}) {
        const db = this._ensureDb();
        let q = db.collection('jobs');
        if (filters.status) q = q.where('status', '==', filters.status);
        if (filters.employerId) q = q.where('employerId', '==', filters.employerId);
        if (filters.limit) q = q.limit(Number(filters.limit));
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getJob(jobId) {
        const db = this._ensureDb();
        const snap = await db.collection('jobs').doc(jobId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async saveJob(jobId, data) {
        const db = this._ensureDb();
        const ref = db.collection('jobs').doc(jobId);
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'jobs', entityId: jobId, operation: 'UPSERT',
            payload: { ...data, id: jobId, revision }, version: revision,
        }));
        await batch.commit();
        return { id: jobId, ...payload };
    }

    async deleteJob(jobId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('jobs').doc(jobId));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'jobs', entityId: jobId, operation: 'DELETE',
            payload: { id: jobId }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    async getApplications(filters = {}) {
        const db = this._ensureDb();
        let q = db.collection('applications');
        if (filters.jobId) q = q.where('jobId', '==', filters.jobId);
        if (filters.applicantId) q = q.where('applicantId', '==', filters.applicantId);
        if (filters.employerId) q = q.where('employerId', '==', filters.employerId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveApplication(appId, data) {
        const db = this._ensureDb();
        const ref = db.collection('applications').doc(appId);
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'applications', entityId: appId, operation: 'UPSERT',
            payload: { ...data, id: appId, revision }, version: revision,
        }));
        await batch.commit();
        return { id: appId, ...payload };
    }

    // ==========================================
    // 6. BLOG
    // ==========================================
    async getBlogPosts(options = {}) {
        const db = this._ensureDb();
        let q = db.collection('blog');
        if (options.publishedOnly) q = q.where('published', '==', true);
        if (options.limit) q = q.limit(Number(options.limit));
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getBlogPostBySlug(slug) {
        const db = this._ensureDb();
        const snap = await db.collection('blog').where('slug', '==', slug).limit(1).get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    async saveBlogPost(id, data) {
        const db = this._ensureDb();
        const ref = db.collection('blog').doc(id);
        const revision = Number(data.revision || 1);
        const fv = (this.db && this.db.FieldValue) || (admin && admin.firestore && admin.firestore.FieldValue);
        const serverTs = (fv && typeof fv.serverTimestamp === 'function') ? fv.serverTimestamp() : new Date().toISOString();
        const payload = { ...data, revision, updatedAt: serverTs };
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        // CMS historically wrote `blog_posts`; keep both documents in sync so
        // Super Admin CMS and public blog-data share one canonical entity.
        batch.set(db.collection('blog_posts').doc(id), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'blog', entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision,
        }));
        await batch.commit();
        return { id, ...payload };
    }

    async deleteBlogPost(id) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('blog').doc(id));
        batch.delete(db.collection('blog_posts').doc(id));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'blog', entityId: id, operation: 'DELETE',
            payload: { id }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    // ==========================================
    // 7. CUSTOM PAGES, TRUSTED BY, REVIEWS
    // ==========================================
    async getCustomPages(options = {}) {
        const db = this._ensureDb();
        let q = db.collection('custom_pages');
        if (options.publishedOnly) q = q.where('published', '==', true);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getCustomPageBySlug(slug) {
        const db = this._ensureDb();
        const snap = await db.collection('custom_pages').where('slug', '==', slug).limit(1).get();
        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    async saveCustomPage(id, data) {
        const db = this._ensureDb();
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(db.collection('custom_pages').doc(id), payload, { merge: true });
        batch.set(db.collection('pages').doc(id), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'custom_pages', entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision,
        }));
        await batch.commit();
        return { id, ...payload };
    }

    async deleteCustomPage(id) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('custom_pages').doc(id));
        batch.delete(db.collection('pages').doc(id));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'custom_pages', entityId: id, operation: 'DELETE',
            payload: { id }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    async getTrustedBy() {
        const db = this._ensureDb();
        const snap = await db.collection('trusted_by').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveTrustedBy(id, data) {
        const db = this._ensureDb();
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision };
        const batch = db.batch();
        batch.set(db.collection('trusted_by').doc(id), payload, { merge: true });
        batch.set(db.collection('trustedBy').doc(id), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'trusted_by', entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision,
        }));
        await batch.commit();
        return { id, ...payload };
    }

    async deleteTrustedBy(id) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('trusted_by').doc(id));
        batch.delete(db.collection('trustedBy').doc(id));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'trusted_by', entityId: id, operation: 'DELETE',
            payload: { id }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    // ==========================================
    // 8. NOTIFICATIONS & CONTACT
    // ==========================================
    async getNotifications(userId) {
        const db = this._ensureDb();
        const snap = await db.collection('notifications').doc(userId).collection('userNotifications').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveNotification(userId, notifId, data) {
        const db = this._ensureDb();
        const ref = db.collection('notifications').doc(userId).collection('userNotifications').doc(notifId);
        const payload = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await ref.set(payload, { merge: true });
        return { id: notifId, ...payload };
    }

    async saveContactMessage(msgId, data) {
        const db = this._ensureDb();
        const ref = db.collection('contact').doc(msgId);
        const fv = (this.db && this.db.FieldValue) || (admin && admin.firestore && admin.firestore.FieldValue);
        const serverTs = (fv && typeof fv.serverTimestamp === 'function') ? fv.serverTimestamp() : new Date().toISOString();
        const payload = { ...data, createdAt: serverTs };
        await ref.set(payload, { merge: true });
        return { id: msgId, ...payload };
    }

    async getContactMessages() {
        const db = this._ensureDb();
        const snap = await db.collection('contact').get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // ==========================================
    // 9. SYSTEM SETTINGS & STATS
    // ==========================================
    async getSetting(category) {
        const db = this._ensureDb();
        const snap = await db.collection('settings').doc(category).get();
        return snap.exists ? snap.data() : null;
    }

    async saveSetting(category, data, revision = 1) {
        const db = this._ensureDb();
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(db.collection('settings').doc(category), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'settings', entityId: category, operation: 'UPSERT',
            payload: { ...data, category, revision }, version: revision,
        }));
        await batch.commit();
        return { category, data, revision };
    }

    async getStats() {
        const db = this._ensureDb();
        const snap = await db.collection('data').doc('stats').get();
        return snap.exists ? snap.data() : {};
    }

    async incrementStat(statKey, delta = 1) {
        const db = this._ensureDb();
        const ref = db.collection('data').doc('stats');
        await ref.set({
            [statKey]: admin.firestore.FieldValue.increment(delta)
        }, { merge: true });
        return true;
    }

    // ==========================================
    // 10. AUDIT LOGS, SECURITY EVENTS & USER 360 AGGREGATES
    // ==========================================
    async recordAdminAuditLog(data) {
        const db = this._ensureDb();
        const id = data.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const payload = {
            ...data,
            id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('admin_audit_logs').doc(id).set(payload);
        return payload;
    }

    async getAdminAuditLogs(options = {}) {
        const db = this._ensureDb();
        let query = db.collection('admin_audit_logs');
        if (options.actorUid) query = query.where('actorUid', '==', options.actorUid);
        if (options.resourceId) query = query.where('resourceId', '==', options.resourceId);
        if (options.category && options.category !== 'all') query = query.where('category', '==', options.category);
        if (options.severity && options.severity !== 'all') query = query.where('severity', '==', options.severity);
        if (options.outcome && options.outcome !== 'all') query = query.where('outcome', '==', options.outcome);
        
        try {
            query = query.orderBy('createdAt', 'desc');
        } catch (_) {}

        const limit = Math.min(Math.max(Number(options.limit || options.pageSize || 50), 1), 200);
        query = query.limit(limit);

        const snap = await query.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async recordSecurityAuditLog(data) {
        const db = this._ensureDb();
        const id = data.id || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const payload = {
            ...data,
            id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('security_audit_logs').doc(id).set(payload);
        return payload;
    }

    async getSecurityAuditLogs(options = {}) {
        const db = this._ensureDb();
        let query = db.collection('security_audit_logs');
        if (options.actorUid) query = query.where('actorUid', '==', options.actorUid);
        if (options.targetUid) query = query.where('targetUid', '==', options.targetUid);
        if (options.severity && options.severity !== 'all') query = query.where('severity', '==', options.severity);

        try {
            query = query.orderBy('createdAt', 'desc');
        } catch (_) {}

        const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
        query = query.limit(limit);

        const snap = await query.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getUserContentCounts(userId) {
        const db = this._ensureDb();
        try {
            const [resumesSnap, portfoliosSnap, coversSnap] = await Promise.all([
                db.collection('users').doc(userId).collection('resumes').get().catch(() => ({ docs: [] })),
                db.collection('users').doc(userId).collection('portfolios').get().catch(() => ({ docs: [] })),
                db.collection('users').doc(userId).collection('coverLetters').get().catch(() => ({ docs: [] })),
            ]);
            return {
                resumeCount: resumesSnap.docs.length,
                portfolioCount: portfoliosSnap.docs.length,
                coverCount: coversSnap.docs.length,
            };
        } catch (_) {
            return { resumeCount: 0, portfolioCount: 0, coverCount: 0 };
        }
    }

    async getUserPaymentOrders(userId) {
        const db = this._ensureDb();
        try {
            let snap = await db.collection('payment_orders').where('uid', '==', userId).limit(50).get();
            if (snap.empty) {
                snap = await db.collection('payment_orders').where('userId', '==', userId).limit(50).get();
            }
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (_) {
            return [];
        }
    }

    async getPaymentOrder(orderId) {
        const db = this._ensureDb();
        const snap = await db.collection('payment_orders').doc(orderId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async savePaymentOrder(orderId, data) {
        const db = this._ensureDb();
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(db.collection('payment_orders').doc(orderId), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'payment_orders', entityId: orderId, operation: 'UPSERT',
            payload: { ...data, id: orderId, revision }, version: revision,
        }));
        await batch.commit();
        return { id: orderId, ...payload };
    }

    async findPaymentOrderByProviderIntent(intentId) {
        const db = this._ensureDb();
        const snap = await db.collection('payment_orders').where('providerPaymentIntentId', '==', intentId).limit(1).get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async getCoupon(code) {
        const db = this._ensureDb();
        const snap = await db.collection('coupons').doc(String(code).toUpperCase()).get();
        return snap.exists ? { code: snap.id, ...snap.data() } : null;
    }

    async saveCoupon(code, data) {
        const db = this._ensureDb();
        const cCode = String(code).toUpperCase();
        const revision = Number(data.revision || 1);
        const payload = { ...data, code: cCode, revision };
        const batch = db.batch();
        batch.set(db.collection('coupons').doc(cCode), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'coupons', entityId: cCode, operation: 'UPSERT',
            payload: { ...data, code: cCode, revision }, version: revision,
        }));
        await batch.commit();
        return { code: cCode, ...payload };
    }

    async getCouponRedemption(redemptionId) {
        const db = this._ensureDb();
        const snap = await db.collection('coupon_redemptions').doc(redemptionId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async saveCouponRedemption(redemptionId, data) {
        const db = this._ensureDb();
        await db.collection('coupon_redemptions').doc(redemptionId).set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return { id: redemptionId, ...data };
    }

    async deleteCouponRedemption(redemptionId) {
        const db = this._ensureDb();
        await db.collection('coupon_redemptions').doc(redemptionId).delete();
        return true;
    }

    async getCompany(companyId) {
        const db = this._ensureDb();
        const snap = await db.collection('companies').doc(companyId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async getCompanies(filters = {}) {
        const db = this._ensureDb();
        let q = db.collection('companies');
        if (filters.employerId) q = q.where('employerId', '==', filters.employerId);
        const snap = await q.limit(Number(filters.limit || 200)).get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveCompany(companyId, data) {
        const db = this._ensureDb();
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(db.collection('companies').doc(companyId), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'companies', entityId: companyId, operation: 'UPSERT',
            payload: { ...data, id: companyId, revision }, version: revision,
        }));
        await batch.commit();
        return { id: companyId, ...payload };
    }

    async deleteCompany(companyId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('companies').doc(companyId));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'companies', entityId: companyId, operation: 'DELETE',
            payload: { id: companyId }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    async claimWebhookEvent(record) {
        const db = this._ensureDb();
        const ref = db.collection('payment_webhook_events').doc(String(record.eventId));
        try {
            await ref.create({
                ...record,
                claimedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { duplicate: false, record };
        } catch (err) {
            const already = err.code === 6 || /already exists/i.test(String(err.message || ''));
            if (!already) throw err;
            const snap = await ref.get();
            return { duplicate: true, existing: snap.exists ? { id: snap.id, ...snap.data() } : record };
        }
    }

    async getApplication(appId) {
        const db = this._ensureDb();
        let snap = await db.collection('applications').doc(appId).get();
        if (!snap.exists) snap = await db.collection('jobApplications').doc(appId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async deleteApplication(appId) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection('applications').doc(appId));
        batch.delete(db.collection('jobApplications').doc(appId));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType: 'applications', entityId: appId, operation: 'DELETE',
            payload: { id: appId }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    _collectionFor(entityType) {
        const map = {
            blog_categories: 'blog_categories',
            ads: 'ads',
            reviews: 'reviews',
            employer_applications: 'employerApplications',
            deletion_requests: 'deletion_requests',
            custom_pages: 'pages',
            trusted_by: 'trustedBy',
            landing: 'data',
            website_meta: 'data',
        };
        return map[entityType] || entityType;
    }

    async getDocument(entityType, id) {
        const db = this._ensureDb();
        const col = this._collectionFor(entityType);
        const docId = (entityType === 'landing' && !id) ? 'frontendstats' : (entityType === 'website_meta' && !id) ? 'meta' : id;
        const snap = await db.collection(col).doc(docId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async listDocuments(entityType, options = {}) {
        const db = this._ensureDb();
        const snap = await db.collection(this._collectionFor(entityType)).limit(Number(options.limit || 500)).get();
        return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    async saveDocument(entityType, id, data) {
        const db = this._ensureDb();
        const revision = Number(data.revision || 1);
        const payload = { ...data, revision, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const batch = db.batch();
        batch.set(db.collection(this._collectionFor(entityType)).doc(id), payload, { merge: true });
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType, entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision,
        }));
        await batch.commit();
        return { id, ...payload };
    }

    async deleteDocument(entityType, id) {
        const db = this._ensureDb();
        const batch = db.batch();
        batch.delete(db.collection(this._collectionFor(entityType)).doc(id));
        batch.set(db.collection('sync_outbox_fs').doc(), this._buildReverseSyncEvent({
            entityType, entityId: id, operation: 'DELETE',
            payload: { id }, version: 1,
        }));
        await batch.commit();
        return true;
    }

    async getReview(id) { return this.getDocument('reviews', id); }
    async saveReview(id, data) { return this.saveDocument('reviews', id, data); }
    async deleteReview(id) { return this.deleteDocument('reviews', id); }
}

module.exports = FirestoreRepository;
