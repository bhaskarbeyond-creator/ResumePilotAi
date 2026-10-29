# Eleven reported wrong-URL contract shapes — disposition

Historical source: `developer-review/Evidence/artifacts/m8-contract-gap-revalidation.json` at audit revision `8fce71518d1dc957c3c8cefa9867445edb35f438`; implementation baseline `0512c0cfbca7a2fd6a3911e65b72621385f9b10f`. Historical equivalent is a lead, not a verified semantic equivalence. All browser/database verification remains blocked.

| Original client shape | Historical client sites | Historical proposed counterpart | Current disposition |
|---|---|---|---|
| `/admin/employer-applications/{X}/verify` | `frontend/src/components/admin/AdminModerationTab.tsx:152`, `frontend/src/components/admin/AdminModerationTab.tsx:167` | `PATCH /admin/employer-applications/{X}` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/admin/jobs/{X}/moderate` | `frontend/src/components/admin/AdminModerationTab.tsx:184` | `PATCH /admin/jobs/{X}` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/admin/queues` | `frontend/src/components/admin/AdminQueuesTab.tsx:138` | `GET /platform/queues` | IMPLEMENTED — NOT VERIFIED: use GET /platform/queues, validate sampled response; unit parser passes; browser/database blocked |
| `/admin/queues/dead-letter-queue/retry` | `frontend/src/components/admin/AdminQueuesTab.tsx:186`, `frontend/src/components/admin/AdminQueuesTab.tsx:262` | `POST /platform/queues/retry` | IMPLEMENTED — NOT VERIFIED: single notification dead-letter retry via /platform/queues/retry; browser/database/auth blocked |
| `/admin/queues/{X}/retry` | `frontend/src/components/admin/AdminQueuesTab.tsx:173` | `POST /platform/queues/retry` | IMPLEMENTED — NOT VERIFIED: unsupported queue-wide retry removed; single-job retry only; browser/database/auth blocked |
| `/admin/users/{X}/status` | `frontend/src/components/admin/AdminUsersTab.tsx:206` | `PATCH /admin/users/{X}` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/billing/validate-coupon` | `frontend/src/pages/billing/checkout-modal.tsx:246` | `POST /coupons/validate` | IMPLEMENTED — NOT VERIFIED: exact registered POST, strict server response parser; mocked unit test passes; browser/database blocked |
| `/blog/posts` | `frontend/src/components/admin/AdminBlogManagementTab.tsx:97`, `frontend/src/pages/blog/editor.tsx:149`, `frontend/src/pages/blog/index.tsx:46` | `GET /blog-data` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/blog/posts/{X}` | `frontend/src/components/admin/AdminBlogManagementTab.tsx:126`, `frontend/src/pages/blog/editor.tsx:91`, `frontend/src/pages/blog/editor.tsx:147` | `GET /blog-data/{X} | DELETE /blog-data/{X}` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/jobs` | `frontend/src/pages/jobs/portal.tsx:74` | `GET /jobs-data` | NOT STARTED — inspect method, schema, permissions and errors before correction |
| `/platform/status` | `frontend/src/lib/enterprise-api.ts:528` | `GET /admin/platform/status` | NOT STARTED — inspect method, schema, permissions and errors before correction |

`/admin/queues/dead-letter-queue/purge` is a separate missing-operation/false-success item: the queue replacement removes the UI action rather than treating the deliberately retired `POST /platform/queues/purge` (410) as a successful purge. All uninvestigated counterparts retain their original status; this is not a claim that their auth, request or response contract has been verified.
