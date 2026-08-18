import React from 'react';

function getLanguageDots(level = '') {
  const lower = level.toLowerCase();
  if (lower.includes('native') || lower.includes('bilingual') || lower.includes('c2')) return 5;
  if (lower.includes('fluent') || lower.includes('advanced') || lower.includes('c1')) return 4;
  if (lower.includes('professional') || lower.includes('intermediate') || lower.includes('b2') || lower.includes('b1')) return 3;
  if (lower.includes('conversational') || lower.includes('a2')) return 2;
  if (lower.includes('basic') || lower.includes('beginner') || lower.includes('a1')) return 1;
  return 4;
}

export default function SmartLanguages({ languages = [], theme = {}, title = 'Languages' }) {
  if (!languages || !languages.length) return null;

  const dividerClass = `smart-section-title--${theme.dividerStyle || 'solid-thin'}`;
  const showDots = theme.skillVariant === 'dots';

  return (
    <section className="smart-section smart-languages-section">
      <h3 className={`smart-section-title ${dividerClass}`}>
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-languages-list">
        {languages.map((lang, idx) => {
          const name = typeof lang === 'string' ? lang : lang.name || lang.language;
          const level = typeof lang === 'string' ? '' : lang.level || '';
          const dotsCount = getLanguageDots(level);

          return (
            <div key={idx} className="smart-language-item">
              <div className="smart-language-info">
                <span className="smart-language-name">{name}</span>
                {level && <span className="smart-language-level">{level}</span>}
              </div>
              {showDots && (
                <div className="smart-skill-dots" aria-label={`${dotsCount} out of 5`}>
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span
                      key={dot}
                      className={`smart-skill-dot ${dot <= dotsCount ? 'smart-skill-dot--filled' : ''}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
