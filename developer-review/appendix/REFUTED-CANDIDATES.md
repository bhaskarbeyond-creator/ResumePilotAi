# Refuted Candidates

Candidates investigated during this audit and disproved by direct evidence. Retained here
per mandate §7.2 so a future developer does not re-investigate the same dead end.

---

## RC-001 — "Database migrations are non-idempotent (`CREATE TABLE` without `IF NOT
EXISTS`)"

**Original suspicion:** An initial coarse search —
`grep -L "IF NOT EXISTS" backend/database/migrations/*.sql | grep -v down.sql | wc -l`
— returned `10`, suggesting 10 migration files might create tables unsafely for re-run
scenarios.

**Disproof method:** The coarse search counted *any* migration file lacking the literal
string `IF NOT EXISTS` anywhere, including migrations that contain no `CREATE TABLE`
statement at all (e.g., pure `ALTER TABLE`/`INSERT` migrations, where `IF NOT EXISTS` is
not the relevant idempotency guard). A precise follow-up query was run:

```
grep -l "CREATE TABLE" backend/database/migrations/*.sql | grep -v down.sql \
  | xargs grep -L "IF NOT EXISTS"
```

This returned **zero** matches — every migration file that contains a `CREATE TABLE`
statement also contains `IF NOT EXISTS`.

**Additional corroborating evidence:** `backend/database/migrationRunner.js#L1-L30` shows
a dedicated runner that discovers migrations by filename pattern
(`/^(\d{3,})_([a-z0-9_]+)\.sql$/`), computes a SHA-256 checksum per file, and tracks
applied versions (a `schema_migrations`-style ledger is implied by the checksum/version
tracking design, consistent with `developer-review/HANDOVER-CLOSURE-2026-10-28.md`'s own
statement that "Migrations 001 through 029 intact ... and fully applied in authoritative
schema ledger (`schema_migrations`)"). A tracked-and-checksummed runner means each
migration is intended to run exactly once regardless of `IF NOT EXISTS` presence, further
reducing the real-world relevance of the original coarse signal.

**Verdict:** REFUTED. No evidence of a non-idempotent `CREATE TABLE` migration was found.
Not promoted to `DISCREPANCY-LOG.md`.

**Confidence in refutation:** High (direct, reproducible grep evidence plus a second,
independent corroborating source).

---

## RC-002 — "`x-tenant-id` / `x-workspace-id` client-supplied headers could allow tenant
authorization bypass on the enterprise M2M path"

**Original suspicion:** `backend/enterprise/enterpriseAuth.js` passes client-supplied
`x-tenant-id`/`x-workspace-id` header values into `authenticateServiceApiKey(...)` as
`requestedTenantId`/`requestedWorkspaceId`, which is the exact pattern the mandate (§6.2)
flags as a common IDOR/tenant-isolation risk ("user-supplied tenant identifiers can
influence authorization decisions").

**Disproof method:** Read the surrounding code comment and function contract directly:

`backend/enterprise/enterpriseAuth.js#L1-L13` (verbatim):
```
*  1. M2M service accounts — authenticate with `x-api-key` only. The key
*     resolves the service account, which pins the tenant and workspace
*     server-side. Client-supplied tenant/workspace values can only RESTRICT
*     (and must match) the key's own tenant/workspace — they can never expand
*     authority.
```

The design, as documented at the call site, derives the authoritative tenant from the
server-side-resolved API key record, and only uses the client-supplied value to
optionally *narrow* scope with an equality check, never to select or expand a tenant.

**Verdict:** NOT REFUTED, but **NOT PROMOTED** to a confirmed defect either —
`UNVERIFIED`/`DEFERRED`, moved to `UNVERIFIED-SUSPICIONS.md` (see UVS-001) rather than
listed here as fully refuted, because this audit did **not** read the implementation of
`authenticateServiceApiKey` itself (inside the tenant service module, not yet opened in
this session) to confirm the comment's claim is actually enforced in code, not just
documented in a comment. A verified comment is not proof of verified behavior.

**Confidence:** Medium (strong, specific code-comment evidence; implementation not yet
traced end-to-end).

---

## RC-003 — "Root-level `src/`/`index.html`/`vite.config.js` tree could be the one actually
served in production (making DISC-001 a live P0/P1, not a P2 hygiene issue)"

**Original suspicion:** Given `.htaccess`'s SPA fallback rule (`RewriteRule ^ index.html
[L]`), it was plausible that the *root* `index.html` (referencing the legacy
`src/main.jsx` tree) is what Apache actually serves, which would make DISC-001 a
live production-correctness defect rather than a dead-code hygiene issue.

**Disproof method:** Traced the actual publish pipeline: `scripts/sync-dist.mjs` (invoked
by `frontend/package.json`'s `"build"` script after `tsc -b && vite build`) copies
`frontend/dist` into a repository-root `dist/` directory, which is the directory Apache's
`DocumentRoot` is documented to point at
(`scripts/sync-dist.mjs` header comment: "Synchronise the modern frontend build
(frontend/dist) into the repository's Apache DocumentRoot directory (dist/)"). The
root-level `index.html` referencing `src/main.jsx` lives at the **repository root**, not
inside `dist/`, and nothing in `scripts/sync-dist.mjs` or `.htaccess` copies or references
it. Apache's `DocumentRoot` (per the sync script's own description) is `dist/`, not the
repository root itself.

**Verdict:** REFUTED as a live production-serving risk. The root tree is dead weight from
a deployment-correctness standpoint (downgrading what could have been a P0/P1 "wrong app
served in production" finding), which is why DISC-001 is logged at P2
(architecture/maintainability), not P0/P1.

**Confidence:** Medium-High — this conclusion rests on the sync script's own documentation
of the Apache `DocumentRoot` target; this audit did not have access to the actual Apache
vhost configuration on any real deployed host to give it Full/High confidence. See
`appendix/ENVIRONMENT-GAPS.md`.
