# Tier-curation evidence files — mesh alias worksheet (H.2 / R14.2)

**Status: PACKAGE — human execution pending. No alias here is promoted; every file is an OPEN
worksheet.** One file per each of the 40 opaque mesh/aggregator aliases deliberately left
uncurated at wave 2 (`ac93772`). The authoritative list and procedure live in
`developer-review/prep-021-022/runbook-mesh-alias-verification.md`; the drift canary
(`backend/test/freellmapi-tier-registry-expansion.test.js`, `MESH_ALIASES`, pinned split
80 = 37 + 43) enforces that no promotion sneaks in without a conscious test update.

## How an operator uses this worksheet (≤ 30 min per alias, batching encouraged)

1. Open `docs/ai-settings/tier-curation/<alias>.md`.
2. Follow runbook §2: identify the backing model (provider docs / written confirmation /
   unambiguous provider metadata). Suffix strings (`-70b`, `-fast`, `-large`, `-free`) are
   **not** evidence — name-inference is forbidden (F-06).
3. Optional corroborating fingerprint:
   `MESH_BASE_URL=... MESH_API_KEY=... bash scripts/dev-db/fingerprint-probe.sh <alias>`
   — paste the transcript into the evidence file. A fingerprint alone is tier T3 =
   **never promotable**; it can only corroborate T1/T2 or flag a contradiction.
4. Fill the table, get the second signature (two-person rule), then — only with T1/T2 —
   execute runbook §4 (registry entry + canary update + re-certification + A.10-shape probe).
5. `decision: no-promotion` is a first-class outcome; record it so the quarterly sweep
   doesn't redo the work.

## Index (40 aliases, all OPEN)

aclide-large · agnes-chat · ainative-chat · aion-large · apinex-chat · bai-chat · bazaar-auto ·
beat-chat · blaze-fast · blockrun-70b · clod-large · dp-chat · electronhub-default · exp-chat ·
freeai-70b · gizmo-fast · inferbase-70b · lite · llm7-chat · llmtr-chat · logfare-chat ·
longcat-chat · lucidity-large · nara-chat · navy-70b · opencode-zen · orca-free · plugsky-chat ·
radeon-70b · requesty-chat · router9-auto · routeway-70b · sail-70b · sea-lion-70b ·
septor-70b · simplellm-large · speka-chat · uno-free · waterfall-large · xkiro-free
