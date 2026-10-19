/**
 * Smart Hybrid Resume Engine — Section-Aware A4 Partitioner
 *
 * DIR-008 changes:
 * - Layout specifications drive main-column ordering and rail placement.
 * - Sections are explicit flow blocks; a section that crosses a page boundary
 *   emits a continuation heading on the next sheet.
 * - Conservative CSS-pixel capacities shared with the sheet geometry.
 * - Oversized single items are split into continuation chunks instead of being
 *   force-placed and silently clipped by the fixed A4 height.
 * - First-page capacity accounts for the actual identity block family.
 */

import { getLayoutSpec, type AsideSectionKey, type SectionKey } from './template-layouts';

export interface FlowItem {
  id: string;
  type:
    | 'summary'
    | 'experience'
    | 'education'
    | 'projects'
    | 'certifications'
    | 'skills'
    | 'languages'
    | 'achievements'
    | 'hobbies'
    | 'references';
  /** Human-readable section label used by continuation headings. */
  sectionLabel?: string;
  /** Backwards-compatible alias consumed by older render paths. */
  title?: string;
  section?: SectionKey;
  isSectionStart?: boolean;
  continued?: boolean;
  data: any;
  estimatedHeight: number;
}

export interface SidebarData {
  photo?: string | null;
  sections?: SectionKey[];
  skills?: Array<string | { name: string; rating?: number; level?: string }>;
  categories?: Array<{ id?: string; category?: string; skills?: any[] }>;
  certifications?: Array<{ id?: string; name?: string; title?: string; issuer?: string; date?: string }>;
  languages?: Array<{ id?: string; name?: string; language?: string; proficiency?: string; level?: string; rating?: number }>;
  education?: Array<any>;
  projects?: Array<any>;
  achievements?: Array<any>;
  summary?: string;
  contact?: {
    fullName: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    linkedin?: string;
    github?: string;
    photo?: string;
    showPhoto?: boolean;
  };
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
  layoutId: string;
}

export const SECTION_TITLES: Record<SectionKey, string> = {
  summary: 'Professional Profile',
  experience: 'Work Experience',
  education: 'Education',
  projects: 'Key Projects',
  achievements: 'Key Achievements',
  skills: 'Core Competencies',
  certifications: 'Certifications',
  languages: 'Languages',
  hobbies: 'Interests & Hobbies',
  references: 'References',
};

function getTextLength(str: any): number {
  if (!str) return 0;
  return String(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function cloneItem(item: FlowItem, overrides: Partial<FlowItem>): FlowItem {
  return { ...item, ...overrides };
}

function estimateExperienceHeight(exp: any, charsPerLine: number, lineHeight: number): number {
  const descLen = getTextLength(exp.description);
  const descLines = descLen ? Math.max(1, Math.ceil(descLen / charsPerLine)) : 0;
  return 24 + 17 + descLines * lineHeight + 14;
}

function estimateEducationHeight(edu: any, charsPerLine: number, lineHeight: number): number {
  const descLen = getTextLength(edu.description);
  const descLines = descLen ? Math.max(1, Math.ceil(descLen / charsPerLine)) : 0;
  return 22 + 17 + descLines * lineHeight + 12;
}

function splitSummaryBlocks(text: string, maxChars = 700): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  if (raw.length <= maxChars) return [raw];
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const blocks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      blocks.push(current.trim());
      current = '';
    }
    current += (current ? ' ' : '') + sentence;
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks.length ? blocks : [raw];
}

/** Splits rich-text descriptions while preserving paragraph boundaries. */
function splitDescriptionBlocks(text: string, maxChars: number): string[] {
  const raw = String(text || '');
  if (!raw.trim()) return [raw];
  const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= maxChars) return [raw];
  const hasMarkup = /<\/?[a-z][\s\S]*>/i.test(raw);
  const source = hasMarkup ? raw.replace(/<\/(p|li|div|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ') : raw;
  const sentences = source.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      blocks.push(current.trim());
      current = '';
    }
    current += (current ? ' ' : '') + sentence;
  }
  if (current.trim()) blocks.push(current.trim());
  return blocks.length ? blocks : [plain];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

/**
 * Splits one oversized flow item into page-sized continuation chunks. The first
 * chunk keeps the section start; the rest are marked `continued` so the renderer
 * can print a "(continued)" heading rather than dropping the section label.
 */
function splitOversizedItem(item: FlowItem, limit: number, charsPerLine: number, lineHeight: number): FlowItem[] {
  if (item.estimatedHeight <= limit) return [item];
  const availableBody = Math.max(120, limit - 70);
  const charsPerChunk = Math.max(120, Math.floor((availableBody / lineHeight) * charsPerLine));

  if (['experience', 'education', 'projects', 'references', 'achievements'].includes(item.type)) {
    const description = String(item.data?.description || item.data?.summary || '');
    if (getTextLength(description) > charsPerChunk) {
      const blocks = splitDescriptionBlocks(description, charsPerChunk);
      return blocks.map((block, index) => {
        const data = { ...item.data, description: block };
        const estimate = item.type === 'experience'
          ? estimateExperienceHeight(data, charsPerLine, lineHeight)
          : Math.min(limit - 12, item.estimatedHeight / blocks.length + 20);
        return cloneItem(item, {
          id: `${item.id}-part-${index + 1}`,
          data,
          isSectionStart: index === 0 ? item.isSectionStart : false,
          continued: index > 0,
          title: index === 0 ? item.title : undefined,
          estimatedHeight: Math.min(limit - 12, Math.max(90, estimate)),
        });
      });
    }
  }

  if (item.type === 'skills' || item.type === 'certifications' || item.type === 'languages') {
    const list = Array.isArray(item.data) ? item.data : [];
    if (list.length > 1) {
      const parts = Math.min(4, Math.ceil(item.estimatedHeight / (limit - 40)));
      const size = Math.max(1, Math.ceil(list.length / parts));
      return chunkArray(list, size).map((chunk, index) => cloneItem(item, {
        id: `${item.id}-part-${index + 1}`,
        data: chunk,
        isSectionStart: index === 0 ? item.isSectionStart : false,
        continued: index > 0,
        title: index === 0 ? item.title : undefined,
        estimatedHeight: Math.min(limit - 12, Math.max(60, item.estimatedHeight / parts + 16)),
      }));
    }
  }

  return [cloneItem(item, { estimatedHeight: Math.min(item.estimatedHeight, limit - 12) })];
}

function firstPageHeaderHeight(layout: any, hasPhoto: boolean): number {
  if (layout.header === 'sidebar') return 16;
  switch (layout.family) {
    case 'banner':
    case 'banner-sidebar':
    case 'infographic':
    case 'technical':
      return hasPhoto ? 176 : 148;
    case 'cv34':
      return 196;
    case 'cv1':
      return 150;
    case 'magazine':
    case 'portfolio':
      return hasPhoto ? 190 : 150;
    case 'academic':
    case 'cv4':
      return 142;
    case 'europass':
      return hasPhoto ? 168 : 130;
    case 'executive':
      return 136;
    case 'editorial':
      return 148;
    default:
      return hasPhoto ? 150 : 122;
  }
}

export function partitionResumeContent(
  resume: any,
  theme: any,
  density: 'compact' | 'standard' | 'spacious' = 'standard'
): PartitionResult {
  const layout = getLayoutSpec(theme.id);
  const effectiveDensity = density || layout.density || 'standard';
  const densityScale = effectiveDensity === 'compact' ? 0.9 : effectiveDensity === 'spacious' ? 1.16 : 1.0;
  const lineHeight = 15 * densityScale;
  const charsPerLine = Math.round((layout.aside ? 66 : 92) / densityScale);
  const sectionGapPx = Math.round(effectiveDensity === 'compact' ? 11 : effectiveDensity === 'spacious' ? 18 : 14);

  const asideSet = new Set(layout.asideSections);
  const blocks = new Map<SectionKey, FlowItem[]>();

  const pushBlock = (section: SectionKey, items: Omit<FlowItem, 'sectionLabel' | 'section' | 'title' | 'isSectionStart'>[]) => {
    if (asideSet.has(section as AsideSectionKey) || items.length === 0) return;
    const labelled = items.map((item, index) => ({
      ...item,
      section,
      sectionLabel: SECTION_TITLES[section],
      title: index === 0 ? SECTION_TITLES[section] : undefined,
      isSectionStart: index === 0,
      estimatedHeight: item.estimatedHeight + (index === 0 ? 24 : 0),
    })) as FlowItem[];
    blocks.set(section, labelled);
  };

  if (resume.summary && String(resume.summary).trim()) {
    const summaryBlocks = splitSummaryBlocks(resume.summary);
    pushBlock('summary', summaryBlocks.map((block, index) => ({
      id: `summary-${index}`,
      type: 'summary' as const,
      data: block,
      estimatedHeight: 22 + Math.ceil(getTextLength(block) / charsPerLine) * lineHeight + sectionGapPx,
    })));
  }

  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    pushBlock('experience', resume.experience.map((exp: any, index: number) => ({
      id: exp.id || `exp-${index}`,
      type: 'experience' as const,
      data: exp,
      estimatedHeight: estimateExperienceHeight(exp, charsPerLine, lineHeight),
    })));
  }

  if (Array.isArray(resume.education) && resume.education.length > 0) {
    pushBlock('education', resume.education.map((edu: any, index: number) => ({
      id: edu.id || `edu-${index}`,
      type: 'education' as const,
      data: edu,
      estimatedHeight: estimateEducationHeight(edu, charsPerLine, lineHeight),
    })));
  }

  if (Array.isArray(resume.projects) && resume.projects.length > 0) {
    pushBlock('projects', resume.projects.map((project: any, index: number) => ({
      id: project.id || `proj-${index}`,
      type: 'projects' as const,
      data: project,
      estimatedHeight: 34 + Math.ceil(getTextLength(project.description) / charsPerLine) * lineHeight + 10,
    })));
  }

  if (Array.isArray(resume.achievements) && resume.achievements.length > 0) {
    pushBlock('achievements', resume.achievements.map((achievement: any, index: number) => ({
      id: achievement.id || `ach-${index}`,
      type: 'achievements' as const,
      data: achievement,
      estimatedHeight: 30 + Math.ceil(getTextLength(achievement.description) / charsPerLine) * lineHeight + 10,
    })));
  }

  const categories = Array.isArray(resume.skillCategories) && resume.skillCategories.length
    ? resume.skillCategories
    : Array.isArray(resume.skills) && resume.skills.length
      ? [{
          id: 'core',
          category: 'Core Skills',
          skills: resume.skills.map((skill: any) => typeof skill === 'string' ? skill : (skill.name || skill.skillName || skill.skill || '')),
        }]
      : [];
  if (categories.length > 0) {
    const allSkills = categories.flatMap((category: any) => category.skills || []);
    pushBlock('skills', [{
      id: 'skills-main',
      type: 'skills' as const,
      data: categories,
      estimatedHeight: 28 + Math.ceil(allSkills.length / (layout.aside ? 2 : 4)) * 24 + sectionGapPx,
    }]);
  }

  if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
    pushBlock('certifications', [{
      id: 'certifications-main',
      type: 'certifications' as const,
      data: resume.certifications,
      estimatedHeight: 28 + resume.certifications.length * 20 + sectionGapPx,
    }]);
  }

  if (Array.isArray(resume.languages) && resume.languages.length > 0) {
    pushBlock('languages', [{
      id: 'languages-main',
      type: 'languages' as const,
      data: resume.languages,
      estimatedHeight: 28 + resume.languages.length * 20 + sectionGapPx,
    }]);
  }

  const hobbies = Array.isArray(resume.hobbies)
    ? resume.hobbies.map((hobby: any) => typeof hobby === 'string' ? hobby : (hobby.name || '')).filter(Boolean)
    : [];
  if (hobbies.length > 0) {
    pushBlock('hobbies', [{
      id: 'hobbies-main',
      type: 'hobbies' as const,
      data: hobbies,
      estimatedHeight: 28 + Math.ceil(hobbies.length / 4) * 22 + sectionGapPx,
    }]);
  }

  if (Array.isArray(resume.references) && resume.references.length > 0) {
    pushBlock('references', resume.references.map((reference: any, index: number) => ({
      id: reference.id || `ref-${index}`,
      type: 'references' as const,
      data: reference,
      estimatedHeight: 32 + Math.ceil(getTextLength(reference.description) / charsPerLine) * lineHeight + 10,
    })));
  }

  const flowItems: FlowItem[] = [];
  for (const section of layout.mainOrder) {
    const block = blocks.get(section);
    if (block) flowItems.push(...block);
  }
  // A rail may be empty or absent; never drop a populated section.
  for (const [section, block] of blocks.entries()) {
    if (!layout.mainOrder.includes(section) && !asideSet.has(section as AsideSectionKey)) flowItems.push(...block);
  }

  const hasPhoto = Boolean(resume.heading?.photo && resume.heading?.showPhoto !== false);
  const page1HeaderHeight = firstPageHeaderHeight(layout, hasPhoto);
  // 1123 px A4 height - 64 px sheet padding - 32 px footer - 24 px safety.
  const PAGE_SAFE_HEIGHT = 1123 - 64 - 32 - 24;
  const PAGE1_CAPACITY = Math.max(420, PAGE_SAFE_HEIGHT - page1HeaderHeight);
  const CONTINUATION_CAPACITY = Math.max(420, PAGE_SAFE_HEIGHT - 58);

  const sidebar: SidebarData | null = layout.aside
    ? {
        photo: hasPhoto ? resume.heading?.photo : null,
        sections: layout.asideSections.filter((section) => section !== 'contact') as SectionKey[],
        skills: categories.flatMap((category: any) => category.skills || []),
        categories,
        certifications: Array.isArray(resume.certifications) ? resume.certifications : [],
        languages: Array.isArray(resume.languages) ? resume.languages : [],
        education: Array.isArray(resume.education) ? resume.education : [],
        projects: Array.isArray(resume.projects) ? resume.projects : [],
        achievements: Array.isArray(resume.achievements) ? resume.achievements : [],
        summary: resume.summary || '',
        contact: {
          fullName: `${resume.heading?.firstName || ''} ${resume.heading?.lastName || ''}`.trim() || resume.name || 'Candidate',
          title: resume.heading?.title || '',
          email: resume.heading?.email || '',
          phone: resume.heading?.phone || '',
          location: resume.heading?.location || '',
          website: resume.heading?.website || '',
          linkedin: resume.heading?.linkedin || '',
          github: resume.heading?.github || '',
          photo: resume.heading?.photo || '',
          showPhoto: resume.heading?.showPhoto !== false,
        },
      }
    : null;

  const pages: PartitionedPage[] = [];
  let currentPageItems: FlowItem[] = [];
  let currentHeight = 0;
  let pageIndex = 1;

  const flush = () => {
    if (currentPageItems.length === 0) return;
    pages.push({
      pageNumber: pageIndex,
      flowItems: currentPageItems,
      sidebar: pageIndex === 1 ? sidebar : null,
      isContinuation: pageIndex > 1,
    });
    pageIndex += 1;
    currentPageItems = [];
    currentHeight = 0;
  };

  const capacityFor = (index: number) => index === 1 ? PAGE1_CAPACITY : CONTINUATION_CAPACITY;

  for (const rawItem of flowItems) {
    const limit = capacityFor(pageIndex);
    const parts = splitOversizedItem(rawItem, limit, charsPerLine, lineHeight);
    for (const item of parts) {
      const itemLimit = capacityFor(pageIndex);
      const orphanGuard = item.isSectionStart ? 22 : 0;
      if (currentHeight + item.estimatedHeight + orphanGuard <= itemLimit) {
        currentPageItems.push(item);
        currentHeight += item.estimatedHeight;
        continue;
      }
      if (currentPageItems.length > 0) {
        flush();
        const nextLimit = capacityFor(pageIndex);
        currentPageItems.push(item);
        currentHeight = Math.min(item.estimatedHeight, nextLimit);
      } else {
        // A single chunk larger than an empty page is clamped, never clipped by
        // silently overflowing the fixed sheet height.
        const clamped = cloneItem(item, { estimatedHeight: Math.min(item.estimatedHeight, itemLimit - 12) });
        currentPageItems.push(clamped);
        currentHeight = clamped.estimatedHeight;
        flush();
      }
    }
  }
  flush();

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, flowItems: [], sidebar, isContinuation: false });
  }

  return {
    pages,
    totalPages: pages.length,
    sectionGapPx,
    layoutId: layout.id,
  };
}
