# Enterprise Dashboard Architecture

## 1. Global Shell
- **Target User**: All Enterprise Users (Admins, IT, Members, Platform Provisioners)
- **Purpose**: Navigation, context switching, command palette, global actions.
- **Available Actions**: Switch Organization, Switch Workspace, Open Command Palette (`⌘K`), Exit Console, Navigate to Module.
- **Data**: Resolved `TenantContext` containing `roles`, `permissions`, `workspaceId`, `tenantId`, `platformAdmin`.
- **Failure States**: Tenant Suspended, MFA Required, Session Expired, Network Error, Tenant Not Found.

## 2. Overview (Command Center)
- **Purpose**: Intelligent high-level summary and recommended actions.
- **Capabilities**: View active workspaces, outstanding invites, AI usage %, active user counts, security warnings.
- **Permissions**: Derived from aggregated read access to other modules.

## 3. Users & IAM
- **Purpose**: Identity and Access Management for the current Tenant.
- **Actions**: Invite User, Resend Invite, Cancel Invite, Suspend Member, Reactivate Member, Remove Member, Edit Roles, View Activity.
- **Permissions**: `tenant.members.read`, `tenant.members.manage`.
- **Backend APIs**: `GET /members`, `POST /invites`, `POST /members/:id/suspend`, etc.

## 4. Teams & Workspaces
- **Purpose**: Organize users and resources within logical boundaries.
- **Actions**: Create Workspace, Rename Workspace, Archive Workspace, Restore Workspace, Create Team, Assign Members.
- **Permissions**: `workspace.read`, `workspace.manage`, `tenant.workspaces.manage`.

## 5. Roles & Permissions
- **Purpose**: Audit and configure RBAC policies.
- **Actions**: View Roles, View Effective Permissions, Compare Roles.
- **Permissions**: `tenant.roles.manage`.

## 6. AI Administration
- **Purpose**: Governance of AI usage, providers, and quotas.
- **Actions**: Set Primary Provider, Set Fallback Provider, Define Model Allowlist, View Usage vs Quota, Test Provider Connection.
- **Permissions**: `tenant.ai.manage`.

## 7. Security & M2M
- **Purpose**: Manage Service Accounts, API keys, encryption settings, and MFA enforcement.
- **Actions**: Create API Key, Revoke API Key, Toggle MFA Enforcement.
- **Permissions**: `tenant.security.read`, `tenant.security.manage`.

## 8. Usage & Quotas
- **Purpose**: Visibility into metered usage.
- **Actions**: View AI tokens used, active users, storage used.
- **Permissions**: `tenant.usage.read`.

## 9. Audit Logs
- **Purpose**: Investigate security and administrative events.
- **Actions**: Filter by Actor/Action/Date, View JSON payload, Export to CSV.
- **Permissions**: `tenant.audit.read`.

## 10. Organization Settings
- **Purpose**: Core tenant metadata and lifecycle management.
- **Actions**: Rename Organization, Change slug, Delete Organization (Danger).
- **Permissions**: `tenant.settings.write`.

## 11. Support Access
- **Purpose**: Break-glass access management.
- **Actions**: Grant Access, Revoke Access, View Grants.
- **Permissions**: `tenant.settings.write`.

## 12. Platform Administration
- **Purpose**: Super-admin registry management.
- **Actions**: View all tenants, Suspend tenant, Reactivate tenant.
- **Permissions**: (Server-derived `isPlatformTenantProvisioner` ONLY. Never client-side).
