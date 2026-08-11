import React from 'react';
import Resume1 from './Resume1';
import Resume2 from './Resume2';
import { TemplateSelector } from './TemplateModal';

const resumeTemplates = {
    simple: Resume1,
    detailed: Resume2,
};

const resumeTemplateOptions = [
    {
        id: 'simple',
        name: 'Simple Resume',
        description: 'Clean download section with preview',
        preview: 'https://placehold.co/400x200/374151/white?text=Simple+Resume',
    },
    {
        id: 'detailed',
        name: 'Detailed Resume',
        description: 'Resume with skills overview and stats',
        preview: 'https://placehold.co/400x200/0F172A/white?text=Detailed+Resume',
    },
];

const ResumeCategory = {
    fields: {
        template: {
            type: 'custom',
            label: 'Template',
            render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={resumeTemplateOptions} category="Resume" />,
        },
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        description: { type: 'textarea', label: 'Description' },
        resumeUrl: { type: 'text', label: 'Resume PDF URL' },
        resumePreview: { type: 'text', label: 'Resume Preview Image URL (Optional)' },
        downloadText: { type: 'text', label: 'Download Button Text' },
        stats: {
            type: 'array',
            label: 'Quick Stats (Optional)',
            getItemSummary: (item) => `${item.label}: ${item.value}`,
            arrayFields: {
                label: { type: 'text', label: 'Stat Label' },
                value: { type: 'text', label: 'Stat Value' },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                label: 'Years Experience',
                value: '5+',
                icon: '💼',
            },
        },
        highlights: {
            type: 'array',
            label: 'Key Highlights',
            getItemSummary: (item) => item.highlight,
            arrayFields: {
                highlight: { type: 'text', label: 'Highlight' },
            },
            defaultItemProps: {
                highlight: 'Professional achievement or skill',
            },
        },
    },
    defaultProps: {
        template: 'simple',
        title: 'Resume',
        subtitle: 'Download my detailed resume',
        description: 'Get a comprehensive overview of my professional experience, skills, and achievements.',
        resumeUrl: '/resume.pdf',
        resumePreview: 'https://placehold.co/300x400/F3F4F6/1F2937?text=Resume+Preview',
        downloadText: 'Download Resume',
        stats: [
            { label: 'Years Experience', value: '5+', icon: '💼' },
            { label: 'Projects Completed', value: '50+', icon: '🚀' },
            { label: 'Technologies', value: '20+', icon: '⚡' },
            { label: 'Clients Served', value: '25+', icon: '🤝' },
        ],
        highlights: [
            { highlight: 'Full-stack development expertise' },
            { highlight: 'Team leadership experience' },
            { highlight: 'Agile methodology proficiency' },
            { highlight: 'Client relationship management' },
            { highlight: 'Performance optimization specialist' },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = resumeTemplates[template] || Resume1;
        return SelectedTemplate.render(props);
    },
};

export default ResumeCategory;
