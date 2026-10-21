# ARCHIVE NOTICE: Legacy AI Routing Engine

**Date of Archival:** 2026-10-21  
**Replaced By:** `backend/freellmapi/` (FreeLLMAPI 0.16.6 Master Engine)  
**Historical Certified Baselines:** `1cf3d5d`, `1ffa9f7`, `2be055e`, `3b87761`, `86b0197`, `d9a4b29`, `1a323cb4`

---

## Purpose
This directory contains the frozen archival copy of the original 6-provider AI routing infrastructure (`backend/services/aiRouting/`).
The system has transitioned to FreeLLMAPI (`backend/freellmapi/`), which provides:
1. 74 platform catalog (`backend/freellmapi/providers/registry.js`).
2. Smart priority fallback cascades and cooldown manager (`backend/freellmapi/services/router.js`).
3. Dedicated Tenant BYOK isolation.
4. Live model discovery from provider endpoints (`backend/freellmapi/services/modelDiscovery.js`).
5. Real-time latency tracking and operational telemetry (`backend/freellmapi/services/health.js`).

All active runtime services (`aiRuntime.js`, `aiAdmin.js`, `ai.js`) now route through `backend/freellmapi/`.
This archival copy is preserved for forensic verification and historical baseline fidelity.
