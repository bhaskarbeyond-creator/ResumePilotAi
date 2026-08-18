/**
 * Authoritative Choose-Template catalog.
 *
 * The template pickers each carried their own hand-maintained array of
 * `{ id, name, description, category }`. Those arrays drifted badly from the
 * engine that actually renders the resume:
 *   - `ActionSelection` labelled 37 of the 51 templates "Artist Portfolio" and
 *     listed Cv51 twice (52 cards, duplicate React key);
 *   - `ResumesSelector` also listed Cv51 twice;
 *   - Cv51 was captioned "Europass Executive Classic" although its rendering
 *     archetype is `modern-split`, which is what produced the long-running
 *     "is Cv51 Europass or Modern Split?" contradiction.
 *
 * The single source of truth for what a template *is* is `THEME_PRESETS` —
 * that object is what `SmartResumeComposer` reads to render the browser
 * preview, the production PDF and (via `docxThemes`) the DOCX. Deriving the
 * catalog from it makes the Choose-Template card, the rendered resume, the PDF
 * and the DOCX describe the same design by construction.
 */
import { THEME_PRESETS, ARCHETYPES } from '../engine/hybrid/themePresets';
import { CV_TEMPLATE_IDS } from './templateRegistry';

/** Human-facing description of each layout archetype. */
export const ARCHETYPE_LABELS = Object.freeze({
    [ARCHETYPES.MODERN_SPLIT]: 'Two-column layout with a contact sidebar',
    [ARCHETYPES.EXECUTIVE_BANNER]: 'Full-width header banner over a two-column body',
    [ARCHETYPES.MINIMAL_ATS]: 'Single-column, ATS-optimised layout',
    [ARCHETYPES.TECH_GRID]: 'Technical two-column layout with tag-style skills',
    [ARCHETYPES.COMPACT_EURO]: 'Europass-style single column with a date gutter',
});

/** Picker filter category derived from the rendering archetype. */
export const ARCHETYPE_CATEGORY = Object.freeze({
    [ARCHETYPES.MODERN_SPLIT]: 'modern',
    [ARCHETYPES.EXECUTIVE_BANNER]: 'professional',
    [ARCHETYPES.MINIMAL_ATS]: 'simple',
    [ARCHETYPES.TECH_GRID]: 'creative',
    [ARCHETYPES.COMPACT_EURO]: 'europass',
});

const SKILL_LABELS = Object.freeze({
    pills: 'pill skills',
    badges: 'badge skills',
    bars: 'skill meters',
    dots: 'skill ratings',
    inline: 'inline skills',
});

const DENSITY_LABELS = Object.freeze({
    compact: 'compact spacing',
    standard: 'balanced spacing',
    spacious: 'generous spacing',
});

function describe(preset) {
    const parts = [ARCHETYPE_LABELS[preset.archetype] || 'Professional resume layout'];
    if (preset.sidebarPosition === 'right') parts.push('right-hand sidebar');
    parts.push(SKILL_LABELS[preset.skillVariant] || 'pill skills');
    parts.push(DENSITY_LABELS[preset.density || 'standard']);
    return `${parts.join(' · ')}.`;
}

/** One immutable catalog entry per registered CV template. */
export const TEMPLATE_CATALOG = Object.freeze(CV_TEMPLATE_IDS.map((id) => {
    const preset = THEME_PRESETS[id] || THEME_PRESETS.Cv1;
    return Object.freeze({
        id,
        name: preset.name,
        archetype: preset.archetype,
        category: ARCHETYPE_CATEGORY[preset.archetype] || 'professional',
        description: describe(preset),
        primary: preset.primary,
        secondary: preset.secondary,
        sidebarPosition: preset.sidebarPosition || (preset.sidebarBg ? 'left' : null),
        density: preset.density || 'standard',
        skillVariant: preset.skillVariant,
        // Stable, deterministic ordering weight for "most popular" sorting; the
        // previous hard-coded values were copy-pasted and meaningless.
        popularity: 100 - CV_TEMPLATE_IDS.indexOf(id),
    });
}));

const BY_ID = Object.freeze(Object.fromEntries(TEMPLATE_CATALOG.map((entry) => [entry.id, entry])));

/** Catalog entry for a template id, falling back to Cv1 for unknown ids. */
export const getTemplateMeta = (templateId) => BY_ID[templateId] || BY_ID.Cv1;

/** Accessible label used for preview images and selection controls. */
export const templateAccessibleLabel = (templateId) => {
    const meta = getTemplateMeta(templateId);
    return `${meta.name} resume template — ${meta.description}`;
};
