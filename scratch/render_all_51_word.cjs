const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JSZip = require('jszip');
const { createResumeDocx } = require('../backend/services/docxExport');
const { THEMES, ARCHETYPES } = require('../backend/services/docxThemes');

const outDir = path.resolve('scratch/visual_audit_artifacts/all_51_rendered');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const standardResume = {
  firstname: 'Bhaskar',
  lastname: 'Madala',
  occupation: 'Senior Software Architect',
  email: 'bhaskar@example.com',
  phone: '+1 (555) 019-2834',
  address: '100 Innovation Way',
  city: 'San Francisco',
  country: 'United States',
  website: 'https://bhaskarmadala.dev',
  summary: 'Senior Software Architect with 10+ years of experience leading engineering teams and architecting high-throughput distributed systems. Specialized in <b>React</b>, <i>Node.js</i>, and cloud infrastructure.',
  skills: [
    { name: 'JavaScript / TypeScript' },
    { name: 'React & Redux' },
    { name: 'Node.js & Express' },
    { name: 'Go / Distributed Systems' },
    { name: 'Docker & Kubernetes' },
    { name: 'PostgreSQL & MongoDB' }
  ],
  languages: [
    { name: 'English', level: 'Native / Fluent' },
    { name: 'German', level: 'Professional Working' }
  ],
  employments: [
    {
      jobTitle: 'Lead Cloud Architect',
      employer: 'Google Cloud Enterprise',
      city: 'Sunnyvale, CA',
      startDate: '2021-03',
      endDate: '',
      currentWork: true,
      description: '• Spearheaded architectural migration of high-throughput microservices reducing p99 latency by 45%.\n• Managed a cross-functional team of 14 senior engineers across multiple timezones.\n• Established enterprise-wide observability, CI/CD automation, and zero-downtime deployments.'
    },
    {
      jobTitle: 'Senior Systems Engineer',
      employer: 'Oracle Cloud Infrastructure',
      city: 'Redwood City, CA',
      startDate: '2017-06',
      endDate: '2021-02',
      description: '• Designed and implemented distributed caching layers handling over 100K requests per second.\n• Integrated security scanning, SAST/DAST, and automated compliance into release pipelines.'
    }
  ],
  educations: [
    {
      degree: 'Master of Science in Computer Science',
      school: 'Stanford University',
      city: 'Stanford, CA',
      startDate: '2015',
      endDate: '2017',
      description: 'Specialization in Distributed Systems and Artificial Intelligence. Graduated with Honors.'
    },
    {
      degree: 'Bachelor of Technology in Information Technology',
      school: 'National Institute of Technology',
      city: 'Warangal',
      startDate: '2011',
      endDate: '2015'
    }
  ],
  projects: [
    {
      title: 'ResumePilot AI Platform',
      url: 'https://airesume.projectdemo.guru',
      description: 'AI-assisted career platform supporting real-time hybrid page-splitting and multi-format document exports.'
    }
  ],
  certifications: [
    { name: 'AWS Certified Solutions Architect – Professional', issuer: 'Amazon Web Services' },
    { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation' }
  ],
  hobbies: [
    { name: 'Open Source Development' },
    { name: 'Photography' }
  ]
};

async function renderAll() {
  console.log('================================================================');
  console.log('🚀 RENDERING ALL 51 TEMPLATES TO WORD DOCX AND WORD PDF');
  console.log('================================================================\n');

  const results = [];
  const psScript = path.resolve('scratch/convert_docx_to_pdf.ps1');

  // Convert via Word COM
  for (let i = 1; i <= 51; i++) {
    const tId = `Cv${i}`;
    const theme = THEMES[tId] || THEMES.Cv1;
    const docxPath = path.join(outDir, `${tId}.docx`);
    const pdfPath = path.join(outDir, `${tId}_word.pdf`);

    // Generate DOCX
    const docxBuffer = await createResumeDocx({ ...standardResume, template: tId });
    fs.writeFileSync(docxPath, docxBuffer);

    // Convert DOCX to PDF using Word COM
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}" -docxPath "${docxPath}" -pdfPath "${pdfPath}"`, { stdio: 'pipe' });
      const pdfStats = fs.statSync(pdfPath);
      console.log(`[${i}/51] ✅ ${tId} (${theme.name}): DOCX (${docxBuffer.length} B) -> Word PDF (${pdfStats.size} B)`);
      results.push({
        template: tId,
        name: theme.name,
        archetype: theme.archetype,
        primary: theme.primary,
        docxBytes: docxBuffer.length,
        pdfBytes: pdfStats.size,
        status: 'SUCCESS'
      });
    } catch (err) {
      console.error(`[${i}/51] ❌ ${tId} Failed:`, err.message);
      results.push({
        template: tId,
        name: theme.name,
        archetype: theme.archetype,
        status: 'FAILED',
        error: err.message
      });
    }
  }

  const reportPath = path.resolve('scratch/visual_audit_artifacts/51_template_word_render_log.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAll 51 templates converted! Log written to ${reportPath}`);
}

renderAll().catch(err => {
  console.error('Batch rendering failed:', err);
  process.exit(1);
});
