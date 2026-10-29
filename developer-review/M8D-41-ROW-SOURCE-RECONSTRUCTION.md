# M8D — The 41 Row Source Reconstruction

**Mandate:** 8D §2 (P0, primary task). **Audited revision:** `69a3ed4`.
**Machine-readable:** `Evidence/artifacts/m8d-row-reconstruction.json` (41 rows, one decision each).
**Reproduce:** `python3 developer-review/tools/m8d-reconstruct-rows.py [--json]` ·
per-row dossiers: `python3 developer-review/tools/m8d-row-dossiers.py --row FP-A05`.

M8C declared 41 of 53 bare-directory rows UNRECONSTRUCTED. All 41 have now been read at source and
given a disposition.

---

## 1. Result

| Disposition | Count | Meaning |
|---|---|---|
| `VERIFIED — CORRECT` | **24** | every file in the corpus implements this row's own capability |
| `CORRECTED — MEASUREMENT WAS CONTAMINATED` | **9** | the corpus contained another row's implementation, or none of its own |
| `SHARED — JUSTIFIED WITH EVIDENCE` | **5** | sharing is real and correct, but the row's counts include another capability's classes |
| `PARTIALLY RECONSTRUCTED` | **3** | the capability is a region of a shared file, or extends beyond the measured corpus |
| `BLOCKED — SPECIFIC PREREQUISITE MISSING` | **0** | nothing here required an unavailable prerequisite |
| `UNRESOLVED — FURTHER FEASIBLE WORK REQUIRED` | **0** | — |

**No row was left without a disposition, and none was relabelled as blocked to close the list.**

The strongest single check on this work: the **24 VERIFIED rows reproduce their published volume to
the line (+0)**. All 41 were recomputed with the register's own convention (a `\n` count, which
includes a trailing empty element), so a correct corpus yields an exact match. A +0 delta is
therefore evidence, not an assumption; and the nine corrections are exactly the rows where it is not.

---

## 2. Method (stated so it can be attacked)

1. **The 41 were extracted, not guessed:** rows whose overlay `corpusScope` is
   `directory-unreconstructed` — 41 of 112.
2. For each row: every file under the declared directories was listed with its size, its imports and
   its count of the row's own vocabulary (`m8d-row-dossiers.py`).
3. A cross-row claim map was computed — which files each of the 112 rows reaches — and every row of
   the 41 was checked against it for files that are another row's *whole* corpus.
4. **Doctrine** (arguable, and stated in the tool):
   - A bare directory is **not** a defect by itself. If it implements one capability, the published
     measurement is correct. Eleven of the 41 are directories containing a single file.
   - **Contamination** = the corpus contains a file implemented for a *different* capability with its
     own row, or contains no file implementing this row's capability.
   - **Justified share** = two rows measure different properties of one implementation, or a
     sub-capability legitimately lives inside its parent.
   - A nested sub-feature is not automatically contamination — but the parent's *subfeature counts*
     then include the child's classes, so the parent is recorded as a share, not as verification.
5. **No classification was changed.** Reconstruction corrects *what* a row measured, not what it was
   found to be. `FP-A07` stays `MOCK / FABRICATED`; `FP-E08` stays `FULL PARITY`.

---

## 3. VERIFIED — CORRECT (24 rows)

| Row | Class | Published | Reconstructed | Δ | Disposition |
|---|---|---|---|---|---|
| `FP-A01` | PARTIAL PARITY | 1f/508L | 1f/508L | +0 | VERIFIED |
| `FP-A03` | PARTIAL PARITY | 3f/882L | 3f/882L | +0 | VERIFIED |
| `FP-A06` | MOCK / FABRICATED | 1f/770L | 1f/770L | +0 | VERIFIED |
| `FP-A09` | MOCK / FABRICATED | 4f/1127L | 4f/1127L | +0 | VERIFIED |
| `FP-A10` | MOCK / FABRICATED | 1f/131L | 1f/131L | +0 | VERIFIED |
| `FP-A11` | MOCK / FABRICATED | 2f/1186L | 2f/1186L | +0 | VERIFIED |
| `FP-A12` | PARTIAL PARITY | 1f/2106L | 1f/2106L | +0 | VERIFIED |
| `FP-A13` | MOCK / FABRICATED | 1f/642L | 1f/642L | +0 | VERIFIED |
| `FP-A17` | PARTIAL PARITY | 4f/3243L | 4f/3243L | +0 | VERIFIED |
| `FP-A22` | MISSING | 1f/399L | 1f/399L | +0 | VERIFIED |
| `FP-A23` | MISSING | 2f/382L | 2f/382L | +0 | VERIFIED |
| `FP-A24` | PARTIAL PARITY | 3f/3856L | 3f/3856L | +0 | VERIFIED |
| `FP-C02` | MISSING | 72f/18016L | 72f/18016L | +0 | VERIFIED |
| `FP-C05` | FULL PARITY | 1f/308L | 1f/308L | +0 | VERIFIED |
| `FP-C06` | FULL PARITY | 7f/1822L | 7f/1822L | +0 | VERIFIED |
| `FP-C07` | FULL PARITY | 1f/239L | 1f/239L | +0 | VERIFIED |
| `FP-D15` | FULL PARITY | 1f/402L | 1f/402L | +0 | VERIFIED |
| `FP-E13` | FULL PARITY | 23f/3082L | 23f/3082L | +0 | VERIFIED |
| `FP-E16` | PARTIAL PARITY | 3f/179L | 3f/179L | +0 | VERIFIED |
| `FP-F08` | PARTIAL PARITY | 4f/901L | 4f/901L | +0 | VERIFIED |
| `FP-G07` | PARTIAL PARITY | 1f/132L | 1f/132L | +0 | VERIFIED |
| `FP-G09` | MISSING | 7f/3915L | 7f/3915L | +0 | VERIFIED |
| `FP-G10` | PARTIAL PARITY | 17f/3985L | 17f/3985L | +0 | VERIFIED |
| `FP-G22` | REPLACED | 7f/344L | 7f/344L | +0 | VERIFIED |

Evidence for each is a per-row sentence in the JSON (`rationale`), naming what the files are. Two
worth quoting because they look like defects and are not:

- **`FP-A13`** (`CompanyManagement.jsx`, 641 L) has **zero** `useState`, **zero** `useEffect` and
  **zero** API calls. That is not a corpus error: it is precisely why the row is
  `MOCK / FABRICATED` — a static fixture screen with no data plumbing.
- **`FP-C02`** (72 files) is 71 block components plus `index.js`, which only re-exports
  `NavbarCategory`, `HeroCategory`, `AboutCategory` … `AwardsCategory`. A barrel file is not a second
  capability.

---

## 4. CORRECTED — MEASUREMENT WAS CONTAMINATED (9 rows)

| Row | Published | Corrected | Δ lines | What was in the corpus that does not belong |
|---|---|---|---|---|
| `FP-E08` | 36f / 16,941L | **1f / 271L** | **−16,670** | the whole `BuildResume` directory for a *share modal* |
| `FP-E09` | 74f / 15,832L | **2f / 1,918L** | **−13,914** | the entire 72-file `cv-templates` catalogue |
| `FP-A20` | 5f / 1,634L | 2f / 713L | −921 | command palette (FP-A23) + sidebar (FP-A26) |
| `FP-F10` | 21f / 7,818L | 17f / 6,917L | −901 | the whole `JobsLanding` directory (FP-F08) |
| `FP-A05` | 2f / 762L | 1f / 363L | −399 | `AdminAuditLogs.jsx`, which is FP-A22's entire corpus |
| `FP-A07` | 1f / 363L | **0f / 0L** | −363 | the corpus implements the *event stream*, not a blocklist |
| `FP-D13` | 16f / 2,920L | 13f / 2,657L | −263 | `CubaNextSteps` (D10), `PaymentGraceBanner` (D14), `candidateEntitySearch` |
| `FP-D12` | 28f / 3,390L | 14f / 3,250L | −140 | 13 marketing `Homepage*` files that are FP-G10's implementation |
| `FP-G24` | 3f / 1,420L | 2f / 1,356L | −64 | `DashboardToast`, which `DashboardSupport` never imports |

### 4.1 The two largest corrections

**`FP-E08` — a share modal measured over an entire resume builder.** The row is `FULL PARITY` with
36 files and 16,941 lines. The capability is a share/public-link modal: the implementation is
`src/components/Dashboard/ShareModal/ShareModal.jsx` (270 L) plus share handlers inside
`BuildResume.jsx` (state at `:93`, plan-gated `handleShare` at `:1060-1090`, review-link mounts at
`:1920-1935` and `:2604-2620`, modal at `:2704`). The declared corpus is the same 36 files that
`FP-E01` measures as the resume builder. This is the `FP-A08` defect class at larger scale: a
one-component capability credited with a whole application area.

**`FP-E09` — cover letters measured over the template catalogue.** 74 files: the 72-file
`cv-templates` directory (which is `FP-E02`/`FP-E03`'s corpus) plus `CoverLetter/CoverLetter.jsx`.
`CoverLetter.jsx` does not read `cv-templates` at all — it imports `../TemplateRenderer`
(`CoverLetter.jsx:10`), one shared renderer. Including 72 unrelated template files inflated the row
by an order of magnitude.

### 4.2 The correction that changes what a row means: `FP-A07`

`FP-A07` claims an **IP blocklist / deny rules** and is classified `MOCK / FABRICATED`. Its declared
corpus is `src/components/admin/security/PlatformSecurity.jsx` (362 L). Reading it:

- it loads a security **event stream** via `getSecurityEvents('limit=100')` (`:20`), filters by
  severity (`:44-48`) and renders events — it is `FP-A05`'s capability;
- a case-insensitive search of the **whole legacy tree** for blocklist / deny-rule / IP-ban
  vocabulary returns only an unrelated hit in `Checkout.jsx`;
- the register's own evidence for this row cites **`handleBlockIp`**, and that symbol exists **only in
  the modern file** `frontend/src/components/admin/AdminSecurityTab.tsx:214`.

So the row's legacy corpus implements a different capability, and the legacy side has **no**
implementation of a blocklist. The `MOCK / FABRICATED` finding survives — but it is a **modern-side**
finding, and the row's legacy attribution was wrong. This is recorded, not repaired: correcting the
register row is a register change, which M8D is not authorised to make.

---

## 5. SHARED — JUSTIFIED WITH EVIDENCE (5 rows)

| Row | Corpus | Sharing that is real, and why it is not a defect |
|---|---|---|
| `FP-D03` | 6 interview files | contains `LiveVoiceEngine`/`LiveInterviewSession` (FP-D01) and `LiveAudioWaveform` (FP-D02). A session UI cannot have a voice mode without containing it — but this row's counts include those sub-capabilities' classes. |
| `FP-F11` | 7 employer-dashboard files | contains `SendMessageDialog` (FP-F03) and is the directory where M8C found the real implementations of `FP-F05`/`FP-F06`, whose own corpora were 25- and 27-line wrappers. |
| `FP-G02` | 52 `cuba` files | a component library shipping composites: `CubaCommandPalette` (D04), `CubaCopilotMascot` (D05), `CubaHud` (D06), `CubaDensityProvider` (D08), `CubaAppShell`/`CubaPortalShell` (G01). |
| `FP-G15` | 43 `src/utils` files | other rows measure individual modules of this library (`docxDownload.js` → E11, `pdfDownload.js` → E12, geo/totp/tracker modules → G17/G19/G20). Being consumed is a library's purpose. |
| `FP-G23` | 11 hook modules | consumed by D02, D07, G08. Cross-cutting by construction. |

These five are the answer to "do not automatically classify every directory-scoped row as
defective". They are also **not** clean measurements: each one's subfeature counts include another
capability's classes, and the report says so rather than presenting +0 as purity.

---

## 6. PARTIALLY RECONSTRUCTED (3 rows)

| Row | Published | Now | Why not complete |
|---|---|---|---|
| `FP-A18` | 3f / 2,773L | 1f / 1,014L + regions | the capability is a **region** of `UsersManager.jsx` (selection state `:34-50`, select-all `:155-170`, bulk handlers `:328-430`), not three files. `User360Drawer` (1,513 L) and `CreateUserModal` (244 L) implement no bulk operation. A line-region measurement is stated alongside the containing file, because "bulk action" is not a whole-file property. |
| `FP-E01` | 61f / 25,243L | 60f / 24,894L | the builder legitimately spans four directories, and it *contains* whole sub-capabilities with their own rows (ATS meter → E04/E05, AI aids → E10, template selection → E08). Only `AtsScoreMeter.jsx` is excluded here (349 L) because it is self-contained. Scoping the rest requires per-step line regions — feasible, not yet done. |
| `FP-G11` | 3f / 2,592L | unchanged | the corpus (welcome, features, contact) is not contaminated, but the row's title claims **FAQ, about and legal** pages that are not in it: a search of all three files for FAQ returns **zero** hits, and FAQ content lives in `Marketing/elements/Homepagefaqs.jsx` + `faqData.js` — FP-G10's corpus. Whether those belong to this row or that one is a register decision, not a measurement. |

---

## 7. Required disposition and recommended register action (per corrected row)

| Row | Recommended action | Rationale |
|---|---|---|
| `FP-E08` | re-scope to `ShareModal.jsx` + the share regions of `BuildResume.jsx`; re-derive subfeatures | 62× volume overstatement otherwise |
| `FP-E09` | re-scope to `CoverLetter.jsx` + `TemplateRenderer.jsx` | 8× overstatement; 72 files belong to E02/E03 |
| `FP-A20` | drop `command/` and `sidebar/` | those are A23's and A26's entire corpora |
| `FP-F10` | drop `JobsLanding` | F08's entire corpus |
| `FP-A05` | drop `AdminAuditLogs.jsx` | A22's entire corpus |
| `FP-A07` | record **no legacy implementation**; keep the modern finding | legacy corpus implements A05's event stream; `handleBlockIp` is modern-only |
| `FP-D13` | drop the 3 nested widget files | they are D10/D14 implementations |
| `FP-D12` | drop `Dashboard2/elements/Homepage*` | G10's implementation, counted twice |
| `FP-G24` | drop `DashboardToast` | not imported by the support surface; G07's subject |

Applying these is a **register change** and is not authorised here. They are published as a delta
(§`M8D-REMAINING-FINDINGS-AND-BLOCKERS.md`) with the exact before/after numbers.

---

## 8. Verification of this reconstruction

```
python3 developer-review/tools/m8d-reconstruct-rows.py          # 41 decisions, 0 missing
python3 developer-review/tools/m8b-integrity-verify.py          # C13 re-derives every row's volume
```

`C13 corpus-volume` (added in M8D) recomputes files and lines for all 110 rows with declared paths
and requires an exact match; it passes on the baseline and fails on a 1,000-line edit (`f15`) or a
3-file edit (`f16`). So the volumes quoted above are machine-checked, and the nine corrections are
the rows where the declared corpus was not the capability's own.

## 9. Limits

1. "CORRECTED" means the *corpus* was wrong. It is not a claim that the row's parity classification
   is wrong; none was changed.
2. The nine corrections are not yet applied to the register — the audited record still shows the
   contaminated volumes, with this delta published beside it.
3. `FP-E01`'s and `FP-A18`'s regional measurements are declared, not file-complete; their subfeature
   tables still need per-region recomputation before they are cited as their own.
4. Corpus membership was judged by reading files, not by a parser. Each decision names what the files
   are, so a reader can disagree with a specific one.
