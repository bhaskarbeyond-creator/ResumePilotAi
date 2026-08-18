import React from 'react';

export default function SmartSkills({ skills = [], theme = {}, title = 'Skills' }) {
  if (!skills || !skills.length) return null;

  const variant = theme.skillVariant || 'pills';
  const dividerClass = `smart-section-title--${theme.dividerStyle || 'solid-thin'}`;

  // Normalize skills into objects: { name, rating }
  const normalized = skills.map((s) => {
    if (typeof s === 'string') return { name: s, rating: 80 };
    return {
      name: s.name || s.skillName || '',
      rating: typeof s.rating === 'number' ? s.rating : 80,
    };
  }).filter((s) => s.name);

  if (!normalized.length) return null;

  return (
    <section className="smart-section smart-skills-section">
      <h3 className={`smart-section-title ${dividerClass}`}>
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className={`smart-skills-grid smart-skills-grid--${variant}`}>
        {normalized.map((skill, i) => {
          const dotsCount = Math.max(1, Math.min(5, Math.round(skill.rating / 20)));

          return (
            <div key={i} className="smart-skill-item">
              <span className="smart-skill-name">{skill.name}</span>

              {variant === 'dots' && (
                <div className="smart-skill-dots" aria-label={`${dotsCount} out of 5`}>
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span
                      key={dot}
                      className={`smart-skill-dot ${dot <= dotsCount ? 'smart-skill-dot--filled' : ''}`}
                    />
                  ))}
                </div>
              )}

              {variant === 'bars' && (
                <div className="smart-skill-bar-wrap">
                  <div className="smart-skill-bar" style={{ width: `${Math.max(15, skill.rating)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
