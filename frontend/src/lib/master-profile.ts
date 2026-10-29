/**
 * Master CV → resume initialisation (DIR-008, R-13…R-16).
 *
 * The Master CV is the canonical, revisioned `users.profile` projection served
 * by `GET /api/users-data/profile` as `{ success, user: { ..., profile } }`.
 * This module maps that projection onto the resume-builder state:
 *
 *  - `profile` is preferred (sanitised, editable, revisioned); the flat user
 *    row is only a legacy fallback for deployments predating the projection;
 *  - fill-blank semantics by default, so pressing "Sync" never overwrites an
 *    answer the candidate already gave (R-15);
 *  - every list is mapped explicitly, including ids, so the initialised draft
 *    can be saved and edited without shape coercion later;
 *  - the result reports exactly what was copied and from which revision, so the
 *    UI can show an honest status instead of an unqualified success toast.
 */

import {
  PROFILE_FIELDS,
  normalizeProfileValue,
  type ProfileFieldKey,
  type ProfileFields,
} from './account-settings';

export interface MasterProfileSource {
  /** The `user` object returned by `/users-data/profile`. */
  user?: any;
}

export interface ResumeHeadingLike {
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  city?: string;
  country?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  photo?: string;
  showPhoto?: boolean;
}

export interface ResumeDraftLike {
  heading: ResumeHeadingLike;
  summary?: string;
  experience?: any[];
  education?: any[];
  skillCategories?: any[];
  certifications?: any[];
  languages?: any[];
  projects?: any[];
  achievements?: any[];
  references?: any[];
  customSections?: any[];
}

export interface MasterProfileSyncResult {
  draft: ResumeDraftLike;
  /** Human-readable sections that were filled from the Master CV. */
  applied: string[];
  /** Sections that were left untouched because the draft already had content. */
  preserved: string[];
  /** Revision of the Master CV the values came from, when the server reports it. */
  sourceRevision: number | null;
  /** True when the Master CV had nothing usable to contribute. */
  empty: boolean;
}

const PROFILE_FIELD_ALIASES = {
  experience: ['workExperiences', 'experience', 'employments'],
  education: ['education', 'educations'],
  skills: ['skills', 'skillCategories'],
  certifications: ['certifications'],
  languages: ['languages'],
  projects: ['projects'],
  achievements: ['achievements', 'awards'],
  references: ['references'],
  hobbies: ['hobbies', 'interests'],
  customSections: ['customSections'],
};

function firstDefined(source: any, keys: string[]): any {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasContent(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function text(value: any): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function splitLocation(profile: any): { location: string; city: string; country: string } {
  const city = text(profile?.city);
  const country = text(profile?.country);
  const explicit = text(profile?.address);
  const composed = [city, country].filter(Boolean).join(', ');
  return {
    location: explicit || composed,
    city,
    country,
  };
}

function mapExperience(profile: any): any[] {
  return asArray(firstDefined(profile, PROFILE_FIELD_ALIASES.experience)).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-exp-${index}`,
    company: text(entry?.company || entry?.employer || entry?.organization),
    position: text(entry?.jobTitle || entry?.position || entry?.title),
    location: text(entry?.city || entry?.location),
    startDate: text(entry?.startDate || entry?.begin || entry?.started),
    endDate: text(entry?.endDate || entry?.end || entry?.finished),
    current: Boolean(entry?.current) || /present/i.test(text(entry?.endDate || entry?.end)),
    description: text(entry?.description || entry?.summary),
  })).filter((entry: any) => entry.company || entry.position);
}

function mapEducation(profile: any): any[] {
  return asArray(firstDefined(profile, PROFILE_FIELD_ALIASES.education)).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-edu-${index}`,
    institution: text(entry?.school || entry?.institution || entry?.organization),
    degree: text(entry?.degree || entry?.qualification),
    field: text(entry?.field || entry?.major),
    location: text(entry?.city || entry?.location),
    startDate: text(entry?.startDate || entry?.started || entry?.begin),
    endDate: text(entry?.endDate || entry?.finished || entry?.end),
    gpa: text(entry?.gpa),
    description: text(entry?.description),
  })).filter((entry: any) => entry.institution || entry.degree);
}

function mapSkillCategories(profile: any): any[] {
  const direct = asArray(profile?.skillCategories);
  if (direct.length > 0) {
    return direct
      .map((category: any, index: number) => ({
        id: text(category?.id) || `master-skill-cat-${index}`,
        category: text(category?.category) || 'Core Skills',
        skills: asArray(category?.skills)
          .map((skill: any) => (typeof skill === 'string' ? skill : text(skill?.name || skill?.skillName)))
          .filter(Boolean),
      }))
      .filter((category: any) => category.skills.length > 0);
  }
  const flat = asArray(profile?.skills);
  if (flat.length === 0) return [];
  const grouped = new Map<string, string[]>();
  for (const item of flat) {
    const category = text(item?.category) || 'Core Skills';
    const name = typeof item === 'string' ? item : text(item?.name || item?.skillName || item?.skill);
    if (!name) continue;
    grouped.set(category, [...(grouped.get(category) ?? []), name]);
  }
  return [...grouped.entries()].map(([category, skills], index) => ({
    id: `master-skill-cat-${index}`,
    category,
    skills,
  }));
}

function mapCertifications(profile: any): any[] {
  return asArray(profile?.certifications).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-cert-${index}`,
    name: text(entry?.title || entry?.name || entry?.certificationName),
    issuer: text(entry?.issuer || entry?.organization || entry?.institution),
    credentialId: text(entry?.credentialId),
    issueDate: text(entry?.issueDate || entry?.date || entry?.year),
    expiryDate: text(entry?.expiryDate || entry?.expirationDate),
    credentialUrl: text(entry?.credentialUrl || entry?.url || entry?.link),
  })).filter((entry: any) => entry.name);
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'] as const;

/**
 * The builder's proficiency control only accepts the CEFR enum. A value the
 * Master CV does not state stays empty (the control shows its placeholder)
 * rather than being silently promoted to a level the candidate never claimed.
 */
function normalizeProficiency(value: any): string {
  const raw = text(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const direct = CEFR_LEVELS.find((level) => level.toUpperCase() === upper);
  if (direct) return direct;
  if (/native|mother\s*tongue|fluent/i.test(raw)) return 'Native';
  if (/proficient|advanced|expert|c2/i.test(raw)) return 'C2';
  if (/upper.?intermediate|b2/i.test(raw)) return 'B2';
  if (/intermediate|b1/i.test(raw)) return 'B1';
  if (/pre.?intermediate|a2/i.test(raw)) return 'A2';
  if (/beginner|basic|elementary|a1/i.test(raw)) return 'A1';
  return '';
}

function mapLanguages(profile: any): any[] {
  return asArray(profile?.languages).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-lang-${index}`,
    language: text(typeof entry === 'string' ? entry : (entry?.language || entry?.name)),
    proficiency: normalizeProficiency(entry?.proficiency || entry?.level),
  })).filter((entry: any) => entry.language);
}

function mapProjects(profile: any): any[] {
  return asArray(profile?.projects).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-project-${index}`,
    title: text(entry?.title || entry?.name),
    description: text(entry?.description || entry?.summary),
    technologies: text(entry?.technologies || entry?.techStack),
    liveUrl: text(entry?.link || entry?.url || entry?.liveUrl),
    githubUrl: text(entry?.githubUrl || entry?.github || entry?.repoUrl),
    startDate: text(entry?.startDate || entry?.begin || entry?.started),
    endDate: text(entry?.endDate || entry?.end || entry?.finished),
  })).filter((entry: any) => entry.title);
}

function mapAchievements(profile: any): any[] {
  return asArray(firstDefined(profile, PROFILE_FIELD_ALIASES.achievements)).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-award-${index}`,
    title: text(entry?.title || entry?.name),
    description: text(entry?.description || entry?.summary),
    date: text(entry?.date || entry?.year || entry?.awardedOn),
  })).filter((entry: any) => entry.title);
}

function mapHobbies(profile: any): string[] {
  return asArray(firstDefined(profile, PROFILE_FIELD_ALIASES.hobbies))
    .map((entry: any) => (typeof entry === 'string' ? entry : text(entry?.name || entry?.title)))
    .filter(Boolean);
}

function mapCustomSections(profile: any): any[] {
  return asArray(profile?.customSections).map((section: any, index: number) => {
    const items = asArray(section?.items).map((item: any, itemIndex: number) => ({
      id: text(item?.id) || `master-custom-${index}-item-${itemIndex}`,
      title: text(typeof item === 'string' ? item : (item?.title || item?.name)),
      description: text(item?.description || item?.content),
    }));
    // Some profiles store a single free-text blob; surface it as one entry so
    // the content is visible and editable instead of being dropped.
    const blob = text(section?.content);
    if (items.length === 0 && blob) {
      items.push({ id: `master-custom-${index}-item-0`, title: text(section?.title) || 'Details', description: blob });
    }
    return {
      id: text(section?.id) || `master-custom-${index}`,
      sectionTitle: text(section?.sectionTitle || section?.title || section?.heading),
      items,
    };
  }).filter((section: any) => section.sectionTitle || section.items.length > 0);
}

function mapReferences(profile: any): any[] {
  return asArray(profile?.references).map((entry: any, index: number) => ({
    id: text(entry?.id) || `master-ref-${index}`,
    name: text(entry?.name || entry?.referenceName),
    title: text(entry?.title || entry?.position || entry?.jobTitle),
    company: text(entry?.company || entry?.organization),
    email: text(entry?.email),
    phone: text(entry?.phone),
    relationship: text(entry?.relationship || entry?.description || entry?.reference),
  })).filter((entry: any) => entry.name);
}

function resolveProfile(source: MasterProfileSource | any): any {
  const user = source?.user ?? source;
  if (!user) return {};
  // `profile` is the sanitised editable projection. The flat row is a legacy
  // fallback only; merging both (profile wins) keeps older deployments working
  // without ever letting raw columns override the projected values.
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : null;
  if (profile) {
    return { ...user, ...profile, __revision: profile.revision ?? user.revision };
  }
  return { ...user, __revision: user.revision ?? null };
}

/**
 * Maps a Master CV onto a resume draft. With `preserveExisting` (default) any
 * section that already has content in the draft is left exactly as-is.
 */
export function applyMasterProfile(
  source: MasterProfileSource | any,
  draft: ResumeDraftLike,
  { preserveExisting = true }: { preserveExisting?: boolean } = {}
): MasterProfileSyncResult {
  const profile = resolveProfile(source);
  const applied: string[] = [];
  const preserved: string[] = [];
  const next: ResumeDraftLike = { ...draft, heading: { ...draft.heading } };
  const shouldWrite = (current: any) => !preserveExisting || !hasContent(current);

  const firstName = text(profile.firstname) || text(profile.displayName).split(' ')[0] || '';
  const lastName = text(profile.lastname) || text(profile.displayName).split(' ').slice(1).join(' ') || '';
  const { location, city, country } = splitLocation(profile);
  const headingFields: Array<[keyof ResumeHeadingLike, string]> = [
    ['firstName', firstName],
    ['lastName', lastName],
    ['title', text(profile.jobTitle || profile.occupation)],
    ['email', text(profile.email)],
    ['phone', text(profile.phone)],
    ['location', location],
    ['city', city],
    ['country', country],
    ['website', text(profile.website || profile.websiteUrl)],
    ['linkedin', text(profile.linkedinUrl || profile.linkedin)],
    ['github', text(profile.githubUrl || profile.github)],
    ['photo', text(profile.photoURL || profile.photoUrl || profile.photo || profile.selectedImage)],
  ];
  let headingChanged = false;
  for (const [key, value] of headingFields) {
    if (!value) continue;
    if (shouldWrite(next.heading[key])) {
      (next.heading as any)[key] = value;
      headingChanged = true;
    }
  }
  if (headingChanged) applied.push('Contact details');
  else if (hasContent(draft.heading.firstName) || hasContent(draft.heading.email)) preserved.push('Contact details');

  const summary = text(profile.summary || profile.bio);
  if (summary) {
    if (shouldWrite(next.summary)) {
      next.summary = summary;
      applied.push('Professional summary');
    } else {
      preserved.push('Professional summary');
    }
  }

  // The builder has no free-standing "interests" field, but the document view
  // model does. Interests therefore ride inside a custom section so they are
  // visible, editable and exported rather than silently discarded.
  const customSections = mapCustomSections(profile);
  const hobbies = mapHobbies(profile);
  if (hobbies.length > 0) {
    customSections.push({
      id: 'master-interests',
      sectionTitle: 'Interests',
      items: hobbies.map((hobby, index) => ({
        id: `master-interests-${index}`,
        title: hobby,
        description: '',
      })),
    });
  }

  const lists: Array<[string, any[], keyof ResumeDraftLike]> = [
    ['Work experience', mapExperience(profile), 'experience'],
    ['Education', mapEducation(profile), 'education'],
    ['Skills', mapSkillCategories(profile), 'skillCategories'],
    ['Certifications', mapCertifications(profile), 'certifications'],
    ['Languages', mapLanguages(profile), 'languages'],
    ['Projects', mapProjects(profile), 'projects'],
    ['Achievements', mapAchievements(profile), 'achievements'],
    ['References', mapReferences(profile), 'references'],
    ['Custom sections', customSections, 'customSections'],
  ];
  for (const [label, values, key] of lists) {
    if (!values || values.length === 0) continue;
    if (shouldWrite((next as any)[key])) {
      (next as any)[key] = values;
      applied.push(label);
    } else {
      preserved.push(label);
    }
  }

  return {
    draft: next,
    applied,
    preserved,
    sourceRevision: typeof profile.__revision === 'number' ? profile.__revision : null,
    empty: applied.length === 0,
  };
}

/** Short, truthful status line for the sync toast. */
export function describeMasterSync(result: MasterProfileSyncResult): string {
  if (result.empty) {
    return result.preserved.length > 0
      ? 'This resume already has content, so nothing needed to be copied from your Master CV.'
      : 'Your Master CV has no saved content yet. Add details in Settings → Master Profile first.';
  }
  const revision = result.sourceRevision !== null ? ` (Master CV revision ${result.sourceRevision})` : '';
  const parts = [`Copied ${result.applied.join(', ')}${revision}.`];
  if (result.preserved.length > 0) {
    parts.push(`Kept your existing ${result.preserved.join(', ').toLowerCase()}.`);
  }
  return parts.join(' ');
}

/* ───────────────────────── Master CV completeness ───────────────────────── */

export interface MasterProfileCompleteness {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
  /** ISO timestamp of the last Master CV write, when the server reports one. */
  updatedAt: string | null;
  /** Revision of the profile the numbers describe. */
  revision: number | null;
  /** True when no section has any content yet. */
  empty: boolean;
}

/**
 * Honest completeness of the Master CV: counts sections that actually contain
 * content. Empty arrays and whitespace never count, so the dashboard can show
 * "0 of 10" for a fresh account instead of an encouraging fiction.
 */
export function describeMasterCompleteness(source: MasterProfileSource | any): MasterProfileCompleteness {
  const profile = resolveProfile(source);
  const entries: Array<[string, boolean]> = [
    ['Contact details', Boolean(text(profile.firstname) || text(profile.displayName)) && Boolean(text(profile.email))],
    ['Professional summary', hasContent(text(profile.summary || profile.bio))],
    ['Work experience', mapExperience(profile).length > 0],
    ['Education', mapEducation(profile).length > 0],
    ['Skills', mapSkillCategories(profile).length > 0],
    ['Certifications', mapCertifications(profile).length > 0],
    ['Languages', mapLanguages(profile).length > 0],
    ['Projects', mapProjects(profile).length > 0],
    ['Achievements', mapAchievements(profile).length > 0],
    ['References', mapReferences(profile).length > 0],
    ['Custom sections', mapCustomSections(profile).length > 0 || mapHobbies(profile).length > 0],
  ];
  const filled = entries.filter(([, has]) => has).length;
  const updatedRaw = text(profile.updatedAt || profile.updated_at || profile.lastUpdated);
  const parsed = updatedRaw ? new Date(updatedRaw) : null;
  return {
    filled,
    total: entries.length,
    percent: Math.round((filled / entries.length) * 100),
    missing: entries.filter(([, has]) => !has).map(([label]) => label),
    updatedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    revision: typeof profile.__revision === 'number' ? profile.__revision : null,
    empty: filled === 0,
  };
}

/* ─────────────────── Settings form: conflicts, saves, completeness ─────────────────── */

export interface ProfileConflictRow {
  key: ProfileFieldKey;
  label: string;
  /** The value in this form (unsaved). */
  local: string;
  /** The value in the newer saved version. */
  remote: string;
}

/**
 * Fields whose value in this form differs from the newer saved version, in
 * form order. Only Master Profile fields are compared, so nothing else from
 * the account is shown. With no readable remote version the list is empty and
 * the caller says so instead of implying "no differences".
 */
export function describeProfileConflict(local: ProfileFields, remote: ProfileFields | null): ProfileConflictRow[] {
  if (!remote) return [];
  return PROFILE_FIELDS
    .filter((field) => normalizeProfileValue(field.key, local[field.key]) !== normalizeProfileValue(field.key, remote[field.key]))
    .map((field) => ({
      key: field.key,
      label: field.label,
      local: normalizeProfileValue(field.key, local[field.key]),
      remote: normalizeProfileValue(field.key, remote[field.key]),
    }));
}

/**
 * The form after a save resolved. `submitted` is what the form held when the
 * request was sent and `saved` what the server stored. A field the user edited
 * while the request was in flight keeps the newer typing; every other field
 * shows the stored value. No argument is modified.
 */
export function rebaseDraftAfterSave(current: ProfileFields, submitted: ProfileFields, saved: ProfileFields): ProfileFields {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [
    field.key,
    current[field.key] !== submitted[field.key] ? current[field.key] : saved[field.key],
  ])) as ProfileFields;
}

export interface SettingsCompletenessItem {
  key: ProfileFieldKey;
  label: string;
  suggestion: string;
}

export interface SettingsProfileCompleteness {
  filled: number;
  total: number;
  percent: number;
  missing: SettingsCompletenessItem[];
}

/**
 * The fields a resume or cover letter needs from the Master Profile. Street
 * address, postal code, website and GitHub are optional extras and are not
 * counted, so leaving them blank never lowers the score.
 */
export const COMPLETENESS_FIELDS: readonly SettingsCompletenessItem[] = [
  { key: 'firstname', label: 'First name', suggestion: 'Add your first name so resumes start with your name.' },
  { key: 'lastname', label: 'Last name', suggestion: 'Add your last name.' },
  { key: 'occupation', label: 'Professional headline', suggestion: 'Add a headline such as "Senior Data Analyst".' },
  { key: 'phone', label: 'Phone', suggestion: 'Add a phone number recruiters can call.' },
  { key: 'city', label: 'City', suggestion: 'Add your city so location-based roles can find you.' },
  { key: 'country', label: 'Country', suggestion: 'Add your country.' },
  { key: 'linkedinUrl', label: 'LinkedIn profile', suggestion: 'Link your LinkedIn profile.' },
  { key: 'summary', label: 'Professional summary', suggestion: 'Write a short professional summary.' },
];

/** Counts only real, saved content: whitespace-only values never count. */
export function settingsProfileCompleteness(fields: ProfileFields): SettingsProfileCompleteness {
  const missing = COMPLETENESS_FIELDS.filter((item) => !normalizeProfileValue(item.key, fields[item.key]));
  const total = COMPLETENESS_FIELDS.length;
  const filled = total - missing.length;
  return { filled, total, percent: Math.round((filled / total) * 100), missing };
}
