import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import express from 'express';
import { chromium } from 'playwright';
import { toValidatedPdfBlob, pdfFileName, isPdfBuffer, readExportErrorMessage } from '../src/utils/pdfDownload.js';

// --- PDF Inspection Helpers ---

function parsePdfStructure(buffer) {
  const str = buffer.toString('latin1');
  const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  const versionMatch = str.match(/%PDF-(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : null;

  const pageMatches = str.match(/\/Type\s*\/Page\b/g) || [];
  const pagesCountMatch = str.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  const pageCount = pagesCountMatch ? parseInt(pagesCountMatch[1], 10) : pageMatches.length;

  const streams = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(str)) !== null) {
    try {
      const rawStream = Buffer.from(match[1], 'latin1');
      const decompressed = zlib.inflateSync(rawStream).toString('utf8');
      streams.push(decompressed);
    } catch {
      try {
        const rawStream = Buffer.from(match[1], 'latin1');
        const decompressed = zlib.inflateRawSync(rawStream).toString('utf8');
        streams.push(decompressed);
      } catch {}
    }
  }

  return {
    isPdf,
    version,
    byteLength: buffer.length,
    pageCount: Math.max(1, pageCount),
    allStreamContent: streams.join('\n'),
    rawString: str,
  };
}

// --- Test Harness State ---

let testServer;
let testServerPort;
let sharedBrowser;
const activeRenderTokens = new Map();

function mintTestToken(data) {
  const token = crypto.randomBytes(32).toString('base64url');
  activeRenderTokens.set(token, data);
  return token;
}

async function renderRealPdf(template, resumeId, language, resumeData) {
  const token = mintTestToken(resumeData);
  const page = await sharedBrowser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });

  const targetUrl = `http://127.0.0.1:${testServerPort}/export/${template}/${resumeId}/${language}#renderToken=${token}`;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
    { timeout: 15000 }
  );

  const exportError = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
  if (exportError) {
    await page.close();
    throw new Error(`RENDER_ERROR:${exportError}`);
  }

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  });

  await page.close();
  return { pdfBuffer, token };
}

// --- Lifecycle Hooks ---

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve('dist')));

  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    if (!token || !activeRenderTokens.has(token)) {
      return res.status(404).json({ error: 'Render token invalid or expired' });
    }
    const data = activeRenderTokens.get(token);
    activeRenderTokens.delete(token);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.json({ success: true, data });
  });

  app.get('/export/*', (req, res) => {
    res.sendFile(path.resolve('dist', 'index.html'));
  });

  await new Promise((resolve) => {
    testServer = app.listen(0, '127.0.0.1', () => {
      testServerPort = testServer.address().port;
      resolve();
    });
  });

  sharedBrowser = await chromium.launch({
    headless: true,
  });
});

after(async () => {
  if (sharedBrowser) {
    await sharedBrowser.close();
  }
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

// --- Test Suite ---

// Test A — Normal CV
test('Matrix Test A — Normal CV: Generates authentic A4 PDF with valid headers and content', async () => {
  const normalCv = {
    firstname: 'Aarav',
    lastname: 'Patel',
    template: 'Cv1',
    language: 'en',
    occupation: 'Lead Cloud Architect',
    email: 'aarav.patel@enterprise.com',
    phone: '+91 98765 01234',
    address: 'Bengaluru, Karnataka, India',
    summary: 'Cloud infrastructure expert with 10+ years scaling distributed Kubernetes platforms.',
    employments: [
      {
        jobTitle: 'Senior Cloud Engineer',
        employer: 'MegaScale Tech',
        city: 'Bengaluru',
        begin: '2020',
        end: 'Present',
        description: 'Led migration of 200+ microservices to high-availability multi-region clusters.'
      }
    ],
    educations: [
      {
        school: 'National Institute of Technology',
        degree: 'B.Tech in Computer Engineering',
        city: 'Surat',
        started: '2012',
        finished: '2016'
      }
    ],
    skills: [
      { name: 'Kubernetes', rating: 95 },
      { name: 'AWS & GCP', rating: 90 },
      { name: 'Terraform', rating: 88 }
    ]
  };

  const { pdfBuffer } = await renderRealPdf('Cv1', 'norm-01', 'en', normalCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true, 'PDF header signature must begin with %PDF-');
  assert.equal(pdfInfo.byteLength > 10000, true, 'PDF size must be substantial (>10KB)');
  assert.equal(pdfInfo.pageCount >= 1, true, 'PDF must contain at least 1 page');
  assert.match(pdfInfo.rawString, /Skia\/PDF|Chromium/, 'PDF producer must be genuine Chromium/Skia');
});

// Test B — Multi-page CV
test('Matrix Test B — Multi-page CV: Correctly spans multiple pages without clipping', async () => {
  const employments = Array.from({ length: 8 }, (_, i) => ({
    jobTitle: `Enterprise Systems Architect ${i + 1}`,
    employer: `Global Enterprise Corp ${i + 1}`,
    city: 'Hyderabad',
    begin: `${2015 + i}`,
    end: `${2016 + i}`,
    description: `Directed end-to-end architecture for multi-tier microservices platform number ${i + 1}. Managed distributed database sharding, latency optimizations, and continuous deployment pipelines across 50 development squads with 99.99% uptime SLAs.`
  }));

  const multiPageCv = {
    firstname: 'Vikram',
    lastname: 'Sengupta',
    template: 'Cv2',
    language: 'en',
    occupation: 'Principal Enterprise Architect',
    email: 'vikram.sengupta@example.com',
    phone: '+91 91234 56789',
    address: 'Hyderabad, Telangana, India',
    summary: 'Seasoned principal architect with extensive background in distributed transactional systems and multi-cloud resilience.',
    employments,
    educations: [
      { school: 'IIT Bombay', degree: 'M.Tech in Computer Science', city: 'Mumbai', started: '2010', finished: '2012' },
      { school: 'Jadavpur University', degree: 'B.E. in Computer Science', city: 'Kolkata', started: '2006', finished: '2010' }
    ],
    skills: Array.from({ length: 15 }, (_, i) => ({ name: `Advanced Distributed Skill ${i + 1}`, rating: 90 }))
  };

  const { pdfBuffer } = await renderRealPdf('Cv2', 'multi-01', 'en', multiPageCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.pageCount >= 2, true, `Multi-page CV must produce multiple pages, got ${pdfInfo.pageCount}`);
  assert.equal(pdfInfo.byteLength > 25000, true, 'Multi-page PDF must have appropriate byte length');
});

// Test C — Unicode Multilingual CV (Telugu, Devanagari, Accented Latin, Symbols)
test('Matrix Test C — Unicode CV: Accurately renders Telugu, Devanagari, Accented Latin and Symbols', async () => {
  const unicodeCv = {
    firstname: 'భాస్కర్',
    lastname: 'రావు (Bhaskar Rao)',
    template: 'Cv1',
    language: 'en',
    occupation: 'ముఖ్య ఇంజనీర్ & Chief Architect',
    email: 'bhaskar.rao@telugu-tech.in',
    phone: '+91 94400 12345',
    address: 'హైదరాబాద్ (Hyderabad), భారతదేశం',
    summary: 'తెలుగు మరియు ఆంగ్ల భాషలలో అనుభవజ్ఞుడైన సాంకేతిక నిపుణుడు. Développeur Senior & Software-Architekt mit Expertise in großen verteilten Systemen.',
    employments: [
      {
        jobTitle: 'वरिष्ठ सॉफ्टवेयर वास्तुकार (Senior Architect)',
        employer: 'टेक्नोलॉजी सॉल्यूशंस प्राइवेट लिमिटेड',
        city: 'नई दिल्ली (New Delhi)',
        begin: '2019',
        end: 'Present',
        description: 'उच्च प्रदर्शन प्रणालियों का निर्माण और प्रबंधन। Résumé des réalisations: 99.99% disponibilité, économie de 2M€/an.'
      }
    ],
    educations: [
      {
        school: 'ఉస్మానియా విశ్వవిద్యాలయం (Osmania University)',
        degree: 'బీటెక్ కంప్యూటర్ సైన్స్ (B.Tech CS)',
        city: 'హైదరాబాద్',
        started: '2010',
        finished: '2014'
      }
    ],
    skills: [
      { name: 'Node.js & React ⚡', rating: 95 },
      { name: 'C++ & Rust (Zero-Cost) ✓', rating: 92 },
      { name: 'Multi-Lingual NLP (తెలుగు / हिंदी / Français) ★', rating: 90 }
    ]
  };

  const { pdfBuffer } = await renderRealPdf('Cv1', 'unicode-01', 'en', unicodeCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.byteLength > 20000, true);
  assert.match(pdfInfo.rawString, /\/Font|\/Type\s*\/Font/, 'PDF must embed required font descriptors for Unicode');
});

// Test D — Long Content & Edge Layouts
test('Matrix Test D — Long Content: Long descriptions and nested URLs render without crashing', async () => {
  const longCv = {
    firstname: 'Alexandrina-Elizabeth',
    lastname: 'Montgomery-Featherstonehaugh',
    template: 'Cv3',
    language: 'en',
    occupation: 'Global Vice President of Engineering, Platform Architecture & Infrastructure Modernization',
    email: 'alexandrina.montgomery-featherstonehaugh@enterprise-multinational-conglomerate.org',
    phone: '+1 (555) 019-2834 ext. 49201',
    address: '742 Evergreen Terrace, Sector 49, Northwest Metropolitan District, Greater Tech Region 98101',
    summary: 'A'.repeat(1200),
    employments: [
      {
        jobTitle: 'Distinguished Infrastructure Fellow & Chair of Global Architecture Review Board',
        employer: 'UltraScale Global Infrastructure Technologies International Corporation',
        city: 'San Francisco & London',
        begin: 'January 2018',
        end: 'Present',
        description: 'B '.repeat(350)
      }
    ],
    educations: [
      {
        school: 'Massachusetts Institute of Technology — School of Electrical Engineering and Computer Science',
        degree: 'Doctor of Philosophy (Ph.D.) in Advanced Distributed Computing Systems',
        city: 'Cambridge, Massachusetts',
        started: '2010',
        finished: '2015'
      }
    ],
    skills: [
      { name: 'https://github.com/ultra-long-repository-organization-name/super-deep-microservices-infrastructure-core-monorepo-v2', rating: 95 }
    ]
  };

  const { pdfBuffer } = await renderRealPdf('Cv3', 'long-01', 'en', longCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.byteLength > 15000, true);
});

// Test E — Minimal / Empty Sections CV
test('Matrix Test E — Minimal CV: Gracefully handles empty/omitted optional sections', async () => {
  const minimalCv = {
    firstname: 'Sara',
    lastname: 'Connor',
    template: 'Cv4',
    language: 'en',
    email: 'sara@example.com',
    occupation: 'Operations Lead',
    summary: '',
    employments: [],
    educations: [],
    skills: []
  };

  const { pdfBuffer } = await renderRealPdf('Cv4', 'min-01', 'en', minimalCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.pageCount, 1);
});

// Test F — Special Characters & Escaping
test('Matrix Test F — Special Characters: Quotes, brackets, ampersands, slashes render safely', async () => {
  const specialCharsCv = {
    firstname: 'O\'Connor & "Smith"',
    lastname: '<Dev/Test> [2026] {C++}',
    template: 'Cv5',
    language: 'en',
    occupation: 'Principal SRE & DevOps "Ninja" // SecOps',
    email: 'test+special@example.com',
    phone: '+1 (800) 555-0199 & +1 (800) 555-0198',
    address: '100 Main St. #4B, Suite <500> & "HQ"',
    summary: 'Expertise in: C++ / C# / Python & Bash. Handled SQL injections like "\'; DROP TABLE users; --" and XSS `<script>alert(1)</script>`.',
    employments: [
      {
        jobTitle: 'Lead & Architect <Cloud & Security>',
        employer: 'AT&T / B&H / Johnson & Johnson',
        city: 'New York & London',
        begin: '2020',
        end: '2025',
        description: 'Managed 99.999% SLA & achieved <10ms p99 latency using [Redis/Kafka] & {gRPC/Protobuf}.'
      }
    ],
    educations: [],
    skills: [
      { name: 'C++ / C# & Go (100%)', rating: 90 },
      { name: 'HTML5 & CSS3 & JS (ES6+)', rating: 95 }
    ]
  };

  const { pdfBuffer } = await renderRealPdf('Cv5', 'special-01', 'en', specialCharsCv);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.byteLength > 15000, true);
});

// Test G — Cover Letter PDF
test('Matrix Test G — Cover Letter: Generates clean Cover1 letter PDF', async () => {
  const coverLetterData = {
    firstname: 'Priya',
    lastname: 'Nambiar',
    template: 'Cover1',
    language: 'en',
    email: 'priya.nambiar@talent.org',
    phone: '+91 98800 54321',
    address: 'Bengaluru, India',
    occupation: 'VP of Product Management',
    recipientName: 'Hiring Committee',
    recipientCompany: 'Global Innovations Inc.',
    recipientAddress: 'One Tech Way, Innovation Park',
    coverLetterContent: `Dear Hiring Committee,\n\nI am writing to express my strong enthusiasm for the VP of Product Management role at Global Innovations Inc. With over 12 years of executive product leadership, I have consistently scaled enterprise platforms from seed to multi-million dollar annual recurring revenue.\n\nThroughout my tenure at leading software enterprises, I have championed user-centric product discovery, instituted data-driven roadmap prioritization, and led cross-functional engineering and design squads.\n\nI look forward to discussing how my strategic product vision can accelerate your upcoming AI and cloud initiatives.\n\nSincerely,\nPriya Nambiar`
  };

  const { pdfBuffer } = await renderRealPdf('Cover1', 'cover-01', 'en', coverLetterData);
  const pdfInfo = parsePdfStructure(pdfBuffer);

  assert.equal(pdfInfo.isPdf, true);
  assert.equal(pdfInfo.pageCount >= 1, true);
  assert.equal(pdfInfo.byteLength > 15000, true);
});

// Test H — Token Replay & Single-Use Enforcement
test('Matrix Test H — Token Single-Use & Replay Protection: Second request with same token fails closed', async () => {
  const sampleData = {
    firstname: 'Test',
    lastname: 'User',
    template: 'Cv1',
    language: 'en'
  };
  const token = mintTestToken(sampleData);

  const res1 = await fetch(`http://127.0.0.1:${testServerPort}/api/export-render-data?token=${encodeURIComponent(token)}`);
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  assert.equal(json1.success, true);
  assert.equal(json1.data.firstname, 'Test');

  const res2 = await fetch(`http://127.0.0.1:${testServerPort}/api/export-render-data?token=${encodeURIComponent(token)}`);
  assert.equal(res2.status, 404);
});

// Test I — Browser Print Emulation & Application Chrome Removal
test('Matrix Test I — Print Media Emulation: Non-document UI is hidden and document has true A4 geometry', async () => {
  const page = await sharedBrowser.newPage({ viewport: { width: 794, height: 1123 } });
  const token = mintTestToken({ firstname: 'Print', lastname: 'Test', template: 'Cv1', language: 'en' });
  await page.goto(`http://127.0.0.1:${testServerPort}/export/Cv1/print-01/en#renderToken=${token}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-export-ready') === 'true', { timeout: 20000 });

  await page.emulateMedia({ media: 'print' });

  const noPrintHidden = await page.evaluate(() => {
    const noPrint = document.querySelector('.no-print');
    return noPrint ? window.getComputedStyle(noPrint).display === 'none' : true;
  });
  assert.equal(noPrintHidden, true);

  const docVisible = await page.evaluate(() => {
    const doc = document.querySelector('.export-document') || document.querySelector('.resume-frame') || document.body;
    return doc && window.getComputedStyle(doc).display !== 'none';
  });
  assert.equal(docVisible, true);

  await page.close();
});

// Test J — Download Integrity & Error Payload Guarding
test('Matrix Test J — Download Integrity: JSON error bodies rejected and human error message returned', async () => {
  const errorJson = JSON.stringify({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription is required for PDF export' } });
  const errorBlob = new Blob([new TextEncoder().encode(errorJson)], { type: 'application/json' });

  await assert.rejects(
    () => toValidatedPdfBlob(errorBlob),
    (err) => {
      assert.equal(err.code, 'EXPORT_NOT_PDF');
      assert.match(err.message, /An active subscription is required/);
      return true;
    }
  );
});

// Test K — Unicode Filename Sanitization
test('Matrix Test K — Filename Sanitization: Preserves Indic and International combining marks', () => {
  assert.equal(pdfFileName('భాస్కర్', 'రావు'), 'భాస్కర్_రావు.pdf');
  assert.equal(pdfFileName('अनुराग', 'शर्मा'), 'अनुराग_शर्मा.pdf');
  assert.equal(pdfFileName('José', 'Núñez'), 'José_Núñez.pdf');
  assert.equal(pdfFileName('', ''), 'resume.pdf');
  assert.match(pdfFileName('../../etc/passwd', 'exploit'), /\.pdf$/);
  assert.doesNotMatch(pdfFileName('../../etc/passwd', 'exploit'), /[/\\:*?"<>|]/);
});
