process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { setTokenVerifierForTests } = require('../security/auth');
const { installAiRouteContract } = require('./helpers/aiRouteContract');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'verified-candidate') return { uid: 'candidate-1', email: 'candidate@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'candidate-1', email: 'candidate@example.com', email_verified: false, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const aiContract = installAiRouteContract();
const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test.beforeEach(() => aiContract.resetAdmission());

test('Candidate Dashboard: Job posting controls are suppressed for candidate users', () => {
  // 1. Verify checkIsEmployer sanitization logic
  const platformFile = fs.readFileSync(path.join(__dirname, '../../src/services/api/platform.js'), 'utf8');
  assert.ok(platformFile.includes("typeof userId === 'string' ? userId : (userId?.uid || userId?.id || '')"), 'platform.js sanitizes object userId');

  // 2. Verify ProfileDisplay passes user.uid
  const profileDisplayFile = fs.readFileSync(path.join(__dirname, '../../src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx'), 'utf8');
  assert.ok(profileDisplayFile.includes('user?.uid || authUser?.uid'), 'ProfileDisplay passes uid string to checkIsEmployer');

  // 3. Verify JobSearchBar suppresses Post a Job inside candidate dashboard
  const jobSearchBarFile = fs.readFileSync(path.join(__dirname, '../../src/components/JobsListings/JobSearchBar.jsx'), 'utf8');
  assert.ok(jobSearchBarFile.includes('!isInsideDashboard && canPostJob'), 'JobSearchBar checks !isInsideDashboard before rendering Post a Job');

  // 4. Verify MainJobListings passes isInsideDashboard and canPostJob
  const mainJobListingsFile = fs.readFileSync(path.join(__dirname, '../../src/components/JobsListings/MainJobListings.jsx'), 'utf8');
  assert.ok(mainJobListingsFile.includes('canPostJob={!isInsideDashboard && canPostJob}'), 'MainJobListings disables canPostJob inside dashboard');
});

test('Live AI Interview: /api/evaluate-interview-answer requires verified authentication', async () => {
  const anonymous = await request(app)
    .post('/api/evaluate-interview-answer')
    .send({ question: 'Tell me about an incident', answer: 'I fixed it in 6 minutes' });
  assert.equal(anonymous.status, 401);

  const unverified = await request(app)
    .post('/api/evaluate-interview-answer')
    .set(bearer('unverified'))
    .send({ question: 'Tell me about an incident', answer: 'I fixed it in 6 minutes' });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('Live AI Interview: /api/evaluate-interview-answer rejects missing inputs', async () => {
  const resEmptyQ = await request(app)
    .post('/api/evaluate-interview-answer')
    .set(bearer('verified-candidate'))
    .send({ question: '', answer: 'I fixed it in 6 minutes' });
  assert.equal(resEmptyQ.status, 400);

  const resEmptyA = await request(app)
    .post('/api/evaluate-interview-answer')
    .set(bearer('verified-candidate'))
    .send({ question: 'Tell me about an incident', answer: '' });
  assert.equal(resEmptyA.status, 400);
});

test('Live AI Interview: evaluates candidate response with STAR rubric structure', async () => {
  const response = await request(app)
    .post('/api/evaluate-interview-answer')
    .set(bearer('verified-candidate'))
    .send({
      question: 'Tell me about a time you resolved a major production incident during peak traffic.',
      answer: 'I spun up blue-green failover nodes on AWS, traced the spike to an unindexed query, and restored 100% uptime in 6 minutes.',
      occupation: 'DevOps Engineer',
      interviewType: 'behavioral',
      experienceLevel: 'senior',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(typeof response.body.starGrade === 'string', 'starGrade string present');
  assert.ok(response.body.numericScore >= 80, 'High agency + quantified metric achieves 80+ score');
  assert.ok(typeof response.body.rubricFeedback === 'string', 'rubricFeedback string present');
  assert.ok(response.body.starBreakdown, 'starBreakdown present');
  assert.ok(response.body.starBreakdown.situation, 'Situation breakdown present');
  assert.ok(response.body.starBreakdown.task, 'Task breakdown present');
  assert.ok(response.body.starBreakdown.action, 'Action breakdown present');
  assert.ok(response.body.starBreakdown.result, 'Result breakdown present');
  assert.ok(Array.isArray(response.body.strengths), 'strengths array present');
  assert.ok(typeof response.body.coachingTip === 'string', 'coachingTip string present');
  assert.ok(typeof response.body.nextQuestion === 'string', 'nextQuestion string present');
});

test('Live AI CBT UI Component: DashboardInterviews contains exact elements from user reference', () => {
  const dashboardInterviewsFile = fs.readFileSync(
    path.join(__dirname, '../../src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx'),
    'utf8'
  );

  // 1. Session Title & Robot Icon
  assert.ok(dashboardInterviewsFile.includes('Live AI CBT Interview Session'), 'Has Live AI CBT Interview Session title');
  assert.ok(dashboardInterviewsFile.includes('FaRobot'), 'Has FaRobot icon');

  // 2. STAR Grade Badge
  assert.ok(dashboardInterviewsFile.includes('STAR Grade:'), 'Has STAR Grade badge');

  // 3. Three core conversation cards
  assert.ok(dashboardInterviewsFile.includes('AI Recruiter:'), 'Has AI Recruiter card prefix');
  assert.ok(dashboardInterviewsFile.includes('Your Answer:'), 'Has Your Answer card prefix');
  assert.ok(dashboardInterviewsFile.includes('Rubric Feedback:'), 'Has Rubric Feedback card prefix');

  // 4. STAR Breakdown Matrix
  assert.ok(dashboardInterviewsFile.includes('S · Situation'), 'Has S · Situation');
  assert.ok(dashboardInterviewsFile.includes('T · Task'), 'Has T · Task');
  assert.ok(dashboardInterviewsFile.includes('A · Action'), 'Has A · Action');
  assert.ok(dashboardInterviewsFile.includes('R · Result'), 'Has R · Result');

  // 5. Speech / Voice synthesis and dictation
  assert.ok(dashboardInterviewsFile.includes('speakQuestion'), 'Has speech synthesis speakQuestion');
  assert.ok(dashboardInterviewsFile.includes('toggleSpeechRecognition'), 'Has speech recognition toggle');

  // 6. Setup mode card
  assert.ok(dashboardInterviewsFile.includes('Live AI CBT Session'), 'Has Live AI CBT Session mode card');
  assert.ok(dashboardInterviewsFile.includes('Interactive STAR'), 'Has Interactive STAR badge');
});
