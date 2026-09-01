import fs from 'fs';

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

for (const f of files) {
  if (fs.existsSync(f)) {
    const c = fs.readFileSync(f, 'utf8');
    const matches = c.match(/ai-resume-builder\.local/g);
    console.log(`${f}: ${matches ? matches.length : 0} occurrences`);
  }
}
