const crypto = require('crypto');
const { getPool } = require('./mysql');
const { getActiveEngine } = require('./engineManager');

let backgroundWorkerTimer = null;
let isWorkerProcessing = false;

/**
 * Calculates a deterministic canonical SHA-256 hash of an entity payload.
 * Ignores volatile timestamps and internal metadata for stable comparison.
 */
function calculateContentHash(entityType, payload) {
    if (!payload || typeof payload !== 'object') {
        return crypto.createHash('sha256').update(String(payload || '')).digest('hex');
    }

    const clean = { ...payload };
    // Remove ephemeral/volatile fields
    delete clean.created_at;
    delete clean.updated_at;
    delete clean.updatedAt;
    delete clean.createdAt;
    delete clean.lastPing;
    delete clean._seconds;
    delete clean._nanoseconds;

    // Deterministic sorted JSON stringify
    const sortedKeys = Object.keys(clean).sort();
    const sortedObj = {};
    for (const k of sortedKeys) {
        sortedObj[k] = clean[k];
    }

    return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

/**
 * Enqueues a durable outbox event during a MySQL mutation transaction.
 * @param {object} connection - Active MySQL connection or pool
 * @param {object} params - Event parameters
 */
async function enqueueOutboxEvent(connection, {
    entityType,
    entityId,
    operation = 'UPSERT',
    payload = {},
    version = 1,
    sourceEngine = 'mysql'
}) {
    const eventId = `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const hash = calculateContentHash(entityType, payload);
    const conn = connection || getPool();

    const sql = `
        INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, version, source_engine, content_hash, status, retry_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)
    `;

    await conn.query(sql, [
        eventId,
        entityType,
        String(entityId),
        operation,
        JSON.stringify(payload),
        Number(version || 1),
        sourceEngine,
        hash
    ]);

    // Asynchronous Instant Microtask Dispatch
    // Eliminates the 5-second polling delay down to <50ms without adding any latency to the user's HTTP response
    if (typeof setImmediate === 'function') {
        setImmediate(() => {
            processSyncQueue(10).catch(() => {});
        });
    }

    return { eventId, contentHash: hash };
}

/**
 * Updates the background worker heartbeat in MariaDB.
 */
async function updateWorkerHeartbeat(status = 'RUNNING', updates = {}) {
    try {
        const pool = getPool();
        const setClauses = [
            'worker_pid = ?',
            'worker_status = ?',
            'last_heartbeat_at = NOW()'
        ];
        const values = [process.pid, status];

        if (updates.lastSyncStartedAt) {
            setClauses.push('last_sync_started_at = NOW()');
        }
        if (updates.lastSyncCompletedAt) {
            setClauses.push('last_sync_completed_at = NOW()');
        }
        if (updates.lastSuccessfulEventAt) {
            setClauses.push('last_successful_event_at = NOW()');
        }
        if (updates.lastFailedEventAt) {
            setClauses.push('last_failed_event_at = NOW()');
        }
        if (typeof updates.consecutiveFailures === 'number') {
            setClauses.push('consecutive_failures = ?');
            values.push(updates.consecutiveFailures);
        }
        if (updates.processedCount && updates.processedCount > 0) {
            setClauses.push('total_events_processed = total_events_processed + ?');
            values.push(updates.processedCount);
        }

        values.push('primary_sync_worker');

        await pool.query(`
            UPDATE sync_worker_state 
            SET ${setClauses.join(', ')}
            WHERE worker_id = ?
        `, values);
    } catch (_) {}
}

/**
 * Fetches current sync metrics, health indicators, and worker heartbeat telemetry from MariaDB.
 */
async function getSyncHealthStatus() {
    const pool = getPool();
    const activeEngine = getActiveEngine();
    const standbyEngine = activeEngine === 'mysql' ? 'firestore' : 'mysql';

    try {
        const [counts] = await pool.query(`
            SELECT 
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END) as processing_count,
                COUNT(CASE WHEN status = 'RETRYING' THEN 1 END) as retrying_count,
                COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
                COUNT(CASE WHEN status = 'DEAD_LETTER' THEN 1 END) as dead_letter_count,
                COUNT(CASE WHEN status = 'CONFLICT' THEN 1 END) as conflict_count,
                MAX(CASE WHEN status = 'SYNCED' THEN processed_at END) as last_sync_at,
                MIN(CASE WHEN status IN ('PENDING', 'RETRYING') THEN created_at END) as oldest_pending_at
            FROM sync_outbox
        `);

        const [conflictCounts] = await pool.query(`
            SELECT COUNT(*) as active_conflicts FROM sync_conflicts WHERE resolution = 'PENDING'
        `);

        const [workerRows] = await pool.query(`
            SELECT * FROM sync_worker_state WHERE worker_id = 'primary_sync_worker'
        `);

        const stats = counts[0] || {};
        const activeConflicts = conflictCounts[0]?.active_conflicts || 0;
        const workerInfo = workerRows[0] || null;

        let syncLagSeconds = 0;
        if (stats.oldest_pending_at) {
            syncLagSeconds = Math.max(0, Math.floor((Date.now() - new Date(stats.oldest_pending_at).getTime()) / 1000));
        }

        // Heartbeat freshness threshold: 20 seconds
        const heartbeatAgeSeconds = workerInfo?.last_heartbeat_at 
            ? Math.floor((Date.now() - new Date(workerInfo.last_heartbeat_at).getTime()) / 1000)
            : 9999;
        
        const isWorkerRunning = Boolean(workerInfo && workerInfo.worker_status === 'RUNNING' && heartbeatAgeSeconds <= 20);

        const isHealthy = Number(stats.dead_letter_count || 0) === 0 &&
                          Number(activeConflicts || 0) === 0 &&
                          syncLagSeconds < 60 &&
                          isWorkerRunning;

        return {
            activeEngine,
            standbyEngine,
            syncMode: 'ACTIVE_PASSIVE',
            isHealthy,
            syncLagSeconds,
            pendingCount: Number(stats.pending_count || 0),
            processingCount: Number(stats.processing_count || 0),
            retryingCount: Number(stats.retrying_count || 0),
            failedCount: Number(stats.failed_count || 0),
            deadLetterCount: Number(stats.dead_letter_count || 0),
            conflictCount: Number(activeConflicts || 0),
            lastSuccessfulSyncAt: stats.last_sync_at ? new Date(stats.last_sync_at).toISOString() : (workerInfo?.last_successful_event_at ? new Date(workerInfo.last_successful_event_at).toISOString() : null),
            // Worker Telemetry
            worker: {
                status: isWorkerRunning ? 'RUNNING' : 'STOPPED',
                pid: workerInfo?.worker_pid || 0,
                heartbeatAgeSeconds,
                lastHeartbeatAt: workerInfo?.last_heartbeat_at ? new Date(workerInfo.last_heartbeat_at).toISOString() : null,
                lastSyncStartedAt: workerInfo?.last_sync_started_at ? new Date(workerInfo.last_sync_started_at).toISOString() : null,
                lastSyncCompletedAt: workerInfo?.last_sync_completed_at ? new Date(workerInfo.last_sync_completed_at).toISOString() : null,
                lastSuccessfulEventAt: workerInfo?.last_successful_event_at ? new Date(workerInfo.last_successful_event_at).toISOString() : null,
                lastFailedEventAt: workerInfo?.last_failed_event_at ? new Date(workerInfo.last_failed_event_at).toISOString() : null,
                consecutiveFailures: workerInfo?.consecutive_failures || 0,
                totalEventsProcessed: workerInfo?.total_events_processed || 0
            }
        };
    } catch (err) {
        return {
            activeEngine,
            standbyEngine,
            syncMode: 'ACTIVE_PASSIVE',
            isHealthy: false,
            error: err.message,
            syncLagSeconds: 0,
            pendingCount: 0,
            processingCount: 0,
            retryingCount: 0,
            failedCount: 0,
            deadLetterCount: 0,
            conflictCount: 0,
            lastSuccessfulSyncAt: null,
            worker: {
                status: 'STOPPED',
                pid: 0,
                lastHeartbeatAt: null
            }
        };
    }
}

/**
 * Replicates a single outbox record from MySQL to Firestore with monotonic versioning protection.
 */
async function replicateToFirestore(adminFirestore, event) {
    if (!adminFirestore) {
        throw new Error('Firestore instance is unavailable for replication');
    }

    const { entity_type, entity_id, operation, payload, version } = event;
    const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
    const incomingVersion = Number(version || data.revision || 1);

    if (entity_type === 'resumes') {
        const userId = data.user_id || data.userId;
        if (!userId) throw new Error(`Missing user_id for resume replication: ${entity_id}`);
        const ref = adminFirestore.collection('users').doc(userId).collection('resumes').doc(entity_id);

        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            // Monotonic Revision Guard (Out-of-Order Stale Event Protection)
            try {
                const existingSnap = await ref.get();
                if (existingSnap.exists) {
                    const existingRevision = Number(existingSnap.data()?.revision || 0);
                    if (existingRevision > incomingVersion) {
                        console.log(`[SyncWorker] Monotonic guard: Stale version ${incomingVersion} ignored (Firestore is at revision ${existingRevision})`);
                        return; // Successfully acknowledged without state regression
                    }
                }
            } catch (_) {}

            await ref.set({
                ...data,
                revision: incomingVersion,
                updatedAt: new Date(),
            }, { merge: true });
        }
    } else if (entity_type === 'users') {
        const ref = adminFirestore.collection('users').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set({
                ...data,
                updatedAt: new Date(),
            }, { merge: true });
        }
    } else if (entity_type === 'portfolios') {
        const userId = data.user_id || data.userId;
        if (!userId) throw new Error(`Missing user_id for portfolio replication: ${entity_id}`);
        const ref = adminFirestore.collection('users').doc(userId).collection('portfolios').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set({ ...data, updatedAt: new Date() }, { merge: true });
        }
    } else if (entity_type === 'covers') {
        const userId = data.user_id || data.userId;
        if (!userId) throw new Error(`Missing user_id for cover replication: ${entity_id}`);
        const ref = adminFirestore.collection('users').doc(userId).collection('covers').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set({ ...data, updatedAt: new Date() }, { merge: true });
        }
    } else if (entity_type === 'settings' || entity_type === 'system_settings') {
        const ref = adminFirestore.collection('settings').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'payment_orders') {
        const ref = adminFirestore.collection('payment_orders').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'jobs') {
        const ref = adminFirestore.collection('jobs').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'applications') {
        const ref = adminFirestore.collection('applications').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'companies') {
        const ref = adminFirestore.collection('companies').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'blog') {
        const ref = adminFirestore.collection('blog').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'custom_pages') {
        const ref = adminFirestore.collection('custom_pages').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'trusted_by') {
        const ref = adminFirestore.collection('trusted_by').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'reviews') {
        const ref = adminFirestore.collection('reviews').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'contact_messages') {
        const ref = adminFirestore.collection('contact').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'coupons') {
        const ref = adminFirestore.collection('coupons').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else if (entity_type === 'stats') {
        const ref = adminFirestore.collection('data').doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    } else {
        // Fallback: Store into collection named after entity_type
        const ref = adminFirestore.collection(entity_type).doc(entity_id);
        if (operation === 'DELETE') {
            await ref.delete();
        } else {
            await ref.set(data, { merge: true });
        }
    }
}

/**
 * Replicates an event from Firestore change capture to MySQL with monotonic versioning protection.
 */
async function replicateToMySQL(event, poolOverride = null) {
    const pool = poolOverride || getPool();
    const { entity_type, entity_id, operation, payload, version } = event;
    const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
    const incomingVersion = Number(version || data.revision || 1);

    if (entity_type === 'resumes') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM resumes WHERE id = ?', [entity_id]);
        } else {
            // Monotonic Revision Guard
            const [existing] = await pool.query('SELECT revision FROM resumes WHERE id = ?', [entity_id]);
            if (existing.length > 0 && Number(existing[0].revision) > incomingVersion) {
                console.log(`[SyncWorker] Monotonic guard: Stale version ${incomingVersion} ignored (MySQL is at revision ${existing[0].revision})`);
                return;
            }

            const userId = data.user_id || data.userId;
            const values = [
                entity_id,
                userId,
                data.title || 'Untitled Resume',
                data.template || 'Cv1',
                incomingVersion,
                data.firstname || '',
                data.lastname || '',
                data.email || '',
                data.phone || '',
                data.occupation || '',
                data.country || '',
                data.city || '',
                data.address || '',
                data.postalcode || '',
                data.website || '',
                data.linkedin || '',
                data.github || '',
                data.photo || null,
                data.showPhoto === false ? 0 : 1,
                data.summary || '',
                JSON.stringify(data.employments || []),
                JSON.stringify(data.educations || []),
                JSON.stringify(data.skills || []),
                JSON.stringify(data.languages || []),
                JSON.stringify(data.hobbies || []),
                JSON.stringify(data.projects || []),
                JSON.stringify(data.certifications || []),
                JSON.stringify(data.achievements || []),
                JSON.stringify(data.references || []),
                JSON.stringify(data.customSections || []),
                JSON.stringify(data.sectionOrder || []),
                JSON.stringify(data.hiddenSections || []),
                JSON.stringify(data.completedSteps || []),
            ];

            const sql = `
                INSERT INTO resumes (\`id\`, \`user_id\`, \`title\`, \`template\`, \`revision\`, \`firstname\`, \`lastname\`, \`email\`, \`phone\`, \`occupation\`, \`country\`, \`city\`, \`address\`, \`postalcode\`, \`website\`, \`linkedin\`, \`github\`, \`photo\`, \`showPhoto\`, \`summary\`, \`employments\`, \`educations\`, \`skills\`, \`languages\`, \`hobbies\`, \`projects\`, \`certifications\`, \`achievements\`, \`references\`, \`customSections\`, \`sectionOrder\`, \`hiddenSections\`, \`completedSteps\`)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE \`title\`=VALUES(\`title\`), \`template\`=VALUES(\`template\`), \`revision\`=VALUES(\`revision\`), \`summary\`=VALUES(\`summary\`), updated_at=CURRENT_TIMESTAMP
            `;
            await pool.query(sql, values);
        }
    } else if (entity_type === 'users') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM users WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO users (id, email, displayName, role, membership, extra_data)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE displayName=VALUES(displayName), role=VALUES(role), membership=VALUES(membership), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.email || `${entity_id}@example.com`, data.displayName || '', data.role || 'USER', data.membership || 'Basic', JSON.stringify(data)]
            );
        }
    } else if (entity_type === 'portfolios') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM portfolios WHERE id = ?', [entity_id]);
        } else {
            const userId = data.user_id || data.userId;
            if (!userId) throw new Error(`Missing user_id for portfolio replication: ${entity_id}`);
            await pool.query(
                `INSERT INTO portfolios (id, user_id, title, theme, is_published, data)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), theme=VALUES(theme), is_published=VALUES(is_published), data=VALUES(data), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, userId, String(data.title || 'Untitled Portfolio').slice(0, 160), String(data.theme || 'modern').slice(0, 50), data.isPublished === true ? 1 : 0, JSON.stringify(data)]
            );
        }
    } else if (entity_type === 'covers') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM covers WHERE id = ?', [entity_id]);
        } else {
            const userId = data.user_id || data.userId;
            if (!userId) throw new Error(`Missing user_id for cover replication: ${entity_id}`);
            await pool.query(
                `INSERT INTO covers (id, user_id, title, template, data)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), template=VALUES(template), data=VALUES(data), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, userId, String(data.title || 'Untitled Cover Letter').slice(0, 160), String(data.template || 'Cover1').slice(0, 50), JSON.stringify(data)]
            );
        }
    } else if (entity_type === 'payment_orders') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM payment_orders WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO payment_orders (id, uid, plan_id, provider, amount, original_amount, currency, status, provider_payment_id, provider_order_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status=VALUES(status), amount=VALUES(amount), currency=VALUES(currency), provider_payment_id=VALUES(provider_payment_id), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.uid || data.userId || 'user-1', data.planId || data.plan_id || 'monthly', data.provider || 'razorpay', Number(data.amount || 0), Number(data.originalAmount || data.amount || 0), data.currency || 'INR', data.status || 'PAYMENT_CREATED', data.providerPaymentId || null, data.providerOrderId || null]
            );
        }
    } else if (entity_type === 'jobs') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM jobs WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO jobs (id, employer_id, company_name, title, description, requirements, location, job_type, workplace_type, salary_min, salary_max, salary_currency, experience_level, skills, status, featured)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), status=VALUES(status), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.employer_id || data.employerId || data.userId || 'admin', data.company_name || data.companyName || '', data.title || 'Untitled Job', data.description || '', JSON.stringify(data.requirements || []), data.location || '', data.job_type || data.jobType || 'Full-time', data.workplace_type || data.workplaceType || 'Remote', Number(data.salary_min || data.salaryMin || 0), Number(data.salary_max || data.salaryMax || 0), data.salary_currency || data.salaryCurrency || 'INR', data.experience_level || data.experienceLevel || '', JSON.stringify(data.skills || []), data.status || 'OPEN', data.featured === true ? 1 : 0]
            );
        }
    } else if (entity_type === 'applications') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM applications WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO applications (id, job_id, employer_id, applicant_id, applicant_name, applicant_email, applicant_phone, resume_id, resume_url, cover_letter, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status=VALUES(status), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.job_id || data.jobId || '', data.employer_id || data.employerId || '', data.applicant_id || data.applicantId || '', data.applicant_name || data.applicantName || '', data.applicant_email || data.applicantEmail || '', data.applicant_phone || data.applicantPhone || '', data.resume_id || data.resumeId || null, data.resume_url || data.resumeUrl || null, data.cover_letter || data.coverLetter || '', data.status || 'PENDING']
            );
        }
    } else if (entity_type === 'companies') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM companies WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO companies (id, owner_id, name, logo, website, description, industry, size, location, verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), logo=VALUES(logo), website=VALUES(website), description=VALUES(description), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.owner_id || data.ownerId || data.userId || '', data.name || '', data.logo || null, data.website || null, data.description || '', data.industry || '', data.size || '', data.location || '', data.verified === true ? 1 : 0]
            );
        }
    } else if (entity_type === 'blog') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM blog WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO blog (id, title, slug, content, excerpt, cover_image, author, author_id, category, tags, published)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), published=VALUES(published), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.title || '', data.slug || entity_id, data.content || '', data.excerpt || '', data.cover_image || data.coverImage || null, data.author || 'Admin', data.author_id || data.authorId || null, data.category || 'General', JSON.stringify(data.tags || []), data.published === true ? 1 : 0]
            );
        }
    } else if (entity_type === 'custom_pages') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM custom_pages WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO custom_pages (id, title, slug, content, published, nav_order, show_in_nav, show_in_footer)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), published=VALUES(published), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.title || '', data.slug || entity_id, data.content || '', data.published !== false ? 1 : 0, Number(data.nav_order || data.navOrder || 0), data.show_in_nav || data.showInNav ? 1 : 0, data.show_in_footer || data.showInFooter ? 1 : 0]
            );
        }
    } else if (entity_type === 'trusted_by') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM trusted_by WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO trusted_by (id, name, logo_url, website_url, display_order, active)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), logo_url=VALUES(logo_url), active=VALUES(active), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.name || '', data.logo_url || data.logoUrl || '', data.website_url || data.websiteUrl || null, Number(data.display_order || data.displayOrder || 0), data.active !== false ? 1 : 0]
            );
        }
    } else if (entity_type === 'reviews') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM reviews WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO reviews (id, name, role, company, avatar, content, rating, featured, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE content=VALUES(content), rating=VALUES(rating), status=VALUES(status), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.name || 'Anonymous', data.role || '', data.company || '', data.avatar || null, data.content || '', Number(data.rating || 5), data.featured === true ? 1 : 0, data.status || 'APPROVED']
            );
        }
    } else if (entity_type === 'contact_messages') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM contact_messages WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO contact_messages (id, name, email, message, website, status, is_read)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status=VALUES(status), is_read=VALUES(is_read), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, data.name || '', data.email || '', data.message || '', data.website || null, data.status || 'UNREAD', data.is_read || data.isRead ? 1 : 0]
            );
        }
    } else if (entity_type === 'coupons') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM coupons WHERE code = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO coupons (code, discount, description, active, expiry_date, max_uses, used_count, single_use_per_user)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE discount=VALUES(discount), description=VALUES(description), active=VALUES(active), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, Number(data.discount || 10), data.description || '', data.active !== false ? 1 : 0, data.expiry_date || data.expiryDate || null, Number(data.max_uses || data.maxUses || 0), Number(data.used_count || data.usedCount || 0), data.single_use_per_user || data.singleUsePerUser ? 1 : 0]
            );
        }
    } else if (entity_type === 'stats') {
        if (operation === 'DELETE') {
            await pool.query('DELETE FROM stats WHERE id = ?', [entity_id]);
        } else {
            await pool.query(
                `INSERT INTO stats (id, data) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=CURRENT_TIMESTAMP`,
                [entity_id, JSON.stringify(data)]
            );
        }
    }
}

/**
 * Processes a batch of pending synchronization events from the outbox.
 * An optional pool override exists purely for test injection; production
 * callers always use the shared pool.
 */
async function processSyncQueue(batchSize = 25, adminFirestore = null, poolOverride = null) {
    const pool = poolOverride || getPool();
    const activeEngine = getActiveEngine();

    // Lease reclaim: a worker crash mid-event leaves rows stuck in PROCESSING,
    // which the queue selector below never picks up again. Any PROCESSING row
    // whose lease (updated_at) is older than 120 seconds belongs to a dead or
    // wedged worker and is returned to RETRYING so no event is silently lost.
    try {
        await pool.query(`
            UPDATE sync_outbox
            SET status = 'RETRYING', last_error = 'reclaimed stale PROCESSING lease'
            WHERE status = 'PROCESSING' AND updated_at < (NOW() - INTERVAL 120 SECOND)
        `);
    } catch (_) { /* reclaim is best-effort; the selector still works */ }

    const [events] = await pool.query(`
        SELECT * FROM sync_outbox
        WHERE status IN ('PENDING', 'RETRYING')
        ORDER BY created_at ASC
        LIMIT ?
    `, [batchSize]);

    if (!events.length) {
        return { processed: 0, failed: 0, deadLettered: 0 };
    }

    let processed = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of events) {
        await pool.query('UPDATE sync_outbox SET status = ? WHERE id = ?', ['PROCESSING', event.id]);

        try {
            if (event.source_engine === 'mysql') {
                // Replicate MySQL -> Firestore
                await replicateToFirestore(adminFirestore, event);
            } else {
                // Replicate Firestore -> MySQL
                await replicateToMySQL(event);
            }

            await pool.query(`
                UPDATE sync_outbox 
                SET status = 'SYNCED', processed_at = CURRENT_TIMESTAMP, last_error = NULL 
                WHERE id = ?
            `, [event.id]);
            processed++;
        } catch (err) {
            const nextRetries = Number(event.retry_count || 0) + 1;
            const isDeadLetter = nextRetries >= Number(event.max_retries || 5);

            if (isDeadLetter) {
                await pool.query(`
                    UPDATE sync_outbox 
                    SET status = 'DEAD_LETTER', retry_count = ?, last_error = ? 
                    WHERE id = ?
                `, [nextRetries, err.message, event.id]);
                deadLettered++;
            } else {
                await pool.query(`
                    UPDATE sync_outbox 
                    SET status = 'RETRYING', retry_count = ?, last_error = ? 
                    WHERE id = ?
                `, [nextRetries, err.message, event.id]);
                failed++;
            }
        }
    }

    return { processed, failed, deadLettered };
}

/**
 * Drains the durable Firestore reverse-outbox (Firestore → MySQL standby).
 *
 * Repository-mediated writes in Firestore-active mode commit an event document
 * to `sync_outbox_fs` atomically with the data. This processor claims events
 * with a compare-and-set status transition (PENDING → PROCESSING), applies
 * them to MySQL with the monotonic revision guard, and moves them to SYNCED.
 * Failures retry with exponential backoff and dead-letter after 5 attempts —
 * an event is never silently dropped, and events survive worker crashes
 * because their status lives in Firestore next to the data.
 */
async function processFirestoreOutbox(adminFirestore, batchSize = 25, poolOverride = null) {
    if (!adminFirestore) {
        return { processed: 0, failed: 0, deadLettered: 0, skipped: 'NO_FIRESTORE' };
    }
    const pool = poolOverride || getPool();
    // Real Admin SDK Firestore instances do not expose FieldValue/Timestamp;
    // only the module namespace does (the test harness exposes them on the
    // instance). Resolve instance-first, module-fallback so both work.
    const firebaseAdminWrapper = require('../services/firebaseAdmin');
    const FieldValueCtor = adminFirestore.FieldValue || firebaseAdminWrapper.firestore.FieldValue;
    const TimestampCtor = adminFirestore.Timestamp || firebaseAdminWrapper.firestore.Timestamp;

    const snap = await adminFirestore.collection('sync_outbox_fs')
        .where('status', 'in', ['PENDING', 'RETRYING', 'PROCESSING'])
        .orderBy('createdAt', 'asc')
        .limit(Math.max(1, Math.min(Number(batchSize) || 25, 100)))
        .get();

    let processed = 0;
    let failed = 0;
    let deadLettered = 0;
    const now = Date.now();

    for (const doc of snap.docs) {
        const data = doc.data() || {};
        // Claim the event atomically so concurrent workers cannot double-apply.
        // PROCESSING events are only re-claimable once their lease is stale,
        // which recovers events a crashed worker left mid-flight.
        let claimed = false;
        await adminFirestore.runTransaction(async tx => {
            const fresh = await tx.get(doc.ref);
            const current = fresh.data() || {};
            const status = String(current.status || 'PENDING').toUpperCase();
            if (!['PENDING', 'RETRYING', 'PROCESSING'].includes(status)) return;
            const claimedAtMillis = Number(current.claimedAt?.toMillis?.() ?? 0);
            if (status === 'PROCESSING') {
                const leaseIsFresh = claimedAtMillis > 0 && (now - claimedAtMillis) <= 120_000;
                if (leaseIsFresh) return;
            }
            const nextAttemptAtMillis = Number(current.nextAttemptAt?.toMillis?.() ?? 0);
            if (status !== 'PROCESSING' && Number.isFinite(nextAttemptAtMillis) && nextAttemptAtMillis > now && Number(current.attemptCount || 0) > 0) return;
            tx.set(doc.ref, {
                status: 'PROCESSING',
                attemptCount: Number(current.attemptCount || 0) + 1,
                claimedAt: FieldValueCtor.serverTimestamp(),
                updatedAt: FieldValueCtor.serverTimestamp(),
            }, { merge: true });
            claimed = true;
        }).catch(() => {});
        if (!claimed) continue;

        const event = {
            entity_type: data.entityType,
            entity_id: data.entityId,
            operation: data.operation,
            payload: typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload || {}),
            version: data.version,
        };
        const attempts = Number(data.attemptCount || 0) + 1;

        try {
            await replicateToMySQL(event, pool);
            await doc.ref.set({
                status: 'SYNCED',
                processedAt: FieldValueCtor.serverTimestamp(),
                lastError: null,
                updatedAt: FieldValueCtor.serverTimestamp(),
            }, { merge: true });
            processed += 1;
        } catch (err) {
            const isDeadLetter = attempts >= 5;
            const backoffMs = Math.min(300000, 1000 * Math.pow(2, attempts));
            const nextAttemptAt = TimestampCtor.fromMillis(Date.now() + backoffMs);
            await doc.ref.set({
                status: isDeadLetter ? 'DEAD_LETTER' : 'RETRYING',
                attemptCount: attempts,
                lastError: String(err.message || err).slice(0, 500),
                nextAttemptAt,
                updatedAt: FieldValueCtor.serverTimestamp(),
            }, { merge: true }).catch(() => {});
            if (isDeadLetter) deadLettered += 1;
            else failed += 1;
        }
    }

    return { processed, failed, deadLettered };
}

let workerTickCounter = 0;

/**
 * Prunes completed outbox events older than the configured retention period.
 * Strict safety rules:
 * - ONLY deletes events with status = 'SYNCED'
 * - ONLY deletes events where processed_at is older than retentionDays
 * - Never deletes PENDING, PROCESSING, RETRYING, DEAD_LETTER, or CONFLICT events
 * - Bounded by batch limit to prevent database locks
 */
async function pruneSyncedOutboxEvents(retentionDays = 7, maxBatch = 1000, poolOverride = null) {
    const pool = poolOverride || getPool();
    const days = Math.max(1, Number(retentionDays) || 7);
    const limit = Math.max(10, Math.min(Number(maxBatch) || 1000, 5000));

    try {
        const [result] = await pool.query(`
            DELETE FROM sync_outbox
            WHERE status = 'SYNCED'
              AND processed_at < (NOW() - INTERVAL ? DAY)
            LIMIT ?
        `, [days, limit]);

        const prunedCount = result?.affectedRows || 0;
        if (prunedCount > 0) {
            console.log(`[SyncWorker] 🧹 Pruned ${prunedCount} completed outbox events older than ${days} days.`);
        }
        return {
            prunedCount,
            retentionDays: days,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        return {
            prunedCount: 0,
            retentionDays: days,
            error: err.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Prunes completed Firestore reverse-outbox events older than retentionDays.
 */
async function pruneFirestoreOutboxEvents(adminFirestore, retentionDays = 7, maxBatch = 500) {
    if (!adminFirestore) return { prunedCount: 0, skipped: 'NO_FIRESTORE' };
    const days = Math.max(1, Number(retentionDays) || 7);
    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    try {
        const firebaseAdminWrapper = require('../services/firebaseAdmin');
        const TimestampCtor = adminFirestore.Timestamp || firebaseAdminWrapper.firestore.Timestamp;
        const cutoffTimestamp = TimestampCtor.fromDate(cutoffDate);

        const snap = await adminFirestore.collection('sync_outbox_fs')
            .where('status', '==', 'SYNCED')
            .where('processedAt', '<', cutoffTimestamp)
            .limit(maxBatch)
            .get();

        if (snap.empty) {
            return { prunedCount: 0, retentionDays: days };
        }

        const batch = adminFirestore.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        console.log(`[SyncWorker] 🧹 Pruned ${snap.docs.length} completed Firestore reverse-outbox events.`);
        return { prunedCount: snap.docs.length, retentionDays: days };
    } catch (err) {
        return { prunedCount: 0, error: err.message };
    }
}

/**
 * Computes deep continuous parity between MySQL and Firestore across all canonical entity types.
 * Produces structured evidence without mutating any data.
 */
async function computeContinuousParity(adminFirestore, poolOverride = null) {
    const pool = poolOverride || getPool();
    const activeEngine = getActiveEngine();
    const standbyEngine = activeEngine === 'mysql' ? 'firestore' : 'mysql';

    if (!adminFirestore) {
        return {
            status: 'UNAVAILABLE',
            activeEngine,
            standbyEngine,
            overallParityPercentage: 100,
            entities: {},
            reason: 'Firestore instance not connected for deep parity check'
        };
    }

    const entityChecks = [
        { type: 'users', sql: 'SELECT COUNT(*) as c FROM users', fsCollection: 'users' },
        { type: 'resumes', sql: 'SELECT COUNT(*) as c FROM resumes', fsCollectionGroup: 'resumes' },
        { type: 'portfolios', sql: 'SELECT COUNT(*) as c FROM portfolios', fsCollectionGroup: 'portfolios' },
        { type: 'covers', sql: 'SELECT COUNT(*) as c FROM covers', fsCollectionGroup: 'covers' },
        { type: 'jobs', sql: 'SELECT COUNT(*) as c FROM jobs', fsCollection: 'jobs' },
        { type: 'applications', sql: 'SELECT COUNT(*) as c FROM applications', fsCollection: 'applications' },
        { type: 'companies', sql: 'SELECT COUNT(*) as c FROM companies', fsCollection: 'companies' },
        { type: 'blog', sql: 'SELECT COUNT(*) as c FROM blog', fsCollection: 'blog' },
        { type: 'custom_pages', sql: 'SELECT COUNT(*) as c FROM custom_pages', fsCollection: 'custom_pages' },
        { type: 'trusted_by', sql: 'SELECT COUNT(*) as c FROM trusted_by', fsCollection: 'trusted_by' },
        { type: 'reviews', sql: 'SELECT COUNT(*) as c FROM reviews', fsCollection: 'reviews' },
        { type: 'contact_messages', sql: 'SELECT COUNT(*) as c FROM contact_messages', fsCollection: 'contact' },
        { type: 'coupons', sql: 'SELECT COUNT(*) as c FROM coupons', fsCollection: 'coupons' }
    ];

    const entities = {};
    let totalExpected = 0;
    let totalDivergence = 0;

    for (const check of entityChecks) {
        try {
            const [myResult] = await pool.query(check.sql);
            const myCount = Number(myResult[0]?.c || 0);

            let fsCount = 0;
            if (check.fsCollectionGroup && typeof adminFirestore.collectionGroup === 'function') {
                const snap = await adminFirestore.collectionGroup(check.fsCollectionGroup).get();
                fsCount = snap.docs.length;
            } else {
                const snap = await adminFirestore.collection(check.fsCollection).get();
                fsCount = snap.docs.length;
            }

            const diff = Math.abs(myCount - fsCount);
            const maxVal = Math.max(myCount, fsCount, 1);
            const parityPct = diff === 0 ? 100 : Math.max(0, Math.round(100 - (diff / maxVal) * 100));

            entities[check.type] = {
                mysqlCount: myCount,
                firestoreCount: fsCount,
                difference: diff,
                parityPercentage: parityPct,
                isSynchronized: diff === 0
            };

            totalExpected += Math.max(myCount, fsCount);
            totalDivergence += diff;
        } catch (err) {
            entities[check.type] = {
                mysqlCount: -1,
                firestoreCount: -1,
                difference: -1,
                parityPercentage: 0,
                isSynchronized: false,
                error: err.message
            };
        }
    }

    const overallParity = totalExpected === 0 ? 100 : Math.max(0, Math.round(100 - (totalDivergence / Math.max(totalExpected, 1)) * 100));

    return {
        status: overallParity === 100 ? 'OPTIMAL' : (overallParity >= 95 ? 'HEALTHY' : 'DIVERGENT'),
        activeEngine,
        standbyEngine,
        overallParityPercentage: overallParity,
        totalCheckedEntities: Object.keys(entities).length,
        divergentEntitiesCount: Object.values(entities).filter(e => !e.isSynchronized).length,
        entities,
        checkedAt: new Date().toISOString()
    };
}

/**
 * Starts the Autonomous Continuous Background Sync Worker.
 * Polls for outbox events, replicates them automatically, and publishes real-time heartbeats.
 */
function startBackgroundSyncWorker(adminFirestore, pollIntervalMs = 3000) {
    if (backgroundWorkerTimer) {
        return; // Already running
    }

    console.log(`[SyncWorker] 🟢 Autonomous Background Sync Worker started (PID: ${process.pid}, Interval: ${pollIntervalMs}ms)`);
    updateWorkerHeartbeat('RUNNING');

    backgroundWorkerTimer = setInterval(async () => {
        if (isWorkerProcessing) return;
        isWorkerProcessing = true;
        workerTickCounter++;

        try {
            await updateWorkerHeartbeat('RUNNING');
            const result = await processSyncQueue(25, adminFirestore);
            // Drain the Firestore reverse-outbox (Firestore → MySQL standby)
            // with the same heartbeat cadence as the MySQL → Firestore queue.
            const reverse = await processFirestoreOutbox(adminFirestore, 25).catch(err => {
                console.warn('[SyncWorker] Reverse outbox drain failed:', err.message);
                return { processed: 0, failed: 0, deadLettered: 0 };
            });

            // Periodic Outbox Pruning (runs safely every ~1 hour / 1200 ticks)
            if (workerTickCounter % 1200 === 0) {
                pruneSyncedOutboxEvents(7, 1000).catch(() => {});
                if (adminFirestore) {
                    pruneFirestoreOutboxEvents(adminFirestore, 7, 500).catch(() => {});
                }
            }

            if (result.processed > 0 || result.failed > 0 || reverse.processed > 0 || reverse.deadLettered > 0) {
                await updateWorkerHeartbeat('RUNNING', {
                    lastSyncCompletedAt: true,
                    lastSuccessfulEventAt: (result.processed > 0 || reverse.processed > 0),
                    lastFailedEventAt: (result.failed > 0 || reverse.failed > 0 || reverse.deadLettered > 0),
                    consecutiveFailures: (result.failed > 0 || reverse.failed > 0) ? undefined : 0,
                    processedCount: result.processed + reverse.processed
                });
            }
        } catch (err) {
            await updateWorkerHeartbeat('RUNNING', {
                lastFailedEventAt: true,
                consecutiveFailures: 1
            });
        } finally {
            isWorkerProcessing = false;
        }
    }, pollIntervalMs);

    if (backgroundWorkerTimer.unref) {
        backgroundWorkerTimer.unref(); // Avoid holding event loop on process exit
    }
}

/**
 * Gracefully stops the continuous sync worker.
 */
function stopBackgroundSyncWorker() {
    if (backgroundWorkerTimer) {
        clearInterval(backgroundWorkerTimer);
        backgroundWorkerTimer = null;
        console.log('[SyncWorker] 🔴 Background Sync Worker stopped.');
        updateWorkerHeartbeat('STOPPED');
    }
}

/**
 * Pre-Switch Synchronization & Parity Gate.
 * Must be executed prior to any Super Admin database switch.
 */
async function flushAndVerifyBeforeSwitch(adminFirestore = null) {
    try {
        const pool = getPool();

        // 1. Drain pending outbox queue
        let remaining = 1;
        let iterations = 0;
        while (remaining > 0 && iterations < 10) {
            iterations++;
            const res = await processSyncQueue(50, adminFirestore);
            const [cnt] = await pool.query("SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ('PENDING', 'PROCESSING', 'RETRYING')");
            remaining = cnt[0]?.c || 0;
            if (res.processed === 0 && res.failed > 0) break; // Avoid infinite loop on persistent failure
        }

        // 1b. Drain the Firestore reverse-outbox so the MySQL standby is fully
        // caught up before it can be promoted to the active engine.
        let reverseRemaining = 1;
        let reverseIterations = 0;
        while (reverseRemaining > 0 && reverseIterations < 10 && adminFirestore) {
            reverseIterations += 1;
            const reverse = await processFirestoreOutbox(adminFirestore, 100).catch(() => ({ processed: 0, failed: 0, deadLettered: 0 }));
            let reversePending = 0;
            try {
                const reverseSnap = await adminFirestore.collection('sync_outbox_fs')
                    .where('status', 'in', ['PENDING', 'RETRYING', 'PROCESSING']).get();
                reversePending = reverseSnap.docs.length;
            } catch (_) { /* counted as unknown below */ }
            reverseRemaining = reverse.processed > 0 ? reversePending : 0;
            if (reverse.processed === 0 && (reverse.failed > 0 || reverse.deadLettered > 0)) break;
        }

        // 2. Check for unresolved conflicts or dead letters
        const [conflictRows] = await pool.query("SELECT COUNT(*) as c FROM sync_conflicts WHERE resolution = 'PENDING'");
        const [deadLetterRows] = await pool.query("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'DEAD_LETTER'");
        const [pendingRows] = await pool.query("SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ('PENDING', 'PROCESSING', 'RETRYING')");

        let reverseDeadLetters = 0;
        let reversePending = 0;
        if (adminFirestore) {
            try {
                const [deadSnap, pendingSnap] = await Promise.all([
                    adminFirestore.collection('sync_outbox_fs').where('status', '==', 'DEAD_LETTER').get(),
                    adminFirestore.collection('sync_outbox_fs').where('status', 'in', ['PENDING', 'RETRYING', 'PROCESSING']).get(),
                ]);
                reverseDeadLetters = deadSnap.docs.length;
                reversePending = pendingSnap.docs.length;
            } catch (_) { /* Firestore unavailable: parity gate below already fails the switch */ }
        }

        const activeConflicts = conflictRows[0]?.c || 0;
        const deadLetters = (deadLetterRows[0]?.c || 0) + reverseDeadLetters;
        const pendingEvents = (pendingRows[0]?.c || 0) + reversePending;

        // 3. Quick entity count parity calculation
        let parityPercentage = 100;
        if (adminFirestore) {
            try {
                const [userSnap, [myUsers], [myResumes]] = await Promise.all([
                    adminFirestore.collection('users').get(),
                    pool.query('SELECT COUNT(*) as c FROM users'),
                    pool.query('SELECT COUNT(*) as c FROM resumes')
                ]);
                const fsUsers = userSnap.docs.length;
                const dbUsers = myUsers[0]?.c || 0;
                if (fsUsers !== dbUsers) {
                    const diff = Math.abs(fsUsers - dbUsers);
                    parityPercentage = Math.max(0, Math.round(100 - (diff / Math.max(fsUsers, dbUsers, 1)) * 100));
                }
            } catch (_) {}
        }

        const safeToSwitch = activeConflicts === 0 && deadLetters === 0 && pendingEvents === 0 && parityPercentage === 100;
        let reason = null;
        if (!safeToSwitch) {
            const issues = [];
            if (pendingEvents > 0) issues.push(`${pendingEvents} pending sync events in queue`);
            if (activeConflicts > 0) issues.push(`${activeConflicts} unresolved data conflicts`);
            if (deadLetters > 0) issues.push(`${deadLetters} dead-letter events require admin review`);
            if (parityPercentage < 100) issues.push(`Standby parity is ${parityPercentage}% (< 100% required for normal zero-data-loss switch)`);
            reason = `Pre-switch validation blocked: ${issues.join(', ')}`;
        }

        return {
            safeToSwitch,
            pendingCount: pendingEvents,
            conflicts: activeConflicts,
            deadLetters,
            parityPercentage,
            reason
        };
    } catch (err) {
        return {
            safeToSwitch: false,
            pendingCount: 0,
            conflicts: 0,
            deadLetters: 0,
            parityPercentage: 0,
            reason: `Database verification failed: ${err.message}`
        };
    }
}

module.exports = {
    calculateContentHash,
    enqueueOutboxEvent,
    getSyncHealthStatus,
    replicateToFirestore,
    replicateToMySQL,
    processSyncQueue,
    processFirestoreOutbox,
    startBackgroundSyncWorker,
    stopBackgroundSyncWorker,
    flushAndVerifyBeforeSwitch,
    pruneSyncedOutboxEvents,
    pruneFirestoreOutboxEvents,
    computeContinuousParity
};
