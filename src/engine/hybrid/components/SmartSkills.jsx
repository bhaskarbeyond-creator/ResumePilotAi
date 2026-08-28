import React from 'react';
import { filterMeaningfulSkills } from '../utils/contentSanitizer';

export default function SmartSkills({ skills = [], theme = {}, title = 'Skills' }) {
  const validSkills = filterMeaningfulSkills(skills);
  if (!validSkills.length) return null;

  const variant = theme.skillVariant || 'pills';
  const dividerClass = `smart-section-title--${theme.dividerStyle || 'solid-thin'}`;

  // Preserve proficiency only when the candidate supplied a valid numeric rating.
  const normalized = validSkills.map((s) => {
    if (typeof s === 'string') return { name: s.trim(), rating: null };
    const rating = typeof s.rating === 'number' && Number.isFinite(s.rating)
      ? Math.min(100, Math.max(0, s.rating))
      : null;
    return {
      name: (s.name || s.skillName || s.skill || s.title || '').trim(),
      rating,
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
          const hasRating = Number.isFinite(skill.rating);
          const dotsCount = hasRating ? Math.max(0, Math.min(5, Math.round(skill.rating / 20))) : 0;

          return (
            <div key={i} className="smart-skill-item">
              <span className="smart-skill-name">{skill.name}</span>

              {variant === 'dots' && hasRating && (
                <div className="smart-skill-dots" aria-label={`${dotsCount} out of 5`}>
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span
                      key={dot}
                      className={`smart-skill-dot ${dot <= dotsCount ? 'smart-skill-dot--filled' : ''}`}
                    />
                  ))}
                </div>
              )}

              {variant === 'bars' && hasRating && (
                <div className="smart-skill-bar-wrap">
                  <div className="smart-skill-bar" style={{ width: `${skill.rating}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
