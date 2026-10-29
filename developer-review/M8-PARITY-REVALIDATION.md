# M8 §5 — Independent Parity Revalidation (all 112 capability rows)

**Mandate:** 8, §5 — priority P0. Independently review all 112 rows, flag the failure modes the
mandate names (component-vs-workflow, route-vs-authorized-op, mock-vs-real, catalog-vs-design,
UI-vs-persisted-state, HTTP-200-vs-correct, static-vs-runtime), regenerate totals, document every
change.
**Revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`
**Tool:** `tools/m8-parity-revalidation.cjs` → `Evidence/artifacts/m8-parity-revalidation.json`
**Method class:** static derivation, then human read of every row the derivation contradicted.

---

## 1. Method — derive first, classify second

The published classifications were produced by file-heat scoring plus hand reads. Re-running the
same scoring would only restate them, so M8 derived *different* signals from *different* artefacts
and compared afterwards:

| Signal | Source | Question it answers |
|---|---|---|
| `missingModern` / `missingLegacy` | filesystem | does every cited anchor exist at this revision? |
| `modernCallFileCount` | cited modern files | is there a real call site (`get(`/`post(`/`enterpriseRequest(` …), not a string mention? |
| `clientCallFileCount` | one hop of `@/lib` imports | when a component calls a typed client module, does that module call anything? |
| `endpoints` → `resolved` / `unregistered` | 393-operation register | does every endpoint the row declares exist as an operation? |
| `deadEndpoints` | register class | are those operations reachable from any client? |
| `writes` | defining route file | is there a write (`INSERT/UPDATE/DELETE/save*/update*/create*`) behind the route? |
| `gapOverlap` | `client-contract-audit.json` | does the row's endpoint set intersect a known client→backend gap? |

Flags emitted per row: `COMPONENT_VS_WORKFLOW`, `ROUTE_VS_AUTHORIZED_OP`, `MOCK_VS_REAL`,
`CATALOG_VS_DESIGN`, `UI_VS_PERSISTED`, `MISSING_EVIDENCE`, `CONTRACT_GAP`. The tool **never writes a
classification**. It is a triage instrument: its job is to point a human at rows where the published
verdict and the derived evidence disagree, and to make a silent disagreement impossible.

The one-hop client resolution exists because the first run produced eight `COMPONENT_VS_WORKFLOW`
flags on FULL rows — all false: those components call `enterpriseApi.*` / `api.*` wrappers, so the
path literal lives in `frontend/src/lib/*`. That is a fact about the audit's layering, not about the
product, and the tool was corrected rather than the rows.

## 2. Result

| Measure | Value |
|---|---:|
| Rows revalidated | **112** |
| Rows at parity (FULL + REPLACED) | 18 |
| Rows classified absent-family (MISSING / STATIC STUB) | 28 |
| Rows emitting at least one flag | **1** (after adjudication) |
| Rows where the derivation contradicted a parity verdict | 8 (all read; 7 resolved as derivation artefacts, 1 survives) |
| Rows classified absent **but** with a modern call site | 4 (all read; none reclassified) |
| Classifications changed | **3** (FP-D07 ↓, FP-A12 ↑, FP-C06 ↑) |

Regenerated distribution (from `FEATURE-PARITY-MATRIX.md`, generator `tools/parity-matrix.cjs`):

| Classification | M7 | **M8** |
|---|---:|---:|
| FULL PARITY | 12 | **13** |
| PARTIAL PARITY | 49 | **51** |
| MISSING | 30 | **28** |
| STATIC STUB | 0 | 0 |
| MOCK / FABRICATED STATE | 12 | 12 |
| LOCAL-ONLY PERSISTENCE | 0 | 0 |
| INTENTIONAL RETIREMENT | 0 | 0 |
| REPLACED BY EQUIVALENT | 6 | **5** |
| UNVERIFIED | 3 | 3 |
| **Total** | 112 | **112** |

"Ineffective" total (MISSING + MOCK + STUB + LOCAL-ONLY) = **40**; at parity = **18**; partial = **51**;
unverified = **3**. No row's *evidence text* was rewritten except the three that changed class; each
new note records the previous verdict, the previous anchor and the reason it moved.

## 3. The three changes, with the evidence that moved them

### FP-C06 Portfolio template gallery with palettes — MISSING → **FULL PARITY**

M7 read this row against the named legacy *blocks* ("Distinctions & Milestones", "Leadership & Career
Trajectory", "Notes From Collaborators"). Those blocks belong to the 71-block library row FP-C02.
The row's own legacy path is `src/components/PortfolioTemplates`, which contains exactly four
template renderers — `CreativeDark`, `Executive`, `ModernMinimal`, `PremiumTech` — plus a shared
renderer and CSS.

The modern tree carries the **same four ids**: `PORTFOLIO_TEMPLATES`
(`frontend/src/lib/portfolio-document.ts:17-22`) and the same four palette keys
(`frontend/src/components/portfolio/portfolio-view.tsx:33-38`), a selectable picker
(`frontend/src/pages/portfolio/builder.tsx:541-546`), a renderer that applies the matching palette
(`portfolio-view.tsx:61`), and an alias table so ids written by older studio versions still resolve
(`portfolio-document.ts:28-33`). 4/4 templates, 4/4 palettes.

*Caveat carried in the note:* there is no separate template-browsing gallery page, and the row has
no backend operation, so its FULL support is structural, not endpoint-verified (see §6 of the
verifier review for the vacuous-SUPPORTED weakness this exposes).

### FP-A12 Platform tenant registry — MISSING → **PARTIAL PARITY**

M7 anchored this row on `AdminModerationTab.tsx:389`, which does render fixture "companies/tenants"
sections from `DEFAULT_APPLICATIONS`. That fixture surface is real — it is DISC-030 / FP-A20 — but it
is not the capability and not the only implementation. A platform-level registry exists and is wired
end to end: `EnterprisePlatformTab.tsx:46` → `enterpriseApi.getPlatformTenants()` →
`frontend/src/lib/enterprise-api.ts:602-613` (list / suspend / reactivate) →
`backend/routes/enterprise.js:608,621,630` → `listPlatformTenants` /
`setTenantLifecycleAsPlatform` → `backend/enterprise-test/enterprise-completeness.test.js:527-552`
(list, admin-denied, member-denied suspend, suspend→reactivate round trip).

Still missing, hence PARTIAL rather than FULL: quota display, and any registry rendering inside the
admin console. Over HTTP at this revision the surface answers `404 ENTERPRISE_DISABLED` ("Enterprise
tenancy is disabled for this deployment") — code exists, configuration gates it off.

### FP-D07 Notification centre — REPLACED BY EQUIVALENT → **PARTIAL PARITY**

Reasoning in `M8-SUBFEATURE-CLOSURE.md` §2. Short form: bell + routing are equivalent replacements;
the unread poller named in the row title is not replaced and no global unread badge survives. Both
readings are published (at-parity total 17 *strict* / 18 *loose*); the strict one is in the matrix.

## 4. Flags that survived and what they mean

| Row | Flag | Adjudication |
|---|---|---|
| FP-E13 Smart resume layout engine (FULL) | `COMPONENT_VS_WORKFLOW` | **Derivation false positive.** The row is a pure rendering engine (partitioners, 5 layouts, primitives) with no endpoints and no backend calls; "no call site" is the correct state, not a gap. The legacy→modern mapping is one-to-one on layout names (`modern-split`, `minimal-ats`, `executive-banner`, `tech-grid`, `compact-euro`). Flag not acted on. |

Absent-family rows that still contain a modern call site (read, none reclassified):

| Row | Why it stays absent |
|---|---|
| FP-C04 Editing portfolios created by the legacy editor | The modern builder **refuses** legacy block content: `isWebCvDocument()` rejects it and the UI says "Built with the earlier page editor" (`builder.tsx:347,477,490-533`). The call site is the new document model, not legacy editing. |
| FP-D01 Live voice interview (TTS) | 0 hits for `speechSynthesis|SpeechRecognition|getUserMedia|MediaRecorder|AudioContext` in `frontend/src`. The live-interview client is the **text** session (a different row); no voice path exists. |
| FP-F07 Job discovery with map + Places autocomplete | Client calls `GET /api/jobs`, which no operation serves (runtime: `404 NOT_FOUND`); even the registered listing ignores `q/location/type`. A call site that cannot succeed is not a capability. |
| FP-G09 Blog authoring + public blog | Every blog operation is UNREACHABLE and every client path is a contract gap (`/blog/posts*` → runtime `404 NOT_FOUND`). The pages exist; nothing they call works. Absent, with a mock-flavoured admin list (`DEFAULT_ARTICLES`) noted as a sub-detail rather than a class change. |

## 5. Named failure modes — what the 112 rows say about each

| Mode the mandate names | Rows affected | Evidence |
|---|---|---|
| component exists, workflow does not | 12 MOCK rows + FP-G09, FP-A20 | e.g. `AdminModerationTab` renders fixtures; `AdminBlogManagementTab` keeps `DEFAULT_ARTICLES` on an empty result and swallows delete failures (`.catch(() => {})`) |
| route exists, authorized operation does not | 176 UNREACHABLE operations; rows FP-G23 (availability with no consumer), FP-F10/FP-F07 | `GET /api/service-availability` answers 200 and no client calls it; `POST /platform/queues/purge` is a deliberate `410` |
| mock vs real | 12 MOCK + `DEFAULT_*` fixtures in 3 admin tabs | see DISCREPANCY-LOG DISC-030, DISC-047 |
| catalog vs design | FP-A13/A14/A15-style catalog rows (admin catalogues) — held as MOCK/UNVERIFIED, not upgraded | no new evidence in M8 |
| UI vs persisted state | FP-G11 (new), FP-A20, FP-A31 | contact form reports success with no request; moderation flips local state |
| HTTP 200 vs correct | FP-F07 (filters), FP-G11, DISC-045 coupons | server answers, but not the question the UI asked |
| static vs runtime | every row | 0 rows are runtime-verified end to end; see `M8-RUNTIME-VERIFICATION.md` for the four scenarios that did execute at HTTP level |

## 6. Limits of this revalidation

1. **It is not 112 hand reads.** The derivation covers all 112 rows mechanically; the *human* read
   covered the 8 flagged rows, the 4 absent-with-calls rows, the 3 changed rows, and the 13 FULL
   rows' endpoint support (via `parity-endpoint-audit.json`). 96 rows were not re-read line by line
   in M8 and stand on M7's adjudication. Saying otherwise would be the exact inflation the mandate
   forbids.
2. **Two independent instruments share an assumption.** "A call is a helper verb followed by a path
   literal" is baked into both the register and this tool. A call constructed by string concatenation
   or inside an unparsed helper is invisible to both.
3. **A FULL row with no endpoint passes endpoint support vacuously** — FP-E13 and now FP-C06 are
   graded `SUPPORTED` by `parity-endpoint-audit.cjs` because they have no endpoints to fail. That is
   a verifier weakness, recorded in `M8-VERIFIER-QUALITY-REVIEW.md`, not a property of the product.
4. **Classification is not behaviour.** A row moving to PARTIAL because a poller was lost says
   nothing about whether the notification centre works today; only runtime evidence could say that.
