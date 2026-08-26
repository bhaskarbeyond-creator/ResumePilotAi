import React from 'react';
import { sanitizeRichText } from '../../../utils/sanitizeHtml';
import { formatRichText } from '../utils/formatText';
import { filterMeaningfulProjects } from '../utils/contentSanitizer';

export default function SmartProjects({ projects = [], _theme = {}, title = 'Projects' }) {
  const validProjects = filterMeaningfulProjects(projects);
  if (!validProjects.length) return null;

  return (
    <section className="smart-section smart-projects-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-cards-grid">
        {validProjects.map((proj, idx) => (
          <div key={idx} className="smart-card-item" data-flow-item="project">
            <div className="smart-card-header">
              <h4 className="smart-card-title">{proj.title || proj.name}</h4>
              {proj.url && (
                <a href={proj.url} target="_blank" rel="noopener noreferrer" className="smart-card-link">
                  {proj.url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            {proj.description && (
              <div
                className="smart-card-desc rich-text"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(formatRichText(proj.description)) }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
