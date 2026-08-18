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
import SmartCustomSection from './SmartCustomSection';

export default function SmartFlowRenderer({ flowItems = [], theme = {}, isContinuation = false }) {
  if (!flowItems || !flowItems.length) return null;

  // Group consecutive flow items by type. Custom sections also key on
  // sectionId so two independently titled custom blocks cannot collapse.
  const groups = [];
  let currentGroup = null;

  flowItems.forEach((item) => {
    const key = item.sectionId ? `${item.type}:${item.sectionId}` : item.type;
    if (!currentGroup || currentGroup.key !== key) {
      currentGroup = { type: item.type, key, items: [], sectionTitle: item.sectionTitle };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  });

  return (
    <div className="smart-flow-container">
      {groups.map((group, gIdx) => {
        switch (group.type) {
          case 'summary':
            // A long summary is partitioned into several blocks; render every
            // block that landed on this page, not just the first.
            return (
              <SmartSummary
                key={gIdx}
                summary={group.items.map((item) => item.content).join('')}
                title={group.items[0].isFirst === false || isContinuation ? 'Summary (Continued)' : 'Professional Summary'}
                theme={theme}
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

          case 'skills': {
            // Flatten skills from all chunk items on this page (handles both the
            // legacy single-block path and the new chunked path from smartPartitioner).
            const skillsList = group.items.flatMap((i) => i.items || []);
            const isFirstSkillsBlock = group.items[0].isFirst !== false;
            return (
              <SmartSkills
                key={gIdx}
                skills={skillsList}
                theme={theme}
                title={isFirstSkillsBlock ? 'Key Skills' : 'Key Skills (Continued)'}
              />
            );
          }

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

          case 'custom': {
            const customItems = group.items.map((i) => i.item);
            const heading = group.sectionTitle || group.items[0]?.sectionTitle || 'Additional Information';
            return (
              <SmartCustomSection
                key={gIdx}
                items={customItems}
                theme={theme}
                title={heading}
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
