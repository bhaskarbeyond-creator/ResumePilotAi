# H.1 — ENTERPRISE_ENCRYPTION_KEY rotation + fail-closed rehearsal (runbook)

**Status: PACKAGE — human execution pending. Nothing here is pre-credited.**
Prepared by: R14.1 (2026-10-26 mandate). Estimated operator time: **≤ 15 minutes** for the
automated drill; ≤ 30 minutes including evidence capture.

## What this proves

1. Provider secrets written through the real production save path
   (`backend/services/aiAdmin.js → saveAiAdminSettings`) are sealed as AES-256-GCM envelopes
   at rest — the A.12 property (`{__enterpriseEncrypted, alg, keyVersion, wrappedKey, iv,
   tag, ciphertext}`, zero plaintext in a raw SQL read).
2. Key rotation works in the documented order: bundle both versions → move the active key →
   re-wrap (any real save re-seals under the active version) → drop the old version.
3. **Fail-closed:** with the old version dropped, a stale envelope throws
   `ENTERPRISE_ENCRYPTION_UNAVAILABLE` (or the per-version `Enterprise encryption key <v>
   is not configured` failClosed) — it never degrades to plaintext and never leaks secret
   material in the error.

## Preconditions

- Checkout of this repo at or after the R14.1 commit, `backend/node_modules` installed.
- Node ≥ 22 (the drill uses the same runtime as the backend suite).
- **Sandbox only.** Part 2 boots `scripts/dev-db/mariadb-sandbox-bridge.mjs` on 127.0.0.1:3306
  with a throwaway datadir (`/tmp/h1-datadir`) and database `ime365_h1`. Never point it at
  production. Port 3306 must be free.

## Steps

1. Run the drill:

   ```bash
   bash scripts/dev-db/enterprise-key-rotation-drill.sh
   ```

   (Provider-level rehearsal only, no DB: add `--part1-only`.)
2. Check the transcript against `expected-transcript.md` in this directory: every checkpoint
   must print `PASS`, and the final line must be `H1_DRILL_EXIT=0`.
3. Capture evidence: copy the full terminal transcript into `evidence-template.md` in this
   directory, fill operator/date/tree-SHA, and return the file. The drill prints the tree SHA
   itself (`== tree: <sha> (<branch>)`).
4. (Optional extension, ~10 min) HTTP-level A.12 restatement: boot the sandbox engine with
   `ENTERPRISE_ENCRYPTION_KEYS='{"v1":"<base64-32-bytes>"}'`, save a provider key through
   `POST /api/admin/ai-settings` as super-admin, then run the raw SQL read
   `SELECT data FROM system_settings WHERE category='ai_providers'` and verify the envelope
   shape + 0 plaintext occurrences. The automated drill already covers the same write/read
   path at the service level; this step adds the wire layer.

## Production rotation SOP (for the real change window — NOT part of the drill)

1. Generate `v2` (32 random bytes, base64). Add it to the deployment bundle:
   `ENTERPRISE_ENCRYPTION_KEYS='{"v1":"<current>","v2":"<new>"}'`. Do **not** change the
   active key yet. Redeploy/restart. Reads of v1 envelopes continue (rotation window).
2. Set `ENTERPRISE_ENCRYPTION_ACTIVE_KEY=v2`. Restart. New writes seal under v2; v1 reads
   still work.
3. Re-wrap: every administrative save re-seals the touched secrets under the active version.
   For a full sweep, re-save each provider key through the admin panel (or script the
   `saveAiAdminSettings` path per tenant). Verify with the raw SQL read that
   `keyVersion` migrated.
4. Only after **all** envelopes report `v2`: drop `v1` from the bundle and restart. From this
   point a stale v1 envelope fails closed (`ENTERPRISE_ENCRYPTION_UNAVAILABLE`) — that is the
   designed behaviour, not data loss; keep the v1 key in escrow until backups age past the
   rotation.
5. Record the rotation in the audit trail (the save path already writes audit rows with
   `forced:true`/`forceReason` when force is used).

## Failure handling

- Any `FAIL` line or non-zero `H1_DRILL_EXIT`: stop, do not proceed to production rotation,
  return the transcript unfilled-success (honest evidence only).
- If part 2 cannot boot the bridge (port 3306 busy): free the port or run `--part1-only` and
  schedule part 2; note the partial run in the evidence file.
