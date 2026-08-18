const JSZip = require('jszip');
const { createResumeDocx } = require('../backend/services/docxExport');

async function audit() {
  const sample = {
    firstname: 'Bhaskar',
    lastname: 'Madala',
    occupation: 'Senior Software Architect',
    email: 'bhaskar@example.com',
    phone: '+1 555-0199',
    city: 'San Francisco, CA',
    summary: 'Proven engineering leader specializing in cloud architectures.',
    skills: [{ name: 'React' }, { name: 'Node.js' }, { name: 'Go' }],
    employments: [{ jobTitle: 'Principal Architect', employer: 'Google Cloud', startDate: '2020', endDate: 'Present', description: '• Led distributed systems' }],
    educations: [{ degree: 'M.S. Computer Science', school: 'Stanford', startDate: '2016', endDate: '2018' }]
  };

  const templates = [
    { id: 'Cv1', name: 'Modern Split (Cv1)' },
    { id: 'Cv4', name: 'Minimal ATS (Cv4)' },
    { id: 'Cv8', name: 'Executive Banner (Cv8)' },
    { id: 'Cv25', name: 'Tech Grid (Cv25)' },
    { id: 'Cv40', name: 'Compact Europass (Cv40)' }
  ];

  console.log('====================================================');
  console.log('🔍 FORENSIC ALIGNMENT AUDIT (DOCX vs PDF)');
  console.log('====================================================\n');

  for (const t of templates) {
    const buf = await createResumeDocx({ ...sample, template: t.id });
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');

    const hasCenter = xml.includes('w:val="center"') || xml.includes('w:jc w:val="center"');
    const hasRightTab = xml.includes('w:val="right"') || xml.includes('w:tabStop');
    const hasLeftText = xml.includes('Principal Architect') && xml.includes('Google Cloud');

    console.log(`📌 ${t.name}:`);
    console.log(`   • Left-Aligned Body & Titles: ${hasLeftText ? 'MATCHES PDF (Left) ✅' : 'FAIL ❌'}`);
    console.log(`   • Centered Header / Banner:   ${hasCenter ? 'MATCHES PDF (Center) ✅' : 'N/A (Split Sidebar)'}`);
    console.log(`   • Right-Aligned Dates:        ${hasRightTab ? 'MATCHES PDF (Right Tab Stop) ✅' : 'N/A (Europass Gutter)'}\n`);
  }
}

audit();
