import fs from 'fs';
import path from 'path';

const files = [
  'scripts/verify-role-switcher-e2e.mjs',
  'scripts/audit-viewports-role-switcher.mjs',
  'scripts/verify-local-superadmin-screens.mjs',
  'scripts/verify-local-blog-editor.mjs',
  'scripts/verify-multi-role-matrix.mjs',
  'scripts/verify-10-secondary-screens.mjs',
  'scripts/verify-e2e-db-api-ui-chain.mjs',
  'scripts/audit-full-network-sweep.mjs',
  'scripts/audit-responsive-viewports.mjs',
  'scripts/test-network-failures.mjs',
  'tests/final-product-adversarial-qa.mjs',
  'scratch/debug_import_deep.js',
  'scratch/debug_import_json.js',
  'scratch/test_ai_resume_importer.js',
  'scratch/test_dashboard_import_btn.js',
  'scratch/test_full_resume_flow.js',
  'scratch/test_local_domain.js',
  'scratch/test_master_profile_prefill.js',
  'scratch/test_xampp_pdf.py'
];

for (const rel of files) {
  const filePath = path.resolve(rel);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');

  // Handle Python script
  if (rel.endsWith('.py')) {
    content = content.replace(/https?:\/\/ai-resume-builder\.local/g, 'os.environ.get("TARGET_URL", "https://127.0.0.1")');
    if (!content.includes('import os')) {
      content = 'import os\n' + content;
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated Python: ${rel}`);
    continue;
  }

  // Handle JS / MJS scripts
  // 1. Ensure dotenv is loaded or process.env is read
  if (!content.includes('dotenv.config') && !content.includes('process.env.TARGET_URL')) {
    if (rel.endsWith('.mjs')) {
      content = "import dotenv from 'dotenv';\ndotenv.config({ path: './backend/.env' });\n" + content;
    } else {
      content = "require('dotenv').config({ path: './backend/.env' });\n" + content;
    }
  }

  // 2. Replace hardcoded URLs
  content = content.replace(/['"`]https?:\/\/ai-resume-builder\.local\/?['"`]/g, "(process.env.TARGET_URL || process.env.APP_URL)");
  content = content.replace(/https?:\/\/ai-resume-builder\.local/g, "${process.env.TARGET_URL || process.env.APP_URL}");

  // Clean up any double replacements like `${${...}}`
  content = content.replace(/\$\{\$\{process\.env\.TARGET_URL \|\| process\.env\.APP_URL\}\}/g, "${process.env.TARGET_URL || process.env.APP_URL}");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated JS: ${rel}`);
}
