import fs from 'node:fs';
import path from 'node:path';

const roots = ['src/components'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (/\.(jsx|js)$/.test(entry.name)) files.push(child);
  }
}
for (const root of roots) walk(root);
const inventory = [];
const brand = /^(ResumePilot(?: AI)?|Firebase|Google|GitHub|LinkedIn|Facebook|Stripe|PayPal|Razorpay|Paytm|PhonePe|Twilio|Naukri(?:\.com)?|OpenAI|Gemini|NVIDIA|Groq|DeepSeek|Cloudinary|AWS|S3)$/i;
function classify(text, kind) {
  if (brand.test(text.trim())) return 'INTENTIONAL_BRAND_PROVIDER';
  if (/^(https?:|\/api\/|[A-Z0-9_]{3,}|[a-z]+\.[a-z]+$)/.test(text.trim())) return 'TECHNICAL_OR_IDENTIFIER';
  if (kind === 'alt' || kind === 'aria-label' || kind === 'title') return 'USER_FACING_ACCESSIBILITY';
  return 'USER_FACING_ENGLISH_CANDIDATE';
}
for (const file of files.sort()) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const withoutComment = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const match of withoutComment.matchAll(/>([^<>{}]+)</g)) {
      const text = match[1].replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]{2}/.test(text)) inventory.push({ file, line: index + 1, kind: 'jsx-text', text, classification: classify(text, 'jsx-text') });
    }
    for (const match of withoutComment.matchAll(/\b(placeholder|title|aria-label|alt)="([^"]*[A-Za-z][^"]*)"/g)) {
      inventory.push({ file, line: index + 1, kind: match[1], text: match[2], classification: classify(match[2], match[1]) });
    }
  });
}
const summary = Object.fromEntries([...new Set(inventory.map(item => item.classification))].sort().map(key => [key, inventory.filter(item => item.classification === key).length]));
const result = { generatedAt: new Date().toISOString().slice(0, 10), scope: roots, method: 'Deterministic single-line JSX text and literal user-facing attribute inventory; dynamic expressions and multiline text require professional source review.', filesScanned: files.length, occurrences: inventory.length, summary, inventory };
fs.writeFileSync('docs/I18N_UI_STRING_INVENTORY.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ filesScanned: files.length, occurrences: inventory.length, summary }, null, 2));
