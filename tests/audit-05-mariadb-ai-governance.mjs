/**
 * Current AI-governance audit entry point. Exercises tenant-scoped MariaDB
 * usage accounting, quota isolation, policy enforcement, and concurrent
 * consumption. Mock-provider results do not certify external AI providers.
 */
import '../backend/enterprise-test/mysql-enterprise-ai-ledger.test.js';
import '../backend/enterprise-test/tenant-scale-contract.test.js';
import '../backend/test/ai-abuse.test.js';
