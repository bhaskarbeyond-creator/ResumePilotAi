import { getRepository } from '../backend/repositories/index.js';

const repo = getRepository();

const posts = [
  {
    id: 'post_ats_guide_2026',
    title: 'How to Beat Applicant Tracking Systems (ATS) in 2026: The Definitive Guide',
    slug: 'how-to-beat-ats-in-2026',
    excerpt: 'Learn the exact scanning algorithms modern ATS systems use, how parse trees evaluate job match scores, and how to format your resume for maximum pass rates.',
    cover_image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=1200&auto=format&fit=crop&q=80',
    category: 'ATS Optimization',
    tags: ['ATS', 'Resume Tips', 'Career Growth', 'Recruiting'],
    author: 'ResumePilot Editorial',
    author_id: 'sys-editorial',
    published: 1,
    status: 'approved',
    published_at: '2026-02-15 10:00:00',
    content: `<h2>Understanding Modern ATS Parsing Pipelines</h2>
<p>In 2026, over 98% of Fortune 500 corporations and mid-sized enterprises utilize Applicant Tracking Systems (ATS) like Workday, Taleo, Greenhouse, and Lever to screen resumes before a human recruiter ever sees them.</p>

<img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1000&auto=format&fit=crop&q=80" alt="Modern workspace analyzing resume analytics" />

<h3>1. Single-Column Semantic Hierarchy</h3>
<p>Multi-column layouts with complex HTML/CSS tables often cause ATS parsers to interleave unrelated content (e.g., reading your skills list directly into your job title field). Stick to clean, single-column or certified dual-column structures.</p>

<h3>2. Standardized Section Headers</h3>
<p>Always use recognizable headings like <strong>Work Experience</strong>, <strong>Education</strong>, <strong>Technical Skills</strong>, and <strong>Certifications</strong> so the parsing engine accurately classifies your information.</p>

<img src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1000&auto=format&fit=crop&q=80" alt="Engineering team collaborating on recruitment algorithms" />

<h3>3. Contextual Keyword Integration</h3>
<p>Avoid "keyword stuffing" in white font (modern parsers detect and blacklist this immediately). Instead, naturally embed domain tools, frameworks, and metrics within your bullet points.</p>`
  },
  {
    id: 'post_google_xyz_formula',
    title: "Mastering Google's X-Y-Z Resume Bullet Formula with Real Examples",
    slug: 'mastering-google-xyz-resume-formula',
    excerpt: 'Former Google SVP of People Operations Laszlo Bock established the gold standard: Accomplished [X], as measured by [Y], by doing [Z]. Here is how to apply it across all industries.',
    cover_image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop&q=80',
    category: 'Resume Writing',
    tags: ['Google', 'Resume Formula', 'Action Verbs', 'Tech Jobs'],
    author: 'Career Intelligence Lab',
    author_id: 'sys-editorial',
    published: 1,
    status: 'approved',
    published_at: '2026-02-20 14:30:00',
    content: `<h2>The Formula That Built Silicon Valley Resumes</h2>
<p>Former Google SVP of People Operations Laszlo Bock established the gold standard for executive and engineering resumes: <strong>"Accomplished [X], as measured by [Y], by doing [Z]."</strong></p>

<img src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1000&auto=format&fit=crop&q=80" alt="Software engineer reviewing code and metrics dashboard" />

<h3>Breaking Down the Three Components</h3>
<ul>
  <li><strong>X (The Accomplishment):</strong> The business outcome or technical milestone reached.</li>
  <li><strong>Y (The Quantified Metric):</strong> The measurable percentage, dollar amount, latency reduction, or scale.</li>
  <li><strong>Z (The Method / Action):</strong> The specific tools, algorithms, or architectural patterns you applied.</li>
</ul>

<h3>Real World Transformation Examples</h3>
<p><strong>Before:</strong> Worked on improving API performance and database queries.</p>
<p><strong>After (X-Y-Z):</strong> Reduced p99 query latency by 74% (from 320ms to 83ms) across 4.2M daily transactions by implementing Redis distributed caching and restructuring MySQL B-Tree composite indexes.</p>

<img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1000&auto=format&fit=crop&q=80" alt="Data analytics and chart visualization" />`
  },
  {
    id: 'post_star_interview_method',
    title: 'Ace Behavioral Interviews Using the STAR Method: Complete Playbook',
    slug: 'ace-behavioral-interviews-star-method',
    excerpt: 'Master behavioral and leadership interviews using Situation, Task, Action, and Result structures with proven response templates for senior roles.',
    cover_image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1200&auto=format&fit=crop&q=80',
    category: 'Interview Prep',
    tags: ['STAR Method', 'Interviews', 'Behavioral Questions', 'Leadership'],
    author: 'Interview AI Coach',
    author_id: 'sys-editorial',
    published: 1,
    status: 'approved',
    published_at: '2026-02-25 09:15:00',
    content: `<h2>The Architecture of an Impactful Interview Story</h2>
<p>Behavioral interview questions ("Tell me about a time you handled a critical conflict", "Describe a severe outage and how you resolved it") test your cognitive resilience, communication clarity, and problem-solving methodology under pressure.</p>

<img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&auto=format&fit=crop&q=80" alt="Team collaborating in modern office room" />

<h3>The 4 Pillars of STAR</h3>
<ul>
  <li><strong>Situation (15% of time):</strong> Set the context and environment briefly without getting bogged down in trivial details.</li>
  <li><strong>Task (15% of time):</strong> Clearly define your direct responsibility and what was at stake.</li>
  <li><strong>Action (50% of time):</strong> Detail the exact steps YOU took, technical decisions made, and how you led the solution.</li>
  <li><strong>Result (20% of time):</strong> Share quantified outcomes, what was learned, and long-term organizational benefits.</li>
</ul>

<img src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1000&auto=format&fit=crop&q=80" alt="Professional team celebration meeting" />`
  }
];

async function seed() {
  for (const p of posts) {
    await repo.saveBlogPost(p.id, p);
    console.log(`[Seed] Successfully seeded post: ${p.id} (${p.slug}) with cover and content images.`);
  }
  console.log('[Seed] All blog posts enriched with verified image assets.');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Error seeding blog posts:', err);
  process.exit(1);
});
