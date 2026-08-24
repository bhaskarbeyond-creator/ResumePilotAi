# Resume builder workflow engineering evidence

Baseline inspected: `5e04b1698fe07754db993a533cdca76e56cbd8e5`  
Historical comparison point: `4a2423175c8954676d39d834cd917a5aabfd2e30`

## Canonical lifecycle

`normalizeResumeData` is the canonical client model. It preserves profile fields, summary, employment, education, skills, languages, projects, certifications, achievements, references, custom sections, section ordering, hidden sections, template, colors, and unknown legitimate extension fields.

The durable owner copy is now:

`users/{uid}/resumes/{resumeId}`

with a monotonic `revision`, `created_at`, and `updatedAt`. The workflow is:

1. Firebase-authenticated user selects or creates an owner-scoped resume.
2. Legacy `pb` data is read once only as a migration fallback.
3. A scoped local recovery envelope protects pending edits and is bound to both UID and resume ID.
4. Builder edits update one canonical state object.
5. An 800 ms coalescing saver serializes writes. Firestore transactions reject stale revisions instead of overwriting them.
6. Save failures remain pending, expose retry, and retain recovery data. Conflicts offer explicit local/remote resolution.
7. Template rendering receives a cloned normalized view model; switching templates changes presentation metadata without dropping canonical sections.
8. Private PDF export reads the authenticated owner document. A 256-bit, one-time, 60-second render token transfers data to the isolated exporter page without publishing it.
9. Public sharing is a separate explicit action that writes a publication snapshot with `publicationMode: explicit`. Revocation immediately blocks anonymous rules and public export.
10. Deletion atomically removes owner data, explicit publication, favorites, and local recovery.

## Historical behavior comparison

| Area | Historical/current baseline | Intended implementation |
|---|---|---|
| Autosave | Every child update scheduled an immediate `pb` write; errors were swallowed and the UI always displayed “Saved”. | Debounced, serialized owner-document writes with truthful pending/saving/saved/error/conflict states and retries. |
| Privacy | Every autosave set `isPublished: true`; all drafts became anonymously readable. | Drafts are private. Only an explicit publish action creates an anonymously readable snapshot. Legacy implicit publications fail closed under rules. |
| Concurrent editing | Last network response won; stale tabs silently overwrote newer data. | Revision-bound transactions reject stale saves and expose recoverable local/remote choices. |
| Local recovery | Full resume and UID were stored in global localStorage keys and could be read after account switching. | Resume content is stored only in a UID/resume-scoped recovery envelope. Global legacy content caches are removed during migration. |
| Creation | Dashboard created an empty document asynchronously, set its ID after a timeout, and could race builder loading. | Builder atomically creates a complete canonical owner document and receives its ID before editing. Profile prefill is normalized into the same model. |
| Template switching | State was reconstructed and skill/colors fields could be changed; templates 21–51 accidentally received Cv1 colors. | Canonical data is retained unchanged; only template and applicable default colors change. Null template palettes remain template-native. |
| Optional data | Builder load reconstructed only six sections, dropping projects, certifications, achievements, references, and custom fields. | All legitimate sections survive load, save, template changes, preview, JSON export, publication, and PDF export. |
| Section entries | Add/edit/delete existed, but final entries could not be removed and there was no keyboard reorder/duplicate path. | Employment, education, skills, and languages support add/edit/delete-to-empty, duplicate, and keyboard-accessible up/down ordering. |
| Section visibility | No functional hide/show persistence. | Hidden section IDs persist and the shared template boundary omits those sections without deleting underlying data. |
| Dashboard duplicate/delete | Duplicate wrote only a public `pb` document; delete did not reliably revoke public access. | Duplicate creates a private owner document. Delete removes owner and public copies together. |
| Dashboard list reads | Count query plus page query, one `pb` read and up to four subcollection reads per visible resume. | Existing count result is reused; canonical resumes require no `pb` or nested section reads. Legacy reconstruction remains available. |
| Export | Private PDF required the resume to be publicly readable by headless Chromium. | Authenticated server reads private data and issues a one-time render token. Public export still requires explicit publication. |
| Share controls | UI copied/opened a URL without publishing and displayed false success. | Publish must succeed first; copy/open errors are reported, and “Stop sharing” revokes access. |

## Measured impact

For a dashboard page of five canonical resumes, the old path performed the all-document count read plus a page query and up to 25 additional `pb`/section reads. The canonical path reuses the existing all-document snapshot and performs zero per-resume enrichment reads. For five total resumes this reduces the list operation from up to 35 document reads to 5; for 20 total resumes it reduces up to 50 reads to 20.

Builder persistence changed from one Firestore write per emitted change to at most one coalesced write after 800 ms, with only one write in flight. Correctness is protected by revisions rather than timing assumptions.

Production chunk size increased modestly because the builder now includes canonical persistence/recovery logic; correctness and removal of repeated network operations were prioritized over a few compressed kilobytes.

## Public snapshot integrity

Publishing now reads the canonical owner draft inside the publication transaction, verifies expected draft and public-snapshot revisions, and records both `sourceRevision` and `publicationRevision`. Private edits do not mutate the public snapshot. Stale publish/unpublish attempts fail instead of replacing a newer public decision. The unused legacy `setJsonPb(..., { isPublished: true })` bypass was removed; legacy saves remain private owner-subcollection writes.

## Security boundaries

- Firestore user-subcollection ownership rules remain authoritative.
- Anonymous `pb` reads require both `isPublished: true` and `publicationMode: explicit`.
- Private export render tokens are random, hashed in memory, one-time, expiring, fragment-delivered, and returned with `Cache-Control: no-store`.
- Export entitlement remains server-authoritative.
- Legacy implicit public snapshots no longer satisfy anonymous read rules.
- Account-scoped recovery prevents data from being restored into another account’s resume.
- Provider keys, AI behavior, MFA, OAuth, payment controls, XSS sanitization, and SSRF restrictions are unchanged except for the verified fix that scopes AI request validation to AI routes only.

## Remaining limitations

- The 51 historical templates have hard-coded visual section layouts. Canonical section order is persisted and the builder workflow order is configurable, but arbitrary visual section reordering inside every template requires a template-by-template presentation contract and is not falsely represented as complete.
- Custom sections are preserved and can be created, but most historical CV templates do not yet render arbitrary custom-section schemas.
- DOCX remains the repository’s pre-existing compatibility payload rather than a true Word renderer.
- Full Playwright PDF/browser comparison remains blocked in this sandbox because the browser binary download failed. Deterministic render, authorization, and token tests do not replace provider/runtime staging validation.
- Firebase Emulator rule tests are present but Java is unavailable in this environment, so emulator execution is not claimed.
