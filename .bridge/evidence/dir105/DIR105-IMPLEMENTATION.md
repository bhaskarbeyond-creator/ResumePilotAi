# DIR-105 — Restore Full 26+ Platform Settings Operations to Superadmin

**Status:** implemented + verified (ACT mode; plan approved by Lead at 2026-10-12T17:14Z)
**Priority:** P0 · **Type:** reachability regression (NOT a security hole)

---

## 1. Root cause (evidence-backed)

| # | Fact | Source |
|---|------|--------|
| 1 | Cuba chrome is the **default** shell | `cubaShellFlag.js:57-58` |
| 2 | The legacy `Sidebar` renders **only when `!isCubaChrome`** | `Admin.jsx:712` |
| 3 | That sidebar owned `SETTINGS_GROUPS` (6 groups / 31 surfaces) and navigated via `?tab=<key>` | `sidebar.jsx` |
| 4 | Cuba nav exposes **one** settings entry with **no `?tab=`** | `portalNavigation.js:177-183` |
| 5 | `Settings.jsx` defaulted to `modulesSettings` and had **no in-page navigation** | `Settings.jsx:184` |

**Net effect:** a Super Admin landed on *Addon Modules* with no control to reach the
other ~30 panels. Authorization was never bypassed — it was enforced twice
(`RequireTabPerm required="*"` in `Admin.jsx`; `SettingsWrapper` `isDenied`).

---

## 2. Change set

| File | Change |
|------|--------|
| `src/components/admin/settings/settingsAccess.js` | **NEW.** `canAccessSetting()` + `SETTINGS_GROUP_ORDER` + `presentGroups()`. Plain `.js` so `node --test` can import the predicate directly. |
| `src/components/admin/settings/SettingsNavigator.jsx` | **NEW.** The navigation hub: category pills, live search, entitled tab grid. Drives `?tab=` through `setSearchParams`. |
| `src/components/admin/settings/Settings.jsx` | Inline `hasPerm` **deleted**; the denial gate now calls `canAccessSetting`. The hub mounts on **both** the allowed and the denied branch (a denied operator is no longer stranded). |
| `tests/admin-settings-navigation.test.mjs` | **NEW.** 26 guards (inventory reachability, authorization, hub wiring, tokens, palette indexing). |
| `src/components/cuba/portalCommands.js` | **NEW** `buildSettingsCommands()` — palette indexing for the 26+ panels (§10.2). Drift-free: generated from the same inventory + the same predicate. |
| `package.json` | `test:dir105` script. |

### Why one predicate
`SettingsWrapper` (the gate) and `SettingsNavigator` (the hub) both call
`canAccessSetting`, so the hub can never advertise a panel the gate would refuse,
nor hide one it would allow. Array-form permissions keep their OR semantics.

### Inventory drift closed
`ALL_SETTINGS` declares **33** keys; the legacy `SETTINGS_GROUPS` declared **31**
(`facebookAuthSettings` + `paymentSettings` existed only in `ALL_SETTINGS`). The hub
is generated from `ALL_SETTINGS` alone — the single inventory — so drift is now
structurally impossible.

---

## 3. Verification (all green)

| Gate | Result |
|------|--------|
| `npm run build` | **3.64 s**, exit 0 (< 4.0 s budget) |
| `node --test tests/admin-settings-navigation.test.mjs` | **26 / 0** |
| `npm run test:design-system` | **142 / 0** (28 suites, incl. `cuba-admin-console`, `cuba-portal-navigation`, frozen-template §8) |
| ESLint (5 changed files) | **0 errors, 0 warnings** |
| Live crawl (real Firebase + real MariaDB) | **RESULT: PASS — 23 checks, 0 failures** |
| **INV-1** `src/cv-templates/` + `backend/services/aiRuntime.js` | **0-byte diff** |

### Live crawl detail (`verify-settings-nav.mjs`)
Super Admin session minted with real claims `{role:SUPER_ADMIN, superAdmin:true, permissions:["*"]}`.
Nothing stubbed — a broken settings API fails the run.

| Check | 320 px | 768 px | 1440 px |
|-------|--------|--------|---------|
| Hub renders | PASS | PASS | PASS |
| Offers 26+ panels | **33** | **33** | **33** |
| Category filters | 7 | 7 | 7 |
| `?tab=` written on select | PASS | PASS | PASS |
| Console errors | **0** | **0** | **0** |

Operator session (`role: ADMIN`, `isSuperAdmin === false`):
- `firebaseSettings`, `databaseSettings`, `aiSettings`, `storageSettings`, `twilioSmsSettings` → **not advertised** (count 0)
- Never granted the full console — redirected to `/admin/audit-logs`
- Hand-typed `/admin/settings?tab=firebaseSettings` → **never yields the gated panel**

---

## 4. Invariants upheld

- **Zero security bypass** — no new permission tag; `superAdminOnly` still super-admin-only; the route gate and backend policy engine remain the only authorities. `tests/cuba-admin-console.test.mjs:55` stays green.
- **Zero secret leakage** — the hub renders labels/descriptions/routes only; a guard test asserts it never references `api_key|secret|password|bearer|private_key`. Panels keep their own masking.
- **Cuba design tokens** — a guard test rejects raw hex and off-token Tailwind colour ramps in the navigator.
- **INV-1** — 0-byte diff.

## 6. Command palette indexing — CLOSED (was the CHANGES_REQUESTED gap)

The Lead's first review verdict was **CHANGES_REQUESTED**: *"evidence does not
confirm the Ctrl+K Command Palette indexes all settings tabs as required."* That is
now closed and **live-proven**, not merely unit-tested.

| Layer | Change |
|---|---|
| `settingsAccess.js` | `ALL_SETTINGS` **hoisted here** from `Settings.jsx`. The hub, the denial gate and the palette now read ONE list. |
| `portalCommands.js` | `buildSettingsCommands()` + `matchSettingsCommands()`. Access filtering is **opt-in**: with no access context it is a search *index*. |
| `adminEntitySearch.js` | `searchAdminEntities()` now merges settings hits ahead of the live platform records. |

**Design note — why indexing the full inventory is not a bypass.** The palette is a
search index, not a gate. A hit only carries a `?tab=` deep link; `SettingsWrapper`
still refuses an unentitled panel exactly as it does for a hand-typed URL, and
`RequireTabPerm` / `backend/security/policy.js` remain the authorities (§7). The
settings *hub* still passes access and therefore only ever offers entitled panels.

**Guard preserved.** `AdminPortalCuba.jsx` still reads no permission and issues no
request — a new test asserts this explicitly, so `cuba-admin-console.test.mjs` stays
true.

### Live proof (all three viewports)
| Check | 320 px | 768 px | 1440 px |
|---|---|---|---|
| Ctrl+K palette opens | PASS | PASS | PASS |
| Indexes "Firebase Identity" | PASS | PASS | PASS |
| Indexes "Code Injection" (superAdminOnly) | PASS | PASS | PASS |

## 7. Honest status — carried forward

Nothing in §10.1–§10.4 is now outstanding. The remaining DIR-106 governance items
(P1-3/P1-4 reservation ledger, P1-5 credential policy, P1-6 key encryption at rest)
are **separate directives**, not part of DIR-105, and are not touched here.

## 8. Artifacts
`verify-settings-nav.mjs` · `crawl-palette3.log` (32 checks, PASS)
`screenshots: settings-nav-{mobile-320,tablet-768,desktop-1440,operator-denied}.png`
`build-dir105.log` (3.57 s) · `dir105-tests.log` (35/0) · `design-system.log` (142/0)
`eslint-dir105.log` (empty = clean) · `DIR105-IMPLEMENTATION.md` (this file)


