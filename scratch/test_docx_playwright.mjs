import { chromium } from 'playwright';
import JSZip from 'jszip';
import fs from 'fs';
import { createResumeDocx } from '../backend/services/docxExport.js';

console.log('====================================================');
console.log('🎭 RUNNING PLAYWRIGHT & FORENSIC AUDIT ON DOCX EXPORT');
console.log('====================================================\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  console.log('1. Navigating to https://airesume.projectdemo.guru/build-resume/heading ...');
  await page.goto('https://airesume.projectdemo.guru/build-resume/heading', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('  ✅ Page loaded.');
  await page.waitForTimeout(2000);

  // Check if View Full Size / Preview Modal opens
  console.log('2. Inspecting Preview / Download buttons in the UI...');
  const viewFullBtn = page.locator('text="View Full Size", button:has-text("View Full Size")').first();
  if (await viewFullBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await viewFullBtn.click();
    console.log('  ✅ Preview modal opened.');
    await page.waitForTimeout(1000);

    const docxBtn = page.locator('button:has-text("Download Word"), button:has-text("DOCX"), button:has-text("Word")').first();
    const isDocxBtnVisible = await docxBtn.isVisible().catch(() => false);
    console.log(`  🔎 "Download Word (DOCX)" button visible in Preview Modal: ${isDocxBtnVisible ? 'YES ✅' : 'NO ❌'}`);
  }

  // 3. Directly test the backend DOCX generation with rich HTML summary
  console.log('\n3. Testing backend DOCX generation with HTML rich-text input...');
  
  const sampleInput = {
    firstname: 'Bhaskar Babu',
    lastname: 'Madala',
    occupation: 'Frontend Developer',
    email: 'bhaskar.beyond@gmail.com',
    phone: '+918555035068',
    template: 'Cv1',
    summary: '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Frontend Developer with 9+ years of experience in JavaScript and React, delivering comprehensive software projects that meet client requirements on schedule.</span></p>',
    employments: [
      {
        jobTitle: 'Senior Software Engineer',
        employer: 'Beyond Technologies',
        startDate: '2021',
        endDate: 'Present',
        description: '• Delivered comprehensive software project at Beyond Technologies.\n• Engineered scalable system architecture.'
      }
    ],
    skills: [{ name: 'JavaScript' }, { name: 'React.js' }, { name: 'TypeScript' }]
  };

  const buffer = await createResumeDocx(sampleInput);
  fs.writeFileSync('scratch/downloaded_test.docx', buffer);
  console.log('  ✅ DOCX file generated (Size: ' + buffer.length + ' bytes).');

  // Inspect XML inside DOCX
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');

  console.log('\n4. Forensic Inspection of word/document.xml:');
  const hasRawHtmlTag = documentXml.includes('class="editor-paragraph"') || documentXml.includes('&lt;p') || documentXml.includes('<p') || documentXml.includes('dir="ltr"');
  console.log(`  - Raw HTML (<p class="editor-paragraph">) present in document: ${hasRawHtmlTag ? 'YES ❌ (HTML is NOT sanitized yet)' : 'NO ✅ (Clean text)'}`);
  
  const hasTwoColumnTable = documentXml.includes('<w:tbl>');
  console.log(`  - 2-Column Sidebar Table (<w:tbl>) present in document: ${hasTwoColumnTable ? 'YES ✅ (2-column layout active)' : 'NO ❌ (Naive single-column format)'}`);

  const hasThemeColor = documentXml.includes('1E3A8A') || documentXml.includes('1e3a8a');
  console.log(`  - Template Cv1 Authentic Palette (#1E3A8A Navy) present: ${hasThemeColor ? 'YES ✅' : 'NO ❌'}`);

} catch (err) {
  console.error('Error during test:', err);
} finally {
  await browser.close();
}

console.log('\n====================================================');
console.log('🏁 AUDIT COMPLETE');
console.log('====================================================\n');
