export const DEFAULT_SECTION_ORDER = Object.freeze(['heading', 'employment', 'education', 'skills', 'projects', 'certifications', 'languages', 'summary', 'achievements', 'hobbies', 'references', 'custom']);

export const EMPTY_RESUME = Object.freeze({
    title: 'Untitled Resume', template: 'Cv1', firstname: '', lastname: '', email: '', phone: '', occupation: '',
    targetRole: '', targetJobDescription: '',
    country: '', city: '', address: '', postalcode: '', website: '', linkedin: '', github: '', photo: null, showPhoto: true, summary: '',
    employments: [], educations: [], skills: [], languages: [], hobbies: [], projects: [], certifications: [], achievements: [], references: [], customSections: [],
    sectionOrder: DEFAULT_SECTION_ORDER, hiddenSections: [], completedSteps: [],
});

const blockedKeys = new Set(['ownerUid', 'userId', 'revision', 'createdAt', 'created_at', 'updatedAt', 'lastSavedAt', 'isPublished']);
const clone = value => {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch { return {}; }
};
const array = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const text = value => value == null ? '' : String(value);

function normalizeCustomItems(section, sectionIndex) {
    const rawItems = Array.isArray(section?.items) ? section.items : [];
    const items = rawItems.map((item, index) => {
        if (typeof item === 'string') {
            const title = text(item);
            return title ? { id: `custom-${sectionIndex}-item-${index}`, title, description: '' } : null;
        }
        if (!item || typeof item !== 'object') return null;
        return {
            ...item,
            id: item.id || `custom-${sectionIndex}-item-${index}`,
            title: text(item.title || item.name),
            description: text(item.description || item.content),
        };
    }).filter(Boolean);
    const content = text(section?.content);
    if (!items.length && content) {
        items.push({ id: `custom-${sectionIndex}-body`, title: '', description: content });
    }
    return items;
}

export function normalizeResumeData(input = {}, { template = 'Cv1' } = {}) {
    const source = input?.data && typeof input.data === 'object' ? input.data : input?.item && typeof input.item === 'object' ? { ...input.item, ...input } : input;
    const raw = source && typeof source === 'object' ? clone(source) : {};
    for (const key of blockedKeys) delete raw[key];
    delete raw.item;
    delete raw.data;

    const employments = array(raw.employments || raw.experience || raw.workExperience).map((item, index) => ({
        ...item,
        id: item.id || item.employmentId || `employment-${index}`,
        jobTitle: text(item.jobTitle || item.title || item.position),
        employer: text(item.employer || item.company || item.organization),
        begin: text(item.begin || item.startDate || item.started),
        end: text(item.end || item.endDate || item.finished),
        description: text(item.description || item.summary),
        date: Number(item.date) || index + 1,
    }));
    const educations = array(raw.educations || raw.education).map((item, index) => ({
        ...item,
        id: item.id || item.educationId || `education-${index}`,
        school: text(item.school || item.institution || item.university),
        degree: text(item.degree || item.qualification || item.area),
        started: text(item.started || item.startDate || item.begin),
        finished: text(item.finished || item.endDate || item.end),
        description: text(item.description || item.summary),
        date: Number(item.date) || index + 1,
    }));
    const skills = array(raw.skills).map((item, index) => {
        const name = text(item.skillName || item.name || item.skill || item.title);
        const hasRating = item.rating !== null && item.rating !== undefined && item.rating !== '' && Number.isFinite(Number(item.rating));
        return { ...item, id: item.id || `skill-${index}`, name, skillName: name, rating: hasRating ? Number(item.rating) : null, date: Number(item.date) || index + 1 };
    });
    const languages = array(raw.languages).map((item, index) => {
        const name = text(item.name || item.language);
        return { ...item, id: item.id || `language-${index}`, name, language: name, level: text(item.level || item.proficiency), date: Number(item.date) || index + 1 };
    });
    const rawOrder = Array.isArray(raw.sectionOrder) && raw.sectionOrder.length ? raw.sectionOrder : DEFAULT_SECTION_ORDER;
    let sectionOrder = [...new Set(rawOrder.map(text).filter(Boolean))];
    const sumIdx = sectionOrder.indexOf('summary');
    const langIdx = sectionOrder.indexOf('languages');
    const empIdx = sectionOrder.indexOf('employment') !== -1 ? sectionOrder.indexOf('employment') : sectionOrder.indexOf('work-history');
    if (sumIdx !== -1 && (empIdx !== -1 && sumIdx < empIdx || langIdx !== -1 && sumIdx < langIdx)) {
        sectionOrder = sectionOrder.filter(key => key !== 'summary');
        const targetLangIdx = sectionOrder.indexOf('languages');
        if (targetLangIdx !== -1) {
            sectionOrder.splice(targetLangIdx + 1, 0, 'summary');
        } else {
            sectionOrder.push('summary');
        }
    }
    const hiddenSections = [...new Set((Array.isArray(raw.hiddenSections) ? raw.hiddenSections : []).map(text).filter(Boolean))];

    return {
        ...clone(EMPTY_RESUME),
        ...raw,
        title: text(raw.title || raw.resumeTitle || EMPTY_RESUME.title).slice(0, 160),
        template: /^Cv(?:[1-9]|[1-4][0-9]|5[0-1])$/.test(raw.template) ? raw.template : template,
        firstname: text(raw.firstname || raw.firstName), lastname: text(raw.lastname || raw.lastName),
        email: text(raw.email), phone: text(raw.phone), occupation: text(raw.occupation || raw.jobTitle),
        targetRole: text(raw.targetRole || raw.targetTitle),
        targetJobDescription: text(raw.targetJobDescription || raw.targetJd || raw.jobDescription),
        country: text(raw.country), city: text(raw.city), address: text(raw.address), postalcode: text(raw.postalcode || raw.postalCode),
        website: text(raw.website || raw.websiteUrl), linkedin: text(raw.linkedin || raw.linkedinUrl), github: text(raw.github || raw.githubUrl),
        photo: typeof raw.photo === 'string' && raw.photo.trim() ? raw.photo : null,
        showPhoto: raw.showPhoto !== undefined ? Boolean(raw.showPhoto) : (raw.hidePhoto !== undefined ? !raw.hidePhoto : true),
        summary: text(raw.summary || raw.professionalSummary),
        employments, educations, skills, languages,
        hobbies: Array.isArray(raw.hobbies) ? raw.hobbies : (raw.hobbies ? (typeof raw.hobbies === 'string' ? raw.hobbies : [raw.hobbies]) : []),
        projects: array(raw.projects), certifications: array(raw.certifications),
        achievements: array(raw.achievements || raw.awards).map((item, index) => ({
            ...item,
            id: item.id || `achievement-${index}`,
            title: text(item.title || item.name),
            description: text(item.description || item.summary),
        })),
        references: array(raw.references).map((item, index) => ({
            ...item,
            id: item.id || `reference-${index}`,
            name: text(item.name || item.title),
            reference: text(item.reference || item.description || item.content),
        })),
        customSections: array(raw.customSections).map((section, index) => ({
            ...section,
            id: section.id || `custom-${index}`,
            title: text(section.title).slice(0, 100),
            visible: section.visible !== false,
            content: text(section.content),
            items: normalizeCustomItems(section, index),
        })),
        sectionOrder, hiddenSections,
        completedSteps: Array.isArray(raw.completedSteps) ? [...new Set(raw.completedSteps.map(Number).filter(Number.isFinite))] : [],
        colors: raw.colors && typeof raw.colors === 'object' ? { ...raw.colors } : null,
    };
}

/**
 * Canonical resume document for persistence: normalized data + template id,
 * with presentation-only state (template palette) excluded. The preview layer
 * re-derives colors from template selection, so switching templates can never
 * destroy or stale user data.
 */
export function buildCanonicalResumeDocument(input = {}, template = 'Cv1') {
    const snapshot = normalizeResumeData({ ...(input && typeof input === 'object' ? input : {}), template });
    delete snapshot.colors;
    return snapshot;
}

export function moveResumeItem(items, id, direction) {
    const list = Array.isArray(items) ? items : [];
    const index = list.findIndex(item => item?.id === id || item?.date === id);
    const target = index + Number(direction);
    if (index < 0 || target < 0 || target >= list.length) return list;
    const reordered = list.map(item => ({ ...item }));
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered.map((item, order) => ({ ...item, date: order + 1 }));
}

export function duplicateResumeItem(items, id, patch = {}) {
    const list = Array.isArray(items) ? items : [];
    const index = list.findIndex(item => item?.id === id || item?.date === id);
    if (index < 0) return list;
    const copy = { ...clone(list[index]), ...patch, id: `${list[index].id || id}-copy-${Date.now()}` };
    return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)].map((item, order) => ({ ...item, date: order + 1 }));
}

export function resumeHasMeaningfulData(input) {
    const resume = normalizeResumeData(input);
    return Boolean([resume.firstname, resume.lastname, resume.email, resume.phone, resume.occupation, resume.summary]
        .some(value => String(value || '').trim()) || ['employments', 'educations', 'skills', 'languages', 'projects', 'certifications', 'achievements', 'references', 'customSections']
        .some(key => resume[key]?.length));
}

export function createResumeRecoveryEnvelope({ userId, resumeId, revision = 0, data }) {
    if (!userId || !resumeId) throw new Error('Recovery data requires an account and resume');
    return { version: 1, userId, resumeId, revision: Number(revision) || 0, savedAt: Date.now(), data: normalizeResumeData(data) };
}

export function readResumeRecoveryEnvelope(value, { userId, resumeId, maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    try {
        const envelope = typeof value === 'string' ? JSON.parse(value) : value;
        if (envelope?.version !== 1 || envelope.userId !== userId || envelope.resumeId !== resumeId || Date.now() - Number(envelope.savedAt) > maxAgeMs) return null;
        return { ...envelope, data: normalizeResumeData(envelope.data) };
    } catch { return null; }
}

/**
 * Dynamic Experience Calculator: Merges overlapping work history date intervals into exact total experience span
 */
export function calculateYearsOfExperience(experiences) {
    if (!experiences || !Array.isArray(experiences) || experiences.length === 0) return '';

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const monthMap = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    const intervals = [];

    experiences.forEach((exp) => {
        if (!exp) return;
        const startStr = String(exp.startDate || exp.begin || exp.startYear || exp.start || exp.started || '').trim();
        const endStr = String(exp.endDate || exp.end || exp.endYear || exp.finished || (exp.current ? 'Present' : '') || '').trim();

        const startYearMatch = startStr.match(/\b(19\d\d|20\d\d)\b/);
        const endYearMatch = endStr.match(/\b(19\d\d|20\d\d)\b/);
        if (!startYearMatch) return;

        const startYear = parseInt(startYearMatch[1], 10);
        const explicitlyCurrent = Boolean(exp.current || endStr.toLowerCase().includes('present'));
        if (!endYearMatch && !explicitlyCurrent) return;
        let endYear = endYearMatch ? parseInt(endYearMatch[1], 10) : currentYear;
        if (explicitlyCurrent) endYear = currentYear;

        let startMonth = 1;
        let endMonth = 12;

        const startLower = startStr.toLowerCase();
        for (const [key, val] of Object.entries(monthMap)) {
            if (startLower.includes(key)) {
                startMonth = val;
                break;
            }
        }

        const endLower = endStr.toLowerCase();
        if (explicitlyCurrent) {
            endMonth = currentMonth;
        } else {
            for (const [key, val] of Object.entries(monthMap)) {
                if (endLower.includes(key)) {
                    endMonth = val;
                    break;
                }
            }
        }

        const startTotalMonths = startYear * 12 + startMonth;
        const endTotalMonths = endYear * 12 + endMonth;

        if (endTotalMonths >= startTotalMonths) {
            intervals.push([startTotalMonths, endTotalMonths]);
        }
    });

    if (intervals.length === 0) return '';

    // Sort by start month
    intervals.sort((a, b) => a[0] - b[0]);

    // Merge overlapping intervals
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

    // Sum non-overlapping months
    let totalMonths = 0;
    merged.forEach(([start, end]) => {
        totalMonths += Math.max(1, end - start + 1);
    });

    if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? '' : 's'}`;
    const years = Math.floor(totalMonths / 12);
    const remainingMonths = totalMonths % 12;
    return remainingMonths
        ? `${years} year${years === 1 ? '' : 's'} ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`
        : `${years} year${years === 1 ? '' : 's'}`;
}

