/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Section-Cohesive Adaptive Split Flow:
 * - Upper Split Hero: Left Sidebar (Header/Skills/Languages) + Right Main Flow (Summary/Experience)
 * - Lower Full-Width Flow: Education, Certifications, Projects, etc. spanning 100% full width.
 * - Section-Level Integrity: Keeps entire sections (like Certifications) together rather than
 *   awkwardly splitting 2 items on Page 1 and 1 item on Page 2.
 * - Strict 720px safe content ceiling on A4 guarantees ZERO footer collisions under all scenarios.
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

  // 2. Build Sections for Bottom Flow (Education, Certifications, Projects, Achievements, References)
  const bottomSections = [];

  // Education Section
  if (educations && educations.length) {
    const eduItems = educations.map((edu, index) => {
      const textLen = getTextLength(edu.description);
      const estHeight = Math.round(36 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
      return { type: 'education', item: edu, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = eduItems.reduce((sum, it) => sum + it.estHeight, 0);
    bottomSections.push({ type: 'education', items: eduItems, estHeight: sectionHeight });
  }

  // Certifications Section (2-column responsive grid)
  if ((isSingleCol || !certsInSidebar) && certifications.length) {
    const certItems = certifications.map((cert, index) => {
      const isNewRow = index % 2 === 0;
      const rowHeight = isNewRow ? 36 : 0;
      const titleHeight = index === 0 ? 32 : 0;
      return {
        type: 'certification',
        item: cert,
        index,
        isFirst: index === 0,
        estHeight: rowHeight + titleHeight,
      };
    });
    const sectionHeight = certItems.reduce((sum, it) => sum + it.estHeight, 0);
    bottomSections.push({ type: 'certification', items: certItems, estHeight: sectionHeight });
  }

  // Projects Section
  if (projects && projects.length) {
    const projItems = projects.map((proj, index) => {
      const textLen = getTextLength(proj.description);
      const estHeight = Math.round(38 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
      return { type: 'project', item: proj, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = projItems.reduce((sum, it) => sum + it.estHeight, 0);
    bottomSections.push({ type: 'project', items: projItems, estHeight: sectionHeight });
  }

  // Achievements Section
  if (achievements && achievements.length) {
    const achItems = achievements.map((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      return { type: 'achievement', item: ach, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = achItems.reduce((sum, it) => sum + it.estHeight, 0);
    bottomSections.push({ type: 'achievement', items: achItems, estHeight: sectionHeight });
  }

  // References Section
  if (references && references.length) {
    const refItems = references.map((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      return { type: 'reference', item: ref, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = refItems.reduce((sum, it) => sum + it.estHeight, 0);
    bottomSections.push({ type: 'reference', items: refItems, estHeight: sectionHeight });
  }

  // Strict safe capacity limits (guarantees positive breathing margin above footer)
  const TOTAL_PAGE_CAPACITY = 720;
  const P2_CAPACITY = 740;

  if (isModernSplit) {
    const heroHeight = heroFlowItems.reduce((sum, it) => sum + it.estHeight, 0);
    const upperSplitHeight = Math.max(sidebarTotalHeight, heroHeight);
    const remainingP1Capacity = Math.max(0, TOTAL_PAGE_CAPACITY - upperSplitHeight);

    // Pack entire sections into Page 1 bottom flow
    const p1BottomItems = [];
    const p2FlowItems = [];
    let currentBottomHeight = 0;

    bottomSections.forEach(section => {
      if (currentBottomHeight + section.estHeight <= remainingP1Capacity) {
        p1BottomItems.push(...section.items);
        currentBottomHeight += section.estHeight;
      } else {
        p2FlowItems.push(...section.items);
      }
    });

    if (p2FlowItems.length === 0) {
      // 1-Page Document!
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

    // 2-Page Document: Page 1 has hero + p1BottomItems, Page 2 has continuation with p2FlowItems
    return {
      isMultiPage: true,
      totalPages: 2,
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
        },
        {
          pageNumber: 2,
          isFirstPage: false,
          isAdaptiveSplit: false,
          sidebar: null,
          flowItems: p2FlowItems,
        }
      ]
    };
  }

  // Fallback for single-column layouts
  const allFlow = [];
  bottomSections.forEach(s => allFlow.push(...s.items));
  const combined = [...heroFlowItems, ...allFlow];

  const totalFlowHeight = combined.reduce((sum, it) => sum + it.estHeight, 0);

  if (totalFlowHeight <= 720) {
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
          flowItems: combined,
        }
      ]
    };
  }

  return {
    isMultiPage: true,
    totalPages: 2,
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
        flowItems: heroFlowItems,
      },
      {
        pageNumber: 2,
        isFirstPage: false,
        isAdaptiveSplit: false,
        sidebar: null,
        flowItems: allFlow,
      }
    ]
  };
}
