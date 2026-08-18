import React from 'react';
import { filterMeaningfulReferences } from '../utils/contentSanitizer';

export default function SmartReferences({ references = [], theme = {}, title = 'References' }) {
  const validRefs = filterMeaningfulReferences(references);
  if (!validRefs.length) return null;

  return (
    <section className="smart-section smart-references-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-references-grid">
        {validRefs.map((ref, idx) => (
          <div key={idx} className="smart-reference-card" data-flow-item="reference">
            <h4 className="smart-reference-name">{ref.name}</h4>
            {ref.reference && <div className="smart-reference-detail">{ref.reference}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
