# ResumePilot AI — Master System Flowcharts

> **Authoritative System Flowcharts**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Authentication Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as React SPA (main.jsx)
    participant FirebaseAuth as Firebase Auth SDK
    participant Backend as Express Gateway (/api/auth)
    participant Firestore as Cloud Firestore

    User->>Frontend: Enter Email & Password / Click OAuth (Google/GitHub/LinkedIn)
    alt Email & Password
        Frontend->>FirebaseAuth: signInWithEmailAndPassword(email, pwd)
        FirebaseAuth-->>Frontend: UserCredential + JWT ID Token
    else OAuth Social Login
        Frontend->>FirebaseAuth: signInWithPopup(provider) / getRedirectResult()
        FirebaseAuth-->>Frontend: UserCredential + JWT ID Token
        Frontend->>Backend: POST /api/notify/user-signup { email, name }
        Backend->>Firestore: Record signup audit & initialize user doc
    end
    Frontend->>Frontend: AuthWrapper onAuthStateChanged(user)
    Frontend->>Backend: Requests attach Authorization: Bearer <ID_Token>
    Frontend->>Frontend: Navigate to /dashboard
```

---

## 2. Email Verification Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as React SPA
    participant Backend as Express Gateway
    participant Mailer as EmailNotifier (SMTP)
    participant Firestore as Cloud Firestore

    User->>Frontend: Click "Resend Verification Email"
    Frontend->>Backend: POST /api/auth/send-verification-email (Bearer Token)
    Backend->>Backend: Rate limiter check (20/hr)
    Backend->>Firestore: Store opaque verification token with expiry
    Backend->>Mailer: Send verification link with token
    Mailer-->>User: Verification Email Received
    User->>Frontend: Clicks link (?mode=verifyEmail&token=XYZ&email=user@domain)
    Frontend->>Backend: POST /api/auth/verify-email-token { token, email }
    Backend->>Firestore: Validate token, mark emailVerified: true
    Backend-->>Frontend: 200 OK { success: true }
    Frontend->>Frontend: Display success banner & reload currentUser token
```

---

## 3. AI Inference Request & Automatic Multi-Provider Failover

```mermaid
flowchart TD
    A[Client Generation Request] --> B{Account AI Limiter & Quota Check}
    B -- Quota Exceeded --> C[Return HTTP 429 RATE_LIMITED]
    B -- Quota Available --> D[Load Active Providers from Firestore Secrets]
    D --> E[Try Primary Provider: NVIDIA NIM]
    E -- Success 200 OK --> F[Sanitize LLM JSON Response via extractJson]
    E -- Failure / Timeout / 429 / 400 --> G{Fallback Configured?}
    G -- Yes: Try Gemini --> H[Try Google Gemini]
    H -- Success 200 OK --> F
    H -- Failure / 429 --> I{Try Groq / OpenAI}
    I -- Success 200 OK --> F
    I -- All Providers Failed --> J[Return Normalized HTTP 503 Provider Error]
    G -- No Secondary --> J
    F --> K[Atomically Increment User Quota in Firestore]
    K --> L[Return Structured JSON to Client]
```

---

## 4. AI Output Control-Character Sanitization & Self-Healing

```mermaid
flowchart LR
    A[Raw LLM String Output] --> B[detectUnescapedControlCharacters]
    B --> C{Contains Raw Newlines in JSON strings?}
    C -- Yes --> D[Escape raw newlines to \\n inside quotes]
    C -- No --> E[Direct extractJson parse]
    D --> E
    E --> F{JSON.parse Successful?}
    F -- Yes --> G[Return Clean Javascript Object]
    F -- SyntaxError --> H[Regex Structural Extraction fallback]
    H --> G
```

---

## 5. Super Admin Authentication & MFA/TOTP Step-Up Gate

```mermaid
sequenceDiagram
    autonumber
    actor SuperAdmin
    participant Frontend as Admin Shell (/adm)
    participant AuthContext as AdminContext.jsx
    participant Backend as Express Gateway (/api/platform/*)

    SuperAdmin->>Frontend: Navigate to /adm/dashboard
    Frontend->>Frontend: Verify role === 'SUPER_ADMIN' in Custom Claims
    alt Destructive Operation Triggered (e.g. Decommission Tenant)
        Frontend->>Backend: POST /api/platform/tenants/:id/decommission
        Backend->>Backend: requireSuperAdmin middleware
        Backend->>Backend: Check token.claims.firebase.sign_in_second_factor
        alt Second Factor Missing
            Backend-->>Frontend: HTTP 403 { code: 'SUPER_ADMIN_MFA_REQUIRED' }
            Frontend->>SuperAdmin: Show MFA Enrollment / Re-auth Banner
        else auth_time > 10 minutes (Stale)
            Backend-->>Frontend: HTTP 403 { code: 'RECENT_AUTH_REQUIRED' }
            Frontend->>SuperAdmin: Prompt Recent Password / TOTP Re-authentication
        else MFA Verified & Fresh Session
            Backend->>Backend: Execute mutation & record security audit log
            Backend-->>Frontend: HTTP 200 OK { success: true }
        end
    end
```

---

## 6. Tenant Context Selection & Workspace Isolation

```mermaid
sequenceDiagram
    autonumber
    actor TenantAdmin
    participant Console as Enterprise Console (/enterprise)
    participant Context as EnterpriseContext.jsx
    participant Gateway as Enterprise Router (/api/enterprise)
    participant Firestore as Tenant-Isolated Firestore

    TenantAdmin->>Console: Select Workspace "Engineering"
    Console->>Context: setTenantContext(tenantId, workspaceId)
    Context->>Gateway: POST /api/enterprise/context { tenantId, workspaceId }
    Gateway->>Gateway: Verify User Membership & Role in Tenant
    Gateway-->>Console: 200 OK { activeTenant, activeWorkspace }
    Console->>Gateway: GET /api/enterprise/resumes (Headers: X-Tenant-Id, X-Workspace-Id)
    Gateway->>Gateway: createEnterpriseAuthMiddleware enforces tenant boundary
    Gateway->>Firestore: Query collection('tenants').doc(tenantId).collection('resumes')
    Firestore-->>Gateway: Filtered Tenant Resumes
    Gateway-->>Console: 200 OK [Resumes List]
```

---

## 7. Configuration Management & Zero Client Secret Leakage

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant AdminUI as Settings Panel (e.g. AiSettings.jsx)
    participant Gateway as Express Backend (/api/admin/ai-settings)
    participant Firestore as Firestore Document settings/ai_providers

    Admin->>AdminUI: Input API Key & Select Models -> Click "Save Settings"
    AdminUI->>Gateway: POST /api/admin/ai-settings { nvidiaApiKey: "nvapi-***", ... }
    Gateway->>Gateway: requireRecentAdminAuthentication check
    Gateway->>Firestore: Store Encrypted Secret Keys in Server-Only Document
    Gateway-->>AdminUI: 200 OK { success: true, activeProviders: { nvidia: true, gemini: true } }
    AdminUI->>AdminUI: Clear plaintext API key from DOM state -> Display "✓ Active on server"
```

---

## 8. Platform Health Monitoring & Diagnostics

```mermaid
sequenceDiagram
    autonumber
    participant Poller as Admin Header / Monitoring Worker
    participant HealthRouter as /api/platform/health
    participant HealthService as platformHealth.js
    participant Integrations as Firestore / Auth / Storage / SMTP / AI

    Poller->>HealthRouter: GET /api/platform/health (or /api/healthz)
    HealthRouter->>HealthService: getHealthSnapshot()
    alt Snapshot within 30s TTL
        HealthService-->>HealthRouter: Return Cached Health Snapshot
    else Cache Expired
        HealthService->>Integrations: Parallel ping probes (DB latency, SMTP verify, AI ping)
        Integrations-->>HealthService: Diagnostic status results
        HealthService->>HealthService: Calculate aggregate status (HEALTHY / DEGRADED / UNHEALTHY)
        HealthService-->>HealthRouter: Fresh Health Matrix
    end
    HealthRouter-->>Poller: HTTP 200 { status: "ok", services: { ... }, commitSha }
```

---

## 9. Payment Lifecycle & Idempotency Gate

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as Pricing Modal (/pricing)
    participant Gateway as Express (/api/pay)
    participant PaymentGateway as Stripe / Razorpay / PayPal
    participant Firestore as Cloud Firestore Orders

    User->>Client: Select Yearly Plan ($179.99) & Click Checkout
    Client->>Gateway: POST /api/pay { planId: "yearly", provider: "stripe" }
    Gateway->>Gateway: Lookup Server Catalog (amounts never accepted from client)
    Gateway->>Firestore: Create pending order with unique orderId & idempotencyKey
    Gateway->>PaymentGateway: Create PaymentIntent / Order
    PaymentGateway-->>Gateway: clientSecret / orderId
    Gateway-->>Client: Return Gateway Session Credentials
    Client->>PaymentGateway: Complete Payment Form
    PaymentGateway-->>Gateway: Webhook Notification (e.g. invoice.paid / order.completed)
    Gateway->>Gateway: Validate Webhook HMAC Signature
    Gateway->>Firestore: Atomic transaction -> Update order status to PAID, grant User Subscription
    Gateway-->>PaymentGateway: HTTP 200 Webhook Received
```

---

## 10. Audit Logging & Non-Repudiation Trail

```mermaid
flowchart LR
    A[Admin Action: e.g. User Role Change] --> B[Express Route Middleware]
    B --> C[Execute Target Business Logic]
    C --> D[recordAdminAuditLog helper]
    D --> E[Collect Metadata: actorUid, action, targetId, ip, userAgent, requestId, timestamp]
    E --> F[Write Immutable Document to Firestore collection 'security_audit_logs']
    F --> G[Client Receives 200 OK]
```
