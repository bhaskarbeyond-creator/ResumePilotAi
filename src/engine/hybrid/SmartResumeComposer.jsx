import React, { useEffect } from 'react';
import { getThemePreset, ARCHETYPES } from './themePresets';
import { partitionResumeContent } from './smartPartitioner';
import SmartHeader from './components/SmartHeader';
import SmartSkills from './components/SmartSkills';
import SmartLanguages from './components/SmartLanguages';
import SmartCertifications from './components/SmartCertifications';
import SmartFlowRenderer from './components/SmartFlowRenderer';
import './smartEngine.css';

export default function SmartResumeComposer({ templateId = 'Cv1', values = {}, language = 'en' }) {
  const theme = getThemePreset(templateId);
  const partition = partitionResumeContent(values, theme);

  const fullName = [values.firstname, values.lastname].filter(Boolean).join(' ') || 'Your Name';
  const occupation = values.occupation || '';
  const totalPages = partition.totalPages;

  useEffect(() => {
    document.documentElement.setAttribute('data-lab-state', 'ready');
    document.dispatchEvent(new CustomEvent('resume-composed', { detail: { templateId, pages: totalPages } }));
  }, [templateId, values, language, totalPages]);

  const isSingleCol = theme.archetype === ARCHETYPES.MINIMAL_ATS || theme.archetype === ARCHETYPES.COMPACT_EURO;
  const isBanner = theme.archetype === ARCHETYPES.EXECUTIVE_BANNER;

  return (
    <div className="smart-resume-composer">
      <div className="smart-resume-document">
        {partition.pages.map((pageData, pageIdx) => {
          const isFirstPage = pageData.isFirstPage;
          const pageNumber = pageData.pageNumber;

          return (
            <div
              key={pageIdx}
              className={`smart-resume-page smart-resume-page--${theme.archetype} ${!isFirstPage ? 'smart-resume-page--continuation' : ''}`}
              data-page-number={pageNumber}
              data-cv-board="true"
              id={isFirstPage ? 'resumen' : undefined}
              style={{
                '--primary': theme.primary,
                '--secondary': theme.secondary,
                '--sidebar-bg': theme.sidebarBg || '#f8fafc',
                '--sidebar-text': theme.sidebarText || '#1e293b',
                '--header-bg': theme.headerBg || theme.primary,
                '--header-text': theme.headerText || '#ffffff',
                '--sidebar-width': theme.sidebarWidth || '34%',
                fontFamily: theme.font,
              }}
            >
              {/* Top Chrome: Continuation Header on Page 2+ */}
              {!isFirstPage && (
                <div className="smart-continuation-header">
                  <div className="smart-continuation-who">
                    <span className="smart-continuation-name">{fullName}</span>
                    {occupation && <span className="smart-continuation-role">· {occupation}</span>}
                  </div>
                  <span className="smart-continuation-page">
                    Page {pageNumber} of {totalPages}
                  </span>
                </div>
              )}

              {/* Page Body */}
              <div className="smart-page-body">
                {/* 1. Single-Column ATS / Europass Layout */}
                {isSingleCol && (
                  <div className="smart-layout smart-layout--minimal-ats">
                    {isFirstPage && <SmartHeader values={values} theme={theme} variant="minimal" />}
                    <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                  </div>
                )}

                {/* 2. Executive Banner Layout */}
                {!isSingleCol && isBanner && (
                  <div className="smart-layout smart-layout--executive-banner">
                    {isFirstPage && (
                      <div className="smart-banner-wrapper">
                        <SmartHeader values={values} theme={theme} variant="banner" />
                      </div>
                    )}
                    <div className="smart-body-columns">
                      {isFirstPage && pageData.sidebar && (
                        <aside className="smart-sidebar">
                          {pageData.sidebar.skills && pageData.sidebar.skills.length > 0 && (
                            <SmartSkills skills={pageData.sidebar.skills} theme={theme} />
                          )}
                          {pageData.sidebar.languages && pageData.sidebar.languages.length > 0 && (
                            <SmartLanguages languages={pageData.sidebar.languages} theme={theme} />
                          )}
                          {pageData.sidebar.certifications && pageData.sidebar.certifications.length > 0 && (
                            <SmartCertifications certifications={pageData.sidebar.certifications} theme={theme} />
                          )}
                        </aside>
                      )}
                      <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                        <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                      </main>
                    </div>
                  </div>
                )}

                {/* 3. Modern Split Layout (Default) */}
                {!isSingleCol && !isBanner && (
                  <div className="smart-layout smart-layout--modern-split">
                    {isFirstPage && pageData.sidebar && (
                      <aside className="smart-sidebar">
                        <SmartHeader values={values} theme={theme} variant="sidebar" />
                        {pageData.sidebar.skills && pageData.sidebar.skills.length > 0 && (
                          <SmartSkills skills={pageData.sidebar.skills} theme={theme} />
                        )}
                        {pageData.sidebar.languages && pageData.sidebar.languages.length > 0 && (
                          <SmartLanguages languages={pageData.sidebar.languages} theme={theme} />
                        )}
                        {pageData.sidebar.certifications && pageData.sidebar.certifications.length > 0 && (
                          <SmartCertifications certifications={pageData.sidebar.certifications} theme={theme} />
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
