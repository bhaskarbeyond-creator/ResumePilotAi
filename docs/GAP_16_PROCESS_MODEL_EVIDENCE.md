# Process / Worker Model — GAP-16

**Status:** 🟢 COMPLETE (single instance is intentional and evidenced; no unsafe cluster mode)

## Current production PM2 model

`ecosystem.config.js`:

- `resumepilot-backend`
- `instances: 1`
- `exec_mode: 'fork'`
- `max_memory_restart: '600M'`
- `autorestart: true`

## Why a single fork process is appropriate for this deployment

1. **In-memory rate limiters.** The application keeps global, auth, and per-account rate-limit counters in process memory. A multi-process/PM2 cluster would duplicate those counters, allowing N× the intended request budget across workers.
2. **Per-instance worker flags.** The notification outbox, CMS scheduler, enterprise outbox, and tenant GC workers are individually gated. Running those as `false` in a cluster does not duplicate them, but the in-memory limiter duplication remains a correctness risk.
3. **MariaDB is the authoritative coordination layer.** The outbox uses a transactional MariaDB queue with leases/hooks; it does not require in-memory cross-process coordination for correctness.
4. **Hosting model.** The current Hostinger deployment is a single-region, single-instance app. There is no evidence of throughput or memory saturation that would justify cluster mode, and there is no existing Redis/native in-process cache replacement for the limiter state.
5. **Graceful shutdown.** `SIGINT`/`SIGTERM` handling drains connections before exit; `autorestart` covers crash safety.

## Scaling path (only when evidence justifies it)

- Move rate-limit counters to MariaDB atomic counters (or an approved cache) so cluster workers share one budget.
- Then set `instances: 'max'` / `exec_mode: 'cluster'` behind load-test evidence.
- Re-run outbox/worker leak tests with `NOTIFICATION_OUTBOX_WORKER_ENABLED` since worker duplication must be prevented.

## Evidence

- `ecosystem.config.js` (instances 1 / fork).
- `npm run dr:test` and `npm run test:security` regression gates pass with this model.
- `scripts/load-test.mjs` (new) can produce the reproducible baseline needed before changing this model.
