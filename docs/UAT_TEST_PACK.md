# RESUMEPILOT AI — UAT TEST PACK & TEST CASE CATALOG
## Standardized User Acceptance Testing Procedures

**Target Live URL**: `https://airesume.projectdemo.guru`  
**Authoritative Release Tag**: `uat-release-2026-08-26`  
**Master Cryptographic SHA**: `d5610a54028209242b7d54ef9b852948ca303d10`  
**Audience**: UAT Test Engineers, Business Stakeholders & SRE Release Team  

---

### TEST CASE 1: Candidate End-to-End Resume Lifecycle
- **Identifier**: `TC-UAT-CANDIDATE-01`
- **Objective**: Verify candidate can build, preview, download, and publish a multi-page resume across templates.
- **Steps**:
  1. Navigate to `/login` and sign in as candidate user.
  2. Click **Create New Resume** and select template **Cv1 (Modern Emerald)**.
  3. In **Personal Details**, enter Name, Email, Phone, Address, City, Country, LinkedIn, GitHub.
  4. In **Experience**, add 2 employment positions with bullet points.
  5. In **Education**, add degree, university, and dates.
  6. In **Summary**, click **Generate with AI** and verify contextual summary populates.
  7. Navigate to **Download** tab: click **Download PDF** and **Download DOCX**.
  8. Click **Publish WebCV** and verify public URL `/pb/{resumeId}` opens in incognito window.
- **Expected Outcome**: PDF and DOCX files download cleanly with accurate formatting; public link renders without authentication.

---

### TEST CASE 2: Employer Job Posting & Candidate Application Flow
- **Identifier**: `TC-UAT-EMPLOYER-01`
- **Objective**: Verify employer can set up company branding, post a job, and manage candidate applicants.
- **Steps**:
  1. Sign in with employer credentials.
  2. Navigate to **Company Profile**: upload logo, company name, and industry.
  3. Navigate to **Post a Job**: enter title "Senior Full Stack Engineer", salary, location "Remote", and required skills.
  4. Click **Publish Job**.
  5. As a separate candidate user, navigate to `/jobs`, search for the posted job, and click **Apply with Resume**.
  6. Return to employer account $\to$ open **Applicant Pipeline**: verify candidate submission appears with resume preview.
- **Expected Outcome**: Job is searchable immediately; applicant CV renders clearly in employer pipeline.

---

### TEST CASE 3: AI Interview Coach & CBT Simulator
- **Identifier**: `TC-UAT-INTERVIEW-01`
- **Objective**: Verify interactive mock interview coaching session with real-time AI feedback.
- **Steps**:
  1. Sign in as candidate $\to$ navigate to `/dashboard/interviews`.
  2. Click **Start New Interview**: select target role "Frontend Engineer" and difficulty "Senior".
  3. Answer question 1 using text input or voice speech-to-text.
  4. Complete 5 structured questions.
  5. Submit interview for comprehensive grading.
- **Expected Outcome**: Processing modal displays 5-stage progress indicator; feedback report renders technical score, strengths, improvement areas, and STAR analysis.

---

### TEST CASE 4: Enterprise Multi-Tenant Isolation
- **Identifier**: `TC-UAT-ENTERPRISE-01`
- **Objective**: Verify zero cross-tenant data leakage between two distinct enterprise organizations.
- **Steps**:
  1. Sign in as **Enterprise Admin A** (Tenant A: `tenant-alpha`).
  2. Create workspace "Engineering" and add confidential resource "Q3 Roadmap".
  3. Sign in as **Enterprise Admin B** (Tenant B: `tenant-beta`).
  4. Search for "Q3 Roadmap" and attempt direct API access to Tenant A resource ID.
- **Expected Outcome**: Tenant B search returns 0 results; direct API access returns `404 TENANT_RESOURCE_NOT_FOUND`. 100% cryptographic and structural isolation preserved.

---

### TEST CASE 5: Super Admin Dual-Database Control & 100% Parity Gate
- **Identifier**: `TC-UAT-SUPERADMIN-01`
- **Objective**: Verify database engine switching gate enforces 100% parity and requires TOTP step-up authentication.
- **Steps**:
  1. Sign in as Super Admin $\to$ enter TOTP MFA verification code.
  2. Navigate to **Control Plane** $\to$ **Platform Operations** / **Database Engine**.
  3. View live database status: verify MySQL is Primary and Firestore is Standby.
  4. Click **Verify Continuous Parity**: verify all 13 entities report 100% parity.
  5. Test normal engine switch simulation: verify switch occurs with zero data loss.
- **Expected Outcome**: Database switch executes smoothly; audit trail logs actor UID and cryptographic hash.

---

### TEST CASE 6: Payment Gateway & Subscription Upgrade (Sandbox)
- **Identifier**: `TC-UAT-PAYMENT-01`
- **Objective**: Verify subscription upgrade checkout flow with coupon discount.
- **Steps**:
  1. Sign in as candidate user $\to$ navigate to `/pricing`.
  2. Select **PRO Plan** $\to$ click **Upgrade**.
  3. In checkout modal, enter promo code `WELCOME10` $\to$ verify 10% discount applies immediately.
  4. Complete payment using sandbox gateway test credentials.
  5. Verify user membership badge transitions from `Basic` $\to$ `PRO`.
- **Expected Outcome**: Payment succeeds; invoice appears in `/dashboard/transactions`; user profile reflects active PRO subscription.
