import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { formatRichText } from '../utils/formatText';
import { hasMeaningfulText } from '../utils/contentSanitizer';

export default function SmartSummary({ summary = '', title = 'Professional Summary', theme = {} }) {
  if (!hasMeaningfulText(summary)) return null;

  const dividerClass = `smart-section-title--${theme.dividerStyle || 'solid-thin'}`;

  return (
    <section className="smart-section smart-summary-section">
      <h3 className={`smart-section-title ${dividerClass}`}>
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
