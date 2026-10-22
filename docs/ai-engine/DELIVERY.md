# AI engine engineering ledger — 2026-10-22

## Scope and plan
User mandate authorizes autonomous engine changes. Work remains on the Arena session branch; no main/dev direct writes. Sequence: discovery integrity and regression tests; routing safety; local keyless adapter reuse; discovery UI repair; executed verification and GitHub delivery. This is incremental work, not production certification.

## Synchronization (A)
- Clean working tree; session HEAD `2abbbe4401efd1945e2749127605bb7f80afe941`.
- `git fetch origin --prune` succeeded. `git ls-remote --heads origin` independently confirmed dev and main at that same hash.
- Checkout is shallow; historic visual parity cannot be certified from history. Archives exist and require further comparison.
- No Claude executable or delegated model/review tool is exposed. Independent Claude review is blocked, not completed.
- Outbound network is restricted to GitHub/npm/PyPI hosts. External public inference cannot be certified in this environment.

## Initial defect register
|Severity|Issue|Root cause|Status|
|---|---|---|---|
|High|Cooldown bypass when every candidate is unhealthy|Second candidate-building loop ignores active cooldowns and validation|Pending|
|High|Auto model never discovers when registry has default|Early return before discovery|Pending|
|High|Credential cache aliasing|Only last eight characters identify credentials|Pending|
|Medium|Silent stale/fallback metadata|No freshness metadata; invented 128K context|Pending|
|Medium|Concurrent discovery duplicates external requests|No single-flight tracking|Pending|
|Medium|Discovery tab uses unrelated selected-provider state|Child selection not passed to fetch callback|Pending|
|Medium|Unmeasured ranking quality claims|Registry score/name heuristics treated as quality evidence|Pending|

## Route/workflow baseline (source inspection, not browser certification)
|Surface|Data/authorization|Controls|Coverage status|
|---|---|---|---|
|Admin AI settings, providers/key pool|aiAdmin + admin permission middleware|Configure keys, enable, test, delete|Existing tests; not yet executed|
|Admin AI metrics|FreeLLM metrics persistence|Usage/latency/history|Not certified|
|Admin unified gateway|FreeLLM API|Completion/streaming|Existing adapter tests|
|Admin discovery subtab|POST /admin/ai/fetch-models|Provider, refresh, model records|Selection bug identified|
|Admin models/playground/Claude tabs|Mixed curated catalog and engine API|Model selection, completion|Static model surface still needs migration|
|Tenant AI settings|Tenant policy/custom keys|Dedicated BYOK|Existing isolation tests|

## Provider research and verification categories
Existing registry already contains OVH, Pollinations, Kilo, AI Horde (claims not reverified) and Ollama (local path previously incorrectly required credentials). These are not newly confirmed operational services. Local OpenAI-compatible implementations can reuse the existing adapter and `/models` discovery. Local inference still requires a running service and installed model. No model weights/runtime are installed here.

## Outstanding mandatory gates
Full route inventory, legacy parity, real public/local inference, credentialed inference, complete responsive/browser certification, independent Claude review, full security review and production readiness remain unverified until explicitly evidenced below.

## Checkpoint B/D — executed evidence
- `node --test backend/test/freellmapi-engine.test.js`: 28/28 pass (after installing locked backend dependencies).
- `node --test backend/test/freellmapi-catalog-integrity.test.js`: 8/8 pass, mocked deterministic fixtures; NOT real inference.
- `npm run build`: passed TypeScript and Vite; existing bundle-size warnings. Installation warned Firebase packages request Node >=24.12, sandbox is Node 22.22.3.
- Fixed auto-discovery bypass; authoritative empty catalogs no longer resurrect defaults. Discovery outages can still use registry bootstrap hints, which are not verified availability.
- SHA-256 credential cache identities, single-flight refresh, 30s failure backoff, 1h default TTL, 24h maximum stale retention; explicit fresh/stale/source/timestamp per returned model.
- Removed fabricated 128K context from discovery responses and raw upstream error bodies from discovery errors.
- Removed unsafe all-unhealthy cooldown bypass. Corrected invalid fixture keys exposed by that fix.
- Discovery child selector now supplies the actual selected provider; fresh/stale metadata reaches UI; tab errors are visible; refresh disabled without a selection.
- Catalog remains process-local (not durable/shared across workers); no completion claim for full catalog lifecycle or unified model-screen migration.
