# Super Admin `/adm` Flowcharts

**Status:** implementation flow reference. Production execution remains **UNVERIFIED/NO-GO** until the static frontend deployment failure and authenticated live checks are resolved.

## 1. `/adm` entry and authorization

```mermaid
flowchart TD
    A[Browser navigates to /adm/*] --> B{Firebase user present?}
    B -- No --> C[Redirect to login with safe next path]
    B -- Yes --> D[checkIfAdmin / token claims]
    D -- ADMIN or SUPER_ADMIN or wildcard --> E[Render Admin shell]
    D -- Otherwise --> F[Redirect to safe public route]
    E --> G[Header / navigation / command palette]
    G --> H[Module request]
    H --> I[Same-origin bearer token attached]
    I --> J[Express requireAuth checkRevoked]
    J --> K[enforceApiPolicy]
    K --> L[Route-specific permission / SUPER_ADMIN gate]
    L --> M[Service / repository / Firestore]
    M --> N[Sanitized audit event]
    N --> O[Response + refresh UI state]
```

## 2. Tenant provisioning

```mermaid
flowchart TD
    A[SUPER_ADMIN opens Tenant Registry] --> B[GET /api/platform/tenants]
    B --> C[requireAuth + requireSuperAdmin]
    C --> D[TenantService.listPlatformTenants]
    D --> E[Firestore tenant registry]
    E --> F[Render observed table]

    G[Open Provision Tenant dialog] --> H[Client validation: name, immutable slug, tier]
    H --> I[POST /api/platform/tenants]
    I --> J[Recent-auth policy]
    J --> K[requireSuperAdmin]
    K --> L[TenantService.provisionTenant]
    L --> M[Create tenant + default workspace]
    M --> N[security_audit_logs + admin_audit_logs]
    N --> O[201 response]
    O --> P[Refresh registry]
```

## 3. Tenant lifecycle action

```mermaid
flowchart TD
    A[Select suspend/reactivate/decommission] --> B[AdminDialog describes target + impact]
    B --> C[Operator types required phrase]
    C --> D{Exact phrase?}
    D -- No --> E[Confirm disabled]
    D -- Yes --> F[POST lifecycle route]
    F --> G[Recent authentication required]
    G --> H[SUPER_ADMIN route check]
    H --> I[Server re-loads tenant]
    I --> J{Server confirmation exact?}
    J -- No --> K[422 CONFIRMATION_REQUIRED]
    J -- Yes --> L[TenantService lifecycle transition]
    L --> M{Valid state transition?}
    M -- No --> N[409 INVALID_TENANT_LIFECYCLE_TRANSITION]
    M -- Yes --> O[Write security/admin audit]
    O --> P[Refresh registry and show success]
```

Allowed lifecycle graph:

```mermaid
stateDiagram-v2
    [*] --> PROVISIONING
    PROVISIONING --> ACTIVE
    PROVISIONING --> SUSPENDED
    PROVISIONING --> DELETING
    ACTIVE --> SUSPENDED
    ACTIVE --> DELETING
    SUSPENDED --> ACTIVE
    SUSPENDED --> DELETING
    DELETING --> DELETED
```

## 4. Queue replay

```mermaid
flowchart TD
    A[Queue monitor loads] --> B[GET /api/platform/queues]
    B --> C{Firestore telemetry query succeeds?}
    C -- No --> D[503 + UI UNAVAILABLE]
    C -- Yes --> E[Observed queue/DLQ rows]

    F[SUPER_ADMIN selects replay] --> G[Typed confirmation dialog]
    G --> H[POST /api/platform/queues/retry]
    H --> I[Recent-auth + SUPER_ADMIN]
    I --> J{Exactly jobId XOR all?}
    J -- No --> K[400 INVALID_REPLAY_REQUEST]
    J -- Yes --> L{Target is DLQ?}
    L -- No --> M[409 JOB_NOT_DEAD_LETTER]
    L -- Yes --> N[Requeue one or bounded 20 jobs]
    N --> O[Audit event]
    O --> P[Refresh observed queue state]
```

## 5. Generic user mutation safety

```mermaid
flowchart TD
    A[Users manager / controlled editor] --> B[Single requested field transition]
    B --> C[PATCH /api/admin/users/:uid]
    C --> D[Admin namespace + verified email]
    D --> E[Load Firebase identity + user profile]
    E --> F{Target role SUPER_ADMIN?}
    F -- Yes --> G[403 SUPER_ADMIN_TARGET_PROTECTED]
    F -- No --> H{Exactly one allowed mutation?}
    H -- No --> I[400]
    H -- Yes --> J{Caller has field permission?}
    J -- No --> K[403]
    J -- Yes --> L[Check stale precondition]
    L --> M{Current state matches?}
    M -- No --> N[409 ADMIN_TARGET_CHANGED]
    M -- Yes --> O[Auth update / token revocation as needed]
    O --> P[Firestore profile + security audit transaction]
    P --> Q[UI refreshes server state]
```

## 6. Phrase library CRUD

```mermaid
flowchart TD
    A[Phrase Library] --> B[GET /api/admin/phrases]
    B --> C[Admin policy gate]
    C --> D[Server reads categories collection]
    D --> E[Render revisioned categories]
    F[Create category / add phrase] --> G[POST Admin phrase API]
    G --> H[Validate bounded text]
    H --> I[Create or transaction with revision]
    I --> J[Admin audit middleware]
    J --> K[Refresh category state]
    L[Consumer resume form] --> M[GET /public/phrases.json]
    M --> N[Curated read-only phrase projection]
```

## 7. Recent-auth recovery

```mermaid
sequenceDiagram
    participant UI as Admin UI
    participant API as Express policy
    participant Auth as Firebase Auth

    UI->>API: Sensitive mutation + bearer
    API-->>UI: 403 RECENT_AUTH_REQUIRED
    UI->>UI: Open AdminDialog reauthentication prompt
    UI->>Auth: Reauthenticate current identity
    Auth-->>UI: Fresh ID token
    UI->>API: Retry exact original request once
    API-->>UI: Success or structured failure
```

## 8. Release validation flow

```mermaid
flowchart TD
    A[Clean candidate commit] --> B[npm ci]
    B --> C[lint / build / product / backend / enterprise / security]
    C --> D[Authenticated local browser suite]
    D --> E[Inspect screenshots, console, network]
    E --> F[Create readable remote backup]
    F --> G[Deploy exact candidate SHA]
    G --> H[Restart PM2 safely]
    H --> I[Verify static SPA: /, /adm, /enterprise]
    I --> J[Verify API health / readiness / deployed SHA]
    J --> K[Authenticate real SUPER_ADMIN]
    K --> L[Run disposable CRUD + audit + denial tests]
    L --> M[Clean test records]
    M --> N[Independent re-audit]
    N --> O{All gates pass?}
    O -- No --> P[NO-GO: RCA → fix → retest]
    O -- Yes --> Q[GO]
```
