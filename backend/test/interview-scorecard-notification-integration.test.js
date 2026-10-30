'use strict';

/**
 * Live MariaDB Integration Test Suite for Module 37:
 * Relational Interview Scorecard & Email Notification Workflow (FP-A37)
 *
 * Verifies:
 * 1. Transactional evaluation write into application_evaluations and applications tables
 * 2. Automatic transactional queuing of interview_scorecard_submitted notification into notification_outbox
 * 3. Outbox event payload schema, variables, and state (NOTIFICATION_QUEUED)
 * 4. HTML and Subject rendering in renderEmailTemplate for interview_scorecard_submitted
 * 5. Outbox worker recognizes template in DELIVERABLE_TEMPLATE_TYPES
 * 6. EmailNotifier.notifyScorecardSubmitted interface and parameters
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { getPool } = require('../database/mysql');
const { jobsDataRouter } = require('../routes/jobsData');
const { renderEmailTemplate } = require('../routes/email');
const { DELIVERABLE_TEMPLATE_TYPES } = require('../services/outboxWorker');
const EmailNotifier = require('../services/emailNotifier');

test('Module 37: Relational Scorecard & Email Notification Workflow Suite', async (t) => {
  const pool = getPool();

  const employerId = `emp_sc_${crypto.randomBytes(6).toString('hex')}`;
  const employerEmail = `hiring.lead.${employerId}@examplecorp.test`;
  const candidateId = `cand_sc_${crypto.randomBytes(6).toString('hex')}`;
  const candidateEmail = `candidate.${candidateId}@examplecorp.test`;
  const candidateName = 'Jane DevCandidate';
  const jobId = `job_sc_${crypto.randomBytes(6).toString('hex')}`;
  const jobTitle = 'Senior Fullstack Platform Engineer';
  const companyName = 'Enterprise TechCorp Global';
  const applicationId = `app_sc_${crypto.randomBytes(6).toString('hex')}`;

  // Seed user records
  await pool.query(
    `INSERT INTO users (id, email, displayName, firstname, lastname, role, membership, paymentStatus)
     VALUES (?, ?, 'Alex Interviewer', 'Alex', 'Interviewer', 'USER', 'Basic', 'INACTIVE'),
            (?, ?, ?, 'Jane', 'DevCandidate', 'USER', 'Basic', 'INACTIVE')`,
    [employerId, employerEmail, candidateId, candidateEmail, candidateName]
  );

  // Seed job record
  await pool.query(
    `INSERT INTO jobs (id, employer_id, title, company_name, location, job_type, description, status)
     VALUES (?, ?, ?, ?, 'San Francisco, CA', 'Full-time', 'Core infra lead', 'ACTIVE')`,
    [jobId, employerId, jobTitle, companyName]
  );

  // Seed application record
  await pool.query(
    `INSERT INTO applications (id, job_id, employer_id, applicant_id, applicant_name, applicant_email, status, rating, notes, extra_json, revision)
     VALUES (?, ?, ?, ?, ?, ?, 'INTERVIEW_SCHEDULED', 0, NULL, '{}', 1)`,
    [applicationId, jobId, employerId, candidateId, candidateName, candidateEmail]
  );

  t.after(async () => {
    await pool.query('DELETE FROM notification_outbox WHERE event_id LIKE ?', [`scorecard:${applicationId}:%`]);
    await pool.query('DELETE FROM application_evaluations WHERE application_id = ?', [applicationId]);
    await pool.query('DELETE FROM applications WHERE id = ?', [applicationId]);
    await pool.query('DELETE FROM jobs WHERE id = ?', [jobId]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?)', [employerId, candidateId]);
    await pool.end();
  });

  // Setup express test harness
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = Object.freeze({
      uid: employerId,
      email: employerEmail,
      name: 'Alex Interviewer',
      emailVerified: true,
      claims: { role: 'USER', employer: true },
    });
    next();
  });
  app.use('/api/jobs-data', jobsDataRouter);

  await t.test('1. Submitting interview scorecard persists relationally and enqueues transactional outbox notification', async () => {
    const res = await request(app)
      .put(`/api/jobs-data/applications/${applicationId}/evaluate`)
      .send({
        rating: 5,
        recommendation: 'STRONG_YES',
        notes: 'Outstanding systems architecture knowledge and problem solving under constraints.',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.notificationQueued, true);
    assert.equal(res.body.evaluation.applicationId, applicationId);
    assert.equal(res.body.evaluation.reviewerId, employerId);
    assert.equal(res.body.evaluation.rating, 5);
    assert.equal(res.body.evaluation.recommendation, 'STRONG_YES');
    assert.equal(res.body.legacy.rating, 5);
    assert.ok(res.body.legacy.notes.includes('Outstanding systems architecture'));

    // Check application_evaluations table row
    const [evalRows] = await pool.query(
      'SELECT id, application_id, reviewer_id, rating, recommendation, notes FROM application_evaluations WHERE application_id = ?',
      [applicationId]
    );
    assert.equal(evalRows.length, 1);
    assert.equal(evalRows[0].reviewer_id, employerId);
    assert.equal(Number(evalRows[0].rating), 5);
    assert.equal(evalRows[0].recommendation, 'STRONG_YES');

    // Check notification_outbox table row
    const [outboxRows] = await pool.query(
      'SELECT id, event_id, recipient, template_type, state, vars, metadata FROM notification_outbox WHERE event_id LIKE ?',
      [`scorecard:${applicationId}:${employerId}:%`]
    );
    assert.equal(outboxRows.length, 1);
    assert.equal(outboxRows[0].template_type, 'interview_scorecard_submitted');
    assert.equal(outboxRows[0].recipient, employerEmail.toLowerCase());
    assert.equal(outboxRows[0].state, 'NOTIFICATION_QUEUED');

    const vars = JSON.parse(outboxRows[0].vars);
    assert.equal(vars.candidate_name, candidateName);
    assert.equal(vars.reviewer_name, 'Alex Interviewer');
    assert.equal(vars.job_title, jobTitle);
    assert.equal(vars.company_name, companyName);
    assert.equal(vars.rating, '5');
    assert.equal(vars.recommendation, 'STRONG_YES');
    assert.ok(vars.notes.includes('Outstanding systems architecture'));
    assert.ok(vars.action_url.includes(applicationId));
  });

  await t.test('2. renderEmailTemplate generates compliant, accessible HTML and Subject for scorecard submission', () => {
    const rendered = renderEmailTemplate('interview_scorecard_submitted', {
      candidate_name: candidateName,
      reviewer_name: 'Alex Interviewer',
      job_title: jobTitle,
      company_name: companyName,
      rating: '5',
      recommendation: 'STRONG_YES',
      notes: 'Exceptional technical depth and leadership potential.',
      action_url: `https://ime365.test/employer/jobs/applications?id=${applicationId}`,
    });

    assert.ok(rendered.subject.includes('Interview Scorecard Submitted'));
    assert.ok(rendered.subject.includes(candidateName));
    assert.ok(rendered.subject.includes(jobTitle));
    assert.ok(rendered.subject.includes('STRONG_YES'));

    assert.ok(rendered.html.includes(candidateName));
    assert.ok(rendered.html.includes(jobTitle));
    assert.ok(rendered.html.includes(companyName));
    assert.ok(rendered.html.includes('5 / 5'));
    assert.ok(rendered.html.includes('STRONG_YES'));
    assert.ok(rendered.html.includes('Exceptional technical depth'));
    assert.ok(rendered.html.includes(`https://ime365.test/employer/jobs/applications?id=${applicationId}`));
  });

  await t.test('3. Outbox worker recognizes scorecard templates in DELIVERABLE_TEMPLATE_TYPES', () => {
    assert.ok(DELIVERABLE_TEMPLATE_TYPES.includes('interview_scorecard_submitted'));
    assert.ok(DELIVERABLE_TEMPLATE_TYPES.includes('interview-scorecard-submitted'));
  });

  await t.test('4. EmailNotifier exposes notifyScorecardSubmitted programmatic method', async () => {
    const queuedResult = await EmailNotifier.notifyScorecardSubmitted({
      recipientEmail: 'recruiter.desk@examplecorp.test',
      reviewerName: 'Lead Reviewer',
      reviewerEmail: employerEmail,
      candidateName: 'Sam Candidate',
      jobTitle: 'Staff Backend Architect',
      companyName: 'TechCorp',
      rating: 4,
      recommendation: 'YES',
      notes: 'Strong candidate with clear communication.',
      applicationId: 'app_sample_123',
    });

    assert.equal(queuedResult.success, true);
    assert.equal(queuedResult.deliveryState, 'NOTIFICATION_QUEUED');
    assert.ok(queuedResult.notificationId);

    // Clean up created sample notification
    await pool.query('DELETE FROM notification_outbox WHERE id = ?', [queuedResult.notificationId]);
  });
});
