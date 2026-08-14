# Historical credential response requirements

## Scope and evidence

A repository-history signature scan covered 12 reachable commits and identified the credential/identifier classes below in revisions that predate the current hardened tree. Recognized Stripe secret, GitHub token, AWS access-key, NVIDIA token, and private-key-material signatures were not found. Secret values are intentionally not reproduced here.

| Type | Historical location | Associated service | Current-tree status | Active/revoked status |
|---|---|---|---|---|
| SSH username/password and host details | `scratch/setup_ssh.py` | Hosting/server SSH access (the script targeted a hosted Linux account) | Removed. The script now obtains destination/user interactively or from environment, reads the password with `getpass`, and rejects unknown host keys. | **Unknown — must be treated as active until the hosting operator confirms rotation.** |
| Firebase/Google web API key | Eight historical `scratch/*` diagnostics | Firebase / Google Cloud web client project | Replaced with a nonfunctional placeholder in the current tree. A tracked-secret regression test covers Google-key signatures. | **Unknown. Firebase web keys are public identifiers, but restrictions, quota abuse, and rotation still require operator verification.** |
| Razorpay test key identifier | Historical `src/components/admin/settings/subscriptionsSettings.jsx` | Razorpay test account | Removed from defaults/placeholders in the current tree. The secret half of the key pair was not found by the history signature scan. | **Unknown. A key ID is public during checkout, but the operator must confirm the corresponding test key pair is disabled or intentionally retained.** |

Removing these values from the current tree does not revoke them and does not remove them from old commits, forks, caches, clones, CI logs, or GitHub objects.

## Required SSH response

An authorized hosting administrator must:

1. Change the affected hosting/SSH account password in the hosting control panel immediately. Use a unique generated credential; do not reuse the historical value.
2. Review and remove unknown SSH public keys from `~/.ssh/authorized_keys` and any hosting-panel key list.
3. Invalidate active sessions where the provider supports it. Restart or rotate the account/container if session invalidation is unavailable.
4. Review authentication, shell history, deployment, file-change, cron, process-manager, and control-panel logs from the earliest exposure date onward.
5. Check the historical password against all other organization services and rotate every reuse.
6. Prefer key-only SSH, disable password authentication where hosting permits it, and enforce a verified `known_hosts` entry.
7. Record the rotation timestamp, operator, affected account identifier, log-review result, and incident/ticket reference in the production evidence package.

The application agent cannot safely perform this rotation because no authorized hosting control-plane session is available. The old password must not be tested against the server to determine whether it remains active.

## Required Firebase/Google response

An authorized Firebase/Google Cloud administrator must:

1. Identify the web API key by its historical fingerprint in **Google Cloud Console → APIs & Services → Credentials** for the ResumePilot Firebase project.
2. Review key usage, Identity Toolkit/Auth usage, API quotas, unexpected referrers/IPs, and billing anomalies from the earliest exposure date.
3. Apply appropriate application restrictions (approved production HTTP referrers for browser use) and API restrictions limited to required Firebase/Google APIs.
4. If rotation is selected, create a replacement browser key, apply restrictions before deployment, update the production `VITE_FIREBASE_KEY` secret/configuration, deploy, verify Firebase Auth/Firestore/Realtime Database, then disable and delete the old key.
5. Confirm Firebase App Check enforcement separately; API-key restrictions do not replace Firebase rules or App Check.
6. Record whether the old key was restricted, rotated, disabled, or intentionally retained as a restricted public web key, with screenshots/audit evidence and timestamp.

The application agent cannot determine active status or rotate the key without authorized Google Cloud control-plane access.

## Required Razorpay response

An authorized Razorpay administrator must locate the historical test key ID in the Razorpay dashboard, confirm whether the key pair remains enabled, review test-mode activity, and disable/regenerate the pair if it is not intentionally in use. If rotated, update only the deployment secret/public configuration through the server-owned payment-settings flow. The historical key ID alone cannot sign API calls, and no matching secret was found by the recognizable history scan; this does not prove that the paired secret was never exposed elsewhere.

## Git history remediation

Credential rotation is the first priority. After rotation, a repository owner should decide whether to purge old blobs using `git filter-repo` or GitHub Support. A history rewrite must be coordinated because it changes commit IDs and requires all contributors, deployments, mirrors, open pull requests, and caches to rebase or reclone. Rewriting only the current feature branch is insufficient while another reachable ref contains the original commits.

## Current preventive evidence

- `tests/security-static.test.mjs` scans every tracked textual file for recognized credential formats and hardcoded password assignments.
- The security CI template runs that suite and performs an additional provider-token grep.
- `.env.example` contains placeholders only and directs backend secrets to deployment secret management.
- `scratch/setup_ssh.py` no longer stores credentials or trusts unknown host keys.
