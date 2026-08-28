'use strict';

const DISPOSABLE_DATABASE_NAME = /(?:^|[_-])(?:test|tests|ci|cert|certification|sandbox|scratch)(?:[_-]|$)/i;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function required(environment, name, { allowEmpty = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(environment, name)) {
    throw new Error(`${name} is required for MariaDB integration tests`);
  }
  const value = String(environment[name] ?? '');
  if (!allowEmpty && !value.trim()) throw new Error(`${name} cannot be empty for MariaDB integration tests`);
  return value;
}

/**
 * Load a mutation-capable integration target without defaults. Even when the
 * opt-in gate is set accidentally, production-looking schemas and unapproved
 * remote hosts are refused before a connection is attempted.
 */
function loadDisposableMariaDb(environment = process.env, { destructive = false } = {}) {
  if (environment.NODE_ENV !== 'test') throw new Error('MariaDB integration tests require NODE_ENV=test');
  if (destructive && environment.MARIADB_TEST_ALLOW_RESET !== 'true') {
    throw new Error('Destructive MariaDB integration requires MARIADB_TEST_ALLOW_RESET=true');
  }

  const host = required(environment, 'DB_HOST');
  const port = Number(required(environment, 'DB_PORT'));
  const user = required(environment, 'DB_USER');
  const password = required(environment, 'DB_PASSWORD', { allowEmpty: true });
  const database = required(environment, 'DB_NAME');

  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be an integer from 1 to 65535');
  if (!DISPOSABLE_DATABASE_NAME.test(database)) {
    throw new Error('DB_NAME must explicitly contain test, ci, cert, sandbox, or scratch');
  }
  if (!LOOPBACK_HOSTS.has(host.toLowerCase()) && environment.MARIADB_TEST_ALLOW_REMOTE !== 'true') {
    throw new Error('Remote MariaDB integration requires MARIADB_TEST_ALLOW_REMOTE=true');
  }

  return Object.freeze({ host, port, user, password, database });
}

module.exports = { DISPOSABLE_DATABASE_NAME, LOOPBACK_HOSTS, loadDisposableMariaDb };
