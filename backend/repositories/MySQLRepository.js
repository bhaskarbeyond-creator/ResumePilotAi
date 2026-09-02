const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { queueEmailInTransaction } = require('../services/notificationOutbox');
const { billingSnapshotHash, issueCreditNoteInTransaction, issueInvoiceInTransaction } = require('../services/invoiceService');

function normalizeRefundReferenceType(value) {
    const type = String(value || 'PROVIDER').trim().toUpperCase();
    if (!['PROVIDER', 'AGGREGATE'].includes(type)) {
        throw Object.assign(new Error('Refund reference type is invalid'), { code: 'REFUND_REFERENCE_TYPE_INVALID', status: 409 });
    }
    return type;
}

function refundLedgerEntries(order, {
    providerRefundId,
    providerRefundStatus = 'COMPLETED',
    providerRefundReferenceType = 'PROVIDER',
    providerRefunds = [],
    requireFullAmount = false,
} = {}) {
    const reference = String(providerRefundId || '').replace(/\p{Cc}/gu, '').trim().slice(0, 255);
    const referenceType = normalizeRefundReferenceType(providerRefundReferenceType);
    const source = Array.isArray(providerRefunds) && providerRefunds.length
        ? providerRefunds
        : (reference ? [{
            id: reference,
            provider: order.provider,
            status: providerRefundStatus,
            amount: order.amount,
            currency: order.currency,
        }] : []);
    const entries = source.map(item => {
        const id = String(item?.id || item?.providerRefundId || '').replace(/\p{Cc}/gu, '').trim().slice(0, 255);
        const provider = String(item?.provider || order.provider || '').trim().toLowerCase().slice(0, 32);
        const status = String(item?.status || providerRefundStatus || '').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().slice(0, 32);
        const amount = Number(item?.amount ?? item?.amountMinor);
        const currency = String(item?.currency || '').trim().toUpperCase();
        if (!/^[A-Za-z0-9_-]{6,255}$/.test(id)
            || !['stripe', 'paypal', 'razorpay', 'paytm', 'phonepe'].includes(provider)
            || !status || !Number.isSafeInteger(amount) || amount <= 0
            || !/^[A-Z]{3}$/.test(currency) || currency !== String(order.currency || '').toUpperCase()) {
            throw Object.assign(new Error('Provider refund reference is invalid'), { code: 'PROVIDER_REFUND_MISMATCH', status: 409 });
        }
        return { id, provider, status, amount, currency };
    });
    if (new Set(entries.map(entry => `${entry.provider}\0${entry.id}`)).size !== entries.length) {
        throw Object.assign(new Error('Duplicate provider refund reference'), { code: 'PROVIDER_REFUND_DUPLICATE_REFERENCE', status: 409 });
    }
    if (referenceType === 'AGGREGATE') {
        if (!/^stripe_aggregate_[a-f0-9]{64}$/.test(reference) || entries.length < 2) {
            throw Object.assign(new Error('Aggregate refund reference is incomplete'), { code: 'REFUND_AGGREGATE_INVALID', status: 409 });
        }
    } else if (reference && (entries.length !== 1 || entries[0].id !== reference)) {
        throw Object.assign(new Error('Provider refund reference conflicts with its ledger row'), { code: 'REFUND_ID_CONFLICT', status: 409 });
    }
    if (requireFullAmount) {
        const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
        if (!Number.isSafeInteger(total) || total !== Number(order.amount)) {
            throw Object.assign(new Error('Provider refunds do not fully reverse the payment'), { code: 'PROVIDER_REFUND_MISMATCH', status: 409 });
        }
    }
    return { reference, referenceType, entries };
}

async function persistRefundReferenceLedger(connection, order, entries, { completed = false } = {}) {
    for (const entry of entries) {
        const [existingRows] = await connection.query(
            `SELECT payment_order_id, provider_status, amount_minor, currency
             FROM payment_refund_provider_references
             WHERE provider = ? AND provider_refund_id = ? FOR UPDATE`,
            [entry.provider, entry.id]
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (existing && (existing.payment_order_id !== order.id
            || Number(existing.amount_minor) !== entry.amount
            || String(existing.currency).toUpperCase() !== entry.currency)) {
            throw Object.assign(new Error('Provider refund reference belongs to different financial evidence'), {
                code: 'REFUND_REFERENCE_CONFLICT', status: 409,
            });
        }
        if (!existing) {
            await connection.query(
                `INSERT INTO payment_refund_provider_references
                   (payment_order_id, provider, provider_refund_id, provider_status, amount_minor, currency, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [order.id, entry.provider, entry.id, entry.status, entry.amount, entry.currency, completed ? new Date() : null]
            );
        } else if (!['SUCCEEDED', 'COMPLETED', 'PROCESSED'].includes(String(existing.provider_status).toUpperCase())) {
            await connection.query(
                `UPDATE payment_refund_provider_references
                 SET provider_status = ?, completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, NOW(3)) ELSE completed_at END
                 WHERE payment_order_id = ? AND provider = ? AND provider_refund_id = ?`,
                [entry.status, completed ? 1 : 0, order.id, entry.provider, entry.id]
            );
        }
    }
}

class MySQLRepository {
    constructor() {
        this.jsonResumeFields = [
            'employments', 'educations', 'skills', 'languages', 'hobbies',
            'projects', 'certifications', 'achievements', 'references',
            'customSections', 'sectionOrder', 'hiddenSections', 'completedSteps'
        ];
    }

    _getPool() {
        return getPool();
    }

    _parseJsonRow(row, jsonFields = []) {
        if (!row) return null;
        const copy = { ...row };
        for (const field of jsonFields) {
            if (copy[field] !== undefined && copy[field] !== null) {
                if (typeof copy[field] === 'string') {
                    try {
                        copy[field] = JSON.parse(copy[field]);
                    } catch (_e) {
                        copy[field] = Array.isArray(copy[field]) ? [] : {};
                    }
                }
            } else if (jsonFields.includes(field)) {
                copy[field] = [];
            }
        }
        return copy;
    }

    _resumeSnapshot(row) {
        const snapshot = this._parseJsonRow(row, this.jsonResumeFields);
        if (!snapshot) return null;
        snapshot.showPhoto = snapshot.showPhoto === 1 || snapshot.showPhoto === true;
        // Storage/ownership metadata is not resume content and must never be copied
        // into a public publication snapshot or conflict recovery payload.
        for (const key of ['user_id', 'deleted_at', 'created_at', 'updated_at']) delete snapshot[key];
        return snapshot;
    }

    _trackedJobValues(data = {}) {
        const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
        const allowedStatuses = new Set(['wishlist', 'applied', 'interview', 'offer', 'rejected']);
        const status = allowedStatuses.has(String(data.status || '').toLowerCase())
            ? String(data.status).toLowerCase()
            : 'wishlist';
        return {
            job_title: text(data.title || data.job_title, 160),
            company: text(data.company, 160),
            status,
            sort_order: Math.max(0, Math.min(Number.parseInt(data.order ?? data.sort_order, 10) || 0, 1_000_000)),
            location: text(data.location, 160),
            url: text(data.url, 1024),
            notes: text(data.notes, 4000),
            deadline: text(data.deadline, 10) || null,
        };
    }

    async _withTransaction(fn, maxRetries = 4) {
        const pool = this._getPool();
        let attempt = 0;
        while (attempt < maxRetries) {
            attempt++;
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const result = await fn(connection);
                await connection.commit();
                return result;
            } catch (err) {
                await connection.rollback().catch(() => {});
                const isDeadlock = err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213 || err.code === 'ER_LOCK_WAIT_TIMEOUT';
                if (isDeadlock && attempt < maxRetries) {
                    await new Promise(res => setTimeout(res, attempt * 20 + Math.floor(Math.random() * 20)));
                    continue;
                }
                throw err;
            } finally {
                connection.release();
            }
        }
    }

    // ==========================================
    // 1. RESUMES
    // ==========================================
    async getResumes(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC',
            [userId]
        );
        return rows.map(r => {
            const item = this._parseJsonRow(r, this.jsonResumeFields);
            item.showPhoto = item.showPhoto === 1 || item.showPhoto === true;
            return item;
        });
    }

    async getResume(userId, resumeId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM resumes WHERE id = ? AND user_id = ? LIMIT 1',
            [resumeId, userId]
        );
        if (!rows.length) return null;
        const item = this._parseJsonRow(rows[0], this.jsonResumeFields);
        item.showPhoto = item.showPhoto === 1 || item.showPhoto === true;
        return item;
    }

    async saveResume(userId, resumeId, data, { expectedRevision = null } = {}) {
        return this._withTransaction(async (connection) => {
            // Guarantee user row exists to satisfy the user_id foreign-key constraint.
            await connection.query(
                'INSERT IGNORE INTO users (id, email, revision) VALUES (?, ?, 1)',
                [userId, data.email || '']
            );

            // Ownership-collision guard (IDOR): the resume id is the primary
            // key, so an unguarded upsert would let a different user overwrite
            // (and silently re-own) somebody else's document. Lock the row by
            // id and refuse the write when it belongs to another owner —
            // returning the same shape as "not found" so existence is not
            // disclosed.
            const [ownerRows] = await connection.query(
                'SELECT user_id FROM resumes WHERE id = ? FOR UPDATE',
                [resumeId]
            );
            if (ownerRows.length && ownerRows[0].user_id !== userId) {
                const denied = new Error('Resume not found');
                denied.code = 'RESUME_NOT_FOUND';
                denied.status = 404;
                throw denied;
            }

            // The row (if any) is already locked FOR UPDATE by the id lookup
            // above, so reading its revision here is race-free.
            const existingRows = ownerRows.length
                ? (await connection.query('SELECT * FROM resumes WHERE id = ? AND user_id = ?', [resumeId, userId]))[0]
                : [];

            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            if (expectedRevision !== null && currentRev !== Number(expectedRevision)) {
                const conflict = new Error('Resume conflict: document updated in another session');
                conflict.code = 'RESUME_CONFLICT';
                conflict.status = 409;
                conflict.remoteRevision = currentRev;
                conflict.remoteData = existingRows.length ? this._resumeSnapshot(existingRows[0]) : null;
                throw conflict;
            }

            const nextRev = Math.max(currentRev + 1, Number(data.revision || 0));
            const values = {
                id: resumeId,
                user_id: userId,
                title: data.title || 'Untitled Resume',
                template: data.template || 'Cv1',
                revision: nextRev,
                firstname: data.firstname || '',
                lastname: data.lastname || '',
                email: data.email || '',
                phone: data.phone || '',
                occupation: data.occupation || '',
                country: data.country || '',
                city: data.city || '',
                address: data.address || '',
                postalcode: data.postalcode || '',
                website: data.website || '',
                linkedin: data.linkedin || '',
                github: data.github || '',
                photo: data.photo || null,
                showPhoto: data.showPhoto === false ? 0 : 1,
                summary: data.summary || '',
            };

            for (const f of this.jsonResumeFields) {
                values[f] = data[f] ? JSON.stringify(data[f]) : JSON.stringify([]);
            }

            const keys = Object.keys(values);
            const placeholders = keys.map(() => '?').join(', ');
            const updateClause = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            const columnList = keys.map(k => `\`${k}\``).join(', ');

            const sql = `INSERT INTO resumes (${columnList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`;
            await connection.query(sql, Object.values(values));


            // revision must reflect the stored value; a caller-supplied stale
            // `revision` in `data` must never mask the authoritative nextRev.
            return { id: resumeId, ...data, revision: nextRev, user_id: userId };
        });
    }

    async deleteResume(userId, resumeId) {
        return this._withTransaction(async (connection) => {
            // Owner-scoped delete: return 0 when the caller does not own the resume
            // so the route can answer 404 instead of disclosing another account's id.
            // Draft, publication, and favourite cleanup commit or roll back together.
            const [result] = await connection.query(
                'DELETE FROM resumes WHERE id = ? AND user_id = ?',
                [resumeId, userId]
            );
            if (!Number(result.affectedRows || 0)) return 0;
            await connection.query('DELETE FROM public_resumes WHERE id = ? AND owner_uid = ?', [resumeId, userId]);
            await connection.query(
                "DELETE FROM favourites WHERE item_id = ? AND user_id = ? AND item_type = 'resume'",
                [resumeId, userId]
            );
            return true;
        });
    }

    async publishResume(userId, resumeId, _clientData, { expectedRevision = null, expectedPublicationRevision = null } = {}) {
        const pool = this._getPool();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [resumeRows] = await connection.query(
                'SELECT * FROM resumes WHERE id = ? AND user_id = ? FOR UPDATE',
                [resumeId, userId]
            );
            if (!resumeRows.length) {
                const notFound = new Error('Resume not found');
                notFound.status = 404;
                notFound.code = 'RESUME_NOT_FOUND';
                throw notFound;
            }
            const sourceRev = Number(resumeRows[0].revision || 0);

            const [pbRows] = await connection.query(
                'SELECT * FROM public_resumes WHERE id = ? FOR UPDATE',
                [resumeId]
            );
            const pubRev = pbRows.length ? Number(pbRows[0].publication_revision || 0) : 0;

            if (expectedRevision !== null && sourceRev !== Number(expectedRevision)) {
                const err = new Error('Resume modified before publication');
                err.code = 'RESUME_CONFLICT';
                err.status = 409;
                err.remoteRevision = sourceRev;
                err.remoteData = this._resumeSnapshot(resumeRows[0]);
                throw err;
            }
            if (expectedPublicationRevision !== null && pubRev !== Number(expectedPublicationRevision)) {
                const err = new Error('Publication link modified in another session');
                err.code = 'RESUME_PUBLICATION_CONFLICT';
                err.status = 409;
                err.remoteRevision = pubRev;
                throw err;
            }

            const nextPubRev = pubRev + 1;
            // Publication is a projection of the locked authoritative draft. Never
            // publish an unsaved or client-substituted payload at a valid revision.
            const objectString = JSON.stringify(this._resumeSnapshot(resumeRows[0]));

            await connection.query(
                `INSERT INTO public_resumes (id, owner_uid, is_published, publication_mode, object, source_revision, publication_revision, published_at, updated_at)
                 VALUES (?, ?, 1, 'explicit', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE is_published = 1, publication_mode = 'explicit', object = VALUES(object), source_revision = VALUES(source_revision), publication_revision = VALUES(publication_revision), published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
                [resumeId, userId, objectString, sourceRev, nextPubRev]
            );

            await connection.commit();
            return { resumeId, isPublished: true, sourceRevision: sourceRev, publicationRevision: nextPubRev };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    async unpublishResume(userId, resumeId, { expectedPublicationRevision = null } = {}) {
        const pool = this._getPool();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            const [pbRows] = await connection.query('SELECT * FROM public_resumes WHERE id = ? FOR UPDATE', [resumeId]);
            if (!pbRows.length) return { isPublished: false, publicationRevision: 0 };
            if (pbRows[0].owner_uid !== userId) {
                const denied = new Error('Access denied');
                denied.status = 403;
                denied.code = 'ACCESS_DENIED';
                throw denied;
            }

            const current = Number(pbRows[0].publication_revision || 0);
            if (expectedPublicationRevision !== null && current !== Number(expectedPublicationRevision)) {
                const err = new Error('Publication link modified in another session');
                err.code = 'RESUME_PUBLICATION_CONFLICT';
                err.status = 409;
                err.remoteRevision = current;
                throw err;
            }

            const nextPubRev = current + 1;
            await connection.query(
                'UPDATE public_resumes SET is_published = 0, publication_revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [nextPubRev, resumeId]
            );

            await connection.commit();
            return { isPublished: false, publicationRevision: nextPubRev };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    async getPublicResume(resumeId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM public_resumes WHERE id = ? LIMIT 1', [resumeId]);
        if (!rows.length) return null;
        const r = rows[0];
        let parsed = null;
        try { parsed = JSON.parse(r.object); } catch (_e) { parsed = {}; }
        return {
            id: r.id,
            ownerUid: r.owner_uid,
            isPublished: r.is_published === 1,
            publicationMode: r.publication_mode,
            data: parsed,
            sourceRevision: r.source_revision,
            publicationRevision: r.publication_revision,
            publishedAt: r.published_at,
        };
    }

    async getResumePublication(userId, resumeId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM public_resumes WHERE id = ? AND owner_uid = ? LIMIT 1', [resumeId, userId]);
        if (!rows.length) return { isPublished: false };
        const r = rows[0];
        return {
            isPublished: r.is_published === 1 && r.publication_mode === 'explicit',
            publicationRevision: Number(r.publication_revision || 0),
            sourceRevision: Number(r.source_revision || 0),
        };
    }

    // ==========================================
    // 2. USERS
    // ==========================================
    _projectUserRow(r) {
        let extra = {};
        if (r.extra_data) {
            try { extra = typeof r.extra_data === 'string' ? JSON.parse(r.extra_data) : r.extra_data; } catch (_e) {}
        }
        return {
            ...r,
            id: r.id,
            userId: r.id,
            suspended: r.suspended === 1,
            cancellationRequested: r.cancellationRequested === 1,
            ...extra
        };
    }

    async getUser(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!rows.length) return null;
        return this._projectUserRow(rows[0]);
    }

    /**
     * Bounded batch profile read used by the administrative directory.
     * Returns rows in the same projection as getUser(); callers group by id.
     * A missing id simply has no row, exactly as a getUser() miss.
     *
     * The identifier list is deliberately capped: an unbounded `IN (...)` would
     * trade many small indexed lookups for one oversized statement whose plan and
     * packet size grow with the caller, so callers page instead of batching hard.
     */
    async getUsersByIds(userIds = []) {
        const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
            .map(value => String(value || '').trim())
            .filter(value => value.length > 0 && value.length <= 128))].slice(0, 200);
        if (!ids.length) return [];
        const pool = this._getPool();
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT * FROM users WHERE id IN (${placeholders})`,
            ids
        );
        return rows.map(r => this._projectUserRow(r));
    }

    async getUserByEmail(email) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [String(email).trim().toLowerCase()]);
        if (!rows.length) return null;
        return this.getUser(rows[0].id);
    }

    async getUsers(options = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM users ORDER BY created_at DESC';
        const params = [];
        if (options.limit) {
            sql += ' LIMIT ?';
            params.push(Number(options.limit));
        }
        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            ...r,
            userId: r.id,
            suspended: r.suspended === 1,
            cancellationRequested: r.cancellationRequested === 1,
        }));
    }

    async _upsertUser(connection, userId, userData, nextRev) {
        const knownUserCols = new Set([
                'id', 'email', 'firstname', 'lastname', 'displayName', 'photoUrl', 'avatarUrl',
                'phone', 'jobTitle', 'bio', 'city', 'country', 'website', 'membership',
                'membershipEnds', 'paymentStatus', 'lastPaymentGateway', 'lastPaymentOrderId',
                'role', 'suspended', 'revision', 'extra_data'
            ]);
            let storedExtra = userData.extra_data || {};
            if (typeof storedExtra === 'string') storedExtra = JSON.parse(storedExtra);
            if (!storedExtra || typeof storedExtra !== 'object' || Array.isArray(storedExtra)) storedExtra = {};
            const extraData = { ...storedExtra };
            for (const [k, v] of Object.entries(userData)) {
                if (!knownUserCols.has(k) && v !== undefined) extraData[k] = v;
            }

            const values = {
                id: userId,
                email: userData.email || '',
                firstname: userData.firstname || '',
                lastname: userData.lastname || '',
                displayName: userData.displayName || `${userData.firstname || ''} ${userData.lastname || ''}`.trim(),
                photoUrl: userData.photoUrl || userData.avatarUrl || null,
                avatarUrl: userData.avatarUrl || userData.photoUrl || null,
                phone: userData.phone || null,
                jobTitle: userData.jobTitle || null,
                bio: userData.bio || null,
                city: userData.city || null,
                country: userData.country || null,
                website: userData.website || null,
                membership: userData.membership || 'Basic',
                membershipEnds: (function canonicalizeMembershipEnds(value) {
                    if (!value) return null;
                    if (typeof value === 'string') return value;
                    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
                    if (typeof value.toISOString === 'function') {
                        try { return value.toISOString(); } catch { return String(value); }
                    }
                    return String(value);
                })(userData.membershipEnds),
                paymentStatus: userData.paymentStatus || 'INACTIVE',
                lastPaymentGateway: userData.lastPaymentGateway || null,
                lastPaymentOrderId: userData.lastPaymentOrderId || null,
                // Firebase Authentication owns platform role and disabled state.
                // Legacy users.role/users.suspended columns are intentionally not
                // written by profile persistence.
                revision: nextRev,
                extra_data: JSON.stringify(extraData),
            };

            const keys = Object.keys(values);
            const placeholders = keys.map(() => '?').join(', ');
            const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

            await connection.query(
                `INSERT INTO users (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
                Object.values(values)
            );

            return { id: userId, revision: nextRev, ...userData };
    }

    async _queueWelcomeForNewUser(connection, userId, userData, isNew) {
        if (!isNew) return;
        const recipient = String(userData.email || '').trim().toLowerCase();
        if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(recipient)) return;
        const displayName = String(userData.displayName || `${userData.firstname || ''} ${userData.lastname || ''}`.trim() || 'Valued Member').slice(0, 160);
        const configuredOrigin = String(process.env.PUBLIC_APP_ORIGIN || process.env.APP_URL || '').trim();
        const siteUrl = /^https:\/\/[^\s]+$/i.test(configuredOrigin) ? configuredOrigin.replace(/\/$/, '') : '';
        await queueEmailInTransaction(connection, {
            eventId: `user-welcome:${userId}`,
            recipient,
            templateType: 'welcome',
            vars: { candidate_name: displayName, user_name: displayName, site_url: siteUrl },
            metadata: { source: 'user_profile_created', uid: userId },
            idempotencyKey: `user-welcome:${userId}`,
        });
    }

    async saveUser(userId, userData) {
        return this._withTransaction(async (connection) => {
            const [existingRows] = await connection.query('SELECT revision FROM users WHERE id = ? FOR UPDATE', [userId]);
            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            const nextRev = Number(userData.revision || currentRev + 1);
            const saved = await this._upsertUser(connection, userId, userData, nextRev);
            await this._queueWelcomeForNewUser(connection, userId, userData, existingRows.length === 0);
            return saved;
        });
    }

    /**
     * Optimistic-concurrency user profile save. Reads the current revision
     * inside the transaction (FOR UPDATE) and fails with PROFILE_CONFLICT
     * when it does not match `expectedRevision`, so two tabs/devices can
     * never silently overwrite each other. MySQL is the authoritative store.
     */
    async saveUserWithRevisionGuard(userId, userData, expectedRevision = null) {
        return this._withTransaction(async (connection) => {
            const [existingRows] = await connection.query('SELECT revision FROM users WHERE id = ? FOR UPDATE', [userId]);
            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            if (expectedRevision !== null && expectedRevision !== undefined && Number(currentRev) !== Number(expectedRevision)) {
                const error = new Error('Profile changed in another tab or device.');
                error.code = 'PROFILE_CONFLICT';
                error.status = 409;
                error.remoteRevision = currentRev;
                throw error;
            }
            const nextRev = currentRev + 1;
            const saved = await this._upsertUser(connection, userId, userData, nextRev);
            await this._queueWelcomeForNewUser(connection, userId, userData, existingRows.length === 0);
            return saved;
        });
    }

    async deleteUser(userId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        return true;
    }

    // ==========================================
    // 3. PORTFOLIOS
    // ==========================================
    _portfolioProjection(row) {
        if (!row) return null;
        const parsed = this._parseJsonRow(row, ['data']);
        const document = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {};
        const contentData = document.data && typeof document.data === 'object' && !Array.isArray(document.data) ? document.data : document;
        const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
            ? document.metadata
            : { description: document.description || '', tags: Array.isArray(document.tags) ? document.tags : [], seoTitle: document.seoTitle || '', seoDescription: document.seoDescription || '' };
        return {
            ...document,
            data: contentData,
            metadata,
            id: parsed.id,
            userId: parsed.user_id,
            title: parsed.title,
            theme: parsed.theme,
            slug: parsed.slug || document.slug || null,
            isPublished: parsed.is_published === 1 || parsed.is_published === true,
            revision: Number(parsed.revision || 1),
            publishedAt: parsed.published_at || null,
            createdAt: parsed.created_at || null,
            updatedAt: parsed.updated_at || null,
        };
    }

    /** Public records are an explicit allowlist, never a subtraction from the
     * owner projection. In particular, userId, revision, drafts and database
     * timestamps cannot cross the anonymous API boundary. */
    _publicPortfolioProjection(row, { summary = false } = {}) {
        if (!row) return null;
        const parsed = this._parseJsonRow(row, ['data']);
        const document = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {};
        const sourceData = document.data && typeof document.data === 'object' && !Array.isArray(document.data)
            ? document.data
            : document;
        const embeddedData = {
            content: Array.isArray(sourceData.content) ? sourceData.content : [],
            root: sourceData.root && typeof sourceData.root === 'object' ? sourceData.root : { props: {} },
            renderer: sourceData.renderer,
            templateKey: sourceData.templateKey,
            template: sourceData.template,
            canonical: sourceData.canonical && typeof sourceData.canonical === 'object' ? sourceData.canonical : null,
        };
        const metadataSource = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
            ? document.metadata
            : {
                description: document.description,
                tags: document.tags,
                seoTitle: document.seoTitle,
                seoDescription: document.seoDescription,
            };
        const metadata = {
            description: typeof metadataSource.description === 'string' ? metadataSource.description.slice(0, 10_000) : '',
            tags: Array.isArray(metadataSource.tags) ? metadataSource.tags.filter(tag => typeof tag === 'string').slice(0, 50).map(tag => tag.slice(0, 100)) : [],
            seoTitle: typeof metadataSource.seoTitle === 'string' ? metadataSource.seoTitle.slice(0, 300) : '',
            seoDescription: typeof metadataSource.seoDescription === 'string' ? metadataSource.seoDescription.slice(0, 1_000) : '',
        };
        const publicData = summary
            ? {
                renderer: embeddedData.renderer === 'webcv' ? 'webcv' : 'puck',
                templateKey: typeof embeddedData.templateKey === 'string' ? embeddedData.templateKey.slice(0, 100) : '',
                template: typeof embeddedData.template === 'string' ? embeddedData.template.slice(0, 100) : '',
            }
            : embeddedData;
        return {
            id: parsed.id,
            title: String(parsed.title || document.title || 'Portfolio').slice(0, 160),
            theme: String(parsed.theme || document.theme || 'default').slice(0, 50),
            slug: parsed.slug,
            isPublished: true,
            publishedAt: parsed.published_at || null,
            metadata,
            data: publicData,
        };
    }

    async getPortfolios(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM portfolios WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
        return rows.map(row => this._portfolioProjection(row));
    }

    async getPortfolio(userId, portfolioId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1', [portfolioId, userId]);
        return this._portfolioProjection(rows[0]);
    }

    async getPublishedPortfolioBySlug(slug) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM portfolios WHERE slug = ? AND is_published = 1 LIMIT 1',
            [slug]
        );
        return this._publicPortfolioProjection(rows[0]);
    }

    async getPublishedPortfolios(limit = 50, theme = null) {
        const pool = this._getPool();
        const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
        const normalizedTheme = typeof theme === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(theme) ? theme : null;
        const [rows] = await pool.query(
            `SELECT * FROM portfolios WHERE is_published = 1 AND slug IS NOT NULL${normalizedTheme ? ' AND theme = ?' : ''}
             ORDER BY published_at DESC, updated_at DESC LIMIT ${boundedLimit}`,
            normalizedTheme ? [normalizedTheme] : []
        );
        return rows.map(row => this._publicPortfolioProjection(row, { summary: true }));
    }

    async savePortfolio(userId, portfolioId, data, { expectedRevision } = {}) {
        return this._withTransaction(async (connection) => {
            const [userRows] = await connection.query(
                'SELECT email, displayName, firstname FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
                [userId]
            );
            if (!userRows.length) {
                const missing = new Error('Portfolio owner profile not found');
                missing.code = 'PROFILE_NOT_FOUND';
                missing.status = 409;
                throw missing;
            }

            const [ownerRows] = await connection.query(
                'SELECT user_id, slug, is_published, revision, published_at FROM portfolios WHERE id = ? FOR UPDATE',
                [portfolioId]
            );
            if (ownerRows.length && ownerRows[0].user_id !== userId) {
                const denied = new Error('Portfolio not found');
                denied.code = 'PORTFOLIO_NOT_FOUND';
                denied.status = 404;
                throw denied;
            }
            const currentRevision = ownerRows.length ? Number(ownerRows[0].revision || 1) : 0;
            if (!Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision) !== currentRevision) {
                const conflict = new Error('Portfolio changed in another tab or device.');
                conflict.code = 'PORTFOLIO_CONFLICT';
                conflict.status = 409;
                conflict.remoteRevision = currentRevision;
                throw conflict;
            }

            const title = String(data.title || 'Untitled Portfolio').replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) || 'Untitled Portfolio';
            const wasPublished = ownerRows[0]?.is_published === 1 || ownerRows[0]?.is_published === true;
            const isPublished = data.isPublished === true || data.is_published === true;
            const suppliedSlug = String(data.slug || '').trim().toLowerCase();
            const slugBase = (suppliedSlug || title.toLowerCase())
                .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 130) || 'portfolio';
            const generatedSlug = `${slugBase}-${crypto.createHash('sha256').update(String(portfolioId)).digest('hex').slice(0, 8)}`;
            const slug = isPublished ? (ownerRows[0]?.slug || generatedSlug) : (ownerRows[0]?.slug || null);
            const nextRevision = currentRevision + 1;
            const document = { ...data };
            delete document.userId;
            delete document.revision;
            delete document.createdAt;
            delete document.updatedAt;
            document.slug = slug;
            document.isPublished = isPublished;

            try {
                await connection.query(
                    `INSERT INTO portfolios
                       (id, user_id, title, slug, theme, is_published, revision, published_at, data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       title = VALUES(title), slug = VALUES(slug), theme = VALUES(theme),
                       is_published = VALUES(is_published), revision = VALUES(revision),
                       published_at = VALUES(published_at), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
                    [portfolioId, userId, title, slug, String(data.theme || 'modern').slice(0, 50), isPublished ? 1 : 0,
                        nextRevision, isPublished ? (ownerRows[0]?.published_at || new Date()) : null, JSON.stringify(document)]
                );
            } catch (error) {
                if (error?.code === 'ER_DUP_ENTRY') {
                    error.code = 'PORTFOLIO_SLUG_CONFLICT';
                    error.status = 409;
                }
                throw error;
            }

            if (isPublished && !wasPublished) {
                const owner = userRows[0];
                await queueEmailInTransaction(connection, {
                    eventId: `portfolio-published:${portfolioId}:${nextRevision}`,
                    recipient: owner.email,
                    templateType: 'portfolio_published',
                    vars: {
                        candidate_name: owner.displayName || owner.firstname || 'Portfolio owner',
                        portfolio_slug: slug,
                    },
                    metadata: { source: 'portfolio_publication', uid: userId, portfolioId },
                    idempotencyKey: `portfolio-published:${portfolioId}:${nextRevision}`,
                });
            }

            return { ...document, id: portfolioId, userId, title, slug, isPublished, revision: nextRevision };
        });
    }

    async deletePortfolio(userId, portfolioId, expectedRevision) {
        return this._withTransaction(async (connection) => {
            const [rows] = await connection.query(
                'SELECT revision FROM portfolios WHERE id = ? AND user_id = ? FOR UPDATE',
                [portfolioId, userId]
            );
            if (!rows.length) {
                const missing = new Error('Portfolio not found');
                missing.code = 'PORTFOLIO_NOT_FOUND';
                missing.status = 404;
                throw missing;
            }
            if (!Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision) !== Number(rows[0].revision || 1)) {
                const conflict = new Error('Portfolio changed in another tab or device.');
                conflict.code = 'PORTFOLIO_CONFLICT';
                conflict.status = 409;
                conflict.remoteRevision = Number(rows[0].revision || 1);
                throw conflict;
            }
            await connection.query('DELETE FROM portfolios WHERE id = ? AND user_id = ?', [portfolioId, userId]);
            return true;
        });
    }

    // ==========================================
    // 4. COVER LETTERS
    // ==========================================
    async getCovers(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM covers WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
        return rows.map(r => {
            const item = this._parseJsonRow(r, ['data']);
            return { id: r.id, ...(item.data || {}), title: r.title, template: r.template, updated_at: r.updated_at };
        });
    }

    async getCover(userId, coverId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM covers WHERE id = ? AND user_id = ? LIMIT 1', [coverId, userId]);
        if (!rows.length) return null;
        const item = this._parseJsonRow(rows[0], ['data']);
        return { id: rows[0].id, ...(item.data || {}), title: rows[0].title, template: rows[0].template };
    }

    async saveCover(userId, coverId, data) {
        const title = data.title || data.jobTitle || 'Untitled Cover Letter';
        const template = data.template || 'Cover1';
        const dataJson = JSON.stringify(data);

        await this._withTransaction(async (connection) => {
            await connection.query(
                'INSERT IGNORE INTO users (id, email, revision) VALUES (?, ?, 1)',
                [userId, data.email || '']
            );

            // Ownership-collision guard (IDOR): refuse to upsert over a cover
            // letter owned by a different user (see saveResume).
            const [ownerRows] = await connection.query(
                'SELECT user_id FROM covers WHERE id = ? FOR UPDATE',
                [coverId]
            );
            if (ownerRows.length && ownerRows[0].user_id !== userId) {
                const denied = new Error('Cover letter not found');
                denied.code = 'COVER_NOT_FOUND';
                denied.status = 404;
                throw denied;
            }

            await connection.query(
                `INSERT INTO covers (id, user_id, title, template, data, updated_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), template = VALUES(template), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
                [coverId, userId, title, template, dataJson]
            );

        });

        return { id: coverId, ...data };
    }

    async deleteCover(userId, coverId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM covers WHERE id = ? AND user_id = ?', [coverId, userId]);


        return true;
    }

    // ==========================================
    // 5. JOBS & APPLICATIONS
    // ==========================================
    async getJobs(filters = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM jobs WHERE 1=1';
        const params = [];
        // Public discovery is a repository-level invariant, not merely a route
        // convention. Draft, paused, expired, and deletion-marker statuses are
        // excluded even if a caller supplies a conflicting status parameter.
        if (filters.publicOnly) {
            sql += " AND LOWER(status) = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)";
        } else if (filters.status) {
            sql += ' AND LOWER(status) = LOWER(?)';
            params.push(filters.status);
        }
        if (filters.employerId) {
            sql += ' AND employer_id = ?';
            params.push(filters.employerId);
        }
        sql += ' ORDER BY created_at DESC';
        if (filters.limit) {
            const limit = Math.max(1, Math.min(Number.parseInt(filters.limit, 10) || 20, 100));
            sql += ' LIMIT ?';
            params.push(limit);
        }
        const [rows] = await pool.query(sql, params);
        return rows.map(r => this._parseJsonRow(r, ['requirements', 'skills']));
    }

    async getTrackedJobs(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            `SELECT id, job_title AS title, company, status, sort_order AS \`order\`, location,
                    url, notes, deadline, revision, created_at AS createdAt, updated_at AS updatedAt
             FROM job_tracker WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC`,
            [userId]
        );
        return rows.map(row => ({ ...row, revision: Number(row.revision || 1), order: Number(row.order || 0) }));
    }

    async createTrackedJob(userId, trackerId, data) {
        const values = this._trackedJobValues(data);
        if (!values.job_title || !values.company) {
            throw Object.assign(new Error('Job title and company are required.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        await this._getPool().query(
            `INSERT INTO job_tracker
             (id, user_id, job_title, company, status, revision, sort_order, location, url, notes, deadline)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
            [trackerId, userId, values.job_title, values.company, values.status, values.sort_order,
                values.location, values.url, values.notes, values.deadline]
        );
        return { id: trackerId, title: values.job_title, company: values.company, status: values.status,
            order: values.sort_order, location: values.location, url: values.url, notes: values.notes,
            deadline: values.deadline || '', revision: 1 };
    }

    async updateTrackedJob(userId, trackerId, data, { expectedRevision } = {}) {
        return this._withTransaction(async connection => {
            const [rows] = await connection.query(
                'SELECT * FROM job_tracker WHERE id = ? AND user_id = ? FOR UPDATE',
                [trackerId, userId]
            );
            if (!rows.length) throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
            const currentRevision = Number(rows[0].revision || 1);
            if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== currentRevision) {
                throw Object.assign(new Error('Tracked job changed in another tab or device.'), {
                    code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: currentRevision,
                });
            }
            const values = this._trackedJobValues({ ...rows[0], ...data });
            if (!values.job_title || !values.company) {
                throw Object.assign(new Error('Job title and company are required.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
            }
            const nextRevision = currentRevision + 1;
            await connection.query(
                `UPDATE job_tracker SET job_title = ?, company = ?, status = ?, sort_order = ?,
                    location = ?, url = ?, notes = ?, deadline = ?, revision = ?, updated_at = NOW()
                 WHERE id = ? AND user_id = ?`,
                [values.job_title, values.company, values.status, values.sort_order, values.location,
                    values.url, values.notes, values.deadline, nextRevision, trackerId, userId]
            );
            return { id: trackerId, title: values.job_title, company: values.company, status: values.status,
                order: values.sort_order, location: values.location, url: values.url, notes: values.notes,
                deadline: values.deadline || '', revision: nextRevision };
        });
    }

    async deleteTrackedJob(userId, trackerId, { expectedRevision } = {}) {
        return this._withTransaction(async connection => {
            const [rows] = await connection.query(
                'SELECT revision FROM job_tracker WHERE id = ? AND user_id = ? FOR UPDATE',
                [trackerId, userId]
            );
            if (!rows.length) throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
            const currentRevision = Number(rows[0].revision || 1);
            if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== currentRevision) {
                throw Object.assign(new Error('Tracked job changed in another tab or device.'), {
                    code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: currentRevision,
                });
            }
            await connection.query('DELETE FROM job_tracker WHERE id = ? AND user_id = ?', [trackerId, userId]);
            return true;
        });
    }

    async getJob(jobId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? LIMIT 1', [jobId]);
        if (!rows.length) return null;
        const row = this._parseJsonRow(rows[0], ['requirements', 'skills']);
        return { ...row, employerId: row.employer_id, companyId: row.company_id };
    }

    async saveJob(jobId, data) {
        const ownerId = String(data.employerId || data.employer_id || '');
        if (!ownerId) {
            throw Object.assign(new Error('Job owner is required'), { code: 'JOB_NOT_FOUND', status: 404 });
        }
        const values = {
            id: jobId,
            employer_id: ownerId,
            company_name: data.companyName || data.company_name || '',
            company_logo: data.companyLogo || data.company_logo || null,
            title: data.title || 'Untitled Job',
            description: data.description || '',
            requirements: JSON.stringify(data.requirements || []),
            location: data.location || '',
            job_type: data.jobType || data.job_type || 'Full-time',
            workplace_type: data.workplaceType || data.workplace_type || 'Remote',
            salary_min: data.salaryMin || data.salary_min || null,
            salary_max: data.salaryMax || data.salary_max || null,
            salary_currency: data.salaryCurrency || data.salary_currency || 'USD',
            experience_level: data.experienceLevel || data.experience_level || 'Mid',
            skills: JSON.stringify(data.skills || []),
            status: data.status || 'draft',
            featured: data.featured ? 1 : 0,
        };

        return this._withTransaction(async connection => {
            const [ownerRows] = await connection.query(
                'SELECT employer_id, revision FROM jobs WHERE id = ? FOR UPDATE',
                [jobId]
            );
            if (ownerRows.length && String(ownerRows[0].employer_id) !== ownerId) {
                throw Object.assign(new Error('Job not found'), { code: 'JOB_NOT_FOUND', status: 404 });
            }

            let revision = 1;
            if (ownerRows.length) {
                revision = Number(ownerRows[0].revision || 1) + 1;
                await connection.query(
                    `UPDATE jobs SET company_name = ?, company_logo = ?, title = ?, description = ?,
                        requirements = ?, location = ?, job_type = ?, workplace_type = ?, salary_min = ?,
                        salary_max = ?, salary_currency = ?, experience_level = ?, skills = ?, status = ?,
                        featured = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND employer_id = ?`,
                    [values.company_name, values.company_logo, values.title, values.description,
                        values.requirements, values.location, values.job_type, values.workplace_type,
                        values.salary_min, values.salary_max, values.salary_currency, values.experience_level,
                        values.skills, values.status, values.featured, revision, jobId, ownerId]
                );
            } else {
                const keys = Object.keys(values);
                const placeholders = keys.map(() => '?').join(', ');
                try {
                    await connection.query(
                        `INSERT INTO jobs (${keys.join(', ')}, revision) VALUES (${placeholders}, 1)`,
                        Object.values(values)
                    );
                } catch (error) {
                    if (error?.code === 'ER_DUP_ENTRY') {
                        throw Object.assign(new Error('Job not found'), { code: 'JOB_NOT_FOUND', status: 404 });
                    }
                    throw error;
                }
            }
            return { id: jobId, ...data, employerId: ownerId, employer_id: ownerId, revision };
        });
    }

    async deleteJob(jobId, ownerId) {
        if (!ownerId) return false;
        const [result] = await this._getPool().query(
            'DELETE FROM jobs WHERE id = ? AND employer_id = ?',
            [jobId, ownerId]
        );
        return Number(result?.affectedRows || 0) === 1;
    }

    async getApplications(filters = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM applications WHERE 1=1';
        const params = [];
        if (filters.jobId) { sql += ' AND job_id = ?'; params.push(filters.jobId); }
        if (filters.applicantId) { sql += ' AND applicant_id = ?'; params.push(filters.applicantId); }
        if (filters.employerId) { sql += ' AND employer_id = ?'; params.push(filters.employerId); }
        sql += ' ORDER BY created_at DESC';
        const [rows] = await pool.query(sql, params);
        return rows;
    }

    async saveApplication(appId, data) {
        const pool = this._getPool();
        let empId = data.employerId || data.employer_id;
        if (!empId && (data.jobId || data.job_id)) {
            const [jobRows] = await pool.query('SELECT employer_id FROM jobs WHERE id = ? LIMIT 1', [data.jobId || data.job_id]).catch(() => [[]]);
            if (jobRows && jobRows.length) empId = jobRows[0].employer_id;
        }

        const values = {
            id: appId,
            job_id: data.jobId || data.job_id,
            employer_id: empId || null,
            applicant_id: data.applicantId || data.applicant_id,
            applicant_name: data.applicantName || data.applicant_name || '',
            applicant_email: data.applicantEmail || data.applicant_email || '',
            applicant_phone: data.applicantPhone || data.applicant_phone || '',
            resume_id: data.resumeId || data.resume_id || null,
            resume_url: data.resumeUrl || data.resume_url || null,
            cover_letter: data.coverLetter || data.cover_letter || '',
            status: data.status || 'PENDING',
            rating: Number(data.rating || 0),
            notes: data.notes || '',
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO applications (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id: appId, ...data, employer_id: empId };
    }

    // ==========================================
    // 6. BLOG
    // ==========================================
    async getBlogPosts(options = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM blog WHERE 1=1';
        const params = [];
        if (options.publishedOnly) { sql += ' AND published = 1'; }
        sql += ' ORDER BY created_at DESC';
        if (options.limit) { sql += ' LIMIT ?'; params.push(Number(options.limit)); }
        const [rows] = await pool.query(sql, params);
        return rows.map(r => {
            const item = this._parseJsonRow(r, ['tags']);
            item.published = item.published === 1;
            return item;
        });
    }

    async getBlogPostBySlug(slug) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM blog WHERE slug = ? LIMIT 1', [slug]);
        if (!rows.length) return null;
        const item = this._parseJsonRow(rows[0], ['tags']);
        item.published = Number(item.published) === 1;
        return item;
    }

    async getBlogPostById(id) {
        const [rows] = await this._getPool().query('SELECT * FROM blog WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) return null;
        const item = this._parseJsonRow(rows[0], ['tags']);
        item.published = Number(item.published) === 1;
        item.revision = Number(item.revision || 1);
        return item;
    }

    async saveBlogPost(id, data) {
        const pool = this._getPool();
        const toMysqlDatetime = value => {
            if (!value) return null;
            const date = value instanceof Date ? value : new Date(value);
            if (!Number.isFinite(date.getTime())) return null;
            return date.toISOString().slice(0, 19).replace('T', ' ');
        };
        const values = {
            id,
            title: data.title || 'Untitled Post',
            slug: data.slug || `post-${Date.now()}`,
            content: data.content || '',
            excerpt: data.excerpt || '',
            cover_image: data.coverImage || data.cover_image || null,
            author: data.author || 'Admin',
            author_id: data.authorId || data.author_id || null,
            category: data.category || 'General',
            tags: JSON.stringify(data.tags || []),
            published: data.published ? 1 : 0,
            views: Number(data.views || 0),
            likes: Number(data.likes || 0),
            // Status & scheduling must persist so the CMS scheduler can
            // transition scheduled → approved and draft → published.
            status: String(data.status || (data.published ? 'approved' : 'draft')).toLowerCase(),
            // Explicit nulls must be honored (e.g. the CMS scheduler clearing
            // scheduledAt after publishing); never fall back to a stale field.
            scheduled_at: Object.hasOwn(data, 'scheduledAt')
                ? toMysqlDatetime(data.scheduledAt)
                : (Object.hasOwn(data, 'scheduled_at') ? toMysqlDatetime(data.scheduled_at) : null),
            published_at: Object.hasOwn(data, 'publishedAt')
                ? toMysqlDatetime(data.publishedAt)
                : (Object.hasOwn(data, 'published_at') ? toMysqlDatetime(data.published_at) : (data.published ? toMysqlDatetime(new Date()) : null)),
            revision: Number(data.revision || 1),
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO blog (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        const revision = Number(data.revision || 1);
        return { id, ...data, revision };
    }

    async publishDueBlogPostsAtomic({ actorUid = 'cms-scheduler', requestId = null } = {}) {
        const actor = String(actorUid || 'cms-scheduler').slice(0, 128);
        const request = requestId ? String(requestId).slice(0, 128) : null;
        return this._withTransaction(async connection => {
            const [duePosts] = await connection.query(
                `SELECT id, revision
                 FROM blog
                 WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
                 ORDER BY scheduled_at ASC, id ASC
                 LIMIT 200
                 FOR UPDATE`
            );
            let published = 0;
            for (const post of duePosts) {
                const revision = Number(post.revision || 0);
                const [result] = await connection.query(
                    `UPDATE blog
                     SET status = 'approved', published = 1, published_at = NOW(),
                         scheduled_at = NULL, revision = revision + 1, updated_at = NOW()
                     WHERE id = ? AND status = 'scheduled' AND revision = ?`,
                    [post.id, revision]
                );
                if (Number(result.affectedRows || 0) !== 1) {
                    throw Object.assign(new Error('Scheduled post changed while publication was being committed'), {
                        code: 'CMS_PUBLICATION_CONFLICT',
                        status: 409,
                    });
                }
                await connection.query(
                    `INSERT INTO security_audit_logs
                     (id, action, actor_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
                     VALUES (?, 'CMS_SCHEDULED_POST_PUBLISHED', ?, 'cms.publication', 'MEDIUM', 'blog_post', ?, ?, ?, NOW())`,
                    [crypto.randomUUID(), actor, post.id, JSON.stringify({ previousRevision: revision, revision: revision + 1 }), request]
                );
                published += 1;
            }
            return published;
        });
    }

    async deleteBlogPost(id, expectedRevision) {
        const revision = Number(expectedRevision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('The current blog-post revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const [result] = await this._getPool().query('DELETE FROM blog WHERE id = ? AND revision = ?', [id, revision]);
        if (Number(result.affectedRows) !== 1) {
            throw Object.assign(new Error('Blog post changed before it could be deleted.'), { code: 'CAS_CONFLICT', status: 409 });
        }
        return true;
    }

    // ==========================================
    // 7. CUSTOM PAGES, TRUSTED BY, REVIEWS
    // ==========================================
    _cmsConflict(message = 'This record changed after the page loaded.') {
        return Object.assign(new Error(message), { code: 'CAS_CONFLICT', status: 409 });
    }

    _customPageFromRow(row) {
        if (!row) return null;
        const published = Number(row.published) === 1;
        const storedStatus = String(row.status || (published ? 'published' : 'unpublished')).toLowerCase();
        const status = ['draft', 'published', 'unpublished'].includes(storedStatus)
            ? storedStatus
            : (published ? 'published' : 'unpublished');
        return {
            id: row.id,
            slug: row.slug,
            title: row.title,
            description: row.description || '',
            pagecontent: row.content || '',
            content: row.content || '',
            status,
            published,
            navOrder: Number(row.nav_order || 0),
            showInNav: Number(row.show_in_nav) === 1,
            showInFooter: Number(row.show_in_footer) === 1,
            revision: Number(row.revision || 1),
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
        };
    }

    async getCustomPages(options = {}) {
        const pool = this._getPool();
        const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
        let sql = 'SELECT * FROM custom_pages';
        const params = [];
        if (options.publishedOnly) sql += ' WHERE published = 1';
        sql += ' ORDER BY nav_order ASC, created_at DESC LIMIT ?';
        params.push(limit);
        const [rows] = await pool.query(sql, params);
        return rows.map(row => this._customPageFromRow(row));
    }

    async getCustomPageBySlug(slug, options = {}) {
        const pool = this._getPool();
        const publishedClause = options.publishedOnly ? ' AND published = 1' : '';
        const [rows] = await pool.query(`SELECT * FROM custom_pages WHERE slug = ?${publishedClause} LIMIT 1`, [slug]);
        return rows.length ? this._customPageFromRow(rows[0]) : null;
    }

    async getCustomPageById(id) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM custom_pages WHERE id = ? LIMIT 1', [id]);
        return rows.length ? this._customPageFromRow(rows[0]) : null;
    }

    async saveCustomPage(id, data) {
        const revision = Number(data.revision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('A positive custom-page revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const status = ['draft', 'published', 'unpublished'].includes(String(data.status || '').toLowerCase())
            ? String(data.status).toLowerCase()
            : (data.published === true ? 'published' : 'unpublished');
        const values = [
            String(data.title || '').slice(0, 255),
            String(data.slug || id).slice(0, 255),
            String(data.description || '').slice(0, 500),
            String(data.pagecontent ?? data.content ?? ''),
            status === 'published' ? 1 : 0,
            status,
            Number(data.navOrder ?? data.nav_order ?? 0),
            data.showInNav || data.show_in_nav ? 1 : 0,
            data.showInFooter || data.show_in_footer ? 1 : 0,
        ];
        const pool = this._getPool();
        if (revision > 1) {
            const [result] = await pool.query(
                `UPDATE custom_pages
                 SET title = ?, slug = ?, description = ?, content = ?, published = ?, status = ?, nav_order = ?,
                     show_in_nav = ?, show_in_footer = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND revision = ?`,
                [...values, revision, id, revision - 1]
            );
            if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Custom page changed after it was loaded.');
            return { id, ...data, revision };
        }
        try {
            await pool.query(
                `INSERT INTO custom_pages
                   (id, title, slug, description, content, published, status, nav_order, show_in_nav, show_in_footer, revision)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [id, ...values]
            );
            return { id, ...data, revision: 1 };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) throw this._cmsConflict('A custom page with this slug already exists.');
            throw error;
        }
    }

    async deleteCustomPage(id, expectedRevision) {
        const revision = Number(expectedRevision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('The current custom-page revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const [result] = await this._getPool().query('DELETE FROM custom_pages WHERE id = ? AND revision = ?', [id, revision]);
        if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Custom page changed before it could be deleted.');
        return true;
    }

    _trustedByFromRow(row) {
        if (!row) return null;
        const published = Number(row.active) === 1;
        return {
            id: row.id,
            name: row.name,
            imageUrl: row.logo_url || '',
            logoUrl: row.logo_url || '',
            websiteUrl: row.website_url || '',
            order: Number(row.display_order || 0),
            published,
            active: published,
            revision: Number(row.revision || 1),
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
        };
    }

    async getTrustedBy(options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
        const where = options.publishedOnly ? ' WHERE active = 1' : '';
        const [rows] = await this._getPool().query(
            `SELECT * FROM trusted_by${where} ORDER BY display_order ASC, name ASC LIMIT ?`,
            [limit]
        );
        return rows.map(row => this._trustedByFromRow(row));
    }

    async getTrustedById(id) {
        const [rows] = await this._getPool().query('SELECT * FROM trusted_by WHERE id = ? LIMIT 1', [id]);
        return rows.length ? this._trustedByFromRow(rows[0]) : null;
    }

    async saveTrustedBy(id, data) {
        const revision = Number(data.revision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('A positive trusted-logo revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const values = [
            String(data.name || '').slice(0, 255),
            String(data.imageUrl || data.logoUrl || data.logo_url || '').slice(0, 1024),
            String(data.websiteUrl || data.website_url || '').slice(0, 1024),
            Number(data.order ?? data.displayOrder ?? data.display_order ?? 0),
            data.published === false || data.active === false ? 0 : 1,
        ];
        const pool = this._getPool();
        if (revision > 1) {
            const [result] = await pool.query(
                `UPDATE trusted_by
                 SET name = ?, logo_url = ?, website_url = ?, display_order = ?, active = ?,
                     revision = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND revision = ?`,
                [...values, revision, id, revision - 1]
            );
            if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Trusted logo changed after it was loaded.');
            return { id, ...data, revision };
        }
        try {
            await pool.query(
                `INSERT INTO trusted_by
                   (id, name, logo_url, website_url, display_order, active, revision)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [id, ...values]
            );
            return { id, ...data, revision: 1 };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) throw this._cmsConflict('This trusted logo already exists.');
            throw error;
        }
    }

    async deleteTrustedBy(id, expectedRevision) {
        const revision = Number(expectedRevision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('The current trusted-logo revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const [result] = await this._getPool().query('DELETE FROM trusted_by WHERE id = ? AND revision = ?', [id, revision]);
        if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Trusted logo changed before it could be deleted.');
        return true;
    }

    _reviewFromRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            occupation: row.role || '',
            role: row.role || '',
            company: row.company || '',
            imageUrl: row.avatar || '',
            avatar: row.avatar || '',
            review: row.content || '',
            content: row.content || '',
            rating: Number(row.rating || 0),
            featured: Number(row.featured) === 1,
            status: String(row.status || 'APPROVED').toLowerCase(),
            revision: Number(row.revision || 1),
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
        };
    }

    async getReviews(options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
        const where = options.approvedOnly ? " WHERE UPPER(status) = 'APPROVED'" : '';
        const [rows] = await this._getPool().query(
            `SELECT * FROM reviews${where} ORDER BY created_at DESC LIMIT ?`,
            [limit]
        );
        return rows.map(row => this._reviewFromRow(row));
    }

    async getReview(id) {
        const [rows] = await this._getPool().query('SELECT * FROM reviews WHERE id = ? LIMIT 1', [id]);
        return rows.length ? this._reviewFromRow(rows[0]) : null;
    }

    async saveReview(id, data) {
        const revision = Number(data.revision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('A positive review revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const values = [
            String(data.name || '').slice(0, 255),
            String(data.occupation || data.role || '').slice(0, 255),
            String(data.company || '').slice(0, 255),
            String(data.imageUrl || data.avatar || '').slice(0, 1024),
            String(data.review || data.content || ''),
            Math.min(5, Math.max(1, Number(data.rating) || 5)),
            data.featured === true ? 1 : 0,
            String(data.status || 'approved').toUpperCase().slice(0, 50),
        ];
        const pool = this._getPool();
        if (revision > 1) {
            const [result] = await pool.query(
                `UPDATE reviews
                 SET name = ?, role = ?, company = ?, avatar = ?, content = ?, rating = ?, featured = ?,
                     status = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND revision = ?`,
                [...values, revision, id, revision - 1]
            );
            if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Review changed after it was loaded.');
            return { id, ...data, revision };
        }
        try {
            await pool.query(
                `INSERT INTO reviews
                   (id, name, role, company, avatar, content, rating, featured, status, revision)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [id, ...values]
            );
            return { id, ...data, revision: 1 };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) throw this._cmsConflict('This review already exists.');
            throw error;
        }
    }

    async deleteReview(id, expectedRevision) {
        const revision = Number(expectedRevision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('The current review revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const [result] = await this._getPool().query('DELETE FROM reviews WHERE id = ? AND revision = ?', [id, revision]);
        if (Number(result.affectedRows) !== 1) throw this._cmsConflict('Review changed before it could be deleted.');
        return true;
    }

    // ==========================================
    // 8. NOTIFICATIONS & CONTACT
    // ==========================================
    async getNotifications(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        return rows.map(r => {
            const item = this._parseJsonRow(r, ['data']);
            item.read = item.is_read === 1;
            return item;
        });
    }

    async saveNotification(userId, notifId, data) {
        const pool = this._getPool();
        const values = {
            id: notifId,
            user_id: userId,
            event_id: data.eventId || data.event_id || null,
            type: data.type || 'system',
            title: data.title || '',
            message: data.message || '',
            data: JSON.stringify(data.data || {}),
            is_read: data.read || data.is_read ? 1 : 0,
            state: data.state || 'NOTIFICATION_CREATED',
            delivery_state: data.deliveryState || data.delivery_state || 'NOT_REQUESTED',
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO notifications (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id: notifId, ...data };
    }

    async saveContactMessage(arg1, arg2) {
        const pool = this._getPool();
        const msgId = (arg2 && typeof arg2 === 'object') ? arg1 : (arg1?.id || `msg_${Date.now()}`);
        const data = (arg2 && typeof arg2 === 'object') ? arg2 : (arg1 || {});
        const values = {
            id: msgId,
            name: data.name || '',
            email: data.email || '',
            message: data.message || '',
            website: data.website || '',
            status: data.status || 'UNREAD',
            ip: data.ip || '',
            is_read: data.is_read ? 1 : 0,
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO contact_messages (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id: msgId, ...data };
    }

    async getContactMessages() {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        return rows.map(r => ({ ...r, is_read: r.is_read === 1 }));
    }

    // ==========================================
    // 9. SYSTEM SETTINGS & STATS
    // ==========================================
    async getSetting(category) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM system_settings WHERE category = ? LIMIT 1', [category]);
        if (!rows.length) return null;
        let data = {};
        try {
            data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        } catch (_e) {}
        return data;
    }

    async saveSetting(category, data, revision = 1) {
        const pool = this._getPool();
        const dataJson = JSON.stringify(data);
        await pool.query(
            `INSERT INTO system_settings (category, data, revision, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = CURRENT_TIMESTAMP`,
            [category, dataJson, revision]
        );
        return { category, data, revision };
    }

    // ==========================================
    // 9b. FAVOURITES (MySQL authoritative; formerly Firestore users/{uid}/favourites)
    // ==========================================
    async getFavourites(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT id, item_id, item_type, data, created_at FROM favourites WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows.map(r => {
            let payload = {};
            try { payload = r.data && typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); } catch { /* ignore */ }
            return {
                id: r.id,
                itemId: r.item_id,
                itemType: r.item_type,
                createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
                ...payload,
            };
        });
    }

    async addFavourite(userId, itemId, itemType = 'resume', data = {}) {
        const pool = this._getPool();
        const id = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await pool.query(
            `INSERT INTO favourites (id, user_id, item_id, item_type, data)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data)`,
            [id, userId, String(itemId), String(itemType).slice(0, 50), JSON.stringify(data || {})]
        );
        return { id, itemId, itemType, ...data };
    }

    async removeFavourite(userId, itemId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM favourites WHERE user_id = ? AND item_id = ?', [userId, String(itemId)]);
        return true;
    }

    async isFavourite(userId, itemId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT id FROM favourites WHERE user_id = ? AND item_id = ? LIMIT 1',
            [userId, String(itemId)]
        );
        return rows.length > 0;
    }

    async getStats() {
        const pool = this._getPool();
        const [rows] = await pool.query("SELECT data FROM stats WHERE id = 'global_stats' LIMIT 1");
        if (!rows.length) return {};
        try {
            const parsed = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
            return parsed;
        } catch (_error) {
            throw Object.assign(new Error('The operational statistics record is invalid.'), {
                code: 'STATS_RECORD_INVALID', status: 503,
            });
        }
    }

    async incrementStat(statKey, delta = 1) {
        const key = String(statKey || '');
        const increment = Number(delta);
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !Number.isSafeInteger(increment)) {
            throw Object.assign(new Error('A valid counter key and integer delta are required.'), {
                code: 'INVALID_STAT_INCREMENT', status: 400,
            });
        }
        return this._withTransaction(async connection => {
            const [rows] = await connection.query(
                "SELECT data FROM stats WHERE id = 'global_stats' FOR UPDATE"
            );
            let current = {};
            if (rows.length) {
                try {
                    current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
                    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('not an object');
                } catch (_error) {
                    throw Object.assign(new Error('The operational statistics record is invalid.'), {
                        code: 'STATS_RECORD_INVALID', status: 503,
                    });
                }
            }
            const previous = Number(current[key] || 0);
            const nextValue = previous + increment;
            if (!Number.isSafeInteger(previous) || !Number.isSafeInteger(nextValue)) {
                throw Object.assign(new Error('The operational counter is outside its supported range.'), {
                    code: 'STAT_COUNTER_OVERFLOW', status: 409,
                });
            }
            const next = { ...current, [key]: nextValue };
            await connection.query(
                `INSERT INTO stats (id, data, updated_at)
                 VALUES ('global_stats', ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
                [JSON.stringify(next)]
            );
            return { key, value: nextValue };
        });
    }

    // ==========================================
    // 10. AUDIT LOGS, SECURITY EVENTS & USER 360 AGGREGATES
    // ==========================================
    async recordAdminAuditLog(data) {
        const pool = this._getPool();
        const id = data.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const values = [
            id,
            data.actorUid || data.actor_uid || 'system',
            data.actorEmail || data.actor_email || null,
            data.actorRole || data.actor_role || 'ADMIN',
            data.action || 'ADMIN_ACTION',
            data.category || 'general',
            data.severity || 'INFO',
            data.outcome || 'SUCCESS',
            data.method || 'GET',
            data.pathname || null,
            data.statusCode || data.status_code || 200,
            data.resourceType || data.resource_type || null,
            data.resourceId || data.resource_id || null,
            JSON.stringify(data.metadata || {}),
            data.requestId || data.request_id || null,
        ];
        await pool.query(
            `INSERT INTO admin_audit_logs 
             (id, actor_uid, actor_email, actor_role, action, category, severity, outcome, method, pathname, status_code, resource_type, resource_id, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            values
        );
        return { id, ...data };
    }

    _mapAdminAuditLog(row) {
        if (!row) return null;
        let metadata = {};
        try {
            metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
        } catch (_) {
            metadata = {};
        }
        return {
            id: row.id,
            actorUid: row.actor_uid,
            actorEmail: row.actor_email,
            actorRole: row.actor_role,
            action: row.action,
            category: row.category,
            severity: row.severity,
            outcome: row.outcome,
            method: row.method,
            pathname: row.pathname,
            statusCode: row.status_code,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            metadata,
            requestId: row.request_id,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        };
    }

    async getAdminAuditLog(id) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM admin_audit_logs WHERE id = ? LIMIT 1', [id]);
        return this._mapAdminAuditLog(rows[0]);
    }

    async getAdminAuditLogs(options = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM admin_audit_logs WHERE 1=1';
        const params = [];

        if (options.actorUid) {
            sql += ' AND actor_uid = ?';
            params.push(options.actorUid);
        }
        if (options.resourceId) {
            sql += ' AND resource_id = ?';
            params.push(options.resourceId);
        }
        if (options.category && options.category !== 'all') {
            sql += ' AND category = ?';
            params.push(options.category);
        }
        if (options.severity && options.severity !== 'all') {
            sql += ' AND severity = ?';
            params.push(options.severity);
        }
        if (options.outcome && options.outcome !== 'all') {
            sql += ' AND outcome = ?';
            params.push(options.outcome);
        }
        if (options.action) {
            sql += ' AND action = ?';
            params.push(options.action);
        }
        if (options.search) {
            sql += ` AND LOWER(CONCAT_WS(' ', id, actor_uid, actor_email, actor_role, action,
                       category, severity, outcome, method, pathname, resource_type,
                       resource_id, request_id, CAST(metadata AS CHAR))) LIKE ?`;
            params.push(`%${String(options.search).trim().toLowerCase()}%`);
        }
        if (options.startAfterDocId) {
            const [cursorRows] = await pool.query(
                'SELECT id, created_at FROM admin_audit_logs WHERE id = ? LIMIT 1',
                [options.startAfterDocId]
            );
            if (!cursorRows.length) {
                throw Object.assign(new Error('Audit cursor does not exist'), { code: 'INVALID_AUDIT_CURSOR', status: 400 });
            }
            sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
            params.push(cursorRows[0].created_at, cursorRows[0].created_at, cursorRows[0].id);
        }

        sql += ' ORDER BY created_at DESC, id DESC';
        const limit = Math.min(Math.max(Number(options.limit || options.pageSize || 50), 1), 201);
        sql += ' LIMIT ?';
        params.push(limit);

        const [rows] = await pool.query(sql, params);
        return rows.map(row => this._mapAdminAuditLog(row));
    }

    async recordSecurityAuditLog(data) {
        const pool = this._getPool();
        const id = data.id || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const values = [
            id,
            data.actorUid || data.actor_uid || 'system',
            data.targetUid || data.target_uid || null,
            data.action || 'SECURITY_EVENT',
            data.category || 'iam.users',
            data.severity || 'MEDIUM',
            data.targetType || data.target_type || 'USER',
            data.targetId || data.target_id || null,
            JSON.stringify(data.changes || null),
            JSON.stringify(data.metadata || null),
            data.requestId || data.request_id || null,
        ];
        await pool.query(
            `INSERT INTO security_audit_logs 
             (id, actor_uid, target_uid, action, category, severity, target_type, target_id, changes, metadata, request_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            values
        );
        return { id, ...data };
    }

    async getSecurityAuditLogs(options = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM security_audit_logs WHERE 1=1';
        const params = [];

        if (options.actorUid) {
            sql += ' AND actor_uid = ?';
            params.push(options.actorUid);
        }
        if (options.targetUid) {
            sql += ' AND target_uid = ?';
            params.push(options.targetUid);
        }
        if (options.severity && options.severity !== 'all') {
            sql += ' AND severity = ?';
            params.push(options.severity);
        }

        sql += ' ORDER BY created_at DESC';
        const limit = Math.min(Math.max(Number(options.limit || 50), 1), 200);
        sql += ' LIMIT ?';
        params.push(limit);

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            actorUid: r.actor_uid,
            targetUid: r.target_uid,
            action: r.action,
            category: r.category,
            severity: r.severity,
            targetType: r.target_type,
            targetId: r.target_id,
            changes: typeof r.changes === 'string' ? JSON.parse(r.changes || 'null') : r.changes,
            metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || 'null') : r.metadata,
            requestId: r.request_id,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        }));
    }

    async getUserContentCounts(userId) {
        const pool = this._getPool();
        const [resumeRows] = await pool.query('SELECT COUNT(*) as c FROM resumes WHERE user_id = ?', [userId]);
        const [portfolioRows] = await pool.query('SELECT COUNT(*) as c FROM portfolios WHERE user_id = ?', [userId]);
        const [coverRows] = await pool.query('SELECT COUNT(*) as c FROM covers WHERE user_id = ?', [userId]);
        return {
            resumeCount: resumeRows[0]?.c || 0,
            portfolioCount: portfolioRows[0]?.c || 0,
            coverCount: coverRows[0]?.c || 0,
        };
    }

    async getUserPaymentOrders(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM payment_orders WHERE uid = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        return rows.map(r => ({
            id: r.id,
            orderId: r.id,
            uid: r.uid,
            planId: r.plan_id,
            provider: r.provider,
            amount: r.amount,
            originalAmount: r.original_amount,
            currency: r.currency,
            couponCode: r.coupon_code,
            couponDiscount: r.coupon_discount,
            status: r.status,
            membershipEnds: r.membership_ends,
            providerPaymentId: r.provider_payment_id,
            providerRefundId: r.provider_refund_id || null,
            providerRefundReferenceType: r.provider_refund_reference_type || null,
            providerRefundStatus: r.provider_refund_status || null,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        }));
    }

    _paymentOrderProjection(r) {
        if (!r) return null;
        return {
            id: r.id,
            uid: r.uid,
            planId: r.plan_id,
            provider: r.provider,
            amount: r.amount,
            originalAmount: r.original_amount,
            currency: r.currency,
            couponCode: r.coupon_code,
            couponDiscount: r.coupon_discount,
            singleUsePerUser: r.single_use_per_user === 1,
            status: r.status,
            membershipEnds: r.membership_ends,
            providerPaymentId: r.provider_payment_id,
            providerOrderId: r.provider_order_id,
            providerPaymentIntentId: r.provider_payment_intent_id,
            providerClientSecret: r.provider_client_secret,
            failureCode: r.failure_code,
            activatedAt: r.activated_at,
            reversedAt: r.reversed_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            revision: Number(r.revision || 1),
            mutationId: r.mutation_id || null,
            recoveryNeeded: r.recovery_needed === 1 || r.recovery_needed === true,
            recoveryReason: r.recovery_reason || null,
            lastPaymentGateway: r.last_payment_gateway || null,
            providerRefundId: r.provider_refund_id || null,
            refundClaimId: r.refund_claim_id || null,
            refundClaimedAt: r.refund_claimed_at || null,
            refundReason: r.refund_reason || null,
            refundRequestedBy: r.refund_requested_by || null,
            refundRequestedAt: r.refund_requested_at || null,
            refundAttempt: Number(r.refund_attempt || 0),
            refundIdempotencyKey: r.refund_idempotency_key || null,
            providerRefundStatus: r.provider_refund_status || null,
            providerRefundUpdatedAt: r.provider_refund_updated_at || null,
            providerRefundReferenceType: r.provider_refund_reference_type || null,
            billingSnapshot: r.billing_snapshot || null,
            supplierSnapshot: r.supplier_snapshot || null,
            billingSnapshotHash: r.billing_snapshot_hash || null,
            billingSnapshotVersion: r.billing_snapshot_version == null ? null : Number(r.billing_snapshot_version),
        };
    }

    async getPaymentOrder(orderId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM payment_orders WHERE id = ? LIMIT 1', [orderId]);
        return this._paymentOrderProjection(rows[0]);
    }

    async savePaymentOrder(orderId, data) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(orderId || ''))) {
            throw Object.assign(new Error('Payment order id is invalid'), { code: 'INVALID_PAYMENT_ORDER', status: 400 });
        }
        const parseSnapshot = value => {
            if (!value) return null;
            if (typeof value === 'string') {
                try { return JSON.parse(value); } catch { return null; }
            }
            return typeof value === 'object' && !Array.isArray(value) ? value : null;
        };
        const customerSnapshot = parseSnapshot(data.billingSnapshot ?? data.billing_snapshot);
        const supplierSnapshot = parseSnapshot(data.supplierSnapshot ?? data.supplier_snapshot);
        const snapshotHash = String(data.billingSnapshotHash || data.billing_snapshot_hash || '');
        const snapshotVersion = data.billingSnapshotVersion ?? data.billing_snapshot_version ?? null;
        const hasVersionedSnapshot = Number(snapshotVersion) === 1
            && customerSnapshot && supplierSnapshot
            && /^[a-f0-9]{64}$/.test(snapshotHash)
            && billingSnapshotHash(customerSnapshot, supplierSnapshot) === snapshotHash;
        const values = {
            id: orderId,
            uid: String(data.uid || ''),
            plan_id: String(data.planId || data.plan_id || ''),
            provider: String(data.provider || '').toLowerCase(),
            amount: Number(data.amount),
            original_amount: Number(data.originalAmount ?? data.original_amount ?? data.amount),
            currency: String(data.currency || '').toUpperCase(),
            coupon_code: data.couponCode || data.coupon_code || null,
            coupon_discount: Number(data.couponDiscount || data.coupon_discount || 0),
            single_use_per_user: data.singleUsePerUser ? 1 : 0,
            status: data.status || 'PENDING_PAYMENT',
            membership_ends: data.membershipEnds ? (data.membershipEnds.toISOString ? data.membershipEnds.toISOString() : String(data.membershipEnds)) : null,
            provider_payment_id: data.providerPaymentId || data.provider_payment_id || null,
            provider_order_id: data.providerOrderId || data.provider_order_id || null,
            provider_payment_intent_id: data.providerPaymentIntentId || data.provider_payment_intent_id || null,
            provider_client_secret: data.providerClientSecret || data.provider_client_secret || null,
            failure_code: data.failureCode || data.failure_code || null,
            revision: Number(data.revision || 1),
            mutation_id: data.mutationId || data.mutation_id || null,
            recovery_needed: data.recoveryNeeded ? 1 : 0,
            recovery_reason: data.recoveryReason || data.recovery_reason || null,
            last_payment_gateway: data.lastPaymentGateway || data.last_payment_gateway || null,
            provider_refund_id: data.providerRefundId || data.provider_refund_id || null,
            refund_claim_id: data.refundClaimId || data.refund_claim_id || null,
            refund_claimed_at: data.refundClaimedAt || data.refund_claimed_at || null,
            refund_reason: data.refundReason || data.refund_reason || null,
            refund_requested_by: data.refundRequestedBy || data.refund_requested_by || null,
            refund_requested_at: data.refundRequestedAt || data.refund_requested_at || null,
            refund_attempt: Number(data.refundAttempt || data.refund_attempt || 0),
            refund_idempotency_key: data.refundIdempotencyKey || data.refund_idempotency_key || null,
            provider_refund_status: data.providerRefundStatus || data.provider_refund_status || null,
            provider_refund_updated_at: data.providerRefundUpdatedAt || data.provider_refund_updated_at || null,
            provider_refund_reference_type: data.providerRefundReferenceType || data.provider_refund_reference_type || null,
            billing_snapshot: hasVersionedSnapshot ? JSON.stringify(customerSnapshot) : null,
            supplier_snapshot: hasVersionedSnapshot ? JSON.stringify(supplierSnapshot) : null,
            billing_snapshot_hash: hasVersionedSnapshot ? snapshotHash : null,
            billing_snapshot_version: hasVersionedSnapshot ? 1 : null,
        };
        if (!values.uid || !['monthly', 'halfYear', 'yearly'].includes(values.plan_id)
            || !['stripe', 'paypal', 'razorpay', 'paytm', 'phonepe'].includes(values.provider)
            || !Number.isSafeInteger(values.amount) || values.amount <= 0
            || !Number.isSafeInteger(values.original_amount) || values.original_amount < values.amount
            || !/^[A-Z]{3}$/.test(values.currency)) {
            throw Object.assign(new Error('Payment order identity is invalid'), { code: 'PAYMENT_ORDER_INVALID', status: 400 });
        }

        return this._withTransaction(async connection => {
            const [existingRows] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            const existing = existingRows[0];
            if (!existing && !hasVersionedSnapshot) {
                throw Object.assign(new Error('Immutable billing evidence is required for a new payment order'), {
                    code: 'BILLING_SNAPSHOT_REQUIRED', status: 400,
                });
            }
            if (existing) {
                const immutableIdentityChanged = existing.uid !== values.uid
                    || existing.plan_id !== values.plan_id
                    || String(existing.provider).toLowerCase() !== values.provider
                    || Number(existing.amount) !== values.amount
                    || String(existing.currency).toUpperCase() !== values.currency;
                if (immutableIdentityChanged) {
                    throw Object.assign(new Error('Payment order identity cannot be changed'), { code: 'PAYMENT_ORDER_IDENTITY_CONFLICT', status: 409 });
                }
                const existingVersion = existing.billing_snapshot_version == null ? null : Number(existing.billing_snapshot_version);
                const existingHash = String(existing.billing_snapshot_hash || '');
                if ((existingVersion === 1 && (!hasVersionedSnapshot || existingHash !== snapshotHash))
                    || (existingVersion == null && hasVersionedSnapshot)) {
                    throw Object.assign(new Error('Payment billing evidence is immutable'), { code: 'BILLING_SNAPSHOT_CONFLICT', status: 409 });
                }
                if (Number(values.revision) !== Number(existing.revision || 0) + 1) {
                    throw Object.assign(new Error('Payment order changed concurrently'), { code: 'PAYMENT_ORDER_CHANGED', status: 409 });
                }
                if (existingVersion == null) {
                    values.billing_snapshot = null;
                    values.supplier_snapshot = null;
                    values.billing_snapshot_hash = null;
                    values.billing_snapshot_version = null;
                }
            } else if (values.revision !== 1) {
                throw Object.assign(new Error('A new payment order must begin at revision 1'), { code: 'PAYMENT_ORDER_REVISION_INVALID', status: 409 });
            }

            const keys = Object.keys(values);
            const placeholders = keys.map(() => '?').join(', ');
            const updateClause = keys.filter(key => key !== 'id').map(key => `${key} = VALUES(${key})`).join(', ');
            await connection.query(
                `INSERT INTO payment_orders (${keys.join(', ')}) VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
                Object.values(values)
            );
            return { id: orderId, revision: values.revision, ...data };
        });
    }

    /**
     * Atomically activates a verified payment, grants membership, consumes the
     * coupon redemption, creates the in-app notification, and records a durable
     * security event. Row locks and revision predicates make concurrent provider
     * callbacks idempotent without a process-local ledger.
     */
    async activatePaymentOrderAtomic({ orderId, gatewayLabel, providerPaymentId = null, mutationId }) {
        return this._withTransaction(async connection => {
            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!orders.length) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            const order = orders[0];
            const durationByPlan = { monthly: 1, halfYear: 6, yearly: 12 };
            const months = durationByPlan[order.plan_id];
            if (!months) {
                throw Object.assign(new Error('Payment order has an unsupported plan'), { code: 'INVALID_PLAN_DURATION', status: 409 });
            }
            if (order.status === 'ACTIVE') {
                if (providerPaymentId && order.provider_payment_id && order.provider_payment_id !== providerPaymentId) {
                    throw Object.assign(new Error('Order is active under a different provider payment id'), { code: 'PAYMENT_ID_CONFLICT', status: 409 });
                }
                // Versioned orders have a strict activation+invoice invariant. A
                // duplicate provider event verifies/repairs only that same immutable
                // invoice inside this transaction. Pre-migration active orders are
                // reported as legacy rather than reconstructed from current data.
                const invoiceResult = Number(order.billing_snapshot_version) === 1
                    ? await issueInvoiceInTransaction(connection, { order, actorUid: 'payment-provider' })
                    : null;
                return {
                    id: order.id, uid: order.uid, planId: order.plan_id, status: 'ACTIVE',
                    membershipEnds: order.membership_ends, providerPaymentId: order.provider_payment_id,
                    revision: Number(order.revision || 1), mutationId: order.mutation_id,
                    invoice: invoiceResult?.invoice || null,
                    invoiceStatus: invoiceResult ? 'ISSUED' : 'LEGACY_NOT_CAPTURED',
                    duplicate: true,
                };
            }
            if (!['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED'].includes(order.status)) {
                throw Object.assign(new Error('Payment order is not activatable'), { code: 'INVALID_ORDER_STATE', status: 409 });
            }
            if (Number(order.billing_snapshot_version) !== 1) {
                throw Object.assign(new Error('Immutable billing details were not captured before provider payment'), {
                    code: 'BILLING_SNAPSHOT_MISSING', status: 409,
                });
            }
            const [users] = await connection.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [order.uid]);
            if (!users.length) throw Object.assign(new Error('Payment user not found'), { code: 'PAYMENT_USER_NOT_FOUND', status: 404 });
            const user = users[0];
            const existingEndMs = Date.parse(user.membershipEnds || '');
            const start = Number.isFinite(existingEndMs) && existingEndMs > Date.now() ? new Date(existingEndMs) : new Date();
            const end = new Date(start);
            end.setMonth(end.getMonth() + months);
            const membershipEnds = end.toISOString();
            const paid = ['premium', 'pro', 'business', 'enterprise', 'paid'].includes(String(user.membership || '').toLowerCase());
            const membership = paid ? user.membership : 'Premium';
            const nextOrderRevision = Number(order.revision || 1) + 1;
            const nextUserRevision = Number(user.revision || 1) + 1;

            const [orderUpdate] = await connection.query(
                `UPDATE payment_orders
                 SET status = 'ACTIVE', membership_ends = ?, provider_payment_id = ?, last_payment_gateway = ?,
                     activated_at = NOW(), revision = ?, mutation_id = ?, recovery_needed = 0,
                     recovery_reason = NULL, updated_at = NOW()
                 WHERE id = ? AND revision = ?`,
                [membershipEnds, providerPaymentId || order.provider_payment_id || null, gatewayLabel || null,
                    nextOrderRevision, mutationId, orderId, Number(order.revision || 1)]
            );
            if (Number(orderUpdate.affectedRows || 0) !== 1) throw Object.assign(new Error('Payment order changed concurrently'), { code: 'PAYMENT_ORDER_CHANGED', status: 409 });
            const [userUpdate] = await connection.query(
                `UPDATE users
                 SET membership = ?, membershipEnds = ?, paymentStatus = 'ACTIVE', lastPaymentGateway = ?,
                     lastPaymentOrderId = ?, lastPaymentAmount = ?, lastPaymentCurrency = ?, lastPaymentDate = NOW(),
                     cancellationRequested = 0, revision = ?, updated_at = NOW()
                 WHERE id = ? AND revision = ?`,
                [membership, membershipEnds, gatewayLabel || null, orderId, Number(order.amount || 0),
                    order.currency || 'INR', nextUserRevision, order.uid, Number(user.revision || 1)]
            );
            if (Number(userUpdate.affectedRows || 0) !== 1) throw Object.assign(new Error('Payment user changed concurrently'), { code: 'PAYMENT_USER_CHANGED', status: 409 });

            if (order.coupon_code) {
                const scope = order.single_use_per_user ? order.uid : orderId;
                const redemptionId = crypto.createHash('sha256').update(`${order.coupon_code}:${scope}`).digest('hex');
                const [redemptions] = await connection.query('SELECT status FROM coupon_redemptions WHERE id = ? FOR UPDATE', [redemptionId]);
                const alreadyUsed = redemptions[0]?.status === 'USED';
                await connection.query(
                    `INSERT INTO coupon_redemptions (id, uid, coupon_code, order_id, status, used_at)
                     VALUES (?, ?, ?, ?, 'USED', NOW())
                     ON DUPLICATE KEY UPDATE status = 'USED', used_at = COALESCE(used_at, NOW()), order_id = VALUES(order_id)`,
                    [redemptionId, order.uid, order.coupon_code, orderId]
                );
                if (!alreadyUsed) {
                    await connection.query('UPDATE coupons SET used_count = used_count + 1, revision = revision + 1, updated_at = NOW() WHERE code = ?', [order.coupon_code]);
                }
            }

            const invoiceResult = await issueInvoiceInTransaction(connection, {
                order: {
                    ...order,
                    status: 'ACTIVE',
                    provider_payment_id: providerPaymentId || order.provider_payment_id || null,
                },
                actorUid: 'payment-provider',
            });

            const notificationId = crypto.createHash('sha256').update(`payment_active\0${orderId}`).digest('hex');
            await connection.query(
                `INSERT INTO notifications (id, user_id, event_id, type, title, message, data, is_read, state, delivery_state)
                 VALUES (?, ?, ?, 'payment_active', 'Payment confirmed',
                         'Your payment was confirmed and premium access is active.', ?, 0, 'NOTIFICATION_CREATED', 'NOT_REQUESTED')
                 ON DUPLICATE KEY UPDATE id = id`,
                [notificationId, order.uid, notificationId, JSON.stringify({ paymentOrderId: orderId, planId: order.plan_id })]
            );
            await connection.query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
                 VALUES (?, 'PAYMENT_ORDER_ACTIVATED', 'payment-provider', ?, 'billing.activation', 'HIGH',
                         'payment_order', ?, ?, NOW())`,
                [crypto.randomUUID(), order.uid, orderId, JSON.stringify({ gatewayLabel, mutationId, orderRevision: nextOrderRevision })]
            );
            return {
                id: orderId, uid: order.uid, planId: order.plan_id, status: 'ACTIVE', membership,
                membershipEnds, providerPaymentId: providerPaymentId || order.provider_payment_id || null,
                invoice: invoiceResult.invoice,
                invoiceStatus: 'ISSUED',
                revision: nextOrderRevision, mutationId, duplicate: false,
            };
        });
    }

    async claimPaymentRefundAtomic({ orderId, actorUid, reason, leaseMs = 120_000 }) {
        return this._withTransaction(async connection => {
            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!orders.length) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            const order = orders[0];
            if (order.status === 'REFUNDED') {
                return { ...this._paymentOrderProjection(order), duplicate: true, claimId: null };
            }
            if (!['ACTIVE', 'REFUND_PENDING'].includes(order.status)) {
                throw Object.assign(new Error('Only an active payment can be refunded'), { code: 'INVALID_REFUND_STATE', status: 409 });
            }
            const claimedAtMs = order.refund_claimed_at ? new Date(order.refund_claimed_at).getTime() : 0;
            const normalizedLeaseMs = Math.max(30_000, Number(leaseMs) || 120_000);
            const freshClaim = order.refund_claim_id && Number.isFinite(claimedAtMs)
                && claimedAtMs > Date.now() - normalizedLeaseMs;
            if (freshClaim) {
                const error = Object.assign(new Error('A refund command is already in progress'), {
                    code: 'REFUND_IN_PROGRESS', status: 409,
                    retryAfterSeconds: Math.max(1, Math.ceil((claimedAtMs + normalizedLeaseMs - Date.now()) / 1000)),
                });
                throw error;
            }
            const continuingAttempt = order.status === 'REFUND_PENDING';
            const attempt = continuingAttempt
                ? Math.max(1, Number(order.refund_attempt || 0))
                : Number(order.refund_attempt || 0) + 1;
            const idempotencyKey = continuingAttempt && order.refund_idempotency_key
                ? order.refund_idempotency_key
                : `refund_${crypto.createHash('sha256').update(`${orderId}\0${attempt}`).digest('hex').slice(0, 30)}`;
            const claimId = crypto.randomUUID();
            const submittedReason = String(reason || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 500);
            const normalizedReason = continuingAttempt && order.refund_reason
                ? order.refund_reason
                : submittedReason;
            const requestedBy = continuingAttempt && order.refund_requested_by
                ? order.refund_requested_by
                : actorUid;
            const requestedAt = order.refund_requested_at || new Date();
            const nextRevision = Number(order.revision || 1) + 1;
            await connection.query(
                `UPDATE payment_orders
                 SET status = 'REFUND_PENDING', refund_claim_id = ?, refund_claimed_at = NOW(3),
                     refund_reason = ?, refund_requested_by = ?, refund_requested_at = ?,
                     refund_attempt = ?, refund_idempotency_key = ?,
                     revision = ?, updated_at = NOW()
                 WHERE id = ?`,
                [claimId, normalizedReason, requestedBy, requestedAt, attempt, idempotencyKey, nextRevision, orderId]
            );
            await connection.query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
                 VALUES (?, 'PAYMENT_REFUND_CLAIMED', ?, ?, 'billing.refund', 'HIGH',
                         'payment_order', ?, ?, NOW())`,
                [crypto.randomUUID(), actorUid, order.uid, orderId, JSON.stringify({ claimId, attempt, continuingAttempt, reason: normalizedReason, revision: nextRevision })]
            );
            return {
                ...this._paymentOrderProjection({
                    ...order,
                    status: 'REFUND_PENDING',
                    refund_claim_id: claimId,
                    refund_claimed_at: new Date(),
                    refund_reason: normalizedReason,
                    refund_requested_by: requestedBy,
                    refund_requested_at: requestedAt,
                    refund_attempt: attempt,
                    refund_idempotency_key: idempotencyKey,
                    revision: nextRevision,
                }),
                duplicate: false,
                claimId,
            };
        });
    }

    async recordPaymentRefundSubmittedAtomic({
        orderId,
        claimId,
        providerRefundId,
        providerRefundStatus,
        providerRefundReferenceType = 'PROVIDER',
        providerRefunds = [],
    }) {
        return this._withTransaction(async connection => {
            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            const order = orders[0];
            if (!order) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            if (order.status === 'REFUNDED') return { ...this._paymentOrderProjection(order), duplicate: true };
            if (order.status !== 'REFUND_PENDING' || order.refund_claim_id !== claimId) {
                throw Object.assign(new Error('Refund claim is no longer authoritative'), { code: 'REFUND_CLAIM_CONFLICT', status: 409 });
            }
            const normalizedStatus = String(providerRefundStatus || '').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().slice(0, 32);
            const ledger = refundLedgerEntries(order, {
                providerRefundId,
                providerRefundStatus: normalizedStatus,
                providerRefundReferenceType,
                providerRefunds,
            });
            if (!ledger.reference || !normalizedStatus || !ledger.entries.length) {
                throw Object.assign(new Error('Provider refund confirmation is incomplete'), { code: 'PROVIDER_REFUND_UNCONFIRMED', status: 502 });
            }
            if (order.provider_refund_id && order.provider_refund_id !== ledger.reference) {
                throw Object.assign(new Error('Refund provider reference conflicts with the stored result'), { code: 'REFUND_ID_CONFLICT', status: 409 });
            }
            if (order.provider_refund_reference_type
                && order.provider_refund_reference_type !== ledger.referenceType) {
                throw Object.assign(new Error('Refund reference type conflicts with the stored result'), { code: 'REFUND_REFERENCE_TYPE_CONFLICT', status: 409 });
            }
            await persistRefundReferenceLedger(connection, order, ledger.entries, { completed: false });
            await connection.query(
                `UPDATE payment_orders
                 SET provider_refund_id = ?, provider_refund_status = ?, provider_refund_reference_type = ?,
                     provider_refund_updated_at = NOW(3), refund_claim_id = NULL, refund_claimed_at = NULL,
                     failure_code = NULL, revision = revision + 1, updated_at = NOW()
                 WHERE id = ? AND refund_claim_id = ?`,
                [ledger.reference, normalizedStatus, ledger.referenceType, orderId, claimId]
            );
            await connection.query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
                 VALUES (?, 'PAYMENT_REFUND_SUBMITTED', ?, ?, 'billing.refund', 'HIGH',
                         'payment_order', ?, ?, NOW())`,
                [crypto.randomUUID(), order.refund_requested_by || 'admin', order.uid, orderId,
                    JSON.stringify({
                        claimId,
                        refundReference: ledger.reference,
                        refundReferenceType: ledger.referenceType,
                        providerRefundIds: ledger.entries.map(entry => entry.id),
                        providerRefundStatus: normalizedStatus,
                    })]
            );
            return this._paymentOrderProjection({
                ...order,
                provider_refund_id: ledger.reference,
                provider_refund_reference_type: ledger.referenceType,
                provider_refund_status: normalizedStatus,
                provider_refund_updated_at: new Date(),
                refund_claim_id: null,
                refund_claimed_at: null,
                failure_code: null,
                revision: Number(order.revision || 1) + 1,
            });
        });
    }

    async releasePaymentRefundClaimAtomic({
        orderId,
        claimId,
        failureCode = 'PROVIDER_REFUND_UNCONFIRMED',
        restoreActive = false,
        providerFailureConfirmed = false,
    }) {
        return this._withTransaction(async connection => {
            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            const order = orders[0];
            if (!order || order.status !== 'REFUND_PENDING' || order.refund_claim_id !== claimId) return false;
            const canRestore = restoreActive === true
                && (!order.provider_refund_id || providerFailureConfirmed === true);
            await connection.query(
                `UPDATE payment_orders
                 SET status = ?, refund_claim_id = NULL, refund_claimed_at = NULL, failure_code = ?,
                     refund_idempotency_key = CASE WHEN ? = 1 THEN NULL ELSE refund_idempotency_key END,
                     provider_refund_id = CASE WHEN ? = 1 THEN NULL ELSE provider_refund_id END,
                     provider_refund_status = CASE WHEN ? = 1 THEN NULL ELSE provider_refund_status END,
                     provider_refund_updated_at = NOW(3), revision = revision + 1, updated_at = NOW()
                 WHERE id = ? AND refund_claim_id = ?`,
                [canRestore ? 'ACTIVE' : 'REFUND_PENDING', String(failureCode || 'PROVIDER_REFUND_UNCONFIRMED').slice(0, 128),
                    canRestore ? 1 : 0, canRestore ? 1 : 0, canRestore ? 1 : 0, orderId, claimId]
            );
            await connection.query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
                 VALUES (?, ?, ?, ?, 'billing.refund', 'HIGH', 'payment_order', ?, ?, NOW())`,
                [crypto.randomUUID(), canRestore ? 'PAYMENT_REFUND_REJECTED' : 'PAYMENT_REFUND_ATTEMPT_UNCONFIRMED',
                    order.refund_requested_by || 'admin', order.uid, orderId,
                    JSON.stringify({ claimId, failureCode, providerFailureConfirmed, restoredActive: canRestore })]
            );
            return true;
        });
    }

    async reversePaymentEntitlementAtomic({
        orderId,
        status,
        expectedRefundClaimId = null,
        providerRefundId = null,
        providerRefundReferenceType = 'PROVIDER',
        providerRefunds = [],
    }) {
        return this._withTransaction(async connection => {
            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!orders.length) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            const order = orders[0];
            if (!['REFUNDED', 'CHARGEBACK'].includes(status)) {
                throw Object.assign(new Error('Unsupported payment reversal state'), { code: 'INVALID_REVERSAL_STATE', status: 400 });
            }
            let effectiveRefundId = null;
            let effectiveReferenceType = null;
            let effectiveRefundEntries = [];
            if (status === 'REFUNDED') {
                effectiveRefundId = String(providerRefundId || order.provider_refund_id || '').replace(/\p{Cc}/gu, '').trim().slice(0, 255);
                effectiveReferenceType = normalizeRefundReferenceType(
                    providerRefundId ? providerRefundReferenceType : (order.provider_refund_reference_type || providerRefundReferenceType)
                );
                let suppliedReferences = Array.isArray(providerRefunds) ? providerRefunds : [];
                if (!suppliedReferences.length && effectiveReferenceType === 'AGGREGATE') {
                    const [storedReferences] = await connection.query(
                        `SELECT provider_refund_id AS id, provider, provider_status AS status,
                                amount_minor AS amount, currency
                         FROM payment_refund_provider_references
                         WHERE payment_order_id = ? ORDER BY provider_refund_id FOR UPDATE`,
                        [orderId]
                    );
                    suppliedReferences = Array.isArray(storedReferences) ? storedReferences : [];
                }
                if (!effectiveRefundId) {
                    throw Object.assign(new Error('A completed refund requires its provider reference'), { code: 'REFUND_REFERENCE_MISSING', status: 409 });
                }
                const ledger = refundLedgerEntries(order, {
                    providerRefundId: effectiveRefundId,
                    providerRefundStatus: 'COMPLETED',
                    providerRefundReferenceType: effectiveReferenceType,
                    providerRefunds: suppliedReferences,
                    requireFullAmount: true,
                });
                if (order.provider_refund_id && order.provider_refund_id !== ledger.reference) {
                    throw Object.assign(new Error('Refund provider reference conflicts with the stored result'), { code: 'REFUND_ID_CONFLICT', status: 409 });
                }
                if (order.provider_refund_reference_type
                    && order.provider_refund_reference_type !== ledger.referenceType) {
                    throw Object.assign(new Error('Refund reference type conflicts with the stored result'), { code: 'REFUND_REFERENCE_TYPE_CONFLICT', status: 409 });
                }
                effectiveRefundId = ledger.reference;
                effectiveReferenceType = ledger.referenceType;
                effectiveRefundEntries = ledger.entries;
                await persistRefundReferenceLedger(connection, order, effectiveRefundEntries, { completed: true });
            }

            if (order.status === status) {
                const creditResult = status === 'REFUNDED'
                    ? await issueCreditNoteInTransaction(connection, {
                        order,
                        providerRefundId: effectiveRefundId,
                        providerRefundReferenceType: effectiveReferenceType,
                        providerRefunds: effectiveRefundEntries,
                        reason: order.refund_reason || 'Provider reported a completed full refund',
                        actorUid: order.refund_requested_by || 'payment-provider',
                    })
                    : null;
                return {
                    id: orderId,
                    uid: order.uid,
                    status,
                    providerRefundId: effectiveRefundId,
                    providerRefundReferenceType: effectiveReferenceType,
                    providerRefunds: effectiveRefundEntries,
                    creditNote: creditResult?.creditNote || null,
                    duplicate: true,
                };
            }
            if (!['ACTIVE', 'REFUND_PENDING'].includes(order.status)) {
                throw Object.assign(new Error('Payment order is not reversible'), { code: 'INVALID_REVERSAL_STATE', status: 409 });
            }
            if (expectedRefundClaimId && (order.status !== 'REFUND_PENDING' || order.refund_claim_id !== expectedRefundClaimId)) {
                throw Object.assign(new Error('Refund claim is no longer authoritative'), { code: 'REFUND_CLAIM_CONFLICT', status: 409 });
            }
            const creditResult = status === 'REFUNDED'
                ? await issueCreditNoteInTransaction(connection, {
                    order,
                    providerRefundId: effectiveRefundId,
                    providerRefundReferenceType: effectiveReferenceType,
                    providerRefunds: effectiveRefundEntries,
                    reason: order.refund_reason || 'Provider reported a completed full refund',
                    actorUid: order.refund_requested_by || 'payment-provider',
                })
                : null;
            await connection.query(
                `UPDATE payment_orders
                 SET status = ?, reversed_at = NOW(), provider_refund_id = COALESCE(?, provider_refund_id),
                     provider_refund_reference_type = COALESCE(?, provider_refund_reference_type),
                     provider_refund_status = CASE WHEN ? = 'REFUNDED' THEN 'COMPLETED' ELSE provider_refund_status END,
                     provider_refund_updated_at = NOW(3), refund_claim_id = NULL, refund_claimed_at = NULL,
                     failure_code = NULL, revision = revision + 1, updated_at = NOW()
                 WHERE id = ?`,
                [status, effectiveRefundId, effectiveReferenceType, status, orderId]
            );
            const [users] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [order.uid]);
            if (users[0]?.lastPaymentOrderId === orderId) {
                const [remainingOrders] = await connection.query(
                    `SELECT id, membership_ends, last_payment_gateway, amount, currency
                     FROM payment_orders
                     WHERE uid = ? AND id <> ? AND status = 'ACTIVE'
                       AND membership_ends IS NOT NULL
                     ORDER BY membership_ends DESC, activated_at DESC
                     LIMIT 1`,
                    [order.uid, orderId]
                );
                const remaining = remainingOrders[0];
                const remainingEndMs = remaining?.membership_ends ? Date.parse(remaining.membership_ends) : NaN;
                if (remaining && Number.isFinite(remainingEndMs) && remainingEndMs > Date.now()) {
                    await connection.query(
                        `UPDATE users
                         SET paymentStatus = 'ACTIVE', membershipEnds = ?, lastPaymentGateway = ?,
                             lastPaymentOrderId = ?, lastPaymentAmount = ?, lastPaymentCurrency = ?,
                             cancellationRequested = 0, revision = revision + 1, updated_at = NOW()
                         WHERE id = ?`,
                        [remaining.membership_ends, remaining.last_payment_gateway, remaining.id,
                            Number(remaining.amount || 0), remaining.currency, order.uid]
                    );
                } else {
                    await connection.query(
                        `UPDATE users SET membership = 'Basic', paymentStatus = ?, cancellationRequested = 0,
                         membershipEnds = NOW(3), lastPaymentOrderId = NULL,
                         revision = revision + 1, updated_at = NOW() WHERE id = ?`,
                        [status, order.uid]
                    );
                }
            }
            const notificationId = crypto.createHash('sha256').update(`payment_${String(status).toLowerCase()}\0${orderId}`).digest('hex');
            const notificationMessage = status === 'REFUNDED'
                ? 'Your payment was refunded and the related entitlement was updated.'
                : 'A payment chargeback was recorded and the related entitlement was updated.';
            await connection.query(
                `INSERT INTO notifications (id, user_id, event_id, type, title, message, data, is_read, state, delivery_state)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'NOTIFICATION_CREATED', 'NOT_REQUESTED')
                 ON DUPLICATE KEY UPDATE id = id`,
                [notificationId, order.uid, notificationId, `payment_${String(status).toLowerCase()}`,
                    status === 'REFUNDED' ? 'Payment refunded' : 'Payment chargeback', notificationMessage,
                    JSON.stringify({
                        paymentOrderId: orderId,
                        refundReference: effectiveRefundId || null,
                        refundReferenceType: effectiveReferenceType,
                        providerRefundCount: effectiveRefundEntries.length,
                        creditNoteNumber: creditResult?.creditNote?.creditNoteNumber || null,
                    })]
            );
            await connection.query(
                `INSERT INTO security_audit_logs
                 (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
                 VALUES (?, 'PAYMENT_ENTITLEMENT_REVERSED', 'payment-provider', ?, 'billing.activation', 'HIGH',
                         'payment_order', ?, ?, NOW())`,
                [crypto.randomUUID(), order.uid, orderId, JSON.stringify({
                    status,
                    refundReference: effectiveRefundId || null,
                    refundReferenceType: effectiveReferenceType,
                    providerRefundIds: effectiveRefundEntries.map(entry => entry.id),
                    expectedRefundClaimId,
                    creditNoteNumber: creditResult?.creditNote?.creditNoteNumber || null,
                })]
            );
            return {
                id: orderId,
                uid: order.uid,
                status,
                providerRefundId: effectiveRefundId || null,
                providerRefundReferenceType: effectiveReferenceType,
                providerRefunds: effectiveRefundEntries,
                creditNote: creditResult?.creditNote || null,
                duplicate: false,
            };
        });
    }

    async deleteWebhookEvent(eventId) {
        await this._getPool().query('DELETE FROM payment_webhook_events WHERE event_id = ?', [eventId]);
    }

    async findPaymentOrderByProviderIntent(intentId) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM payment_orders WHERE provider_payment_intent_id = ? LIMIT 1',
            [intentId]
        );
        if (!rows.length) return null;
        return this.getPaymentOrder(rows[0].id);
    }

    async getCompany(companyId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM companies WHERE id = ? LIMIT 1', [companyId]);
        if (!rows.length) return null;
        const row = rows[0];
        let extra = {};
        if (row.extra_json) { try { extra = typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : row.extra_json; } catch { /* ignore */ } }
        return { ...row, ...extra, employerId: row.owner_id, companyName: row.name, companyWebsite: row.website };
    }

    async getCompanies(filters = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM companies WHERE 1=1';
        const params = [];
        if (filters.employerId) { sql += ' AND owner_id = ?'; params.push(filters.employerId); }
        sql += ' ORDER BY created_at DESC';
        if (filters.limit) { sql += ' LIMIT ?'; params.push(Number(filters.limit)); }
        const [rows] = await pool.query(sql, params);
        return rows;
    }

    async saveCompany(companyId, data) {
        const pool = this._getPool();
        const values = {
            id: companyId,
            owner_id: data.employerId || data.owner_id || data.ownerId || '',
            name: data.name || '',
            logo: data.logo || data.companyImage || null,
            website: data.website || null,
            description: data.description || '',
            industry: data.industry || '',
            size: data.size || '',
            location: data.location || '',
            verified: data.status === 'approved' || data.verified ? 1 : 0,
            revision: Number(data.revision || 1),
            status: data.status || 'pending',
            extra_json: JSON.stringify(data),
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');
        await pool.query(
            `INSERT INTO companies (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id: companyId, ...data };
    }

    async deleteCompany(companyId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM companies WHERE id = ?', [companyId]);
        return true;
    }

    async getCoupon(code) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM coupons WHERE code = ? LIMIT 1', [String(code).toUpperCase()]);
        if (!rows.length) return null;
        const r = rows[0];
        return {
            code: r.code,
            discount: r.discount,
            description: r.description,
            active: r.active === 1,
            expiryDate: r.expiry_date,
            maxUses: r.max_uses,
            usedCount: r.used_count,
            singleUsePerUser: r.single_use_per_user === 1,
            revision: r.revision,
        };
    }

    async saveCoupon(code, data) {
        const pool = this._getPool();
        const cCode = String(code).toUpperCase();
        const values = {
            code: cCode,
            discount: Number(data.discount || 10),
            description: data.description || '',
            active: data.active !== false ? 1 : 0,
            expiry_date: data.expiryDate || null,
            max_uses: Number(data.maxUses || 0),
            used_count: Number(data.usedCount || 0),
            single_use_per_user: data.singleUsePerUser ? 1 : 0,
            revision: Number(data.revision || 1),
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO coupons (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { code: cCode, ...data };
    }

    async deleteCoupon(code) {
        const pool = this._getPool();
        const cCode = String(code).toUpperCase();
        await pool.query('DELETE FROM coupons WHERE code = ?', [cCode]);
        return { success: true, deleted: true, code: cCode };
    }

    async getCouponRedemption(redemptionId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM coupon_redemptions WHERE id = ? LIMIT 1', [redemptionId]);
        if (!rows.length) return null;
        const r = rows[0];
        return {
            id: r.id,
            uid: r.uid,
            couponCode: r.coupon_code,
            orderId: r.order_id,
            status: r.status,
            expiresAt: r.expires_at,
            usedAt: r.used_at,
        };
    }

    async saveCouponRedemption(redemptionId, data) {
        const pool = this._getPool();
        const values = {
            id: redemptionId,
            uid: data.uid || data.userId || data.user_id,
            coupon_code: data.couponCode || data.coupon_code || data.couponId || data.code,
            order_id: data.orderId || data.order_id,
            status: data.status || 'RESERVED',
            expires_at: data.expiresAt || data.expires_at || null,
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO coupon_redemptions (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id: redemptionId, ...data };
    }

    async deleteCouponRedemption(redemptionId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM coupon_redemptions WHERE id = ?', [redemptionId]);
        return true;
    }

    async claimWebhookEvent(record) {
        const pool = this._getPool();
        try {
            await pool.query(
                `INSERT INTO payment_webhook_events (event_id, provider, event_type, order_id, payload)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    record.eventId,
                    record.provider || '',
                    record.eventType || '',
                    record.orderId || null,
                    JSON.stringify(record),
                ]
            );
            return { duplicate: false, record };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
                return { duplicate: true, existing: record };
            }
            throw err;
        }
    }

    async getApplication(appId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM applications WHERE id = ? LIMIT 1', [appId]);
        if (!rows.length) return null;
        const r = rows[0];
        let extra = {};
        try { extra = typeof r.extra_json === 'string' ? JSON.parse(r.extra_json) : (r.extra_json || {}); } catch { extra = {}; }
        return {
            ...extra,
            id: r.id,
            jobId: r.job_id,
            employerId: r.employer_id,
            userId: r.applicant_id,
            applicantId: r.applicant_id,
            applicantName: r.applicant_name,
            applicantEmail: r.applicant_email,
            applicantPhone: r.applicant_phone,
            resumeId: r.resume_id,
            resumeUrl: r.resume_url,
            coverLetter: r.cover_letter,
            status: r.status,
            rating: Number(r.rating || 0),
            notes: r.notes || '',
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
            revision: Number(r.revision || extra.revision || 1),
        };
    }

    async deleteApplication(appId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM applications WHERE id = ?', [appId]);
        return true;
    }

    _parseDocumentRow(row) {
        if (!row) return null;
        let payload = {};
        try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}); } catch { payload = {}; }
        return { ...payload, id: row.entity_id, revision: Number(row.revision || payload.revision || 1) };
    }

    _assertCanonicalDocumentOwner(entityType) {
        const normalized = String(entityType || '').trim().toLowerCase();
        if (new Set(['custom_pages', 'reviews', 'trusted_by']).has(normalized)) {
            throw Object.assign(
                new Error(`${normalized} is owned by its relational MariaDB table, not canonical_documents.`),
                { code: 'DATABASE_OWNERSHIP_VIOLATION', status: 500 }
            );
        }
        return normalized;
    }

    async getDocument(entityType, id) {
        const canonicalType = this._assertCanonicalDocumentOwner(entityType);
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM canonical_documents WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL LIMIT 1',
            [canonicalType, id]
        );
        return rows.length ? this._parseDocumentRow(rows[0]) : null;
    }

    async listDocuments(entityType, options = {}) {
        const canonicalType = this._assertCanonicalDocumentOwner(entityType);
        const pool = this._getPool();
        const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
        const [rows] = await pool.query(
            'SELECT * FROM canonical_documents WHERE entity_type = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?',
            [canonicalType, limit]
        );
        return rows.map((row) => this._parseDocumentRow(row));
    }

    async saveDocument(entityType, id, data) {
        const canonicalType = this._assertCanonicalDocumentOwner(entityType);
        const revision = Number(data.revision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('A positive canonical-document revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const pool = this._getPool();
        const payload = JSON.stringify({ ...data, id, revision });
        if (revision > 1) {
            const [updated] = await pool.query(
                `UPDATE canonical_documents
                 SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE entity_type = ? AND entity_id = ? AND revision = ? AND deleted_at IS NULL`,
                [payload, revision, canonicalType, id, revision - 1]
            );
            if (Number(updated.affectedRows) === 1) return { id, ...data, revision };
        }
        try {
            await pool.query(
                `INSERT INTO canonical_documents (entity_type, entity_id, payload, revision, deleted_at, updated_at)
                 VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)`,
                [canonicalType, id, payload, revision]
            );
            return { id, ...data, revision };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                throw this._cmsConflict('This record changed after it was loaded.');
            }
            throw error;
        }
    }

    async deleteDocument(entityType, id, expectedRevision) {
        const canonicalType = this._assertCanonicalDocumentOwner(entityType);
        const revision = Number(expectedRevision);
        if (!Number.isInteger(revision) || revision < 1) {
            throw Object.assign(new Error('The current canonical-document revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
        }
        const [result] = await this._getPool().query(
            `UPDATE canonical_documents
             SET deleted_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
             WHERE entity_type = ? AND entity_id = ? AND revision = ? AND deleted_at IS NULL`,
            [canonicalType, id, revision]
        );
        if (Number(result.affectedRows) !== 1) throw this._cmsConflict('This record changed before it could be deleted.');
        return true;
    }
}

module.exports = MySQLRepository;
module.exports._refundLedgerEntries = refundLedgerEntries;
