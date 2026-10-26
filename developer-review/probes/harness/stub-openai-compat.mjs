#!/usr/bin/env node
/**
 * OpenAI-compatible probe stub — REBUILT harness (R15).
 *
 * The original /tmp/probe/stub.mjs was lost with the sandbox /tmp (not
 * snapshot-persisted). This is a faithful in-tree reconstruction from the
 * documented behaviour in developer-review/engine-audit-2026-10-24.md
 * ("Reproduction" + "Post-fix verification" sections): an OpenAI-compatible
 * stub with NAME/PORT/MODEL/MODE/DELAY environment control, POST counting
 * (for "beta received no new call" style assertions) and runtime mode/delay
 * mutation (the /__mode + /__config endpoints are a reconstruction-era
 * convenience extension — the original required a stub restart; both routes
 * are disclosed here and used only where transcripts say so).
 *
 * Env:
 *   NAME    stub identity in served content (default 'stub')
 *   PORT    listen port (required)
 *   MODEL   model id served and advertised by /v1/models (default NAME-model)
 *   MODE    'ok' | '500' | '429' (default 'ok')
 *   DELAY / DELAY_MS  artificial latency applied to EVERY endpoint (default 0)
 *   USAGE_PROMPT / USAGE_COMPLETION  deterministic usage tokens (default 13/7)
 *
 * Endpoints:
 *   POST /v1/chat/completions   mode-aware completion
 *   GET  /v1/models             catalog discovery {data:[{id:MODEL}]}
 *   GET  /__stats               {name, model, mode, delayMs, posts, lastAuth}
 *   POST /__reset               zero counters
 *   POST /__mode    {mode?, delayMs?}      runtime behaviour mutation
 *   POST /__config  {model?, mode?, delayMs?}  runtime model mutation
 */

import http from 'node:http';

const NAME = process.env.NAME || 'stub';
const PORT = Number(process.env.PORT || 0);
if (!PORT) {
  process.stderr.write('PORT is required\n');
  process.exit(2);
}

const state = {
  model: process.env.MODEL || `${NAME}-model`,
  mode: process.env.MODE || 'ok',
  delayMs: Number(process.env.DELAY_MS || process.env.DELAY || 0) || 0,
  posts: 0,
  lastAuth: null,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

const server = http.createServer(async (req, res) => {
  await sleep(state.delayMs); // the original stub delayed EVERY endpoint (catalog discovery included)
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/__stats') {
    return json(res, 200, { name: NAME, ...state });
  }
  if (req.method === 'POST' && url.pathname === '/__reset') {
    state.posts = 0;
    state.lastAuth = null;
    return json(res, 200, { ok: true, ...state });
  }
  if (req.method === 'POST' && (url.pathname === '/__mode' || url.pathname === '/__config')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const patch = JSON.parse(body || '{}');
      if (patch.mode) state.mode = String(patch.mode);
      if (patch.delayMs !== undefined) state.delayMs = Number(patch.delayMs) || 0;
      if (url.pathname === '/__config' && patch.model) state.model = String(patch.model);
    } catch {
      return json(res, 400, { error: 'invalid JSON patch' });
    }
    return json(res, 200, { ok: true, ...state });
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return json(res, 200, {
      object: 'list',
      data: [{ id: state.model, object: 'model', created: 1700000000, owned_by: NAME }],
    });
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    state.posts += 1;
    state.lastAuth = String(req.headers.authorization || '');
    // Drain the request body (the engine always sends one).
    for await (const chunk of req) { void chunk; }
    if (state.mode === '429') {
      res.setHeader('Retry-After', '60');
      return json(res, 429, { error: { message: `rate limited by ${NAME} stub`, type: 'rate_limit_error', code: 'rate_limit_exceeded' } });
    }
    if (state.mode === '500') {
      return json(res, 500, { error: { message: `server error from ${NAME}`, type: 'server_error' } });
    }
    const promptTokens = Number(process.env.USAGE_PROMPT || 13);
    const completionTokens = Number(process.env.USAGE_COMPLETION || 7);
    return json(res, 200, {
      id: `chatcmpl-${NAME}-${state.posts}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: state.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: `served by ${NAME} (${state.model})` },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    });
  }

  return json(res, 404, { error: { message: `unknown route ${req.method} ${url.pathname}` } });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[stub:${NAME}] listening on 127.0.0.1:${PORT} model=${state.model} mode=${state.mode} delay=${state.delayMs}ms\n`);
});
