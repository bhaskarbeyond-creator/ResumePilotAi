# MASTER ENGINEERING DIRECTIVE — FINAL EDITION
## Complete Pure-Codebase Forensic Audit, Zero-Gap Engineering, Frozen-Module Verification, Premium UI/UX Transformation and Production-Readiness Certification

**Project:** IME365 — Interview Made Easy  
**Directive owner:** Engineering Leadership  
**Primary accountable roles:** Technical Lead and Implementing Developer  
**Audit scope:** The complete in-scope source code, executable application, runtime behaviour, current configuration, integrations and reproducible verification results obtained directly from the current repository.  
**Primary deliverable:** A comprehensive, evidence-backed executive audit report and a prioritised, dependency-aware remediation roadmap.  
**Final objective:** Achieve demonstrable 99–100% code quality, eliminate all known actionable errors and warnings within the approved release scope, close all identified functional gaps, deliver exceptional UI/UX and responsiveness, and verify all critical workflows before production certification.

---

# 1. MISSION AND NON-NEGOTIABLE EXPECTATIONS

You are responsible for discovering the actual condition of the complete application, identifying its defects and deficiencies, and developing a credible engineering plan to bring it to the highest defensible quality standard.

This is not a superficial code review, a quick linting exercise, a documentation review, a list of generic recommendations or an exercise in confirming previous developers' claims.

You must independently establish:

- What code actually exists.
- What functionality is implemented.
- What functionality is missing or incomplete.
- What works in actual execution.
- What fails under normal, boundary and failure conditions.
- What existing errors and warnings remain.
- What hidden dependencies connect different modules.
- What frozen or legacy modules affect the active application.
- What prevents users from completing their tasks efficiently.
- What breaks across devices, browsers or viewport sizes.
- What architectural weaknesses cause repeated defects.
- What must be repaired, restructured, tested and independently verified.
- What remains unverified or prevents production readiness.

**The quality target is 99–100%, but the target must be earned through actual remediation and independently verifiable evidence. Never manipulate metrics, suppress diagnostics or exclude difficult modules to manufacture a high score.**

No in-scope component may be silently skipped. No known actionable defect may be ignored because it predates this audit. No workflow may be declared complete merely because its primary screen or API works.

---

# 2. ABSOLUTE RULE: PURE-CODEBASE AUDIT ONLY

## 2.1 Sources of truth

Base the audit exclusively on the current implementation and fresh evidence generated from it.

Authoritative audit inputs include:

- Current source code.
- Actual route and component registrations.
- Backend handlers, services, middleware and business logic.
- Database models, migration code, schema definitions and constraints.
- Current configuration and dependency manifests.
- Executable application behaviour.
- Current test source code and freshly executed test results.
- Current build, lint, type-check and static-analysis output.
- Fresh browser screenshots, console output and network traces.
- Reproducible API, integration and end-to-end test results.
- Current infrastructure, CI/CD and deployment code where included in the repository.

Inspect source code directly and generate new evidence for this audit.

## 2.2 Excluded sources

Do not use the following to establish the application's current condition:

- README files and existing documentation.
- Historical specifications and requirements documents.
- Previous audit reports.
- Previous production-readiness reports.
- Historical screenshots or recordings.
- Previous developer or technical-lead assessments.
- Old test results, coverage reports or defect registers.
- Previous completion claims or inherited status summaries.
- Comments asserting that code is complete, safe, tested, frozen or production-ready.

Do not copy findings or conclusions from earlier assessments. Do not assume an earlier issue is still present or that a previously resolved issue remains resolved. Inspect and verify the actual current implementation.

Existing test files may be inspected as source code, but their existence does not prove correctness. Execute them and independently evaluate whether their assertions test the expected behaviour.

Current code comments may help locate implementation details, but comments are not proof of actual execution or correctness.

If the intended business behaviour cannot be determined from the implementation, identify a requirement ambiguity and request a product or leadership decision. Do not invent requirements merely to increase the defect count.

## 2.3 Establish a clean audit baseline

Before modifying code:

1. Identify the current repository revision and working-tree state.
2. Inventory the source code, dependencies, routes, APIs and database structures.
3. Identify all active, frozen, archived, disabled and legacy modules.
4. Execute applicable baseline builds and diagnostics.
5. Run the available test suites.
6. Inspect actual runtime behaviour wherever possible.
7. Capture fresh browser and responsive evidence.
8. Record existing failures, warnings, skipped checks and environmental blockers.
9. Preserve user changes and avoid destructive operations.

Record exact commands, scope, outputs and limitations.

The initial baseline must be generated from the repository as it exists now, not reconstructed from previous reports.

---

# 3. COMPLETE REPOSITORY AND MODULE DISCOVERY

Inspect the entire relevant codebase rather than focusing only on recently modified files, primary dashboards or obvious defects.

Discover and inventory:

### Frontend
- All routes, pages, layouts and navigation structures.
- All dashboards, forms, tables, charts and interactive components.
- Shared components, styling systems, design tokens and responsive rules.
- State management, API clients and asynchronous operations.
- Authentication and permission-dependent UI.
- Loading, success, empty, error and recovery states.

### Backend
- Application entry points and route registration.
- Controllers, routers, services and business logic.
- Middleware, authentication and authorisation.
- Request validation, response schemas and exception handling.
- Background jobs, queues, scheduled tasks and event handlers.
- Integration adapters, webhooks and external provider clients.
- Rate limiting, caching, retries and timeout mechanisms.

### Data layer
- Database models and relationships.
- Schema definitions, migrations and constraints.
- Transaction boundaries and concurrency controls.
- Tenant ownership and access restrictions.
- Data lifecycle, archival and deletion logic.
- Query performance and indexing.
- Database consistency and recovery mechanisms.

### Engineering infrastructure
- Dependency manifests and lockfiles.
- Build, lint, type-check and test configurations.
- CI/CD workflows.
- Environment and feature-flag configuration.
- Logging, monitoring and observability.
- Deployment, startup, health checks and rollback mechanisms.
- Security scanning and dependency maintenance.

Trace imports, exports, dynamic registrations, route bindings, event consumers, configuration switches and cross-module dependencies.

Identify duplicate implementations, abandoned functionality, dead code, incomplete migrations, placeholder functions, inconsistent contracts and code paths that existing tests do not exercise.

Produce a source-code coverage inventory that explicitly records what was inspected, what was executed, what was verified and what remains blocked.

---

# 4. MANDATORY FROZEN-MODULE INVESTIGATION

Frozen, archived, legacy, disabled and partially migrated modules must receive the same systematic audit as active modules.

**A frozen label is not permission to ignore code, existing defects, dependencies or integration risks.**

## 4.1 Discover frozen modules independently

Identify modules that are:

- Marked frozen or read-only.
- Archived or retained for compatibility.
- Disabled through feature flags or configuration.
- No longer visible in navigation but still referenced.
- Replaced by newer implementations.
- Partially migrated or incompletely integrated.
- Used by other modules despite appearing inactive.
- Connected to scheduled jobs, event handlers or APIs.
- Referenced through dynamic imports or configuration.
- Apparently orphaned or abandoned.

Do not rely solely on directory names, comments or developer claims.

## 4.2 Inspect each frozen module

For every discovered module:

1. Inventory all relevant source files.
2. Map incoming and outgoing dependencies.
3. Trace its actual execution paths.
4. Check routes, API bindings and feature-flag conditions.
5. Inspect database access and data ownership.
6. Identify duplicated or conflicting business logic.
7. Check compatibility with active modules.
8. Identify existing errors, warnings and security concerns.
9. Evaluate incomplete functionality and missing integrations.
10. Determine whether users can reach the module directly or indirectly.
11. Identify regressions that changes to connected modules could cause.
12. Recommend the safest remediation or preservation strategy.

Where possible, validate reachability through non-destructive runtime checks.

If execution is unsafe or impossible, perform the available static analysis and record the precise limitation.

## 4.3 Frozen-module classification

Classify each module:

- **F1 — Active and connected:** Participates in current workflows.
- **F2 — Dormant but reachable:** Can be activated through configuration, routes or dependencies.
- **F3 — Partially integrated:** Some capabilities are connected; others are incomplete.
- **F4 — Legacy compatibility:** Retained for existing consumers or backward compatibility.
- **F5 — Apparently orphaned:** No valid consumer or execution path identified after systematic inspection.
- **F6 — Verification blocked:** Evidence is insufficient to determine the current operational status.

Do not classify a module as orphaned based on a basic text search alone. Consider dynamic imports, plugin registries, generated bindings, scheduled execution and event-driven references.

## 4.4 Frozen-module change control

Audit coverage is mandatory; modification is subject to normal change control.

Do not automatically delete, unfreeze, rewrite or migrate frozen functionality.

For each proposed change, document:

- The defect or business justification.
- The affected dependencies.
- The compatibility implications.
- The potential impact on active workflows.
- Required regression tests.
- Rollback requirements.
- Necessary approval.

Ensure that improvements to shared code do not silently break frozen modules.

---

# 5. COMPLETE PRE-EXISTING ERROR AND WARNING ELIMINATION

All pre-existing actionable errors and warnings must be identified, investigated, fixed where authorised and verified. The same applies to newly discovered issues and regressions.

Do not restrict cleanup to newly introduced diagnostics.

## 5.1 Run the complete diagnostic suite

Execute every applicable check supported by the current repository, including:

- Frontend and backend builds.
- Linting across all applicable source directories.
- Static analysis.
- Type checking.
- Unit and integration tests.
- API and contract tests.
- Database migration and schema checks.
- Dependency and security scanning.
- Application startup and shutdown checks.
- Browser console and network inspection.
- Responsive and accessibility diagnostics.
- End-to-end workflow tests.
- Existing CI quality gates.

Inspect diagnostic configurations to ensure that they do not silently exclude significant directories, frozen modules, legacy code or relevant file types.

If a tool is unavailable, record the limitation and identify an appropriate alternative. Do not count an unexecuted check as passed.

## 5.2 Create a unified diagnostics register

Record each error, warning and significant diagnostic with:

- Unique diagnostic ID.
- Tool or source.
- Original severity.
- Exact file, line, component or module.
- Whether it existed at baseline or was introduced later.
- Actual diagnostic message.
- Verified root cause or investigation status.
- Impact on correctness, security, performance, maintainability or UX.
- Required correction.
- Verification method.
- Final disposition.

Maintain distinct counts for:

- Baseline errors.
- Baseline actionable warnings.
- Newly discovered findings.
- New regressions.
- Fixed findings.
- Independently verified fixes.
- Approved exceptions.
- Unresolved findings.
- Blocked checks.

## 5.3 Investigate warnings instead of dismissing them

Pay particular attention to:

- Unused imports and variables that indicate incomplete work.
- Unsafe casts, implicit types and type-checking gaps.
- Deprecated APIs and obsolete dependencies.
- React hook misuse, key warnings and state errors.
- Unhandled promises and missing cleanup.
- Unreachable code and incorrect conditions.
- API contract mismatches.
- Missing error handling.
- Database and migration warnings.
- Accessibility violations.
- Performance and rendering warnings.
- Flaky tests, skipped assertions and incomplete fixtures.
- Browser console errors and warnings.
- Build-tool diagnostics and dependency vulnerabilities.

Classify each warning as an actual defect, maintainability risk, harmless diagnostic, false positive or externally blocked issue.

Fix actionable warnings. Do not globally disable rules, weaken checks, suppress diagnostics or introduce broad exclusions simply to produce a clean report.

Use narrow, documented exceptions only when genuinely justified and independently approved by the lead.

## 5.4 Fix the root cause across the codebase

When an error or warning is discovered:

1. Reproduce or otherwise verify it.
2. Identify the root cause.
3. Search for the same pattern in other modules.
4. Map affected workflows and dependencies.
5. Evaluate security and regression implications.
6. Implement the authorised correction.
7. Add or improve regression tests.
8. Rerun the relevant diagnostics.
9. Rerun the affected end-to-end workflows.
10. Obtain independent lead verification.
11. Update the register.

Do not stop after fixing one instance if the same underlying defect remains elsewhere.

---

# 6. MANDATORY 99–100% CODE-QUALITY STANDARD

The code-quality objective is 99–100%, supported by transparent measurements, comprehensive scope and reproducible results.

Do not invent an aggregate score or use a high average to conceal a critical failure.

## 6.1 Required quality gates

| Quality dimension | Acceptance standard |
|---|---|
| Mandatory builds | 100% pass |
| Compiler and type errors | Zero unresolved |
| New actionable warnings | Zero unresolved |
| Pre-existing actionable errors | Zero unresolved within the approved release scope |
| Pre-existing actionable warnings | Zero unresolved within the approved release scope |
| Critical workflow acceptance tests | 100% pass |
| Introduced regressions | Zero unresolved |
| Critical/high security release blockers | Zero unresolved |
| Required lint rules | 100% pass within the declared scope |
| Required type checks | 100% pass within the declared scope |
| Frozen-module inventory | 100% of discovered modules classified |
| Critical pipeline verification | All identified critical paths verified or explicitly blocked |
| Required responsive checks | All mandatory viewports tested for critical pages |
| Finding traceability | Every finding has a documented disposition |
| Test integrity | No concealed failures or weakened assertions |
| Production release gates | All mandatory gates satisfied before certification |

The zero-unresolved requirement applies to actionable issues within the approved scope. Any proposed exception must be explicitly documented, justified and approved; it must not be reported as a fixed issue.

A genuine external dependency issue may remain outside the developer's control, but the affected release gate must remain open until sufficient evidence is obtained or an authorised decision is made.

## 6.2 Test coverage requirements

Measure actual line and branch coverage where supported.

Use at least these working targets where technically appropriate:

- 90% line coverage for relevant business logic.
- 85% branch coverage for relevant business logic.
- 100% passing acceptance tests for critical workflows.
- Explicit tests for security-sensitive branches, permission boundaries, tenant isolation, quota enforcement, critical state transitions and important failure paths.

If the actual architecture makes a target inapplicable, justify the deviation and propose an equivalent verification method.

Do not increase coverage by adding meaningless tests. Test behaviour and outcomes, not merely execution of lines.

## 6.3 Quality-score calculation

Publish the exact measurement method, tools, scan scope and denominator for every percentage.

Do not average away failures in security, data integrity or critical workflows.

A 99–100% score is not acceptable if the repository was only partially scanned, warnings were suppressed, critical tests were skipped or frozen modules were excluded.

The score must reflect the actual codebase and verified outcomes, not developer confidence.

---

# 7. COMPLETE FUNCTIONAL GAP AND DEFECT AUDIT

Inspect every discovered page, module, API and workflow.

Identify:

- Incorrect business logic.
- Runtime exceptions.
- Missing validations.
- Invalid state transitions.
- Incomplete create, read, update, delete or recovery operations where applicable.
- Missing search, filtering, sorting and pagination where needed.
- Missing actions, settings and user preferences.
- Broken navigation and inaccessible routes.
- Incorrect permissions and role-specific behaviour.
- Missing loading, empty, success and failure states.
- Duplicate submissions and race conditions.
- Inconsistent database updates.
- Broken integrations and asynchronous processing.
- Missing audit trails or operational controls where required.
- Incomplete onboarding and account recovery.
- Disconnected dashboards and stale data.
- Unhandled edge cases and partial failures.
- Inadequate cancellation, retry and recovery mechanisms.
- Inconsistent behaviour between active and frozen modules.

Do not add arbitrary functionality without evidence of a legitimate user or operational need.

For each finding, record:

1. Finding ID.
2. Source-code location.
3. Expected behaviour established from implementation or an approved requirement.
4. Actual behaviour.
5. Reproduction or inspection evidence.
6. Root cause.
7. User/business impact.
8. Severity and confidence.
9. Affected workflows and dependencies.
10. Recommended correction.
11. Acceptance criteria.
12. Required regression tests.
13. Verification results.

Classify findings as confirmed, probable, unverified, blocked or not applicable.

---

# 8. COMPLETE END-TO-END PIPELINE VERIFICATION

Do not evaluate the application as disconnected screens or isolated API endpoints.

Discover actual workflows directly from the codebase, including relevant registration, authentication, onboarding, profile, resume, ATS, job tracking, AI, interview, billing, notification, administrative and integration workflows.

The examples above are discovery prompts, not assumptions that every capability exists.

For each workflow, trace:

**User action → UI state → API request → middleware → validation → business logic → database → external service or background job → persistence → final UI state → downstream effects.**

Verify:

- Entry points and required permissions.
- Input and schema validation.
- Business rules and state transitions.
- Database reads, writes and transaction behaviour.
- Provider requests, timeouts and error handling.
- Retries and idempotency.
- Duplicate actions and concurrent requests.
- Partial failures and recovery.
- Final dashboard and UI synchronisation.
- Notifications and downstream updates.
- Cancellation and session-expiry behaviour.
- Compatibility with connected frozen modules.

Test the happy path, invalid inputs, empty data, boundary conditions, permission failures, expired sessions, provider outages, interrupted requests, duplicate submissions and recovery paths as applicable.

A successful HTTP response is not proof that the overall workflow succeeded.

For every pipeline, record its expected result, actual result, dependencies, test cases, evidence, defects and verification status.

---

# 9. PREMIUM UI/UX AND INFORMATION-ARCHITECTURE AUDIT

UI/UX is a high-priority engineering requirement.

Inspect every discovered page, dashboard, modal, drawer, menu, form, table, chart, wizard and responsive variant.

## 9.1 Individual page scoring

Score each page from 0–10 for:

- Visual hierarchy.
- Information architecture.
- Navigation and discoverability.
- Task completion efficiency.
- Visual consistency.
- Functional completeness.
- Form usability.
- Error prevention and recovery.
- Accessibility.
- Responsiveness.
- Integration with other workflows.
- Performance and perceived responsiveness.

Provide evidence and justification for every score.

Do not award a high score merely because the interface looks attractive.

A visually polished screen with broken actions, incorrect data or incomplete workflows must receive appropriately low functional and overall ratings.

## 9.2 Identify high-value improvements

Investigate:

- Excessive clicks and navigation depth.
- Poorly prioritised dashboard information.
- Hidden or missing actions.
- Confusing terminology.
- Duplicate screens and redundant interactions.
- Poor form validation.
- Inadequate contextual guidance.
- Inconsistent component behaviour.
- Excessive visual density.
- Poor typography and spacing.
- Inaccessible controls.
- Missing empty, loading and failure states.
- Weak feedback during long-running operations.
- Poorly connected candidate, recruiter and administrative journeys.
- UI inconsistencies caused by frozen or legacy modules.

For each issue, explain the observed problem, user impact, proposed change and measurable acceptance criteria.

## 9.3 Restructuring decisions

Classify each page as:

- Retain.
- Improve incrementally.
- Redesign substantially.
- Consolidate with another page.
- Split into clearer responsibilities.
- Rebuild because the current structure prevents reliable behaviour.

When restructuring is necessary, provide a proposed information architecture, navigation model, layout or wireframe, component strategy and regression plan.

Do not preserve poor UX merely to avoid changing the existing structure.

---

# 10. RESPONSIVE DESIGN AND BROWSER EVIDENCE

Test real browser behaviour at these minimum viewport sizes.

| Device | Viewport |
|---|---|
| Large desktop | 1920 × 1080 |
| Desktop | 1440 × 900 |
| Laptop | 1366 × 768 |
| Tablet portrait | 768 × 1024 |
| Mobile portrait | 390 × 844 |
| Narrow mobile | 320 × 700 |

Inspect every critical page and representative secondary pages at the required sizes.

Test:

- Horizontal and unintended nested overflow.
- Clipped, overlapping or hidden elements.
- Navigation and mobile menus.
- Tables, charts and dashboard cards.
- Forms, dropdowns, popovers and dialogs.
- Typography, content wrapping and truncation.
- Touch-target sizes and spacing.
- Keyboard access and visible focus.
- Sticky headers and fixed elements.
- Long content and empty states.
- Loading behaviour and layout shifts.
- Browser console errors and failed network requests.

Generate fresh screenshots and associate every defect with a page, viewport, test case and finding ID.

Capture before-and-after evidence for important fixes.

If a required viewport or interaction cannot be tested, document the exact limitation and leave that verification status open.

Do not claim that the application is fully responsive based on CSS inspection or a handful of desktop screenshots.

---

# 11. ACCESSIBILITY, SECURITY, PERFORMANCE AND RELIABILITY

## 11.1 Accessibility

Evaluate applicable WCAG 2.2 AA criteria, including semantic structure, keyboard operation, focus order, labels, contrast, screen-reader compatibility, error announcements, dialog focus management and responsive reflow.

Record actual violations and unverified criteria separately.

## 11.2 Security

Inspect authentication, authorisation, object-level access controls, tenant isolation, input validation, injection risks, CSRF, XSS, SSRF where relevant, rate limiting, secrets handling, file access, webhook verification, replay protection, dependency vulnerabilities and sensitive logging.

Prioritise confirmed vulnerabilities and potential data exposure.

Perform testing only within authorised environments. Do not expose credentials or perform destructive operations against production.

## 11.3 Performance

Measure and investigate:

- Initial page load.
- Route transitions.
- Frontend bundle size.
- Rendering bottlenecks.
- API latency.
- Database queries and indexing.
- Repeated requests and unnecessary rendering.
- Large datasets and pagination.
- Image and asset optimisation.
- Long-running AI and background operations.
- Resource cleanup and memory usage.
- Core Web Vitals where applicable.

Establish the baseline before proposing budgets or claiming improvements.

## 11.4 Reliability and operations

Inspect:

- Structured logging and correlation IDs.
- Metrics, tracing and alerting.
- Health checks.
- Timeouts, retries and graceful degradation.
- Idempotency and duplicate event handling.
- Queue recovery where applicable.
- Database migrations and rollback.
- Backup and restoration.
- Deployment safety.
- Operational runbooks and incident diagnostics.

Document required remediation and release implications.

---

# 12. EVIDENCE-BACKED SWOT ANALYSIS

Produce a genuine SWOT analysis based on current source code and fresh verification.

**Strengths:** Verified architectural and functional capabilities.

**Weaknesses:** Confirmed defects, missing functionality, poor UX, technical debt and fragile integrations.

**Opportunities:** Better workflows, accessibility, performance, maintainability, design-system consistency and automation.

**Threats:** Security vulnerabilities, data-integrity failures, external dependencies, reliability issues and operational risks.

For each significant statement, provide:

- Finding ID.
- Evidence.
- Affected module.
- User/business impact.
- Severity and likelihood where relevant.
- Recommended action.
- Expected outcome.

Maintain this chain:

**Code → Finding → Evidence → Root cause → Impact → SWOT → Remediation → Acceptance criteria → Verification.**

Do not copy SWOT statements from previous reports or use generic statements that could describe any application.

---

# 13. ARCHITECTURAL RESTRUCTURING AND TRADE-OFF ANALYSIS

Determine whether the current architecture can meet the quality target.

Evaluate potential improvements to:

- Frontend routing and page composition.
- Dashboard and navigation structure.
- Shared components and design tokens.
- State management and API integration.
- Backend service boundaries.
- Database schema and ownership.
- Integration adapters and asynchronous processing.
- Authentication and tenant isolation.
- Frozen-module compatibility.
- Testing, observability and deployment.

Compare targeted repairs, incremental refactoring and larger restructuring wherever relevant.

For each major recommendation, document:

- Existing problem and root cause.
- Proposed target state.
- Alternative approaches.
- Expected UX and reliability improvement.
- Implementation effort and confidence.
- Dependencies and migration requirements.
- Regression and rollback risks.
- Acceptance criteria.

Choose the smallest safe change that fixes the root cause. Recommend larger restructuring when incremental repairs cannot reasonably meet the quality requirements.

Do not rewrite working functionality without sufficient evidence and approval.

---

# 14. REQUIRED EXECUTIVE AUDIT DOCUMENT

Produce a professional, management-ready report derived from the current codebase and newly generated evidence.

Preferred output: Markdown, plus DOCX or PDF if supported by the available environment.

The report must contain the following sections.

### A. Executive summary
- Current system condition.
- Overall code-quality assessment.
- Critical findings.
- UI/UX and responsive status.
- Workflow and pipeline reliability.
- Major risks and release blockers.
- Decisions required from leadership.

### B. Audit methodology
- Repository revision.
- Source-code scope.
- Commands and tools executed.
- Test and browser coverage.
- Explicit exclusions and blockers.

### C. Architecture and module inventory
- Actual architecture.
- Module dependencies.
- Routes, APIs and database structures.
- Current integration boundaries.

### D. Frozen-module report
- Complete inventory.
- Classification and dependencies.
- Existing errors and warnings.
- Compatibility concerns.
- Remediation recommendations.

### E. Full defect register
- Finding IDs.
- Source locations.
- Reproduction evidence.
- Root causes.
- Severity and confidence.
- Required fixes and acceptance criteria.

### F. Pre-existing diagnostic register
- Baseline errors and warnings.
- Newly discovered diagnostics.
- Root-cause analysis.
- Fixes and verification.
- Remaining exceptions and blockers.

### G. Page-by-page UI/UX report
- Individual scores.
- Current-state screenshots.
- Annotated issues.
- Proposed redesigns.
- Measurable improvements.

### H. Responsive verification report
- Required viewport matrix.
- Screenshots and failures.
- Fix recommendations.
- Outstanding tests.

### I. Workflow and pipeline report
- Workflow diagrams.
- Dependencies.
- Expected versus actual results.
- Regression and recovery tests.

### J. Security, accessibility, performance and reliability report
- Confirmed findings.
- Measured baselines.
- Remediation requirements.
- Release implications.

### K. Evidence-backed SWOT
- Strengths, weaknesses, opportunities and threats.
- Finding references.
- Required actions.

### L. Architecture recommendation
- Current-state assessment.
- Alternative approaches.
- Proposed target architecture.
- Compatibility and migration risks.

### M. Remediation roadmap
- Workstreams.
- Priorities.
- Dependencies.
- Owners.
- Effort estimates.
- Acceptance criteria.
- Required verification.

### N. Production-readiness scorecard
- Individual quality dimensions.
- Actual metrics and scope.
- Mandatory gates.
- Remaining blockers.

### O. Leadership decision register
- Approvals required.
- Resources and access needed.
- Architectural decisions.
- Accepted risks and outstanding trade-offs.

### P. Residual risks and evidence index
- Unresolved findings.
- Unverified functionality.
- External blockers.
- Diagnostic outputs.
- Screenshot references.
- Test execution records.

The document must be versioned and dated and must identify the repository revision actually inspected.

---

# 15. PRIORITISED REMEDIATION ROADMAP

Build a dependency-aware plan from actual findings.

Use the following severity model:

- **P0 — Critical:** Severe security, data-integrity or essential operational failure.
- **P1 — High:** Major workflow failure, serious permission issue or material customer-journey defect.
- **P2 — Medium:** Important functional, UX, performance or maintainability issue.
- **P3 — Low:** Lower-risk enhancement, minor defect or polish.

For every remediation item, specify:

- Task ID and finding IDs.
- Affected files and workflows.
- Priority and justification.
- Responsible role.
- Estimated effort range and confidence.
- Dependencies and sequencing.
- Proposed implementation.
- Acceptance criteria.
- Regression tests.
- Browser and responsive checks.
- Rollback considerations.
- Completion evidence.

Use this default sequence, adjusting it to the evidence:

**Phase A:** Critical security, data-integrity and release blockers.

**Phase B:** Pre-existing errors and warnings, critical workflow failures and integration defects.

**Phase C:** UI/UX restructuring, responsive issues and accessibility blockers.

**Phase D:** Missing functionality, incomplete states and secondary workflow defects.

**Phase E:** Performance, maintainability, observability and operational recovery.

**Phase F:** Complete regression, independent verification and production-readiness certification.

Do not promise unrealistic deadlines before assessing the repository, dependencies and actual remediation effort.

---

# 16. AUTONOMOUS INVESTIGATION AND REMEDIATION

Operate independently within the authorised scope.

Do not wait for the user to identify every problem. Investigate related modules whenever evidence suggests systemic defects.

For each discovered issue:

1. Reproduce or verify the defect.
2. Identify its root cause.
3. Search for similar patterns elsewhere.
4. Identify connected modules and pipelines.
5. Assess regression and security risks.
6. Recommend the correct level of repair.
7. Implement the change when authorised.
8. Add or improve regression tests.
9. Run relevant diagnostics.
10. Verify the complete affected workflow.
11. Obtain independent lead review.
12. Update the findings register.

After each meaningful completion, challenge the result:

**“Can this be made better, safer, simpler, more accessible, more maintainable and more reliable without disproportionate risk?”**

Do not stop at a superficial fix when the evidence indicates a systemic issue.

The directive authorises comprehensive investigation and planning. Major, destructive or compatibility-sensitive restructuring must follow the required approval process.

---

# 17. STRICT LEAD AND DEVELOPER ACCOUNTABILITY

## Developer responsibilities

The developer must:

- Investigate the actual source code independently.
- Identify and disposition pre-existing and newly discovered errors and warnings.
- Inspect frozen modules and connected workflows.
- Fix root causes rather than symptoms.
- Supply reproducible evidence.
- Preserve existing valid functionality.
- Add meaningful regression tests.
- Verify responsive behaviour.
- Avoid hidden exclusions and weakened quality gates.
- Disclose blocked verification.
- Never report untested work as verified.

## Technical-lead responsibilities

The lead must independently:

- Review the baseline and final diagnostic inventories.
- Verify audit coverage.
- Challenge false-positive classifications and warning suppressions.
- Inspect high-risk fixes.
- Verify critical workflows.
- Review frozen-module compatibility.
- Validate the code-quality score and its formula.
- Check that tests and thresholds have not been weakened.
- Reject incomplete UI/UX or responsive evidence.
- Reject unsupported production-readiness claims.

For every rejected implementation, document the deficiency, required correction and retest criteria.

The lead must not approve work merely because the developer reports it complete.

Required engineering cycle:

**DISCOVER → BASELINE → INSPECT → REPRODUCE → PLAN → IMPLEMENT WHEN AUTHORISED → TEST → INDEPENDENT REVIEW → RETEST → DOCUMENT.**

---

# 18. FINAL PRODUCTION-READINESS ACCEPTANCE GATES

Production certification requires evidence that:

1. The agreed source-code scope has been inventoried.
2. All discovered frozen modules have been classified and assessed.
3. All pre-existing and newly discovered actionable errors and warnings have a verified resolution or an explicitly approved disposition.
4. No unresolved critical workflow failure remains.
5. Required builds, type checks and linting pass.
6. Regression tests pass without weakened assertions.
7. Security and data-integrity release blockers are resolved.
8. Critical workflows are verified end to end.
9. Required responsive and accessibility checks are completed.
10. Performance results meet approved budgets.
11. Integrations are verified or their release gates remain explicitly open.
12. Deployment, monitoring, backup and rollback requirements are satisfied.
13. Every material finding has a documented disposition.
14. The technical lead has independently verified the evidence.

The application must remain **NOT CERTIFIED FOR PRODUCTION** while mandatory gates are unresolved or unverified.

An approved exception is not the same as a fixed defect. An unavailable external service is not a successful integration test. A high overall score cannot offset a critical security failure.

The 99–100% target must reflect actual measurements and scope, not subjective confidence.

---

# 19. FINAL REQUIRED DELIVERABLES

Submit all of the following:

1. Executive Audit Report.
2. Complete Source-Code and Module Inventory.
3. Frozen-Module Investigation Report.
4. Pre-existing and Newly Discovered Error/Warning Register.
5. Complete Defect and Functional-Gap Register.
6. Page-by-Page UI/UX Assessment.
7. Responsive Screenshots and Verification Matrix.
8. End-to-End Workflow and Pipeline Matrix.
9. Evidence-Backed SWOT Analysis.
10. Architecture and Restructuring Recommendation.
11. Prioritised Remediation Roadmap.
12. Before-and-After Diagnostic Comparison.
13. Production-Readiness Scorecard.
14. Leadership Decision Register.
15. Residual Risk and Unverified-Behaviour Register.
16. Independent Technical-Lead Review and Sign-off.

Every report must clearly distinguish inspected, tested, passed, failed, untested and blocked areas.

---

# FINAL COMMAND — EXECUTE WITH ZERO-GAP DISCIPLINE

Begin with the current pure codebase. Do not rely on previous reports, documentation claims or historical evidence. Establish a fresh baseline. Inspect every in-scope module, including frozen and legacy modules. Inventory all pre-existing errors and warnings. Identify missing functionality, root causes, integration defects, responsive problems and architectural weaknesses.

Create the executive report and remediation roadmap using newly collected evidence. Fix all authorised actionable defects, including legacy issues. Eliminate unnecessary warnings without weakening engineering standards. Test complete workflows, verify responsive behaviour and obtain independent lead approval.

**The mandatory quality ambition is 99–100% measurable code quality, zero unresolved actionable errors or warnings within the approved release scope, zero unresolved critical workflow failures, complete assessment of in-scope modules, and independently verified production-readiness gates.**

Do not achieve a high score by manipulating metrics. Achieve it through real fixes, comprehensive verification, preserved functionality and transparent reporting.

Do not certify perfection based on assumptions. Do not hide incomplete work. Do not accept weak implementations. Do not stop at the first successful build.

**The final outcome must give leadership an accurate, evidence-backed understanding of the entire codebase and a practical, independently verifiable path to a secure, reliable, highly responsive, exceptionally usable and production-ready system.**
