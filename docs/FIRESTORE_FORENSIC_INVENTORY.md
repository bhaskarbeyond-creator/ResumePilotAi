# Firestore Forensic Inventory

Generated: 2026-08-28T15:56:33Z
Branch: arena/01a04910-resumepilotai
Starting SHA: f434b90f32e560c4e8ca0eeb183f29ff2316f341
Local HEAD at inventory: f434b90f32e560c4e8ca0eeb183f29ff2316f341

## Evidence

- Command: `rg --hidden --glob '!node_modules' --glob '!.git' --glob '!docs/**' --glob '!scratch/**' --glob '!backups/**' "firebase|firebase-admin|firestore|Firestore|getFirestore|collection\(|doc\(|getDoc|getDocs|setDoc|updateDoc|deleteDoc|addDoc|onSnapshot|runTransaction|firestoreDataPlane|firestoreData|firestore fallback|Firestore unavailable|Firebase database" .`
- Command: `node scripts/firestore-dependency-census.mjs`
- Census result: production source files 613; test source files 240; retained identity imports 16; prohibited production hits 0; test-only hits 1; path-based runtime exemptions 0.
- Verification: `npm run db:verify` returned 14/14 tests successful after fixes.

## Inventory Summary

| File / pattern | Reference | Classification | Runtime impact | Action | Final status |
|---|---|---:|---|---|---|
| `src/conf/firebase.js` and auth modules | Firebase web SDK Auth only | AUTH | Required identity provider | Preserve | VERIFIED by static tests |
| `backend/services/firebaseAdmin.js`, `backend/index.js` auth usages | Firebase Admin Auth only | AUTH | Required token verification, identity lifecycle, MFA-related identity state | Preserve | VERIFIED by static tests |
| `vite.config.js` | Firebase data-product forbidden bundle plugin | CONFIG | Prevents Firestore/RTDB/storage/functions/analytics client bundle imports | Preserve | VERIFIED by build/db:verify |
| `backend/database/authTokens.js`, `oauthStore.js` | Historical Firestore comments | MIGRATION/DOC | Documents MySQL replacement only | Keep as historical comments | VERIFIED no runtime data call |
| `tests/**` | Firebase auth fixture localStorage, data-plane guards, regression tests | TEST | Test-only auth/session simulation and Firestore request rejection | Keep | VERIFIED no production impact |
| `.agents/AGENTS.md` | Historical Firestore secret-store/quota guidance and direct-main push instruction | LEGACY DOC | Not runtime; misleading for current architecture | Corrected to MariaDB/server-secret architecture and Arena branch push rule | FIXED |
| `backend/package-lock.json` transitive `@google-cloud/firestore` | firebase-admin transitive package | AUTH DEPENDENCY TRANSITIVE | Pulled by Firebase Admin; no application-data calls | Keep while Firebase Admin Auth retained | VERIFIED no production import |

## Final Firestore Data-Plane Status

Local production source census found zero prohibited active Firestore application-data reads/writes/listeners/fallbacks. Production runtime still reports an older artifact SHA and a misleading `databases.firestore` object; production is therefore **NOT VERIFIED** until deployed and live-tested.
