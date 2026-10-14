# Candidate end-to-end pipeline test report

## Scope verdict

**0 fully verified live critical candidate journeys.** Real browser component and document-generation tests executed, but no full authenticated frontend→backend→MariaDB→provider→user outcome was established. This report must not be interpreted as production-ready or all-pipeline simulation complete.

Register: [42 discovered pipeline families](CANDIDATE_PIPELINE_INVENTORY.md). Source census and test manifest are discovery tools; per-state exhaustive pipeline coverage is still incomplete. Main evidence root: `artifacts/candidate-audit-20261014/`.

| Journey / requirements | Executed stages | Success/failure/recovery evidence | Not executed / disposition |
|---|---|---|---|
| J-01 P21 inbox → read/bulk → retry → reload | Real component, actual API client, simulated HTTP, real DOM/keyboard; separate real Express router with test identity/SQL double | 20/20 browser, 8/8 router tests; FI-01–15; before/after shots and final traces | Real auth middleware/token expiry, MariaDB durability, concurrent tabs, bell sync; BLOCKED/PARTIAL |
| J-02 P10→P11 fixture → preview renderer → output | Actual TemplateRenderer CV/cover dispatch, four fixtures each; Chromium print; pdfjs parser; CV DOCX generator/ZIP XML | 220/220 final isolated checks, 55 PDFs, 51 DOCX, 55 shots; minimal/normal/long/Unicode DOM checks | Input form save, backend mapping/entitlement/render tokens, download filename/MIME, glyph/parity/full clipping; PARTIAL |
| J-03 P02→P04→P08→P11 profile → tailored resume → score → export | Existing local/static tests, builder binding/mount and guard checks | 50/50 targeted sentinel/domain tests; broader product results below | No real profile/resume writes or final authorised download; BLOCKED |
| J-04 P06/P07 sharing → anonymous view → revoke | Source trace and existing publication tests | Explicit publication guards found in resumes router | Real publication/revocation/cache leakage test unexecuted; BLOCKED |
| J-05 P12→P13→P14 jobs → apply → track | Source trace, existing local domain/static tests | Backend applications route and separate tracker domain identified | Owner/employer identities and durable transaction unavailable; BLOCKED |
| J-06 P15/P16→P17 interview → completion → result | Existing local interview tests and source trace | CBT browser storage vs server live-session distinction recorded | Real generated interview, interrupted session, persisted results/provider unavailable; BLOCKED |
| J-07 P18 portfolio edit → publish → anonymous access → private | Existing sanitization/template tests, source trace | Public projection and slug routes identified | Durable publish/slug race/privacy/revocation unexecuted; BLOCKED |
| J-08 P01/P27 session expiry → recovery → intended workflow | Source and existing auth/static tests | Return-path/auth wrapper and sign-out boundaries inspected | Real expired identity and preserved draft journey unexecuted; BLOCKED |
| J-09 P09 identity → quota → provider → accounting | Existing backend test execution | Multiple tests fail AI_GOVERNANCE_UNAVAILABLE/503; missing quota ownership declaration | Provider/DB sequence not established; REQUIRES REMEDIATION + infrastructure |
| J-10 P23/P33 payment → callback → entitlement | Source/test discovery only; no charges | Five provider families and extra callbacks identified | Provider sandbox, webhook replay, exactly-once activation/financial integrity unverified; BLOCKED |
| J-11 P32 event → transactional queue → worker → delivery | Existing outbox unit tests in security command | Leases/retry/dead-letter, at-least-once semantics identified | Real transaction/worker crash/provider delivery unavailable; BLOCKED |
| J-12 remaining registered pipelines | Static discovery and broad existing tests where included | P03–05/19/20/22/24–26/29–31/34–42 explicitly retained | No blanket pass; per-pipeline A–L execution matrix incomplete |

## Scenario applicability

P21 covers A valid load/mutation, B malformed envelope/body, C/D HTTP denial fixtures plus simulated owner-scope router checks, E dependency rejection, F simulated refresh/read-back, G manual retry, H duplicates, I local conflicting actions, J long/Unicode content, K unmount/StrictMode, L adjacent tests. Those labels do not claim live identity or durable DB verification. Pending fetch timeout remains untested.

P10/P11 covers A rendering/local output, J minimal/long/Unicode, L repeated variants. Authentication/authorization/persistence/retry/duplicate export charging are applicable to the complete export pipeline but absent here, not “not applicable.” PDF/DOCX bytes are generated directly, not downloaded from the backend.

For every other registered pipeline, A–L remain unverified unless a specifically identified existing test proves that narrower stage. No test was skipped and counted as passed. No meaningful cross-module live journey is accepted yet.

## Harness failures retained

Initial template run: 165/220, all 55 normal fixtures stopped on incorrect cleanup API. Fixed test harness, rerun 220/220. Later simultaneous Vite/full regression/build run: 216/220, Cover4 render-boundary failures. Cache isolation and console/request diagnostics added; final serial run 220/220. Preserve both failed manifests and logs. Original concurrent exception was not captured sufficiently for a conclusive root cause; stability under concurrent runners remains a follow-up gate.

## Lead decision

**BLOCKED — VERIFICATION UNAVAILABLE.** No independent reviewer or real integration environment is available. Developer local verification is not independent acceptance. See restructuring roadmap for the next executable directive.

## Latest harness recheck

The final two browser suites were run simultaneously with separate Vite caches: notifications **20/20** and templates **220/220** passed (`notification-cache-isolated-final.log`, `template-cache-isolated-final.log`). This adds one successful concurrent recheck, not a conclusive reconstruction of the earlier Cover4 exception. Failed manifests/logs remain retained.
