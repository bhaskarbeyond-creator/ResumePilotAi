# Deployment / Release Identity — GAP-19

**Status:** 🟢 COMPLETE for verifiable single-instance deployment; no HA is added without evidence.

## Verified lifecycle chain

- **SOURCE → BUILD → TEST → BACKUP → MIGRATION → DEPLOY → RESTART → HEALTH → READY → VERSION → IDENTITY → ROLLBACK**

| Stage | Mechanism | Evidence |
|---|---|---|
| Source | merge through `main`, commit SHA preserved | `git rev-parse HEAD` |
| Build | `npm run build` (Vite frontend) + backend `npm ci` | `npm run build` |
| Test | `npm test`, `db:verify`, `dr:test`, `security` | scripts in `package.json` |
| Migration | checksummed MariaDB migrations under `backend/database/migrations/` | `mariadb-migration-gate.test.js` |
| Deploy | PM2 restore + release script (documented in `docs/PRODUCTION_RUNBOOK.md`) | operator-owned |
| Restart | single-instance PM2 fork + `autorestart` | `ecosystem.config.js` |
| Health | `/api/healthz` returns DB/authority status | live endpoint |
| Ready | `/api/readyz` returns MariaDB/schema/identity readiness | live endpoint |
| Version/identity | `/api/platform/version` returns `commitSha`, `frontendBuildSha`, `releaseIdentity.{backendSha,frontendSha,aligned,verified}` | `backend/routes/platform.js` |
| Rollback | `scripts/verify-backup-rollback.mjs` checks a target SHA against `/api/platform/version` | script + `docs/BACKUP_RUNBOOK.md` |

## Production evidence (2026-08-29)

`https://airesume.projectdemo.guru/api/platform/version` returned:

```
commitSha: 734908666f8755b16c4c1693ed5b0615101db600
frontendBuildSha: 734908666f8755b16c4c1693ed5b0615101db600
releaseIdentity: { backendSha: 7349086..., frontendSha: 7349086..., aligned: true, verified: true }
```

`/api/healthz` and `/api/readyz` report `MARIADB`, Firestore data plane `REMOVED`, and MySQL READY.

## Why no blue-green / dual-port HA was added

The current provider is a single Hostinger VPS and the production safety requirement explicitly says **do not introduce HA simply for terminology**. Single-instance PM2 deploy + verifiable rollback is the correct model for this environment. Blue-green would require a second compute target, shared provisioning, and an Nginx dual-upstream configuration that cannot be certified from this sandbox.

## Rollback operation

```sh
EXPECTED_SHA=<previous-verified-sha> npm run certify:identity
```
