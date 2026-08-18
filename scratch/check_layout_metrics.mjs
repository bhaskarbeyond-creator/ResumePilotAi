import { chromium } from 'playwright';
import path from 'path';

async function checkLayout() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file:///${path.resolve('scratch/test_pdf_split.html').replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

  const layoutInfo = await page.evaluate(() => {
    const pageEl = document.querySelector('.smart-resume-page');
    const layoutEl = document.querySelector('.smart-layout');
    const sidebarEl = document.querySelector('.smart-sidebar');
    const mainEl = document.querySelector('.smart-main-content');
    const heroEl = document.querySelector('.smart-split-hero');
    const bottomEl = document.querySelector('.smart-fullwidth-bottom-flow');

    return {
      pageClass: pageEl?.className,
      layoutClass: layoutEl?.className,
      hasHero: Boolean(heroEl),
      heroDisplay: heroEl ? window.getComputedStyle(heroEl).display : null,
      sidebarWidth: sidebarEl ? window.getComputedStyle(sidebarEl).width : null,
      sidebarBg: sidebarEl ? window.getComputedStyle(sidebarEl).backgroundColor : null,
      mainWidth: mainEl ? window.getComputedStyle(mainEl).width : null,
      hasBottom: Boolean(bottomEl),
      bottomHeight: bottomEl ? window.getComputedStyle(bottomEl).height : null,
    };
  });

  console.log('Layout Info:', JSON.stringify(layoutInfo, null, 2));
  await browser.close();
}

checkLayout().catch(console.error);
