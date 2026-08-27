/**
 * Local OpenAI-compatible mock for browser E2E and preview.
 * Serves POST /v1/chat/completions with a canned assistant completion so the
 * full AI pipeline (config -> provider request -> parse -> render) is
 * exercised without any external provider. Deterministic, zero external calls.
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_AI_PORT || 9417);

const CANNED = {
  summary: 'Certification-driven professional summary: a results-oriented engineer with deep experience in resilient systems, databases, and secure multi-tenant applications.',
  skills: JSON.stringify({ skills: ['MySQL', 'Node.js', 'React', 'System Design', 'Security', 'Testing', 'CI/CD', 'Observability'] }),
  certifications: JSON.stringify({ certifications: [
    { title: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services' },
    { title: 'Certified Kubernetes Administrator', issuer: 'CNCF' },
  ] }),
  suggestions: JSON.stringify({ suggestions: [
    'Led the migration of a legacy platform to a resilient, database-backed architecture.',
    'Reduced incident rate by automating failure injection and recovery testing.',
    'Mentored engineers on secure multi-tenant design and observability.',
  ] }),
  bullet: JSON.stringify({ enhancedBullet: 'Architected and delivered a zero-downtime data migration serving thousands of concurrent users.' }),
};

function pickContent(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/summary|profile summary|professional summary/.test(p)) return CANNED.summary;
  if (/skill/.test(p)) return CANNED.skills;
  if (/certification/.test(p)) return CANNED.certifications;
  if (/autocomplete|suggest|completion candidates/.test(p)) return CANNED.suggestions;
  if (/work description|job description|experience/.test(p)) return CANNED.suggestions;
  if (/education/.test(p)) return CANNED.suggestions;
  if (/bullet|enhance/.test(p)) return CANNED.bullet;
  if (/grammar|spelling|punctuation/.test(p)) return JSON.stringify({ hasErrors: false, corrections: [] });
  return CANNED.summary;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'POST' && /\/v1\/chat\/completions$/.test(req.url)) {
      let prompt = '';
      try {
        const parsed = JSON.parse(body || '{}');
        prompt = (parsed.messages || []).map(m => m.content || '').join('\n');
      } catch (_e) { /* ignore malformed bodies */ }
      const content = pickContent(prompt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `mock-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'certification-mock',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found', type: 'invalid_request_error' } }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-ai] OpenAI-compatible mock listening on 127.0.0.1:${PORT}`);
});
