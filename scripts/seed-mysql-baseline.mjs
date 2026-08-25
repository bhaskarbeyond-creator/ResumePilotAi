import path from 'path';
import fs from 'fs';

const mysqlPath = fs.existsSync('./backend/database/mysql.js') 
  ? './backend/database/mysql.js' 
  : fs.existsSync('../backend/database/mysql.js') 
    ? '../backend/database/mysql.js' 
    : '/home/u727965524/backend/database/mysql.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getPool, initializeSchema } = require(mysqlPath);

async function seedBaseline() {
  console.log('=== Seeding MySQL Baseline Records ===');
  await initializeSchema();
  const pool = getPool();

  // 1. System Settings
  const defaultSettings = [
    { category: 'general', data: { websiteName: 'ResumePilot AI', defaultLanguage: 'en', maintenanceMode: false } },
    { category: 'ai_providers', data: { primaryProvider: 'nvidia', activeProviders: { nvidia: true, gemini: true } } },
    { category: 'theme', data: { primaryColor: '#2563EB', darkMode: true } },
    { category: 'seo', data: { metaTitle: 'ResumePilot AI — #1 AI Resume & CV Builder', metaDescription: 'Build high-scoring ATS resumes with AI.' } }
  ];
  for (const s of defaultSettings) {
    await pool.query(
      'INSERT INTO system_settings (category, data, revision) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [s.category, JSON.stringify(s.data)]
    );
  }
  console.log('✓ System settings seeded');

  // 2. Custom CMS Pages
  const defaultPages = [
    { id: 'page_about', title: 'About Us', slug: 'about', content: 'About ResumePilot AI enterprise platform.', published: true, nav_order: 1, show_in_footer: true },
    { id: 'page_terms', title: 'Terms of Service', slug: 'terms', content: 'Terms and Conditions for ResumePilot AI.', published: true, nav_order: 2, show_in_footer: true },
    { id: 'page_privacy', title: 'Privacy Policy', slug: 'privacy', content: 'Privacy Policy and Data Protection guidelines.', published: true, nav_order: 3, show_in_footer: true }
  ];
  for (const p of defaultPages) {
    await pool.query(
      'INSERT INTO custom_pages (id, title, slug, content, published, nav_order, show_in_footer) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)',
      [p.id, p.title, p.slug, p.content, p.published, p.nav_order, p.show_in_footer]
    );
  }
  console.log('✓ CMS custom pages seeded');

  // 3. Trusted By Partners
  const defaultPartners = [
    { id: 'tb_google', name: 'Google', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg', display_order: 1, active: true },
    { id: 'tb_microsoft', name: 'Microsoft', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg', display_order: 2, active: true },
    { id: 'tb_amazon', name: 'Amazon', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg', display_order: 3, active: true }
  ];
  for (const tb of defaultPartners) {
    await pool.query(
      'INSERT INTO trusted_by (id, name, logo_url, display_order, active) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [tb.id, tb.name, tb.logo_url, tb.display_order, tb.active]
    );
  }
  console.log('✓ Trusted By partners seeded');

  // 4. Sample Blog Post
  await pool.query(
    'INSERT INTO blog (id, title, slug, content, excerpt, author, category, tags, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title)',
    [
      'post_ats_guide',
      'How to Beat the ATS in 2026: The Definitive Resume Guide',
      'how-to-beat-ats-2026',
      'Learn how to optimize your resume with keywords, clear hierarchies, and clean typography to score 95%+ on modern Applicant Tracking Systems.',
      'A comprehensive guide to beating modern ATS screening algorithms.',
      'ResumePilot Team',
      'Career Advice',
      JSON.stringify(['ATS', 'Resume', 'Career', 'AI']),
      true
    ]
  );
  console.log('✓ Sample blog post seeded');

  // 5. Verification Counts
  const [counts] = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM system_settings) AS system_settings,
      (SELECT COUNT(*) FROM custom_pages) AS custom_pages,
      (SELECT COUNT(*) FROM trusted_by) AS trusted_by,
      (SELECT COUNT(*) FROM blog) AS blog,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM resumes) AS resumes
  `);
  console.log('\n📊 SEED VERIFICATION CENSUS:');
  console.table(counts);

  process.exit(0);
}

seedBaseline().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
