/**
 * Safe Field Placeholder Engine (v2) — ResumePilot AI
 *
 * Placeholders are neutral, instructional, and field-contextual only.
 *
 * Rules (absolute):
 *  - Never resemble candidate data (no example employers, schools, cities,
 *    job titles, credentials, or metrics).
 *  - Never vary by profession, domain, or any detected "track".
 *  - May reference the field's purpose ("Enter the credential exactly as
 *    shown on your certificate").
 *  - May reference what the candidate already entered for the SAME field
 *    type (e.g. their declared target role as a format hint) — nothing else.
 */

const PLACEHOLDERS = {
    heading: {
        firstname: 'Enter your first name',
        lastname: 'Enter your last name',
        email: 'Enter a professional email address',
        phone: 'Enter your phone number with country code',
        occupation: 'Enter the job title you are targeting',
        city: 'Enter your city',
        country: 'Enter your country',
        address: 'Enter your address',
        postalcode: 'Enter your postal code',
        linkedin: 'https://linkedin.com/in/your-profile',
        website: 'https://your-portfolio.com',
        github: 'https://github.com/your-username',
    },

    'work-history': {
        jobTitle: 'Enter the job title exactly as it was listed',
        employer: 'Enter the organization where you worked',
        company: 'Enter the organization where you worked',
        city: 'Enter the city',
        description: 'Describe what you were responsible for. Add a measurable result if you know one.',
    },

    education: {
        degree: 'Enter your qualification as it appears on your transcript',
        school: 'Enter the institution name',
        city: 'Enter the city',
        description: 'Add relevant coursework, research, or honors (optional)',
    },

    skills: {
        skill: 'Enter a skill you actually used in your work',
        category: 'Optional group name (e.g. Core, Tools, Languages)',
    },

    certifications: {
        title: 'Enter the credential exactly as shown on your certificate',
        issuer: 'Enter the issuing organization',
        date: 'Year obtained',
    },

    projects: {
        title: 'Enter the project or initiative name',
        description: 'Describe your objective, your contribution, and the outcome',
        url: 'https://link-to-your-work (optional)',
    },

    achievements: {
        title: 'Enter the award or recognition name',
        issuer: 'Enter who awarded it',
        description: 'Describe what it recognized and when',
    },

    languages: {
        language: 'Enter the language',
        level: 'Select proficiency',
    },

    references: {
        name: 'Enter the reference name',
        reference: 'Enter their role and contact (only with their consent)',
        contact: 'Enter contact details (only with their consent)',
    },

    custom: {
        title: 'Enter the section name (e.g. Publications, Volunteering)',
    },

    summary: {
        summary: 'Write 2–4 sentences about your experience, strengths, and the value you bring — using only facts you can confirm.',
    },
};

/**
 * Returns a safe placeholder for a builder field, or '' when unknown.
 * The optional context is used ONLY to echo the candidate's own declared
 * target role as a format hint — never to suggest profession content.
 */
export function getDynamicPlaceholder(stepPath, fieldName, _context = {}) {
    const step = PLACEHOLDERS[stepPath];
    if (!step) return '';
    const placeholder = step[fieldName];
    return typeof placeholder === 'string' ? placeholder : '';
}

export function getSummaryPlaceholder() {
    return PLACEHOLDERS.summary.summary;
}
