# Target candidate information architecture

## Preserve the working route backbone

The existing three candidate navigation groups are a viable baseline; a wholesale rename/rewrite is not justified by the evidence collected. This is a target plan, not a claim that every page has been redesigned.

| Group | User intent | Canonical destination / child flows |
|---|---|---|
| Workspace | See next actions and owned documents | /dashboard → /dashboard/resumes → /build-resume; cover letters; portfolios; saved items |
| Job intelligence | Discover, apply, track, prepare, communicate | jobs → detail/apply; submitted applications distinct from personal tracker; interview CBT/live; gated messaging |
| Account and security | Maintain source profile, plan, privacy and help | Settings Profile + Account/Security tabs; plans; support; notifications as activity hub |

## Workflow boundaries

- Keep the **resume library** distinct from **editing one resume**. Builder steps should follow the real orderedSteps: heading, work history, education, skills, projects, certifications, languages, summary, achievements, references, custom, review. Preserve dirty-state navigation protection and recovery.
- Preview/template picker/import/profile sync remain modal workflows unless usability evidence supports a route. A page count is not a design goal.
- Profile is source career data; saved resumes are intentional snapshots. Make sync choices explicit rather than silently overwriting tailored resumes.
- Personal job tracker cards and submitted applications must remain distinguishable in copy and state. A manually moved card is not evidence an employer changed an application.
- Public portfolios/shared resumes expose **published projections**, not private editing data. Publication/revocation needs clear state and copy.
- Notification inbox, bell count and messaging belong to one activity model, but each mutation must reflect actual persistence. The current notification component now serializes conflicting local writes.
- Account Security is an existing Account-pane anchor. Preserve inbound security/profile aliases and query normalization; do not invent a second MFA state owner.

## Shared UI contracts

Use existing Cuba headers/cards/buttons/error/empty/skeleton primitives. Requirements for each page: semantic heading, honest loading/empty/error states, disabled and announced pending mutation, retained input on recoverable failure, safe retry, visible keyboard focus, dialog focus restore, minimum practical touch targets and no concealed text overflow. Pages with long lists require bounded filtering/pagination tests, not purely visual restyling.

## Implementation in this workstream

Only notification lifecycle/response handling, conflicting action states, toast contract, loading/error copy, inner text wrapping and row/filter target sizes changed. Sidebar organization, routing, auth, backend schema, export renderer and business contracts are unchanged. All other IA decisions remain proposals pending page-specific runtime audit and Lead review.
