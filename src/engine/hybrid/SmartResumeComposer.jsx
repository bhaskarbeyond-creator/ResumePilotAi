import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getThemePreset, ARCHETYPES } from './themePresets';
import ModernSplitLayout from './layouts/ModernSplitLayout';
import ExecutiveBannerLayout from './layouts/ExecutiveBannerLayout';
import MinimalATSLayout from './layouts/MinimalATSLayout';
import TechGridLayout from './layouts/TechGridLayout';
import CompactEuroLayout from './layouts/CompactEuroLayout';
import './smartEngine.css';

const PAGE_H = 1123; // A4 height at 96 DPI

function getLayoutComponent(archetype) {
  switch (archetype) {
    case ARCHETYPES.MODERN_SPLIT:
      return ModernSplitLayout;
    case ARCHETYPES.EXECUTIVE_BANNER:
      return ExecutiveBannerLayout;
    case ARCHETYPES.MINIMAL_ATS:
      return MinimalATSLayout;
    case ARCHETYPES.TECH_GRID:
      return TechGridLayout;
    case ARCHETYPES.COMPACT_EURO:
      return CompactEuroLayout;
    default:
      return ModernSplitLayout;
  }
}

export default function SmartResumeComposer({ templateId = 'Cv1', values = {}, language = 'en' }) {
  const theme = getThemePreset(templateId);
  const LayoutComponent = getLayoutComponent(theme.archetype);

  const containerRef = useRef(null);
  const liveRef = useRef(null);
  const [pagesCount, setPagesCount] = useState(1);
  const [isComposed, setIsComposed] = useState(false);

  const fullName = [values.firstname, values.lastname].filter(Boolean).join(' ') || 'Your Name';
  const occupation = values.occupation || '';

  useLayoutEffect(() => {
    const liveEl = liveRef.current;
    const containerEl = containerRef.current;
    if (!liveEl || !containerEl) return;

    // Measure the full rendered height of the live document
    const totalHeight = liveEl.scrollHeight;

    if (totalHeight <= PAGE_H + 30) {
      // Perfectly fits on 1 single page!
      setPagesCount(1);
      setIsComposed(true);
      document.documentElement.setAttribute('data-lab-state', 'ready');
      document.dispatchEvent(new CustomEvent('resume-composed', { detail: { templateId, pages: 1 } }));
      return;
    }

    // Multi-page document: Paginate intelligently
    const estPages = Math.max(2, Math.ceil(totalHeight / (PAGE_H - 80)));
    setPagesCount(estPages);
    setIsComposed(true);
    document.documentElement.setAttribute('data-lab-state', 'ready');
    document.dispatchEvent(new CustomEvent('resume-composed', { detail: { templateId, pages: estPages } }));
  }, [templateId, values, language]);

  return (
    <div className="smart-resume-composer" ref={containerRef}>
      {/* Hidden Live Measurement Layer */}
      <div
        className="smart-live"
        ref={liveRef}
        style={{
          position: 'absolute',
          top: 0,
          left: '-99999px',
          width: '210mm',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div className="smart-resume-page" style={{ height: 'auto', maxHeight: 'none' }}>
          <LayoutComponent values={values} theme={theme} />
        </div>
      </div>

      {/* Rendered Discrete A4 Sheets */}
      <div className="smart-resume-document">
        {Array.from({ length: pagesCount }).map((_, pageIdx) => {
          const isFirstPage = pageIdx === 0;
          const pageNumber = pageIdx + 1;

          return (
            <div
              key={pageIdx}
              className="smart-resume-page"
              data-page-number={pageNumber}
              data-cv-board="true"
              id={isFirstPage ? 'resumen' : undefined}
            >
              {!isFirstPage && (
                <div className="smart-continuation-header">
                  <div>
                    <span className="smart-continuation-name">{fullName}</span>
                    {occupation && <span className="smart-continuation-role">{occupation}</span>}
                  </div>
                  <span className="smart-continuation-page">
                    Page {pageNumber} of {pagesCount}
                  </span>
                </div>
              )}

              <div className="smart-page-body">
                <LayoutComponent values={values} theme={theme} />
              </div>

              <footer className="smart-page-footer">
                <span>{fullName}</span>
                <span>{pageNumber} / {pagesCount}</span>
              </footer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
