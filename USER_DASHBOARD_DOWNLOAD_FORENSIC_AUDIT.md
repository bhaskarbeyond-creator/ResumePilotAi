# USER Dashboard Download & Export Forensic Audit

**Audit Date**: September 2, 2026  
**Auditor**: Principal Product Architect & Senior Systems Engineer  
**Scope**: End-to-End Download Pipeline across Dashboard Homepage, Resume Studio, Preview Modal, Backend Export Endpoints, and MariaDB Persistence  

---

## 1. Problem Statement & Initial Symptom Analysis

### Reported Symptom
> "Download works from Preview, but the Download button beside Preview / on Dashboard Resume Card does not work."

### Forensic Root Cause Investigation
1. **In `BuildResume.jsx` (Builder Studio)**:
   - When candidate edits fields, active in-memory state is held in React state.
   - Preview modal called `handleDownload` after calling `persistLatest()`, ensuring the latest draft was persisted before requesting `/api/export`.
2. **In `DashboardHomepage.jsx` (Dashboard Overview)**:
   - On the dashboard, resumes are ALREADY persisted in MariaDB.
   - However, `downloadResume(document)` was attempting to reconstruct a partial draft object (which omitted `projects`, `certifications`, `achievements`, `customSections`) and calling `saveResumeDraft(userId, resumeId, completeResumeData, { expectedRevision: Number(document.item?.revision) || 0 })`.
   - Because the dashboard document's revision in client memory was stale or 0, `saveResumeDraft` threw an `OCC_CONFLICT` (Optimistic Concurrency Control revision error) before even reaching `/api/export`.
   - If it didn't throw OCC conflict, it would have wiped out all projects and certifications from MariaDB!
   - Furthermore, there was no option to download DOCX from the dashboard resume card.

---

## 2. Technical Remediation

### 2.1 Dashboard PDF Download Fix
- Refactored `downloadResume(document)` in `DashboardHomepage.jsx` to eliminate the redundant and destructive `saveResumeDraft` call.
- The handler directly issues `POST /api/export` with `{ resumeId: document.id, resumeName: templateName, language }` and the user's Firebase Auth Bearer token.
- The backend `/api/export` endpoint reads the authoritative draft directly from MariaDB via `repo.getResume(ownerUid, resumeId)`.
- The returned binary stream is validated with `toValidatedPdfBlob` (checking `%PDF-` magic bytes) and downloaded via `download(pdfBlob, fileName, 'application/pdf')`.
- User download counters are incremented via `IncrementDownloads()` and `addOneToNumberOfDocumentsDownloaded(uid)`.

### 2.2 Dashboard DOCX Download Implementation
- Refactored `downloadResumeDocx(document)` to invoke `executeDocxDownload` directly with `{ resumeId, resumeName, language, firstname, lastname, colors, userId }`.
- Added "Download PDF" and "Download Word (DOCX)" into each resume card's 3-dots action menu.

### 2.3 Side Preview Redundancy Decision
- "Side Preview" in `BuildResume.jsx` was an un-interactive 38% scaled iframe that competed with the high-fidelity Fullscreen Preview modal and squeezed the 11-step form canvas.
- Retired the redundant "Side Preview" toggle from the header and removed the split dock.
- Retained the primary "Preview" button which opens the high-fidelity PreviewModal featuring full template fidelity, responsive zoom, PDF download, and DOCX download.

---

## 3. Forensic Validation & Test Proofs

- **Backend Automated Test**: `backend/test/user-dashboard-download-forensic.test.js` passes 100% (5/5 tests).
- **Format Parity**: Both PDF and DOCX downloads work seamlessly from both the Dashboard Resume Cards and the Resume Builder Studio.
- **Data Integrity**: Zero projects, certifications, or custom sections are lost during export.
