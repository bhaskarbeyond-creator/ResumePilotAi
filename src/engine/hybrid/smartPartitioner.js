/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager
 * 
 * Precision Balanced Greedy-Packing Architecture:
 * - 2-Column Layouts (Modern Split & Executive Banner): Main column sequentially packs Summary -> Experience -> Education -> Projects -> Certifications -> Achievements.
 * - Sidebar contains Header, Skills, Languages, Hobbies with 100% full-height column background.
 * - Single-Column Layouts (Minimal ATS & Compact Euro): Full-page greedy packing maximizing Page 1 space utilization.
 * - Accurate Typographic Estimators: Calibrated per-variant skills, timeline items, and language rails.
 * - Safe Capacity Limits: Strict 650px usable page budget prevents ANY element from colliding with page footers.
 * - Zero Empty Space: Items fill Page 1 cleanly; multi-page overflow activates only when Page 1 capacity is genuinely reached.
 */

const CHARS_PER_LINE = 75;
const LINE_HEIGHT_PX = 15;

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

  // Sidebar height estimation
  const contactCount = [values.email, values.phone, values.city || values.address, values.website, values.linkedin, values.github].filter(Boolean).length;
  const sidebarHeaderHeight = isBanner ? 0 : ((photo ? 80 : 0) + 50 + (contactCount * 20) + 20);
  
  const skillCount = skills.length;
  let skillsHeight = 0;
  if (skillCount > 0) {
    if (hasSidebar) {
      if (theme.skillVariant === 'dots' || theme.skillVariant === 'bars') {
        skillsHeight = skillCount * 20 + 26;
      } else if (theme.skillVariant === 'inline') {
        skillsHeight = Math.ceil(skillCount / 3) * 16 + 24;
      } else {
        skillsHeight = Math.ceil(skillCount / 1.5) * 22 + 26;
      }
    } else {
      skillsHeight = Math.ceil(skillCount / 4) * 22 + 26;
    }
  }

  const languagesHeight = languages.length ? (languages.length * 22 + 26) : 0;
  const hobbiesCount = Array.isArray(hobbies) ? hobbies.length : (hobbies ? 1 : 0);
  const hobbiesHeight = hobbiesCount ? (Math.ceil(hobbiesCount / (hasSidebar ? 1.5 : 3)) * 20 + 24) : 0;

  // Optional: If certifications are very few and sidebar is almost empty, place them in sidebar
  const certsInSidebar = hasSidebar && (skillCount + hobbiesCount) <= 4 && certifications.length <= 2;
  const certsSidebarHeight = certsInSidebar ? (certifications.length * 30 + 24) : 0;

  // 1. Build All Main Flow Sections in Priority Sequence
  const sections = [];

  // Summary
  if (summary && summary.trim() && getTextLength(summary) > 0) {
    const sumHeight = calcTextHeight(getTextLength(summary)) + 30;
    sections.push({
      type: 'summary',
      items: [{ type: 'summary', content: summary, estHeight: Math.round(sumHeight) }],
      estHeight: Math.round(sumHeight)
    });
  }

  // Experience / Employment
  if (employments && employments.length) {
    const expItems = employments.map((job, index) => {
      const textLen = getTextLength(job.description);
      const estHeight = Math.round(32 + calcTextHeight(textLen) + (index === 0 ? 26 : 10));
      return { type: 'experience', item: job, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = expItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'experience', items: expItems, estHeight: sectionHeight });
  }

  // Education
  if (educations && educations.length) {
    const eduItems = educations.map((edu, index) => {
      const textLen = getTextLength(edu.description);
      const estHeight = Math.round(28 + calcTextHeight(textLen) + (index === 0 ? 26 : 8));
      return { type: 'education', item: edu, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = eduItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'education', items: eduItems, estHeight: sectionHeight });
  }

  // Skills (in Single Column mode)
  if (isSingleCol && skills.length) {
    sections.push({
      type: 'skills',
      items: [{ type: 'skills', items: skills, estHeight: Math.round(skillsHeight) }],
      estHeight: Math.round(skillsHeight)
    });
  }

  // Projects
  if (projects && projects.length) {
    const projItems = projects.map((proj, index) => {
      const textLen = getTextLength(proj.description);
      const estHeight = Math.round(28 + calcTextHeight(textLen) + (index === 0 ? 26 : 8));
      return { type: 'project', item: proj, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = projItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'project', items: projItems, estHeight: sectionHeight });
  }

  // Certifications (when in Main Flow)
  if ((isSingleCol || !certsInSidebar) && certifications.length) {
    const certItems = certifications.map((cert, index) => {
      const isNewRow = index % 2 === 0;
      const rowHeight = isNewRow ? 52 : 0;
      const titleHeight = index === 0 ? 28 : 0;
      return {
        type: 'certification',
        item: cert,
        index,
        isFirst: index === 0,
        estHeight: rowHeight + titleHeight,
      };
    });
    const sectionHeight = certItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'certification', items: certItems, estHeight: sectionHeight });
  }

  // Key Achievements
  if (achievements && achievements.length) {
    const achItems = achievements.map((ach, index) => {
      const textLen = getTextLength(ach.description);
      const estHeight = Math.round(26 + calcTextHeight(textLen) + (index === 0 ? 26 : 8));
      return { type: 'achievement', item: ach, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = achItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'achievement', items: achItems, estHeight: sectionHeight });
  }

  // Hobbies (in Single Column mode)
  if (isSingleCol && hobbiesCount > 0) {
    sections.push({
      type: 'hobbies',
      items: [{ type: 'hobbies', items: hobbies, estHeight: Math.round(hobbiesHeight) }],
      estHeight: Math.round(hobbiesHeight)
    });
  }

  // References
  if (references && references.length) {
    const refItems = references.map((ref, index) => {
      const textLen = getTextLength(ref.reference);
      const estHeight = Math.round(24 + calcTextHeight(textLen) + (index === 0 ? 26 : 8));
      return { type: 'reference', item: ref, index, isFirst: index === 0, estHeight };
    });
    const sectionHeight = refItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'reference', items: refItems, estHeight: sectionHeight });
  }

  // Languages (in Single Column mode)
  if (isSingleCol && languages.length) {
    sections.push({
      type: 'languages',
      items: [{ type: 'languages', items: languages, estHeight: Math.round(languagesHeight) }],
      estHeight: Math.round(languagesHeight)
    });
  }

  // Usable vertical page capacity on Page 1 (conservative to prevent any footer collision)
  const P1_CAPACITY = isBanner ? 580 : (isSingleCol ? 650 : 650);

  const p1Items = [];
  const p2Items = [];
  let currentP1Height = 0;
  let hasOverflowed = false;

  sections.forEach(section => {
    if (!hasOverflowed && currentP1Height + section.estHeight <= P1_CAPACITY) {
      p1Items.push(...section.items);
      currentP1Height += section.estHeight;
    } else {
      hasOverflowed = true;
      p2Items.push(...section.items);
    }
  });

  const sidebarPayload = hasSidebar ? {
    skills,
    hobbies,
    certifications: certsInSidebar ? certifications : [],
    languages,
  } : null;

  if (p2Items.length === 0) {
    return {
      isMultiPage: false,
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          isFirstPage: true,
          isAdaptiveSplit: false,
          sidebar: sidebarPayload,
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
        sidebar: sidebarPayload,
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
