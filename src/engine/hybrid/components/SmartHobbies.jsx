import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { filterMeaningfulHobbies, hasMeaningfulText } from '../utils/contentSanitizer';

export default function SmartHobbies({ hobbies = [], _theme = {}, title = 'Hobbies & Interests' }) {
  const validHobbies = filterMeaningfulHobbies(hobbies);
  if (!validHobbies.length) return null;

  // If hobbies is a string / HTML block
  if (typeof hobbies === 'string') {
    if (!hasMeaningfulText(hobbies)) return null;
    return (
      <section className="smart-section smart-hobbies-section">
        <h3 className="smart-section-title">
          <span className="smart-section-title__text">{title}</span>
          <span className="smart-section-title__line" />
        </h3>
        <div
          className="smart-hobbies-text"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(hobbies) }}
        />
      </section>
    );
  }

  return (
    <section className="smart-section smart-hobbies-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-hobbies-pills">
        {validHobbies.map((item, idx) => {
          const name = typeof item === 'string' ? item : (item.name || item.hobby || item.title || item.interest || '');
          if (!name) return null;

          return (
            <span key={idx} className="smart-hobby-pill">
              {name}
            </span>
          );
        })}
      </div>
    </section>
  );
}
