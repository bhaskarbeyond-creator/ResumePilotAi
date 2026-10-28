# Route Inventory — Active Implementation (`backend/`)

**Discovery method:** `find backend/routes -type f | sort`, then direct read of
`backend/index.js` for `app.use('/api/...', ...)` mount points
(`grep -n "resumesRouter\|app.use('/api" backend/index.js`).

**Scope/exclusions:** This is a **router-module-level** inventory (which file handles
which mount prefix), not a full per-HTTP-verb/per-field endpoint inventory. Mandate §4.1
calls for method/path/middleware/validation/response-schema detail per route; that level
of detail was captured only for `backend/routes/resumes.js` (below) due to time budget —
see `ENVIRONMENT-GAPS.md` EG-006.

**Exhaustiveness statement:** The 20-file list below is exhaustive for
`backend/routes/*.js` (confirmed by `find ... | wc -l` = 20). The mount-point list below
is exhaustive for literal `app.use('/api...'` strings found by grep in `backend/index.js`
— it does **not** rule out additional dynamically constructed route registrations (the
mandate explicitly warns text search is insufficient for dynamic registration — see
Negative Findings note at the end of this file).

## 1. Router modules (`backend/routes/`, 20 files)

| File | Observed in this session |
|---|---|
| `adminAudit.js` | Mounted at `/api/admin` (`adminAuditRouter`), listed in `backend/index.js` |
| `adminPlatformOperations.js` | Mounted at `/api/admin` (`adminPlatformOperationsRouter`) |
| `adminUsers.js` | Mounted at `/api/admin/users` |
| `ai.js` | Referenced as `aiRoutes`, mounted at `/api` |
| `blogData.js` | Mounted at `/api/blog-data` |
| `covers.js` | Mounted at `/api/covers` |
| `databaseAdmin.js` | Mounted at `/api/admin/database-settings` |
| `email.js` | Referenced as `emailRoutes`, mounted at `/api/email` |
| `enterprise.js` | Mounted at `/api/enterprise` (also re-mounted later in file — see Global middleware note below) |
| `enterpriseM2m.js` | Mounted at `/api/enterprise/m2m` (also re-mounted later) |
| `errorResponder.js` | Not a router — exports `replyRepoError` helper, imported by `resumes.js` |
| `jobsData.js` | Mounted at `/api/jobs-data` |
| `miscData.js` | Mounted at `/api` (catch-all style) |
| `notificationsData.js` | Mounted at `/api/notifications-data` |
| `platform.js` | Mounted at `/api/platform` (also re-mounted later) |
| `portfolios.js` | Mounted at `/api/portfolios` |
| `publicDiscovery.js` | Mounted at `/api/public` |
| `resumes.js` | Mounted at `/api/resumes` — detailed below |
| `support.js` | Exports two routers: `supportUserRouter` → `/api/support`, `supportAdminRouter` → `/api/admin/support` |
| `usersData.js` | Mounted at `/api/users-data` |

**Observation (not yet escalated to a discrepancy — recorded for follow-up):** `grep -n`
on `backend/index.js` shows `/api/enterprise/m2m`, `/api/enterprise`, and `/api/platform`
each mounted **twice** (lines ~520-522 and again ~3291-3299), and `/api/admin/support` /
`/api/admin/users` / `/api/admin` mounted once each near line 6925-6927 — a ~6,400-line gap
between the first and second enterprise/platform mount calls. Express allows multiple
`app.use()` calls for the same prefix (later ones simply add more middleware/routes to the
same path), so this is **not automatically a bug**, but it is unusual enough, and the file
large enough (confirmed >7,580 lines — the final catch-all is at line 7580), that a
follow-up audit should confirm the duplicate mounts are intentional layering and not a
copy-paste leftover. **UNVERIFIED — not in `DISCREPANCY-LOG.md`; recommended addition to
`UNVERIFIED-SUSPICIONS.md` in a follow-up pass if time allows (not added in this session
due to budget).**

## 2. Global `/api` middleware chain (order observed in `backend/index.js`, lines ~464-535)

1. CMS-pages retirement responder (returns `410 API_RETIRED` for `/cms-pages*`)
2. Public-path-aware auth gate: `optionalAuth` for allow-listed public paths (defined by
   `isPublicApiPath()`), `requireEnterpriseAuth` for `/enterprise/*`, else `requireAuth`
   for everything else — i.e., **authentication is enforced globally for `/api/*` before
   any router-specific code runs**, not per-router. This is why `resumes.js` itself
   contains no explicit `requireAuth` call yet safely uses `req.user.uid`.
3. Per-tier rate limiting (`publicBrowseLimiter` vs `generalApiLimiter`), keyed by
   `req.user?.uid` falling back to IP (confirmed by inline comment:
   "identityKey() reads req.user?.uid").
4. `enforceApiPolicy` (RBAC/entitlement policy gate), skipped for service principals
   (`req.serviceContext`) and pending support elevations, which are governed by the
   enterprise router's own allowlists instead.
5. Router mounts (table above).
6. A tenant-header rejection gate for legacy (non-enterprise) routes: requests carrying
   `x-tenant-id`/`x-workspace-id` headers against non-tenant-aware paths are rejected
   rather than silently ignored (`backend/index.js` ~line 529 onward).

## 3. Detailed endpoint inventory — `backend/routes/resumes.js` (full file, 256 lines)

| Method | Path (relative to `/api/resumes`) | Tenant/user scoping observed |
|---|---|---|
| `GET` | `/` | `req.repository.getResumes(req.user.uid)` |
| `GET` | `/:id` | `req.repository.getResume(req.user.uid, req.params.id)` |
| (save) | `/:id` | `req.repository.saveResume(req.user.uid, req.params.id, ...)` |
| `DELETE` | `/:id` | `req.repository.deleteResume(req.user.uid, req.params.id)` |
| (publish) | `/:id/publish` (inferred from `publishResume`) | `req.repository.publishResume(req.user.uid, req.params.id, ...)` |
| (unpublish) | `/:id/unpublish` (inferred) | `req.repository.unpublishResume(req.user.uid, req.params.id, ...)` |
| (publication status) | `/:id/publication` (inferred) | `req.repository.getResumePublication(req.user.uid, req.params.id)` |
| `GET` | `/public/:token` (share-token projection) | Uses `verifyShareToken`/`projectPublicResume` from `../security/shareTokens`, not `req.user.uid` (expected — this is the anonymous public-share path, consistent with `isPublicApiPath()`'s regex allow-listing `/resumes/public/...`) |

Every authenticated resume operation consistently scopes data access by
`req.user.uid`, the value populated exclusively by the global `requireAuth` middleware
(step 2 above) from a verified bearer token — this is a positive, verified finding (see
`SWOT-ANALYSIS.md` Security Strengths).

**Not yet detailed to this depth (DEFERRED — follow-up required):** The remaining 19
router files. Recommended order for a follow-up pass, by estimated risk/user-journey
criticality: `ai.js`, `portfolios.js`, `covers.js`, `enterprise.js` /
`enterpriseM2m.js`, `adminUsers.js`, `databaseAdmin.js`, then the rest.

## 4. Non-`backend/routes` API surfaces observed but not inventoried in depth

- `api/index.php`, `api/nvidia.php` (PHP reverse-proxy layer in front of the Node backend,
  per `.htaccess` rewrite rules) — contents not read in this session.
- `backend/freellmapi/` (a second API surface, described by its own directory name as a
  "Free LLM API" / "Claude Code wire endpoints" per `.htaccess` comment
  `# Route /api/* and /v1/* (FreeLLMAPI & Claude Code wire endpoints) through PHP reverse
  proxy`) — not inventoried; see UVS-003.

## Negative-findings statement (mandate §1.3/§4.1)

**What was searched:** Literal `app.use('/api` and `require('./routes/` strings in
`backend/index.js` via `grep -n`.
**What this does NOT establish:** Express supports mounting routers dynamically (e.g.
inside a function called conditionally, or via a loop over a directory). No search for
dynamic route registration patterns (e.g. `fs.readdirSync(...).forEach(... app.use ...)`)
was performed. Therefore, "20 router files, N literal mount points" is accurate for what
was found by direct text search; it is **not** a mathematically exhaustive proof that no
other route is registered by a mechanism this search would miss.
