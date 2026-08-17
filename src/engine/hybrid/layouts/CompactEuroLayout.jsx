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

export default function CompactEuroLayout({ values = {}, theme = {} }) {
  return (
    <div className="smart-layout smart-layout--compact-euro" style={{
      '--primary': theme.primary,
      '--secondary': theme.secondary,
      fontFamily: theme.font,
    }}>
      <SmartHeader values={values} theme={theme} variant="euro" />
      <SmartSummary summary={values.summary} />
      <SmartExperience employments={values.employments} theme={theme} />
      <SmartEducation educations={values.educations} theme={theme} />
      <SmartSkills skills={values.skills} theme={theme} />
      <SmartProjects projects={values.projects} theme={theme} />
      <SmartCertifications certifications={values.certifications} theme={theme} />
      <SmartLanguages languages={values.languages} theme={theme} />
      <SmartAchievements achievements={values.achievements} theme={theme} />
      <SmartReferences references={values.references} theme={theme} />
    </div>
  );
}
