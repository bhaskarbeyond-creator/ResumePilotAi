# Portfolio workflow completion evidence

Baseline: `6f60e117889a013d1f8c7323f3060f49cc5bad4c`

## Implemented behavior

- New portfolios start as private drafts and receive revision `1`.
- Existing drafts autosave after 2.5 seconds through revision-bound Firestore transactions.
- Structural Puck changes commit to state immediately; text edits use the existing short UI debounce.
- Published content and unpublished draft changes remain separate (`data` vs `draftData`).
- Publishing now uses the expected revision and cannot overwrite a newer tab/device revision.
- Conflicts can reload the remote version or preserve local edits as a separate private recovered copy.
- Duplicate creates a private draft, never a public clone.
- Rename is revision-safe. Renaming a published portfolio creates an unpublished draft title and does not silently alter the live page.
- Delete verifies ownership and removes the main/user-reference documents atomically.
- Hide/show publication persists across refresh. First publication through the manager now assigns a slug.
- Account changes clear all portfolio state, IDs, revisions, conflicts, and in-memory data before loading the next account.
- Stale save, load, and publish responses are ignored after an account switch.
- Public rendering uses an immutable, bounded component allowlist and sanitizes text, links, and images.
- Public metadata includes title, description, canonical URL, Open Graph, Twitter cards, robots, and ProfilePage JSON-LD with cleanup on navigation.
- Portfolio view increments are best-effort and deduplicated once per browser session; they are not product or entitlement truth.
- Manage, confirmation, and publish-success surfaces expose dialog semantics, labels, initial focus, and Escape handling.
- Oversized Firestore documents fail before writes with `PORTFOLIO_TOO_LARGE` rather than entering an endless retry loop.

## Data and security properties

- Main documents remain owner-bound through Firestore rules and explicit user-ID checks.
- Public queries require `isPublished == true`; drafts and draft metadata are not returned by public slug queries.
- Provider/API secrets are unrelated to and absent from portfolio payloads.
- External links allow useful HTTPS destinations while active protocols, credentials, protocol-relative URLs, and control-character parser differentials are rejected.
- Images allow HTTPS, same-origin relative paths, and bounded raster data images. SVG data payloads and insecure HTTP are rejected.
- Public component types are allowlisted and nested arrays/objects are bounded to limit pathological rendering payloads.

## Measured/observed behavior

- Existing portfolios issue at most one autosave after the 2.5-second quiet period rather than one write per Puck event.
- Provider-independent sanitization and normalization are pure and complete in milliseconds in deterministic tests, including 200-component and Unicode fixtures.
- Public view counting no longer writes repeatedly during refreshes within one session.

## Intentional limitations

- Portfolio media fields are URL-based. There is no complete first-party media library/upload lifecycle in the existing product, so upload, replacement, and orphan-storage deletion are not represented as complete.
- Puck’s responsive authoring behavior is dependency-controlled; public output is responsive, but full touch drag/drop validation still requires a real browser/device run.
- SEO metadata is client-rendered. Server-side social crawler rendering, sitemap generation, and pre-rendering require deployment-level routing work.
- Legacy portfolios without revisions migrate naturally on their first successful save from revision `0`; no destructive bulk migration is performed.
- Live Firebase/provider/browser validation is not claimed in this sandbox. Firebase Emulator execution remains blocked by missing Java, and Playwright browser installation previously failed.
