# Messaging workflow evidence

Date: 2026-08-15

## Historical behavior checked

At `4a24231`, browser code created Realtime Database conversations from caller-supplied participant maps and wrote messages with a caller-supplied sender ID. The secured baseline moved creation and sending behind authenticated backend routes and denied all browser writes in Realtime Database rules. This phase preserves that server-authoritative design.

## Current workflow

- Conversation creation accepts only a job-application ID. The backend resolves the applicant and owning employer from Firestore and requires the authenticated UID to be one of those two accounts.
- A SHA-256 participant-pair key is also the deterministic first conversation ID, making concurrent first-message attempts idempotent. Existing installations retain their protected legacy lookup ID.
- Message send ignores browser sender identity, checks server-side conversation participation, and writes `req.user.uid` as sender.
- Conversation/message/user-conversation browser reads remain participant/owner-bound; every browser write remains denied.
- Participant display metadata comes from a no-store backend projection after Realtime participant authorization. The UI no longer attempts to read another participant's private `users/{uid}` document.
- Realtime listener unsubscribe functions live in refs and are invoked on account changes, selection changes, and unmount. Async profile/message results verify the active Firebase UID before changing UI state.
- Send success is shown only after `{ success: true }`; backend failures remain visible. Employer compose dialogs clear drafts across recipient/open transitions, invalidate stale async completions, and expose labelled dialog semantics.

## Validation scope

Deterministic route/static tests cover ownership checks, deterministic IDs, safe profile projection, send-result handling, listener cleanup, stale-account guards, and dialog semantics. Realtime Database emulator execution remains **NOT EXECUTED / ENVIRONMENT BLOCKED** because Java is unavailable. Authenticated two-party browser behavior and live delivery require staging fixtures and Chromium.
