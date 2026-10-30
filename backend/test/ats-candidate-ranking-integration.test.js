'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_VERIFIER = 'true';

/**
 * Live MariaDB Integration Test Suite for FP-F16:
 * Automated Candidate Ranking & Multi-Factor ATS Scoring Engine
 *
 * Verifies:
 * 1. Multi-factor ATS scoring algorithm (skills, experience, education, keywords)
 * 2. Normalization of skill taxonomy and aliasing (node.js, kubernetes, etc.)
 * 3. Candidate ranking engine (descending sort, tie-breaking, rank attribution)
 * 4. Application submission auto-scoring and MariaDB persistence (Migration 043 columns)
 * 5. Employer pipeline ranking endpoint GET /api/jobs/:jobId/applications/ranked
 * 6. RBAC guards (non-employer rejection)
 * 7. On-demand ATS recalculation POST /api/jobs/:jobId/applications/:id/recalculate-ats
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const {
  calculateAtsScore,
  rankCandidatesForJob,
  extractSkillSet,
  normalizeSkill,
} = require('../services/atsMatching');

const runId = Date.now().toString(36);
const employerUid = `emp_ats_${runId}`;
const candSeniorUid = `cand_senior_${runId}`;
const candJuniorUid = `cand_junior_${runId}`;
const candOtherUid = `cand_other_${runId}`;
const jobId = `job_ats_${runId}`;
const resumeSeniorId = `res_senior_${runId}`;
const resumeJuniorId = `res_junior_${runId}`;

const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === employerUid) {
    return { uid: employerUid, email: `employer_${runId}@ime365.test`, email_verified: true, role: 'EMPLOYER', employer: true, auth_time: now };
  }
  if (token === candSeniorUid) {
    return { uid: candSeniorUid, email: `senior_${runId}@candidate.test`, email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === candJuniorUid) {
    return { uid: candJuniorUid, email: `junior_${runId}@candidate.test`, email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === candOtherUid) {
    return { uid: candOtherUid, email: `other_${runId}@candidate.test`, email_verified: true, role: 'USER', auth_time: now };
  }
  throw new Error('invalid token');
});

const bearer = token => ({ Authorization: `Bearer ${token}` });
const employerHeaders = bearer(employerUid);
const candSeniorHeaders = bearer(candSeniorUid);
const candJuniorHeaders = bearer(candJuniorUid);
const candOtherHeaders = bearer(candOtherUid);

test('FP-F16: Automated Candidate Ranking & ATS Scoring Suite', async (t) => {
  const pool = getPool();

  await t.test('1. Taxonomy & Skill Extraction Normalization', () => {
    assert.equal(normalizeSkill('NodeJS'), 'node.js');
    assert.equal(normalizeSkill('React.js'), 'react');
    assert.equal(normalizeSkill('k8s'), 'kubernetes');
    assert.equal(normalizeSkill('Golang'), 'go');
    assert.equal(normalizeSkill('Postgres'), 'postgresql');

    const skills = extractSkillSet('Looking for a Senior Engineer with React, Node.js, TypeScript, PostgreSQL, and Docker.');
    assert.ok(skills.has('react'), 'Must extract react');
    assert.ok(skills.has('node.js'), 'Must extract node.js');
    assert.ok(skills.has('typescript'), 'Must extract typescript');
    assert.ok(skills.has('postgresql'), 'Must extract postgresql');
    assert.ok(skills.has('docker'), 'Must extract docker');
  });

  await t.test('2. Multi-Factor ATS Scoring Unit Evaluation', () => {
    const job = {
      title: 'Senior Full Stack Engineer',
      description: 'Build modern enterprise platforms with React and Node.js.',
      requirements: 'Requirements: 5+ years experience, Bachelor degree, strong in TypeScript, PostgreSQL, Docker, AWS.',
    };

    const seniorResume = {
      occupation: 'Senior Full Stack Developer',
      summary: 'Experienced software engineer building scalable web platforms with React and TypeScript.',
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'Redis'],
      employments: [
        { title: 'Senior Software Engineer', startDate: '2020-01-01', endDate: '2026-01-01' },
      ],
      educations: [
        { degree: 'Bachelor of Science', field: 'Computer Science', school: 'Tech University' },
      ],
    };

    const juniorResume = {
      occupation: 'Junior Web Developer',
      summary: 'Recent graduate eager to learn frontend web development.',
      skills: ['HTML', 'CSS', 'JavaScript', 'jQuery'],
      employments: [
        { title: 'Junior Intern', startDate: '2025-01-01', endDate: '2025-06-01' },
      ],
      educations: [
        { degree: 'Associate Degree', field: 'General Studies' },
      ],
    };

    const seniorScore = calculateAtsScore(job, seniorResume);
    const juniorScore = calculateAtsScore(job, juniorResume);

    assert.ok(seniorScore.matchScore >= 80, `Senior match score should be >= 80, got ${seniorScore.matchScore}`);
    assert.ok(juniorScore.matchScore <= 60, `Junior match score should be <= 60, got ${juniorScore.matchScore}`);
    assert.ok(seniorScore.matchScore > juniorScore.matchScore, 'Senior should rank significantly higher than junior');

    // Verify breakdown structure
    assert.equal(typeof seniorScore.breakdown.skillsScore, 'number');
    assert.equal(typeof seniorScore.breakdown.experienceScore, 'number');
    assert.equal(typeof seniorScore.breakdown.educationScore, 'number');
    assert.equal(typeof seniorScore.breakdown.keywordScore, 'number');
    assert.ok(Array.isArray(seniorScore.breakdown.matchedSkills), 'matchedSkills must be an array');
  });

  await t.test('3. Candidate Ranking Algorithm sorts descending with ranks', () => {
    const job = {
      title: 'Senior Full Stack Engineer',
      requirements: 'React, Node.js, TypeScript, AWS, Docker. 5+ years.',
    };

    const candidates = [
      { id: 'app_1', applicantName: 'Junior Applicant', resume: { skills: ['HTML', 'CSS'] } },
      { id: 'app_2', applicantName: 'Lead Architect', resume: { skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'Docker'], employments: [{ startDate: '2016-01-01', endDate: '2026-01-01' }] } },
      { id: 'app_3', applicantName: 'Mid Engineer', resume: { skills: ['React', 'TypeScript'], employments: [{ startDate: '2022-01-01', endDate: '2025-01-01' }] } },
    ];

    const ranking = rankCandidatesForJob(job, candidates);
    assert.equal(ranking.totalApplicants, 3);
    assert.equal(ranking.rankedCandidates[0].id, 'app_2', 'Lead Architect must be rank 1');
    assert.equal(ranking.rankedCandidates[0].rank, 1);
    assert.equal(ranking.rankedCandidates[1].rank, 2);
    assert.equal(ranking.rankedCandidates[2].rank, 3);
    assert.ok(ranking.rankedCandidates[0].matchScore >= ranking.rankedCandidates[1].matchScore);
    assert.ok(ranking.rankedCandidates[1].matchScore >= ranking.rankedCandidates[2].matchScore);
  });

  await t.test('4. Seed test job and candidate resumes in MariaDB', async () => {
    // 1. Create employer and candidates in users table
    await pool.query(
      `INSERT INTO users (id, email, displayName, role)
       VALUES (?, ?, ?, 'EMPLOYER'),
              (?, ?, ?, 'USER'),
              (?, ?, ?, 'USER'),
              (?, ?, ?, 'USER')
       ON DUPLICATE KEY UPDATE displayName = VALUES(displayName)`,
      [
        employerUid, `employer_${runId}@ime365.test`, 'Employer Lead',
        candSeniorUid, `senior_${runId}@candidate.test`, 'Senior Candidate',
        candJuniorUid, `junior_${runId}@candidate.test`, 'Junior Candidate',
        candOtherUid, `other_${runId}@candidate.test`, 'Other Candidate',
      ]
    );

    // 2. Create job requisition (requirements and skills are JSON validated in MariaDB)
    await pool.query(
      `INSERT INTO jobs (id, employer_id, company_name, title, description, requirements, skills, location, status)
       VALUES (?, ?, 'CloudScale Systems', 'Senior Full Stack Engineer', 'Building scalable cloud microservices.',
               ?, ?, 'Remote', 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [
        jobId, employerUid,
        JSON.stringify(['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', '5+ years experience required.']),
        JSON.stringify(['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS']),
      ]
    );

    // 3. Create Senior candidate resume
    await pool.query(
      `INSERT INTO resumes (id, user_id, title, targetRole, skills, employments, educations)
       VALUES (?, ?, 'Senior Full Stack CV', 'Senior Full Stack Engineer',
               ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [
        resumeSeniorId, candSeniorUid,
        JSON.stringify(['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS']),
        JSON.stringify([{ title: 'Senior Engineer', startDate: '2019-01-01', endDate: '2026-01-01' }]),
        JSON.stringify([{ degree: 'Bachelor of Science in Computer Science', school: 'MIT' }]),
      ]
    );

    // 4. Create Junior candidate resume
    await pool.query(
      `INSERT INTO resumes (id, user_id, title, targetRole, skills, employments, educations)
       VALUES (?, ?, 'Junior CV', 'Junior Frontend Dev',
               ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [
        resumeJuniorId, candJuniorUid,
        JSON.stringify(['HTML', 'CSS', 'JavaScript']),
        JSON.stringify([{ title: 'Intern', startDate: '2025-01-01', endDate: '2025-06-01' }]),
        JSON.stringify([{ degree: 'High School Diploma' }]),
      ]
    );
  });

  await t.test('5. Candidate submits application with auto-calculated ATS score persisted in MariaDB', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(candSeniorHeaders)
      .send({
        fullName: 'Jane Senior Doe',
        phone: '+1 (555) 234-5678',
        resumeId: resumeSeniorId,
        coverLetter: 'I am applying for the Senior Full Stack Engineer role with 7 years of full stack Node.js and React expertise.',
      });

    assert.equal(res.status, 201, `Application submit should succeed, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(typeof res.body.matchScore, 'number');
    assert.ok(res.body.matchScore >= 75, `Senior ATS score should be >= 75, got ${res.body.matchScore}`);

    // Verify direct database persistence in applications table (Migration 043 columns)
    const [rows] = await pool.query(
      'SELECT id, ats_score, ats_breakdown FROM applications WHERE id = ?',
      [`${candSeniorUid}_${jobId}`]
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].ats_score), res.body.matchScore);
    assert.ok(rows[0].ats_breakdown, 'ats_breakdown must be populated');
    const bd = JSON.parse(rows[0].ats_breakdown);
    assert.ok(bd.matchedSkills.length > 0, 'Matched skills must be populated');
  });

  await t.test('6. Second candidate submits application with lower ATS score', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(candJuniorHeaders)
      .send({
        fullName: 'John Junior Doe',
        phone: '+1 (555) 987-6543',
        resumeId: resumeJuniorId,
        coverLetter: 'I would love to apply for this role and learn on the job as a junior frontend developer.',
      });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.matchScore, 'number');
    assert.ok(res.body.matchScore < 70, `Junior match score should be < 70, got ${res.body.matchScore}`);

    const [rows] = await pool.query(
      'SELECT id, ats_score FROM applications WHERE id = ?',
      [`${candJuniorUid}_${jobId}`]
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].ats_score), res.body.matchScore);
  });

  await t.test('7. Employer retrieves applications with matchScore and matchBreakdown mapped', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}/applications`)
      .set(employerHeaders);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.applications));
    assert.equal(res.body.applications.length, 2);

    const seniorApp = res.body.applications.find(a => a.applicantId === candSeniorUid);
    assert.ok(seniorApp);
    assert.equal(typeof seniorApp.matchScore, 'number');
    assert.ok(seniorApp.matchBreakdown, 'matchBreakdown must be projected');
    assert.ok(seniorApp.matchScore >= 75);
  });

  await t.test('8. Employer retrieves ranked applications via GET /api/jobs/:jobId/applications/ranked', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}/applications/ranked`)
      .set(employerHeaders);

    assert.equal(res.status, 200, `Ranking endpoint should return 200, got ${res.status}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.totalApplicants, 2);
    assert.ok(Array.isArray(res.body.rankedCandidates));

    // Verify candidate ranking order: Senior candidate is Rank 1, Junior is Rank 2
    assert.equal(res.body.rankedCandidates[0].applicantId, candSeniorUid);
    assert.equal(res.body.rankedCandidates[0].rank, 1);
    assert.equal(res.body.rankedCandidates[1].applicantId, candJuniorUid);
    assert.equal(res.body.rankedCandidates[1].rank, 2);
    assert.ok(res.body.rankedCandidates[0].matchScore > res.body.rankedCandidates[1].matchScore);
  });

  await t.test('9. Unauthorized user cannot access candidate rankings', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}/applications/ranked`)
      .set(candOtherHeaders); // Other candidate user, not employer owner

    assert.equal(res.status, 403, 'Must return 403 Forbidden for non-owner');
  });

  await t.test('10. Employer triggers on-demand recalculation POST /recalculate-ats', async () => {
    const appId = `${candSeniorUid}_${jobId}`;
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications/${appId}/recalculate-ats`)
      .set(employerHeaders);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.matchScore, 'number');
    assert.ok(res.body.breakdown);
  });

  // Teardown / cleanup
  await t.test('Cleanup test records from MariaDB', async () => {
    await pool.query('DELETE FROM applications WHERE job_id = ?', [jobId]);
    await pool.query('DELETE FROM jobs WHERE id = ?', [jobId]);
    await pool.query('DELETE FROM resumes WHERE id IN (?, ?)', [resumeSeniorId, resumeJuniorId]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [employerUid, candSeniorUid, candJuniorUid, candOtherUid]);
  });
});
