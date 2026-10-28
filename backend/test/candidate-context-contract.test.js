/**
 * Contract Tests for Candidate Context & Frontend Payload Schemas (D4)
 *
 * Verifies bilateral contract parity between frontend/src/pages/dashboard/resume-builder.tsx
 * and backend/services/candidateContext.js. Ensures candidateRoles, education, and all
 * content operation payloads conform to strict schema boundaries and compute accurate tenure.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEvidencePayload, calculateDetailedExperience } = require('../services/candidateContext');

test('D4-1: buildEvidencePayload extracts structured candidateRoles and computes accurate tenure', () => {
  const payload = {
    jobTitle: 'Senior Full Stack Engineer',
    candidateRoles: [
      {
        title: 'Lead Software Engineer',
        employer: 'Alpha Corp',
        description: 'Led core platform architecture and distributed services.',
        startDate: '2021-01',
        endDate: '2024-06',
        current: false,
      },
      {
        title: 'Senior Software Engineer',
        employer: 'Beta Inc',
        description: 'Developed scalable microservices.',
        startDate: '2018-06',
        endDate: '2020-12',
        current: false,
      },
    ],
  };

  const evidence = buildEvidencePayload('generate-skills', payload);
  assert.ok(evidence.candidateFacts);
  assert.equal(evidence.candidateFacts.workRoles.length, 2);
  assert.equal(evidence.candidateFacts.workRoles[0].title, 'Lead Software Engineer');
  assert.equal(evidence.candidateFacts.workRoles[0].employer, 'Alpha Corp');
  assert.equal(evidence.candidateFacts.workRoles[0].description, 'Led core platform architecture and distributed services.');

  // Verify non-zero tenure calculation derived from dates:
  // Role 1: 2021-01 to 2024-06 = 42 months (3.5 years)
  // Role 2: 2018-06 to 2020-12 = 31 months (2.58 years)
  // Total ~ 73 months ~ 6.1 years -> Senior
  assert.ok(evidence.candidateFacts.experienceYears >= 5);
  assert.equal(evidence.candidateFacts.careerStage, 'senior');
  assert.equal(evidence.candidateFacts.seniorityLevel, 'Senior Professional / Lead');
});

test('D4-2: candidateRoles parity with context.facts.roles produces identical tenure', () => {
  const roles = [
    {
      title: 'Product Manager',
      employer: 'Stripe',
      startDate: '2019-01',
      endDate: '2023-01',
      description: 'Scaled payment APIs.',
    },
  ];

  const payloadFromRoot = {
    jobTitle: 'Product Manager',
    candidateRoles: roles,
  };

  const payloadFromFacts = {
    jobTitle: 'Product Manager',
    context: {
      facts: {
        roles,
      },
    },
  };

  const evidenceRoot = buildEvidencePayload('generate-summary', payloadFromRoot);
  const evidenceFacts = buildEvidencePayload('generate-summary', payloadFromFacts);

  assert.equal(evidenceRoot.candidateFacts.experienceYears, evidenceFacts.candidateFacts.experienceYears);
  assert.equal(evidenceRoot.candidateFacts.careerStage, evidenceFacts.candidateFacts.careerStage);
  assert.equal(evidenceRoot.candidateFacts.seniorityLevel, evidenceFacts.candidateFacts.seniorityLevel);
  assert.equal(evidenceRoot.candidateFacts.workRoles[0].title, evidenceFacts.candidateFacts.workRoles[0].title);
  assert.equal(evidenceRoot.candidateFacts.workRoles[0].employer, evidenceFacts.candidateFacts.workRoles[0].employer);
});

test('D4-3: buildEvidencePayload extracts structured candidateEducations', () => {
  const payload = {
    school: 'Stanford University',
    degree: 'Master of Science',
    candidateEducations: [
      {
        school: 'Stanford University',
        degree: 'Master of Science',
        fieldOfStudy: 'Artificial Intelligence',
        started: '2018',
        finished: '2020',
        description: 'Specialization in Machine Learning and NLP.',
      },
    ],
  };

  const evidence = buildEvidencePayload('generate-education-description', payload);
  assert.equal(evidence.candidateFacts.education.length, 1);
  assert.equal(evidence.candidateFacts.education[0].school, 'Stanford University');
  assert.equal(evidence.candidateFacts.education[0].degree, 'Master of Science');
  assert.equal(evidence.candidateFacts.education[0].started, '2018');
  assert.equal(evidence.candidateFacts.education[0].finished, '2020');
});

test('D4-4: calculateDetailedExperience accurately merges overlapping tenures', () => {
  const overlappingRoles = [
    { startDate: '2020-01', endDate: '2022-06' }, // 30 months
    { startDate: '2021-01', endDate: '2023-01' }, // overlaps with first
  ];

  const result = calculateDetailedExperience(overlappingRoles);
  // Merged: 2020-01 to 2023-01 = 37 months ~ 3.1 years
  assert.equal(result.totalMonths, 37);
  assert.equal(result.numericYears, 3.1);
  assert.equal(result.careerStage, 'mid_career');
});

test('D4-5: Backward compatibility: flat recentRoles and companies arrays are handled gracefully', () => {
  const legacyPayload = {
    jobTitle: 'DevOps Engineer',
    recentRoles: ['Site Reliability Engineer', 'Cloud Architect'],
    companies: ['Google', 'Amazon'],
    educationFields: ['Computer Science'],
  };

  const evidence = buildEvidencePayload('generate-skills', legacyPayload);
  assert.equal(evidence.candidateFacts.workRoles.length, 2);
  assert.equal(evidence.candidateFacts.workRoles[0].title, 'Site Reliability Engineer');
  assert.equal(evidence.candidateFacts.workRoles[0].employer, 'Google');
  assert.equal(evidence.candidateFacts.workRoles[1].title, 'Cloud Architect');
  assert.equal(evidence.candidateFacts.workRoles[1].employer, 'Amazon');
  assert.equal(evidence.candidateFacts.education.length, 1);
  assert.equal(evidence.candidateFacts.education[0].degree, 'Computer Science');
});

test('D4-6: Schema validation: all candidate dashboard operations receive valid non-empty evidence', () => {
  const operations = [
    'generate-skills',
    'generate-certifications',
    'generate-projects',
    'generate-summary',
    'generate-work-description',
    'generate-education-description',
    'enhance-single-bullet',
  ];

  const candidateRoles = [
    {
      title: 'Principal Architect',
      employer: 'TechCorp',
      description: 'Distributed database scaling.',
      startDate: '2015-01',
      endDate: '2024-01',
    },
  ];

  for (const op of operations) {
    const payload = {
      jobTitle: 'Principal Architect',
      candidateRoles,
      notes: 'Built globally distributed raft clusters.',
      bullet: 'Architected raft consensus protocol.',
      school: 'MIT',
      degree: 'PhD CS',
    };
    const evidence = buildEvidencePayload(op, payload);
    assert.ok(evidence, `Operation ${op} must generate evidence`);
    assert.ok(evidence.candidateFacts, `Operation ${op} must contain candidateFacts`);
    assert.ok(evidence.candidateFacts.workRoles.length >= 1, `Operation ${op} must preserve work roles`);
  }
});
