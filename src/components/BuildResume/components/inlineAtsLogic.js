import {
    calculateAtsScore,
    extractJdKeywords,
    keywordOccursInText,
    extractBullets,
    leadingActionVerb,
    ACTION_VERBS,
    stripHtml,
} from '../../../utils/atsScore.js';

/**
 * DIR-088 — pure logic for the Resume Builder's inline ATS guidance.
 *
 * Kept OUT of the component file so the component module only exports a component (avoids the
 * react-refresh/only-export-components warning) and so the derivation can be unit-tested
 * without a DOM.
 *
 * NOTHING HERE IS INVENTED: every hint is derived from the project's own ATS engine
 * (src/utils/atsScore.js) against the entry's real text and the stored target job description.
 */

/** Which ATS section each builder step feeds. */
export const STEP_TO_SECTION = {
    heading: 'contact',
    'work-history': 'experience',
    education: 'education',
    skills: 'skills',
    summary: 'summary',
    projects: 'evidence',
    certifications: 'evidence',
    achievements: 'evidence',
    languages: null,
    references: null,
    custom: null,
    review: null,
};

/** Rezi-style guidance: a bullet should open with a strong verb and stay readable. */
export const MIN_BULLET_WORDS = 8;
export const MAX_BULLET_WORDS = 30;

export const collectBullets = (resumeData) => {
    const employments = Array.isArray(resumeData?.employments) ? resumeData.employments : [];
    const bullets = [];
    for (const role of employments) {
        for (const bullet of extractBullets(stripHtml(role?.description))) {
            if (bullet && bullet.trim()) bullets.push(bullet.trim());
        }
    }
    return bullets;
};

export const analyseStep = (resumeData = {}, targetJd = '', stepPath = 'heading') => {
    const jdText = typeof targetJd === 'string' ? targetJd : '';
    const score = calculateAtsScore(resumeData, { jobDescription: jdText }) || null;
    const sectionId = STEP_TO_SECTION[stepPath] ?? null;
    const section = score && sectionId
        ? (score.sections || []).find((item) => item.id === sectionId) || null
        : null;

    // Action-verb power hints, straight from the engine's own verb list.
    const strongVerbs = new Set((ACTION_VERBS || []).map((verb) => String(verb).toLowerCase()));
    const bullets = collectBullets(resumeData);
    const weakBullets = bullets
        .map((bullet) => {
            const verb = String(leadingActionVerb(bullet) || '').toLowerCase();
            const words = bullet.split(/\s+/).filter(Boolean).length;
            const issues = [];
            if (!verb) issues.push('no leading action verb');
            else if (!strongVerbs.has(verb)) issues.push(`"${verb}" is a weak opener`);
            if (words > MAX_BULLET_WORDS) issues.push(`${words} words is long (aim for ${MAX_BULLET_WORDS} or fewer)`);
            if (words < MIN_BULLET_WORDS) issues.push(`${words} words is thin (aim for ${MIN_BULLET_WORDS}+)`);
            return issues.length ? { bullet, issues } : null;
        })
        .filter(Boolean)
        .slice(0, 3);

    // Keyword density cues against the stored target JD.
    const resumeText = [
        stripHtml(resumeData?.summary),
        ...(Array.isArray(resumeData?.skills) ? resumeData.skills.map((s) => (typeof s === 'string' ? s : s?.name || '')) : []),
        ...bullets,
    ].join(' ');
    const keywords = jdText ? (extractJdKeywords(jdText, { limit: 10 }) || []) : [];
    const missingKeywords = keywords
        .filter((term) => !keywordOccursInText(resumeText, term))
        .slice(0, 6);

    return {
        section,
        bulletCount: bullets.length,
        weakBullets,
        keywords,
        missingKeywords,
        hasJd: Boolean(jdText.trim()),
    };
};
