# Candidate responsive test matrix — 2026-10-14

Real Chromium; synthetic notification data and simulated HTTP; actual production component/client/styles. Not the authenticated candidate shell. Counts below are **notification viewport cases**, not whole-workspace coverage. Baseline document-width assertions passed 8/8 but screenshot review exposed internal clipping; after-fix assertions additionally measure message span scrollWidth/clientWidth. No before-score inflation from that weak initial assertion.

| Viewport | Before screenshot | After screenshot | Layout + filter/read workflow | Zoom / touch hardware / full shell |
|---|---|---|---|---|
| 320x568 | `before/notifications-320x568.png` | `after/notifications-320x568.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 375x812 | `before/notifications-375x812.png` | `after/notifications-375x812.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 430x932 | `before/notifications-430x932.png` | `after/notifications-430x932.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 768x1024 | `before/notifications-768x1024.png` | `after/notifications-768x1024.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1024x768 | `before/notifications-1024x768.png` | `after/notifications-1024x768.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1366x768 | `before/notifications-1366x768.png` | `after/notifications-1366x768.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1440x900 | `before/notifications-1440x900.png` | `after/notifications-1440x900.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |
| 1920x1080 | `before/notifications-1920x1080.png` | `after/notifications-1920x1080.png` | PASS: document and message width, filter, toggle removes unread row | UNVERIFIED |

Paths relative to `artifacts/candidate-audit-20261014/`. 8/8 post-fix cases pass; baseline 320px screenshot shows clipping. Row/filter targets now 44 CSS px; the entire workspace target-size audit is not complete. Title truncation is intentional; full title remains in button accessible label, but a dedicated long-title reading affordance needs usability review.

All other 92 originally numbered entries × eight viewports = **736 unverified page/viewport combinations** in the requested matrix (aliases are retained in this bookkeeping denominator). Their template-lab 1024×1000 captures are supplementary and do not meet the requested eight-viewport matrix. Additional discovered states/routes are not included in 736; their denominator is not finalized. Notification full-shell states and loading/error visuals at every viewport are also not certified.

Accessibility sample: axe WCAG2A/AA + 2.1AA tags, zero violations in one normal notification fixture; keyboard focus/Enter exercised on unread filter. Screen readers, 200%/400% zoom, modal focus, all theme states and performance/Web Vitals remain unverified.
