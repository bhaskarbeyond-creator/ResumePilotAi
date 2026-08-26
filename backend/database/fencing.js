'use strict';

/**
 * Distributed write-generation / fencing token.
 *
 * In-memory authority is not sufficient for multi-instance production.
 * Every failover bumps a monotonic generation. Writers that observe a
 * stale generation must not commit. A lease prevents two processes from
 * independently declaring themselves write-authority at the same time.
 *
 * Durability: the in-memory store is the source of truth within a process
 * group (tests inject a shared store). When MariaDB is reachable the same
 * record is CAS-updated in `database_authority` so a second backend process
 * cannot silently run a competing generation.
 */

const crypto = require('crypto');

const LEASE_TTL_MS = Number(process.env.DB_AUTHORITY_LEASE_MS || 15000);
const INSTANCE_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

function emptyStore(overrides = {}) {
    return {
        generation: Number(overrides.generation || 1),
        operationalWriteEngine: overrides.operationalWriteEngine || 'mysql',
        mode: overrides.mode || 'NORMAL',
        leaseOwner: overrides.leaseOwner || null,
        leaseExpiresAt: Number(overrides.leaseExpiresAt || 0),
        lastReason: overrides.lastReason || null,
        updatedAt: overrides.updatedAt || new Date().toISOString(),
    };
}

let store = emptyStore();

function getStore() {
    return store;
}

function currentGeneration() {
    return Number(store.generation || 1);
}

function currentFence() {
    return {
        generation: currentGeneration(),
        operationalWriteEngine: store.operationalWriteEngine,
        leaseOwner: store.leaseOwner,
        leaseExpiresAt: store.leaseExpiresAt,
        instanceId: INSTANCE_ID,
        mode: store.mode,
    };
}

function assertFence(expectedGeneration) {
    if (expectedGeneration === undefined || expectedGeneration === null) {
        return currentGeneration();
    }
    if (Number(expectedGeneration) !== Number(store.generation)) {
        const err = new Error('STALE_FENCE_GENERATION');
        err.code = 'STALE_FENCE_GENERATION';
        err.status = 409;
        err.currentGeneration = store.generation;
        err.expectedGeneration = expectedGeneration;
        throw err;
    }
    return store.generation;
}

function acquireLease(instanceId = INSTANCE_ID, now = Date.now()) {
    if (store.leaseOwner && store.leaseOwner !== instanceId && Number(store.leaseExpiresAt) > now) {
        return {
            acquired: false,
            owner: store.leaseOwner,
            generation: currentGeneration(),
            expiresAt: store.leaseExpiresAt,
        };
    }
    store.leaseOwner = instanceId;
    store.leaseExpiresAt = now + LEASE_TTL_MS;
    store.updatedAt = new Date(now).toISOString();
    return {
        acquired: true,
        owner: instanceId,
        generation: currentGeneration(),
        expiresAt: store.leaseExpiresAt,
    };
}

function renewLease(instanceId = INSTANCE_ID, now = Date.now()) {
    if (store.leaseOwner && store.leaseOwner !== instanceId && Number(store.leaseExpiresAt) > now) {
        return { renewed: false, owner: store.leaseOwner, generation: currentGeneration() };
    }
    store.leaseOwner = instanceId;
    store.leaseExpiresAt = now + LEASE_TTL_MS;
    return { renewed: true, owner: instanceId, generation: currentGeneration(), expiresAt: store.leaseExpiresAt };
}

function releaseLease(instanceId = INSTANCE_ID) {
    if (store.leaseOwner === instanceId) {
        store.leaseOwner = null;
        store.leaseExpiresAt = 0;
    }
}

/**
 * CAS bump. Returns the new generation if this caller won, or the current
 * generation if another caller already advanced past `expectedGeneration`.
 */
function bumpGeneration({ reason, writeEngine, expectedGeneration, mode, instanceId = INSTANCE_ID } = {}) {
    const expected = expectedGeneration === undefined ? store.generation : Number(expectedGeneration);
    if (Number(store.generation) !== expected) {
        return {
            won: false,
            generation: store.generation,
            operationalWriteEngine: store.operationalWriteEngine,
            reason: 'generation_already_advanced',
        };
    }
    store.generation = expected + 1;
    if (writeEngine) store.operationalWriteEngine = writeEngine;
    if (mode) store.mode = mode;
    store.lastReason = reason || null;
    store.leaseOwner = instanceId;
    store.leaseExpiresAt = Date.now() + LEASE_TTL_MS;
    store.updatedAt = new Date().toISOString();
    persistBestEffort();
    return {
        won: true,
        generation: store.generation,
        operationalWriteEngine: store.operationalWriteEngine,
        reason: store.lastReason,
    };
}

function snapshot() {
    return { ...store, instanceId: INSTANCE_ID, leaseTtlMs: LEASE_TTL_MS };
}

function persistBestEffort() {
    try {
        const { getPool } = require('./mysql');
        const pool = getPool();
        pool.query(
            `INSERT INTO database_authority (id, generation, write_engine, mode, lease_owner, lease_expires_at, reason, updated_at)
             VALUES ('global', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
               generation = IF(VALUES(generation) >= generation, VALUES(generation), generation),
               write_engine = IF(VALUES(generation) >= generation, VALUES(write_engine), write_engine),
               mode = IF(VALUES(generation) >= generation, VALUES(mode), mode),
               lease_owner = VALUES(lease_owner),
               lease_expires_at = VALUES(lease_expires_at),
               reason = VALUES(reason),
               updated_at = CURRENT_TIMESTAMP`,
            [
                store.generation,
                store.operationalWriteEngine,
                store.mode,
                store.leaseOwner,
                store.leaseExpiresAt,
                store.lastReason,
            ]
        ).catch(() => { /* table may not exist yet */ });
    } catch {
        /* mysql2 / pool unavailable — in-memory fence still protects this process */
    }
}

function __useSharedStore(shared) {
    store = shared;
}

function __resetForTests(overrides = {}) {
    store = emptyStore(overrides);
}

module.exports = {
    INSTANCE_ID,
    LEASE_TTL_MS,
    getStore,
    currentGeneration,
    currentFence,
    assertFence,
    acquireLease,
    renewLease,
    releaseLease,
    bumpGeneration,
    snapshot,
    persistBestEffort,
    __useSharedStore,
    __resetForTests,
};
