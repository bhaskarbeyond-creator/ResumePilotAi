# Legacy/current comparison boundaries

References inspected: historical `2abbbe4401efd1945e2749127605bb7f80afe941`, merged `25038dc`, and live baseline `e541b4d`. Historical code was retrieved with Git/GitHub API; no remote legacy production deployment was assumed. This continuation does not change AI panel styling or unrelated product/CV modules.

|Workflow|Historical source|Current verification|
|---|---|---|
|Provider configuration, keys, model choices, Save All|`AdminAiSettingsTab.tsx`, former embedded catalog|Real authenticated discovery/save/reload and actual selected/executed model tests; model hints replaced by canonical catalog rather than preserving stale lists.|
|Additional modes|Historical pinned/default routing|Five persisted modes; actual inference for each; quality evidence explicitly unknown, not model-name heuristics.|
|Fetch Models, renamed/removed/stale catalog|Historical Fetch Models and 1522-line static catalog|Canonical additions/metadata changes/removal/error/concurrency regressions and model-table UI; successful empty catalog remains authoritative.|
|Dialogs and cooldowns|Five historical state/handler definitions; native alert on cooldown failure|Real dialog focus/Escape tests; no pretending to clear upstream quota; application errors/retry tested.|
|Routes, aliases, reload/history|Current aliases preserve query string in `LegacyRedirect`|Authenticated `/admin`, `/adm`, `/platform`, five subtabs, reload/Back/Forward at all seven viewports.|
|Tenant/role protection|Historical server-authenticated operations|Ordinary identity blocked; tenant destination/cache restrictions; additional public-worker guard and credential-scoped discovery regressions.|
|Responsive appearance|Historical source and existing screenshot artifacts, not a matched running historical deployment|New actual full-page screenshots saved for every authenticated viewport and retained in the Actions artifact. These are **current screenshots**, not invented before/after comparisons.|
|Unrelated product parity|Frozen CV surfaces at authorized original baseline|Full product invariant suite compares Git blobs, not visual resemblance. Initial local shallow-checkout failure was fixed by fetching history, not weakening the invariant.|

Viewports: 320×568, 390×844, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080. Screenshots are from the actual app/DB/test identity, not static mockups. The deliberate single 503 transport injection is explicitly separate from ordinary live paths.

**Unverified:** deployed legacy/production environment parity, pixel-matched old/new screenshots and full historical role/browser matrix. Historical source availability is not treated as execution proof. CI screenshots support current-layout review only; they cannot substitute for independent human/Opus acceptance.
