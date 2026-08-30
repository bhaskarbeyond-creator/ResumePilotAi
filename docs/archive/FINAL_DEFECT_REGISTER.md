# FINAL DEFECT & GAP REGISTER (AUTONOMOUS RESOLUTION HISTORY)

**Repository:** `ResumePilotAi`  
**Standard:** Zero Actionable Defects, Root Cause Analysis, Regression Testing, Non-Vacuity Proofs  
**Status:** All Defect Classes Resolved & Certified

---

## 1. Defect Remediation Log

| Defect ID | Severity | Module / Component | Root Cause Summary | Remediation & Invariant Fix | Regression Test Suite | Status |
|:---|:---:|:---|:---|:---|:---|:---:|
| **DEF-001** | `P0` | AI Provider (NVIDIA NIM) | `meta/llama-3.1-8b-instruct` was deprecated and retired on NVIDIA NIM. | Switched default primary model to `meta/llama-3.2-11b-vision-instruct` with failover to `nvidia/nemotron-mini-4b-instruct`. | `backend/test/ai-admin.test.js` | 🟢 CLOSED |
| **DEF-002** | `P0` | Firebase Auth Session Gate | Strict `auth_time` age check enforced on standard admin settings endpoints caused infinite re-auth loops. | Limited strict 10-minute `auth_time` enforcement exclusively to destructive account deletion (`/account/delete`). | `backend/test/totp-mfa-lifecycle.test.js` | 🟢 CLOSED |
| **DEF-003** | `P1` | AI JSON Response Parser | Raw unescaped control characters (`\n`, `\t`) inside JSON strings caused `SyntaxError: Bad control character`. | Implemented `extractJson` with control-character sanitization regex prior to parsing. | `backend/test/ai-generation.test.js` | 🟢 CLOSED |
| **DEF-004** | `P0` | Evidence Engine Self-Reference | Evidence crawler indexed generator scripts (`scripts/**`) as test suites, claiming PASS on generator lines. | Strictly restricted evidence indexing to `tests/**` and `backend/test/**` with hard integrity exception on script paths. | `scripts/test-evidence-engine-invariants.mjs` | 🟢 CLOSED |
| **DEF-005** | `P0` | Evidence Arithmetic Offsets | Arbitrary offset addition in evidence aggregation created inflated control counts. | Removed all synthetic offsets; numbers derived 100% from actual test action evidence records. | `scripts/build-honest-evidence-ledger.mjs` | 🟢 CLOSED |
| **DEF-006** | `P0` | Source-Only Evidence Claims | Discovered controls marked PASS without validating that action/assertion exist verbatim in test file. | Implemented verbatim source span extraction, exact substring matching, and cryptographic SHA-256 evidence hashing. | `scripts/build-honest-evidence-ledger.mjs` | 🟢 CLOSED |
| **DEF-007** | `P0` | Negative Test Vacuity | Mutation tests C and D tested local helper functions rather than the real engine validation pipeline. | Rewrote Mutation C and D to execute the actual `validateAndDeriveEvidence` engine validator path. | `scripts/test-evidence-engine-invariants.mjs` | 🟢 CLOSED |

---

## 2. Invariant Protection Summary

1. **Zero Self-Certification:** Evidence engine scripts are strictly barred from indexing themselves or certification generators.
2. **Deterministic Control Identity:** Every PASS record is anchored to exact selectors, exact test actions, exact assertions, and cryptographic disk hashes.
3. **Execution-Derived Dimensions:** No manual `dimensions: { persistence: PASS }` metadata; dimensions are computed directly from test case patterns.
