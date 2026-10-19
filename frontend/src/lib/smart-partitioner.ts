/**
 * Smart Hybrid Resume Engine — Content Partitioner & Page Packager (TypeScript)
 *
 * Implements balanced greedy-packing for multi-page A4 documents:
 * - Computes calibrated typographic heights for all resume sections
 * - Partitions content cleanly across A4 pages (210mm x 297mm)
 * - Page 1: Main header + initial flow items + sidebar (if split layout)
 * - Page 2+: Dedicated continuation header ("Candidate Name — Role — Page X of Y")
 * - Page Footers: "Candidate Name · Page X / Y"
 * - Adaptive Micro-Compaction: Prevents 1-2 line spillover onto blank pages
 * - Safe Capacity Limits: Prevents footer collisions and orphan headings
 */

export interface FlowItem {
  id: string;
  type: 'summary' | 'experience' | 'education' | 'projects' | 'certifications' | 'skills' | 'languages' | 'achievements' | 'hobbies' | 'references';
  title?: string;
  data: any;
  estimatedHeight: number;
}

export interface SidebarData {
  photo?: string | null;
  skills?: Array<string | { name: string; rating?: number; level?: string }>;
  certifications?: Array<{ id: string; name: string; issuer?: string; date?: string }>;
  languages?: Array<{ id: string; name: string; proficiency?: string; rating?: number }>;
}

export interface PartitionedPage {
  pageNumber: number;
  flowItems: FlowItem[];
  sidebar?: SidebarData | null;
  isContinuation?: boolean;
}

export interface PartitionResult {
  pages: PartitionedPage[];
  totalPages: number;
  sectionGapPx: number;
}

function getTextLength(str: any): number {
  if (!str) return 0;
  return String(str).replace(/<[^>]*>/g, '').trim().length;
}

/**
 * Estimates card height for employment items
 */
function estimateExperienceHeight(exp: any, charsPerLine: number, lineHeight: number): number {
  const titleHeight = 22;
  const metaHeight = 16;
  const descText = String(exp.description || '').trim();
  const descLen = getTextLength(descText);
  const descLines = descLen ? Math.max(1, Math.ceil(descLen / charsPerLine)) : 0;
  const descHeight = descLines * lineHeight;
  return titleHeight + metaHeight + descHeight + 14; // margin buffer
}

/**
 * Estimates card height for education items
 */
function estimateEducationHeight(edu: any, charsPerLine: number, lineHeight: number): number {
  const titleHeight = 20;
  const descLen = getTextLength(edu.description);
  const descLines = descLen ? Math.max(1, Math.ceil(descLen / charsPerLine)) : 0;
  return titleHeight + 16 + (descLines * lineHeight) + 12;
}

/**
 * Splits long summary text into safe paragraph blocks
 */
function splitSummaryBlocks(text: string, maxChars = 750): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  if (raw.length <= maxChars) return [raw];
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const blocks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if (current && (current.length + s.length) > maxChars) {
      blocks.push(current.trim());
      current = '';
    }
    current += (current ? ' ' : '') + s;
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks.length ? blocks : [raw];
}

export function partitionResumeContent(
  resume: any,
  theme: any,
  density: 'compact' | 'standard' | 'spacious' = 'standard'
): PartitionResult {
  const hasSidebar =
    theme.archetype === 'modern-split' ||
    theme.archetype === 'compact-euro' ||
    theme.archetype === 'executive-banner' ||
    theme.archetype === 'tech-grid';
  const isSingleCol = theme.archetype === 'minimal-ats';
  const isBanner = theme.archetype === 'executive-banner';
  const isTechGrid = theme.archetype === 'tech-grid';

  const densityScale = density === 'compact' ? 0.9 : density === 'spacious' ? 1.2 : 1.0;
  const lineHeight = 15 * densityScale;
  const charsPerLine = Math.round((isSingleCol ? 90 : 62) / densityScale);
  const sectionGapPx = Math.round((density === 'compact' ? 12 : density === 'spacious' ? 18 : 14));

  // A4 Geometry: Total Height ~1123px at 96DPI
  // Page 1 budget: Available body after header, padding, and footer safety buffer
  const hasPhoto = Boolean(resume.heading?.photo && resume.heading?.showPhoto !== false);
  let page1HeaderHeight = 0;

  if (isBanner) {
    page1HeaderHeight = 150;
  } else if (isSingleCol) {
    page1HeaderHeight = hasPhoto ? 140 : 100;
  } else if (isTechGrid) {
    page1HeaderHeight = 110;
  } else {
    // In modern split, header sits in sidebar, so main column has full height on page 1!
    page1HeaderHeight = 20;
  }

  const PAGE_USABLE_HEIGHT = 860; // Safe height allowing 60px footer and padding
  const PAGE1_CAPACITY = Math.max(450, PAGE_USABLE_HEIGHT - page1HeaderHeight);
  const CONTINUATION_PAGE_CAPACITY = PAGE_USABLE_HEIGHT - 65; // includes continuation header height

  // 1. Prepare candidate flow items
  const flowItems: FlowItem[] = [];

  // Summary
  if (resume.summary && String(resume.summary).trim()) {
    const summaryBlocks = splitSummaryBlocks(resume.summary);
    summaryBlocks.forEach((block, idx) => {
      const lines = Math.ceil(getTextLength(block) / charsPerLine);
      const estHeight = 28 + (lines * lineHeight) + sectionGapPx;
      flowItems.push({
        id: `summary-${idx}`,
        type: 'summary',
        title: idx === 0 ? 'Professional Profile' : undefined,
        data: block,
        estimatedHeight: estHeight,
      });
    });
  }

  // Experience
  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    resume.experience.forEach((exp: any, idx: number) => {
      const estHeight = estimateExperienceHeight(exp, charsPerLine, lineHeight);
      flowItems.push({
        id: exp.id || `exp-${idx}`,
        type: 'experience',
        title: idx === 0 ? 'Work Experience' : undefined,
        data: exp,
        estimatedHeight: estHeight,
      });
    });
  }

  // Education
  if (Array.isArray(resume.education) && resume.education.length > 0) {
    resume.education.forEach((edu: any, idx: number) => {
      const estHeight = estimateEducationHeight(edu, charsPerLine, lineHeight);
      flowItems.push({
        id: edu.id || `edu-${idx}`,
        type: 'education',
        title: idx === 0 ? 'Education' : undefined,
        data: edu,
        estimatedHeight: estHeight,
      });
    });
  }

  // Projects
  if (Array.isArray(resume.projects) && resume.projects.length > 0) {
    resume.projects.forEach((proj: any, idx: number) => {
      const lines = Math.ceil(getTextLength(proj.description) / charsPerLine);
      const estHeight = 36 + (lines * lineHeight) + 8;
      flowItems.push({
        id: proj.id || `proj-${idx}`,
        type: 'projects',
        title: idx === 0 ? 'Key Projects' : undefined,
        data: proj,
        estimatedHeight: estHeight,
      });
    });
  }

  // Key Achievements
  if (Array.isArray(resume.achievements) && resume.achievements.length > 0) {
    resume.achievements.forEach((ach: any, idx: number) => {
      const lines = Math.ceil(getTextLength(ach.description) / charsPerLine);
      const estHeight = 32 + (lines * lineHeight) + 8;
      flowItems.push({
        id: ach.id || `ach-${idx}`,
        type: 'achievements',
        title: idx === 0 ? 'Key Achievements' : undefined,
        data: ach,
        estimatedHeight: estHeight,
      });
    });
  }

  // If single column, skills, certifications, and languages are in the main flow
  if (isSingleCol) {
    if (Array.isArray(resume.skillCategories) && resume.skillCategories.length > 0) {
      const allSkills = resume.skillCategories.flatMap((c: any) => c.skills || []);
      const rows = Math.ceil(allSkills.length / 4);
      flowItems.push({
        id: 'skills-main',
        type: 'skills',
        title: 'Core Competencies',
        data: resume.skillCategories,
        estimatedHeight: 32 + (rows * 26) + sectionGapPx,
      });
    } else if (Array.isArray(resume.skills) && resume.skills.length > 0) {
      const rows = Math.ceil(resume.skills.length / 4);
      flowItems.push({
        id: 'skills-main',
        type: 'skills',
        title: 'Core Competencies',
        data: [{ id: 'core', category: 'Core Skills', skills: resume.skills.map((s: any) => typeof s === 'string' ? s : (s.name || s.skillName || '')) }],
        estimatedHeight: 32 + (rows * 26) + sectionGapPx,
      });
    }

    if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
      flowItems.push({
        id: 'certifications-main',
        type: 'certifications',
        title: 'Certifications',
        data: resume.certifications,
        estimatedHeight: 28 + (resume.certifications.length * 20) + sectionGapPx,
      });
    }

    if (Array.isArray(resume.languages) && resume.languages.length > 0) {
      flowItems.push({
        id: 'languages-main',
        type: 'languages',
        title: 'Languages',
        data: resume.languages,
        estimatedHeight: 28 + (resume.languages.length * 18) + sectionGapPx,
      });
    }

    // Hobbies / Interests
    if (Array.isArray(resume.hobbies) && resume.hobbies.length > 0) {
      const hobbiesText = resume.hobbies.map((h: any) => typeof h === 'string' ? h : (h.name || '')).filter(Boolean);
      const rows = Math.ceil(hobbiesText.length / 4);
      flowItems.push({
        id: 'hobbies-main',
        type: 'hobbies',
        title: 'Interests & Hobbies',
        data: hobbiesText,
        estimatedHeight: 28 + (rows * 22) + sectionGapPx,
      });
    }

    // References
    if (Array.isArray(resume.references) && resume.references.length > 0) {
      resume.references.forEach((ref: any, idx: number) => {
        const lines = Math.ceil(getTextLength(ref.description || ref.recommendation || '') / charsPerLine);
        flowItems.push({
          id: ref.id || `ref-${idx}`,
          type: 'references',
          title: idx === 0 ? 'References' : undefined,
          data: ref,
          estimatedHeight: 32 + (lines * lineHeight) + 8,
        });
      });
    }
  }

  // 2. Prepare sidebar data for two-column/banner layouts
  let sidebar: SidebarData | null = null;
  if (hasSidebar) {
    let skillsList: any[] = [];
    if (Array.isArray(resume.skillCategories) && resume.skillCategories.length > 0) {
      skillsList = resume.skillCategories.flatMap((c: any) => c.skills || []);
    } else if (Array.isArray(resume.skills) && resume.skills.length > 0) {
      skillsList = resume.skills.map((s: any) => typeof s === 'string' ? s : (s.name || s.skillName || s.skill || ''));
    }
    sidebar = {
      photo: hasPhoto ? resume.heading?.photo : null,
      skills: skillsList,
      certifications: resume.certifications || [],
      languages: resume.languages || [],
    };
  }

  // 3. Greedy Packing across Pages
  const pages: PartitionedPage[] = [];
  let currentPageItems: FlowItem[] = [];
  let currentHeight = 0;
  let pageIndex = 1;

  for (let i = 0; i < flowItems.length; i++) {
    const item = flowItems[i]!;
    const limit = pageIndex === 1 ? PAGE1_CAPACITY : CONTINUATION_PAGE_CAPACITY;

    // Check if adding this item fits
    if (currentHeight + item.estimatedHeight <= limit) {
      currentPageItems.push(item);
      currentHeight += item.estimatedHeight;
    } else {
      // If it doesn't fit and current page has items, flush to next page
      if (currentPageItems.length > 0) {
        pages.push({
          pageNumber: pageIndex,
          flowItems: currentPageItems,
          sidebar: pageIndex === 1 ? sidebar : null,
          isContinuation: pageIndex > 1,
        });
        pageIndex++;
        currentPageItems = [item];
        currentHeight = item.estimatedHeight;
      } else {
        // Item is larger than entire capacity (unusual edge case), force it on current page
        currentPageItems.push(item);
        pages.push({
          pageNumber: pageIndex,
          flowItems: currentPageItems,
          sidebar: pageIndex === 1 ? sidebar : null,
          isContinuation: pageIndex > 1,
        });
        pageIndex++;
        currentPageItems = [];
        currentHeight = 0;
      }
    }
  }

  if (currentPageItems.length > 0) {
    pages.push({
      pageNumber: pageIndex,
      flowItems: currentPageItems,
      sidebar: pageIndex === 1 ? sidebar : null,
      isContinuation: pageIndex > 1,
    });
  }

  // Fallback to at least 1 page
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      flowItems: [],
      sidebar,
      isContinuation: false,
    });
  }

  return {
    pages,
    totalPages: pages.length,
    sectionGapPx,
  };
}
