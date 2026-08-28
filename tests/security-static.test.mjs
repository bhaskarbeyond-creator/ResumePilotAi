import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function sourceFiles(directory, extensions = new Set(['.js', '.jsx', '.php'])) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(relative, extensions));
    else if (extensions.has(path.extname(entry.name))) found.push(relative);
  }
  return found;
}

test('tracked files contain no recognizable private credentials', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{100,}-----END/,
    // A PEM body carried on one line with escaped newlines, which is how a
    // service-account key looks inside an env file. The multi-line pattern
    // above cannot see this form.
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\\+[rn]|\s|[A-Za-z0-9+/=]){100,}/,
    /AKIA[0-9A-Z]{16}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /sk_(?:live|test)_[A-Za-z0-9]{8,}/,
    /nvapi-[A-Za-z0-9_-]{10,}/,
    /AIza[0-9A-Za-z_-]{30,}/,
    /rzp_(?:live|test)_[A-Za-z0-9]{8,}/,
    // Cloudflare user API tokens (cfut_) and classic 37-char API keys.
    /\bcfut_[A-Za-z0-9_-]{20,}/,
    // A real Google service-account identity. The generic placeholder forms
    // used in docs and UI hints are excluded below.
    /[a-z0-9](?:[a-z0-9-]{4,})@[a-z0-9-]{4,}\.iam\.gserviceaccount\.com/,
    // Cloudflare R2 / S3-style account-scoped endpoints embed the account id.
    /[0-9a-f]{32}\.r2\.cloudflarestorage\.com/,
    /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  ];
  // Documented placeholders that intentionally look like the real thing.
  const placeholders = [
    /firebase-adminsdk-xxx@my-project\.iam\.gserviceaccount\.com/,
    /firebase-adminsdk@project-id\.iam\.gserviceaccount\.com/,
  ];
  const findings = [];
  for (const file of tracked) {
    if (/\.(?:png|jpe?g|gif|pdf|ttf|woff2?|ico|zip)$/i.test(file)) continue;
    let content;
    try { content = read(file); } catch (_) { continue; }
    const scrubbed = placeholders.reduce((text, placeholder) => text.replace(new RegExp(placeholder, 'g'), ''), content);
    if (patterns.some(pattern => pattern.test(scrubbed))) findings.push(file);
    // Test fixtures intentionally use fake (disposable, local-only) credentials;
    // everything else must read credentials from the environment. The same
    // fixture policy applies to the assignment form (password = '...') and the
    // object-literal/JSON form (password: '...').
    const isTestFixture = /^(?:backend\/(?:test|enterprise-test)\/|tests\/)/.test(file);
    if (!isTestFixture && file !== '.env.example' && /\bpassword\s*=\s*['"][^'"]{8,}['"]/i.test(content)) findings.push(`${file}: hardcoded password`);
    if (!isTestFixture && /\bpassword\s*:\s*['"][^'"{]{8,}['"]/i.test(content)) findings.push(`${file}: hardcoded password`);
  }
  assert.deepEqual(findings, []);
});

test('the leaked production database credential is absent from tracked files', () => {
  // A production MySQL password was historically committed in retired
  // synchronization tooling and scratch automation. The value must remain
  // rotated out and never be reintroduced in any form.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const findings = [];
  for (const file of tracked) {
    if (file === 'tests/security-static.test.mjs') continue; // this sentinel's own source
    if (/\.(?:png|jpe?g|gif|pdf|ttf|woff2?|ico|zip)$/i.test(file)) continue;
    let content;
    try { content = read(file); } catch (_) { continue; }
    if (content.includes('Bhaskar@002')) findings.push(file);
  }
  assert.deepEqual(findings, []);
});

test('tracked operational scripts do not disable TLS verification', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', 'scratch'], { cwd: root }).toString().split('\0').filter(Boolean);
  const findings = [];
  for (const file of tracked) {
    let content;
    try { content = read(file); } catch (_) { continue; }
    if (/verify\s*=\s*False|CERT_NONE|check_hostname\s*=\s*False|_create_unverified_context/i.test(content)) findings.push(file);
  }
  assert.deepEqual(findings, []);
});

test('all browser HTML sinks are centralized or import the sanitizer', () => {
  const failures = [];
  for (const file of sourceFiles('src', new Set(['.js', '.jsx']))) {
    const content = read(file);
    if (/\b(?:innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write\s*\()/.test(content)
        && file !== path.join('src', 'utils', 'sanitizeHtml.js')) failures.push(`${file}: direct DOM HTML sink`);
    if (content.includes('dangerouslySetInnerHTML')) {
      const centralized = /from ['"][^'"]*utils\/sanitizeHtml['"]/.test(content);
      const staticStyleOnly = file.endsWith(path.join('JobsListings', 'CustomLocationAutocomplete.jsx'))
        && !content.includes('__html: ${');
      if (!centralized && !staticStyleOnly) failures.push(`${file}: dangerouslySetInnerHTML without centralized sanitizer`);
    }
  }
  assert.deepEqual(failures, []);
});

test('application logs do not dump request bodies or browser API-key URLs', () => {
  const aiRoutes = read('backend/routes/ai.js');
  const maps = read('src/components/JobsListings/GoogleMapsProvider.jsx');
  assert.doesNotMatch(aiRoutes, /console\.(?:log|warn|error)\([^\n]*req\.body/);
  assert.doesNotMatch(maps, /console\.(?:log|warn|error)\([^\n]*(?:apiKey|scriptUrl)/);
});

test('client bundles contain no provider secret environment variables or direct AI bearer calls', () => {
  const failures = [];
  for (const file of sourceFiles('src', new Set(['.js', '.jsx']))) {
    const content = read(file);
    if (/VITE_(?:GEMINI|NVIDIA|OPENAI|GROQ|OPENROUTER|DEEPSEEK)_API_KEY/.test(content)) failures.push(`${file}: build-time AI secret`);
    if (/https:\/\/(?:api\.openai\.com|api\.groq\.com|openrouter\.ai|integrate\.api\.nvidia\.com|generativelanguage\.googleapis\.com)/.test(content)
        && !file.includes(path.join('components', 'admin', 'settings'))) failures.push(`${file}: direct browser AI provider call`);
  }
  assert.deepEqual(failures, []);
});

test('backend contains no soft-verified/demo payment success, privileged test routes, or disabled TLS verification', () => {
  const backend = read('backend/index.js');
  const email = read('backend/routes/email.js');
  assert.doesNotMatch(backend, /soft-verif|demo-soft-verified|demoMode:\s*true/i);
  assert.doesNotMatch(backend, /\/api\/test-(?:grant-admin|create-candidate-subscription)/);
  assert.doesNotMatch(email, /rejectUnauthorized\s*:\s*false/);
  for (const file of ['api/nvidia.php', 'public/api/nvidia.php', 'nvidia-proxy.php', 'public/nvidia-proxy.php']) {
    assert.match(read(file), /LEGACY_AI_PROXY_RETIRED/);
  }
});

test('resume imports use bundled parsers and content signatures, not runtime CDN code', () => {
  const parser = read('src/services/resumeParser.js');
  assert.doesNotMatch(parser, /cdn\.jsdelivr\.net|unpkg\.com/);
  assert.match(parser, /assertResumeFileSignature/);
  assert.match(parser, /isEvalSupported:\s*false/);
  assert.match(parser, /File contents do not match/);
});

test('payment and AI secrets are split from browser-readable settings', () => {
  const applicationData = read('src/services/api/platform.js');
  const paymentAdmin = read('backend/services/paymentAdmin.js');
  assert.match(applicationData, /\/api\/admin\/payment-settings/);
  assert.match(applicationData, /redactSubscriptionSecrets/);
  assert.doesNotMatch(applicationData, /subscriptions_cache', JSON\.stringify\(subData\)/);
  assert.match(paymentAdmin, /mariadb|mysql/i);
  assert.doesNotMatch(paymentAdmin, /firestore/i);
});

test('Firebase bearer interceptor is restricted to same-origin API URLs', () => {
  const main = read('src/main.jsx');
  assert.match(main, /parsed\.origin === window\.location\.origin/);
  assert.match(main, /parsed\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(main, /url\.includes\('\/api\/'\)/);
});

test('browser code has no email, hostname, UID-pattern, or Firestore-field admin backdoor', () => {
  const sensitiveFiles = [
    'src/services/api/platform.js',
    'src/services/api/users.js',
    'src/components/auth/login/Login.jsx',
    'src/components/auth/register/Register.jsx',
    'src/components/admin/Admin.jsx',
    'src/components/Dashboard/DashboardMain/DashboardMain.jsx',
    'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx',
    'src/components/initailisation/initialisationSetup/initialisationSetup.jsx',
    'src/utils/adminSetup.js'
  ].map(read).join('\n');
  assert.doesNotMatch(sensitiveFiles, /email\s*===?\s*(?:conf|config)\.adminEmail|admin@admin\.com|admin_test_uid|UID_TEST_|uid\.includes\(['"]admin/i);
  assert.doesNotMatch(read('src/components/initailisation/initialisationSetup/initialisationSetup.jsx'), /createUserWithEmailAndPassword|setA\s*\(/);
  assert.match(read('src/services/api/platform.js'), /getIdTokenResult/);
});

test('OAuth never creates unsigned local browser sessions', () => {
  const main = read('src/main.jsx');
  const backend = read('backend/index.js');
  assert.doesNotMatch(main, /oauth_session|makeMockFirebaseUser|oauth_user_session/);
  assert.doesNotMatch(backend, /oauth_session|Buffer\.from\(JSON\.stringify\(\{ uid/);
  assert.match(backend, /createCustomToken/);
  assert.match(backend, /rp_oauth_state/);
  assert.match(backend, /\/dashboard#oauth_code=/);
  assert.doesNotMatch(backend, /\/dashboard\?oauth_code=/);
  assert.match(backend, /\/login#mode=resetPassword/);
  assert.match(backend, /\/login#mode=verifyEmail/);
});

test('static entry point has an enforcing CSP without inline-script escape hatches', () => {
  const html = read('index.html');
  const apache = read('public/.htaccess');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  const csp = apache.match(/Content-Security-Policy "([^"]+)/)?.[1] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/);
  assert.match(apache, /Referrer-Policy "no-referrer"/);
});

test('Firebase deploy config retains Auth only and cannot deploy application-data stores', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.deepEqual(Object.keys(config).sort(), ['emulators']);
  assert.deepEqual(Object.keys(config.emulators).sort(), ['auth', 'ui']);
  assert.equal(config.emulators.auth.port, 9099);
  for (const retired of ['SecurityRules.txt', 'Realtime_database_Security_rules.txt', 'firestore.indexes.json']) {
    assert.equal(fs.existsSync(path.join(root, retired)), false);
  }
});
