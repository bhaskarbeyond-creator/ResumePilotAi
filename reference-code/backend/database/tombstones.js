'use strict';

const { createMutationId } = require('./canonical');

async function recordTombstone(pool, { entityType, entityId, version, mutationId, sourceEngine }) {
    try {
        await pool.query(
            `INSERT INTO sync_tombstones (entity_type, entity_id, version, mutation_id, source_engine)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               version = IF(VALUES(version) >= version, VALUES(version), version),
               mutation_id = VALUES(mutation_id),
               source_engine = VALUES(source_engine),
               deleted_at = CURRENT_TIMESTAMP`,
            [entityType, String(entityId), Number(version || 1), mutationId || createMutationId('ev'), sourceEngine || 'mysql']
        );
    } catch (_) { /* table may not exist yet on a legacy deployment */ }
}

async function isTombstoned(pool, entityType, entityId, incomingVersion) {
    try {
        const [rows] = await pool.query(
            'SELECT version FROM sync_tombstones WHERE entity_type = ? AND entity_id = ? LIMIT 1',
            [entityType, String(entityId)]
        );
        if (!rows.length) return false;
        const tombstoneVersion = Number(rows[0].version || 0);
        return tombstoneVersion >= Number(incomingVersion || 0);
    } catch (_) {
        return false;
    }
}

async function rememberMutation(pool, { mutationId, entityType, entityId, operation, sourceEngine }) {
    if (!mutationId) return false;
    try {
        await pool.query(
            `INSERT INTO processed_mutations (mutation_id, entity_type, entity_id, operation, source_engine)
             VALUES (?, ?, ?, ?, ?)`,
            [mutationId, entityType, String(entityId), operation || 'UPSERT', sourceEngine || 'mysql']
        );
        return false;
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || Number(err.errno) === 1062)) return true;
        return false;
    }
}

module.exports = {
    recordTombstone,
    isTombstoned,
    rememberMutation,
};
