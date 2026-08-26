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
 * Factory: resilient dual-engine repository by default.
 *
 * Pass `{ direct: true }` or `{ engine: 'mysql'|'firestore' }` to obtain a
 * single-engine adapter (used by the sync worker, which must target a
 * specific standby).
 */
function getRepository(firestoreDb = null, options = {}) {
    if (options && (options.direct === true || options.engine)) {
        return getDirectRepository(options.engine || getActiveEngine(), firestoreDb);
    }

    if (!mysqlRepoInstance) mysqlRepoInstance = new MySQLRepository();
    if (!firestoreRepoInstance || (firestoreDb && firestoreRepoInstance.db !== firestoreDb)) {
        firestoreRepoInstance = new FirestoreRepository(firestoreDb);
    }

    if (!resilientRepoInstance || resilientFirestoreDb !== firestoreDb) {
        resilientRepoInstance = new ResilientRepository({
            mysqlRepo: mysqlRepoInstance,
            firestoreRepo: firestoreRepoInstance,
            firestoreDb,
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
