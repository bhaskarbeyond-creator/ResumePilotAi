import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';

export default function SmartHobbies({ hobbies = [], theme = {}, title = 'Hobbies & Interests' }) {
  if (!hobbies || (Array.isArray(hobbies) && !hobbies.length)) return null;

  // If hobbies is a string / HTML block
  if (typeof hobbies === 'string') {
    if (!hobbies.trim()) return null;
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

  // If hobbies is an array of items (strings or objects)
  const items = Array.isArray(hobbies) ? hobbies : [hobbies];
  if (!items.length) return null;

  return (
    <section className="smart-section smart-hobbies-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-hobbies-pills">
        {items.map((item, idx) => {
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
