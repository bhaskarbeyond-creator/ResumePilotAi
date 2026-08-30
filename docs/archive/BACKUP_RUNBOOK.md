# Backup Runbook

Operational procedures for the ResumePilot AI backup system.

Authoritative database: MariaDB 11.8.8-MariaDB-log, `u727965524_airesume`
Production origin: `https://airesume.projectdemo.guru`
Status labels: `VERIFIED` · `VERIFIED (LOCAL)` · `DESIGNED` · `NOT VERIFIED` · `BLOCKED`

---

## 1. Architecture

```text
MariaDB primary (u727965524_airesume)
        │
        │  scripts/dr-backup-run.mjs  (scheduled)
        ▼
┌───────────────────────────────────────────────┐
│ 1. backup   logical SQL dump, gzip, AES-256-GCM│
│ 2. verify   SHA-256 sidecar + structural parse │
│ 3. index    recovery-points.json               │
│ 4. retain   GFS pruning (dr-policy.mjs)        │
│ 5. offsite  rclone/aws/gsutil -> object storage│
│ 6. monitor  measure RPO, emit posture          │
└───────────────────────────────────────────────┘
        │
        ▼
backups/scheduled/resumepilot-<epochMs>.sql.gz.enc
backups/scheduled/resumepilot-<epochMs>.sql.gz.enc.sha256
backups/scheduled/recovery-points.json
```

Filenames embed the epoch-millisecond timestamp. Retention parses it; a file whose
timestamp cannot be parsed is **never** pruned.

---

## 2. First-time setup

### 2.1 Generate and store the encryption key OUTSIDE the backup directory

```bash
openssl rand -base64 32
```

An encrypted backup whose key sits beside it is not encrypted — it is only slower
to read. Store the key in `ops/dr/backup.env` (untracked, `chmod 600`) or in the
host's secret manager.

### 2.2 Create `ops/dr/backup.env`

```bash
cat > ops/dr/backup.env <<'EOF'
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=u727965524_airesume
DB_PASSWORD=<database password>
DB_NAME=u727965524_airesume
BACKUP_ENCRYPTION_KEY_BASE64=<openssl rand -base64 32>
BACKUP_DIR=/home/u727965524/resumepilot/backups/scheduled
BACKUP_SECONDARY_DIR=<different filesystem, or omit>
BACKUP_ALERT_WEBHOOK_URL=<optional pager/alert endpoint>
EOF
chmod 600 ops/dr/backup.env
```

`ops/dr/backup.env` matches the repository's `*.env` ignore rule, so it cannot be
committed. Verify with `git check-ignore -v ops/dr/backup.env` before proceeding.

### 2.3 Install the schedule

```bash
sh ops/dr/install-backup-schedule.sh --interval 6
```

**Hostinger shared hosting does not provide `crontab`.** The installer detects
this and prints the exact hPanel entries instead. Create them at
**hPanel → Advanced → Cron Jobs**:

| Job | Schedule | Command |
|---|---|---|
| Backups | `17 */6 * * *` | `/bin/sh /home/u727965524/resumepilot/ops/dr/backup-cron.sh backup` |
| Retention | `43 3 * * *` | `/bin/sh /home/u727965524/resumepilot/ops/dr/backup-cron.sh retain` |
| Monitoring | `*/30 * * * *` | `/bin/sh /home/u727965524/resumepilot/ops/dr/backup-cron.sh monitor` |

Use the plain wrapper command. hPanel does not handle shell special characters
reliably, so `&&`, pipes and redirection belong inside `backup-cron.sh`, not in
the hPanel field.

---

## 3. Routine operations

| Task | Command |
|---|---|
| Check DR health | `npm run dr:monitor` |
| Back up now | `npm run dr:backup` |
| Plan without writing | `npm run dr:backup:dry` |
| Prune to retention policy | `npm run dr:retain` |
| Capture a restore point | `npm run dr:restore-point` |
| Probe live service | `node scripts/dr-observability.mjs` |
| Run DR assertions | `npm run dr:test` |

### Monitor exit codes

| Code | Meaning | Action |
|---|---|---|
| 0 | healthy | none |
| 1 | degraded (warning) | investigate same day |
| 2 | critical — includes **zero recovery points** | investigate immediately |
| 3 | could not evaluate | fix the monitor itself |

Exit code `2` for "no backups exist" is deliberate: silence must be as loud as
an error, or a cron job that never runs looks identical to a healthy one.

---

## 4. Before any risky change

```bash
npm run dr:restore-point
```

Creates two artifacts and exits `0` **only if both verify**. If it exits non-zero,
stop — you do not have a restore point.

If the two artifacts land on the same filesystem device, the manifest reports
`independence.achieved: false`. A second copy on the same disk is not a backup.

---

## 5. Restoring

> Never restore over production to prove restoration works. Restore into an
> isolated database, verify, and only then promote deliberately.

```bash
# 1. Verify the artifact first
node scripts/db-backup.mjs verify --in <file>.sql.gz.enc

# 2. Restore into a DISPOSABLE database only
export DB_NAME=resumepilot_restore_test
export DB_RESTORE_CONFIRM=RESTORE:resumepilot_restore_test
node scripts/db-backup.mjs restore --in <file>.sql.gz.enc
```

`db-backup.mjs` refuses to restore without `DB_RESTORE_CONFIRM` set to the exact
target database name, which is what prevents an accidental production overwrite.

After restoring, verify: table count, `schema_migrations` rows, and a
representative record from `users`, `resumes`, `system_settings`.

---

## 6. Offsite replication

Cloud-first: use provider-managed object storage, not a bespoke uploader.

```bash
# Preferred: rclone to any S3/GCS/B2/Azure bucket
rclone config                       # one-time
export BACKUP_OFFSITE_RCLONE_REMOTE=b2-remote
export BACKUP_OFFSITE_RCLONE_PATH=resumepilot-backups

# Alternatives, auto-detected in order: rclone, aws, gsutil, az
export BACKUP_OFFSITE_PROVIDER=aws
export BACKUP_OFFSITE_DESTINATION=s3://resumepilot-backups/db
```

Uploads are built as argv arrays and executed without a shell, so a malformed
destination cannot inject a command. Destinations are validated against a
per-provider pattern before use.

### Immutability (do this — it is the highest-value remaining control)

```bash
aws s3api put-object-lock-configuration --bucket resumepilot-backups \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":35}}}'
```

`rclone` cannot make a bucket immutable; it can only write to one that already
is. Immutability must be enforced by the storage provider.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `BLOCKED: Missing database configuration` | `backup.env` not loaded | hPanel cron has no login shell; confirm `ops/dr/backup.env` exists |
| `BLOCKED: BACKUP_ENCRYPTION_KEY_BASE64 is required in production` | key unset | generate with `openssl rand -base64 32` |
| Backup succeeds, `offsite.ok: false` | no transport or destination | install rclone and set the destination |
| `posture: DEGRADED [OFFSITE_NOT_VERIFIED]` | destination set but no upload has succeeded | run a backup and confirm the upload |
| Cron job runs but nothing happens | wrong node path | `backup-cron.sh` probes known node locations and logs which it used |
| Retention deleted more than expected | — | impossible by construction: 3-point floor, in-flight protection, undated files kept |

---

## 8. Status

| Capability | Verdict |
|---|---|
| Automated backup | **DESIGNED** — code and installer ready; not yet scheduled in production |
| Backup verification | **VERIFIED (LOCAL)** — SHA-256 + structural, exercised in tests |
| Retention | **VERIFIED (LOCAL)** — 40 files → 10 kept, verified against real files |
| Encryption | **DESIGNED** — enforced in production (exit 2 without a key) |
| Offsite copy | **NOT VERIFIED** — no destination configured |
| Immutability | **NOT CONFIGURED** — requires provider bucket configuration |
| Restore drill | **NOT VERIFIED** — requires a disposable MariaDB instance |
