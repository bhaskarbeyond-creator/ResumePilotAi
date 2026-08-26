const { getActiveEngine } = require('../database/engineManager');
const FirestoreRepository = require('./FirestoreRepository');
const MySQLRepository = require('./MySQLRepository');
const ResilientRepository = require('./ResilientRepository');

let firestoreRepoInstance = null;
let mysqlRepoInstance = null;
let resilientRepoInstance = null;
let resilientFirestoreDb = null;

function getDirectRepository(engine, firestoreDb = null) {
    const target = engine || getActiveEngine();
    if (target === 'mysql') {
        if (!mysqlRepoInstance) mysqlRepoInstance = new MySQLRepository();
        return mysqlRepoInstance;
    }
    if (!firestoreRepoInstance || (firestoreDb && firestoreRepoInstance.db !== firestoreDb)) {
        firestoreRepoInstance = new FirestoreRepository(firestoreDb);
    }
    return firestoreRepoInstance;
}

/**
 * Factory: resilient MySQL-authoritative repository.
 *
 * Firestore is NEVER used on the synchronous application path:
 *  - `getRepository()` returns the MySQL-only ResilientRepository; the
 *    Firestore adapter is only constructed by callers that explicitly ask for
 *    it via `getDirectRepository('firestore', ...)` — i.e. the optional
 *    asynchronous standby replication worker and migration tooling.
 *  - Pass `{ direct: true }` or `{ engine: 'mysql' }` to obtain the raw MySQL
 *    adapter (used by the sync worker to target the standby).
 */
function getRepository(firestoreDb = null, options = {}) {
    if (options && options.direct === true && options.engine && options.engine !== 'mysql') {
        return getDirectRepository(options.engine, firestoreDb);
    }
    if (options && (options.direct === true || options.engine === 'mysql')) {
        return getDirectRepository('mysql', firestoreDb);
    }

    if (!mysqlRepoInstance) mysqlRepoInstance = new MySQLRepository();

    if (!resilientRepoInstance || resilientFirestoreDb !== firestoreDb) {
        resilientRepoInstance = new ResilientRepository({
            mysqlRepo: mysqlRepoInstance,
            firestoreRepo: null,
            firestoreDb: null,
        });
        resilientFirestoreDb = firestoreDb;
    }
    return resilientRepoInstance;
}

module.exports = {
    getRepository,
    getDirectRepository,
    getActiveEngine,
    FirestoreRepository,
    MySQLRepository,
    ResilientRepository,
};
