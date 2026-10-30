/**
 * Web CV portfolio document model.
 *
 * This is the storage contract shared with the legacy Web CV studio and read by
 * the backend projections (backend/routes/portfolios.js; MySQLRepository
 * `_portfolioProjection` for owners and `_publicPortfolioProjection` for
 * visitors). It is implemented natively here. It reads every shape the legacy
 * studio wrote and writes documents that the legacy studio and the public
 * projection read, so sections this builder does not edit are carried through
 * unchanged instead of being silently dropped.
 *
 * Stored document (top level of the `portfolio` object sent to POST /portfolios/:id):
 *   renderer 'webcv', templateKey, canonical, content [], root.props {title, description},
 *   title, description, tags, seoTitle, seoDescription, theme, isPublished, slug (address base)
 */

export const PORTFOLIO_TEMPLATES = [
  { id: 'modernMinimal', name: 'Modern Minimal', mood: 'light', theme: 'minimal', description: 'Light, spacious layout with crisp type.' },
  { id: 'executive', name: 'Executive', mood: 'light', theme: 'professional', description: 'A strong profile header and an experience timeline.' },
  { id: 'creativeDark', name: 'Creative Dark', mood: 'dark', theme: 'creative', description: 'A warm dark canvas that puts projects first.' },
  { id: 'premiumTech', name: 'Premium Tech', mood: 'dark', theme: 'dark', description: 'A dark technical layout with skills up front.' },
] as const;

export type PortfolioTemplateId = (typeof PORTFOLIO_TEMPLATES)[number]['id'];
export const DEFAULT_TEMPLATE: PortfolioTemplateId = 'modernMinimal';

/** Template ids written by older studio versions, mapped as the legacy studio maps them. */
const TEMPLATE_ALIASES: Record<string, PortfolioTemplateId> = {
  darkCyber: 'premiumTech',
  darkTerminal: 'premiumTech',
  darkCyberSec: 'premiumTech',
  terminal: 'premiumTech',
  cyberSecurity: 'premiumTech',
  artist: 'creativeDark',
  default: 'modernMinimal',
  minimal: 'modernMinimal',
  professional: 'executive',
  creative: 'creativeDark',
  dark: 'premiumTech',
};

export function resolveTemplate(input: unknown): PortfolioTemplateId {
  const raw = text(input);
  const known = PORTFOLIO_TEMPLATES.find((template) => template.id === raw);
  return known ? known.id : TEMPLATE_ALIASES[raw] ?? DEFAULT_TEMPLATE;
}

export function templateMeta(id: unknown) {
  const resolved = resolveTemplate(id);
  return PORTFOLIO_TEMPLATES.find((template) => template.id === resolved) ?? PORTFOLIO_TEMPLATES[0];
}

/* ─── Canonical model ─── */

export interface PortfolioHeading {
  firstname: string;
  lastname: string;
  fullName: string;
  occupation: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  address: string;
  postalcode: string;
  website: string;
  linkedin: string;
  github: string;
  photo: string;
}

export interface PortfolioExperience { id: string; jobTitle: string; employer: string; begin: string; end: string; description: string; date: number; location: string }
export interface PortfolioEducation { id: string; school: string; degree: string; started: string; finished: string; description: string; date: number }
export interface PortfolioSkill { id: string; name: string; skillName: string; rating: number; category: string }
export interface PortfolioProject { id: string; title: string; description: string; link: string; technologies: string; technologyList: string[]; image: string }
export interface PortfolioCertification { id: string; title: string; issuer: string; date: string; description: string; link: string }
export interface PortfolioAchievement { id: string; title: string; description: string }
export interface PortfolioReference { id: string; name: string; reference: string }
export interface PortfolioLanguage { id: string; name: string; level: string }
export interface PortfolioCustomSection { id: string; title: string; items: Array<{ id: string; title: string; description: string }>; content: string }

/**
 * Section-level visibility. A hidden section is NEVER deleted: the content stays
 * in the canonical document (so the candidate can show it again) and only the
 * projection handed to a renderer — the live preview and the public page — drops
 * it. Missing or unrecognised flags mean "visible", which is what every document
 * saved before this model existed must be read as.
 */
export interface PortfolioVisibility {
  showExperience: boolean;
  showEducation: boolean;
  showProjects: boolean;
  showSkills: boolean;
  showContact: boolean;
}

export const VISIBILITY_KEYS = [
  'showExperience',
  'showEducation',
  'showProjects',
  'showSkills',
  'showContact',
] as const;

export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];

export const VISIBILITY_LABELS: Record<VisibilityKey, { label: string; description: string }> = {
  showExperience: { label: 'Experience', description: 'Roles, employers and dates.' },
  showEducation: { label: 'Education', description: 'Schools, degrees and dates.' },
  showProjects: { label: 'Projects', description: 'Project names, links and descriptions.' },
  showSkills: { label: 'Skills', description: 'Skill rows and groups.' },
  showContact: { label: 'Contact details', description: 'Email, phone, website, LinkedIn and GitHub links.' },
};

export function defaultVisibility(): PortfolioVisibility {
  return {
    showExperience: true,
    showEducation: true,
    showProjects: true,
    showSkills: true,
    showContact: true,
  };
}

/**
 * Reads visibility from any shape a document may hold, defaulting to visible.
 * Only an explicit boolean `false` (or the legacy string `'false'`) hides a
 * section, so unexpected values never silently hide a candidate's content.
 */
export function normalizeVisibility(input: unknown): PortfolioVisibility {
  const source = (input && typeof input === 'object' ? input : {}) as Loose;
  const read = (key: VisibilityKey): boolean => {
    const value = source[key];
    if (value === false) return false;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return false;
    return true;
  };
  return {
    showExperience: read('showExperience'),
    showEducation: read('showEducation'),
    showProjects: read('showProjects'),
    showSkills: read('showSkills'),
    showContact: read('showContact'),
  };
}

export function visibilityOf(canonical: unknown): PortfolioVisibility {
  const source = (canonical && typeof canonical === 'object' ? canonical : {}) as Loose;
  return normalizeVisibility(source.visibility);
}

export interface PortfolioCanonical {
  version: 1;
  template: PortfolioTemplateId;
  heading: PortfolioHeading;
  summary: string;
  experiences: PortfolioExperience[];
  education: PortfolioEducation[];
  skills: PortfolioSkill[];
  projects: PortfolioProject[];
  certifications: PortfolioCertification[];
  achievements: PortfolioAchievement[];
  references: PortfolioReference[];
  languages: PortfolioLanguage[];
  hobbies: string[];
  customSections: PortfolioCustomSection[];
  extras: { tagline: string; heroImage: string; seoTitle: string; seoDescription: string };
  source: { resumeId: string | null; resumeTitle: string; ingestedAt: string | null };
  visibility: PortfolioVisibility;
}

type Loose = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function idOr(prefix: string, index: number, existing: unknown): string {
  return text(existing) || `${prefix}-${index}`;
}

function objects(...candidates: unknown[]): Loose[] {
  const list = candidates.find((candidate) => Array.isArray(candidate) && candidate.length) ?? candidates.find(Array.isArray) ?? [];
  return (list as unknown[]).filter((item): item is Loose => Boolean(item) && typeof item === 'object');
}

function first(source: Loose, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return '';
}

function techList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(typeof item === 'string' ? item : (item as Loose)?.name ?? (item as Loose)?.title)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function hobbyList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(typeof item === 'string' ? item : (item as Loose)?.name ?? (item as Loose)?.title ?? (item as Loose)?.hobby)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,|\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export function emptyHeading(): PortfolioHeading {
  return { firstname: '', lastname: '', fullName: '', occupation: '', email: '', phone: '', city: '', country: '', address: '', postalcode: '', website: '', linkedin: '', github: '', photo: '' };
}

export function emptyCanonical(template: unknown = DEFAULT_TEMPLATE): PortfolioCanonical {
  return {
    version: 1,
    template: resolveTemplate(template),
    heading: emptyHeading(),
    summary: '',
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    achievements: [],
    references: [],
    languages: [],
    hobbies: [],
    customSections: [],
    extras: { tagline: '', heroImage: '', seoTitle: '', seoDescription: '' },
    source: { resumeId: null, resumeTitle: '', ingestedAt: null },
    visibility: defaultVisibility(),
  };
}

function headingFrom(input: Loose): PortfolioHeading {
  const firstname = first(input, 'firstname', 'firstName');
  const lastname = first(input, 'lastname', 'lastName');
  return {
    firstname,
    lastname,
    fullName: first(input, 'fullName', 'name') || [firstname, lastname].filter(Boolean).join(' '),
    occupation: first(input, 'occupation', 'jobTitle', 'title'),
    email: first(input, 'email'),
    phone: first(input, 'phone'),
    city: first(input, 'city'),
    country: first(input, 'country'),
    address: first(input, 'address'),
    postalcode: first(input, 'postalcode', 'postalCode'),
    website: first(input, 'website', 'websiteUrl'),
    linkedin: first(input, 'linkedin', 'linkedinUrl'),
    github: first(input, 'github', 'githubUrl'),
    photo: typeof input.photo === 'string' ? input.photo : '',
  };
}

const experienceFrom = (item: Loose, index: number): PortfolioExperience => ({
  id: idOr('experience', index, item.id ?? item.employmentId),
  jobTitle: first(item, 'jobTitle', 'position', 'role', 'title'),
  employer: first(item, 'employer', 'company', 'organization', 'venue'),
  begin: first(item, 'begin', 'startDate', 'started', 'from'),
  end: first(item, 'end', 'endDate', 'finished', 'to'),
  description: first(item, 'description', 'summary', 'content'),
  date: finite(item.date, index + 1),
  location: first(item, 'location', 'city'),
});

const educationFrom = (item: Loose, index: number): PortfolioEducation => ({
  id: idOr('education', index, item.id ?? item.educationId),
  school: first(item, 'school', 'institution', 'university', 'college'),
  degree: first(item, 'degree', 'qualification', 'area', 'title'),
  started: first(item, 'started', 'startDate', 'begin', 'from'),
  finished: first(item, 'finished', 'endDate', 'end', 'to'),
  description: first(item, 'description', 'summary'),
  date: finite(item.date, index + 1),
});

function skillFrom(item: unknown, index: number): PortfolioSkill {
  const source: Loose = typeof item === 'object' && item ? (item as Loose) : {};
  const name = typeof item === 'string' ? text(item) : first(source, 'skillName', 'name', 'skill', 'title');
  return { id: idOr('skill', index, source.id), name, skillName: name, rating: finite(source.rating, 50), category: first(source, 'category', 'group') };
}

function projectFrom(item: Loose, index: number): PortfolioProject {
  const list = techList(item.technologyList ?? item.technologies ?? item.tech ?? item.stack ?? item.skills);
  return {
    id: idOr('project', index, item.id),
    title: first(item, 'title', 'name', 'projectName'),
    description: first(item, 'description', 'summary', 'content'),
    link: first(item, 'link', 'url', 'website', 'href'),
    technologies: list.join(', '),
    technologyList: list,
    image: first(item, 'image', 'preview', 'thumbnail'),
  };
}

const certificationFrom = (item: Loose, index: number): PortfolioCertification => ({
  id: idOr('certification', index, item.id),
  title: first(item, 'title', 'name'),
  issuer: first(item, 'issuer', 'organization', 'authority', 'institution'),
  date: first(item, 'date', 'year', 'issued'),
  description: first(item, 'description', 'summary'),
  link: first(item, 'link', 'url', 'credentialUrl', 'certificateUrl'),
});

const achievementFrom = (item: Loose, index: number): PortfolioAchievement => ({
  id: idOr('achievement', index, item.id),
  title: first(item, 'title', 'name'),
  description: first(item, 'description', 'summary', 'content'),
});

const referenceFrom = (item: Loose, index: number): PortfolioReference => ({
  id: idOr('reference', index, item.id),
  name: first(item, 'name', 'title'),
  reference: first(item, 'reference', 'description', 'content', 'quote'),
});

function languageFrom(item: unknown, index: number): PortfolioLanguage {
  const source: Loose = typeof item === 'object' && item ? (item as Loose) : {};
  return { id: idOr('language', index, source.id), name: typeof item === 'string' ? text(item) : first(source, 'name', 'language'), level: first(source, 'level', 'proficiency') };
}

function customSectionFrom(section: Loose, index: number): PortfolioCustomSection {
  const items = (Array.isArray(section.items) ? section.items : [])
    .map((item: unknown, itemIndex: number) => {
      if (typeof item === 'string') return text(item) ? { id: `custom-${index}-item-${itemIndex}`, title: text(item), description: '' } : null;
      if (!item || typeof item !== 'object') return null;
      const entry = item as Loose;
      const title = first(entry, 'title', 'name');
      const description = first(entry, 'description', 'content');
      return title || description ? { id: idOr(`custom-${index}-item`, itemIndex, entry.id), title, description } : null;
    })
    .filter((item): item is { id: string; title: string; description: string } => item !== null);
  const content = text(section.content);
  if (!items.length && content) items.push({ id: `custom-${index}-body`, title: '', description: content });
  return { id: idOr('custom', index, section.id), title: first(section, 'title', 'sectionTitle').slice(0, 100), items, content };
}

/**
 * Reads a canonical portfolio from any stored shape: the canonical object itself,
 * a document holding `canonical` (legacy top-level) or `data.canonical`, with the
 * field aliases older studio versions used.
 */
export function normalizeCanonical(input: unknown, template?: unknown): PortfolioCanonical {
  const container = (input && typeof input === 'object' ? input : {}) as Loose;
  const data = container.data && typeof container.data === 'object' ? (container.data as Loose) : null;
  const raw = (container.canonical && typeof container.canonical === 'object'
    ? container.canonical
    : data?.canonical && typeof data.canonical === 'object' ? data.canonical : container) as Loose;
  const extras = (raw.extras && typeof raw.extras === 'object' ? raw.extras : {}) as Loose;
  const source = (raw.source && typeof raw.source === 'object' ? raw.source : {}) as Loose;
  return {
    version: 1,
    template: resolveTemplate(template ?? raw.template ?? container.templateKey ?? container.template),
    heading: headingFrom((raw.heading && typeof raw.heading === 'object' ? raw.heading : raw) as Loose),
    summary: first(raw, 'summary', 'about', 'professionalSummary'),
    experiences: objects(raw.experiences, raw.experience, raw.employments).map(experienceFrom),
    education: objects(raw.education, raw.educations).map(educationFrom),
    skills: (Array.isArray(raw.skills) ? raw.skills : []).map(skillFrom).filter((skill) => skill.name),
    projects: objects(raw.projects).map(projectFrom),
    certifications: objects(raw.certifications).map(certificationFrom),
    achievements: objects(raw.achievements, raw.awards).map(achievementFrom),
    references: objects(raw.references).map(referenceFrom),
    languages: (Array.isArray(raw.languages) ? raw.languages : []).map(languageFrom).filter((language) => language.name),
    hobbies: hobbyList(raw.hobbies),
    customSections: objects(raw.customSections).map(customSectionFrom),
    extras: { tagline: first(extras, 'tagline') || first(raw, 'tagline'), heroImage: first(extras, 'heroImage') || first(raw, 'heroImage'), seoTitle: first(extras, 'seoTitle'), seoDescription: first(extras, 'seoDescription') },
    source: { resumeId: text(source.resumeId) || null, resumeTitle: text(source.resumeTitle), ingestedAt: text(source.ingestedAt) || null },
    visibility: normalizeVisibility(raw.visibility),
  };
}

/**
 * Builds a portfolio from a stored resume row (GET /api/resumes/:id). Resume rows
 * keep the contact fields at the top level and use `title` for the resume's own
 * name, so the heading is mapped explicitly rather than through the aliases.
 */
export function canonicalFromResume(resume: Loose, template?: unknown): PortfolioCanonical {
  const heading = (resume.heading && typeof resume.heading === 'object' ? resume.heading : {}) as Loose;
  const firstname = first(heading, 'firstName', 'firstname') || first(resume, 'firstname', 'firstName');
  const lastname = first(heading, 'lastName', 'lastname') || first(resume, 'lastname', 'lastName');
  const fromRows = normalizeCanonical({ ...resume, heading: undefined, title: undefined }, template);
  const skillsSource = Array.isArray(resume.skills) && resume.skills.length
    ? resume.skills
    : Array.isArray(resume.skillCategories)
      ? (resume.skillCategories as Loose[]).flatMap((group) => (Array.isArray(group?.skills) ? group.skills : []).map((name: unknown) => ({ name, category: group?.category ?? group?.name })))
      : [];
  return {
    ...fromRows,
    heading: {
      firstname,
      lastname,
      fullName: [firstname, lastname].filter(Boolean).join(' '),
      occupation: first(heading, 'title') || first(resume, 'occupation'),
      email: first(heading, 'email') || first(resume, 'email'),
      phone: first(heading, 'phone') || first(resume, 'phone'),
      city: first(resume, 'city'),
      country: first(resume, 'country'),
      address: first(resume, 'address'),
      postalcode: first(resume, 'postalcode', 'postalCode'),
      website: first(heading, 'website') || first(resume, 'website'),
      linkedin: first(heading, 'linkedin') || first(resume, 'linkedin'),
      github: first(heading, 'github') || first(resume, 'github'),
      photo: first(heading, 'photo') || first(resume, 'photo'),
    },
    skills: skillsSource.map(skillFrom).filter((skill) => skill.name),
    source: { resumeId: text(resume.id) || null, resumeTitle: first(resume, 'name', 'title'), ingestedAt: new Date().toISOString() },
  };
}

export function displayName(canonical: PortfolioCanonical): string {
  return canonical.heading.fullName || [canonical.heading.firstname, canonical.heading.lastname].filter(Boolean).join(' ');
}

/** True when the portfolio has something a visitor could read. */
export function hasContent(canonical: PortfolioCanonical): boolean {
  return Boolean(displayName(canonical) || canonical.summary || canonical.experiences.length || canonical.education.length || canonical.projects.length || canonical.skills.length);
}

/* ─── Stored document ─── */

/** Fields the server derives or projects; they are never written back. */
const SERVER_FIELDS = ['id', 'userId', 'revision', 'createdAt', 'updatedAt', 'publishedAt', 'data', 'metadata', 'slug', 'isPublished'];

export interface BuildDocumentInput {
  canonical: PortfolioCanonical;
  title: string;
  isPublished: boolean;
  /** Address base used when the portfolio is first published; ignored afterwards by the server. */
  slugBase?: string;
  /** The document as last loaded, so unknown fields survive a save. */
  previous?: Loose | null;
}

export function buildDocument({ canonical, title, isPublished, slugBase, previous }: BuildDocumentInput): Loose {
  const kept: Loose = {};
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (!SERVER_FIELDS.includes(key)) kept[key] = value;
  }
  const template = resolveTemplate(canonical.template);
  const visibility = normalizeVisibility(canonical.visibility);
  const name = displayName(canonical);
  const cleanTitle = text(title) || name || 'My Web CV';
  const description = canonical.summary.slice(0, 500);
  const previousRoot = (kept.root && typeof kept.root === 'object' ? kept.root : {}) as Loose;
  const previousProps = (previousRoot.props && typeof previousRoot.props === 'object' ? previousRoot.props : {}) as Loose;
  return {
    ...kept,
    renderer: 'webcv',
    templateKey: template,
    template,
    canonical: { ...canonical, template, visibility },
    content: Array.isArray(kept.content) ? kept.content : [],
    root: { ...previousRoot, props: { ...previousProps, title: cleanTitle, description } },
    title: cleanTitle,
    description,
    tags: Array.isArray(kept.tags) && kept.tags.length ? kept.tags : [template],
    seoTitle: canonical.extras.seoTitle || name || cleanTitle,
    seoDescription: (canonical.extras.seoDescription || canonical.summary).slice(0, 300),
    theme: templateMeta(template).theme,
    visibility,
    isPublished,
    ...(slugBase ? { slug: slugBase } : {}),
  };
}

/**
 * The projection a renderer receives: the same document with every hidden
 * section dropped. Deterministic and idempotent — running it on its own output
 * changes nothing — and it never mutates its input, so the candidate's stored
 * content is untouched. Hidden contact details become empty strings rather than
 * being removed, so the heading keeps its shape.
 */
export function canonicalWithVisibility(canonical: PortfolioCanonical): PortfolioCanonical {
  const visibility = normalizeVisibility(canonical.visibility);
  if (VISIBILITY_KEYS.every((key) => visibility[key])) return canonical;
  const heading = { ...canonical.heading };
  if (!visibility.showContact) {
    heading.email = '';
    heading.phone = '';
    heading.website = '';
    heading.linkedin = '';
    heading.github = '';
  }
  return {
    ...canonical,
    heading,
    experiences: visibility.showExperience ? canonical.experiences : [],
    education: visibility.showEducation ? canonical.education : [],
    projects: visibility.showProjects ? canonical.projects : [],
    skills: visibility.showSkills ? canonical.skills : [],
    visibility,
  };
}

/** True when at least one section is hidden — used for the public/owner notices. */
export function hasHiddenSections(canonical: PortfolioCanonical): boolean {
  const visibility = normalizeVisibility(canonical.visibility);
  return VISIBILITY_KEYS.some((key) => !visibility[key]);
}

/**
 * Publication + visibility projection of a stored document: the shape a renderer
 * (live preview, public page) is allowed to read.
 *
 * It is deliberately a READ projection. Persisting an editable portfolio goes
 * through `buildDocument`, which keeps every section in `canonical` and stores
 * the flags alongside, so hiding a section never deletes the candidate's content.
 * This function is used to (a) flip publication state on a document this builder
 * cannot edit, and (b) hand a renderer a document whose hidden sections are gone.
 */
export function documentWithVisibility(
  previous: Loose,
  isPublished: boolean,
  visibility?: Partial<PortfolioVisibility>,
): Loose {
  const next: Loose = {};
  for (const [key, value] of Object.entries(previous)) {
    if (!SERVER_FIELDS.includes(key)) next[key] = value;
  }
  const data = previous.data && typeof previous.data === 'object' ? (previous.data as Loose) : null;
  if (data && !Array.isArray(previous.content) && Array.isArray(data.content)) next.data = data;
  const canonical = (next.canonical && typeof next.canonical === 'object' ? next.canonical : null) as Loose | null;
  const resolved = normalizeVisibility({ ...(canonical?.visibility as Loose | undefined), ...visibility });
  next.visibility = resolved;
  if (canonical) {
    next.canonical = canonicalWithVisibility({ ...(canonical as unknown as PortfolioCanonical), visibility: resolved });
  }
  next.isPublished = isPublished;
  return next;
}

/** Documents built with the previous page editor (renderer 'puck') carry no canonical Web CV. */
export function isWebCvDocument(document: Loose | null | undefined): boolean {
  if (!document) return false;
  const data = document.data && typeof document.data === 'object' ? (document.data as Loose) : null;
  const renderer = text(document.renderer) || text(data?.renderer);
  if (renderer === 'webcv') return true;
  const hasCanonical = Boolean((document.canonical && typeof document.canonical === 'object') || (data?.canonical && typeof data.canonical === 'object'));
  const blocks = Array.isArray(document.content) ? document.content : Array.isArray(data?.content) ? data.content : [];
  return hasCanonical || blocks.length === 0;
}

/* ─── Safe links ─── */

/** Only http(s) links reach the page; anything else (javascript:, data:, relative) is dropped. */
export function safeHttpUrl(value: string): string | null {
  const raw = text(value);
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function safeMailto(value: string): string | null {
  const raw = text(value);
  return /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(raw) ? `mailto:${raw}` : null;
}

/** Mirrors the server's address-base normaliser for an instant preview; the server stays authoritative. */
export function normalizeSlugBase(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 130);
}

/* ─── Conflict comparison ─── */

export interface ConflictDifference {
  key: string;
  label: string;
  /** Human-readable local value; never HTML. */
  local: string;
  remote: string;
}

const shorten = (value: string, limit = 90): string => {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

const yesNo = (value: boolean) => (value ? 'Shown' : 'Hidden');

/**
 * What differs between the version this tab has open and the version the server
 * reported in its 409. Used by the conflict dialog so "Inspect remote changes"
 * shows real information instead of only closing the dialog. Deterministic, and
 * empty when the two versions hold the same visible content.
 */
export function compareCanonical(
  local: { title: string; canonical: PortfolioCanonical },
  remote: { title: string; canonical: PortfolioCanonical },
): ConflictDifference[] {
  const differences: ConflictDifference[] = [];
  const push = (key: string, label: string, localValue: string, remoteValue: string) => {
    if (localValue !== remoteValue) differences.push({ key, label, local: localValue, remote: remoteValue });
  };

  push('title', 'Portfolio title', shorten(local.title, 60) || 'Untitled', shorten(remote.title, 60) || 'Untitled');
  push('template', 'Template', templateMeta(local.canonical.template).name, templateMeta(remote.canonical.template).name);
  push('name', 'Name', shorten(displayName(local.canonical)) || 'Empty', shorten(displayName(remote.canonical)) || 'Empty');
  push('occupation', 'Occupation', shorten(local.canonical.heading.occupation) || 'Empty', shorten(remote.canonical.heading.occupation) || 'Empty');
  push('summary', 'About', shorten(local.canonical.summary) || 'Empty', shorten(remote.canonical.summary) || 'Empty');
  push('experiences', 'Experience entries', String(local.canonical.experiences.length), String(remote.canonical.experiences.length));
  push('education', 'Education entries', String(local.canonical.education.length), String(remote.canonical.education.length));
  push('projects', 'Project entries', String(local.canonical.projects.length), String(remote.canonical.projects.length));
  push('skills', 'Skills', String(local.canonical.skills.length), String(remote.canonical.skills.length));

  const localVisibility = normalizeVisibility(local.canonical.visibility);
  const remoteVisibility = normalizeVisibility(remote.canonical.visibility);
  for (const key of VISIBILITY_KEYS) {
    push(`visibility.${key}`, VISIBILITY_LABELS[key].label, yesNo(localVisibility[key]), yesNo(remoteVisibility[key]));
  }
  return differences;
}
