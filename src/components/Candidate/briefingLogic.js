// Explicit extension: this module is imported directly by the Node test runner,
// which does not perform the extensionless resolution Vite does.
import { calculateAtsScore } from '../../utils/atsScore.js';

/**
 * Candidate AI Career Briefing — TRUTHFULNESS LOGIC (§23, §46).
 *
 * This module is deliberately free of React and of any rendering concern, so the
 * rules that decide what the product is allowed to say can be unit-tested
 * directly. The component in `AiCareerBriefing.jsx` only renders what these
 * functions return.
 *
 * EVIDENCE RULE — the most important constraint in this file:
 *
 *   Every number produced here is computed from data the platform actually
 *   returned, or from `calculateAtsScore`, the deterministic local ATS engine
 *   the builder already uses. Nothing is hardcoded, estimated, or filled in for
 *   presentation. When there is not enough data to say something true, this
 *   returns an explicit empty state instead of inventing a headline.
 *
 *   It therefore does NOT claim employer names, salary figures, keyword
 *   recommendations, market demand, or "N new openings today" — none of those
 *   have a trustworthy source in this repository today.
 *
 * Data sources:
 *   - GET /api/resumes           → a real count of saved resumes
 *   - calculateAtsScore(resume)  → ATS readiness of the candidate's own CV
 *
 * It is READ-ONLY. It never writes, so it cannot damage candidate data (§7).
 */

export const BRIEFING_STATES = Object.freeze({
    LOADING: 'loading',
    ERROR: 'error',
    UNKNOWN: 'unknown',
    NO_RESUMES: 'no-resumes',
    UNSCORED: 'unscored',
    SCORED: 'scored',
});

/** The message shown when there is genuinely nothing to personalise from. */
export const EMPTY_BRIEFING_MESSAGE =
    'Your personalised briefing will appear once enough career activity is available.';

const scoreable = (entry) => {
    const payload = entry?.item || entry;
    if (!payload || typeof payload !== 'object') return null;
    const result = calculateAtsScore(payload);
    if (!result || typeof result.qualityScore !== 'number') return null;
    return {
        score: result.qualityScore,
        // Verbatim from the engine, not invented here.
        statusLabel: result.status?.label || null,
        statusId: result.status?.id || null,
        // The engine's own first concrete improvement, so the advice shown is
        // the same advice the ATS panel gives — one source of truth.
        nextStep: result.improvements?.[0]?.text || null,
        nextRoute: result.improvements?.[0]?.navigateTo || null,
    };
};

export const summariseResumes = (resumes) => {
    const documents = Array.isArray(resumes) ? resumes : [];
    const scored = documents.map(scoreable).filter(Boolean);
    const best = scored.reduce(
        (top, current) => (top === null || current.score > top.score ? current : top),
        null,
    );
    return {
        count: documents.length,
        scoredCount: scored.length,
        bestScore: best ? best.score : null,
        best,
    };
};

/**
 * Turns real inputs into the single most useful TRUE statement.
 * Exported for direct unit testing of the truthfulness rules.
 */
export function buildBriefing({ resumes, loading, error }) {
    if (loading) {
        return { state: BRIEFING_STATES.LOADING, headline: null, detail: null, action: null };
    }

    // A failed read is a failure. It must never degrade into "you have no data".
    if (error) {
        return {
            state: BRIEFING_STATES.ERROR,
            headline: 'Your career briefing is unavailable right now.',
            detail: 'We could not read your saved resumes, so we cannot give personalised advice. Your data is unchanged.',
            action: null,
        };
    }

    if (resumes === null || resumes === undefined) {
        return { state: BRIEFING_STATES.UNKNOWN, headline: null, detail: null, action: null };
    }

    const { count, scoredCount, bestScore, best } = summariseResumes(resumes);

    if (count === 0) {
        return {
            state: BRIEFING_STATES.NO_RESUMES,
            headline: EMPTY_BRIEFING_MESSAGE,
            detail: 'Create your first resume and this briefing will report its real ATS readiness, computed from your own content.',
            action: { label: 'Create a resume', to: '/build-resume' },
        };
    }

    if (scoredCount === 0 || bestScore === null) {
        // Only reachable when the engine could not produce a numeric score at
        // all. We say so rather than estimating one.
        return {
            state: BRIEFING_STATES.UNSCORED,
            headline: `You have ${count} saved ${count === 1 ? 'resume' : 'resumes'}, but none could be scored yet.`,
            detail: 'A resume can only be scored once it contains readable content, so we are not going to estimate a score for you.',
            action: { label: 'Open resumes', to: '/dashboard' },
        };
    }

    // A score of 0 is a REAL measurement of an empty resume, not a missing
    // value, so it is reported as measured and paired with the engine's own
    // first concrete improvement.
    return {
        state: BRIEFING_STATES.SCORED,
        headline: `Your strongest resume scores ${bestScore}/100 for ATS readiness.`,
        detail: bestScore >= 75
            ? 'Measured from your own resume content. Keep it current as your experience changes.'
            : best?.nextStep
                ? `Measured from your own resume content. Next step: ${best.nextStep}`
                : 'Measured from your own resume content. Reviewing and completing your resume usually raises it.',
        statusLabel: best?.statusLabel || null,
        action: { label: 'Improve in the builder', to: '/build-resume' },
    };
}

export default buildBriefing;
