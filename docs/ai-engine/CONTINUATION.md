# Continued engineering — 2026-10-22

PR #45 remains draft. This ledger supersedes earlier test/security counts only where new executed evidence is recorded.

## Security checkpoint
- Reproduced all 57 reported backend failures (998 total, 941 pass).
- Critical `proxy-addr@2.0.7` via Express: GHSA-jqcg-44mw-7w3h, incorrect IPv4-mapped short IPv6 subnet trust enables spoofed forwarded IPs. Official advisory retrieved through GitHub API; patched version 2.0.8 installed within Express's compatible range. Current app uses a custom loopback predicate or numeric proxy-hop policy, not that subnet configuration, but vulnerable code is removed rather than waived.
- Added exploit-specific tests for short mapped prefix and forwarded-client spoofing; 2/2 pass.
- Updated compatible transitive patched packages, upgraded Nodemailer to 10.2.0 (24 email/SMTP checks passed), removed dev-only nodemon in favor of Node's built-in `--watch`, and overrode frontend transitive gRPC to patched 1.14.6.
- Backend and frontend `npm audit --omit=dev`: **0 vulnerabilities**, actually executed. No `audit fix --force` or ignored advisory.
- Security + engine tests 30/30 pass. Full regression remains pending after subsequent fixes.

## Execution environment investigation
- GitHub Actions workflow runs are visible and an existing PR workflow is running on a hosted runner. Runner/Actions-permissions administration endpoints return 403; that does not prevent adding normal PR validation jobs.
- Actions log downloads redirect to results-receiver.actions.githubusercontent.com, inaccessible from sandbox; run/job statuses are accessible through api.github.com. Use concise job summaries/check outputs and authorized artifact metadata to distinguish verified results from inaccessible logs.
- Local Docker and MariaDB server executables are absent. Database-dependent failures are not waived; a hosted CI job with disposable database is the feasible validation path under investigation.
