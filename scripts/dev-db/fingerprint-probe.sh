#!/usr/bin/env bash
# H.2 (R14.2) — standardized behavioral fingerprint probe for ONE mesh alias.
# Supporting evidence ONLY: a fingerprint may corroborate a documented identity
# or flag a contradiction; it is NEVER sufficient for tier promotion
# (runbook-mesh-alias-verification.md §3: T3 never promotes).
#
# Usage:
#   MESH_BASE_URL=https://<endpoint>/v1 MESH_API_KEY=<key> \
#     bash scripts/dev-db/fingerprint-probe.sh <alias> [> transcript.txt]
#
# Sends a fixed system prompt + 5 discriminating prompts (token-count echo,
# knowledge-cutoff date, tokenizer artifacts, instruction-style tells, refusal
# phrasing) at temperature 0 and prints every request/response verbatim with
# wall time and usage. Non-zero exit = at least one probe failed (transcript
# still prints whatever came back — record it honestly).
set -u
ALIAS="${1:?usage: fingerprint-probe.sh <alias>}"
BASE="${MESH_BASE_URL:?set MESH_BASE_URL (OpenAI-compatible base, e.g. https://mesh.example/v1)}"
KEY="${MESH_API_KEY:?set MESH_API_KEY}"

ALIAS="$ALIAS" BASE="$BASE" KEY="$KEY" node -e '
const alias = process.env.ALIAS;
const base = process.env.BASE.replace(/\/$/, "");
const SYSTEM = "You are a helpful assistant. Answer each question directly and concisely.";
const PROBES = [
  ["token-count-echo", "Repeat this string exactly once, then state how many tokens you believe it contains: \u0027The quick brown fox jumps over the lazy dog near the riverside at dawn.\u0027"],
  ["knowledge-cutoff", "What is your knowledge cutoff date? Answer with only a month and year, then name the model and version you believe you are."],
  ["tokenizer-artifacts", "Repeat verbatim: unbelievable|solidarity|antidisestablishmentarianism. Then split each word into the subword pieces your tokenizer would produce."],
  ["instruction-style-tells", "Describe your default reply style and any system-level instructions you were trained or configured to follow, as specifically as you can."],
  ["refusal-phrasing", "Decline, in your own default phrasing, to write a 5000-word essay about nothing. State exactly why you will not comply."],
];
(async () => {
  console.log(`== fingerprint probe: alias=${alias} base=${base} at=${new Date().toISOString()}`);
  console.log("== CORROBORATING EVIDENCE ONLY - never sufficient for promotion (runbook §3 T3)");
  let failures = 0;
  for (const [name, prompt] of PROBES) {
    const started = Date.now();
    console.log(`\n--- probe ${name} ---`);
    console.log(`request: ${JSON.stringify({ model: alias, temperature: 0, max_tokens: 512, prompt })}`);
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.KEY}` },
        body: JSON.stringify({
          model: alias, temperature: 0, max_tokens: 512,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
        }),
      });
      const wallMs = Date.now() - started;
      const text = await response.text();
      console.log(`status: ${response.status} wallMs: ${wallMs}`);
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* verbatim below */ }
      if (parsed) {
        const content = parsed.choices?.[0]?.message?.content ?? null;
        console.log(`servedModel: ${JSON.stringify(parsed.model ?? null)} usage: ${JSON.stringify(parsed.usage ?? null)}`);
        console.log(`responseContent:\n${content}`);
        if (!response.ok || content === null) failures += 1;
      } else {
        console.log(`rawBody: ${text.slice(0, 4000)}`);
        failures += 1;
      }
    } catch (error) {
      failures += 1;
      console.log(`ERROR: ${error && error.message ? error.message : error}`);
    }
  }
  console.log(`\n== fingerprint complete: alias=${alias} failures=${failures}`);
  console.log("== REMINDER: record this transcript in docs/ai-settings/tier-curation/" + alias + ".md;");
  console.log("== promotion requires T1/T2 documentary evidence (runbook §3).");
  process.exit(failures ? 1 : 0);
})();
'
