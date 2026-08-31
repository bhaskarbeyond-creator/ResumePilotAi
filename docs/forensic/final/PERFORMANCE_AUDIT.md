# Performance Audit

## Build Performance
- Vite production build: **4.4 seconds** (local sandbox, 1796 modules).
- Largest chunks: BuildResume (1.2MB gzipped ~315KB), WebCvRenderer (1.1MB gzipped ~228KB), Admin (943KB gzipped ~178KB). These are primarily due to lexical rich-text editor, 55 templates, and admin dashboard charts. Acceptable.

## Server Startup
- Cold start (without MySQL connection): <1 second.
- Schema bootstrap runs asynchronously; server accepts requests on degraded mode immediately.
- Background workers start after 5-10s delays (CMS scheduler, outbox, enterprise outbox, tenant GC) to avoid stampede.

## Backend Query Performance
- Conversation listing (`/api/messages/conversations`) uses a 3-bounded-query pattern (1+2N → 3 queries total) – specifically optimized to avoid N+1, documented in code comments.
- MySQL connection pool default 15 connections; configurable.
- Rate limiting prevents abuse.
- AI provider calls have per-request timeouts (30s default; test-provider tighter).
- Export is capped at 5 concurrent Chromium instances to prevent memory exhaustion.

## Frontend Load Performance
- Lazy loading via React.lazy for route-level code splitting.
- Axios/fetch interceptors attach tokens without blocking.
- Firebase auth state is resolved once at app load; cached by SDK.
- Public pages (landing, blog, jobs, public resume/portfolio, custom pages) do not require auth and render immediately.

## Concurrency
- Export concurrency limit: 5 (in-memory counter; adequate for single-instance deployment; for multi-instance would need external semaphore).
- Global rate limiter: 2500/15min per authenticated user key; prevents abuse.
- Payment activation, refund, and membership changes use atomic claims in MariaDB to prevent concurrent double-activation.

## Known Limitations
- No measured production latency data available (sandbox environment); code review shows no obvious N+1 queries or blocking calls.
- Chromium PDF rendering is CPU/memory heavy; concurrency cap is necessary.
- Lottie-web uses direct `eval` (warning during build); this is a third-party library not under project control; not invoked on user-controlled input.

## Score: 9/10
Deduction for chunk sizes (opportunistic improvement) and in-memory export semaphore (not multi-instance safe; acceptable for single-instance or sticky-session deployments).
