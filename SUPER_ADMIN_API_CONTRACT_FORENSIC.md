# SUPER ADMIN API CONTRACT & ROUTE FORENSICS

**Audit Target**: `https://ai-resume-builder.local/`  
**Date**: 2026-09-01  
**Methodology**: Full Static & Dynamic AST Endpoint Extraction (502 Frontend Modules vs 133 Backend Handlers)  

---

## 1. Executive Summary

A comprehensive automated cross-layer contract audit scanned all 502 React/JS frontend files and all 133 backend route files. The scan cross-referenced 108 frontend API call patterns against 379 backend route declarations.

---

## 2. Route Matching & Discrepancy Findings

### Discrepancy 1: `DELETE /api/phrases/:category` (Resolved)
- **Frontend Caller**: `src/services/api/platform.js` (`deletePhraseCategory`)
- **Backend Initial State**: Missing route handler in `backend/routes/miscData.js`.
- **Root Cause**: Route was never defined when migrating phrases from Firestore to MariaDB `canonical_documents`.
- **Remediation**: Added `router.delete('/phrases/:category')` with CAS revision check and permission guard in `miscData.js`.
- **Status**: **RESOLVED & VERIFIED IN MARIADB**

### Discrepancy 2: `POST /api/admin/coupons` (Resolved)
- **Frontend Caller**: `src/components/admin/settings/subscriptionsSettings.jsx` (`handleSaveCouponForm`)
- **Backend Initial State**: Only `PUT /api/admin/coupons/:code` existed.
- **Root Cause**: Frontend called `POST /api/admin/coupons` for both new and edited coupons.
- **Remediation**: Registered `app.post('/api/admin/coupons')` and `app.post('/api/admin/coupons/:code')`. Added `deleteCoupon` repository method.
- **Status**: **RESOLVED & VERIFIED IN MARIADB**

---

## 3. Router Mounting Verification

All administrative router sub-trees are mounted under secure prefixes in `backend/index.js`:
- `/api/platform` -> `platformRouter`
- `/api/enterprise` -> `enterpriseRouter`
- `/api/admin/users` -> `adminUsersRouter`
- `/api/admin/support` -> `supportAdminRouter`
- `/api/blog-data` -> `blogDataRouter`
- `/api/notifications-data` -> `notificationsDataRouter`
- `/api` -> `miscDataRouter` (phrases, reviews, stats, favourites)
- `/api/admin/settings` -> Core CAS settings dispatcher
