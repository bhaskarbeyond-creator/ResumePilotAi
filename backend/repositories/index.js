const { getActiveEngine } = require('../database/engineManager');
const FirestoreRepository = require('./FirestoreRepository');
const MySQLRepository = require('./MySQLRepository');

let firestoreRepoInstance = null;
let mysqlRepoInstance = null;

/**
 * Factory function to retrieve the active repository for the application.
 * @param {object} firestoreDb - Optional reference to Firebase Firestore admin db
 * @returns {FirestoreRepository | MySQLRepository}
 */
function getRepository(firestoreDb = null) {
    const engine = getActiveEngine();
    
    if (engine === 'mysql') {
        if (!mysqlRepoInstance) {
            mysqlRepoInstance = new MySQLRepository();
        }
        return mysqlRepoInstance;
    }

    // Default: Firestore
    if (!firestoreRepoInstance || (firestoreDb && firestoreRepoInstance.db !== firestoreDb)) {
        firestoreRepoInstance = new FirestoreRepository(firestoreDb);
    }
    return firestoreRepoInstance;
}

module.exports = {
    getRepository,
    getActiveEngine,
    FirestoreRepository,
    MySQLRepository,
};
