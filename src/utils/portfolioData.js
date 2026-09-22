import { normalizeResumeData, resumeHasMeaningfulData } from './resumeData.js';
import { sanitizePortfolioImageUrl, sanitizePortfolioText, sanitizePortfolioUrl } from '../components/PortfolioBuilder/portfolioSanitization.js';

export const PORTFOLIO_TEMPLATE_IDS = Object.freeze(['modernMinimal', 'executive', 'creativeDark', 'premiumTech']);
export const DEFAULT_PORTFOLIO_TEMPLATE = 'modernMinimal';
export const PORTFOLIO_RENDERER = 'webcv';
export const PORTFOLIO_DATA_VERSION = 1;

export const PORTFOLIO_TEMPLATES = Object.freeze({
    modernMinimal: {
        id: 'modernMinimal',
        name: 'Modern Minimal',
        mood: 'light',
        theme: 'minimal',
        description: 'A quiet, premium light layout with generous space and crisp type.',
    },
    executive: {
        id: 'executive',
        name: 'Executive',
        mood: 'light',
        theme: 'professional',
        description: 'Editorial corporate composition with a strong profile header and timeline.',
    },
    creativeDark: {
        id: 'creativeDark',
        name: 'Creative Dark',
        mood: 'dark',
        theme: 'creative',
        description: 'Warm dark canvas with asymmetric storytelling and image-forward projects.',
    },
    premiumTech: {
        id: 'premiumTech',
        name: 'Premium Tech',
        mood: 'dark',
        theme: 'dark',
        description: 'Dark SaaS aesthetic with glass depth, technical skills, and product-style projects.',
    },
});

const LEGACY_TEMPLATE_MAP = Object.freeze({
    darkCyber: 'premiumTech',
    darkTerminal: 'premiumTech',
    artist: 'creativeDark',
    darkCyberSec: 'premiumTech',
    terminal: 'premiumTech',
    cyberSecurity: 'premiumTech',
    default: 'modernMinimal',
    minimal: 'modernMinimal',
    professional: 'executive',
    creative: 'creativeDark',
    dark: 'premiumTech',
});

const PLACEHOLDER_PERSONAS = [
    'alex cyber',
    'sofia martinez',
    'dev@terminal',
    'alex@cyber.dev',
    'artist@example.com',
];

const clone = (value) => {
    try {
        return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
    } catch {
        return {};
    }
};

const text = (value) => (value == null ? '' : String(value).trim());
const finiteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

function uniqueId(prefix, index, existing) {
    const candidate = text(existing);
    return candidate || `${prefix}-${index}`;
}

function normalizeHobbyList(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === 'string' ? text(item) : text(item?.name || item?.title || item?.hobby)))
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,|\n]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeTechList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => text(typeof item === 'string' ? item : item?.name || item?.title)).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,|]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

export function resolvePortfolioTemplate(input) {
    const raw = text(input);
    if (PORTFOLIO_TEMPLATE_IDS.includes(raw)) return raw;
    return LEGACY_TEMPLATE_MAP[raw] || DEFAULT_PORTFOLIO_TEMPLATE;
}

export function emptyCanonicalPortfolio(overrides = {}) {
    return {
        version: PORTFOLIO_DATA_VERSION,
        template: resolvePortfolioTemplate(overrides.template),
        heading: {
            firstname: '',
            lastname: '',
            fullName: '',
            occupation: '',
            email: '',
            phone: '',
            city: '',
            country: '',
            address: '',
            postalcode: '',
            website: '',
            linkedin: '',
            github: '',
            photo: '',
        },
        summary: '',
        experiences: [],
        education: [],
        skills: [],
        projects: [],
        certifications: [],
        achievements: [],
        references: [],
        languages: [],
        hobbies: [],
        customSections: [],
        extras: {
            tagline: '',
            heroImage: '',
            seoTitle: '',
            seoDescription: '',
        },
        source: {
            resumeId: null,
            resumeTitle: '',
            ingestedAt: null,
        },
        ...overrides,
    };
}

function normalizeHeading(input = {}) {
    const firstname = text(input.firstname || input.firstName);
    const lastname = text(input.lastname || input.lastName);
    const composed = [firstname, lastname].filter(Boolean).join(' ');
    return {
        firstname,
        lastname,
        fullName: text(input.fullName || input.name || composed),
        occupation: text(input.occupation || input.jobTitle || input.title),
        email: text(input.email),
        phone: text(input.phone),
        city: text(input.city),
        country: text(input.country),
        address: text(input.address),
        postalcode: text(input.postalcode || input.postalCode),
        website: text(input.website || input.websiteUrl),
        linkedin: text(input.linkedin || input.linkedinUrl),
        github: text(input.github || input.githubUrl),
        photo: typeof input.photo === 'string' ? input.photo : '',
    };
}

function normalizeExperience(item = {}, index = 0) {
    return {
        id: uniqueId('experience', index, item.id || item.employmentId),
        jobTitle: text(item.jobTitle || item.position || item.role || item.title),
        employer: text(item.employer || item.company || item.organization || item.venue),
        begin: text(item.begin || item.startDate || item.started || item.from),
        end: text(item.end || item.endDate || item.finished || item.to),
        description: text(item.description || item.summary || item.content),
        date: finiteNumber(item.date, index + 1),
        location: text(item.location || item.city),
    };
}

function normalizeEducation(item = {}, index = 0) {
    return {
        id: uniqueId('education', index, item.id || item.educationId),
        school: text(item.school || item.institution || item.university || item.college),
        degree: text(item.degree || item.qualification || item.area || item.title),
        started: text(item.started || item.startDate || item.begin || item.from),
        finished: text(item.finished || item.endDate || item.end || item.to),
        description: text(item.description || item.summary),
        date: finiteNumber(item.date, index + 1),
    };
}

function normalizeSkill(item = {}, index = 0) {
    const name = text(typeof item === 'string' ? item : item.skillName || item.name || item.skill || item.title);
    return {
        id: uniqueId('skill', index, item?.id),
        name,
        skillName: name,
        rating: finiteNumber(item?.rating, 50),
        category: text(item?.category || item?.group),
    };
}

function normalizeProject(item = {}, index = 0) {
    const technologies = normalizeTechList(item.technologies || item.tech || item.stack || item.skills);
    return {
        id: uniqueId('project', index, item.id),
        title: text(item.title || item.name),
        description: text(item.description || item.summary || item.content),
        link: text(item.link || item.url || item.website || item.href),
        technologies: technologies.join(', '),
        technologyList: technologies,
        image: text(item.image || item.preview || item.thumbnail),
    };
}

function normalizeCertification(item = {}, index = 0) {
    return {
        id: uniqueId('certification', index, item.id),
        title: text(item.title || item.name),
        issuer: text(item.issuer || item.organization || item.authority),
        date: text(item.date || item.year || item.issued),
        description: text(item.description || item.summary),
        link: text(item.link || item.url || item.credentialUrl || item.certificateUrl),
    };
}

function normalizeAchievement(item = {}, index = 0) {
    return {
        id: uniqueId('achievement', index, item.id),
        title: text(item.title || item.name),
        description: text(item.description || item.summary || item.content),
    };
}

function normalizeReference(item = {}, index = 0) {
    return {
        id: uniqueId('reference', index, item.id),
        name: text(item.name || item.title),
        reference: text(item.reference || item.description || item.content || item.quote),
    };
}

function normalizeLanguage(item = {}, index = 0) {
    const name = text(typeof item === 'string' ? item : item.name || item.language);
    return {
        id: uniqueId('language', index, item?.id),
        name,
        level: text(item?.level || item?.proficiency),
    };
}

function normalizeCustomSection(section = {}, index = 0) {
    const rawItems = Array.isArray(section.items) ? section.items : [];
    const items = rawItems
        .map((item, itemIndex) => {
            if (typeof item === 'string') {
                const title = text(item);
                return title ? { id: `custom-${index}-item-${itemIndex}`, title, description: '' } : null;
            }
            if (!item || typeof item !== 'object') return null;
            const title = text(item.title || item.name);
            const description = text(item.description || item.content);
            if (!title && !description) return null;
            return {
                id: uniqueId(`custom-${index}-item`, itemIndex, item.id),
                title,
                description,
            };
        })
        .filter(Boolean);
    const content = text(section.content);
    if (!items.length && content) {
        items.push({ id: `custom-${index}-body`, title: '', description: content });
    }
    return {
        id: uniqueId('custom', index, section.id),
        title: text(section.title).slice(0, 100),
        items,
        content,
    };
}

export function normalizePortfolioData(input = {}, { template } = {}) {
    const source = input?.canonical && typeof input.canonical === 'object'
        ? input.canonical
        : input?.data?.canonical && typeof input.data.canonical === 'object'
            ? input.data.canonical
            : input;
    const raw = source && typeof source === 'object' ? clone(source) : {};
    const heading = normalizeHeading(raw.heading || raw);
    const experiences = (Array.isArray(raw.experiences) ? raw.experiences : Array.isArray(raw.experience) ? raw.experience : Array.isArray(raw.employments) ? raw.employments : [])
        .filter((item) => item && typeof item === 'object')
        .map(normalizeExperience);
    const education = (Array.isArray(raw.education) ? raw.education : Array.isArray(raw.educations) ? raw.educations : [])
        .filter((item) => item && typeof item === 'object')
        .map(normalizeEducation);
    const skills = (Array.isArray(raw.skills) ? raw.skills : []).map(normalizeSkill).filter((item) => item.name);
    const projects = (Array.isArray(raw.projects) ? raw.projects : []).filter((item) => item && typeof item === 'object').map(normalizeProject);
    const certifications = (Array.isArray(raw.certifications) ? raw.certifications : []).filter((item) => item && typeof item === 'object').map(normalizeCertification);
    const achievements = (Array.isArray(raw.achievements) ? raw.achievements : Array.isArray(raw.awards) ? raw.awards : [])
        .filter((item) => item && typeof item === 'object')
        .map(normalizeAchievement);
    const references = (Array.isArray(raw.references) ? raw.references : []).filter((item) => item && typeof item === 'object').map(normalizeReference);
    const languages = (Array.isArray(raw.languages) ? raw.languages : []).map(normalizeLanguage).filter((item) => item.name);
    const customSections = (Array.isArray(raw.customSections) ? raw.customSections : []).filter((item) => item && typeof item === 'object').map(normalizeCustomSection);
    const extras = raw.extras && typeof raw.extras === 'object' ? raw.extras : {};
    const sourceMeta = raw.source && typeof raw.source === 'object' ? raw.source : {};

    return {
        version: PORTFOLIO_DATA_VERSION,
        template: resolvePortfolioTemplate(template || raw.template || input.templateKey || input.template),
        heading,
        summary: text(raw.summary || raw.about || raw.professionalSummary),
        experiences,
        education,
        skills,
        projects,
        certifications,
        achievements,
        references,
        languages,
        hobbies: normalizeHobbyList(raw.hobbies),
        customSections,
        extras: {
            tagline: text(extras.tagline || raw.tagline),
            heroImage: text(extras.heroImage || raw.heroImage),
            seoTitle: text(extras.seoTitle),
            seoDescription: text(extras.seoDescription),
        },
        source: {
            resumeId: sourceMeta.resumeId || null,
            resumeTitle: text(sourceMeta.resumeTitle),
            ingestedAt: sourceMeta.ingestedAt || null,
        },
    };
}

export function convertResumeToPortfolio(resumeInput = {}, { template, resumeId } = {}) {
    const resume = normalizeResumeData(resumeInput);
    const heading = normalizeHeading({
        firstname: resume.firstname,
        lastname: resume.lastname,
        occupation: resume.occupation,
        email: resume.email,
        phone: resume.phone,
        city: resume.city,
        country: resume.country,
        address: resume.address,
        postalcode: resume.postalcode,
        website: resume.website,
        linkedin: resume.linkedin,
        github: resume.github,
        photo: resume.photo,
    });
    return normalizePortfolioData({
        template: resolvePortfolioTemplate(template),
        heading,
        summary: resume.summary,
        experiences: resume.employments,
        education: resume.educations,
        skills: resume.skills,
        projects: resume.projects,
        certifications: resume.certifications,
        achievements: resume.achievements,
        references: resume.references,
        languages: resume.languages,
        hobbies: resume.hobbies,
        customSections: resume.customSections,
        extras: {
            tagline: heading.occupation,
            seoTitle: heading.fullName ? `${heading.fullName} — Web CV` : resume.title || 'Web CV',
            seoDescription: text(resume.summary).slice(0, 240),
        },
        source: {
            resumeId: resumeId || null,
            resumeTitle: resume.title || '',
            ingestedAt: new Date().toISOString(),
        },
    });
}

export function extractCanonicalFromPuck(puckData = {}) {
    const content = Array.isArray(puckData?.content) ? puckData.content : Array.isArray(puckData) ? puckData : [];
    const byType = (type) => content.filter((item) => item?.type === type).map((item) => item.props || {});
    const hero = byType('Hero')[0] || {};
    const about = byType('About')[0] || {};
    const skills = byType('Skills').flatMap((props) => (Array.isArray(props.skills) ? props.skills : []));
    const experience = byType('Experience').flatMap((props) => (Array.isArray(props.experiences || props.experience) ? (props.experiences || props.experience) : []));
    const education = byType('Education').flatMap((props) => (Array.isArray(props.education || props.educations) ? (props.education || props.educations) : []));
    const projects = byType('Projects').flatMap((props) => (Array.isArray(props.projects) ? props.projects : []));
    const awards = byType('Awards').flatMap((props) => (Array.isArray(props.awards) ? props.awards : []));
    const contact = byType('Contact')[0] || {};
    const nameParts = text(hero.name || '').split(/\s+/);
    return normalizePortfolioData({
        heading: {
            firstname: nameParts[0] || '',
            lastname: nameParts.slice(1).join(' '),
            fullName: hero.name || '',
            occupation: hero.title || '',
            email: hero.email || contact.email || '',
            phone: hero.phone || contact.phone || '',
            city: hero.location || contact.location || '',
            website: hero.website || '',
            linkedin: hero.linkedin || '',
            github: hero.github || '',
            photo: hero.image || hero.avatar || '',
        },
        summary: about.content || about.description || hero.description || '',
        experiences: experience,
        education,
        skills,
        projects,
        achievements: awards,
        extras: { tagline: hero.title || '' },
    });
}

export function isLikelyPlaceholderPersona(canonicalInput) {
    const canonical = normalizePortfolioData(canonicalInput);
    const haystack = [
        canonical.heading.fullName,
        canonical.heading.email,
        canonical.heading.firstname,
        canonical.heading.lastname,
    ]
        .join(' ')
        .toLowerCase();
    return PLACEHOLDER_PERSONAS.some((persona) => haystack.includes(persona));
}

export function computeResumeCompleteness(resumeInput = {}) {
    const resume = normalizeResumeData(resumeInput);
    const checks = {
        heading: Boolean(resume.firstname || resume.lastname || resume.email || resume.occupation),
        summary: Boolean(text(resume.summary)),
        experience: resume.employments.length > 0,
        education: resume.educations.length > 0,
        skills: resume.skills.length > 0,
        projects: resume.projects.length > 0,
        extras: Boolean(resume.certifications.length || resume.achievements.length || resume.references.length || resume.languages.length || resume.customSections.length),
    };
    const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    return { score, checks, hasData: resumeHasMeaningfulData(resume) };
}

export function portfolioHasContent(input = {}) {
    const data = normalizePortfolioData(input);
    return Boolean(
        data.heading.fullName ||
        data.heading.email ||
        data.heading.occupation ||
        data.summary ||
        data.experiences.length ||
        data.education.length ||
        data.skills.length ||
        data.projects.length ||
        data.certifications.length ||
        data.achievements.length ||
        data.references.length ||
        data.languages.length ||
        data.hobbies.length ||
        data.customSections.length
    );
}

function sanitizeStringTree(value, key = '', depth = 0) {
    if (depth > 8) return null;
    if (typeof value === 'string') {
        if (/(image|avatar|photo|logo|thumbnail|preview)$/i.test(key)) return sanitizePortfolioImageUrl(value);
        if (/(url|uri|href|link|website|github|linkedin|twitter)$/i.test(key)) {
            const cleaned = sanitizePortfolioUrl(value);
            return cleaned === '#' ? '' : cleaned;
        }
        return sanitizePortfolioText(value);
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 200).map((item, index) => sanitizeStringTree(item, key || String(index), depth + 1));
    if (!value || typeof value !== 'object') return null;
    const next = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 200)) {
        if (childKey === '__proto__' || childKey === 'constructor' || childKey === 'prototype') continue;
        next[childKey] = sanitizeStringTree(childValue, childKey, depth + 1);
    }
    return next;
}

export function sanitizeCanonicalPortfolio(input = {}, { template } = {}) {
    return sanitizeStringTree(normalizePortfolioData(input, { template }), 'canonical');
}

export function buildPortfolioDocument({ canonical, template, title, description, tags, seoTitle, seoDescription } = {}) {
    const normalized = sanitizeCanonicalPortfolio(canonical, { template });
    const templateKey = resolvePortfolioTemplate(template || normalized.template);
    const displayName = normalized.heading.fullName || title || 'My Web CV';
    const summary = normalized.summary || description || '';
    return {
        renderer: PORTFOLIO_RENDERER,
        templateKey,
        canonical: { ...normalized, template: templateKey },
        content: [],
        root: {
            props: {
                title: sanitizePortfolioText(title || displayName),
                description: sanitizePortfolioText(summary).slice(0, 500),
            },
        },
        title: sanitizePortfolioText(title || displayName),
        description: sanitizePortfolioText(summary).slice(0, 500),
        tags: Array.isArray(tags) ? tags.map((tag) => sanitizePortfolioText(tag)).filter(Boolean) : [templateKey],
        seoTitle: sanitizePortfolioText(seoTitle || normalized.extras.seoTitle || displayName),
        seoDescription: sanitizePortfolioText(seoDescription || normalized.extras.seoDescription || summary).slice(0, 300),
    };
}

export function switchPortfolioTemplate(canonical, template) {
    const normalized = normalizePortfolioData(canonical, { template });
    return { ...normalized, template: resolvePortfolioTemplate(template) };
}

export function collectPortfolioFieldMatrix(canonicalInput = {}) {
    const data = normalizePortfolioData(canonicalInput);
    return {
        heading: data.heading,
        summary: data.summary,
        experiences: data.experiences.length,
        education: data.education.length,
        skills: data.skills.length,
        projects: data.projects.length,
        certifications: data.certifications.length,
        achievements: data.achievements.length,
        references: data.references.length,
        languages: data.languages.length,
        hobbies: data.hobbies.length,
        customSections: data.customSections.length,
        experienceTitles: data.experiences.map((item) => item.jobTitle),
        employers: data.experiences.map((item) => item.employer),
        schools: data.education.map((item) => item.school),
        skillNames: data.skills.map((item) => item.name),
        projectTitles: data.projects.map((item) => item.title),
        certificationTitles: data.certifications.map((item) => item.title),
        achievementTitles: data.achievements.map((item) => item.title),
        referenceNames: data.references.map((item) => item.name),
        languageNames: data.languages.map((item) => item.name),
        customTitles: data.customSections.map((item) => item.title),
    };
}

export function assertNoSilentDataLoss(sourceResume, portfolioCanonical) {
    const resume = normalizeResumeData(sourceResume);
    const portfolio = normalizePortfolioData(portfolioCanonical);
    const losses = [];
    const expect = (label, actual, predicted) => {
        const wanted = text(predicted);
        if (wanted && text(actual) !== wanted) losses.push(`${label}: expected "${wanted}" got "${text(actual)}"`);
    };
    expect('firstname', portfolio.heading.firstname, resume.firstname);
    expect('lastname', portfolio.heading.lastname, resume.lastname);
    expect('email', portfolio.heading.email, resume.email);
    expect('phone', portfolio.heading.phone, resume.phone);
    expect('occupation', portfolio.heading.occupation, resume.occupation);
    expect('city', portfolio.heading.city, resume.city);
    expect('country', portfolio.heading.country, resume.country);
    expect('address', portfolio.heading.address, resume.address);
    expect('postalcode', portfolio.heading.postalcode, resume.postalcode);
    expect('website', portfolio.heading.website, resume.website);
    expect('linkedin', portfolio.heading.linkedin, resume.linkedin);
    expect('github', portfolio.heading.github, resume.github);
    expect('summary', portfolio.summary, resume.summary);
    if (resume.employments.length !== portfolio.experiences.length) losses.push(`experiences count ${resume.employments.length} -> ${portfolio.experiences.length}`);
    resume.employments.forEach((item, index) => {
        expect(`experience[${index}].jobTitle`, portfolio.experiences[index]?.jobTitle, item.jobTitle);
        expect(`experience[${index}].employer`, portfolio.experiences[index]?.employer, item.employer);
        expect(`experience[${index}].begin`, portfolio.experiences[index]?.begin, item.begin);
        expect(`experience[${index}].end`, portfolio.experiences[index]?.end, item.end);
        expect(`experience[${index}].description`, portfolio.experiences[index]?.description, item.description);
    });
    if (resume.educations.length !== portfolio.education.length) losses.push(`education count ${resume.educations.length} -> ${portfolio.education.length}`);
    resume.educations.forEach((item, index) => {
        expect(`education[${index}].school`, portfolio.education[index]?.school, item.school);
        expect(`education[${index}].degree`, portfolio.education[index]?.degree, item.degree);
        expect(`education[${index}].started`, portfolio.education[index]?.started, item.started);
        expect(`education[${index}].finished`, portfolio.education[index]?.finished, item.finished);
        expect(`education[${index}].description`, portfolio.education[index]?.description, item.description);
    });
    const resumeSkillNames = resume.skills.map((item) => text(item.skillName || item.name)).filter(Boolean);
    resumeSkillNames.forEach((name, index) => expect(`skill[${index}]`, portfolio.skills[index]?.name, name));
    if (resume.projects.length !== portfolio.projects.length) losses.push(`projects count ${resume.projects.length} -> ${portfolio.projects.length}`);
    resume.projects.forEach((item, index) => {
        expect(`project[${index}].title`, portfolio.projects[index]?.title, item.title || item.name);
        expect(`project[${index}].description`, portfolio.projects[index]?.description, item.description);
        expect(`project[${index}].link`, portfolio.projects[index]?.link, item.link || item.url);
    });
    if (resume.certifications.length !== portfolio.certifications.length) losses.push(`certifications count ${resume.certifications.length} -> ${portfolio.certifications.length}`);
    resume.certifications.forEach((item, index) => {
        expect(`certification[${index}].title`, portfolio.certifications[index]?.title, item.title || item.name);
        expect(`certification[${index}].issuer`, portfolio.certifications[index]?.issuer, item.issuer || item.organization);
        expect(`certification[${index}].date`, portfolio.certifications[index]?.date, item.date);
    });
    if (resume.achievements.length !== portfolio.achievements.length) losses.push(`achievements count ${resume.achievements.length} -> ${portfolio.achievements.length}`);
    resume.achievements.forEach((item, index) => {
        expect(`achievement[${index}].title`, portfolio.achievements[index]?.title, item.title || item.name);
        expect(`achievement[${index}].description`, portfolio.achievements[index]?.description, item.description);
    });
    if (resume.references.length !== portfolio.references.length) losses.push(`references count ${resume.references.length} -> ${portfolio.references.length}`);
    resume.references.forEach((item, index) => {
        expect(`reference[${index}].name`, portfolio.references[index]?.name, item.name);
        expect(`reference[${index}].reference`, portfolio.references[index]?.reference, item.reference || item.description);
    });
    resume.languages.forEach((item, index) => {
        expect(`language[${index}].name`, portfolio.languages[index]?.name, item.name || item.language);
        expect(`language[${index}].level`, portfolio.languages[index]?.level, item.level);
    });
    const resumeHobbies = normalizeHobbyList(resume.hobbies);
    resumeHobbies.forEach((hobby, index) => expect(`hobby[${index}]`, portfolio.hobbies[index], hobby));
    if (resume.customSections.length !== portfolio.customSections.length) losses.push(`customSections count ${resume.customSections.length} -> ${portfolio.customSections.length}`);
    resume.customSections.forEach((section, index) => {
        expect(`custom[${index}].title`, portfolio.customSections[index]?.title, section.title);
        const sourceItems = Array.isArray(section.items) ? section.items : [];
        sourceItems.forEach((item, itemIndex) => {
            const title = typeof item === 'string' ? item : item?.title || item?.name;
            const description = typeof item === 'string' ? '' : item?.description || item?.content;
            expect(`custom[${index}].item[${itemIndex}].title`, portfolio.customSections[index]?.items?.[itemIndex]?.title, title);
            expect(`custom[${index}].item[${itemIndex}].description`, portfolio.customSections[index]?.items?.[itemIndex]?.description, description);
        });
    });
    return losses;
}

export function createRichPortfolioFixture() {
    return convertResumeToPortfolio({
        title: 'Priya Raman — Principal Engineer',
        firstname: 'Priya',
        lastname: 'Raman',
        occupation: 'Principal Software Engineer',
        email: 'priya.raman@example.com',
        phone: '+1 (415) 555-0198',
        city: 'San Francisco',
        country: 'United States',
        address: '120 Market Street',
        postalcode: '94105',
        website: 'https://priyaraman.dev',
        linkedin: 'https://linkedin.com/in/priyaraman',
        github: 'https://github.com/priyaraman',
        summary: 'Principal engineer who designs resilient cloud platforms and mentors teams shipping AI-assisted products used by millions.',
        employments: [
            { jobTitle: 'Principal Software Engineer', employer: 'Northwind Labs', begin: '2022', end: 'Present', description: 'Led the platform architecture for a multi-region AI inference mesh serving 40M monthly users.' },
            { jobTitle: 'Staff Engineer', employer: 'Harbor Cloud', begin: '2019', end: '2022', description: 'Built a developer platform that cut service bootstrap time from weeks to one day.' },
            { jobTitle: 'Senior Backend Engineer', employer: 'Lumen Analytics', begin: '2016', end: '2019', description: 'Designed event-sourced billing pipelines processing $120M annual volume.' },
            { jobTitle: 'Software Engineer', employer: 'Cedar Systems', begin: '2014', end: '2016', description: 'Delivered real-time collaboration APIs used by 8 product squads.' },
            { jobTitle: 'Junior Engineer', employer: 'Brightline Studio', begin: '2012', end: '2014', description: 'Shipped the first customer-facing dashboard and on-call playbooks.' },
        ],
        educations: [
            { school: 'Stanford University', degree: 'M.S. Computer Science', started: '2010', finished: '2012', description: 'Distributed systems and human-computer interaction.' },
            { school: 'Anna University', degree: 'B.E. Computer Science', started: '2006', finished: '2010', description: 'First class with distinction.' },
            { school: 'General Assembly', degree: 'Product Leadership Certificate', started: '2018', finished: '2018', description: 'Cross-functional product strategy.' },
        ],
        skills: [
            { name: 'TypeScript', rating: 95 },
            { name: 'React', rating: 92 },
            { name: 'Node.js', rating: 90 },
            { name: 'Go', rating: 78 },
            { name: 'Python', rating: 84 },
            { name: 'PostgreSQL', rating: 88 },
            { name: 'Redis', rating: 80 },
            { name: 'Kubernetes', rating: 86 },
            { name: 'AWS', rating: 90 },
            { name: 'GCP', rating: 76 },
            { name: 'Terraform', rating: 82 },
            { name: 'GraphQL', rating: 74 },
            { name: 'System Design', rating: 93 },
            { name: 'Machine Learning Ops', rating: 70 },
            { name: 'Technical Writing', rating: 85 },
            { name: 'Mentorship', rating: 91 },
        ],
        projects: [
            { title: 'Atlas Inference Mesh', description: 'Multi-region model serving fabric with canary rollouts and cost-aware routing.', url: 'https://priyaraman.dev/atlas', technologies: 'Go, Kubernetes, Envoy' },
            { title: 'Harbor Developer Platform', description: 'Internal PaaS that standardized CI, secrets, and golden paths.', url: 'https://priyaraman.dev/harbor', technologies: 'TypeScript, Terraform, AWS' },
            { title: 'Lumen Ledger', description: 'Exactly-once billing pipeline with replayable audit trails.', url: 'https://priyaraman.dev/lumen', technologies: 'Kafka, PostgreSQL, Python' },
            { title: 'IME365 Web CV', description: 'Public portfolio engine with template switching and draft isolation.', url: 'https://priyaraman.dev/webcv', technologies: 'React, Vite, MariaDB' },
            { title: 'Nightwatch Observability', description: 'SLO-first tracing and burn-rate alerts for product squads.', url: 'https://priyaraman.dev/nightwatch', technologies: 'OpenTelemetry, Grafana' },
        ],
        certifications: [
            { title: 'AWS Certified Solutions Architect – Professional', issuer: 'Amazon Web Services', date: '2023', description: 'Advanced architecture certification.', link: 'https://aws.amazon.com' },
            { title: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2022' },
            { title: 'Google Professional Cloud Architect', issuer: 'Google Cloud', date: '2021' },
        ],
        achievements: [
            { title: 'Engineering Excellence Award', description: 'Recognized for reducing incident minutes by 63% in one year.' },
            { title: 'Open Source Maintainer', description: 'Maintainer of a 6k-star workflow library used by Fortune 500 teams.' },
            { title: 'Conference Speaker', description: 'Keynote at PlatformCon on multi-region failover design.' },
        ],
        references: [
            { name: 'Elena Voss', reference: 'Priya is the rare principal who can hold both architecture and people with equal care.' },
            { name: 'Marcus Chen', reference: 'She turned an unreliable platform into the most trusted internal product we have.' },
        ],
        languages: [
            { name: 'English', level: 'Native' },
            { name: 'Tamil', level: 'Native' },
            { name: 'French', level: 'Conversational' },
        ],
        hobbies: ['Trail running', 'Analog photography', 'Chamber music'],
        customSections: [
            {
                title: 'Selected Advising',
                items: [
                    { title: 'Northwind Fellows', description: 'Mentor for first-time staff engineers.' },
                    { title: 'Civic Tech Guild', description: 'Pro-bono architecture reviews for public-interest software.' },
                ],
            },
        ],
    }, { resumeId: 'fixture-priya' });
}

export function createLargePortfolioFixture() {
    const base = createRichPortfolioFixture();
    return {
        ...base,
        experiences: Array.from({ length: 20 }, (_, index) => ({
            ...base.experiences[index % base.experiences.length],
            id: `experience-large-${index}`,
            jobTitle: `${base.experiences[index % base.experiences.length].jobTitle} ${index + 1}`,
        })),
        skills: Array.from({ length: 30 }, (_, index) => ({
            id: `skill-large-${index}`,
            name: `Skill ${index + 1}`,
            skillName: `Skill ${index + 1}`,
            rating: 50 + (index % 50),
            category: index % 2 ? 'Core' : 'Adjacent',
        })),
        projects: Array.from({ length: 20 }, (_, index) => ({
            ...base.projects[index % base.projects.length],
            id: `project-large-${index}`,
            title: `${base.projects[index % base.projects.length].title} ${index + 1}`,
        })),
        certifications: Array.from({ length: 20 }, (_, index) => ({
            ...base.certifications[index % base.certifications.length],
            id: `cert-large-${index}`,
            title: `${base.certifications[index % base.certifications.length].title} ${index + 1}`,
        })),
        achievements: Array.from({ length: 20 }, (_, index) => ({
            id: `ach-large-${index}`,
            title: `Achievement ${index + 1}`,
            description: 'Measured outcome with lasting organizational impact.',
        })),
        references: Array.from({ length: 20 }, (_, index) => ({
            id: `ref-large-${index}`,
            name: `Referee ${index + 1}`,
            reference: 'Consistently raises the quality bar for the entire organization.',
        })),
        customSections: [
            {
                id: 'custom-large',
                title: 'Extended Notes',
                items: Array.from({ length: 12 }, (_, index) => ({
                    id: `custom-large-item-${index}`,
                    title: `Note ${index + 1}`,
                    description: 'Additional portfolio-only narrative that must survive template switching.',
                })),
                content: '',
            },
        ],
    };
}

export function visiblePortfolioSections(canonicalInput = {}) {
    const data = normalizePortfolioData(canonicalInput);
    return {
        heading: Boolean(data.heading.fullName || data.heading.occupation || data.heading.email),
        about: Boolean(data.summary),
        experience: data.experiences.some((item) => item.jobTitle || item.employer || item.description),
        education: data.education.some((item) => item.school || item.degree),
        skills: data.skills.length > 0,
        projects: data.projects.some((item) => item.title || item.description),
        certifications: data.certifications.some((item) => item.title),
        achievements: data.achievements.some((item) => item.title || item.description),
        references: data.references.some((item) => item.name || item.reference),
        languages: data.languages.length > 0,
        hobbies: data.hobbies.length > 0,
        custom: data.customSections.some((section) => section.title || section.items.length),
        contact: Boolean(data.heading.email || data.heading.phone || data.heading.website || data.heading.linkedin || data.heading.github),
    };
}

export function themeForTemplate(template) {
    return PORTFOLIO_TEMPLATES[resolvePortfolioTemplate(template)]?.theme || 'minimal';
}

export function displayNameFromCanonical(canonicalInput = {}) {
    const data = normalizePortfolioData(canonicalInput);
    return data.heading.fullName || [data.heading.firstname, data.heading.lastname].filter(Boolean).join(' ') || 'My Web CV';
}
