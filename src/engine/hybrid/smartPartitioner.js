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

import { hasMeaningfulText, filterMeaningfulEmployments, filterMeaningfulEducations, filterMeaningfulSkills, filterMeaningfulProjects, filterMeaningfulCertifications, filterMeaningfulAchievements, filterMeaningfulReferences, filterMeaningfulLanguages, filterMeaningfulHobbies, filterMeaningfulCustomSections } from './utils/contentSanitizer.js';

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
  const customSections = filterMeaningfulCustomSections(values.customSections);
  const rawPhoto = values.photo || values.selectedImage || values.image || values.avatar || values.picture || null;
  const isPhotoVisible = Boolean(rawPhoto && values.showPhoto !== false && values.hidePhoto !== true && values.includePhoto !== false);
  const photo = isPhotoVisible ? rawPhoto : null;

  const isSingleCol = theme.archetype === 'minimal-ats' || theme.archetype === 'compact-euro';
  const isBanner = theme.archetype === 'executive-banner';
  // Tech-grid, like the executive banner, carries its identity in a full-width
  // band above the columns — the sidebar therefore starts with skills, not the
  // contact block, and page 1 loses the band's height.
  const isTechGrid = theme.archetype === 'tech-grid';
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
  const sidebarHeaderHeight = (isBanner || isTechGrid) ? 0 : ((photo ? 80 : 0) + 50 + (contactCount * 20) + 20);
  
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

  /**
   * DIR-064 — certification card geometry estimator.
   *
   * Main-flow certifications render into a 2-column grid (`.smart-cert-grid`) where
   * each `.smart-cert-item` is a bordered card holding a badge, a title that
   * frequently wraps to two lines, and an issuer · date meta line. Measured on a
   * real resume (e.g. "CCRN") those cards occupy 74–85px per grid row, but the
   * estimator charged only 52px — a ~30px shortfall per row that pushed the tail
   * of a certifications section straight through the page footer.
   *
   * This estimates the real per-row height from the title/meta line count and the
   * active density scale, with a floor matching the measured card.
   */
  const CERT_ROW_MIN_PX = 76; // measured 2-col card: title + issuer/date + badge
  const CERT_ROW_MAX_PX = 88; // long wrapping title / meta clamps here
  const certRowHeightFor = (cert) => {
    const title = String(typeof cert === 'string' ? cert : (cert?.title || cert?.name || ''));
    const issuer = String(typeof cert === 'string' ? '' : (cert?.issuer || cert?.authority || ''));
    const date = String(typeof cert === 'string' ? '' : (cert?.date || ''));
    const meta = [issuer, date].filter(Boolean).join(' · ');
    const titleLines = Math.max(1, Math.ceil(title.length / 26));
    const metaLines = meta ? Math.max(1, Math.ceil(meta.length / 30)) : 0;
    const extraLines = Math.max(0, titleLines - 1) + Math.max(0, metaLines - 1);
    const rowPx = Math.min(CERT_ROW_MAX_PX, CERT_ROW_MIN_PX + extraLines * 12);
    return Math.round(rowPx * densityScale);
  };

  /**
   * DIR-065 — project card geometry estimator.
   *
   * Projects render into the same 2-column grid pattern as certifications
   * (`.smart-cards-grid` → `.smart-card-item`): a bordered card with a bold title,
   * an optional repository URL and a description. The old estimator treated a
   * project as linear text (28 + textHeight + 8/26), i.e. ~36px, even though the
   * real card is a >=65px grid row — which is what let 5 projects + 5
   * certifications fast-path onto page 1 while the real DOM overflowed by ~89px.
   */
  const PROJECT_CARD_MIN_PX = 65; // measured 2-col card: title + url + description
  const PROJECT_CARD_MAX_PX = 92; // long wrapping description clamps here
  const projectCardHeightFor = (proj) => {
    const title = String(proj?.title || proj?.name || '');
    const url = String(proj?.url || proj?.link || '').replace(/^https?:\/\//i, '');
    const descLen = getTextLength(proj?.description);
    const titleLines = Math.max(1, Math.ceil(title.length / 34));
    const descLines = Math.max(1, Math.ceil(descLen / 40));
    // 14px padding (7+7) + 2px border + 2px gap + title line + url line + desc lines.
    const base = 18 + titleLines * 14 + (url ? 13 : 0) + descLines * 14;
    return Math.round(Math.min(PROJECT_CARD_MAX_PX, Math.max(PROJECT_CARD_MIN_PX, base)) * densityScale);
  };

  /**
   * DIR-065 — row-paired grid estimation.
   *
   * Both grid sections lay their cards out two per row, and a CSS grid row is as
   * tall as its TALLEST card plus the row gap. Charging each card independently —
   * and the odd card of a pair zero — under-counted every row whose partner was
   * taller. This pairs the cards into rows and charges each row
   * `Math.max(cardA, cardB) + rowGap`, carrying the row height on the row-start
   * card while its partner carries 0. The row is therefore atomic: the packer's
   * per-item sum always equals the true row sum, and a row can never be split
   * across a page boundary (which would otherwise re-flow it as two half rows).
   */
  const pairGridRows = (cards, heightOf, rowGap, titleHeight, type) => {
    const items = [];
    for (let i = 0; i < cards.length; i += 2) {
      const first = cards[i];
      const second = cards[i + 1];
      const rowHeight = Math.max(heightOf(first), second ? heightOf(second) : 0) + rowGap;
      items.push({
        type,
        item: first,
        index: i,
        isFirst: i === 0,
        rowStart: true,
        estHeight: Math.round(rowHeight + (i === 0 ? titleHeight : 0)),
      });
      if (second) {
        items.push({
          type,
          item: second,
          index: i + 1,
          isFirst: false,
          rowStart: false,
          estHeight: 0,
        });
      }
    }
    return items;
  };

  // Optional: If certifications are very few and sidebar is almost empty, place them in sidebar
  const certsInSidebar = hasSidebar && (skillCount + hobbiesCount) <= 4 && certifications.length <= 2;
  // The sidebar renders the same cards in a single column, so each item is its own row.
  const certsSidebarHeight = certsInSidebar
    ? (certifications.reduce((sum, cert) => sum + certRowHeightFor(cert), 0) + 24)
    : 0;

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

  // Usable vertical page capacity constants.
  // Page 1 of a banner layout loses height to the full-width banner.
  // A ~5 % headroom absorbs residual estimator error (font metrics, wrapping)
  // so a page is never packed marginally past the sheet.
  // DIR-064 / DIR-065: reserve a hard clearance band above .smart-page-footer on
  // every page. DIR-065 raises the floor to >=36px (density-scaled) so a grid row
  // whose card wraps taller than its estimate can never be packed into the footer.
  const FOOTER_SAFETY_CLEARANCE = Math.max(36, Math.round(40 * densityScale));
  const P1_CAPACITY = ((isBanner || isTechGrid) ? 815 : 900) - FOOTER_SAFETY_CLEARANCE;
  // Continuation pages carry only the slim continuation header + footer.
  const PN_CAPACITY = 930 - FOOTER_SAFETY_CLEARANCE;
  // Must track --smart-section-gap in smartEngine.css (compact/standard/spacious).
  const SECTION_GAP_PX = density === 'compact' ? 11 : density === 'spacious' ? 18 : 14;
  // Grid row gap — must track `.smart-cards-grid` / `.smart-cert-grid` (7px 10px).
  const GRID_ROW_GAP = 7;

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
    // Chunk skills into page-sized pieces so the greedy packer can distribute
    // them across pages, just like experience/education items.  A single atomic
    // block caused Cv41/Cv44 (single-column DOTS variant, 50 skills ≈ 1 200 px)
    // to overflow PN_CAPACITY (930 px) and clip at the A4 boundary.
    const SKILLS_CHUNK_CAP = PN_CAPACITY - 30; // leave headroom for section title
    const skillChunkItems = [];
    let chunkStart = 0;
    while (chunkStart < skillsInMainFlow.length) {
      let chunkEnd = chunkStart + 1;
      // Grow chunk until the next skill would exceed the page capacity.
      while (chunkEnd < skillsInMainFlow.length) {
        const candidateHeight = skillsHeightFor(skillsInMainFlow.slice(chunkStart, chunkEnd + 1), false);
        if (candidateHeight > SKILLS_CHUNK_CAP) break;
        chunkEnd++;
      }
      const chunk = skillsInMainFlow.slice(chunkStart, chunkEnd);
      skillChunkItems.push({
        type: 'skills',
        items: chunk,
        isFirst: chunkStart === 0,
        estHeight: Math.round(skillsHeightFor(chunk, false)),
      });
      chunkStart = chunkEnd;
    }
    const totalSkillsHeight = Math.round(isSingleCol ? skillsHeight : mainSkillsHeight);
    sections.push({ type: 'skills', items: skillChunkItems, estHeight: totalSkillsHeight });
  }

  // Projects — 2-column card grid (row-paired, DIR-065)
  if (projects && projects.length) {
    const projItems = pairGridRows(projects, projectCardHeightFor, GRID_ROW_GAP, 28, 'project');
    const sectionHeight = projItems.reduce((sum, it) => sum + it.estHeight, 0);
    sections.push({ type: 'project', items: projItems, estHeight: sectionHeight });
  }

  // Certifications (when in Main Flow) — 2-column card grid (row-paired, DIR-065)
  if ((isSingleCol || !sidebarKeepsCerts) && certifications.length) {
    const certItems = pairGridRows(certifications, certRowHeightFor, GRID_ROW_GAP, 28, 'certification');
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

  // Custom sections — one flow group per section so two custom headings
  // cannot collapse into a single renderer group.
  if (customSections.length) {
    customSections.forEach((section) => {
      const bodyItems = (Array.isArray(section.items) && section.items.length)
        ? section.items
        : (section.content ? [{ title: '', description: section.content }] : []);
      if (!bodyItems.length) return;
      const customItems = bodyItems.map((item, index) => {
        const textLen = getTextLength(typeof item === 'string' ? item : (item.description || item.content || item.title || item.name || ''));
        const estHeight = Math.round(26 + calcTextHeight(textLen) + (index === 0 ? 26 : 8));
        return {
          type: 'custom',
          item,
          sectionId: section.id || section.title || 'custom',
          sectionTitle: section.title || 'Additional Information',
          index,
          isFirst: index === 0,
          estHeight,
        };
      });
      sections.push({
        type: 'custom',
        items: customItems,
        estHeight: customItems.reduce((sum, it) => sum + it.estHeight, 0),
      });
    });
  }


  /**
   * Greedy multi-page packer.
   *
   * Packs content tightly onto Page 1 and subsequent pages, eliminating blank
   * trailing gaps while preventing orphan section headers. When a multi-item
   * section does not fit entirely on the current page:
   * 1. If the current page has enough capacity for the section title + at least 1 item/row,
   *    it packs as many items as can fit on the current page.
   * 2. When the current page is full, it overflows remaining items to the next page,
   *    where SmartFlowRenderer seamlessly renders a "... (Continued)" continuation header.
   * 3. If the current page does NOT have enough space to even start the section cleanly,
   *    it pushes the section to start at the top of the next page (avoiding orphan headers).
   *
   * DIR-067: extracted into a pure helper so the SAME deterministic packing can be
   * re-run with a different section rhythm (adaptive micro-compaction) without
   * touching the render path.
   */
  const capacityFor = (index) => (index === 0 ? P1_CAPACITY : PN_CAPACITY);

  const packSections = (sectionGapPx) => {
    const pageBuckets = [];
    let current = [];
    let currentHeight = 0;
    let pageIndex = 0;

    const pushPage = () => {
      pageBuckets.push(current);
      current = [];
      currentHeight = 0;
      pageIndex += 1;
    };

  sections.forEach((section) => {
    const capacity = capacityFor(pageIndex);
    const gapBefore = current.length ? sectionGapPx : 0;

    // Fast path: entire section fits in remaining space of current page
    if (currentHeight + gapBefore + section.estHeight <= capacity) {
      current.push(...section.items);
      currentHeight += gapBefore + section.estHeight;
      return;
    }

    // Section does not fit as a whole:
    // Check if the current page has enough room to start the section cleanly.
    // An orphan header or tiny sliver (< first item + gap) should not be started on current page.
    const firstItem = section.items[0];
    const minStartHeight = (firstItem?.estHeight || 40) + gapBefore;
    const canStartOnCurrentPage = current.length === 0 || (currentHeight + minStartHeight <= capacity);

    if (!canStartOnCurrentPage && current.length > 0) {
      // Current page is too full to start this section cleanly; start fresh on next page
      pushPage();
    }

    // Pack items greedily one by one across pages
    let sectionStartedOnThisPage = false;
    section.items.forEach((item, itemIdx) => {
      const itemCapacity = capacityFor(pageIndex);
      const isFirstOnPage = current.length === 0;
      const continuationTitleHeight = (isFirstOnPage && itemIdx > 0) ? 26 : 0;
      const interSectionGap = (isFirstOnPage || sectionStartedOnThisPage) ? 0 : sectionGapPx;
      const itemHeight = (item.estHeight || 0) + continuationTitleHeight + interSectionGap;

      if (current.length && currentHeight + itemHeight > itemCapacity) {
        pushPage();
        sectionStartedOnThisPage = false;
      }

      current.push(item);
      currentHeight += (item.estHeight || 0) + (current.length === 1 ? 0 : interSectionGap) + ((current.length === 1 && itemIdx > 0) ? 26 : 0);
      sectionStartedOnThisPage = true;
    });
  });

    if (current.length) pushPage();
    if (!pageBuckets.length) pageBuckets.push([]);
    return pageBuckets;
  };

  /** Rendered height of one packed page: content + the inter-section gaps it will paint. */
  const heightOfPage = (bucket, sectionGapPx) => {
    const content = bucket.reduce((sum, item) => sum + (item.estHeight || 0), 0);
    let groups = 0;
    let previous = null;
    for (const item of bucket) {
      if (item.type !== previous) { groups += 1; previous = item.type; }
    }
    return content + Math.max(0, groups - 1) * sectionGapPx;
  };

  /** Stable identity of the section an item belongs to (custom sections key on sectionId). */
  const sectionKeyOf = (item) => (item.sectionId ? `${item.type}:${item.sectionId}` : item.type);

  // DIR-067 (A) Adaptive Micro-Compaction: a minor trailing overflow (<= 60px, or a
  // single trailing row) is absorbed by a tighter 11px section rhythm instead of
  // stranding content on a nearly empty page 2. Adopted ONLY when the whole resume
  // then fits one page; the chosen rhythm is returned so the renderer paints
  // exactly what was estimated (no footer overlap).
  const COMPACT_SECTION_GAP_PX = 11;
  const MINOR_OVERFLOW_PX = 60;
  // DIR-067 (B) orphan threshold: a continuation title (26px) + one grid row (~85px).
  const ORPHAN_MAX_PX = 130;

  /**
   * DIR-067 (B) Section Integrity & Orphan Guard.
   *
   * When two pages are genuinely required, a continuation must never strand a
   * single isolated card on the last page (4 certifications on page 1 and 1 on a
   * 85%-blank page 2). If the last page holds exactly one stranded section that
   * continues from an earlier page, the WHOLE section moves onto the last page so
   * it reads as a complete, intentional block. Reverts when that would overflow.
   */
  const applyOrphanGuard = (buckets, sectionGapPx) => {
    if (buckets.length < 2) return buckets;
    const lastIdx = buckets.length - 1;
    const last = buckets[lastIdx];
    if (!last.length) return buckets;
    const keys = new Set(last.map(sectionKeyOf));
    if (keys.size !== 1) return buckets;
    const key = [...keys][0];
    const isGrid = key.startsWith('certification') || key.startsWith('project');
    const oneRow = isGrid ? last.length <= 2 : last.length <= 1;
    if (!oneRow && heightOfPage(last, sectionGapPx) > ORPHAN_MAX_PX) return buckets;

    const earlier = [];
    for (let q = 0; q < lastIdx; q += 1) {
      if (buckets[q].some((item) => sectionKeyOf(item) === key)) earlier.push(q);
    }
    if (!earlier.length) return buckets;

    const next = buckets.map((bucket) => bucket.slice());
    const moved = [];
    for (const q of earlier) {
      next[q] = next[q].filter((item) => {
        if (sectionKeyOf(item) === key) { moved.push(item); return false; }
        return true;
      });
    }
    if (!moved.length) return buckets;
    next[lastIdx] = [...moved, ...next[lastIdx]];
    if (heightOfPage(next[lastIdx], sectionGapPx) > capacityFor(lastIdx)) return buckets;
    const pruned = next.filter((bucket, index) => bucket.length > 0 || index === 0);
    return pruned.length ? pruned : buckets;
  };

  let activeSectionGapPx = SECTION_GAP_PX;
  let pageBuckets = packSections(activeSectionGapPx);

  // (A) micro-compaction
  if (pageBuckets.length === 2) {
    const last = pageBuckets[pageBuckets.length - 1];
    const minor = heightOfPage(last, activeSectionGapPx) <= MINOR_OVERFLOW_PX || last.length <= 2;
    if (minor) {
      const compacted = packSections(COMPACT_SECTION_GAP_PX);
      if (compacted.length === 1) {
        pageBuckets = compacted;
        activeSectionGapPx = COMPACT_SECTION_GAP_PX;
      }
    }
  }

  // (B) orphan guard
  pageBuckets = applyOrphanGuard(pageBuckets, activeSectionGapPx);

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
    // DIR-067: the section rhythm actually used to pack. The renderer applies it as
    // an inline --smart-section-gap so the painted gap always equals the estimate.
    sectionGapPx: activeSectionGapPx,
    pages: pageBuckets.map((flowItems, index) => ({
      pageNumber: index + 1,
      isFirstPage: index === 0,
      isAdaptiveSplit: false,
      sidebar: index === 0 ? sidebarPayload : null,
      flowItems,
    })),
  };
}
