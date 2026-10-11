import { FiFileText, FiGrid, FiMail } from 'react-icons/fi';
import { getResumes } from '../../../services/api/resumes.js';
import { getPortfolios } from '../../../services/api/portfolios.js';
import { getCovers } from '../../../services/api/covers.js';

/**
 * DIR-073 — live entity search for the candidate command palette.
 *
 * WHY THIS FILE IS SEPARATE FROM `CubaCandidateShell.jsx`:
 *   The candidate shell renders `CubaAppShell` directly and never passed a
 *   `commandSearchProvider`, so typing a document name in ⌘K surfaced only the
 *   static navigation commands — never the candidate's ACTUAL saved resumes,
 *   portfolios or cover letters. This module owns that lookup so the shell stays
 *   pure chrome (mirrors the admin `adminEntitySearch.js` precedent).
 *
 * SECURITY / OWNERSHIP: it performs no authorization of its own. Each read goes
 * through the SAME authenticated, owner-scoped service wrapper the rest of the
 * product uses (`/api/resumes`, `/api/portfolios`, `/api/covers`), so the server
 * returns only the caller's own records. A record the backend withheld can never
 * reach the DOM.
 *
 * NO FABRICATED DATA: every field is read from the live response. A missing title
 * falls back to the record id; nothing is defaulted into an invented document.
 * A lookup failure degrades to "no entity hits" rather than an error surface.
 */

/** Below this length a lookup is noise, not signal. Mirrors the palette's own floor. */
export const CANDIDATE_ENTITY_SEARCH_MIN_LENGTH = 2;

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const matches = (value, needle) => normalize(value).includes(needle);

/**
 * Maps the candidate's real document lists into palette-shaped hits.
 * Pure and exported so it can be asserted in Node without a browser.
 */
export function mapCandidateEntities({ resumes, portfolios, covers } = {}, term) {
    const needle = normalize(term);
    if (!needle) return [];
    const hits = [];

    for (const resume of Array.isArray(resumes) ? resumes : []) {
        if (!resume) continue;
        const title = resume.title || resume.name || resume.data?.title || '';
        if (!matches(title, needle) && !matches(resume.id, needle)) continue;
        hits.push({
            id: `entity-resume-${resume.id}`,
            label: `Resume: ${title || resume.id}`,
            group: 'Your documents',
            to: '/build-resume',
            icon: FiFileText,
        });
    }

    for (const portfolio of Array.isArray(portfolios) ? portfolios : []) {
        if (!portfolio) continue;
        const title = portfolio.title || portfolio.name || portfolio.slug || '';
        if (!matches(title, needle) && !matches(portfolio.id, needle)) continue;
        hits.push({
            id: `entity-portfolio-${portfolio.id}`,
            label: `Portfolio: ${title || portfolio.id}`,
            group: 'Your documents',
            to: '/dashboard/portfolios',
            icon: FiGrid,
        });
    }

    for (const cover of Array.isArray(covers) ? covers : []) {
        if (!cover) continue;
        const title = cover.title || cover.name || cover.jobTitle || '';
        if (!matches(title, needle) && !matches(cover.id, needle)) continue;
        hits.push({
            id: `entity-cover-${cover.id}`,
            label: `Cover letter: ${title || cover.id}`,
            group: 'Your documents',
            to: '/dashboard/cover-letters',
            icon: FiMail,
        });
    }

    return hits;
}

/** The provider handed to `CubaCommandPalette`. Errors surface as "no entity hits". */
export async function searchCandidateEntities(term) {
    if (normalize(term).length < CANDIDATE_ENTITY_SEARCH_MIN_LENGTH) return [];
    const [resumes, portfolios, covers] = await Promise.all([
        getResumes().catch(() => []),
        getPortfolios().catch(() => []),
        getCovers().catch(() => []),
    ]);
    return mapCandidateEntities({ resumes, portfolios, covers }, term);
}

export default searchCandidateEntities;
