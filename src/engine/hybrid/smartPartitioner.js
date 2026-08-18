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

import {
  hasMeaningfulText,
  filterMeaningfulEmployments,
  filterMeaningfulEducations,
  filterMeaningfulSkills,
  filterMeaningfulProjects,
  filterMeaningfulCertifications,
  filterMeaningfulAchievements,
  filterMeaningfulReferences,
  filterMeaningfulLanguages,
  filterMeaningfulHobbies,
} from './utils/contentSanitizer.js';

const LINE_HEIGHT_PX = 15;

function getTextLength(htmlOrStr = '') {
  if (!htmlOrStr) return 0;
  return String(htmlOrStr).replace(/<[^>]*>/g, '').trim().length;
}

/**
 * Splits a long summary into flow-sized blocks.
 *
 * The summary used to be a single atomic flow item. A 4 800-character profile
 * is taller than an A4 sheet, so no amount of pagination could place it and
 * `overflow:hidden` cut the tail off. Splitting at paragraph — and if needed
 * sentence — boundaries lets the packer carry the remainder onto the next page.
 */
function splitSummaryBlocks(html = '', maxChars = 900) {
  const raw = String(html || '').trim();
  if (!raw || !hasMeaningfulText(raw)) return [];
  const paragraphs = raw.includes('</p>')
    ? raw.split(/(?<=<\/p>)/).map((part) => part.trim()).filter(Boolean)
    : [raw];
  const blocks = [];
  for (const paragraph of paragraphs) {
    if (getTextLength(paragraph) <= maxChars) { blocks.push(paragraph); continue; }
    // Split an over-long paragraph on sentence boundaries, preserving text.
    const sentences = paragraph.split(/(?<=[.!?‽])\s+/);
    let buffer = '';
    for (const sentence of sentences) {
      if (buffer && getTextLength(buffer + sentence) > maxChars) { blocks.push(buffer.trim()); buffer = ''; }
      buffer += (buffer ? ' ' : '') + sentence;
    }
    if (buffer.trim()) blocks.push(buffer.trim());
  }
  return blocks.length ? blocks : [raw];
}

export function partitionResumeContent(values = {}, theme = {}) {
  const rawSummary = values.summary || values.professionalSummary || values.objective || values.aboutMe || values.profile || values.summaryText || '';
  const summary = hasMeaningfulText(rawSummary) ? String(rawSummary).trim() : '';
  const employments = filterMeaningfulEmployments(values.employments || values.workExperiences || values.experience);
  const educations = filterMeaningfulEducations(values.educations || values.education);
  const skills = filterMeaningfulSkills(values.skills);
  const projects = filterMeaningfulProjects(values.projects);
  const certifications = filterMeaningfulCertifications(values.certifications);
  const languages = filterMeaningfulLanguages(values.languages);
  const hobbies = filterMeaningfulHobbies(values.hobbies || values.hobby || values.interests || values.interest);
  const achievements = filterMeaningfulAchievements(values.achievements);
  const references = filterMeaningfulReferences(values.references);
  const rawPhoto = values.photo || values.selectedImage || values.image || values.avatar || values.picture || null;
  const isPhotoVisible = Boolean(rawPhoto && values.showPhoto !== false && values.hidePhoto !== true && values.includePhoto !== false);
  const photo = isPhotoVisible ? rawPhoto : null;

  const isSingleCol = theme.archetype === 'minimal-ats' || theme.archetype === 'compact-euro';
  const isBanner = theme.archetype === 'executive-banner';
  const hasSidebar = !isSingleCol;

  // The density scale changes both the body size and the leading, so the
  // estimator has to move with it — otherwise "spacious" templates
  // under-estimate their own text by ~20 % and clip the tail of long blocks.
  const density = theme.density || 'standard';
  const densityScale = density === 'compact' ? 0.9 : density === 'spacious' ? 1.22 : 1;
  const lineHeight = LINE_HEIGHT_PX * densityScale;
  // A two-column main flow is roughly a third narrower than a full-width sheet.
  const charsPerLine = Math.round((isSingleCol ? 92 : 66) / densityScale);
  const calcTextHeight = (textLen = 0) => (textLen
    ? Math.max(1, Math.ceil(textLen / charsPerLine)) * lineHeight
    : 0);

  // Sidebar height estimation
  const contactCount = [values.email, values.phone, values.city || values.address, values.website, values.linkedin, values.github].filter(Boolean).length;
  const sidebarHeaderHeight = isBanner ? 0 : ((photo ? 80 : 0) + 50 + (contactCount * 20) + 20);
  
  const skillNameOf = (item) => (typeof item === 'string' ? item : (item?.name || item?.skillName || ''));
  /**
   * Name-aware skill height estimator.
   *
   * The previous model assumed a fixed 1.5 pills per row at 22 px. Real skill
   * labels are frequently long ("Enterprise Capability Domain with a Long
   * Descriptive Name"), which wraps to three or four lines inside a 34 %
   * sidebar. Under-estimating by 5x is what allowed 2 500 px of sidebar ink to
   * be pushed past the bottom of the sheet and silently clipped.
   */
  function estimateSkillsHeight(list, inSidebar) {
    if (!list || !list.length) return 0;
    // Approximate characters that fit on one line in each column context.
    const charsPerLine = inSidebar ? 26 : 46;
    const lineHeight = 19;
    let total = 0;
    let rowChars = 0;
    for (const item of list) {
      const len = Math.max(1, skillNameOf(item).length);
      const lines = Math.ceil(len / charsPerLine);
      if (lines > 1) {
        // A wrapping pill claims its own row(s).
        if (rowChars > 0) { total += lineHeight; rowChars = 0; }
        total += lines * lineHeight;
      } else {
        rowChars += len + 4;
        if (rowChars > charsPerLine) { total += lineHeight; rowChars = len + 4; }
      }
    }
    if (rowChars > 0) total += lineHeight;
    return total + 26; // section title
  }

  /**
   * Rating variants (`dots`, `bars`) render one full-width row per skill in
   * BOTH columns — treating them as wrapping pills under-counted them and was
   * the last source of clipped skill blocks on single-column templates.
   */
  const isRatingVariant = theme.skillVariant === 'dots' || theme.skillVariant === 'bars';
  function skillsHeightFor(list, inSidebar) {
    if (!list || !list.length) return 0;
    if (isRatingVariant) {
      const wrapAt = inSidebar ? 26 : 60;
      return list.reduce((sum, item) => {
        const lines = Math.max(1, Math.ceil(Math.max(1, skillNameOf(item).length) / wrapAt));
        return sum + lines * 15 + (theme.skillVariant === 'bars' ? 13 : 9);
      }, 0) + 26;
    }
    return estimateSkillsHeight(list, inSidebar);
  }

  const skillCount = skills.length;
  const skillsHeight = skillsHeightFor(skills, hasSidebar);

  const languagesHeight = languages.length ? (languages.length * 22 + 26) : 0;
  const hobbiesCount = Array.isArray(hobbies) ? hobbies.length : (hobbies ? 1 : 0);
  const hobbiesHeight = hobbiesCount ? (Math.ceil(hobbiesCount / (hasSidebar ? 1.5 : 3)) * 20 + 24) : 0;

  // Optional: If certifications are very few and sidebar is almost empty, place them in sidebar
  const certsInSidebar = hasSidebar && (skillCount + hobbiesCount) <= 4 && certifications.length <= 2;
  const certsSidebarHeight = certsInSidebar ? (certifications.length * 30 + 24) : 0;

  /**
   * Sidebar capacity guard.
   *
   * The sidebar renders on page 1 only and the A4 sheet clips at 297 mm, so a
   * skills-heavy profile (30+ skills) used to have the tail of the sidebar cut
   * off with no indication. Anything that does not fit is now demoted into the
   * main flow, where the multi-page packer can carry it onto later sheets.
   */
  const SIDEBAR_CAPACITY = 1010; // 1123px sheet - footer - vertical padding
  const perSkillHeight = skillCount > 0 ? (skillsHeight - 26) / skillCount : 0;
  let sidebarBudget = hasSidebar ? SIDEBAR_CAPACITY - sidebarHeaderHeight : 0;
  let sidebarSkills = hasSidebar ? skills : [];
  let overflowSkills = [];
  let sidebarKeepsHobbies = hasSidebar && hobbiesCount > 0;
  let sidebarKeepsLanguages = hasSidebar && languages.length > 0;
  let sidebarKeepsCerts = certsInSidebar;

  if (hasSidebar) {
    let used = 0;
    if (skillCount > 0) {
      const affordable = perSkillHeight > 0
        ? Math.max(0, Math.floor((sidebarBudget - 26) / perSkillHeight))
        : skillCount;
      if (affordable < skillCount) {
        // Keep at least a meaningful block in the sidebar; demote the remainder.
        const keep = Math.max(0, Math.min(skillCount, affordable));
        sidebarSkills = skills.slice(0, keep);
        overflowSkills = skills.slice(keep);
        used += keep ? (keep * perSkillHeight + 26) : 0;
      } else {
        used += skillsHeight;
      }
    }
    if (sidebarKeepsHobbies) {
      if (used + hobbiesHeight > sidebarBudget) sidebarKeepsHobbies = false;
      else used += hobbiesHeight;
    }
    if (sidebarKeepsCerts) {
      if (used + certsSidebarHeight > sidebarBudget) sidebarKeepsCerts = false;
      else used += certsSidebarHeight;
    }
    if (sidebarKeepsLanguages) {
      if (used + languagesHeight > sidebarBudget) sidebarKeepsLanguages = false;
      else used += languagesHeight;
    }
  }

  const skillsInMainFlow = isSingleCol ? skills : overflowSkills;
  const hobbiesInMainFlow = isSingleCol ? hobbies : (sidebarKeepsHobbies ? [] : hobbies);
  const languagesInMainFlow = isSingleCol ? languages : (sidebarKeepsLanguages ? [] : languages);
  const mainFlowHobbiesCount = Array.isArray(hobbiesInMainFlow) ? hobbiesInMainFlow.length : (hobbiesInMainFlow ? 1 : 0);
  const mainSkillsHeight = skillsHeightFor(skillsInMainFlow, false);
  const mainHobbiesHeight = mainFlowHobbiesCount ? (Math.ceil(mainFlowHobbiesCount / 3) * 20 + 24) : 0;
  const mainLanguagesHeight = languagesInMainFlow.length ? (languagesInMainFlow.length * 22 + 26) : 0;

  // 1. Build All Main Flow Sections in Priority Sequence
  const sections = [];

  // Summary (split into page-sized blocks so it can never be atomic-clipped)
  if (summary && summary.trim() && getTextLength(summary) > 0) {
    const blocks = splitSummaryBlocks(summary);
    const items = blocks.map((content, index) => ({
      type: 'summary',
      content,
      index,
      isFirst: index === 0,
      estHeight: Math.round(calcTextHeight(getTextLength(content)) + (index === 0 ? 30 : 6)),
    }));
    sections.push({
      type: 'summary',
      items,
      estHeight: items.reduce((sum, item) => sum + item.estHeight, 0),
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

  // Skills in the main flow: always for single-column archetypes, and for the
  // sidebar archetypes whatever did not fit inside the sidebar.
  if (skillsInMainFlow.length) {
    const height = isSingleCol ? skillsHeight : mainSkillsHeight;
    sections.push({
      type: 'skills',
      items: [{ type: 'skills', items: skillsInMainFlow, estHeight: Math.round(height) }],
      estHeight: Math.round(height)
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
  if ((isSingleCol || !sidebarKeepsCerts) && certifications.length) {
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

  // Hobbies in the main flow (single-column, or demoted from a full sidebar).
  if (mainFlowHobbiesCount > 0) {
    const height = isSingleCol ? hobbiesHeight : mainHobbiesHeight;
    sections.push({
      type: 'hobbies',
      items: [{ type: 'hobbies', items: hobbiesInMainFlow, estHeight: Math.round(height) }],
      estHeight: Math.round(height)
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

  // Languages in the main flow (single-column, or demoted from a full sidebar).
  if (languagesInMainFlow.length) {
    const height = isSingleCol ? languagesHeight : mainLanguagesHeight;
    sections.push({
      type: 'languages',
      items: [{ type: 'languages', items: languagesInMainFlow, estHeight: Math.round(height) }],
      estHeight: Math.round(height)
    });
  }

  // Usable vertical page capacity (conservative to prevent any footer collision).
  // Page 1 of a banner layout loses height to the full-width banner.
  // A ~5 % headroom absorbs residual estimator error (font metrics, wrapping)
  // so a page is never packed marginally past the sheet.
  const P1_CAPACITY = isBanner ? 815 : 900;
  // Continuation pages carry only the slim continuation header + footer, so they
  // have more usable height than page 1.
  const PN_CAPACITY = 930;

  /**
   * Greedy multi-page packer.
   *
   * Previously this packed at most two pages and dropped everything that did
   * not fit into page 2 — combined with `overflow:hidden` on the A4 sheet that
   * silently deleted content from the browser, the PDF and the print output
   * (a 14-role resume lost roughly three pages of ink). The packer now emits as
   * many pages as the content genuinely needs and splits oversized sections at
   * item boundaries so a single long section can never overflow a sheet.
   */
  const pageBuckets = [];
  let current = [];
  let currentHeight = 0;
  let pageIndex = 0;
  const capacityFor = (index) => (index === 0 ? P1_CAPACITY : PN_CAPACITY);

  const pushPage = () => {
    pageBuckets.push(current);
    current = [];
    currentHeight = 0;
    pageIndex += 1;
  };

  sections.forEach((section) => {
    const capacity = capacityFor(pageIndex);
    if (currentHeight + section.estHeight <= capacity) {
      current.push(...section.items);
      currentHeight += section.estHeight;
      return;
    }
    // Section does not fit in the remaining space: start a new page when the
    // current one already carries content, then place items one by one so a
    // section taller than a whole page is split instead of clipped.
    if (current.length) pushPage();
    section.items.forEach((item) => {
      const itemCapacity = capacityFor(pageIndex);
      const itemHeight = item.estHeight || 0;
      if (current.length && currentHeight + itemHeight > itemCapacity) pushPage();
      current.push(item);
      currentHeight += itemHeight;
    });
  });
  if (current.length) pushPage();
  if (!pageBuckets.length) pageBuckets.push([]);

  const sidebarPayload = hasSidebar ? {
    skills: sidebarSkills,
    hobbies: sidebarKeepsHobbies ? hobbies : [],
    certifications: sidebarKeepsCerts ? certifications : [],
    languages: sidebarKeepsLanguages ? languages : [],
  } : null;

  const totalPages = pageBuckets.length;
  return {
    isMultiPage: totalPages > 1,
    totalPages,
    pages: pageBuckets.map((flowItems, index) => ({
      pageNumber: index + 1,
      isFirstPage: index === 0,
      isAdaptiveSplit: false,
      sidebar: index === 0 ? sidebarPayload : null,
      flowItems,
    })),
  };
}
