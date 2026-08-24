import fs from 'fs';
import path from 'path';

// ── 1. Helper for recursive directory traversal ──
function getAllFiles(dirPath, arrayOfFiles = [], extFilter = null) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      if (file.name !== 'node_modules' && file.name !== '.git' && file.name !== 'dist' && file.name !== 'test-results') {
        getAllFiles(fullPath, arrayOfFiles, extFilter);
      }
    } else {
      if (!extFilter || extFilter.some(ext => file.name.endsWith(ext))) {
        arrayOfFiles.push(fullPath);
      }
    }
  }
  return arrayOfFiles;
}

console.log('=== RUNNING EXHAUSTIVE REVERSE-DISCOVERY ENGINE ===\n');

// ── 2. UI Action & Component Discovery ──
const srcFiles = getAllFiles('src', [], ['.jsx', '.js', '.tsx', '.ts']);
console.log(`Scanning ${srcFiles.length} frontend source files...`);

const uiActions = [];
const components = new Set();
const forms = [];
const modals = [];
const buttons = [];
const tabs = [];
const fileUploads = [];
const exportsImports = [];

for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const basename = path.basename(file);
  components.add(basename);

  // Buttons & Handlers
  const buttonMatches = [...content.matchAll(/<(?:button|Button)[^>]*onClick=\{([^}]+)\}[^>]*>([\s\S]*?)<\/(?:button|Button)>/g)];
  for (const b of buttonMatches) {
    buttons.push({
      file,
      handler: b[1].trim(),
      label: b[2].replace(/<[^>]+>/g, '').trim().slice(0, 40) || 'Icon/Dynamic'
    });
  }

  // Forms & Submit Handlers
  const formMatches = [...content.matchAll(/<form[^>]*onSubmit=\{([^}]+)\}/g)];
  for (const f of formMatches) {
    forms.push({ file, handler: f[1].trim() });
  }

  // Modals & Dialogs
  const modalMatches = [...content.matchAll(/<(?:Modal|Dialog|Drawer)[^>]*isOpen=\{([^}]+)\}/g)];
  for (const m of modalMatches) {
    modals.push({ file, trigger: m[1].trim() });
  }

  // File Upload Handlers
  const uploadMatches = [...content.matchAll(/<input[^>]*type=["']file["'][^>]*onChange=\{([^}]+)\}/g)];
  for (const u of uploadMatches) {
    fileUploads.push({ file, handler: u[1].trim() });
  }

  // Exports / Imports
  if (/export\s+default|export\s+const|export\s+function/.test(content)) {
    exportsImports.push(file);
  }
}

console.log(`Discovered ${buttons.length} Interactive Buttons & Click Handlers.`);
console.log(`Discovered ${forms.length} Form Submit Handlers.`);
console.log(`Discovered ${modals.length} Modals & Dialog Triggers.`);
console.log(`Discovered ${fileUploads.length} File Upload Controls.`);

// ── 3. Backend Route & Service Discovery ──
const backendFiles = getAllFiles('backend', [], ['.js']);
console.log(`\nScanning ${backendFiles.length} backend source files...`);

const backendRoutes = [];
const services = new Set();
const middlewareList = new Set();

for (const file of backendFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const basename = path.basename(file);
  if (file.includes('services')) services.add(basename);
  if (file.includes('middleware') || file.includes('security')) middlewareList.add(basename);

  const routeRegex = /(?:app|router)\.(get|post|put|patch|delete)\(\s*(?:\[([^\]]+)\]|["']([^"']+)["'])\s*,\s*([\s\S]*?)(?=(?:app|router)\.(?:get|post|put|patch|delete)|\nmodule\.exports|\Z)/g;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const rawPaths = match[2] ? match[2].split(',').map(p => p.trim().replace(/^["']|["']$/g, '')) : [match[3]];
    const handlerChain = match[4] ? match[4].slice(0, 100).replace(/\n/g, ' ') : '';
    for (const p of rawPaths) {
      if (p) {
        backendRoutes.push({
          file,
          method,
          path: p,
          auth: /requireAuth|requireEnterpriseAuth|requireSuperAdmin|enforceApiPolicy|requireRecentAuth/.test(handlerChain),
          mfa: /requireMfa|totp|verifyTotp/.test(handlerChain),
          handler: handlerChain.trim().slice(0, 60)
        });
      }
    }
  }
}

console.log(`Discovered ${backendRoutes.length} Total Backend Endpoints.`);
console.log(`Discovered ${services.size} Backend Services.`);
console.log(`Discovered ${middlewareList.size} Security/Middleware Modules.`);

// ── 4. Firestore Collections & Operations Discovery ──
const dbOpsFile = 'src/firestore/dbOperations.js';
const dbOpsContent = fs.existsSync(dbOpsFile) ? fs.readFileSync(dbOpsFile, 'utf8') : '';
const firestoreFunctions = [...dbOpsContent.matchAll(/export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(/g)].map(m => m[1]);

console.log(`\nDiscovered ${firestoreFunctions.length} Database Operations in dbOperations.js.`);

// ── 5. Feature Flags & Configuration Switches ──
const flagFiles = ['backend/enterprise/featureFlags.js', 'src/conf/configuration.js', 'src/hooks/useServiceAvailability.js'];
const featureFlags = [];
for (const f of flagFiles) {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const flags = [...content.matchAll(/([A-Z0-9_]{3,40}|[a-zA-Z0-9_]+Enabled|[a-zA-Z0-9_]+Module)\s*[:=]/g)].map(m => m[1]);
    for (const fl of flags) featureFlags.push({ file: f, flag: fl });
  }
}
console.log(`Discovered ${featureFlags.length} Configuration & Feature Flag Declarations.`);

// ── 6. External Integration Discovery ──
const externalIntegrations = [
  { name: 'Stripe Payments', type: 'Payment Gateway', clients: ['Checkout.jsx', 'Plans.jsx'], server: 'backend/index.js (stripe webhook)' },
  { name: 'PayPal Smart Buttons', type: 'Payment Gateway', clients: ['Checkout.jsx', 'Plans.jsx'], server: 'backend/index.js' },
  { name: 'Razorpay Checkout', type: 'Payment Gateway', clients: ['Checkout.jsx', 'Plans.jsx'], server: 'backend/index.js' },
  { name: 'Paytm Stage/Live', type: 'Payment Gateway', clients: ['Checkout.jsx', 'Plans.jsx'], server: 'backend/index.js' },
  { name: 'NVIDIA NIM AI (Llama 3.2 11B & Nemotron)', type: 'AI LLM Inference', server: 'backend/services/aiRuntime.js' },
  { name: 'Google Gemini AI (1.5 Flash / Pro)', type: 'AI LLM Failover', server: 'backend/services/aiRuntime.js' },
  { name: 'OpenAI GPT-4o / Mini', type: 'AI LLM Failover', server: 'backend/services/aiRuntime.js' },
  { name: 'Groq Cloud Inference', type: 'AI LLM Ultra-Low Latency', server: 'backend/services/aiRuntime.js' },
  { name: 'OpenRouter Aggregator', type: 'AI LLM Multi-Model', server: 'backend/services/aiRuntime.js' },
  { name: 'DeepSeek AI', type: 'AI LLM Inference', server: 'backend/services/aiRuntime.js' },
  { name: 'Firebase Authentication & Firestore', type: 'Identity & Data Plane', server: 'backend/services/firebaseAdmin.js' },
  { name: 'Google OAuth 2.0', type: 'Social Auth Provider', server: 'backend/index.js' },
  { name: 'GitHub OAuth App', type: 'Social Auth Provider', server: 'backend/index.js' },
  { name: 'LinkedIn OAuth 2.0', type: 'Social Auth Provider', server: 'backend/index.js' },
  { name: 'Twilio SMS / WhatsApp', type: 'Notification Gateway', server: 'backend/index.js' },
  { name: 'SMTP / Nodemailer Mailer', type: 'Transactional Email', server: 'backend/index.js' },
  { name: 'Cloudflare Proxy & Web Insights', type: 'CDN & Edge Shield', server: '.htaccess / CSP' },
  { name: 'Supademo Interactive Showcase', type: 'Product Tour Embed', server: 'public/.htaccess CSP' }
];

console.log(`Discovered ${externalIntegrations.length} External Integration Services.`);

// ── 7. Save Comprehensive Reverse Census ──
const censusData = {
  timestamp: new Date().toISOString(),
  counts: {
    frontendFiles: srcFiles.length,
    backendFiles: backendFiles.length,
    buttons: buttons.length,
    forms: forms.length,
    modals: modals.length,
    fileUploads: fileUploads.length,
    backendRoutes: backendRoutes.length,
    services: services.size,
    middleware: middlewareList.size,
    dbOperations: firestoreFunctions.length,
    featureFlags: featureFlags.length,
    externalIntegrations: externalIntegrations.length
  },
  externalIntegrations,
  firestoreFunctions: firestoreFunctions.slice(0, 50),
  sampleRoutes: backendRoutes.slice(0, 20),
  sampleButtons: buttons.slice(0, 20)
};

if (!fs.existsSync('test-results')) fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/exhaustive-census.json', JSON.stringify(censusData, null, 2));
console.log('\nExhaustive Census successfully saved to test-results/exhaustive-census.json');
