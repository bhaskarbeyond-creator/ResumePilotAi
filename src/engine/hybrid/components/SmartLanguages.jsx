import React from 'react';

export default function SmartLanguages({ languages = [], theme = {}, title = 'Languages' }) {
  if (!languages || !languages.length) return null;

  return (
    <section className="smart-section smart-languages-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-languages-list">
        {languages.map((lang, idx) => {
          const name = typeof lang === 'string' ? lang : lang.name || lang.language;
          const level = typeof lang === 'string' ? '' : lang.level || '';

          return (
            <div key={idx} className="smart-language-item">
              <span className="smart-language-name">{name}</span>
              {level && <span className="smart-language-level">{level}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
