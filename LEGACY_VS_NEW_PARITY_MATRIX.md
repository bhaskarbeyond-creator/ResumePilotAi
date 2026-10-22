# LEGACY_VS_NEW_PARITY_MATRIX

Historical evidence used: Git history (12 most recent commits on `main`), the in-repo
`FRONTEND_TAKEOVER_BASELINE.md`, `AGENTS.md` §8.1, `frontend/src/main.tsx` header comment,
CI workflow definitions, and `scripts/sync-dist.mjs`. No legacy behaviour was invented; where
history was insufficient the authoritative source (schema, CI, deployment path) was used instead.

| Area | Legacy implementation | Current implementation | Intended behaviour | Authoritative choice | Decision & action |
| --- | --- | --- | --- | --- | --- |
| Frontend application tree | Root `src/` — React 18 JSX, 651 modules / 192,769 LOC, built by root `vite.config.js` | `frontend/src/` — React 19 + TS, 163 modules / 65,698 LOC | One shipped product served from the Apache DocumentRoot `dist/` | **`frontend/`** | Evidence: (1) CI `quality-gate.yml` and `production-release.yml` run `npm run build`, which resolves to `npm --prefix frontend run build`; (2) that build ends with `scripts/sync-dist.mjs` publishing `frontend/dist -> dist` (the DocumentRoot) under a hardened write boundary; (3) `AGENTS.md` §8.1 defines all five approved work surfaces as `frontend/src/pages/**`; (4) `frontend/src/main.tsx` states "Clean-room frontend reconstruction. Zero legacy frontend code reuse." **Corrective work was therefore applied to `frontend/` only.** Root `src/` was deliberately NOT rewritten or deleted — that would be an unauthorised architectural replacement. |
| Test coverage skew | 115 files under `tests/` read root `src/` | 8 files read `frontend/src/` | Guards should cover the shipped tree | n/a | **Recorded as residual risk R3**, not silently "fixed": rebalancing 115 legacy test files is a large, separate programme and rewriting them would destroy valid historical evidence. Two new gates were added that target the shipped tree directly. |
| Revision normalization | n/a (single tree) | Backend `Number(x.revision \|\| 0)` (floor 0) vs frontend `revision \|\| 1` (floor 1) | One contract; schema declares `revision INT NOT NULL DEFAULT 1` | **Schema + `liveInterviewSession.normalizeRevision` (`revision >= 1`)** | Two divergent rules for one value. Neither side was "new vs old" — both were wrong relative to the schema. Root-cause fix: single authoritative module on each side of the wire, floor 1. See DEF-001. |
| `normalizeRevision` duplication | Local function inside `liveInterviewSession.js` with hard-coded bounds `1` / `1_000_000` | Same magic numbers duplicated conceptually across 54 coercion sites | One definition of the domain floor | **Shared `backend/services/revision.js`** | Consolidated: the interview guard now imports `REVISION_FLOOR`/`REVISION_CEILING`; its throw-on-invalid inbound contract is preserved exactly. |
| Destructive-action confirmation | Root `src/` had `tests/dir048-native-dialog-sentinel.test.mjs` forbidding native dialogs | `frontend/` had **no equivalent gate** and used `window.confirm()`/`window.alert()` | No native blocking dialogs in the shipped UI | **Legacy rule is the valid product rule** | Legacy intent adopted for the new tree: 2 `alert()` + 2 `confirm()` replaced with Radix `AlertDialog`/toast, and the sentinel gate ported to `frontend/src`. |
| Feedback primitive | Root `src/` toast/notification components | `@radix-ui/react-toast@^1.3.1` declared in `frontend/package.json` with **0 usages** | Accessible non-blocking feedback | **Declared dependency** | Implemented rather than adding a new library: no dependency added or removed, lockfiles untouched. |
| Dependency audit gate | `audit:production` covered root + backend | Frontend never audited in CI | Gate must cover what is deployed | **CI intent (`quality-gate.yml` runs `audit:production`)** | Extended to `--prefix frontend`. Verified: 3 moderate advisories surface, gate level remains `high` so CI stays green while the finding is now visible. |

## Regression judgement
No valid legacy behaviour was lost. Every change either (a) restores a rule the legacy tree already
enforced, or (b) makes client and server agree with the schema. `git diff` of the change set contains
no deletions of legacy files and no modification to root `src/`.
