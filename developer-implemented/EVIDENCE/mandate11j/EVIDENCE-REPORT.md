# MANDATE 11J — Evidence Report
**Developer 3 · Web CV & Portfolio Builder Studio · Public showcase · Candidate settings test alignment**

Repository: `bhaskarbeyond-creator/ResumePilotAi`
Baseline commit (`§6`): `4dd5525423ed9fd2c65aba0c3529b9e81267823f` — present, and an ancestor of the working tree (`git merge-base --is-ancestor` → `BASELINE_IS_ANCESTOR`).
Working branch actually used: `arena/9d98cdf2-resumepilotai` (**deviation** — see §5 of the handover). The preferred branch `arena/mandate11j-portfolio-showcase-builder` could not be created in this session (see the handover; the work is committed on the session branch instead).
Environment: Node **v22.22.3**, npm 10.9.8, Chromium 149.0.7827.0 (`@sparticuz/chromium` binary + extracted `al2023` shared libraries), Playwright 1.64.1.
Everything below was executed in this sandbox in this session. Nothing is quoted from another machine, and nothing was run against staging or production.

---

## 1. Gate results (all four executed, all passed)

| # | Gate | Command (as run) | Result | Log |
|---|------|------------------|--------|-----|
| 1 | Lint | `npm --prefix frontend run lint` (`oxlint`) | **PASS** — `Found 0 warnings and 0 errors. … on 270 files with 96 rules`, exit 0 | `gate1-lint.txt` |
| 2 | Build | `npm --prefix frontend run build` (`tsc -b && vite build && node ../scripts/sync-dist.mjs`) | **PASS** — `✓ built in 2.04s`, `Successfully synchronized frontend/dist -> dist (355 files copied)`, exit 0 | `gate2-build.txt` |
| 3 | Node contract tests | `node --test developer-implemented/TESTS/unit/mandate11j-contracts.test.mjs` | **PASS** — `# tests 45 / # pass 45 / # fail 0` (~370 ms), exit 0 | `gate3-node-test.txt` |
| 4 | Playwright E2E | `cd frontend && LD_LIBRARY_PATH=/tmp/al2023/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium PLAYWRIGHT_CHROMIUM_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu" npx playwright test -c tests/mandate11j.config.ts` | **PASS** — `29 passed (1.1m)`, exit 0 | `gate4-playwright.txt` |

Supporting evidence in this directory:

| File | What it proves |
|------|----------------|
| `qr-oracle-vs-python-qrcode.txt` | The self-contained QR encoder produces **bit-for-bit identical matrices** to the independent Python `qrcode` library for 7 payloads (versions 1–11, masks 0/2/3/4/6): `ALL MATCH` |
| `candidate-suite-enumeration.txt` | `npx playwright test -c playwright.candidate.config.ts --list` → the aligned settings tests **parse and enumerate** (`Total: 877 tests in 15 files`, including `settings.spec.ts:206 › keeps the edits on a save conflict and requires an explicit resolution`). Enumeration only — **no candidate test was executed** (needs the real Express + MariaDB stack) |
| `diffstat.txt` | The exact changed-file set: 9 modified files, `1866 insertions(+), 403 deletions(-)`; the 4 added files are new (`share-publication.tsx`, `mandate11j-contracts.test.mjs`, `mandate11j.config.ts`, `mandate11j.spec.ts`) |

### How each gate was made runnable (relevant for re-running)
- **Browser**: `npx playwright install chromium` cannot download in this sandbox and `apt` has no `libnspr4`/`libnss3`, so the gate uses the repository's own `@sparticuz/chromium` binary at `/tmp/chromium`, with `libnspr4`/`libnss3` extracted from `node_modules/@sparticuz/chromium/bin/al2023.tar.br` into `/tmp/al2023/lib` and passed through `LD_LIBRARY_PATH`. `tests/mandate11j.config.ts` accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE` / `PLAYWRIGHT_CHROMIUM_ARGS` for exactly this case; with a normally provisioned browser it needs neither.
- **Node tests**: the suite imports the **real** production modules (`frontend/src/lib/portfolio-document.ts`, `frontend/src/lib/portfolio.ts`, `frontend/src/lib/api-client.ts`) through a `module.registerHooks` resolver that maps the application's `@/…` alias onto `frontend/src` and replaces the browser-only `lib/firebase` with a two-line stand-in. No logic under test is re-implemented in the test file. This requires Node ≥ 22.6 (type stripping) — see the Node-20 deviation in the handover.

---

## 2. Contract test coverage (45 tests, `node --test`)

Real assertions against the production modules, grouped:

**Document engine** — `normalizeCanonical` from the canonical object, from a legacy document (`{canonical}`, `{data:{canonical}}`, flat), field-alias mapping, string-array skills, `'false'` string flags, `darkCyber → premiumTech`; idempotency (normalise twice = normalise once); `emptyCanonical` completeness; `canonicalFromResume` heading/skills/source mapping; `templateMeta` for every template id plus unknown/legacy ids.

**Visibility (Workstream A)** — `defaultVisibility()` all visible; `normalizeVisibility` hides **only** an explicit `false` (or legacy `'false'`) so junk values never hide content; `visibilityOf`; `canonicalWithVisibility` drops experience/education/projects/skills and blanks email/phone/website/linkedin/github for `showContact:false`; **non-mutation** of the input; idempotency; legacy document (no flags) stays fully visible; `hasHiddenSections`; `documentWithVisibility` keeps the stored document's hidden content out of the read projection while never deleting it from the editable canonical; `compareCanonical` reports title/summary/counts/visibility differences and returns `[]` for identical versions.

**Storage document** — `buildDocument` writes `renderer:'webcv'`, `templateKey`, `canonical`, `content`, `root.props`, `title`, `description`, `tags`, `seoTitle`, `seoDescription`, `theme`, top-level `visibility`, `isPublished`; server fields (`id`, `userId`, `revision`, `createdAt`, `updatedAt`, `publishedAt`, `data`, `metadata`, `slug`, `isPublished`) are never written back from `previous`; unknown legacy keys survive; a non-empty stored title wins over an empty one; `normalizeSlugBase` matches the server's address base (`'  Priya Sharma — CV  '` → `priya-sharma-cv`); `safeHttpUrl`/`safeMailto` reject `javascript:`, `data:`, and header-injection-shaped input.

**API layer** — `PORTFOLIO_ID_PATTERN` over minted ids (`^[A-Za-z0-9_-]{4,128}$`); `portfolioSaveEnvelope` accepts `{id, portfolio, expectedRevision}` only for a safe non-negative integer revision and throws `PORTFOLIO_REVISION_REQUIRED` for `undefined`, `null`, `''`, `'0'`, `-1`, `1.5`, `NaN`, `Infinity`, `2**53`, and an object; a captured axios `adapter` proves `savePortfolio` sends exactly `{portfolio, expectedRevision}` to `POST /portfolios/:id`; a 409 response is mapped to `conflict:true` with `remoteRevision`; `moduleDisabled` is set **only** for HTTP 403 **and** code `PORTFOLIO_MODULE_DISABLED` (an unrelated 403 and a 400 with the same code are not treated as disabled); `sanitizePublicPortfolioDto` drops `userId`, `user_id`, `revision`, `billing`, GSTIN, `extra_data`, street/postal code and every unknown key, rejects an unpublished record as `404 PORTFOLIO_NOT_FOUND`, and applies the visibility projection.

**Custom domains** — `validateCustomDomain` rejects scheme, path, query, fragment, port, trailing slash, IP address, `localhost`, empty label and over-long labels, and normalises `' Alex-Smith.DEV '` → `alex-smith.dev`; `customDomainDnsRecords` returns exactly one **TXT** record at the domain itself with the server's token and never invents a CNAME/A target (`CUSTOM_DOMAIN_ROUTING_SUPPORTED === false`).

**QR encoder** — structural validation for a 55-byte URL (finder patterns at three corners, timing patterns, dark module, `size === 17 + 4·version`, version 4 chosen), refusal past capacity, and `publicPortfolioQrTarget` refusing to encode anything but the configured public address (returns `null` rather than guessing a base URL under Node).

---

## 3. E2E suite — 29 scenarios (`frontend/tests/mandate11j.spec.ts`)

Harness: one Vite dev server on port 4017 (`MANDATE11J_PORT`), `workers: 1`, a `page.route`-based `ApiFixture` that models the real Express contracts (`GET /api/portfolios`, `GET/POST /api/portfolios/:id`, `POST …/publish`, `GET /api/portfolios/public[/:slug]`, `POST …/custom-domain`, `POST …/custom-domain/verify`), the preview-identity session (`ime_dev_user` with an `rptest.<payload>.bbb…` token, verified through `GET /api/users-data/profile`), and an `axe-core` WCAG 2.1 AA check at 1280 px and 375 px. Every fixture asserts the **request body** that was sent and, where it matters, the **absence** of a request.

Scenarios covered (mapped to the mandate's 26):

1. An existing portfolio loads what the server stored (title, employer, preview name, exactly one GET).
2. A new portfolio is persisted as a draft **before** the editor opens; the id survives a refresh; no duplicate row on double submit.
3. Hiding a section updates the live preview immediately and keeps the content.
4. Visibility flags are saved with the document and restored on reload.
5. Choosing a template changes the live preview.
6. The split-screen preview switches between desktop and mobile widths (375 px frame).
7. A 409 keeps local edits, blocks saving and offers the three resolutions.
8. The conflict dialog explains both versions (`revision 4` vs `revision 6`, differing title/summary) and exposes Keep local & overwrite / Inspect remote changes / Discard & reload.
9. Keep local & overwrite saves against the **current** server revision.
10. Discard & reload loads the newest server version and writes nothing.
11. A 403 `PORTFOLIO_MODULE_DISABLED` shows the exact banner sentence and removes editing.
12. The portfolio list reports the disabled module without offering creation.
13. An unrelated 403 is **not** mistaken for the disabled module.
14. The publish dialog validates the slug before calling the server.
15. The public portfolio renders by slug with `${seoTitle} · IME365` and a restored `<title>` on navigation.
16. The public page never renders private owner fields or hidden sections (even though the API payload contains them).
17. A missing/unpublished slug shows a not-found state.
18. The gallery lists published portfolios and filters by search and template.
19. Gallery filters are read from the URL and survive a refresh.
20. An unknown `?template=` is ignored rather than trusted.
21. The share dialog copies the public link and announces the result.
22. The share dialog refuses to report success when the clipboard fails.
23. The QR code encodes exactly the public URL shown (square quiet-zone `viewBox` derived from the version).
24. An unpublished portfolio offers publishing instead of a shareable link.
25. Custom-domain validation rejects schemes/paths/trailing slashes without calling the API.
26. A registered domain shows the server-issued TXT record and its real status.
27. A failed DNS lookup is reported as pending, never as verified.
28. Builder + preview + conflict dialog pass axe at 1280 px, with no horizontal overflow.
29. Public portfolio + gallery pass axe at 1280 px and 375 px, with no horizontal overflow.

---

## 4. What the evidence does **not** prove

- **No candidate-suite test was executed.** `frontend/tests/candidate/settings.spec.ts` is documented as "real stack only: UI :4000 → Express :8080 → MariaDB bridge". This sandbox has no MariaDB and no bridge, so the two aligned tests are **enumerated and type-checked only** (`gate4`-independent `tsc -p tests/…` → 0 errors; lint → 0/0; `--list` → enumerates). Runtime verification of Workstream C is **BLOCKED**, not passed.
- **No backend test was run**, and no backend file was read-modified: the backend is read-only in this mandate and remains untouched (`git status` shows no `backend/` change).
- **No screenshot is claimed as a production view.** All UI evidence is the headless Chromium run against the local Vite dev server with a route-mocked API.
- **No DNS verification was performed or simulated.** The suite asserts only that the UI reports what the server said, and that a failed lookup stays "pending".
- **Custom-domain routing is not enabled.** The backend verifies ownership with a DNS TXT record only; it exposes no CNAME/A target and the repository configures none, so the dialog states that plainly instead of printing an invented target.
