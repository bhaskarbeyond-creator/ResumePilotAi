import React from 'react';
import SmartHeader from '../components/SmartHeader';
import SmartSummary from '../components/SmartSummary';
import SmartExperience from '../components/SmartExperience';
import SmartEducation from '../components/SmartEducation';
import SmartSkills from '../components/SmartSkills';
import SmartProjects from '../components/SmartProjects';
import SmartCertifications from '../components/SmartCertifications';
import SmartLanguages from '../components/SmartLanguages';
import SmartAchievements from '../components/SmartAchievements';
import SmartReferences from '../components/SmartReferences';

export default function ExecutiveBannerLayout({ values = {}, theme = {} }) {
  return (
    <div className="smart-layout smart-layout--executive-banner" style={{
      '--primary': theme.primary,
      '--secondary': theme.secondary,
      '--header-bg': theme.headerBg || theme.primary,
      '--header-text': theme.headerText || '#ffffff',
      '--sidebar-width': theme.sidebarWidth || '34%',
      fontFamily: theme.font,
    }}>
      <div className="smart-banner-wrapper">
        <SmartHeader values={values} theme={theme} variant="banner" />
      </div>

      <div className="smart-body-columns">
        <aside className="smart-sidebar">
          <SmartSkills skills={values.skills} theme={theme} />
          <SmartLanguages languages={values.languages} theme={theme} />
          <SmartCertifications certifications={values.certifications} theme={theme} />
        </aside>

        <section className="smart-main-content" role="region" aria-label="Resume preview content">
          <SmartSummary summary={values.summary} />
          <SmartExperience employments={values.employments} theme={theme} />
          <SmartEducation educations={values.educations} theme={theme} />
          <SmartProjects projects={values.projects} theme={theme} />
          <SmartAchievements achievements={values.achievements} theme={theme} />
          <SmartReferences references={values.references} theme={theme} />
        </section>
      </div>
    </div>
  );
}
