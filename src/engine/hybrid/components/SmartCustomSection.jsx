import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { formatRichText } from '../utils/formatText';
import { hasMeaningfulText } from '../utils/contentSanitizer';

export default function SmartCustomSection({ section, items = [], _theme = {}, title = 'Additional Information' }) {
  const heading = title || section?.title || 'Additional Information';
  const sourceItems = Array.isArray(items) && items.length
    ? items
    : (Array.isArray(section?.items) ? section.items : []);
  const validItems = sourceItems.map((item) => {
    if (typeof item === 'string') {
      return hasMeaningfulText(item) ? { title: item, description: '' } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const itemTitle = item.title || item.name || '';
    const description = item.description || item.content || '';
    if (!hasMeaningfulText(itemTitle) && !hasMeaningfulText(description)) return null;
    return { title: itemTitle, description };
  }).filter(Boolean);

  if (!validItems.length) return null;

  return (
    <section className="smart-section smart-custom-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{heading}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-achievements-list">
        {validItems.map((item, idx) => (
          <div key={idx} className="smart-achievement-item" data-flow-item="custom">
            <div className="smart-achievement-content">
              {item.title ? <h4 className="smart-achievement-title">{item.title}</h4> : null}
              {item.description ? (
                <div
                  className="smart-achievement-desc rich-text"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(formatRichText(item.description)) }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
