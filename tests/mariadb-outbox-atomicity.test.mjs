/**
 * Transactional outbox regression entry point. Cross-component delivery is
 * represented only by durable MariaDB rows; the imported suites cover atomic
 * enqueue, idempotency conflicts, lease claims, retries, terminal DLQ, replay,
 * stale membership, tampered envelopes, and database outage behavior.
 */
import '../backend/enterprise-test/enterprise-durable-outbox.test.js';
import '../backend/test/notification-outbox.test.js';
import './certification/outbox-lifecycle.test.mjs';
