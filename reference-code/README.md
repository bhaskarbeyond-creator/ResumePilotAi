# Reference Code — Live Hostinger Snapshot (ime365.com)

> **STRICT IMMUTABILITY POLICY:**
> **DO NOT EDIT, MODIFY, OVERWRITE, OR ALTER ANY FILE IN THIS DIRECTORY.**
> This folder is strictly a read-only historical and comparative baseline downloaded from the live Hostinger production server.

---

### Snapshot Metadata
- **Origin Server:** `in-mum-web1641.main-hosting.eu` (`82.112.232.112`)
- **Remote Host User:** `u727965524`
- **Download Timestamp:** 2026-10-25 05:15:00 IST
- **Live Deployed Commit SHA:** `24ada353ad96a48ea4a2d46320e7c757d5671695` (`backend/COMMIT_SHA`)
- **Live Running Process:** `node /home/u727965524/backend/index.js` (PID 1167312)

---

### Directory Contents
1. `backend/`:
   Live production backend source tree from `/home/u727965524/backend/` (routes, services, database schemas, helpers, enterprise modules, and `backend/.env`). Excludes transient `node_modules/` and build artifacts (`dist/`).
2. `public_html/`:
   Live production frontend web root from `/home/u727965524/domains/ime365.com/public_html/` (Vite build, assets, `.htaccess`, icons, and PHP API routing bridges).
3. `ecosystem.config.js`:
   Server process manager configuration from `/home/u727965524/ecosystem.config.js`.
4. `keep-alive.sh`:
   Hostinger cron health and keep-alive monitor script from `/home/u727965524/keep-alive.sh`.
