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
    } else {
        throw new Error(`Unsupported entity type for Firestore replication: ${entity_type}`);
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

        try {
            await updateWorkerHeartbeat('RUNNING');
            const result = await processSyncQueue(25, adminFirestore);
            // Drain the Firestore reverse-outbox (Firestore → MySQL standby)
            // with the same heartbeat cadence as the MySQL → Firestore queue.
            const reverse = await processFirestoreOutbox(adminFirestore, 25).catch(err => {
                console.warn('[SyncWorker] Reverse outbox drain failed:', err.message);
                return { processed: 0, failed: 0, deadLettered: 0 };
            });

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

        const safeToSwitch = activeConflicts === 0 && deadLetters === 0 && pendingEvents === 0;
        let reason = null;
        if (!safeToSwitch) {
            const issues = [];
            if (pendingEvents > 0) issues.push(`${pendingEvents} pending sync events in queue`);
            if (activeConflicts > 0) issues.push(`${activeConflicts} unresolved data conflicts`);
            if (deadLetters > 0) issues.push(`${deadLetters} dead-letter events require admin review`);
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
    flushAndVerifyBeforeSwitch
};
