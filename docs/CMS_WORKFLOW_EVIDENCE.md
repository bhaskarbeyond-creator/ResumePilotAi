# CMS lifecycle evidence

Validated against branch `arena/019ffe7b-resumepilotai`. The authoritative article collection remains `blog_posts`; custom pages retain their historical `pages` collection and `/p/{slug}` URLs.

## Legacy custom pages

Legacy documents without a status remain publicly readable during non-destructive migration. New and migrated pages use explicit `draft`, `published`, or `unpublished` state and monotonic revisions. Admin create/edit/publish/unpublish/delete operations are validated, revision-checked, and audited; browser writes are denied. Active content is rejected at write time while `sanitizePublicHtml` remains mandatory at render time. Missing and private pages intentionally share a client-side 404 to avoid leaking private existence; deployment edge HTTP status remains externally unverified.

## Blog moderation and scheduling

Author draft and review-submission writes retain the established `blog_posts` model and owner-only Firestore rules. Admin moderation, schedule, unpublish, and delete actions now cross recent-authenticated backend routes with revision checks, explicit transitions, per-event author notifications, and audit records. Scheduled publication remains a trusted transaction: concurrent scheduler instances re-read each candidate, publish a revision once, clear the schedule, and create one deterministic in-app event. Public direct-slug failures reset metadata to `noindex`; list requests reject stale responses after filter/page changes.

## Public discovery support

Blog category creation/edit/delete now uses recent-authenticated, revisioned, audited backend routes with transactional slug uniqueness and dependent-post deletion checks. Trusted By public discovery uses a no-store published-only projection while Admin receives the full revisioned list through its protected API; legacy items without a `published` field remain visible during migration. Missing Portfolio metadata is reset to `noindex`, and shared Resume routes remain intentionally excluded from indexing.

## Historical behavior checked

The reachable pre-phase implementation and grafted baseline were inspected in `BlogEditor.jsx`, `BlogPost.jsx`, `BlogList.jsx`, `BlogManagement.jsx`, `dbOperations.js`, both deployed-rule copies, and backend route policy.

| Lifecycle area | OLD / pre-phase behavior | CURRENT / intended behavior |
|---|---|---|
| Creation | The UI called a pending post a draft; there was no private draft state. | New posts start at revision 1. **Save draft** writes private `draft`; **Submit for review** writes `pending`. |
| Editing | Updates used read-then-write operations without a revision precondition. | Update and delete use Firestore transactions and expected revisions. Authors can mutate only owned `draft`, `pending`, or `rejected` records. |
| Conflict handling | A stale tab could overwrite a newer post. | Autosave pauses on `BLOG_CONFLICT`, retains the local editor state in memory, and offers explicit load-latest or overwrite-latest recovery. |
| Preview | Draft preview navigated to an approved-only public route and failed. | Draft and moderation previews render in a labelled modal through the existing rich-text sanitizer; no private post becomes publicly readable. |
| Moderation | Bulk operations treated resolved `{success:false}` results as success. Status handling omitted draft/scheduled states. | Row and bulk actions pass expected revisions, inspect every result, refresh after partial/stale failure, and give truthful status. Publication, rejection, unpublication, deletion, and schedule changes require explicit interaction. |
| Scheduling | No schedule model or processor existed. | Admins choose a future timestamp in an accessible confirmation dialog. Only the trusted backend publishes due posts. The processor is transactional, idempotent under concurrent workers, revisioned, bounded to 100 candidates, and audited. |
| Publication | Public queries selected approved records, but direct SDK writes were weakly bounded. | Public reads remain approved-only. Rules constrain allowed fields, sizes, ownership, immutable fields, revision `+1`, publication timestamps, schedule timestamps, and author/admin transitions. |
| Slugs | Creation and approval could leave collisions ambiguous. | Creation derives a document-suffixed slug. Approval/scheduling detects collisions and replaces a conflicting slug with a document-ID-qualified slug before publication. |
| SEO | Public description/canonical/Open Graph existed only partially and had no author controls. | The editor exposes bounded SEO title/description. Public posts set canonical, Open Graph, Twitter, `index,follow`, and escaped BlogPosting JSON-LD metadata. Drafts have no public/indexable route. |
| Images | The CMS accepts URLs, not binary uploads; some previews/cards rendered raw stored URLs. | Editor, admin preview, cards, and public articles sanitize image URLs. Persistence accepts bounded HTTPS or same-origin paths and strips unsafe publication images. No CMS binary upload/storage path was added. |

## Canonical lifecycle

1. An authenticated author creates a revision-1 private draft in `blog_posts`.
2. Draft saves may contain incomplete content; review submission requires title, category, and meaningful content.
3. Existing editable drafts autosave after three seconds. Saving and deletion include the loaded revision.
4. A conflict never reports success or silently overwrites. Autosave pauses until the author chooses a recovery action.
5. `pending` records are private to the author and administrators.
6. Administrators may approve immediately, schedule a future publication, reject/return for revision, unpublish, cancel a schedule, or delete with stale-revision checks.
7. Approved posts alone are returned by public list/slug queries. Unpublication changes status to `rejected`, keeping the record private and author-revisable.
8. Scheduled posts are processed by `publishDueBlogPosts` from the backend. Set `CMS_SCHEDULER_ENABLED=true` on a trusted backend process; `CMS_SCHEDULER_INTERVAL_MS` defaults to five minutes and is bounded from one minute to one hour. An authenticated admin can also invoke `POST /api/admin/blog/publish-due`.

## Data and security controls

- Status allowlist: `draft`, `pending`, `approved`, `rejected`, `scheduled`.
- Canonical fields are allowlisted in Firestore rules; title/content/excerpt/category/SEO/tags/image/admin-note fields are bounded.
- Authors cannot set approved/scheduled status, publication timestamps, schedules, moderation fields, author identity, creation time, or view count.
- Admin publication requires a publication timestamp and no schedule; scheduling requires a future timestamp and no publication timestamp.
- Revisions must increase by exactly one on all client writes.
- Public rich text still uses `sanitizeBlogHtml`; link/image URL hardening remains centralized in `sanitizeHtml.js`.
- CMS featured media is URL-only. HTTPS and same-origin-relative paths are accepted; active schemes, credentials, protocol-relative URLs, and oversized URLs are rejected by persistence/rendering. Because there is no CMS file upload, there is no new MIME/dimension/storage surface or orphaned upload object to clean up.
- Scheduler audit events use `CMS_SCHEDULED_POSTS_PUBLISHED` and contain actor, count, request ID, and server timestamp, never article content.

## Measured performance changes

These are operation-count reductions rather than synthetic timing claims:

- Editing a post previously scanned up to 100 author posts to find one target. It now performs one owner-authorized document read plus at most six recent sidebar records: worst-case target/sidebar document reads drop from 100 to 7 (93% at the previous cap).
- Admin author enrichment previously performed one user lookup per visible row (up to 20). It now performs one lookup per unique author (`N` lookups becomes `U`, where `U <= N`), preserving output while eliminating duplicate same-page reads.
- Stale async admin loads use a request generation guard, preventing a slower old filter result from replacing a newer result.
- Final production build completed in 3.94 seconds (4.400 seconds wall time in the measured shell invocation); existing dependency/chunk warnings remain non-fatal.

## Validation

- Product suite: 42/42 plus template rendering 1/1.
- CMS workflow unit/static tests: 5/5 (normalization, media, transitions, Firestore-size boundary, revision/sanitization/scheduler architecture).
- Trusted scheduler unit test: 1/1, including due/future selection and repeated-run idempotence.
- Security suite: browser/static 22/22 plus backend 64/64.
- Backend route integration includes ordinary-user rejection for `/api/admin/blog/publish-due`.
- Build: passed in 3.94 seconds; only existing dependency/chunk-size warnings.
- ESLint: 0 errors and 505 existing warnings (no warning increase from the protected Portfolio baseline).
- `git diff --check`: passed.

## Remaining intentional limitations

- Published articles are not edited in place by authors. They are explicitly redirected to the public/moderation flow; a future version can add a separate moderated revision snapshot without mutating public content.
- CMS media is URL-only. Remote MIME type, byte size, and pixel dimensions cannot be attested by the browser. A future upload feature must use an authorized storage path and server-side signature/MIME/size/dimension checks plus lifecycle cleanup; those controls must not be approximated from filename extensions.
- The trusted scheduler is operational only where `CMS_SCHEDULER_ENABLED=true` is configured (or an external trusted caller invokes the protected endpoint). Client clocks and client writes never publish posts.
- Firestore emulator execution is unavailable in this workspace because Java is not installed. The expanded rules test is present but is not represented as executed; deploy-time emulator/CI validation remains required.
- Live Firebase, production scheduler topology, browser automation, and search-engine crawling were not available and are not claimed as certified.
