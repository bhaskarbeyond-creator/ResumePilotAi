# USER Dashboard Complete User Journey Matrix

**Audit Date**: September 2, 2026  
**Auditor**: Product/UX Architect & QA Lead  
**Scope**: Verification of all 8 candidate user archetypes and end-to-end career flows.

---

## 1. Candidate User Archetypes Evaluated

| Archetype | Persona Goals | Primary Workflow | Discoverability Rating | Success Verification |
|---|---|---|---|---|
| **1. New User (First-Time Candidate)** | Needs to quickly import an existing PDF resume or build from scratch. | `Welcome / Sign Up` → `Dashboard` → `Career Command Center Step 1` → `Import / Build Resume` → `11 Steps` | 10/10 | Seamless guidance with Next Best Action prompt. |
| **2. Returning User** | Needs to review saved resumes, track ongoing job applications, and update details. | `Dashboard Login` → `My Resumes Grid` → `Search / Filter Tabs` → `Edit Resume` → `Job Tracker` | 10/10 | Real-time search, category tabs, and Kanban tracker. |
| **3. Career-Focused Optimizer** | Focused on maximizing ATS score and tailoring bullets for target job descriptions. | `Resume Builder` → `ATS Score Pill` → `AtsDrawer` → `STAR Bullet AI Assist` → `85%+ ATS Pass` | 10/10 | Live interactive feedback and JD keyword comparison. |
| **4. Active Job Seeker** | Looking for active job openings, applying directly, and generating custom cover letters. | `Dashboard` → `Browse Job Portal` → `Search by Role/Location` → `Apply` → `Cover Letter Builder` | 10/10 | Direct sidebar link, one-click application submission. |
| **5. Interview Prep Candidate** | Practicing for upcoming technical/behavioral screening with AI coach. | `Dashboard` → `AI Interview Coach` → `Select Resume` → `CBT Timed Exam` → `Detailed STAR Report` | 10/10 | Contextual question generation and instant scoring. |
| **6. Creative / Web CV Builder** | Showcasing project portfolios, GitHub repos, and sharing live link with recruiters. | `Dashboard` → `Portfolios & Web CV` → `Portfolio Builder` → `Theme Selection` → `Public URL` | 10/10 | 8 premium themes, custom slugs, zero auth leakage. |
| **7. Mobile Candidate (On-the-go)** | Accessing dashboard on smartphone (390px iPhone viewport). | `Mobile Drawer` → `Resume Cards` → `One-Click PDF/DOCX Download` → `Application Status Check` | 10/10 | Responsive swipe, touch-friendly CTA buttons (>44px). |
| **8. Security / Account Manager** | Enabling TOTP 2FA, changing password, revoking other sessions, exporting GDPR bundle. | `Dashboard` → `Settings` → `Security & 2FA Hub` → `RFC 6238 Setup` → `Audit Verification` | 10/10 | Real-time QR code, session revocation, export data. |

---

## 2. End-to-End Career Lifecycle Flow

```
[1. Profile & Settings] 
   └── Synced name, occupation, avatar, contact data across database.
[2. Resume Import / Creation]
   └── PDF/DOCX parsing into 11-step structured builder with autosave.
[3. ATS Optimization]
   └── Real-time scoring against STAR criteria and target JD keywords.
[4. High-Fidelity Preview & Download]
   └── 51 templates, instant interactive modal, PDF and DOCX exports.
[5. Job Portal Discovery]
   └── Search listings by role, seniority, salary, location, and work mode.
[6. Application & Tracking]
   └── 1-click apply, tracked in My Applications and Job Tracker Kanban.
[7. Tailored Cover Letter]
   └── 4 AI tones, custom recipient letters, PDF download.
[8. Portfolios & Web CV]
   └── Public showcase URLs for tech/design recruiters.
[9. AI Interview Practice]
   └── Timed CBT drills, performance rubrics, and feedback reports.
[10. Direct Employer Messages]
   └── Real-time messaging with hiring teams.
```
