# M8 — Independent Audit Validation, Count Reconciliation and Runtime Closure

**Mandate:** 8, priority CRITICAL. Treat M7's report, README and verifiers as unproven. Do not
optimise for a COMPLETE verdict; optimise for correctness.
**Save revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` (branch `arena/393531fe-resumepilotai`)
**Previous publication:** `2def3e5` (M7). Working-tree base for this mandate: `a2ecb96` (docs commit on
top of `2def3e5`).
**Application source changes made by this mandate:** **0** — proven in §9.
**Verdict: `PARTIAL — BLOCKED`** (§10). Static coverage is complete; runtime closure is blocked by an
absent database, an absent browser and absent provider credentials, each measured and logged.

---

## 1. What this mandate did, in one table

| § | Requirement | Outcome | Where |
|---|---|---|---|
| §2 | Provenance | ff-only to `a2ecb96`; remote/branch/HEAD/parent/tree recorded; **M7's "byte-identical" claim falsified** and corrected; the ref M7 said preserved does not exist | §2, DISC-049 |
| §3 | P0 registration reconcilation first | **Proved**: 413 = 397 + 8 + 6 + 2; two instruments repaired; 393 operations unchanged; in-scope disagreement 0/0 | `M8-REGISTRATION-COUNT-RECONCILIATION.md` |
| §4 | P0 20 residual leads | **All 20 adjudicated** (21 lead judgements), 0 unresolved: 14 missing / 4 equivalent / 2 preserved / 1 mixed; 0 row classifications changed; **1 new P1 raised** (DISC-054) | `M8-SUBFEATURE-CLOSURE.md`, `Evidence/adjudications-m8.json` |
| §5 | P0 all 112 parity rows | 112 revalidated by independent derivation; 8 flagged rows read; **3 classifications changed** with evidence | `M8-PARITY-REVALIDATION.md` |
| §6 | P0 contract revalidation | 212 sites / 190 matched / 8 mismatch / 14 unresolved = **15 gap paths, 11 wrong-URL, 4 missing-backend**, 12 false-success sites (7 paths) | §6 |
| §7 | P1 runtime | **Executed**: 1,315 backend tests, `tsc -b`, real HTTP probes incl. authenticated; **blocked**: MariaDB, browser, providers | `M8-RUNTIME-VERIFICATION.md` |
| §8 | P1 verifier quality | Each check classified; 4 weaknesses published; 3 derived checks added; nothing weakened | `M8-VERIFIER-QUALITY-REVIEW.md` |
| §9 | Deliverables | 6 M8 documents + 2 M8 tools + 4 artefacts + 6 logs + index/metrics/history/plan/handover/README updates | this file, §9 |
| §10 | Boundary | audit + verification only | §9 |
| §11 | README + toolchain log | updated; `Evidence/logs/m8-toolchain.log` | §11 |
| §12 | Gates A–K | scored separately | §10 |
| §13 | Verdict discipline | six dimensions kept separate | §10 |

---

## 2. Provenance (gate A)

**Fetched and recorded.** `git fetch --prune origin` (branch refspecs, because a bare fetch does not
create `origin/dev`), then a fast-forward merge to the remote docs commit:

| Item | Value |
|---|---|
| remote | `bhaskarbeyond-creator/ResumePilotAi` |
| branch | `arena/393531fe-resumepilotai` |
| HEAD at audit start | `2def3e5` → fast-forwarded to `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` |
| parent of `a2ecb96` | `c292159` |
| `origin/main` | `0adad00d…` |
| `origin/dev` | `ea7b7416…` |
| tracked files | 3,806 at the M7 checkpoint, 3,816 at `a2ecb96` |
| merge/rebase used | **none** (fast-forward only; no reset, no force-push, no history rewrite) |

**M7's provenance claim is falsified.** `M7-CAPABILITY-CLOSURE.md:7` and
`FINAL-AUDIT-HANDOVER.md:152` state that the foreign commit `a7d08a2` "was proven byte-identical to
`8a6e03bb` for all 3,806 tracked files and was preserved at `refs/audit-preserved/base-a7d08a2`".
Measured at this revision:

- `git diff a7d08a2 8a6e03bb` → **264 files changed, 103,955 insertions, 22 deletions**.
- Files differing **outside** `developer-review/`: **0** (so the *application* tree is identical —
  the substantive half of the claim survives).
- Tracked files at `a7d08a2`: **3,553**, not 3,806.
- `git show-ref | grep audit` → **no output**: `refs/audit-preserved/base-a7d08a2` **does not exist**
  in this repository. The commit object is still resolvable (`git rev-parse a7d08a2` succeeds), so no
  evidence was destroyed — but the preservation mechanism the package promises is not in place, and
  M8 did **not** rely on it.
- `a7d08a2` is **not** an ancestor of `HEAD` (`git merge-base --is-ancestor` false); it carries one
  commit not in `HEAD`, while `HEAD` carries 12 not in it.

Recorded as **DISC-049** (P3, documentation/provenance integrity, not a product defect). The M7
sentences are left in place as published; the correction is appended, not overwritten.

**Authoritative revision per metric.** Every artefact regenerated in M8 carries `a2ecb96`:
`backend-reachability.json`, `client-contract-audit.json`, `capability-subfeatures.json`,
`feature-parity.json`, `parity-endpoint-audit.json`, plus the new M8 artefacts. Two artefacts retain
an *inventory* stamp (`inventoryRevision: a5835ff6`) because they consume the file inventory measured
then; the file counts were re-verified against the working tree in M8 (650 legacy / 206 modern) and
are unchanged, and cross-checks re-derive them from the filesystem on every run.

**A stale-stamp defect found and fixed in effect:** `feature-parity.json` carried
`revision: "a7d08a2fa67b"` — i.e. the M7 generator stamped `HEAD` while the checkout was the foreign
commit. The application tree is identical, so no metric moved, but the stamp was wrong. Regenerating
in M8 corrected it to `a2ecb96d2b19`; no number changed as a result.

---

## 3. Registration reconciliation (gate B) — summary

Full derivation: `M8-REGISTRATION-COUNT-RECONCILIATION.md` + `Evidence/artifacts/m8-registration-reconciliation.json`.

| Step | Value |
|---|---:|
| Published register count (M7) | 397 |
| Independent contract-parser count (M7) | 413 |
| **Route call sites** (`<router>.<verb>(` / `app.<verb>(` expressions, counted once) | **393** |
| **Alias registrations** (call site × path literal × mount prefix) | **397** |
| **Unique `METHOD+path`** (the operation register) | **393** |
| Collapsed aliases | 4 |
| **Non-`/api` route literals** (real endpoints outside the register's scope) | **14 literals across 12 call sites: 8 standalone + 6 compatibility aliases of an `/api` twin** |
| Repaired parser B registrations | **405** |
| Arithmetic | 413 = 405 + 6 + 2 → 405 = 397 matched alias registrations + 8 standalone non-`/api` endpoints |
| In-scope disagreements between the two parsers | **0** |
| Operation set / reachability classes changed by the repair | **0 / 0** |

The 16-row difference is itemised row by row in the reconciliation artefact and closes as
**413 = 405 + 6 + 2**: 2 false positives at `backend/index.js:7419` (`Promise.all([...fetch('https://api.github.com/…')])`
feeds mistaken for route registrations), 6 duplicate instances where one handler is registered as both
`/x` and `/api/x` in the same array (`backend/index.js:2867`, `3067`, `3136`, `3226`, `6537`, `6748`), and
405 surviving instances = 397 matched alias registrations + 8 standalone non-`/api` endpoints. Rounding
out the scope note: 12 non-`/api` *call sites* carry 14 path *literals* — the 6 compatibility aliases above
plus 8 standalone endpoints (`/v1/models`, `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/healthz`,
`/readyz`, `/public/custom-pages.json`, `/public/trusted-by.json`). **A word on aliases vs. path shapes**,
because the earlier narrative mixed them: the six duplicate instances above are the *only* alias
double-counts. The register's own paths are already parameter-normalised, so collapsing `:param` /
`${…}` to `{X}` a second time re-measures **0 collisions over the 393 operations** (verified this pass:
393 unique `METHOD+path`, 0 keys shared by two distinct operations). Parameter-name variants such as
`/:uid` vs `/:id` occur only in *pre-mount router literals*, where they are the same handler under
different names in different route files — never separate operations. No "70" figure is asserted here:
that number could not be reproduced from the artefacts and is withdrawn.

Two instrument defects were repaired
(**instruments only, no application change**): counting units mixed call sites with path literals,
and the `/api` scope boundary was undocumented. A third defect was found and repaired in the same
pass: the legacy call extractor could not see `apiJson(`/`apiFetch(` (84 call sites in 5 files), so
85 operations carried `legacyUiRefs: 0` and the reason "called only by tests, never by a client" —
including `POST /contact`, which the public contact form calls. After the repair **166 operations
carry legacy evidence (was 82); class histogram, operation set and every downstream metric unchanged**
(row-by-row assertion in `m8-toolchain.log`).

Expected values were **not** moved: 156/10/27/11/2/176/11 and 393 remain exactly as published.

---

## 4. Capability closure (gate C) — summary

`M8-SUBFEATURE-CLOSURE.md` + `Evidence/adjudications-m8.json`. 20 M7 open items in 10 rows, adjudicated as
**21 lead judgements** (the extra is FP-C02's portfolio-site chrome, which the read surfaced):

| Disposition | Leads | Which |
|---|---:|---|
| `MISSING` | **14** | FP-C02 resume download + site chrome, FP-D07 poller and unread badge, FP-D13 grace banner and saved snippets, FP-F07 map/autocomplete, FP-G11 success dismissal, FP-G21 history export and delete, FP-G23 poller and media controls, FP-G24 modal keyboard contract, **FP-B05 team update/archive/restore + lead persistence** |
| `EQUIVALENT_REPLACEMENT` | **4** | FP-D12 cache-for-events, FP-D13 guidance routing, FP-G23 confirm dialogs, FP-G23 admin status hooks |
| `PRESERVED` | **2** | FP-B05 (superseded — see below), FP-C02 email CTA |
| `MIXED` | **1** | FP-G23 token/maintenance status: admin equivalent, candidate surface absent, and the admin fallback renders six hardcoded "healthy" rows when the payload shape is unexpected |
| `INTENTIONAL_RETIREMENT` / `UNRESOLVED` | **0 / 0** | no decision evidence exists for any of the ten rows |

**Row classifications changed: 0.** Two things an earlier M8 draft asserted did not survive re-reading:
FP-D07 was already `PARTIAL PARITY` at M7 (it is not a `REPLACED → PARTIAL` move), and the FP-B05 lead is
**not** preserved.

Three of the ten rows produced new *product* findings rather than confirmations:

- **FP-G11** — the modern marketing contact form shows "Message Received! … we have logged your
  request" with **no request at all**, while `POST /api/contact` still persists messages. **DISC-050.**
- **FP-F07** — the public jobs page calls `GET /api/jobs`, which is not a registered operation
  (runtime: `404 NOT_FOUND`), and even the registered listing ignores `q/location/type`. **DISC-051.**
- **FP-B05** — `PATCH /api/enterprise/teams/:teamId`, `…/archive` and `…/restore` call
  `registry.updateTeam` / `archiveTeam` / `restoreTeam`, none of which `MySqlTenantRegistry` implements
  (only the in-memory test double does), and `enterprise_teams` has **no lead column**
  (`001_baseline.sql:823-831`). The suite is green because it runs against the double. **DISC-054.**

This is the case the mandate asks for by name: a lead that would have closed as *preserved* on symbol
similarity — input exists, route exists, test passes — and cannot work in production.

---

## 5. Parity revalidation (gate D) — summary

`M8-PARITY-REVALIDATION.md`. 112 rows re-derived from seven independent signals; 8 rows flagged at
parity, all read; 4 absent-family rows with modern call sites, all read. **3 classifications
changed**, each with the previous verdict and reason recorded in the row note:

| Row | Before → after | Why |
|---|---|---|
| FP-C06 | MISSING → **FULL PARITY** | the row's legacy anchor is the four-template renderer directory, not the 71-block library; 4/4 template ids and 4/4 palettes survive |
| FP-A12 | MISSING → **PARTIAL PARITY** | a platform tenant registry exists end to end (`EnterprisePlatformTab` → client → route → service → test); the fixture surface M7 cited is a different row's defect |
| FP-D07 | REPLACED → **PARTIAL PARITY** | the bell and routing are replaced; the unread poller named in the row title is not |

Distribution: **13 FULL · 51 PARTIAL · 28 MISSING · 12 MOCK · 5 REPLACED · 3 UNVERIFIED = 112**;
at parity **18** (17 under the strict D07 reading, published both ways); ineffective **40**;
intentional retirement **0**. Six of 112 rows were re-read line by line in M8; the other 106 are
mechanically revalidated and stand on M7's hand read — stated plainly rather than as "all rows
re-reviewed".

---

## 6. Contract revalidation and false success (gates E, F)

`Evidence/artifacts/client-contract-audit.json` (regenerated at `a2ecb96`) +
`Evidence/artifacts/m8-contract-gap-revalidation.json`.

| Measure | Value |
|---|---:|
| Client files scanned | 204 |
| Client call sites | 212 |
| Registered and matched | 190 |
| Registered with contract mismatch | 8 |
| No registered operation | 14 |
| Distinct unresolved paths | **15** |
| False-success sites | **12** across **7** paths |
| Parser B registrations | 405 (393 shared with the register, 6 non-`/api` exclusive, 0 only-in-register) |

Gap dispositions, re-resolved independently against the 393-operation register and then adjudicated
in source (never by string similarity). The resolver emits **two** resolution classes and this report
does not claim more: every gap path receives exactly one of them, and the remaining properties the
mandate names (mock-vs-real, catalog-vs-design, UI-vs-persisted-state, HTTP-200-vs-correct,
static-vs-runtime) are recorded per workflow in §6.1, where each has a citation:

| Class | Count | Paths |
|---|---:|---|
| `WRONG_URL` — the operation exists under another contract | **11** | `/admin/employer-applications/{X}/verify`, `/admin/jobs/{X}/moderate`, `/admin/users/{X}/status`, `/billing/validate-coupon`, `/blog/posts`, `/blog/posts/{X}`, `/jobs`, `/admin/queues`, `/admin/queues/{X}/retry`, `/admin/queues/dead-letter-queue/retry`, `/platform/status` |
| `MISSING_BACKEND` — no operation at any shape | **4** | `/admin/operations/backup`, `/admin/operations/cache-clear`, `/admin/queues/dead-letter-queue/purge`, `/notify/email` |

One correction to the earlier reading: `/admin/queues/dead-letter-queue/purge` was treated as a
wrong-URL to `POST /platform/queues/purge`; that route is a **deliberate `410 GONE`** stub
(`DEAD_LETTER_PURGE_RETIRED`), so a matching word is not a matching operation. It is now
`MISSING_BACKEND`, and the runtime probe confirms the 410.

### 6.1 Workflow re-traces (static chain + what runtime showed)

| Workflow | Client path | Real operation | Persistence / authz | Runtime at `a2ecb96` |
|---|---|---|---|---|
| Employer approval | `POST …/verify` | `PATCH /admin/employer-applications/:uid` | audited write, 409 CAS, self-review block | client path **404 route-not-found**; real path **404 "application not found"** (exists) |
| Job moderation | `POST …/moderate` | `PATCH /admin/jobs/:jobId` (one of `status`/`isFeatured`) | `resilientMutations.moderateJob`, 409 | client path **404**; real path **404 "Job not found."** |
| Suspension | `POST /admin/users/:uid/status` | `PATCH /admin/users/:uid {suspended}` | Firebase disable + repo write, permission-gated | client **404**; real **500** (`app/invalid-credential`, no Firebase Admin here) |
| Backup | `POST /admin/operations/backup` | none; only `GET /platform/backup-status` (read-only) | n/a | both **404**; status endpoint **503** without DB |
| Cache clear | `POST /admin/operations/cache-clear` | none | n/a | **404** |
| DLQ retry / purge | `/admin/queues*` | `GET /platform/queues`, `POST /platform/queues/retry {jobId,queue:'notification'}`, `POST /platform/queues/purge` | notification outbox, recent admin auth | queues **503** (DB), purge **410 by design**, retry **500** (DB) |
| Blog CRUD | `/blog/posts*` | `GET /blog-data`, `PATCH/DELETE /admin/blog/posts/:id` | blog permission set | client **404**; `/blog-data` **200** |
| Candidate email | `POST /notify/email` | none (only `POST /notify/user-signup`) | outbox | **404** |
| Coupons | `POST /billing/validate-coupon` | `POST /coupons/validate` | server-side recomputation at checkout | client **404 route-not-found**; real **404 "coupon does not exist"** (works) |
| Job listing | `GET /jobs` | `GET /jobs-data` | public-only projection | client **404**; real **200** |
| Platform status | `GET /platform/status` | `GET /admin/platform/status` (tenant-scoped) + `GET /service-availability` | permission + recent admin auth | client **404**; admin path **400 TENANT_ID_REQUIRED**; availability **200** |

The **distinct error-body shapes** are the evidence that separates "no route" from "route answered
no": `{"code":"NOT_FOUND","message":"API route not found"}` versus
`{"code":"NOT_FOUND","error":"Job not found."}` or `{"valid":false,"error":"Coupon code … does not
exist."}`. Static analysis predicted this; HTTP confirmed it for all 10 gap paths probed.

**False success (gate F).** 12 call sites across 7 paths swallow the failure and then report success —
the two largest are the employer-approval and job-moderation controls (`AdminModerationTab`), whose
writes cannot succeed. **M8 adds a new one**: the marketing contact form (`pages/cms/index.tsx`), which
never issues a request at all — the only false-success path where there is not even a failed request to
swallow. Gate F is **FAIL on the product property** (12 false-success sites remain; remediation is not
authorised in M8) and **PASS on identification and tracing**.

---

## 7. Runtime (gate G)

Full detail: `M8-RUNTIME-VERIFICATION.md`.

| Layer | Status | Evidence |
|---|---|---|
| Backend test suite | **EXECUTED** — 1,315 tests, 1,269 pass, 46 fail, all 46 attributable to the absent DB | `m8-backend-suite.log` |
| Enterprise chain subset | **EXECUTED** — 20/20 | same |
| Frontend typecheck | **EXECUTED** — `tsc -b` exit 0 | `m8-frontend-typecheck.log` |
| Real backend over HTTP | **EXECUTED** — 2 unauthenticated + 2 authenticated probe runs, in-memory repository and local HMAC identity, explicitly labelled | `m8-http-probe*.log`, `m8-scenarios.log` |
| R-01…R-10 | **4 PASS · 4 PARTIAL · 2 BLOCKED** | `M8-RUNTIME-VERIFICATION.md` §3 |
| 5 MB-vs-256 KB upload | **RUNTIME-VERIFIED** — 400 KB body → `413 PAYLOAD_TOO_LARGE`; 120 KB control → 200 | `m8-scenarios.log` |
| MariaDB | **BLOCKED** — no server binary, no container runtime, `mariadb.com` unreachable | `m8-runtime-probe.log` |
| Browser / DOM / console | **BLOCKED** — no browser binary, Playwright CDN unreachable | same |
| Providers (AI, payments, email) | **BLOCKED** — 0 credentials in the environment | same |

---

## 8. Verifier quality (gate H)

`M8-VERIFIER-QUALITY-REVIEW.md`. All three verifiers pass: `verify-audit-package.sh` **61/61**,
`verify-v4-reconciliation.py` **20/20** (17 at M8 start, +3 derived), `verify-parity.py` all
subcommands. Four weaknesses are published rather than papered over: a FULL row with no endpoints is
graded `SUPPORTED` **vacuously**; the reachability check pins the string "all 176"; cross-check
agreement shares one parser assumption; and the 61-check script is overwhelmingly presence-based.
The old script was **not** edited; three checks were **added**, none removed or relaxed; no expected
value was moved.

---

## 9. Scope proof — 0 application changes (gate J)

Run at `a2ecb96` in this working tree, with `core.quotePath=false` so that non-ASCII paths cannot
hide inside quoted output:

```
$ git -c core.quotePath=false diff --name-only 8a6e03bb HEAD | grep -v '^developer-review/' | wc -l
0
$ git -c core.quotePath=false diff --name-only a7d08a2  HEAD | grep -v '^developer-review/' | wc -l
0
$ git -c core.quotePath=false status --porcelain | grep -v 'developer-review/' | wc -l
0
$ git diff --stat HEAD -- src backend frontend frontend/index.html package.json \
      package-lock.json backend/package.json backend/package-lock.json \
      frontend/package.json frontend/package-lock.json | wc -l
0
```

For scale: the same comparison against `8a6e03bb` lists **36 changed paths**, and every one of them is
under `developer-review/`.

Every modified and new path in this mandate is under `developer-review/`. `node_modules` installed for
the test runs is git-ignored and excluded from the produced patches; `package.json` and both
lockfiles are byte-identical to `a2ecb96` (verified by `git status`). No manifest, config, schema,
migration, script outside the audit directory, or application file was touched. No destructive
migration, no production database, no public exposure.

---

## 10. Gates A–K and verdict

| Gate | Score | Basis |
|---|---|---|
| **A Provenance** | **PARTIAL** | revision authority established by fast-forward and recorded; M7's byte-identical claim falsified and corrected; the stated preservation ref is absent. The record is now correct; the earlier claim was not. |
| **B Registration** | **PASS** | 393/397/405/413 reconciled arithmetically; 16 rows itemised; in-scope disagreement 0; operation set unchanged; instruments repaired (not the expected values) |
| **C Capability** | **PASS (static)** | all 20 leads adjudicated with chains (21 judgements), 0 unresolved; no row classification changed; one lead that *looked* preserved was refuted by tracing it into the registry (**DISC-054**); nothing closed on name similarity |
| **D Parity** | **PASS (static)** | 112 rows revalidated by independent derivation; 3 changes with evidence and prior verdict retained |
| **E Contract** | **PASS** | 212 sites re-resolved; all 15 gap paths dispositioned by the resolver into **2** resolution classes (`WRONG_URL` 11, `MISSING_BACKEND` 4) and then adjudicated in source; the other dimensions the mandate asks for — mock-vs-real, UI-vs-persisted-state, HTTP-200-vs-correct, static-vs-runtime — are recorded per workflow in §6.1, not in the resolver's two-value field; **10 of 15** gap paths confirmed at runtime |
| **F False success** | **FAIL (product) / PASS (identification)** | 12 false-success sites across 7 paths remain, including one new (contact form). Remediation not authorised in M8. |
| **G Runtime** | **BLOCKED** | HTTP + tests executed; MariaDB, browser and providers impossible and evidenced |
| **H Verifier** | **PASS (with published weaknesses)** | 61/61, 20/20; three derived checks added; no expected value moved |
| **I Evidence** | **PASS** | 6 new documents, 4 artefacts, 2 tools, 6 logs; every number traceable to a command or a file:line |
| **J Scope** | **PASS** | 0 changes outside `developer-review/`, proven three ways |
| **K Documentation** | **PASS** | index, metrics, change history, repair plan, handover, README, registers regenerated with dated amendments |

**Verdict: `PARTIAL — BLOCKED`.** Not COMPLETE: gate G is blocked on dependencies this environment
cannot supply, and gate F fails on the product. Not `PARTIAL — INCOMPLETE`: the audit work the
mandate asks for was completed; what is missing is environmental, and the missing part is named.

Six dimensions, kept separate:

| Dimension | Value |
|---|---|
| Audit completeness | 6 of 6 documents delivered; 12 of 12 mandate sections addressed |
| Static coverage | 112/112 capability rows derived; 393/393 operations classified; 212/212 call sites resolved; 20/20 leads closed |
| Parity | 13 FULL · 51 PARTIAL · 28 MISSING · 12 MOCK · 5 REPLACED · 3 UNVERIFIED; at parity 18 (17 strict) |
| Test execution | 1,269 backend tests pass, 46 fail (all DB-attributable); `tsc -b` clean |
| Runtime verification | HTTP-level executed for 10 gap paths + 4 scenarios; no browser; **no MariaDB** |
| Production readiness | **NOT ESTABLISHED** — 12 false-success sites, 15 contract gaps, 176 unreachable operations, no runtime data-plane verification |

---

## 11. Deliverables and evidence index

| Artefact | Path |
|---|---|
| This report | `developer-review/M8-INDEPENDENT-ACCEPTANCE-REPORT.md` |
| Registration reconciliation | `developer-review/M8-REGISTRATION-COUNT-RECONCILIATION.md` |
| Subfeature closure | `developer-review/M8-SUBFEATURE-CLOSURE.md` |
| Parity revalidation | `developer-review/M8-PARITY-REVALIDATION.md` |
| Runtime verification | `developer-review/M8-RUNTIME-VERIFICATION.md` |
| Verifier quality review | `developer-review/M8-VERIFIER-QUALITY-REVIEW.md` |
| Machine-readable reconciliation | `developer-review/Evidence/artifacts/m8-registration-reconciliation.json` |
| M8 adjudications | `developer-review/Evidence/adjudications-m8.json` |
| Parity revalidation artefact | `developer-review/Evidence/artifacts/m8-parity-revalidation.json` |
| Gap revalidation artefact | `developer-review/Evidence/artifacts/m8-contract-gap-revalidation.json` |
| Toolchain log | `developer-review/Evidence/logs/m8-toolchain.log` |
| Runtime probe / suite / typecheck / HTTP / scenarios | `developer-review/Evidence/logs/m8-{runtime-probe,backend-suite,frontend-typecheck,http-probe,http-probe-authenticated,scenarios}.log` |
| Tools added | `tools/m8-registration-reconciliation.cjs`, `tools/m8-parity-revalidation.cjs`, `tools/m8-contract-gap-revalidation.cjs` |

---

## 12. What was proved, what was changed, what remains uncertain

**Proved.** The two instruments count different things and the difference is exactly 16 rows, itemised;
the operation set is 393 and is unchanged by the repair. Twenty residual leads are closed with
chains, not names. Three parity classifications were wrong and are corrected, each with its prior
verdict retained. Ten of the fifteen contract gaps were confirmed over HTTP as genuine 404s on the
client's exact paths, distinguished from "route answered no" by response shape. The 256 KB body
limit rejects a 400 KB photo with 413. The frontend typechecks and 1,269 backend tests pass.

**Changed.** Instruments (counting units, `/api` scope, legacy `apiJson` extraction, alias collapse,
receiver restriction, two-file adjudication merge); artefacts regenerated at `a2ecb96`; two derived
M8 verifier checks added and one existing check tightened from SHA equality to prefix comparison;
parity distribution 13/51/28/**0**/12/5/3; subfeature register
ADJUDICATED 40 → 50; six new discrepancies (DISC-049 … DISC-054); README, evidence index, metrics,
change history, repair plan and handover updated with dated M8 amendments. **No application source,
config, schema or manifest was changed**; no expected value was moved.

**Uncertain.** Everything that needs a database, a browser or a provider: persistence of any write,
Firebase identity, any upload beyond the body limit, DOCX export, support-ticket round trips, the 46
DB-attributable test failures, and every DOM-level claim about the three reclassifications. The
M7-era artefacts that remain are labelled as such; none is presented as M8 execution.

## 13. Blockers and next actions

1. **MariaDB (blocking R-01, R-04, R-06, R-07 and 46 tests).** Needs a 11.4 binary, a container
   runtime, or network access to a MariaDB mirror. Then run
   `RUNTIME-TEST-HARNESS-M7.md` with `Evidence/` capture — no code change required.
2. **Browser (blocking every DOM claim).** Needs a Playwright browser install path; `tsc -b` already
   passes, so the build pipeline is the next thing to exercise.
3. **Providers (blocking AI/payment/email verification).** Needs real sandbox credentials; absent by
   design in this environment.
4. **Enterprise team verbs are broken in a way only a MySQL run can show** (DISC-054). `MySqlTenantRegistry`
   lacks `updateTeam` / `archiveTeam` / `restoreTeam` and `enterprise_teams` lacks a lead column, so a
   MariaDB-backed run of `PATCH /api/enterprise/teams/:teamId` should return
   `503 TENANT_TEAM_UPDATE_FAILED`. Confirm it, then implement (R-A8-06).
5. **Remediation is a separate mandate.** The 12 false-success sites, 15 contract gaps and 176
   unreachable operations are documented with acceptance criteria in `REPAIR-ACTION-PLAN.md`; none was
   fixed here, because M8 authorises audit and verification only.
