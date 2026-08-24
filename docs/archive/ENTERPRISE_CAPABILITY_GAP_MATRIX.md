# Enterprise Capability Gap Matrix

| Module | Backend Capability | Frontend Status | Proposed Gap Closure |
|---|---|---|---|
| **Overview** | Read aggregate data | Basic static summary | Implement "Command Center" intelligence: show pending invites, AI usage alerts, active security warnings. |
| **Users / IAM** | CRUD, roles, suspension | Basic list | Add advanced filtering (by Role, Status). Add "Effective Permissions" drawer. Add bulk actions (suspend/resume). |
| **Teams/Workspaces**| Hierarchical access control | Flat list | Visualize tree hierarchy. Make default workspace explicitly clear. |
| **Roles** | RBAC matrix (`/roles-matrix`) | Basic table | Replace walls of checkboxes with categorized sections. Show inherited vs explicit permissions. |
| **AI Admin** | Set provider, quota, model | Basic form | Build modern UI with dynamic model allowlists and real-time provider health testing. |
| **Security** | M2M keys, MFA enforcement | Toggle only | Expand to full "Security Posture" page showing Key Rotation status and MFA compliance. |
| **Audit** | Real-time event log | Basic pagination | Build premium investigation experience: JSON inspector, advanced timeline, direct link from IAM to Audit (actor filter). |
| **Settings** | Lifecycle, Support Grants | Minimal forms | Group into "Organization", "Support", "Danger Zone" with explicit confirmation modals. |

**Intentionally Not Implemented (Documented)**:
- Full Identity Provider (IdP) SSO SAML configuration. (Out of scope for current tier).
