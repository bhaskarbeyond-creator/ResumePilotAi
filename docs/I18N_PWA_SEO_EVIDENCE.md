# i18n, PWA and SEO evidence

## i18n

- Existing locale inventory, JSON validity, English-key coverage, interpolation-token parity, fallback behavior, and runtime interpolation are exercised by `tests/i18n.test.mjs`.
- English remains bundled as deterministic fallback; the other 15 locale JSON payloads now load on demand through the i18next backend. The measured initial i18n JavaScript chunk fell from 1,394.35 kB (403.70 kB gzip) to 116.42 kB (36.80 kB gzip), while language-switch tests remained passing.
- `src/main.jsx` updates document `lang`/`dir`, persists only supported language codes, and fails safely when browser storage is unavailable.
- Account language is owner-scoped and revisioned. Applying it calls the existing i18next runtime and does not remount Profile/Resume/Portfolio state.
- A heuristic audit on 2026-08-15 found approximately 3,642 possible English JSX text/attribute occurrences across 209 component files. This includes proper nouns, Admin operational language, template content, and false positives, but confirms the application is not fully key-driven.
- Existing English fallback is preserved rather than inventing translations or changing legal/payment meaning. Completing every locale requires product-approved source copy and professional translation review, especially billing, deletion, privacy, MFA, Admin, and validation language.
- Newly added release-critical semantics are written in clear English and do not modify existing translated keys.

## PWA/offline safety

- The manifest has stable root `id`, `scope`, and `start_url` and remains installable.
- Authenticated offline caching is intentionally disabled. `serviceWorker.register()` is a no-op, startup removes legacy registrations, and no application Cache Storage/IndexedDB data path exists.
- This prevents User A authenticated documents from being served to User B by a service worker.
- Safe offline Resume editing was not added: encryption keys, logout/account-switch revocation, quota/size policy, cross-device conflicts, and recovery UX are not defined. Enabling a generic cache would be a privacy regression.

## SEO

- Stable public routes receive title, description, canonical, Open Graph, and `index,follow` metadata.
- private/authenticated/editor/export/shared/admin routes receive `noindex,nofollow`; robots.txt excludes them.
- Dynamic public Blog and Portfolio pages retain their richer existing canonical/Open Graph/structured data after content loads.
- Unknown routes render an explicit 404 view and receive noindex metadata. Deployment must still verify an actual HTTP 404 status for SPA fallbacks.
- `sitemap.xml` contains stable public routes only. Dynamic published content requires a deployment-backed sitemap generator before search-engine submission.
- Private Resume shares are noindex to avoid metadata-based personal-data exposure.
