const { getPool } = require('../database/mysql');
const { enqueueOutboxEvent } = require('../database/syncManager');
const { recordTombstone } = require('../database/tombstones');

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
                ? (await connection.query('SELECT revision FROM resumes WHERE id = ? AND user_id = ?', [resumeId, userId]))[0]
                : [];

            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            if (expectedRevision !== null && currentRev !== Number(expectedRevision)) {
                const conflict = new Error('Resume conflict: document updated in another session');
                conflict.code = 'RESUME_CONFLICT';
                conflict.remoteRevision = currentRev;
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

            await enqueueOutboxEvent(connection, {
                entityType: 'resumes',
                entityId: resumeId,
                operation: 'UPSERT',
                payload: { ...data, id: resumeId, user_id: userId, revision: nextRev },
                version: nextRev,
                sourceEngine: 'mysql'
            });

            // revision must reflect the stored value; a caller-supplied stale
            // `revision` in `data` must never mask the authoritative nextRev.
            return { id: resumeId, ...data, revision: nextRev, user_id: userId };
        });
    }

    async deleteResume(userId, resumeId) {
        const pool = this._getPool();
        const [existing] = await pool.query('SELECT revision FROM resumes WHERE id = ? AND user_id = ?', [resumeId, userId]).catch(() => [[]]);
        const rev = existing && existing.length ? Number(existing[0].revision || 1) : 1;

        // Owner-scoped delete: return 0 when the caller does not own the resume
        // so the route can answer 404 instead of a fabricated success.
        const [result] = await pool.query('DELETE FROM resumes WHERE id = ? AND user_id = ?', [resumeId, userId]);
        if (!Number(result.affectedRows || 0)) return 0;
        await pool.query('DELETE FROM public_resumes WHERE id = ? AND owner_uid = ?', [resumeId, userId]);
        await pool.query('DELETE FROM favourites WHERE item_id = ? AND user_id = ?', [resumeId, userId]);
        await recordTombstone(pool, { entityType: 'resumes', entityId: resumeId, version: rev, sourceEngine: 'mysql' });

        // Enqueue delete replication event
        await enqueueOutboxEvent(pool, {
            entityType: 'resumes',
            entityId: resumeId,
            operation: 'DELETE',
            payload: { user_id: userId },
            version: rev,
            sourceEngine: 'mysql'
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));

        return true;
    }

    async publishResume(userId, resumeId, data, { expectedRevision = null, expectedPublicationRevision = null } = {}) {
        const pool = this._getPool();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [resumeRows] = await connection.query(
                'SELECT * FROM resumes WHERE id = ? AND user_id = ? FOR UPDATE',
                [resumeId, userId]
            );
            if (!resumeRows.length) throw new Error('Resume not found');
            const sourceRev = Number(resumeRows[0].revision || 0);

            const [pbRows] = await connection.query(
                'SELECT * FROM public_resumes WHERE id = ? FOR UPDATE',
                [resumeId]
            );
            const pubRev = pbRows.length ? Number(pbRows[0].publication_revision || 0) : 0;

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
            const objectString = typeof data === 'string' ? data : JSON.stringify(data || this._parseJsonRow(resumeRows[0], this.jsonResumeFields));

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
            if (pbRows[0].owner_uid !== userId) throw new Error('Access denied');

            const current = Number(pbRows[0].publication_revision || 0);
            if (expectedPublicationRevision !== null && current !== Number(expectedPublicationRevision)) {
                const err = new Error('Publication link modified in another session');
                err.code = 'RESUME_PUBLICATION_CONFLICT';
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
    async getUser(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!rows.length) return null;
        const r = rows[0];
        let extra = {};
        if (r.extra_data) {
            try { extra = typeof r.extra_data === 'string' ? JSON.parse(r.extra_data) : r.extra_data; } catch (_e) {}
        }
        return {
            ...r,
            userId: r.id,
            suspended: r.suspended === 1,
            cancellationRequested: r.cancellationRequested === 1,
            ...extra
        };
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
            const extraData = { ...(userData.extra_data || {}) };
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
                role: userData.role || 'USER',
                suspended: userData.suspended ? 1 : 0,
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

            try {
                await enqueueOutboxEvent(connection, {
                    entityType: 'users',
                    entityId: userId,
                    operation: 'UPSERT',
                    payload: { ...userData, id: userId, revision: nextRev, membershipEnds: values.membershipEnds, paymentStatus: values.paymentStatus },
                    version: nextRev,
                    sourceEngine: 'mysql'
                });
            } catch (e) {
                if (!/exist|unknown table/i.test(String(e.message || ''))) throw e;
                console.error('[MySQLRepository] CRITICAL: outbox unavailable; user mutation durable on primary only:', e.message);
            }

            return { id: userId, revision: nextRev, ...userData };
    }

    async saveUser(userId, userData) {
        return this._withTransaction(async (connection) => {
            const [existingRows] = await connection.query('SELECT revision FROM users WHERE id = ? FOR UPDATE', [userId]).catch(async () => {
                const [rows] = await connection.query('SELECT 1 FROM users WHERE id = ?', [userId]);
                return [rows.map(() => ({ revision: 0 }))];
            });
            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            const nextRev = Number(userData.revision || currentRev + 1);
            return this._upsertUser(connection, userId, userData, nextRev);
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
            const [existingRows] = await connection.query('SELECT revision FROM users WHERE id = ? FOR UPDATE', [userId]).catch(async () => {
                const [rows] = await connection.query('SELECT 1 FROM users WHERE id = ?', [userId]);
                return [rows.map(() => ({ revision: 0 }))];
            });
            const currentRev = existingRows.length ? Number(existingRows[0].revision || 0) : 0;
            if (expectedRevision !== null && expectedRevision !== undefined && Number(currentRev) !== Number(expectedRevision)) {
                const error = new Error('Profile changed in another tab or device.');
                error.code = 'PROFILE_CONFLICT';
                error.status = 409;
                error.remoteRevision = currentRev;
                throw error;
            }
            const nextRev = currentRev + 1;
            return this._upsertUser(connection, userId, userData, nextRev);
        });
    }

    async deleteUser(userId) {
        const pool = this._getPool();
        const [existing] = await pool.query('SELECT revision FROM users WHERE id = ?', [userId]).catch(() => [[]]);
        const rev = existing && existing.length ? Number(existing[0].revision || 1) : 1;

        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        await recordTombstone(pool, { entityType: 'users', entityId: userId, version: rev, sourceEngine: 'mysql' });

        await enqueueOutboxEvent(pool, {
            entityType: 'users',
            entityId: userId,
            operation: 'DELETE',
            payload: { id: userId },
            version: rev,
            sourceEngine: 'mysql'
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));

        return true;
    }

    // ==========================================
    // 3. PORTFOLIOS
    // ==========================================
    async getPortfolios(userId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM portfolios WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
        return rows.map(r => this._parseJsonRow(r, ['data']));
    }

    async getPortfolio(userId, portfolioId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1', [portfolioId, userId]);
        if (!rows.length) return null;
        return this._parseJsonRow(rows[0], ['data']);
    }

    async savePortfolio(userId, portfolioId, data) {
        return this._withTransaction(async (connection) => {
            await connection.query(
                'INSERT IGNORE INTO users (id, email, revision) VALUES (?, ?, 1)',
                [userId, '']
            );

            // Ownership-collision guard (IDOR): refuse to upsert over a
            // portfolio owned by a different user (see saveResume).
            const [ownerRows] = await connection.query(
                'SELECT user_id FROM portfolios WHERE id = ? FOR UPDATE',
                [portfolioId]
            );
            if (ownerRows.length && ownerRows[0].user_id !== userId) {
                const denied = new Error('Portfolio not found');
                denied.code = 'PORTFOLIO_NOT_FOUND';
                denied.status = 404;
                throw denied;
            }

            const values = {
                id: portfolioId,
                user_id: userId,
                title: data.title || 'Untitled Portfolio',
                theme: data.theme || 'modern',
                is_published: data.is_published ? 1 : 0,
                data: JSON.stringify(data.data || data),
            };
            const keys = Object.keys(values);
            const placeholders = keys.map(() => '?').join(', ');
            const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

            await connection.query(
                `INSERT INTO portfolios (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
                Object.values(values)
            );

            await enqueueOutboxEvent(connection, {
                entityType: 'portfolios',
                entityId: portfolioId,
                operation: 'UPSERT',
                payload: { ...data, id: portfolioId, user_id: userId },
                version: 1,
                sourceEngine: 'mysql'
            }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        }).then(() => ({ id: portfolioId, ...data }));
    }

    async deletePortfolio(userId, portfolioId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM portfolios WHERE id = ? AND user_id = ?', [portfolioId, userId]);

        await enqueueOutboxEvent(pool, {
            entityType: 'portfolios',
            entityId: portfolioId,
            operation: 'DELETE',
            payload: { user_id: userId },
            version: 1,
            sourceEngine: 'mysql'
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));

        return true;
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

            await enqueueOutboxEvent(connection, {
                entityType: 'covers',
                entityId: coverId,
                operation: 'UPSERT',
                payload: { ...data, id: coverId, user_id: userId },
                version: 1,
                sourceEngine: 'mysql'
            }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        });

        return { id: coverId, ...data };
    }

    async deleteCover(userId, coverId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM covers WHERE id = ? AND user_id = ?', [coverId, userId]);

        await enqueueOutboxEvent(pool, {
            entityType: 'covers',
            entityId: coverId,
            operation: 'DELETE',
            payload: { user_id: userId },
            version: 1,
            sourceEngine: 'mysql'
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));

        return true;
    }

    // ==========================================
    // 5. JOBS & APPLICATIONS
    // ==========================================
    async getJobs(filters = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM jobs WHERE 1=1';
        const params = [];
        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.employerId) {
            sql += ' AND employer_id = ?';
            params.push(filters.employerId);
        }
        sql += ' ORDER BY created_at DESC';
        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(Number(filters.limit));
        }
        const [rows] = await pool.query(sql, params);
        return rows.map(r => this._parseJsonRow(r, ['requirements', 'skills']));
    }

    async getJob(jobId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? LIMIT 1', [jobId]);
        if (!rows.length) return null;
        const row = this._parseJsonRow(rows[0], ['requirements', 'skills']);
        return { ...row, employerId: row.employer_id, companyId: row.company_id };
    }

    async saveJob(jobId, data) {
        const pool = this._getPool();
        const values = {
            id: jobId,
            employer_id: data.employerId || data.employer_id,
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
            status: data.status || 'OPEN',
            featured: data.featured ? 1 : 0,
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO jobs (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        const revision = Number(data.revision || 1);
        await enqueueOutboxEvent(pool, {
            entityType: 'jobs', entityId: jobId, operation: 'UPSERT',
            payload: { ...data, id: jobId, revision }, version: revision, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id: jobId, ...data };
    }

    async deleteJob(jobId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM jobs WHERE id = ?', [jobId]);
        await enqueueOutboxEvent(pool, {
            entityType: 'jobs', entityId: jobId, operation: 'DELETE',
            payload: { id: jobId }, version: 1, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return true;
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
        await enqueueOutboxEvent(pool, {
            entityType: 'applications', entityId: appId, operation: 'UPSERT',
            payload: { ...data, id: appId, employer_id: empId }, version: Number(data.revision || 1), sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
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
        item.published = item.published === 1;
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
        await enqueueOutboxEvent(pool, {
            entityType: 'blog', entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id, ...data, revision };
    }

    async deleteBlogPost(id) {
        const pool = this._getPool();
        await pool.query('DELETE FROM blog WHERE id = ?', [id]);
        await enqueueOutboxEvent(pool, {
            entityType: 'blog', entityId: id, operation: 'DELETE',
            payload: { id }, version: 1, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return true;
    }

    // ==========================================
    // 7. CUSTOM PAGES, TRUSTED BY, REVIEWS
    // ==========================================
    async getCustomPages(options = {}) {
        const pool = this._getPool();
        let sql = 'SELECT * FROM custom_pages WHERE 1=1';
        if (options.publishedOnly) sql += ' AND published = 1';
        sql += ' ORDER BY nav_order ASC, created_at DESC';
        const [rows] = await pool.query(sql);
        return rows.map(r => ({ ...r, published: r.published === 1, show_in_nav: r.show_in_nav === 1, show_in_footer: r.show_in_footer === 1 }));
    }

    async getCustomPageBySlug(slug) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM custom_pages WHERE slug = ? LIMIT 1', [slug]);
        if (!rows.length) return null;
        const r = rows[0];
        return { ...r, published: r.published === 1, show_in_nav: r.show_in_nav === 1, show_in_footer: r.show_in_footer === 1 };
    }

    async saveCustomPage(id, data) {
        const pool = this._getPool();
        const values = {
            id,
            title: data.title || '',
            slug: data.slug || `page-${Date.now()}`,
            content: data.content || '',
            published: data.published === false ? 0 : 1,
            nav_order: Number(data.navOrder || data.nav_order || 0),
            show_in_nav: data.showInNav || data.show_in_nav ? 1 : 0,
            show_in_footer: data.showInFooter || data.show_in_footer ? 1 : 0,
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO custom_pages (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        await enqueueOutboxEvent(pool, {
            entityType: 'custom_pages', entityId: id, operation: 'UPSERT',
            payload: { ...data, id }, version: Number(data.revision || 1), sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id, ...data };
    }

    async deleteCustomPage(id) {
        const pool = this._getPool();
        await pool.query('DELETE FROM custom_pages WHERE id = ?', [id]);
        return true;
    }

    async getTrustedBy() {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM trusted_by ORDER BY display_order ASC');
        return rows.map(r => ({ ...r, active: r.active === 1 }));
    }

    async saveTrustedBy(id, data) {
        const pool = this._getPool();
        const values = {
            id,
            name: data.name || '',
            logo_url: data.logoUrl || data.logo_url || '',
            website_url: data.websiteUrl || data.website_url || '',
            display_order: Number(data.displayOrder || data.display_order || 0),
            active: data.active === false ? 0 : 1,
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO trusted_by (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        return { id, ...data };
    }

    async deleteTrustedBy(id) {
        const pool = this._getPool();
        await pool.query('DELETE FROM trusted_by WHERE id = ?', [id]);
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

    async saveContactMessage(msgId, data) {
        const pool = this._getPool();
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
            return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        } catch (_e) {
            return {};
        }
    }

    async incrementStat(statKey, delta = 1) {
        const pool = this._getPool();
        const currentStats = await this.getStats();
        currentStats[statKey] = (Number(currentStats[statKey]) || 0) + Number(delta);
        const dataJson = JSON.stringify(currentStats);
        await pool.query(
            `INSERT INTO stats (id, data, updated_at)
             VALUES ('global_stats', ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
            [dataJson]
        );
        return true;
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

        sql += ' ORDER BY created_at DESC';
        const limit = Math.min(Math.max(Number(options.limit || options.pageSize || 50), 1), 200);
        sql += ' LIMIT ?';
        params.push(limit);

        const [rows] = await pool.query(sql, params);
        return rows.map(r => ({
            id: r.id,
            actorUid: r.actor_uid,
            actorEmail: r.actor_email,
            actorRole: r.actor_role,
            action: r.action,
            category: r.category,
            severity: r.severity,
            outcome: r.outcome,
            method: r.method,
            pathname: r.pathname,
            statusCode: r.status_code,
            resourceType: r.resource_type,
            resourceId: r.resource_id,
            metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata,
            requestId: r.request_id,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }));
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
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
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
            'SELECT * FROM payment_orders WHERE uid = ? OR user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId, userId]
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
            providerClientSecret: r.provider_client_secret,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }));
    }

    async getPaymentOrder(orderId) {
        const pool = this._getPool();
        const [rows] = await pool.query('SELECT * FROM payment_orders WHERE id = ? LIMIT 1', [orderId]);
        if (!rows.length) return null;
        const r = rows[0];
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
        };
    }

    async savePaymentOrder(orderId, data) {
        const pool = this._getPool();
        const values = {
            id: orderId,
            uid: data.uid,
            plan_id: data.planId || data.plan_id || 'monthly',
            provider: data.provider || 'stripe',
            amount: Number(data.amount || 0),
            original_amount: Number(data.originalAmount || data.original_amount || data.amount || 0),
            currency: data.currency || 'INR',
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
        };
        const keys = Object.keys(values);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = VALUES(${k})`).join(', ');

        await pool.query(
            `INSERT INTO payment_orders (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}, updated_at = CURRENT_TIMESTAMP`,
            Object.values(values)
        );
        const revision = Number(data.revision || 1);
        await enqueueOutboxEvent(pool, {
            entityType: 'payment_orders', entityId: orderId, operation: 'UPSERT',
            payload: { ...data, id: orderId, revision }, version: revision, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id: orderId, revision, ...data };
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
        await enqueueOutboxEvent(pool, {
            entityType: 'companies', entityId: companyId, operation: 'UPSERT',
            payload: { ...data, id: companyId }, version: Number(data.revision || 1), sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id: companyId, ...data };
    }

    async deleteCompany(companyId) {
        const pool = this._getPool();
        await pool.query('DELETE FROM companies WHERE id = ?', [companyId]);
        await enqueueOutboxEvent(pool, {
            entityType: 'companies', entityId: companyId, operation: 'DELETE',
            payload: { id: companyId }, version: 1, sourceEngine: 'mysql',
        }).catch(e => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
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
        await enqueueOutboxEvent(pool, {
            entityType: 'applications', entityId: appId, operation: 'DELETE',
            payload: { id: appId }, version: 1, sourceEngine: 'mysql',
        }).catch((e) => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return true;
    }

    _parseDocumentRow(row) {
        if (!row) return null;
        let payload = {};
        try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}); } catch { payload = {}; }
        return { ...payload, id: row.entity_id, revision: Number(row.revision || payload.revision || 1) };
    }

    async getDocument(entityType, id) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM canonical_documents WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL LIMIT 1',
            [entityType, id]
        );
        return rows.length ? this._parseDocumentRow(rows[0]) : null;
    }

    async listDocuments(entityType, options = {}) {
        const pool = this._getPool();
        const [rows] = await pool.query(
            'SELECT * FROM canonical_documents WHERE entity_type = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?',
            [entityType, Number(options.limit || 500)]
        );
        return rows.map((row) => this._parseDocumentRow(row));
    }

    async saveDocument(entityType, id, data) {
        const pool = this._getPool();
        const revision = Number(data.revision || 1);
        const payload = JSON.stringify({ ...data, id, revision });
        await pool.query(
            `INSERT INTO canonical_documents (entity_type, entity_id, payload, revision, deleted_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload), revision = VALUES(revision), deleted_at = NULL, updated_at = CURRENT_TIMESTAMP`,
            [entityType, id, payload, revision]
        );
        await enqueueOutboxEvent(pool, {
            entityType, entityId: id, operation: 'UPSERT',
            payload: { ...data, id, revision }, version: revision, sourceEngine: 'mysql',
        }).catch((e) => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return { id, revision, ...data };
    }

    async deleteDocument(entityType, id) {
        const pool = this._getPool();
        await pool.query(
            'UPDATE canonical_documents SET deleted_at = CURRENT_TIMESTAMP WHERE entity_type = ? AND entity_id = ?',
            [entityType, id]
        );
        await enqueueOutboxEvent(pool, {
            entityType, entityId: id, operation: 'DELETE',
            payload: { id }, version: 1, sourceEngine: 'mysql',
        }).catch((e) => console.warn('[MySQLRepository] Outbox enqueue warning:', e.message));
        return true;
    }

    async getReview(id) { return this.getDocument('reviews', id); }
    async saveReview(id, data) { return this.saveDocument('reviews', id, data); }
    async deleteReview(id) { return this.deleteDocument('reviews', id); }
}

module.exports = MySQLRepository;
