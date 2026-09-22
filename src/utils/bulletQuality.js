/**
 * Bullet & Role Quality Engine — IME365
 *
 * Provides deterministic, client-side evaluation of Work History bullets and roles.
 * Powers live 🟢/🟡/🔴 bullet scoring, the Role ATS Health Card, and anti-stuffing heuristics.
 */

import { ACTION_VERBS as ATS_ACTION_VERBS, extractJdKeywords } from './atsScore.js';

export const ACTION_VERBS = new Set([
    'accelerated', 'achieved', 'administered', 'advanced', 'analyzed', 'architected', 'assembled', 'audited',
    'authored', 'automated', 'boosted', 'built', 'calculated', 'centralized', 'championed', 'coached',
    'collaborated', 'composed', 'computed', 'conceptualized', 'configured', 'consolidated', 'constructed',
    'coordinated', 'crafted', 'created', 'customized', 'cut', 'debugged', 'decreased', 'delivered',
    'deployed', 'designed', 'developed', 'devised', 'directed', 'distributed', 'documented', 'doubled',
    'drove', 'eliminated', 'enabled', 'enacted', 'engineered', 'enhanced', 'established', 'evaluated',
    'exceeded', 'executed', 'expanded', 'expedited', 'facilitated', 'formulated', 'fostered', 'founded',
    'generated', 'guided', 'headed', 'identified', 'implemented', 'improved', 'increased', 'initiated',
    'innovated', 'inspected', 'installed', 'instituted', 'integrated', 'introduced', 'invented', 'launched',
    'led', 'leveraged', 'maintained', 'managed', 'maximized', 'mentored', 'migrated', 'minimized',
    'modernized', 'monitored', 'negotiated', 'optimized', 'orchestrated', 'organized', 'overhauled',
    'oversaw', 'partnered', 'performed', 'pioneered', 'planned', 'produced', 'programmed', 'published',
    'raised', 'rearchitected', 'rebuilt', 'redesigned', 'reduced', 'refactored', 'refined', 'remodeled',
    'reorganized', 'resolved', 'restructured', 'revamped', 'revolutionized', 'saved', 'scaled', 'scheduled',
    'secured', 'selected', 'shaped', 'shipped', 'simplified', 'slashed', 'solved', 'spearheaded',
    'standardized', 'steered', 'streamlined', 'strengthened', 'structured', 'supervised', 'surpassed',
    'synthesized', 'systematized', 'targeted', 'tested', 'trained', 'transformed', 'transitioned',
    'translated', 'trimmed', 'tripled', 'uncovered', 'unified', 'upgraded', 'validated', 'verified',
    'wrote', 'yielded',
    // Healthcare, Clinical & Sciences
    'diagnosed', 'treated', 'administered', 'prescribed', 'rehabilitated', 'monitored',
    'triaged', 'counseled', 'restored', 'extracted', 'operated', 'examined',
    // Legal & Regulatory
    'litigated', 'drafted', 'arbitrated', 'advocated', 'defended', 'prosecuted', 'settled', 'briefed', 'advised',
    // Pedagogical & Culinary / Operations
    'taught', 'instructed', 'curated', 'prepared', 'procured', 'dispatched'
]);

export const WEAK_PASSIVE_REGEX = /^(?:responsible for|worked on|helped with|assisted in|tasks included|duties included|doing daily|handled tasks|was involved in|participated in|contributed to|was tasked with|responsible to|helped out)/i;

/**
 * Detects legitimate quantitative metrics, business outcomes, or scale in bullet text.
 * Strictly excludes standalone 4-digit calendar years (1980–2035) so "Worked in 2021" is not misidentified.
 */
export function detectLegitimateMetric(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;

    // 1. Currency with amounts ($500, €20k, £1.2M, ₹50L, ¥10M, 50k USD)
    if (/[$€£₹¥]\s*[\d,.]+(?:\s*(?:k|m|b|cr|lakh|million|billion))?|[\d,.]+\s*(?:usd|eur|gbp|inr|cad|aud)/i.test(clean)) {
        return true;
    }

    // 2. Percentages (30%, 4.5%, 100 percent)
    if (/[\d,.]+\s*(?:%|percent|percentage points)/i.test(clean)) {
        return true;
    }

    // 3. Multipliers, scale, or ranges (2x, 10x, 50k, 1.2M, 500+, 10,000)
    if (/\b\d+(?:\.\d+)?(?:x|k|m|b)\b|\b\d{1,3}(?:,\d{3})+\b|\b\d+\s*\+/i.test(clean)) {
        return true;
    }

    // 4. Technical latency, throughput, volume, speed (50ms, 120fps, 10gb, 500tb, 20tps, 5k rps)
    if (/\b\d+\s*(?:ms|fps|gb|tb|pb|kb|mb|tps|qps|rps|req\/s)\b/i.test(clean)) {
        return true;
    }

    // 5. Team size, scope, or headcount ("team of 12", "managed 8 engineers", "supervised 15 technicians")
    if (/\b(?:team of|managed|led|supervised|trained|mentored|team size of)\s+\d+\b/i.test(clean)) {
        return true;
    }

    // 6. Action-outcome verbs followed by numbers ("reduced by 40", "saved 15 hours", "increased by 25")
    if (/\b(?:reduced|cut|saved|increased|boosted|grew|accelerated|streamlined)\s+(?:by\s+)?[\d,.]+/i.test(clean)) {
        return true;
    }

    // 7. Domain business metrics (ROAS, CPA, CTR, NPS, CSAT, ARR, MRR, SLA, ROI) accompanied by a number
    if (/\b(?:roas|cpa|ctr|nps|csat|arr|mrr|sla|roi)\b/i.test(clean) && /\d+/.test(clean)) {
        return true;
    }

    // 8. General numbers — excluding standalone calendar years (1980–2035)
    const numbers = clean.match(/\b\d+\b/g) || [];
    const nonYearNumbers = numbers.filter((n) => {
        const num = parseInt(n, 10);
        return num < 1980 || num > 2035;
    });

    return nonYearNumbers.length > 0;
}

export const BULLET_PREFIX_REGEX = /^[ \t]*(?:[•*–—\-][•*–—\-\s]*|(?:\(?\d+\)?[\.\)]|\d+[-–—])[ \t]+)/;

/**
 * Checks if a bullet starts with a strong active verb.
 */
export function hasStrongActionVerb(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.replace(BULLET_PREFIX_REGEX, '').trim();
    if (!clean) return false;
    const firstWord = clean.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    return ACTION_VERBS.has(firstWord) || (Array.isArray(ATS_ACTION_VERBS) && ATS_ACTION_VERBS.includes(firstWord));
}

/**
 * Performs comprehensive analysis on an individual bullet point.
 */
export function getBulletAnalysis(text, maxLength = 260) {
    const clean = String(text || '').replace(BULLET_PREFIX_REGEX, '').trim();
    const charCount = clean.length;

    if (!clean || charCount < 15) {
        return {
            status: 'red',
            label: 'Too Short',
            badgeText: 'Draft / Too Short',
            isPassive: false,
            hasActionVerb: false,
            hasMetric: false,
            tip: 'Add what you accomplished and tools used (at least 35 characters).',
        };
    }

    const isPassive = WEAK_PASSIVE_REGEX.test(clean);
    const hasActionVerb = hasStrongActionVerb(clean);
    const hasMetric = detectLegitimateMetric(clean);

    if (charCount > maxLength) {
        return {
            status: 'red',
            label: 'Too Long',
            badgeText: 'Exceeds Length Limit',
            isPassive,
            hasActionVerb,
            hasMetric,
            tip: `Trim to under ${maxLength} characters for clean ATS layout.`,
        };
    }

    if (isPassive) {
        return {
            status: 'red',
            label: 'Passive Opener',
            badgeText: 'Needs Action Verb',
            isPassive: true,
            hasActionVerb: false,
            hasMetric,
            tip: 'Replace passive phrases like "Responsible for" with a strong action verb (e.g. Architected, Built, Optimized).',
        };
    }

    // Between 220 and maxLength (260), check if slightly long but structurally complete
    if (charCount > 220) {
        if (hasActionVerb && hasMetric) {
            return {
                status: 'amber',
                label: 'Good (Slightly Long)',
                badgeText: 'Good (Trim to ~200)',
                isPassive: false,
                hasActionVerb: true,
                hasMetric: true,
                tip: 'Strong content, but slightly long. Consider trimming under 220 characters for a crisp 2-line layout.',
            };
        }
    }

    if (hasActionVerb && hasMetric && charCount >= 35) {
        return {
            status: 'green',
            label: 'Strong',
            badgeText: 'Strong (Action + Metrics)',
            isPassive: false,
            hasActionVerb: true,
            hasMetric: true,
            tip: 'Excellent bullet point! Follows the standard ATS action-outcome framework.',
        };
    }

    if (hasActionVerb || hasMetric || charCount >= 40) {
        return {
            status: 'amber',
            label: 'Good',
            badgeText: hasActionVerb ? 'Good (Add Metrics)' : 'Needs Action Verb',
            isPassive: false,
            hasActionVerb,
            hasMetric,
            tip: hasActionVerb
                ? 'Add quantifiable impact (%, $, scale, or volume) to elevate to Strong.'
                : 'Start with a strong past-tense action verb (e.g. Built, Designed, Shipped).',
        };
    }

    return {
        status: 'red',
        label: 'Needs Work',
        badgeText: 'Needs Detail & Verb',
        isPassive: false,
        hasActionVerb: false,
        hasMetric: false,
        tip: 'Start with an action verb and add specific technologies or measurable outcomes.',
    };
}

/**
 * Parses raw text into distinct bullet items.
 */
export function extractBulletList(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
        .replace(/<[^>]*>/g, '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^[ \t]*(?:[•*–—\-][•*–—\-\s]*|(?:\(?\d+\)?[\.\)]|\d+[-–—])[ \t]+)/, '').trim())
        .filter(Boolean);
}

/**
 * Formats an array of bullet strings into standard unicode bulleted text.
 */
export function serializeBullets(bullets = []) {
    return (bullets || [])
        .map((b) => (typeof b === 'string' ? b.trim() : ''))
        .filter(Boolean)
        .map((b) => (b.startsWith('•') ? b : `• ${b}`))
        .join('\n');
}

/**
 * Computes a role-level ATS health score and actionable checklist pills for a single employment entry.
 */
export function getRoleHealth(employment = {}, targetJd = '') {
    const title = String(employment.jobTitle || '').trim();
    const employer = String(employment.employer || '').trim();
    const begin = String(employment.begin || employment.startDate || '').trim();
    const isCurrent = Boolean(employment.current);
    const end = String(employment.end || employment.endDate || '').trim();

    const bullets = extractBulletList(employment.description);
    const bulletCount = bullets.length;

    const analyses = bullets.map(b => getBulletAnalysis(b));
    const strongBullets = analyses.filter(a => a.status === 'green').length;
    const goodBullets = analyses.filter(a => a.status === 'amber').length;
    const weakBullets = analyses.filter(a => a.isPassive || a.status === 'red').length;
    const bulletsWithVerbs = analyses.filter(a => a.hasActionVerb).length;
    const bulletsWithMetrics = analyses.filter(a => a.hasMetric).length;

    const hasTitle = Boolean(title);
    const hasEmployer = Boolean(employer);
    const hasDates = Boolean(begin && (isCurrent || end));

    // Keyword matching against Target JD
    let jdMatches = [];
    if (targetJd && targetJd.trim().length >= 10 && bulletCount > 0) {
        const jdKeywords = extractJdKeywords(targetJd);
        const roleText = `${title} ${employer} ${bullets.join(' ')}`.toLowerCase();
        jdMatches = jdKeywords
            .filter(k => roleText.includes(k.term.toLowerCase()))
            .map(k => k.term);
    }

    // Role Score calculation (out of 100)
    let score = 0;
    if (hasTitle) score += 20;
    if (hasEmployer) score += 15;
    if (hasDates) score += 15;
    if (bulletCount >= 1) score += 10;
    if (bulletCount >= 2) score += 10;
    if (bulletsWithVerbs >= 1) score += 10;
    if (bulletsWithVerbs >= 2) score += 5;
    if (bulletsWithMetrics >= 1) score += 10;
    if (bulletsWithMetrics >= 2) score += 5;

    // Action checklist pills
    const pills = [];

    // Pill 1: Role identity
    if (hasTitle && hasEmployer) {
        pills.push({ id: 'identity', ok: true, label: 'Role & Organization ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'identity', ok: false, label: hasTitle ? 'Missing Employer' : 'Missing Job Title', color: 'amber' });
    }

    // Pill 2: Chronology
    if (hasDates) {
        pills.push({ id: 'dates', ok: true, label: isCurrent ? 'Present Role ✓' : 'Dates Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'dates', ok: false, label: 'Set Start & End Dates', color: 'amber' });
    }

    // Pill 3: Bullet Count
    if (bulletCount >= 3) {
        pills.push({ id: 'bullets', ok: true, label: `${bulletCount} Bullets ✓`, color: 'emerald' });
    } else if (bulletCount >= 1) {
        pills.push({ id: 'bullets', ok: true, label: `${bulletCount} Bullet${bulletCount === 1 ? '' : 's'} (Add 2-4)`, color: 'amber' });
    } else {
        pills.push({ id: 'bullets', ok: false, label: 'Add Responsibilities', color: 'red' });
    }

    // Pill 4: Action Verbs
    if (bulletsWithVerbs >= 2) {
        pills.push({ id: 'verbs', ok: true, label: 'Action Verbs ✓', color: 'emerald' });
    } else if (bulletCount > 0) {
        pills.push({ id: 'verbs', ok: false, label: 'Start with Action Verbs', color: 'amber' });
    }

    // Pill 5: Metrics & Scale
    if (bulletsWithMetrics >= 2) {
        pills.push({ id: 'metrics', ok: true, label: `${bulletsWithMetrics} Measurable Outcomes ✓`, color: 'emerald' });
    } else if (bulletsWithMetrics === 1) {
        pills.push({ id: 'metrics', ok: true, label: '1 Metric (Add 1 More)', color: 'amber' });
    } else if (bulletCount > 0) {
        pills.push({ id: 'metrics', ok: false, label: 'Add Measurable Results (%, $, scale)', color: 'amber' });
    }

    // Pill 6: Target JD Match
    if (jdMatches.length > 0) {
        pills.push({ id: 'jd', ok: true, label: `${jdMatches.length} JD Keywords Aligned 🎯`, color: 'indigo' });
    }

    let status = 'getting-started';
    if (score >= 85) status = 'excellent';
    else if (score >= 70) status = 'strong';
    else if (score >= 45) status = 'needs-improvement';

    return {
        score: Math.min(100, score),
        status,
        hasTitle,
        hasEmployer,
        hasDates,
        bulletCount,
        strongBullets,
        goodBullets,
        weakBullets,
        bulletsWithVerbs,
        bulletsWithMetrics,
        jdMatches,
        pills,
    };
}

/**
 * Computes an education-level ATS health score and actionable checklist pills for a single qualification entry.
 */
export function getEducationHealth(education = {}, targetJd = '') {
    const school = String(education.school || education.institution || '').trim();
    const degree = String(education.degree || education.qualification || '').trim();
    const fieldOfStudy = String(education.fieldOfStudy || education.major || education.field || '').trim();
    const started = String(education.started || education.begin || education.startDate || '').trim();
    const finished = String(education.finished || education.end || education.endDate || '').trim();
    const isCurrent = Boolean(education.current || finished.toLowerCase() === 'present');
    const grade = String(education.grade || education.gpa || '').trim();

    const bullets = extractBulletList(education.description);
    const bulletCount = bullets.length;

    const hasSchool = Boolean(school);
    const hasDegree = Boolean(degree);
    const hasField = Boolean(fieldOfStudy || /\b(in|of)\s+[A-Za-z]/i.test(degree));
    const hasDates = Boolean(started || finished || isCurrent);
    const hasGrade = Boolean(grade || /\b(GPA|\d\.\d|Honors|Cum Laude|Dean'?s\s+List)\b/i.test(education.description || ''));

    // Keyword matching against Target JD
    let jdMatches = [];
    if (targetJd && targetJd.trim().length >= 10) {
        const jdKeywords = extractJdKeywords(targetJd);
        const eduText = `${school} ${degree} ${fieldOfStudy} ${bullets.join(' ')}`.toLowerCase();
        jdMatches = jdKeywords
            .filter(k => eduText.includes(k.term.toLowerCase()))
            .map(k => k.term);
    }

    // Education ATS Score calculation (pure academic credentials out of 100)
    let score = 0;
    if (hasSchool) score += 30;
    if (hasDegree) score += 30;
    if (hasField) score += 20;
    if (hasDates) score += 20;
    if (hasGrade) score += 10;

    // Action checklist pills (focused purely on ATS qualification standards)
    const pills = [];

    // Pill 1: Institution
    if (hasSchool) {
        pills.push({ id: 'school', ok: true, label: 'Institution Recognized ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'school', ok: false, label: 'Missing Institution', color: 'amber' });
    }

    // Pill 2: Degree Level
    if (hasDegree) {
        pills.push({ id: 'degree', ok: true, label: 'Degree Level Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'degree', ok: false, label: 'Missing Degree', color: 'amber' });
    }

    // Pill 3: Field of Study / Major
    if (hasField) {
        pills.push({ id: 'field', ok: true, label: 'Field of Study ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'field', ok: false, label: 'Specify Major / Field', color: 'amber' });
    }

    // Pill 4: Timeline / Graduation
    if (hasDates) {
        pills.push({ id: 'dates', ok: true, label: isCurrent ? 'Currently Studying ✓' : 'Graduation Date Set ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'dates', ok: false, label: 'Set Graduation Date', color: 'amber' });
    }

    // Pill 5: Honors / GPA (Optional bonus)
    if (hasGrade) {
        pills.push({ id: 'grade', ok: true, label: 'Honors & GPA Added ✓', color: 'emerald' });
    } else {
        pills.push({ id: 'grade', ok: true, label: 'Honors / GPA (Optional)', color: 'slate' });
    }

    // Pill 6: Target JD Match
    if (jdMatches.length > 0) {
        pills.push({ id: 'jd', ok: true, label: `${jdMatches.length} JD Keywords Aligned 🎯`, color: 'indigo' });
    }

    let status = 'getting-started';
    if (score >= 85) status = 'excellent';
    else if (score >= 70) status = 'strong';
    else if (score >= 45) status = 'needs-improvement';

    return {
        score: Math.min(100, score),
        status,
        hasSchool,
        hasDegree,
        hasField,
        hasDates,
        hasGrade,
        bulletCount,
        jdMatches,
        pills,
    };
}

export function ensureAtsOptimizedBullet(rawText, originalDraft = '') {
    let text = String(rawText || '')
        .replace(BULLET_PREFIX_REGEX, '')
        .replace(/["'\s]+$/g, '')
        .replace(/\\"/g, '"')
        .trim();
    if (!text) return text;

    // 1. Fix weak passive openers
    text = text.replace(/^(?:responsible for|worked on|helped with|assisted in|tasks included|duties included|doing daily|handled tasks|was involved in|participated in|contributed to|was tasked with|responsible to|helped out)\s*/i, 'Spearheaded ');

    // 2. Ensure leading strong action verb
    if (!hasStrongActionVerb(text)) {
        const lower = text.toLowerCase();
        let verb = 'Spearheaded';
        // Healthcare, Clinical & Nursing
        if (/patient|clinical|nurs|triage|medical|health|therapy|treatment|hospital|care|physician|doctor/i.test(lower)) verb = 'Administered';
        // Education & Academia
        else if (/student|teach|classroom|curriculum|course|lecture|academic|school|pupil|grade|faculty/i.test(lower)) verb = 'Instructed';
        // Legal & Regulatory
        else if (/contract|legal|compliance|regulation|litigation|policy|audit|clause|statute|counsel/i.test(lower)) verb = 'Negotiated';
        // Hospitality, Culinary & Events
        else if (/guest|culinary|food|menu|kitchen|dining|event|catering|recipe|chef|hospitality/i.test(lower)) verb = 'Curated';
        // Creative, Content & Design
        else if (/brand|content|campaign|creative|copy|visual|editorial|art|media|storyboard/i.test(lower)) verb = 'Authored';
        // Sales, Revenue & Business Development
        else if (/portfolio|revenue|sales|growth|client|market|business|customer|account|pipeline|retention/i.test(lower)) verb = 'Scaled';
        // Tech, Cloud & Infrastructure
        else if (/platform|infrastructure|api|service|pipeline|cluster|backend|database|cloud|aws|docker|kubernetes|software|code/i.test(lower)) verb = 'Engineered';
        // Performance & Optimization
        else if (/performance|latency|speed|cost|efficiency|workflow|process|load time|query/i.test(lower)) verb = 'Optimized';
        // Quality & Automation
        else if (/test|qa|quality|security|compliance|ci\/cd|deployment/i.test(lower)) verb = 'Automated';
        // UI / Front-end
        else if (/ui|frontend|design|ux|interface|component|react|vue|angular/i.test(lower)) verb = 'Architected';
        // Operations & Projects
        else if (/project|deliverable|feature|product|app|program|logistics|operations|facility/i.test(lower)) verb = 'Delivered';

        let body = text;
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]{2,}/.test(text) && !/^(?:in|at|for|with|across|on)\b/i.test(text)) {
            body = text.replace(/^([A-Za-z\s]+?)\s+([A-Z]{2,}[\w\s]*)/, (_, p1, p2) => {
                return `${p1.toLowerCase()} across ${p2}`;
            });
        } else {
            const firstChar = body.charAt(0).toLowerCase();
            const rest = body.slice(1);
            body = `${firstChar}${rest}`;
        }

        body = body.replace(/\s*([+]\d+%\s+[A-Za-z\s]+)/i, ', driving $1');
        text = `${verb} ${body}`;
    }

    // 3. Ensure metric anchor
    if (!detectLegitimateMetric(text)) {
        if (originalDraft && detectLegitimateMetric(originalDraft)) {
            const metricMatch = originalDraft.match(/([+$€£₹¥]?[\d,.]+(?:\s*(?:%|x|k|m|b|\+))?)/i);
            if (metricMatch) {
                text = text.replace(/[.,;:]+$/, '') + `, driving ${metricMatch[0]} performance improvement`;
            }
        } else {
            const lower = text.toLowerCase();
            if (/patient|clinical|nurs|medical|hospital/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', improving patient care turnaround by 20%';
            } else if (/student|teach|curriculum|school|academic/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', lifting student engagement scores by 15%';
            } else if (/guest|dining|food|kitchen|event/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', maintaining a 98% positive guest rating';
            } else if (/contract|legal|compliance/i.test(lower)) {
                text = text.replace(/[.,;:]+$/, '') + ', achieving 100% compliance standards';
            } else {
                text = text.replace(/[.,;:]+$/, '') + ', improving operational turnaround by 25%';
            }
        }
    }

    // 4. Streamline verbose filler phrases that blow character counts past 200
    text = text
        .replace(/\bthrough (?:the )?optimized (?:use|utilization) of\b/gi, 'utilizing')
        .replace(/\bthrough (?:the )?application of\b/gi, 'using')
        .replace(/\bleveraging (?:the )?(?:advanced )?capabilities of\b/gi, 'using')
        .replace(/\bresponsible for the execution of\b/gi, 'executing')
        .replace(/\bwith a comprehensive focus on\b/gi, 'focusing on')
        .replace(/\bin order to achieve\b/gi, 'achieving')
        .replace(/\bin an effort to\b/gi, 'to');

    // 5. Clean spacing and terminal punctuation
    text = text.replace(/\s{2,}/g, ' ').trim();
    if (!/[.!?]$/.test(text)) text += '.';

    return text;
}

export function getRolePlaceholder(jobTitle = '') {
    const roleLower = String(jobTitle || '').toLowerCase();
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician)\b/.test(roleLower)) {
        return 'e.g. Diagnosed and treated 25+ daily acute and complex patient cases, maintaining a 98% patient satisfaction and clinical quality rating...';
    }
    if (/\b(?:nurse|nursing|rn|lpn|np|practitioner|clinical care)\b/.test(roleLower)) {
        return 'e.g. Administered acute bedside care and vital monitoring for 15+ patients per shift, achieving 99% medication administration accuracy...';
    }
    if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect)\b/.test(roleLower)) {
        return 'e.g. Architected distributed backend services in Go and Node.js, cutting p99 response latency by 45% for 5M+ daily requests...';
    }
    if (/\b(?:data|analyst|analytics|machine learning|ml|ai|scientist|bi)\b/.test(roleLower)) {
        return 'e.g. Engineered predictive machine learning models in Python, lifting operational forecasting accuracy by 22%...';
    }
    if (/\b(?:product|pm|owner)\b/.test(roleLower)) {
        return 'e.g. Directed product roadmap and agile sprint execution, lifting 90-day user retention by 22% across flagship products...';
    }
    if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
        return 'e.g. Exceeded annual sales quota by 125%, generating $1.4M in new enterprise contract value through strategic outreach...';
    }
    if (/\b(?:marketing|growth|seo|brand|content|campaign)\b/.test(roleLower)) {
        return 'e.g. Orchestrated multi-channel acquisition campaigns, decreasing customer acquisition cost (CAC) by 28% while doubling MQL volume...';
    }
    if (/\b(?:finance|financial|accountant|accounting|audit|controller)\b/.test(roleLower)) {
        return 'e.g. Managed month-end financial closings and audit reconciliations, completing statutory filings with zero compliance deficiencies...';
    }
    if (/\b(?:operations|supply chain|logistics|procurement|warehouse)\b/.test(roleLower)) {
        return 'e.g. Optimized warehouse fulfillment and order dispatch workflows, accelerating order turnaround time by 32%...';
    }
    if (/\b(?:hr|human resources|recruiter|recruiting|talent)\b/.test(roleLower)) {
        return 'e.g. Spearheaded full-lifecycle talent acquisition for 45+ roles, reducing average time-to-hire from 52 to 31 days...';
    }
    if (/\b(?:teacher|teaching|professor|instructor|tutor|educator)\b/.test(roleLower)) {
        return 'e.g. Delivered differentiated classroom instruction for 75+ students, raising standardized assessment pass rates by 18%...';
    }
    if (/\b(?:customer success|customer service|support|csm|client success)\b/.test(roleLower)) {
        return 'e.g. Managed enterprise customer onboarding and relationship health, achieving a 98% CSAT score across 500+ client accounts...';
    }
    if (/\b(?:legal|compliance|counsel|attorney)\b/.test(roleLower)) {
        return 'e.g. Negotiated and executed 120+ commercial agreements and vendor contracts, accelerating contract turnaround by 30%...';
    }
    return 'e.g. Delivered key operational deliverables, improving team workflow efficiency by 25% with 100% on-time milestone delivery...';
}

export function getRolePillars(jobTitle = '') {
    const roleLower = String(jobTitle || '').toLowerCase();
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician)\b/.test(roleLower)) {
        return [
            { label: 'Clinical Care', icon: '🩺' },
            { label: 'Quality & Protocols', icon: '📋' },
            { label: 'Inpatient Rounds', icon: '🏥' },
            { label: 'Emergency Triage', icon: '⚡' },
        ];
    }
    if (/\b(?:nurse|nursing|rn|lpn|np|practitioner|clinical care)\b/.test(roleLower)) {
        return [
            { label: 'Bedside Care', icon: '🩺' },
            { label: 'Triage & Charting', icon: '📋' },
            { label: 'Patient Education', icon: '🏥' },
            { label: 'Safety & Hygiene', icon: '🛡️' },
        ];
    }
    if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect)\b/.test(roleLower)) {
        return [
            { label: 'System Architecture', icon: '⚙️' },
            { label: 'Performance Optimization', icon: '⚡' },
            { label: 'Reliability & CI/CD', icon: '🚀' },
            { label: 'Code Quality', icon: '🧪' },
        ];
    }
    if (/\b(?:data|analyst|analytics|machine learning|ml|ai|scientist|bi)\b/.test(roleLower)) {
        return [
            { label: 'Machine Learning', icon: '🤖' },
            { label: 'Data Pipelines', icon: '🔄' },
            { label: 'Business Insights', icon: '📊' },
            { label: 'Data Quality', icon: '🛡️' },
        ];
    }
    if (/\b(?:product|pm|owner)\b/.test(roleLower)) {
        return [
            { label: 'Product Roadmap', icon: '🗺️' },
            { label: 'User Discovery', icon: '🔍' },
            { label: 'Funnel Optimization', icon: '📈' },
            { label: 'Feature Delivery', icon: '🎯' },
        ];
    }
    if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
        return [
            { label: 'Quota Attainment', icon: '💰' },
            { label: 'Pipeline Growth', icon: '📊' },
            { label: 'Client Renewals', icon: '🤝' },
            { label: 'Sales Pitch', icon: '🎯' },
        ];
    }
    if (/\b(?:marketing|growth|seo|brand|content|campaign)\b/.test(roleLower)) {
        return [
            { label: 'Paid Acquisition', icon: '🎯' },
            { label: 'Organic Growth', icon: '🚀' },
            { label: 'Conversion Lift', icon: '🧪' },
            { label: 'Brand Reach', icon: '📢' },
        ];
    }
    if (/\b(?:finance|financial|accountant|accounting|audit|controller)\b/.test(roleLower)) {
        return [
            { label: 'Financial Reporting', icon: '📑' },
            { label: 'Cost Reduction', icon: '📉' },
            { label: 'Forecasting', icon: '📊' },
            { label: 'Internal Controls', icon: '🛡️' },
        ];
    }
    if (/\b(?:operations|supply chain|logistics|procurement|warehouse)\b/.test(roleLower)) {
        return [
            { label: 'Fulfillment Turnaround', icon: '📦' },
            { label: 'Vendor Negotiation', icon: '🤝' },
            { label: 'Process Improvement', icon: '⚙️' },
            { label: 'Inventory Control', icon: '📋' },
        ];
    }
    if (/\b(?:hr|human resources|recruiter|recruiting|talent)\b/.test(roleLower)) {
        return [
            { label: 'Full-Cycle Hiring', icon: '👥' },
            { label: 'Employee Retention', icon: '🌱' },
            { label: 'HR Operations', icon: '📋' },
            { label: 'Talent Outreach', icon: '🌟' },
        ];
    }
    if (/\b(?:teacher|teaching|professor|instructor|tutor|educator)\b/.test(roleLower)) {
        return [
            { label: 'Student Achievement', icon: '🎓' },
            { label: 'Curriculum Design', icon: '📚' },
            { label: 'Mentorship', icon: '🤝' },
            { label: 'Academic Standards', icon: '📋' },
        ];
    }
    if (/\b(?:customer success|customer service|support|csm|client success)\b/.test(roleLower)) {
        return [
            { label: 'CSAT & NPS Lift', icon: '⭐' },
            { label: 'Ticket Resolution', icon: '⚡' },
            { label: 'Churn Prevention', icon: '🛡️' },
            { label: 'Account Expansion', icon: '📈' },
        ];
    }
    return [
        { label: 'Operational Execution', icon: '🎯' },
        { label: 'Process Optimization', icon: '⚡' },
        { label: 'Strategic Initiatives', icon: '🚀' },
        { label: 'Quality Standards', icon: '🛡️' },
    ];
}

export function generateClientRoleBullet(jobTitle = '', company = '', existingBullets = [], pillar = '', projectName = '', technologies = '') {
    const safeExisting = Array.isArray(existingBullets)
        ? existingBullets
        : (existingBullets ? [String(existingBullets)] : []);

    const role = String(jobTitle || 'Professional').trim();
    const roleLower = role.toLowerCase();
    const pName = String(projectName || '').trim();
    const techStr = String(technologies || (pName ? '' : company) || '').trim();
    const techPhrase = techStr ? ` utilizing ${techStr}` : '';
    const atCompany = (!pName && company) ? ` at ${company}` : '';

    if (pName) {
        let pTemplates = [];

        // 1. Healthcare, Medical, Clinical, Nursing, Dental
        if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician|nurse|nursing|rn|clinical)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Clinical Protocols',
                    verb: 'Spearheaded',
                    text: `Spearheaded clinical protocol standardization for ${pName}${techPhrase}, improving diagnostic accuracy by 25%.`
                },
                {
                    pillar: 'Quality & Compliance',
                    verb: 'Audited',
                    text: `Audited clinical safety adherence for ${pName}${techPhrase}, ensuring 100% compliance with care guidelines.`
                },
                {
                    pillar: 'Inpatient Optimization',
                    verb: 'Standardized',
                    text: `Standardized multidisciplinary clinical workflows for ${pName}${techPhrase}, shortening turnaround by 30%.`
                },
                {
                    pillar: 'Care Delivery',
                    verb: 'Administered',
                    text: `Administered patient triage and specialized care pathways for ${pName}${techPhrase}, achieving a 98% quality rating.`
                }
            ];
        }
        // 2. Legal, Compliance, Attorneys
        else if (/\b(?:lawyer|attorney|counsel|legal|paralegal|compliance officer|solicitor|advocate|jurist)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Case Strategy',
                    verb: 'Directed',
                    text: `Directed case discovery, evidence analysis, and brief preparation for ${pName}${techPhrase}, securing favorable outcomes across all litigated matters.`
                },
                {
                    pillar: 'Compliance Frameworks',
                    verb: 'Formulated',
                    text: `Formulated legal compliance framework and risk assessment guidelines for ${pName}${techPhrase}, eliminating statutory exposure across commercial contracts.`
                },
                {
                    pillar: 'Dispute Resolution',
                    verb: 'Negotiated',
                    text: `Negotiated dispute settlements and commercial contract terms for ${pName}${techPhrase}, accelerating turnaround by 35%.`
                },
                {
                    pillar: 'Regulatory Audits',
                    verb: 'Audited',
                    text: `Audited statutory compliance documentation and trial evidence for ${pName}${techPhrase}, achieving zero regulatory deficiencies.`
                }
            ];
        }
        // 3. Accounting, Audit, Finance, Banking
        else if (/\b(?:accountant|cpa|accounting|auditor|audit|finance|financial analyst|controller|treasurer|banker)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Financial Modeling',
                    verb: 'Formulated',
                    text: `Formulated financial models, audit schedules, and variance reporting for ${pName}${techPhrase}, uncovering $150K+ in operational savings.`
                },
                {
                    pillar: 'Internal Controls',
                    verb: 'Standardized',
                    text: `Standardized internal accounting controls and reconciliation procedures for ${pName}${techPhrase}, completing filings with zero audit findings.`
                },
                {
                    pillar: 'Budget Optimization',
                    verb: 'Conducted',
                    text: `Conducted corporate valuation and budget allocation forecasts for ${pName}${techPhrase}, improving forecasting precision by 24%.`
                },
                {
                    pillar: 'Ledger Automation',
                    verb: 'Automated',
                    text: `Automated month-end ledger reconciliation routines for ${pName}${techPhrase}, reducing reporting cycle time by 40%.`
                }
            ];
        }
        // 4. Marketing, Brand, Content, Growth
        else if (/\b(?:marketing|growth|seo|brand|content|campaign|digital marketer)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Campaign Strategy',
                    verb: 'Orchestrated',
                    text: `Orchestrated multi-channel marketing campaign and brand launch for ${pName}${techPhrase}, driving a 35% increase in qualified inbound leads.`
                },
                {
                    pillar: 'Acquisition & CAC',
                    verb: 'Conducted',
                    text: `Conducted market segmentation and campaign performance analysis for ${pName}${techPhrase}, reducing customer acquisition costs (CAC) by 24%.`
                },
                {
                    pillar: 'Funnel Optimization',
                    verb: 'Optimized',
                    text: `Optimized digital marketing funnels and conversion touchpoints for ${pName}${techPhrase}, lifting checkout conversion by 28%.`
                },
                {
                    pillar: 'Organic Distribution',
                    verb: 'Expanded',
                    text: `Expanded organic search footprint and content distribution for ${pName}${techPhrase}, boosting organic search traffic by 45%.`
                }
            ];
        }
        // 5. Sales & Business Development
        else if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Pipeline Growth',
                    verb: 'Spearheaded',
                    text: `Spearheaded client acquisition and territory growth strategy for ${pName}${techPhrase}, generating $650K+ in qualified pipeline opportunities.`
                },
                {
                    pillar: 'Contract Negotiation',
                    verb: 'Negotiated',
                    text: `Negotiated enterprise agreements and partnership terms for ${pName}${techPhrase}, shortening average deal cycle by 30%.`
                },
                {
                    pillar: 'Revenue Delivery',
                    verb: 'Delivered',
                    text: `Delivered strategic sales presentations and account proposals for ${pName}${techPhrase}, lifting proposal-to-close rate by 25%.`
                }
            ];
        }
        // 6. Education & Teaching
        else if (/\b(?:teacher|teaching|professor|instructor|tutor|educator|lecturer)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Curriculum Design',
                    verb: 'Designed',
                    text: `Designed standards-based curriculum modules and assessment rubrics for ${pName}${techPhrase}, lifting student competency benchmarks by 20%.`
                },
                {
                    pillar: 'Instructional Tech',
                    verb: 'Implemented',
                    text: `Implemented interactive learning technologies and instructional materials for ${pName}${techPhrase}, improving classroom engagement by 28%.`
                },
                {
                    pillar: 'Student Outcomes',
                    verb: 'Evaluated',
                    text: `Evaluated longitudinal academic performance metrics for ${pName}${techPhrase}, raising course completion rates by 18%.`
                }
            ];
        }
        // 7. Engineering (Civil, Mechanical, Electrical, Structural)
        else if (/\b(?:civil engineer|mechanical engineer|electrical engineer|structural engineer|architect|bim)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Engineering Design',
                    verb: 'Supervised',
                    text: `Supervised structural load calculations and engineering design specifications for ${pName}${techPhrase}, achieving full regulatory compliance.`
                },
                {
                    pillar: 'System Efficiency',
                    verb: 'Optimized',
                    text: `Optimized mechanical system efficiency and thermal performance for ${pName}${techPhrase}, cutting operational energy consumption by 18%.`
                },
                {
                    pillar: 'Infrastructure Delivery',
                    verb: 'Engineered',
                    text: `Engineered infrastructure schematics and technical fabrication drawings for ${pName}${techPhrase}, delivering project 3 weeks ahead of schedule.`
                }
            ];
        }
        // 8. Software, Data, Cloud, Web, DevOps
        else if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect|data|machine learning|ml|ai)\b/.test(roleLower)) {
            pTemplates = [
                {
                    pillar: 'Architecture',
                    verb: 'Architected',
                    text: `Architected and deployed ${pName}${techPhrase}, establishing high-availability system architecture and robust performance benchmarks.`
                },
                {
                    pillar: 'Engineering',
                    verb: 'Engineered',
                    text: `Engineered core full-stack features and API integrations for ${pName}${techPhrase}, reducing response latency by 35%.`
                },
                {
                    pillar: 'Optimization',
                    verb: 'Optimized',
                    text: `Optimized pipeline workflows and database query efficiency for ${pName}${techPhrase}, scaling throughput by 40% under peak load.`
                },
                {
                    pillar: 'Deployment',
                    verb: 'Automated',
                    text: `Automated testing and CI/CD deployment routines for ${pName}${techPhrase}, accelerating release velocity while maintaining zero production regressions.`
                }
            ];
        }
        // 9. Universal / Operations Fallback
        else {
            pTemplates = [
                {
                    pillar: 'Project Delivery',
                    verb: 'Delivered',
                    text: `Delivered ${pName}${techPhrase} on schedule, improving operational efficiency by 25% across core deliverables.`
                },
                {
                    pillar: 'Process Streamlining',
                    verb: 'Streamlined',
                    text: `Streamlined project coordination and stakeholder communication for ${pName}${techPhrase}, accelerating turnaround by 30%.`
                },
                {
                    pillar: 'Quality Standards',
                    verb: 'Audited',
                    text: `Audited deliverables and quality benchmarks for ${pName}${techPhrase}, achieving 100% compliance with established standards.`
                },
                {
                    pillar: 'Workflow Optimization',
                    verb: 'Formulated',
                    text: `Formulated process improvements and workflow automation for ${pName}${techPhrase}, reducing administrative overhead by 35%.`
                }
            ];
        }

        const unselected = pTemplates.filter(t => !safeExisting.some(b => String(b || '').toLowerCase().includes(t.verb.toLowerCase())));
        const candidate = (pillar ? unselected.find(t => t.pillar.toLowerCase() === pillar.toLowerCase()) : null) || unselected[0] || pTemplates[0];
        return candidate.text;
    }

    const companyStr = String(company || '').trim();

    let templates = [];

    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical officer|general practitioner|gp|md|clinician)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Clinical Care',
                verb: 'Diagnosed',
                text: `Diagnosed and treated 25+ daily acute and complex patient cases${atCompany}, maintaining a 98% patient satisfaction and clinical quality rating.`
            },
            {
                pillar: 'Quality & Protocols',
                verb: 'Audited',
                text: `Audited and standardized hospital clinical protocols and documentation${atCompany}, reducing treatment variance by 30% across clinical units.`
            },
            {
                pillar: 'Inpatient Rounds',
                verb: 'Spearheaded',
                text: `Spearheaded multidisciplinary inpatient care rounds and diagnostic reviews${atCompany}, shortening average patient recovery time by 18%.`
            },
            {
                pillar: 'Emergency Triage',
                verb: 'Administered',
                text: `Administered rapid triage interventions and emergency assessments${atCompany}, accelerating diagnostic-to-treatment turnaround by 25%.`
            },
        ];
    } else if (/\b(?:nurse|nursing|rn|lpn|np|practitioner|clinical care)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Bedside Care',
                verb: 'Administered',
                text: `Administered acute bedside care and vital monitoring for 15+ patients per shift${atCompany}, achieving 99% medication administration accuracy.`
            },
            {
                pillar: 'Triage Efficiency',
                verb: 'Streamlined',
                text: `Streamlined patient triage intake and EHR charting${atCompany}, cutting average emergency waiting time by 22%.`
            },
            {
                pillar: 'Patient Education',
                verb: 'Coordinated',
                text: `Coordinated individualized patient discharge education and care plans${atCompany}, reducing 30-day readmissions by 14%.`
            },
            {
                pillar: 'Clinical Safety',
                verb: 'Enforced',
                text: `Enforced strict patient safety and infection control protocols${atCompany}, maintaining zero catheter-associated infections over 12 months.`
            },
        ];
    } else if (/\b(?:software|developer|frontend|backend|full\s*stack|engineer|devops|sre|cloud|architect)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'System Architecture',
                verb: 'Architected',
                text: `Architected distributed backend services and APIs${atCompany}, scaling system throughput by 35% to support 5M+ daily requests.`
            },
            {
                pillar: 'Performance Optimization',
                verb: 'Optimized',
                text: `Optimized database query performance and server caching layers${atCompany}, cutting p99 response latency by 45%.`
            },
            {
                pillar: 'Reliability & CI/CD',
                verb: 'Automated',
                text: `Automated end-to-end CI/CD deployment pipelines${atCompany}, reducing release rollback rates by 60% with 99.9% uptime.`
            },
            {
                pillar: 'Code Quality',
                verb: 'Refactored',
                text: `Refactored critical service modules and expanded automated test coverage to 85%${atCompany}, eliminating 40% of production regressions.`
            },
        ];
    } else if (/\b(?:data|analyst|analytics|machine learning|ml|ai|scientist|bi)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Machine Learning',
                verb: 'Engineered',
                text: `Engineered predictive machine learning models in Python${atCompany}, lifting operational forecasting accuracy by 22%.`
            },
            {
                pillar: 'Data Pipelines',
                verb: 'Built',
                text: `Built automated ETL pipelines processing 10GB+ of daily telemetry data${atCompany}, reducing reporting latency by 50%.`
            },
            {
                pillar: 'Business Insights',
                verb: 'Designed',
                text: `Designed executive BI dashboards and statistical models${atCompany}, uncovering insights that drove $1.2M in annual cost efficiencies.`
            },
            {
                pillar: 'Data Quality',
                verb: 'Standardized',
                text: `Standardized data validation schemas across warehouse databases${atCompany}, eliminating 95% of data ingestion anomalies.`
            },
        ];
    } else if (/\b(?:product|pm|owner)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Product Roadmap',
                verb: 'Directed',
                text: `Directed core product roadmap and agile sprint execution${atCompany}, lifting 90-day user retention by 22% within two quarters.`
            },
            {
                pillar: 'User Discovery',
                verb: 'Conducted',
                text: `Conducted customer discovery across 45+ enterprise accounts${atCompany}, prioritizing features that generated $350K in new ARR.`
            },
            {
                pillar: 'Funnel Optimization',
                verb: 'Spearheaded',
                text: `Spearheaded onboarding funnel experimentation and self-serve improvements${atCompany}, driving a 28% increase in free-to-paid activation.`
            },
            {
                pillar: 'Feature Delivery',
                verb: 'Aligned',
                text: `Aligned engineering, design, and GTM teams on release milestones${atCompany}, achieving 100% on-time feature delivery across 6 releases.`
            },
        ];
    } else if (/\b(?:sales|account executive|ae|bdr|sdr|business development|revenue)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Quota Attainment',
                verb: 'Exceeded',
                text: `Exceeded annual sales quota by 125%${atCompany}, generating $1.4M in new enterprise contract value through consultative selling.`
            },
            {
                pillar: 'Pipeline Growth',
                verb: 'Built',
                text: `Built and converted a $3.2M qualified sales pipeline across target accounts${atCompany}, shortening the deal cycle by 18 days.`
            },
            {
                pillar: 'Client Renewals',
                verb: 'Negotiated',
                text: `Negotiated multi-year renewals and expansion deals across 30+ enterprise clients${atCompany}, maintaining a 96% net revenue retention rate.`
            },
            {
                pillar: 'Sales Pitch',
                verb: 'Delivered',
                text: `Delivered high-converting executive product demonstrations${atCompany}, lifting discovery-to-proposal conversion by 32%.`
            },
        ];
    } else if (/\b(?:marketing|growth|seo|brand|content|campaign)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Paid Acquisition',
                verb: 'Orchestrated',
                text: `Orchestrated multi-channel digital acquisition campaigns${atCompany}, decreasing customer acquisition cost (CAC) by 28% while doubling MQLs.`
            },
            {
                pillar: 'Organic Growth',
                verb: 'Engineered',
                text: `Engineered organic search and content marketing strategies${atCompany}, growing inbound web traffic by 140% in 9 months.`
            },
            {
                pillar: 'Conversion Lift',
                verb: 'Executed',
                text: `Executed iterative A/B testing on landing pages${atCompany}, lifting visit-to-lead conversion rate from 2.4% to 4.8%.`
            },
            {
                pillar: 'Brand Reach',
                verb: 'Spearheaded',
                text: `Spearheaded brand partnership and social media campaigns${atCompany}, expanding total audience reach to 250K+ targeted prospects.`
            },
        ];
    } else if (/\b(?:finance|financial|accountant|accounting|audit|controller)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Financial Reporting',
                verb: 'Managed',
                text: `Managed month-end and year-end financial closings${atCompany}, completing annual statutory audits with zero compliance deficiencies.`
            },
            {
                pillar: 'Cost Reduction',
                verb: 'Analyzed',
                text: `Analyzed operational cost structures and vendor contracts${atCompany}, unlocking $220K in annual overhead expense reductions.`
            },
            {
                pillar: 'Forecasting',
                verb: 'Developed',
                text: `Developed rolling financial forecasts and cash flow variance models${atCompany}, improving budget accuracy to within 2.5% of actuals.`
            },
            {
                pillar: 'Internal Controls',
                verb: 'Instituted',
                text: `Instituted automated reconciliation controls${atCompany}, reducing billing discrepancies by 85% and saving 15 staff hours weekly.`
            },
        ];
    } else if (/\b(?:operations|supply chain|logistics|procurement|warehouse)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Fulfillment Turnaround',
                verb: 'Optimized',
                text: `Optimized warehouse fulfillment and order dispatch workflows${atCompany}, accelerating order turnaround time by 32%.`
            },
            {
                pillar: 'Vendor Negotiation',
                verb: 'Negotiated',
                text: `Negotiated procurement contracts with 15+ strategic suppliers${atCompany}, capturing 18% cost savings with 99.2% on-time delivery.`
            },
            {
                pillar: 'Process Improvement',
                verb: 'Implemented',
                text: `Implemented lean operational workflows and QA checkpoints${atCompany}, reducing operational defect rates by 40%.`
            },
            {
                pillar: 'Inventory Control',
                verb: 'Standardized',
                text: `Standardized inventory tracking and automated restocking thresholds${atCompany}, boosting stock accuracy to 99.8%.`
            },
        ];
    } else if (/\b(?:hr|human resources|recruiter|recruiting|talent)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Full-Cycle Hiring',
                verb: 'Spearheaded',
                text: `Spearheaded full-lifecycle talent acquisition for 45+ roles${atCompany}, reducing average time-to-hire from 52 to 31 days.`
            },
            {
                pillar: 'Employee Retention',
                verb: 'Designed',
                text: `Designed structured employee onboarding and mentorship programs${atCompany}, lifting first-year team retention by 24%.`
            },
            {
                pillar: 'HR Operations',
                verb: 'Standardized',
                text: `Standardized performance management and compliance workflows${atCompany}, maintaining 100% compliance across 300+ employees.`
            },
            {
                pillar: 'Talent Outreach',
                verb: 'Launched',
                text: `Launched university recruiting and technical outreach initiatives${atCompany}, increasing diverse talent pipeline volume by 35%.`
            },
        ];
    } else if (/\b(?:teacher|teaching|professor|instructor|tutor|educator)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'Student Achievement',
                verb: 'Delivered',
                text: `Delivered differentiated classroom instruction for 75+ students${atCompany}, raising standardized assessment pass rates by 18%.`
            },
            {
                pillar: 'Curriculum Design',
                verb: 'Designed',
                text: `Designed project-based learning curriculum integrating digital tools${atCompany}, lifting student engagement and homework completion to 94%.`
            },
            {
                pillar: 'Mentorship',
                verb: 'Mentored',
                text: `Mentored 30+ at-risk students through personalized academic plans${atCompany}, improving semester grade averages by 1.2 letter grades.`
            },
            {
                pillar: 'Academic Standards',
                verb: 'Coordinated',
                text: `Coordinated departmental curriculum alignment and benchmarking${atCompany}, achieving 100% compliance with educational standards.`
            },
        ];
    } else if (/\b(?:customer success|customer service|support|csm|client success)\b/.test(roleLower)) {
        templates = [
            {
                pillar: 'CSAT & NPS Lift',
                verb: 'Managed',
                text: `Managed enterprise customer onboarding and relationship health${atCompany}, achieving a 98% CSAT score across 500+ client accounts.`
            },
            {
                pillar: 'Ticket Resolution',
                verb: 'Streamlined',
                text: `Streamlined support escalation workflows and knowledge base articles${atCompany}, cutting average ticket resolution time by 35%.`
            },
            {
                pillar: 'Churn Prevention',
                verb: 'Identified',
                text: `Identified early customer risk signals and proactive health interventions${atCompany}, reducing gross account churn by 20%.`
            },
            {
                pillar: 'Account Expansion',
                verb: 'Partnered',
                text: `Partnered with sales on quarterly business reviews${atCompany}, contributing to $280K in expansion revenue.`
            },
        ];
    } else {
        templates = [
            {
                pillar: 'Operational Execution',
                verb: 'Delivered',
                text: `Delivered key project deliverables and operational workflows${atCompany}, improving team efficiency by 25% with 100% on-time milestone delivery.`
            },
            {
                pillar: 'Process Optimization',
                verb: 'Optimized',
                text: `Optimized cross-functional processes and operating procedures${atCompany}, eliminating recurring bottlenecks and saving 8 staff hours weekly.`
            },
            {
                pillar: 'Strategic Initiatives',
                verb: 'Spearheaded',
                text: `Spearheaded department priority initiatives${atCompany}, driving a 20% performance improvement across core business benchmarks.`
            },
            {
                pillar: 'Quality Standards',
                verb: 'Standardized',
                text: `Standardized reporting frameworks and documentation${atCompany}, maintaining 100% accuracy and compliance standards.`
            },
        ];
    }

    if (pillar) {
        const pillarLower = pillar.toLowerCase();
        const matched = templates.find(t => t.pillar.toLowerCase().includes(pillarLower) || pillarLower.includes(t.pillar.toLowerCase()));
        if (matched) return matched.text;
    }

    const normalizedExisting = safeExisting.map(b => String(b || '').toLowerCase().trim()).filter(Boolean);

    for (const item of templates) {
        const verbLower = item.verb.toLowerCase();
        const isVerbUsed = normalizedExisting.some(ex => ex.startsWith(verbLower) || ex.includes(` ${verbLower} `));
        const isTopicUsed = normalizedExisting.some(ex => {
            const pillarWords = item.pillar.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            return pillarWords.some(pw => ex.includes(pw));
        });
        if (!isVerbUsed && !isTopicUsed) {
            return item.text;
        }
    }

    for (const item of templates) {
        const verbLower = item.verb.toLowerCase();
        const isVerbUsed = normalizedExisting.some(ex => ex.startsWith(verbLower));
        if (!isVerbUsed) {
            return item.text;
        }
    }

    const fallbackIdx = normalizedExisting.length % templates.length;
    return templates[fallbackIdx].text;
}

