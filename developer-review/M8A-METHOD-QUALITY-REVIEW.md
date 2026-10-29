# M8A — METHOD QUALITY REVIEW

**Source revision:** `888c2e5`
**Subject:** the reliability of the audit instruments, the dossier that challenged them, and my own method within M8A.

---

## 1. What the dossier got right

1. **The thesis is correct.** The registers **do** under-record materially lost capability. A1 (Master Profile), A2
   (sync), A3 (candidate billing), D4 (cover-letter rich text) and D5 (voice engine) are real and, in three cases,
   **absent from the register entirely**.
2. **The right question was asked.** "Why is this not in the register?" produced five genuine new rows. A severity sweep
   would not have.
3. **Six of sixteen claims survived intact** on inspection (A1, A3, B1, B4, D3, D4, D5 in substance), which is a better
   hit rate than a speculative challenge usually achieves.

---

## 2. Dossier defects — recorded so they are not repeated

| # | Defect | Consequence | Correction |
|---|---|---|---|
| 1 | **9 of 24 paths wrong** (wrong directory, not wrong file) | any reader following the dossier lands on nothing | all relocated by repo-wide `find`; mapped in `M8A-SOURCE-CROSSWALK.md` §0 |
| 2 | **`U-G03` cited as a register ID** | the ID does not exist; `U-` rows are not a namespace in this register | B4 re-anchored to `FP-G11` / `FP-A24` |
| 3 | **`GET /api/pages` cited as live** | no such route is registered; the live pair is `/api/public/custom-pages` | route identity corrected; `/api/cms-pages` → `410` is retirement **by design**, not a defect |
| 4 | **"FP-A14/A15 missing" framing** | both rows exist | the actual defect is that both rows carry **identical** evidence tables |
| 5 | **A4 rests on a stub** | legacy `getUserLoginHistory` returns `[]` (`platform.js:1399`) | claim partly falsified; a capability that never worked cannot be "omitted" |
| 6 | **C2 wholly unsupported** | no SIEM export, no JSON export, no deep links, in any layer | falsified; `FP-B08` unchanged |
| 7 | **C3 "hardcoded candidates"** | legacy used real `createConversation`/`sendMessage` | falsified; `FP-F03`'s `MOCK` classification is the actual defect |
| 8 | **D3 first-pass trap** | the obvious file (`admin/blogManagement/BlogManagement.jsx`) has **no editor** — the editor is under `src/components/Blog/` | caught only by inventory sweep; recorded as a near-miss in §4 |

**Pattern:** the dossier repeatedly confused *the file a feature is named after* with *the file a feature lives in*, and
*an endpoint name that would make sense* with *an endpoint that exists*. Both are the "filename ≠ parity" trap the
mandate warns about, applied in reverse — assumed loss instead of assumed parity.

---

## 3. Register defects discovered by this mandate

These are instrument defects, and they matter more than any single claim because they propagate into every total.

| # | Defect | Evidence | Severity |
|---|---|---|---|
| 1 | **`FP-A14` and `FP-A15` have byte-identical subfeature tables** — `14/10/28/100/18/1/10/5/87`, `files legacy 35 / modern 0` | read side-by-side from `CAPABILITY-SUBFEATURE-REGISTER.md:208-240` | **highest** — at least one row is a template clone, so at least one "measurement" is not a measurement |
| 2 | **`FP-G19` measures TOTP with irrelevant classes** — `filtering` 1→139 `present`, `pagination` 8→47 `present`, while recording **legacy 0 handlers / 0 labels** | vs `DashboardSettings.jsx:487,1077-1100` | high — `PARTIAL PARITY` is derived from parser artifacts |
| 3 | **`FP-G11` undercounts the legacy inventory 5×** — "legacy 3 files" against **15** marketing components | `find src/components/Marketing -name '*.jsx' \| wc -l` → 15 | high — the denominator is wrong, so every subfeature ratio is wrong |
| 4 | **`FP-F03` overstates a defect** — `MOCK / FABRICATED STATE` for a surface backed by real calls and 6 persisted routes | `SendMessageDialog.jsx:5`, `index.js:2042-2320` | medium — over-classification is as damaging as under-classification |
| 5 | **`FP-D02` provenance is a lead, not a finding** — `EQUIVALENCE_LEAD` for something proven absent by repo-wide search | 0 hits for all five media APIs in `frontend/src` | medium |

**Why this matters:** defect 1 means the register's per-row tables are not independently derived. Any aggregate that
sums those tables inherits the clone. This is a **measurement-provenance** failure, and it is the strongest argument in
this mandate that a documentation verifier passing at 61/61 proves nothing about the count's truth.

---

## 4. My own method — errors made and corrected within this mandate

Recorded because a method review that only audits the other party is worthless.

| Error | How it arose | How it was caught | Effect |
|---|---|---|---|
| **D3 nearly declared falsified** | I read `admin/blogManagement/BlogManagement.jsx` (874 lines) and found no editor, concluding "no WYSIWYG existed" | inventory sweep of `contentEditable\|lexical\|tiptap\|quill` across all of `src/` surfaced `src/components/Blog/BlogEditor/BlogEditor.jsx` (1,631 lines, real Tiptap toolbar) | **reversed**; claim confirmed. Had I published, D3 would have been wrongly dismissed — the exact failure mode the mandate warns about |
| **B3 cause overstated as "confirmed 404"** | static grep showed no `/api/blog/posts` registration | runtime probe returned **401**, not 404 | **demoted** to "absence static-only; cause unverified" (report §6.1) |
| **B2 route absence overstated** | same reasoning | runtime returned **401** for `/api/pages` | **demoted** to static-only |
| **"No FP row for 2FA"** (carried from prior context) | assumption imported rather than checked | `FP-G08` and `FP-G19` both exist | **corrected** before publication |

**Net:** four self-corrections, two of which would have materially misled a reader. All four are disclosed in the
artefacts rather than silently fixed.

---

## 5. What the verifier set cannot see

The 61-check package passed throughout M8 and says nothing about the five fabricated surfaces in
`M8A-FALSE-SUCCESS-AND-MOCK-DATA.md`. Structurally it could not:

| Verifier capability | Blind spot |
|---|---|
| endpoint count / registration reconciliation | a route can be perfectly registered and never called (`A3`, `B2`) |
| contract shape checks | a correct contract with a fabricated **failure branch** passes (`FS-M8A-01`) |
| subfeature class counting | `filtering`/`pagination` counts are not capability (`FP-G19`) |
| reachability classification | cannot distinguish "error swallowed" from "no content" (`B3`) |
| coverage total | aggregates rows whose tables may be clones (`FP-A14`/`A15`) |

**A passing documentation verifier alone does not satisfy the gates** — demonstrated, not asserted: the highest-severity
finding in this mandate (fabricated PAID invoice) exists in a package that passes 61/61.

---

## 6. Reliability ranking of the evidence produced

| Rank | Evidence class | Claims |
|---|---|---|
| 1 | Three-layer source with explicit absence search | A1, A2, B4, C1, D4, D5 |
| 2 | Three-layer source with a definite code-path defect | B1, B2, D2, D3, A3 |
| 3 | Three-layer source with a partial/falsified sub-claim | A4, C3, B3 |
| 4 | Static crosswalk only, runtime demoted | B2/B3 cause statements (see §4) |
| 5 | Already recorded; evidence artifact invalid | D1 |
| — | Falsified | C2 |

**Nothing in rank 1–5 is runtime proof.** Ranks describe source confidence, not operational proof, and no row should be
read as the latter.

---

## 7. Recommendations (not authorized to implement)

1. Re-derive `FP-A14` and `FP-A15` independently before any total is published.
2. Recount `FP-G11` legacy from the filesystem (15, not 3).
3. Rebuild `FP-G19` from `DashboardSettings.jsx:487,1077-1100` rather than parser classes.
4. Add a failure-branch check: flag any `catch` that assigns success identifiers or success copy.
5. Treat `MOCK` classifications as claims requiring the same three-layer proof as losses — `FP-F03` shows `MOCK` can be
   as wrong as `FULL`.

---

## 8. Addendum — one further self-correction caught at commit time

| Error | How it arose | How it was caught | Effect |
|---|---|---|---|
| **Invented full revision SHA** | `sourceRevisionFull` was written in `M8A-omission-challenge.json` as a plausible-looking 40-character expansion of the short revision `888c2e5` | `git rev-parse HEAD` at commit time returned `888c2e511d5c2c32ec959232ec2d451aa4dd80ce` | **corrected before publication**; the field now holds the value read from git |

This is recorded because a fabricated identifier is indistinguishable from a fabricated measurement once it is in a
machine-readable artefact: any downstream tool would have accepted `888c2e5f1a40…` as a real revision. **Five
self-corrections now stand in this mandate**, and the rule they reinforce is that every revision string is read from
`git rev-parse`, never expanded by hand.
