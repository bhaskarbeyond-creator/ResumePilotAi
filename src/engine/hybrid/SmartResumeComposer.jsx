import React from 'react';
import { getThemePreset, ARCHETYPES } from './themePresets';
import { partitionResumeContent } from './smartPartitioner';
import SmartHeader from './components/SmartHeader';
import SmartSkills from './components/SmartSkills';
import SmartHobbies from './components/SmartHobbies';
import SmartCertifications from './components/SmartCertifications';
import SmartLanguages from './components/SmartLanguages';
import SmartFlowRenderer from './components/SmartFlowRenderer';
import './smartEngine.css';

export default function SmartResumeComposer({ templateId = 'Cv1', _language = 'en', values = {} }) {
  const theme = getThemePreset(templateId);
  const partitionResult = partitionResumeContent(values, theme);
  const totalPages = partitionResult.totalPages || 1;
  const pages = partitionResult.pages || [];

  const isSingleCol = theme.archetype === ARCHETYPES.MINIMAL_ATS || theme.archetype === ARCHETYPES.COMPACT_EURO;
  const isBanner = theme.archetype === ARCHETYPES.EXECUTIVE_BANNER;
  // TECH_GRID previously had no branch of its own and fell through to the
  // modern-split renderer, so seven templates declared an archetype the engine
  // never produced (and their declared `headerStyle` was discarded with it).
  const isTechGrid = theme.archetype === ARCHETYPES.TECH_GRID;
  const isReverseSplit = theme.sidebarPosition === 'right';

  const fullName = [values.firstname, values.lastname].filter(Boolean).join(' ') || 'Resume';

  /**
   * Script fallback chain.
   *
   * Every preset's font stack ended at the generic `sans-serif`. CSS font
   * fallback is per-glyph, so appending the Noto families lets Chromium reach a
   * script-capable face for CJK, Arabic, Hebrew and Thai when one is installed
   * on the machine (or on the headless export host) — instead of rendering
   * tofu. The families are NOT imported: naming them costs nothing and adds no
   * network request, while importing Noto CJK would add megabytes to every
   * resume render. Latin, Telugu, Devanagari, Cyrillic and Greek are already
   * covered by the fonts the engine imports.
   */
  const SCRIPT_FALLBACKS = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans CJK SC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'Noto Sans Thai', 'Noto Color Emoji'";
  const baseFont = theme.font || "'Inter', sans-serif";
  const fontFamily = `${baseFont.replace(/,\s*(sans-)?serif\s*$/i, '')}, ${SCRIPT_FALLBACKS}, ${/serif\s*$/i.test(baseFont) && !/sans-serif\s*$/i.test(baseFont) ? 'serif' : 'sans-serif'}`;

  // Build custom CSS variables object for theme tokens
  const themeStyle = {
    '--primary': theme.primary || '#1e3a8a',
    '--secondary': theme.secondary || '#3b82f6',
    '--font-family': fontFamily,
    '--sidebar-bg': theme.sidebarBg || '#f8fafc',
    '--sidebar-text': theme.sidebarText || '#1e293b',
    '--sidebar-width': theme.sidebarWidth || '34%',
    '--badge-radius': theme.badgeRadius || '6px',
    '--header-bg': theme.headerBg || theme.primary || '#1e3a8a',
    '--header-text': theme.headerText || '#ffffff',
  };

  return (
    <div className="smart-resume-engine-root" style={themeStyle}>
      <div className="smart-resume-document">
        {pages.map((pageData, pageIdx) => {
          const pageNumber = pageData.pageNumber || pageIdx + 1;
          const isFirstPage = pageNumber === 1;

          return (
            <div
              key={pageNumber}
              className={`smart-resume-page smart-resume-page--${templateId.toLowerCase()}`}
              data-page-index={pageIdx}
              data-page-number={pageNumber}
              data-template={templateId}
              data-archetype={theme.archetype}
              data-density={theme.density || 'standard'}
              style={{ fontFamily: 'var(--font-family)' }}
            >
              <div className="smart-page-body">
                {/* 1. Continuation Header (Page 2+) */}
                {!isFirstPage && (
                  <header className="smart-continuation-header">
                    <span className="smart-continuation-name">{fullName}</span>
                    {values.occupation && (
                      <span className="smart-continuation-role">{values.occupation}</span>
                    )}
                    <span className="smart-continuation-page">Page {pageNumber} of {totalPages}</span>
                  </header>
                )}

                {/* 2. Single-Column Layouts (Minimal ATS, Compact Euro) */}
                {isSingleCol && (
                  <div className={`smart-layout smart-layout--${theme.archetype}`}>
                    {isFirstPage && (
                      <SmartHeader values={values} theme={theme} variant={theme.headerStyle || 'standard'} />
                    )}
                    <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                  </div>
                )}

                {/* 3. Executive Banner Layout */}
                {isBanner && (
                  <div className="smart-layout smart-layout--executive-banner">
                    {isFirstPage && (
                      <header className="smart-banner-wrapper">
                        <SmartHeader values={values} theme={theme} variant="banner" />
                      </header>
                    )}
                    <div className="smart-banner-body">
                      {isFirstPage && pageData.sidebar && (
                        <aside className="smart-sidebar">
                          {pageData.sidebar.skills && pageData.sidebar.skills.length > 0 && (
                            <SmartSkills skills={pageData.sidebar.skills} theme={theme} />
                          )}
                          {pageData.sidebar.hobbies && (
                            <SmartHobbies hobbies={pageData.sidebar.hobbies} theme={theme} />
                          )}
                          {pageData.sidebar.certifications && pageData.sidebar.certifications.length > 0 && (
                            <SmartCertifications certifications={pageData.sidebar.certifications} theme={theme} />
                          )}
                          {pageData.sidebar.languages && pageData.sidebar.languages.length > 0 && (
                            <SmartLanguages languages={pageData.sidebar.languages} theme={theme} />
                          )}
                        </aside>
                      )}
                      <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                        <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                      </main>
                    </div>
                  </div>
                )}

                {/* 4. Tech Grid Layout — full-width technical identity band over a
                    two-column body (skills/certification rail beside the narrative). */}
                {isTechGrid && (
                  <div className="smart-layout smart-layout--tech-grid">
                    {isFirstPage && (
                      <header className="smart-tech-header-wrapper">
                        <SmartHeader values={values} theme={theme} variant={theme.headerStyle || 'left-bold'} />
                      </header>
                    )}
                    <div className="smart-tech-body">
                      {isFirstPage && pageData.sidebar && (
                        <aside className="smart-sidebar">
                          {pageData.sidebar.skills && pageData.sidebar.skills.length > 0 && (
                            <SmartSkills skills={pageData.sidebar.skills} theme={theme} title="Tech Stack" />
                          )}
                          {pageData.sidebar.certifications && pageData.sidebar.certifications.length > 0 && (
                            <SmartCertifications certifications={pageData.sidebar.certifications} theme={theme} />
                          )}
                          {pageData.sidebar.languages && pageData.sidebar.languages.length > 0 && (
                            <SmartLanguages languages={pageData.sidebar.languages} theme={theme} />
                          )}
                          {pageData.sidebar.hobbies && (
                            <SmartHobbies hobbies={pageData.sidebar.hobbies} theme={theme} />
                          )}
                        </aside>
                      )}
                      <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                        <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                      </main>
                    </div>
                  </div>
                )}

                {/* 5. Modern Split Layout (Default or Reverse) */}
                {!isSingleCol && !isBanner && !isTechGrid && (
                  <div className={`smart-layout smart-layout--modern-split ${isReverseSplit ? 'smart-layout--reverse' : ''}`}>
                    {isFirstPage && pageData.sidebar && (
                      <aside className="smart-sidebar">
                        <SmartHeader values={values} theme={theme} variant="sidebar" />
                        {pageData.sidebar.skills && pageData.sidebar.skills.length > 0 && (
                          <SmartSkills skills={pageData.sidebar.skills} theme={theme} />
                        )}
                        {pageData.sidebar.hobbies && (
                          <SmartHobbies hobbies={pageData.sidebar.hobbies} theme={theme} />
                        )}
                        {pageData.sidebar.certifications && pageData.sidebar.certifications.length > 0 && (
                          <SmartCertifications certifications={pageData.sidebar.certifications} theme={theme} />
                        )}
                        {pageData.sidebar.languages && pageData.sidebar.languages.length > 0 && (
                          <SmartLanguages languages={pageData.sidebar.languages} theme={theme} />
                        )}
                      </aside>
                    )}
                    <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                      <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                    </main>
                  </div>
                )}
              </div>

              {/* Page Footer */}
              <footer className="smart-page-footer">
                <span className="smart-footer-name">{fullName}</span>
                <span className="smart-footer-page">{pageNumber} / {totalPages}</span>
              </footer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
