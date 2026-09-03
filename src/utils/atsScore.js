/**
 * Deterministic, client-side ATS readiness scorer.
 *
 * Isolated from the resume rendering pipeline. Synchronous and allocation-light
 * so the builder can recompute on every resume change without an API call.
 *
 * Two independent dimensions — they must not be blended:
 *   ATS Readiness  = quality (0–100) from the category weights below
 *   Target JD Match = distinctive-term coverage (null if no JD, else 0–100)
 *
 * A missing job description does not reduce readiness. Mixing the two into one
 * number made a strong untargeted resume look worse than it is, and made a
 * stuffed-but-keyword-aligned resume look closer to a real candidate.
 */

export const ATS_WEIGHTS = Object.freeze({
    contact: 10,
    summary: 10,
    experience: 28,
    education: 8,
    skills: 14,
    evidence: 14,
    integrity: 16,
});

export const ATS_QUALITY_MAX = Object.values(ATS_WEIGHTS).reduce((sum, value) => sum + value, 0);

/** @deprecated Kept only so older tests/docs can name the rejected blend. */
export const JD_BLEND = Object.freeze({
    quality: 0.76,
    relevance: 0.24,
});

/** @deprecated The 8% no-JD ceiling was rejected — it punished users without a JD. */
export const NO_JD_ALIGNMENT_FACTOR = 1;

export const SCORE_ARCHITECTURE = 'separate';

const PUNCTUATION_SKILL_VARIANTS = Object.freeze({
    'c#': ['c#', 'csharp', 'c sharp'],
    'c++': ['c++', 'cplusplus', 'cpp'],
    '.net': ['.net', 'dotnet', 'dot net'],
    'f#': ['f#', 'fsharp'],
});

export const JD_STORAGE_KEY = 'rpai.ats.targetJd';

const ACTION_VERBS = Object.freeze([
    // General leadership, management & execution
    'architected', 'automated', 'built', 'created', 'delivered', 'designed',
    'developed', 'drove', 'engineered', 'established', 'expanded', 'generated',
    'implemented', 'improved', 'increased', 'launched', 'led', 'managed',
    'mentored', 'migrated', 'negotiated', 'optimized', 'orchestrated', 'owned',
    'pioneered', 'reduced', 'refactored', 'scaled', 'secured', 'shipped',
    'spearheaded', 'streamlined', 'transformed', 'supervised', 'coordinated', 'executed',
    // Healthcare, Clinical & Dental
    'diagnosed', 'treated', 'administered', 'prescribed', 'rehabilitated', 'monitored',
    'triaged', 'counseled', 'restored', 'extracted', 'operated', 'examined',
    // Legal & Regulatory
    'litigated', 'drafted', 'arbitrated', 'advocated', 'defended', 'prosecuted',
    'filed', 'settled', 'briefed', 'advised',
    // Education & Pedagogy
    'instructed', 'taught', 'facilitated', 'assessed', 'evaluated', 'trained',
    'curated', 'fostered', 'tutored', 'guided',
    // Accounting & Finance
    'audited', 'reconciled', 'budgeted', 'forecasted', 'balanced', 'consolidated',
    'appraised', 'analyzed', 'underwrote', 'allocated',
    // Research, Science & Architecture
    'investigated', 'synthesized', 'formulated', 'published', 'experimented',
    'hypothesized', 'discovered', 'commissioned', 'surveyed', 'inspected',
    // Aviation & Flight Operations
    'piloted', 'navigated', 'commanded', 'briefed', 'landed',
    // Judiciary & Dispute Resolution
    'adjudicated', 'presided', 'ruled', 'deliberated',
    // Culinary, Hospitality & Food Safety
    'prepared', 'curated', 'standardized', 'sourced', 'costed',
    // Music, Performing Arts & Audio
    'composed', 'performed', 'arranged', 'rehearsed', 'recorded', 'mastered',
    // Public Safety, Law Enforcement & Defense
    'patrolled', 'apprehended', 'de-escalated', 'mobilized', 'enforced',
    // Skilled Trades & Industrial Fabrication
    'fabricated', 'calibrated', 'installed', 'wired', 'welded', 'machined', 'repaired',
    // Agriculture, Agronomy & Soil
    'cultivated', 'harvested', 'propagated', 'irrigated', 'sampled',
    // Veterinary & Animal Care
    'inoculated', 'vaccinated',
    // Corporate Governance & Secretarial
    'convened', 'governed',
    // Supply Chain, Freight & Logistics
    'procured', 'dispatched', 'routed', 'inventoried',
    // Real Estate & Commercial Brokerage
    'brokered', 'valued',
    // Construction & Infrastructure
    'constructed',
    // Content, Editorial & Technical Writing
    'authored', 'edited',
    // Acting & Performance
    'portrayed', 'voiced',
    // Visual & Fine Arts
    'exhibited', 'painted', 'sculpted',
    // Commercial Experience & Retail
    'merchandised',
]);

const ENGLISH_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'had',
    'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
    'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your', 'our', 'we',
    'they', 'their', 'them', 'about', 'into', 'over', 'than', 'then', 'also',
    'can', 'may', 'must', 'should', 'would', 'could', 'not', 'all', 'any',
    'more', 'most', 'other', 'some', 'such', 'only', 'same', 'own', 'so',
    'if', 'when', 'who', 'what', 'which', 'how', 'why', 'where', 'there',
    'here', 'been', 'being', 'do', 'does', 'did', 'doing', 'done', 'using',
    'used', 'use', 'via', 'per', 'each', 'both', 'few', 'many', 'much',
    'team', 'work', 'role', 'job', 'jobs', 'position', 'opportunity',
    'company', 'candidate', 'experience', 'experiences', 'responsible',
    'responsibilities', 'requirement', 'requirements', 'qualification',
    'qualifications', 'ability', 'abilities', 'including', 'include',
    'preferred', 'required', 'looking', 'join', 'plus', 'across', 'within',
    'well', 'strong', 'good', 'great', 'new', 'high', 'low', 'year', 'years',
    'etc', 'eg', 'ie',
]);

const FILLER_TITLES = new Set([
    'test', 'project', 'untitled', 'asdf', 'xxx', 'n/a', 'na', 'none',
    'lorem', 'ipsum', 'foo', 'bar', 'skill', 'certification', 'achievement',
    'item', 'sample', 'demo', 'placeholder', 'title', 'name',
]);

const METRIC_RE = /(?:\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m|bn|million|billion)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s*(?:%|percent|x\b|times\b|k\+?|m\+?)|\b\d+\+)/gi;
const YEAR_ONLY_RE = /^(?:19|20)\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TECH_TOKEN_RE = /[0-9+#.]/;
const NON_LATIN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Hebrew}\p{Script=Greek}]/u;
const LATIN_LETTER_RE = /\p{Script=Latin}/gu;

export function stripHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[\u00a0\u2000-\u200b\u2028\u2029]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeToken(value) {
    return stripHtml(value)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function compactToken(value) {
    return normalizeToken(value).replace(/[\s./_-]+/g, '');
}

export function tokenize(text) {
    const normalized = normalizeToken(text);
    if (!normalized) return [];
    return normalized.match(/\.?[\p{L}\p{N}]+(?:[.#+][\p{L}\p{N}]+)*(?:#|\+\+)?/gu) || [];
}

function uniqueStrings(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const key = normalizeToken(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

function isFillerTitle(value) {
    const key = normalizeToken(value);
    return !key || key.length < 3 || FILLER_TITLES.has(key);
}

function skillName(skill) {
    if (!skill) return '';
    if (typeof skill === 'string') return stripHtml(skill);
    return stripHtml(skill.skillName || skill.name || skill.skill || skill.title);
}

function fieldText(...parts) {
    return parts.map(stripHtml).filter(Boolean).join(' ');
}

export function extractBullets(description) {
    const raw = String(description || '');
    if (!raw.trim()) return [];
    const fromLists = raw.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
    const chunks = fromLists.length
        ? fromLists
        : raw.split(/\n+|<(?:br|\/p|\/div)\s*\/?>/i);
    const bullets = chunks
        .map(stripHtml)
        .map((item) => item.replace(/^[-*•–—]+\s*/, '').trim())
        .filter((item) => item.length >= 18);
    return uniqueStrings(bullets);
}

export function extractMetrics(text) {
    const source = stripHtml(text);
    if (!source) return [];
    const found = source.match(METRIC_RE) || [];
    return uniqueStrings(found
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter((item) => !YEAR_ONLY_RE.test(item.replace(/[^\d]/g, '').length === 4 ? item.replace(/[^\d]/g, '') : '')));
}

export function leadingActionVerb(bullet) {
    const tokens = tokenize(bullet);
    if (!tokens.length) return null;
    const first = tokens[0];
    return ACTION_VERBS.includes(first) ? first : null;
}

export function detectNonEnglish(text) {
    const source = stripHtml(text);
    if (!source) return { nonEnglish: false, reason: 'empty' };
    if (NON_LATIN_RE.test(source)) return { nonEnglish: true, reason: 'non-latin-script' };
    const letters = source.match(LATIN_LETTER_RE) || [];
    if (letters.length < 24) return { nonEnglish: false, reason: 'too-short' };
    const tokens = tokenize(source);
    if (tokens.length < 8) return { nonEnglish: false, reason: 'too-short' };
    const englishHits = tokens.filter((token) => ENGLISH_STOPWORDS.has(token) || ACTION_VERBS.includes(token)).length;
    if (englishHits / tokens.length < 0.08) return { nonEnglish: true, reason: 'low-english-function-words' };
    return { nonEnglish: false, reason: 'english-or-mixed' };
}

const DOMAIN_ANCHOR_TERMS = new Set([
    'software', 'engineer', 'engineering', 'developer', 'development', 'manager', 'management',
    'lead', 'senior', 'data', 'project', 'projects', 'product', 'products', 'system', 'systems',
    'design', 'designed', 'designer', 'sales', 'business', 'team', 'teams', 'client', 'clients',
    'customer', 'customers', 'service', 'services', 'health', 'healthcare', 'nurse', 'nursing',
    'patient', 'patients', 'medical', 'dental', 'dentist', 'clinic', 'clinical', 'treatment',
    'doctor', 'physician', 'hospital', 'surgery', 'care', 'therapy', 'law', 'legal', 'attorney',
    'lawyer', 'counsel', 'litigation', 'court', 'contract', 'contracts', 'compliance', 'regulatory',
    'teacher', 'teaching', 'student', 'students', 'curriculum', 'classroom', 'school', 'academic',
    'education', 'instruction', 'accountant', 'accounting', 'audit', 'auditing', 'tax', 'financial',
    'finance', 'ledger', 'budget', 'fiscal', 'revenue', 'human', 'resources', 'recruiting',
    'talent', 'employee', 'employees', 'marketing', 'campaign', 'brand', 'content', 'growth',
    'research', 'laboratory', 'experiment', 'study', 'publication', 'hospitality', 'guest',
    'guests', 'hotel', 'restaurant', 'dining', 'catering', 'operations', 'operational',
    'director', 'analyst', 'analysis', 'cloud', 'security', 'infrastructure', 'architecture',
    'architect', 'technical', 'technology', 'technologies', 'code', 'quality', 'built', 'led',
    'managed', 'created', 'worked', 'work', 'using', 'used', 'including', 'years', 'experience',
    'responsible', 'skills', 'degree', 'university', 'college'
]);

export function analyzeStuffing(text) {
    const tokens = tokenize(text).filter((token) => token.length >= 3 && !ENGLISH_STOPWORDS.has(token));
    if (tokens.length < 6) {
        return { stuffed: false, uniqueRatio: tokens.length ? 1 : 0, repeatedToken: null, consecutive: false, empty: tokens.length === 0, tokenCount: tokens.length };
    }
    const counts = new Map();
    let consecutive = false;
    let previous = '';
    let run = 0;
    for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
        if (token === previous) {
            run += 1;
            if (run >= 3) consecutive = true;
        } else {
            previous = token;
            run = 1;
        }
    }
    const uniqueRatio = counts.size / tokens.length;
    let repeatedToken = null;
    let maxShare = 0;
    for (const [token, count] of counts) {
        const share = count / tokens.length;
        const isAnchor = DOMAIN_ANCHOR_TERMS.has(token);
        const thresholdCount = isAnchor ? 25 : 10;
        const thresholdShare = isAnchor ? 0.28 : 0.18;

        if (count >= thresholdCount || (count >= 5 && share >= thresholdShare)) {
            if (share > maxShare) {
                maxShare = share;
                repeatedToken = token;
            }
        }
    }
    return {
        stuffed: Boolean(repeatedToken) || consecutive || (tokens.length >= 8 && uniqueRatio < 0.32),
        uniqueRatio,
        repeatedToken,
        consecutive,
        tokenCount: tokens.length,
    };
}

function collectResumePlain(data = {}) {
    const skills = (data.skills || []).map(skillName).filter(Boolean);
    const employments = data.employments || [];
    const educations = data.educations || [];
    const projects = data.projects || [];
    const certifications = data.certifications || [];
    const achievements = data.achievements || [];
    const customSections = data.customSections || [];
    const languages = data.languages || [];
    const parts = [
        data.firstname, data.lastname, data.occupation, data.email, data.phone,
        data.city, data.country, data.summary,
        ...employments.map((item) => fieldText(item.jobTitle, item.employer, item.description, item.begin, item.end, item.startDate, item.endDate)),
        ...educations.map((item) => fieldText(item.degree, item.school, item.description)),
        ...skills,
        ...projects.map((item) => fieldText(item.title, item.name, item.description, item.url, item.link)),
        ...certifications.map((item) => fieldText(item.title, item.name, item.issuer, item.date)),
        ...achievements.map((item) => fieldText(item.title, item.name, item.description)),
        ...customSections.flatMap((section) => [
            section.title,
            section.content,
            ...((section.items || []).map((item) => (typeof item === 'string' ? item : fieldText(item.title, item.description, item.content)))),
        ]),
        ...languages.map((item) => (typeof item === 'string' ? item : item.name || item.language)),
    ];
    return parts.map(stripHtml).filter(Boolean).join(' ');
}

function uniqueSkills(list) {
    const names = (Array.isArray(list) ? list : []).map(skillName).filter((name) => name && !isFillerTitle(name));
    const seen = new Set();
    const unique = [];
    for (const name of names) {
        const key = compactToken(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(name.trim());
    }
    return unique;
}

function scoreContact(data) {
    const findings = [];
    let score = 0;
    const hasName = Boolean(stripHtml(data.firstname) && stripHtml(data.lastname));
    const email = stripHtml(data.email);
    const hasValidEmail = EMAIL_RE.test(email);
    const digits = String(data.phone || '').replace(/\D/g, '');
    const hasPhone = digits.length >= 7;
    const hasLocation = Boolean(stripHtml(data.city) || stripHtml(data.country));

    if (hasName) {
        score += 3;
        findings.push({ ok: true, text: 'Full name is present.' });
    } else {
        findings.push({ ok: false, text: 'Add both first and last name.' });
    }
    if (hasValidEmail) {
        score += 3;
        findings.push({ ok: true, text: 'Email looks parseable.' });
    } else if (email) {
        score += 1;
        findings.push({ ok: false, text: 'Email does not look valid to an ATS parser.' });
    } else {
        findings.push({ ok: false, text: 'Add a professional email address.' });
    }
    if (hasPhone) {
        score += 2;
        findings.push({ ok: true, text: 'Phone number is present.' });
    } else {
        findings.push({ ok: false, text: 'Add a phone number with at least 7 digits.' });
    }
    if (hasLocation) {
        score += 2;
        findings.push({ ok: true, text: 'Location is present.' });
    } else {
        findings.push({ ok: false, text: 'Add a city or country so location filters can match.' });
    }

    const action = score >= 8
        ? 'Contact details look complete.'
        : 'Add name, a valid email, phone, and city or country.';
    return { score, maxScore: ATS_WEIGHTS.contact, findings, action, navigateTo: 'heading' };
}

function scoreSummary(data, stuffing, language) {
    const findings = [];
    const summary = stripHtml(data.summary);
    const tokens = tokenize(summary);
    const unique = new Set(tokens);
    let score = 0;

    if (!summary) {
        findings.push({ ok: false, text: 'No professional summary yet.' });
        return {
            score: 0,
            maxScore: ATS_WEIGHTS.summary,
            findings,
            action: 'Write a 3–5 sentence summary of the role you want and the proof you have.',
            navigateTo: 'summary',
        };
    }

    if (summary.length >= 60) {
        score += 4;
        findings.push({ ok: true, text: 'Summary is long enough to be useful.' });
    } else {
        score += 1;
        findings.push({ ok: false, text: 'Summary is too short to describe your fit.' });
    }

    if (summary.length >= 100 && summary.length <= 480) {
        score += 3;
        findings.push({ ok: true, text: 'Summary length is in a recruiter-friendly range.' });
    } else if (summary.length > 480) {
        findings.push({ ok: false, text: 'Summary is very long and may look like a keyword dump.' });
    } else {
        findings.push({ ok: false, text: 'Expand the summary to about 100–300 characters of real substance.' });
    }

    const diverse = unique.size >= 16 && (tokens.length ? unique.size / tokens.length : 0) >= 0.5;
    if (diverse && !stuffing.stuffed) {
        score += 3;
        findings.push({ ok: true, text: 'Wording is varied rather than repetitive.' });
    } else {
        findings.push({ ok: false, text: stuffing.stuffed
            ? 'The same words are repeated too often in the summary.'
            : 'Use more distinct wording — avoid repeating the same keyword.' });
    }

    if (stuffing.stuffed) score = Math.min(score, 3);
    const looksPasted = /\b(responsibilities|requirements|qualifications|we are (?:looking|seeking|hiring))\b/i.test(summary);
    if (looksPasted) {
        score = Math.min(score, 3);
        findings.push({ ok: false, text: 'The summary looks like a pasted job posting rather than your pitch.' });
    }

    if (language.nonEnglish) {
        findings.push({ ok: true, text: 'Summary language is non-English; length and variety are scored, not English verbs.' });
    }

    return {
        score,
        maxScore: ATS_WEIGHTS.summary,
        findings,
        action: score >= 8
            ? 'Summary is doing its job.'
            : 'Rewrite the summary as a short, specific pitch — not a keyword list.',
        navigateTo: 'summary',
    };
}

function scoreExperience(data, language) {
    const findings = [];
    const employments = Array.isArray(data.employments) ? data.employments : [];
    const completeRoles = employments.filter((item) => stripHtml(item.jobTitle) && stripHtml(item.employer));
    const datedRoles = employments.filter((item) => stripHtml(item.begin || item.startDate || item.started));
    const bullets = uniqueStrings(employments.flatMap((item) => extractBullets(item.description)));
    const verbs = uniqueStrings(bullets.map(leadingActionVerb).filter(Boolean));
    const metrics = uniqueStrings(employments.flatMap((item) => extractMetrics(item.description)));

    let score = 0;
    const rolePts = Math.min(6, completeRoles.length * 3);
    score += rolePts;
    if (completeRoles.length) findings.push({ ok: true, text: `${completeRoles.length} complete role${completeRoles.length === 1 ? '' : 's'} (title + employer).` });
    else findings.push({ ok: false, text: 'Add at least one role with both a job title and employer.' });

    const bulletPts = Math.min(8, bullets.length * 2);
    score += bulletPts;
    if (bullets.length >= 2) findings.push({ ok: true, text: `${bullets.length} distinct, substantial bullets.` });
    else findings.push({ ok: false, text: 'Add 2–4 unique bullets that describe real work, not one-line placeholders.' });

    if (language.nonEnglish) {
        const structurePts = Math.min(8, bullets.filter((item) => item.length >= 28).length * 2);
        score += structurePts;
        findings.push({ ok: true, text: 'Action-verb coaching is English-oriented; substantial bullets still count.' });
    } else {
        const verbPts = Math.min(6, verbs.length * 2);
        score += verbPts;
        if (verbs.length >= 2) findings.push({ ok: true, text: `${verbs.length} distinct action-led bullets (${verbs.slice(0, 4).join(', ')}).` });
        else findings.push({ ok: false, text: 'Start bullets with a strong verb such as led, shipped, or reduced — and do not repeat the same verb.' });

        const metricPts = Math.min(6, metrics.length * 2);
        score += metricPts;
        if (metrics.length >= 2) findings.push({ ok: true, text: `${metrics.length} distinct measurable outcomes.` });
        else findings.push({ ok: false, text: 'Add measurable results (%, $, time, scale) to at least two bullets.' });
    }

    if (datedRoles.length) {
        score = Math.min(ATS_WEIGHTS.experience, score + 2);
        findings.push({ ok: true, text: 'At least one role includes a start date.' });
    } else if (completeRoles.length) {
        findings.push({ ok: false, text: 'Add employment dates so ATS parsers can order your history.' });
    }

    score = Math.min(ATS_WEIGHTS.experience, score);
    return {
        score,
        maxScore: ATS_WEIGHTS.experience,
        findings,
        facts: { bullets: bullets.length, verbs: verbs.length, metrics: metrics.length, roles: completeRoles.length },
        action: score >= 22
            ? 'Experience reads as specific and evidenced.'
            : 'Improve 2–3 bullets with a unique result and a unique action.',
        navigateTo: 'work-history',
    };
}

function scoreEducation(data) {
    const findings = [];
    const educations = Array.isArray(data.educations) ? data.educations : [];
    const meaningful = educations.filter((item) => stripHtml(item.school) || stripHtml(item.degree));
    const complete = educations.filter((item) => stripHtml(item.school) && stripHtml(item.degree));
    let score = 0;
    if (meaningful.length) {
        score += 3;
        findings.push({ ok: true, text: 'Education section has content.' });
    } else {
        findings.push({ ok: false, text: 'Add a school or degree so ATS education fields are not empty.' });
    }
    if (complete.length) {
        score += 4;
        findings.push({ ok: true, text: 'Degree and school are both listed.' });
    } else if (meaningful.length) {
        findings.push({ ok: false, text: 'Specify both the degree title and the school.' });
    }
    if (educations.some((item) => stripHtml(item.started || item.startDate || item.begin || item.finished || item.endDate))) {
        score += 1;
        findings.push({ ok: true, text: 'Education includes a date.' });
    }
    let action = 'Education is complete enough for ATS.';
    if (score < ATS_WEIGHTS.education) {
        if (meaningful.length === 0) {
            action = 'Add school name, degree, and graduation year or field of study.';
        } else if (complete.length === 0) {
            action = 'Specify both the degree title and school name.';
        } else {
            action = 'Add graduation year or dates to complete your education entry.';
        }
    }
    return {
        score,
        maxScore: ATS_WEIGHTS.education,
        findings,
        action,
        navigateTo: 'education',
    };
}

function scoreSkills(data, stuffing) {
    const findings = [];
    const skills = uniqueSkills(data.skills);
    let score = 0;
    if (skills.length >= 1) score += 3;
    if (skills.length >= 3) score += 4;
    if (skills.length >= 6) score += 4;
    if (skills.length >= 8 && skills.length <= 18) score += 3;
    else if (skills.length > 18 && skills.length <= 28) score += 1;
    else if (skills.length > 28) {
        score = Math.min(score, 6);
        findings.push({ ok: false, text: `${skills.length} skills looks like a laundry list. Keep 8–16 relevant ones.` });
    }

    if (skills.length >= 3 && skills.length <= 18) {
        findings.push({ ok: true, text: `${skills.length} unique skills.` });
    } else if (skills.length === 0) {
        findings.push({ ok: false, text: 'Add skills you actually use — 6 to 12 is a strong range.' });
    } else if (skills.length < 3) {
        findings.push({ ok: false, text: 'Add a few more genuine skills, especially ones from the target job.' });
    }

    if (stuffing.stuffed) {
        score = Math.min(score, 8);
        findings.push({ ok: false, text: 'Repeated skill keywords elsewhere on the resume do not add extra points.' });
    }

    let action = 'Skill list is in a healthy range.';
    if (score < ATS_WEIGHTS.skills) {
        if (skills.length === 0) {
            action = 'Add 6–12 core skills and tools relevant to your target role.';
        } else if (skills.length < 6) {
            action = 'Add 3–5 more skills or tools to strengthen keyword coverage.';
        } else if (skills.length < 8) {
            action = 'Add 2–3 specialized tools, methodologies, or core competencies to maximize score.';
        } else if (skills.length > 18) {
            action = 'Prune skill list down to 8–16 high-impact core skills.';
        }
    }

    return {
        score: Math.min(ATS_WEIGHTS.skills, score),
        maxScore: ATS_WEIGHTS.skills,
        findings,
        facts: { count: skills.length, names: skills },
        action,
        navigateTo: 'skills',
    };
}

function projectQuality(project, skillNames) {
    const title = stripHtml(project.title || project.name);
    const description = stripHtml(project.description);
    const url = stripHtml(project.url || project.link);
    if (isFillerTitle(title) && description.length < 24) return 0;
    const tokens = new Set(tokenize(description));
    const hasBody = (description.length >= 40 && tokens.size >= 8) || extractMetrics(description).length > 0 || /^https?:\/\//i.test(url);
    if (!hasBody) return 0;
    let pts = 0;
    if (title && !isFillerTitle(title)) pts += 2;
    if (description.length >= 40 && tokens.size >= 8) pts += 2;
    if (extractMetrics(description).length) pts += 1;
    if (url && /^https?:\/\//i.test(url)) pts += 1;
    const overlap = skillNames.some((skill) => compactToken(description).includes(compactToken(skill)) && compactToken(skill).length >= 3);
    if (overlap) pts += 1;
    return Math.min(6, pts);
}

function certQuality(cert) {
    const title = stripHtml(cert.title || cert.name);
    if (!title || isFillerTitle(title)) return 0;
    let pts = 2;
    if (stripHtml(cert.issuer || cert.organization || cert.authority)) pts += 1;
    if (stripHtml(cert.date)) pts += 1;
    return pts;
}

function achievementQuality(item) {
    const title = stripHtml(item.title || item.name);
    const description = stripHtml(item.description);
    if ((!title || isFillerTitle(title)) && description.length < 24) return 0;
    let pts = 0;
    if (title && !isFillerTitle(title)) pts += 1;
    if (description.length >= 30) pts += 1;
    if (extractMetrics(description).length) pts += 2;
    return Math.min(4, pts);
}

function scoreEvidence(data) {
    const findings = [];
    const skillNames = uniqueSkills(data.skills);
    const projects = (data.projects || []).map((item) => projectQuality(item, skillNames)).filter((value) => value > 0);
    const certs = (data.certifications || []).map(certQuality).filter((value) => value > 0);
    const achievements = (data.achievements || []).map(achievementQuality).filter((value) => value > 0);
    const customPts = (data.customSections || []).flatMap((section) => (section.items || []).map((item) => {
        const text = typeof item === 'string' ? item : fieldText(item.title, item.description, item.content);
        if (stripHtml(text).length < 30) return 0;
        return extractMetrics(text).length ? 2 : 1;
    }));

    const projectScore = Math.min(6, projects.reduce((sum, value) => sum + value, 0));
    const certScore = Math.min(4, certs.reduce((sum, value) => sum + value, 0));
    const achievementScore = Math.min(4, achievements.reduce((sum, value) => sum + value, 0));
    let score = Math.min(ATS_WEIGHTS.evidence, projectScore + certScore + achievementScore);
    const leftover = ATS_WEIGHTS.evidence - score;
    if (leftover > 0 && customPts.some((value) => value > 0)) {
        score += Math.min(2, leftover, Math.max(...customPts, 0));
    }

    if (projects.length) findings.push({ ok: true, text: `${projects.length} meaningful project${projects.length === 1 ? '' : 's'}.` });
    else findings.push({ ok: false, text: 'A relevant project with technologies and an outcome can strengthen ATS evidence.' });
    if (certs.length) findings.push({ ok: true, text: `${certs.length} named certification${certs.length === 1 ? '' : 's'}.` });
    if (achievements.length) findings.push({ ok: true, text: `${achievements.length} substantiated achievement${achievements.length === 1 ? '' : 's'}.` });
    if (!projects.length && !certs.length && !achievements.length) {
        findings.push({ ok: false, text: 'Projects, certifications, and achievements are optional — empty or filler entries earn nothing.' });
    }

    return {
        score,
        maxScore: ATS_WEIGHTS.evidence,
        findings,
        facts: { projects: projects.length, certifications: certs.length, achievements: achievements.length },
        action: score >= 8
            ? 'Supporting evidence is contributing.'
            : 'Add one relevant project or certification with a real name, issuer or outcome — not filler.',
        navigateTo: projects.length ? 'projects' : 'certifications',
    };
}

function scoreIntegrity({ stuffing, skills, datedRoles, hasNarrative, empty }) {
    const findings = [];
    if (empty) {
        return {
            score: 0,
            maxScore: ATS_WEIGHTS.integrity,
            findings: [{ ok: false, text: 'Add real resume content before integrity can be assessed.' }],
            action: 'Start with contact details, a summary, and one genuine work story.',
            navigateTo: 'heading',
        };
    }
    let score = 0;
    if (!stuffing.stuffed && hasNarrative) {
        score += 4;
        findings.push({ ok: true, text: 'No keyword-stuffing pattern detected.' });
    } else if (stuffing.stuffed) {
        findings.push({ ok: false, text: stuffing.repeatedToken
            ? `“${stuffing.repeatedToken}” is repeated so often it looks stuffed.`
            : 'Repeated or copy-pasted wording is lowering the integrity score.' });
    } else {
        findings.push({ ok: false, text: 'Add real sentences before integrity can credit clean writing.' });
    }
    const tokenCount = stuffing.tokenCount || 0;
    if (stuffing.uniqueRatio < 0.32) {
        findings.push({ ok: false, text: 'Too much repeated language across the resume.' });
    } else if (tokenCount >= 40 && stuffing.uniqueRatio >= 0.45) {
        score += 4;
        findings.push({ ok: true, text: 'Overall wording is reasonably diverse.' });
    } else if (tokenCount >= 20 && stuffing.uniqueRatio >= 0.4) {
        score += 2;
        findings.push({ ok: true, text: 'Wording variety is acceptable for the current length.' });
    } else {
        findings.push({ ok: false, text: 'Add more distinct phrasing across experience and summary.' });
    }
    if (datedRoles) {
        score += 3;
        findings.push({ ok: true, text: 'Employment dates help ATS chronology.' });
    } else {
        findings.push({ ok: false, text: 'Missing dates make the work history harder to parse.' });
    }
    if (skills >= 3 && skills <= 18) {
        score += 3;
        findings.push({ ok: true, text: 'Skills are listed as a discrete, bounded set.' });
    } else if (skills > 18) {
        findings.push({ ok: false, text: 'A very long skill list often looks like stuffing to ATS reviewers.' });
    } else {
        findings.push({ ok: false, text: 'A short, specific skill list is easier for ATS parsers than a paragraph of keywords.' });
    }
    if (!hasNarrative) {
        score = Math.min(score, 8);
        findings.push({ ok: false, text: 'Add real sentences in the summary or experience — not only keywords.' });
    }
    if (stuffing.stuffed) score = Math.min(score, 6);
    let action = 'Integrity looks healthy — keep writing naturally.';
    if (stuffing.stuffed) {
        action = 'Remove repeated keywords and keep each claim in one natural sentence.';
    } else if (score < ATS_WEIGHTS.integrity) {
        action = 'Ensure employment dates are chronological and bullet points have clear context.';
    }
    return {
        score: Math.min(ATS_WEIGHTS.integrity, score),
        maxScore: ATS_WEIGHTS.integrity,
        findings,
        action,
        navigateTo: 'work-history',
    };
}

function classifyKeyword(term) {
    const compact = compactToken(term);
    if (/[./+#\d-]/.test(term) || /^[A-Z]{2,5}$/.test(term.trim())) return 'Tools';
    if (/\s/.test(term.trim()) || TECH_TOKEN_RE.test(term)) return 'Technical Skills';
    if (/(agile|scrum|kanban|devops|tdd|ci|cd|lean|waterfall|six sigma|kaizen|sop|iso|haccp)/i.test(compact)) return 'Methodologies';
    return 'Role / Domain';
}

export function expandKeywordVariants(term) {
    const normalized = normalizeToken(term);
    const variants = new Set([normalized]);
    variants.add(normalized.replace(/[./_+#-]+/g, ' ').replace(/\s+/g, ' ').trim());
    variants.add(compactToken(term));
    variants.add(normalized.replace(/[./_+#-]+/g, '-'));
    variants.add(normalized.replace(/[./_+#-]+/g, '/'));
    if (/[a-z]s$/i.test(normalized) && !/[./]s$/i.test(normalized) && normalized.length > 4) {
        variants.add(normalized.slice(0, -1));
    }
    const punct = PUNCTUATION_SKILL_VARIANTS[normalized] || PUNCTUATION_SKILL_VARIANTS[compactToken(term)];
    if (punct) punct.forEach((item) => variants.add(item));
    return [...variants].filter((item) => item && item.length >= 2);
}

const WEAK_PHRASE_HEADS = new Set([
    'need', 'needs', 'needed', 'looking', 'seek', 'seeking', 'hiring',
    'required', 'must', 'want', 'wanted', 'join', 'using',
]);

const GENERIC_PHRASE_TAILS = new Set([
    'services', 'service', 'features', 'feature', 'pipelines', 'pipeline',
    'collaboration', 'delivery', 'experience', 'experiences', 'systems',
    'applications', 'application', 'platform', 'platforms', 'tools', 'tool',
    'skills', 'skill', 'knowledge', 'ability', 'abilities', 'environment',
    'team', 'teams', 'role', 'roles', 'position', 'candidate',
]);

function isSpecialToken(token) {
    return /[.#+/]/.test(token);
}

export function extractJdKeywords(jobDescription, { limit = 16 } = {}) {
    const source = stripHtml(jobDescription);
    if (!source.trim()) return [];

    const phrases = [];
    const seen = new Set();
    const remember = (raw, weight = 1) => {
        const display = String(raw || '').replace(/[.,;:()]+$/g, '').trim();
        const key = compactToken(display);
        const normalized = normalizeToken(display);
        if (!key || key.length < 2 || ENGLISH_STOPWORDS.has(normalized)) return;
        if (seen.has(key)) return;
        seen.add(key);
        phrases.push({ term: display, key, weight, category: classifyKeyword(display) });
    };

    const punctuationSkills = source.match(/\.NET\b|(?:^|[^A-Za-z0-9])C#(?=[^A-Za-z0-9]|$)|(?:^|[^A-Za-z0-9])C\+\+(?=[^A-Za-z0-9]|$)|(?:^|[^A-Za-z0-9])F#(?=[^A-Za-z0-9]|$)|(?<![A-Za-z])SQL(?![A-Za-z])|Power\s+BI|BLS\b|ACLS\b|PMP\b|CPA\b|CFA\b|SHRM\b|LEED\b/gi) || [];
    punctuationSkills.forEach((item) => remember(item, 5));

    const specials = source.match(/\b[A-Za-z][\w+#]*(?:\.[\w+#]+)+\b|\b[A-Za-z]+(?:\/[A-Za-z+]+)+\b|\b[A-Za-z][\w]*-[\w-]+\b|\b[A-Z]{2,5}\b/g) || [];
    specials.forEach((item) => remember(item, 5));

    const properPhrases = source.match(/\b[A-Z][A-Za-z0-9+#]+(?:\s+[A-Z][A-Za-z0-9+#]+){1,2}\b/g) || [];
    properPhrases.forEach((item) => {
        const first = normalizeToken(item).split(/\s+/)[0];
        if (WEAK_PHRASE_HEADS.has(first) || ENGLISH_STOPWORDS.has(first)) return;
        remember(item, 4);
    });

    const tokens = source.split(/[^A-Za-z0-9+#./-]+/).filter(Boolean);
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const left = tokens[index];
        const right = tokens[index + 1];
        const leftKey = normalizeToken(left);
        const rightKey = normalizeToken(right);
        if (ENGLISH_STOPWORDS.has(leftKey) || ENGLISH_STOPWORDS.has(rightKey)) continue;
        if (WEAK_PHRASE_HEADS.has(leftKey) || WEAK_PHRASE_HEADS.has(rightKey)) continue;
        if (leftKey.length < 3 || rightKey.length < 3) continue;
        if (isSpecialToken(left) || isSpecialToken(right)) continue;
        if (GENERIC_PHRASE_TAILS.has(rightKey) || GENERIC_PHRASE_TAILS.has(leftKey)) continue;
        remember(`${left} ${right}`, 3);
    }

    const freq = new Map();
    tokenize(source).forEach((token) => {
        if (token.length < 4 || ENGLISH_STOPWORDS.has(token)) return;
        if (GENERIC_PHRASE_TAILS.has(token)) return;
        freq.set(token, (freq.get(token) || 0) + 1);
    });
    [...freq.entries()]
        .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
        .slice(0, 8)
        .forEach(([token, count]) => remember(token, count));

    const ranked = phrases.sort((left, right) => right.weight - left.weight || right.term.length - left.term.length);
    const sourceCompact = compactToken(source);
    const filtered = ranked.filter((item) => {
        const words = normalizeToken(item.term).split(/\s+/);
        if (words.length < 2) {
            const longer = ranked.find((other) => other !== item && other.weight >= item.weight && other.key.includes(item.key) && /\s/.test(other.term));
            if (!longer) return true;
            // Keep "React" when the JD also uses it standalone, not only inside "React Native".
            const phraseCount = (sourceCompact.match(new RegExp(longer.key, 'g')) || []).length;
            const selfCount = (sourceCompact.match(new RegExp(item.key, 'g')) || []).length;
            return selfCount > phraseCount;
        }
        return !ranked.some((other) => (
            other !== item
            && other.term !== item.term
            && compactToken(other.term).includes(item.key)
            && other.term.split(/\s+/).length > words.length
        ));
    });

    return filtered.filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index).slice(0, limit);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundedMatch(haystack, term) {
    const variant = normalizeToken(term);
    if (!variant) return false;
    if (variant === 'java') {
        return /(?<![\p{L}\p{N}])java(?!script|[\p{L}\p{N}])/u.test(haystack);
    }
    if (variant === 'c') {
        return /(?<![\p{L}\p{N}+#])c(?![\p{L}\p{N}+#]|\+\+|sharp)/u.test(haystack);
    }
    try {
        return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(variant)}(?![\\p{L}\\p{N}])`, 'u').test(haystack);
    } catch {
        return false;
    }
}

export function keywordOccursInText(resumeText, term) {
    const haystack = normalizeToken(resumeText);
    return expandKeywordVariants(term).some((variant) => {
        if (!variant || variant.length < 2) return false;
        if (boundedMatch(haystack, variant)) return true;
        const spaced = variant.replace(/[./_+#-]+/g, ' ').trim();
        if (spaced && spaced !== variant && boundedMatch(haystack, spaced)) return true;
        const compact = compactToken(variant);
        if (compact && compact !== variant && boundedMatch(haystack.replace(/[\s./_-]+/g, ''), compact)) return true;
        return false;
    });
}

export function matchJobDescription(resumeText, jobDescription) {
    const keywords = extractJdKeywords(jobDescription);
    if (!keywords.length) {
        return {
            score: null,
            matched: [],
            missing: [],
            groups: {},
            total: 0,
        };
    }
    const matched = [];
    const missing = [];
    for (const item of keywords) {
        (keywordOccursInText(resumeText, item.term) ? matched : missing).push(item);
    }
    const groups = {};
    for (const item of missing) {
        if (!groups[item.category]) groups[item.category] = [];
        groups[item.category].push(item.term);
    }
    const missingTerms = missing
        .map((item) => item.term)
        .sort((left, right) => right.length - left.length);
    return {
        score: Math.round((matched.length / keywords.length) * 100),
        matched: matched.map((item) => item.term),
        missing: missingTerms,
        groups,
        total: keywords.length,
    };
}

export function composeDisplayedScore(qualityScore) {
    return Math.max(0, Math.min(100, Math.round(Number(qualityScore) || 0)));
}

function statusFor(score) {
    if (score >= 85) return { id: 'excellent', label: 'Excellent' };
    if (score >= 70) return { id: 'strong', label: 'Strong' };
    if (score >= 45) return { id: 'needs-improvement', label: 'Needs Improvement' };
    return { id: 'getting-started', label: 'Getting Started' };
}

function buildStrengths(sections, jdMatch, stuffing, language) {
    const strengths = [];
    for (const section of sections) {
        if (section.score / section.maxScore >= 0.75) {
            const highlight = section.findings.find((item) => item.ok);
            strengths.push(highlight?.text || `${section.name} is in good shape.`);
        }
    }
    if (jdMatch?.score != null && jdMatch.score >= 70) strengths.push('Good coverage of the target job’s distinctive terms.');
    if (!stuffing.stuffed) strengths.push('Writing does not look keyword-stuffed.');
    if (language.nonEnglish) strengths.push('Non-English content is scored without fake English-verb penalties.');
    return uniqueStrings(strengths).slice(0, 3);
}

function isPassiveStatus(text) {
    if (!text || typeof text !== 'string') return true;
    return /is in a healthy range|looks complete|looks healthy|is complete enough|is doing its job|is strong|looks good/i.test(text);
}

function buildImprovements(sections, jdMatch, stuffing, qualityScore) {
    if (!qualityScore) {
        return [{
            text: 'Start with your name, a professional email, and one real work story.',
            navigateTo: 'heading',
        }];
    }

    const ranked = [...sections]
        .map((section) => ({
            section,
            gap: section.maxScore - section.score,
            ratio: section.score / section.maxScore,
        }))
        .filter((item) => item.gap > 0 && !isPassiveStatus(item.section.action))
        .sort((left, right) => right.gap - left.gap || left.ratio - right.ratio);

    const actions = [];
    if (jdMatch && jdMatch.missing.length) {
        const prioritized = [...jdMatch.missing].sort((left, right) => right.length - left.length).slice(0, 3);
        actions.push({
            text: `Add ${Math.min(2, prioritized.length)} target-JD term${prioritized.length === 1 ? '' : 's'} you genuinely have (e.g. ${prioritized.join(', ')}).`,
            navigateTo: 'skills',
        });
    }
    if (stuffing.stuffed) {
        actions.push({
            text: 'Remove repeated keywords and keep each skill or metric in one natural sentence.',
            navigateTo: 'summary',
        });
    }
    for (const item of ranked) {
        if (actions.length >= 3) break;
        actions.push({ text: item.section.action, navigateTo: item.section.navigateTo });
    }
    return uniqueStrings(actions.map((item) => item.text)).slice(0, 3).map((text) => (
        actions.find((item) => item.text === text)
    ));
}

export function calculateAtsScore(data = {}, options = {}) {
    const jobDescription = options.jobDescription ?? data.targetJobDescription ?? '';
    const resumeText = collectResumePlain(data);
    const language = detectNonEnglish(`${stripHtml(data.summary)} ${resumeText}`);
    const stuffing = analyzeStuffing(resumeText);
    const skills = uniqueSkills(data.skills);
    const datedRoles = (data.employments || []).some((item) => stripHtml(item.begin || item.startDate || item.started));
    const hasNarrative = stripHtml(data.summary).length >= 60
        || (data.employments || []).some((item) => extractBullets(item.description).length > 0);

    const scored = {
        contact: scoreContact(data),
        summary: scoreSummary(data, analyzeStuffing(stripHtml(data.summary)), language),
        experience: scoreExperience(data, language),
        education: scoreEducation(data),
        skills: scoreSkills(data, stuffing),
        evidence: scoreEvidence(data),
        integrity: scoreIntegrity({ stuffing, skills: skills.length, datedRoles, hasNarrative, empty: !stripHtml(resumeText) }),
    };

    const sections = [
        { id: 'contact', name: 'Contact', ...scored.contact },
        { id: 'summary', name: 'Summary', ...scored.summary },
        { id: 'experience', name: 'Experience', ...scored.experience },
        { id: 'education', name: 'Education', ...scored.education },
        { id: 'skills', name: 'Skills', ...scored.skills },
        { id: 'evidence', name: 'Projects & proof', ...scored.evidence },
        { id: 'integrity', name: 'Integrity', ...scored.integrity },
    ].map((section) => ({
        ...section,
        tip: section.action,
        reason: section.findings.filter((item) => item.ok).map((item) => item.text).join(' ')
            || section.findings.map((item) => item.text).join(' '),
    }));

    const qualityScore = Math.max(0, Math.min(100, sections.reduce((sum, section) => sum + section.score, 0)));
    const jdMatch = jobDescription.trim()
        ? matchJobDescription(resumeText, jobDescription)
        : { score: null, matched: [], missing: [], groups: {}, total: 0 };

    const totalScore = composeDisplayedScore(qualityScore);

    const status = statusFor(totalScore);
    const informational = {
        languages: (data.languages || []).filter((item) => stripHtml(typeof item === 'string' ? item : item.name || item.language)).length,
        references: (data.references || []).filter((item) => stripHtml(item.name)).length,
        hobbies: Array.isArray(data.hobbies) ? data.hobbies.length : (data.hobbies ? 1 : 0),
    };

    return {
        totalScore,
        qualityScore,
        sections,
        status,
        strengths: buildStrengths(sections, jdMatch, stuffing, language),
        improvements: buildImprovements(sections, jdMatch, stuffing, qualityScore),
        jdMatch,
        stuffing,
        language,
        informational,
        weights: ATS_WEIGHTS,
        hasJobDescription: Boolean(jobDescription.trim()),
    };
}

export function readStoredJobDescription() {
    try {
        if (typeof sessionStorage === 'undefined') return '';
        return sessionStorage.getItem(JD_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

export function writeStoredJobDescription(value) {
    try {
        if (typeof sessionStorage === 'undefined') return;
        const text = String(value || '');
        if (text.trim()) sessionStorage.setItem(JD_STORAGE_KEY, text);
        else sessionStorage.removeItem(JD_STORAGE_KEY);
    } catch {
        /* private mode / SSR */
    }
}
