import React, { useEffect } from 'react';
import { getThemePreset, ARCHETYPES } from './themePresets';
import { partitionResumeContent } from './smartPartitioner';
import SmartHeader from './components/SmartHeader';
import SmartSkills from './components/SmartSkills';
import SmartLanguages from './components/SmartLanguages';
import SmartCertifications from './components/SmartCertifications';
import SmartHobbies from './components/SmartHobbies';
import SmartFlowRenderer from './components/SmartFlowRenderer';
import './smartEngine.css';

function renderSidebarSection(sectionKey, sidebar, theme) {
  if (!sidebar) return null;
  switch (sectionKey) {
    case 'skills':
      return sidebar.skills && sidebar.skills.length > 0 ? (
        <SmartSkills key="skills" skills={sidebar.skills} theme={theme} />
      ) : null;
    case 'languages':
      return sidebar.languages && sidebar.languages.length > 0 ? (
        <SmartLanguages key="languages" languages={sidebar.languages} theme={theme} />
      ) : null;
    case 'hobbies':
    case 'interests':
      return sidebar.hobbies ? (
        <SmartHobbies key="hobbies" hobbies={sidebar.hobbies} theme={theme} />
      ) : null;
    case 'certifications':
    case 'certification':
      return sidebar.certifications && sidebar.certifications.length > 0 ? (
        <SmartCertifications key="certifications" certifications={sidebar.certifications} theme={theme} />
      ) : null;
    default:
      return null;
  }
}

export default function SmartResumeComposer({ templateId = 'Cv1', values = {}, language = 'en' }) {
  const theme = getThemePreset(templateId);
  const partition = partitionResumeContent(values, theme);

  const firstname = values.firstname || values.firstName || '';
  const lastname = values.lastname || values.lastName || '';
  const fullName = [firstname, lastname].filter(Boolean).join(' ') || values.name || 'Your Name';
  const occupation = values.occupation || values.jobTitle || values.title || '';
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

                {/* 2. Executive Banner Layout with Adaptive Split-to-Full-Width Flow */}
                {!isSingleCol && isBanner && (
                  <div className="smart-layout smart-layout--executive-banner">
                    {isFirstPage && (
                      <div className="smart-banner-wrapper">
                        <SmartHeader values={values} theme={theme} variant="banner" />
                      </div>
                    )}
                    {isFirstPage && pageData.isAdaptiveSplit ? (
                      <div className="smart-adaptive-page">
                        {/* Upper Split: Left Sidebar (Skills/Languages) + Right Hero Flow (Summary/Jobs) */}
                        <div className="smart-split-hero">
                          {pageData.sidebar && (
                            <aside className="smart-sidebar">
                              {(pageData.sidebar.order || ['skills', 'languages', 'hobbies', 'certifications']).map(key =>
                                renderSidebarSection(key, pageData.sidebar, theme)
                              )}
                            </aside>
                          )}
                          <main className="smart-main-content">
                            <SmartFlowRenderer flowItems={pageData.heroFlowItems || pageData.flowItems} theme={theme} isContinuation={false} />
                          </main>
                        </div>

                        {/* Lower Full-Width Flow: Education, Certifications, etc. across 100% width */}
                        {pageData.bottomFlowItems && pageData.bottomFlowItems.length > 0 && (
                          <div className="smart-fullwidth-bottom-flow">
                            <SmartFlowRenderer flowItems={pageData.bottomFlowItems} theme={theme} isContinuation={false} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                        <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                      </main>
                    )}
                  </div>
                )}

                {/* 3. Modern Split Layout (Default) with Adaptive Split-to-Full-Width Flow */}
                {!isSingleCol && !isBanner && (
                  <div className="smart-layout smart-layout--modern-split">
                    {isFirstPage && pageData.isAdaptiveSplit ? (
                      <div className="smart-adaptive-page">
                        {/* Upper Split: Left Sidebar + Right Hero Flow (Summary/Jobs) */}
                        <div className="smart-split-hero">
                          {pageData.sidebar && (
                            <aside className="smart-sidebar">
                              <SmartHeader values={values} theme={theme} variant="sidebar" />
                              {(pageData.sidebar.order || ['skills', 'languages', 'hobbies', 'certifications']).map(key =>
                                renderSidebarSection(key, pageData.sidebar, theme)
                              )}
                            </aside>
                          )}
                          <main className="smart-main-content">
                            <SmartFlowRenderer flowItems={pageData.heroFlowItems || pageData.flowItems} theme={theme} isContinuation={false} />
                          </main>
                        </div>

                        {/* Lower Full-Width Flow: Education, Certifications, etc. across 100% width */}
                        {pageData.bottomFlowItems && pageData.bottomFlowItems.length > 0 && (
                          <div className="smart-fullwidth-bottom-flow">
                            <SmartFlowRenderer flowItems={pageData.bottomFlowItems} theme={theme} isContinuation={false} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {isFirstPage && pageData.sidebar && (
                          <aside className="smart-sidebar">
                            <SmartHeader values={values} theme={theme} variant="sidebar" />
                            {(pageData.sidebar.order || ['skills', 'languages', 'hobbies', 'certifications']).map(key =>
                              renderSidebarSection(key, pageData.sidebar, theme)
                            )}
                          </aside>
                        )}
                        <main className={`smart-main-content ${!isFirstPage ? 'smart-main-content--full' : ''}`}>
                          <SmartFlowRenderer flowItems={pageData.flowItems} theme={theme} isContinuation={!isFirstPage} />
                        </main>
                      </>
                    )}
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
