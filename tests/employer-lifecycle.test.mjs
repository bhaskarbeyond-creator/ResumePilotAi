import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('job application lifecycle is backend-owned, identity-bound, and atomic', async () => {
  const [backend, operations, policy, migration] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
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
  assert.match(policy, /VERIFIED_PREFIXES[\s\S]*'\/jobs\/'/);
  assert.match(policy, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(migration, /FOREIGN KEY \(applicant_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /INDEX idx_app_applicant \(applicant_id\)/);
});

test('employer job posting mutations are backend-owned, audited, and revision safe', async () => {
  const [backend, operations, policy, migration, dashboard, editor, companies] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/EditJobModal.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/CompaniesManagement.jsx', 'utf8'),
  ]);
  assert.match(backend, /EMPLOYER_COMPANY_CREATED/);
  assert.match(backend, /EMPLOYER_COMPANY_EDITED/);
  assert.match(backend, /EMPLOYER_COMPANY_DELETED/);
  assert.match(backend, /COMPANY_HAS_JOBS/);
  assert.match(backend, /EMPLOYER_JOB_CREATED/);
  assert.match(backend, /EMPLOYER_JOB_STATUS_CHANGED/);
  assert.match(backend, /EMPLOYER_JOB_EDITED/);
  assert.match(backend, /EMPLOYER_JOB_DELETED/);
  assert.match(backend, /EMPLOYER_JOB_CHANGED/);
  assert.match(operations, /\/api\/employer\/jobs/);
  assert.match(operations, /\/api\/employer\/companies/);
  assert.match(policy, /VERIFIED_PREFIXES[\s\S]*'\/employer\/'/);
  assert.match(backend, /isEmployerAccount\(req\)/);
  assert.match(backend, /employerId: req\.user\.uid/);
  assert.match(migration, /FOREIGN KEY \(employer_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /INDEX idx_jobs_employer \(employer_id\)/);
  assert.match(dashboard, /job\.revision/);
  assert.match(dashboard, /result\.revision/);
  assert.match(editor, /job\.revision/);
  assert.match(companies, /deleteCompany\(companyId, revision\)/);
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
