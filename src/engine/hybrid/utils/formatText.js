/**
 * Smart Hybrid Engine — Text & Date Formatting Utilities
 * 
 * Provides robust formatting for date ranges, bullet point normalization,
 * and typographic rhythm.
 */

import { sanitizeRichText } from '../../../utils/sanitizeHtml';

/**
 * Normalizes date ranges, eliminating duplicates like "2021 - Present - Present"
 */
export function formatDateRange(begin = '', end = '') {
  let b = String(begin || '').trim();
  let e = String(end || '').trim();

  if (!b && !e) return '';
  if (!e) return b;
  if (!b) return e;

  // Clean trailing/leading dashes
  b = b.replace(/\s*[-–—]\s*$/, '').trim();
  e = e.replace(/^\s*[-–—]\s*/, '').trim();

  // Deduplicate if begin or end contains the other
  if (b.toLowerCase() === e.toLowerCase()) return b;
  if (b.toLowerCase().includes(e.toLowerCase())) return b;
  if (e.toLowerCase().includes(b.toLowerCase())) return e;

  // Check for repeated "Present" / "Current"
  const isBPresent = /present|current|now/i.test(b);
  const isEPresent = /present|current|now/i.test(e);
  if (isBPresent && isEPresent) return 'Present';

  // Normalize separator
  return `${b} – ${e}`;
}

/**
 * Normalizes bullet points and rich text, ensuring even indentation and clean lists
 */
export function formatRichText(content = '') {
  if (!content) return '';
  let str = String(content).trim();

  // If content contains raw text bullet characters (•, -, * at line start), convert to <ul><li>
  if (/^[•\-\*]\s+/m.test(str) && !str.includes('<ul>') && !str.includes('<li>')) {
    const lines = str.split('\n').map((l) => l.trim()).filter(Boolean);
    const listItems = lines.map((l) => {
      const cleanLine = l.replace(/^[•\-\*]\s*/, '');
      return `<li>${cleanLine}</li>`;
    });
    return `<ul>${listItems.join('')}</ul>`;
  }

  // If a <p> tag contains raw bullet characters
  str = str.replace(/<p>[•\-\*]\s*([^<]+)<\/p>/gi, '<li>$1</li>');
  if (str.includes('<li>') && !str.includes('<ul>')) {
    str = `<ul>${str}</ul>`;
  }

  return sanitizeRichText(str);
}
