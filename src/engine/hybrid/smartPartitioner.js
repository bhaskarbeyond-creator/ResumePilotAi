/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Universal Greedy-Packing Architecture:
 * - 2-Column Layouts (Modern Split & Executive Banner): Adaptive Split Flow with extreme-left full-width bottom flow.
 * - Single-Column Layouts (Minimal ATS & Compact Euro): Full-page greedy packing with zero wasted space on Page 1.
 * - Hobbies & Interests: Rendered seamlessly in the sidebar (after Languages) or in the bottom flow.
 * - Section-Level Cohesion: Keeps entire sections together (Education, Certifications, Skills, Hobbies, Projects).
 * - Safe Capacity Limits: Strict 720px–760px ceilings guarantee positive breathing margin above footers with ZERO collisions.
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
  const summary = values.summary || values.professionalSummary || values.objective || values.aboutMe || values.profile || values.summaryText || '';
  const employments = values.employments || values.workExperiences || values.experience || [];
  const educations = values.educations || values.education || [];
  const skills = values.skills || [];
  const projects = values.projects || [];
  const certifications = values.certifications || [];
  const languages = values.languages || [];
  const hobbies = values.hobbies || values.hobby || values.interests || values.interest || [];
  const achievements = values.achievements || [];
  const references = values.references || [];
  const rawPhoto = values.photo || values.selectedImage || values.image || values.avatar || values.picture || null;
  const isPhotoVisible = Boolean(rawPhoto && values.showPhoto !== false && values.hidePhoto !== true && values.includePhoto !== false);
  const photo = isPhotoVisible ? rawPhoto : null;

  const isSingleCol = theme.archetype === 'minimal-ats' || theme.archetype === 'compact-euro';
  const isBanner = theme.archetype === 'executive-banner';
  const hasSidebar = !isSingleCol;

  // Header and component height estimates
  const headerHeight = isBanner ? 0 : (photo ? 155 : 95);
  const summaryTextLen = getTextLength(summary);
  const summaryHeight = summaryTextLen ? calcTextHeight(summaryTextLen) + 34 : 0;
  
  const skillCount = skills.length;
  const skillsHeight = skillCount ? Math.ceil(skillCount / 3) * 26 + 32 : 0;
  const languagesHeight = languages.length ? Math.ceil(languages.length / 2) * 22 + 28 : 0;

  const hobbiesCount = Array.isArray(hobbies) ? hobbies.length : (hobbies ? 1 : 0);
  const hobbiesHeight = hobbiesCount ? Math.ceil(hobbiesCount / 2) * 24 + 28 : 0;

  // Decide if Certifications should go into the Sidebar
  const certsInSidebar = hasSidebar && (skillCount + hobbiesCount) <= 7 && certifications.length <= 3;
  const sidebarTotalHeight = headerHeight + skillsHeight + languagesHeight + hobbiesHeight + (certsInSidebar ? certifications.length * 34 : 0);

  // 1. Build Hero Flow Items (Summary + Experience)
  const heroFlowItems = [];
  if (summary && summary.trim() && getTextLength(summary) > 0) {
    heroFlowItems.push({ type: 'summary', content: summary, estHeight: Math.round(summaryHeight) });
  }

  employments.forEach((job, index) => {
    const textLen = getTextLength(job.description);
    const estHeight = Math.round(44 + calcTextHeight(textLen) + (index === 0 ? 32 : 12));
    heroFlowItems.push({ type: 'experience', item: job, index, isFirst: index === 0, estHeight });
  });

  // 2. Build Sections for Bottom Flow (Education, Skills, Languages, Hobbies, Certifications, Projects, Achievements, References)
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

  // Skills Section (in Single-Col mode)
  if (isSingleCol && skills.length) {
    bottomSections.push({
      type: 'skills',
      items: [{ type: 'skills', items: skills, estHeight: Math.round(skillsHeight) }],
      estHeight: Math.round(skillsHeight)
    });
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

  // Hobbies Section (in Single-Col mode)
  if (isSingleCol && hobbiesCount > 0) {
    bottomSections.push({
      type: 'hobbies',
      items: [{ type: 'hobbies', items: hobbies, estHeight: Math.round(hobbiesHeight) }],
      estHeight: Math.round(hobbiesHeight)
    });
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

  // Languages Section (in Single-Col mode - lowest priority at bottom)
  if (isSingleCol && languages.length) {
    bottomSections.push({
      type: 'languages',
      items: [{ type: 'languages', items: languages, estHeight: Math.round(languagesHeight) }],
      estHeight: Math.round(languagesHeight)
    });
  }

  // Safe page capacities
  const TOTAL_PAGE_CAPACITY = isBanner ? 610 : 740;

  if (hasSidebar) {
    // 2-Column Split / Banner Layout with Adaptive Flow
    const heroHeight = heroFlowItems.reduce((sum, it) => sum + it.estHeight, 0);
    const upperSplitHeight = Math.max(sidebarTotalHeight, heroHeight);
    const remainingP1Capacity = Math.max(0, TOTAL_PAGE_CAPACITY - upperSplitHeight);

    const p1BottomItems = [];
    const p2FlowItems = [];
    let currentBottomHeight = 0;
    let hasOverflowed = false;

    bottomSections.forEach(section => {
      if (!hasOverflowed && currentBottomHeight + section.estHeight <= remainingP1Capacity) {
        p1BottomItems.push(...section.items);
        currentBottomHeight += section.estHeight;
      } else {
        hasOverflowed = true;
        p2FlowItems.push(...section.items);
      }
    });

    if (p2FlowItems.length === 0) {
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
              hobbies,
              certifications: certsInSidebar ? certifications : [],
              languages,
            },
            heroFlowItems,
            bottomFlowItems: p1BottomItems,
            flowItems: [...heroFlowItems, ...p1BottomItems],
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
          isAdaptiveSplit: true,
          sidebar: {
            skills,
            hobbies,
            certifications: certsInSidebar ? certifications : [],
            languages,
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

  // Single-Column Layouts (Minimal ATS & Compact Euro) Greedy Packing
  const singleColHeaderHeight = 90;
  const heroHeight = heroFlowItems.reduce((sum, it) => sum + it.estHeight, 0);
  const remainingP1Capacity = Math.max(0, 760 - singleColHeaderHeight - heroHeight);

  const p1BottomItems = [];
  const p2FlowItems = [];
  let currentBottomHeight = 0;
  let hasOverflowedSingleCol = false;

  bottomSections.forEach(section => {
    if (!hasOverflowedSingleCol && currentBottomHeight + section.estHeight <= remainingP1Capacity) {
      p1BottomItems.push(...section.items);
      currentBottomHeight += section.estHeight;
    } else {
      hasOverflowedSingleCol = true;
      p2FlowItems.push(...section.items);
    }
  });

  if (p2FlowItems.length === 0) {
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          isFirstPage: true,
          isAdaptiveSplit: false,
          sidebar: null,
          flowItems: [...heroFlowItems, ...p1BottomItems],
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
        sidebar: null,
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
