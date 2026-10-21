/**
 * Resume-builder step completion — the single source of truth.
 *
 * This predicate used to live inline inside `BuildResume.jsx`, where it could
 * not be imported by anything. `tests/unit/buildResumeLogic.unit.test.js` had
 * been calling a `shouldStepCompleted` that never existed, so the unit test was
 * born broken and only showed up as a lint error (`no-undef`) long after.
 *
 * The rules are unchanged and deliberate:
 *   • Substantive content is authoritative. A blank section never counts as
 *     complete, no matter which stale flag says otherwise.
 *   • A truthy `completedSteps` entry (by id, by path, or by legacy numeric
 *     alias) is only accepted when the content check already passed.
 */

const LEGACY_STEP_ALIASES = {
  1: [1, 'heading'],
  2: [2, 'work-history', 'employment'],
  3: [3, 'education'],
  4: [4, 'skills'],
  5: [5, 'projects'],
  6: [6, 'certifications'],
  7: [7, 'languages'],
  8: [8, 'summary'],
  9: [9, 'achievements'],
  10: [10, 'references'],
  11: [11, 'custom'],
};

const stripMarkup = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const hasSubstantiveDescription = (value) => stripMarkup(value).replace(/&nbsp;|&#160;/gi, ' ').trim().length > 5;

const someWith = (list, predicate) => Array.isArray(list) && list.some(predicate);

/**
 * Does this step path hold real, publishable content?
 * @param {string} stepPath canonical or legacy step path/id
 * @param {object} resumeData the resume being edited
 */
export function hasSubstantiveStepContent(stepPath, resumeData = {}) {
  switch (stepPath) {
    case 'heading':
      return Boolean(resumeData.firstname?.trim() || resumeData.email?.trim());
    case 'work-history':
      return someWith(resumeData.employments, (entry) =>
        Boolean(entry?.jobTitle?.trim() || entry?.employer?.trim() || hasSubstantiveDescription(entry?.description)));
    case 'education':
      return someWith(resumeData.educations, (entry) => Boolean(entry?.school?.trim() || entry?.degree?.trim()));
    case 'skills':
      return someWith(resumeData.skills, (entry) =>
        (typeof entry === 'string' ? Boolean(entry.trim()) : Boolean(entry?.skillName?.trim() || entry?.name?.trim())));
    case 'projects':
      return someWith(resumeData.projects, (entry) =>
        Boolean(entry?.title?.trim() || entry?.name?.trim() || hasSubstantiveDescription(entry?.description)));
    case 'certifications':
      return someWith(resumeData.certifications, (entry) =>
        Boolean(entry?.title?.trim() || entry?.name?.trim() || entry?.issuer?.trim()));
    case 'languages':
      return someWith(resumeData.languages, (entry) =>
        (typeof entry === 'string' ? Boolean(entry.trim()) : Boolean(entry?.language?.trim() || entry?.name?.trim())));
    case 'summary':
      return stripMarkup(resumeData.summary).replace(/&nbsp;|&#160;/gi, ' ').trim().length >= 20;
    case 'achievements':
      return someWith(resumeData.achievements, (entry) =>
        Boolean(entry?.title?.trim() || hasSubstantiveDescription(entry?.description)));
    case 'references':
      return someWith(resumeData.references, (entry) =>
        Boolean(hasText(entry?.name) || hasText(entry?.company) || entry?.availableUponRequest));
    case 'custom':
      return someWith(resumeData.customSections, (section) =>
        Boolean(section?.title?.trim() || (Array.isArray(section?.items) && section.items.length > 0)));
    default:
      return false;
  }
}

/**
 * Is this step complete?
 * @param {string|number} stepId step identifier used by the builder
 * @param {object} resumeData the resume being edited
 * @param {string} [stepPath] canonical path; falls back to the id
 */
export function isStepCompleted(stepId, resumeData = {}, stepPath) {
  const targetPath = stepPath || stepId;
  if (!hasSubstantiveStepContent(targetPath, resumeData)) return false;

  const completed = Array.isArray(resumeData.completedSteps) ? resumeData.completedSteps : [];
  if (completed.includes(stepId)) return true;
  if (stepPath && completed.includes(stepPath)) return true;

  const aliases = LEGACY_STEP_ALIASES[stepId] || [];
  if (aliases.some((alias) => completed.includes(alias))) return true;

  // Content exists and no contradicting flag: the section is genuinely done.
  return true;
}
