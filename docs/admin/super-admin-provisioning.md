# Super-admin provisioning — the role-based runbook

**Audience:** whoever is on call and holds the Firebase service account.
**Scope:** creating, reviewing and removing root (`SUPER_ADMIN`) authority on the ResumePilot AI
admin plane. Written in terms of **roles and records, never individuals** — this document has a
long life and the people in it do not.

**Why it exists (REC-026).** Root authority lives in two stores that cannot see each other:
Firebase custom claims (what a token says) and `admin_user_roles` (what the platform can revoke
through its own audited API). Provisioning root by editing claims alone produces authority the
platform cannot revoke; provisioning by grant alone produces a grant that never reaches a token.
Both are silent. This runbook is the procedure that keeps them in step, and
`GET /api/platform/operators/attestation` is how the claim is checked rather than assumed.

---

## 0. The one rule

**A root account is created by two operations, always both, never one.**

| Operation | Store | API | Audited? |
|---|---|---|---|
| Set the custom claim `{ role: 'SUPER_ADMIN' }` | Firebase Auth | Firebase Admin SDK (out of band) | **No** — nothing in this repository observes it |
| Grant the role to the uid | `admin_user_roles` | `POST /api/admin/rbac/grants/:uid/:role` | **Yes** — `GRANT_ROLE` row with reason, before/after, actor |

The asymmetry is the whole reason the attestation endpoint exists: half of the operation is
outside this system's audit trail, so the only honest posture is to reconcile afterwards.

---

## 1. Before you start

1. `GET /api/platform/operators/attestation` — record the current `summary.roots` and any
   `mismatches`. If it returns `503 IDENTITY_UNAVAILABLE` or `GRANT_STORE_UNAVAILABLE`, **stop**:
   you cannot see both halves, so you cannot verify what you are about to add to.
2. Confirm the requesting change has a ticket reference. It becomes the `reason` in step 2
   (minimum 10 characters; it is stored in the audit row and shown to the other administrator
   who reviews it).
3. Confirm a **second** administrator is available. The grant API refuses a self-grant
   (`SELF_ESCALATION_BLOCKED`, 409) and refuses widening a role the actor holds, so a
   single-administrator root provisioning is not possible through the API — deliberately.

## 2. Grant the platform side (audited, reversible)

```http
POST /api/admin/rbac/grants/:uid/SUPER_ADMIN
Authorization: Bearer <existing SUPER_ADMIN token>
Content-Type: application/json

{ "reason": "TICKET-1234: on-call root for incident rotation, reviewed by <second admin uid>" }
```

Expect `200` with `{ changed: true, before: [...], after: [...] }`. The response's `before` and
`after` are the reviewable diff; the audit row (`GRANT_ROLE`) carries them plus the actor.

Failure modes and what each one means:

| Response | Meaning | Action |
|---|---|---|
| `403 SELF_ESCALATION_BLOCKED` | You tried to grant yourself | Use the second administrator |
| `404 ROLE_NOT_FOUND` | The role seed did not apply | Check migration `028_admin_rbac` |
| `409 SELF_ESCALATION_BLOCKED` | You hold the role and are trying to widen it | Narrowing is allowed; widening needs a different actor |
| `503 AUDIT_WRITE_FAILED` | The grant did not take effect | Retry; the audit row is part of the write, not an afterthought |

## 3. Set the claim

Use the Firebase Admin SDK against the same project. The exact mechanism is deployment-specific
(console, `scripts/`, or a one-off job); what matters is that it happens **after** step 2, so a
failure leaves a grant without a claim (visible, revocable) rather than a claim without a grant
(invisible, not revocable here).

```js
// Run with the service account of the target project. Not committed — a script that can mint
// root is a credential, and credentials do not live in the repository.
await admin.auth().setCustomUserClaims(uid, { role: 'SUPER_ADMIN' });
```

**The claim does not take effect until the next token refresh.** Force it: the holder must sign
out and in, or the backend must revoke their refresh tokens
(`admin.auth().revokeRefreshTokens(uid)`). Until then the account has a grant and no authority —
which is the safe direction, and is exactly what the attestation will report as
`GRANT_WITHOUT_CLAIM`.

## 4. Verify — the part that is easy to skip

1. `GET /api/platform/operators/attestation` again. The uid must appear in `roots` with
   `claimRole: "SUPER_ADMIN"`, `grantRoles: ["SUPER_ADMIN"]`, `findings: []`,
   `mfaEnrolled: true`.
2. `GET /api/platform/metrics` (or `Accept: application/json`). `admin_root_account_mismatches_total`
   must not have moved since step 1's reading. If it has, the two stores disagree and step 3 did
   not land.
3. Have the holder perform one benign read that requires `security.read`
   (`GET /api/platform/operational-status`). A 403 here means the token still carries the old
   claims.

## 5. Standing review (weekly, and after every incident)

| Check | Command | Pass condition |
|---|---|---|
| The two stores agree | `GET /api/platform/operators/attestation` | `summary.mismatched === 0` |
| Every root has MFA | same payload | no `ROOT_WITHOUT_MFA` |
| No suspended root | same payload | no `ROOT_SUSPENDED` |
| Every root's email is verified | same payload | no `ROOT_UNVERIFIED_EMAIL` |
| Root population is what the ticket history says | `roots[]` vs the ticket list | equal |
| Every grant has a reason | `GET /api/admin/rbac/grants` | every row has a non-empty `reason` |

Any mismatch is an incident, not a task: `CLAIM_WITHOUT_GRANT` means authority exists that this
platform cannot revoke; `GRANT_WITHOUT_CLAIM` means a revocation may not have taken effect;
`ROOT_SUSPENDED` means a disabled identity still holds root.

## 6. Removing root

1. `DELETE /api/admin/rbac/grants/:uid/SUPER_ADMIN?reason=<ticket>` — audited, and the response
   shows `before`/`after`.
2. Clear the claim (`setCustomUserClaims(uid, { role: 'ADMIN' })` or `null`), then revoke refresh
   tokens so the old claim cannot be presented.
3. Re-run the attestation: the uid must be absent from `roots`.

**Order matters in the opposite direction from provisioning.** Here the claim goes first: a grant
removed while the claim survives leaves a token that still passes authorisation checks on any
path that trusts claims, which is the failure this whole document is built to avoid
(`DECISION-LOG.md` D-002-1, `characterisation.test.js` "claims are not grants").

## 7. Break-glass

If every root is locked out, `DEPLOYMENT-RUNBOOK.md §6` is the procedure. It is not repeated here
because break-glass is a different risk decision: it deliberately creates authority outside the
API, and its whole cost is that the attestation will report a mismatch until step 2 catches up.
Whoever performs it must, in the same incident, run the attestation and record the mismatch in
the incident timeline — an unexplained mismatch the next morning is indistinguishable from a
compromise.
