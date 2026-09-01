import { getRepository } from '../backend/repositories/index.js';

(async () => {
  console.log('Testing Repository saveBlogPost directly...');
  const repo = getRepository();
  const saved = await repo.saveBlogPost('post_ats_guide_2026', {
    title: 'How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide',
    slug: 'how-to-beat-ats-screening-2026',
    category: 'ATS Resumes',
    excerpt: 'Updated excerpt from test',
    published: 1,
    status: 'approved',
    author: 'Editorial Team'
  });
  console.log('Saved post result:', saved);
  console.log('PASS: DB save successful');
  process.exit(0);
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
