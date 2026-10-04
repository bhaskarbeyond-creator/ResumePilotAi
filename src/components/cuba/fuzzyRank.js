/**
 * Fuzzy ranking for the shared Cuba command palette (DIR-012).
 *
 * WHY THIS EXISTS AS ITS OWN MODULE:
 *   The palette's previous matcher was a single `String.includes(term)`. Typing
 *   "setng" or "tnt" found nothing, so the "fuzzy search across Tenants, Users,
 *   System Settings and Audit Logs" acceptance criterion was not actually met on
 *   the DEFAULT (Cuba) shell — and that matcher was the only one any portal had,
 *   because the legacy admin palette is not mounted under Cuba chrome.
 *
 * CONTRACTS THIS MUST KEEP:
 *   - PURE. No React, no DOM, no network. Node can assert it, so the ranking
 *     cannot silently regress behind a browser-only test.
 *   - TOTAL. It ranks the array it is given and NEVER invents or policy-drops a
 *     command. A command the caller did not supply cannot appear (the palette's
 *     "zero dead commands, by construction" guarantee is preserved).
 *   - STABLE. Equal scores keep their original order, so the palette never
 *     reshuffles under the operator's cursor while they type.
 *   - NEVER THROWS on a null/empty/malformed command — one bad entry must not
 *     blank the whole palette.
 */

/** Normalises case, accents and separators so "Recruiter-Overview" ~= "recruiter overview". */
export function normalizeForSearch(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Characters after which a hit starts a word, which operators expect to outrank mid-word hits. */
const WORD_BOUNDARY = /[\s/]/;

/**
 * Scores `needle` against `haystack`. Higher is better; -1 means "no match".
 * An empty needle scores 0 so callers can treat "no query" as "everything".
 */
export function fuzzyScore(needle, haystack) {
    const needleText = normalizeForSearch(needle);
    if (!needleText) return 0;
    const haystackText = normalizeForSearch(haystack);
    if (!haystackText) return -1;

    // Tier 1 - contiguous substring. Always beats any scattered subsequence.
    const direct = haystackText.indexOf(needleText);
    if (direct !== -1) {
        let score = 1000 - Math.min(direct, 500);
        if (direct === 0) score += 200;
        else if (WORD_BOUNDARY.test(haystackText[direct - 1])) score += 120;
        // Prefer the tighter target: "Help Desk" should outrank a long keyword
        // string that happens to contain the same phrase.
        score += Math.max(0, 60 - haystackText.length);
        return score;
    }

    // Tier 2 - ordered subsequence ("tnt" -> "tenants registry"). Penalises gaps
    // and rewards runs, so "atn" still ranks "Tenants" above an unrelated label
    // that merely contains a, t and n in that order much further along.
    let cursor = 0;
    let last = -1;
    let run = 0;
    let score = 0;
    for (const char of needleText) {
        const found = haystackText.indexOf(char, cursor);
        if (found === -1) return -1;
        run = found === last + 1 ? run + 1 : 0;
        score += 12 + run * 8 - Math.min(found - cursor, 20);
        last = found;
        cursor = found + 1;
    }
    return 400 + score - Math.min(100, Math.max(0, haystackText.length - needleText.length) / 2);
}

/** Applies a ranking penalty while preserving the -1 "no match" sentinel. */
const penalise = (base, penalty) => (base < 0 ? -1 : base - penalty);

/**
 * Ranks commands against a query.
 *
 * Each command is searched across three fields with decreasing weight, because an
 * operator typing "audit" means the Audit Trail tab far more often than a keyword
 * blob that happens to contain the same letters.
 *
 * @param {Array<object>} commands caller-supplied commands; never mutated
 * @param {string} query
 * @returns {Array<object>} ranked subset (every command when the query is empty)
 */
export function rankCommands(commands, query) {
    const list = Array.isArray(commands) ? commands : [];
    const term = normalizeForSearch(query);
    if (!term) return list.slice();

    const scored = [];
    list.forEach((command, index) => {
        if (!command || typeof command !== 'object') return;
        const label = typeof command.label === 'string' ? command.label : '';
        const group = typeof command.group === 'string' ? command.group : '';
        const keywords = typeof command.keywords === 'string' ? command.keywords : '';
        if (!label && !group && !keywords) return;

        const score = Math.max(
            fuzzyScore(term, label),
            penalise(fuzzyScore(term, group), 60),
            penalise(fuzzyScore(term, keywords), 120),
        );
        if (score < 0) return;
        scored.push({ command, score, index });
    });

    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return scored.map((entry) => entry.command);
}

export default rankCommands;