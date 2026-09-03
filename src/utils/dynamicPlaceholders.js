/**
 * Dynamic Contextual Placeholder Engine
 * ResumePilot AI
 *
 * Dynamically synthesizes field placeholders, empty states, and input guidance
 * adapted to:
 *   1. Candidate Profession & Inferred Domain
 *   2. Target Job Title & Specialization
 *   3. Geographic Market (US, UK, IN, CA, AU, EU, Global)
 *   4. Seniority & Career Stage
 *
 * Eliminates static, single-country presets (e.g. Swiggy, Infosys, B.Tech, AWS, etc.).
 * Guarantees zero IT leakage into non-technical personas.
 */

import { DOMAINS, DOMAIN_REGISTRY } from './candidateContext.js';

const REGIONAL_CITY_EXAMPLES = {
    IN: ['Bengaluru, Karnataka', 'Mumbai, Maharashtra', 'Hyderabad, Telangana', 'New Delhi, Delhi', 'Pune, Maharashtra'],
    US: ['Boston, MA', 'New York, NY', 'Chicago, IL', 'San Francisco, CA', 'Austin, TX', 'Seattle, WA'],
    UK: ['London, Greater London', 'Manchester, Greater Manchester', 'Birmingham, West Midlands', 'Edinburgh, Scotland'],
    CA: ['Toronto, ON', 'Vancouver, BC', 'Montreal, QC', 'Calgary, AB', 'Ottawa, ON'],
    AU: ['Sydney, NSW', 'Melbourne, VIC', 'Brisbane, QLD', 'Perth, WA', 'Adelaide, SA'],
    EU: ['Berlin, Germany', 'Paris, France', 'Amsterdam, Netherlands', 'Madrid, Spain', 'Stockholm, Sweden'],
    GLOBAL: ['Metropolitan Center', 'Regional Capital', 'Financial District', 'National Technology Hub']
};

const REGIONAL_PHONE_FORMATS = {
    IN: '+91 98765 43210',
    US: '+1 (555) 234-5678',
    UK: '+44 7911 123456',
    CA: '+1 (416) 555-0192',
    AU: '+61 412 345 678',
    EU: '+49 151 23456789',
    GLOBAL: '+1 (555) 012-3456'
};

export function getDynamicPlaceholder(stepPath, fieldName, candidateContext = {}) {
    const domain = candidateContext.domain || DOMAINS.UNSPECIFIED;
    const domainConfig = DOMAIN_REGISTRY[domain] || null;
    const region = candidateContext.geography?.region || 'GLOBAL';
    const cities = REGIONAL_CITY_EXAMPLES[region] || REGIONAL_CITY_EXAMPLES.GLOBAL;
    const defaultCity = cities[0];

    const title = candidateContext.targetTitle || candidateContext.currentTitle || '';
    const isUnknown = candidateContext.isUnknownRole;
    const isNiche = candidateContext.isNicheRole;

    switch (stepPath) {
        case 'heading': {
            if (fieldName === 'occupation' || fieldName === 'title') {
                if (title) return `e.g. ${title}, Senior Specialist, Lead Consultant`;
                if (domainConfig) {
                    const sample = domainConfig.blueprints.workHistory[0]?.jobTitle || domainConfig.label;
                    return `e.g. ${sample}`;
                }
                return 'e.g. Operations Director, Project Lead, Associate Consultant';
            }
            if (fieldName === 'city' || fieldName === 'location') {
                return `e.g. ${defaultCity}`;
            }
            if (fieldName === 'phone') {
                return `e.g. ${REGIONAL_PHONE_FORMATS[region] || REGIONAL_PHONE_FORMATS.GLOBAL}`;
            }
            if (fieldName === 'country') {
                if (region === 'IN') return 'e.g. India';
                if (region === 'US') return 'e.g. United States';
                if (region === 'UK') return 'e.g. United Kingdom';
                if (region === 'CA') return 'e.g. Canada';
                if (region === 'AU') return 'e.g. Australia';
                return 'e.g. Country of Residence';
            }
            if (fieldName === 'linkedin') {
                return 'https://linkedin.com/in/username';
            }
            if (fieldName === 'website') {
                return 'https://yourportfolio.com';
            }
            break;
        }

        case 'work-history': {
            if (fieldName === 'jobTitle') {
                if (title) return `e.g. ${title}`;
                if (domainConfig) {
                    const sample = domainConfig.blueprints.workHistory[0]?.jobTitle;
                    return `e.g. ${sample || 'Specialist'}`;
                }
                return 'e.g. Department Manager, Practice Specialist, Operations Lead';
            }
            if (fieldName === 'employer' || fieldName === 'company') {
                if (domainConfig) {
                    const sample = domainConfig.blueprints.workHistory[0]?.employer;
                    return `e.g. ${sample || 'Regional Enterprise'}`;
                }
                if (isNiche && title) {
                    return `e.g. ${title} Atelier / Professional Practice Group`;
                }
                return 'e.g. Professional Enterprise, Regional Health Network, Corporate Group';
            }
            if (fieldName === 'city') {
                return `e.g. ${defaultCity}`;
            }
            if (fieldName === 'description') {
                if (domainConfig) {
                    const sample = domainConfig.blueprints.workHistory[0]?.description;
                    if (sample) {
                        const firstBullet = sample.replace(/<[^>]+>/g, ' ').trim().split('.')[0];
                        return `e.g. ${firstBullet}.`;
                    }
                }
                return 'e.g. Spearheaded core departmental operations and client deliverables, improving efficiency by 25%.';
            }
            break;
        }

        case 'education': {
            if (fieldName === 'degree') {
                if (domainConfig) {
                    const degrees = domainConfig.commonDegrees || [];
                    if (region === 'US' && degrees[0]) return `e.g. ${degrees[0]}`;
                    if ((region === 'IN' || region === 'UK') && degrees[1]) return `e.g. ${degrees[1]}`;
                    return `e.g. ${degrees[0] || "Bachelor's Degree in Field of Study"}`;
                }
                if (isNiche && title) {
                    return `e.g. Professional Diploma / Degree in ${title}`;
                }
                return "e.g. Bachelor's Degree in Science, Arts, or Commerce";
            }
            if (fieldName === 'school' || fieldName === 'institution') {
                if (region === 'IN') return 'e.g. State University / National Institute';
                if (region === 'US') return 'e.g. State University / University College';
                if (region === 'UK') return 'e.g. University of London / Royal College';
                if (region === 'AU') return 'e.g. University of Sydney / Melbourne Institute';
                return 'e.g. Accredited University / National Institute';
            }
            if (fieldName === 'city') {
                return `e.g. ${defaultCity}`;
            }
            break;
        }

        case 'skills': {
            if (fieldName === 'skill') {
                if (domainConfig && domainConfig.skillCategories?.[0]?.skills?.[0]) {
                    const sample1 = domainConfig.skillCategories[0].skills[0];
                    const sample2 = domainConfig.skillCategories[0].skills[1] || 'Domain Expertise';
                    return `e.g. ${sample1}, ${sample2}`;
                }
                if (isNiche && title) {
                    return `e.g. Precision ${title} Technique, Quality Standards`;
                }
                return 'e.g. Strategic Planning, Operational Excellence, Process Optimization';
            }
            break;
        }

        case 'certifications': {
            if (fieldName === 'title') {
                if (domainConfig && domainConfig.commonCertifications?.[0]) {
                    const cert = domainConfig.commonCertifications[0];
                    const titleStr = typeof cert === 'string' ? cert : cert.title;
                    return `e.g. ${titleStr}`;
                }
                if (isNiche && title) {
                    return `e.g. Certified ${title} Practice Credential / State License`;
                }
                return 'e.g. Professional Practice License, State Credential, PMP';
            }
            if (fieldName === 'issuer') {
                if (domainConfig && domainConfig.commonCertifications?.[0]) {
                    const cert = domainConfig.commonCertifications[0];
                    const issuerStr = typeof cert === 'string' ? 'Accredited Board' : (cert.issuer || 'Accredited Board');
                    return `e.g. ${issuerStr}`;
                }
                return 'e.g. Accredited Licensing Board, National Professional Council';
            }
            break;
        }

        case 'projects': {
            if (fieldName === 'title') {
                if (domainConfig && domainConfig.blueprints.projects?.[0]) {
                    return `e.g. ${domainConfig.blueprints.projects[0].title}`;
                }
                if (isNiche && title) {
                    return `e.g. Specialized ${title} Service & Quality Modernization`;
                }
                return 'e.g. Process Optimization & Workflow Modernization Initiative';
            }
            if (fieldName === 'description') {
                if (domainConfig && domainConfig.blueprints.projects?.[0]) {
                    return `e.g. ${domainConfig.blueprints.projects[0].description}`;
                }
                return 'e.g. Spearheaded organization-wide initiative improving delivery turnaround time by 30%.';
            }
            break;
        }

        case 'summary': {
            if (title) {
                return `e.g. Dedicated ${title} with proven expertise in delivering high-impact outcomes, managing complex deliverables, and collaborating across multidisciplinary teams...`;
            }
            if (domainConfig) {
                return `e.g. Results-driven ${domainConfig.label} professional with demonstrated expertise in operational excellence, quality standards, and stakeholder collaboration...`;
            }
            return 'e.g. Dedicated professional with a proven track record of optimizing workflows, leading complex deliverables, and achieving measurable outcomes...';
        }

        case 'achievements': {
            if (fieldName === 'title') {
                if (domainConfig && domainConfig.blueprints.achievements?.[0]) {
                    return `e.g. ${domainConfig.blueprints.achievements[0].title}`;
                }
                return 'e.g. Excellence in Professional Service Award';
            }
            break;
        }

        default:
            return '';
    }

    return '';
}
