'use strict';
/**
 * DIR-040 — startup secret-integrity linter (Cryptographic Secret Vaulting).
 *
 * A placeholder secret in production is indistinguishable from a real one at
 * runtime: the service boots, reports healthy, and quietly protects nothing.
 * This module asserts at boot that every secret the deployment actually depends
 * on is present and is not a template/placeholder value shipped in
 * .env.example, so a misconfigured release fails loudly instead of silently.
 *
 * It NEVER logs, returns, or interpolates a secret value. Findings reference the
 * variable name only, which keeps the invariant "zero plaintext credentials in
 * logs" true even when this linter fails.
 */

/**
 * Values that mean "nobody configured this yet". Compared case-insensitively
 * against the trimmed variable value.
 */
const PLACEHOLDER_VALUES = new Set([
  '', 'changeme', 'change-me', 'change_me', 'todo', 'tbd', 'placeholder',
  'example', 'example-value', 'your-value', 'your-value-here', 'your_secret',
  'your-secret', 'your_secret_key', 'your-secret-key', 'yourpassword',
  'your-password', 'your_password', 'password', 'secret', 'apikey', 'api-key',
  'api_key', 'xxx', 'xxxx', 'xxxxx', 'none', 'null', 'undefined', 'n/a',
  'test', 'dummy', 'sample', 'insert-key-here', 'replace-me', 'unset',
]);

/** Substrings that mark a value as documentation filler wherever it appears. */
const PLACEHOLDER_SUBSTRINGS = [
  'your-', 'your_', 'yourkey', 'changeme', 'change-me', 'placeholder',
  'replace-me', 'insert-key', 'xxxxx', 'example.com', 'example-value',
  'sk-xxx', 'test-key', 'dummy-key', 'fake-key',
];

/**
 * Values that are public identifiers rather than secrets. They must never be
 * rejected, but they must also never be treated as a secret.
 */
const PUBLIC_IDENTIFIERS = new Set([
  'VITE_FIREBASE_KEY', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_PROJECT_ID',
  'VITE_GOOGLE_MAPS_API_KEY', 'VITE_MEASUREMENT_ID', 'VITE_RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_ID', 'PAYPAL_CLIENT_ID', 'LINKEDIN_CLIENT_ID',
  'GITHUB_CLIENT_ID', 'PAYTM_MID', 'PHONEPE_MERCHANT_ID', 'DB_USER', 'DB_NAME',
]);

/**
 * Secrets that must be non-placeholder when the service boots in production.
 * `required: true` means the deployment cannot run securely without it.
 */
const SECRET_SPECS = [
  { name: 'DB_PASSWORD', required: true, why: 'MariaDB application credential' },
  { name: 'ENTERPRISE_ENCRYPTION_KEY', required: false, why: 'tenant data encryption at rest' },
  { name: 'TENANT_JOB_SIGNING_SECRET', required: false, why: 'tenant job artifact signing' },
  { name: 'TENANT_ARTIFACT_SIGNING_SECRET', required: false, why: 'tenant artifact signing' },
  { name: 'STRIPE_SECRET', required: false, why: 'Stripe API credential' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, why: 'Stripe webhook signature verification' },
  { name: 'PAYPAL_CLIENT_SECRET', required: false, why: 'PayPal API credential' },
  { name: 'RAZORPAY_KEY_SECRET', required: false, why: 'Razorpay API credential' },
  { name: 'PAYTM_MERCHANT_KEY', required: false, why: 'Paytm merchant credential' },
  { name: 'PHONEPE_SALT_KEY', required: false, why: 'PhonePe checksum salt' },
  { name: 'GEMINI_API_KEY', required: false, why: 'Google AI provider key' },
  { name: 'OPENAI_API_KEY', required: false, why: 'OpenAI provider key' },
  { name: 'NVIDIA_API_KEY', required: false, why: 'NVIDIA provider key' },
  { name: 'GROQ_API_KEY', required: false, why: 'Groq provider key' },
  { name: 'OPENROUTER_API_KEY', required: false, why: 'OpenRouter provider key' },
  { name: 'DEEPSEEK_API_KEY', required: false, why: 'DeepSeek provider key' },
  { name: 'SMTP_PASS', required: false, why: 'outbound mail credential' },
  { name: 'TWILIO_AUTH_TOKEN', required: false, why: 'Twilio messaging credential' },
  { name: 'FIREBASE_PRIVATE_KEY', required: false, why: 'Firebase Admin service account' },
  { name: 'BACKUP_ENCRYPTION_KEY_BASE64', required: false, why: 'backup archive encryption' },
];

function classifyValue(name, rawValue) {
  const value = String(rawValue === undefined || rawValue === null ? '' : rawValue).trim();
  if (!value) return { ok: false, reason: 'empty' };
  const lowered = value.toLowerCase();
  if (PLACEHOLDER_VALUES.has(lowered)) return { ok: false, reason: 'placeholder value' };
  for (const needle of PLACEHOLDER_SUBSTRINGS) {
    if (lowered.includes(needle)) return { ok: false, reason: `placeholder pattern (${needle})` };
  }
  if (PUBLIC_IDENTIFIERS.has(name)) return { ok: true, reason: 'public identifier' };
  if (/_(?:KEY|SECRET|PASSWORD|TOKEN)$/.test(name) && value.length < 8) {
    return { ok: false, reason: `too short to be a real secret (${value.length} chars)` };
  }
  if (name.endsWith('_BASE64') && !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return { ok: false, reason: 'not valid base64 key material' };
  }
  if (name === 'FIREBASE_PRIVATE_KEY' && !/BEGIN [A-Z ]*PRIVATE KEY/.test(value)) {
    return { ok: false, reason: 'not a PEM private key' };
  }
  return { ok: true, reason: 'configured' };
}

/**
 * Inspects the environment and returns findings. Pure and side-effect free so
 * it is directly unit-testable.
 */
function inspectSecrets(env = process.env, { nodeEnv = env.NODE_ENV } = {}) {
  const findings = [];
  if (nodeEnv !== 'production') {
    return { enforced: false, findings, checked: 0 };
  }
  let checked = 0;
  for (const spec of SECRET_SPECS) {
    const present = Object.prototype.hasOwnProperty.call(env, spec.name);
    const raw = env[spec.name];
    if (!present || raw === undefined || String(raw).trim() === '') {
      if (spec.required) {
        findings.push({ name: spec.name, severity: 'error', reason: 'required secret is not set', why: spec.why });
      }
      continue;
    }
    checked += 1;
    const verdict = classifyValue(spec.name, raw);
    if (!verdict.ok) {
      findings.push({ name: spec.name, severity: 'error', reason: verdict.reason, why: spec.why });
    }
  }
  return { enforced: true, findings, checked };
}

/**
 * Boot-time guard. Throws in production when a required secret is missing or a
 * configured secret is still a placeholder. In non-production it reports and
 * continues so local and CI runs are never blocked.
 */
function assertSecretIntegrity(env = process.env) {
  const { enforced, findings, checked } = inspectSecrets(env);
  if (!enforced) return { enforced: false, findings: [], checked: 0 };
  if (findings.length === 0) return { enforced: true, findings: [], checked };
  const detail = findings
    .map(f => `  - ${f.name}: ${f.reason} (${f.why})`)
    .join('\n');
  throw new Error(
    `[DIR-040] Secret vaulting linter rejected the production configuration. ` +
    `Values are never logged, only variable names.\n${detail}`
  );
}

module.exports = {
  assertSecretIntegrity,
  inspectSecrets,
  classifyValue,
  SECRET_SPECS,
  PUBLIC_IDENTIFIERS,
  PLACEHOLDER_VALUES,
};
