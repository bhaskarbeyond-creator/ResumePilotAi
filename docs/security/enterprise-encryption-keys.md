# Enterprise Encryption Keys & Platform AI Secret Store

This document describes the envelope-encryption architecture for platform AI credentials in `system_settings.ai_providers` (governed by Ruling F-19), key lifecycle management, startup validation, diagnostic health states, and operator recovery procedures.

---

## 1. Architectural Overview

Platform AI provider credentials (such as API keys and credential pools for NVIDIA NIM, OpenAI, Groq, OpenRouter, and Gemini) are protected at rest via AES-256-GCM envelope encryption:
- **Master Keys (`ENTERPRISE_ENCRYPTION_KEY` / `ENTERPRISE_ENCRYPTION_KEYS`)**: Server-owned environment variables. Master keys live only in environment configuration and are never persisted in the database or sent to browsers.
- **Data Encryption Keys (DEKs)**: Each credential is encrypted under a unique ephemeral 32-byte data key using AES-256-GCM (`alg: 'AES-256-GCM'`). The data key is then sealed (wrapped) with the active master key and stored alongside the ciphertext:
  ```json
  {
    "__enterpriseEncrypted": true,
    "alg": "AES-256-GCM",
    "keyVersion": "v1",
    "wrappedKey": "<iv>.<tag>.<wrappedDataKey>",
    "iv": "<iv>",
    "tag": "<tag>",
    "ciphertext": "<ciphertext>"
  }
  ```
- **In-Memory Decryption Only**: Decryption occurs lazily in server memory when constructing the runtime provider configuration. Masked keys exposed to the administrative console show only authentic trailing characters (e.g. `••••••••ab12`) and never ciphertext.
- **Keyless Deployments**: If no `ENTERPRISE_ENCRYPTION_KEY` is configured in a deployment that has not yet sealed credentials, the system operates in legacy plaintext mode (`secretEncryption: 'unavailable'`).

---

## 2. Key Provisioning & Generation

### Generating a Master Key
Master keys must be exactly 32 cryptographically random bytes, base64-encoded:

```bash
# Using OpenSSL (recommended):
openssl rand -base64 32

# Or using Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Single Key Configuration
Set in `backend/.env` or server environment:

```env
ENTERPRISE_ENCRYPTION_KEY="<base64-encoded-32-byte-key>"
ENTERPRISE_ENCRYPTION_KEY_VERSION="v1"
```

### Multi-Key & Key Rotation Configuration
When rotating keys, the environment accepts a JSON dictionary mapping version identifiers to base64 keys:

```env
ENTERPRISE_ENCRYPTION_KEYS='{"v1":"<old-key-base64>","v2":"<new-key-base64>"}'
ENTERPRISE_ENCRYPTION_KEY_VERSION="v2"
```
The active key version (`ENTERPRISE_ENCRYPTION_KEY_VERSION`) seals all new or updated credentials, while older versions remain available to decrypt existing envelopes.

---

## 3. Diagnostic States & Deterministic Failure Codes

The system enforces fail-closed security paired with truthful diagnostic codes:

| Diagnostic Code | HTTP Status | Description | Actionable Remediation |
| :--- | :---: | :--- | :--- |
| `AI_SECRETS_ENCRYPTED_VALID` | `200` | Stored credentials are encrypted and decrypt cleanly with the active environment key. | None. System is fully operational. |
| `AI_SECRETS_PLAINTEXT` | `200` | Keyless deployment. Credentials are stored in plaintext. | System works. To enable envelope encryption, generate a key and set `ENTERPRISE_ENCRYPTION_KEY`. |
| `AI_SECRETS_EMPTY` | `200` | No credentials stored. | None. Enter keys in Admin Console. |
| `AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE` | `503` | Stored credentials are encrypted, but `ENTERPRISE_ENCRYPTION_KEY` is missing from the environment. | Set `ENTERPRISE_ENCRYPTION_KEY` in `.env`, or run `node backend/scripts/recover-ai-secrets.js --to-plaintext`. |
| `AI_ENCRYPTION_KEY_MISMATCH` | `503` | `ENTERPRISE_ENCRYPTION_KEY` is present, but fails AES-GCM MAC verification (wrong key). | Verify the key matches the secret version used to seal the credentials. |

---

## 4. Operator Recovery CLI (`recover-ai-secrets.js`)

When credentials are trapped in `system_settings` (for example, after migrating database dumps across environments without transferring the master key), operators use `recover-ai-secrets.js`:

```bash
# 1. Inspect status and envelope counts without modifying database
node backend/scripts/recover-ai-secrets.js --status

# 2. Decrypt trapped credentials back to plaintext using an operator-supplied key
node backend/scripts/recover-ai-secrets.js --to-plaintext --key "<base64-key>"

# 3. If master key is permanently lost: clear trapped credentials so fresh keys can be entered
node backend/scripts/recover-ai-secrets.js --reset-empty --force
```
