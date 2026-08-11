import React from 'react';
import Experience1 from './Experience1';
import Experience2 from './Experience2';
import Experience3 from './Experience3';
import Experience4 from './Experience4';
import Experience5 from './Experience5';
import Experience6 from './Experience6';
import { TemplateSelector } from './TemplateModal';

const experienceTemplates = {
    timeline: Experience1,
    cards: Experience2,
    darkCyber: Experience3,
    darkTerminal: Experience4,
    artist: Experience5,
    darkCyberSec: Experience6,
};

const experienceTemplateOptions = [
    {
        id: 'timeline',
        name: 'Timeline View',
        description: 'Vertical timeline with experience details',
        preview: 'https://placehold.co/400x200/059669/white?text=Timeline+View',
    },
    {
        id: 'cards',
        name: 'Card Layout',
        description: 'Experience cards with company logos',
        preview: 'https://placehold.co/400x200/DC2626/white?text=Card+Layout',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Cyberpunk dark theme with neon timeline',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-style experience with commands',
        preview: 'https://placehold.co/400x200/000000/00FF00?text=Dark+Terminal',
    },
    {
        id: 'artist',
        name: 'Artist Experience',
        description: 'Artistic timeline with colorful themes and project images',
        preview: 'https://placehold.co/400x200/F59E0B/FFFFFF?text=Artist+Experience',
    },
    {
        id: 'darkCyberSec',
        name: 'Cyber Security Experience',
        description: 'Dark cyber security theme with security clearance levels and threat metrics',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Cyber+Security+Experience',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    timeline: {
        // Fields for Experience1 - timeline view
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        experiences: {
            type: 'array',
            label: 'Work Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Job Title/Position' },
                company: { type: 'text', label: 'Company Name' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Job Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                technologies: { type: 'text', label: 'Technologies Used (comma-separated)' },
            },
            defaultItemProps: {
                position: 'Job Title',
                company: 'Company Name',
                location: 'City, Country',
                startDate: 'Month Year',
                endDate: 'Month Year',
                description: 'Brief description of your role and responsibilities.',
                achievements: [{ achievement: 'Key accomplishment or achievement' }],
                technologies: 'React, Node.js, MongoDB',
            },
        },
    },
    cards: {
        // Fields for Experience2 - card layout with company logos
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        experiences: {
            type: 'array',
            label: 'Work Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Job Title/Position' },
                company: { type: 'text', label: 'Company Name' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Job Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                technologies: { type: 'text', label: 'Technologies Used (comma-separated)' },
                companyLogo: { type: 'text', label: 'Company Logo URL' },
            },
            defaultItemProps: {
                position: 'Job Title',
                company: 'Company Name',
                location: 'City, Country',
                startDate: 'Month Year',
                endDate: 'Month Year',
                description: 'Brief description of your role and responsibilities.',
                achievements: [{ achievement: 'Key accomplishment or achievement' }],
                technologies: 'React, Node.js, MongoDB',
                companyLogo: 'https://placehold.co/60x60',
            },
        },
    },
    darkCyber: {
        // Fields for Experience3 - dark cyber theme
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
            ],
        },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'cyan', label: 'Cyan Neon' },
                { value: 'purple', label: 'Purple Neon' },
                { value: 'green', label: 'Green Neon' },
                { value: 'pink', label: 'Pink Neon' },
                { value: 'yellow', label: 'Yellow Neon' },
            ],
        },
        experiences: {
            type: 'array',
            label: 'Work Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Job Title/Position' },
                company: { type: 'text', label: 'Company Name' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Job Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                technologies: { type: 'text', label: 'Technologies Used (comma-separated)' },
                companyLogo: { type: 'text', label: 'Company Logo URL' },
            },
            defaultItemProps: {
                position: 'Job Title',
                company: 'Company Name',
                location: 'City, Country',
                startDate: 'Month Year',
                endDate: 'Month Year',
                description: 'Brief description of your role and responsibilities.',
                achievements: [{ achievement: 'Key accomplishment or achievement' }],
                technologies: 'React, Node.js, MongoDB',
                companyLogo: 'https://placehold.co/60x60',
            },
        },
    },
    darkTerminal: {
        // Fields for Experience4 - terminal theme
        title: { type: 'text', label: 'Section Title' },
        terminalTheme: {
            type: 'select',
            label: 'Terminal Theme',
            options: [
                { value: 'matrix', label: 'Matrix Green' },
                { value: 'hacker', label: 'Hacker Amber' },
                { value: 'retro', label: 'Retro Blue' },
                { value: 'cyberpunk', label: 'Cyberpunk Purple' },
            ],
        },
        experiences: {
            type: 'array',
            label: 'Work Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Job Title/Position' },
                company: { type: 'text', label: 'Company Name' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Job Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                technologies: { type: 'text', label: 'Technologies Used (comma-separated)' },
                command: { type: 'text', label: 'Terminal Command' },
            },
            defaultItemProps: {
                position: 'Job Title',
                company: 'Company Name',
                location: 'City, Country',
                startDate: 'Month Year',
                endDate: 'Month Year',
                description: 'Brief description of your role and responsibilities.',
                achievements: [{ achievement: 'Key accomplishment or achievement' }],
                technologies: 'React, Node.js, MongoDB',
                command: 'cd /experience/company-name',
            },
        },
    },
    artist: {
        // Fields for Experience5 - artist theme
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        artistName: { type: 'text', label: 'Artist Name' },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'orange', label: 'Orange' },
                { value: 'purple', label: 'Purple' },
                { value: 'emerald', label: 'Emerald' },
                { value: 'rose', label: 'Rose' },
                { value: 'blue', label: 'Blue' },
            ],
        },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'warm', label: 'Warm Canvas' },
                { value: 'cool', label: 'Cool Palette' },
                { value: 'neutral', label: 'Neutral Studio' },
                { value: 'fresh', label: 'Fresh Green' },
                { value: 'artistic', label: 'Artistic Pink' },
            ],
        },
        experiences: {
            type: 'array',
            label: 'Art Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Position/Role' },
                company: { type: 'text', label: 'Company/Studio' },
                type: { type: 'text', label: 'Employment Type' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Role Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                skills: { type: 'text', label: 'Skills & Tools (comma-separated)' },
                category: { type: 'text', label: 'Art Category' },
                projectImage: { type: 'text', label: 'Project Image URL' },
            },
            defaultItemProps: {
                position: 'Lead Digital Artist',
                company: 'Creative Studio',
                type: 'Full-time',
                location: 'New York, NY',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Creating compelling visual narratives and managing artistic projects.',
                achievements: [{ achievement: 'Key artistic accomplishment' }],
                skills: 'Digital Art, Photoshop, Illustration, Creative Direction',
                category: 'Digital Art',
                projectImage: 'https://placehold.co/400x250/8B5CF6/FFFFFF?text=Featured+Work',
            },
        },
    },
    darkCyberSec: {
        // Fields for Experience6 - cyber security theme with security clearance levels
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Security' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Digital Fortress' },
                { value: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900', label: 'Shadow Network' },
                { value: 'bg-gradient-to-br from-purple-900 via-gray-900 to-black', label: 'Quantum Shield' },
                { value: 'bg-gradient-to-br from-red-900 via-gray-900 to-black', label: 'Threat Hunter' },
            ],
        },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'cyan', label: 'Cyber Cyan' },
                { value: 'red', label: 'Alert Red' },
                { value: 'green', label: 'Secure Green' },
                { value: 'purple', label: 'Quantum Purple' },
                { value: 'orange', label: 'Warning Orange' },
            ],
        },
        experiences: {
            type: 'array',
            label: 'Security Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Position/Role' },
                company: { type: 'text', label: 'Company/Organization' },
                securityLevel: {
                    type: 'select',
                    label: 'Security Clearance Level',
                    options: [
                        { value: 'public', label: 'Public' },
                        { value: 'confidential', label: 'Confidential' },
                        { value: 'secret', label: 'Secret' },
                        { value: 'top-secret', label: 'Top Secret' },
                    ],
                },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Role Description' },
                threatsHandled: { type: 'text', label: 'Threats Handled (e.g., "500+")' },
                incidentsResolved: { type: 'text', label: 'Incidents Resolved' },
                securityDomains: {
                    type: 'array',
                    label: 'Security Domains',
                    arrayFields: {
                        domain: { type: 'text', label: 'Security Domain' },
                        level: {
                            type: 'select',
                            label: 'Expertise Level',
                            options: [
                                { value: 'expert', label: 'Expert' },
                                { value: 'advanced', label: 'Advanced' },
                                { value: 'intermediate', label: 'Intermediate' },
                                { value: 'basic', label: 'Basic' },
                            ],
                        },
                    },
                    defaultItemProps: {
                        domain: 'Threat Hunting',
                        level: 'advanced',
                    },
                },
                certifications: {
                    type: 'array',
                    label: 'Certifications Earned',
                    arrayFields: {
                        certification: { type: 'text', label: 'Certification Name' },
                        year: { type: 'text', label: 'Year Obtained' },
                    },
                    defaultItemProps: {
                        certification: 'CISSP',
                        year: '2023',
                    },
                },
                tools: { type: 'text', label: 'Security Tools Used' },
                companyLogo: { type: 'text', label: 'Company Logo URL (Optional)' },
                companyType: {
                    type: 'select',
                    label: 'Organization Type',
                    options: [
                        { value: 'enterprise', label: 'Enterprise' },
                        { value: 'government', label: 'Government' },
                        { value: 'consulting', label: 'Consulting' },
                        { value: 'startup', label: 'Startup' },
                        { value: 'healthcare', label: 'Healthcare' },
                        { value: 'finance', label: 'Finance' },
                        { value: 'education', label: 'Education' },
                        { value: 'military', label: 'Military/Defense' },
                    ],
                },
            },
            defaultItemProps: {
                position: 'Senior Security Analyst',
                company: 'CyberSecure Corp',
                securityLevel: 'confidential',
                location: 'Washington, DC',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Lead security operations including threat hunting, incident response, and vulnerability management across enterprise infrastructure.',
                threatsHandled: '1,200+',
                incidentsResolved: '150+',
                securityDomains: [
                    { domain: 'Threat Hunting', level: 'expert' },
                    { domain: 'Incident Response', level: 'advanced' },
                ],
                certifications: [
                    { certification: 'CISSP', year: '2023' },
                    { certification: 'GCIH', year: '2022' },
                ],
                tools: 'Splunk, Wireshark, Metasploit, Nessus, CrowdStrike',
                companyLogo: 'https://placehold.co/80x80/00FFFF/000000?text=Company',
                companyType: 'enterprise',
            },
        },
    },
};

const ExperienceCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'timeline' } = data.props || {};

        console.log('🔧 DEBUG: Experience resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={experienceTemplateOptions} category="Experience" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.timeline;

        console.log('🔧 DEBUG: Resolved fields for Experience template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'timeline',
        title: 'Work Experience',
        subtitle: 'My professional journey and key accomplishments',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        terminalTheme: 'matrix',
        experiences: [
            {
                position: 'Senior Full Stack Developer',
                company: 'Tech Solutions Inc.',
                location: 'New York, NY',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Led development of multiple web applications using modern technologies.',
                achievements: [
                    { achievement: 'Increased application performance by 40%' },
                    { achievement: 'Led a team of 5 developers' },
                    { achievement: 'Implemented CI/CD pipeline reducing deployment time by 60%' },
                ],
                technologies: 'React, Node.js, PostgreSQL, AWS',
                companyLogo: 'https://placehold.co/60x60',
                command: 'cd /experience/tech-solutions',
            },
            {
                position: 'Frontend Developer',
                company: 'Digital Agency',
                location: 'San Francisco, CA',
                startDate: 'Jun 2020',
                endDate: 'Dec 2021',
                description: 'Developed responsive web applications and user interfaces.',
                achievements: [{ achievement: 'Built 10+ client websites' }, { achievement: 'Improved site loading speed by 50%' }],
                technologies: 'JavaScript, Vue.js, SCSS, Firebase',
                    companyLogo: 'https://placehold.co/60x60',
                command: 'cd /experience/digital-agency',
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = experienceTemplates[template] || Experience1;
        console.log('🔧 DEBUG: Experience template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...ExperienceCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Experience merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default ExperienceCategory;
