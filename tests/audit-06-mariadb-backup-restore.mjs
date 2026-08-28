/**
 * Current backup/restore audit entry point. Deterministic suites validate
 * checksums, tenant scope, collision rollback, dry-run/apply behavior, and
 * complete-table reconciliation. The certification suite records a real drill
 * as NOT VERIFIED unless its explicit infrastructure gate is enabled.
 */
import '../backend/enterprise-test/enterprise-backup-restore.test.js';
import '../backend/test/enterprise-backup-v3.test.js';
import './certification/backup-restore.test.mjs';
