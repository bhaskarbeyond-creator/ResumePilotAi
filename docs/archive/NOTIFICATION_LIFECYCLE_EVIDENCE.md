# Notification lifecycle evidence

Date: 2026-08-15

## Trusted production boundary

Job application, application-status, moderation, and message recipients are derived from backend-owned job/application/conversation relationships. Browser notification creation is denied. Applicant identity comes from Firebase token claims; employer and message recipients come from persisted ownership/participant records.

In-app records use deterministic event IDs for application creation and revisioned status events. Repeated submission/status requests therefore cannot create unintended duplicates, while a later legitimate status revision creates a distinct event. Message events use the server-created message key.

## State vocabulary

- `NOTIFICATION_CREATED`: the in-app record committed.
- `NOT_REQUESTED`: no external delivery channel was requested for that in-app record.
- `DELIVERY_ATTEMPTED`: SMTP accepted the provider request; final mailbox delivery is not claimed.
- `DELIVERY_FAILED`: configuration, dispatcher, or provider attempt failed.
- `NOTIFICATION_CREATION_FAILED`: a message persisted but its separate in-app notification could not be created.

Application and status email events are written atomically with business state to the server-only `notification_outbox` collection. Deterministic IDs prevent duplicate sends. An explicitly enabled worker claims due records with Firestore transactions and expiring leases, making multiple instances safe; failures use bounded exponential backoff for five attempts before `DEAD_LETTER`. Provider acceptance ends retries at `DELIVERY_ATTEMPTED` and is never called mailbox delivery. Production must enable and monitor the worker; disabled worker state leaves records truthfully `NOTIFICATION_QUEUED`.

## Account isolation and consumption

Unread counts use an owner-scoped Firestore listener rather than polling. Listener callbacks and manual refreshes verify both an auth generation and the active Firebase UID. Account changes immediately reset the count and unsubscribe the prior listener. The panel uses the same owner-scoped listener and clears notifications only after confirmed read updates; partial failures remain visible.

## External validation

SMTP/provider acceptance is not final delivery confirmation. Live bounce, complaint, suppression, delivery webhook behavior, worker deployment/alerts, dead-letter operations, and staging browser behavior remain unvalidated and require provider credentials and production topology.
