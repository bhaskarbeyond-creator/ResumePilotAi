# Candidate workspace SWOT — 2026-10-14

| Finding | Evidence | Impact / priority | Mitigation and verification |
|---|---|---|---|
| S1 Shared candidate navigation and route table | candidateNavigation.js, DashboardMain.renderRoutes; AST census | Less duplicated routing; P2 asset | Retain common model; verify direct navigation/aliases and both shell flags |
| S2 Broad existing regression suites | product/security logs; template 72/72 tests, local 55-variant browser manifest | Useful executable contracts, not certification; P1 asset | Preserve tests; distinguish static/simulated/DB layers |
| S3 Explicit public snapshots and revision concepts | resumes routes, resumePersistence, published/source revisions | Foundation for safe sharing and conflict recovery; P1 asset | Exercise owner/private/public/revoke with real DB and two identities |
| S4 Durable retryable notification outbox | notificationOutbox.js leases, backoff, terminal states | Failure recovery exists; P1 asset | Real DB worker crash/reclaim test, provider sandbox delivery |
| W1 Concurrent notification controls and lifecycle defects | before browser failures CAND-001–005 | Misleading state/user feedback; P2 | Fixes plus 20/20 component/browser scenarios and 8/8 simulated HTTP router tests |
| W2 Stale verification documents/test sentinels | 92 vs 93 inventory; omitted callbacks; 4 obsolete import tests | False confidence in coverage; P2 | AST census, binding/mount checks with negative tests, preserved baseline logs |
| W3 Outstanding quota ownership/AI failures | ownership test; AI_GOVERNANCE_UNAVAILABLE; backend 58 failures | Critical AI admission/isolation unverified; P1 | Approved protected-surface remediation, isolated DB, exact failed-test retest |
| W4 Warning/build debt | 243 lint warnings; build exceeds historical 4s target under concurrent load | Low signal/no performance certification; P2 | No blanket disables; triage hot paths and run controlled performance benchmark |
| O1 Journey-centred recovery UX | Existing error primitives plus notification fix | Coherent errors/retained input across modules; P2 | Apply only after per-workflow reproduction; measure recovery completion |
| O2 Repeatable evidence collection | Added foreground browser runners, manifests/traces/census | Reproducibility and more trustworthy reviews; P1 | CI lane with isolated caches, no production auth bypass, unique evidence per run |
| O3 Deterministic export fonts | Genuine Cv1/notification screenshots show missing scripts | Better offline/export legibility; P1/P2 | Licensed self-hosted script fonts + multilingual glyph/raster checks; frozen approval |
| T1 Dependency advisories | root 57 production-graph findings, backend 10 including critical proxy-addr | Potential reachable vulnerabilities; P1 | Reachability analysis, compatible updates and security regression; no blind audit downgrades |
| T2 Infrastructure/provider gaps | No MariaDB/Docker/real identity/provider access, restricted outbound hosts | Cannot prove durable end-to-end correctness; P1 | Authorised integration environment; mark blocked rather than passing mocks |
| T3 No independent reviewer | bridge command unavailable | Cannot meet Lead–Developer certification; P1 | Submit evidence to actual reviewer; no self-issued approval |
| T4 Unverified provider/data-handling details | Earlier Support Center FAQ made zero-retention/no-training/zero-drift claims; current FAQ is qualified, but privacy policy and provider contracts were not reviewed | Privacy/customer trust risk if broader claims reappear; P2 | Keep current qualified wording; require product/legal/provider evidence before adding specific guarantees |

## Action strategies

- **SO:** Use the shared route/navigation model (S1) and repeatable census (O2) to maintain a route→scenario manifest. Preserve revision/publication boundaries (S3) while adding journey recovery (O1).
- **WO:** Replace stale lexical sentinels (W2) with actual binding/mount assertions (O2); apply the notification recovery pattern (W1) to individually reproduced flows, not a blanket redesign. Resolve font delivery (W4/O3) before calling Unicode exports verified.
- **ST:** Use existing security/ownership tests (S2/S3) to gate dependency and quota changes (T1/T2). Exercise durable outbox state transitions (S4) under controlled crashes, not live failure injection.
- **WT:** Block release while AI/ownership defects, dependency findings and independent approval remain unresolved (W3/T1/T3). Do not counter missing infrastructure with synthetic production results (W2/T2). Preserve qualified support wording until policy/provider claims are reviewed (T4).

Success metrics: zero unresolved critical acceptance failures, authenticated critical journeys with read-back, all 55 template output checks plus glyph/parity inspection, viewport/state matrix coverage, and signed independent decisions. No aggregate percentage overrides these gates.
