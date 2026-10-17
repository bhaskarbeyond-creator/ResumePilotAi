# Candidate screenshot and evidence index — 2026-10-14

All screenshots are real Chromium captures from the local test harness, not generated mockups. Notification HTTP and template data are **SIMULATED**; rendering is real. The notification lab intentionally contains a “Toggle test mount” control and no candidate shell. Screenshots must not be presented as authenticated live pages.

Hashes and sizes for all logs, screenshots, traces, output samples and result JSON: [EVIDENCE.json](docs/candidate-audit/EVIDENCE.json). Lightweight current manifests are retained under `docs/candidate-audit/`; regenerable binaries/logs under `artifacts/candidate-audit-20261014/` are intentionally not added to Git. Copy that evidence bundle to approved CI/artifact storage for an external reviewer; a fresh clone alone will not contain the images.

## Notification viewport pairs

Paths relative to `artifacts/candidate-audit-20261014/`. The “before” run predates application edits and had 15/20 passing scenarios. The final “after” run passes 20/20 with the stronger internal clipping assertion.

| Viewport | Before | After | State |
|---|---|---|---|
| 320x568 | [before](artifacts/candidate-audit-20261014/before/notifications-320x568.png) | [after](artifacts/candidate-audit-20261014/after/notifications-320x568.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 375x812 | [before](artifacts/candidate-audit-20261014/before/notifications-375x812.png) | [after](artifacts/candidate-audit-20261014/after/notifications-375x812.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 430x932 | [before](artifacts/candidate-audit-20261014/before/notifications-430x932.png) | [after](artifacts/candidate-audit-20261014/after/notifications-430x932.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 768x1024 | [before](artifacts/candidate-audit-20261014/before/notifications-768x1024.png) | [after](artifacts/candidate-audit-20261014/after/notifications-768x1024.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 1024x768 | [before](artifacts/candidate-audit-20261014/before/notifications-1024x768.png) | [after](artifacts/candidate-audit-20261014/after/notifications-1024x768.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 1366x768 | [before](artifacts/candidate-audit-20261014/before/notifications-1366x768.png) | [after](artifacts/candidate-audit-20261014/after/notifications-1366x768.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 1440x900 | [before](artifacts/candidate-audit-20261014/before/notifications-1440x900.png) | [after](artifacts/candidate-audit-20261014/after/notifications-1440x900.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |
| 1920x1080 | [before](artifacts/candidate-audit-20261014/before/notifications-1920x1080.png) | [after](artifacts/candidate-audit-20261014/after/notifications-1920x1080.png) | Loaded synthetic long-title/unbroken-message rows; before clipping / after wrapping |

## Template normal-fixture captures and output samples

1024×1000 browser viewport, full-page screenshots. PDFs are Chromium print of the fixture lab; DOCX uses the real generator directly. These are not HTTP downloads. Four fixtures per variant are recorded in [template-manifest.json](docs/candidate-audit/template-manifest.json).

| Variant | Screenshot | PDF | DOCX |
|---|---|---|---|
| Cv1 | [PNG](artifacts/candidate-audit-20261014/templates/Cv1.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv1.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv1.docx) |
| Cv2 | [PNG](artifacts/candidate-audit-20261014/templates/Cv2.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv2.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv2.docx) |
| Cv3 | [PNG](artifacts/candidate-audit-20261014/templates/Cv3.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv3.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv3.docx) |
| Cv4 | [PNG](artifacts/candidate-audit-20261014/templates/Cv4.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv4.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv4.docx) |
| Cv5 | [PNG](artifacts/candidate-audit-20261014/templates/Cv5.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv5.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv5.docx) |
| Cv6 | [PNG](artifacts/candidate-audit-20261014/templates/Cv6.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv6.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv6.docx) |
| Cv7 | [PNG](artifacts/candidate-audit-20261014/templates/Cv7.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv7.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv7.docx) |
| Cv8 | [PNG](artifacts/candidate-audit-20261014/templates/Cv8.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv8.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv8.docx) |
| Cv9 | [PNG](artifacts/candidate-audit-20261014/templates/Cv9.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv9.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv9.docx) |
| Cv10 | [PNG](artifacts/candidate-audit-20261014/templates/Cv10.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv10.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv10.docx) |
| Cv11 | [PNG](artifacts/candidate-audit-20261014/templates/Cv11.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv11.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv11.docx) |
| Cv12 | [PNG](artifacts/candidate-audit-20261014/templates/Cv12.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv12.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv12.docx) |
| Cv13 | [PNG](artifacts/candidate-audit-20261014/templates/Cv13.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv13.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv13.docx) |
| Cv14 | [PNG](artifacts/candidate-audit-20261014/templates/Cv14.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv14.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv14.docx) |
| Cv15 | [PNG](artifacts/candidate-audit-20261014/templates/Cv15.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv15.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv15.docx) |
| Cv16 | [PNG](artifacts/candidate-audit-20261014/templates/Cv16.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv16.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv16.docx) |
| Cv17 | [PNG](artifacts/candidate-audit-20261014/templates/Cv17.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv17.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv17.docx) |
| Cv18 | [PNG](artifacts/candidate-audit-20261014/templates/Cv18.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv18.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv18.docx) |
| Cv19 | [PNG](artifacts/candidate-audit-20261014/templates/Cv19.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv19.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv19.docx) |
| Cv20 | [PNG](artifacts/candidate-audit-20261014/templates/Cv20.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv20.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv20.docx) |
| Cv21 | [PNG](artifacts/candidate-audit-20261014/templates/Cv21.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv21.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv21.docx) |
| Cv22 | [PNG](artifacts/candidate-audit-20261014/templates/Cv22.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv22.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv22.docx) |
| Cv23 | [PNG](artifacts/candidate-audit-20261014/templates/Cv23.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv23.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv23.docx) |
| Cv24 | [PNG](artifacts/candidate-audit-20261014/templates/Cv24.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv24.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv24.docx) |
| Cv25 | [PNG](artifacts/candidate-audit-20261014/templates/Cv25.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv25.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv25.docx) |
| Cv26 | [PNG](artifacts/candidate-audit-20261014/templates/Cv26.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv26.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv26.docx) |
| Cv27 | [PNG](artifacts/candidate-audit-20261014/templates/Cv27.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv27.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv27.docx) |
| Cv28 | [PNG](artifacts/candidate-audit-20261014/templates/Cv28.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv28.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv28.docx) |
| Cv29 | [PNG](artifacts/candidate-audit-20261014/templates/Cv29.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv29.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv29.docx) |
| Cv30 | [PNG](artifacts/candidate-audit-20261014/templates/Cv30.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv30.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv30.docx) |
| Cv31 | [PNG](artifacts/candidate-audit-20261014/templates/Cv31.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv31.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv31.docx) |
| Cv32 | [PNG](artifacts/candidate-audit-20261014/templates/Cv32.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv32.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv32.docx) |
| Cv33 | [PNG](artifacts/candidate-audit-20261014/templates/Cv33.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv33.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv33.docx) |
| Cv34 | [PNG](artifacts/candidate-audit-20261014/templates/Cv34.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv34.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv34.docx) |
| Cv35 | [PNG](artifacts/candidate-audit-20261014/templates/Cv35.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv35.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv35.docx) |
| Cv36 | [PNG](artifacts/candidate-audit-20261014/templates/Cv36.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv36.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv36.docx) |
| Cv37 | [PNG](artifacts/candidate-audit-20261014/templates/Cv37.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv37.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv37.docx) |
| Cv38 | [PNG](artifacts/candidate-audit-20261014/templates/Cv38.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv38.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv38.docx) |
| Cv39 | [PNG](artifacts/candidate-audit-20261014/templates/Cv39.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv39.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv39.docx) |
| Cv40 | [PNG](artifacts/candidate-audit-20261014/templates/Cv40.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv40.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv40.docx) |
| Cv41 | [PNG](artifacts/candidate-audit-20261014/templates/Cv41.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv41.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv41.docx) |
| Cv42 | [PNG](artifacts/candidate-audit-20261014/templates/Cv42.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv42.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv42.docx) |
| Cv43 | [PNG](artifacts/candidate-audit-20261014/templates/Cv43.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv43.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv43.docx) |
| Cv44 | [PNG](artifacts/candidate-audit-20261014/templates/Cv44.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv44.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv44.docx) |
| Cv45 | [PNG](artifacts/candidate-audit-20261014/templates/Cv45.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv45.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv45.docx) |
| Cv46 | [PNG](artifacts/candidate-audit-20261014/templates/Cv46.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv46.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv46.docx) |
| Cv47 | [PNG](artifacts/candidate-audit-20261014/templates/Cv47.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv47.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv47.docx) |
| Cv48 | [PNG](artifacts/candidate-audit-20261014/templates/Cv48.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv48.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv48.docx) |
| Cv49 | [PNG](artifacts/candidate-audit-20261014/templates/Cv49.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv49.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv49.docx) |
| Cv50 | [PNG](artifacts/candidate-audit-20261014/templates/Cv50.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv50.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv50.docx) |
| Cv51 | [PNG](artifacts/candidate-audit-20261014/templates/Cv51.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cv51.pdf) | [DOCX](artifacts/candidate-audit-20261014/templates/Cv51.docx) |
| Cover1 | [PNG](artifacts/candidate-audit-20261014/templates/Cover1.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cover1.pdf) | Not generated; cover-specific DOCX contract unverified |
| Cover2 | [PNG](artifacts/candidate-audit-20261014/templates/Cover2.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cover2.pdf) | Not generated; cover-specific DOCX contract unverified |
| Cover3 | [PNG](artifacts/candidate-audit-20261014/templates/Cover3.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cover3.pdf) | Not generated; cover-specific DOCX contract unverified |
| Cover4 | [PNG](artifacts/candidate-audit-20261014/templates/Cover4.png) | [PDF](artifacts/candidate-audit-20261014/templates/Cover4.pdf) | Not generated; cover-specific DOCX contract unverified |

## Final notification traces

Each trace contains synthetic inputs/network fixtures and real DOM snapshots. Open with `npx playwright show-trace <path>`. No actual bearer tokens or user data were used.

- [strict-mode-load](artifacts/candidate-audit-20261014/after/strict-mode-load.zip) — PASS
- [row-write-blocks-bulk-and-deduplicates](artifacts/candidate-audit-20261014/after/row-write-blocks-bulk-and-deduplicates.zip) — PASS
- [bulk-write-blocks-row-and-toast-contract](artifacts/candidate-audit-20261014/after/bulk-write-blocks-row-and-toast-contract.zip) — PASS
- [unmounted-bulk-does-not-toast](artifacts/candidate-audit-20261014/after/unmounted-bulk-does-not-toast.zip) — PASS
- [row-401-rollback-retry](artifacts/candidate-audit-20261014/after/row-401-rollback-retry.zip) — PASS
- [row-403-rollback-retry](artifacts/candidate-audit-20261014/after/row-403-rollback-retry.zip) — PASS
- [row-429-rollback-retry](artifacts/candidate-audit-20261014/after/row-429-rollback-retry.zip) — PASS
- [row-500-rollback-retry](artifacts/candidate-audit-20261014/after/row-500-rollback-retry.zip) — PASS
- [bulk-rollback-retry](artifacts/candidate-audit-20261014/after/bulk-rollback-retry.zip) — PASS
- [load-error-retry](artifacts/candidate-audit-20261014/after/load-error-retry.zip) — PASS
- [malformed-load-is-not-empty-success](artifacts/candidate-audit-20261014/after/malformed-load-is-not-empty-success.zip) — PASS
- [responsive-320x568](artifacts/candidate-audit-20261014/after/responsive-320x568.zip) — PASS
- [responsive-375x812](artifacts/candidate-audit-20261014/after/responsive-375x812.zip) — PASS
- [responsive-430x932](artifacts/candidate-audit-20261014/after/responsive-430x932.zip) — PASS
- [responsive-768x1024](artifacts/candidate-audit-20261014/after/responsive-768x1024.zip) — PASS
- [responsive-1024x768](artifacts/candidate-audit-20261014/after/responsive-1024x768.zip) — PASS
- [responsive-1366x768](artifacts/candidate-audit-20261014/after/responsive-1366x768.zip) — PASS
- [responsive-1440x900](artifacts/candidate-audit-20261014/after/responsive-1440x900.zip) — PASS
- [responsive-1920x1080](artifacts/candidate-audit-20261014/after/responsive-1920x1080.zip) — PASS
- [automated-accessibility-and-keyboard](artifacts/candidate-audit-20261014/after/automated-accessibility-and-keyboard.zip) — PASS

## Support ticket dialog component evidence

These are real Chromium captures from the isolated Support Center component harness. Data/API behavior is **SIMULATED**; the authenticated candidate route and ticket persistence were not exercised. The companion `results.json` records the viewport measurements and interaction checks.

| Viewport | Capture | State |
|---|---|---|
| 320x568 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-320x568.png) | Ticket dialog open; internal scroll available |
| 375x812 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-375x812.png) | Ticket dialog open |
| 430x932 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-430x932.png) | Ticket dialog open |
| 768x1024 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-768x1024.png) | Ticket dialog open |
| 1024x768 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-1024x768.png) | Ticket dialog open |
| 1366x768 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-1366x768.png) | Ticket dialog open |
| 1440x900 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-1440x900.png) | Ticket dialog open |
| 1920x1080 | [PNG](artifacts/ui-ux-audit/support/after/support-modal-1920x1080.png) | Ticket dialog open |

Results: `artifacts/ui-ux-audit/support/after/results.json`; axe output: `artifacts/ui-ux-audit/support/after/axe-modal.json`. Browser run: six named scenarios passed, all eight viewport assertions passed, no uncaught page errors. Static dialog/FAQ tests: 3/3. These do not establish authenticated route or backend behavior.

## Dashboard overview after removing the default assistant rail

The previous overview redesign mounted `CandidateExecutiveRail` in the right column by default; the “Live” badge was static text. The current overview omits that rail and uses the full-width dashboard workspace. XAMPP captures use illustrative/mock API data and a synthetic identity, so they are not authenticated user evidence. The manifest records assistant text/rail absent, axe 0, no uncaught page errors, and eight unmatched API requests returning 401.

| Viewport | Capture |
|---|---|
| 320x568 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-320x568.png) |
| 375x812 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-375x812.png) |
| 430x932 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-430x932.png) |
| 768x1024 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-768x1024.png) |
| 1024x768 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-1024x768.png) |
| 1366x768 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-1366x768.png) |
| 1440x900 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-1440x900.png) |
| 1920x1080 | [PNG](artifacts/ui-ux-audit/dashboard-no-assistant/dashboard-1920x1080.png) |

Manifest: `artifacts/ui-ux-audit/dashboard-no-assistant/dir090-capture-manifest.json`.

## Resumes hub and preview journey

`tests/resumes-hub-browser.mjs` produces eight gallery captures and `results.json`; `tests/resume-preview-journey-browser.mjs` produces the selected-resume preview and heading-step journey captures. These use simulated APIs/data in local Chromium. The gallery run passed 10/10 scenarios, including zero axe violations and all eight responsive layouts; the journey run passed 24/24 checks, including bounded outer scrolling in both shell variants. They do not establish live save/export/share behavior.

## Evidence limitations and review

- All remaining historical pages and their material states lack required before/after browser evidence in this execution. They remain unverified.
- Notification 320px and Cv1 screenshots were manually inspected; generation of the other images is not an independent manual visual sign-off.
- Missing Telugu/CJK glyphs are visible; font coverage is not certified by Unicode text presence.
- Initial template cleanup failure and later concurrent Cover4 failure are retained in logs/manifests. The original Cover4 run predates failure-screenshot diagnostics; no screenshot of that failure is claimed.
- Axe results: `after/axe.json`, one normal fixture. Not a full WCAG review.
- Evidence integrity script verifies file existence/size/SHA; it does not decide product quality. Independent Lead approval remains unavailable.
