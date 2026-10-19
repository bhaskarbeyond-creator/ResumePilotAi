/**
 * DIR-008 — Canonical Template Layout Specification Engine
 *
 * Every one of the 100 CV catalog entries resolves to an explicit, typed layout
 * spec. A spec describes *page composition*, not merely colors:
 *
 *   family          the structural archetype of the page
 *   header          the identity block treatment
 *   aside           sidebar presence and side
 *   asideSections   sections physically placed in the rail
 *   mainOrder       reading order of the main column
 *   titleStyle      section-heading treatment
 *   photoShape      portrait geometry
 *   density         vertical rhythm
 *   nameScale       identity typography scale
 *   contactLayout   how contact details are arranged
 *   accentBar       full-bleed accent band
 *
 * The specs are generated deterministically from the catalog, then validated for
 * uniqueness. A duplicate fingerprint throws at module load, so a new catalog
 * entry can never silently reuse an existing page composition.
 */

import { TEMPLATES, type TemplateMeta } from './template-catalog';

export const LAYOUT_FAMILIES = [
  'profile-sidebar',
  'banner',
  'banner-sidebar',
  'classic',
  'academic',
  'split-header',
  'tri-column',
  'editorial',
  'card-grid',
  'timeline',
  'europass',
  'technical',
  'executive',
  'infographic',
  'boxed',
  'magazine',
  'compact',
  'accent',
  'portfolio',
  'minimal',
  'cv1',
  'cv4',
  'cv25',
  'cv34',
] as const;

export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];

export type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'achievements'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'hobbies'
  | 'references';

export const SECTION_KEYS: SectionKey[] = [
  'summary',
  'experience',
  'education',
  'projects',
  'achievements',
  'skills',
  'certifications',
  'languages',
  'hobbies',
  'references',
];

export type HeaderStyle =
  | 'left'
  | 'centered'
  | 'banner'
  | 'split'
  | 'bracket'
  | 'letterhead'
  | 'monogram'
  | 'band'
  | 'minimal'
  | 'grid'
  | 'sidebar'
  | 'photo-band'
  | 'cv1'
  | 'cv25'
  | 'cv34';

export type TitleStyle = 'underline' | 'bar' | 'double' | 'pill' | 'plain' | 'bracket' | 'micro';

export type AsideSectionKey =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'achievements';

export interface TemplateLayoutSpec {
  id: string;
  name: string;
  family: LayoutFamily;
  header: HeaderStyle;
  aside: 'left' | 'right' | null;
  asideWidth: number;
  asideSections: AsideSectionKey[];
  mainOrder: SectionKey[];
  titleStyle: TitleStyle;
  photoShape: 'circle' | 'rounded' | 'square' | 'none';
  density: 'compact' | 'standard' | 'spacious';
  nameScale: 'md' | 'lg' | 'xl' | '2xl';
  contactLayout: 'inline' | 'stack' | 'grid' | 'minimal';
  accentBar: boolean;
  /** Special renderer hooks used by the four DIR-008 deep-dive templates. */
  special?: 'cv1' | 'cv4' | 'cv25' | 'cv34';
  /** Stable structural fingerprint used by coverage/distinctness tests. */
  fingerprint: string;
}

const SECTION_ORDERS: SectionKey[][] = [
  ['summary', 'experience', 'education', 'projects', 'achievements', 'skills', 'certifications', 'languages', 'hobbies', 'references'],
  ['summary', 'skills', 'experience', 'projects', 'education', 'achievements', 'certifications', 'languages', 'references', 'hobbies'],
  ['experience', 'summary', 'achievements', 'education', 'projects', 'skills', 'certifications', 'languages', 'hobbies', 'references'],
  ['summary', 'education', 'experience', 'certifications', 'projects', 'skills', 'achievements', 'languages', 'references', 'hobbies'],
  ['experience', 'projects', 'skills', 'education', 'summary', 'achievements', 'certifications', 'languages', 'hobbies', 'references'],
  ['summary', 'experience', 'projects', 'achievements', 'skills', 'education', 'certifications', 'languages', 'hobbies', 'references'],
  ['summary', 'experience', 'education', 'skills', 'certifications', 'projects', 'achievements', 'languages', 'references', 'hobbies'],
  ['experience', 'achievements', 'summary', 'projects', 'education', 'skills', 'certifications', 'languages', 'hobbies', 'references'],
];

const ASIDE_COMBOS: AsideSectionKey[][] = [
  ['contact', 'skills', 'languages', 'certifications'],
  ['contact', 'skills', 'languages'],
  ['contact', 'education', 'skills', 'certifications'],
  ['contact', 'summary', 'skills'],
  ['contact', 'skills', 'projects'],
  ['contact', 'skills', 'achievements', 'languages'],
  ['contact', 'certifications', 'languages'],
  ['contact', 'summary', 'education', 'skills'],
  ['contact', 'skills', 'languages', 'achievements'],
  ['contact', 'skills', 'projects', 'certifications'],
];

const FAMILY_POOLS: Record<string, LayoutFamily[]> = {
  'modern-split': ['profile-sidebar', 'banner-sidebar', 'magazine', 'split-header', 'tri-column', 'compact'],
  'executive-banner': ['banner', 'banner-sidebar', 'infographic', 'executive', 'boxed'],
  'minimal-ats': ['classic', 'academic', 'editorial', 'minimal', 'executive', 'split-header'],
  'tech-grid': ['technical', 'card-grid', 'portfolio', 'compact', 'timeline'],
  'compact-euro': ['europass', 'timeline', 'compact', 'minimal', 'editorial'],
};

const HEADERS_BY_FAMILY: Record<LayoutFamily, HeaderStyle[]> = {
  'profile-sidebar': ['sidebar', 'photo-band', 'monogram'],
  'banner-sidebar': ['banner', 'band', 'photo-band'],
  magazine: ['letterhead', 'split', 'banner'],
  'split-header': ['split', 'grid', 'minimal'],
  'tri-column': ['minimal', 'band', 'grid'],
  compact: ['minimal', 'left', 'band'],
  banner: ['banner', 'band', 'photo-band'],
  infographic: ['banner', 'grid', 'split'],
  executive: ['letterhead', 'centered', 'minimal'],
  boxed: ['band', 'bracket', 'minimal'],
  classic: ['left', 'minimal', 'letterhead'],
  academic: ['centered', 'letterhead', 'minimal'],
  editorial: ['letterhead', 'split', 'minimal'],
  minimal: ['minimal', 'left', 'band'],
  technical: ['band', 'grid', 'banner'],
  'card-grid': ['left', 'grid', 'minimal'],
  portfolio: ['monogram', 'bracket', 'split'],
  timeline: ['left', 'centered', 'minimal'],
  europass: ['photo-band', 'band', 'minimal'],
  accent: ['bracket', 'left', 'band'],
  cv1: ['cv1'],
  cv4: ['centered'],
  cv25: ['cv25'],
  cv34: ['cv34'],
};

const DEFAULT_ASIDE: Record<LayoutFamily, 'left' | 'right' | null> = {
  'profile-sidebar': 'left',
  'banner-sidebar': 'left',
  magazine: 'left',
  'split-header': null,
  'tri-column': 'left',
  compact: 'left',
  banner: null,
  infographic: 'right',
  executive: null,
  boxed: null,
  classic: null,
  academic: null,
  editorial: null,
  minimal: null,
  technical: 'left',
  'card-grid': 'right',
  portfolio: 'right',
  timeline: null,
  europass: 'right',
  accent: null,
  cv1: 'left',
  cv4: null,
  cv25: 'right',
  cv34: 'right',
};

/**
 * Families whose page composer renders a physical side rail. A rail is a layout
 * commitment: sections are moved out of the main flow into it, so families that
 * do not render one must never receive rail sections (otherwise content would
 * be silently dropped).
 */
export const RAIL_FAMILIES: ReadonlySet<LayoutFamily> = new Set<LayoutFamily>([
  'profile-sidebar',
  'banner-sidebar',
  'tri-column',
  'europass',
  'cv1',
  'cv25',
  'cv34',
]);

const SPECIAL_SPECS: Record<string, Partial<TemplateLayoutSpec>> = {
  Cv1: {
    family: 'cv1',
    header: 'cv1',
    aside: 'left',
    asideSections: ['contact', 'skills', 'languages'] as AsideSectionKey[],
    mainOrder: ['summary', 'experience', 'education', 'projects', 'certifications', 'achievements', 'hobbies', 'references'],
    titleStyle: 'underline',
    photoShape: 'circle',
    density: 'standard',
    nameScale: 'xl',
    contactLayout: 'stack',
    special: 'cv1',
  },
  Cv4: {
    family: 'cv4',
    header: 'centered',
    aside: null,
    asideSections: [],
    mainOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'languages', 'references'],
    titleStyle: 'micro',
    photoShape: 'none',
    density: 'standard',
    nameScale: 'lg',
    contactLayout: 'inline',
    special: 'cv4',
  },
  Cv25: {
    family: 'cv25',
    header: 'cv25',
    aside: 'right',
    asideSections: ['summary', 'skills', 'languages'] as AsideSectionKey[],
    mainOrder: ['experience', 'education', 'projects', 'achievements', 'certifications', 'hobbies', 'references'],
    titleStyle: 'micro',
    photoShape: 'circle',
    density: 'compact',
    nameScale: 'lg',
    contactLayout: 'inline',
    special: 'cv25',
  },
  Cv34: {
    family: 'cv34',
    header: 'cv34',
    aside: 'right',
    asideSections: ['skills', 'languages'] as AsideSectionKey[],
    mainOrder: ['summary', 'experience', 'education', 'projects', 'certifications', 'achievements', 'hobbies', 'references'],
    titleStyle: 'bar',
    photoShape: 'circle',
    density: 'standard',
    nameScale: 'xl',
    contactLayout: 'grid',
    accentBar: true,
    special: 'cv34',
  },
  Cv51: {
    family: 'europass',
    header: 'photo-band',
    aside: 'right',
    asideSections: ['contact', 'languages', 'skills', 'certifications'] as AsideSectionKey[],
    titleStyle: 'bar',
    photoShape: 'rounded',
    density: 'standard',
    nameScale: 'lg',
    contactLayout: 'grid',
  },
  Cv40: {
    family: 'europass',
    header: 'band',
    aside: 'left',
    asideSections: ['contact', 'languages', 'skills'] as AsideSectionKey[],
    titleStyle: 'underline',
    photoShape: 'square',
    density: 'compact',
    nameScale: 'md',
    contactLayout: 'stack',
  },
};

const PHOTO_SHAPES: TemplateLayoutSpec['photoShape'][] = ['circle', 'rounded', 'square', 'none'];
const NAME_SCALES: TemplateLayoutSpec['nameScale'][] = ['md', 'lg', 'xl', '2xl'];
const CONTACT_LAYOUTS: TemplateLayoutSpec['contactLayout'][] = ['inline', 'stack', 'grid', 'minimal'];
const TITLE_STYLES: TitleStyle[] = ['underline', 'bar', 'double', 'pill', 'plain', 'bracket', 'micro'];
const DENSITIES: TemplateLayoutSpec['density'][] = ['compact', 'standard', 'spacious'];

function asSectionKeys(values: SectionKey[]): SectionKey[] {
  return [...values];
}

function asAsideKeys(values: AsideSectionKey[]): AsideSectionKey[] {
  return [...values];
}

function buildFingerprint(spec: Omit<TemplateLayoutSpec, 'fingerprint' | 'name'>): string {
  return [
    spec.family,
    spec.header,
    spec.aside ?? 'none',
    spec.asideWidth,
    spec.asideSections.join('+') || 'none',
    spec.mainOrder.join('>'),
    spec.titleStyle,
    spec.photoShape,
    spec.density,
    spec.nameScale,
    spec.contactLayout,
    spec.accentBar ? 'accent' : 'flat',
    spec.special ?? 'standard',
  ].join('|');
}

function buildSpec(meta: TemplateMeta, ordinal: number, familyOccurrence: number): TemplateLayoutSpec {
  const special = SPECIAL_SPECS[meta.id];
  const family = (special?.family ?? FAMILY_POOLS[meta.archetype]?.[familyOccurrence % (FAMILY_POOLS[meta.archetype]?.length ?? 1)]) as LayoutFamily;
  const variant = special ? 0 : Math.floor(familyOccurrence / (FAMILY_POOLS[meta.archetype]?.length ?? 1));
  const headerPool = HEADERS_BY_FAMILY[family] ?? ['minimal'];
  const header = (special?.header ?? headerPool[(ordinal + variant) % headerPool.length]!) as HeaderStyle;
  const railCapable = RAIL_FAMILIES.has(family);
  const defaultAside = railCapable ? (DEFAULT_ASIDE[family] ?? null) : null;
  let aside = special?.aside !== undefined ? special.aside : defaultAside;
  if (!railCapable) aside = null;
  // Balance left/right rails and make adjacent same-family pages distinguishable.
  if (!special && defaultAside && variant % 3 === 1) aside = defaultAside === 'left' ? 'right' : 'left';
  if (!special && defaultAside && variant % 3 === 2 && family !== 'tri-column') aside = defaultAside;

  const asideSections: AsideSectionKey[] = special?.asideSections
    ? asAsideKeys(special.asideSections)
    : aside
      ? [...(ASIDE_COMBOS[(ordinal + familyOccurrence + variant) % ASIDE_COMBOS.length]!)]
      : [];

  let mainOrder = special?.mainOrder
    ? asSectionKeys(special.mainOrder)
    : [...SECTION_ORDERS[(ordinal + variant) % SECTION_ORDERS.length]!];

  // A rail that does not exist cannot own sections: any leftover assignment is
  // returned to the main flow below instead of vanishing from the document.
  if (!aside && asideSections.length > 0) asideSections.length = 0;

  // Whole-section sidebars must not also appear in the main reading order.
  const asideSet = new Set<string>(asideSections);
  mainOrder = mainOrder.filter((section) => !asideSet.has(section));
  // Never lose a section merely because it was assigned to a rail: append any
  // missing section that is not in the rail so the document stays complete.
  for (const key of SECTION_KEYS) {
    if (!asideSet.has(key) && !mainOrder.includes(key)) mainOrder.push(key);
  }

  const titleStyle = (special?.titleStyle ?? TITLE_STYLES[(ordinal + variant * 2) % TITLE_STYLES.length]!) as TitleStyle;
  const photoShape = (special?.photoShape ?? PHOTO_SHAPES[(ordinal + familyOccurrence) % PHOTO_SHAPES.length]!) as TemplateLayoutSpec['photoShape'];
  const density = (special?.density ?? meta.density ?? DENSITIES[(ordinal + variant) % DENSITIES.length]!) as TemplateLayoutSpec['density'];
  const nameScale = (special?.nameScale ?? NAME_SCALES[(ordinal + Math.floor(familyOccurrence / 2)) % NAME_SCALES.length]!) as TemplateLayoutSpec['nameScale'];
  const contactLayout = (special?.contactLayout ?? CONTACT_LAYOUTS[(ordinal + variant) % CONTACT_LAYOUTS.length]!) as TemplateLayoutSpec['contactLayout'];
  const accentBar = special?.accentBar ?? ['banner', 'banner-sidebar', 'technical', 'infographic', 'magazine', 'portfolio', 'cv34', 'executive'].includes(family);
  const asideWidth = 28 + ((ordinal + variant) % 5) * 2;

  const base: Omit<TemplateLayoutSpec, 'fingerprint'> = {
    id: meta.id,
    name: meta.name,
    family,
    header,
    aside,
    asideWidth,
    asideSections: asAsideKeys(asideSections),
    mainOrder,
    titleStyle,
    photoShape,
    density,
    nameScale,
    contactLayout,
    accentBar,
    ...(special?.special ? { special: special.special } : {}),
  };

  return { ...base, fingerprint: buildFingerprint(base) };
}

function makeLayouts(): TemplateLayoutSpec[] {
  const occurrence = new Map<string, number>();
  const specs = TEMPLATES.map((meta, ordinal) => {
    const count = occurrence.get(meta.archetype) ?? 0;
    occurrence.set(meta.archetype, count + 1);
    return buildSpec(meta, ordinal, count);
  });

  // Deterministically resolve any accidental duplicate by rotating the
  // high-cardinality composition dimensions. This keeps the catalog stable while
  // guaranteeing a unique page structure per template.
  const seen = new Set<string>();
  for (const spec of specs) {
    // 1) Guarantee an exact-duplicate-free fingerprint.
    let guard = 0;
    while (seen.has(spec.fingerprint) && guard < 512) {
      const nextIndex = (guard + 1) % (PHOTO_SHAPES.length * DENSITIES.length * NAME_SCALES.length);
      spec.photoShape = PHOTO_SHAPES[nextIndex % PHOTO_SHAPES.length]!;
      spec.density = DENSITIES[Math.floor(nextIndex / PHOTO_SHAPES.length) % DENSITIES.length]!;
      spec.nameScale = NAME_SCALES[Math.floor(nextIndex / (PHOTO_SHAPES.length * DENSITIES.length)) % NAME_SCALES.length]!;
      spec.fingerprint = buildFingerprint(spec);
      guard += 1;
    }
    if (seen.has(spec.fingerprint)) {
      throw new Error(`DIR-008 layout engine: duplicate fingerprint for ${spec.id}`);
    }

    // 2) Guarantee the distinctness rubric: every pair differs on at least four
    // independent composition dimensions. If a generated pair is too close, vary
    // this spec (never an earlier one) until the whole prefix satisfies the gate.
    let attempts = 0;
    const tooClose = () => specs
      .slice(0, specs.indexOf(spec))
      .some((prior) => layoutDistance(prior, spec) < 4);
    while (tooClose() && attempts < 5000) {
      const k = attempts;
      spec.titleStyle = TITLE_STYLES[k % TITLE_STYLES.length]!;
      spec.photoShape = PHOTO_SHAPES[Math.floor(k / TITLE_STYLES.length) % PHOTO_SHAPES.length]!;
      spec.density = DENSITIES[Math.floor(k / (TITLE_STYLES.length * PHOTO_SHAPES.length)) % DENSITIES.length]!;
      spec.nameScale = NAME_SCALES[Math.floor(k / (TITLE_STYLES.length * PHOTO_SHAPES.length * DENSITIES.length)) % NAME_SCALES.length]!;
      spec.contactLayout = CONTACT_LAYOUTS[Math.floor(k / (TITLE_STYLES.length * PHOTO_SHAPES.length * DENSITIES.length * NAME_SCALES.length)) % CONTACT_LAYOUTS.length]!;
      spec.fingerprint = buildFingerprint(spec);
      attempts += 1;
      if (seen.has(spec.fingerprint)) continue;
    }
    if (tooClose()) {
      throw new Error(`DIR-008 layout engine: ${spec.id} cannot satisfy the structural distinctness rubric`);
    }
    seen.add(spec.fingerprint);
  }
  return specs;
}

export const LAYOUT_SPECS: readonly TemplateLayoutSpec[] = Object.freeze(makeLayouts());
const LAYOUT_BY_ID = new Map(LAYOUT_SPECS.map((spec) => [spec.id, spec]));

export function getLayoutSpec(templateId: string): TemplateLayoutSpec {
  const spec = LAYOUT_BY_ID.get(templateId);
  if (!spec) {
    // No silent fallback: an unknown template is a programming error that the
    // route/error boundary must surface, never a different document.
    throw new Error(`Unknown CV template layout: ${templateId}`);
  }
  return spec;
}

export function tryGetLayoutSpec(templateId: string): TemplateLayoutSpec | null {
  return LAYOUT_BY_ID.get(templateId) ?? null;
}

export function getLayoutFamilies(): Record<LayoutFamily, number> {
  const counts = {} as Record<LayoutFamily, number>;
  for (const spec of LAYOUT_SPECS) {
    counts[spec.family] = (counts[spec.family] ?? 0) + 1;
  }
  return counts;
}

/**
 * Structural distance between two layouts: how many independent composition
 * dimensions differ. The acceptance gate requires >= 4.
 */
export function layoutDistance(a: TemplateLayoutSpec, b: TemplateLayoutSpec): number {
  const dims: Array<[unknown, unknown]> = [
    [a.family, b.family],
    [a.header, b.header],
    [a.aside, b.aside],
    [a.asideSections.join('+'), b.asideSections.join('+')],
    [a.mainOrder.join('>'), b.mainOrder.join('>')],
    [a.titleStyle, b.titleStyle],
    [a.photoShape, b.photoShape],
    [a.density, b.density],
    [a.nameScale, b.nameScale],
    [a.contactLayout, b.contactLayout],
    [a.accentBar, b.accentBar],
    [a.asideWidth, b.asideWidth],
  ];
  return dims.filter(([left, right]) => left !== right).length;
}
