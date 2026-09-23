/**
 * Evidence-Based Candidate Context Engine (v2) — IME365
 *
 * Replaces the previous profession taxonomy with a single principle:
 * every piece of context shown to the candidate, used in an AI prompt, or
 * rendered as guidance is derived from the candidate's OWN verified data.
 *
 * There is intentionally NO profession registry, NO per-domain keyword list,
 * NO starter blueprints, and NO role-specific default content in this module.
 * A role the product has never seen before is handled exactly like any other:
 * the system reads the candidate's words and asks when it does not know.
 *
 * Exports:
 *   getCandidateContext(resumeData, targetJd) — the single context object
 *   detectGeographicRegion(resumeData)        — deterministic region detection
 *   extractTargetRoleFromJd(jdText)           — deterministic JD role parse
 *   estimateExperienceYears(employments)      — deterministic tenure math
 *   mineCandidateVocabulary(resumeData)       — content tokens from the
 *                                               candidate's own entries
 */

import { ACTION_VERBS } from './atsScore.js';

export const DOMAINS = Object.freeze({
    UNSPECIFIED: 'unspecified',
});

export const DOMAIN_REGISTRY = Object.freeze({});

function cleanText(val) {
    return String(val || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts action verbs present in candidate text or target JD,
 * or returns role-neutral strong verbs if candidate input is sparse.
 */
export function extractCandidateActionVerbs(resumeData = {}, targetJd = '') {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const rawEmployments = Array.isArray(data.employments) ? data.employments
        : (Array.isArray(data.workExperiences) ? data.workExperiences
        : (Array.isArray(data.workExperience) ? data.workExperience
        : (Array.isArray(data.experience) ? data.experience : [])));
    const raw = [
        data.summary,
        data.occupation,
        targetJd,
        ...rawEmployments.map(e => `${e?.jobTitle || e?.title || e?.role || ''} ${e?.description || e?.summary || ''}`),
        ...(Array.isArray(data.projects) ? data.projects.map(p => `${p?.title || ''} ${p?.description || ''}`) : []),
    ].join(' ').toLowerCase();

    const matched = [];
    const verbsPool = Array.isArray(ACTION_VERBS) ? ACTION_VERBS : [];
    for (const verb of verbsPool) {
        if (new RegExp(`\\b${verb}\\b`, 'i').test(raw)) {
            matched.push(verb.charAt(0).toUpperCase() + verb.slice(1));
        }
    }

    if (matched.length >= 3) {
        return matched.slice(0, 8);
    }

    const neutralFallbacks = ['Delivered', 'Implemented', 'Led', 'Coordinated', 'Optimized', 'Managed', 'Improved', 'Executed'];
    return [...new Set([...matched, ...neutralFallbacks])].slice(0, 6);
}

/**
 * Detects regional geographic context from candidate profile.
 * Deterministic, region-only — never used to suggest employers, schools, or content.
 */
export function detectGeographicRegion(resumeData = {}) {
    const raw = cleanText(`${resumeData.country || ''} ${resumeData.city || ''} ${resumeData.address || ''}`);
    if (/\b(india|bharat|in|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|pune|kolkata|ahmedabad|noida|gurugram)\b/i.test(raw)) {
        return 'IN';
    }
    if (/\b(united states|usa|us|u s a|new york|california|texas|boston|chicago|san francisco|seattle|miami|los angeles|washington)\b/i.test(raw)) {
        return 'US';
    }
    if (/\b(united kingdom|uk|u k|great britain|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow)\b/i.test(raw)) {
        return 'UK';
    }
    if (/\b(canada|ca|toronto|vancouver|montreal|ottawa|calgary|alberta|ontario)\b/i.test(raw)) {
        return 'CA';
    }
    if (/\b(australia|au|sydney|melbourne|brisbane|perth|adelaide)\b/i.test(raw)) {
        return 'AU';
    }
    if (/\b(germany|deutschland|france|spain|italy|netherlands|berlin|paris|madrid|rome|amsterdam)\b/i.test(raw)) {
        return 'EU';
    }
    return 'GLOBAL';
}

/**
 * Deterministically extracts a likely target role from job description text.
 * Used only as a convenience hint — the candidate always confirms.
 */
export function extractTargetRoleFromJd(jdText) {
    if (!jdText || typeof jdText !== 'string') return '';
    const clean = jdText.slice(0, 600);
    const patterns = [
        /(?:seeking|hiring|looking for|needs?|recruiting|appointing)\s+(?:an?|our next)\s+([^,.\n]{3,60}?)(?=\s+(?:to\b|who\b|responsible\b|reporting\b|with\b|in\b|at\b|[.\n,;]))/i,
        /(?:position|role|job title|title)\s*[:\-]\s*([^,.\n]{3,50})/i,
        /^#\s*([A-Za-z0-9&/\-\s]{3,50}?)(?:\s+position|\s+opening|\s+role)/im
    ];
    for (const pat of patterns) {
        const match = clean.match(pat);
        if (match && match[1]) {
            const candidate = match[1].trim().replace(/\s+/g, ' ');
            if (candidate.length >= 3 && candidate.length <= 50 && !/^(candidate|individual|someone|professional|person|team member)$/i.test(candidate)) {
                return candidate;
            }
        }
    }
    return '';
}

export function parseDateToMonths(str, isEnd = false, isCurrent = false) {
    if (!str && !isCurrent) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const raw = String(str || '').trim().toLowerCase();
    if (isCurrent || /\b(present|current|now|ongoing)\b/.test(raw)) {
        return currentYear * 12 + currentMonth;
    }

    const yearMatch = raw.match(/\b(19\d\d|20\d\d)\b/);
    if (!yearMatch) return null;
    const year = parseInt(yearMatch[1], 10);

    const monthMap = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
        may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
        oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
    };

    let month = isEnd ? 12 : 1;
    const isoMatch = raw.match(/\b(?:19\d\d|20\d\d)[-/](0?[1-9]|1[0-2])\b/);
    const slashMatch = raw.match(/\b(0?[1-9]|1[0-2])[-/](?:19\d\d|20\d\d)\b/);

    if (isoMatch) {
        month = parseInt(isoMatch[1], 10);
    } else if (slashMatch) {
        month = parseInt(slashMatch[1], 10);
    } else {
        for (const [key, val] of Object.entries(monthMap)) {
            if (raw.includes(key)) {
                month = val;
                break;
            }
        }
    }

    return year * 12 + month;
}

export function calculateDetailedExperience(employments = []) {
    if (!Array.isArray(employments) || employments.length === 0) {
        return {
            totalMonths: 0,
            years: 0,
            remainingMonths: 0,
            numericYears: 0,
            formattedTenure: '',
            exactText: '',
            careerStage: 'early_career',
            seniorityLevel: 'Emerging Professional'
        };
    }

    const intervals = [];
    let undatedRolesCount = 0;

    for (const emp of employments) {
        if (!emp || typeof emp !== 'object') continue;
        const startStr = emp.begin || emp.startDate || emp.start || emp.started || emp.startYear || '';
        const endStr = emp.end || emp.endDate || emp.finished || emp.endYear || '';
        const isCurrent = Boolean(emp.current || emp.isCurrent);

        const startMonths = parseDateToMonths(startStr, false, false);
        const endMonths = parseDateToMonths(endStr, true, isCurrent);

        if (startMonths !== null && endMonths !== null && endMonths >= startMonths) {
            intervals.push([startMonths, endMonths]);
        } else if (startMonths !== null) {
            intervals.push([startMonths, isCurrent ? (new Date().getFullYear() * 12 + new Date().getMonth() + 1) : (startMonths + 12)]);
        } else {
            undatedRolesCount++;
        }
    }

    let totalMonths = 0;
    if (intervals.length > 0) {
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [intervals[0]];
        for (let i = 1; i < intervals.length; i++) {
            const last = merged[merged.length - 1];
            const curr = intervals[i];
            if (curr[0] <= last[1]) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push(curr);
            }
        }
        for (const [start, end] of merged) {
            totalMonths += Math.max(1, end - start + 1);
        }
    } else if (undatedRolesCount > 0) {
        totalMonths = Math.min(240, undatedRolesCount * 24);
    }

    const numericYears = Math.min(40, Math.round((totalMonths / 12) * 10) / 10);
    const years = Math.floor(totalMonths / 12);
    const remainingMonths = totalMonths % 12;

    let formattedTenure = '';
    if (totalMonths === 0) {
        formattedTenure = '';
    } else if (totalMonths < 12) {
        formattedTenure = `${totalMonths} month${totalMonths === 1 ? '' : 's'}`;
    } else if (years >= 1 && remainingMonths === 0) {
        formattedTenure = `${years}+ years`;
    } else if (years >= 1) {
        formattedTenure = `${years}+ years`;
    }

    let exactText = '';
    if (totalMonths > 0) {
        if (totalMonths < 12) exactText = `${totalMonths} month${totalMonths === 1 ? '' : 's'}`;
        else if (remainingMonths === 0) exactText = `${years} year${years === 1 ? '' : 's'}`;
        else exactText = `${years} year${years === 1 ? '' : 's'} ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`;
    }

    let careerStage = 'mid_career';
    let seniorityLevel = 'Mid-Level Professional';
    if (numericYears < 1.5) {
        careerStage = 'early_career';
        seniorityLevel = 'Emerging Professional';
    } else if (numericYears < 5) {
        careerStage = 'mid_career';
        seniorityLevel = 'Mid-Level Professional';
    } else if (numericYears < 10) {
        careerStage = 'senior';
        seniorityLevel = 'Senior Professional / Lead';
    } else {
        careerStage = 'executive';
        seniorityLevel = 'Executive / Principal Leader';
    }

    return {
        totalMonths,
        years,
        remainingMonths,
        numericYears,
        formattedTenure,
        exactText,
        careerStage,
        seniorityLevel
    };
}

export function estimateExperienceYears(employments = []) {
    return calculateDetailedExperience(employments).numericYears;
}

const VOCABULARY_STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
    'under', 'again', 'further', 'once', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could',
    'can', 'may', 'might', 'must', 'shall', 'i', 'we', 'you', 'he', 'she', 'it', 'they', 'me',
    'him', 'her', 'us', 'them', 'my', 'our', 'your', 'his', 'its', 'their', 'this', 'that',
    'these', 'those', 'as', 'so', 'than', 'too', 'very', 'just', 'not', 'no', 'nor', 'only',
    'own', 'same', 'such', 'also', 'using', 'used', 'use', 'via', 'per', 'each', 'both', 'few',
    'more', 'most', 'other', 'some', 'any', 'am', 'responsible', 'responsibilities', 'working',
    'work', 'role', 'team', 'tasks', 'daily', 'new', 'including', 'include', 'includes',
    'various', 'strong', 'good', 'well', 'key', 'core', 'high', 'quality', 'full', 'part',
    'time', 'times', 'year', 'years', 'month', 'months', 'present', 'current', 'based',
]);

function textFromValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(textFromValue).join(' ');
    if (typeof value === 'object') {
        return textFromValue(value.skillName || value.name || value.title || value.degree ||
            value.school || value.language || value.description || value.reference ||
            value.jobTitle || value.employer || Object.values(value).join(' '));
    }
    return String(value);
}

/**
 * Mines content vocabulary from the candidate's own entries.
 * Deterministic. Powers duplicate detection, JD partial matching, and the
 * "what the candidate actually says" base for AI grounding previews.
 */
export function mineCandidateVocabulary(resumeData = {}) {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const rawEmployments = Array.isArray(data.employments) ? data.employments
        : (Array.isArray(data.workExperiences) ? data.workExperiences
        : (Array.isArray(data.workExperience) ? data.workExperience
        : (Array.isArray(data.experience) ? data.experience : [])));
    const rawEducations = Array.isArray(data.educations) ? data.educations
        : (Array.isArray(data.education) ? data.education : []);
    const raw = [
        data.summary,
        data.occupation,
        ...rawEmployments,
        ...rawEducations,
        ...(Array.isArray(data.projects) ? data.projects : []),
        ...(Array.isArray(data.achievements) ? data.achievements : []),
        ...(Array.isArray(data.skills) ? data.skills : (Array.isArray(data.existingSkills) ? data.existingSkills : [])),
        ...(Array.isArray(data.certifications) ? data.certifications : (Array.isArray(data.certificates) ? data.certificates : [])),
        ...(Array.isArray(data.customSections) ? data.customSections : []),
    ].map(textFromValue).join(' ');

    const seen = new Set();
    const out = [];
    const matches = String(raw)
        .replace(/<[^>]*>/g, ' ')
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .match(/[\p{L}\p{N}]+(?:[+#@.%/-][\p{L}\p{N}+#@.%/-]+)*/gu) || [];
    for (const token of matches) {
        const trimmed = token.replace(/^[.@%/-]+|[.@%/-]+$/g, '');
        if (trimmed.length < 2 || VOCABULARY_STOPWORDS.has(trimmed)) continue;
        if (!seen.has(trimmed)) {
            seen.add(trimmed);
            out.push(trimmed);
        }
    }
    return out;
}

function entryHasField(entry, ...fields) {
    if (!entry) return false;
    return fields.some(field => String(entry[field] || '').trim().length > 0);
}

function describeGaps(data = {}) {
    const gaps = {};

    // Heading
    const heading = [];
    if (!String(data.firstname || '').trim() || !String(data.lastname || '').trim()) {
        heading.push('Add your full name');
    }
    if (!/^\S+@\S+\.\S+$/.test(String(data.email || '').trim())) {
        heading.push('Add a professional email address');
    }
    if (!String(data.phone || '').trim()) {
        heading.push('Add a phone number');
    }
    if (!String(data.occupation || '').trim()) {
        heading.push('Add the job title you are targeting');
    }
    if (!String(data.city || '').trim() && !String(data.country || '').trim()) {
        heading.push('Add your city and country');
    }
    gaps.heading = heading;

    // Work history
    const workHistory = [];
    const employments = Array.isArray(data.employments) ? data.employments
        : (Array.isArray(data.workExperiences) ? data.workExperiences
        : (Array.isArray(data.workExperience) ? data.workExperience
        : (Array.isArray(data.experience) ? data.experience : [])));
    if (employments.length === 0) {
        workHistory.push('Add your most recent position');
    } else {
        for (let i = 0; i < employments.length; i += 1) {
            const emp = employments[i] || {};
            const label = String(emp.jobTitle || emp.title || emp.position || emp.employer || emp.company || '').trim() || `position ${i + 1}`;
            if (!String(emp.jobTitle || emp.title || emp.position || '').trim() && !String(emp.employer || emp.company || '').trim()) {
                workHistory.push(`Complete position ${i + 1} (title and organization)`);
            } else if (!String(emp.description || emp.summary || '').replace(/<[^>]*>/g, ' ').trim()) {
                workHistory.push(`Add what you did in “${label}”`);
            } else if (!String(emp.begin || emp.startDate || '').trim()) {
                workHistory.push(`Add start date for “${label}”`);
            }
            if (workHistory.length >= 3) break;
        }
    }
    gaps.workHistory = workHistory;

    // Education
    const education = [];
    const educations = Array.isArray(data.educations) ? data.educations
        : (Array.isArray(data.education) ? data.education : []);
    if (educations.length === 0) {
        education.push('Add your highest completed qualification');
    } else {
        const incomplete = educations.find(edu =>
            !String(edu?.degree || edu?.qualification || '').trim() || !String(edu?.school || edu?.institution || '').trim());
        if (incomplete) education.push('Complete the qualification and institution names');
    }
    gaps.education = education;

    // Skills
    const skills = Array.isArray(data.skills) ? data.skills : (Array.isArray(data.existingSkills) ? data.existingSkills : []);
    gaps.skills = skills.length === 0
        ? ['Add the skills you actually used in your work']
        : (skills.length < 4 ? ['Consider adding a few more core skills'] : []);

    // Projects (optional)
    gaps.projects = [];

    // Certifications (optional — only a soft nudge when the step is opened)
    gaps.certifications = [];

    // Languages (optional)
    gaps.languages = [];

    // Summary
    const summaryText = String(data.summary || '').replace(/<[^>]*>/g, ' ').trim();
    gaps.summary = summaryText.length === 0
        ? ['Write a short professional summary']
        : (summaryText.length < 80 ? ['Expand your summary to 2–4 sentences'] : []);

    // Achievements (optional)
    gaps.achievements = [];

    // References
    const references = Array.isArray(data.references) ? data.references : [];
    gaps.references = references.length === 0
        ? ['Set “available on request” or add a reference']
        : [];

    // Custom sections (optional)
    gaps.custom = [];

    return gaps;
}

function djb2Hash(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}

/**
 * The single candidate context object.
 * Everything downstream (placeholders, next-best-action, AI prompts, ATS display)
 * reads from this. Nothing here is profession-specific.
 */
export function getCandidateContext(resumeData = {}, targetJd = '') {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const region = detectGeographicRegion(data);

    const rawEmployments = Array.isArray(data.employments) ? data.employments
        : (Array.isArray(data.workExperiences) ? data.workExperiences
        : (Array.isArray(data.workExperience) ? data.workExperience
        : (Array.isArray(data.experience) ? data.experience : [])));
    const employments = rawEmployments.filter(e => e && typeof e === 'object');

    const rawEducations = Array.isArray(data.educations) ? data.educations
        : (Array.isArray(data.education) ? data.education : []);
    const educations = rawEducations.filter(e => e && typeof e === 'object');

    const rawSkills = Array.isArray(data.skills) ? data.skills
        : (Array.isArray(data.existingSkills) ? data.existingSkills : []);
    const skills = rawSkills.filter(s => s && (typeof s === 'string' || typeof s === 'object'));

    const rawCertifications = Array.isArray(data.certifications) ? data.certifications
        : (Array.isArray(data.certificates) ? data.certificates : []);
    const certifications = rawCertifications.filter(c => c && typeof c === 'object');

    const projects = (Array.isArray(data.projects) ? data.projects : []).filter(p => p && typeof p === 'object');
    const achievements = (Array.isArray(data.achievements) ? data.achievements : []).filter(a => a && typeof a === 'object');
    const languages = (Array.isArray(data.languages) ? data.languages : []).filter(l => l && (typeof l === 'string' || typeof l === 'object'));
    const references = (Array.isArray(data.references) ? data.references : []).filter(r => r && typeof r === 'object');

    // `data.title` is the resume document NAME (defaults to "Untitled Resume"), never the
    // candidate's role — it must not leak into the role context, or it contaminates the AI
    // evidence payload, profileHash, and job-title suggestions for resumes that have no
    // declared occupation yet.
    const rawOccupation = typeof data.occupation === 'string' ? data.occupation : '';
    const declaredTitle = rawOccupation.trim();
    const explicitTargetRole = (typeof data.targetRole === 'string' && data.targetRole.trim()) ? data.targetRole.trim() : (typeof data.targetTitle === 'string' && data.targetTitle.trim() ? data.targetTitle.trim() : '');
    const jdRole = extractTargetRoleFromJd(targetJd);
    const isGenericDeclared = /^(consultant|manager|director|specialist|professional|coordinator|associate|analyst|officer)$/i.test(declaredTitle);
    const targetRole = explicitTargetRole || ((!declaredTitle || isGenericDeclared) ? (jdRole || declaredTitle) : declaredTitle);
    const firstEmp = employments[0] || {};
    const currentRole = String(firstEmp.jobTitle || firstEmp.title || firstEmp.position || firstEmp.role || '').trim();
    const jd = String(targetJd || '').trim();
    const detailedTenure = calculateDetailedExperience(employments);
    const experienceYears = detailedTenure.numericYears;
    const formattedTenure = detailedTenure.formattedTenure;
    const summary = String(data.summary || '').replace(/<[^>]*>/g, ' ').trim();

    const gaps = describeGaps(data);
    const vocabulary = mineCandidateVocabulary(data);

    const profileHash = djb2Hash(JSON.stringify({
        role: targetRole,
        jd: jd ? jd.slice(0, 800) : '',
        roles: employments.map(e => `${e?.jobTitle || e?.title || ''}|${e?.employer || e?.company || ''}|${e?.begin || e?.startDate || ''}|${e?.end || e?.endDate || ''}`),
        edu: educations.map(e => `${e?.degree || e?.qualification || ''}|${e?.school || e?.institution || ''}`),
        skills: skills.map(s => (typeof s === 'string' ? s : s?.skillName || s?.name || '')).sort(),
        certs: certifications.map(c => c?.title || c?.name || '').sort(),
        projects: projects.map(p => p?.title || p?.name || '').sort(),
        summary: summary.slice(0, 400),
    }));

    return {
        // KNOWN facts — exactly what the candidate provided, normalized.
        facts: {
            name: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
            headline: targetRole || currentRole || declaredTitle,
            location: [data.city, data.country].filter(Boolean).join(', '),
            roles: employments.map((e) => ({
                title: String(e.jobTitle || e.title || e.position || e.role || '').trim(),
                employer: String(e.employer || e.company || e.organization || e.companyName || '').trim(),
                city: String(e.city || e.location || '').trim(),
                begin: String(e.begin || e.startDate || e.from || '').trim(),
                end: String(e.end || e.endDate || e.to || '').trim(),
                current: Boolean(e.current || e.isCurrent),
                description: String(e.description || e.summary || e.notes || '').replace(/<[^>]*>/g, ' ').trim(),
            })),
            education: educations.map((e) => ({
                degree: String(e.degree || e.qualification || e.degreeType || e.fieldOfStudy || '').trim(),
                school: String(e.school || e.institution || e.university || e.college || '').trim(),
                city: String(e.city || e.location || '').trim(),
                started: String(e.started || e.startDate || e.begin || '').trim(),
                finished: String(e.finished || e.endDate || e.end || '').trim(),
                description: String(e.description || e.notes || '').replace(/<[^>]*>/g, ' ').trim(),
            })),
            skills: skills.map((s) => (typeof s === 'string' ? s.trim() : String(s.skillName || s.name || '').trim())).filter(Boolean),
            certifications: certifications.map((c) => ({
                title: String(c.title || c.name || '').trim(),
                issuer: String(c.issuer || c.organization || c.authority || '').trim(),
                date: String(c.date || c.issueDate || '').trim(),
                category: String(c.category || '').trim(),
            })),
            projects: projects.map((p) => ({
                title: String(p.title || p.name || '').trim(),
                description: String(p.description || '').replace(/<[^>]*>/g, ' ').trim(),
                url: String(p.url || p.link || '').trim(),
            })),
            achievements: achievements.map((a) => ({
                title: String(a.title || a.name || '').trim(),
                description: String(a.description || '').replace(/<[^>]*>/g, ' ').trim(),
            })),
            languages: languages.map((l) => ({
                name: String(typeof l === 'string' ? l : (l.language || l.name || '')).trim(),
                level: String(typeof l === 'string' ? '' : (l.level || l.proficiency || '')).trim(),
            })),
            referencesCount: references.length,
            customSections: (Array.isArray(data.customSections) ? data.customSections : []).map(s => s.title || '').filter(Boolean),
            summary,
            experienceYears,
            experience: formattedTenure,
            careerStage: detailedTenure.careerStage,
            seniorityLevel: detailedTenure.seniorityLevel,
            hasTargetJd: jd.length > 20,
        },

        // Vocabulary the candidate actually used (deterministic).
        vocabulary,

        // Deterministic geographic market.
        region,

        // Target role + JD (deterministic parse; semantics left to the candidate and AI).
        target: {
            role: targetRole,
            jd,
            jdRole,
        },

        // What's missing / incomplete, per section (deterministic).
        gaps,

        // Cheap identity for AI request caching.
        profileHash,

        // Legacy-friendly aliases (kept so older call sites don't crash;
        // intentionally empty of any profession content).
        isUnknownRole: !targetRole,
        isNicheRole: false,
        domain: 'unspecified',
        domainLabel: targetRole || currentRole || 'Your profession',
        profession: targetRole || currentRole || '',
        currentTitle: currentRole,
        targetTitle: targetRole,
        industry: '',
        specialization: '',
        seniority: experienceYears < 1.5 ? 'entry' : (experienceYears >= 10 ? 'executive' : (experienceYears >= 5 ? 'senior' : 'mid')),
        careerStage: experienceYears < 1.5 ? 'early_career' : (experienceYears >= 10 ? 'executive_leadership' : 'mid_career'),
        experienceYears,
        geography: {
            region,
            city: data.city || '',
            country: data.country || '',
            display: [data.city, data.country].filter(Boolean).join(', ') || 'Global',
        },
        actionVerbs: extractCandidateActionVerbs(data, targetJd),
        starterBlueprints: null,
        skillCategories: [],
        domainData: null,
        atsAdvice: null,
    };
}
