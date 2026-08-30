import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('browser account bootstrap never discovers, copies, merges, or inherits another UID', async () => {
  const auth = await fs.readFile('src/services/api/users.js', 'utf8');
  assert.doesNotMatch(auth, /where\('email'|mergeUserAccounts|oldUid|existingMembership|membershipEnds|isA:/);
  assert.match(auth, /currentUser\.uid !== userId/);
  assert.match(auth, /saveCurrentUserProfile/);
  assert.doesNotMatch(auth, /membership\s*:|membershipEnds\s*:|paymentStatus\s*:|role\s*:/);
});

test('resume validation is deterministic and never fabricates AI analysis or scores', async () => {
  const validation = await fs.readFile('src/components/Dashboard/ValidationModal/ValidationModal.jsx', 'utf8');
  assert.doesNotMatch(validation, /Math\.random|mockIssues|AI Resume Score|AI Resume Validation/);
  assert.match(validation, /normalizeResumeData/);
  assert.match(validation, /completenessScore/);
  assert.match(validation, /does not claim to be an AI\/provider result/);
});

test('jobs surfaces never fall back to fabricated listings, employers, or match percentages', async () => {
  const [backend, misc, featured, companies, details, settings] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/routes/misc.js', 'utf8'),
    fs.readFile('src/components/JobsLanding/LandingJobsFeatured.jsx', 'utf8'),
    fs.readFile('src/components/JobsLanding/LandingJobTopCompanies.jsx', 'utf8'),
    fs.readFile('src/components/JobsListings/JobDetailsModal.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/JobScraperSettings.jsx', 'utf8'),
  ]);
  const allBackend = backend + '\n' + misc;
  assert.match(allBackend, /SCRAPER_NOT_CONFIGURED/);
  assert.doesNotMatch(allBackend, /mockNaukriJobs/);
  assert.doesNotMatch(featured, /Using demo data/);
  assert.doesNotMatch(companies, /const topCompanies|using mock data/);
  assert.doesNotMatch(details, /Math\.random\(\).*40/);
  assert.match(settings, /Runtime Unavailable/);
  assert.match(settings, /does not enable scraping or deploy a scheduler/);
});

test('employer and application queries are backend-owned with no Firestore sampling', async () => {
  const [operations, backend, employer] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'), fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/routes/employer.js', 'utf8'),
  ]);
  const allBackend = backend + '\n' + employer;
  // Job/application queries go through the MySQL repository with server-side
  // owner scoping — no client-controlled where/orderBy, no sampling logs.
  assert.match(operations, /\/api\/jobs-data/);
  assert.match(allBackend, /getApplications\(\{ jobId \}\)/);
  const jobsRoutes = await fs.readFile('backend/routes/jobsData.js', 'utf8');
  assert.match(jobsRoutes, /getApplications\(\{ applicantId: req\.user\.uid \}\)/);
  assert.doesNotMatch(operations, /Sample jobs in collection|Returning sorted jobs/);
});

test('all Firebase sign-outs clear account-scoped legacy browser state through the auth listener', async () => {
  const [main, signOut, browserState, checkout] = await Promise.all([
    fs.readFile('src/main.jsx', 'utf8'), fs.readFile('src/utils/signOut.js', 'utf8'),
    fs.readFile('src/utils/browserState.js', 'utf8'), fs.readFile('src/components/Billing/Plans/Checkout.jsx', 'utf8'),
  ]);
  assert.match(main, /!nextUid \|\| \(previousUserUid\.current && previousUserUid\.current !== nextUid\)/);
  assert.match(signOut, /clearAccountScopedBrowserState\(\)/);
  for (const key of ['currentResumeId', 'currentCoverId', 'resumeData', 'interviewProgress', 'user_session']) assert.match(browserState, new RegExp(key));
  assert.doesNotMatch(checkout, /localStorage\.getItem\(['"]user/);
});

test('browser production source does not log user or application payloads', async () => {
  const files = [];
  async function walk(path) {
    for (const entry of await fs.readdir(path, { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/\.(?:js|jsx|cjs)$/.test(entry.name)) files.push(child);
    }
  }
  await walk('src');
  const forbidden = /console\.log.*(?:applicationData|sanitizedApplicationData|formData|jobData|companyData|coverData|portfolioData|membership|user\.uid|userId|userData\.user|values\.user|currentUser\.email|adminEmail)/i;
  const offenders = [];
  for (const file of files) {
    const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => { if (forbidden.test(line)) offenders.push(`${file}:${index + 1}`); });
  }
  assert.deepEqual(offenders, []);
});

test('browser entitlement checks display server state and never downgrade membership directly', async () => {
  const [operations, welcome] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'), fs.readFile('src/components/welcome/Welcome.jsx', 'utf8'),
  ]);
  assert.match(operations, /getUserProfile\(userId\)/);
  assert.doesNotMatch(operations, /function makeBasicAccount|accountType: accountType|expDate: expDate/);
  assert.doesNotMatch(welcome, /makeBasicAccount/);
});

test('notification defaults never invent payment, invoice, plan, or ATS facts', async () => {
  const [notifier, aiRoutes, emailRoutes] = await Promise.all([
    fs.readFile('backend/services/emailNotifier.js', 'utf8'),
    fs.readFile('backend/routes/ai.js', 'utf8'),
    fs.readFile('backend/routes/email.js', 'utf8'),
  ]);
  assert.doesNotMatch(`${notifier}\n${aiRoutes}`, /₹199\.00|₹1,999\.00|RPAI-INV-1001|atsScore: '94'|atsScore = '94'/);
  assert.doesNotMatch(emailRoutes, /ats_score \|\| '94'|ATS Score: \$\{vars\.ats_score \|\| '94'\}/);
  assert.match(notifier, /Amount unavailable/);
  assert.match(`${notifier}\n${aiRoutes}\n${emailRoutes}`, /Not measured/);
});
