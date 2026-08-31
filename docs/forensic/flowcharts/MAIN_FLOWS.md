# Authentication & Authorization Flowcharts

> **Audit SHA**: `06f443d`

## Authentication Flow

```mermaid
flowchart TD
    A[Browser Request] --> B{Route Type?}
    B -->|Public API| C[No Auth Required]
    B -->|Enterprise API| D["requireEnterpriseAuth"]
    B -->|Standard API| E["requireAuth middleware"]
    
    E --> F{Authorization Header?}
    F -->|Missing| G["401 AUTH_REQUIRED"]
    F -->|Present| H{Bearer Token Format?}
    
    H -->|Invalid| G
    H -->|rptest. prefix| I{Test Verifier Enabled?}
    H -->|Standard JWT| J["Firebase Admin SDK verifyIdToken"]
    
    I -->|NODE_ENV=production| J
    I -->|Non-prod + HMAC secret| K["verifyLocalTestToken"]
    
    J --> L{Token Valid?}
    K --> L
    L -->|Invalid/Expired| M["401 INVALID_AUTH_TOKEN"]
    L -->|Valid| N["req.user = frozen claims"]
    
    N --> O["enforceApiPolicy"]
    O --> P{isAdminPath?}
    
    P -->|Yes + Read| Q["Check resolveAdminReadPermission"]
    P -->|Yes + Mutation| R["Check resolveAdminMutationPermission"]
    P -->|No| S{requiresVerifiedEmail?}
    
    Q --> T{Has Permission?}
    R --> T
    T -->|No| U["403 FORBIDDEN"]
    T -->|Yes| V{Email Verified?}
    
    S -->|Yes| V
    S -->|No| W[Continue to Route Handler]
    
    V -->|No| X["403 EMAIL_VERIFICATION_REQUIRED"]
    V -->|Yes| W
```

## Admin Authorization Chain

```mermaid
flowchart TD
    A["Admin API Request /api/admin/*"] --> B["Global requireAuth (line 403)"]
    B --> C["enforceApiPolicy (line 413)"]
    C --> D{"isAdminPath(req.path)?"}
    D -->|Yes| E{"GET/HEAD/OPTIONS?"}
    
    E -->|Yes: Read| F["resolveAdminReadPermission"]
    F --> G{"Most paths: system.config.read<br/>firebase-service-account: secrets.manage<br/>payment-settings: payments.read<br/>support: tickets.manage"}
    G --> H{User has permission?}
    
    E -->|No: Mutation| I["Global admin guard (line 583-589)"]
    I --> J["requirePermission('system.config.write')"]
    J --> K{User has permission?}
    
    H -->|No| L["403 FORBIDDEN"]
    K -->|No| L
    H -->|Yes| M["Check email verified"]
    K -->|Yes| N{"Destructive operation?"}
    
    N -->|Yes| O["requireRecentAdminAuthentication"]
    O --> P{"Super Admin?"}
    P -->|No| L
    P -->|Yes| Q{"MFA Required? (production)"}
    Q -->|Yes + No MFA| R["403 SUPER_ADMIN_MFA_REQUIRED"]
    Q -->|No or has MFA| S{"Recent auth? (auth_time < 10min)"}
    S -->|No| T["403 RECENT_AUTH_REQUIRED"]
    S -->|Yes| U[Execute Handler]
    
    N -->|No| U
    M --> U
```

## Candidate User Journey

```mermaid
flowchart TD
    A[Landing Page /] --> B{Authenticated?}
    B -->|No| C[Login / Sign Up]
    C --> D[Firebase Auth]
    D --> E{Email Verified?}
    E -->|No| F[Verification Email Sent]
    F --> G[Click Verify Link]
    G --> H[/api/auth/verify-email-token]
    E -->|Yes| I[Dashboard /dashboard]
    H --> I
    
    I --> J[Dashboard Homepage]
    J --> K{Action?}
    
    K -->|Build Resume| L[/build-resume/heading]
    L --> M[13 Step Wizard]
    M --> N[Save to MariaDB /api/resumes/:id]
    N --> O{Export?}
    O -->|PDF| P[/api/export with headless browser]
    O -->|DOCX| Q[/api/export-docx]
    
    K -->|AI Interview| R[/dashboard/interview]
    R --> S[Generate Questions /api/generate-interview]
    S --> T[Practice Session]
    
    K -->|Jobs| U[/dashboard/job-tracker]
    U --> V[Track Applications]
    
    K -->|Portfolio| W[/portfolio/builder]
    W --> X[Save /api/portfolios/:id]
    
    K -->|Settings| Y[/dashboard/settings]
    Y --> Z[Profile / Account / MFA]
    
    K -->|Billing| AA[/dashboard/plans]
    AA --> AB[Payment Flow]
```

## Payment Flow

```mermaid
flowchart TD
    A[User selects Plan] --> B[/billing/plans or /dashboard/plans]
    B --> C{Provider?}
    
    C -->|Stripe| D["POST /api/pay"]
    D --> E[Backend creates Stripe Checkout Session]
    E --> F[Redirect to Stripe]
    F --> G["Stripe Webhook /api/stripe-webhook"]
    G --> H[Verify webhook signature]
    H --> I[Activate subscription in MariaDB]
    
    C -->|PayPal| J["POST /api/paypal/create-order"]
    J --> K[Backend creates PayPal order]
    K --> L[PayPal approval]
    L --> M["POST /api/paypal/verify"]
    M --> I
    
    C -->|Razorpay| N["POST /api/razorpay/create-order"]
    N --> O[Backend creates Razorpay order]
    O --> P[Razorpay payment modal]
    P --> Q["POST /api/razorpay/verify-payment"]
    Q --> I
    
    C -->|Paytm| R["POST /api/paytm/initiate-transaction"]
    R --> S[Redirect to Paytm]
    S --> T["POST /api/paytm/callback"]
    T --> U["POST /api/paytm/verify-transaction"]
    U --> I
    
    C -->|PhonePe| V["POST /api/phonepe/initiate"]
    V --> W[Redirect to PhonePe]
    W --> X["POST /api/phonepe/callback"]
    X --> Y["POST /api/phonepe/status"]
    Y --> I
    
    I --> Z[User sees active subscription]
```

## Enterprise Tenant Flow

```mermaid
flowchart TD
    A[Enterprise Admin Login] --> B[Firebase Auth + Claims]
    B --> C{Has enterprise membership?}
    C -->|No| D[Regular user dashboard]
    C -->|Yes| E[Enterprise Console /enterprise]
    
    E --> F["GET /api/enterprise/context"]
    F --> G["resolveTenantContext middleware"]
    G --> H{Valid tenant membership?}
    H -->|No| I["403 Not a tenant member"]
    H -->|Yes| J["req.tenantContext set"]
    
    J --> K[Enterprise Navigation]
    K --> L{Tab selected}
    
    L -->|Users| M["requireTenantPermission('tenant.members.read')"]
    L -->|Workspaces| N["requireTenantPermission('workspace.read')"]
    L -->|Security| O["requireTenantPermission('tenant.security.read')"]
    L -->|Platform| P{platformOnly flag}
    
    M --> Q[Tenant-scoped user list]
    N --> R[Tenant-scoped workspaces]
    O --> S[Service accounts + DLQ]
    P -->|Server says platform admin| T[Multi-tenant registry]
    P -->|Not platform admin| U[Hidden]
```

## AI Generation Flow

```mermaid
flowchart TD
    A[User triggers AI action] --> B{Action type?}
    
    B -->|Resume content| C["POST /api/generate-content"]
    B -->|Interview prep| D["POST /api/generate-interview"]
    B -->|Grammar check| E["POST /api/check-grammar"]
    B -->|Resume parse| F["POST /api/parse-resume"]
    
    C --> G["requireAuth + enforceApiPolicy"]
    D --> G
    E --> G
    F --> G
    
    G --> H["enforceDailyAiQuota"]
    H --> I{Quota exceeded?}
    I -->|Yes| J["429 AI_DAILY_QUOTA_EXCEEDED"]
    I -->|No| K["aiRuntime.js - Provider Selection"]
    
    K --> L{Active Provider?}
    L -->|Gemini| M[Google Gemini API]
    L -->|NVIDIA| N[NVIDIA NIM API]
    L -->|OpenAI| O[OpenAI API]
    L -->|Groq| P[Groq API]
    
    M --> Q{Response OK?}
    N --> Q
    O --> Q
    P --> Q
    
    Q -->|Error| R[Failover to next provider]
    Q -->|Success| S[Parse JSON response]
    S --> T["extractJson helper (control char sanitization)"]
    T --> U[Return to frontend]
    
    R --> L
```
