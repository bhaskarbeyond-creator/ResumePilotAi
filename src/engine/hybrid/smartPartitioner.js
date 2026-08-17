/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Implements Adaptive Dynamic Split Flow:
 * - Upper Split Hero: Left Sidebar (Header/Skills/Languages) + Right Main Flow (Summary/Experience)
 * - Lower Full-Width Flow: Education, Certifications, Projects, etc. spanning 100% full width
 *   immediately when the sidebar completes, completely eliminating empty white space!
 */

const CHARS_PER_LINE = 68;
const LINE_HEIGHT_PX = 20;

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
  const isModernSplit = !isSingleCol && !isBanner;

  const headerHeight = photo ? 130 : 90;
  const summaryTextLen = getTextLength(summary);
  const summaryHeight = summaryTextLen ? calcTextHeight(summaryTextLen) + 34 : 0;
  
  const skillCount = skills.length;
  const skillsHeight = skillCount ? Math.ceil(skillCount / 3) * 26 + 32 : 0;
  const languagesHeight = languages.length ? Math.ceil(languages.length / 2) * 22 + 28 : 0;

  // Decide if Certifications should go into the Sidebar
  const certsInSidebar = !isSingleCol && skillCount <= 6 && certifications.length <= 3;
  const sidebarTotalHeight = headerHeight + skillsHeight + languagesHeight + (certsInSidebar ? certifications.length * 34 : 0);

  // 1. Build Hero Flow Items (Summary + Experience)
  const heroFlowItems = [];
  if (summary && summary.trim()) {
    heroFlowItems.push({ type: 'summary', content: summary, estHeight: Math.round(summaryHeight) });
  }

  employments.forEach((job, index) => {
    const textLen = getTextLength(job.description);
    const estHeight = Math.round(44 + calcTextHeight(textLen) + (index === 0 ? 32 : 12));
    heroFlowItems.push({ type: 'experience', item: job, index, isFirst: index === 0, estHeight });
  });

  // 2. Build Bottom / Subsequent Flow Items (Education, Certs, Projects, Achievements, References)
  const bottomFlowItems = [];

  // Education
  educations.forEach((edu, index) => {
    const textLen = getTextLength(edu.description);
    const estHeight = Math.round(36 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
    bottomFlowItems.push({ type: 'education', item: edu, index, isFirst: index === 0, estHeight });
  });

  // Skills (in Single-Col mode)
  if (isSingleCol && skills.length) {
    bottomFlowItems.push({ type: 'skills', items: skills, estHeight: Math.round(skillsHeight) });
  }

  // Certifications (2-column responsive grid)
  if ((isSingleCol || !certsInSidebar) && certifications.length) {
    certifications.forEach((cert, index) => {
      const isNewRow = index % 2 === 0;
      const rowHeight = isNewRow ? 36 : 0;
      const titleHeight = index === 0 ? 32 : 0;
      bottomFlowItems.push({
        type: 'certification',
        item: cert,
        index,
        isFirst: index === 0,
        estHeight: rowHeight + titleHeight,
      });
    });
  }

  // Languages (in Single-Col mode)
  if (isSingleCol && languages.length) {
    bottomFlowItems.push({ type: 'languages', items: languages, estHeight: Math.round(languagesHeight) });
  }

  // Projects
  if (projects && projects.length) {
    projects.forEach((proj, index) => {
      const textLen = getTextLength(proj.description);
      const estHeight = Math.round(38 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
      bottomFlowItems.push({ type: 'project', item: proj, index, isFirst: index === 0, estHeight });
    });
  }

  // Achievements
  if (achievements && achievements.length) {
    achievements.forEach((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      bottomFlowItems.push({ type: 'achievement', item: ach, index, isFirst: index === 0, estHeight });
    });
  }

  // References
  if (references && references.length) {
    references.forEach((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      bottomFlowItems.push({ type: 'reference', item: ref, index, isFirst: index === 0, estHeight });
    });
  }

  // Calculate Capacities:
  const TOTAL_PAGE_CAPACITY = 980; // Total usable height on A4 (1123px - padding - footer)
  const P2_CAPACITY = 880;

  if (isModernSplit) {
    const heroHeight = heroFlowItems.reduce((sum, it) => sum + it.estHeight, 0);
    const upperSplitHeight = Math.max(sidebarTotalHeight, heroHeight);
    const remainingP1Capacity = Math.max(0, TOTAL_PAGE_CAPACITY - upperSplitHeight - 30);

    // Pack bottom flow items onto Page 1
    const p1BottomItems = [];
    const overflowItems = [];
    let currentBottomHeight = 0;

    for (let i = 0; i < bottomFlowItems.length; i++) {
      const item = bottomFlowItems[i];
      if (currentBottomHeight + item.estHeight <= remainingP1Capacity || (p1BottomItems.length === 0 && currentBottomHeight === 0 && item.estHeight <= remainingP1Capacity)) {
        p1BottomItems.push(item);
        currentBottomHeight += item.estHeight;
      } else {
        overflowItems.push(item);
      }
    }

    if (overflowItems.length === 0) {
      // All content fits into 1 SINGLE BEAUTIFUL ADAPTIVE PAGE!
      return {
        isMultiPage: false,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            isFirstPage: true,
            isAdaptiveSplit: true,
            sidebar: {
              skills,
              languages,
              certifications: certsInSidebar ? certifications : [],
            },
            heroFlowItems,
            bottomFlowItems: p1BottomItems,
            flowItems: [...heroFlowItems, ...p1BottomItems],
          }
        ]
      };
    }

    // Multi-page: Page 1 has hero + p1BottomItems, subsequent pages partition overflowItems
    const pages = [
      {
        pageNumber: 1,
        isFirstPage: true,
        isAdaptiveSplit: true,
        sidebar: {
          skills,
          languages,
          certifications: certsInSidebar ? certifications : [],
        },
        heroFlowItems,
        bottomFlowItems: p1BottomItems,
        flowItems: [...heroFlowItems, ...p1BottomItems],
      }
    ];

    let currentContinuation = [];
    let currentContHeight = 0;
    let pageNum = 2;

    for (let i = 0; i < overflowItems.length; i++) {
      const item = overflowItems[i];
      if (currentContHeight + item.estHeight <= P2_CAPACITY || currentContinuation.length === 0) {
        currentContinuation.push(item);
        currentContHeight += item.estHeight;
      } else {
        pages.push({
          pageNumber: pageNum,
          isFirstPage: false,
          isAdaptiveSplit: false,
          sidebar: null,
          flowItems: currentContinuation,
        });
        pageNum++;
        currentContinuation = [item];
        currentContHeight = item.estHeight;
      }
    }

    if (currentContinuation.length > 0) {
      pages.push({
        pageNumber: pageNum,
        isFirstPage: false,
        isAdaptiveSplit: false,
        sidebar: null,
        flowItems: currentContinuation,
      });
    }

    return {
      isMultiPage: pages.length > 1,
      totalPages: pages.length,
      pages,
    };
  }

  // Non-split / Single-col fallbacks
  const allFlow = [...heroFlowItems, ...bottomFlowItems];
  const totalFlowHeight = allFlow.reduce((sum, it) => sum + it.estHeight, 0);

  if (totalFlowHeight <= 760) {
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          isFirstPage: true,
          isAdaptiveSplit: false,
          sidebar: isSingleCol ? null : {
            skills,
            languages,
            certifications: certsInSidebar ? certifications : [],
          },
          flowItems: allFlow,
        }
      ]
    };
  }

  // Multi-page standard partition
  const pages = [];
  let currentItems = [];
  let curH = 0;
  let pageNum = 1;

  for (let i = 0; i < allFlow.length; i++) {
    const item = allFlow[i];
    const capacity = pageNum === 1 ? 760 : P2_CAPACITY;
    if (curH + item.estHeight <= capacity || currentItems.length === 0) {
      currentItems.push(item);
      curH += item.estHeight;
    } else {
      pages.push({
        pageNumber: pageNum,
        isFirstPage: pageNum === 1,
        isAdaptiveSplit: false,
        sidebar: (pageNum === 1 && !isSingleCol) ? {
          skills,
          languages,
          certifications: certsInSidebar ? certifications : [],
        } : null,
        flowItems: currentItems,
      });
      pageNum++;
      currentItems = [item];
      curH = item.estHeight;
    }
  }

  if (currentItems.length > 0) {
    pages.push({
      pageNumber: pageNum,
      isFirstPage: pageNum === 1,
      isAdaptiveSplit: false,
      sidebar: (pageNum === 1 && !isSingleCol) ? {
        skills,
        languages,
        certifications: certsInSidebar ? certifications : [],
      } : null,
      flowItems: currentItems,
    });
  }

  return {
    isMultiPage: pages.length > 1,
    totalPages: pages.length,
    pages,
  };
}
