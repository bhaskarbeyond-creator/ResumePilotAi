const { getRepository } = require('../backend/repositories');

async function seedBlogPosts() {
  const repo = getRepository();
  const samplePosts = [
    {
      id: 'post_ats_guide_2026',
      title: 'How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide',
      slug: 'how-to-beat-ats-screening-2026',
      category: 'ATS & Optimization',
      tags: ['ATS', 'Resume Tips', 'Career Advice', 'Job Search'],
      author: 'ResumePilot Editorial Team',
      excerpt: 'Discover how modern ATS algorithms like Workday, Greenhouse, and Taleo parse resumes, and learn the essential formatting rules to pass automated filters.',
      content: '<h2>Understanding Modern ATS Algorithms</h2><p>Applicant Tracking Systems (ATS) are software applications used by over 98% of Fortune 500 employers to filter, rank, and parse incoming candidate resumes before a human recruiter ever sees them.</p><h3>1. Single-Column Semantic Hierarchy</h3><p>Multi-column tables and complex graphical sidebars frequently cause parser collisions in legacy Taleo and older Greenhouse parsers. Standard headings (Experience, Education, Skills) ensure 100% extraction fidelity.</p><h3>2. Metric-Driven Bullet Points</h3><p>Quantify outcomes using concrete numbers: revenue generated, latency decreased, or operational overhead saved.</p>',
      published: true,
      status: 'approved',
      views: 1420,
      likes: 88,
      publishedAt: new Date().toISOString()
    },
    {
      id: 'post_google_xyz_formula',
      title: "Mastering Google's X-Y-Z Resume Bullet Formula with Real Examples",
      slug: 'google-xyz-resume-bullet-formula',
      category: 'Resume Writing',
      tags: ['Google', 'Resume Writing', 'Impact Metrics', 'Career Growth'],
      author: 'ResumePilot Editorial Team',
      excerpt: 'Transform generic job duties into high-impact accomplishments using the proven "Accomplished [X] as measured by [Y] by doing [Z]" structure.',
      content: '<h2>The Formula That Built Silicon Valley Resumes</h2><p>Former Google SVP of People Operations Laszlo Bock established the gold standard: <strong>"Accomplished [X], as measured by [Y], by doing [Z]."</strong></p><h3>Why Generic Bullets Fail</h3><p>Phrases like "Responsible for team management" tell recruiters what you did, not how well you performed.</p><h3>Before vs After Transformation</h3><p><strong>Before:</strong> Updated customer databases and resolved ticket issues.</p><p><strong>After:</strong> Optimized CRM indexing pipeline, reducing client ticket latency by 42% across 12,000 monthly accounts.</p>',
      published: true,
      status: 'approved',
      views: 980,
      likes: 64,
      publishedAt: new Date().toISOString()
    },
    {
      id: 'post_star_interview_method',
      title: 'Ace Behavioral Interviews Using the STAR Method: Complete Playbook',
      slug: 'mastering-the-star-interview-method',
      category: 'Interview Preparation',
      tags: ['Interviews', 'STAR Method', 'Behavioral Questions', 'CBT Coaching'],
      author: 'ResumePilot Editorial Team',
      excerpt: 'Learn how to structure compelling answers for difficult behavioral and situational interview questions using Situation, Task, Action, and Result.',
      content: '<h2>The Architecture of an Impactful Interview Story</h2><p>Behavioral interview questions ("Tell me about a time you handled conflict", "Describe a critical system failure") test cognitive resilience and communication clarity.</p><h3>The 4-Pillar STAR Rubric</h3><ul><li><strong>Situation:</strong> Set the context in 2 concise sentences.</li><li><strong>Task:</strong> State the explicit problem or deliverable.</li><li><strong>Action:</strong> Detail the specific steps you personally took.</li><li><strong>Result:</strong> State the measurable business outcome.</li></ul>',
      published: true,
      status: 'approved',
      views: 1850,
      likes: 112,
      publishedAt: new Date().toISOString()
    }
  ];

  for (const post of samplePosts) {
    await repo.saveBlogPost(post.id, post);
    console.log('✓ Seeded post in MariaDB:', post.title, `(/blog/${post.slug})`);
  }
  console.log('✓ All 3 blog posts seeded in local database successfully!');
}

seedBlogPosts().catch(console.error);
