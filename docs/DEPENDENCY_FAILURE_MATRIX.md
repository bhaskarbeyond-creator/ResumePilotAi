# External Dependency Failure & Graceful Degradation Matrix

## Comprehensive Provider Failure Handling

| Provider | Purpose | Primary Failure Modes | Handling & Recovery Protocol | Blast Radius |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Firestore** | Standby Replica & Audit Store | `RESOURCE_EXHAUSTED` (code 8), `UNAVAILABLE` (code 14) | Express routes catch quota errors, return structured `degraded: true`. UI displays amber status banners with retry controls. Outbox daemon backs off. | Super Admin Audit view only; zero user impact |
| **MariaDB (Primary)** | 30 Canonical Business Tables | Connection Pool Exhaustion, Network Latency | Automatic connection pooling with health check reconnect. Dual-switch capability to Firestore standby if configured. | Core Business Data |
| **Firebase Auth** | User Authentication & JWT Minting | Invalid Token, Network Latency | Bearer verification with caching. Role permissions verified in middleware. | Auth Protected Routes |
| **Stripe / Razorpay** | Payment Gateway Webhooks | Webhook Delivery Failure, Signature Mismatch | HMAC signature verification, atomic order status transitions, idempotent processing. | Billing / Upgrades |
| **NVIDIA NIM** | Primary AI LLM Generation | 429 Rate Limit, Worker Pool Overload, Model Deprecation | Automatic failover to backup models (`nemotron-mini-4b-instruct`) or secondary provider (Gemini). Detailed error propagation. | AI Generation |
| **Google Gemini** | Secondary AI Provider | API Key Exhaustion, Regional Availability | Automatic fallback to Groq/OpenAI, returns structured fallback text if all providers fail. | AI Generation |
| **Groq / OpenRouter** | Tertiary AI Fallback | Quota, Latency | Configurable provider chain in `backend/services/aiRuntime.js`. | AI Generation |
| **SMTP / Nodemailer** | System Notification Delivery | Connection Refusal, Auth Failure | Non-fatal async delivery logging; never blocks user registration or purchase. | Email Notifications |
| **PM2 / Node Cluster** | Process Lifecycle Daemon | Worker Crash | Auto-restart with zero-downtime reload; unhandled rejection logging. | Backend Runtime |
