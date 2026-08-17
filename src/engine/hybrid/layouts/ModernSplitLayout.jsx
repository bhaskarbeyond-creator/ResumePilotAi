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

export default function ModernSplitLayout({ values = {}, theme = {} }) {
  return (
    <div className="smart-layout smart-layout--modern-split" style={{
      '--primary': theme.primary,
      '--secondary': theme.secondary,
      '--sidebar-bg': theme.sidebarBg || '#f8fafc',
      '--sidebar-text': theme.sidebarText || '#1e293b',
      '--sidebar-width': theme.sidebarWidth || '34%',
      fontFamily: theme.font,
    }}>
      <aside className="smart-sidebar">
        <SmartHeader values={values} theme={theme} variant="sidebar" />
        <SmartSkills skills={values.skills} theme={theme} />
        <SmartLanguages languages={values.languages} theme={theme} />
        <SmartCertifications certifications={values.certifications} theme={theme} />
      </aside>

      <main className="smart-main-content">
        <SmartSummary summary={values.summary} />
        <SmartExperience employments={values.employments} theme={theme} />
        <SmartEducation educations={values.educations} theme={theme} />
        <SmartProjects projects={values.projects} theme={theme} />
        <SmartAchievements achievements={values.achievements} theme={theme} />
        <SmartReferences references={values.references} theme={theme} />
      </main>
    </div>
  );
}
