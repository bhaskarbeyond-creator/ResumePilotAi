# RESUMEPILOT AI — FINAL UI/UX GAP REGISTER & REMEDIATION LEDGER

**Release Baseline:** `uat-release-2026-08-26-final`  
**Standard:** Zero-Trust Defect Forensics  
**Summary:** 8 Observed Real-World UX Anomalies Identified -> **8 Remediated & Verified** (0 Open Blockers)

---

## Defect Inventory & Forensic Remediation

### GAP-UI-01: OAuth-Authenticated Users Demanded Non-Existent Current Password
- **Severity:** P1 (High / Authentication UX)
- **Component:** `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx`
- **Root Cause:** `handleAccountSubmit` and Card 2 unconditionally assumed all users possessed a local password credential (`usesPasswordProvider`). Users who authenticated with Google OAuth were unable to set a local password because the UI demanded a current password that didn't exist.
- **Fix:** Implemented `userAuthProviders.includes('password')` detection. For OAuth users, render tailored "Create Account Security Password" interface without current password input. Allow creation of security password without modifying external OAuth provider account.
- **Regression Test:** `tests/oauth-password-security-ux.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-02: Live Preview Action Missing from Resume Card Action Menu
- **Severity:** P2 (Medium / Functional UX)
- **Component:** `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx`
- **Root Cause:** 3-dots action menu on resume cards in DashboardHomepage only listed Rename, Duplicate, and Delete, forcing users to click the preview thumbnail directly without explicit dropdown discovery.
- **Fix:** Added "Live Preview" action item to the 3-dots dropdown menu with `FaEye` icon, triggering `openDocumentPreview()` directly.
- **Regression Test:** `tests/live-preview-forensic.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-03: Modal Dialogs Failing to Dismiss on Global Escape Key Press
- **Severity:** P1 (High / Accessibility & UX)
- **Component:** `DashboardSettings.jsx`, `DashboardHomepage.jsx`, `EnterpriseConfirmModal.jsx`, `CompanyManagement.jsx`, `JobsManager.jsx`, `Reviews.jsx`, `adsSettings.jsx`, `TrustedBy.jsx`
- **Root Cause:** Handlers were attached only to outer `div.onKeyDown` rather than `window.addEventListener('keydown')`. When focus was not directly inside an input in the modal, pressing `Escape` was ignored by the browser.
- **Fix:** Implemented window-level `keydown` lifecycle event listeners across all modals, ensuring Escape dismisses the topmost modal regardless of current active focus element.
- **Regression Test:** `tests/modal-escape-keyboard-ux.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-04: Nested Template Preview Dismissal in TemplateSelectionModal
- **Severity:** P2 (Medium / Interaction UX)
- **Component:** `src/components/BuildResume/TemplateSelectionModal.jsx`
- **Root Cause:** Pressing `Escape` when viewing a specific template preview (`previewTemplate`) inside `TemplateSelectionModal` closed the entire modal instead of closing just the template preview.
- **Fix:** Updated `handleEscapeKey` to check `if (previewTemplate) { setPreviewTemplate(null); return; }` before calling `handleClose()`, establishing a two-stage dismissal hierarchy.
- **Regression Test:** `tests/modal-escape-keyboard-ux.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-05: Account Deletion and 2FA Disable Modals Blocked OAuth Users
- **Severity:** P1 (High / Account Lifecycle)
- **Component:** `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx`
- **Root Cause:** Delete Account Modal and Disable TOTP Modal required entering a password, preventing OAuth-only accounts from completing account deletion or 2FA management.
- **Fix:** Added conditional branching in modal bodies: password accounts require password verification; OAuth accounts use identity confirmation (`DELETE` text entry or OAuth re-auth) without demanding impossible passwords.
- **Regression Test:** `tests/oauth-password-security-ux.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-06: Mobile Resume Preview Drawer Transition Inconsistencies
- **Severity:** P2 (Medium / Mobile Responsiveness)
- **Component:** `src/components/BuildResume/BuildResume.jsx`
- **Root Cause:** Mobile preview drawer z-index and body overflow lock collided with step navigation overlays on small viewports (320px–390px).
- **Fix:** Synchronized `isMobilePreviewOpen` and `isMobileMenuOpen` with Escape key listeners, proper backdrop blur, and smooth framer-motion spring transitions.
- **Regression Test:** Viewport assertions across 9 responsive breakpoints.
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-07: In-Flight Network Action Escape Key Interception
- **Severity:** P3 (Low / Data Safety)
- **Component:** `EnterpriseConfirmModal.jsx`, `CompanyManagement.jsx`, `JobsManager.jsx`
- **Root Cause:** Pressing Escape while a destructive API call was actively in-flight could close the UI dialog before the backend transaction finalized, leaving the user in an uncertain state.
- **Fix:** Added `!busy` / `!isProcessing` guards to all global Escape listeners, ensuring in-flight actions cannot be accidentally cancelled or orphaned.
- **Regression Test:** `tests/modal-escape-keyboard-ux.test.mjs`
- **Status:** **CLOSED & VERIFIED**

---

### GAP-UI-08: Skill Object Schema Normalization for Legacy Resume Templates
- **Severity:** P2 (Medium / Rendering Integrity)
- **Component:** `src/components/BuildResume/BuildResume.jsx`, `src/utils/resumeData.js`
- **Root Cause:** Newer AI operations produce skills with `{ skillName, rating }`, whereas older templates expected `{ name, rating }` or plain strings, causing preview rendering glitches on certain templates.
- **Fix:** Centralized `normalizeResumeData` and `previewData` memoization to map `{ skillName, name }` seamlessly across all 51 template renderers.
- **Regression Test:** `tests/live-preview-forensic.test.mjs`
- **Status:** **CLOSED & VERIFIED**
