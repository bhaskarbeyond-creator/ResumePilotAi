# Mandate 13 — SAML 2.0 SSO, and a Reconciliation of the "IME365 Canonical Reality" Report

Branch `arena/737c1ad4-resumepilotai` · commits `3150c2d` (SAML) on top of `86aaa5f` / `27e6aad` (Mandate 12-MAX)
Date: 2026-10-30

This document does two things: it records what was actually built in response to the
reviewer's report, and it corrects the parts of that report that the repository does
not support. Both are held to the same standard — *no inflated claims* — including
claims about how complete the project is.

---

## 1. Verdict

Of the four blocks the reviewer listed as "what is left to reach 100%", **one was
genuinely buildable in this environment and is now built and verified**: enterprise
SAML 2.0 SSO (their Module 14, Tier 3). It is a real service provider with a real
X.509 trust chain, covered by 33 tests that run offline.

The other three **cannot be completed autonomously**, and I have not pretended
otherwise:

| Block | Status | Why it cannot be closed here |
|---|---|---|
| SAML 2.0 / SSO (M14) | **DONE** — code + 33 passing tests | — |
| Live payment settlement (M39) | **BLOCKED — owner action** | Requires live merchant credentials, a settlement-capable bank account, and an internet-reachable webhook endpoint. This is a financial action, not a coding task. |
| WebRTC voice pipeline (M29) | **BLOCKED — infrastructure** | Needs a TURN/media relay plus a speech-evaluation provider with credentials. Anything I could write here would be another unverified claim, which is the exact failure mode the standard forbids. |
| Live MariaDB integration gate | **BLOCKED — environment** | No MariaDB can be installed on this host (re-confirmed; see §6). |

So the true answer to "is it 100%?" is **no**, and it cannot be made 100% from inside
this sandbox. What *can* be done — and now is — is to remove every remaining block
that is a pure engineering problem, and to make the remaining blocks precise enough
that someone with the credentials can close them in an afternoon.

---

## 2. Corrections to the reviewer's report

Checked against the repository, not against the report.

| Claim in the review | Reality | Evidence |
|---|---|---|
| "Authoritative Git Baseline: Commit `2258e183` on `main` and `dev`" | **No such commit exists.** | `git cat-file -t 2258e183` → `fatal: Not a valid object name`. Branch tip is `3150c2d`; `dev` is at `5dd54cf`. |
| "M14 SAML: 10% — stub route declarations in `backend/routes/auth/saml.js`" | **That path has never existed.** SAML was 0%, not 10%. | `ls backend/routes/auth/` → `No such file or directory`. No `saml` route outside `node_modules`. |
| "Developer 1 added 4,578 lines and 4 migrations" | **Correct.** | `git diff --stat 5dd54cf` at `86aaa5f`: 30 files, 4,578 insertions. |
| "Wired `PATCH /api/platform/tenants/:id`" | **Correct** (parameter is `:tenantId`). | `backend/routes/platform.js:1662`. |
| "All 338 unit contract tests pass, 0 skipped" | **Correct**, re-verified this session. | §4.1. |
| "Strict parity 30.4% (34/112), Reconciled 40.2% (45/112)" | **Not reproducible.** No artifact in the repo defines the 112-capability denominator, and the two figures do not agree with the report's own table (34 + 8 modern replacements = 42, not 45). | Report §1 vs §2. |
| Module percentages (Tier 1 / 2 / 3) | **Not reproducible** as stated. Spot checks of individual rows held up (QR generation is real, `/api/account/export` is real, 100+ templates are real); the aggregate is an unauditable judgement, not a measurement. | Sampled in §2.1. |

Nothing in the above changes what the review got right: the Mandate 12 work it
describes (migrations 033–036, session revocation, employer settings, relational
scorecards, monotonic read cursors) does exist, and its "PARTIAL — NOT READY FOR
PRODUCTION RELEASE" verdict is the correct conclusion.

### 2.1 Spot check of individual module claims

A sample was verified to see whether the aggregate was trustworthy at the row level:

| Module claim | Verified? | How |
|---|---|---|
| M18 QR codes generated locally as SVG | **Yes** | `frontend/src/lib/portfolio` → `qrSvgPath`, rendered in `share-publication.tsx:233` |
| M25 GDPR JSON export | **Yes** | `backend/index.js:6960` `POST /api/account/export` |
| M31 ~100 ATS templates | **Yes** | `template-catalog.ts` → 114 catalog entries across 6 categories |
| M32 A4 pagination at 1123px | **Yes** | `frontend/src/lib/smart-partitioner.ts` |
| M14 SAML at 10% | **No** | file absent; 0% |

---

## 3. What was built: enterprise SAML 2.0 service provider

### 3.1 Files

| File | Purpose |
|---|---|
| `backend/enterprise/saml.js` | Trust core: metadata parsing, AuthnRequest, assertion verification |
| `backend/enterprise/samlStore.js` | Durable request correlation + assertion replay memory (and an in-memory double with identical semantics) |
| `backend/routes/saml.js` | Login, ACS, SP metadata, admin trust configuration |
| `backend/database/migrations/037_enterprise_sso.sql` (+ `.down.sql`) | `enterprise_sso_config`, `saml_authn_requests`, `saml_assertion_replay` |
| `backend/database/ownership.js` | Declared owner for all three new tables |
| `backend/index.js` | Router mount; three anonymous SSO legs added to the public allowlist |
| `backend/test/saml-sp.test.js` | 33 tests, offline |

New dependencies: `xml-crypto@6` (XML-DSig) and `@xmldom/xmldom@0.9` (XML parsing).
Neither existed in the repository before.

### 3.2 The trust model, and the attacks it is built against

An assertion intake is a signature-verification problem with a long history of
bypasses. Each rule below exists because of a specific class of attack:

- **KeyInfo is compared, never trusted.** The certificate inside the signature must
  byte-match one configured for the tenant (`SAML_UNKNOWN_SIGNING_CERT`). Otherwise
  an attacker simply signs with their own key and ships the public half.
- **The signature must cover the element the claims are read from.** Every reference
  URI must resolve to the assertion id or the response id, and the signed scope must
  contain the assertion (`SAML_REFERENCE_UNBOUND`). This is the XML-signature-wrapping
  defence; `xml-crypto` additionally refuses documents with duplicate `ID` values.
- **Exactly one top-level assertion** (`SAML_ASSERTION_AMBIGUOUS`). Two assertions is
  never legitimate here, and allowing it hands the attacker the wrapping surface.
- **DTD / ENTITY refused before parsing** (`SAML_XML_UNSAFE`). Entity expansion and
  external entities never reach the parser.
- **Canonical base64 only** (`SAML_RESPONSE_MALFORMED`). Node's decoder stops at the
  first `=`, so `<real response>==<attacker payload>` would decode to the real
  response and hide the rest; misaligned or interior padding is rejected.
- **Payload size cap** of 512 KiB before decode (`SAML_XML_UNSAFE`, 413).
- **Conditions, Audience, Recipient, Destination, InResponseTo** all must agree, with
  120 s clock skew (`SAML_CONDITIONS_EXPIRED`, `SAML_AUDIENCE_MISMATCH`,
  `SAML_RECIPIENT_MISMATCH`, `SAML_INRESPONSETO_MISMATCH`).
- **Request correlation is single-use** and consumed atomically only *after* the
  signature verifies and *before* any identity side effect (`SAML_UNKNOWN_REQUEST`,
  `SAML_REQUEST_REPLAYED`).
- **Assertion replay is single-use across processes**, keyed by assertion id in
  `saml_assertion_replay` (`SAML_ASSERTION_REPLAYED`).
- **Tenant enumeration is not possible**: an unconfigured or disabled tenant is
  indistinguishable from a nonexistent one (404, no detail).
- **The trust configuration itself is the security boundary**, so it sits behind
  `requireRecentAdminAuthentication`, not on the anonymous legs.

Sign-in completes through the **existing** one-time exchange code path used by the
OAuth callbacks — no second session mechanism was introduced.

### 3.3 Contracts

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/auth/saml/:tenantId/metadata` | anonymous | SP metadata XML; `entityID = <base>/:tenantId`, ACS `index=0 isDefault=true` |
| `GET /api/auth/saml/:tenantId/login` | anonymous | 302 to IdP with DEFLATE+base64 `SAMLRequest`; request id persisted (10 min TTL); 404 if SSO is off |
| `POST /api/auth/saml/:tenantId/acs` | anonymous | verifies, correlates, replay-checks, provisions, issues exchange code; JSON (`Accept: application/json`) or 302 to `/dashboard#oauth_code=…&provider=saml` |
| `GET/PUT /api/auth/saml/:tenantId/config` | recent admin | read/replace trust config; accepts pasted IdP metadata XML or explicit `entityId`+`ssoUrl`+`certificates`; normalises certificates to base64 DER |

`PUT` config body: `{ metadataXml }` **or** `{ entityId, ssoUrl, sloUrl?, certificates[], nameIdFormat?, defaultRole?, jitProvisioning?, enabled? }`.

---

## 4. Verification (executed here)

### 4.1 Suites

| Suite | Result |
|---|---|
| SAML SP (`backend/test/saml-sp.test.js`) | **33 / 33 pass** — real RSA keys and X.509 certificates generated at runtime with `openssl`, real XML signatures |
| Unit contracts (`developer-implemented/TESTS/unit/*.test.mjs`) | **338 / 338 pass** |
| Whole backend (`npm --prefix backend test`) | 1,620 tests · **1,496 pass** · 116 fail · 8 skipped |
| Enterprise (`npm --prefix backend run test:enterprise`) | 187 tests · **186 pass** · 1 fail |

### 4.2 Failure attribution against the pristine base

Baseline worktree of `5dd54cf`: 1,578 tests · 1,462 pass · 116 fail · 0 skipped.
Name-level diff of failing tests between baseline and this branch: **empty in both
directions** — no new failures, nothing silently fixed. The 116 failures are the same
pre-existing, database-dependent suites (they fail identically on the untouched base
commit), and the 8 skips are the Mandate 12 persistence gate, which reports
`SKIP NOT VERIFIED` rather than passing.

*Note on totals:* this suite is not perfectly deterministic — pristine baseline runs
varied between 1,578 and 1,582 tests across two executions of identical code, and one
intermediate run of the current tree omitted four `ai-governance-entitlement` cases
that pass standalone (25/25) and reappeared on the next full run. Failure **names**
are stable; raw counts are not. That is why attribution is done by name.

### 4.3 Live smoke test of the mounted router

Booted the real server (`node backend/index.js`) and called the endpoints:

```
GET /api/auth/saml/acme/metadata   → 200  (entityID=.../api/auth/saml/acme, ACS index 0)
GET /api/auth/saml/acme/config     → 401  AUTH_REQUIRED
GET /api/auth/saml/acme/login      → 503  SAML_UNAVAILABLE
```

The 503 on `login` is correct and deliberate: with no database reachable the server
cannot know whether the tenant has SSO configured, so it fails closed rather than
reporting "not configured". With a working store the same endpoint returns the IdP
redirect (covered by the router tests).

---

## 5. What still stands between this and the reviewer's "100%"

Stated as exit criteria rather than aspiration:

1. **SAML admin console screen.** The API is complete and tested; there is no screen
   in the admin console yet for pasting IdP metadata. Until there is, an operator must
   call `PUT /api/auth/saml/:tenantId/config` directly. *(Engineering task, ~half a day.)*
2. **SAML against a real IdP.** Everything above is verified against certificates and
   assertions this machine generated. Interoperability with Okta/Azure AD/Google —
   their exact canonicalisation, their metadata quirks, their clock — has **not** been
   exercised. One real IdP tenant closes it.
3. **Live payment settlement.** Requires merchant credentials + reachable webhook
   endpoint + a real settlement cycle. Not an engineering deliverable.
4. **WebRTC voice.** Requires a media relay and a speech provider. Currently the voice
   module is browser `SpeechSynthesis` only (`frontend/src/lib/voice-interview.ts:457`).
5. **The MariaDB gate.** Requires a server (§6).

---

## 6. NOT VERIFIED — explicitly

- Any SAML row persisted in MariaDB. Migration 037 exists with a matching rollback and
  ownership declarations, but has never been executed against a server here.
- Request-correlation and replay tables under real concurrency (two ACS posts racing
  on one assertion id). The SQL is `INSERT IGNORE` on a primary key and a conditional
  `UPDATE … WHERE consumed_at IS NULL`, which is the right shape — but "the right
  shape" is not evidence.
- Interoperability with any commercial IdP (§5.2).
- The existing Mandate 12 persistence claims, unchanged from the previous report.

To close the database items:

```bash
# provision MariaDB, apply migrations 001–037, then:
RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true DB_HOST=127.0.0.1 \
  node --test backend/test/mandate12-database-integration.test.js
```

No MariaDB can be installed on this host: no binaries present, package mirrors
unreachable. This was re-confirmed, not assumed.

---

## 7. Honest scorecard for *this* change

| Dimension | Before this turn | After |
|---|---|---|
| SAML/SSO (M14) | 0% (file did not exist) | Service provider complete and tested offline; no admin UI; no real-IdP interop |
| Backend tests passing | 1,464 | 1,496 (+32, zero regressions) |
| Backend tests failing | 116 (all pre-existing) | 116 (identical by name) |
| Dependencies added | — | 2 (`xml-crypto`, `@xmldom/xmldom`) |

I did not move the project to 100%, and no honest report could. What changed is that
one of the four blockers is now closed with code that can be audited, and the other
three are stated precisely enough to be closed by whoever holds the credentials.

---

## 8. Addendum — Enterprise SSO console (directive: "SAML Admin Console UI")

Commit `0df3a9b`. The directive asked for the console tab; it also restated two
details that do not match the shipped API, so both are recorded here rather than
silently accommodated.

### 8.1 Corrections

| Directive statement | Reality |
|---|---|
| "Baseline Git Revision: `38055e69` on `dev` and `main`" | **No such commit.** `git cat-file -t 38055e69` → `fatal: Not a valid object name`. The branch tip before this turn was `fca0df0`; `3150c2db`/`fca0df09` do exist, as stated. |
| "Save config via `POST /api/auth/saml/:tenantSlug/config`" | The canonical verb is **PUT** (`POST` would have been a 404). `POST` is now accepted as an alias of the identical handler, so both work; PUT remains documented as canonical. |
| "371/371 tests green" | Consistent with what was reported: 338 unit + 33 SAML. It is now 359 unit + 33 SAML + 14 SSRF + … see §8.4. |

### 8.2 What was built

**Console** (`frontend/src/components/admin/AdminEnterpriseSsoTab.tsx`, tab `/admin/sso`):

- tenant slug entry with server-matching validation, and a **Load configuration** action
  bound to `GET /api/auth/saml/:tenantId/config`;
- status badge — `SSO ACTIVE` / `CONFIGURED · DISABLED` / `UNCONFIGURED`;
- **ACS URL** display with one-click copy, and **Download SP metadata**, which fetches
  `GET /api/auth/saml/:tenantId/metadata` and saves it as `sp-metadata-<tenant>.xml`;
- radio choice between **IdP metadata** (XML paste *or* metadata URL) and **manual entry**
  (entity id, SSO URL, optional SLO URL, one or more certificates);
- enable / just-in-time provisioning / default role switches, per-field errors, and
  mapping of server errors (`SAML_METADATA_INVALID`, `SAML_CERT_INVALID`, …) to plain text;
- hidden from non-Super-Admin staff, matching the server's own guard.

**Logic** (`frontend/src/lib/saml-admin.ts`) is pure — no React, no network — so every
decision the console makes is unit-tested directly.

**Backend additions the directive implies:**

- `POST` alias for the config endpoint (same handler, no behavioural difference);
- SSO/SLO URLs are now rejected at **write** time unless they are absolute https
  without embedded credentials. Without this, a plaintext SSO URL could be stored and
  would downgrade every subsequent sign-in — the console's own validation is not a
  security boundary;
- `enterprise/samlMetadataFetch.js`: server-side metadata import for the "metadata URL"
  mode. This is an SSRF primitive unless constrained, so it is constrained: https only,
  no credentials or fragments, every resolved address checked against private /
  loopback / link-local / CGNAT / unique-local ranges (IPv4, IPv6 and IPv4-mapped
  IPv6), the TCP connection **pinned to the address that was checked** so a
  DNS-rebinding answer between check and connect cannot redirect it, redirects followed
  manually with every hop re-validated (max 3), body capped while streaming, hard timeout.

### 8.3 Verification (executed here)

| Check | Result |
|---|---|
| Console contract tests — `developer-implemented/TESTS/unit/mandate13-saml-admin.test.mjs` | **21 / 21 pass** |
| SSRF guard tests — `backend/test/saml-metadata-fetch.test.js` | **14 / 14 pass** |
| SAML SP suite — `backend/test/saml-sp.test.js` | **33 / 33 pass** (unchanged) |
| Unit suite (all) | **359 / 359 pass** (was 338) |
| Backend suite | 1,635 tests · **1,511 pass** · 116 fail · 8 skipped |
| Enterprise suite | 187 tests · **186 pass** · 1 fail (pre-existing) |
| `npx tsc -b` | exit 0 |
| `npm --prefix frontend run build` | exit 0, `✓ built in 1.64s`, 353 files synced |

Failure attribution against the pristine `5dd54cf` baseline is again **empty in both
directions** by failing-test name: no new failures, nothing fixed by accident.

The console tests are not source-text assertions: they import the shipped
`saml-admin.ts` (Node strips the types), build the payload with the same function the
component uses, and push it through the real router with supertest — including the
round trip a reload performs, the POST alias, the metadata-XML path, and the
metadata-URL path with the fetcher injected. One test does read source, to guarantee
the component cannot introduce an endpoint that does not exist.

### 8.4 What is still not verified for this addendum

- **No browser session.** The tab type-checks, bundles and its logic is covered, but it
  was not rendered in a browser here. Layout, focus behaviour and the download gesture
  are unverified. That is the one honest gap in "the UI is done".
- **No live IdP metadata URL was fetched.** Every SSRF rule is tested with an injected
  resolver and transport; the real `https.request` path has not been exercised against
  a public endpoint from this host.
- **The trust store still cannot be observed in MariaDB** (no server here): saving from
  the console is verified against the in-memory store with production semantics, not
  against `enterprise_sso_config`.

### 8.5 Exit criteria for the console

1. One manual browser pass: load a tenant, paste real Okta/Azure metadata, save, attempt
   a sign-in, confirm the IdP round trip.
2. A MariaDB-backed save (`PUT` then `GET`, restart-safe).
3. Optional: fetch one real public metadata URL to exercise the production transport.
