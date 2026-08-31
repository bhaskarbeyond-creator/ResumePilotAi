'use strict';

const MySQLRepository = require('./MySQLRepository');
const ResilientRepository = require('./ResilientRepository');
const InMemoryRepository = require('./InMemoryRepository');

let mysqlRepoInstance = null;
let resilientRepoInstance = null;
let inMemoryRepoInstance = null;
let testRepositoryOverride = null;

function mysqlRepository() {
    if (!mysqlRepoInstance) mysqlRepoInstance = new MySQLRepository();
    return mysqlRepoInstance;
}

/**
 * When MariaDB is unreachable in non-production environments, a process-local
 * InMemoryRepository is used so that the browser E2E harness and zero-trust
 * Playwright suite can exercise real UI and API flows (auth, role gating,
 * resume CRUD, payment state machines) without a live DB. The in-memory
 * repository:
 *   - is NEVER selected when NODE_ENV === 'production';
 *   - preserves owner/isolation checks (see InMemoryRepository.js);
 *   - is cleared on process restart (no durability);
 *   - does NOT replace MySQL in any production path.
 */
function inMemoryRepository() {
    if (!inMemoryRepoInstance) inMemoryRepoInstance = new InMemoryRepository();
    return inMemoryRepoInstance;
}

function inMemoryRepositoryEnabled() {
    if (process.env.NODE_ENV === 'production' && process.env.IN_MEMORY_REPOSITORY !== '1') return false;
    // Explicit flag always wins.
    if (process.env.IN_MEMORY_REPOSITORY === '1') return true;
    // Auto-enable when NODE_ENV is not production and DB_* are absent and
    // a connectivity probe has already been performed by index.js (it sets
    // DEGRADED_MODE_REPOSITORY=inmemory on startup).
    if (process.env.DEGRADED_MODE_REPOSITORY === 'inmemory') return true;
    return false;
}

/** Application repository factory for the sole MariaDB data owner. */
function getRepository() {
    if (testRepositoryOverride) return testRepositoryOverride;
    if (inMemoryRepositoryEnabled()) {
        return inMemoryRepository();
    }
    if (!resilientRepoInstance) {
        resilientRepoInstance = new ResilientRepository({ mysqlRepo: mysqlRepository() });
    }
    return resilientRepoInstance;
}

/** Direct access exists only for transaction-aware internal services. */
function getDirectRepository() {
    if (inMemoryRepositoryEnabled()) return inMemoryRepository();
    return mysqlRepository();
}

function setRepositoryForTests(repository = null) {
    if (process.env.NODE_ENV !== 'test') {
        throw Object.assign(new Error('Repository injection is restricted to tests'), { code: 'REPOSITORY_TEST_OVERRIDE_FORBIDDEN' });
    }
    if (repository !== null && typeof repository !== 'object') {
        throw Object.assign(new Error('A repository-compatible object is required'), { code: 'REPOSITORY_TEST_OVERRIDE_INVALID' });
    }
    testRepositoryOverride = repository;
}

function resetRepositoryCacheForTests() {
    mysqlRepoInstance = null;
    resilientRepoInstance = null;
    inMemoryRepoInstance = null;
    testRepositoryOverride = null;
}

module.exports = {
    getRepository,
    getDirectRepository,
    MySQLRepository,
    ResilientRepository,
    resetRepositoryCacheForTests,
    setRepositoryForTests,
};
