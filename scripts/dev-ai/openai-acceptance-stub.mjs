#!/usr/bin/env node
/**
 * Deterministic OpenAI-compatible provider stub for LOCAL ACCEPTANCE TESTS ONLY.
 *
 * The backend supports operator endpoint overrides "for self-hosted / private AI
 * gateways ... and for acceptance testing" (backend/services/aiRuntime.js,
 * ENV_BASE_URLS). Pointing OPENAI_BASE_URL at this stub lets a sandbox exercise
 * the real UI -> Express -> service -> MariaDB path for AI features when no real
 * provider is reachable. It proves request/response contracts, persistence,
 * authorization and UI states. It proves NOTHING about AI quality: every reply is
 * a fixed, rule-based template, and the visible text says it came from the stub.
 *
 * Never point a shared, staging or production backend at this server.
 *
 * Recognised operations (matched on the backend's own prompt text):
 *   generate-interview     calibrated multiple-choice assessment
 *   live-interview-open    first interviewer question
 *   live-interview-turn    evaluation of the latest answer + next question
 *   live-interview-report  final report
 *   live-interview-guide   answer guidance for one question
 * Anything else gets HTTP 422 so other features fail honestly instead of
 * receiving stub content.
 *
 *   STUB_PORT=8790 STUB_API_KEY=acceptance-stub-key node scripts/dev-ai/openai-acceptance-stub.mjs
 *
 * Backend: OPENAI_API_KEY=acceptance-stub-key OPENAI_BASE_URL=http://127.0.0.1:8790/v1
 *          OPENAI_MODEL=acceptance-stub-model AI_ROUTING_DISCOVERY=false
 * GET /__stub/stats returns per-operation call counts (for test assertions).
 */
import http from 'node:http';

const PORT = Number(process.env.STUB_PORT || 8790);
const API_KEY = process.env.STUB_API_KEY || 'acceptance-stub-key';
const MODEL = 'acceptance-stub-model';
const stats = { startedAt: new Date().toISOString(), calls: {} };

const MCQ_BANK = [
  ['A request arrives with an unclear acceptance criterion. What is the best first step?', ['Start building and adjust later', 'Ask the requester to confirm the expected outcome', 'Pick the interpretation that is fastest to deliver', 'Wait until someone else raises it'], 1, 'Confirming the expected outcome first avoids rework; the trade-off is a short delay before starting.'],
  ['You notice a small error in work that has already been shared with a client. What should you do?', ['Ignore it because it is small', 'Fix it silently and hope nobody noticed', 'Tell your manager, correct it and share the corrected version', 'Wait for the client to report it'], 2, 'Owning and correcting the error keeps trust; the cost is an uncomfortable conversation.'],
  ['Two tasks are due on the same afternoon and you can only finish one well. What is the most effective move?', ['Do both badly', 'Agree the priority with the people who depend on them', 'Finish whichever is more enjoyable', 'Skip both and start fresh tomorrow'], 1, 'Agreeing priorities with stakeholders aligns effort with impact instead of guessing.'],
  ['Which habit best keeps a shared document trustworthy over time?', ['Letting anyone overwrite any section', 'Recording who changed what and why', 'Keeping several private copies', 'Avoiding updates once it is published'], 1, 'A visible change history makes content auditable; it adds a little overhead to each edit.'],
  ['A teammate keeps missing hand-offs that block your work. What is the best first response?', ['Complain to the whole team', 'Raise it privately and agree a clearer hand-off', 'Do their part yourself every time', 'Stop relying on hand-offs entirely'], 1, 'A private, specific conversation usually fixes the process without damaging the relationship.'],
  ['You are asked for an estimate on unfamiliar work. What is the most responsible answer?', ['A precise date to sound confident', 'A range with the main assumptions stated', 'Refusing to estimate at all', 'The same estimate as the last task'], 1, 'A range with assumptions is honest about uncertainty and can be refined as you learn.'],
  ['What is the main purpose of reviewing your own work before handing it over?', ['To make it look longer', 'To catch mistakes while they are cheap to fix', 'To delay the hand-off', 'To avoid feedback from others'], 1, 'Self-review catches cheap-to-fix issues early; it does not replace peer review.'],
  ['A stakeholder changes the scope halfway through a task. What should happen next?', ['Absorb the change without telling anyone', 'Confirm the new scope and its effect on the timeline', 'Refuse every change', 'Restart the task from scratch immediately'], 1, 'Making the impact of a scope change explicit lets the stakeholder decide with full information.'],
  ['Which practice best protects personal data you handle at work?', ['Sharing it in public channels for speed', 'Accessing only what the task needs and storing it securely', 'Keeping copies on a personal device', 'Emailing it to yourself as a backup'], 1, 'Least-privilege access and secure storage reduce exposure if anything goes wrong.'],
  ['You receive critical feedback you disagree with. What is the most constructive reaction?', ['Dismiss it immediately', 'Ask for specific examples and consider them before replying', 'Argue until the reviewer gives up', 'Avoid that reviewer in future'], 1, 'Asking for specifics separates useful signal from misunderstanding without escalating.'],
  ['What makes a status update most useful to a busy reader?', ['A long narrative of everything you did', 'Progress, blockers and the next step in a few lines', 'Only good news', 'Technical detail without any summary'], 1, 'Short, structured updates let readers act quickly; detail can follow on request.'],
  ['You are stuck on a problem for longer than expected. What is the best approach?', ['Keep going silently for as long as it takes', 'Summarise what you tried and ask a colleague for a second view', 'Abandon the task without telling anyone', 'Guess and move on'], 1, 'A concise summary makes asking for help efficient and respects the helper\'s time.'],
  ['Which is the clearest way to confirm a decision made in a meeting?', ['Assume everyone remembers it', 'Send a short written recap with owners and dates', 'Mention it again at the next meeting', 'Record nothing to save time'], 1, 'A written recap with owners prevents different memories of the same decision.'],
  ['A process you follow every week is slow and error-prone. What is a sensible first improvement?', ['Replace the whole process at once', 'Measure where time and errors occur, then fix the worst step', 'Ask someone else to do it', 'Skip the process when busy'], 1, 'Targeting the worst step first gives the biggest gain for the least disruption.'],
  ['How should you handle a request that conflicts with a company policy?', ['Do it quietly', 'Explain the conflict and suggest a compliant alternative', 'Ignore the request', 'Change the policy yourself'], 1, 'Offering a compliant alternative keeps the relationship while respecting the policy.'],
  ['What is the best way to learn a new tool needed for your next task?', ['Read every page of the manual first', 'Build a small, real example and look up gaps as they appear', 'Wait for formal training', 'Avoid the tool and use an old one'], 1, 'Learning through a small real example focuses effort on what the task actually needs.'],
  ['A customer is upset about a delay you did not cause. What is the most professional response?', ['Blame the team responsible', 'Acknowledge the impact, explain the next step and follow up', 'Promise an unrealistic fix', 'Avoid replying until it is resolved'], 1, 'Acknowledging impact and committing to a next step rebuilds confidence without blame.'],
  ['Why is it useful to write down the reasoning behind a decision?', ['It is not useful', 'So others can understand and revisit it later', 'To make documents longer', 'To prove you were right'], 1, 'Recorded reasoning lets future readers revisit a decision when circumstances change.'],
  ['You finish a task early. What is the most valuable next step?', ['Hide the spare time', 'Check the result with its user and offer help on the next priority', 'Start an unrelated personal project', 'Re-do the task in a different style'], 1, 'Validating the result with its user confirms the task actually met the need.'],
  ['What is the best indicator that a piece of work is ready to hand over?', ['It took a long time', 'It meets the agreed criteria and has been checked', 'It looks impressive', 'Nobody has asked about it'], 1, 'Agreed criteria plus a check give an objective definition of done.'],
];

const LIVE_QUESTIONS = [
  'Can you walk me through a recent piece of work you are proud of and the part you personally owned?',
  'How do you decide what to work on first when several tasks arrive on the same day?',
  'Tell me about a time a teammate disagreed with your approach. How did you handle it?',
  'What do you do when you realise you will miss a deadline you committed to?',
  'How do you check that your work is correct before you hand it over?',
  'Describe a time you had to learn something new quickly. What did you do first?',
  'How do you keep the people who depend on your work informed when a task changes direction?',
  'Tell me about a mistake you made at work and what you changed afterwards?',
  'How do you ask for help when you are stuck on a problem?',
  'What kind of feedback helps you improve the most, and why?',
];

const STUB_SCORE = 74;

function firstUnasked(list, prompt) {
  return list.find((item) => !prompt.includes(item)) || list[list.length - 1];
}

function generateInterview(prompt) {
  const occupation = (/"title":\s*"([^"]*?) - [A-Za-z]+ Assessment"/.exec(prompt) || [])[1] || 'Candidate';
  const retry = /Regenerate ONLY (\d+)/.exec(prompt);
  const requested = Number((retry || /Generate exactly (\d+)\b/.exec(prompt) || [])[1] || 10);
  const fresh = MCQ_BANK.filter(([question]) => !prompt.includes(question));
  // Rotate the correct option so clients must read correctAnswer instead of assuming a position.
  const questions = fresh.slice(0, Math.max(1, Math.min(requested, fresh.length))).map(([question, options, correct, explanation], index) => {
    const shift = index % options.length;
    const rotated = options.map((_, i) => options[(i + shift) % options.length]);
    return {
      id: index + 1,
      question,
      options: rotated,
      correctAnswer: (correct - shift + options.length) % options.length,
      category: 'Workplace judgement',
      difficulty: 'Easy',
      weight: 1,
      explanation,
      estimatedTime: 90,
    };
  });
  return {
    title: `Acceptance stub — ${occupation} assessment`,
    company: 'Local acceptance-test provider (not an AI model)',
    department: 'Acceptance testing',
    duration: `${questions.length * 3} minutes`,
    totalQuestions: questions.length,
    passingScore: 70,
    categories: ['Workplace judgement'],
    questions,
  };
}

function liveOpening(prompt) {
  return {
    interviewer_message: 'Acceptance-test interviewer (deterministic stub provider, not an AI model). Let us begin.',
    question: firstUnasked(LIVE_QUESTIONS, prompt),
    response_type: 'opening_question',
    interview_stage: 'opening',
    topic: 'Introduction',
    question_intent: 'Understand what the candidate personally owned.',
    model_answer: '',
    answer_tip: 'Name the situation, what you did yourself and what changed as a result.',
    suggested_talking_points: [],
    suggested_starters: ['A recent example is', 'The part I owned was'],
  };
}

function liveTurn(prompt) {
  return {
    evaluation: {
      score: STUB_SCORE,
      observations: ['Stub observation: the answer was recorded and evaluated by the acceptance-test provider.'],
      coaching_tip: 'Stub tip: add the result of your actions so the impact is clear.',
      evidence: [],
    },
    interviewer_message: 'Thanks. Next question from the stub interviewer.',
    question: firstUnasked(LIVE_QUESTIONS, prompt),
    response_type: 'next_question',
    interview_stage: 'capability',
    topic: 'Working practices',
    interview_complete: false,
    answer_tip: 'Keep the answer specific to one real example.',
    suggested_starters: ['In that situation I'],
  };
}

function liveReport() {
  return {
    overall_score: STUB_SCORE,
    readiness: 'Acceptance stub readiness band',
    summary: 'Deterministic acceptance-stub report generated by the local test provider, not by an AI model. It confirms the report contract only.',
    strengths: ['Stub strength: every question received an answer.'],
    focus_areas: [{ area: 'Stub focus area', detail: 'Add measurable results to each example.' }],
    practice_plan: ['Stub plan: rehearse two examples with clear outcomes.'],
    evidence: ['Stub evidence: answers were submitted for every turn.'],
    competencies: [{ name: 'Communication', score: STUB_SCORE, evidence: 'Stub evidence: answered in complete sentences.' }],
  };
}

function guide() {
  return {
    goal: 'Acceptance stub guidance: the interviewer wants to hear how you approach this situation, step by step, and what you learned.',
    modelAnswer: 'In my last role a request reached me with an unclear goal, so I first asked the requester what a good result would look like for them. '
      + 'I wrote that down, shared it back in a short message and agreed when we would check progress together. '
      + 'While working I kept notes of decisions and flagged one risk early, which let us adjust the plan before it became a problem. '
      + 'At the end I walked the requester through the result against what we had agreed, and I kept the notes so the next person could reuse them.',
    tip: 'Replace this stub example with one real situation of your own and say what changed because of your actions.',
  };
}

function classify(prompt) {
  if (prompt.includes('"passingScore": 70') && prompt.includes('Format the response as a JSON object')) return ['generate-interview', generateInterview];
  if (prompt.startsWith('You are opening a realistic mock interview')) return ['live-interview-open', liveOpening];
  if (prompt.startsWith('You are the interviewer in an ongoing mock interview')) return ['live-interview-turn', liveTurn];
  if (prompt.startsWith('Create a candid, supportive final mock-interview report')) return ['live-interview-report', liveReport];
  if (prompt.startsWith('You are an experienced interview coach helping one candidate prepare an answer')) return ['live-interview-guide', guide];
  return [null, null];
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__stub/stats') return send(res, 200, stats);
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return send(res, 401, { error: { message: 'acceptance stub: invalid API key', type: 'invalid_request_error' } });
  }
  if (req.method === 'GET' && /\/models$/.test(req.url)) {
    return send(res, 200, { object: 'list', data: [{ id: MODEL, object: 'model', owned_by: 'acceptance-stub' }] });
  }
  if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url)) {
    return send(res, 404, { error: { message: 'acceptance stub: unknown endpoint', type: 'invalid_request_error' } });
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: { message: 'acceptance stub: invalid JSON', type: 'invalid_request_error' } }); }
    const prompt = (Array.isArray(body.messages) ? body.messages : []).map((m) => String(m?.content || '')).join('\n');
    const [operation, build] = classify(prompt);
    const key = operation || 'unsupported';
    stats.calls[key] = (stats.calls[key] || 0) + 1;
    console.log(`[stub] ${new Date().toISOString()} ${key}`);
    if (!build) {
      return send(res, 422, { error: { message: 'acceptance stub: unsupported prompt (only the interview operations are stubbed)', type: 'invalid_request_error' } });
    }
    const content = JSON.stringify(build(prompt));
    return send(res, 200, {
      id: `stub-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: MODEL,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((prompt.length + content.length) / 4) },
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub] OpenAI-compatible ACCEPTANCE STUB on http://127.0.0.1:${PORT}/v1 (deterministic; not an AI model)`);
});
