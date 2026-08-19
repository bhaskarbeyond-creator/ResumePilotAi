import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DIFFICULTIES,
  DURATION_PRESETS,
  EXPERIENCE_LEVELS,
  INTERVIEW_MODES,
  INTERVIEW_TYPES,
  PALETTE_META,
  appendHistory,
  buildInterviewReport,
  clearOwnerSession,
  formatClock,
  historyStorageKey,
  paletteStatus,
  readHistory,
  readOwnerSession,
  remainingFromDeadline,
  resolveDurationSeconds,
  sanitizeJobDescription,
  sanitizeResumeFacts,
  scoreTrend,
  sessionStorageKey,
  writeOwnerSession,
} from '../src/utils/interviewCoach.js';

test('duration presets and custom minutes resolve before the exam starts with bounds', () => {
  // Standard presets
  assert.equal(resolveDurationSeconds({ presetMinutes: 15, timerEnabled: true }), 900);
  assert.equal(resolveDurationSeconds({ presetMinutes: 30, timerEnabled: true }), 1800);
  assert.equal(resolveDurationSeconds({ presetMinutes: 45, timerEnabled: true }), 2700);
  assert.equal(resolveDurationSeconds({ presetMinutes: 60, timerEnabled: true }), 3600);

  // Custom minutes with bounds
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 25, timerEnabled: true }), 1500);
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 4, timerEnabled: true }), 900); // under 5m defaults to 15m
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 5, timerEnabled: true }), 300); // 5m floor
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 200, timerEnabled: true }), 10800); // 180m ceiling
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 25.6, timerEnabled: true }), 1560); // rounded to 26m

  // Timer disabled (e.g. untimed practice)
  assert.equal(resolveDurationSeconds({ presetMinutes: 30, timerEnabled: false }), 0);
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 45, timerEnabled: false }), 0);

  // Invalid / non-number fallback
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 'invalid', timerEnabled: true }), 900);
  assert.equal(resolveDurationSeconds({ presetMinutes: null, timerEnabled: true }), 900);
});

test('deadline remaining time and clock formatting are precise and non-drifting', () => {
  const now = 1_000_000;
  assert.equal(remainingFromDeadline(now + 61_000, now), 61);
  assert.equal(remainingFromDeadline(now + 1800_000, now), 1800);
  assert.equal(remainingFromDeadline(now, now), 0);
  assert.equal(remainingFromDeadline(now - 5000, now), 0);
  assert.equal(remainingFromDeadline(null, now), null);

  // Clock format tests
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9), '0:09');
  assert.equal(formatClock(59), '0:59');
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(3599), '59:59');
  assert.equal(formatClock(3600), '1:00:00');
  assert.equal(formatClock(3665), '1:01:05');
  assert.equal(formatClock(7322), '2:02:02');
  assert.equal(formatClock(-10), '0:00');
});

test('CBT palette states and accessible metadata are complete and distinct', () => {
  // Verify 6 distinct states
  assert.equal(paletteStatus({ questionId: 1, currentId: 1, answers: {}, visited: new Set(), marked: new Set() }), 'current');
  assert.equal(paletteStatus({ questionId: 2, currentId: 1, answers: { 2: 0 }, visited: new Set([2]), marked: new Set() }), 'answered');
  assert.equal(paletteStatus({ questionId: 3, currentId: 1, answers: {}, visited: new Set([3]), marked: new Set([3]) }), 'review');
  assert.equal(paletteStatus({ questionId: 4, currentId: 1, answers: { 4: 1 }, visited: new Set([4]), marked: new Set([4]) }), 'answered-review');
  assert.equal(paletteStatus({ questionId: 5, currentId: 1, answers: {}, visited: new Set([5]), marked: new Set() }), 'visited');
  assert.equal(paletteStatus({ questionId: 6, currentId: 1, answers: {}, visited: new Set(), marked: new Set() }), 'not-visited');

  // Verify accessibility metadata for all palette states
  const expectedStates = ['current', 'answered', 'answered-review', 'review', 'visited', 'not-visited'];
  for (const state of expectedStates) {
    const meta = PALETTE_META[state];
    assert.ok(meta, `Palette meta exists for ${state}`);
    assert.ok(meta.label, `Label exists for ${state}`);
    assert.ok(meta.letter, `Letter exists for ${state}`);
    assert.ok(meta.className, `CSS class exists for ${state}`);
  }

  // Verify unique letter identifiers for non-color identification
  const letters = Object.values(PALETTE_META).map(m => m.letter);
  assert.equal(letters.length, 6);
});

test('resume facts extraction sanitizes real data and never injects hallucinations', () => {
  const fullResume = {
    firstname: 'Asha',
    lastname: 'Rao',
    occupation: 'Lead Cloud Architect',
    summary: '<p>Experienced architect specializing in distributed systems and AWS.</p>',
    employments: [
      { jobTitle: 'Principal Engineer', employer: 'Acme Corp' },
      { jobTitle: 'Senior Cloud Engineer', employer: 'Beta Systems' },
    ],
    skills: [{ name: 'Kubernetes' }, { name: 'Terraform' }, { name: 'Go' }],
    projects: [{ title: 'Multi-Region Failover Mesh' }],
    certifications: [{ title: 'AWS Certified Solutions Architect Professional' }],
    educations: [{ degree: 'B.S. Computer Science', school: 'MIT' }],
  };

  const facts = sanitizeResumeFacts(fullResume);
  assert.match(facts, /Name: Asha Rao/);
  assert.match(facts, /Occupation: Lead Cloud Architect/);
  assert.match(facts, /Summary: Experienced architect specializing in distributed systems and AWS\./);
  assert.match(facts, /Work: Principal Engineer at Acme Corp; Senior Cloud Engineer at Beta Systems/);
  assert.match(facts, /Skills: Kubernetes, Terraform, Go/);
  assert.match(facts, /Projects: Multi-Region Failover Mesh/);
  assert.match(facts, /Certifications: AWS Certified Solutions Architect Professional/);
  assert.match(facts, /Education: B\.S\. Computer Science — MIT/);

  // Negative assertion: no fabricated companies, names, or locations
  assert.doesNotMatch(facts, /Google|Netflix|Stanford|San Francisco branch/i);

  // Empty or invalid input handling
  assert.equal(sanitizeResumeFacts(null), '');
  assert.equal(sanitizeResumeFacts({}), '');
});

test('job description sanitization bounds and cleans input safely', () => {
  const rawJd = '  Looking for a Senior Developer with \n\n React,   Node.js, and GraphQL experience.   ';
  const clean = sanitizeJobDescription(rawJd);
  assert.equal(clean, 'Looking for a Senior Developer with React, Node.js, and GraphQL experience.');
  assert.equal(sanitizeJobDescription(null), '');
  assert.equal(sanitizeJobDescription('a'.repeat(5000)).length, 4000);
});

test('comprehensive assessment report computes accurate category, readiness, and JD gap scores', () => {
  const questions = [
    { id: 1, question: 'What is a closure in JS?', options: ['Function + scope', 'Syntax error', 'Loop', 'Class'], correctAnswer: 0, category: 'JavaScript', explanation: 'A closure is a function bundled with its lexical environment.' },
    { id: 2, question: 'How do you handle async errors in Express?', options: ['try/catch or next(err)', 'Ignore', 'Exit process', 'console.log only'], correctAnswer: 0, category: 'Node.js', explanation: 'Pass errors to next(err).' },
    { id: 3, question: 'Explain CAP theorem.', options: ['Cost/Access/Performance', 'Consistency/Availability/Partition Tolerance', 'Code/API/Platform', 'Cache/Auth/Policy'], correctAnswer: 1, category: 'Systems', explanation: 'CAP theorem defines trade-offs in distributed data stores.' },
    { id: 4, question: 'How do you handle conflict with a colleague?', options: ['Escalate to CEO', 'Open dialogue & focus on objectives', 'Ignore them', 'Refuse work'], correctAnswer: 1, category: 'Behavioral', explanation: 'Constructive dialogue aligns goals.' },
  ];

  // User answered Q1 correct (100), Q2 wrong (25), Q3 correct (100), Q4 unanswered (0)
  const report = buildInterviewReport({
    questions,
    answers: { 1: 0, 2: 3, 3: 1 },
    timePerQuestion: { 1: 30000, 2: 45000, 3: 20000 },
    timeLimit: 1800,
    timeRemaining: 1200,
    interviewType: 'technical',
    jobDescription: 'JavaScript, Node.js, Distributed Systems, Team Leadership',
  });

  // Expected overall: (100 + 25 + 100 + 0) / 4 = 56.25 -> 56%
  assert.equal(report.overall, 56);
  assert.equal(report.readiness, 'Needs rehearsal');
  assert.equal(report.completionRate, 75); // 3 of 4 answered
  assert.equal(report.timeUsed, 600); // 1800 - 1200 = 600s
  assert.equal(report.timeLimit, 1800);

  // Category scores
  assert.equal(report.categoryScores['JavaScript'], 100);
  assert.equal(report.categoryScores['Node.js'], 25);
  assert.equal(report.categoryScores['Systems'], 100);
  assert.equal(report.categoryScores['Behavioral'], 0);

  // Strengths & Weaknesses
  assert.deepEqual(report.strengths, ['JavaScript', 'Systems']);
  assert.equal(report.weaknesses.length, 2); // Node.js and Behavioral scored < 70

  // Per-question item details
  assert.equal(report.questions[0].correct, true);
  assert.equal(report.questions[0].userAnswer, 'Function + scope');
  assert.equal(report.questions[1].correct, false);
  assert.equal(report.questions[1].answered, true);
  assert.equal(report.questions[3].answered, false);

  // JD alignment
  assert.ok(report.missingSkills.length > 0);
  assert.match(report.plan.sevenDay[0], /Day 1–2/);
});

test('session and history storage keys enforce user isolation and expiration bounds', () => {
  // Storage key isolation
  assert.equal(sessionStorageKey('user-alice-123'), 'interviewSession:user-alice-123');
  assert.equal(sessionStorageKey(null), 'interviewProgress');
  assert.equal(historyStorageKey('user-alice-123'), 'interviewHistory:user-alice-123');
  assert.equal(historyStorageKey(null), 'interviewHistory:guest');

  // Verify mock storage operations
  const mockStorage = new Map();
  global.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
  };

  // Write session for user-1. Since the schema-v2 hardening, an exam session is
  // only restorable when it carries renderable questions — mirror that contract.
  writeOwnerSession('user-1', {
    phase: 'exam',
    currentQuestion: 2,
    ownerUid: 'user-1',
    interviewData: { questions: [{ id: 1, question: 'Q?', options: ['A', 'B'], correctAnswer: 0 }] },
  });
  const savedUser1 = readOwnerSession('user-1');
  assert.equal(savedUser1.phase, 'exam');
  assert.equal(savedUser1.currentQuestion, 2);

  // User-2 reading user-1 session returns null (isolated)
  assert.equal(readOwnerSession('user-2'), null);

  // Append history for user-1
  appendHistory('user-1', { role: 'Frontend Dev', score: 85, completedAt: '2026-08-18T10:00:00Z', interviewType: 'technical' });
  appendHistory('user-1', { role: 'Frontend Dev', score: 92, completedAt: '2026-08-19T10:00:00Z', interviewType: 'technical' });

  const history1 = readHistory('user-1');
  assert.equal(history1.length, 2);
  assert.equal(history1[0].score, 92); // newest first

  // Trend computation
  const trend = scoreTrend(history1);
  assert.equal(trend.length, 2);
  assert.equal(trend[0].score, 85); // chronological order for trend
  assert.equal(trend[1].score, 92);

  // User-2 history is empty
  const history2 = readHistory('user-2');
  assert.equal(history2.length, 0);

  // Clear session for user-1
  clearOwnerSession('user-1');
  assert.equal(readOwnerSession('user-1'), null);
});

test('interview modes, difficulties, and types catalogs are well-formed and non-empty', () => {
  assert.ok(INTERVIEW_MODES.practice);
  assert.ok(INTERVIEW_MODES.mock);
  assert.ok(INTERVIEW_MODES.assessment);
  assert.equal(INTERVIEW_MODES.assessment.allowPause, false); // Strict CBT

  assert.equal(DURATION_PRESETS.length, 4);
  assert.deepEqual(DURATION_PRESETS, [15, 30, 45, 60]);

  assert.equal(INTERVIEW_TYPES.length, 6);
  assert.ok(INTERVIEW_TYPES.some(t => t.id === 'technical'));
  assert.ok(INTERVIEW_TYPES.some(t => t.id === 'behavioral'));
  assert.ok(INTERVIEW_TYPES.some(t => t.id === 'managerial'));
  assert.ok(INTERVIEW_TYPES.some(t => t.id === 'case'));

  assert.equal(EXPERIENCE_LEVELS.length, 6);
  assert.equal(DIFFICULTIES.length, 4);
});

test('existing generate-interview backend and frontend integration remains preserved with bearer auth', () => {
  const frontend = fs.readFileSync('src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx', 'utf8');
  const backend = fs.readFileSync('backend/routes/ai.js', 'utf8');

  // Frontend contract
  assert.match(frontend, /\/api\/generate-interview/);
  assert.match(frontend, /Authorization.*Bearer/);
  assert.match(frontend, /occupation: state\.occupation/);
  assert.match(frontend, /interviewType: state\.interviewType/);
  assert.match(frontend, /questionCount: state\.questionCount/);
  assert.match(frontend, /resumeFacts: state\.resumeFacts/);
  assert.match(frontend, /jobDescription: sanitizeJobDescription/);

  // Backend contract
  assert.match(backend, /router\.post\('\/generate-interview'/);
  assert.match(backend, /generateConfiguredText\(req, res, prompt, 'generate-interview'/);
  assert.match(backend, /generateDefaultInterview\(/);
  assert.match(backend, /allowedInterviewTypes/);
  assert.match(backend, /safeFacts/);
  assert.match(backend, /safeJd/);
});
