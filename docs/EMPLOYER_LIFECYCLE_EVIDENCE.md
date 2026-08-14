# Employer and job-application lifecycle evidence

Date: 2026-08-15

## Historical behavior checked

The earlier browser workflow created `jobApplications` directly, incremented a job counter under a broad metric-only rule exception, and let employers update application status directly. Applicant notification creation then ran as the employer in the applicant's private notification tree, so rules could reject the notification after the status update had already succeeded. This produced split outcomes and allowed arbitrary authenticated users to inflate application counters. Employer job pause/resume also attempted direct statuses that rules rejected, while successful direct mutations lacked revision checks and audit events.

## Current workflow

- Employer job creation, edit, active/paused transitions, and deletion use `/api/employer/jobs*`. The backend requires the approved-employer claim, resolves an owned approved company, validates bounded job data, verifies revisions, and audits every mutation.
- Edits return a posting to pending moderation. Active jobs can be paused and previously paused jobs resumed without weakening Admin moderation. Deletion is refused once applications exist, preserving applicant records.
- Browser job writes and arbitrary application-counter increments are denied; public and owner reads remain available.
- Submission uses `POST /api/jobs/:jobId/applications` with verified Firebase identity. Applicant UID/email come only from the token.
- The backend validates active job state, bounded candidate fields and HTTPS profile URLs, and resolves an optional resume only from `users/{authenticatedUid}/resumes/{resumeId}`.
- One transaction creates the deterministic application, increments the job counter, writes candidate/employer notifications, and records a security audit event. Concurrent duplicate submissions return a conflict.
- Employer transitions use `PATCH /api/job-applications/:applicationId/status`. The backend resolves the owning job, checks employer UID, enforces pending → interview/rejected and interview → accepted/rejected, verifies expected status/revision, updates the application, notifies the applicant, and audits in one transaction.
- Browser creates, updates, deletes, and direct job-counter increments are denied. Participant reads remain available to the applicant, owning employer, and Admin.
- Candidate UI sends only form fields plus a resume ID; it no longer uploads a browser-authored resume snapshot or email identity. Employer UI changes state only after the returned revision is confirmed.

## Validation scope

Deterministic integration tests cover successful submission, token-derived identity, owned resume resolution, duplicate conflict, counter/audit writes, employer transition, stale revision rejection, and outsider denial. Static and rules tests cover browser-write denial and confirmed UI behavior. Firebase emulator and authenticated browser execution remain externally blocked by unavailable Java/Chromium.
