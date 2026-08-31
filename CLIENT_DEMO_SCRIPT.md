# ResumePilot AI — Client Live Demonstration Script

**Document Purpose:** Complete, step-by-step production demonstration guide for client presentations, executive pitches, and enterprise buyer evaluations.  
**Target Environment:** `https://airesume.projectdemo.guru` (or local development instance `http://localhost:5173`)  
**Recommended Persona:** Senior Engineering Candidate / Career Coach / Enterprise Talent Administrator  

---

## 1. Demo Preparation & Prerequisites

### Verification Checklist:
- [ ] Ensure browser is opened in a clean Chrome/Edge profile (1920x1080 resolution recommended).
- [ ] Verify test account credentials:
  - **Standard User Demo:** `demo.candidate@resumepilot.ai` (or quick 1-click registration).
  - **Admin / Super Admin Demo:** Authenticated Admin account with TOTP MFA configured.
- [ ] Have a sample Job Description text snippet ready on your clipboard (e.g. *Senior Full-Stack Cloud Engineer* posting).
- [ ] Have a sample 2-sentence rough work note ready (e.g. *"led the migration of our monolithic backend to node microservices reducing latency by 40%"*).

---

## 2. Step-by-Step Live Walkthrough Flow

### Step 1: Landing Page & Brand Experience
- **URL:** `/`
- **Action:** Open the home page. Scroll smoothly through the hero section, live feature carousels, ATS value proposition, and template showcase.
- **Presenter Talking Point:**
  > *"Welcome to ResumePilot AI. ResumePilot AI is an enterprise-grade career intelligence ecosystem built not just to format resumes, but to empower candidates with grounded AI content creation, deterministic ATS compliance scoring, computer-based interview coaching, and interactive WebCV portfolios."*
- **Visual Highlight:** Modern dark/light glassmorphic styling, responsive layout, and clean typography.

---

### Step 2: Frictionless Onboarding & User Dashboard
- **URL:** `/login` → `/dashboard`
- **Action:** Sign in using email/password or Google OAuth. Land on the main user dashboard.
- **Presenter Talking Point:**
  > *"Upon logging in, users arrive at their central career workspace. From here, candidates can manage multiple tailored resume versions, track active job applications in their personal Kanban board, practice role-specific interviews, and launch their personal WebCV portfolio."*
- **Visual Highlight:** Recent resumes grid, ATS readiness indicators, quick action buttons, and clean navigation sidebar.

---

### Step 3: Guided Resume Builder & Factual Input
- **URL:** `/build-resume/heading`
- **Action:** Click **"Create New Resume"** or select an existing draft. Walk through the step wizard:
  1. **Heading Step:** Enter candidate contact details (City, Email, LinkedIn, GitHub).
  2. **Work History Step:** Add a role (e.g., *Lead Software Engineer* at *Acme Cloud Systems*). Enter the rough draft sentence in the notes box.
- **Presenter Talking Point:**
  > *"Our builder guides candidates through a structured, multi-step process. Notice that rather than generating generic, ungrounded resumes from scratch, our system is anchored entirely in the user's verified career facts."*

---

### Step 4: Live AI Grounded Content Generation
- **URL:** `/build-resume/work-history` & `/build-resume/summary`
- **Action:**
  1. Click **"Enhance with AI"** or **"Generate Bullets"** on the work experience card.
  2. Watch the sub-second generation transform the rough note into 3 quantifiable, action-verb-led achievement bullets.
  3. Navigate to **Summary Step** and click **"Generate Professional Summary"**.
- **Presenter Talking Point:**
  > *"Watch how our multi-provider AI engine rewires the candidate's actual responsibilities into high-impact, quantifiable bullets starting with strong action verbs like 'Architected' and 'Streamlined'. Our zero-hallucination rules ensure the model never invents fake metrics or fictitious employers."*
- **Visual Highlight:** Animated processing modal, rotating tips, instant insertion into rich text editor.

---

### Step 5: Real-Time ATS Readiness Meter & Job Description Matching
- **URL:** `/build-resume/skills` & `/build-resume/finalize`
- **Action:**
  1. Point to the **ATS Score Meter** fixed in the builder header (e.g., *Score: 88/100 • Strong*).
  2. Open the ATS Breakdown drawer to show the 7 weighted categories (Contact, Summary, Experience, Education, Skills, Evidence, Integrity).
  3. Paste the sample Job Description into the **Target Job Description** input.
  4. Point out the real-time **Target JD Match Score**, matched keyword badges (e.g., `Node.js`, `Docker`, `PostgreSQL`), and missing keyword recommendations.
  5. Click one of the 1-click improvement tips (e.g., *"Add 'Kubernetes' to Skills"*), and observe the builder automatically navigate to the Skills step.
- **Presenter Talking Point:**
  > *"Unlike basic tools that provide arbitrary scores, ResumePilot AI features a deterministic, client-side ATS readiness engine. It analyzes lexical diversity, flags keyword stuffing, verifies employment date chronology, and directly parses the candidate's target job posting to reveal exact matching and missing requirements."*

---

### Step 6: 51-Template Switching & Design Customization
- **URL:** `/build-resume/finalize` → Template Modal
- **Action:**
  1. Click **"Change Template"** to open the 51-template gallery modal.
  2. Filter by category (e.g. *Executive*, *Modern Split*, *Minimal ATS*, *Europass*).
  3. Switch between 2 distinct templates (e.g., `Cv1 Modern Navy` and `Cv50 Right-Sidebar Split`).
  4. Change the primary accent palette and observe how WCAG AA contrast auto-adjusts header text between white and slate for optimal legibility.
- **Presenter Talking Point:**
  > *"ResumePilot AI features 51 distinct, professionally designed resume templates. Every template is engineered for ATS compliance, with intelligent page partitioning that guarantees clean page breaks without orphaned headers."*

---

### Step 7: Dual-Engine Export (Pixel-Perfect PDF & Native DOCX)
- **URL:** `/build-resume/finalize`
- **Action:**
  1. Click **"Download PDF"** → High-resolution PDF downloads instantly. Open in a new tab to showcase typography and margins.
  2. Click **"Download Word (.docx)"** → Native Microsoft Word document downloads. Open in Microsoft Word to demonstrate authentic editable headers, styled tables, and matching color schemes.
- **Presenter Talking Point:**
  > *"For corporate recruiters who require editable Word documents, our proprietary DOCX high-fidelity export pipeline generates native OOXML Word files that mirror the exact typography, colors, and layout structure of our web templates."*

---

### Step 8: AI Interview Coach & CBT Exam Simulator
- **URL:** `/dashboard/interviews`
- **Action:**
  1. Select target role (e.g. *Fullstack Engineer*) and focus track (e.g. *Technical Scenario*). Set difficulty to *Hard*.
  2. Click **"Start Interview Assessment"**.
  3. Showcase the Computer-Based Testing (CBT) environment: active countdown timer, question navigation palette, answer selection, and question bookmarking/flagging.
  4. Submit exam and review the **Performance Scorecard**: category radar, percentage score, passing status, detailed explanations, and STAR response frameworks.
- **Presenter Talking Point:**
  > *"Beyond static documents, ResumePilot AI prepares candidates for the actual hiring room. Our AI Interview Coach creates contextual, role-calibrated interview simulations with zero robotic prompt leakage, complete with countdown timers and instant analytical feedback."*

---

### Step 9: WebCV Portfolio Studio & Public Projection
- **URL:** `/portfolio/builder` → `/portfolio/demo-slug`
- **Action:**
  1. Open the Portfolio Studio showing customizable project cards, skill proficiency bars, and bio layout.
  2. Click **"View Live Portfolio"** to open the public vanity URL (`/portfolio/demo-slug`).
- **Presenter Talking Point:**
  > *"Candidates can instantly transform their resume into an interactive digital portfolio website with custom slugs, dark/light themes, and project showcases."*

---

### Step 10: Super Admin Console & AI Multi-Provider Switcher
- **URL:** `/adm/dashboard` & `/adm/settings?tab=aiSettings`
- **Action:**
  1. Navigate to `/adm` and showcase the Super Admin Console with live platform health monitor.
  2. Open the **AI Settings** tab: show live multi-provider toggles (NVIDIA NIM, Gemini, OpenAI, Groq, DeepSeek).
  3. Click **"Test Connection"** next to NVIDIA NIM or Gemini to show live real-time API latency and status validation.
- **Presenter Talking Point:**
  > *"Platform administrators maintain complete sovereignty over the AI infrastructure. Administrators can hot-swap between AI providers, configure custom models, and set granular user quotas with zero downtime."*

---

### Step 11: Enterprise Multi-Tenancy & Governance
- **URL:** `/enterprise`
- **Action:**
  1. Open the Enterprise Console.
  2. Showcase tenant isolation, user management, workspace assignments, AES-256-GCM encrypted audit logs, and automated backup/restore tools.
- **Presenter Talking Point:**
  > *"For staffing firms, universities, and enterprise talent organizations, our Enterprise Console provides 100% data isolation, multi-tenant workspace governance, DLQ outbox reliability, and cryptographic compliance."*

---

## 3. Presenter Contingency & FAQ Guide

| Potential Scenario | Recommended Talking Point / Backup Action |
| :--- | :--- |
| **Upstream AI Latency Spike** | *"Our platform features automated provider failover and seeded fallback engines that guarantee continuous operation even if an external AI API experiences temporary latency."* (Generation will resolve via failover). |
| **Why Not Unconditional Whole-Resume Generation?** | *"We deliberately enforce grounded AI generation based on verified candidate facts. Unconstrained AI resume generation frequently invents fictitious work histories and hallucinated credentials that fail basic employer background checks."* |
| **Is User Data Shared with Third-Party Models?** | *"No. All API requests are processed server-side with zero data retention, and enterprise tenant data is encrypted at rest using AES-256-GCM."* |

---

*Certified for live client and stakeholder demonstrations.*
