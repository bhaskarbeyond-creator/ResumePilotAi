# ANTIGRAVITY EXECUTIVE DIRECTIVE ARCHITECTURE STANDARD
## Authoritative 14-Section Engineering Governance, Execution & Verification Framework

**Standard ID:** AEDS-001  
**Classification:** Mandatory Engineering Governance Standard  
**Applies To:** Every engineering directive created, refined, delegated, or executed by Antigravity  
**Execution Environments:** Plan Mode, Act Mode, and explicitly authorised validation environments  
**Quality Objective:** Production-grade, evidence-backed, risk-controlled engineering  
**Compliance:** Mandatory, subject only to documented applicability exceptions  
**Governing Principle:** No unsupported assumptions, no unauthorised modifications, no fabricated evidence, no silent failures, and no false completion claims.

---

# SECTION 1 — EXECUTIVE MANDATE

Every directive must begin with a precise, repository-specific executive mandate defining the business objective, technical scope, desired outcome, constraints, and measurable definition of success.

### 1.1 Required directive metadata

Every directive must identify:

- Directive ID and descriptive title.
- Target project and verified workspace path.
- Priority and business/technical impact.
- Execution mode and current authorisation.
- Scope, exclusions, and dependencies.
- Expected deliverables.
- Acceptance criteria and completion conditions.
- Relevant preceding directives, decisions, and unresolved dependencies.

### 1.2 Mandatory engineering objective

The directive must identify the actual problem to solve, investigate its root causes, and define the intended outcome.

For comprehensive audits and enhancement directives, investigate the complete affected system rather than limiting the scope to the immediately visible symptom.

For narrowly scoped directives, investigate the full dependency and regression surface of the affected capability without unnecessarily expanding the task into an unrelated platform rewrite.

### 1.3 Outcome requirements

Every directive must define:

1. What must be investigated or implemented.
2. Why it matters to users, system integrity, or business operations.
3. Which components, interfaces, services, and data flows are affected.
4. What must remain unchanged.
5. How the outcome will be measured.
6. What evidence proves completion.
7. Which conditions prevent completion or release.

**Mandatory outcome:** A concrete, measurable result—not a vague instruction to improve quality, optimise the platform, or make the system production-ready.

---

# SECTION 2 — ABSOLUTE MODE RESTRICTIONS: PLAN MODE VS ACT MODE

Every directive must declare an explicit authorisation boundary.

## 2.1 PLAN MODE — Investigation and planning only

Unless a separate capability explicitly requires otherwise, Plan Mode authorises read-only investigation and planning.

**Permitted, subject to tool capabilities:**

- Inspect repository structure, source code, configuration, documentation, and tests.
- Read Git metadata, current branch, commit history, and existing diffs.
- Trace application routes, component dependencies, API contracts, and data flows.
- Inspect existing test infrastructure and previously generated evidence.
- Identify defects and prepare an implementation plan.
- Execute a specifically required plan-submission command when authorised by the directive.
- Run other checks only when their non-mutating behaviour has been established.

**Prohibited:**

- Unauthorised source-code, configuration, test, documentation, or asset changes.
- Package installation, dependency upgrades, or lockfile changes.
- Database writes, migrations, seeders, or destructive operations.
- Git resets, cleanups, stashing, branch switching, commits, pushes, or history modification.
- Deployment, release, production-data mutation, or external side effects.
- Generated build artefacts or test outputs when they would violate the read-only boundary.
- Automatic implementation, repair loops, or autonomous execution beyond the approved scope.

An apparently harmless command is not automatically read-only. Assess its effects before running it.

## 2.2 ACT MODE — Explicitly authorised implementation

Act Mode authorises only the changes explicitly included in the directive and permitted by the governing project constraints.

Before implementation:

- Verify the target repository and baseline.
- Confirm the approved scope.
- Identify protected paths and files.
- Map affected dependencies and likely regression risks.
- Establish the required verification strategy.

During implementation:

- Preserve unrelated user work.
- Make the smallest coherent changes that satisfy the requirements.
- Reuse established architecture and shared components where appropriate.
- Avoid unrelated refactoring, speculative features, and unnecessary dependency changes.
- Never weaken security, validation, accessibility, or tests merely to obtain a passing build.

After implementation:

- Inspect the complete diff.
- Execute authorised validation.
- Record actual results and failures.
- Verify protected invariants.
- Report unresolved defects and release blockers.

## 2.3 Authorisation escalation

If a task requires an action outside the authorised scope, stop that action and request explicit authorisation.

Never infer permission to perform destructive operations from a general instruction to fix, optimise, or complete the project.

**Non-negotiable rule:** The directive's declared mode overrides any broader autonomy expectation.

---

# SECTION 3 — PRE-FLIGHT REPOSITORY AND WORKSPACE VERIFICATION

Every directive must establish its actual operating context before relying on repository-specific assumptions.

### 3.1 Workspace identity

Verify:

- Actual resolved workspace path.
- Repository root and project identity.
- Active Git branch.
- Full HEAD commit SHA.
- Upstream tracking configuration, where available.
- Working-tree status.
- Staged, unstaged, and untracked changes.
- Relevant ignored files and generated artefacts when material to the task.

For the IME365 project, the expected workspace is:

`D:\xampp\htdocs\IME365`

Do not assume that the expected path is the actual path.

If the workspace is incorrect or ambiguous, stop before modifying anything.

### 3.2 Baseline preservation

Capture the initial state before any authorised modification.

Distinguish between:

- Pre-existing user changes.
- Changes introduced by the current directive.
- Generated files and expected build artefacts.
- Protected files and directories.
- Unrelated repository changes.

A dirty working tree is not permission to clean it.

Never reset, overwrite, discard, or reformat pre-existing work simply to produce a clean final diff.

### 3.3 Toolchain discovery

Inspect the actual project configuration and identify:

- Programming languages and frameworks.
- Package manager and runtime versions.
- Build, lint, formatting, type-checking, and test scripts.
- Frontend and backend entry points.
- Routing and state-management architecture.
- Database and API integration.
- Browser automation and accessibility tools.
- Relevant CI/CD workflows and environment dependencies.

Use actual project scripts rather than inventing commands.

### 3.4 Pre-flight failure conditions

Record a blocker if the repository, required tools, reference assets, or dependencies cannot be verified.

Do not claim that a repository is clean, a tool is installed, or a test environment is operational without evidence.

---

# SECTION 4 — NON-NEGOTIABLE PROJECT INVARIANTS

Every directive must establish an explicit invariant register.

Each invariant must include its scope, rationale, enforcement mechanism, verification method, and failure response.

## 4.1 Protected files and directories

Identify every immutable or restricted path.

**IME365 example:**

`src/cv-templates/`

The directory must remain untouched.

For a directive requiring zero changes, verify the relevant unstaged and staged Git diffs against the baseline. An empty diff alone is insufficient if pre-existing changes could be overwritten or if other prohibited filesystem changes are possible.

Do not modify, regenerate, move, rename, reformat, or delete protected assets.

If a requirement appears to necessitate a protected-file change, investigate safe alternatives through permitted surrounding components, adapters, or interfaces.

If no safe alternative exists, document the conflict and request a decision.

## 4.2 Production data integrity

Zero fabricated production data.

Every production-facing value must originate from an authoritative source:

- Persisted application state.
- Validated API or service responses.
- Approved deterministic calculation engines.
- Legitimately derived values from verified source data.

**IME365 examples:** candidate names, resume fields, ATS scores, application counts, match percentages, tracker stages, AI insights, and calculated completion states.

Use `calculateAtsScore` when appropriate to the existing architecture and scoring contract. Do not invent formulas or substitute static example values.

When data is absent or unavailable, present truthful empty, pending, unavailable, or error states.

Explicitly designated test fixtures and isolated demonstrations may contain synthetic data only when they cannot silently enter production behaviour.

## 4.3 Design-system and architectural compliance

Identify the target project's actual design system, tokens, shared components, architecture, and established conventions.

For IME365, this includes Cuba Design System compliance and the project's existing token definitions, such as `--cuba-bg-glass` and `--cuba-border-glass`, where present and appropriate.

Do not invent token names or assume their implementation without inspecting the repository.

Prohibit arbitrary uncurated colours, unnecessary legacy overrides, parallel component systems, and conflicting visual conventions.

For non-UI directives, apply the equivalent rule to established architecture, interfaces, schemas, and engineering standards.

## 4.4 Existing functionality and compatibility

Preserve all legitimate existing capabilities unless an explicit, approved requirement authorises their removal or replacement.

Account for:

- Routes and deep links.
- Authentication and authorisation.
- API and database contracts.
- Validation and error handling.
- Autosave, recovery, and unsaved changes.
- Keyboard and pointer interactions.
- Existing user journeys.
- Backward compatibility.
- Shared component consumers.
- Existing integrations and configuration.

Any intentional behaviour change must be documented with its rationale, impact, and acceptance criteria.

## 4.5 Layout, performance, and resource constraints

Identify project-specific operational constraints.

For bounded IME365 dashboards, preserve the intended single-viewport experience without unnecessary whole-window scrolling.

For other projects, establish the equivalent constraints for performance, memory, responsiveness, concurrency, resource usage, or interface stability.

Do not impose a universal rule where the underlying architecture or user experience requires a different behaviour.

## 4.6 Security and privacy

Where relevant, protect:

- Authentication and authorisation boundaries.
- Tenant and user-data isolation.
- Input validation and output encoding.
- Secrets and environment configuration.
- Sensitive information in logs and diagnostics.
- Dependency and API security.
- File uploads, downloads, and access controls.
- Destructive operations and auditability.

Never introduce a security regression to simplify implementation or testing.

## 4.7 Invariant enforcement

Before implementation, establish the baseline and verification method for each critical invariant.

After implementation, verify the final state against that baseline.

Any invariant violation is a release blocker until resolved or explicitly adjudicated by an authorised owner.

---

# SECTION 5 — AUTHORITATIVE REFERENCES AND PARITY REQUIREMENTS

Every directive must identify the authoritative sources that define the expected outcome.

These may include:

- Approved screenshots and design specifications.
- Existing production behaviour.
- API schemas and domain rules.
- Product requirements and acceptance criteria.
- Architectural decisions.
- User-approved examples.
- Existing tests and contractual interfaces.
- Approved documents and assets.

### 5.1 Reference precedence

When references conflict, apply this precedence:

1. Security, privacy, legal, and system-integrity requirements.
2. Explicitly protected invariants and authorised scope.
3. Approved domain and data contracts.
4. Explicitly approved functional requirements.
5. Authoritative visual and behavioural references.
6. Established project conventions.
7. Reasonable implementation defaults.

If two authoritative requirements conflict, document the conflict and seek a decision where it materially affects the outcome. Do not silently choose whichever is easier to implement.

### 5.2 Reference inspection

For each reference:

- Confirm its actual existence and accessibility.
- Identify its source and authority.
- Inspect relevant details.
- Map requirements to affected components or subsystems.
- Record missing, ambiguous, or contradictory information.

Never claim pixel-level or behavioural parity based only on a filename or a description of an unavailable asset.

### 5.3 Parity requirements

Define measurable acceptance criteria for:

- Structure and layout.
- Behaviour and interactions.
- Content and data semantics.
- Responsive behaviour.
- Accessibility.
- Error and recovery states.
- Integration and persistence.

Visual parity must never justify fabricated data, broken functionality, inaccessible controls, or violations of protected invariants.

---

# SECTION 6 — MANDATORY INVESTIGATION AND COVERAGE

Every directive must define an investigation boundary and demonstrate coverage proportional to the task's risk.

## 6.1 Routes, modules, and feature inventory

For UI projects, inspect all relevant routes, nested routes, route parameters, navigation destinations, and access guards.

For non-UI projects, inspect the equivalent modules, services, jobs, APIs, workers, data pipelines, or system entry points.

Classify discovered items as:

- In scope.
- Dependency.
- Out of scope.
- Blocked.
- Not applicable.

Justify material exclusions.

## 6.2 Shared components and dependencies

Inventory shared components, reusable modules, service abstractions, configuration, schemas, and dependency relationships.

Identify duplication, inconsistent implementations, unused code, and tightly coupled dependencies where supported by evidence.

Do not infer that a component is unused merely because a simple text search does not find its consumers.

## 6.3 Behaviour and interaction audit

Trace complete behaviour for relevant operations:

`Input → Handler → Validation → State transition → Service/API → Persistence or calculation → Result → User/system feedback`

Inspect failure paths as carefully as successful paths.

For UI projects, investigate buttons, links, menus, forms, dialogs, notifications, and other interactive controls.

For backend and infrastructure projects, apply the same completeness requirement to endpoints, jobs, workflows, permissions, retries, and external integrations.

## 6.4 End-to-end dependency tracing

Map the actual dependency chain from entry point to final outcome.

For IME365, a typical chain is:

`Route → Page → Component → State → API client → Endpoint → Domain logic → Persistence → Response → Rendered result`

Adapt the chain to the real architecture.

Identify missing integrations, inconsistent contracts, unreachable functionality, stale data, incomplete error handling, and unverified runtime dependencies.

## 6.5 Coverage accounting

Report:

- Total discovered in-scope items.
- Total actually inspected.
- Confirmed findings.
- Unverified findings.
- Blocked items.
- Excluded items and reasons.

Do not represent partial inspection as a complete audit.

---

# SECTION 7 — QUALITY, RESPONSIVENESS, ACCESSIBILITY, AND NON-FUNCTIONAL REQUIREMENTS

Apply the relevant quality requirements to the actual project scope.

## 7.1 Visual quality and interaction consistency

For interface work, inspect layout, spacing, typography, alignment, component consistency, responsive overflow, loading states, feedback, and micro-interactions.

For other engineering work, inspect the corresponding quality attributes, including maintainability, observability, API consistency, error recovery, and operational usability.

## 7.2 Responsive validation

Inspect the project's actual breakpoints and supported device range.

For IME365 UI work, include representative viewports such as:

- 320 px.
- 768 px.
- 1280 px.
- 1440 px.
- 1920 px.

These are validation points, not assumed framework breakpoints. Add intermediate widths and boundary tests where necessary.

Check overflow, clipping, layout shifts, navigation, scrolling, and touch interaction.

## 7.3 Accessibility

For web interfaces, target WCAG 2.1 AA unless a stronger requirement is explicitly specified.

Inspect:

- Semantic markup and heading structure.
- Accessible names and descriptions.
- Keyboard navigation and visible focus.
- Focus management and restoration.
- Contrast and status communication.
- Form labels and error associations.
- Screen-reader announcements.
- Reduced-motion preferences where applicable.
- Appropriate ARIA usage.

WCAG AAA requirements are additional targets when explicitly required or appropriate to the feature. Do not imply that all AAA criteria are mandatory merely because the directive mentions AA/AAA.

For non-UI projects, apply the relevant accessibility requirements where applicable.

## 7.4 Performance and reliability

Investigate performance requirements relevant to the task, including:

- Excessive rendering or unnecessary requests.
- Resource leaks and concurrency issues.
- Slow queries and inefficient data access.
- Timeouts, retries, and idempotency.
- Large payloads and unnecessary computation.
- Caching and invalidation.
- Resilience to partial failures.

Avoid speculative optimisation without a measurable problem or defensible engineering rationale.

---

# SECTION 8 — DATA INTEGRITY, STATE MANAGEMENT, AND EDGE CASES

Every directive must explicitly consider invalid, missing, delayed, duplicated, stale, conflicting, and unavailable information.

For UI and data-intensive projects, investigate:

- Real-data bindings and derived values.
- State synchronisation and stale state.
- Autosave timing and recovery.
- Validation and reset behaviour.
- Optimistic updates and rollback.
- Race conditions and duplicate requests.
- API failures and malformed responses.
- Permission changes and expired sessions.
- Pagination, sorting, and filtering consistency.
- Date, timezone, currency, and numeric formatting.
- Destructive actions and recovery expectations.

For non-UI work, apply equivalent integrity checks to transactions, message processing, background jobs, external services, and persistent state.

Every material data mutation must have clearly defined success and failure semantics.

**No silent data loss. No fabricated success. No misleading state.**

---

# SECTION 9 — TEST STRATEGY AND ACCEPTANCE REQUIREMENTS

Define the validation strategy before implementation and execute it only when authorised.

## Layer 1 — Static and repository validation

Where relevant, verify:

- Production build.
- Linting and formatting.
- Type checking.
- Static analysis.
- Dependency and configuration integrity.
- Protected-file invariants.
- Unintended changes and repository state.

For IME365, `npm run build` and the project's actual ESLint command must succeed, with zero ESLint errors.

Do not assume the lint script name or tool configuration without inspection.

## Layer 2 — Unit, component, and integration testing

Verify domain logic, validation, shared components, API contracts, state transitions, persistence behaviour, and failure recovery.

## Layer 3 — End-to-end and operational workflows

Exercise realistic user journeys or system workflows, including success, failure, cancellation, retries, permissions, and recovery.

## Layer 4 — Non-functional validation

Perform applicable accessibility, responsive, performance, reliability, security, and compatibility checks.

## Layer 5 — Regression and release evidence

Verify existing functionality, protected invariants, release criteria, and unresolved defects.

### 9.1 Evidence standard

For every executed validation command, record:

- Exact command or test identifier.
- Execution environment.
- Actual exit code or reported result.
- Relevant failure details.
- Evidence location, when available.
- Whether the result satisfies the acceptance criterion.

Distinguish between a test that was planned, attempted, executed, passed, failed, or blocked.

### 9.2 Test integrity

Never:

- Delete or weaken tests to obtain a passing result.
- Replace real integration checks with fabricated success.
- Claim browser coverage without running the relevant browser tests.
- Claim production readiness based solely on compilation.
- Ignore failures because they are inconvenient.
- Hide infrastructure limitations or flaky results.

A successful build does not establish functional completeness, accessibility, security, or production readiness.

---

# SECTION 10 — REQUIRED FORENSIC AND ENGINEERING DELIVERABLES

Every directive must identify the deliverables necessary to make the work auditable.

Select the relevant artefacts from the following standard catalogue:

1. **Repository Baseline Report** — verified environment, Git state, and protected invariants.
2. **Architecture and Dependency Inventory** — relevant modules, routes, components, services, and ownership.
3. **Requirements and Coverage Matrix** — requirements mapped to affected areas and verification criteria.
4. **Defect and Risk Register** — unique IDs, severity, evidence, impact, proposed correction, dependencies, and closure conditions.
5. **Data and Contract Traceability Matrix** — source-of-truth mapping, API contracts, domain rules, and persistence dependencies.
6. **Interaction and Workflow Matrix** — actions, expected outcomes, failure paths, and recovery behaviour.
7. **Accessibility and Non-Functional Audit** — relevant quality requirements and validation evidence.
8. **Reference-Parity Specification** — authoritative references, component mapping, and measurable parity criteria.
9. **Implementation and Regression Plan** — dependency-aware sequencing, risk controls, and acceptance tests.
10. **Final Verification and Closure Report** — changes, test results, unresolved issues, and release decision.

For narrowly scoped work, consolidate deliverables when appropriate. Do not generate unnecessary documentation merely to satisfy a checklist.

In Plan Mode, these are planned artefacts unless their creation is explicitly authorised. Do not modify files under a read-only mandate.

---

# SECTION 11 — SEVERITY, PRIORITISATION, AND IMPLEMENTATION SEQUENCING

## 11.1 Severity classification

- **P0 — Critical:** Security compromise, serious data corruption or loss, catastrophic integrity failure, or a critical production blocker.
- **P1 — High:** Major feature failure, broken essential workflow, serious accessibility barrier, or significant integration defect.
- **P2 — Medium:** Material usability, reliability, performance, or functional inconsistency with a viable workaround.
- **P3 — Low:** Minor polish, non-blocking inconsistency, or low-impact refinement.

Severity must reflect demonstrated or reasonably substantiated impact, not the urgency of the person issuing the directive.

The overall directive priority and individual finding severity are separate concepts.

## 11.2 Finding traceability

Every material finding must have:

- Unique finding ID.
- Evidence classification.
- Affected file, symbol, route, or subsystem.
- User or operational impact.
- Root cause, where established.
- Proposed resolution.
- Dependencies and regression risk.
- Acceptance criteria.
- Verification method.
- Owner or required decision, where applicable.

## 11.3 Implementation waves

Use the following eight-wave structure as the default for substantial work:

1. Baseline verification, scope confirmation, and invariant enforcement.
2. Critical correctness, security, data-integrity, and workflow failures.
3. Shared architecture, foundations, and design-system corrections.
4. Core feature and component implementation.
5. Reference parity and cross-feature integration.
6. Accessibility, responsiveness, and edge-case completion.
7. Regression testing and non-functional validation.
8. Release verification, evidence collection, and closure.

Reorder or combine waves when repository evidence supports a better dependency sequence.

For small tasks, use a proportionate execution plan while retaining the same governing standard.

## 11.4 Release gates

No directive may be marked complete while mandatory acceptance criteria remain unverified or critical defects remain unresolved.

Any exception requires explicit approval from the authorised decision-maker, a documented rationale, and a clear statement of residual risk.

---

# SECTION 12 — REQUIRED FINAL RESPONSE AND COMPLETION REPORT

Every directive must conclude with an evidence-based report appropriate to its execution mode.

### 12.1 Mandatory reporting fields

1. Workspace and repository verification.
2. Directive scope and coverage.
3. Findings and their evidence classifications.
4. Changes made, if authorised.
5. Acceptance criteria and verification results.
6. Protected-invariant status.
7. Failed, blocked, and untested requirements.
8. Remaining risks and external dependencies.
9. Deviations from the approved plan.
10. Release recommendation or next authorised action.
11. Required submission evidence, where applicable.

### 12.2 Evidence classifications

Use the following standard vocabulary consistently:

- **Verified:** Supported by directly observed evidence or an actually executed, permitted check.
- **Probable:** Strongly indicated by evidence but not fully confirmed.
- **Unverified:** Requires additional inspection or runtime validation.
- **Blocked:** Cannot be completed because a required dependency, permission, environment, or asset is unavailable.
- **Not applicable:** Outside the actual scope, with a recorded rationale where material.

### 12.3 Execution status classifications

Keep evidence classification separate from task status.

Use:

- Not started.
- Planned.
- In progress.
- Executed — passed.
- Executed — failed.
- Blocked.
- Deferred.
- Completed and verified.

### 12.4 Truthful completion

A task is complete only when its mandatory acceptance criteria are satisfied and the required evidence is available.

If a build or test could not run, report it as blocked or untested. If the build passes but the workflow remains untested, do not declare the workflow verified.

If the task cannot be completed safely, stop, preserve the existing state, and report the precise blocker.

---

# SECTION 13 — MANDATORY BRIDGE PLAN SUBMISSION AND TOOL EXECUTION GOVERNANCE

Every directive that explicitly requires Bridge plan submission must use the prescribed CLI syntax and verify the actual result.

### 13.1 Standard command

```powershell
bridge dev plan --directive DIR-XXX --projectDir "D:\path\to\project" --summary "<Evidence-based plan summary>" --steps "<Step 1>;<Step 2>;<Step 3>"
```

Replace the directive ID, project path, summary, and steps with the actual task values.

For IME365, use:

```powershell
bridge dev plan --directive DIR-093 --projectDir "D:\xampp\htdocs\IME365" --summary "<Actual investigation summary and authorised execution boundary>" --steps "<Evidence-based step 1>;<Evidence-based step 2>;<Evidence-based step 3>"
```

### 13.2 Submission requirements

- Verify that the CLI is available using an appropriate non-mutating check where possible.
- Inspect the actual CLI contract when arguments or behaviour are uncertain.
- Construct concise, accurate summaries and dependency-aware steps.
- Quote shell arguments correctly.
- Execute the prescribed submission only when authorised.
- Capture the actual result and exit status where available.
- Report any failure, permission issue, or unavailable dependency.
- Do not claim success merely because the command was invoked.

If Bridge is unavailable, report the exact blocker. Do not invent an undocumented command, silently substitute a different workflow, or misrepresent an unsuccessful submission.

### 13.3 Tool safety

For all tools and commands, determine whether they:

- Read state.
- Generate local artefacts.
- Modify repository files.
- Change external state.
- Require credentials or elevated permissions.
- Trigger network operations or production effects.

Select the least invasive method that satisfies the authorised objective.

**Mandatory rule:** No tool call overrides the directive's authorisation boundary.

---

# SECTION 14 — FINAL EXECUTIVE INSTRUCTION

Every Antigravity directive must follow this 14-section architecture and satisfy the applicable governance requirements.

The standard exists to make autonomous engineering reliable, predictable, auditable, and safe—not merely to make instructions longer.

All directives must:

- Investigate the actual target system.
- Preserve existing user work and protected invariants.
- Distinguish facts from assumptions.
- Trace dependencies before proposing changes.
- Define measurable acceptance criteria.
- Prioritise defects by evidence and impact.
- Implement only what has been authorised.
- Validate using real commands and real results.
- Record failures and limitations without concealment.
- Preserve legitimate existing functionality.
- Provide evidence for every material completion claim.
- Leave unresolved release risks explicit.
- Submit plans through required tooling when authorised.
- Never fabricate data, tests, execution results, or production readiness.

The 14 sections are mandatory. Their depth must scale to the scope and risk of the directive. Project-specific requirements must be derived from verified project context rather than copied blindly from unrelated directives.

## Final governing principle

**No assumption presented as fact. No action beyond authorisation. No protected invariant violated. No material requirement silently omitted. No test claimed without evidence. No task declared complete without satisfying its acceptance criteria.**

This standard governs how every directive is structured, investigated, executed, verified, and reported.

**End of authoritative standard.**
