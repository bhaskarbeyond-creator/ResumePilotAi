import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';

export default function SmartEducation({ educations = [], theme = {}, title = 'Education' }) {
  if (!educations || !educations.length) return null;

  return (
    <section className="smart-section smart-education-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className={`smart-timeline smart-timeline--${theme.timelineStyle || 'modern-node'}`}>
        {educations.map((edu, idx) => {
          const dateRange = [edu.started, edu.finished].filter(Boolean).join(' - ');
          const institution = [edu.school, edu.city].filter(Boolean).join(' · ');

          return (
            <div key={idx} className="smart-timeline-item" data-flow-item="education">
              <div className="smart-timeline-marker">
                <span className="smart-timeline-node" />
                <span className="smart-timeline-connector" />
              </div>

              <div className="smart-timeline-body">
                <div className="smart-timeline-header">
                  <div className="smart-timeline-title-group">
                    <h4 className="smart-timeline-role">{edu.degree || 'Degree'}</h4>
                    {institution && <div className="smart-timeline-company">{institution}</div>}
                  </div>
                  {dateRange && <div className="smart-timeline-date">{dateRange}</div>}
                </div>

                {edu.description && (
                  <div
                    className="smart-timeline-desc rich-text"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(edu.description) }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
