/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Accurately calibrated with typographic metrics:
 * - 72 characters per line in 480px main column
 * - 19px per text line at 12.5px font-size with 1.55 line-height
 * - 2-column grid packing for certifications
 * - Seamless 1-page packing for standard resumes, clean 2-page flow for senior profiles
 */

const CHARS_PER_LINE = 72;
const LINE_HEIGHT_PX = 19;

function getTextLength(htmlOrStr = '') {
  if (!htmlOrStr) return 0;
  return String(htmlOrStr).replace(/<[^>]*>/g, '').trim().length;
}

function calcTextHeight(textLen = 0) {
  if (!textLen) return 0;
  const lines = Math.max(1, Math.ceil(textLen / CHARS_PER_LINE));
  return lines * LINE_HEIGHT_PX;
}

export function partitionResumeContent(values = {}, theme = {}) {
  const summary = values.summary || '';
  const employments = values.employments || values.workExperiences || [];
  const educations = values.educations || values.education || [];
  const skills = values.skills || [];
  const projects = values.projects || [];
  const certifications = values.certifications || [];
  const languages = values.languages || [];
  const achievements = values.achievements || [];
  const references = values.references || [];
  const photo = values.photo || values.selectedImage || values.image || values.avatar || values.picture || null;

  const isSingleCol = theme.archetype === 'minimal-ats' || theme.archetype === 'compact-euro';
  const isBanner = theme.archetype === 'executive-banner';

  // Usable Page 1 main content capacity in real DOM (Total page 1123px - padding - footer)
  let p1Capacity = 850; // Modern Split
  if (isSingleCol) {
    p1Capacity = 780;   // Single column
  } else if (isBanner) {
    p1Capacity = 720;   // Banner layout (accounting for top banner)
  }

  const P1_SIDEBAR_CAPACITY = isBanner ? 700 : 860;
  const P2_CAPACITY = 850;

  const headerHeight = photo ? 130 : 90;
  const summaryTextLen = getTextLength(summary);
  const summaryHeight = summaryTextLen ? calcTextHeight(summaryTextLen) + 32 : 0;
  
  const skillCount = skills.length;
  const skillsHeight = skillCount ? Math.ceil(skillCount / 3) * 26 + 30 : 0;
  const languagesHeight = languages.length ? Math.ceil(languages.length / 2) * 22 + 28 : 0;

  // Decide if Certifications should go into the Sidebar or Main Flow
  const certsInSidebar = !isSingleCol && skillCount <= 8 && certifications.length <= 3;
  const sidebarTotalHeight = headerHeight + skillsHeight + languagesHeight + (certsInSidebar ? certifications.length * 30 : 0);

  // Build the list of sliceable flow items
  const flowItems = [];

  // 1. Summary
  if (summary && summary.trim()) {
    flowItems.push({ type: 'summary', content: summary, estHeight: summaryHeight });
  }

  // 2. Experience
  employments.forEach((job, index) => {
    const textLen = getTextLength(job.description);
    const estHeight = 42 + calcTextHeight(textLen) + (index === 0 ? 32 : 12);
    flowItems.push({ type: 'experience', item: job, index, isFirst: index === 0, estHeight });
  });

  // 3. Education
  educations.forEach((edu, index) => {
    const textLen = getTextLength(edu.description);
    const estHeight = 38 + calcTextHeight(textLen) + (index === 0 ? 32 : 12);
    flowItems.push({ type: 'education', item: edu, index, isFirst: index === 0, estHeight });
  });

  // 4. Skills (in Single-Col mode)
  if (isSingleCol && skills.length) {
    flowItems.push({ type: 'skills', items: skills, estHeight: skillsHeight });
  }

  // 5. Certifications (2-column responsive grid)
  if ((isSingleCol || !certsInSidebar) && certifications.length) {
    certifications.forEach((cert, index) => {
      // In 2-col grid, every odd item opens a new row (26px), even item shares row (0px height increase)
      const isNewRow = index % 2 === 0;
      const rowHeight = isNewRow ? 26 : 0;
      const titleHeight = index === 0 ? 32 : 0;
      flowItems.push({
        type: 'certification',
        item: cert,
        index,
        isFirst: index === 0,
        estHeight: rowHeight + titleHeight,
      });
    });
  }

  // 6. Languages (in Single-Col mode)
  if (isSingleCol && languages.length) {
    flowItems.push({ type: 'languages', items: languages, estHeight: languagesHeight });
  }

  // 7. Projects
  if (projects && projects.length) {
    projects.forEach((proj, index) => {
      const textLen = getTextLength(proj.description);
      const estHeight = 40 + calcTextHeight(textLen) + (index === 0 ? 32 : 10);
      flowItems.push({ type: 'project', item: proj, index, isFirst: index === 0, estHeight });
    });
  }

  // 8. Achievements
  if (achievements && achievements.length) {
    achievements.forEach((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = 34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8);
      flowItems.push({ type: 'achievement', item: ach, index, isFirst: index === 0, estHeight });
    });
  }

  // 9. References
  if (references && references.length) {
    references.forEach((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = 34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8);
      flowItems.push({ type: 'reference', item: ref, index, isFirst: index === 0, estHeight });
    });
  }

  const totalFlowHeight = flowItems.reduce((sum, item) => sum + item.estHeight, 0);

  // Single-Page Decision:
  const fitsOnOnePage = isSingleCol
    ? (totalFlowHeight <= p1Capacity)
    : (sidebarTotalHeight <= P1_SIDEBAR_CAPACITY && totalFlowHeight <= p1Capacity);

  if (fitsOnOnePage) {
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          isFirstPage: true,
          sidebar: isSingleCol ? null : {
            skills,
            languages,
            certifications: certsInSidebar ? certifications : [],
          },
          flowItems: flowItems,
        }
      ]
    };
  }

  // Multi-Page Decision: Partition flow items across discrete pages
  const pages = [];
  let currentFlowItems = [];
  let currentHeight = 0;
  let pageNum = 1;

  for (let i = 0; i < flowItems.length; i++) {
    const item = flowItems[i];
    const capacity = pageNum === 1 ? p1Capacity : P2_CAPACITY;

    if (currentHeight + item.estHeight <= capacity || currentFlowItems.length === 0) {
      currentFlowItems.push(item);
      currentHeight += item.estHeight;
    } else {
      // Seal current page
      pages.push({
        pageNumber: pageNum,
        isFirstPage: pageNum === 1,
        sidebar: (pageNum === 1 && !isSingleCol) ? {
          skills,
          languages,
          certifications: certsInSidebar ? certifications : [],
        } : null,
        flowItems: currentFlowItems,
      });

      pageNum++;
      currentFlowItems = [item];
      currentHeight = item.estHeight;
    }
  }

  if (currentFlowItems.length > 0) {
    pages.push({
      pageNumber: pageNum,
      isFirstPage: pageNum === 1,
      sidebar: (pageNum === 1 && !isSingleCol) ? {
        skills,
        languages,
        certifications: certsInSidebar ? certifications : [],
      } : null,
      flowItems: currentFlowItems,
    });
  }

  return {
    isMultiPage: pages.length > 1,
    totalPages: pages.length,
    pages,
  };
}
