# ResumePilot AI — Cloud / SRE Production Infrastructure Certification

**Assessment date:** 2026-08-29 UTC  
**Assessed checkout:** `arena/01a04b4f-resumepilotai`  
**Local checkout HEAD:** `8221127ecab7fd43d2e9ab322dc7b029546d4392`  
**Requested live release:** `07bd9b4b52f9ad44887b723e5f2485dddbe0ca29`

## Certification decision

**DEFERRED — CLOUD/SRE CERTIFICATION NOT GRANTED.**

This assessment could not independently certify the live server because no authorized deployment credential material was available to this execution environment, and the public production endpoint failed TLS/HTTP connectivity checks. The requested release SHA is also not present in the available shallow Git checkout. No production mutation, reboot, SSH attempt, database connection, or destructive operation was performed.

Material blockers:

1. `https://airesume.projectdemo.guru` returned `OpenSSL SSL_connect: SSL_ERROR_SYSCALL`; HTTP port 80 accepted a connection but returned an empty reply. Therefore live API, frontend, TLS, headers, proxy, and smoke checks are **NOT VERIFIED**.
2. The environment contained no deployment/server credential variables and `~/.ssh` contained no usable deployment identity/known-host evidence. Therefore host, OS, PM2, MariaDB, firewall, backups, cron, logs, resource, SSH, and boot persistence checks are **NOT VERIFIED**.
3. Requested release `07bd9b4b52f9ad44887b723e5f2485dddbe0ca29` is not an object in the available repository (`git show` returned `fatal: bad object`). Release identity cannot be reconciled from this checkout.

## Evidence collected

- `git status --short --branch`: clean; branch `arena/01a04b4f-resumepilotai`.
- `git rev-parse HEAD`: `8221127ecab7fd43d2e9ab322dc7b029546d4392`.
- `git branch -a`: only local/remote `main` and this Arena branch were available.
- `git show 07bd9b4b52f9ad44887b723e5f2485dddbe0ca29`: object unavailable.
- Environment variable census found only `E2B_SANDBOX` and `E2B_SANDBOX_ID` among deployment/server-related names; values were not printed.
- DNS lookup resolved the hostname through Cloudflare: A records `104.21.83.170`, `172.67.179.60`; AAAA records were also returned. This is DNS evidence only, not origin-server identity.
- `curl -I https://airesume.projectdemo.guru`: TLS connection failed with `SSL_ERROR_SYSCALL`.
- `openssl s_client -connect ...:443 -servername ...`: unexpected EOF during TLS.
- `curl -I http://airesume.projectdemo.guru`: TCP connected to `172.67.179.60:80`, then received an empty reply.
- `gh run list --workflow production-release.yml`: no runs returned for this repository context.

## Control-by-control result

| Control | Result | Evidence / limitation |
|---|---|---|
| Server identity: hostname, OS, CPU, RAM, disk, filesystem, uptime, time, timezone, interfaces, ports | NOT VERIFIED | No authorized SSH access available. |
| Production release identity, directory, artifacts, frontend build SHA | NOT VERIFIED | No server access; requested SHA absent from checkout; public API unreachable. |
| `/api/platform/version`, `/api/healthz`, `/api/readyz` | NOT VERIFIED | All HTTPS requests failed before HTTP response. |
| PM2 process, supervision, restart behavior, memory/CPU, cwd/interpreter | NOT VERIFIED | No server access. |
| PM2 startup persistence / reboot behavior | NOT VERIFIED | No server access; no reboot attempted. |
| Deployment pipeline design | VERIFIED | `.github/workflows/production-release.yml`, `scripts/production-release-client.sh`, and `ops/deploy/forced-command-gateway.sh` show manual workflow dispatch, main ancestry checks, approval environment, pinned host keys, signed allow-listed bundles, staging, health gates, and cleanup. This verifies source controls, not their live configuration. |
| Backup-first / migration-safe / rollback-capable source workflow | VERIFIED | Workflow runs isolated migration checks before delivery; source runbook states server-side backup and atomic activation/rollback controls. Actual production execution remains unverified. |
| Deployment secrets committed or frontend embedded | PARTIAL | Workflow uses GitHub environment secrets and explicitly rejects credential-shaped release files. No values were printed. Git history/live GitHub secret configuration and built production bundle were not independently exhaustively verified here. |
| Firewall and externally reachable ports | NOT VERIFIED | Cloudflare DNS was observed, but origin port exposure requires authorized server/provider inspection. |
| TLS certificate, chain, expiry, protocol, redirect, headers, HSTS | NOT VERIFIED | TLS handshake failed; no certificate was obtained. |
| Reverse proxy, upstream, limits, logs, static routing | NOT VERIFIED | No origin access and no HTTP response. |
| MariaDB service/version/bind/port/connections/logs/persistence | NOT VERIFIED | No server/database credentials or access. Source establishes MariaDB as intended datastore only. |
| Database backups: schedule, retention, destination, permissions, recent artifact | NOT VERIFIED | Repository scripts/docs are not proof of a running production schedule or artifact. |
| Isolated restore drill | NOT VERIFIED | No isolated production backup or restore environment was available. No live data was touched. |
| Cron/systemd timers/backup/cleanup/renewal jobs | NOT VERIFIED | No server access. |
| Logging and rotation | NOT VERIFIED | No server access. |
| CPU/RAM/swap/disk/inodes/headroom | NOT VERIFIED | No server access. |
| SSH hardening, root/password login, keys, sudo, packages | NOT VERIFIED | No server access. Source runbook specifies intended controls but does not prove deployment. |
| Deployment/rollback drill | NOT VERIFIED | No safe live or isolated production target/credentials. Source workflow controls were inspected. |
| Firestore/Firebase infrastructure census | PARTIAL | Source census/architecture inspected: Firebase Authentication is expected and enterprise data provider is `mysql`; runtime/cloud connections were not independently observed. |
| PostgreSQL infrastructure census | NOT VERIFIED | No server/cloud runtime access; source search found no proof of an active PostgreSQL service. |
| DNS records and origin mapping | PARTIAL | Public DNS resolved through Cloudflare to the listed A/AAAA records. Origin target, alternate endpoints, and proxy mapping were not verified. |
| Monitoring and alerting | NOT VERIFIED | No server/provider/GitHub monitoring access; no alert delivery test. |
| Disaster recovery: actual RPO/RTO and dependencies | NOT VERIFIED | Backup age, restore duration, and recovery execution unavailable. |
| Final HTTPS/frontend/auth/API smoke | NOT VERIFIED | Public TLS failure prevented all smoke checks. |
| Final SHA consistency | NOT VERIFIED | Requested SHA unavailable locally and live endpoint unreachable. |

## Source-level positive controls observed

- Production workflow is manual (`workflow_dispatch`) and constrained to `main`.
- Deploy mode accepts only current `main`; rollback accepts a commit in `main` history and requires a separate confirmation phrase.
- Workflow checks out delivery tooling from `main`, not from the rollback application revision.
- SSH client requires `BatchMode`, `IdentitiesOnly`, password and keyboard-interactive authentication disabled, strict host-key checking, and a pinned `known_hosts` entry.
- Deployment gateway accepts only `status` or a strictly formatted signed release command; arbitrary shell commands are denied.
- Release bundle creation is allow-listed and checks frontend build identity and credential-shaped files.
- Workflow uploads non-secret receipts with finite retention and removes ephemeral SSH material in an `always()` cleanup step.

These are **source-control observations**, not live certification evidence.

## Required unblock / retest procedure

1. Restore or provide the authorized deployment identity, pinned `known_hosts`, server host/user/port, and read-only production inspection access through the protected environment; do not place secrets in chat or Git.
2. Confirm the exact intended release SHA is reachable from the trusted repository and reconcile it with `origin/main` and the server receipt.
3. Repair or explain the failed public TLS/HTTP path before application smoke testing; verify Cloudflare/origin health and certificate configuration.
4. Run the read-only server census, PM2/MariaDB/firewall/cron/log/resource/SSH checks.
5. Inspect actual backup artifacts and perform a non-production isolated restore. If unavailable, retain **NOT VERIFIED**.
6. Run independent release identity and health checks, then repeat the final smoke test without modifying production data.

**No P0/P1 infrastructure fix was applied:** the observed failures are access/connectivity and evidence blockers, and changing production networking or TLS without authorized origin access would be unsafe.
