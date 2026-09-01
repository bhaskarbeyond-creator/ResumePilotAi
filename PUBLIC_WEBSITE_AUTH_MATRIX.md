# PUBLIC WEBSITE AUTHENTICATION & GATING MATRIX
**Environment**: `https://ai-resume-builder.local/`  
**Test Suite**: `scripts/verify-final-ux-remediation.mjs`

| Test ID | User State / Role | Action Executed | Expected Behavior | Actual Behavior | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | Anonymous Visitor | Clicks "Log In" in Navbar | Opens Modal in Sign In Mode | `<Login />` rendered with Email & Password | **PASS** | `isLoggedInShowed: true` |
| **AUTH-02** | Anonymous Visitor | Clicks "Get Started" in Navbar / Hero | Opens Modal in Register Mode | `<Register />` rendered with "Create Account" | **PASS** | `isLoggedInShowed: false` |
| **AUTH-03** | Anonymous Visitor | Clicks "Preview" on Template Card | Opens Preview Inspection Modal | Modal displays format details without login | **PASS** | `.rp-modal-container` visible |
| **AUTH-04** | Anonymous Visitor | Clicks "Use This Template" on Card | Triggers Registration Gate | Auth Modal opens with "Create free account" | **PASS** | `.authModal` visible |
| **AUTH-05** | Anonymous Visitor | Navigates directly to `/build-resume/heading` | Enforces Route Protection | Redirects to `/login?next=/build-resume/heading` | **PASS** | URL query parameter set |
| **AUTH-06** | Authenticated User | Visits Homepage (`/`) | Contextual Navbar & Hero CTAs | Navbar shows "My Dashboard", Hero says "Resume Studio" | **PASS** | `#rp-nav-dashboard-link` active |
| **AUTH-07** | Authenticated User | Clicks "Use Template" on Template Card | Direct Navigation | Navigates to `/build-resume/heading?template=Cv1` (0 popups) | **PASS** | `navigate()` called directly |
| **AUTH-08** | Authenticated User | Logs Out | Session Destroyed | Homepage immediately returns to Anonymous State | **PASS** | `onAuthStateChanged(null)` |
