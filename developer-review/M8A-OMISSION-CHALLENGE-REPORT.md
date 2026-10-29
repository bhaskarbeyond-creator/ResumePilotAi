# M8A — OMISSION CHALLENGE REPORT

**Mandate:** 8A — Forensic Omission Challenge, Source-Level Validation & Audit Register Correction
**Source revision:** `888c2e5` (`arena/393531fe-resumepilotai`)
**Baseline:** M8 closed at `888c2e5`, verdict `PARTIAL — BLOCKED`
**Verdict (this mandate):** **`PARTIAL — INCOMPLETE`**
**Application files modified:** **0**

---

## 1. Executive position

The dossier raised **16 omissions** as mandatory claims. Every one was traced through legacy source, modern source,
backend route, persistence and authorization before any disposition was issued. No claim was accepted because it was
plausible, and none was dismissed because a filename or a button label was missing.

**Result: 15 of 16 claims engage real defects — but only 5 survive in the form the dossier stated.** The remaining 11
required correction: 4 are materially worse than alleged, 4 are narrower than alleged, 2 are partly falsified, and 1 is
**entirely unsupported by source** (C2). Exactly one claim needs no register change at all.

The dossier's central thesis — that the registers under-record materially lost capability — is **correct**. Its
supporting evidence is **unreliable**: 9 of 24 file paths were wrong, one cited register ID (`U-G03`) does not exist,
one cited route (`GET /api/pages`) does not exist, and one claim rests on a capability that was itself a stub.

The most serious defect found in this mandate is **not in the 16 claims at all**. It is in the registers themselves:
`FP-A14` and `FP-A15` carry **byte-identical subfeature tables** (`14/10/28/100/18/1/10/5/87`, `files legacy 35 /
modern 0`) for two completely different capabilities. At least one of those measurements is not a measurement. This is
recorded as a measurement-provenance defect and must be resolved before any total derived from those rows is trusted.

---

## 2. Dispositions — all 16 claims

Bucket key: **1** verified legacy capability omitted · **2** partially implemented with material functional loss ·
**3** false-success / mock-data / disconnected-API / misleading-UI · **4** already recorded but inadequately explained ·
**5** duplicate needing correction · **6** UNVERIFIED · **7** incorrect/unsupported by source.

| # | Claim | Bucket | Verdict in one line |
|---|---|---:|---|
| A1 | Master Profile 11-section repository + ATS gaps/tips | **2** | Confirmed. 12 legacy subtabs → 4 settings tabs / 12 flat scalars; gap engine and tip strings have **zero** modern hits. **No register row exists.** |
| A2 | Bidirectional resume ⇄ profile sync | **2** | Partly confirmed. Pull survives for 9 lists; **push is summary-only**; per-section selection and conflict handling gone. |
| A3 | Candidate billing / subscription console | **2** | Confirmed, and the dossier's "payments absent" framing is **falsified** — 5 provider routes, coupons, invoices and refunds all exist. The **candidate console** is missing. |
| A4 | TOTP enrolment, QR, recovery, login history | **2** | Split verdict. Modern list+disable are **real and audit-logged**; enrolment/QR/recovery gone; **legacy login history returns `[]`**. |
| B1 | Contact form false success | **3** | Confirmed. `handleSubmit` never calls the API and renders success over a fully working validated endpoint. |
| B2 | Public CMS pages | **3** | Confirmed and worse. Renderer is a hardcoded dictionary with **no network call**; unknown slug silently serves privacy-policy. |
| B3 | Blog article reader `/blog/:slug` | **3** | Confirmed and worse. Calls an **unregistered** route (runtime returns **401**, not 404 — see §6.1), swallows the error into a permanent empty state, **ignores the slug**. |
| B4 | Marketing interactive modules | **2** | Confirmed. Four stateful modules → a **zero-`useState`** static page. |
| C1 | Team member management | **2** | Narrowed. Team CRUD **exists**; backend member add/remove **exists with permission gates**; only the member **UI** is missing. |
| C2 | SIEM JSON export + deep links | **7** | **Unsupported.** Legacy audit export is CSV only; `siem` appears nowhere relevant in legacy, modern or backend. |
| C3 | Employer candidate messaging | **2** | Narrowed. Messaging is real and persisted on both sides; only the employer-side **initiation entry point** is lost. |
| D1 | Admin financial back-office | **4** | Already recorded as `FP-A15`. No new finding — but `FP-A14`/`FP-A15` evidence tables are duplicate artifacts. |
| D2 | Admin queue mock failures | **3** | Confirmed with precision. Partly real wiring, **fabricated SES stack trace**, baseline retained after failed load, **410 retired** purge. |
| D3 | Blog WYSIWYG regression | **1** | Confirmed. 1,631-line Tiptap editor → two plain textareas; the dependency is gone. |
| D4 | Cover-letter editor richness | **1** | Confirmed. Lexical `ContentEditable` → plain `Textarea`; no lexical dependency remains. |
| D5 | AI interview voice engine | **1** | Confirmed. 2,178-line voice stack → **zero** matches for any media/speech API in `frontend/src`. |

**Histogram:** bucket 1 = 3 · 2 = 7 · 3 = 4 · 4 = 1 · 5 = 0 · 6 = 0 · 7 = 1. **Total 16.**

### 2.1 Claims that were materially **worse** than alleged
- **B2** — not merely a fallback: unknown slugs serve the **wrong page** silently.
- **B3** — not merely an API 404: the failure is swallowed **and** the slug is ignored, so the reader cannot work even with data. The correct server handler (`/api/blog-data/slug/:slug` → `404 Post not found`) exists and is unused.
- **D2** — the fabricated SES stack trace invents frame paths and line numbers that do not exist, and it is exactly what renders when telemetry fails.
- **A3** — checkout fabricates an order number, an invoice number and a "PAID (Verified Server Entitlement)" status when payment fails (see `M8A-FALSE-SUCCESS-AND-MOCK-DATA.md`).

### 2.2 Claims that were **narrower** than alleged
- **C1** — backend membership add/remove exists with `workspace.members.manage` gates; the loss is UI-only.
- **C3** — messaging is persisted across 6 routes with participant-scoped authz; legacy was never hardcoded.
- **A4** — modern factor listing and disabling are real, audit-logged and token-revoking.
- **B4** — the pricing/comparison surfaces partly survive on the public pricing page; the loss is concentrated in the marketing modules.

### 2.3 Claims that were **partly falsified**
- **A4** — the legacy "login history" the claim relies on is `getUserLoginHistory()` returning `[]` (`platform.js:1399`). A capability that never worked cannot be "omitted".
- **A3** — "payments absent" is disproven: `/api/pay`, PayPal, Razorpay, coupon validation, invoices and refunds all exist server-side.
- **C3** — "hardcoded candidates" is disproven: `SendMessageDialog.jsx:5` imports real `createConversation`/`sendMessage`.

### 2.4 Claim that was **entirely falsified**
- **C2** — no SIEM export, no JSON export, no deep links, in any layer. The three legacy `siem` hits are skill labels (`'SIEM Operations'`, `'SIEM/SOAR'`) and an autocomplete keyword. `FP-B08`'s "CSV export" framing is correct and **must not be upgraded**.

---

## 3. What this mandate adds that the dossier did not name

Five findings were discovered by inventory sweep rather than supplied by the dossier:

1. **`FP-A14` / `FP-A15` duplicate evidence tables** — identical subfeature numbers for unrelated capabilities. Measurement provenance is broken for at least one row.
2. **`FP-G19` mis-measures TOTP** — classifies it `PARTIAL PARITY` from `filtering`/`pagination` classes while recording **legacy 0 handlers / 0 labels**, contradicting `DashboardSettings.jsx:487,1077-1100`.
3. **`FP-G11` undercounts the marketing inventory** — records *legacy 3 files* against an actual **15-component** marketing set.
4. **`FP-F03` is misclassified as `MOCK / FABRICATED STATE`** — legacy and backend messaging are both real and persisted; the row overstates the defect in the same way other rows understate losses.
5. **`/blog/posts` is not a real route** — the modern reader calls an endpoint that does not exist, and the error is swallowed. The dossier recorded only the 404, not the two consequences.

---

## 4. Confirmed **new** gaps versus corrected or merged existing rows

**New capability rows required (5):**

| New ID | Capability | Provenance |
|---|---|---|
| `FP-A27` | Master Profile career repository (11 sections, ATS gap engine, actionable tips) | no existing row |
| `FP-A28` | Resume ⇄ profile bidirectional sync | no existing row |
| `FP-A29` | Candidate billing / subscription console | adjacent to, but not covered by, `FP-A24`/`A14`/`A15` |
| `FP-G22` | Contact form false success | no existing row |
| `FP-G23` | Cover-letter rich-text editing | no existing row |

**Existing rows requiring correction (12):** `FP-G19`, `FP-G08`, `FP-G10`, `FP-G09`, `FP-G11`, `FP-B05`, `FP-F03`,
`FP-A20`, `FP-A15`, `FP-A14`, `FP-G21`, `FP-D02`.
**Existing rows with no change (2):** `FP-B08`, `FP-A24`.

**New false-success/mock records (5):** `FS-M8A-01` … `FS-M8A-05`.
**Duplicates merged rather than double-counted (1):** D1 → `FP-A15` (bucket 4, not a new finding).

---

## 5. Counts — recalculated, never forced

Unchanged, because this mandate **did not write to the registers** (evidence first, per instruction):

| Metric | Value | Source |
|---|---:|---|
| Findings | 53 / 55 IDs | `findings.json` |
| Coverage total | 1,544 | 650+206+112+393+48+53+65+17 |
| Legacy files / endpoints | 650 / 153 | inventory |
| Modern files / endpoints | 206 / 161 | inventory |
| Parity buckets | 13 FULL / 51 PARTIAL / 28 MISSING / 0 STUB / 12 MOCK / 5 REPLACED / 3 UNVERIFIED = 112 | `feature-parity.json` |
| Subfeatures | CLEAN 21 / LEAD 33 / DEEP_READ 8 / ADJUDICATED 50 | `capability-subfeatures.json` |

**Projected after corrections are applied** (see `M8A-PARITY-REGISTER-DELTA.md` for the machine-checkable plan):
- capability rows **+5** (`FP-A27`, `FP-A28`, `FP-A29`, `FP-G22`, `FP-G23`);
- parity histogram moves 3 rows `PARTIAL → MISSING`-or-stays-partial per the delta table, and **2 rows re-open** from
  `ADJUDICATED` because their evidence is a duplicate artifact — no total is adjusted to make a verifier pass.

> These projections are **not applied**. They are recorded so the correction step is auditable and so no later reader
> mistakes a plan for a measurement.

---

## 6. Runtime position

**End-to-end runtime executed: 0 of 16.** Browser-level proof: **0 of 16**. Backend route-level evidence obtained for
**2 of 16** (B2, B3). Blocked at the handler: **14 of 16**.

The backend was booted in in-memory repository mode and probed. Probes are recorded verbatim in
`Evidence/logs/m8a-runtime-probes.log`. **The in-memory repository is not MariaDB and is not presented as production
evidence**; these probes establish routing and admission behaviour only.

### 6.1 Runtime evidence forced two corrections to my own static conclusions

Both corrections cut **against** the dossier, and are recorded rather than quietly dropped:

| Claim | Static conclusion | Runtime observation | Corrected position |
|---|---|---|---|
| B3 | `/api/blog/posts` "does not exist" → 404 | **`401 AUTH_REQUIRED`** | absence is **static-only**; the 404 cause is **unverified** |
| B2 | `/api/pages` "does not exist" | **`401 AUTH_REQUIRED`** | absence is **static-only**, same reason |

The auth layer answers before routing, so neither path can be shown absent by runtime. The *user-visible defect in B3 is
unchanged* — an anonymous reader still gets an error swallowed into "No articles found" — but the stated **cause** is
demoted, because a 401 from a logged-out client and a 404 from a missing route are indistinguishable from the client's
side without credentials.

Two probes strengthened the case instead: `GET /api/blog-data` → `200 {"success":true,"posts":[]}` and
`GET /api/blog-data/slug/any-slug` → `404 Post not found`, proving a **correct** list route and missing-article handler
exist while the modern reader uses neither. `GET /api/public/custom-pages` → `200 …"source":"MARIADB_CUSTOM_PAGES"`
proves the public CMS API works while the renderer never calls it.

### 6.2 Why the contact form could not be exercised

All four payloads — valid, short message, malformed email, honeypot — returned **`503 RATE_LIMIT_UNAVAILABLE`**. Server
stderr names the cause: `[Rate limit store] contact connect ECONNREFUSED 127.0.0.1:3306`. With no rate-limit store the
admission layer **fails closed by design** (`security/abuse.js:108`), so `/api/contact` cannot be reached before the
handler. B1's backend half therefore remains **BLOCKED**, not verified.

**No claim in this report is upgraded on the strength of a mock, an emulator, an in-memory repository or a direct
Express invocation.**

---

## 7. Gates

| Gate | Result | Basis |
|---|---|---|
| A — provenance | **PASS** | source revision `888c2e5` = `origin/arena/393531fe-resumepilotai`; every citation read from that revision |
| B — coverage (16 individually) | **PASS** | 16/16 dispositioned, histogram reconciled programmatically |
| C — exact legacy + modern evidence | **PASS (static)** | `M8A-SOURCE-CROSSWALK.md` §2, file:line per layer; runtime half **outstanding** |
| D — backend routes / persistence / authz | **PASS (static)** | route + gate recorded per claim; runtime probes **blocked** |
| E — parity correction without duplicate counting | **PASS** | D1 merged into `FP-A15`; C1/C3 narrowed; 0 double counts |
| F — false-success / mock adjudication | **FAIL (product) / PASS (identification)** | 5 fabricated surfaces identified and evidenced; **they remain in the product** — this mandate does not authorize remediation |
| G — runtime evidence + blocked causes | **BLOCKED** | end-to-end 0/16; backend route-level 2/16 (B2, B3); 14 blocked with named causes; no browser proof |
| H — metrics from registers, independently validated | **PASS** | counts re-derived and reconciled; projection separated from measurement |
| I — method quality | **PASS** | `M8A-METHOD-QUALITY-REVIEW.md` records 9/24 path failures, `U-G03`, `/api/pages`, and the self-inflicted D3 near-miss |
| J — scope compliance | **PASS** | 0 application files modified; all output under `developer-review/` |
| K — documentation consistency | **PASS** | report, crosswalk, delta, register JSON and false-success inventory agree |

**A passing documentation verifier alone does not satisfy these gates**, and none of the PASS rows above was granted
because a report exists — each rests on the cited source evidence.

---

## 8. Verdict

**`PARTIAL — INCOMPLETE`**

Not `COMPLETE`: all 16 claims are adjudicated with three-layer source evidence, and two gained backend route-level
evidence, but **no claim has end-to-end or browser-level proof**, so Gate C's runtime half and **Gate G** remain
outstanding. Static inspection does not prove behaviour.

Not `PARTIAL — BLOCKED`: the blocking here is environmental and uniform (no DB, no credentials, no browser), and the
mandate's primary instruction — *start with the source crosswalk and the 16-claim register* — is **fully discharged**.
The remaining work is not waiting on anything external to become possible; it is the register-correction and
deliverable-completion work that follows the evidence.

**No 100 % parity and no production-readiness claim is made anywhere in this mandate.** Falsified capabilities in
legacy (A4 login history, C2 SIEM) mean parity has never been a simple subtraction, and three rows now carry
`MOCK`/partial classifications that source evidence does not support in either direction.

---

## 9. Deliverables

| Artefact | Purpose |
|---|---|
| `M8A-OMISSION-CHALLENGE-REPORT.md` | this report |
| `M8A-SOURCE-CROSSWALK.md` | per-claim three-layer source crosswalk, path corrections |
| `M8A-omission-challenge.json` | machine-readable register, one record per claim, stable IDs |
| `M8A-PARITY-REGISTER-DELTA.md` | row-by-row correction plan with rationale |
| `M8A-FALSE-SUCCESS-AND-MOCK-DATA.md` | 5 fabricated surfaces, evidence and user impact |
| `M8A-RUNTIME-VERIFICATION.md` | 16 blocked records with causes |
| `M8A-METHOD-QUALITY-REVIEW.md` | dossier defects, register defects, self-correction |
| `Evidence/logs/m8a-toolchain.log` | command/revision log |

**Application source, configuration, dependencies, schema, migrations and deployment artefacts were not modified.**
