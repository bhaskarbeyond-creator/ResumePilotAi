# FINAL ADMIN / SUPER ADMIN PRODUCTION CERTIFICATION

**Subject:** `/adm` Admin & Super Admin control plane, Platform Health, and the
authoritative API surface
**Branch:** `arena/01a028b6-resumepilotai`
**Candidate SHA:** `ea6d4920833ea7dae35055078d4b530b66e0bb20`
**Report date:** 2026-08-22
**Verdict:** **NO-GO** — see §Final Determination.

---

## 0. Read this first

This report does **not** certify the platform as production-verified, and it
does not claim 10/10. The engineering work is complete and evidenced, but three
categories of required proof could not be produced from this environment, and
one of them is an unresolved security incident.

The governing rule for this certification was stated plainly: *any unverified
checklist item forces NO-GO*. Eight of the twenty evidence items below are
unverified. I am reporting that outcome rather than working around it.

The single most important sentence in this document:

> **Two real Firebase service-account private keys and a Cloudflare API token
> were committed to this repository and remain recoverable from git history.
> They have NOT been rotated. Until they are, treat them as compromised.**

---

## 1. Why eight items cannot be verified here

Not for lack of trying, and not because the work is incomplete. There is a
hard environmental boundary, and I verified its existence rather than assuming
it.

**The sandbox enforces a TLS egress allowlist.** TCP connections to external
hosts succeed, then the TLS handshake is terminated. Measured behaviour:

| Target | TCP | TLS | Result |
| --- | --- | --- | --- |
| `github.com`, npm registry | connect | complete | reachable |
| `api.cloudflare.com` | connect | `SSLZeroReturnError` | curl code `000` |
| `iam.googleapis.com` | connect | `SSLZeroReturnError` | curl code `000` |
| `airesume.projectdemo.guru` | connect | `SSLZeroReturnError` | curl code `000` |

Three consequences follow, and they are the honest reason for the NO-GO:

1. **I cannot rotate a credential.** Reaching the Google IAM and Cloudflare
   APIs is a precondition. I also cannot test whether a leaked key is still
   *active*, which is why every leaked credential is classified on worst-case
   assumptions rather than on measured liveness.
2. **I cannot deploy or verify production.** No SSH, no HTTPS to the host.
   Backend `COMMIT_SHA`, frontend build SHA, PM2 state, Cloudflare cache and
   live health endpoints are all unobservable from here.
3. **I cannot run live forensics.** Every live CRUD, live RBAC and live
   `/adm/health` reconciliation item in the brief requires the production
   origin.

Where a live check was impossible I did **not** substitute a weaker check and
call it equivalent. I built the strongest *offline* proof available, labelled
it as such, and left the live item explicitly unverified.

---

## 2. The twenty evidence items

Legend: **VERIFIED** (evidenced here) · **BLOCKED** (requires an environment I
do not have) · **PARTIAL** (offline proof complete, live proof outstanding).

### 1. Tested SHA — **VERIFIED**

`ea6d4920833ea7dae35055078d4b530b66e0bb20`, branch
`arena/01a028b6-resumepilotai`. All test results in this report were produced
from exactly this tree. Working tree clean at commit time.

### 2. Deployed SHA — **BLOCKED**

Nothing was deployed. `main` remains at
`7ff5cff317489d2cd8a406a8becdf8537017198e`; the candidate is two commits ahead
on the working branch and has not been merged. **No deployment claim is made.**

### 3. Backend `COMMIT_SHA` — **BLOCKED**

Requires querying the running production backend. Unreachable.

### 4. Frontend build SHA — **PARTIAL**

The production build succeeds from the tested tree: `1802 modules transformed`,
`built in 4.81s`, exit 0. The *deployed* asset hash cannot be confirmed.

### 5. Backup artifact — **BLOCKED**

Creating a production backup requires host access.

### 6. PM2 status — **BLOCKED**

`ecosystem.config.js` is present and unmodified. Runtime state unobservable.

### 7. API count — **VERIFIED**

**249 reachable endpoints, comprising 243 distinct handlers.**

The brief forbade arbitrarily picking 223 or 249, so both were derived and
reconciled. They measure different things:

- The email router is mounted **twice**, at `/api` and at `/api/email`. Six
  handlers (`logs`, `resend`, `send-email`, `send-invoice-email`, `templates`
  GET and POST) are therefore reachable at two distinct, separately-authorised
  URLs. 249 reachable − 6 aliases = **243 distinct**.
- A static grep of `app.<verb>(` / `router.<verb>(` finds **229** declarations
  and is structurally blind to mount prefixes.
- The Express routing table is ground truth for *"what can a client call"*, so
  **249 is authoritative**.

The dashboard does not hardcode this. It reads the same collector, which is
why item 9 reconciles exactly.

Full per-endpoint table with all fourteen required columns:
**`docs/FINAL_API_INVENTORY.md`**.

### 8. API status distribution — **VERIFIED**

Reported in two columns, because collapsing them is exactly how a dashboard
starts lying.

| State | OBSERVED (this sandbox) | PROJECTED (datastore satisfied) |
| --- | ---: | ---: |
| OPERATIONAL | 11 | **124** |
| UNAVAILABLE | 113 | **0** |
| DISABLED | 80 | 80 |
| NOT_CONFIGURED | 41 | 41 |
| DEGRADED | 4 | 4 |
| **Total** | **249** | **249** |

The load-bearing result: re-running the collector with a stubbed Firestore/Auth
client moves **all 113 UNAVAILABLE readings to OPERATIONAL**. Those endpoints
are not defective; they are unmeasurable without credentials. Stating that as
"113 broken APIs" would be false, and stating it as "everything is fine" would
also be false. Both columns are published.

Authorization split: **226 authenticated / 23 public**.

**Zero unexplained endpoints.** All fourteen non-operational groups trace to a
named missing credential or an explicit switch, each with a required A–E
disposition:

| Group | Count | State | Disposition |
| --- | ---: | --- | --- |
| Enterprise Tenancy | 63 | DISABLED | B — `ENTERPRISE_TENANCY_ENABLED=false`, deliberate gate |
| Email / SMTP | 15 | NOT_CONFIGURED | E — needs SMTP credentials |
| Notification Dispatcher | 12 | DISABLED | B — no outbox worker running |
| AI Providers | 10 | NOT_CONFIGURED | E — needs provider keys |
| PDF Export | 4 | DEGRADED | E — `PDF_RENDERER_ISOLATED=false` |
| Stripe | 4 | NOT_CONFIGURED | E |
| GitHub OAuth | 3 | NOT_CONFIGURED | E |
| LinkedIn OAuth | 3 | NOT_CONFIGURED | E |
| Naukri | 2 | DISABLED | B — deliberate 501 |
| PayPal | 2 | NOT_CONFIGURED | E |
| PayTM | 2 | DISABLED | B |
| PhonePe | 2 | DISABLED | B |
| Razorpay | 2 | NOT_CONFIGURED | E |
| Twilio SMS | 1 | DISABLED | B |

Nothing was classified C (remove) or D (replace): no obsolete or
must-be-replaced route was found. No endpoint is labelled merely "expected".

### 9. Platform Health evidence — **VERIFIED (offline) / live reconciliation BLOCKED**

Reconciliation executed against the live in-process routing table:

```
inventory doc total       : 249
API matrix endpoint total : 249
MATCH                     : YES

UNAVAILABLE     113 vs 113  ok
OPERATIONAL      11 vs  11  ok
NOT_CONFIGURED   41 vs  41  ok
DISABLED         80 vs  80  ok
DEGRADED          4 vs   4  ok
```

The dashboard and this document cannot disagree; they share one collector.

Health semantics are enforced in code and asserted in tests: `DISABLED ≠
BROKEN`, `NOT CONFIGURED ≠ BROKEN`, `DEGRADED ≠ OPERATIONAL`, `UNKNOWN ≠
HEALTHY`. Every one of the 31 services exposes STATUS, LAST CHECK, DEPENDENCY,
ERROR REASON, AFFECTED FEATURES, REMEDIATION and CONFIGURATION STATE. No status
is hardcoded; each derives from a real probe. Metrics that cannot be collected
render **"Data unavailable"** — and `formatMetric` deliberately preserves a
genuine `0`, so a real zero is never disguised as missing and missing data is
never disguised as zero.

Platform Health is a first-class nav item, not a debug page, with a
GREEN/AMBER/RED/GREY indicator and deep links from Command Center and the
Attention feed. Live `/adm/health` reconciliation against production remains
blocked.

### 10. CRUD — **BLOCKED (live) / PARTIAL (offline)**

Handler-level coverage exists in the backend suites, but the brief requires
*live* CRUD against users, tenants, operators, audit, queues/DLQ, settings,
phrases/CMS and AI governance using disposable identities. That requires the
production origin. **No live CRUD was performed, and none is claimed.**
Consequently the full UI-click → request → `Authorization` header → backend
authz → DB state change → UI refresh → audit record trace is unproven end to
end in production.

### 11. RBAC — **VERIFIED (server-side, offline) / live BLOCKED**

The instruction was never to trust frontend hiding. These fifteen tests
(`backend/test/platform-health-rbac.test.js`) bypass the UI entirely and call
the API directly, so a route merely hidden in React but open on the server
fails them. **15/15 pass.**

| Role | Read health | SUPER_ADMIN provider test |
| --- | --- | --- |
| Unauthenticated | **401** | **401** |
| Ordinary user | **403** | **403** |
| SUPPORT | **403** | **403** |
| ADMIN | 200 | **403** |
| SUPER_ADMIN | 200 | 200 |

Also proven: unknown service id returns 404 with a stable `SERVICE_NOT_FOUND`
code rather than a 500; a path-traversal id is rejected before reaching the
collector; a service with no safe automated test returns
`SERVICE_TEST_UNSUPPORTED` instead of faking a result; and host diagnostics
(`pid`, `loadAverage1m`, `host`, memory) are withheld from ADMIN while shown to
SUPER_ADMIN, with non-sensitive uptime surviving for both.

### 12. MFA / reauth — **PARTIAL**

`fetchAdminWithReauth` and the `hasMfa` context flag are wired and exercised by
the admin suites. Live step-up reauthentication against production is blocked.

### 13. Audit — **PARTIAL**

`recordAdminAuditLog` coverage was enumerated per endpoint and is recorded in
the `AUDIT REQUIRED?` column of the inventory. Passive GET health checks are
deliberately not over-audited, consistent with the existing architecture. Live
audit-record verification is blocked.

### 14. Enterprise regression — **VERIFIED**

**173 + 23 = 196 tests, 0 failures.** The frozen Enterprise platform is intact;
its architecture was not modified. No regression, which the brief made a
NO-GO condition.

### 15. Consumer regression — **VERIFIED**

Product suites: **324 + 1 + 8 + 3 = 336 tests, 0 failures.**
Backend suites: **203 tests, 0 failures** (188 pre-existing + 15 new RBAC).
Static security suite: **27 tests, 0 failures**.
Lint: **0 errors** (583 pre-existing warnings, unchanged).
Build: clean.

### 16. Responsive — **VERIFIED (offline) / live BLOCKED**

Playwright asserts no horizontal overflow at all six required viewports —
1440x900, 1280x800, 1024x768, 768x1024, 430x932, 375x667 — for both the health
console and the admin shell. **56/56 Playwright tests pass**, driving real user
interactions (navigation, deep links, refresh survival, browser-back, command
palette, drawer flows), not component-existence assertions.

One real bug was found and fixed this way: the sidebar pins at 1024px, so the
mobile-toggle reveal and `padding-left: 0` overrides had to move to
`max-width: 1023.98px` to stop the sidebar overlaying content at exactly
1024px.

### 17. Security scan — **VERIFIED**

Static security suite **27/27**. XSS, security-static and secret-scanner
efficacy suites all green, wired into `npm run test:security`.

### 18. Secret scan — **VERIFIED (tree) / NOT REMEDIATED (history)**

Working tree: **2 257 tracked files × 14 patterns → 0 findings.**

This item passes for the tree and **fails for history**. Details in §3.

### 19. Rollback verification — **BLOCKED**

No deployment occurred, so there is nothing to roll back and no rollback drill
to evidence.

### 20. Remaining risks — **VERIFIED (enumerated below)**

---

## 3. The security incident, stated plainly

Full analysis: **`docs/SECRET_SECURITY_STATUS.md`**.

### What was found

Four tracked files carried real credential material:

| File | Contents |
| --- | --- |
| `remote.env` | Firebase service-account **private key #1** (DER sha256 `1dbe5941…`, 1218 B), Cloudflare API token (`cfut_`, 53 ch), account id, R2 access key id + endpoint, `rzp_test` secret |
| `remote2.env` | Firebase service-account **private key #2** (DER sha256 `8be0f390…`, 1239 B), same Cloudflare token |
| `scratch/deploy.py` | Same Cloudflare token + zone id, hardcoded |
| `scratch/fast_deploy_frontend.py` | Same Cloudflare token + zone id, hardcoded |

Both PEMs parse as **valid distinct RSA keys** for the same service account on
project `ai-resume-builder-424cf`. This was confirmed by DER decoding, not by
pattern-matching.

Empty and therefore not leaks: Stripe, PayPal, Paytm, PhonePe, Gemini.
Correctly excluded after inspection: `ecosystem.config.js:34`,
`FirebaseSettings.jsx` placeholders, `docs/I18N_UI_STRING_INVENTORY.json`,
`backend/index.js:3410-3413`, and ~11 backend test fixtures.

### Classification

Real: **yes**, cryptographically verified. Production-referenced: **no** —
grep found zero code, script, config, CI or docs references to
`remote.env`/`remote2.env`, which is what made removal safe. **Currently
active: UNKNOWN and unknowable here**, because liveness checks need the blocked
egress. Every credential is therefore treated as live and compromised.

### What I did

- Deleted both env files from the working tree and the git index.
- Converted both deploy scripts to read `CLOUDFLARE_ZONE_ID` /
  `CLOUDFLARE_API_TOKEN` from the environment with `SystemExit` fail-fast;
  cache-purge behaviour otherwise unchanged, both compile.
- Hardened `.gitignore`. The previous `.env*` pattern **only matches names
  beginning with `.env`** — which is precisely why `remote.env` was never
  ignored. Now `*.env`, `**/*.env` and key/service-account shapes are excluded,
  with `.env.example` still tracked. Verified with `git check-ignore`.

### The detection gap, and why the scanner is now stronger

The instruction was to never weaken the security test. The opposite happened:
writing an efficacy suite to prove the scanner works caught **two genuine
blind spots in my own patterns**.

1. `cfut_`-prefixed Cloudflare tokens had no pattern at all.
2. More seriously: the PEM pattern required 100+ **unbroken** base64
   characters. A real service-account key stored in an env file wraps its body
   with a literal `\n` every 64 characters, so the pattern **never matched the
   actual leaked key**. The scanner was passing on a file that contained a real
   private key.

Both fixed. The character class now accepts base64 *and* escaped newlines
(`(?:\\+[rn]|\s|[A-Za-z0-9+/=]){100,}`), A/B-proven to match the real wrapped
form while staying silent on all three placeholder shapes.

`tests/secret-scanner-efficacy.test.mjs` parses the live patterns out of the
scanner source and asserts they fire on all twelve shapes from this incident —
so the scanner can no longer silently regress.

### What is NOT done

| Action | Status | Blocker |
| --- | --- | --- |
| Rotate 2 Firebase keys | **NOT DONE** | TLS egress blocked |
| Rotate Cloudflare token | **NOT DONE** | TLS egress blocked |
| Rotate Razorpay test keys | **NOT DONE** | TLS egress blocked |
| Confirm production has replacements | **NOT DONE** | No production access |
| Purge git history | **NOT DONE** | See below |
| Full-tree re-scan | **DONE — 0 findings** | — |

**History purge was deliberately not attempted.** Six secret-bearing blobs
exist across four paths, introduced in `f596dc9` (13:10 IST) and reaching main
tip `7ff5cff` (14:12 IST) — a **~1 hour window, 2 commits, private repo, 0
forks**. A purge is unsafe from this clone: `.git/shallow` is present,
`git-filter-repo` and `bfg` are unavailable, and it would require force-pushing
`main` plus ~50 branches, violating the constraint that I work only on this
session's branch. Attempting it here risked corrupting history to remove a
secret that rotation invalidates anyway.

**Rotation supersedes the purge and must come first.** Once keys are dead, the
history blobs are worthless. Runbooks for both are in
`docs/SECRET_SECURITY_STATUS.md`.

---

## 4. Carry-over defects

Disclosed rather than quietly dropped:

1. **`src/utils/oauthResolver.js` defaults to `true`.** Each provider flag
   resolves through modules → provider-section → socialAuth and falls back to
   enabled. An unconfigured provider can render as available. Not user-facing
   in the certified surface, but it is a real correctness bug and it is not
   fixed.
2. Live OAuth, payment and SMTP provider behaviour is unverified for the same
   egress reason.

---

## 5. Final Determination

| Field | Result |
| --- | --- |
| **CURRENT SHA** | `ea6d4920833ea7dae35055078d4b530b66e0bb20` (branch `arena/01a028b6-resumepilotai`) |
| **DEPLOYED SHA** | **NONE.** `main` = `7ff5cff…`; candidate not merged, not deployed |
| **TEST COUNTS** | **591 automated tests, 0 failures** — backend 203, product 336, enterprise 196*, security-static 27, Playwright 56/56. Lint 0 errors, build clean. (*enterprise counted within its own suites) |
| **API COUNT** | **249 reachable / 243 distinct** — authoritative, derived from the routing table, reconciled against 223 and 229 |
| **API STATUS BREAKDOWN** | OBSERVED: 113 UNAVAILABLE, 80 DISABLED, 41 NOT_CONFIGURED, 11 OPERATIONAL, 4 DEGRADED. PROJECTED: 124 OPERATIONAL, 80 DISABLED, 41 NOT_CONFIGURED, 4 DEGRADED. Zero unexplained |
| **LIVE CRUD RESULTS** | **NOT PERFORMED** — production unreachable |
| **PLATFORM HEALTH RESULT** | Offline: **PASS**, reconciles exactly at 249 with all five buckets matching. Live: **NOT VERIFIED** |
| **SECURITY RESULT** | Static scan **PASS** (27/27); working tree **0 findings** across 2 257 files |
| **ENTERPRISE REGRESSION RESULT** | **PASS** — 196 tests, 0 failures, frozen platform intact |
| **BACKUP / ROLLBACK RESULT** | **NOT PERFORMED** — no deployment occurred |
| **REMAINING GAPS** | (1) Firebase ×2, Cloudflare, Razorpay credentials **unrotated**; (2) git history still carries 6 secret blobs; (3) no deployment, backup or rollback drill; (4) no live CRUD, RBAC, health or responsive verification; (5) `oauthResolver` default-`true` bug |

### **STATUS: NO-GO**

Eight of twenty evidence items are unverified, and the rule was that any single
one forces NO-GO. Even setting the environmental blockers aside, one item is
disqualifying on its own merits:

> **Live production credentials were committed, remain recoverable from git
> history, and have not been rotated.** No system in that state should be
> certified, regardless of how green its test suite is.

### Path to GO

Operator actions, in order. Steps 1–4 are the security incident and should not
wait for the rest.

1. Rotate both Firebase service-account keys in project
   `ai-resume-builder-424cf`; delete the old keys.
2. Roll the Cloudflare API token and the R2 access key.
3. Regenerate the Razorpay test keys.
4. Deploy the replacements through the secret manager — never into source,
   logs or docs — and confirm production picks them up.
5. Purge history with `git filter-repo --invert-paths` from a **full mirror**
   clone (runbook in `docs/SECRET_SECURITY_STATUS.md`); coordinate the
   force-push across all branches.
6. Merge the candidate SHA, deploy **that exact SHA**, then verify backend
   `COMMIT_SHA`, frontend build SHA, PM2 and Cloudflare cache state.
7. Take a production backup and rehearse rollback before opening traffic.
8. Run live forensics: full API audit with disposable resources, live CRUD
   across all named domains, negative RBAC against production, `/adm/health`
   reconciliation against the 249-endpoint census, and responsive verification
   at the six viewports.
9. Fix the `oauthResolver` default-`true` bug.

Re-issue this certification only when every item above carries evidence.
