# DIR-017 Conflict Audit & Escalation (Phase 1–2 complete, awaiting Lead adjudication)

**Author:** Cline (Staff Developer) · **Directive:** DIR-017 · **Baseline commit:** `e314f715`

## 1. Verified Baseline (reproducible, not assumed)

| Check | Command | Result |
|---|---|---|
| Target file size | byte/line census | **459,687 bytes / 6,154 lines** |
| Legacy Tailwind colour utilities | regex census | **1,339 occurrences / 129 unique** (directive said "790+") |
| INV-1 frozen paths | `git diff --stat e314f715 -- src/cv-templates/ backend/services/aiRuntime.js` | **0 bytes** OK |
| Existing settings-suite baseline | `node --test` (5 settings tests) | **23/23 PASS, 0 fail** |
| Frozen path count | `src/cv-templates/` | 57 templates (matches INV-1) |

## 3. BLOCKING CONTRADICTION (hard conflict; cannot be resolved by assumption)

**AC-1 vs. `tests/dashboard-settings-ux-10-10.test.mjs`** - mutually exclusive on the same bytes:

| Directive requirement | Frozen test assertion | Same bytes? |
|---|---|---|
| AC-1: "Purge All 790+ Legacy Classes ... eliminate all legacy Tailwind slate/indigo utilities" | L22 `assert.match(fileContent, /bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500/)` | **YES - direct contradiction** |
| AC-1: purge legacy indigo utilities | L28 `assert.match(fileContent, /el\.classList\.add\('ring-2', 'ring-indigo-400'\)/)` | **YES - direct contradiction** |

Both literals are **currently present** in the source (verified). The headline AC-1 is literally
unachievable while that test exists - purging the string guarantees a test failure.

**AC-2 (4 tabs) vs. frozen 12-subtab contract:**
- `dashboard-settings-ux-10-10.test.mjs` L32-41 asserts all 12 subtab literals exist AND
  `const SUB_TAB_ORDER = [... 'summary'];` with `summary` **last** (capstone synthesis position).
- `executive-bio-10-10.test.mjs` L164 re-asserts the same capstone ordering.
- Replacing 12 subtabs with 4 tabs breaks both.

## 4. Blast-radius quantification

14 test files read this file, split by `npm test` gate exposure:

**IN-GATE (7) - AC-7 "zero regressions on npm test" applies directly:**
`account-lifecycle-regression`, `auth-mfa-ui-adversarial`, `cross-module-journeys`,
`mfa-static`, `profile-workflow`, `user-dashboard-forensic`, `user-product-completeness`

**ORPHANED from npm gate but still asserting source contracts (7):**
`dashboard-settings-ux-10-10`, `executive-bio-10-10`, `dashboard-settings-projects`,
`dashboard-settings-achievements-cards`, `dashboard-settings-certifications-cards`,
`modal-escape-keyboard-ux`, `oauth-password-security-ux`

The 2 direct AC-1 contradicters (`dashboard-settings-ux-10-10`, `executive-bio-10-10`) are in the
**orphaned** set - they do NOT run under `npm test`. This is the pivotal fact that makes a safe
resolution path exist (see Q1).

## 5. Questions raised to Lead (bridge dev ask)

- **Q1 (BLOCKING):** reconcile AC-1's purge mandate with the indigo/purple/emerald literals that
  `dashboard-settings-ux-10-10.test.mjs` L22/L28 assert are PRESENT. Since that test is orphaned from the
  npm gate, is it in scope to co-update it to the Cuba-token equivalents, preserving the *intent*
  (animated gradient progress bar; glowing focus ring) via `--cuba-primary-gradient` / `--cuba-primary-ring`?
- **Q2 (BLOCKING):** does AC-2's 4-tab restructure **replace** the 12-subtab Master Profile (destructive;
  breaks 2 orphaned capstone tests + the capstone synthesis UX), or is it an **additional outer tab
  layer** where the existing 12-subtab profile survives intact inside "Profile & Identity"?
- **Q3:** AC-2 Tab 3 requires a "Cuba theme switcher" + language selection. Confirm the canonical
  existing mechanism to bind to (`cuba-tokens.css` dark token block + i18next `changeLanguage`) rather
  than inventing a new theme store.

## 6. Provisional plan (HELD pending Q1-Q3 - NOT started, 0 lines of product code mutated)

1. Resolve Q1-Q3; freeze the chosen architecture with the Lead.
2. Extract the account rail (L5418-5902) + TOTP wizard + deletion modal into modular sub-components under
   `DashboardSettings/`, keeping `DashboardSettings.jsx` as the composition root.
3. Tokenise: replace all 1,339 legacy colour utilities with `--cuba-*` tokens / `.cuba-btn-*` /
   `.cuba-fill-pill`, preserving the exact gradient + focus-ring intent via `--cuba-primary-gradient`
   and `--cuba-primary-ring`.
4. Resolve the L5298 duplicate `<aside>` landmark (DIR-009 root cause) within the tab work.
5. Author `playwright.dir017.config.js` + `tests/e2e/dir017-candidate-settings.spec.js` against live stack.
6. Verify: build < 4.0s, `npm run lint` 0 errors, `npm test` no regression, INV-1 diff = 0, contrast AA.
7. Submit evidence pack to the Gatekeeper.

**Status: BLOCKED on Lead adjudication. No fabrication, no speculative rewrite of 6,154 lines against a
contradictory spec.**

## 7. Additional AC-1 factual discrepancy found during prep

AC-1 instructs the dev to use `.cl-btn--danger` for destructive actions. Verified by exhaustive
`Get-ChildItem -Recurse src -Include *.css,*.scss` sweep: this class is **only** defined in
`src/components/CoverLetter/CoverLetter.scss` (L538, L544) — it belongs to the **Cover Letter**
component's private stylesheet, NOT the Cuba design system. `src/styles/cuba-tokens.css` defines
`.cuba-btn-primary`, `.cuba-btn-outline`, `.cuba-fill-pill`, `.cuba-field` but **no danger button
class**. The available danger primitives are the token set `--cuba-danger`, `--cuba-danger-soft`,
`--cuba-pill-danger-fill/ink/line` (L87-95 + dark variants L261-269).

**Implication:** following AC-1 literally would import a Cover-Letter-scoped class into the settings
surface (a design-system boundary violation, and a cross-module coupling). Correct move is either to
author a new `.cuba-btn-danger` in `cuba-tokens.css` from the existing danger tokens, or to compose
danger styling inline from `--cuba-danger` / `--cuba-pill-danger-*`. Flagged for Lead as part of Q3's
scope confirmation.

## 8. Environment / baseline facts (verified this session)

| Item | Result |
|---|---|
| `vite build` | built in **2.94s** (wall 4.31s incl. npx overhead) — inside the < 4.0s AC-7 budget |
| `eslint playwright.dir017.config.js` | exit **0** |
| Backend `:8080/api/health` | **200** |
| Vite dev `:3000` | **200** |
| Legacy colour utils in `DashboardSettings.jsx` | **875** (131 unique) |
| Legacy colour utils in `SubscriptionModal.jsx` | **113** (56 unique) |
| **Combined AC-1 target** | **988** occurrences |

By prefix in `DashboardSettings.jsx`: text 446, border 234, bg 159, from 12, to 11, via 7, ring 4,
shadow 1, divide 1.

**Artifacts produced (non-product, safe):**
- `.bridge/evidence/dir017-plan-and-conflict-report.md` (this file)
- `playwright.dir017.config.js` (AC-6 harness config, lint-clean, mirrors proven DIR-014 pattern)


## 2. ARCHITECTURAL FACT: the component is NOT what the directive describes

The directive asserts the file is an account/security surface to be split into 4 tabs.
**Empirically it is a 12-subtab Master Profile / resume-builder**, plus an account rail:

```
SUB_TAB_ORDER = ['basic','experience','education','skills','certifications','projects',
                 'languages','hobbies','achievements','references','customSections','summary']
```

Verified line map:
- L57-275 `SUBTAB_CONFIG` (12 subtab descriptors)
- L276-6154 `function DashboardSettings` - ONE component, ~5,878 lines
- L2093-2520 hero card + 12-step ribbon + overview modal
- L2536-5294 **Master Profile workspace (12 subtabs)**
- L5298 `<aside aria-label="Master Profile Guide">` - *the DIR-009 Stage-3 duplicate-landmark root cause*
- L5418-5902 account rail: Subscription, Credentials/Password, Twilio SMS, **TOTP 2FA**,
  Email verification, GDPR export, **Active Sessions**, Login audit trail, **Danger Zone/deletion**
- L5903-6149 modals: ImageCrop, deletion confirm, TOTP wizard (3 steps), subscription, AI review

**Conclusion:** the account/security features AC-2 asks to "create" ALREADY EXIST at L5418-5902.
AC-2's real, non-duplicative work is **reorganisation + tokenisation**, not greenfield feature build.
