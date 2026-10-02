// Report external dependency configuration WITHOUT printing any secret value.
import fs from 'node:fs';

const envPath = 'backend/.env';
const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const keys = [
  'GEMINI_API_KEY', 'OPENAI_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY',
  'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY',
  'STRIPE_SECRET', 'STRIPE_WEBHOOK_SECRET',
  'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENV',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'DB_HOST', 'DB_USER', 'DB_NAME',
];

const rows = [];
for (const k of keys) {
  const m = text.match(new RegExp(`^${k}=(.*)$`, 'm'));
  const raw = m ? m[1].trim().replace(/^"|"$/g, '') : null;
  const state = raw === null ? 'ABSENT' : (raw.length ? `SET (len ${raw.length})` : 'EMPTY');
  rows.push({ key: k, state });
}

const group = (label, predicate) => {
  const sel = rows.filter(predicate);
  const ready = sel.filter((r) => r.state.startsWith('SET')).length;
  console.log(`${label}: ${ready}/${sel.length} configured`);
  for (const r of sel) console.log(`   ${r.key.padEnd(26)} ${r.state}`);
};

group('AI providers', (r) => /API_KEY$/.test(r.key));
group('Payments', (r) => /STRIPE|PAYPAL|RAZORPAY/.test(r.key));
group('Email', (r) => /^SMTP/.test(r.key));
group('Identity', (r) => /^FIREBASE/.test(r.key));
group('Database', (r) => /^DB_/.test(r.key));
