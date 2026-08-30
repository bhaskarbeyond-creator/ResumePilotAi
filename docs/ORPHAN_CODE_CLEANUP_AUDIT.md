# ORPHAN CODE CLEANUP AUDIT

> **Audit Date**: 2026-08-30 | **HEAD SHA**: `b6ec79b`

---

## Confidence Legend
- 🟢 SAFE TO REMOVE — No runtime, route, dynamic, build, config, or test dependency
- 🟡 LIKELY ORPHAN — Evidence suggests unused but uncertainty remains
- 🔴 DO NOT REMOVE — Has valid runtime/config/build/external dependency
- 🔵 UNKNOWN — Insufficient evidence

---

## Orphan Code Register

| ID | Type | Path | Symbol | Why Suspected Orphan | Runtime References | Build References | Config References | Test References | Dynamic Risk | Confidence | Recommended Action | Owner |
|----|------|------|--------|---------------------|-------------------|-----------------|-------------------|----------------|-------------|-----------|-------------------|-------|
| ORPHAN-001 | React Component | src/components/Front/Front.jsx | Front | Legacy class component rendering only "front"; /front route redirects to / | 0 imports found | None | None | None | None | 🟢 SAFE TO REMOVE | Delete after review | LOCAL DEVELOPER |
| ORPHAN-002 | JS Script | src/capture_templates.js | capture_templates | Standalone script; no imports found in any src file | 0 imports | None | None | None | None | 🟢 SAFE TO REMOVE | Delete after review | LOCAL DEVELOPER |
| ORPHAN-003 | PHP File | nvidia-proxy.php | nvidia-proxy | Legacy PHP proxy for NVIDIA API; AI now uses Node.js backend | 0 references in JS/JSX/JSON | None | None | None | Possible Apache proxy rule | 🟡 LIKELY ORPHAN | Check Apache config then delete | LOCAL DEVELOPER |
| ORPHAN-004 | CJS Script | compare-apis.cjs | compare-apis | Dev utility; not referenced in package.json scripts or any import | 0 imports | None | Not in any npm script | None | None | 🟢 SAFE TO REMOVE | Delete after review | LOCAL DEVELOPER |
| ORPHAN-005 | CJS Script | test-regex.cjs | test-regex | Dev utility; not referenced anywhere | 0 imports | None | Not in any npm script | None | None | 🟢 SAFE TO REMOVE | Delete after review | LOCAL DEVELOPER |
| ORPHAN-006 | MJS Script | e2e-smoke.mjs | e2e-smoke | Standalone E2E script; not in package.json scripts | 0 imports | None | Not in any npm script | None | Might be manually run | 🟡 LIKELY ORPHAN | Verify with developer then delete | LOCAL DEVELOPER |
| ORPHAN-007 | HTML File | src/index.html | src/index.html | Vite uses root index.html, not src/index.html | 0 references | Not in vite.config.js | None | None | None | 🟢 SAFE TO REMOVE | Delete after review | LOCAL DEVELOPER |
| ORPHAN-008 | SSH Key | dev_key | dev_key | Developer SSH private key; should never be in repo | 0 code references | None | None | None | May be used by deploy scripts | 🟡 LIKELY ORPHAN | MUST REMOVE (security risk); rotate key | SECURITY ENGINEER |
| ORPHAN-009 | SSH Key | dev_key.pub | dev_key.pub | Developer SSH public key; should not be in repo | 0 code references | None | None | None | May be used by deploy scripts | 🟡 LIKELY ORPHAN | MUST REMOVE (security risk); rotate key | SECURITY ENGINEER |
| ORPHAN-010 | JS File | backend/test-routes.js | test-routes | Backend test routes file; not imported by index.js | 0 imports in index.js | None | None | None | Might be manually required | 🔵 UNKNOWN | Verify with developer | LOCAL DEVELOPER |
| ORPHAN-011 | JS File | backend/reset-pwd.js | reset-pwd | Standalone password reset script | 0 imports | None | None | None | Might be manually run | 🔵 UNKNOWN | Verify with developer | LOCAL DEVELOPER |
| ORPHAN-012 | PDF File | hn.pdf + backend/hn.pdf | hn.pdf | Test PDF file; appears in both root and backend | 0 code references | None | None | Possible test fixture | None | 🔵 UNKNOWN | Verify if test fixture then remove from root | LOCAL DEVELOPER |

---

## NOT Orphans (False Positive Analysis)

| Path | Why NOT an Orphan | Evidence |
|------|-------------------|----------|
| src/components/Dashboard2/ | Dashboard2 elements (HomepageNavbar, HomepageFooter, etc.) are shared layout components imported by 15+ files | MainJobListings, CreateJob, Features, JobsLanding, Contact, BlogList, BlogPost, BlogEditor, CustomePage, Plans, PortfolioBuilder |
| src/components/Analytics.jsx | Imported by Welcome.jsx, ActionSelection.jsx, ActionFilling.jsx | grep confirms 3 consumers |
| src/components/Boards/ | Imported by Welcome.jsx | Board component renders the homepage flow |
| src/components/initailisation/ | initialisationWrapper imported by Welcome.jsx; initialisationSetup imported by initialisationWrapper | Part of first-run setup flow |
| src/utils/facebookSdkAuth.js | Imported by useOAuthSignIn.js, Login.jsx, Register.jsx | Active OAuth integration |
| src/utils/googleSdkAuth.js | Imported by useOAuthSignIn.js, Login.jsx, Register.jsx | Active OAuth integration |

---

## Safe Cleanup Waves

### WAVE 1 — VERY HIGH CONFIDENCE SAFE (Immediate)
| ID | File | Action |
|----|------|--------|
| ORPHAN-001 | src/components/Front/Front.jsx | Delete |
| ORPHAN-002 | src/capture_templates.js | Delete |
| ORPHAN-004 | compare-apis.cjs | Delete |
| ORPHAN-005 | test-regex.cjs | Delete |
| ORPHAN-007 | src/index.html | Delete |

### WAVE 2 — SAFE AFTER SECONDARY SEARCH
| ID | File | Action |
|----|------|--------|
| ORPHAN-006 | e2e-smoke.mjs | Verify no manual usage then delete |
| ORPHAN-008 | dev_key | MUST REMOVE + rotate key |
| ORPHAN-009 | dev_key.pub | MUST REMOVE + rotate key |

### WAVE 3 — HUMAN REVIEW REQUIRED
| ID | File | Action |
|----|------|--------|
| ORPHAN-003 | nvidia-proxy.php | Check Apache config for proxy rules |
| ORPHAN-010 | backend/test-routes.js | Verify with backend developer |
| ORPHAN-011 | backend/reset-pwd.js | Verify if operational utility |
| ORPHAN-012 | hn.pdf (root + backend) | Verify if test fixture |

### WAVE 4 — DO NOT TOUCH
No items identified for this wave.

---

## Root-Level File Audit

| File | Purpose | Status |
|------|---------|--------|
| .htaccess | Apache SPA routing | 🟢 ACTIVE |
| index.html | Vite entry point | 🟢 ACTIVE |
| vite.config.js | Build configuration | 🟢 ACTIVE |
| tailwind.config.js | Tailwind configuration | 🟢 ACTIVE |
| eslint.config.js | Linting rules | 🟢 ACTIVE |
| ecosystem.config.js | PM2 process definition | 🟢 ACTIVE |
| firebase.json | Firebase configuration | 🟢 ACTIVE |
| package.json | NPM dependencies and scripts | 🟢 ACTIVE |
| start-local.bat | Local dev startup | 🟢 ACTIVE |
| compare-apis.cjs | Dev utility | 🟡 ORPHAN |
| create-user.cjs | Dev utility | 🔵 UNKNOWN (may be operational tool) |
| test-regex.cjs | Dev utility | 🟡 ORPHAN |
| e2e-smoke.mjs | Standalone E2E | 🟡 ORPHAN |
| nvidia-proxy.php | Legacy PHP proxy | 🟡 ORPHAN |
| dev_key | SSH private key | 🔴 SECURITY RISK |
| dev_key.pub | SSH public key | 🔴 SECURITY RISK |
| hn.pdf | Test PDF | 🔵 UNKNOWN |
| database-debug.log | Debug log file | 🟡 Should be gitignored |
| firestore-debug.log | Debug log file | 🟡 Should be gitignored |
| test-output.txt | Test output | 🟡 Should be gitignored |
| enterprise_*.png | Evidence screenshots | 🟡 Should move to docs/ |
| local_verification_success.png | Evidence screenshot | 🟡 Should move to docs/ |

---

## Unused Dependencies Analysis

| Package | Imported? | Verdict |
|---------|-----------|---------|
| @puckeditor/core | Needs verification | 🔵 UNKNOWN — may be used dynamically |
| @types/dompurify | TypeScript types only | 🟢 KEEP — provides type safety |
| lottie-react | Needs verification | 🔵 UNKNOWN — check for animation usage |
| mammoth | Used in resume import | 🟢 KEEP — DOCX parsing |
| qrcode | Used in portfolio/sharing | 🟢 KEEP — QR generation |
| react-lazy-load-image-component | Used in templates | 🟢 KEEP |
| react-transition-group | Used in animations | 🟢 KEEP |
| playwright (backend) | Used for PDF export | 🟢 KEEP — critical for export |

---

## Dead Environment Variables

| Variable | Status | Evidence |
|----------|--------|---------|
| VITE_FIREBASE_DOMAIN | 🟢 ACTIVE | Used in Firebase config |
| FIREBASE_USE_ADC | 🟢 ACTIVE | Controls Firebase Admin auth |
| TRUST_PROXY_HOPS | 🟡 OPTIONAL | Only needed behind load balancer |
| PDF_RENDERER_ISOLATED | 🟡 UNUSED | No code reads this currently |

---

## Dead Feature Flags

| Flag | Status | Evidence |
|------|--------|---------|
| CMS_SCHEDULER_ENABLED | 🟡 PERMANENTLY DISABLED | Code exists but flag never enabled in production |
| TENANT_GC_WORKER_ENABLED | 🟡 PERMANENTLY DISABLED | Enterprise tenancy is off |
| ENTERPRISE_OUTBOX_WORKER_ENABLED | 🟡 PERMANENTLY DISABLED | Enterprise tenancy is off |

---

## Summary

| Category | Count |
|----------|-------|
| Total Orphan Candidates | 12 |
| 🟢 Safe to Remove | 5 |
| 🟡 Likely Orphan (Review) | 4 |
| 🔵 Unknown | 3 |
| 🔴 Do Not Remove | 0 |
| Security-Risk Files | 2 (dev_key, dev_key.pub) |
