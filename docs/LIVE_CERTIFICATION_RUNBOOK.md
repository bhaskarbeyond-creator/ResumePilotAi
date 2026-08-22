# Admin & Super Admin Live Certification Runbook

This deterministic runbook is intended for the production-capable operator (or CI/CD agent) who possesses SSH/Hostinger credentials and the authority to deploy and test against the live production environment (`https://airesume.projectdemo.guru`).

**Target Release SHA:** `1c3b0377fa664fccfb1aac7324a82133dbaad0c6`
*(Ensure local and remote SHAs match this exactly before proceeding).*

---

## Phase 1: Pre-Deployment & Backup

1. **Verify Exact SHA on Deployment Origin**:
   ```bash
   git rev-parse HEAD
   # Must output: 1c3b0377fa664fccfb1aac7324a82133dbaad0c6
   ```

2. **Verify `backend/COMMIT_SHA` Match**:
   ```bash
   cat backend/COMMIT_SHA
   # Must output: 1c3b0377fa664fccfb1aac7324a82133dbaad0c6
   ```

3. **Create Production Database Backup (Firestore)**:
   ```bash
   # From a machine authenticated with gcloud CLI
   gcloud firestore export gs://ai-resume-builder-424cf.firebasestorage.app/backups/deploy-1c3b0377
   ```

---

## Phase 2: Deployment & Health Verification

1. **Deploy to Hostinger / Target Server**:
   ```bash
   ssh user@hostinger_ip
   cd /path/to/project
   git pull origin main
   git checkout 1c3b0377fa664fccfb1aac7324a82133dbaad0c6
   npm ci
   npm run build
   cd backend && npm ci
   ```

2. **Restart PM2 & Check Health**:
   ```bash
   pm2 restart ai-resume-backend
   pm2 logs ai-resume-backend --lines 20
   # Must verify successful boot without fatal exceptions.
   ```

3. **Verify API Endpoint**:
   ```bash
   curl -s https://airesume.projectdemo.guru/api/healthz | jq
   # Expected: { "status": "ok", "firebaseAdminConfigured": true }
   ```

4. **Verify Frontend Asset Hash / Cache Busting**:
   - Open `https://airesume.projectdemo.guru` in an Incognito window.
   - Inspect Network tab to ensure `index-[hash].js` loaded matches the newly built asset hash (check `dist/assets/`).

---

## Phase 3: Identity Setup & Live Authentication

1. **Create Disposable Super Admin for Testing**:
   ```bash
   node scripts/provision-test-superadmin.js --email "super-test@projectdemo.guru"
   # Make sure you note the generated password.
   ```

2. **Authenticate Live via Firebase**:
   - Go to `https://airesume.projectdemo.guru/dashboard/login`
   - Sign in with `super-test@projectdemo.guru`
   - Immediately navigate to `/adm`

3. **Verify MFA/Reauth Requirement (Destructive Gate)**:
   - Wait 11 minutes (to expire `auth_time` age) OR forcibly expire local token.
   - Attempt to delete a disposable user.
   - **Expected Result**: Network request to `DELETE /api/admin/users/:id` returns `401 Unauthorized` with `require_reauth: true`. The UI prompts for password/MFA.

---

## Phase 4: Live E2E Elicitation & Network Audit

Run the authenticated Playwright suite targeting the live domain. You must export the test credentials first:
```bash
export E2E_LIVE_URL="https://airesume.projectdemo.guru"
export E2E_SUPER_ADMIN_EMAIL="super-test@projectdemo.guru"
export E2E_SUPER_ADMIN_PASSWORD="[YOUR_GENERATED_PASSWORD]"

npx playwright test tests/live-production-admin.spec.mjs --project=chromium
```

### Manual Network & Console Error Audit
Open Chrome DevTools -> Network and Console tabs on `/adm`.
1. Hard refresh (`Cmd+Shift+R`).
2. Verify **ZERO** `500 Internal Server Error` requests.
3. Verify **ZERO** `404 Not Found` requests for `/api/admin/*` paths.
4. Note any `401/403` and verify they are strictly from intentional boundary tests.

---

## Phase 5: Manual UI CRUD Matrix Verification

Execute these exact flows on `https://airesume.projectdemo.guru/adm`:

| Module | Action | Expected Result | Evidence Required |
| :--- | :--- | :--- | :--- |
| **Users** | Search for a specific user | Correct user appears, pagination works. | Screenshot of populated table. |
| **Users** | View User / Edit User | Drawer opens, exact details match Auth provider. | Network `200 OK` on `/api/admin/users/:id`. |
| **Users** | Change Role (Platform Admin) | Role is saved, confirmation toast appears. | Firestore `customClaims` mutated. |
| **Users** | Suspend / Reactivate User | Action succeeds, user status updates in UI. | Audit log event emitted. |
| **Tenants** | Create / Provision Tenant | Tenant appears in `/adm/tenants` table. | Firestore `/tenants` doc created. |
| **Tenants** | Decommission Tenant | Destructive modal forces typing name. Reauth triggers. | Tenant physically removed from DB. |
| **Queues** | View DLQ & Replay | DLQ list renders. Replaying fires request to queue backend. | Job state changes from `DEAD_LETTER` to `QUEUED`. |
| **Audit** | View Audit Logs | All previous actions appear sequentially with `SUCCESS` outcomes. | Table populated with severity pills. |
| **Settings** | Traverse ALL Tabs | No "Coming Soon" panels. No dead buttons. | Verify every form `Submit` fires a 20x. |
| **Role Bounds** | (As Platform Admin) Attempt DLQ Replay | Action explicitly blocked by UI / API. | Network `403 Forbidden` on `/api/admin/dlq/replay`. |

---

## Phase 6: Responsive UI Audit
Using Chrome Device Toolbar, resize the `/adm` window and verify:
- **1440x900**: Sidebar fixed on left, content grid full width.
- **1024x768**: Tables do not collapse data, horizontal scroll gracefully implemented if needed.
- **768x1024**: Sidebar collapses to hamburger menu.
- **390x844 / 375x667 (Mobile)**: Hamburger menu fully operational, Command Palette (`Cmd+K`) usable, no horizontal document overflow (`< 24px`).

---

## Phase 7: Post-Validation Cleanup & Rollback Drill

### Cleanup
Delete the disposable test data generated during the E2E verification:
```bash
node scripts/cleanup-test-data.js --email "super-test@projectdemo.guru"
```

### Rollback (If Verification Fails)
If *any* gate fails, execute the rollback drill immediately:
1. Revert PM2 instance to the previous known good SHA.
   ```bash
   git checkout [PREVIOUS_SHA]
   npm ci
   npm run build
   cd backend && npm ci
   pm2 restart ai-resume-backend
   ```
2. Monitor `pm2 logs` and `/api/healthz`.
3. If database schema was destructively altered (which is extremely rare for the Admin UI), restore the Firestore backup:
   ```bash
   gcloud firestore import gs://ai-resume-builder-424cf.firebasestorage.app/backups/deploy-1c3b0377
   ```

### Final Sign-Off
Only after all Live Production gates have passed, the operator may mark the final runbook status as **10/10 CERTIFIED**.
