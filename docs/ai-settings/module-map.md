# Module Map — AI Multi-Provider Engine (`/admin/ai-settings`)

Post-decomposition architecture of `frontend/src/components/admin/ai-settings/`.

---

## 1. File Tree & Line Counts

| File | Lines | Role |
| --- | ---: | --- |
| `AdminAiSettingsTab.tsx` | 89 | Orchestrator: layout composition, context provider, subtab router |
| `index.ts` | 3 | Re-export barrel |
| **context/** | | |
| `AiSettingsContext.tsx` | 440 | Central state provider: config fetch, URL sync, revision, toast, mutations |
| **hooks/** | | |
| `useProviderMutations.ts` | 410 | Provider CRUD, enable/disable, pre-save probe, modal state, key pool |
| `useQuotaGovernance.ts` | 153 | Quota limits, reset, KPI fetch, top-users |
| `useDiscoveryPlayground.ts` | 147 | Model catalog fetch, playground inference, gateway probe |
| `useProviderFilters.ts` | 37 | URL param ↔ filter state (status, search, sort) |
| `useRevisionConflict.ts` | 32 | 409 CAS recovery: strips secrets from retry payload |
| `useRoleGate.ts` | 17 | SUPER_ADMIN / ADMIN / SUPPORT / AUDITOR gate |
| `useDialogUrlSync.ts` | 10 | `?dialog=` URL lifecycle |
| `useFeatureFlag.ts` | 8 | `ai_settings_v2_enabled` runtime toggle |
| `useAiSettings.ts` | 4 | Re-export shortcut |
| **providers/** | | |
| `ProvidersTab.tsx` | 110 | Provider list container + filter bar mount |
| `ProviderRow.tsx` | 155 | Single provider row: status badge, enable toggle, expand control |
| `ProviderRowExpanded.tsx` | 241 | Expanded row: key input, pool input, model/URL drafts, test button |
| `ProviderFilterBar.tsx` | 179 | Filter controls: search, status dropdown, sort |
| `RuntimeModelStrip.tsx` | 260 | Runtime model selection strip |
| `ConfigureProviderDialog.tsx` | 305 | Radix Dialog: platform select, key/pool tabs, pre-save probe |
| `KeyPoolTab.tsx` | 80 | Key pool management subtab |
| `KeyPoolManagerDialog.tsx` | 74 | Key pool CRUD dialog |
| `CooldownsDialog.tsx` | 60 | Cooldown entries dialog |
| `ClearKeyConfirmDialog.tsx` | 45 | Confirm key deletion dialog |
| **quotas/** | | |
| `QuotaGovernanceTab.tsx` | 82 | Quota governance container |
| `QuotaKpiCards.tsx` | 27 | KPI summary cards |
| `QuotaLimitsForm.tsx` | 85 | Quota limit editing form |
| `TopUsersTable.tsx` | 56 | Top users by usage table |
| `QuotaResetConfirmDialog.tsx` | 79 | Confirm quota reset dialog |
| **gateway/** | | |
| `UnifiedGatewayTab.tsx` | 103 | Unified gateway configuration |
| `ClaudeCodeTab.tsx` | 51 | Claude Code CLI integration |
| `IntegrationSnippetsDialog.tsx` | 90 | Dynamic origin integration snippets |
| **discovery/** | | |
| `DiscoveryTab.tsx` | 209 | Model catalog + discovery controls |
| `ModelDiscoveryDialog.tsx` | 94 | Model discovery modal |
| **playground/** | | |
| `PlaygroundTab.tsx` | 85 | Router playground: prompt, model select, inference |
| **metrics/** | | |
| `SystemMetricsTab.tsx` | 89 | System metrics + telemetry dashboard |
| **layout/** | | |
| `SettingsShell.tsx` | 131 | Error boundary wrapper + shell container |
| `SettingsHeader.tsx` | 53 | Page header with revision + save status |
| `SettingsSubNav.tsx` | 133 | Subtab navigation bar |
| `AiSettingsDialogs.tsx` | 21 | Dialog renderer (conditionally mounts dialogs) |
| `RollbackView.tsx` | 33 | Feature-flag-OFF rollback safe-mode view |
| `AdminScopedView.tsx` | 49 | Non-Super-Admin scoped view (quota only) |
| **types/** | | |
| `ai-settings.types.ts` | 270 | All TypeScript interfaces and type aliases |
| **utils/** | | |
| `masking.ts` | 26 | `splitKeys()` and key masking utilities |
| `snippets.ts` | 15 | Dynamic origin snippet generation |
| `constants.ts` | 46 | Valid subtabs, dialog slugs, default values |

**Orchestrator**: 89 lines (budget: < 300) ✅  
**Largest leaf**: `useProviderMutations.ts` at 410 lines (budget: < 500) ✅

---

## 2. Subtab → File Mapping

| Subtab | URL `?subtab=` | Primary component | Data hook |
| --- | --- | --- | --- |
| Providers | `providers` | `ProvidersTab` → `ProviderRow` → `ProviderRowExpanded` | `useProviderMutations` |
| Key Pool | `key-pool` | `KeyPoolTab` → `KeyPoolManagerDialog` | `useProviderMutations` |
| Discovery / Models | `discovery`, `models` | `DiscoveryTab` → `ModelDiscoveryDialog` | `useDiscoveryPlayground` |
| Metrics / Quotas | `metrics`, `quotas` | `SystemMetricsTab`, `QuotaGovernanceTab` | `useQuotaGovernance` |
| Unified Gateway | `unified-gateway` | `UnifiedGatewayTab` → `IntegrationSnippetsDialog` | `useDiscoveryPlayground` |
| Claude | `claude` | `ClaudeCodeTab` | `useDiscoveryPlayground` |
| Playground | `playground` | `PlaygroundTab` | `useDiscoveryPlayground` |

---

## 3. State Architecture

```text
AiSettingsProvider (context/AiSettingsContext.tsx)
├── Core state: providers[], primaryProvider, revision, v2Enabled, isSuperAdmin
├── URL state: activeSubtab, activeDialog, searchParams
├── Toast + error: showToast(), actionError
├── Config fetch: loadConfig() → GET /api/admin/ai-settings
├── Config save: commitSettingsPatch() → POST /api/admin/ai-settings
│
├── useProviderMutations (hooks/useProviderMutations.ts)
│   ├── Row drafts: singleKeyDrafts, poolKeyDrafts, modelDrafts, baseUrlDrafts
│   ├── Modal state: modalSelectedPlatform, modalApiKey, modalPoolText, etc.
│   ├── Enable/disable: handleToggleProvider()
│   ├── Key save: handleRowSaveKey(), handleModalSaveAndActivate()
│   ├── Pre-save probe: handleModalProbeBeforeSave()
│   └── Post-save probe: probeStoredProvider()
│
├── useQuotaGovernance (hooks/useQuotaGovernance.ts)
│   ├── Quota state: quotaStats, topUsers, quotaLimits
│   ├── Quota mutation: submitQuotaLimits()
│   └── Quota reset: resetDailyUsage()
│
├── useDiscoveryPlayground (hooks/useDiscoveryPlayground.ts)
│   ├── Catalog: fetchModelCatalog()
│   ├── Playground: runPlaygroundInference()
│   └── Gateway: probeGateway()
│
├── useRevisionConflict (hooks/useRevisionConflict.ts)
│   └── 409 recovery: strips secrets, offers Reload/Overwrite
│
└── useProviderFilters (hooks/useProviderFilters.ts)
    └── URL ↔ filter sync: statusFilter, searchQuery, sortOrder
```

---

## 4. Ownership & Frozen Status

| Module | Owner | Status |
| --- | --- | --- |
| `context/AiSettingsContext.tsx` | Core team | Active (post-decomposition) |
| `hooks/useProviderMutations.ts` | Core team | Active (P0 enable/disable fix applied) |
| `backend/services/aiAdmin.js` | Core team | **FROZEN** (pending gatekeeper re-certification) |
| `backend/security/adminAudit.js` | Security team | **FROZEN** |
| `backend/index.js` (AI routes) | Core team | Active |
