'use strict';
const { setTimeout: delay } = require('node:timers/promises');
/** Official AI Horde asynchronous text API. Anonymous key is explicitly documented by Haidra.
 * Community workers process prompts: opt-in only, no tools/vision/JSON/streaming guarantees.
 * https://github.com/Haidra-Org/AI-Horde#anonymous-usage
 * https://github.com/Haidra-Org/AI-Horde/blob/main/tests/integration/test_text.py
 */
async function callAiHorde({ baseUrl = 'https://aihorde.net/api/v2', apiKey, model, messages, temperature = 0.3,
  maxTokens = 128, timeoutMs = 25000, fetchImpl = globalThis.fetch, pollMs = 2000 }) {
  const base = baseUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', apikey: !apiKey || apiKey === 'keyless' ? '0000000000' : apiKey,
    'Client-Agent': 'ResumePilotAI:1:https://github.com/bhaskarbeyond-creator/ResumePilotAi' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let id;
  let completed = false;
  async function request(url, options = {}) {
    const response = await fetchImpl(url, { headers, signal: controller.signal, ...options });
    if (!response.ok) throw Object.assign(new Error(`AI Horde HTTP ${response.status}`), { status: response.status, code: response.status === 429 ? 'RATE_LIMITED' : 'HORDE_HTTP_ERROR' });
    return response.json();
  }
  try {
    const prompt = messages.map(message => `${message.role}: ${message.content}`).join('\n') + '\nassistant:';
    const queued = await request(`${base}/generate/text/async`, { method: 'POST', body: JSON.stringify({ prompt,
      params: { n: 1, max_length: maxTokens, max_context_length: 2048, temperature }, models: [model],
      trusted_workers: true, nsfw: false, }) });
    if (typeof queued.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(queued.id)) throw Object.assign(new Error('AI Horde returned no valid job ID'), { code: 'INVALID_RESPONSE' });
    id = queued.id;
    while (!controller.signal.aborted) {
      const status = await request(`${base}/generate/text/status/${encodeURIComponent(id)}`);
      if (status.faulted) throw Object.assign(new Error('AI Horde generation faulted'), { code: 'GENERATION_FAILED' });
      if (status.done) {
        const generation = status.generations?.find(item => typeof item.text === 'string' && item.text.trim());
        if (!generation) throw Object.assign(new Error('AI Horde returned no generated text'), { code: 'EMPTY_RESPONSE' });
        if (generation.model !== model) throw Object.assign(new Error('AI Horde executed an unexpected model'), { code: 'MODEL_MISMATCH' });
        completed = true;
        return { content: generation.text.trim(), usage: null, finishReason: 'stop' };
      }
      await delay(pollMs, undefined, { signal: controller.signal });
    }
    throw new Error('AI Horde request timed out');
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error('AI Horde queue/inference timed out'), { status: 504, code: 'REQUEST_TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(timer);
    if (id && !completed) {
      // Release queued work after timeout/error; no retries or account/priority evasion.
      await fetchImpl(`${base}/generate/text/status/${encodeURIComponent(id)}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(2000) }).catch(() => {});
    }
  }
}
module.exports = { callAiHorde };
