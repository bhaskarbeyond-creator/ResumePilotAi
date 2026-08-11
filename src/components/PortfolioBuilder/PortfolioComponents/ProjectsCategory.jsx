import React from 'react';
import Projects1 from './Projects1';
import Projects2 from './Projects2';
import Projects3 from './Projects3';
import Projects4 from './Projects4';
import { TemplateSelector } from './TemplateModal';

const projectsTemplates = {
    grid: Projects1,
    showcase: Projects2,
    darkCyber: Projects3,
    darkTerminal: Projects4,
};

const projectsTemplateOptions = [
    {
        id: 'grid',
        name: 'Grid Cards',
        description: 'Card-based grid layout for projects',
        preview: 'https://placehold.co/400x200/8B5CF6/white?text=Grid+Cards',
    },
    {
        id: 'showcase',
        name: 'Showcase List',
        description: 'Detailed alternating layout with GitHub links',
        preview: 'https://placehold.co/400x200/EC4899/white?text=Showcase+List',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Cyberpunk-themed dark layout with neon accents',
        preview: 'https://placehold.co/400x200/000000/00ffff?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-style dark theme with command interface',
        preview: 'https://placehold.co/400x200/000000/00ff00?text=Dark+Terminal',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    grid: {
        // Fields for Projects1 - simple grid cards (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-b from-orange-50 via-yellow-50 to-orange-50', label: 'Warm Canvas' },
                { value: 'bg-gradient-to-b from-blue-50 via-indigo-50 to-blue-50', label: 'Cool Palette' },
                { value: 'bg-gradient-to-b from-gray-50 via-stone-50 to-gray-50', label: 'Neutral Studio' },
                { value: 'bg-gradient-to-b from-emerald-50 via-teal-50 to-emerald-50', label: 'Fresh Green' },
                { value: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50', label: 'Artistic Pink' },
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
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                category: { type: 'text', label: 'Project Category' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x200',
                technologies: 'React, JavaScript',
                category: 'Web Development',
            },
        },
    },
    showcase: {
        // Fields for Projects2 - detailed showcase (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                category: { type: 'text', label: 'Project Category' },
                duration: { type: 'text', label: 'Project Duration' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x200',
                technologies: 'React, JavaScript',
                category: 'Web Development',
                duration: '3 months',
            },
        },
    },
    darkCyber: {
        // Fields for Projects3 - cyber theme with accent colors (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        email: { type: 'text', label: 'Contact Email' },
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
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                features: { type: 'text', label: 'Key Features (comma-separated)' },
                status: {
                    type: 'select',
                    label: 'Project Status',
                    options: [
                        { value: 'completed', label: 'Completed' },
                        { value: 'in-progress', label: 'In Progress' },
                        { value: 'beta', label: 'Beta' },
                    ],
                },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x200',
                technologies: 'React, JavaScript',
                features: 'Responsive design, Modern UI, Secure',
                status: 'completed',
            },
        },
    },
    darkTerminal: {
        // Fields for Projects4 - terminal theme (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        email: { type: 'text', label: 'Contact Email' },
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
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                command: { type: 'text', label: 'Terminal Command' },
                setupSteps: { type: 'textarea', label: 'Setup Steps' },
                codeLanguage: { type: 'text', label: 'Primary Language' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x200',
                technologies: 'React, JavaScript',
                command: 'npm start',
                setupSteps: 'npm install\nnpm start',
                codeLanguage: 'JavaScript',
            },
        },
    },
};

const ProjectsCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'grid' } = data.props || {};

        console.log('🔧 DEBUG: Projects resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={projectsTemplateOptions} category="Projects" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.grid;

        console.log('🔧 DEBUG: Resolved fields for Projects template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'grid',
        title: 'Featured Projects',
        subtitle: 'A collection of projects that showcase my skills and creativity',
        backgroundColor: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50',
        accentColor: 'orange',
        email: 'artist@example.com',
        terminalTheme: 'matrix',
        projects: [
            {
                title: 'Ethereal Dreams',
                description: 'Abstract digital painting exploring the subconscious mind through vibrant colors and flowing forms.',
                image: 'https://placehold.co/400x300/F59E0B/FFFFFF?text=Ethereal+Dreams',
                technologies: 'Digital Art, Photoshop, Procreate',
                category: 'Digital Art',
                status: 'completed',
                command: 'npm run dev',
                setupSteps: 'npm install\nnpm run dev',
            },
            {
                title: 'Urban Symphony',
                description: 'Mixed media installation capturing the rhythm and energy of city life through dynamic compositions.',
                image: 'https://placehold.co/400x300/F59E0B/FFFFFF?text=Urban+Symphony',
                technologies: 'Mixed Media, Acrylic, Digital',
                category: 'Installation',
                status: 'completed',
                command: 'npm start',
                setupSteps: 'npm install\nnpm start',
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = projectsTemplates[template] || Projects1;
        console.log('🔧 DEBUG: Projects template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...ProjectsCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Projects merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default ProjectsCategory;
