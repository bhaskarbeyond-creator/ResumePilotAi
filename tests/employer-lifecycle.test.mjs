import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('job application lifecycle is backend-owned, identity-bound, and atomic', async () => {
  const [backend, operations, rules] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  const submit = backend.match(/app\.post\('\/api\/jobs\/:jobId\/applications'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(submit, /req\.user\.uid/);
  assert.match(submit, /req\.user\.email/);
  assert.match(submit, /users.*resumes/s);
  assert.match(submit, /JOB_APPLICATION_SUBMITTED/);
  assert.match(submit, /applicationsCount/);
  assert.match(submit, /job_application_received/);
  const status = backend.match(/app\.patch\('\/api\/job-applications\/:applicationId\/status'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(status, /employerId !== req\.user\.uid/);
  assert.match(status, /APPLICATION_CHANGED/);
  assert.match(status, /allowedTransitions/);
  assert.match(status, /JOB_APPLICATION_STATUS_UPDATED/);
  assert.match(operations, /\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/applications/);
  assert.match(operations, /\/api\/job-applications\/\$\{encodeURIComponent\(applicationId\)\}\/status/);
  const applicationRule = rules.match(/match \/jobApplications\/\{id\}[\s\S]*?\n\s+\}/)?.[0] || '';
  assert.match(applicationRule, /allow create, update, delete: if false/);
  assert.doesNotMatch(rules, /applicationsCount == resource\.data\.applicationsCount \+ 1/);
});

test('employer job posting mutations are backend-owned, audited, and revision safe', async () => {
  const [backend, operations, rules, dashboard, editor] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/EditJobModal.jsx', 'utf8'),
  ]);
  assert.match(backend, /EMPLOYER_JOB_CREATED/);
  assert.match(backend, /EMPLOYER_JOB_STATUS_CHANGED/);
  assert.match(backend, /EMPLOYER_JOB_EDITED/);
  assert.match(backend, /EMPLOYER_JOB_DELETED/);
  assert.match(backend, /EMPLOYER_JOB_CHANGED/);
  assert.match(operations, /\/api\/employer\/jobs/);
  const jobRule = rules.slice(rules.indexOf('match /jobs/{id}'), rules.indexOf('match /jobApplications/{id}'));
  assert.match(jobRule, /allow create, update, delete: if false/);
  assert.match(dashboard, /job\.revision/);
  assert.match(dashboard, /result\.revision/);
  assert.match(editor, /job\.revision/);
});

test('candidate and employer UI wait for confirmed revisioned outcomes', async () => {
  const [candidate, employer, dashboard] = await Promise.all([
    fs.readFile('src/components/JobsListings/JobApplicationModal.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx', 'utf8'),
  ]);
  assert.match(candidate, /readOnly/);
  assert.match(candidate, /Applications use your verified account email/);
  assert.match(candidate, /generation !== submissionGeneration\.current/);
  assert.doesNotMatch(candidate, /selectedResume\.data \|\| null/);
  assert.match(employer, /revision: target\.revision/);
  assert.match(employer, /APPLICATION_CHANGED/);
  assert.match(employer, /revision: result\.revision/);
  assert.match(candidate, /role="dialog"/);
  assert.match(employer, /role="dialog"/);
  assert.match(employer, /aria-expanded/);
  assert.match(dashboard, /status: newStatus, revision/);
});
