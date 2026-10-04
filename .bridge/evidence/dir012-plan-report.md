# DIR-012 — PLAN MODE FORENSIC REPORT
Directive: Platform Admin System Console, Super Admin Role Simulator & Security Audit 10/10 Overhaul
Author: Cline (Staff Developer) · Mode: PLAN (no edits to product code)
Baseline: e314f7157af451b32e7c5163eb40ce9198f94869

## BASELINE MEASUREMENTS (verified this pass)

| Gate | Result |
|---|---|
| `npx vite build` | **3.87s** (< 4.0s), 0 errors |
| Frozen surfaces diff vs e314f715 (51 Cv*, Resume, DOCX export, ATS) | **diff = 0** |
| `tests/cuba-admin-console.test.mjs` | **21/21 pass** |
| `four-portal-architecture.test.mjs` + `superadmin-control-plane.test.mjs` | **37/37 pass** |
| RequireTabPerm in Admin.jsx | 22 gates over 23 routes |

## CRITICAL CONTEXT: Cuba chrome is now the DEFAULT

`src/components/cuba/cubaShellFlag.js:47-51` — "Legacy is safely retired: Cuba is the
default shell for all users." `readStored()` returns `'cuba'` unless localStorage holds an
explicit `'legacy'`. Therefore **every Cuba-chrome defect below is on the default path**,
not an opt-in edge case. DIR-011's "legacy mode unchanged" framing no longer protects the
majority of users.

---

## DEFECT 1 — P0 — `/admin/dashboard` ROUTE IS UNGATED (RBAC parity break)

`src/components/admin/Admin.jsx:652-656`

```jsx
<Route path="dashboard" element={
    <RequireTabPerm>
        <Dashboard />
    </RequireTabPerm>
} />
```

`RequireTabPerm` (Admin.jsx:558-563) returns children unconditionally when `required` is
falsy: `if (!required) return children;`. This is the **only** route of 23 rendered without a
`required` prop (machine-verified census via `.bridge/tmp/dir012-audit.mjs`).

Meanwhile `PATH_PERMS` (sidebar.jsx:15) declares:
`'/admin/dashboard': ['system.config.read', 'users.read', 'audit.read']`.

Consequence: the sidebar **hides** Command Center from a SUPPORT/AUDITOR-shaped permission
set, but typing `/admin/dashboard` renders it anyway. The backend policy engine still denies
the data, so this is **not** a data-exfiltration breach — it is a client-side authorization
parity break that violates the "zero broken or ungated paths" criterion.

**Fix:** `required={['system.config.read','users.read','audit.read']}` to mirror PATH_PERMS.

**⚠ Redirect-loop edge case to handle in the same edit:**
`FIRST_ACCESSIBLE_TAB` (Admin.jsx:549-557) falls through to `return 'dashboard'`. Once the
dashboard is gated, a role matching none of the earlier branches would redirect to a
dashboard it cannot enter → loop. The terminal fallback must be changed to a
permission-satisfying target.

---

## DEFECT 2 — P1 — `/admin/settings` UNREACHABLE UNDER CUBA CHROME (default)

- `ADMIN_PORTAL_NAVIGATION` (portalNavigation.js:100-145) contains **20** items.
- Machine-verified: `PATH_PERMS keys NOT in Cuba nav: []` and
  `Cuba nav paths NOT in PATH_PERMS: []` → perfect 20/20 parity for those, but
  **`/admin/settings` is absent from both**.
- The legacy sidebar reaches settings via a separate `SETTINGS_GROUPS` array
---

## DEFECT 4 — P1 — ROLE-VIEW BANNER STICKY OFFSET COLLIDES WITH THE M3 HEADER

- `src/styles/cuba-tokens.css:138` → `--cuba-header-h: 68px`
- `CubaAppShell.jsx:180` → header is `sticky top-0 z-50` at exactly that height
- `Admin.jsx:616` → role-view banner is `sticky top-[57px] z-30`

Under Cuba chrome the banner sticks 11px too high and slides **underneath** the z-50 header,
clipping its top border and text. In legacy mode `top-[57px]` is equally wrong because
`AdminHeader` (Admin.jsx:152) is `flex-wrap` with variable height — 57px is a hardcoded guess
that breaks as soon as the control row wraps at narrow widths.

**Fix:** drive the offset from the token (`top-[var(--cuba-header-h)]`) under Cuba chrome;
drop the magic number in legacy mode.

---

## DEFECT 5 — P1 — ADMIN FUZZY SEARCH + LIVE ENTITY SEARCH ARE LOST UNDER CUBA CHROME

`AdminCommandPalette` is still mounted at `Admin.jsx:638`, but under Cuba chrome
`commandPaletteOpen` can never become true — all three openers are disabled:

| Opener | Status under Cuba chrome |
|---|---|
| Ctrl+K listener (`Admin.jsx:468-478`) | `if (isCubaChrome) return undefined;` — never binds |
| Sidebar palette button (`Admin.jsx:598`) | `<Sidebar>` not mounted (`Admin.jsx:591`) |
| Header palette button (`Admin.jsx:191-200`) | suppressed by `{!embedded && …}` |

So it renders `null` forever — dead component. The palette users actually get is
`CubaCommandPalette`, whose matcher is **substring, not fuzzy**
(`CubaCommandPalette.jsx:30-32`: `.includes(term)`), and which has **no live entity search**.
`AdminCommandPalette` had both, wired to the real MariaDB endpoint `searchPlatform(q)`
returning Tenants / Users / Orders / Tickets (lines 74-121).

**Consequence:** the acceptance criterion "AdminCommandPalette fuzzy search across tenants,
settings, and logs functions with keyboard navigation" is **not met on the default shell** —
entity search is gone and matching degrades from fuzzy to substring.

Secondary A11y gap: `AdminCommandPalette` uses a raw
`setTimeout(() => inputRef.current?.focus(), 50)` (line 70) and a `role="dialog"` with **no**
combobox/listbox/aria-activedescendant wiring, whereas `CubaCommandPalette` correctly uses
`useDialogA11y` + `role="combobox"` + `aria-activedescendant`.

---

## DEFECT 6 — P2 — SPEC/REALITY MISMATCH: AUDIT ENDPOINT PATH IN THE DIRECTIVE

The directive specifies `/api/admin/role-view/audit`. **That endpoint does not exist.**
The only role-view-audit route in the tree is

```
backend/routes/platform.js:2021
router.post('/role-view-audit', requireAuth, requireSuperAdmin, async (req, res) => {
```

mounted at `/api/platform/role-view-audit`, called from `Admin.jsx:434` and
`EnterpriseContextSwitchers.jsx:210`. It is correctly gated (`requireAuth + requireSuperAdmin`),
validates a real tenant UUID for `ENTERPRISE_*`, and writes to MariaDB `admin_audit_logs`
(covered by `backend/test/enterprise-role-view-simulation.test.js`, 5 sub-tests).

**No code change needed.** Recorded so the DIR-012 E2E spec targets the real route instead of
a phantom endpoint. Client failure mode is already safe: `Admin.jsx:443-445` catches and
`console.warn`s, so a failed audit never breaks navigation.

---

## DEFECT 7 — P2 — ROLE-VIEW BANNER COSMETIC / A11Y

- `Admin.jsx:618` hardcodes the 👑 crown for **every** simulated role, including
  `ENTERPRISE_*`, `SUPPORT`, `AUDITOR`, `USER`. Should key off `ROLE_DEFINITIONS` /
  `ENTERPRISE_ROLE_DEFINITIONS`, which already carry a per-role `icon`.
- The banner correctly carries `role="status" aria-live="polite"` (line 616) and the 1-click
  `Return to Super Admin` button with `data-testid="return-to-superadmin-button"` (line 630)
  → **criterion already satisfied**, no change needed beyond the icon.
- MFA banner (`Admin.jsx:640`) uses **hardcoded amber-50/amber-950** instead of
  `cuba-tokens` — a token-unification miss under the "unified cuba-tokens" criterion.
  **Low severity, cosmetic only.**

---

## CONFIRMED HEALTHY — NO ACTION REQUIRED

- **Secret masking is correct.** `AiSettings.jsx` never receives plaintext: the server sends
  `maskedKeys` + `configuredProviders` only (`backend/services/aiAdmin.js:123-136`,
---

## PROPOSED EXECUTION PLAN (ACT mode, pending authorization)

1. **Fix P0 gating parity** — gate `/admin/dashboard` to mirror `PATH_PERMS`, and harden
   `FIRST_ACCESSIBLE_TAB`'s terminal fallback to prevent a redirect loop. Re-run the
   22-gate census and the RBAC guard tests.
2. **Fix P1 settings reachability** — add the `/admin/settings` entry to
   `ADMIN_PORTAL_NAVIGATION` (plus an `admin-settings` icon) so it is reachable in both nav
   and the Cuba palette; keep `ADMIN_ALL_PATHS` in sync; extend
   `cuba-admin-console.test.mjs` parity assertions to cover it.
3. **Fix P1 banner offset** — replace the hardcoded `top-[57px]` with the
   `--cuba-header-h` token under Cuba chrome; remove the magic number in legacy mode.
4. **Fix P1 command surface** — restore fuzzy matching **and** live entity search on the
   Cuba-owned palette (reuse the existing `searchPlatform` wiring; no new backend), and
   either retire the dead `AdminCommandPalette` mount or keep it strictly legacy-only.
5. **Fix P2 banner polish** — per-role icon; move MFA banner onto cuba tokens.
6. **Add `tests/e2e/dir012-admin-console.spec.js`** against the real route
   `/api/platform/role-view-audit`, asserting: 1 header landmark, 1 Ctrl+K handler,
   banner `aria-live` + 1-click return, palette fuzzy + entity search, keyboard nav.
7. **Verify & submit evidence** — Playwright live run (0 console/page/API errors),
   real-DOM census, contrast >= 4.5:1, full static regression, ESLint, build < 4.0s,
   frozen diff = 0 vs e314f715.

**All seven steps are authorization-preserving**: Defects 1 and 2 *tighten* or *restore*
reachability of surfaces that already have server-side gates; Defects 4, 5 and 7 are
presentation-layer only. No step touches `RequireTabPerm` semantics, the MFA gate, the
backend policy engine, or any frozen surface.

## ESCALATIONS TO THE LEAD

- **ASK-1:** Defect 3 — permission-filter the Cuba admin nav, or accept dead links as the
  documented §7 trade-off? (Blocks nothing; Defects 1, 2, 4, 5 are actionable now.)
- **ASK-2:** Defect 5 — should fuzzy + entity search be added to the shared
  `CubaCommandPalette` (affects all four portals) or to an admin-specific palette?
  Recommendation: shared component with admin-only commands supplied via props, so other
  portals gain fuzzy matching with no behaviour change.

## REPRODUCTION SCRIPTS (this pass)

- `.bridge/tmp/dir012-audit.mjs` — route gating census + PATH_PERMS/route parity
- `.bridge/tmp/dir012-nav-audit.mjs` — Cuba nav vs PATH_PERMS parity + filtering check
  `maskApiKey`, `MASKED_PATTERN = /[•*]/`). All six provider fields render
  `type={showKeys.x ? 'text' : 'password'}` with placeholder "Configured securely — enter
  only to replace". Round-trip safety is enforced by `MASKED_PATTERN` on save
  (`aiAdmin.js:61-74`), so a masked value can never overwrite a stored secret.
  Writes are `requireRecentAdminAuthentication`-gated (`backend/index.js:3062`).
- **Exactly one `<header>` landmark** — `AdminHeader` degrades to `role="group"` when
  `embedded` (DIR-011 fix, verified in place at `Admin.jsx:604`).
- **MFA/TOTP gate intact** — fail-closed in `Admin.jsx:517-522`; destructive routes still
  `requireRecentAdminAuthentication`.
- **Exactly one Ctrl+K owner** — `CubaAppShell` binds only when `commands.length > 0`
  (`CubaAppShell.jsx:132-142`); `Admin.jsx` binds only when `!isCubaChrome`. No collision.
  (sidebar.jsx:69+, 30+ settings tabs).
- `CubaPortalShell` builds palette commands from `ADMIN_PORTAL_NAVIGATION` only
  (`portalCommands.js:18-36`, "zero dead commands by construction").

**Consequence:** with Cuba chrome (the default), the Super Admin has **no nav link and no
palette command** to `/admin/settings` — the entire System Configuration surface (database,
Firebase, social auth, AI providers, branding, feature flags…) is unreachable.
`ADMIN_ALL_PATHS` (portalNavigation.js:148-151) even appends `'/admin/settings'` by hand,
proving the omission is known-but-unwired.

---

## DEFECT 3 — P1 — CUBA NAV IS NOT PERMISSION-FILTERED (dead links by design)

Machine-verified:
- Legacy `sidebar.jsx` filters via `PATH_PERMS[...]` → **YES**.
- `AdminPortalCuba.jsx:31` passes raw `navigation={ADMIN_PORTAL_NAVIGATION}` → **unfiltered**.
- `CubaPortalShell.jsx` contains no permission logic at all → **no filtering**.

Under the default shell an AUDITOR/SUPPORT sees links to `/admin/operators`,
`/admin/messages` and the whole Content CMS group, each bounced by `RequireTabPerm` back to
`FIRST_ACCESSIBLE_TAB`.

**This is an intentional, documented decision** (`AdminPortalCuba.jsx:13-18`: "The wrapper
performs NO permission filtering… A second client-side filter could only disagree with the
server"), and it is **guard-tested**: `tests/cuba-admin-console.test.mjs:109` asserts the
wrapper contains no `isSuperAdmin|role===|RequireTabPerm|permissionsFor`.

➡ **ESCALATED, NOT ACTIONED** — contradicts an explicit §7 decision and a passing guard
test. Requires Lead adjudication (ASK-1).