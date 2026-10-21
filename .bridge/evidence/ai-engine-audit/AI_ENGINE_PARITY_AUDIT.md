# AI Multi-Provider Engine — Parity Audit & Modernisation Record

**Scope.** Compare the legacy AI settings surface (`/admin/settings?tab=aiSettings`, `src/components/admin/settings/AiSettings.jsx`, 1 580 lines) with the modern engine console (`/admin?tab=ai-settings`, `frontend/src/components/admin/AdminAiSettingsTab.tsx` + `frontend/src/components/admin/ai-engine/*`), across every page and deep link; close every functional gap; and prove the result with a five-viewport Playwright matrix.

**Quality bar.** Real data only. No fabricated latency, uptime, request counts, tier limits or model lists. Where a backend contract genuinely cannot answer, the UI must *say so* rather than substitute a default.

---

## 1. What was measured

| Surface | Legacy | Modern (after this change) |
|---|---|---|
| Entry point | `/admin/settings?tab=aiSettings` (grid hub → panel) | `/admin?tab=ai-settings`, `/admin/ai-settings`, and the legacy URL (aliased) |
| Sections | 1 long scroll | 5 addressable sections: `overview`, `providers`, `catalog`, `usage`, `telemetry` |
| Deep links | `?tab=aiSettings` only | `?section=<id>` + aliases (`routing`, `credentials`, `models`, `quota`, `health`, …) |
| Rear space | Unused column, `max-w-7xl` at 1920 | `max-w-7xl` → `xl:max-w-[1600px]` admin canvas |
| Render health at 1440 | Panel content mounts but is clipped below the first provider card; the hub's own navigator consumes the viewport | Full page renders, no clipping, no horizontal overflow at any of the five widths |

Legacy render fault, captured in `evidence/ai-engine-audit/v2/legacy-1440-settings-aiSettings.png`: the operator lands on the settings hub, the panel's own nodes exist at `y≈1111` while `document.scrollHeight` stays at the viewport height — i.e. the panel is laid out but never reachable. That is the baseline the modern console has to beat, and it is why "renders completely" is asserted explicitly in the suite rather than assumed.

---

## 2. Feature parity ledger

Every row below was checked against `backend/services/aiAdmin.js` (the contract implementation) and the running backend, not against the legacy component's intent.

| Capability | Legacy | Modern | Evidence |
|---|---|---|---|
| Provider inventory (6 adapters) | cards | cards + fleet summary | `ai-engine-provider-<id>` |
| Enable/disable an adapter | toggle | toggle, optimistic + revisioned save | `ai-engine-enable-<id>` |
| Seed model selection | `<select>` | `<select>` + custom model id apply | `ai-engine-provider-<id>-custom-model` |
| Custom model id | text input | text input + validation + explicit Apply | `ai-engine-provider-<id>-apply-model` |
| Base-URL override | text input | text input + explicit "reset to default" that maps to the backend's `'none'` clear token | `-base-url`, `-base-url-reset` |
| Write-only API key | masked input | masked input, reveal toggle, never written to `localStorage`, cleared after save | `-key-<id>` |
| Credential provenance | `credentialSources` banner | per-card provenance + mask + environment-vs-stored badge | `-credential-<id>` |
| Revoke credential | "Clear secret" button (immediate) | explicit confirmation popup → staged removal → only applied on save | `-clear-<id>`, `ai-engine-confirm-dialog` |
| Connectivity test | button + result | button + result, server code surfaced verbatim, **no** fabricated latency | `-test-<id>` |
| Model discovery | button | discovery + searchable catalogue table + per-provider status + model detail popup | `ai-engine-catalog-*`, `ai-engine-model-dialog` |
| Routing policy (primary, temperature, maxTokens, fallback, import module) | present | present + failover chain explanation + governance metrics | `ai-engine-routing-policy`, `ai-engine-failover-order` |
| Quota panel | present | tier limits form, today's ledger, per-user reset, reset-all — all behind confirmations | `ai-engine-quota-*` |
| Platform health for `ai-providers` | not present | health row from the 28-service collector, with remediation/affected-feature context | `ai-engine-telemetry-health` |
| Public availability beacon | not present | boolean-only projection of `GET /api/service-availability` | `ai-engine-telemetry-beacon` |
| Explainability | none | session measurements, related-endpoint matrix, credential matrix | `ai-engine-telemetry-*` |
| Revision conflict | none | `AI_SETTINGS_CONFLICT` surfaced, edit preserved, reload affordance | `Save failed (AI_SETTINGS_CONFLICT)` |
| Recent-auth / MFA | none | `ReauthDialog` retries the **exact** pending operation | `ai-engine-reauth-dialog` |
| Role gating | super-admin only | super-admin gate + read-only console for lesser roles (server refuses the projection) | `ai-engine-forbidden` |
| Mobile | fixed desktop grid | 1-col cards, scrollable tab strip, 36 px hit targets, sticky action bar with reserved space | responsive suite |

### Discrepancies found and fixed

1. **`secretInputType` prop drift** — the orchestrator passed it, `ProviderCard` never declared it, so the input hardcoded `password`. Prop is now declared and threaded; reveal still overrides it.
2. **Base-URL reset used an invented token** — the orchestrator emitted `'__none__'` while the documented clear value is `'none'`, so "reset to default" would have silently set a literal URL. Translated in `buildSaveBody` only.
3. **Errors lost the server's code** — `toApiError` read axios's own `.code` (`ERR_BAD_RESPONSE`), hiding the contract code. It now routes through the api-client's `normalizeError`, so `AI_PROVIDER_NOT_CONFIGURED`, `AI_SETTINGS_CONFLICT`, `CONFIGURATION_MISSING` reach the operator.
4. **Header button claimed "Saved"** — the primary button read "Saved" even before any save in the session. It now shows "No unsaved changes" until a save actually succeeds.
5. **Placeholder model ids were wrong for 3 providers** — every card showed `meta/llama-3.3-70b-instruct`. Each provider now has its own `modelPlaceholder` from the registry.
6. **Staged key left the helper text contradicting the form** — the "connectivity needs a credential" note persisted while a key was staged. It now switches to "staged, stored only on save".
7. **Sticky bar covered the last card on phones** — `pb-24` was not enough once the bar wraps to two rows at 375/414. Now `pb-32`, verified at max scroll.
8. **Tab strip hit areas were 28 px** — raised to `min-h-9` on small screens (36 px), desktop rhythm unchanged.
9. **Popups returned focus to `<body>`** — there is no Radix `DialogTrigger`, so closing dropped keyboard focus. `useReturnFocus` restores it to the invoking control.
10. **No legacy deep link into the engine** — `?tab=aiSettings` / `ai_settings` / `aisettings` at `/admin/settings` now resolve to the AI tab, and `/adm|/platform/ai-settings` redirect into it with the suffix preserved.
11. **Admin canvas was pinned to 1280 px** — dense engine tables wasted a third of a 1920 display. The console shell widens to 1600 px at `xl`, and every existing admin surface was re-checked for overflow.

---

## 3. Honesty ledger (what the sandbox actually returned)

The certification backend runs on the in-memory repository (`IN_MEMORY_REPOSITORY=1`) with no provider secrets and no MariaDB. Therefore:

| Read | Result | Console behaviour |
|---|---|---|
| `GET /api/admin/ai-settings` | 200, `persistence: "in-memory-certification"`, `revision 0` | renders, labels persistence "Certification store" |
| `POST /api/admin/ai-settings` | 200, revision increments | real revisioned write, conflict path proven |
| `POST /api/admin/ai/test-provider` | 503 | "Test failed", server code shown, no latency invented |
| `POST /api/admin/ai/fetch-models` | `AI_PROVIDER_NOT_CONFIGURED` for unseeded adapters; `ECONNRESET` (egress blocked) with a staged key | error code shown verbatim, catalogue stays empty |
| `GET /api/admin/ai/quota-stats` | `ECONNREFUSED` | explicit "Usage ledger unavailable", **no** zeroed table, **no** tier defaults |
| `GET /api/platform/operational-status/ai-providers` | 200, `NOT_CONFIGURED` | health row rendered from the collector |
| `GET /api/service-availability` | 200, `ai.providers:false` | beacon booleans rendered as-is |

Nothing in the console upgrades a "cannot read" into a "0".

---

## 4. Test matrix

`playwright.ai-engine.config.js` — 5 projects (375 / 414 / 768 / 1280 / 1920), 112 scheduled tests, **107 passed, 5 skipped, 0 failed** (6.3 min).

Tag policy keeps mobile coverage real without a 15-minute run:

- `@responsive` — layout matrix, **all five** viewports (7 tests × 5).
- `@smoke` — deepest single journey (deep link, provider render, save contract), **all five** viewports (3 × 5).
- untagged — full behavioural suite on the two large viewports.

Skips are all environment-conditional and self-documenting: quota mutations when the ledger cannot be read, deployment-managed credential revocation, focus/dialog checks that need a revocable secret, and touch-target sizing on desktop widths.

Coverage highlights:

- Deep links: canonical, five sections, six aliases, unknown alias, legacy `?tab=aiSettings` (+ two variant spellings), `/adm` & `/platform` redirects, unknown sub-path, sidebar/tab navigation.
- Write path: staged key is write-only (asserted against `localStorage`), masked server-side after save, revision advances, revoke → confirm → cancel → confirm → discard → confirm → save, cleanup back to the original state.
- Popups: reauth retry of the exact pending save (produced with a real 403 body), revision conflict (409), model-detail dialog + Escape, focus trap and focus restoration.
- Failure honesty: 503 settings read produces a retryable error and **no** provider cards; dead beacon produces no invented uptime.
- Responsive: zero horizontal overflow on all five sections × five viewports, control boxes non-degenerate, sticky bar clears the last card at max scroll, dialogs fit the viewport, 36 px targets on phones.
- **Popups (external references):** all six provider documentation links and the key-console links open a real browser popup (`target="_blank"`, `rel="noopener noreferrer"`, `window.opener === null`), the console URL and section never change, and a staged-but-unsaved API key survives the round trip. The sandbox has no egress, so the provider *hosts* are fulfilled at origin level only — the console's own data is untouched.

### Reproduce

```bash
# Chromium for this sandbox only:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH=/tmp/al2023/lib \
npx playwright test -c playwright.ai-engine.config.js
```

The config boots the Vite app on `:4000` and the backend on `:8080` in certification mode, granting `SUPER_ADMIN` through `PREVIEW_SUPER_ADMIN_EMAILS` — the server-side allowlist, never a client-side claim.

---

## 5. Visual evidence

`evidence/ai-engine-audit/v2/` — 25 full-page captures, five viewports × five sections, plus the legacy baseline:

| | 375 | 414 | 768 | 1280 | 1920 |
|---|---|---|---|---|---|
| overview | ✓ | ✓ | ✓ | ✓ | ✓ |
| providers | ✓ | ✓ | ✓ | ✓ | ✓ |
| catalog | ✓ | ✓ | ✓ | ✓ | ✓ |
| usage | ✓ | ✓ | ✓ | ✓ | ✓ |
| telemetry | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 6. CI gate repair (adjacent, blocking)

The PR's quality gate was red before this branch existed, at the step **before** lint:

```
Clean-state migration application did not reach version 017 (observed 026)
```

`scripts/verify-mariadb-migrations.mjs` asserted a literal end-version that went stale when migrations 018–026 landed — 026 being the AI quota counter migration that this console's usage panel reads. The expectation is now derived from `discoverMigrations()`: a clean database must apply **every** checked-in migration and finish with nothing pending. `backend/test/migration-verifier-expectation.test.js` pins that derivation DB-free so the literal cannot return.

Two further pre-existing red marks remain and were deliberately **not** touched, because they belong to other workstreams:

- `eslint .` reports 9 errors in unmodified files (`backend/repositories/InMemoryRepository.js` duplicate object keys from the deliberate server-owned-override spread; `tests/unit/buildResumeLogic.unit.test.js` calls an undefined `shouldStepCompleted`).
- The gate's own MariaDB steps cannot be exercised in this sandbox (no database, no root); only static verification of the new assertion logic was possible here.

## 7. Remaining, explicitly out of scope

- **Live provider traffic.** This sandbox cannot reach `api.openai.com` (TLS reset). Connectivity and discovery therefore demonstrate the *failure* path end-to-end; the success path is covered structurally (the same code renders either branch) but cannot be photographed here.
- **MariaDB persistence.** `persistence: "mariadb"` requires a database; the in-memory certification store exercises the same projection and revision semantics.
- **Non-billable probes.** The platform health row uses the collector's metadata-only probe; no billable generation is issued from the console.
