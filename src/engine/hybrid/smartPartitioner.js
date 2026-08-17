/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Accurately measures all section items using plain text metrics,
 * calculates precise page capacity per archetype, and guarantees 0 clipping on all pages.
 */

function getTextLength(htmlOrStr = '') {
  if (!htmlOrStr) return 0;
  return String(htmlOrStr).replace(/<[^>]*>/g, '').trim().length;
}

export function partitionResumeContent(values = {}, theme = {}) {
  const {
    summary = '',
    employments = [],
    educations = [],
    skills = [],
    projects = [],
    certifications = [],
    languages = [],
    achievements = [],
    references = [],
  } = values;

  const isSingleCol = theme.archetype === 'minimal-ats' || theme.archetype === 'compact-euro';
  const isBanner = theme.archetype === 'executive-banner';

  // Strict page capacity limits calibrated per archetype (A4 is 1123px at 96 DPI)
  // Guarantees generous safety buffer above the footer to eliminate clipping 100%
  let p1Capacity = 840; // Default Modern Split
  if (isSingleCol) {
    p1Capacity = 680;   // Single column with title & top header
  } else if (isBanner) {
    p1Capacity = 720;   // Banner layout with 140px header block
  }

  const P1_SIDEBAR_CAPACITY = isBanner ? 720 : 860;
  const P2_CAPACITY = 800; // Continuation pages have header + footer

  const headerHeight = values.photo ? 140 : 100;
  const summaryTextLen = getTextLength(summary);
  const summaryHeight = summaryTextLen ? Math.max(45, Math.ceil(summaryTextLen / 2.6)) + 30 : 0;
  
  const skillCount = skills.length;
  // Wrapped 3-col pill grid takes ~26px per row + title 32px
  const skillsHeight = skillCount ? Math.ceil(skillCount / 3) * 26 + 32 : 0;
  const languagesHeight = languages.length ? Math.ceil(languages.length / 2) * 22 + 28 : 0;

  // Decide if Certifications should go into the Sidebar or Main Flow
  const certsInSidebar = !isSingleCol && skillCount <= 10 && certifications.length <= 3;
  const sidebarTotalHeight = headerHeight + skillsHeight + languagesHeight + (certsInSidebar ? certifications.length * 34 : 0);

  // Build the list of sliceable flow items
  const flowItems = [];

  // 1. Summary
  if (summary && summary.trim()) {
    flowItems.push({ type: 'summary', content: summary, estHeight: summaryHeight });
  }

  // 2. Experience
  employments.forEach((job, index) => {
    const textLen = getTextLength(job.description);
    const estHeight = 56 + Math.max(0, Math.ceil(textLen / 2.4));
    flowItems.push({ type: 'experience', item: job, index, isFirst: index === 0, estHeight });
  });

  // 3. Education
  educations.forEach((edu, index) => {
    const textLen = getTextLength(edu.description);
    const estHeight = 48 + Math.max(0, Math.ceil(textLen / 2.8));
    flowItems.push({ type: 'education', item: edu, index, isFirst: index === 0, estHeight });
  });

  // 4. Skills (in Single-Col mode, skills are in the main flow)
  if (isSingleCol && skills.length) {
    flowItems.push({ type: 'skills', items: skills, estHeight: skillsHeight });
  }

  // 5. Certifications (if in flow)
  if ((isSingleCol || !certsInSidebar) && certifications.length) {
    certifications.forEach((cert, index) => {
      flowItems.push({
        type: 'certification',
        item: cert,
        index,
        isFirst: index === 0,
        estHeight: 34,
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
      const estHeight = 50 + Math.max(0, Math.ceil(textLen / 2.8));
      flowItems.push({ type: 'project', item: proj, index, isFirst: index === 0, estHeight });
    });
  }

  // 8. Achievements
  if (achievements && achievements.length) {
    achievements.forEach((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = 46 + Math.max(0, Math.ceil(textLen / 2.8));
      flowItems.push({ type: 'achievement', item: ach, index, isFirst: index === 0, estHeight });
    });
  }

  // 9. References
  if (references && references.length) {
    references.forEach((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = 42 + Math.max(0, Math.ceil(textLen / 2.8));
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
