# LIVE CERTIFICATION RUNBOOK

**Audience:** the Local Senior Developer who holds production credentials.
**Purpose:** deploy a known SHA and certify it, without interpreting anyone's
implementation or guessing at a single step.

Every command is copy-pasteable. Every check has a defined pass condition and a
defined failure action. Nothing here requires reading source code.

---

## 0. Before you start

You need:

| Requirement | Why |
| --- | --- |
| SSH access to the production host | deploy, PM2, backup |
| Cloudflare API token with cache-purge rights | frontend cache |
| A `SUPER_ADMIN` account | CRUD and health certification |
| A plain `ADMIN` account | negative RBAC — proves the server refuses |
| Firebase Web API key | script sign-in |
| A machine that can reach `https://airesume.projectdemo.guru` | all live steps |

> The agent that prepared this work had **none** of the above. The sandbox
> enforces a TLS egress allowlist (only GitHub and npm complete a handshake),
> which is why every live step below is unexecuted and marked `REQUIRES
> OPERATOR`. The tooling is written and tested against its own failure paths;
> only the live run is outstanding.

### Environment

Put this in a file **outside the repository** — never commit it:

```bash
# ── identity ─────────────────────────────────────────────────────────────
export PROD_BASE_URL=https://airesume.projectdemo.guru
export EXPECTED_SHA=$(git rev-parse HEAD)     # the SHA you are certifying

# ── accounts (test identities, not real customers) ───────────────────────
export FIREBASE_API_KEY=...
export SUPERADMIN_EMAIL=...
export SUPERADMIN_PASSWORD=...
export ADMIN_EMAIL=...
export ADMIN_PASSWORD=...

# ── optional: a third role strengthens negative RBAC ─────────────────────
export USER_EMAIL=...
export USER_PASSWORD=...

# ── opt-in switches (default off, deliberately) ──────────────────────────
export ALLOW_DESTRUCTIVE=0     # 1 enables live create/suspend/delete
export ALLOW_MUTATIONS=0       # 1 enables non-GET verbs in the API sweep
```

Then `source` it. Every script fails with a named list of missing variables
rather than a stack trace, and **no script ever reports a pass for something it
could not check** — an unverifiable check is `BLOCKED` and exits `2`.

Exit codes are uniform:

| Code | Meaning |
| --- | --- |
| `0` | verified |
| `1` | a real failure — **stop and fix** |
| `2` | could not be verified — **not a pass** |

---

## 1. Preflight (local, no production access)

```bash
git fetch origin
git status --porcelain          # must be empty
git rev-parse HEAD              # record this — it is the TESTED SHA

npm ci
npm run lint                    # expect 0 errors
npm run build                   # expect a clean build
npm run test:security           # expect 27 + 212, 0 failures
npm run test:product            # expect 343 + 1 + 8 + 3, 0 failures
npm run test:enterprise         # expect 173 + 23, 0 failures
npx playwright test             # expect the offline suites green
```

**Pass condition:** every command exits `0`.
**If anything fails:** stop. Do not deploy. A failing preflight invalidates
everything downstream.

Record the tested SHA now; steps 4 and 6 compare against it.

---

## 2. Backup (production)

```bash
ssh -p 65002 u727965524@82.112.232.112
cd ~/domains/projectdemo.guru

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/backups
tar czf ~/backups/pre-deploy-$STAMP.tar.gz public_html backend
ls -lh ~/backups/pre-deploy-$STAMP.tar.gz
pm2 save                        # capture the current process list
```

Also record what you are rolling back **to**:

```bash
git -C ~/domains/projectdemo.guru rev-parse HEAD   # the CURRENT deployed SHA
```

Verify the backup is real before trusting it:

```bash
export BACKUP_PATH=~/backups/pre-deploy-$STAMP.tar.gz
export ROLLBACK_SHA=<the SHA printed just above>
npm run certify:backup
```

**Pass condition:** exit `0`. The script rejects an empty backup, a backup older
than two hours, and a rollback SHA that is not a real commit.
**If it fails:** re-take the backup. Never deploy without one.

---

## 3. Deploy the exact tested SHA

```bash
cd ~/domains/projectdemo.guru
git fetch origin
git checkout <TESTED_SHA>       # the exact SHA from step 1, not a branch name
git rev-parse HEAD              # must equal TESTED_SHA

npm ci
npm run build

# Make the build self-identifying so step 4 can verify it.
echo "<TESTED_SHA>" > backend/COMMIT_SHA

pm2 restart ecosystem.config.js --update-env
pm2 status
pm2 logs --lines 50 --nostream
```

Purge the CDN so the old bundle stops being served:

```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Pass condition:** `pm2 status` shows every process `online` with a stable
restart count, and the purge returns `"success": true`.

---

## 4. Verify production identity — **do this before anything else**

```bash
npm run certify:identity
```

Checks: backend `COMMIT_SHA` matches `EXPECTED_SHA`; frontend build SHA matches;
health endpoints answer; Cloudflare cache state is visible; the deployed API
surface is 249 endpoints.

**Pass condition:** exit `0`.
**If the SHA mismatches:** stop. Everything after this is meaningless if you are
certifying a different build than you tested. Redeploy and purge again.

Evidence: `test-results/production-identity.json`.

---

## 5. Certify Platform Health

```bash
npm run certify:health
```

Enforces the semantics that matter: `DISABLED ≠ BROKEN`,
`NOT_CONFIGURED ≠ BROKEN`, `DEGRADED ≠ OPERATIONAL`, `UNKNOWN ≠ HEALTHY`. Also
verifies every non-operational dependency carries a reason and a remediation,
that the API matrix reconciles to 249, that host diagnostics are withheld from
`ADMIN`, and that anonymous callers are refused.

**Pass condition:** exit `0`.
**Common real failure:** a service reporting `OPERATIONAL` while its dependency
is down — fix the probe, do not relax the test.

Evidence: `test-results/platform-health-live.json`.

---

## 6. Sweep the API surface

```bash
npm run certify:api                      # GET-only, safe
ALLOW_MUTATIONS=1 npm run certify:api    # includes non-GET verbs
```

Walks all 249 endpoints from `docs/FINAL_API_INVENTORY.md` and classifies every
response. A `404`/`5xx` **without** a documented reason fails certification —
that is the "unexplained endpoint" case that must not exist.

**Pass condition:** `zero unexplained endpoint errors`.
**If it fails:** for each endpoint decide — fix it, or document the state with a
disposition in the inventory. Do not silence the check.

Evidence: `test-results/api-inventory-live.json`.

---

## 7. Live CRUD and RBAC

```bash
ALLOW_DESTRUCTIVE=1 npm run certify:crud
```

Traces each mutation end to end: request → `Authorization` header → backend
authz → database change → **read-back** → audit record. Replays every
privileged call as anonymous, ordinary user and `ADMIN` to prove the server
refuses it — UI hiding is never accepted as evidence.

Safety: everything it creates is prefixed `zz-cert-`, cleanup runs in a
`finally` block, and it refuses to delete anything it did not create. Anything
left behind is listed explicitly at the end with its ids.

**Pass condition:** exit `0`, and `all disposable resources were cleaned up`.
**If cleanup fails:** the script prints the exact ids. Remove them manually
before certifying.

Evidence: `test-results/admin-superadmin-live.json`.

---

## 8. Live UI certification

```bash
export LIVE_CERT_BASE_URL=$PROD_BASE_URL
export LIVE_CERT_SUPERADMIN_EMAIL=$SUPERADMIN_EMAIL
export LIVE_CERT_SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
export LIVE_CERT_ADMIN_EMAIL=$ADMIN_EMAIL
export LIVE_CERT_ADMIN_PASSWORD=$ADMIN_PASSWORD

npm run certify:ui
```

Drives the real console in a browser: signs in through the actual form, walks
every module asserting no `API route not found` / `Failed to fetch` /
`Coming Soon` / `[object Object]`, confirms the health indicator deep-links,
confirms the API matrix stays behind its control, and checks all six required
viewports for horizontal overflow.

**Pass condition:** all tests pass. If the variables are unset the suite
**skips** rather than silently passing.

---

## 9. Enterprise and consumer regression against live

```bash
npm run test:enterprise
npm run test:product
npm run test:security
```

**Pass condition:** zero failures. The Enterprise platform is frozen; any
regression is an immediate `NO-GO` and a rollback trigger.

---

## 10. Rollback (only if something failed)

```bash
cd ~/domains/projectdemo.guru
git checkout <ROLLBACK_SHA>
npm ci && npm run build
echo "<ROLLBACK_SHA>" > backend/COMMIT_SHA
pm2 restart ecosystem.config.js --update-env

curl -fsS $PROD_BASE_URL/healthz

# Purge the cache, then prove the rollback landed.
EXPECTED_SHA=<ROLLBACK_SHA> npm run certify:identity
```

Restore from the tarball **only** if the code rollback alone does not resolve
the incident:

```bash
cd ~/domains/projectdemo.guru
tar xzf ~/backups/pre-deploy-<STAMP>.tar.gz
pm2 restart ecosystem.config.js --update-env
```

**Pass condition:** `certify:identity` reports the rollback SHA and `/healthz`
answers.

---

## 11. Security: credential rotation — **do this regardless of the deploy**

This is outstanding and independent of any release. Full detail in
`docs/SECRET_SECURITY_STATUS.md`.

Two Firebase service-account private keys, a Cloudflare API token, an R2 access
key and Razorpay test keys were committed to this repository. They are removed
from the working tree, but **remain recoverable from git history and have not
been rotated.** Treat them as compromised until step 11.4 is done.

1. **Firebase** — Google Cloud Console → IAM → Service Accounts → project
   `ai-resume-builder-424cf` → create two new keys, deploy them, then **delete
   the old two**.
2. **Cloudflare** — roll the API token and the R2 access key.
3. **Razorpay** — regenerate the test keys.
4. **Deploy replacements through the secret manager or PM2 environment.** Never
   into source, logs or documentation. Confirm production picks them up:
   `npm run certify:health` should show the affected services move off
   `NOT_CONFIGURED`.
5. **Purge git history** — from a *fresh full mirror clone*, not this one:

   ```bash
   git clone --mirror git@github.com:bhaskarbeyond-creator/ResumePilotAi.git
   cd ResumePilotAi.git
   git filter-repo --invert-paths \
     --path remote.env --path remote2.env \
     --path scratch/deploy.py --path scratch/fast_deploy_frontend.py
   git push --force --all && git push --force --tags
   ```

   Coordinate this: it rewrites `main` and ~50 branches, and every collaborator
   must re-clone. **Rotation (steps 1–4) supersedes this** — once the keys are
   dead the history blobs are worthless, so do not delay rotation for the purge.

---

## 12. Sign-off

Certification is `GO` only when **all** of the following hold:

| # | Item | Pass condition |
| --- | --- | --- |
| 1 | Preflight | all suites green |
| 2 | Backup verified | `certify:backup` exit `0` |
| 3 | Deployed SHA = tested SHA | `certify:identity` exit `0` |
| 4 | Platform Health | `certify:health` exit `0` |
| 5 | API sweep | zero unexplained endpoints |
| 6 | Live CRUD + RBAC | exit `0`, cleanup confirmed |
| 7 | Live UI | all tests pass |
| 8 | Enterprise regression | zero failures |
| 9 | Rollback rehearsed | `certify:backup` exit `0` |
| 10 | Credentials rotated | step 11 complete |

Any `BLOCKED`, any exit `2`, any unverified row ⇒ **`NO-GO`**.

Attach all five JSON artifacts from `test-results/` to the sign-off. They are
machine-readable and contain measured values, not prose — and they are
automatically redacted, so they are safe to circulate.
