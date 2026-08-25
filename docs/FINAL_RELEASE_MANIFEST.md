# ResumePilot AI — Final Release Manifest

**Release Version:** `2.0.0-uat.final`  
**Release Commit SHA:** `d61fa2cec7dd845329ce54b08c3b939f4c1283b1`  
**Release Tag:** `uat-release-2026-08-26-final`  
**Live Deployed SHA:** `d61fa2cec7dd845329ce54b08c3b939f4c1283b1`  
**Release Date:** August 26, 2026  
**Target Environment:** Hostinger Cloud VPS (`https://airesume.projectdemo.guru`)

---

## 1. Release Inventory & Artifacts

- **Frontend Assets**: Vite production bundle compiled into `dist/` (Rollup/Brotli/Gzip optimized).
- **Backend Application**: Node.js v20 LTS service managed by PM2 (`airesume-backend`, PID 487897).
- **Database Engine**: MariaDB 11.8.8 Primary + Firestore (`ai-resume-builder-424cf`) Standby with dual-switching.
- **Durable Replication Outbox**: Bidirectional sync daemon with monotonic revision guard and fail-closed parity gating.
- **Enterprise Tenancy Plane**: Cryptographically isolated multi-tenant workspaces with AES-256-GCM envelope encryption.
- **Template System**: 51 differentiated CV templates (`Cv1` to `Cv51`) + 4 Cover Letter templates + 4 Portfolio layouts.
- **Export Engines**: High-fidelity Client PDF + Server-side DOCX OpenXML generation.

---

## 2. Release Verification Summary

- **Total Test Files Discovered**: 135 files (114 runnable Node.js test files + 21 Playwright browser specs)
- **Total Runnable Node.js Tests Executed**: 2,869 tests
- **Tests Passed**: 2,869 tests (100.0% Pass Rate with emulator; 2,853 pass offline with 16 rules skipped)
- **Tests Failed**: 0 tests
- **Real DOM Browser Controls Exercised**: 1,716 controls (100% real Playwright execution)
- **Negative Control Mutation Proofs**: 8 / 8 Proven
- **Known P0 / P1 / P2 Defect Count**: 0
- **Live Health Status**: `https://airesume.projectdemo.guru/api/healthz` -> `HTTP 200 ok` (`commitSha: "d61fa2cec7dd845329ce54b08c3b939f4c1283b1"`)
