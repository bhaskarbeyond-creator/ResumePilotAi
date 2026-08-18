import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SAMPLE_DATA = {
  firstname: 'Jonathan',
  lastname: 'Parker',
  occupation: 'Senior Product Architect',
  phone: '+1 (555) 234-5678',
  email: 'jonathan.parker@example.com',
  address: '742 Evergreen Terrace',
  city: 'San Francisco',
  country: 'United States',
  postalcode: '94102',
  website: 'https://jparker.dev',
  linkedin: 'https://linkedin.com/in/jonathanparker',
  github: 'https://github.com/jparker',
  summary: 'Distinguished Product Architect and Engineering Leader with over 12 years of experience designing high-scale cloud distributed systems, developer platforms, and enterprise SaaS products. Proven track record leading cross-functional teams across Silicon Valley.',
  employments: [
    {
      jobTitle: 'Principal Solutions Architect',
      employer: 'Apex Cloud Systems',
      city: 'San Francisco, CA',
      begin: '2021-03',
      end: '',
      description: '• Directed architecture for distributed multi-tenant SaaS platform processing 4.2B daily requests across AWS and GCP.\\n• Championed migration from monolithic Ruby service to Go/gRPC microservices, reducing p99 latency by 43%.'
    },
    {
      jobTitle: 'Lead Software Engineer',
      employer: 'Starlight Tech Inc.',
      city: 'Palo Alto, CA',
      begin: '2017-06',
      end: '2021-02',
      description: '• Architected and deployed global GraphQL gateway unifying 18 backend services, supporting 12M monthly active users.\\n• Led team of 14 senior engineers across distributed US timezones.'
    }
  ],
  educations: [
    {
      degree: 'Master of Science in Computer Science',
      school: 'Stanford University',
      city: 'Stanford, CA',
      started: '2013-09',
      finished: '2015-06',
      description: 'Specialization in Distributed Systems & AI. Published thesis on Byzantine Fault Tolerance.'
    },
    {
      degree: 'Bachelor of Science in Software Engineering',
      school: 'UC Berkeley',
      city: 'Berkeley, CA',
      started: '2009-09',
      finished: '2013-05',
      description: 'Summa Cum Laude (GPA: 3.94/4.0). President of IEEE Student Branch.'
    }
  ],
  skills: [
    { name: 'TypeScript / React / Next.js', rating: 95 },
    { name: 'Go / Microservices / gRPC', rating: 90 },
    { name: 'Kubernetes / Docker / Terraform', rating: 88 },
    { name: 'PostgreSQL / Redis / DynamoDB', rating: 85 },
    { name: 'Distributed Systems & Architecture', rating: 95 },
    { name: 'Engineering Leadership & Mentoring', rating: 90 }
  ],
  languages: [
    { language: 'English', level: 'Native Speaker' },
    { language: 'German', level: 'Professional (C1)' },
    { language: 'Spanish', level: 'Conversational (B1)' }
  ],
  certifications: [
    { name: 'AWS Certified Solutions Architect – Professional', issuer: 'Amazon Web Services', issueDate: '2023-04' },
    { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation', issueDate: '2022-09' }
  ]
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Create an HTML testbed that renders SmartResumeComposer directly
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="file:///${path.resolve('src/engine/hybrid/smartEngine.css').replace(/\\/g, '/')}">
  <style>
    body { margin: 0; padding: 0; background: #525659; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React from 'https://esm.sh/react@18';
    import ReactDOM from 'https://esm.sh/react-dom@18/client';
    import SmartResumeComposer from 'file:///${path.resolve('src/engine/hybrid/SmartResumeComposer.jsx').replace(/\\/g, '/')}';
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(SmartResumeComposer, {
      templateId: 'Cv1',
      values: ${JSON.stringify(SAMPLE_DATA)},
      language: 'en'
    }));
  </script>
</body>
</html>
  `;

  fs.writeFileSync('scratch/test_pdf_split.html', htmlContent);

  await page.goto(`file:///${path.resolve('scratch/test_pdf_split.html').replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'scratch/test_cv1_rendered.png', fullPage: true });
  console.log('Saved scratch/test_cv1_rendered.png');

  // Let's also check Cv51
  const htmlCv51 = htmlContent.replace("templateId: 'Cv1'", "templateId: 'Cv51'");
  fs.writeFileSync('scratch/test_pdf_cv51.html', htmlCv51);
  await page.goto(`file:///${path.resolve('scratch/test_pdf_cv51.html').replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch/test_cv51_rendered.png', fullPage: true });
  console.log('Saved scratch/test_cv51_rendered.png');

  await browser.close();
}

run().catch(console.error);
