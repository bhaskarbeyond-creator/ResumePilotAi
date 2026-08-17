import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { formatDateRange, formatRichText } from '../utils/formatText';

export default function SmartExperience({ employments = [], theme = {}, title = 'Employment History' }) {
  if (!employments || !employments.length) return null;

  return (
    <section className="smart-section smart-experience-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className={`smart-timeline smart-timeline--${theme.timelineStyle || 'modern-node'}`}>
        {employments.map((job, idx) => {
          const dateRange = formatDateRange(job.begin, job.end);
          const companyLocation = [job.employer, job.city].filter(Boolean).join(' · ');

          return (
            <div key={idx} className="smart-timeline-item" data-flow-item="experience">
              <div className="smart-timeline-marker">
                <span className="smart-timeline-node" />
                <span className="smart-timeline-connector" />
              </div>

              <div className="smart-timeline-body">
                <div className="smart-timeline-header">
                  <div className="smart-timeline-title-group">
                    <h4 className="smart-timeline-role">{job.jobTitle || 'Role'}</h4>
                    {companyLocation && <div className="smart-timeline-company">{companyLocation}</div>}
                  </div>
                  {dateRange && <div className="smart-timeline-date">{dateRange}</div>}
                </div>

                {job.description && (
                  <div
                    className="smart-timeline-desc rich-text"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(formatRichText(job.description)) }}
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
