'use strict';
const http = require('node:http');

const PORT = Number(process.env.LLAMACPP_PORT || 8081);
const MODEL = 'llama-3.2-1b-instruct';

const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (req.method === 'GET' && (url === '/v1/models' || url === '/models')) {
    const payload = JSON.stringify({
      object: 'list',
      data: [{
        id: MODEL,
        object: 'model',
        owned_by: 'llamacpp',
        context_window: 4096,
        capabilities: { vision: false, tools: true, json: true, streaming: true },
      }],
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    return res.end(payload);
  }

  if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/chat/completions')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: MODEL,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'A tree is a perennial plant with an elongated stem or trunk supporting branches and leaves.',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 12, completion_tokens: 16, total_tokens: 28 },
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      return res.end(payload);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Not found', code: 404 } }));
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Local llama.cpp stub listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = server;
