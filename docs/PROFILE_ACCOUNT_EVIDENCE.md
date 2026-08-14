# Profile and account lifecycle evidence

Audited from the protected Admin baseline `87bac0b` against reachable history through `4a24231`, `d8e016b`, `d04ad53`, and the current native Firebase MFA architecture.

## OLD vs CURRENT

| Area | Previous behavior | Current behavior |
|---|---|---|
| Profile persistence | Profile reads and writes used read-then-unawaited-set operations. Manual save always displayed success; autosave failures only reached console; stale tabs overwrote each other. Save & Next advanced even when saving failed. | Canonical nested `users/{uid}.profile` remains unchanged. Saves are bounded transactional writes with monotonic revisions and `PROFILE_CONFLICT`. UI exposes loading, pending, saving, saved, failed, and conflict states; autosave pauses on conflict; explicit load-latest/overwrite recovery is available; Save & Next advances only after durable success. |
| Profile data | Legacy aliases and rich profile sections were preserved but unbounded and malformed arrays could enter persistence. | Shared normalization preserves Unicode and all legitimate basic, experience, education, skill, language, certification, project, social, summary, and legacy alias fields with generous bounds and Firestore-size checks. It does not synchronize profile edits destructively into customized resumes. |
| Avatar | Any `image/*` file was read and the cropped data was shown optimistically before an unawaited Firestore write. MIME/size/storage failures looked successful. | Input accepts PNG/JPEG/WebP only, rejects files over 5 MB before reading, and persists only bounded raster data URLs or safe HTTPS/site paths. The avatar changes only after transactional revision-aware success; failures/conflicts remain visible and retryable. |
| Verification/MFA truth | The hero always displayed a “Verified User” badge. | Verification badges derive only from Firebase Auth `emailVerified`. MFA state derives only from native Firebase enrolled factors; native TOTP enroll/verify/challenge/remove behavior remains protected and no browser/Firestore MFA secret was introduced. |
| Preferences | No coherent account-scoped language, notification, product-update, or profile-discovery save workflow existed. | Preferences have an explicit save action, field allowlist, revision conflict checks, Firestore rule bounds, account-switch reset, and intentional separation from analytics consent, entitlements, and payment state. Saved language uses the existing i18n runtime. |
| Credential changes | Email changed in Firebase Auth, then Firestore email synchronization failure was swallowed. Password UI accepted eight characters while reset policy requires twelve. | Email reauthentication/native update is followed by forced token refresh and an ownership-bound Firestore email update whose failure is reported. Password UX requires at least 12 characters. Existing provider reauthentication and Firebase password behavior remain intact. |
| Account switching | Component state relied on normal unmount behavior only. | Auth-state identity is observed directly. A UID change clears profile, transaction, login-history, preference, save/conflict, and media state before loading the new account. Existing Resume/Portfolio recovery stores remain UID-scoped. |
| Data export | “Complete” export omitted Portfolio, CMS, jobs, companies, and applications. | Export includes all browser-readable owned profile/resume/cover-letter/Portfolio/CMS/employer/job/application/transaction data and explicitly identifies provider-held or legally retained records requiring support/provider channels. |
| Account deletion | User profile was deleted first; related cleanup failures were swallowed; CMS/employer/job data could remain; UI claimed all personal/subscription data was purged. | Cleanup covers profile tree, resumes/covers, Portfolio/public Portfolio, CMS posts, companies, jobs and their applications, applicant records, employer application, and notifications. Partial cleanup is audited and returns failure while identity remains active where possible. Firebase identity failure is separately audited and reported. Success names retained payment, invoice, transaction, subscription, and security-audit record types instead of claiming complete erasure. |
| Accessibility | Critical deletion and MFA modals lacked dialog semantics and Escape handling; transient save feedback was not announced. | Save feedback uses live regions; deletion and MFA flows use labelled modal semantics, safe initial focus, Escape handling, and truthful disabled/loading states. |

## Performance and integrity

- Profile save changed from one read plus an unawaited write to one Firestore transaction, preserving the same order of database operations while adding atomic stale protection.
- Autosave remains a 1.5-second idle debounce and does not add polling.
- Durable save updates are skipped by the autosave observer, preventing duplicate revision writes.
- Account load still parallelizes profile and account/security information and now clears prior-account state before either result can render.
- Avatar validation rejects oversized input before FileReader/crop work.

## Security preserved/improved

- Native Firebase Auth, provider reauthentication, TOTP MFA, OAuth, ownership rules, recent-auth deletion, analytics consent, payment authority, and AI boundaries were not replaced.
- Profile and preference writes remain owner-only.
- Email synchronization requires a refreshed Firebase token whose verified email matches the requested Firestore email.
- Avatar validation uses MIME/data signatures and bounded content, never filename extensions.
- Financial and security records are retained explicitly rather than silently deleted or exposed.

## Remaining external validation

- Firebase Identity Platform staging is required for end-to-end TOTP enrollment, sign-in challenge expiry/lost-device behavior, provider popup reauthentication, and email-update verification behavior.
- Live Storage is not used by the existing avatar design; avatars remain bounded profile data URLs. A future object-storage migration needs signed upload, MIME/dimension scanning, replacement cleanup, and private-object authorization.
- Account deletion cannot atomically combine Firebase Auth and Firestore. Rare identity-delete failure after data cleanup is audited and directs the user to support.
- Exact legal retention periods for billing/security records require business/legal policy and production lifecycle jobs.
