/**
 * FORENSIC PDF SPLIT VERIFICATION — All 51 Templates
 * 
 * Uses production Vite build + Playwright to render each template at A4 width,
 * then inspects the ACTUAL DOM structure and takes screenshots.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { chromium } from 'playwright';
import { THEME_PRESETS, ARCHETYPES } from '../src/engine/hybrid/themePresets.js';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

const sampleResume = {
  firstname: 'Jonathan',
  lastname: 'Parker',
  occupation: 'Senior Technical Lead & Cloud Architect',
  email: 'jonathan.parker@example.com',
  phone: '+1 (555) 234-5678',
  address: '100 Innovation Way, Suite 400',
  city: 'San Francisco, CA',
  country: 'United States',
  website: 'https://jonathanparker.dev',
  summary: 'Results-driven Senior Technical Lead with 10+ years of expertise in architecting resilient distributed systems, modernizing cloud infrastructure, and leading high-performing cross-functional engineering teams. Proven track record of delivering mission-critical platforms serving millions of users globally.',
  employments: [
    {
      jobTitle: 'Principal Cloud Architect',
      employer: 'CloudScale Technologies',
      city: 'San Francisco, CA',
      startDate: '2021-03',
      endDate: '',
      currentWork: true,
      description: '• Spearheaded architectural design of global microservices handling 250M+ requests daily.\n• Reduced cloud infrastructure costs by 32% via automated resource optimization.\n• Mentored 12 staff and senior engineers across distributed development squads.'
    },
    {
      jobTitle: 'Senior Software Engineer',
      employer: 'Apex Enterprise Systems',
      city: 'Seattle, WA',
      startDate: '2017-06',
      endDate: '2021-02',
      description: '• Developed high-throughput event processing pipelines using Kafka and Go.\n• Built automated testing frameworks that increased test coverage from 65% to 94%.'
    }
  ],
  educations: [
    {
      school: 'University of Washington',
      degree: 'Bachelor of Science in Computer Science',
      city: 'Seattle, WA',
      startDate: '2013',
      endDate: '2017',
      description: 'Graduated Magna Cum Laude. Focus on Systems Architecture and Distributed Algorithms.'
    }
  ],
  skills: [
    { name: 'Cloud Architecture & AWS' },
    { name: 'Kubernetes & Docker' },
    { name: 'Go, Rust & Node.js' },
    { name: 'Distributed Systems' },
    { name: 'System Design' },
    { name: 'CI/CD Pipelines' }
  ],
  languages: [
    { name: 'English', level: 'Native / Bilingual' },
    { name: 'Spanish', level: 'Professional Working' }
  ],
  certifications: [
    { name: 'AWS Solutions Architect – Professional', issuer: 'Amazon Web Services' },
    { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF' }
  ]
};

async function runForensicVerification() {
  console.log('========================================================================');
  console.log('🔍 FORENSIC PDF SPLIT VERIFICATION — ALL 51 TEMPLATES');
  console.log('========================================================================\n');

  const outDir = path.resolve('scratch/forensic_split_audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Set up static server from production build
  const app = express();
  app.use(express.static(path.resolve('dist')));
  const activeTokens = new Map();
  app.get('/api/export-render-data', (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens.has(token)) return res.status(404).json({ error: 'Token not found' });
    const data = activeTokens.get(token);
    activeTokens.delete(token);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, data });
  });
  app.get('/export/*', (req, res) => res.sendFile(path.resolve('dist/index.html')));

  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const port = server.address().port;
  console.log(`  Static server on port ${port}\n`);

  const browser = await chromium.launch({ headless: true });

  const results = [];

  for (let i = 0; i < CV_IDS.length; i++) {
    const cvId = CV_IDS[i];
    const theme = THEME_PRESETS[cvId];
    const configuredArchetype = theme?.archetype || 'UNKNOWN';

    const renderToken = crypto.randomBytes(32).toString('base64url');
    activeTokens.set(renderToken, { ...sampleResume, template: cvId });

    // Fresh page per template (matches working preview generator pattern)
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    const exportUrl = `http://127.0.0.1:${port}/export/${cvId}/forensic-${cvId}/en#renderToken=${renderToken}`;
    
    try {
      await page.goto(exportUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Wait for export-ready signal (same as working preview script)
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
        { timeout: 15000 }
      );

      const exportError = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
      if (exportError) throw new Error(`Export error: ${exportError}`);

      const layout = await page.evaluate(() => {
        const pageEl = document.querySelector('.smart-resume-page');
        const adaptiveEl = document.querySelector('.smart-adaptive-page');
        const heroEl = document.querySelector('.smart-split-hero');
        const sidebarEl = document.querySelector('.smart-sidebar');
        const mainEl = document.querySelector('.smart-main-content');
        const bottomEl = document.querySelector('.smart-fullwidth-bottom-flow');
        const layoutEl = document.querySelector('.smart-layout');
        const bannerEl = document.querySelector('.smart-banner-wrapper');

        const result = {
          pageClasses: pageEl?.className || 'NOT_FOUND',
          layoutClasses: layoutEl?.className || 'NOT_FOUND',
          hasAdaptivePage: Boolean(adaptiveEl),
          hasSplitHero: Boolean(heroEl),
          hasSidebar: Boolean(sidebarEl),
          hasMainContent: Boolean(mainEl),
          hasBottomFlow: Boolean(bottomEl),
          hasBanner: Boolean(bannerEl),
          sidebarRect: null,
          mainRect: null,
          pageRect: null,
          sidebarComputedBg: null,
        };

        if (pageEl) {
          const r = pageEl.getBoundingClientRect();
          result.pageRect = { width: Math.round(r.width), height: Math.round(r.height) };
        }
        if (sidebarEl) {
          const r = sidebarEl.getBoundingClientRect();
          result.sidebarRect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
          result.sidebarComputedBg = window.getComputedStyle(sidebarEl).backgroundColor;
        }
        if (mainEl) {
          const r = mainEl.getBoundingClientRect();
          result.mainRect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        }

        return result;
      });

      // Determine actual visible structure
      let actualLayout = 'UNKNOWN';
      if (layout.hasSidebar && layout.hasMainContent && layout.sidebarRect && layout.mainRect) {
        const sidebarRight = layout.sidebarRect.x + layout.sidebarRect.width;
        const sidebarLeft = layout.sidebarRect.x;
        const mainLeft = layout.mainRect.x;
        const mainRight = layout.mainRect.x + layout.mainRect.width;
        
        if (Math.abs(sidebarRight - mainLeft) < 10) {
          actualLayout = 'TWO_COLUMN_LEFT_SIDEBAR';
        } else if (Math.abs(mainRight - sidebarLeft) < 10) {
          actualLayout = 'TWO_COLUMN_RIGHT_SIDEBAR';
        } else {
          actualLayout = `SIDEBAR_MAIN_OVERLAP (sR=${sidebarRight}, mL=${mainLeft})`;
        }
      } else if (!layout.hasSidebar && layout.hasMainContent) {
        actualLayout = 'SINGLE_COLUMN';
      } else if (!layout.hasSidebar && !layout.hasMainContent) {
        actualLayout = 'SINGLE_COLUMN_NO_MAIN';
      } else {
        actualLayout = 'UNEXPECTED';
      }

      const entry = {
        id: cvId,
        configuredArchetype,
        name: theme?.name || 'UNKNOWN',
        actualLayout,
        ...layout,
      };
      results.push(entry);

      // Save screenshot
      const firstPage = page.locator('.smart-resume-page').first();
      if (await firstPage.count() > 0) {
        await firstPage.screenshot({ path: path.join(outDir, `${cvId}_forensic.png`), type: 'png' });
      }

      const splitIndicator = actualLayout.includes('TWO_COLUMN') ? '🟢 2-COL' : (actualLayout.includes('SINGLE') ? '🟡 1-COL' : '🔴 ???');
      const sidebarW = layout.sidebarRect ? `${layout.sidebarRect.width}px` : 'N/A';
      const mainW = layout.mainRect ? `${layout.mainRect.width}px` : 'N/A';
      console.log(`  ${splitIndicator} [${(i+1+'').padStart(2)}] ${cvId.padEnd(5)} | arch=${configuredArchetype.padEnd(18)} | sidebar=${sidebarW.padEnd(6)} | main=${mainW.padEnd(6)} | ${actualLayout}`);

    } catch (err) {
      results.push({
        id: cvId,
        configuredArchetype,
        name: theme?.name || 'UNKNOWN',
        error: err.message,
        actualLayout: 'ERROR',
      });
      console.log(`  🔴 [${(i+1+'').padStart(2)}] ${cvId.padEnd(5)} | ERROR: ${err.message.slice(0, 80)}`);
    } finally {
      await page.close();
    }
  }

  // Summary
  console.log('\n========================================================================');
  console.log('📊 FORENSIC SUMMARY');
  console.log('========================================================================\n');

  const modernSplitTemplates = results.filter(r => r.configuredArchetype === 'modern-split');
  const actuallyTwoCol = modernSplitTemplates.filter(r => r.actualLayout?.includes('TWO_COLUMN'));
  const modernSplitButSingleCol = modernSplitTemplates.filter(r => !r.actualLayout?.includes('TWO_COLUMN'));

  console.log(`MODERN_SPLIT configured: ${modernSplitTemplates.length}`);
  console.log(`  Actually 2-column in rendered DOM: ${actuallyTwoCol.length}`);
  actuallyTwoCol.forEach(r => console.log(`    ✅ ${r.id} (${r.name}) — sidebar ${r.sidebarRect?.width}px`));
  if (modernSplitButSingleCol.length > 0) {
    console.log(`  ⚠️ DEFECTS (configured modern-split but NOT 2-column):`);
    modernSplitButSingleCol.forEach(r => console.log(`    ❌ ${r.id} (${r.name}): ${r.actualLayout}`));
  }

  const bannerTemplates = results.filter(r => r.configuredArchetype === 'executive-banner');
  const bannerActuallyTwoCol = bannerTemplates.filter(r => r.actualLayout?.includes('TWO_COLUMN'));
  const bannerSingleCol = bannerTemplates.filter(r => !r.actualLayout?.includes('TWO_COLUMN'));
  console.log(`\nEXECUTIVE_BANNER configured: ${bannerTemplates.length}`);
  console.log(`  Actually 2-column below banner: ${bannerActuallyTwoCol.length}`);
  bannerActuallyTwoCol.forEach(r => console.log(`    ✅ ${r.id} (${r.name}) — sidebar ${r.sidebarRect?.width}px`));
  if (bannerSingleCol.length > 0) {
    bannerSingleCol.forEach(r => console.log(`    ⚠️ ${r.id} (${r.name}): ${r.actualLayout} (may be banner+single-col or banner+adaptive)`));
  }

  const atsTemplates = results.filter(r => r.configuredArchetype === 'minimal-ats');
  console.log(`\nMINIMAL_ATS configured: ${atsTemplates.length}`);
  atsTemplates.forEach(r => console.log(`    ${r.actualLayout?.includes('SINGLE') ? '✅' : '⚠️'} ${r.id} (${r.name}): ${r.actualLayout}`));

  const techGridTemplates = results.filter(r => r.configuredArchetype === 'tech-grid');
  console.log(`\nTECH_GRID configured: ${techGridTemplates.length}`);
  techGridTemplates.forEach(r => console.log(`    ${r.id} (${r.name}): ${r.actualLayout}`));

  const euroTemplates = results.filter(r => r.configuredArchetype === 'compact-euro');
  console.log(`\nCOMPACT_EURO configured: ${euroTemplates.length}`);
  euroTemplates.forEach(r => console.log(`    ${r.id} (${r.name}): ${r.actualLayout}`));

  console.log('\n--- Cv40 vs Cv51 DIRECT COMPARISON ---');
  const cv40 = results.find(r => r.id === 'Cv40');
  const cv51 = results.find(r => r.id === 'Cv51');
  console.log(`Cv40: arch=${cv40?.configuredArchetype}, rendered=${cv40?.actualLayout}, sidebar=${cv40?.sidebarRect ? cv40.sidebarRect.width + 'px' : 'none'}, bg=${cv40?.sidebarComputedBg || 'none'}`);
  console.log(`Cv51: arch=${cv51?.configuredArchetype}, rendered=${cv51?.actualLayout}, sidebar=${cv51?.sidebarRect ? cv51.sidebarRect.width + 'px' : 'none'}, bg=${cv51?.sidebarComputedBg || 'none'}`);
  console.log(`Identical layout? ${cv40?.actualLayout === cv51?.actualLayout && cv40?.configuredArchetype === cv51?.configuredArchetype}`);

  // Save full results as JSON
  const manifestPath = path.join(outDir, 'forensic_results.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Full results JSON: ${manifestPath}`);
  console.log(`📁 Screenshots: ${outDir}/`);

  await browser.close();
  server.close();
}

runForensicVerification().catch(console.error);
