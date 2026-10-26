# H.1 — expected transcript

Key material is random per run; envelope field values differ. The checkpoint lines and their
order must match exactly. Verified shape (part 1 executed in-sandbox 2026-10-26 at a4231ff
during package preparation — that execution is package debugging, NOT the human drill; the
score moves only on the operator's returned evidence).

```
== H.1 enterprise key rotation drill: <UTC timestamp> ==
== tree: <sha> (<branch>)
-- PART 1: provider-level fail-closed rehearsal
   PASS encrypt@v1 envelope: {"__enterpriseEncrypted":true,"alg":"AES-256-GCM","keyVersion":"v1"}
   PASS decrypt@v1 roundtrip
   PASS encrypt@v2 after rotation (active key honored): v2
   PASS decrypt v1-envelope during rotation window {v1,v2}
   PASS fail-closed after v1 dropped: ENTERPRISE_ENCRYPTION_UNAVAILABLE
PART1_EXIT=0
-- PART 2: service-level A.12 restatement (sandbox bridge, DB ime365_h1)
   schema init exit 0
   PASS save@v1 via aiAdmin.saveAiAdminSettings (production write path)
   PASS A.12 SQL read: envelope {"__enterpriseEncrypted":true,"alg":"AES-256-GCM","keyVersion":"v1"} plaintext occurrences: 0
   PASS load@v1 decrypts the in-memory view (storage stays sealed)
   PASS rotation window {v1,v2} active=v2: v1 envelope still readable
   PASS re-wrap under v2: keyVersion=v2, plaintext occurrences: 0
   PASS post-rotation: v2-only bundle serves current data
   PASS fail-closed on stale v1 envelope: ENTERPRISE_ENCRYPTION_UNAVAILABLE
==============================
H1_DRILL_EXIT=0
```

Any deviation (FAIL line, missing PASS, non-zero exit) = drill failed; return the transcript
as-is.
