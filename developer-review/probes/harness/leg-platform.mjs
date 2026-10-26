#!/usr/bin/env node
/**
 * Platform probe legs A.9r3 / A.9r4 / A.10r3 — REBUILT runner (R15).
 *
 * Faithful reconstruction of the documented scenarios from
 * developer-review/engine-audit-2026-10-24.md ("Post-fix verification" table,
 * rows A.9r3/A.9r4-after/A.10r3-after) and the S1/S2 transcripts' recorded
 * shapes. Emits normalized JSONL to stdout — one line per wire call plus a
 * final summary line. Timing fields are deliberately excluded from the
 * normalized surface (byte-equality is asserted on provider/model/exploration/
 * observationCount/qualityEvidence/status/cached/mode/fallbacks).
 *
 * Env:
 *   TARGET_BACKEND  absolute path to the target tree's backend/ dir
 *   ENGINE_PORT     engine HTTP port
 *   DB_NAME         target's MariaDB database on the sandbox bridge
 *   LEG             a9r3 | a9r4 | a10r3
 *   TARGET_LABEL    'baseline-bb2b82b' | 'tip-flags-off' (transcript only)
 *   ALPHA_PORT/BETA_PORT  stub ports (default 8791/8792)
 *   API_KEY         platform /v1 key (default audit-platform-key-123)
 */

import {
  sleep, makeSql, setPublicAiConfig, waitForEngine, v1Chat,
  normalizeWire, stubStats, CONFIG_HOT_RELOAD_WAIT_MS,
} from './probe-lib.mjs';

const LEG = process.env.LEG || '';
const ENGINE_PORT = Number(process.env.ENGINE_PORT || 8085);
const DB_NAME = process.env.DB_NAME || 'ime365_probe';
const TARGET_LABEL = process.env.TARGET_LABEL || 'unlabeled';
const ALPHA_PORT = Number(process.env.ALPHA_PORT || 8791);
const BETA_PORT = Number(process.env.BETA_PORT || 8792);
const API_KEY = process.env.API_KEY || 'audit-platform-key-123';

const lines = [];
const emit = obj => { lines.push(obj); process.stdout.write(`${JSON.stringify(obj)}\n`); };

async function call(n, promptSeed) {
  const started = Date.now();
  const result = await v1Chat({ enginePort: ENGINE_PORT, apiKey: API_KEY, prompt: `${promptSeed} — unique probe call ${LEG}-${TARGET_LABEL}-${n}-${started}` });
  const wallMs = Date.now() - started;
  const normalized = normalizeWire(result, n);
  emit({ type: 'call', leg: LEG, target: TARGET_LABEL, ...normalized, wallMs, retryAfter: result.body?.error ? (result.body.error.code ?? null) : null });
  return normalized;
}

const sql = makeSql(process.env.TARGET_BACKEND, DB_NAME);

try {
  await waitForEngine(ENGINE_PORT);
  emit({ type: 'meta', leg: LEG, target: TARGET_LABEL, db: DB_NAME, enginePort: ENGINE_PORT, at: new Date().toISOString() });

  if (LEG === 'a9r3') {
    // Mature alpha (openai stub) to n>=3 under a manual pin, then flip to
    // speed mode with primary=groq (beta stub slowed to 3s): both attempts
    // must be served by the non-primary on windowed evidence alone (F-07).
    await setPublicAiConfig(sql, { selectionMode: 'manual', provider: 'openai' });
    await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
    for (let i = 1; i <= 3; i += 1) await call(i, 'A.9r3 manual-pin warm-up');
    await setPublicAiConfig(sql, { selectionMode: 'speed', provider: 'groq' });
    await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
    const a = await call(4, 'A.9r3 speed flip attempt');
    const b = await call(5, 'A.9r3 speed flip attempt');
    emit({
      type: 'verdict', leg: LEG, target: TARGET_LABEL,
      flipProven: a.provider === 'openai' && b.provider === 'openai',
      servedBy: [a.provider, b.provider],
    });
  } else if (LEG === 'a9r4') {
    // S1-after scenario: speed, primary=groq (3000ms stub), alpha (150ms stub)
    // enabled but unsampled, fresh metrics (engine just booted, :memory:),
    // no pin. 61 calls: exploration ticks at calls 20/40/60 divert to alpha
    // (wire exploration:'cold-start', observationCount 0->1->2), call 61
    // flips to alpha ON MERIT (observationCount 3, no marker).
    await setPublicAiConfig(sql, { selectionMode: 'speed', provider: 'groq' });
    await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
    const diversions = [];
    let flipCall = null;
    let last = null;
    for (let i = 1; i <= 61; i += 1) {
      last = await call(i, 'A.9r4 exploration budget sequence');
      if (last.exploration === 'cold-start') diversions.push({ call: i, observationCountBefore: last.observationCount });
      if (flipCall === null && last.provider === 'openai' && last.exploration !== 'cold-start') flipCall = i;
    }
    emit({
      type: 'verdict', leg: LEG, target: TARGET_LABEL,
      diversionCalls: diversions.map(d => d.call),
      diversionCount: diversions.length,
      flipCall,
      finalProvider: last?.provider ?? null,
      finalObservationCount: last?.observationCount ?? null,
      budgetOk: diversions.length === 3 && diversions.every(d => d.call % 20 === 0),
      flipOnMerit: flipCall === 61,
    });
  } else if (LEG === 'a10r3') {
    // S2-after scenario: quality mode, primary=groq serving the economy
    // curated id on a 3000ms stub; alpha serves the premium curated id
    // (gemini-1.5-pro) on a 150ms stub. The tier signal alone must decide:
    // every call served by alpha with qualityEvidence 'curated-tier:premium'.
    await setPublicAiConfig(sql, { selectionMode: 'quality', provider: 'groq' });
    await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
    const served = [];
    for (let i = 1; i <= 6; i += 1) {
      const row = await call(i, 'A.10r3 curated tier differentiation');
      served.push({ provider: row.provider, model: row.model, qualityEvidence: row.qualityEvidence });
    }
    emit({
      type: 'verdict', leg: LEG, target: TARGET_LABEL,
      allServedByAlpha: served.every(s => s.provider === 'openai'),
      qualityEvidence: [...new Set(served.map(s => s.qualityEvidence))],
      models: [...new Set(served.map(s => s.model))],
    });
  } else {
    throw new Error(`unknown LEG ${LEG}`);
  }

  const [alpha, beta] = [await stubStats(ALPHA_PORT), await stubStats(BETA_PORT)];
  emit({ type: 'stub-stats', leg: LEG, target: TARGET_LABEL, alpha: { posts: alpha.posts, model: alpha.model }, beta: { posts: beta.posts, model: beta.model } });
} catch (error) {
  emit({ type: 'error', leg: LEG, target: TARGET_LABEL, message: String(error?.message || error) });
  process.exitCode = 1;
} finally {
  await sql.end();
}
