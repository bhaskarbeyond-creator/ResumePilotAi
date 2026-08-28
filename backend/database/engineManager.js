'use strict';

const { testConnection: testMariaDbConnection } = require('./mysql');

/** MariaDB is a compile-time architecture decision, not mutable runtime state. */
async function testEngineConnectivity(engine = 'mysql') {
    const target = String(engine || '').trim().toLowerCase();
    if (!['mysql', 'mariadb'].includes(target)) {
        return {
            connected: false,
            latencyMs: 0,
            error: `Unsupported database engine: ${target || '(empty)'}`,
            code: 'DATABASE_ENGINE_UNSUPPORTED',
        };
    }
    return testMariaDbConnection();
}

async function getEngineStateConsistency() {
    const connectivity = await testMariaDbConnection();
    return {
        runtimeEngine: 'mysql',
        configuredOwner: 'mysql',
        databaseEngineState: 'mysql',
        databaseReachable: connectivity.connected === true,
        databaseError: connectivity.connected ? null : connectivity.error || 'Connection failed',
        diverged: false,
        mutable: false,
    };
}

module.exports = {
    testEngineConnectivity,
    getEngineStateConsistency,
};
