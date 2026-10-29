# M8B — METHOD LIMITATIONS

**Source revision:** `69a3ed4`
**Purpose:** state what this audit can and cannot establish, and record the errors made *within* this mandate.

---

## 1. Blind spots that remain after M8B

| # | Blind spot | Consequence | Mitigation available |
|---|---|---|---|
| 1 | **Subfeature class regexes are shared** between the JS generator and my Python recomputation | the two implementations can confirm arithmetic and scope, but not that the 16 classes correspond to real capabilities | a hand-defined capability model per row; not mechanical |
| 2 | **No browser** | every client-side behaviour (fabricated checkout success, queue baseline rendering, swallowed blog errors, editor richness, voice engine) is **static-proven only** | Playwright + Chromium; the harness exists, the binary does not |
| 3 | **No MariaDB** | durability, migrations, CAS semantics, rate-limit store, invoice ledger all unverifiable; the in-memory double silently diverges (DISC-056) | a disposable database service |
| 4 | **No provider credentials** | no settlement claim in either direction | sandbox credentials; **not invented** |
| 5 | **No legacy runtime** | every legacy-side statement is source-only, permanently | legacy deployment — out of scope |
| 6 | **C06 accepts a `clientOnly` rationale without checking it** | a mislabelled row could declare `clientOnly` and pass | requires reading each capability |
| 7 | **C10 verifies that evidence resolves, not that it supports the claim** | a cited file could be irrelevant | human adjudication |
| 8 | **A self-consistent wrong package** would partly survive: if every row were re-derived from the same faulty corpus, C04/C05 catch duplication but not a wrong-yet-unique mapping | per-row capability scoping is the only real fix | reconstruction per row |
| 9 | **`coverage` 1,544 was not re-derived** | the headline figure mixes item types and inherits 18 unreliable rows | re-derive from registers with a documented formula |

---

## 2. Errors made and corrected inside this mandate

Disclosed rather than quietly fixed; each changed a published claim.

| # | Error | How caught | Correction |
|---|---|---|---|
| 1 | **C09 compared the declared finding count (53) against the ID count (55)** and reported a defect | reading `DISCREPANCY-LOG.md:33` — the log *explicitly declares* "53 (55 IDs…)" and names the two superseded IDs | check now parses both numbers and reconciles them separately |
| 2 | **C10 treated "STATICALLY VERIFIED" as a closure claim**, producing 17 false "closed without evidence" accusations | reading `DISC-002` — in a discrepancy log "verified" means *confirmed*, the opposite of closed | check now looks only for explicit `Resolution status:` / `Closure status:` markers, and notes that no closure field exists at all |
| 3 | **C10 required an `E-nnn` id**, and accused 5 runtime-verified findings of citing nothing | reading `DISC-008` — it cites `Evidence/artifacts/axe-violation-details.json` and two more paths, all of which resolve | check now accepts a resolving evidence path as well as an index id |
| 4 | **C07 compared `legacyFilesMeasured` (a distinct-file metric) against the sum of per-row `legacyFiles`** | the mismatch (650 vs 1,212) was too large to be a simple error; investigating showed the two are different quantities | the comparison is removed as invalid, and the ratio is published as the **1.86× double-counting indicator** it actually is |
| 5 | **Proposed-ID collisions in M8A** — `FP-G22` and `FP-G23` were issued for new findings although both already exist | this mandate's own free-ID check | corrected to `FP-G26` / `FP-G27`; recorded per claim in the machine-readable register |
| 6 | **Runtime totals were internally inconsistent** in the first draft of the closure matrix (7 PASS stated, 8 listed) | arithmetic check of the table against its own summary | regenerated; the machine-readable dataset is authoritative |
| 7 | **A CMS "unpublished page is publicly readable" was nearly reported as a product defect** | checking both repository implementations before writing it up | `MySQLRepository` applies `WHERE published = 1`; only the in-memory double ignores the option. Reclassified as a **test-double defect** (DISC-056) and explicitly *not* a product finding |

Item 7 is the most important: it is precisely the "mock pass is evidence about the mock" trap. The observation was
real, reproducible, and wrong as a product claim.

---

## 3. Claims previously made that M8B revises

| Prior claim | Source | M8B finding |
|---|---|---|
| "`/api/blog/posts` does not exist; runtime returned 401 so absence is static-only" | M8A §6.1 | **Reversed — absence is now runtime-proven.** With a valid admin identity the route returns **404 `API route not found`**; anonymously it returns 401 because auth runs before routing. Both observations are correct and together establish the absent route |
| "Shared helper-verb assumption causes mislabelled verbs" | M8/M8A | **Overstated.** Explicit `method:` in the options takes priority (`client-call-existence.cjs:100-109`); all 9 bare `fetch(` sites, 6 of them POST, are recorded correctly. The residual risk is the parse window, not the verb map |
| "FP-A14/A15 duplicate is a copied template" | M8A | **Wrong cause.** The numbers are computed — they reproduce exactly from the shared directory. The cause is directory-scoped attribution |
| "No FP row exists for 2FA" | earlier context | `FP-G08` and `FP-G19` exist (already corrected in M8A) |
| "`FP-G22`/`FP-G23` are free IDs" | M8A | Both occupied (item 5 above) |

---

## 4. What can be asserted with confidence

1. **Row identity and arithmetic**: 112 rows / 112 unique ids; histogram 13/51/28/0/12/5/3; 393 operations;
   53/55 findings; 16 claims with exactly one primary disposition each. All independently recomputed and equal.
2. **The corpus attribution defect**: 53 bare-directory rows, 8 shared-corpus groups, 18 rows, 1.86× double count.
   Proven by exact reproduction, not inference.
3. **The FP-A14/A15 scoped values**: two different, much smaller, independently reproducible inventories.
4. **The endpoint-grade vacuity**: three `FULL` rows pass an endpoint audit with no endpoints.
5. **Eight runtime behaviours** at the integration level, with the in-memory caveat attached to each.
6. **The M8A 16-claim adjudication**, with two ID corrections.

## 5. What cannot be asserted

1. Any browser-observed behaviour.
2. Any durability, migration or production-database property.
3. Any settlement, refund or provider-side financial behaviour.
4. That any of the five fabricated surfaces is or is not *currently* visible in production — only that the code
   path exists at `888c2e5` and the app trees at every recorded artifact revision are identical to `HEAD`.
5. That the register's other 16 shared-corpus rows and 53 bare-directory rows are correctly measured — they are
   `UNVERIFIED`, not "also wrong" and not "fine".
6. **100 % parity, zero defects, or production readiness.** None of these is supported.
