# Admin + Super Admin flowcharts

These diagrams describe implemented server contracts. A green UI state is not evidence of a committed mutation; every mutation ends with a read-back or an explicit failure.

## Admin shell and authentication

```mermaid
flowchart TD
  A[Browser /adm or /admin] --> B[RequireAuthenticated]
  B -->|no Firebase user| L[/login with safe next path]
  B -->|user| C[Firebase ID token claims]
  C --> D[checkIfAdmin client hint]
  D -->|not admin| H[redirect home]
  D -->|admin candidate| E[Admin shell]
  E --> F[Server bearer verification checkRevoked]
  F --> G[Permission + verified email policy]
  G -->|403| X[Explicit forbidden state]
  G -->|200| M[Module API]
```

## Super Admin mutation

```mermaid
sequenceDiagram
  participant UI as Admin UI
  participant API as Express API
  participant Auth as Firebase Auth
  participant DB as Firestore
  participant Audit as Audit log

  UI->>API: POST/PATCH/PUT/DELETE + bearer
  API->>Auth: verifyIdToken(token, checkRevoked=true)
  API->>API: requireSuperAdmin + production MFA + auth_time
  alt stale auth
    API-->>UI: 403 RECENT_AUTH_REQUIRED
    UI->>Auth: reauthenticate / refresh token
    UI->>API: retry exact request once
  else authorized
    API->>DB: transaction/provider verification
    API->>Audit: write action, actor, outcome, revision/request id
    API-->>UI: committed response (no secret)
    UI->>API: reload authoritative resource/list
  end
```

## Write-only secret lifecycle

```mermaid
flowchart LR
  A[Load page] --> B[configured=true + masked token only]
  B --> C{operator input}
  C -->|blank or mask| D[preserve existing server credential]
  C -->|new secret| E[validate + replace]
  C -->|Clear checkbox| F[explicit clear]
  F --> G{environment managed?}
  G -->|yes| H[409 cannot clear infrastructure secret]
  G -->|no| I[delete server-store field]
  D --> J[revisioned persistence + audit]
  E --> J
  I --> J
  J --> K[response configured/masked/source]
  K --> L[UI clears raw input + refreshes state]
```

## Razorpay checkout

```mermaid
sequenceDiagram
  participant C as Consumer client
  participant API as Backend
  participant R as Razorpay
  participant DB as Firestore

  C->>API: POST /api/razorpay/create-order {planId,coupon}
  API->>API: choose complete env pair OR complete Firestore pair
  API->>DB: create PENDING_PAYMENT order with server catalog amount
  API->>R: create provider order
  R-->>API: provider order id
  API->>DB: PAYMENT_CREATED + providerOrderId
  API-->>C: provider id + internal paymentOrderId + public key id
  C->>R: checkout
  C->>API: POST /api/razorpay/verify-payment
  API->>R: fetch payment state
  API->>API: HMAC + owner + order + amount + currency + captured checks
  API->>DB: transaction ACTIVE order + Premium entitlement + notification
  API-->>C: verified status
```

## Tenant lifecycle

```mermaid
flowchart TD
  P[Super Admin / Platform Admin request] --> Q[server authorization]
  Q --> R{valid name/slug/id?}
  R -->|no| E400[400 validation]
  R -->|yes| S[Firestore registry transaction]
  S --> T{allowed lifecycle transition?}
  T -->|no| E409[409 conflict]
  T -->|yes| U[tenant record mutation]
  U --> V[audit event]
  V --> W[response]
  W --> X[GET platform tenants/detail]
  X --> Y[table/detail refresh]

  ACTIVE -->|suspend| S
  SUSPENDED -->|reactivate| S
  ACTIVE -->|decommission| SA[Super Admin + MFA + reason]
  SA --> S
  S --> DELETING[DELETING retention state]
```

## User management

```mermaid
flowchart LR
  A[GET /api/admin/users] --> B[Firebase Auth listUsers]
  B --> C[Firestore profile join]
  C --> D[role/disabled/emailVerified/MFA projection]
  D --> E[filter + table]
  E --> F{mutation}
  F -->|suspend/activate| G[Auth disabled + refresh revoke]
  F -->|membership| H[server entitlement/profile update]
  F -->|role| I[Super Admin only; SUPER_ADMIN protected]
  F -->|delete| J[Super Admin + recent auth; cleanup + identity deletion]
  G --> K[audit + reload]
  H --> K
  I --> K
  J --> K
```

## Platform health

```mermaid
flowchart TD
  A[health/operational-status request] --> B[cache/in-flight guard]
  B --> C[Firestore write probe]
  B --> D[Firebase Auth listUsers probe]
  B --> E[config store reads]
  B --> F[outbox bounded inspection]
  B --> G[SMTP/provider configuration posture]
  B --> H[Enterprise flag + repository posture]
  C --> I[service descriptors]
  D --> I
  E --> I
  F --> I
  G --> I
  H --> I
  I --> J[OPERATIONAL/DEGRADED/UNAVAILABLE/DISABLED/NOT_CONFIGURED/UNKNOWN]
  J --> K[summary + API matrix + remediation]
  K --> L[Admin dashboard/sidebar/attention]
```
