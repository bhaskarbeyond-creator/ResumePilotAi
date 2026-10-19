#!/usr/bin/env node
/**
 * DIR-008 — template evidence generator.
 *
 * Produces, from the same typed layout spec the renderer consumes:
 *   1. `docs/templates/wireframes/CvNN.svg` — a structural page-one proof for
 *      every catalog template (no colours-only differences: the geometry is the
 *      spec's header, rail, reading order, density and title treatment);
 *   2. `frontend/public/templates/Cv52.JPG` … `Cv100.JPG` — thumbnails for the
 *      catalog entries that shipped without an asset;
 *   3. `docs/templates/dir008-contact-sheet.jpg` — a 10×10 labelled sheet
 *      covering all 100 templates;
 *   4. `docs/templates/dir008-template-inventory.json` — machine-readable row
 *      per template (id, name, family, rail, order, fingerprint, thumbnail,
 *      thumbnail origin) plus a DOM-derived structure read back from the
 *      server-rendered React output;
 *   5. `docs/templates/evidence/CvNN.html` — the actual server-rendered page-one
 *      markup of the production document component for that template, kept as
 *      the audit trail behind every structural claim.
 *
 * These are *spec-derived layout proofs*, not browser screenshots. Browser
 * screenshots are recorded as BLOCKED in the DIR-008 audit; this script never
 * labels a wireframe as a rendered screenshot.
 *
 * Usage:
 *   node scripts/dir008-generate-template-evidence.mjs [--force]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const PUBLIC_TEMPLATES = path.join(FRONTEND, 'public', 'templates');
const WIREFRAME_DIR = path.join(ROOT, 'docs', 'templates', 'wireframes');
const CONTACT_SHEET = path.join(ROOT, 'docs', 'templates', 'dir008-contact-sheet.jpg');
const INVENTORY = path.join(ROOT, 'docs', 'templates', 'dir008-template-inventory.json');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'templates', 'evidence');
const INVENTORY_MD = path.join(ROOT, 'docs', 'templates', 'DIR-008-template-inventory.md');
const frontendRequire = createRequire(path.join(FRONTEND, 'package.json'));
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');

// DOMPurify (used by the production renderer) needs a DOM window before the
// component module is imported.
const renderDom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
globalThis.window = renderDom.window;
globalThis.document = renderDom.window.document;
globalThis.localStorage = renderDom.window.localStorage;
globalThis.sessionStorage = renderDom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: renderDom.window.navigator, configurable: true });
globalThis.HTMLElement = renderDom.window.HTMLElement;
globalThis.Image = renderDom.window.Image;
const FORCE = process.argv.includes('--force');

const W = 480;
const H = 640;
const PAD = 26;
const FONT = "'Inter','Helvetica Neue',Arial,sans-serif";

const palette = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#94a3b8',
  line: '#e2e8f0',
  paper: '#ffffff',
  tint: '#f1f5f9',
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lines(x, y, width, count, { gap = 9, height = 3.2, color = palette.line, inset = 0, lastRatio = 0.62 } = {}) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const w = index === count - 1 ? width * lastRatio : width - (index % 3) * 6;
    parts.push(`<rect x="${x + inset}" y="${y + index * gap}" width="${Math.max(10, w)}" height="${height}" rx="1.6" fill="${color}"/>`);
  }
  return parts.join('');
}

function heading(x, y, width, style, accent, label) {
  const text = `<text x="${x}" y="${y}" font-family="${FONT}" font-size="7.5" font-weight="700" letter-spacing="1.4" fill="${accent}">${escapeXml(label.toUpperCase())}</text>`;
  switch (style) {
    case 'pill':
      return `<rect x="${x - 4}" y="${y - 9}" width="${Math.min(width, 118)}" height="13" rx="6.5" fill="${accent}"/>` +
        `<text x="${x}" y="${y}" font-family="${FONT}" font-size="6.8" font-weight="700" letter-spacing="1.2" fill="#ffffff">${escapeXml(label.toUpperCase())}</text>`;
    case 'bar':
      return `<rect x="${x}" y="${y - 8}" width="3" height="10" fill="${accent}"/>` + text.replace(`x="${x}"`, `x="${x + 8}"`) +
        `<rect x="${x + 8}" y="${y + 3}" width="${width}" height="1" fill="${palette.line}"/>`;
    case 'underline':
      return text + `<rect x="${x}" y="${y + 3}" width="${width}" height="1.4" fill="${accent}"/>`;
    case 'double':
      return text + `<rect x="${x}" y="${y + 3}" width="${width}" height="1" fill="${accent}"/><rect x="${x}" y="${y + 6}" width="${width}" height="1" fill="${accent}"/>`;
    case 'bracket':
      return `${text.replace(`>${escapeXml(label.toUpperCase())}<`, `>[ ${escapeXml(label.toUpperCase())} ]<`)}` +
        `<rect x="${x}" y="${y + 3}" width="${width}" height="1" fill="${palette.line}"/>`;
    case 'micro':
      return `<rect x="${x}" y="${y - 3}" width="${width * 0.42}" height="1" fill="${palette.line}"/>` + text.replace(`x="${x}"`, `x="${x + width * 0.45}"`) +
        `<rect x="${x + width * 0.82}" y="${y - 3}" width="${width * 0.18}" height="1" fill="${palette.line}"/>`;
    case 'plain':
      return text;
    default:
      return text + `<rect x="${x}" y="${y + 3}" width="${width}" height="1" fill="${palette.line}"/>`;
  }
}

function blockForSection(section, x, y, width, spec, accent, secondary) {
  const label = section;
  const style = spec.titleStyle;
  const density = spec.density;
  const gap = density === 'compact' ? 8 : density === 'spacious' ? 12 : 10;
  const bodyLines = section === 'summary' ? 4 : section === 'experience' ? 6 : 3;
  const height = 14 + gap + bodyLines * 6;
  const parts = [heading(x, y, width, style, accent, label)];

  if (section === 'skills') {
    const columns = spec.aside ? 2 : 4;
    const chipW = (width - (columns - 1) * 4) / columns;
    for (let index = 0; index < columns * 2; index += 1) {
      const cx = x + (index % columns) * (chipW + 4);
      const cy = y + 8 + Math.floor(index / columns) * 9;
      parts.push(`<rect x="${cx}" y="${cy}" width="${chipW}" height="5" rx="2.5" fill="${accent}" opacity="${index % 2 ? 0.22 : 0.4}"/>`);
    }
  } else if (section === 'languages' || section === 'certifications' || section === 'achievements' || section === 'hobbies' || section === 'references' || section === 'education' || section === 'projects') {
    if (section === 'projects' && spec.family === 'portfolio') {
      parts.push(`<rect x="${x}" y="${y + 8}" width="${width / 2 - 5}" height="${height - 14}" fill="${palette.tint}"/>`);
      parts.push(`<rect x="${x + width / 2 + 5}" y="${y + 8}" width="${width / 2 - 5}" height="${height - 14}" fill="${palette.tint}"/>`);
      parts.push(lines(x + 4, y + 14, width / 2 - 13, 2, { color: palette.muted }));
      parts.push(lines(x + width / 2 + 9, y + 14, width / 2 - 13, 2, { color: palette.muted }));
    } else {
      parts.push(lines(x, y + 7, width * 0.82, bodyLines, { gap: 6.4, color: palette.line }));
      if (spec.family === 'timeline') {
        parts.push(`<rect x="${x + width - 2}" y="${y + 6}" width="1.4" height="${height - 14}" fill="${accent}" opacity="0.5"/>`);
        for (let index = 0; index < bodyLines; index += 1) {
          parts.push(`<circle cx="${x + width - 1.3}" cy="${y + 9 + index * 6.4}" r="1.8" fill="${accent}"/>`);
        }
      }
    }
  } else if (section === 'experience') {
    for (let index = 0; index < 2; index += 1) {
      const rowY = y + 8 + index * (bodyLines * 6.4);
      if (spec.titleStyle === 'bar' || spec.family === 'technical') {
        parts.push(`<rect x="${x}" y="${rowY}" width="1.6" height="${bodyLines * 6.4 - 4}" fill="${secondary}" opacity="0.5"/>`);
      }
      parts.push(lines(x + (spec.titleStyle === 'bar' ? 6 : 0), rowY, width * 0.7, 3, { gap: 6, color: palette.ink }));
      parts.push(lines(x + (spec.titleStyle === 'bar' ? 6 : 0), rowY + 18, width * 0.92, bodyLines - 3, { gap: 6, color: palette.line }));
    }
  } else {
    parts.push(lines(x, y + 8, width, bodyLines, { gap: 6.4, color: palette.body }));
  }
  return { svg: parts.join(''), height };
}

function renderWireframe(spec, meta) {
  const accent = meta.primary;
  const secondary = meta.secondary;
  const railWidth = spec.aside ? Math.round((W - PAD * 2) * (spec.asideWidth / 100)) : 0;
  const contentX = PAD + (spec.aside === 'left' ? railWidth : 0);
  const contentW = W - PAD * 2 - railWidth;
  const parts = [];

  parts.push(`<rect width="${W}" height="${H}" fill="${palette.paper}"/>`);
  if (spec.accentBar) parts.push(`<rect x="0" y="0" width="7" height="${H}" fill="${accent}"/>`);

  // Identity block geometry by header treatment.
  const headerH = ['banner', 'photo-band', 'band', 'cv34'].includes(spec.header) ? 118 : ['centered', 'letterhead', 'academic'].includes(spec.header) ? 104 : 88;
  const isDarkHeader = ['banner', 'photo-band', 'band', 'cv34'].includes(spec.header);
  if (isDarkHeader) {
    parts.push(`<rect x="0" y="0" width="${W}" height="${headerH}" fill="${accent}"/>`);
    if (spec.header === 'photo-band' || spec.header === 'cv34' || spec.header === 'banner') {
      parts.push(`<circle cx="${W - PAD - 26}" cy="${headerH / 2}" r="26" fill="#ffffff" opacity="0.25"/>`);
    }
  } else if (spec.header === 'centered' || spec.header === 'letterhead' || spec.header === 'academic' || spec.header === 'cv4') {
    parts.push(`<rect x="${PAD + 40}" y="22" width="${W - (PAD + 40) * 2}" height="9" rx="1" fill="${palette.ink}"/>`);
    parts.push(`<rect x="${W / 2 - 55}" y="38" width="110" height="3" fill="${accent}"/>`);
    parts.push(`<rect x="${PAD + 60}" y="48" width="${W - (PAD + 60) * 2}" height="2.5" fill="${palette.line}"/>`);
    if (spec.header === 'letterhead') parts.push(`<rect x="0" y="${headerH - 2}" width="${W}" height="2" fill="${accent}"/>`);
  } else if (spec.header === 'bracket') {
    parts.push(`<rect x="${PAD}" y="18" width="4" height="${headerH - 36}" fill="${accent}"/>`);
    parts.push(`<rect x="${W - PAD - 4}" y="18" width="4" height="${headerH - 36}" fill="${accent}"/>`);
    parts.push(`<rect x="${PAD + 16}" y="30" width="180" height="9" rx="1" fill="${palette.ink}"/>`);
    parts.push(`<rect x="${PAD + 16}" y="46" width="120" height="3" fill="${accent}"/>`);
    parts.push(`<rect x="${PAD + 16}" y="58" width="240" height="2.5" fill="${palette.line}"/>`);
  } else if (spec.header === 'split') {
    parts.push(`<rect x="0" y="0" width="${W * 0.58}" height="${headerH}" fill="${palette.paper}"/>`);
    parts.push(`<rect x="${W * 0.58}" y="0" width="${W * 0.42}" height="${headerH}" fill="${palette.tint}"/>`);
    parts.push(`<rect x="${PAD}" y="28" width="170" height="10" rx="1" fill="${palette.ink}"/>`);
    parts.push(`<rect x="${PAD}" y="46" width="110" height="3" fill="${accent}"/>`);
    parts.push(lines(W * 0.58 + 14, 30, W * 0.3, 4, { gap: 7, color: palette.muted }));
  } else if (spec.header === 'monogram' || spec.header === 'cv1') {
    parts.push(`<circle cx="${PAD + 24}" cy="44" r="24" fill="${accent}"/>`);
    parts.push(`<rect x="${PAD + 60}" y="28" width="170" height="9" rx="1" fill="${palette.ink}"/>`);
    parts.push(`<rect x="${PAD + 60}" y="44" width="110" height="3" fill="${accent}"/>`);
    parts.push(lines(PAD + 60, 54, 210, 2, { gap: 7, color: palette.muted }));
  } else if (spec.header === 'grid') {
    parts.push(`<rect x="${PAD}" y="22" width="48" height="48" rx="3" fill="${palette.tint}"/>`);
    parts.push(`<rect x="${PAD + 60}" y="26" width="160" height="9" rx="1" fill="${palette.ink}"/>`);
    parts.push(lines(PAD + 60, 42, 150, 2, { gap: 7, color: palette.muted }));
    parts.push(lines(W - PAD - 120, 26, 120, 4, { gap: 6, color: palette.muted }));
  } else {
    // left / minimal / cv25
    parts.push(`<rect x="${PAD}" y="26" width="190" height="10" rx="1" fill="${palette.ink}"/>`);
    parts.push(`<rect x="${PAD}" y="44" width="120" height="3" fill="${accent}"/>`);
    parts.push(lines(PAD, 54, 250, 2, { gap: 7, color: palette.muted }));
    if (spec.photoShape !== 'none') parts.push(`<rect x="${W - PAD - 42}" y="22" width="42" height="42" rx="${spec.photoShape === 'circle' ? 21 : 4}" fill="${palette.tint}"/>`);
    parts.push(`<rect x="${PAD}" y="${headerH - 2}" width="${W - PAD * 2}" height="1.4" fill="${palette.line}"/>`);
  }

  // Rail geometry (both sides supported).
  if (spec.aside) {
    const rx = spec.aside === 'left' ? 0 : W - railWidth;
    parts.push(`<rect x="${rx}" y="${headerH}" width="${railWidth}" height="${H - headerH}" fill="${spec.aside === 'left' ? palette.ink : palette.tint}"/>`);
    if (spec.aside === 'left') {
      parts.push(`<circle cx="${railWidth / 2}" cy="${headerH + 38}" r="24" fill="#ffffff" opacity="0.2"/>`);
      parts.push(`<rect x="${14}" y="${headerH + 74}" width="${railWidth - 28}" height="8" fill="#ffffff" opacity="0.85"/>`);
      let y = headerH + 96;
      for (const section of spec.asideSections) {
        parts.push(`<text x="14" y="${y}" font-family="${FONT}" font-size="6" font-weight="700" letter-spacing="1" fill="#ffffff" opacity="0.55">${escapeXml(section.toUpperCase())}</text>`);
        parts.push(lines(14, y + 6, railWidth - 28, 3, { gap: 6, color: '#ffffff' }));
        parts.push(`<rect x="14" y="${y + 28}" width="${railWidth - 28}" height="0.8" fill="#ffffff" opacity="0.2"/>`);
        y += 42;
        if (y > H - 40) break;
      }
    } else {
      parts.push(`<text x="${rx + 14}" y="${headerH + 24}" font-family="${FONT}" font-size="6" font-weight="700" letter-spacing="1" fill="${palette.ink}" opacity="0.5">CONTACT</text>`);
      parts.push(lines(rx + 14, headerH + 30, railWidth - 28, 4, { gap: 7, color: palette.muted }));
      let y = headerH + 66;
      for (const section of spec.asideSections.filter((key) => key !== 'contact')) {
        parts.push(`<text x="${rx + 14}" y="${y}" font-family="${FONT}" font-size="6" font-weight="700" letter-spacing="1" fill="${palette.ink}" opacity="0.5">${escapeXml(section.toUpperCase())}</text>`);
        parts.push(lines(rx + 14, y + 7, railWidth - 28, 3, { gap: 6, color: palette.muted }));
        y += 40;
        if (y > H - 40) break;
      }
    }
  }

  // Main reading order.
  const twoColumnFlow = ['banner', 'magazine', 'editorial'].includes(spec.family);
  let y = headerH + 20;
  const columns = twoColumnFlow ? 2 : 1;
  const columnWidth = twoColumnFlow ? (contentW - 16) / 2 : contentW;
  let column = 0;
  for (const section of spec.mainOrder) {
    if (y > H - 90) break;
    const x = contentX + column * (columnWidth + 16);
    const rendered = blockForSection(section, x, y, columnWidth, spec, accent, secondary);
    parts.push(rendered.svg);
    y += rendered.height + (spec.density === 'compact' ? 8 : 12);
    if (twoColumnFlow && y > headerH + 190) {
      column = Math.min(columns - 1, column + 1);
      y = headerH + 20;
    }
  }

  // Page furniture.
  parts.push(`<rect x="0" y="${H - 26}" width="${W}" height="26" fill="${palette.tint}"/>`);
  parts.push(`<text x="${PAD}" y="${H - 10}" font-family="${FONT}" font-size="7" font-weight="600" fill="${palette.muted}">${escapeXml(meta.id)} · ${escapeXml(meta.name)}</text>`);
  parts.push(`<text x="${W - PAD}" y="${H - 10}" text-anchor="end" font-family="${FONT}" font-size="7" font-weight="600" fill="${palette.muted}">${escapeXml(spec.family)} · page 1</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`;
}

const EVIDENCE_RESUME = {
  heading: {
    firstName: 'Asha', lastName: 'Rao', title: 'Principal Platform Engineer',
    email: 'asha.rao@example.com', phone: '+91 90000 00000', location: 'Vijayawada, India',
    linkedin: 'linkedin.com/in/asharao', github: 'github.com/asharao', website: 'asharao.dev',
    photo: '', showPhoto: false,
  },
  summary: '<p>Platform engineer focused on reliability and developer experience.</p>',
  experience: [
    { id: 'e1', position: 'Principal Engineer', company: 'Meridian Bank', location: 'Hyderabad', startDate: '2021', endDate: 'Present', description: '<p>Led a 40-person platform migration to a zero-trust mesh.</p>' },
    { id: 'e2', position: 'Senior Engineer', company: 'Lumen Labs', location: 'Remote', startDate: '2017', endDate: '2021', description: '<p>Built the billing pipeline.</p>' },
  ],
  education: [{ id: 'ed1', degree: 'B.Tech', field: 'Computer Science', institution: 'IIT Madras', startDate: '2011', endDate: '2015', gpa: '8.7' }],
  skillCategories: [
    { id: 'c1', category: 'Platform', skills: [{ name: 'Kubernetes', rating: 5 }, { name: 'Go', rating: 4 }] },
    { id: 'c2', category: 'Data', skills: ['PostgreSQL', 'Kafka'] },
  ],
  certifications: [{ id: 'cert1', name: 'CKA', issuer: 'CNCF', date: '2022' }],
  languages: [{ id: 'l1', name: 'English', proficiency: 'Fluent' }, { id: 'l2', name: 'తెలుగు', proficiency: 'Native' }],
  projects: [{ id: 'p1', title: 'ResumePilot', technologies: 'React, Node', description: '<p>Analytics toolkit.</p>' }],
  achievements: [{ id: 'a1', title: 'Excellence Award', description: 'Zero-downtime migration.' }],
  hobbies: ['Chess', 'Cycling'],
  references: [{ id: 'r1', name: 'Priya Nair', position: 'VP Engineering', company: 'Meridian', email: 'priya@example.com' }],
};

/**
 * Reads the structure back out of the real server-rendered markup, so the
 * inventory describes what the component produced rather than what the spec
 * intended.
 */
function extractRenderedStructure(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const { document } = dom.window;
  const sheets = [...document.querySelectorAll('[data-page-number]')];
  const first = sheets[0];
  const rail = first?.querySelector('[data-layout-rail]') || null;
  const mainFlow = first ? [...first.querySelectorAll('.flow-item h2')].map((node) => node.textContent.trim()) : [];
  const text = first ? first.textContent.replace(/\s+/g, ' ').trim() : '';
  dom.window.close();
  return {
    pages: sheets.length,
    hasRail: Boolean(rail),
    railFamily: rail?.getAttribute('data-layout-rail') || null,
    mainSectionHeadings: mainFlow,
    firstPageCharacters: text.length,
    htmlSha256: crypto.createHash('sha256').update(html).digest('hex'),
    htmlBytes: Buffer.byteLength(html, 'utf8'),
  };
}

async function main() {
  await fs.mkdir(WIREFRAME_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_TEMPLATES, { recursive: true });
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });

  const vite = await createServer({
    root: FRONTEND,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  let specs;
  let catalog;
  let Document;
  try {
    specs = (await vite.ssrLoadModule('/src/lib/template-layouts.ts')).LAYOUT_SPECS;
    catalog = (await vite.ssrLoadModule('/src/lib/template-catalog.ts')).TEMPLATES;
    Document = (await vite.ssrLoadModule('/src/components/resume/smart-resume-document.tsx')).SmartResumeDocument;
  } finally {
    await vite.close();
  }

  const metaById = new Map(catalog.map((entry) => [entry.id, entry]));
  const rows = [];
  const thumbnails = [];

  for (const spec of specs) {
    const meta = metaById.get(spec.id);
    if (!meta) throw new Error(`Catalog entry missing for ${spec.id}`);
    const svg = renderWireframe(spec, meta);
    await fs.writeFile(path.join(WIREFRAME_DIR, `${spec.id}.svg`), svg, 'utf8');

    const thumbPath = path.join(PUBLIC_TEMPLATES, `${spec.id}.JPG`);
    const isLegacyAsset = Number.parseInt(spec.id.replace('Cv', ''), 10) <= 51;
    // Non-legacy thumbnails are always spec-derived; a `--force` rebuild does
    // not change their provenance, it only rewrites the pixels.
    const origin = isLegacyAsset ? 'legacy-artifact' : 'generated-from-spec';
    let exists = true;
    try {
      await fs.access(thumbPath);
    } catch {
      exists = false;
    }
    const regenerated = !isLegacyAsset && exists && FORCE;
    if (!exists || (FORCE && !isLegacyAsset)) {
      await sharp(Buffer.from(svg)).resize(W, H).jpeg({ quality: 88, mozjpeg: true }).toFile(thumbPath);
    }
    const thumbBuffer = await fs.readFile(thumbPath);
    thumbnails.push({ id: spec.id, buffer: thumbBuffer });

    const html = renderToStaticMarkup(React.createElement(Document, { resume: EVIDENCE_RESUME, meta, isPrint: true }));
    await fs.writeFile(path.join(EVIDENCE_DIR, `${spec.id}.html`), html, 'utf8');
    const structure = extractRenderedStructure(html);

    rows.push({
      id: spec.id,
      name: spec.name,
      family: spec.family,
      header: spec.header,
      aside: spec.aside,
      asideWidth: spec.asideWidth,
      asideSections: spec.asideSections,
      mainOrder: spec.mainOrder,
      titleStyle: spec.titleStyle,
      photoShape: spec.photoShape,
      density: spec.density,
      nameScale: spec.nameScale,
      contactLayout: spec.contactLayout,
      accentBar: spec.accentBar,
      fingerprint: spec.fingerprint,
      thumbnail: `/templates/${spec.id}.JPG`,
      thumbnailOrigin: origin,
      thumbnailRegenerated: regenerated,
      wireframe: `docs/templates/wireframes/${spec.id}.svg`,
      evidenceHtml: `docs/templates/evidence/${spec.id}.html`,
      rendered: structure,
      renderedScreenshot: null,
      screenshotStatus: 'BLOCKED: no browser binary available in the sandbox',
    });
  }

  // Contact sheet: 10 × 10 labelled cells.
  const CELL_W = 180;
  const CELL_H = 232;
  const LABEL_H = 30;
  const COLS = 10;
  const ROWS = 10;
  const sheetW = COLS * CELL_W;
  const sheetH = ROWS * CELL_H + 70;
  const cells = thumbnails.map((item, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = col * CELL_W + 8;
    const y = row * CELL_H + 60;
    return `<image x="${x}" y="${y}" width="${CELL_W - 16}" height="${CELL_H - LABEL_H - 8}" href="data:image/jpeg;base64,${item.buffer.toString('base64')}"/>` +
      `<rect x="${x}" y="${y}" width="${CELL_W - 16}" height="${CELL_H - LABEL_H - 8}" fill="none" stroke="#cbd5e1"/>` +
      `<text x="${x + 2}" y="${y + CELL_H - LABEL_H - 12}" font-family="${FONT}" font-size="11" font-weight="700" fill="#0f172a">${escapeXml(item.id)}</text>` +
      `<text x="${x + 2}" y="${y + CELL_H - LABEL_H + 2}" font-family="${FONT}" font-size="8.5" fill="#64748b">${escapeXml(specs[index].family)}</text>`;
  });
  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sheetW}" height="${sheetH}">` +
    `<rect width="${sheetW}" height="${sheetH}" fill="#ffffff"/>` +
    `<text x="16" y="30" font-family="${FONT}" font-size="18" font-weight="800" fill="#0f172a">DIR-008 · 100 CV templates — spec-derived layout proofs</text>` +
    `<text x="16" y="47" font-family="${FONT}" font-size="10" fill="#64748b">Wireframes are generated from the same typed layout spec the app renders. They are not browser screenshots (browser capture: BLOCKED).</text>` +
    cells.join('') +
    `</svg>`;
  await sharp(Buffer.from(sheetSvg)).jpeg({ quality: 84, mozjpeg: true }).toFile(CONTACT_SHEET);

  await fs.writeFile(INVENTORY, JSON.stringify({
    generatedAt: new Date().toISOString(),
    kind: 'spec-derived-layout-proof',
    note: 'Rendered app screenshots are BLOCKED in this environment (no browser binary). These rows describe the exact geometry consumed by the renderer.',
    total: rows.length,
    families: rows.reduce((acc, row) => ({ ...acc, [row.family]: (acc[row.family] || 0) + 1 }), {}),
    rows,
  }, null, 2) + '\n');

  const familyCounts = rows.reduce((acc, row) => ({ ...acc, [row.family]: (acc[row.family] || 0) + 1 }), {});
  const markdown = [
    '# DIR-008 — Template inventory (100 CV templates)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Every catalog entry maps to an explicit typed layout spec (family, identity block, rail,',
    'reading order, title treatment, density). The inventory below is generated from the same',
    'spec the React renderer consumes, and each row links to its structural proof and its',
    'server-rendered HTML evidence.',
    '',
    'Browser screenshots are **BLOCKED** in this environment (no browser binary); the wireframes',
    'and the `evidence/*.html` files are structural proofs, not screenshots, and are labelled as such.',
    '',
    `- Templates: **${rows.length}**`,
    `- Page families in use: **${Object.keys(familyCounts).length}**`,
    `- Templates with a physical side rail: **${rows.filter((row) => row.aside).length}**`,
    `- Legacy thumbnails (Cv1–Cv51): **${rows.filter((row) => row.thumbnailOrigin === 'legacy-artifact').length}**`,
    `- Spec-generated thumbnails (Cv52–Cv100): **${rows.filter((row) => row.thumbnailOrigin === 'generated-from-spec').length}**`,
    '',
    '## Family distribution',
    '',
    '| Family | Templates |',
    '| --- | ---: |',
    ...Object.entries(familyCounts).sort((a, b) => b[1] - a[1]).map(([family, count]) => `| ${family} | ${count} |`),
    '',
    '## Per-template inventory',
    '',
    '| ID | Name | Family | Header | Rail | Reading order | Title | Density | Thumbnail | Rendered pages |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |',
    ...rows.map((row) => `| ${row.id} | ${row.name} | ${row.family} | ${row.header} | ${
      row.aside ? `${row.aside} (${row.asideWidth}%)` : '—'
    } | ${row.mainOrder.join(' → ')} | ${row.titleStyle} | ${row.density} | \`${row.thumbnail}\` (${row.thumbnailOrigin}) | ${row.rendered.pages} |`),
    '',
    '## Evidence files',
    '',
    '- `docs/templates/wireframes/CvNN.svg` — structural page-one proof derived from the spec.',
    '- `docs/templates/evidence/CvNN.html` — server-rendered markup of the production document.',
    '- `docs/templates/dir008-contact-sheet.jpg` — 10×10 sheet covering all 100 templates.',
    '- `docs/templates/dir008-template-inventory.json` — machine-readable rows + DOM-derived structure.',
    '',
    'Regenerate with `node scripts/dir008-generate-template-evidence.mjs`.',
    '',
  ].join('\n');
  await fs.writeFile(INVENTORY_MD, markdown, 'utf8');

  const generated = rows.filter((row) => row.thumbnailOrigin === 'generated-from-spec').length;
  console.log(JSON.stringify({
    templates: rows.length,
    families: new Set(rows.map((row) => row.family)).size,
    thumbnailsGenerated: generated,
    wireframes: WIREFRAME_DIR,
    evidenceHtml: EVIDENCE_DIR,
    contactSheet: CONTACT_SHEET,
    inventory: INVENTORY,
    markdown: INVENTORY_MD,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
