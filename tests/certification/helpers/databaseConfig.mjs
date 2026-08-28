const DISPOSABLE_DATABASE_NAME = /(?:^|[_-])(test|tests|ci|cert|certification|sandbox|scratch)(?:$|[_-])/i;

function required(environment, name, { allowEmpty = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(environment, name)) {
    throw Object.assign(new Error(`${name} is required for database-backed certification`), {
      code: 'CERTIFICATION_DATABASE_CONFIGURATION_REQUIRED',
    });
  }
  const value = String(environment[name] ?? '');
  if (!allowEmpty && !value.trim()) {
    throw Object.assign(new Error(`${name} cannot be empty for database-backed certification`), {
      code: 'CERTIFICATION_DATABASE_CONFIGURATION_REQUIRED',
    });
  }
  return value;
}

/**
 * Certification suites are mutation-capable and must never infer credentials
 * or a production-looking schema. Callers have to provide a dedicated MariaDB
 * target explicitly; an empty password is allowed only when explicitly set.
 */
export function loadCertificationDatabase(environment = process.env) {
  const host = required(environment, 'CERT_MARIADB_HOST');
  const rawPort = required(environment, 'CERT_MARIADB_PORT');
  const user = required(environment, 'CERT_MARIADB_USER');
  const password = required(environment, 'CERT_MARIADB_PASSWORD', { allowEmpty: true });
  const database = required(environment, 'CERT_MARIADB_DATABASE');
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error('CERT_MARIADB_PORT must be an integer from 1 to 65535'), {
      code: 'CERTIFICATION_DATABASE_CONFIGURATION_INVALID',
    });
  }
  if (!DISPOSABLE_DATABASE_NAME.test(database)) {
    throw Object.assign(new Error(
      'CERT_MARIADB_DATABASE must contain test, ci, cert, sandbox, or scratch; production-looking schemas are refused',
    ), { code: 'CERTIFICATION_DATABASE_NOT_DISPOSABLE' });
  }
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase());
  if (!loopback && environment.CERT_MARIADB_ALLOW_REMOTE !== 'true') {
    throw Object.assign(new Error(
      'Remote certification databases require CERT_MARIADB_ALLOW_REMOTE=true after isolation is confirmed',
    ), { code: 'CERTIFICATION_REMOTE_DATABASE_NOT_APPROVED' });
  }

  return Object.freeze({ host, port, user, password, database, name: database });
}
