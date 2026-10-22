# SECURITY_RELIABILITY_REVIEW

Evidence-based review of the original application at `01d9e5eb`. Claims are limited to what was
actually executed or read in this environment.

## 1. Controls verified present and passing
| Control | Evidence |
| --- | --- |
| Security headers / CSP generation gate | `scripts/generate-security-headers.mjs --check` passes inside `test:security:static` (71/71 baseline, 77/77 after) |
| XSS gate | `tests/xss.test.mjs` passes; `dompurify` present in the shipped frontend |
| Bundle-level data-plane restriction | `vite.config.js` `firebaseAuthOnlyBundlePlugin` **aborts the production build** if any Firebase Firestore/Database/Storage/Functions/Analytics/Messaging/RemoteConfig/App-Check module enters the bundle — verified by a passing `npm run build` |
| Build identity / stale-CDN detection | `buildIdentityPlugin` injects the tested source SHA as a `<meta name="build-sha">` rather than inline JS, so CSP is not weakened |
| Secret scanning efficacy | `tests/secret-scanner-efficacy.test.mjs` passes; MFA static gate passes; auth-error-message gate passes |
| Publication write boundary | `scripts/sync-dist.mjs` derives source/destination from its own file location only (no CLI/env/cwd can redirect it), resolves symlinks and refuses a `dist` symlink escaping the repo, refuses partial builds, never copies `.env*`, and prunes only `index-*` / `smart-resume-document-*` chunks — verified by its successful run |
| Dependency audits | root 0 vulnerabilities; backend 0 vulnerabilities; frontend 3 moderate |
| Rate limiting / helmet | `express-rate-limit` and `helmet` are real backend dependencies and wired in `backend/index.js` |
| Ownership & tenant isolation | Enforced in `resilientMutations.js` (`employerId`/`owner_id` checks before any CAS write) and covered by `tests/account-isolation.test.mjs` (passing) |

## 2. Findings and actions
| ID | Sev | Finding | Action |
| --- | --- | --- | --- |
| SEC-1 | **P1** | `audit:production` — the gate CI runs via `quality-gate.yml` — audited only root and `backend/`. The tree actually published to the DocumentRoot (`frontend/`) was never audited, so its 3 moderate advisories were invisible to CI | **FIXED**: gate extended to `npm --prefix frontend audit --omit=dev --audit-level=high`, plus a regression test that fails if the frontend is dropped again |
| SEC-2 | **P2 (open)** | `sprintf-js` ← `argparse` ← `mammoth` (moderate). `mammoth` powers DOCX import in the shipped frontend | **DOCUMENTED, deliberately not upgraded**: bumping `mammoth` is a functional change whose regression evidence requires Playwright-driven DOCX import tests, unavailable here. Blindly upgrading would trade a known moderate advisory for unverified import behaviour |
| SEC-3 | **P2** | Native dialogs (`alert`/`confirm`) in the shipped UI leak implementation detail into OS chrome, cannot be styled to convey consequence, and — critically — expose **no in-flight state**, allowing a destructive request to be submitted twice | **FIXED**: replaced with focus-trapped, busy-aware `ConfirmDialog` + toast; sentinel gate added |
| SEC-4 | **P1** | Integrity of optimistic concurrency: a divergent revision floor made legitimate authorized writes fail (availability defect) and, more importantly, meant the CAS guard's comparison was not evaluating the same domain value on both sides of the wire | **FIXED**: single authoritative contract per side; guard verified still to reject genuinely stale revisions |
| SEC-5 | **Info** | `@firebase/*` packages declare `engines.node >= 24.12.0`; sandbox runs Node v22.23.2 → EBADENGINE warnings on install | **DOCUMENTED**: warnings only, install and build both succeed. Operator should confirm the production Node major against these engines before release |
| SEC-6 | **Info** | Secrets handling | No secret, token, `.env` value, private key or `AIza…`/`sk-…` pattern is present in the delivered patch — verified by pattern scan over the patch file (0 matches) |

## 3. Reliability review
| Area | Assessment |
| --- | --- |
| Bounded retries | Frontend TanStack Query configured `retry: 1` for queries and `retry: 0` for mutations — mutations are not blindly retried, which is correct for non-idempotent writes |
| Timeouts / cancellation | AI provider routing has pooled-destination cooldown and eligibility binding (recent commits `1e3ebd9d`, `4c76dc2d`); `test:api-resilience` exists. Live timeout behaviour **BLOCKED** (no providers) |
| Transactions / atomicity | `resilientMutations.js` performs read → CAS compare → write with revision increment; job-application status transitions are audited and revision-guarded. Execution against a real DB is **BLOCKED** |
| Idempotency | `liveInterviewSession.js` validates an idempotency key with a strict pattern (`^[A-Za-z0-9_-]{12,120}$`) and rejects otherwise |
| Resource cleanup | **FIXED** in the photo-upload path: `FileReader.onerror` handled, input value reset, no silent terminal state |
| Duplicate submission prevention | **FIXED**: destructive dialogs now disable and mark `aria-busy` while the request is in flight |
| Graceful failure feedback | **FIXED**: errors route to an accessible live region instead of a blocking OS dialog |
| Error boundaries | `RouteErrorBoundary` wraps the whole route tree in `router.tsx` |

## 4. Performance
Measured where possible rather than asserted:
- Production build: `vite build` completes in ~1.2–1.3 s; 340 assets published.
- Bundle: largest chunk `index-*.js` 515 kB (152 kB gzip). Vite emits a >500 kB advisory. **Documented as an open, pre-existing observation** — code-splitting the entry is a separate optimization and was not undertaken here to avoid an unjustified large diff.
- No new runtime dependency was added; the new primitives use packages already in the lockfile, so the payload does not grow by a new library.
- Repeated API calls: `staleTime: 5 min`, `refetchOnWindowFocus: false` — reasonable and unchanged.
- Database query efficiency could not be measured (**BLOCKED**, no DB).

## 5. Previously reported follow-up concerns, reassessed against the original code
| Concern | Reassessment |
| --- | --- |
| Authentication rate limiting | `express-rate-limit` is a real dependency and wired in `backend/index.js`; `tests/auth-error-messages.test.mjs` and `tests/mfa-static.test.mjs` pass. No defect found. Live abuse testing **BLOCKED** (no runtime DB) |
| Content Security Policy | Generated and gated by `scripts/generate-security-headers.mjs --check` (passing). `vite.config.js` deliberately puts the build SHA in `<meta>` instead of inline JS **so the CSP does not have to be weakened** — a sound decision, left intact |
| Dependency-audit findings | Root and backend clean; **the real gap was that the frontend was excluded from the gate** → SEC-1 fixed, SEC-2 documented |
