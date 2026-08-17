/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Intelligently decides whether a resume fits on 1 single page (with optimal density)
 * or partitions items across discrete pages without duplicate rendering.
 */

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

  // Estimate heights in pixels (based on typography, line-height, and padding)
  const headerHeight = values.photo ? 140 : 100;
  const summaryHeight = summary ? Math.max(60, Math.ceil(summary.length / 1.8)) : 0;
  
  const skillCount = skills.length;
  // With multi-column wrap (3 skills per row), height is compact:
  const skillsHeight = skillCount ? Math.ceil(skillCount / 3) * 28 + 40 : 0;
  const languagesHeight = languages.length ? languages.length * 24 + 35 : 0;
  const certsHeight = certifications.length ? certifications.length * 36 + 35 : 0;

  // Sidebar total height
  const sidebarTotalHeight = headerHeight + skillsHeight + languagesHeight + certsHeight;

  // Measure individual flow items
  const flowItems = [];

  if (summary && summary.trim()) {
    flowItems.push({ type: 'summary', content: summary, estHeight: summaryHeight + 30 });
  }

  employments.forEach((job, index) => {
    const descLen = (job.description || '').length;
    const estHeight = 55 + Math.max(0, Math.ceil(descLen / 1.5));
    flowItems.push({ type: 'experience', item: job, index, isFirst: index === 0, estHeight });
  });

  educations.forEach((edu, index) => {
    const descLen = (edu.description || '').length;
    const estHeight = 45 + Math.max(0, Math.ceil(descLen / 2));
    flowItems.push({ type: 'education', item: edu, index, isFirst: index === 0, estHeight });
  });

  if (projects && projects.length) {
    projects.forEach((proj, index) => {
      const descLen = (proj.description || '').length;
      const estHeight = 50 + Math.max(0, Math.ceil(descLen / 2));
      flowItems.push({ type: 'project', item: proj, index, isFirst: index === 0, estHeight });
    });
  }

  if (achievements && achievements.length) {
    achievements.forEach((ach, index) => {
      flowItems.push({ type: 'achievement', item: ach, index, isFirst: index === 0, estHeight: 50 });
    });
  }

  if (references && references.length) {
    references.forEach((ref, index) => {
      flowItems.push({ type: 'reference', item: ref, index, isFirst: index === 0, estHeight: 45 });
    });
  }

  const totalFlowHeight = flowItems.reduce((sum, item) => sum + item.estHeight, 0);

  // Available height on Page 1 (1123px - margins/header)
  // For 2-column layouts, the main column has ~1020px available
  // For single-column layouts, page 1 has ~960px available
  const p1Capacity = isSingleCol ? 960 : 1020;
  const p2Capacity = 1000; // Continuation pages have header + footer

  // Check if everything fits comfortably on 1 Single Page!
  const maxColumnHeight = isSingleCol 
    ? (headerHeight + skillsHeight + languagesHeight + certsHeight + totalFlowHeight)
    : Math.max(sidebarTotalHeight, totalFlowHeight);

  if (maxColumnHeight <= 1060) {
    // Fits on exactly 1 single page!
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          isFirstPage: true,
          sidebar: { skills, languages, certifications },
          flowItems: flowItems,
        }
      ]
    };
  }

  // Multi-Page: Partition flow items across pages
  const pages = [];
  let currentFlowItems = [];
  let currentHeight = 0;
  let pageNum = 1;

  for (let i = 0; i < flowItems.length; i++) {
    const item = flowItems[i];
    const capacity = pageNum === 1 ? p1Capacity : p2Capacity;

    if (currentHeight + item.estHeight <= capacity || currentFlowItems.length === 0) {
      currentFlowItems.push(item);
      currentHeight += item.estHeight;
    } else {
      // Seal current page
      pages.push({
        pageNumber: pageNum,
        isFirstPage: pageNum === 1,
        sidebar: pageNum === 1 ? { skills, languages, certifications } : null,
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
      sidebar: pageNum === 1 ? { skills, languages, certifications } : null,
      flowItems: currentFlowItems,
    });
  }

  return {
    isMultiPage: pages.length > 1,
    totalPages: pages.length,
    pages,
  };
}
