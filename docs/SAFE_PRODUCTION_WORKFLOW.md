# Safe production delivery workflow

This is the authoritative release path for `airesume.projectdemo.guru`. It replaces ad-hoc SCP, password authentication, direct extraction into the live tree, and `StrictHostKeyChecking=accept-new`.

## Security model

A release now has the following controls:

1. Pull requests and `main` run `.github/workflows/quality-gate.yml` (locked installs, lint, security/backend tests, product tests, build, and production dependency audit).
2. Production is **manual and approval-gated**, never automatic on a push.
3. A normal deployment accepts only the current full SHA of `main`. A rollback accepts only a full SHA already in `main` history and requires a separate confirmation phrase.
4. Current `main` supplies the deployment tooling even during rollback; old deployment scripts are never trusted.
5. GitHub receives a dedicated ED25519 transport key. On the server that key has `restrict` plus a forced command, so it cannot open a shell, forward ports, allocate a terminal, or invoke arbitrary commands.
6. A separate Ed25519 release-signing key signs the commit SHA and bundle digest. Production stores only its public key, so possession of the SSH transport key alone cannot submit a forged bundle.
7. SSH host keys are pinned. Trust-on-first-use is not allowed in CI.
8. The release archive is allow-listed and cannot contain `.env`, credentials, tests, logs, `node_modules`, or operator utilities. Its frontend build-identity marker must match the reviewed release SHA.
9. The server caps upload size; verifies the detached signature; validates canonical archive paths/types, manifest shape, frontend/backend build identities, and SHA-256 hashes; installs dependencies in staging; preserves server-only mutable configuration; and serializes releases with a lock.
10. Backend activation uses same-filesystem directory renames. Frontend files are copied to exclusive temporary files and atomically replaced, with `index.html` switched last. PM2 is restarted only after staging succeeds.
11. `/api/healthz`, `/api/readyz`, `/api/platform/version`, `/`, and `/enterprise` must all pass. A failed gate or interrupted activation automatically restores the preceding backend and frontend.
12. GitHub independently repeats the live checks and retains non-secret deployment receipts for 30 days.

> The deployment rollback snapshot protects application code and frontend files. It is **not a database backup**. Run and restore-test a MariaDB backup before any release that changes persistent schema or data.

## 0. Rotate the key shared in chat

A private key copied into chat must be treated as exposed. Do not store that key in GitHub and do not use it as the ongoing automation identity.

Before removing it:

1. Generate a new, passphrase-protected **human administrator** key on a trusted operator machine.
2. Add its public key to `~/.ssh/authorized_keys` through Hostinger/hPanel.
3. Open a second session and prove that the replacement login works with strict host-key checking.
4. Back up `authorized_keys`, remove the line for the key shared in chat, and test again without closing the working replacement session.

Human administration and CI deployment must use different keys.

## 1. Verify and pin the server host key

Obtain the SSH host-key fingerprint through an independent channel: Hostinger/hPanel console or Hostinger support. Then collect the public host keys and compare fingerprints:

```bash
ssh-keyscan -p 65002 82.112.232.112 > resumepilot_known_hosts
ssh-keygen -lf resumepilot_known_hosts
```

Do **not** accept the scan merely because it connected. Every displayed fingerprint must match the provider/console value before this file is used. Keep the verified `[82.112.232.112]:65002 ...` lines intact.

For interactive administration, use a local SSH config similar to:

```sshconfig
Host resumepilot-production-admin
  HostName 82.112.232.112
  Port 65002
  User u727965524
  IdentityFile ~/.ssh/resumepilot_admin
  IdentitiesOnly yes
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/resumepilot_known_hosts
  ServerAliveInterval 15
  ServerAliveCountMax 3
```

## 2. Create separate transport and signing keys

Generate a new SSH transport key used only by GitHub Actions:

```bash
umask 077
ssh-keygen -t ed25519 \
  -N '' \
  -C resumepilot-github-actions \
  -f ~/.ssh/resumepilot_github_actions
ssh-keygen -lf ~/.ssh/resumepilot_github_actions.pub
```

Generate an independent Ed25519 release-signing key pair:

```bash
openssl genpkey -algorithm ED25519 \
  -out ~/.ssh/resumepilot_release_signing.pem
openssl pkey \
  -in ~/.ssh/resumepilot_release_signing.pem \
  -pubout \
  -out ~/.ssh/resumepilot_release_signing_public.pem
chmod 600 ~/.ssh/resumepilot_release_signing*.pem
```

Both private keys must remain outside this repository. Production receives only the signing **public** key. GitHub automation keys are normally non-interactive (no passphrase), which is why the protected environment, forced SSH command, and independent bundle signature are all required.

## 3. Install the restricted server gateway once

Run this from a trusted checkout using the replacement human administrator key and the verified `known_hosts` file:

```bash
cd /path/to/ResumePilotAi
DEPLOY_KEY_B64="$(base64 < ~/.ssh/resumepilot_github_actions.pub | tr -d '\n')"
SIGNING_PUBLIC_KEY_B64="$(base64 < ~/.ssh/resumepilot_release_signing_public.pem | tr -d '\n')"

tar -czf - ops/deploy | ssh \
  -i ~/.ssh/resumepilot_admin \
  -p 65002 \
  -o IdentitiesOnly=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/resumepilot_known_hosts" \
  u727965524@82.112.232.112 \
  "set -e; umask 077; tmp=\$(mktemp -d); trap 'rm -rf \"\$tmp\"' EXIT; \
   tar -xzf - -C \"\$tmp\"; \
   DEPLOY_PUBLIC_KEY_B64='$DEPLOY_KEY_B64' \
   DEPLOY_SIGNING_PUBLIC_KEY_B64='$SIGNING_PUBLIC_KEY_B64' \
   bash \"\$tmp/ops/deploy/install-production-gateway.sh\""
```

The installer:

- installs receiver code under `~/.local/lib/resumepilot-deploy/`;
- creates mode-`0600` config and release-signing public key under `~/.config/resumepilot-deploy/`;
- stores release state under `~/.local/state/resumepilot-deploy/`;
- backs up `authorized_keys` before changing it;
- adds one `restrict,command="..."` deployment-key entry; and
- preserves all unrelated administrator keys.

Defaults match the current Hostinger layout:

- backend: `~/backend`
- frontend: `~/domains/airesume.projectdemo.guru/public_html`
- PM2 process: `airesume-backend`
- Node/npm: Hostinger `alt-nodejs20`

If production differs, edit only `~/.config/resumepilot-deploy/config`, keep it mode `0600`, and directly run:

```bash
~/.local/lib/resumepilot-deploy/remote-deploy.sh status
```

## 4. Prove that the key is restricted

Configure the local client without copying secrets into command history:

```bash
export PROD_SSH_HOST=82.112.232.112
export PROD_SSH_PORT=65002
export PROD_SSH_USER=u727965524
export PROD_SSH_PRIVATE_KEY_FILE="$HOME/.ssh/resumepilot_github_actions"
export PROD_SSH_KNOWN_HOSTS_FILE="$HOME/.ssh/resumepilot_known_hosts"
export PROD_SSH_KEY_FINGERPRINT="$(ssh-keygen -lf "$PROD_SSH_PRIVATE_KEY_FILE" | awk '{print $2}')"
export PROD_RELEASE_SIGNING_PRIVATE_KEY_FILE="$HOME/.ssh/resumepilot_release_signing.pem"
# Copy the release_signing_public_key_sha256 value printed by the server installer:
export PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256='<64-character SHA-256 digest>'

scripts/production-release-client.sh status
```

An arbitrary command must be denied:

```bash
ssh -T \
  -i "$PROD_SSH_PRIVATE_KEY_FILE" \
  -p "$PROD_SSH_PORT" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$PROD_SSH_KNOWN_HOSTS_FILE" \
  "$PROD_SSH_USER@$PROD_SSH_HOST" id
# Expected: Denied: this SSH key can only query status or stream a signed release bundle.
```

Do not continue until both checks behave as expected.

## 5. Configure the GitHub `production` environment

Create an environment named exactly `production` in repository settings.

Protection settings:

- add at least one required reviewer other than the release initiator;
- prevent self-review where supported;
- restrict deployment branches to `main`;
- disallow administrator bypass where supported; and
- protect `main` with the `Quality gate / Test, build, and audit` required check.

Environment secrets:

| Name | Value |
|---|---|
| `PROD_SSH_PRIVATE_KEY` | Complete contents of the **new dedicated deployment private key** |
| `PROD_SSH_KNOWN_HOSTS` | Complete independently verified `known_hosts` lines |
| `PROD_RELEASE_SIGNING_PRIVATE_KEY` | Complete PEM contents of the new Ed25519 release-signing private key |

Environment variables:

| Name | Current value / purpose |
|---|---|
| `PROD_SSH_HOST` | `82.112.232.112` |
| `PROD_SSH_PORT` | `65002` |
| `PROD_SSH_USER` | `u727965524` |
| `PROD_SSH_KEY_FINGERPRINT` | `SHA256:...` from the new deploy key |
| `PROD_RELEASE_SIGNING_PUBLIC_KEY_SHA256` | 64-character digest printed by the gateway installer |
| `PRODUCTION_URL` | `https://airesume.projectdemo.guru` |
| `VITE_WEBSITE_URL` | Must exactly equal `PRODUCTION_URL` |
| `VITE_FIREBASE_KEY` | Public, browser-restricted Firebase web key |
| `VITE_FIREBASE_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Auth project ID |
| `VITE_FIREBASE_SENDER_ID` | Firebase Auth web-app sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID |
| `VITE_ENTERPRISE_TENANCY_ENABLED` | Explicit `true` or `false` |

Optional browser configuration uses environment variables named in `.github/workflows/production-release.yml`, including maps, analytics, OAuth client ID, and payment **publishable/client** IDs. Never place a server secret in a `VITE_*` variable; all `VITE_*` values are public after compilation.

A repository administrator must complete this settings step in GitHub; the workflow intentionally fails closed when any required value is absent.

## 6. Normal release

1. Merge a reviewed pull request only after the Quality gate passes.
2. Copy the full 40-character SHA at the tip of `main`.
3. Open **Actions → Production release → Run workflow** on `main`.
4. Select `deploy`, paste the SHA, and type `DEPLOY`.
5. A production-environment reviewer approves the job.
6. Confirm the job summary and downloaded non-secret receipts.

The workflow refuses a stale SHA in normal deploy mode.

## 7. Rollback

Use the same workflow:

1. Select a known-good full SHA already in `main` history.
2. Select `rollback` and type `ROLLBACK`.
3. Obtain production-environment approval.

The workflow rebuilds that exact application revision while still using current trusted delivery tooling. This avoids executing an old release script. The server also performs an automatic immediate rollback if activation health checks fail.

## 8. Manual release (break-glass)

Prefer GitHub Actions. If Actions is unavailable, a trusted operator can run the same protocol:

Use a disposable MariaDB test database—never production—for the database-backed gate below:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix backend ci --ignore-scripts --no-audit --no-fund

export NODE_ENV=test
export DB_HOST=127.0.0.1 DB_PORT=3306
export DB_USER=resumepilot_cert DB_PASSWORD='<runtime-generated-disposable-password>'
export DB_NAME=resumepilot_cert
node - <<'NODE'
const database = require('./backend/database/mysql');
database.initializeSchema()
  .then((result) => {
    if (!result.success) throw new Error(result.error || 'schema initialization failed');
    return database.closePool();
  })
  .catch((error) => { console.error(error.message); process.exit(1); });
NODE
npm run lint
npm run test:security
npm run test:product
npm run audit:production

# Do not build with NODE_ENV=test.
unset NODE_ENV DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
npm run build

SHA="$(git rev-parse HEAD)"
scripts/create-production-release.sh "$SHA"
scripts/production-release-client.sh deploy "$SHA"
```

The operator must use the dedicated restricted key and pinned host keys. Never fall back to password/`sshpass`, `accept-new`, or direct SCP into the live directories.

## 9. Operational checks and retention

The server retains five successful release archives, five rollback trees, and additional receipt records under `~/.local/state/resumepilot-deploy/`. Monitor disk usage and back these up according to the production retention policy.

Routine checks:

```bash
scripts/production-release-client.sh status
curl -fsS https://airesume.projectdemo.guru/api/healthz
curl -fsS https://airesume.projectdemo.guru/api/readyz
curl -fsS https://airesume.projectdemo.guru/api/platform/version
```

Also maintain independently scheduled and restore-tested MariaDB backups. A code rollback cannot reverse destructive database changes.

## Prohibited legacy paths

Do not use:

- a private key pasted into chat or committed to disk inside the repository;
- `sshpass` or SSH password environment variables;
- `StrictHostKeyChecking=no` or `accept-new` in automation;
- a general-purpose human SSH key in GitHub;
- restoring or using the retired Paramiko utilities formerly kept under `scratch/`;
- direct extraction/copy over `~/backend` or `public_html`;
- production deployment directly from a developer working tree; or
- automatic deployment on every push to `main`.
