import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

test('backend contains no soft-verified/demo payment success or disabled TLS verification', () => {
  const backend = read('backend/index.js');
  const email = read('backend/routes/email.js');
  assert.doesNotMatch(backend, /soft-verif|demo-soft-verified|demoMode:\s*true/i);
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
  const operations = read('src/firestore/dbOperations.js');
  const rules = read('SecurityRules.txt');
  assert.match(operations, /\/api\/admin\/payment-settings/);
  assert.match(operations, /redactSubscriptionSecrets/);
  assert.doesNotMatch(operations, /subscriptions_cache', JSON\.stringify\(subData\)/);
  assert.match(rules, /ai_providers','payment_providers','oauth_providers/);
  assert.match(rules, /system_settings','subscriptions/);
});

test('Firebase bearer interceptor is restricted to same-origin API URLs', () => {
  const main = read('src/main.jsx');
  assert.match(main, /parsed\.origin === window\.location\.origin/);
  assert.match(main, /parsed\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(main, /url\.includes\('\/api\/'\)/);
});

test('browser code has no email, hostname, UID-pattern, or Firestore-field admin backdoor', () => {
  const sensitiveFiles = [
    'src/firestore/dbOperations.js',
    'src/components/auth/login/Login.jsx',
    'src/components/auth/register/Register.jsx',
    'src/components/admin/Admin.jsx',
    'src/components/Dashboard/DashboardMain/DashboardMain.jsx',
    'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx',
    'src/components/initailisation/initialisationSetup/initialisationSetup.jsx',
    'src/utils/adminSetup.js'
  ].map(read).join('\n');
  assert.doesNotMatch(sensitiveFiles, /email\s*===?\s*(?:conf|config)\.adminEmail|admin@admin\.com|admin_test_uid|UID_TEST_|uid\.includes\(['\"]admin/i);
  assert.doesNotMatch(read('src/components/initailisation/initialisationSetup/initialisationSetup.jsx'), /createUserWithEmailAndPassword|setA\s*\(/);
  assert.match(read('src/firestore/dbOperations.js'), /getIdTokenResult/);
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
  const csp = apache.match(/Content-Security-Policy \"([^\"]+)/)?.[1] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/);
  assert.match(apache, /Referrer-Policy \"no-referrer\"/);
});

test('Firestore deploy config includes both deny-by-default stores', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.equal(config.firestore.rules, 'SecurityRules.txt');
  assert.equal(config.database.rules, 'Realtime_database_Security_rules.txt');
  assert.match(read('SecurityRules.txt'), /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
  const realtime = JSON.parse(read('Realtime_database_Security_rules.txt'));
  assert.equal(realtime.rules['.read'], false);
  assert.equal(realtime.rules['.write'], false);
});
