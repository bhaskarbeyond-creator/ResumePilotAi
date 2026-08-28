/**
 * Current queue/DLQ audit entry point. These imported suites exercise the
 * MariaDB transactional enterprise and notification outboxes, including
 * idempotency, leases, retry, dead letter, replay, tamper rejection, and
 * authoritative-store failure. Component harness results are not live proof.
 */
import '../backend/enterprise-test/enterprise-durable-outbox.test.js';
import './certification/outbox-lifecycle.test.mjs';
