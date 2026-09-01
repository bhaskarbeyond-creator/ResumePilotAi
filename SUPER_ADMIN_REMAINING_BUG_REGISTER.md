# Super Admin Remaining Bug Register & Status

**Authoritative Target Environment**: `https://ai-resume-builder.local/`  
**Certification Standard**: Real MariaDB Persistence + Playwright Browser Verification  
**Date**: September 1, 2026  

---

## 1. Defect Classification Summary

| Priority | Description | Found | Fixed | Remaining |
|---|---|---|---|---|
| **P0** | Critical / Security Vulnerability / Data Loss | 0 | 0 | **0** |
| **P1** | Core Functionality Broken / Missing Backend Route | 2 | 2 | **0** |
| **P2** | Swallowed Catch Block / Optimistic Desync / Concurrency Risk | 3 | 3 | **0** |
| **P3** | Domain Fallback Hardcoding / Minor Portability Cleanup | 1 | 1 | **0** |
| **TOTAL** | All Categories | 6 | 6 | **0** |

---

## 2. Detailed Bug Ledger & Resolution Proofs

### P0 Defects (Critical)
*Zero P0 defects discovered.*

---

### P1 Defects (Core Functionality Broken)

#### `DEF-P1-001`: Missing Promo Coupon Creation Endpoint
- **Symptom**: `POST /api/admin/coupons` returned HTTP 404.
- **Fix**: Registered `POST /api/admin/coupons` and `POST /api/admin/coupons/:code` in `backend/index.js` and added `deleteCoupon` repository method.
- **Proof**: 100% verified via MariaDB SQL row assertion (`SELECT discount FROM coupons WHERE code = 'PROVE_COUPON_101'`).
- **Status**: **RESOLVED & VERIFIED**.

#### `DEF-P1-002`: Missing Phrase Category Deletion Endpoint
- **Symptom**: `DELETE /api/phrases/:category` returned HTTP 404.
- **Fix**: Added universal document deletion handler in `backend/routes/miscData.js`.
- **Proof**: Verified in MariaDB (`SELECT COUNT(*) FROM canonical_documents WHERE entity_id = :id AND deleted_at IS NULL` = 0).
- **Status**: **RESOLVED & VERIFIED**.

---

### P2 Defects (Important UX / Contract / Silent Catch Defects)

#### `DEF-P2-001`: Swallowed Exception in Coupon Toggle Switch
- **Symptom**: Coupon toggle switch remained toggled on server error without rollback.
- **Fix**: Implemented try/catch optimistic rollback in `src/components/admin/settings/subscriptionsSettings.jsx`.
- **Status**: **RESOLVED & VERIFIED**.

#### `DEF-P2-002`: Empty Silent Catch in Blog Category Fetch
- **Symptom**: Silent catch block swallowed network failures in `BlogManagement.jsx`.
- **Fix**: Added user-facing error notification toast.
- **Status**: **RESOLVED & VERIFIED**.

#### `DEF-P2-003`: Missing `expectedRevision` in Blog Deletion
- **Symptom**: Blog delete endpoint bypassed concurrency lock.
- **Fix**: Passed `expectedRevision` parameter in `backend/routes/blogData.js`.
- **Status**: **RESOLVED & VERIFIED**.

---

### P3 Defects (Minor / Cleanup / Portability)

#### `DEF-P3-001`: Hardcoded Domain Fallbacks
- **Symptom**: `https://ai-resume-builder.local` hardcoded as fallback in email settings and AI services.
- **Fix**: Derived origins dynamically from `window.location.origin` and `process.env.APP_URL`.
- **Status**: **RESOLVED & VERIFIED**.

---

## 3. Final Conclusion

There are **0 remaining unresolved bugs** across all priority tiers (P0, P1, P2, P3).
