#!/usr/bin/env node
/**
 * Byte-equality comparator for normalized probe transcripts (R15 / C.1
 * hard-stop gate). Compares ONLY the deterministic normalized fields:
 * status, provider, model, cached, mode, exploration, qualityEvidence,
 * observationCount, lastResort, fallbacks, decisionIdPresent, content.
 * Wall-clock/latency fields are physically nondeterministic and excluded —
 * the exclusion is disclosed in every transcript header.
 *
 * Usage: node compare-transcripts.mjs BASELINE.jsonl TIP.jsonl
 * Exit 0 = byte-equal on the comparison surface; 1 = divergence (HARD STOP).
 */

import { readFileSync } from 'node:fs';

const FIELDS = ['call', 'status', 'provider', 'model', 'cached', 'mode', 'exploration',
  'qualityEvidence', 'observationCount', 'lastResort', 'fallbacks', 'decisionIdPresent', 'content'];

const loadCalls = file => readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))
  .filter(row => row.type === 'call')
  .map(row => Object.fromEntries(FIELDS.map(field => [field, row[field] ?? null])));

const [baselineFile, tipFile] = process.argv.slice(2);
const baseline = loadCalls(baselineFile);
const tip = loadCalls(tipFile);

const divergences = [];
if (baseline.length !== tip.length) {
  divergences.push({ kind: 'length', baseline: baseline.length, tip: tip.length });
}
for (let i = 0; i < Math.min(baseline.length, tip.length); i += 1) {
  const b = JSON.stringify(baseline[i]);
  const t = JSON.stringify(tip[i]);
  if (b !== t) divergences.push({ kind: 'call', index: i, baseline: baseline[i], tip: tip[i] });
}

const verdict = {
  byteEqual: divergences.length === 0,
  baselineFile,
  tipFile,
  callsCompared: Math.min(baseline.length, tip.length),
  comparisonFields: FIELDS,
  excludedFields: ['wallMs', 'latencyMs', 'observedLatencyMs', 'timestamps'],
  divergences: divergences.slice(0, 20),
};
process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
process.exit(verdict.byteEqual ? 0 : 1);
