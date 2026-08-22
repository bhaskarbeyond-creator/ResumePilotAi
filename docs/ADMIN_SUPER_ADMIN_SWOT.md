# Admin & Super Admin SWOT Analysis

## Strengths
- **Isolated Control Plane**: The `/adm` boundary is explicitly separated from the multi-tenant `/enterprise` boundary, ensuring tenant impersonation vulnerabilities are structurally impossible.
- **Strict Role Boundaries**: Firebase Custom Claims correctly partition `Admin` vs `Super Admin` privileges at the network layer.
- **Surgical Re-Auth**: Destructive API endpoints effectively utilize `auth_time` age constraints, forcing TOTP/password challenges strictly when necessary, reducing fatigue while maintaining security.
- **E2E Playwright Coverage**: E2E tests structurally prove viewport responsive constraints and routing access logic.

## Weaknesses
- **Monolithic Firebase Dependency**: Global health relies entirely on Firebase/Firestore uptime.
- **Local Sandbox Limitations**: Execution and deployment procedures are heavily reliant on manual infrastructure (Hostinger/PM2). The lack of automated GitHub Actions (CI/CD) makes "Production Verification" dependent on manual operator checklists.
- **Data Deletion Cascades**: "Decommissioning" a tenant physically drops records via Cloud Functions, making granular rollback of a specific tenant extremely difficult without full snapshots.

## Opportunities
- **Serverless Migration**: Transitioning PM2 backend services into Google Cloud Run or Firebase Functions for true elastic scaling and zero-downtime automated deployments.
- **Infrastructure-as-Code (IaC)**: Terraform or Pulumi could codify the deployment pipeline, removing the "live production deployment gap".
- **Advanced Telemetry**: Implementing Datadog or Sentry into the Admin Dashboard for proactive alerts rather than reactive `healthz` checks.

## Threats
- **Deployment Human Error**: Without an automated rollback/deployment script, deploying a broken commit to PM2 requires manual SSH intervention, elongating MTTR (Mean Time To Recovery).
- **Rate Limit Exhaustion**: A compromised Admin JWT could perform heavy read-queries against `/api/admin/users`, triggering Firestore billing alerts or quota limits.
- **Firebase Emulator Drift**: Local tests pass beautifully on the Firebase Emulator, but edge-case rate limits or CDN (Cloudflare) caching rules on the live domain could yield unexpected 403s.
