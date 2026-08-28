'use strict';

const MySQLRepository = require('./MySQLRepository');
const ResilientRepository = require('./ResilientRepository');

let mysqlRepoInstance = null;
let resilientRepoInstance = null;
let testRepositoryOverride = null;

function mysqlRepository() {
    if (!mysqlRepoInstance) mysqlRepoInstance = new MySQLRepository();
    return mysqlRepoInstance;
}

/** Application repository factory for the sole MariaDB data owner. */
function getRepository() {
    if (testRepositoryOverride) return testRepositoryOverride;
    if (!resilientRepoInstance) {
        resilientRepoInstance = new ResilientRepository({ mysqlRepo: mysqlRepository() });
    }
    return resilientRepoInstance;
}

/** Direct access exists only for transaction-aware internal services. */
function getDirectRepository() {
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
