# Reproducible synthetic quality / speed evaluation

Run `node scripts/benchmark-ai.cjs` against a **loopback, operator-owned model server**. No production prompt input is accepted. Select `LOCAL_INFERENCE_PROVIDER=llamacpp` (default, `LLAMACPP_BASE_URL`) or `ollama` (`OLLAMA_BASE_URL`). The canonical discovery service supplies actual loaded model IDs. Local tests: `node --test tests/ai-benchmark.test.cjs`.

## Protocol

- Same six applicable tasks × three repetitions per model; sequential requests, temperature 0, max 96 output tokens, streaming enabled. Up to four catalog-ordered loaded models.
- Arithmetic/reference answer; exact instruction following; binary-search complexity without an answer supplied in the prompt; constrained summarization; strict JSON shape; Spanish translation.
- Separate 8192-token eligibility requirement for synthetic marker retrieval. When catalog context support is unknown/insufficient, record **ineligible**, not successful long-context processing. This does not imply the model cannot support it; this protocol has no verified catalog evidence.
- Each successful sample requires a complete SSE stream, actual model identity matching the discovered/requested model, and nonempty generated text. HTTP errors, timeout, malformed/mismatched/truncated streams remain failed observations. No automatic inference retries.
- TTFT is measured to the **first content token**, not the response headers; total latency to completion. Both include transport and prompt processing. No warm-up exclusion; prompt-prefix caches in the serving implementation may affect repetitions.
- Nearest-rank P50/P95 over generated samples; attempted/generated/correct/failed counts retained separately. No output on a failed request is silently counted as correct.
- Record actual token usage only if supplied as finite nonnegative values, finish reason, and response hashes for repeatability. Usage and cost remain **unknown** when not measured; no invented dollar costs or estimated speed.
- Raw generated output and prompts are not published. Reference tasks are source-controlled synthetic content. Full sanitized records go to `artifacts/ai-engine/benchmark.json`, the job summary, per-task check notices, and retained Actions artifacts.
- Assertions are deliberately strict. The summarization check verifies lexical facts/one-sentence format, not arbitrary semantic truth. This is **not** a comprehensive intelligence benchmark, human writing-quality score or validated judge model. It cannot justify an overall 10/10 or production quality ranking.

## Actual execution / limitations

Workflow `.github/workflows/ai-engine-validation.yml` provisions official CPU llama.cpp with a small licensed SmolLM2 GGUF and official CPU Ollama with Qwen2.5 0.5B and 1.5B. Server image and model digests are retained in job summaries. Ollama local API ignores the SDK's required dummy key; Ollama cloud requires authentication. See official [local compatibility documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx) and [CPU Docker documentation](https://github.com/ollama/ollama/blob/main/docs/docker.mdx).

Different hosted jobs are not identical hardware. llama.cpp uses two threads; Ollama uses its server defaults. Quantization, tokenizers, scheduling, model loading and prefix caches differ. Only the two Qwen workloads within one Ollama job share a host/server. Report observed latency, **not a universal speed winner**. Small sample sizes and strict synthetic checks do not validate production resume-writing quality. Independent human/Opus evaluation remains an acceptance requirement, not an implicit pass.

The first exploratory 0.5B execution at `fce1f88` generated 18/18 but passed 10/18 checks. Its technical prompt gave away the answer and summary checks were too permissive; both were corrected in `4c76dc2`. Do not compare those scores directly. The revised 0.5B run at `4c76dc2` generated 18/18 and passed **9/18**, latency P50 **332.03 ms**, P95 **2312.46 ms**, TTFT P50 **34.75 ms**, measured `2026-10-22T10:24:44.001Z`, [job 119770097911](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39762439305/job/119770097911). These are genuine limited results, not a production-quality endorsement.

Final current-head results must be read from its actual hosted checks and sanitized records. A green measurement job means the experiment completed; it does **not** mean every correctness assertion passed. Benchmark results are not automatically injected into tenant routing or used to claim Quality First superiority.

## Production-code checkpoint `1e3ebd9d` — actual revised workload

Machine-readable summaries: [benchmark-results.json](benchmark-results.json). Each row has 18 generated responses / 18 attempts; no transport failures. Each long-context task is separately ineligible, **not** a passed test.

|Local model/path|Strict correct / 18|Latency P50 ms|Latency P95 ms|TTFT P50 ms|
|---|---:|---:|---:|---:|
|SmolLM2-135M Q4_K_M, llama.cpp|0|955.51|1250.80|19.26|
|Qwen2.5 0.5B, Ollama|10|716.98|3028.09|42.31|
|Qwen2.5 1.5B, Ollama|15|605.67|2581.97|80.96|

Measured `2026-10-22T10:32:15.303Z` (llama.cpp) and `10:33:37.570Z` (Ollama). Evidence: [llama.cpp job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932370), [Ollama job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932878). A 0/18 model is useful only as a transport/regression fixture here; it is **not** demonstrated suitable for candidate generation. The 15/18 model is better on these checks, not universally better. Temperature-zero output hashes still varied on some repeated tasks: determinism is not assumed.

Raw token usage, finish reasons and per-task output hashes are available in retained sanitized records; no cost estimate is invented. No benchmark score is injected into production routing, and no tiny synthetic set is promoted to an authoritative global quality score.
