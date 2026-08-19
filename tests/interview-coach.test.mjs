import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildInterviewReport,
  formatClock,
  paletteStatus,
  remainingFromDeadline,
  resolveDurationSeconds,
  sanitizeJobDescription,
  sanitizeResumeFacts,
} from '../src/utils/interviewCoach.js';

test('duration presets and custom minutes resolve before the exam starts', () => {
  assert.equal(resolveDurationSeconds({ presetMinutes: 15, timerEnabled: true }), 900);
  assert.equal(resolveDurationSeconds({ presetMinutes: 60, timerEnabled: true }), 3600);
  assert.equal(resolveDurationSeconds({ presetMinutes: 'custom', customMinutes: 25, timerEnabled: true }), 1500);
  assert.equal(resolveDurationSeconds({ presetMinutes: 30, timerEnabled: false }), 0);
});

test('deadline remaining time does not depend on interval drift', () => {
  const now = 1_000_000;
  assert.equal(remainingFromDeadline(now + 61_000, now), 61);
  assert.equal(remainingFromDeadline(now - 1000, now), 0);
  assert.equal(formatClock(75), '1:15');
});

test('CBT palette states are distinguishable without relying on a single color', () => {
  assert.equal(paletteStatus({ questionId: 1, currentId: 1, answers: {}, visited: new Set(), marked: new Set() }), 'current');
  assert.equal(paletteStatus({ questionId: 2, currentId: 1, answers: { 2: 0 }, visited: new Set([2]), marked: new Set() }), 'answered');
  assert.equal(paletteStatus({ questionId: 3, currentId: 1, answers: {}, visited: new Set([3]), marked: new Set([3]) }), 'review');
  assert.equal(paletteStatus({ questionId: 4, currentId: 1, answers: { 4: 1 }, visited: new Set([4]), marked: new Set([4]) }), 'answered-review');
  assert.equal(paletteStatus({ questionId: 5, currentId: 1, answers: {}, visited: new Set([5]), marked: new Set() }), 'visited');
  assert.equal(paletteStatus({ questionId: 6, currentId: 1, answers: {}, visited: new Set(), marked: new Set() }), 'not-visited');
});

test('resume facts never invent experience and JD text is bounded', () => {
  const facts = sanitizeResumeFacts({
    firstname: 'Asha', lastname: 'Rao', occupation: 'Analyst',
    employments: [{ jobTitle: 'Analyst', employer: 'Acme' }],
    skills: [{ name: 'SQL' }],
  });
  assert.match(facts, /Asha Rao/);
  assert.match(facts, /SQL/);
  assert.doesNotMatch(facts, /invent|Google|Facebook/);
  assert.equal(sanitizeJobDescription('  Need SQL.  ').length < 50, true);
});

test('report scoring uses answers only and stays honest about missing evidence', () => {
  const report = buildInterviewReport({
    questions: [
      { id: 1, question: 'SQL join types?', options: ['Inner', 'Wrong'], correctAnswer: 0, category: 'Technical', explanation: 'Inner joins match keys.' },
      { id: 2, question: 'Tell me about a campaign CPA spike.', options: ['A', 'B'], correctAnswer: 1, category: 'Behavioral' },
    ],
    answers: { 1: 0 },
    timeLimit: 1800,
    timeRemaining: 1200,
    jobDescription: 'SQL, stakeholder communication',
  });
  assert.equal(report.questions[0].correct, true);
  assert.equal(report.questions[1].answered, false);
  assert.ok(report.overall < 100);
  assert.match(report.missingSkills[0].resumeEvidence, /nothing extra/i);
});

test('existing generate-interview engine remains the question source', () => {
  const frontend = fs.readFileSync('src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx', 'utf8');
  const backend = fs.readFileSync('backend/routes/ai.js', 'utf8');
  assert.match(frontend, /\/api\/generate-interview/);
  assert.match(frontend, /occupation: state\.occupation/);
  assert.match(frontend, /interviewType: state\.interviewType/);
  assert.match(frontend, /questionCount: state\.questionCount/);
  assert.match(backend, /router\.post\('\/generate-interview'/);
  assert.match(backend, /generateConfiguredText\(req, res, prompt, 'generate-interview'/);
  assert.match(backend, /generateDefaultInterview\(/);
  assert.doesNotMatch(frontend, /hardcodedQuestions|QUESTION_BANK/);
});
