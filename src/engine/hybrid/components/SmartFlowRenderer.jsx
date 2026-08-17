import React from 'react';
import SmartSummary from './SmartSummary';
import SmartExperience from './SmartExperience';
import SmartEducation from './SmartEducation';
import SmartSkills from './SmartSkills';
import SmartCertifications from './SmartCertifications';
import SmartLanguages from './SmartLanguages';
import SmartProjects from './SmartProjects';
import SmartAchievements from './SmartAchievements';
import SmartReferences from './SmartReferences';
import SmartHobbies from './SmartHobbies';

export default function SmartFlowRenderer({ flowItems = [], theme = {}, isContinuation = false }) {
  if (!flowItems || !flowItems.length) return null;

  // Group consecutive flow items by type
  const groups = [];
  let currentGroup = null;

  flowItems.forEach((item) => {
    if (!currentGroup || currentGroup.type !== item.type) {
      currentGroup = { type: item.type, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  });

  return (
    <div className="smart-flow-container">
      {groups.map((group, gIdx) => {
        switch (group.type) {
          case 'summary':
            return (
              <SmartSummary
                key={gIdx}
                summary={group.items[0].content}
                title={isContinuation ? 'Summary (Continued)' : 'Professional Summary'}
              />
            );

          case 'experience': {
            const employments = group.items.map((i) => i.item);
            const isFirstInDoc = group.items[0].isFirst;
            return (
              <SmartExperience
                key={gIdx}
                employments={employments}
                theme={theme}
                title={isFirstInDoc ? 'Employment History' : 'Employment History (Continued)'}
              />
            );
          }

          case 'education': {
            const educations = group.items.map((i) => i.item);
            const isFirstInDoc = group.items[0].isFirst;
            return (
              <SmartEducation
                key={gIdx}
                educations={educations}
                theme={theme}
                title={isFirstInDoc ? 'Education' : 'Education (Continued)'}
              />
            );
          }

          case 'skills':
            return (
              <SmartSkills
                key={gIdx}
                skills={group.items[0].items}
                theme={theme}
                title="Key Skills"
              />
            );

          case 'certification': {
            const certifications = group.items.map((i) => i.item);
            const isFirstInDoc = group.items[0].isFirst;
            return (
              <SmartCertifications
                key={gIdx}
                certifications={certifications}
                theme={theme}
                title={isFirstInDoc ? 'Certifications' : 'Certifications (Continued)'}
              />
            );
          }

          case 'languages':
            return (
              <SmartLanguages
                key={gIdx}
                languages={group.items[0].items}
                theme={theme}
                title="Languages"
              />
            );

          case 'hobbies':
            return (
              <SmartHobbies
                key={gIdx}
                hobbies={group.items[0].items || group.items[0].item}
                theme={theme}
                title="Hobbies & Interests"
              />
            );

          case 'project': {
            const projects = group.items.map((i) => i.item);
            return (
              <SmartProjects
                key={gIdx}
                projects={projects}
                theme={theme}
                title="Projects"
              />
            );
          }

          case 'achievement': {
            const achievements = group.items.map((i) => i.item);
            return (
              <SmartAchievements
                key={gIdx}
                achievements={achievements}
                theme={theme}
                title="Key Achievements"
              />
            );
          }

          case 'reference': {
            const references = group.items.map((i) => i.item);
            return (
              <SmartReferences
                key={gIdx}
                references={references}
                theme={theme}
                title="References"
              />
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}
