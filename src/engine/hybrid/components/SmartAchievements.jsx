import React from 'react';
import { formatRichText } from '../utils/formatText';

export default function SmartAchievements({ achievements = [], theme = {}, title = 'Key Achievements' }) {
  if (!achievements || !achievements.length) return null;

  return (
    <section className="smart-section smart-achievements-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-achievements-list">
        {achievements.map((ach, idx) => (
          <div key={idx} className="smart-achievement-item" data-flow-item="achievement">
            <div className="smart-achievement-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div className="smart-achievement-content">
              <h4 className="smart-achievement-title">{ach.title || ach.name}</h4>
              {ach.description && (
                <div
                  className="smart-achievement-desc rich-text"
                  dangerouslySetInnerHTML={{ __html: formatRichText(ach.description) }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
