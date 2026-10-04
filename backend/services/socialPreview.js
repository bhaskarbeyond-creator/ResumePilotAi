'use strict';

const crypto = require('crypto');
const sharp = require('sharp');

// These share-card roles mirror the Cuba palette published in
// src/styles/cuba-tokens.css. They are image-export fills, not a second UI theme.
const CUBA_CARD = Object.freeze({
    canvas: '#0d0f16',
    surface: '#15181f',
    line: '#2a2f3d',
    ink: '#f2f4fb',
    muted: '#b6bdd0',
    primary: '#a49cff',
    accent: '#7ccdf5',
});

const MAX_CACHE_ENTRIES = 96;
const renderedCards = new Map();

function xmlText(value, limit = 180) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function splitLines(value, maxLength = 40, maxLines = 2) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > maxLength && line) {
            lines.push(line);
            line = word;
            if (lines.length === maxLines) break;
        } else {
            line = candidate;
        }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = `${last.replace(/[.\s]+$/, '')}…`;
    }
    return lines.map(line => xmlText(line, maxLength + 1));
}

function initials(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    return xmlText((parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || 'RP').toUpperCase(), 2);
}

function currencyLabel(minimum, maximum, currency) {
    const code = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : '';
    const values = [minimum, maximum].map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0);
    if (!code || !values.length) return '';
    try {
        const format = new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: code, maximumFractionDigits: 0,
        });
        if (values.length === 2) return `${format.format(values[0])} – ${format.format(values[1])}`;
        return format.format(values[0]);
    } catch {
        return '';
    }
}

function createSocialPreviewSvg({ kind = 'Opportunity', title = '', company = '', detail = '', salary = '', posted = '' } = {}) {
    const cleanTitle = splitLines(title || 'Public opportunity', 39, 2);
    const titleLines = cleanTitle.map((line, index) =>
        `<text x="116" y="${278 + index * 68}" class="title">${line}</text>`).join('');
    const safeCompany = xmlText(company || 'Employer not listed', 70);
    const safeDetail = xmlText(detail, 110);
    const safeKind = xmlText(kind, 40);
    const safeSalary = xmlText(salary, 56);
    const safePosted = xmlText(posted, 40);
    const badges = [safeDetail, safeSalary, safePosted].filter(Boolean);
    const badgeNodes = badges.slice(0, 3).map((badge, index) => {
        const x = 116 + index * 310;
        return `<g transform="translate(${x},474)"><rect width="286" height="48" rx="16" fill="${CUBA_CARD.surface}" stroke="${CUBA_CARD.line}"/><text x="18" y="31" class="badge">${badge}</text></g>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${xmlText(`${kind}: ${title}`, 160)}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CUBA_CARD.primary}" stop-opacity=".25"/><stop offset="1" stop-color="${CUBA_CARD.accent}" stop-opacity=".06"/></linearGradient>
    <style>
      text{font-family:Inter,Arial,sans-serif} .brand{font-size:23px;font-weight:750;letter-spacing:.08em;fill:${CUBA_CARD.ink}}
      .eyebrow{font-size:18px;font-weight:700;letter-spacing:.12em;fill:${CUBA_CARD.primary};text-transform:uppercase}
      .title{font-size:53px;font-weight:760;letter-spacing:-1.7px;fill:${CUBA_CARD.ink}}
      .company{font-size:24px;font-weight:620;fill:${CUBA_CARD.muted}}
      .badge{font-size:18px;font-weight:650;fill:${CUBA_CARD.ink}}
    </style>
  </defs>
  <rect width="1200" height="630" fill="${CUBA_CARD.canvas}"/>
  <rect x="28" y="28" width="1144" height="574" rx="34" fill="${CUBA_CARD.surface}" stroke="${CUBA_CARD.line}"/>
  <rect x="28" y="28" width="1144" height="574" rx="34" fill="url(#wash)"/>
  <rect x="82" y="84" width="62" height="62" rx="19" fill="${CUBA_CARD.primary}"/>
  <text x="113" y="124" text-anchor="middle" style="font-size:21px;font-weight:800;fill:${CUBA_CARD.canvas}">${initials(company)}</text>
  <text x="164" y="122" class="brand">IME365</text>
  <text x="1045" y="120" text-anchor="end" class="eyebrow">${safeKind}</text>
  <text x="116" y="218" class="company">${safeCompany}</text>
  ${titleLines}
  ${badgeNodes}
  <text x="116" y="566" style="font-size:15px;fill:${CUBA_CARD.muted}">Public listing details from the live job database</text>
</svg>`;
}

async function renderSocialPreviewPng(input) {
    const svg = createSocialPreviewSvg(input);
    const key = crypto.createHash('sha256').update(svg).digest('hex');
    const cached = renderedCards.get(key);
    if (cached) {
        renderedCards.delete(key);
        renderedCards.set(key, cached);
        return cached;
    }
    const buffer = await sharp(Buffer.from(svg), { density: 72, limitInputPixels: 1200 * 630 })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    renderedCards.set(key, buffer);
    while (renderedCards.size > MAX_CACHE_ENTRIES) renderedCards.delete(renderedCards.keys().next().value);
    return buffer;
}

function summarizeSalary(job = {}) {
    return currencyLabel(
        job.salary_min ?? job.salaryMin,
        job.salary_max ?? job.salaryMax,
        job.salary_currency ?? job.salaryCurrency,
    );
}

module.exports = {
    createSocialPreviewSvg,
    renderSocialPreviewPng,
    summarizeSalary,
    xmlText,
};
