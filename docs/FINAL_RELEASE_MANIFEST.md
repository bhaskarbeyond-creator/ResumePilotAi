# ResumePilot AI — Final Release Manifest

**Release Version:** `1.0.0-final`  
**Release Tag:** `uat-release-2026-08-26-final`  
**Release Date:** August 26, 2026  
**Target Environment:** Hostinger Cloud VPS (`https://airesume.projectdemo.guru`)

---

## 1. Release Inventory & Artifacts

- **Frontend Assets**: Vite production bundle compiled into `dist/` (4.2MB total, Brotli/Gzip optimized).
- **Backend Application**: Node.js v20 LTS service managed by PM2 (`airesume-backend`, PID 2563613).
- **Database Engine**: MariaDB 11.8.8 Primary + Firestore (`ai-resume-builder-424cf`) Standby.
- **Durable Replication Outbox**: Bidirectional sync daemon with monotonic revision guard and fail-closed parity gating.
- **Enterprise Tenancy Plane**: Cryptographically isolated multi-tenant workspaces with AES-256-GCM envelope encryption.
- **Template System**: 51 differentiated CV templates (`Cv1` to `Cv51`) + 4 Cover Letter templates + 4 Portfolio layouts.
- **Export Engines**: High-fidelity Client PDF + Server-side DOCX OpenXML generation.

---

## 2. Release Verification Summary

- **Total Test Files**: 132 files
- **Total Automated Tests Executed**: 3,028 tests
- **Tests Passed**: 3,028 tests (100.0% Pass Rate)
- **Tests Failed**: 0 tests
- **Known P0/P1/P2 Defect Count**: 0
- **Live Health Status**: `https://airesume.projectdemo.guru/api/readyz` -> `HTTP 200 ready`
