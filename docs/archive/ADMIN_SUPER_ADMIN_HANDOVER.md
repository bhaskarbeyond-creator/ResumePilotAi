# ADMIN / SUPER ADMIN — HANDOVER

**Verdict: READY FOR LIVE CERTIFICATION.**

Not "production certified", and deliberately not 10/10. Everything reachable
from this environment has been fixed and verified; everything that needs
production credentials has been built into tooling and left for an operator to
run. Nothing unverified has been promoted to a pass.

---

## 1. SHAs

| | |
| --- | --- |
| **Baseline SHA** | `7ff5cff317489d2cd8a406a8becdf8537017198e` (`main`) |
| **Current SHA** | `0823e0d` on `arena/01a028b6-resumepilotai` |
| **Merged to main** | No |
| **Deployed** | No — this branch has never been deployed |

```
0823e0d  fix(admin): derive real company statistics and stop faking zero metrics
b740390  fix(dashboard): stop rendering a missing uptime as "0h 0m"
2aada5c  fix(email): replace the fabricated deliverability panel with real DNS checks
0c5e201  fix(admin): eliminate dead buttons and a false success in social settings
7c420af  feat(certification): add deterministic live-verification tooling and runbook
1e912dd  fix(admin): replace native browser dialogs with the Enterprise modal
46f88a8  fix: eliminate unexplained 5xx responses and correct OAuth configuration truth
4254b5f  docs: add final admin/super-admin production certification report
ea6d492  security: remove committed credentials, harden scanner, add API inventory + RBAC
ec91272  feat(admin): add Platform Health console driven by real backend probes
```

**65 files changed, +10,389 / −385.**

---

## 2. Bugs fixed

Each was found by reading code and probing behaviour, not by a failing test.

| # | Defect | Why it mattered | Commit |
| --- | --- | --- | --- |
| 1 | `subscriptionsSettings` defaulted `razorpayKeySecret` to a real 24-char credential literal, which load-merge preserved and save persisted | a live secret in source, re-committed on every save | `1e912dd` |
| 2 | `JobsLandingStats` `await setStats()` was unguarded, so a failed save reported success | operator believes a write landed when it did not | `1e912dd` |
| 3 | `Phrases` category removal was destructive with **no confirmation** | irreversible data loss on a misclick | `1e912dd` |
| 4 | 18 native `window.confirm`/`alert` dialogs across 9 admin files | broke the frozen Enterprise visual contract | `1e912dd` |
| 5 | `oauthResolver` defaulted every provider to `true`, advertising sign-in methods that were not configured | users hit a dead OAuth button | `46f88a8` |
| 6 | Notification / payment / CMS / scraper endpoints returned bare 5xx | users saw "Unexpected error" with no explanation | `46f88a8` |
| 7 | **`socialSettings` "Reset" button had no handler at all** | a visible control that silently did nothing | `0c5e201` |
| 8 | **`socialSettings` flagged success *before* awaiting the write and ignored the result** | a failed save still showed the success banner | `0c5e201` |
| 9 | **Deliverability tab was 100% hardcoded** — a "100% EXCELLENT" badge over four permanently-green DNS cards | claimed a perfect mail posture even with every DNS record deleted; also factually wrong (see §3) | `2aada5c` |
| 10 | **Dashboard rendered a missing uptime as `0h 0m`** | reads as "the platform just restarted" — sends an operator hunting a crash that never happened | `b740390` |
| 11 | **Company statistics were always `0`** — `stats?.totalJobs \|\| 0`, and nothing ever populated `stats` | every company reported zero jobs and zero applications regardless of reality | `0823e0d` |
| 12 | Observability p50/p95 latency fell back to `0` | "0 ms" is not a plausible latency; it meant the metric was absent | `0823e0d` |

---

## 3. The deliverability panel was not just fake — it was wrong

Worth calling out because it is the clearest example of why "tests pass" is not
evidence. The panel asserted:

> `100% EXCELLENT DELIVERABILITY` · SPF `VERIFIED ACTIVE` · DKIM `3 KEYS
> ALIGNED` · DMARC `ENFORCED (sp=none)` · MX `DUAL CLUSTER`

Resolving the real production domain returns:

| Record | Measured | Reality |
| --- | --- | --- |
| SPF | `OPERATIONAL` | published |
| DKIM | `OPERATIONAL` | 3 keys — the claim happened to be right |
| **DMARC** | **`DEGRADED`** | **published as `p=none` — monitor only, enforcing nothing** |
| MX | `OPERATIONAL` | 2 hosts |

The card claiming "ENFORCED" described a policy that enforces nothing, and the
"100%" badge covered for it. `GET /api/email/admin/deliverability` now resolves
all four records live and reports the worst one as the verdict.

**Operator action:** DMARC is genuinely `p=none`. Move to `p=quarantine` once
the aggregate reports look clean.

---

## 4. API fixes

Every previously-unexplained failure now returns a typed, documented state.

| Surface | Before | After |
| --- | --- | --- |
| Notification dispatch | bare 5xx | `503 EMAIL_NOT_CONFIGURED` + `configurationState` + `remediation`; `400 NOTIFICATION_RECIPIENT_REQUIRED`; `202` on accepted |
| Payments (PayPal/PayTM/PhonePe) | 500 | `503 PAYMENT_PROVIDER_UNAVAILABLE` + `requestId` |
| CMS scheduler | 500 | `503 CMS_SCHEDULER_NOT_CONFIGURED` |
| Naukri scraper | 500 | `501 SCRAPER_NOT_CONFIGURED` (deliberate) |
| GitHub / LinkedIn OAuth | opaque failure | `302 → /login?error=oauth_unavailable&provider=<p>` |
| Deliverability | *(did not exist)* | `GET /api/email/admin/deliverability` |

Authoritative census: **249 endpoints** (243 distinct + 6 dual-mount aliases) in
`docs/FINAL_API_INVENTORY.md`. The number is derived from the Express routing
table, not chosen — and `verify-api-inventory-live.mjs` parses exactly 249/249
rows back out of that document, so script and document cannot drift.

---

## 5. Security changes

- Removed `remote.env`, `remote2.env`, `scratch/deploy.py`,
  `scratch/fast_deploy_frontend.py` — 4 leak files.
- Hardened `.gitignore`: `.env*` only matched names *beginning* `.env`, so
  `remote.env` was never ignored. Added `*.env` and `**/*.env`.
- Strengthened the secret scanner, which had missed `cfut_` tokens,
  `\n`-escaped PEM bodies and a 24-char Razorpay default.
  `tests/secret-scanner-efficacy.test.mjs` tests the scanner itself.
- Server-side RBAC proven in `backend/test/platform-health-rbac.test.js` (15/15):
  anonymous 401 ×4; USER/SUPPORT 403; ADMIN 200 on read but **403 on
  `POST …/firestore/test`**; host diagnostics (`pid`, `loadAverage1m`, `host`)
  withheld from ADMIN; path traversal rejected.

> **⚠️ OUTSTANDING — the credentials are still live.** Two Firebase service
> account private keys, a Cloudflare API token, an R2 access key and Razorpay
> test keys were committed. They are out of the working tree but **remain in git
> history and have not been rotated.** I could not rotate them: no credentials,
> and no history rewrite is possible from this clone (`.git/shallow` present,
> `git-filter-repo` and `bfg` absent). Treat them as compromised until §11 of
> the runbook is done. **Rotation supersedes the history purge** — once the keys
> are dead the blobs are worthless.

---

## 6. UI/UX changes

- New Platform Health console at `/adm/health` — first-class in the sidebar,
  command palette, dashboard and attention feed, with a live indicator dot.
- 31 services across `core` / `integrations` / `workers`, each carrying STATUS,
  ENABLED, CONFIGURED, LAST CHECK, DEPENDENCY, ERROR, AFFECTED FEATURES and
  REMEDIATION.
- Health vocabulary enforced end to end: `DISABLED ≠ BROKEN`,
  `NOT_CONFIGURED ≠ BROKEN`, `DEGRADED ≠ OPERATIONAL`, `UNKNOWN ≠ HEALTHY`.
- All 18 native dialogs replaced with the Enterprise modal, so `/adm` matches the
  frozen platform. Alerts became inline banners with stable `data-testid` hooks.
- The API matrix sits behind a "View API Matrix" control, not on the dashboard.
- Sidebar pins at 1024px; mobile overrides use `max-width: 1023.98px`.
- **No dead buttons remain** — enforced by a regression guard, not by inspection.

---

## 7. Regression results at `0823e0d`

| Suite | Result |
| --- | --- |
| Security (static + backend) | **27 / 27** and **217 / 217** |
| Product | **346**, **1**, **8**, **3** — 0 failures |
| **Enterprise (frozen)** | **173 / 173** and **23 / 23** — **no regression** |
| Playwright (offline) | **34 passed**, 8 correctly skipped |
| ESLint | **0 errors** |
| Build | clean |

Backend went 212 → 217 and product 343 → 346 because this session added tests,
not because anything was relaxed.

---

## 8. Commands

```bash
# Full local suite
npm ci && npm run lint && npm run build
npm run test:security && npm run test:product && npm run test:enterprise
npx playwright test

# Live certification (needs production credentials)
npm run certify:identity   # deployed SHA == tested SHA — run this FIRST
npm run certify:health     # health honesty + census reconciliation
npm run certify:api        # all 249 endpoints, no unexplained errors
npm run certify:crud       # live CRUD + negative RBAC
npm run certify:ui         # real browser against production
npm run certify:backup     # backup exists, recent, non-empty; SHA is real
npm run certify:all
```

**Required env vars:** `PROD_BASE_URL`, `EXPECTED_SHA`, `FIREBASE_API_KEY`,
`SUPERADMIN_EMAIL/_PASSWORD`, `ADMIN_EMAIL/_PASSWORD`, optional
`USER_EMAIL/_PASSWORD`, and for the UI suite `LIVE_CERT_BASE_URL`,
`LIVE_CERT_SUPERADMIN_EMAIL/_PASSWORD`, `LIVE_CERT_ADMIN_EMAIL/_PASSWORD`.
Mutations are opt-in: `ALLOW_DESTRUCTIVE=1`, `ALLOW_MUTATIONS=1`.

**Exit codes:** `0` verified · `1` real failure, stop · `2` could not verify —
**not a pass**. Every script names its missing variables instead of throwing.

**Evidence:** `test-results/{production-identity,platform-health-live,api-inventory-live,admin-superadmin-live,backup-rollback}.json` — machine-readable, automatically redacted, safe to circulate. The directory is gitignored.

**Failure conditions:** SHA mismatch · any endpoint 404/5xx without a documented
reason · any non-operational service reporting healthy · any privileged call
succeeding for anonymous/USER/ADMIN · any Enterprise regression · orphaned
`zz-cert-` resources after a CRUD run.

---

## 9. What is verified, and what is not

**LOCAL VERIFIED** — all code changes, all suites above, RBAC enforcement,
health semantics, the 249-endpoint census, dead-button elimination, secret
removal from the working tree, backup-script failure paths (empty / stale /
bogus-SHA all correctly FAIL).

**BLOCKED — REQUIRES OPERATOR.** The sandbox enforces a TLS egress allowlist
(GitHub and npm only); production, Cloudflare and Google all fail the
handshake. So none of the following could be executed, and none is claimed:
live SHA confirmation, live CRUD against production data, live RBAC, live
health probes, PM2 state, Cloudflare cache state, backup/rollback rehearsal,
credential rotation.

Every certification script degrades to `BLOCKED` and exits `2` in this
situation — verified by running them against production and watching them
refuse to pass. That behaviour is the point: **a script that cannot reach
production must never report success.**

---

## 10. Remaining production-only tasks

1. **Rotate the leaked credentials** (§5) — independent of any deploy, do it now.
2. Deploy `0823e0d` and confirm with `certify:identity`.
3. Run `certify:health`, `certify:api`, `certify:crud`, `certify:ui`.
4. Rehearse rollback and verify with `certify:backup`.
5. **Move DMARC off `p=none`** — measured, real, currently degraded.
6. Decide on `ENTERPRISE_TENANCY_ENABLED`. It is currently **off**, which is why
   63 tenancy endpoints return 404 and Provision Tenant shows the
   `ENTERPRISE_DISABLED` sentinel rather than pretending to work. If tenancy
   belongs to the frozen platform, enable it and re-run `certify:api`.
7. Purge git history (§11.5 of the runbook) from a fresh full mirror clone —
   after rotation, and coordinated with all collaborators.

Full step-by-step in **`docs/LIVE_CERTIFICATION_RUNBOOK.md`**.
