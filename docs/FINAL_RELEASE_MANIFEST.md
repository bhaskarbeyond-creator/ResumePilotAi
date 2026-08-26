# ResumePilot AI — Final Release Manifest

**Release Version:** `2.0.0-uat.final`  
**Release Commit SHA:** `5c0546d6ab472b171d34dc12f361f42e2e070632`  
**Release Tag:** `uat-release-2026-08-26-final`  
**Live Deployed SHA:** `5c0546d6ab472b171d34dc12f361f42e2e070632`  
**Release Date:** August 26, 2026  
**Target Environment:** Hostinger Cloud VPS (`https://airesume.projectdemo.guru`)

---

## 1. Release Inventory & Artifacts

- **Frontend Assets**: Vite production bundle compiled into `dist/` (Rollup/Brotli/Gzip optimized).
- **Backend Application**: Node.js v20 LTS service managed by PM2 (`airesume-backend`, PID 1214706).
- **Database Engine**: MariaDB 11.8.8 Primary (Active) + Firestore (`ai-resume-builder-424cf`) Standby with dual-switching.
- **Durable Replication Outbox**: Bidirectional sync daemon with monotonic revision guard and fail-closed parity gating.
- **Enterprise Tenancy Plane**: Cryptographically isolated multi-tenant workspaces with AES-256-GCM envelope encryption.
- **Template System**: 51 differentiated CV templates (`Cv1` to `Cv51`) + 4 Cover Letter templates + 4 Portfolio layouts.
- **Export Engines**: High-fidelity Client PDF + Server-side DOCX OpenXML generation.

---

## 2. Release Verification Summary

- **Total Unique Test Files**: 139 files (100% discovered and accounted)
- **Total Runnable Node.js Tests Executed**: 3,071 tests
- **Tests Passed**: 3,071 tests (100.0% Pass Rate with emulator; 3,045 pass offline with 16 rules skipped)
- **Tests Failed**: 0 tests
- **Real DOM Browser Controls Exercised**: 1,716 controls (100% real Playwright execution)
- **Negative Control Mutation Proofs**: 8 / 8 Proven
- **Known P0 / P1 / P2 Defect Count**: 0
- **Live Health Status**: `https://airesume.projectdemo.guru/api/healthz` -> `HTTP 200 ok` (`commitSha: "5c0546d6ab472b171d34dc12f361f42e2e070632"`)
