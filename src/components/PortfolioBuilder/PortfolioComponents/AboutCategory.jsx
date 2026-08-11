import React from 'react';
import About1 from './About1';
import About2 from './About2';
import About3 from './About3';
import About4 from './About4';
import About5 from './About5';
import About6 from './About6';
import { TemplateSelector } from './TemplateModal';

const aboutTemplates = {
    traditional: About1,
    progress: About2,
    darkCyber: About3,
    darkTerminal: About4,
    artist: About5,
    darkCyberSec: About6,
};

const aboutTemplateOptions = [
    {
        id: 'traditional',
        name: 'Traditional About',
        description: 'Two-column layout with skill tags',
        preview: 'https://placehold.co/400x200/10B981/white?text=Traditional+About',
    },
    {
        id: 'progress',
        name: 'Skills Progress',
        description: 'Progress bars with skill percentages',
        preview: 'https://placehold.co/400x200/F59E0B/white?text=Skills+Progress',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Cyberpunk-inspired dark theme with neon accents',
        preview: 'https://placehold.co/400x200/111827/00FFFF?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-style dark theme with command-line aesthetics',
        preview: 'https://placehold.co/400x200/000000/00FF00?text=Dark+Terminal',
    },
    {
        id: 'artist',
        name: 'Artist About',
        description: 'Creative layout for artists with studio showcase and mediums',
        preview: 'https://placehold.co/400x200/F59E0B/FFFFFF?text=Artist+About',
    },
    {
        id: 'darkCyberSec',
        name: 'Dark Cyber Security',
        description: 'Dark security theme with specializations and certifications',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Cyber+Security+About',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    traditional: {
        // Basic fields for About1
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900', label: 'Dark Purple' },
                { value: 'bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900', label: 'Deep Blue' },
                { value: 'bg-gradient-to-br from-emerald-900 via-teal-800 to-green-900', label: 'Deep Green' },
                { value: 'bg-gradient-to-br from-gray-900 via-gray-800 to-black', label: 'Charcoal' },
            ],
        },
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => item.skill,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
            },
            defaultItemProps: {
                skill: 'New Skill',
            },
        },
    },
    progress: {
        // Fields for About2 - includes skill levels
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50', label: 'Light Blue' },
                { value: 'bg-gradient-to-br from-rose-50 via-white to-teal-50', label: 'Warm White' },
                { value: 'bg-gradient-to-br from-violet-50 via-white to-pink-50', label: 'Soft Purple' },
                { value: 'bg-gradient-to-br from-slate-50 via-white to-gray-50', label: 'Clean Gray' },
            ],
        },
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 80,
            },
        },
    },
    darkCyber: {
        // Fields for About3 - includes accent color and statistics
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        resumeUrl: { type: 'text', label: 'Resume Download URL (e.g., /shared/resumeId)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
                { value: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900', label: 'Carbon Dark' },
                { value: 'bg-gradient-to-br from-purple-900 via-gray-900 to-black', label: 'Deep Purple' },
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
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'frontend', label: 'Frontend' },
                        { value: 'backend', label: 'Backend' },
                        { value: 'database', label: 'Database' },
                        { value: 'tools', label: 'Tools' },
                        { value: 'design', label: 'Design' },
                    ],
                },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 85,
                category: 'frontend',
            },
        },
        yearsExperience: { type: 'text', label: 'Years Experience' },
        projectsCompleted: { type: 'text', label: 'Projects Completed' },
        clientsSatisfied: { type: 'text', label: 'Clients Satisfied' },
    },
    darkTerminal: {
        // Fields for About4 - includes terminal theme and terminal commands
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gray-900', label: 'Dark Gray' },
                { value: 'bg-slate-900', label: 'Slate Terminal' },
                { value: 'bg-zinc-900', label: 'Zinc Dark' },
            ],
        },
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
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
                command: { type: 'text', label: 'Terminal Command' },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 85,
                command: 'npm install',
            },
        },
        totalCommits: { type: 'text', label: 'Total Commits' },
        linesWritten: { type: 'text', label: 'Lines Written' },
        coffeeConsumed: { type: 'text', label: 'Coffee Consumed' },
    },
    artist: {
        // Fields for About5 - includes studio images and artistic mediums
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'Artist Bio' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        studioImage: { type: 'text', label: 'Studio/Workspace Image URL' },
        processImage1: { type: 'text', label: 'Process Image 1 URL' },
        processImage2: { type: 'text', label: 'Process Image 2 URL' },
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
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'orange', label: 'Vibrant Orange' },
                { value: 'purple', label: 'Royal Purple' },
                { value: 'emerald', label: 'Emerald Green' },
                { value: 'rose', label: 'Rose Pink' },
                { value: 'blue', label: 'Ocean Blue' },
            ],
        },
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        artisticMediums: {
            type: 'array',
            label: 'Artistic Mediums',
            getItemSummary: (item) => item.medium,
            arrayFields: {
                medium: { type: 'text', label: 'Medium' },
                experience: { type: 'text', label: 'Experience Level' },
            },
            defaultItemProps: {
                medium: 'Digital Art',
                experience: 'Expert',
            },
        },
        yearsActive: { type: 'text', label: 'Years Active' },
        artworkCount: { type: 'text', label: 'Artworks Created' },
        exhibitionsCount: { type: 'text', label: 'Exhibitions' },
    },
    darkCyberSec: {
        // Fields for About6 - Cyber Security Professional theme
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'Professional Bio' },
        profileImage: { type: 'text', label: 'Professional Image URL' },
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
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
        specializations: {
            type: 'array',
            label: 'Security Specializations',
            getItemSummary: (item) => `${item.area} - ${item.level}`,
            arrayFields: {
                area: { type: 'text', label: 'Specialization Area' },
                level: {
                    type: 'select',
                    label: 'Expertise Level',
                    options: [
                        { value: 'Expert', label: 'Expert' },
                        { value: 'Advanced', label: 'Advanced' },
                        { value: 'Intermediate', label: 'Intermediate' },
                        { value: 'Proficient', label: 'Proficient' },
                    ],
                },
                icon: {
                    type: 'select',
                    label: 'Icon Type',
                    options: [
                        { value: 'shield', label: 'Shield' },
                        { value: 'lock', label: 'Lock' },
                        { value: 'key', label: 'Key' },
                        { value: 'eye', label: 'Eye (Monitoring)' },
                        { value: 'bug', label: 'Bug (Testing)' },
                        { value: 'code', label: 'Code' },
                    ],
                },
            },
            defaultItemProps: {
                area: 'Threat Analysis',
                level: 'Expert',
                icon: 'shield',
            },
        },
        certifications: {
            type: 'array',
            label: 'Security Certifications',
            getItemSummary: (item) => item.name,
            arrayFields: {
                name: { type: 'text', label: 'Certification Name' },
                issuer: { type: 'text', label: 'Issuing Organization' },
                year: { type: 'text', label: 'Year Obtained' },
            },
            defaultItemProps: {
                name: 'CISSP',
                issuer: '(ISC)²',
                year: '2023',
            },
        },
        yearsExperience: { type: 'text', label: 'Years of Experience' },
        threatsBlocked: { type: 'text', label: 'Threats Blocked' },
        systemsSecured: { type: 'text', label: 'Systems Secured' },
        incidentsHandled: { type: 'text', label: 'Incidents Handled' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
    },
};

const AboutCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'traditional' } = data.props || {};

        console.log('🔧 DEBUG: About resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={aboutTemplateOptions} category="About" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.traditional;

        console.log('🔧 DEBUG: Resolved fields for About template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'traditional',
        title: 'About Me',
        content: 'I am a passionate developer with expertise in modern web technologies. I love creating beautiful, functional applications that solve real-world problems.',
        showCTA: true,
        skills: [
            { skill: 'React', level: 90, category: 'frontend', command: 'npx create-react-app' },
            { skill: 'Node.js', level: 85, category: 'backend', command: 'node --version' },
            { skill: 'JavaScript', level: 95, category: 'frontend', command: 'node -e "console.log(\'JS\')"' },
            { skill: 'TypeScript', level: 80, category: 'frontend', command: 'tsc --version' },
        ],
        // Dark Cyber theme defaults
        accentColor: 'cyan',
        yearsExperience: '5+',
        projectsCompleted: '50+',
        clientsSatisfied: '20+',
        // Dark Terminal theme defaults
        terminalTheme: 'matrix',
        totalCommits: '2.5K+',
        linesWritten: '500K+',
        coffeeConsumed: '1.2K',
        // Background defaults for different templates
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = aboutTemplates[template] || About1;
        console.log('🔧 DEBUG: About template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...AboutCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: About merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default AboutCategory;
