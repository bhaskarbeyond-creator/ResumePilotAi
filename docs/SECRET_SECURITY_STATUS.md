# SECRET_SECURITY_STATUS

**Incident:** Live credentials committed to the repository
**Discovered:** during Platform Health certification work, by the repository's own
`tracked files contain no recognizable private credentials` test
**Working branch:** `arena/01a028b6-resumepilotai`
**Repository visibility at time of writing:** **private**, `forkCount = 0`

> **Status: PARTIALLY REMEDIATED — ROTATION IS OUTSTANDING AND REQUIRES OPERATOR ACTION.**
> Everything achievable from inside the build sandbox has been done and verified.
> Two steps (credential rotation and history rewrite) cannot be performed here;
> the reasons are evidenced below, and exact runbooks are supplied.
> **Until rotation completes, treat every credential listed here as compromised.**

---

## 1. Discovered

Four tracked files carried real credential material.

| File | Credential classes | Status |
| --- | --- | --- |
| `remote.env` | Firebase service-account private key (RSA, DER 1218 B), Cloudflare API token, Cloudflare R2 account id + endpoint, Razorpay test key id/secret, GCP service-account email | **removed from tree + index** |
| `remote2.env` | Firebase service-account private key (**different key**, DER 1239 B), same Cloudflare/Razorpay/GCP values | **removed from tree + index** |
| `scratch/deploy.py` | Cloudflare API token + zone id, hardcoded | **rewritten to read env vars** |
| `scratch/fast_deploy_frontend.py` | Cloudflare API token + zone id, hardcoded | **rewritten to read env vars** |

The Cloudflare token in all three locations is byte-identical
(`sha256[:12] = 82970dcbb280`) — one token, three copies.

**Two distinct Firebase private keys** were present for the *same* service
account on project `ai-resume-builder-424cf`, distinguishable by DER digest
(`1dbe594171003a71` vs `8be0f3904cef5bb9`). Both must be revoked; revoking one
leaves the other valid.

### Why the existing scanner missed them

The scanner was not misconfigured — it had no pattern for the shapes present:

1. Its PEM pattern required 100+ unbroken base64 characters. A real
   service-account key stores the body wrapped with literal `\n` every 64
   characters, so the longest unbroken run is 64. **No match.**
2. It had no pattern for Cloudflare `cfut_` tokens, R2 account endpoints, or
   Google service-account identities.
3. `.gitignore` used `.env*`, which only matches names *beginning* with `.env`.
   `remote.env` and `remote2.env` do not, so they were never ignored.

All three gaps are now closed and covered by tests (§5).

---

## 2. Classified

| Credential | Assessment | Severity | Rationale |
| --- | --- | --- | --- |
| `FIREBASE_PRIVATE_KEY` ×2 | **REAL, ASSUME ACTIVE** | **CRITICAL** | Well-formed RSA keys, real project + `iam.gserviceaccount.com` identity. Firebase Admin SDK credentials **bypass Firestore security rules entirely** — full read/write on all customer data, plus token minting for arbitrary users. |
| `CLOUDFLARE_API_TOKEN` | **REAL, ASSUME ACTIVE** | **HIGH** | Correct `cfut_` format, 53 chars. Used by deploy scripts for `purge_everything` against a real zone id. Scope unverified (API unreachable); a user token may carry broader rights than cache purge. |
| `CLOUDFLARE_ACCOUNT_ID` / `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` | Real identifiers | MEDIUM | Not secrets alone, but they identify the account and R2 bucket and aid targeting. No R2 *secret* access key was present. |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` | Real but **test-mode** (`rzp_test_`) | LOW–MEDIUM | Sandbox credentials; cannot move real money. Still rotate — they authenticate to a real Razorpay account. |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PROJECT_ID`, `ADMIN_EMAIL` | Real identifiers, not secrets | LOW | Disclosure only. |
| `STRIPE_SECRET`, `PAYPAL_*`, `PAYTM_*`, `PHONEPE_*`, `GEMINI_API_KEY` | **EMPTY** | NONE | Present as empty keys. Nothing leaked. |
| `PAYPAL_ENV=sandbox`, `PAYTM_ENV=staging`, `PHONEPE_ENV=sandbox` | Config | NONE | Confirms these files describe a **non-production/staging** posture, which slightly lowers — but does not eliminate — expected blast radius. |

### Are they referenced by production?

**No.** A repository-wide search for `remote.env` / `remote2.env` across all
source, script, config, CI and documentation file types returned **zero
references**. They are orphaned artifacts, most likely a manual copy of a
server `.env`. **Removing them cannot break production** — this was verified
before deletion, not assumed.

### Exposure window

| Fact | Value |
| --- | --- |
| Introduced | `f596dc9` — 2026-08-22 13:10:08 +0530 |
| Reached `main` tip | `7ff5cff` — 2026-08-22 14:12:39 +0530 |
| Commits in `main` containing them | 2 |
| Repository visibility | **private**, 0 forks |
| Window before detection | ~1 hour |

Blast radius is materially limited by the private+unforked repository. This
**reduces** urgency; it does not remove the need to rotate, because anyone with
repository read access — including any CI integration, bot, or cached clone —
could have read them.

---

## 3. Rotated / Revoked

> **NOT DONE — BLOCKED IN THIS ENVIRONMENT. OPERATOR ACTION REQUIRED.**

The sandbox enforces a TLS egress allowlist. Verified by direct socket test:

```
github.com                TCP=OK TLS=OK       TLSv1.3
registry.npmjs.org        TCP=OK TLS=OK       TLSv1.2
api.cloudflare.com        TCP=OK TLS=BLOCKED  (SSLZeroReturnError)
oauth2.googleapis.com     TCP=OK TLS=BLOCKED  (SSLZeroReturnError)
firestore.googleapis.com  TCP=OK TLS=BLOCKED  (SSLZeroReturnError)
api.razorpay.com          TCP=OK TLS=BLOCKED  (SSLZeroReturnError)
airesume.projectdemo.guru TCP=OK TLS=BLOCKED  (SSLZeroReturnError)
```

TCP connects, TLS is terminated mid-handshake. I therefore **cannot** verify
whether a credential is currently active, revoke it, issue a replacement, or
confirm production picked one up. Claiming otherwise would be fabrication.

### Runbook — perform in this order

**A. Firebase service-account keys (CRITICAL — do first)**

1. Google Cloud Console → IAM & Admin → Service Accounts → project
   `ai-resume-builder-424cf` → the `firebase-adminsdk-*` account → **Keys**.
2. **Create** a new JSON key first. Do not delete anything yet.
3. Install it on the production host **as an environment variable or secret
   manager entry — never a repository file**. Restart the backend
   (`pm2 restart <app> --update-env`).
4. Verify the app is healthy on the new key: `/api/healthz` reports
   `firebaseAdminConfigured: true`, and `/adm/health` shows Firestore and
   Authentication `OPERATIONAL`.
5. **Only then** delete **both** old keys. Confirm by DER digest that two
   distinct keys are removed (`1dbe594171003a71`, `8be0f3904cef5bb9`).
6. Review Cloud Audit Logs for the exposure window (2026-08-22 13:10 IST →
   revocation) for unexpected `serviceAccounts.signBlob`, token minting, or
   bulk Firestore reads.

**B. Cloudflare API token (HIGH)**

1. Cloudflare dashboard → My Profile → API Tokens → locate the `cfut_…675`
   token → **Roll** (or Delete and recreate).
2. Scope the replacement to the minimum the scripts need: *Zone → Cache Purge →
   Purge*, restricted to the single zone.
3. Export it in the deploy shell — the scripts now require this and refuse to
   run without it:
   ```bash
   export CLOUDFLARE_ZONE_ID=<zone id>
   export CLOUDFLARE_API_TOKEN=<new token>
   ```
4. Review Cloudflare audit log for unexpected purges or configuration changes.

**C. Razorpay test keys (LOW–MEDIUM)**

Razorpay dashboard → Settings → API Keys → regenerate **test** keys. Update the
production/staging environment. No customer funds are at risk.

**D. R2 / account identifiers**

No R2 secret key leaked. Rotating the R2 *access key id* is optional; if the
matching secret is suspected to live anywhere alongside these files, rotate the
pair.

---

## 4. Removed

Completed and verified in this branch.

- `remote.env`, `remote2.env` — deleted from the working tree **and** the git
  index (`git rm --cached` + unlink).
- `scratch/deploy.py`, `scratch/fast_deploy_frontend.py` — the hardcoded token
  and zone id are replaced by:
  ```python
  CLOUDFLARE_ZONE_ID = os.environ.get("CLOUDFLARE_ZONE_ID", "")
  CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
  if not CLOUDFLARE_ZONE_ID or not CLOUDFLARE_API_TOKEN:
      raise SystemExit(...)
  ```
  They now **fail closed** rather than deploying with a missing credential.
  Both files compile (`python3 -m py_compile`). Deploy behaviour is otherwise
  unchanged, so cache purging keeps working once the env vars are exported.

### `.gitignore` hardened

`.env*` could never match `remote.env`. Added:

```gitignore
*.env
!example.env
**/*.env
!**/example.env
*service-account*.json
*serviceaccount*.json
*credentials*.json
*.p12
*.pfx
*.key
```

Verified with `git check-ignore`: `remote.env`, `prod.env`,
`backend/local.env`, `tmpchk/deep.env` are all ignored, while `.env.example`
remains tracked.

---

## 5. Re-scanned

**Working tree: clean.** A scan of all **2 257** tracked files across 14
credential patterns reports **0 files** containing recognizable production
secrets.

The repository scanner was **strengthened, never weakened**. Added patterns for
`cfut_` tokens, Google service-account identities, R2 endpoints, SendGrid keys,
and — critically — a PEM pattern that tolerates `\n`-wrapped base64 bodies.
A narrow allowlist keeps the two documented placeholder identities
(`firebase-adminsdk-xxx@my-project…`, `firebase-adminsdk@project-id…`) from
producing false positives.

New file `tests/secret-scanner-efficacy.test.mjs` parses the live patterns out
of the scanner and proves they fire on **all 12** synthetic samples
representing every credential class in this incident, including the exact
`\n`-wrapped PEM shape that originally evaded detection. It also asserts the
ignore rules, the absence of the two files, and the env-sourcing of the deploy
scripts. This test is wired into `npm run test:security`.

> During authoring, this efficacy test caught **two genuine residual gaps** in
> my own hardened patterns (a `\s` that could not consume a literal `\n`, then
> a length assumption broken by 64-char wrapping). Both were fixed. This is the
> reason the scanner is now trustworthy: it is tested against the real artifact
> rather than assumed correct.

**Result:** `node --test tests/security-static.test.mjs tests/secret-scanner-efficacy.test.mjs` → **18/18 pass**.

---

## 6. History cleaned

> **NOT DONE — REQUIRES OPERATOR ACTION. Deliberately not attempted here.**

The secrets remain retrievable from history:
`git show f596dc9:remote.env`.

Six blobs across four paths were located by scanning **3 562 historical blobs**:

| Blob | Path | Classes |
| --- | --- | --- |
| `5046cb9…` | `remote.env` | CF token, R2, Razorpay, PEM |
| `8e2f724…` | `remote2.env` | CF token, R2, Razorpay, PEM |
| `127edaa…` | `scratch/deploy.py` | CF token |
| `dc7f704…` | `scratch/fast_deploy_frontend.py` | CF token |
| `5ad6b8e…`, `fc3de56…` | `scratch/deploy.py` (older) | CF token |

### Why I did not rewrite history

1. **Session constraint.** This session is bound to
   `arena/01a028b6-resumepilotai`. Purging history requires force-pushing
   rewritten `main` and potentially all **50** remote branches. I must not push
   to any other branch.
2. **Shallow clone.** `.git/shallow` is present. A rewrite from a grafted clone
   risks corrupting or truncating history for every other branch.
3. **`git-filter-repo` is unavailable** in this image, and `filter-branch`
   across 50 branches from a shallow clone is materially unsafe.
4. **Rotation supersedes it.** Once the credentials are revoked, the history
   blobs become worthless. **Rotation is the control that actually mitigates
   risk; history rewriting is cleanup.** Doing the cleanup first — or instead —
   would give false assurance.

### Runbook — after rotation completes

```bash
# From a FULL (non-shallow) clone, with every branch fetched:
git clone --mirror git@github.com:bhaskarbeyond-creator/ResumePilotAi.git
cd ResumePilotAi.git

pip install git-filter-repo
git filter-repo --invert-paths \
  --path remote.env \
  --path remote2.env \
  --force

# Re-scan before publishing:
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname)' \
  | awk '$1=="blob"{print $2}' | xargs -n1 git cat-file -p 2>/dev/null \
  | grep -c "BEGIN PRIVATE KEY"    # expect 0

git push --force --mirror
```

Then: every collaborator re-clones (rewritten history breaks existing clones),
and GitHub Support is asked to purge cached views of the affected commits.

**Note:** GitHub retains unreferenced objects; a rewrite alone does not
guarantee the blob is unreachable via the API. This is a second, independent
reason rotation is mandatory rather than optional.

---

## 7. Production verified

> **NOT VERIFIED — BLOCKED.** Production is unreachable from this sandbox (§3).
> I cannot confirm that production received replacement credentials, nor that it
> is currently healthy. This must be confirmed by the operator after rotation,
> using `/adm/health` and `/api/healthz`.

---

## Summary

| Step | Status | Evidence |
| --- | --- | --- |
| Discovered | ✅ Complete | 4 files, 6 historical blobs, 2 distinct Firebase keys |
| Classified | ✅ Complete | Severity table; empty vs real distinguished; 0 production references |
| Rotated / revoked | ❌ **BLOCKED** | TLS egress allowlist proven by socket test; runbook supplied |
| Removed | ✅ Complete | Files deleted; deploy scripts env-sourced and fail-closed; compile-verified |
| History cleaned | ❌ **NOT DONE** | Deliberate: branch constraint + shallow clone; runbook supplied |
| Re-scanned | ✅ Complete | 2 257 files, 0 findings; scanner hardened; 18/18 tests pass |
| Production verified | ❌ **BLOCKED** | Production unreachable from sandbox |

**Overall: NO-GO on the security gate until Firebase and Cloudflare credentials
are rotated.** The repository is clean going forward and the detection gap that
allowed this is closed and tested. The live credentials remain valid until an
operator revokes them.
