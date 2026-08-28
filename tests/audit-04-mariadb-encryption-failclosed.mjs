/**
 * Current encryption audit entry point. Exercises encrypted MariaDB resource
 * persistence, tenant isolation, missing-key failure, rotation behavior, and
 * the explicit refusal to claim an unimplemented managed KMS.
 */
import '../backend/enterprise-test/enterprise-mariadb-dataplane.test.js';
import '../backend/enterprise-test/enterprise-mariadb-isolation.test.js';
import '../backend/enterprise-test/enterprise-secrets-hardening.test.js';
