import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { formatRichText } from '../utils/formatText';

export default function SmartSummary({ summary = '', title = 'Professional Summary' }) {
  if (!summary || !summary.trim()) return null;

  return (
    <section className="smart-section smart-summary-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>
      <div
        className="smart-summary-content rich-text"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(formatRichText(summary)) }}
      />
    </section>
  );
}
