'use strict';

/**
 * FreeLLMAPI Inline Tool-Call Dialect Rescue
 *
 * Ported from freellmapi-0.16.6 `server/src/lib/tool-call-rescue.ts`.
 *
 * When a conversation switches models mid-task (failover, sticky miss), the new
 * model often continues the previous model's tool-call style and emits the call
 * as TEXT in its private training dialect instead of a structured `tool_calls`
 * array. The client's agent loop sees prose, treats the turn as a final answer,
 * and dies mid-task.
 *
 * This module detects the known dialects and re-parses them into standard
 * OpenAI tool_calls, schema-gated against the request's tool list. A turn that
 * is detected as a dialect but cannot be parsed into a known tool is a DEAD turn.
 *
 * Supported dialects:
 *  1. Kimi / DeepSeek token style:
 *     <|tool_calls_section_begin|><|tool_call_begin|>functions.NAME:0
 *     <|tool_call_argument_begin|>{...}<|tool_call_end|>...
 *  2. Llama / Groq function tags: <function=NAME{...}</function> and
 *     <function=NAME>{...}</function>
 *  3. Qwen / Hermes XML: <tool_call>{"name": ..., "arguments": ...}</tool_call>
 *  4. Bare or ```json-fenced single JSON object: {"name": KNOWN, "arguments": {...}}
 *     (only rescued when "name" matches a requested tool)
 */

const DIALECT_MARKERS = Object.freeze([
  '<|tool_calls_section_begin|>',
  '<|tool_call_begin|>',
  '<tool_call>',
  '<function=',
]);

function startsWithDialectMarker(text) {
  const t = String(text || '').trimStart();
  return DIALECT_MARKERS.some(m => t.startsWith(m));
}

function couldBecomeDialectMarker(text) {
  const t = String(text || '').trimStart();
  if (t.length === 0) return true;
  return DIALECT_MARKERS.some(m => m.startsWith(t) && t.length < m.length);
}

function containsDialectMarker(text) {
  const value = String(text || '');
  return DIALECT_MARKERS.some(m => value.includes(m));
}

/**
 * Extract one balanced JSON object or array starting at text[from] (which must
 * be '{' or '['). String-aware so braces inside JSON strings don't break balance.
 */
function extractBalancedJson(text, from) {
  const open = text[from];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { json: text.slice(from, i + 1), end: i + 1 };
    }
  }
  return null;
}

// An empty set means the request declared no tools, so NOTHING is callable.
const isKnownTool = (name, toolNames) => Boolean(name) && toolNames.has(name);

function callFromNamedJson(json, toolNames) {
  let obj;
  try { obj = JSON.parse(json); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  if (!name || !isKnownTool(name, toolNames)) return null;
  const rawArgs = obj.arguments !== undefined ? obj.arguments : (obj.parameters !== undefined ? obj.parameters : {});
  const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
  try { JSON.parse(args); } catch { return null; }
  return { name, arguments: args };
}

function parseTokenDialect(text, toolNames) {
  const calls = [];
  let clean = String(text)
    .split('<|tool_calls_section_begin|>').join('')
    .split('<|tool_calls_section_end|>').join('');

  const callRe = /<\|tool_call_begin\|>\s*([\s\S]*?)\s*<\|tool_call_argument_begin\|>\s*/g;
  let parsedAll = true;
  const spans = [];
  let m;
  while ((m = callRe.exec(clean)) !== null) {
    const idToken = m[1].trim();
    const argStart = m.index + m[0].length;
    const jsonStart = clean.indexOf('{', argStart);
    const extracted = jsonStart === -1 ? null : extractBalancedJson(clean, jsonStart);
    const nameMatch = /^functions\.([A-Za-z0-9_.-]+):\d+$/.exec(idToken);
    const name = nameMatch ? nameMatch[1] : undefined;
    let argsOk = false;
    if (extracted && name && isKnownTool(name, toolNames)) {
      try {
        JSON.parse(extracted.json);
        argsOk = true;
      } catch { /* fall through */ }
      if (argsOk) calls.push({ name, arguments: extracted.json });
    }
    if (!argsOk) parsedAll = false;
    const endTag = clean.indexOf('<|tool_call_end|>', extracted ? extracted.end : argStart);
    spans.push({
      from: m.index,
      to: endTag === -1 ? (extracted ? extracted.end : argStart) : endTag + '<|tool_call_end|>'.length,
    });
  }
  for (const span of [...spans].reverse()) clean = clean.slice(0, span.from) + clean.slice(span.to);
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

function parseFunctionTagDialect(text, toolNames) {
  const calls = [];
  const value = String(text);
  let clean = value;
  let parsedAll = true;
  const headRe = /<function=([A-Za-z0-9_.-]+)\s*>?\s*/g;
  const spans = [];
  let m;
  while ((m = headRe.exec(value)) !== null) {
    const name = m[1];
    const afterHead = m.index + m[0].length;
    const jsonStart = value[afterHead] === '{' || value[afterHead] === '['
      ? afterHead
      : value.indexOf('{', afterHead);
    const extracted = jsonStart === -1 ? null : extractBalancedJson(value, jsonStart);
    let ok = false;
    if (extracted && isKnownTool(name, toolNames) && extracted.json.startsWith('{')) {
      try {
        JSON.parse(extracted.json);
        ok = true;
      } catch { /* fall through */ }
      if (ok) calls.push({ name, arguments: extracted.json });
    }
    if (!ok) parsedAll = false;
    const closeTag = value.indexOf('</function>', extracted ? extracted.end : m.index + m[0].length);
    spans.push({
      from: m.index,
      to: closeTag === -1
        ? (extracted ? extracted.end : m.index + m[0].length)
        : closeTag + '</function>'.length,
    });
  }
  for (const span of [...spans].reverse()) clean = clean.slice(0, span.from) + clean.slice(span.to);
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

function parseXmlDialect(text, toolNames) {
  const calls = [];
  const value = String(text);
  let parsedAll = true;
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m;
  const matches = [];
  while ((m = re.exec(value)) !== null) matches.push(m[1]);
  for (const inner of matches) {
    const call = callFromNamedJson(inner, toolNames);
    if (call) calls.push(call);
    else parsedAll = false;
  }
  let clean = value.replace(re, '');
  // An opening tag with no close (truncated stream) is detected-but-broken.
  if (clean.includes('<tool_call>')) {
    parsedAll = false;
    clean = clean.replace(/<tool_call>[\s\S]*$/, '');
  }
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

/**
 * Rescue inline tool-call dialects out of an assistant text answer.
 *
 * @param {string} text assistant message content
 * @param {Set<string>|string[]} toolNames names of tools the request declared;
 *        rescued calls must match one (empty set accepts nothing).
 * @returns {{detected:boolean, calls:Array<{name:string,arguments:string}>|null, cleanText:string}}
 */
function rescueInlineToolCalls(text, toolNames) {
  const names = toolNames instanceof Set ? toolNames : new Set(Array.isArray(toolNames) ? toolNames : []);
  if (!text) return { detected: false, calls: null, cleanText: text };

  if (text.includes('<|tool_call_begin|>') || text.includes('<|tool_calls_section_begin|>')) {
    return { detected: true, ...parseTokenDialect(text, names) };
  }
  if (text.includes('<function=')) {
    return { detected: true, ...parseFunctionTagDialect(text, names) };
  }
  if (text.includes('<tool_call>')) {
    return { detected: true, ...parseXmlDialect(text, names) };
  }

  // Dialect 4: the entire answer is one JSON object naming a known tool —
  // either bare or inside a ```json fence. Strictly schema-gated.
  const trimmed = String(text).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    const call = callFromNamedJson(candidate, names);
    if (call) return { detected: true, calls: [call], cleanText: '' };
  }

  return { detected: false, calls: null, cleanText: text };
}

/** Normalize OpenAI `tools` (or Anthropic `tools`) into a Set of names. */
function toolNamesFrom(tools) {
  const names = new Set();
  if (!Array.isArray(tools)) return names;
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const name = tool.function?.name || tool.name;
    if (typeof name === 'string' && name) names.add(name);
  }
  return names;
}

/**
 * Convert AI SDK / Anthropic-style tools into OpenAI function tools.
 * Gemini and OpenAI-compatible adapters both consume this shape.
 */
function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    if (tool.type === 'function' && tool.function && typeof tool.function.name === 'string') {
      out.push({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || { type: 'object', properties: {} },
        },
      });
      continue;
    }
    // Anthropic style: { name, description, input_schema }
    if (typeof tool.name === 'string') {
      out.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || tool.parameters || { type: 'object', properties: {} },
        },
      });
    }
  }
  return out;
}

module.exports = {
  DIALECT_MARKERS,
  startsWithDialectMarker,
  couldBecomeDialectMarker,
  containsDialectMarker,
  extractBalancedJson,
  rescueInlineToolCalls,
  toolNamesFrom,
  normalizeTools,
};
