import React from 'react';
import Skills1 from './Skills1';
import Skills2 from './Skills2';
import Skills3 from './Skills3';
import Skills4 from './Skills4';
import Skills5 from './Skills5';
import Skills6 from './Skills6';
import { TemplateSelector } from './TemplateModal';

const skillsTemplates = {
    grid: Skills1,
    progress: Skills2,
    darkCyber: Skills3,
    darkTerminal: Skills4,
    artist: Skills5,
    darkCyberSec: Skills6,
};

const skillsTemplateOptions = [
    {
        id: 'grid',
        name: 'Skills Grid',
        description: 'Clean grid layout with skill icons',
        preview: 'https://placehold.co/400x200/06B6D4/white?text=Skills+Grid',
    },
    {
        id: 'progress',
        name: 'Progress Bars',
        description: 'Skills with animated progress bars',
        preview: 'https://placehold.co/400x200/8B5CF6/white?text=Progress+Bars',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Cyberpunk dark theme with neon accents',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-style dark theme with commands',
        preview: 'https://placehold.co/400x200/000000/00FF00?text=Dark+Terminal',
    },
    {
        id: 'artist',
        name: 'Artist Skills',
        description: 'Creative layout for artists with skill demos and categories',
        preview: 'https://placehold.co/400x200/F59E0B/FFFFFF?text=Artist+Skills',
    },
    {
        id: 'darkCyberSec',
        name: 'Cyber Security Skills',
        description: 'Dark cyber security theme with threat assessment and security domains',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Cyber+Security+Skills',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    grid: {
        // Fields for Skills1 - basic grid with icons
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 80,
                icon: '⚡',
            },
        },
    },
    progress: {
        // Fields for Skills2 - progress bars
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                icon: { type: 'text', label: 'Icon (Optional)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'frontend', label: 'Frontend' },
                        { value: 'backend', label: 'Backend' },
                        { value: 'database', label: 'Database' },
                        { value: 'tools', label: 'Tools' },
                        { value: 'design', label: 'Design' },
                        { value: 'other', label: 'Other' },
                    ],
                },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 80,
                icon: '',
                category: 'frontend',
            },
        },
    },
    darkCyber: {
        // Fields for Skills3 - cyber theme with accent colors
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { label: 'Frontend', value: 'frontend' },
                        { label: 'Backend', value: 'backend' },
                        { label: 'Database', value: 'database' },
                        { label: 'DevOps', value: 'devops' },
                        { label: 'Design', value: 'design' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 85,
                category: 'frontend',
                icon: '⚡',
            },
        },
    },
    darkTerminal: {
        // Fields for Skills4 - terminal theme
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                command: { type: 'text', label: 'Terminal Command' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'frontend', label: 'Frontend' },
                        { value: 'backend', label: 'Backend' },
                        { value: 'database', label: 'Database' },
                        { value: 'tools', label: 'Tools' },
                        { value: 'design', label: 'Design' },
                        { value: 'other', label: 'Other' },
                    ],
                },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 80,
                command: 'npm install',
                category: 'frontend',
            },
        },
    },
    artist: {
        // Fields for Skills5 - includes skill demo image and artistic categories
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        skillDemoImage: { type: 'text', label: 'Skill Demo/Artwork Image URL' },
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
        skills: {
            type: 'array',
            label: 'Artistic Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'digital', label: 'Digital Art' },
                        { value: 'traditional', label: 'Traditional Art' },
                        { value: 'design', label: 'Design' },
                        { value: 'software', label: 'Software' },
                        { value: 'photography', label: 'Photography' },
                        { value: 'other', label: 'Other' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Emoji' },
                demoImage: { type: 'text', label: 'Demo Image URL (Optional)' },
            },
            defaultItemProps: {
                name: 'Digital Painting',
                level: 85,
                category: 'digital',
                icon: '🎨',
                demoImage: '',
            },
        },
    },
    darkCyberSec: {
        // Fields for Skills6 - cyber security theme with threat assessment
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
        showcaseMode: {
            type: 'radio',
            label: 'Display Mode',
            options: [
                { label: 'Security Matrix Grid', value: 'matrix' },
                { label: 'Threat Assessment View', value: 'threat' },
            ],
        },
        skills: {
            type: 'array',
            label: 'Security Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Proficiency Level (%)' },
                category: {
                    type: 'select',
                    label: 'Security Domain',
                    options: [
                        { value: 'offensive', label: 'Offensive Security' },
                        { value: 'defensive', label: 'Defensive Security' },
                        { value: 'governance', label: 'Governance & Compliance' },
                        { value: 'forensics', label: 'Digital Forensics' },
                        { value: 'architecture', label: 'Security Architecture' },
                        { value: 'tools', label: 'Security Tools' },
                    ],
                },
                certification: { type: 'text', label: 'Related Certification (Optional)' },
                yearsExperience: { type: 'text', label: 'Years of Experience' },
                riskLevel: {
                    type: 'select',
                    label: 'Threat Level',
                    options: [
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ],
                },
            },
            defaultItemProps: {
                name: 'Threat Hunting',
                level: 90,
                category: 'defensive',
                certification: 'GCTI',
                yearsExperience: '3+',
                riskLevel: 'critical',
            },
        },
    },
};

const SkillsCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'progress' } = data.props || {};

        console.log('🔧 DEBUG: Skills resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={skillsTemplateOptions} category="Skills" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.progress;

        console.log('🔧 DEBUG: Resolved fields for Skills template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'progress',
        title: 'Skills & Expertise',
        subtitle: 'Technologies and tools I work with',
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        accentColor: 'cyan',
        terminalTheme: 'matrix',
        skills: [
            { name: 'React', level: 95, icon: '⚛️', category: 'frontend', command: 'npx create-react-app' },
            { name: 'JavaScript', level: 90, icon: '🟨', category: 'frontend', command: 'node --version' },
            { name: 'Node.js', level: 85, icon: '🟢', category: 'backend', command: 'npm start' },
            { name: 'Python', level: 80, icon: '🐍', category: 'backend', command: 'python --version' },
            { name: 'MongoDB', level: 75, icon: '🍃', category: 'database', command: 'mongod --version' },
            { name: 'Git', level: 85, icon: '📋', category: 'tools', command: 'git --version' },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = skillsTemplates[template] || Skills2;
        console.log('🔧 DEBUG: Skills template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...SkillsCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Skills merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default SkillsCategory;
