'use strict';

/**
 * `jsoncompact` compression engine (priority 15, lossless for the table dialect).
 *
 * Ported from freellmapi-0.16.6 `services/compression/engines/jsoncompact.ts`.
 *
 * Uniform arrays of objects inside a prompt ("tool results") are re-encoded as
 * a column-header + JSON-row table, which removes the repeated key names. The
 * encoding is reversible: `decodeJsonTables` restores the original JSON array,
 * so a caller may hand the compressed prompt to a model and decode any echoed
 * table back into data without information loss.
 *
 * Additionally, JSON documents that are not table-shaped have insignificant
 * whitespace removed (also lossless).
 *
 * Example:
 *   [{"name":"Ada","role":"Engineer"},{"name":"Lin","role":"Designer"}, …]
 * becomes
 *   [[json-table:v1 columns=["name","role"] rows=8]]
 *   ["Ada","Engineer"]
 *   ["Lin","Designer"]
 *   [[/json-table]]
 */

const { textContent, withTextContent } = require('./helpers');

const HEADER_RE = /\[\[json-table:v1 columns=(\[[^\n]+\]) rows=(\d+)\]\]\n([\s\S]*?)\n\[\[\/json-table\]\]/g;

function uniformKeys(value, minRows) {
  if (!Array.isArray(value) || value.length < minRows) return null;
  if (!value.every(row => row != null && typeof row === 'object' && !Array.isArray(row))) return null;
  const rows = value;
  const keys = Object.keys(rows[0]);
  if (keys.length === 0) return null;
  const signature = [...keys].sort().join('\u0000');
  if (!rows.every(row => Object.keys(row).length === keys.length && [...Object.keys(row)].sort().join('\u0000') === signature)) {
    return null;
  }
  return { rows, keys };
}

function encodeJsonTable(value, minRows = 8) {
  const table = uniformKeys(value, minRows);
  if (!table) return null;
  const body = table.rows.map(row => JSON.stringify(table.keys.map(key => row[key]))).join('\n');
  return `[[json-table:v1 columns=${JSON.stringify(table.keys)} rows=${table.rows.length}]]\n${body}\n[[/json-table]]`;
}

function decodeJsonTables(text) {
  return String(text || '').replace(HEADER_RE, (full, rawColumns, rawCount, rawRows) => {
    try {
      const columns = JSON.parse(rawColumns);
      const rows = rawRows.split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (rows.length !== Number(rawCount) || !rows.every(row => row.length === columns.length)) return full;
      return JSON.stringify(rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]]))));
    } catch {
      return full;
    }
  });
}

/** Locate structurally balanced JSON array spans in free text. */
function jsonArrayCandidates(text) {
  const spans = [];
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"' && stack.length > 0) {
      inString = true;
      continue;
    }
    if (char === '[' || char === '{') {
      stack.push({ opener: char, start: index });
      continue;
    }
    if (char !== ']' && char !== '}') continue;

    const expected = char === ']' ? '[' : '{';
    const opened = stack.pop();
    if (!opened || opened.opener !== expected) {
      stack.length = 0;
      continue;
    }
    if (opened.opener === '[') spans.push({ start: opened.start, end: index + 1 });
  }

  // Parse the largest candidates first so a useful outer table wins over its
  // nested arrays. Bounds keep valid-but-pathological nesting from turning
  // parsing into quadratic work after the linear structural scan.
  spans.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const candidates = [];
  const parseCharBudget = Math.max(text.length * 4, 100_000);
  let parsedChars = 0;
  for (const span of spans) {
    const size = span.end - span.start;
    if (candidates.length >= 512 || parsedChars + size > parseCharBudget) break;
    parsedChars += size;
    try {
      candidates.push({ ...span, value: JSON.parse(text.slice(span.start, span.end)) });
    } catch {
      // Structurally balanced text is not necessarily valid JSON.
    }
  }
  return candidates;
}

function compactText(text, minRows) {
  const candidates = jsonArrayCandidates(text);
  const used = [];
  let tables = 0;
  for (const candidate of candidates) {
    if (used.some(range => candidate.start < range.end && candidate.end > range.start)) continue;
    const encoded = encodeJsonTable(candidate.value, minRows);
    if (!encoded) continue;
    const original = text.slice(candidate.start, candidate.end);
    if (encoded.length >= original.length) continue;
    used.push({ start: candidate.start, end: candidate.end, encoded });
    tables += 1;
  }

  let output = text;
  for (const range of [...used].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, range.start) + range.encoded + output.slice(range.end);
  }
  return { text: output, tables };
}

/**
 * Lossless whitespace compaction for standalone JSON documents (objects as
 * well as arrays): parse, re-serialize without indentation, and accept it only
 * when it is genuinely shorter.
 */
function compactJsonDocument(text) {
  const trimmed = String(text || '').trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  if (!(trimmed.endsWith('}') || trimmed.endsWith(']'))) return null;
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch { return null; }
  const compact = JSON.stringify(parsed);
  if (compact.length >= text.length) return null;
  return compact;
}

const jsonCompactEngine = {
  id: 'jsoncompact',
  priority: 15,
  lossless: true,
  targets: ['messages', 'tool-results'],
  defaultConfig: { enabled: true, minRows: 8, compactDocuments: true },
  apply({ messages, config = {} }) {
    const minRows = Number.isInteger(config.minRows) ? config.minRows : 8;
    const compactDocuments = config.compactDocuments !== false;
    let tables = 0;
    let documents = 0;

    const output = messages.map(message => {
      const content = textContent(message);
      if (content == null || content.length < 64) return message;

      let next = content;
      const compacted = compactText(next, minRows);
      next = compacted.text;
      tables += compacted.tables;

      if (compactDocuments) {
        const doc = compactJsonDocument(next);
        if (doc) {
          next = doc;
          documents += 1;
        }
      }

      return next === content ? message : withTextContent(message, next);
    });

    return { messages: output, details: { tables, documents } };
  },
};

module.exports = {
  jsonCompactEngine,
  encodeJsonTable,
  decodeJsonTables,
  jsonArrayCandidates,
  compactText,
  compactJsonDocument,
};
