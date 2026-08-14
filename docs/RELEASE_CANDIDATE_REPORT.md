# Release candidate report

Date: 2026-08-15

## Consolidated local result

`npm run test:rc` completed successfully:

- Product, cross-module, forensic and AI-settings suites: 89/89
- Template render suite: 1/1
- Security/static: 22/22
- Backend security/integration: 75/75
- Dedicated AI settings command: 12/12
- Explicit template command: 8/8
- Production build: passed in 3.87 seconds
- ESLint: 0 errors, 479 warnings
- Root lockfile dry-run consistency: passed
- Backend lockfile dry-run consistency: passed
- Root production and full dependency audits: 0 vulnerabilities
- Backend production and full dependency audits: 0 vulnerabilities
- Firebase emulator: NOT EXECUTED — Java unavailable
- Browser/live PDF: NOT EXECUTED — Chromium and authenticated staging fixtures unavailable

## Release engineering changes

- Added consolidated RC runner with explicit PASS/FAIL/NOT_EXECUTED reporting.
- Added static cross-module journey contracts for new-user, billing, private/public content, and account deletion boundaries.
- Added public-route SEO metadata, private-route noindex, robots exclusions, static sitemap, and explicit unknown-route UI.
- Added route-change keyboard focus restoration.
- Added truthful `/readyz`; unprobed external services report `NOT_CHECKED`.
- Removed browser-side cross-account discovery/merge attempts and checkout identity recovery from local storage.
- Removed fabricated Resume validation, Naukri listings, featured employers, match percentages and notification business facts.
- Removed browser production `console.log` data output and added a regression inventory.
- Restored indexed employer-job/application ordering and removed collection-sampling diagnostics.
- Centralized account-scoped legacy browser-state cleanup on every Firebase sign-out.
- Preserved the no-authenticated-offline-cache decision and documented its privacy rationale.
- Changed 15 non-English locale payloads from eager bundling to on-demand loading. Initial i18n JavaScript fell from 1,394.35 kB (403.70 kB gzip) to 116.42 kB (36.80 kB gzip), a 91.7% raw and 90.9% gzip reduction.

## Cross-module journey evidence

The local deterministic suite verifies architecture and state contracts across:

- Firebase session → Profile revision → Resume conflict → AI same-origin API → Portfolio conflict → logout cleanup.
- Plan/order identifiers → provider order record → verified activation → entitlement → authoritative ledger → ACTIVE-only refund.
- Resume/Portfolio explicit publication and CMS approved-only visibility.
- Account export → deletion confirmation → partial-cleanup reporting → public data cleanup → retained ledger disclosure → sign-out on confirmed success.

These tests do not substitute for browser/provider staging journeys. See `docs/RELEASE_CANDIDATE_MATRIX.md`.

## Remaining release gates

All remaining gates require staging, production infrastructure, legal/business decisions, or independent testing:

- Firebase rules emulator and deployed index/rule validation.
- Identity Platform MFA/OAuth/email/password journeys.
- Five payment-provider sandboxes and webhook/refund reconciliation.
- SMTP/IMAP/Twilio delivery.
- Authenticated browser accessibility and Journeys A–G.
- Live PDF/download/popup behavior.
- Dynamic sitemap and deployed HTTP 404/canonical redirects.
- Workload Identity, Secret Manager, distributed limiting, monitoring/alerts, backups/restore, topology and capacity.
- Legal review of invoices/GST/SAC and retention/erasure policy.
- Independent accessibility, privacy and penetration testing.
