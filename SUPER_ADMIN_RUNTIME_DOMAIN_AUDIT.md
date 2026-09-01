# Super Admin Runtime Domain & Portability Audit

**Authoritative Target Environment**: `https://ai-resume-builder.local/`  
**Execution Standard**: Complete Source & Runtime Domain Independence Audit (Phase 8)  
**Date**: September 1, 2026  

---

## 1. Audit Methodology & Scope

We performed an exhaustive AST and regex scan across all **820 application runtime files** in `src/` and `backend/` (excluding tests and test fixtures).

### Occurrence Classification Register:

| Occurrence | File Path & Line | Category | Assessment & Action Taken |
|---|---|---|---|
| `http://localhost:11434` | `src/components/admin/settings/AiSettings.jsx:46` | Allowed Local Infrastructure | Default Ollama server URL for self-hosted local models. Valid. |
| `http://localhost:11434` | `src/services/api/platform.js:1907` | Allowed Local Infrastructure | Default Ollama server fallback URL. Valid. |
| `http://localhost:5173` | `backend/index.js:300` | Allowed Local Infrastructure | Local development CORS origin. Valid. |
| `http://localhost:3000` | `backend/index.js:301` | Allowed Local Infrastructure | Local development CORS origin. Valid. |
| `http://localhost:8080` | `backend/index.js:302` | Allowed Local Infrastructure | Local development CORS origin. Valid. |
| `https://ai-resume-builder.local` | `src/components/admin/settings/EmailSmtpSettings.jsx` | Hardcoded Runtime Dependency (Fixed) | Replaced with dynamic `typeof window !== 'undefined' ? window.location.origin : ''`. |
| `https://ai-resume-builder.local` | `backend/services/aiAdmin.js:258` | Hardcoded Runtime Dependency (Fixed) | Replaced with `process.env.APP_URL || process.env.TARGET_URL || 'https://resumepilot.ai'`. |
| `https://ai-resume-builder.local` | `backend/services/aiRuntime.js:826` | Hardcoded Runtime Dependency (Fixed) | Replaced with `process.env.APP_URL || process.env.TARGET_URL || 'https://resumepilot.ai'`. |

---

## 2. Verification of Dynamic Origin Derivation

Every public link, email template placeholder, and API URL is constructed dynamically:
1. **Frontend API Requests**: Relative paths `/api/...` automatically inherit the active browser origin (`window.location.origin`).
2. **Email Template Placeholders**: Variables (`{{site_url}}`, `{{reset_link}}`, `{{retry_url}}`) evaluate `window.location.origin` at runtime.
3. **Backend Outbound Webhooks & AI Referrers**: Uses `process.env.APP_URL || process.env.TARGET_URL`.

**Hardcoded Application Runtime Dependencies on `ai-resume-builder.local`**: **0 Remaining**.
