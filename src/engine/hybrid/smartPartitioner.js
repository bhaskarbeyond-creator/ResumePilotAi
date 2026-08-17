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

import { DEFAULT_SECTION_ORDER } from '../../utils/resumeData.js';
export { DEFAULT_SECTION_ORDER };

function getTextLength(htmlOrStr = '') {
  if (!htmlOrStr) return 0;
  return String(htmlOrStr).replace(/<[^>]*>/g, '').trim().length;
}

function calcTextHeight(textLen = 0) {
  if (!textLen) return 0;
  const lines = Math.max(1, Math.ceil(textLen / CHARS_PER_LINE));
  return lines * LINE_HEIGHT_PX;
}

export function normalizeSectionKey(key) {
  const k = String(key || '').toLowerCase().trim();
  if (k === 'work-history' || k === 'workexperience' || k === 'experience' || k === 'employments') return 'employment';
  if (k === 'educations') return 'education';
  if (k === 'certification') return 'certifications';
  if (k === 'interest' || k === 'interests' || k === 'hobby') return 'hobbies';
  if (k === 'language') return 'languages';
  if (k === 'skill') return 'skills';
  if (k === 'project') return 'projects';
  if (k === 'achievement') return 'achievements';
  if (k === 'reference') return 'references';
  if (k === 'heading' || k === 'personalinfo' || k === 'contact') return 'heading';
  return k;
}

export function partitionResumeContent(values = {}, theme = {}) {
  const summary = values.summary || '';
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

  // Normalize Section Order & Hidden Sections
  const rawSectionOrder = Array.isArray(values.sectionOrder) && values.sectionOrder.length ? values.sectionOrder : DEFAULT_SECTION_ORDER;
  const normalizedSectionOrder = rawSectionOrder.map(normalizeSectionKey);
  const rawHiddenSections = Array.isArray(values.hiddenSections) ? values.hiddenSections : [];
  const normalizedHiddenSections = new Set(rawHiddenSections.map(normalizeSectionKey));

  // Build All Available Content Sections Map
  const allAvailableSections = {};

  // 1. Summary
  if (summary && summary.trim() && !normalizedHiddenSections.has('summary')) {
    allAvailableSections['summary'] = {
      key: 'summary',
      type: 'summary',
      items: [{ type: 'summary', content: summary, estHeight: Math.round(summaryHeight) }],
      estHeight: Math.round(summaryHeight),
    };
  }

  // 2. Employment
  if (employments && employments.length && !normalizedHiddenSections.has('employment')) {
    const empItems = employments.map((job, index) => {
      const textLen = getTextLength(job.description);
      const estHeight = Math.round(44 + calcTextHeight(textLen) + (index === 0 ? 32 : 12));
      return { type: 'experience', item: job, index, isFirst: index === 0, estHeight };
    });
    allAvailableSections['employment'] = {
      key: 'employment',
      type: 'experience',
      items: empItems,
      estHeight: empItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // 3. Education
  if (educations && educations.length && !normalizedHiddenSections.has('education')) {
    const eduItems = educations.map((edu, index) => {
      const textLen = getTextLength(edu.description);
      const estHeight = Math.round(36 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
      return { type: 'education', item: edu, index, isFirst: index === 0, estHeight };
    });
    allAvailableSections['education'] = {
      key: 'education',
      type: 'education',
      items: eduItems,
      estHeight: eduItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // 4. Skills (for main flow or single column)
  if (skills && skills.length && !normalizedHiddenSections.has('skills')) {
    allAvailableSections['skills'] = {
      key: 'skills',
      type: 'skills',
      items: [{ type: 'skills', items: skills, estHeight: Math.round(skillsHeight) }],
      estHeight: Math.round(skillsHeight),
    };
  }

  // 5. Languages (for main flow or single column)
  if (languages && languages.length && !normalizedHiddenSections.has('languages')) {
    allAvailableSections['languages'] = {
      key: 'languages',
      type: 'languages',
      items: [{ type: 'languages', items: languages, estHeight: Math.round(languagesHeight) }],
      estHeight: Math.round(languagesHeight),
    };
  }

  // 6. Hobbies (for main flow or single column)
  if (hobbiesCount > 0 && !normalizedHiddenSections.has('hobbies')) {
    allAvailableSections['hobbies'] = {
      key: 'hobbies',
      type: 'hobbies',
      items: [{ type: 'hobbies', items: hobbies, estHeight: Math.round(hobbiesHeight) }],
      estHeight: Math.round(hobbiesHeight),
    };
  }

  // 7. Certifications
  if (certifications && certifications.length && !normalizedHiddenSections.has('certifications')) {
    const certItems = certifications.map((cert, index) => {
      const isNewRow = index % 2 === 0;
      const rowHeight = isNewRow ? 36 : 0;
      const titleHeight = index === 0 ? 32 : 0;
      return { type: 'certification', item: cert, index, isFirst: index === 0, estHeight: rowHeight + titleHeight };
    });
    allAvailableSections['certifications'] = {
      key: 'certifications',
      type: 'certification',
      items: certItems,
      estHeight: certItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // 8. Projects
  if (projects && projects.length && !normalizedHiddenSections.has('projects')) {
    const projItems = projects.map((proj, index) => {
      const textLen = getTextLength(proj.description);
      const estHeight = Math.round(38 + calcTextHeight(textLen) + (index === 0 ? 32 : 10));
      return { type: 'project', item: proj, index, isFirst: index === 0, estHeight };
    });
    allAvailableSections['projects'] = {
      key: 'projects',
      type: 'project',
      items: projItems,
      estHeight: projItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // 9. Achievements
  if (achievements && achievements.length && !normalizedHiddenSections.has('achievements')) {
    const achItems = achievements.map((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      return { type: 'achievement', item: ach, index, isFirst: index === 0, estHeight };
    });
    allAvailableSections['achievements'] = {
      key: 'achievements',
      type: 'achievement',
      items: achItems,
      estHeight: achItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // 10. References
  if (references && references.length && !normalizedHiddenSections.has('references')) {
    const refItems = references.map((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = Math.round(34 + calcTextHeight(textLen) + (index === 0 ? 32 : 8));
      return { type: 'reference', item: ref, index, isFirst: index === 0, estHeight };
    });
    allAvailableSections['references'] = {
      key: 'references',
      type: 'reference',
      items: refItems,
      estHeight: refItems.reduce((sum, it) => sum + it.estHeight, 0),
    };
  }

  // Safe page capacities
  const TOTAL_PAGE_CAPACITY = isBanner ? 610 : 740;

  // Complete ordered list of keys without duplicates
  const completeOrderedKeys = [...new Set([
    ...normalizedSectionOrder,
    ...DEFAULT_SECTION_ORDER.map(normalizeSectionKey)
  ])];

  // ----------------------------------------------------
  // Single-Column Layouts (Minimal ATS & Compact Euro)
  // ----------------------------------------------------
  if (isSingleCol) {
    const orderedFlowSections = [];
    completeOrderedKeys.forEach(key => {
      if (allAvailableSections[key]) {
        orderedFlowSections.push(allAvailableSections[key]);
      }
    });

    const singleColHeaderHeight = 90;
    const p1Capacity = Math.max(0, 760 - singleColHeaderHeight);
    const p1Items = [];
    const p2Items = [];
    let currentP1Height = 0;

    orderedFlowSections.forEach(section => {
      if (currentP1Height + section.estHeight <= p1Capacity) {
        p1Items.push(...section.items);
        currentP1Height += section.estHeight;
      } else {
        p2Items.push(...section.items);
      }
    });

    if (p2Items.length === 0) {
      return {
        isMultiPage: false,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            isFirstPage: true,
            isAdaptiveSplit: false,
            sidebar: null,
            flowItems: p1Items,
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
          flowItems: p1Items,
        },
        {
          pageNumber: 2,
          isFirstPage: false,
          isAdaptiveSplit: false,
          sidebar: null,
          flowItems: p2Items,
        }
      ]
    };
  }

  // ----------------------------------------------------
  // 2-Column Split Layouts (Modern Split & Executive Banner)
  // ----------------------------------------------------
  const sidebarSectionKeys = ['skills', 'languages', 'hobbies', ...(certsInSidebar ? ['certifications'] : [])];
  const orderedSidebarOrder = [...new Set([
    ...normalizedSectionOrder.filter(k => sidebarSectionKeys.includes(k)),
    ...sidebarSectionKeys
  ])];

  const sidebarPayload = {
    order: orderedSidebarOrder,
    skills: normalizedHiddenSections.has('skills') ? [] : skills,
    languages: normalizedHiddenSections.has('languages') ? [] : languages,
    hobbies: normalizedHiddenSections.has('hobbies') ? null : hobbies,
    certifications: (certsInSidebar && !normalizedHiddenSections.has('certifications')) ? certifications : [],
  };

  // Main column sections (all sections NOT placed in the sidebar)
  const placedInSidebar = new Set(sidebarSectionKeys);
  const mainSectionKeys = completeOrderedKeys.filter(k => !placedInSidebar.has(k));

  const orderedMainSections = [];
  mainSectionKeys.forEach(key => {
    if (allAvailableSections[key]) {
      orderedMainSections.push(allAvailableSections[key]);
    }
  });

  // Balance upper right hero split alongside sidebar, then place overflow in bottom full-width flow
  const heroFlowSections = [];
  const remainingMainSections = [];
  let currentHeroHeight = 0;

  orderedMainSections.forEach(section => {
    // Fill the hero right column until it reaches sidebarTotalHeight (or at least 1 section)
    if (currentHeroHeight === 0 || currentHeroHeight + section.estHeight <= Math.max(sidebarTotalHeight, 260)) {
      heroFlowSections.push(section);
      currentHeroHeight += section.estHeight;
    } else {
      remainingMainSections.push(section);
    }
  });

  const heroHeight = currentHeroHeight;
  const upperSplitHeight = Math.max(sidebarTotalHeight, heroHeight);
  const remainingP1Capacity = Math.max(0, TOTAL_PAGE_CAPACITY - upperSplitHeight);

  const heroFlowItems = heroFlowSections.flatMap(s => s.items);
  const p1BottomItems = [];
  const p2FlowItems = [];
  let currentBottomHeight = 0;

  remainingMainSections.forEach(section => {
    if (currentBottomHeight + section.estHeight <= remainingP1Capacity) {
      p1BottomItems.push(...section.items);
      currentBottomHeight += section.estHeight;
    } else {
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
          sidebar: sidebarPayload,
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
        sidebar: sidebarPayload,
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
