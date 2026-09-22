#!/usr/bin/env node
/**
 * scripts/generate-brand-assets.mjs
 * Generates Microsoft 365 (MS365) Standard Fluent Design logos and favicons for IME365.
 *
 * Design Specifications:
 * - Style: Microsoft 365 Fluent Design (layered 3D depth, vibrant Azure/Cyan/Cobalt/Indigo palette, rounded squircle).
 * - Typography: Modern bold geometric sans-serif ("IME" in #0F172A, "365" in #0078D4 accent).
 * - Standard sizes: 320x72 horizontal logo, 512x512 square icon, 16..512 px touch/android/ms icons, and multi-resolution favicon.ico.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Multi-size ICO buffer builder
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // number of images

  let offset = 6 + count * 16;
  const entries = [];

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)]);
}

// 1. Horizontal Logo HTML Template (High-Impact MS365 Lockup, zero extraneous whitespace)
const horizontalLogoHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: transparent;
      padding: 10px;
      display: inline-block;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .logo-container {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      padding: 4px;
      line-height: 1;
    }
    .icon-svg {
      width: 92px;
      height: 92px;
      flex-shrink: 0;
      filter: drop-shadow(0 4px 12px rgba(0, 120, 212, 0.35));
    }
    .brand-title-row {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }
    .brand-ime {
      font-size: 82px;
      font-weight: 900;
      letter-spacing: -2px;
      color: #0f172a;
    }
    .brand-365 {
      font-size: 82px;
      font-weight: 900;
      letter-spacing: -1.5px;
      background: linear-gradient(135deg, #0078d4 0%, #00a4ef 50%, #005a9e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-left: 2px;
      filter: drop-shadow(0 2px 8px rgba(0, 120, 212, 0.25));
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0078d4, #004e8c);
      color: #ffffff;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 1.2px;
      padding: 6px 12px;
      border-radius: 8px;
      margin-left: 14px;
      text-transform: uppercase;
      box-shadow: 0 3px 8px rgba(0, 120, 212, 0.35);
    }
  </style>
</head>
<body>
  <div class="logo-container" id="logo">
    <svg class="icon-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0078d4" />
          <stop offset="60%" stop-color="#005a9e" />
          <stop offset="100%" stop-color="#004578" />
        </linearGradient>
        <linearGradient id="foldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00c7fd" />
          <stop offset="100%" stop-color="#0078d4" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.25" flood-color="#000" />
        </filter>
      </defs>

      <!-- MS365 Rounded Squircle Base (22% radius) -->
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#bgGrad)" />

      <!-- Top Specular Gloss Highlight -->
      <path d="M4 26C4 13.8497 13.8497 4 26 4H74C86.1503 4 96 13.8497 96 26V42C96 42 72 32 48 38C24 44 4 36 4 36V26Z" fill="#ffffff" fill-opacity="0.18" />

      <!-- Layered Fluent Fold Ribbon (Bottom-Right) -->
      <path d="M96 52V74C96 86.1503 86.1503 96 74 96H46L76 56L96 52Z" fill="url(#foldGrad)" opacity="0.95" />

      <!-- Fluent Diagonal Fold Shadow -->
      <path d="M46 96L76 56L66 50L36 96H46Z" fill="#000000" opacity="0.2" />

      <!-- Document Base Tile -->
      <g filter="url(#shadow)">
        <rect x="23" y="21" width="54" height="58" rx="8" fill="#ffffff" />
        
        <!-- Header accent band -->
        <path d="M23 27C23 23.6863 25.6863 21 29 21H71C74.3137 21 77 23.6863 77 27V33H23V27Z" fill="#0078d4" />
        
        <!-- Document Content Bars -->
        <rect x="30" y="40" width="40" height="4.5" rx="2.25" fill="#0078d4" />
        <rect x="30" y="48.5" width="34" height="4.5" rx="2.25" fill="#64748b" />
        <rect x="30" y="57" width="26" height="4.5" rx="2.25" fill="#cbd5e1" />
        
        <!-- AI Intelligence Spark / 365 Orb -->
        <circle cx="65" cy="63" r="7.5" fill="url(#foldGrad)" />
        <path d="M65 57.5L66.7 61.2L70.5 63L66.7 64.8L65 68.5L63.3 64.8L59.5 63L63.3 61.2L65 57.5Z" fill="#ffffff" />
      </g>
    </svg>

    <div class="brand-title-row">
      <span class="brand-ime">IME</span>
      <span class="brand-365">365</span>
      <span class="brand-badge">PRO</span>
    </div>
  </div>
</body>
</html>
`;

// 2. Square App Icon HTML Template (for App Icons, Favicons, Tiles)
function getSquareIconHtml(size) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${size}px;
      height: ${size}px;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sqBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0078d4" />
        <stop offset="60%" stop-color="#005a9e" />
        <stop offset="100%" stop-color="#004578" />
      </linearGradient>
      <linearGradient id="sqFoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00c7fd" />
        <stop offset="100%" stop-color="#0078d4" />
      </linearGradient>
      <filter id="sqShadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.25" flood-color="#000" />
      </filter>
    </defs>

    <!-- MS365 Rounded Squircle Base (22% radius) -->
    <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#sqBgGrad)" />

    <!-- Top Specular Gloss Highlight -->
    <path d="M4 26C4 13.8497 13.8497 4 26 4H74C86.1503 4 96 13.8497 96 26V42C96 42 72 32 48 38C24 44 4 36 4 36V26Z" fill="#ffffff" fill-opacity="0.18" />

    <!-- Layered Fluent Fold Ribbon (Bottom-Right) -->
    <path d="M96 52V74C96 86.1503 86.1503 96 74 96H46L76 56L96 52Z" fill="url(#sqFoldGrad)" opacity="0.9" />

    <!-- Fluent Diagonal Fold Shadow -->
    <path d="M46 96L76 56L66 50L36 96H46Z" fill="#000000" opacity="0.18" />

    <!-- Fluent Center Monogram / Document Geometry -->
    <g filter="url(#sqShadow)">
      <rect x="24" y="22" width="52" height="56" rx="8" fill="#ffffff" />
      
      <!-- Header accent band -->
      <path d="M24 28C24 24.6863 26.6863 22 30 22H70C73.3137 22 76 24.6863 76 28V33H24V28Z" fill="#0078d4" />
      
      <!-- Document Content Bars -->
      <rect x="31" y="40" width="38" height="4" rx="2" fill="#0078d4" />
      <rect x="31" y="48" width="32" height="4" rx="2" fill="#94a3b8" />
      <rect x="31" y="56" width="24" height="4" rx="2" fill="#cbd5e1" />
      
      <!-- AI Intelligence Spark / 365 Orb -->
      <circle cx="64" cy="62" r="7" fill="url(#sqFoldGrad)" />
      <path d="M64 57L65.5 60.5L69 62L65.5 63.5L64 67L62.5 63.5L59 62L62.5 60.5L64 57Z" fill="#ffffff" />
    </g>
  </svg>
</body>
</html>
`;
}

async function run() {
  console.log('🚀 Generating Microsoft 365 Standard Brand Assets for IME365...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // 1. Generate Horizontal Logo (tight bounding box around element)
  await page.setContent(horizontalLogoHtml);
  const logoElem = await page.$('#logo');
  const logoBuffer = await logoElem.screenshot({ omitBackground: true });
  
  // Save Horizontal Logo to all standard locations
  const logoPaths = [
    path.join(ROOT, 'src/assets/logo/logo.png'),
    path.join(ROOT, 'public/logo/logo.png'),
    path.join(ROOT, 'public/logo.png'),
  ];
  for (const lp of logoPaths) {
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, logoBuffer);
    console.log(`  ✓ Written logo: ${path.relative(ROOT, lp)} (${logoBuffer.length} bytes)`);
  }

  // 2. Generate Square Icon / Favicon Resolutions
  const squareSizes = [
    // Favicons
    { size: 16, dest: ['public/favicon-16x16.png'] },
    { size: 32, dest: ['public/favicon-32x32.png'] },
    { size: 96, dest: ['public/favicon-96x96.png'] },
    // Apple Touch Icons
    { size: 57, dest: ['public/apple-icon-57x57.png'] },
    { size: 60, dest: ['public/apple-icon-60x60.png'] },
    { size: 72, dest: ['public/apple-icon-72x72.png'] },
    { size: 76, dest: ['public/apple-icon-76x76.png'] },
    { size: 114, dest: ['public/apple-icon-114x114.png'] },
    { size: 120, dest: ['public/apple-icon-120x120.png'] },
    { size: 144, dest: ['public/apple-icon-144x144.png', 'public/ms-icon-144x144.png', 'public/android-icon-144x144.png'] },
    { size: 150, dest: ['public/ms-icon-150x150.png'] },
    { size: 152, dest: ['public/apple-icon-152x152.png'] },
    { size: 180, dest: ['public/apple-icon-180x180.png', 'public/apple-icon.png', 'public/apple-icon-precomposed.png'] },
    // Android PWA Icons
    { size: 36, dest: ['public/android-icon-36x36.png'] },
    { size: 48, dest: ['public/android-icon-48x48.png'] },
    { size: 70, dest: ['public/ms-icon-70x70.png'] },
    { size: 192, dest: ['public/android-icon-192x192.png'] },
    { size: 310, dest: ['public/ms-icon-310x310.png'] },
    { size: 512, dest: ['public/android-icon-512x512.png', 'public/logo/logo-01.png', 'public/logo/logo-original.png'] },
  ];

  const icoFrames = [];

  for (const { size, dest } of squareSizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(getSquareIconHtml(size));
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    
    if ([16, 32, 48].includes(size)) {
      icoFrames.push({ size, buffer: buf });
    }

    for (const d of dest) {
      const fullPath = path.join(ROOT, d);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, buf);
    }
    console.log(`  ✓ Rendered size ${size}x${size} -> ${dest.join(', ')}`);
  }

  // Also render a 48x48 frame specifically for ICO if not already rendered
  if (!icoFrames.some(f => f.size === 48)) {
    await page.setViewportSize({ width: 48, height: 48 });
    await page.setContent(getSquareIconHtml(48));
    const buf48 = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 48, height: 48 } });
    icoFrames.push({ size: 48, buffer: buf48 });
  }

  // 3. Generate multi-resolution favicon.ico
  const icoBuffer = createIco(icoFrames);
  fs.writeFileSync(path.join(ROOT, 'public/favicon.ico'), icoBuffer);
  console.log(`  ✓ Built multi-res favicon.ico (${icoBuffer.length} bytes, frames: ${icoFrames.map(f => f.size).join(', ')})`);

  await browser.close();
  console.log('✨ All MS365-standard brand assets generated successfully!\n');
}

run().catch(err => {
  console.error('Failed generating brand assets:', err);
  process.exit(1);
});
