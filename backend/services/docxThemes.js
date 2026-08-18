/**
 * Authoritative DOCX theme registry.
 *
 * This is a Word-safe port of src/engine/hybrid/themePresets.js — the same
 * source the PDF / SmartResumeComposer pipeline uses. Colors are stored as
 * 6-digit hex without '#'. Gradients are reduced to their first solid stop
 * because Word cannot paint CSS linear-gradients.
 *
 * Do not invent template colors here. A forensic test compares this file
 * against themePresets.js and fails on drift.
 */

const ARCHETYPES = Object.freeze({
  MODERN_SPLIT: 'modern-split',
  EXECUTIVE_BANNER: 'executive-banner',
  MINIMAL_ATS: 'minimal-ats',
  TECH_GRID: 'tech-grid',
  COMPACT_EURO: 'compact-euro',
});

const SKILL_VARIANTS = Object.freeze({
  PILLS: 'pills',
  BADGES: 'badges',
  BARS: 'bars',
  DOTS: 'dots',
  INLINE: 'inline',
});

const HEX = /^[0-9A-Fa-f]{6}$/;

function extractHex(value, fallback = '1E3A8A') {
  const raw = String(value ?? '').trim();
  const hash = raw.match(/#([0-9A-Fa-f]{6})\b/);
  if (hash) return hash[1].toUpperCase();
  const bare = raw.match(/^([0-9A-Fa-f]{6})$/);
  if (bare) return bare[1].toUpperCase();
  return String(fallback).replace('#', '').toUpperCase();
}

function sanitizeColorMap(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const key of ['primary', 'secondary', 'sidebarBg', 'sidebarText', 'headerBg', 'headerText']) {
    if (input[key] == null) continue;
    const hex = extractHex(input[key], '');
    if (HEX.test(hex)) out[key] = hex;
  }
  return Object.keys(out).length ? out : null;
}

function wordFont(cssFont) {
  const font = String(cssFont || '').toLowerCase();
  if (font.includes('merriweather') || font.includes('georgia')) return 'Georgia';
  if (font.includes('consolas') || font.includes('mono')) return 'Consolas';
  if (font.includes('arial')) return 'Arial';
  if (font.includes('times')) return 'Times New Roman';
  return 'Calibri';
}

function parseSidebarWidth(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  const n = match ? Number(match[1]) : 34;
  return Number.isFinite(n) ? Math.min(42, Math.max(28, n)) : 34;
}

function isDarkHex(hex) {
  const h = extractHex(hex, 'FFFFFF');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
}

function theme(spec) {
  const primary = extractHex(spec.primary, '1E3A8A');
  const secondary = extractHex(spec.secondary, primary);
  const sidebarBg = spec.sidebarBg ? extractHex(spec.sidebarBg, 'F8FAFC') : undefined;
  const headerBg = spec.headerBg ? extractHex(spec.headerBg, primary) : undefined;
  const sidebarText = spec.sidebarText
    ? extractHex(spec.sidebarText, '1E293B')
    : (sidebarBg && isDarkHex(sidebarBg) ? 'F8FAFC' : '1E293B');
  return Object.freeze({
    name: spec.name,
    archetype: spec.archetype,
    primary,
    secondary,
    sidebarBg,
    sidebarText,
    headerBg,
    headerText: spec.headerText ? extractHex(spec.headerText, 'FFFFFF') : (headerBg ? 'FFFFFF' : undefined),
    font: wordFont(spec.font),
    cssFont: spec.font || '',
    skillVariant: spec.skillVariant || SKILL_VARIANTS.PILLS,
    sidebarWidth: parseSidebarWidth(spec.sidebarWidth),
    dividerStyle: spec.dividerStyle || 'solid-thin',
    density: spec.density || 'standard',
    timelineStyle: spec.timelineStyle || 'modern-node',
  });
}

const A = ARCHETYPES;
const S = SKILL_VARIANTS;

const THEMES = Object.freeze({
  Cv1: theme({ name: 'Metropolitan Navy', archetype: A.MODERN_SPLIT, primary: '#1e3a8a', secondary: '#3b82f6', sidebarBg: '#f8fafc', sidebarText: '#1e293b', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv2: theme({ name: 'Nordic Slate', archetype: A.MODERN_SPLIT, primary: '#0f172a', secondary: '#0ea5e9', sidebarBg: '#f1f5f9', sidebarText: '#334155', font: "'Inter', sans-serif", skillVariant: S.PILLS, sidebarWidth: '33%' }),
  Cv3: theme({ name: 'Emerald Executive', archetype: A.MODERN_SPLIT, primary: '#065f46', secondary: '#10b981', sidebarBg: '#f0fdf4', sidebarText: '#166534', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, sidebarWidth: '35%' }),
  Cv4: theme({ name: 'Harvard Classic ATS', archetype: A.MINIMAL_ATS, primary: '#111827', secondary: '#4b5563', font: "'Merriweather', Georgia, serif", skillVariant: S.INLINE, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv5: theme({ name: 'Stanford Clean ATS', archetype: A.MINIMAL_ATS, primary: '#1e293b', secondary: '#64748b', font: "'Inter', sans-serif", skillVariant: S.PILLS, dividerStyle: 'accent-left', density: 'standard' }),
  Cv6: theme({ name: 'Wall Street Modern', archetype: A.MINIMAL_ATS, primary: '#0f172a', secondary: '#2563eb', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, dividerStyle: 'double-line', density: 'compact' }),
  Cv7: theme({ name: 'Sapphire Modern Split', archetype: A.MODERN_SPLIT, primary: '#1d4ed8', secondary: '#60a5fa', sidebarBg: '#eff6ff', sidebarText: '#1e3a8a', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv8: theme({ name: 'Crown Executive Banner', archetype: A.EXECUTIVE_BANNER, primary: '#1e293b', secondary: '#3b82f6', headerBg: '#1e293b', headerText: '#ffffff', font: "'Outfit', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv9: theme({ name: 'Cobalt Pro Split', archetype: A.MODERN_SPLIT, primary: '#2563eb', secondary: '#38bdf8', sidebarBg: '#1e293b', sidebarText: '#f8fafc', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, sidebarWidth: '35%' }),
  Cv10: theme({ name: 'Titanium Executive', archetype: A.EXECUTIVE_BANNER, primary: '#334155', secondary: '#64748b', headerBg: '#1e293b', headerText: '#ffffff', font: "'Inter', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv11: theme({ name: 'Prism Executive Banner', archetype: A.EXECUTIVE_BANNER, primary: '#4338ca', secondary: '#818cf8', headerBg: '#312e81', headerText: '#ffffff', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv12: theme({ name: 'Oxford Academic ATS', archetype: A.MINIMAL_ATS, primary: '#18181b', secondary: '#71717a', font: "'Merriweather', serif", skillVariant: S.INLINE, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv13: theme({ name: 'Cambridge Research', archetype: A.MINIMAL_ATS, primary: '#09090b', secondary: '#52525b', font: "'Inter', sans-serif", skillVariant: S.PILLS, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv14: theme({ name: 'Yale Corporate ATS', archetype: A.MINIMAL_ATS, primary: '#1e293b', secondary: '#0284c7', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, dividerStyle: 'accent-left', density: 'standard' }),
  Cv15: theme({ name: 'MIT Technical ATS', archetype: A.MINIMAL_ATS, primary: '#0f172a', secondary: '#059669', font: "'Inter', sans-serif", skillVariant: S.PILLS, dividerStyle: 'accent-left', density: 'compact' }),
  Cv16: theme({ name: 'Apex Navy Banner', archetype: A.EXECUTIVE_BANNER, primary: '#1e3a8a', secondary: '#38bdf8', headerBg: '#172554', headerText: '#ffffff', font: "'Outfit', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv17: theme({ name: 'Teal Horizon Banner', archetype: A.EXECUTIVE_BANNER, primary: '#0f766e', secondary: '#14b8a6', headerBg: '#134e4a', headerText: '#ffffff', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv18: theme({ name: 'Princeton Minimal ATS', archetype: A.MINIMAL_ATS, primary: '#27272a', secondary: '#52525b', font: "'Merriweather', serif", skillVariant: S.INLINE, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv19: theme({ name: 'Zurich Financial ATS', archetype: A.MINIMAL_ATS, primary: '#0f172a', secondary: '#3b82f6', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, dividerStyle: 'accent-left', density: 'compact' }),
  Cv20: theme({ name: 'Pacific Blue Split', archetype: A.MODERN_SPLIT, primary: '#0284c7', secondary: '#38bdf8', sidebarBg: '#f0f9ff', sidebarText: '#0369a1', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv21: theme({ name: 'Imperial Indigo Banner', archetype: A.EXECUTIVE_BANNER, primary: '#3730a3', secondary: '#6366f1', headerBg: '#312e81', headerText: '#ffffff', font: "'Outfit', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv22: theme({ name: 'Geneva Executive ATS', archetype: A.MINIMAL_ATS, primary: '#111827', secondary: '#4b5563', font: "'Inter', sans-serif", skillVariant: S.PILLS, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv23: theme({ name: 'Burgundy Prestige Banner', archetype: A.EXECUTIVE_BANNER, primary: '#881337', secondary: '#f43f5e', headerBg: '#4c0519', headerText: '#ffffff', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv24: theme({ name: 'Cyberpunk Modern Split', archetype: A.MODERN_SPLIT, primary: '#4f46e5', secondary: '#ec4899', sidebarBg: '#faf5ff', sidebarText: '#3b0764', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, sidebarWidth: '35%' }),
  Cv25: theme({ name: 'DevOps Terminal Tech', archetype: A.TECH_GRID, primary: '#0f172a', secondary: '#10b981', sidebarBg: '#f8fafc', sidebarText: '#334155', font: "'Inter', sans-serif", skillVariant: S.BADGES, sidebarWidth: '34%' }),
  Cv26: theme({ name: 'FullStack Dark Split', archetype: A.MODERN_SPLIT, primary: '#0284c7', secondary: '#38bdf8', sidebarBg: '#0f172a', sidebarText: '#f8fafc', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv27: theme({ name: 'Creative Studio Split', archetype: A.MODERN_SPLIT, primary: '#d97706', secondary: '#fbbf24', sidebarBg: '#fffbeb', sidebarText: '#78350f', font: "'Outfit', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv28: theme({ name: 'Silicon Valley Engineer', archetype: A.TECH_GRID, primary: '#2563eb', secondary: '#60a5fa', sidebarBg: '#f8fafc', sidebarText: '#1e293b', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, sidebarWidth: '34%' }),
  Cv29: theme({ name: 'Minimal Nordic Slate', archetype: A.MODERN_SPLIT, primary: '#334155', secondary: '#64748b', sidebarBg: '#f1f5f9', sidebarText: '#0f172a', font: "'Inter', sans-serif", skillVariant: S.PILLS, sidebarWidth: '33%' }),
  Cv30: theme({ name: 'Corporate Summit Banner', archetype: A.EXECUTIVE_BANNER, primary: '#1e293b', secondary: '#f59e0b', headerBg: '#0f172a', headerText: '#ffffff', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv31: theme({ name: 'Cloud Native Tech', archetype: A.TECH_GRID, primary: '#0284c7', secondary: '#0ea5e9', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES }),
  Cv32: theme({ name: 'Kubernetes Developer', archetype: A.TECH_GRID, primary: '#326ce5', secondary: '#60a5fa', font: "'Inter', sans-serif", skillVariant: S.PILLS }),
  Cv33: theme({ name: 'Data Science Matrix', archetype: A.TECH_GRID, primary: '#059669', secondary: '#34d399', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES }),
  Cv34: theme({ name: 'Fintech Executive', archetype: A.EXECUTIVE_BANNER, primary: '#0f172a', secondary: '#38bdf8', headerBg: '#0f172a', headerText: '#ffffff', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv35: theme({ name: 'AI & ML Researcher', archetype: A.TECH_GRID, primary: '#7c3aed', secondary: '#a78bfa', font: "'Outfit', sans-serif", skillVariant: S.BADGES }),
  Cv36: theme({ name: 'BioTech Specialist', archetype: A.EXECUTIVE_BANNER, primary: '#0d9488', secondary: '#2dd4bf', headerBg: '#115e59', headerText: '#ffffff', font: "'Inter', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv37: theme({ name: 'Solutions Architect', archetype: A.TECH_GRID, primary: '#ea580c', secondary: '#fb923c', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES }),
  Cv38: theme({ name: 'Global Legal ATS', archetype: A.MINIMAL_ATS, primary: '#18181b', secondary: '#71717a', font: "'Merriweather', serif", skillVariant: S.INLINE, dividerStyle: 'solid-thin', density: 'standard' }),
  Cv39: theme({ name: 'Product Manager Pro', archetype: A.MODERN_SPLIT, primary: '#2563eb', secondary: '#38bdf8', sidebarBg: '#f8fafc', sidebarText: '#1e293b', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv40: theme({ name: 'Europass Classic Grid', archetype: A.COMPACT_EURO, primary: '#003399', secondary: '#4169e1', font: "'Inter', sans-serif", skillVariant: S.PILLS }),
  Cv41: theme({ name: 'Europass Modern Slate', archetype: A.COMPACT_EURO, primary: '#1e293b', secondary: '#3b82f6', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES }),
  Cv42: theme({ name: 'European Academic Compact', archetype: A.COMPACT_EURO, primary: '#1e3a8a', secondary: '#60a5fa', font: "'Inter', sans-serif", skillVariant: S.PILLS }),
  Cv43: theme({ name: 'Brussels International', archetype: A.COMPACT_EURO, primary: '#0f766e', secondary: '#14b8a6', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES }),
  Cv44: theme({ name: 'Scandinavia Clean Compact', archetype: A.MINIMAL_ATS, primary: '#0f172a', secondary: '#64748b', font: "'Inter', sans-serif", skillVariant: S.PILLS, dividerStyle: 'solid-thin', density: 'compact' }),
  Cv45: theme({ name: 'Vienna Diplomatic Euro', archetype: A.COMPACT_EURO, primary: '#881337', secondary: '#e11d48', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS }),
  Cv46: theme({ name: 'Frankfurt Finance Euro', archetype: A.COMPACT_EURO, primary: '#1e293b', secondary: '#0284c7', font: "'Inter', sans-serif", skillVariant: S.BADGES }),
  Cv47: theme({ name: 'Metro Dual Column Pro', archetype: A.MODERN_SPLIT, primary: '#0369a1', secondary: '#38bdf8', sidebarBg: '#f0f9ff', sidebarText: '#0c4a6e', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '35%' }),
  Cv48: theme({ name: 'Modern Gradient Aurora', archetype: A.MODERN_SPLIT, primary: '#6366f1', secondary: '#ec4899', sidebarBg: '#312e81', sidebarText: '#f8fafc', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.BADGES, sidebarWidth: '35%' }),
  Cv49: theme({ name: 'Berlin Tech Compact', archetype: A.COMPACT_EURO, primary: '#18181b', secondary: '#3b82f6', font: "'Inter', sans-serif", skillVariant: S.PILLS }),
  Cv50: theme({ name: 'Executive Platinum Split', archetype: A.MODERN_SPLIT, primary: '#0f172a', secondary: '#475569', sidebarBg: '#f8fafc', sidebarText: '#1e293b', font: "'Plus Jakarta Sans', sans-serif", skillVariant: S.PILLS, sidebarWidth: '34%' }),
  Cv51: theme({ name: 'Standard Europass Official', archetype: A.COMPACT_EURO, primary: '#003399', secondary: '#4169e1', font: "Arial, 'Inter', sans-serif", skillVariant: S.PILLS }),
});

const EXPORTABLE_TEMPLATE = /^(?:Cv(?:[1-9]|[1-4][0-9]|5[0-1])|Cover[1-4])$/;

function normalizeTemplateId(templateName) {
  const name = String(templateName || '').trim();
  if (THEMES[name]) return name;
  const cv = name.match(/^cv\s*(\d{1,2})$/i);
  if (cv) {
    const key = `Cv${parseInt(cv[1], 10)}`;
    if (THEMES[key]) return key;
  }
  const cover = name.match(/^cover\s*([1-4])$/i);
  if (cover) return `Cover${cover[1]}`;
  return name;
}

function getTemplateStyle(templateName, customColors = null) {
  const key = normalizeTemplateId(templateName);
  const base = THEMES[key] || THEMES.Cv1;
  const overlay = sanitizeColorMap(customColors);
  if (!overlay) return base;
  return Object.freeze({
    ...base,
    primary: overlay.primary || base.primary,
    secondary: overlay.secondary || base.secondary,
    sidebarBg: overlay.sidebarBg || base.sidebarBg,
    sidebarText: overlay.sidebarText || base.sidebarText,
    headerBg: overlay.headerBg || base.headerBg,
    headerText: overlay.headerText || base.headerText,
  });
}

function resolveExportTemplate(stored = {}, requested) {
  const storedId = normalizeTemplateId(stored.template || stored.resumeName || '');
  const requestedId = normalizeTemplateId(requested || '');
  if (requestedId && !EXPORTABLE_TEMPLATE.test(requestedId)) {
    const err = new Error('INVALID_TEMPLATE');
    err.code = 'INVALID_TEMPLATE';
    err.status = 400;
    throw err;
  }
  if (storedId && requestedId && storedId !== requestedId) {
    const err = new Error('TEMPLATE_MISMATCH');
    err.code = 'TEMPLATE_MISMATCH';
    err.status = 400;
    throw err;
  }
  const resolved = storedId || requestedId || 'Cv1';
  if (!EXPORTABLE_TEMPLATE.test(resolved)) {
    const err = new Error('INVALID_TEMPLATE');
    err.code = 'INVALID_TEMPLATE';
    err.status = 400;
    throw err;
  }
  return resolved;
}

function layoutFamily(archetype) {
  if (archetype === ARCHETYPES.MINIMAL_ATS) return 'single-column';
  if (archetype === ARCHETYPES.COMPACT_EURO) return 'date-gutter';
  if (archetype === ARCHETYPES.EXECUTIVE_BANNER) return 'banner-split';
  return 'two-column-split';
}

module.exports = {
  ARCHETYPES,
  SKILL_VARIANTS,
  THEMES,
  EXPORTABLE_TEMPLATE,
  extractHex,
  sanitizeColorMap,
  wordFont,
  isDarkHex,
  getTemplateStyle,
  normalizeTemplateId,
  resolveExportTemplate,
  layoutFamily,
};
