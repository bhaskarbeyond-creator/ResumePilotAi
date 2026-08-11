import React from 'react';
import Awards1 from './Awards1';
import Awards2 from './Awards2';
import { TemplateSelector } from './TemplateModal';

const awardsTemplates = {
    showcase: Awards1,
    timeline: Awards2,
};

const awardsTemplateOptions = [
    {
        id: 'showcase',
        name: 'Awards Showcase',
        description: 'Trophy-style showcase of achievements',
        preview: 'https://placehold.co/400x200/F59E0B/white?text=Awards+Showcase',
    },
    {
        id: 'timeline',
        name: 'Achievement Timeline',
        description: 'Chronological timeline of awards',
        preview: 'https://placehold.co/400x200/DC2626/white?text=Achievement+Timeline',
    },
];

const AwardsCategory = {
    fields: {
        template: {
            type: 'custom',
            label: 'Template',
            render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={awardsTemplateOptions} category="Awards" />,
        },
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-yellow-50', label: 'Light Yellow' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Dark Cyber' },
                { value: 'bg-blue-50', label: 'Light Blue' },
                { value: 'bg-purple-50', label: 'Light Purple' },
                { value: 'bg-gray-50', label: 'Light Gray' },
            ],
        },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'yellow', label: 'Yellow' },
                { value: 'cyan', label: 'Cyan (Cyber Theme)' },
                { value: 'blue', label: 'Blue' },
                { value: 'purple', label: 'Purple' },
            ],
        },
        awards: {
            type: 'array',
            label: 'Awards & Achievements',
            getItemSummary: (item) => `${item.title} - ${item.organization}`,
            arrayFields: {
                title: { type: 'text', label: 'Award Title' },
                organization: { type: 'text', label: 'Awarding Organization' },
                date: { type: 'text', label: 'Date Received' },
                description: { type: 'textarea', label: 'Achievement Description' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'professional', label: 'Professional' },
                        { value: 'academic', label: 'Academic' },
                        { value: 'competition', label: 'Competition' },
                        { value: 'recognition', label: 'Recognition' },
                        { value: 'certification', label: 'Certification' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Trophy Emoji' },
                certificateUrl: { type: 'text', label: 'Certificate URL (Optional)' },
                image: { type: 'text', label: 'Award Image/Logo (Optional)' },
            },
            defaultItemProps: {
                title: 'Award Title',
                organization: 'Organization Name',
                date: '2023',
                description: 'Description of the achievement and its significance.',
                category: 'professional',
                icon: '🏆',
                certificateUrl: '',
                image: 'https://placehold.co/80x80',
            },
        },
    },
    defaultProps: {
        template: 'showcase',
        title: 'Awards & Recognition',
        subtitle: 'Achievements and accolades throughout my career',
        backgroundColor: 'bg-yellow-50',
        accentColor: 'yellow',
        awards: [
            {
                title: 'Developer of the Year',
                organization: 'Tech Innovation Awards',
                date: '2023',
                description: 'Recognized for outstanding contributions to open-source projects and innovative solutions.',
                category: 'professional',
                icon: '🏆',
                certificateUrl: '',
                image: 'https://placehold.co/80x80',
            },
            {
                title: 'Best UI/UX Design',
                organization: 'Design Excellence Awards',
                date: '2022',
                description: 'Awarded for exceptional user interface design in mobile application development.',
                category: 'competition',
                icon: '🥇',
                certificateUrl: '',
                image: 'https://placehold.co/80x80',
            },
            {
                title: 'Hackathon Winner',
                organization: 'Global Code Challenge',
                date: '2022',
                description: 'First place in international hackathon with innovative blockchain solution.',
                category: 'competition',
                icon: '🚀',
                certificateUrl: '',
                image: 'https://placehold.co/80x80',
            },
            {
                title: 'Team Leadership Excellence',
                organization: 'Company Annual Awards',
                date: '2021',
                description: 'Recognized for exceptional team leadership and project management skills.',
                category: 'professional',
                icon: '⭐',
                certificateUrl: '',
                image: 'https://placehold.co/80x80',
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = awardsTemplates[template] || Awards1;
        return SelectedTemplate.render(props);
    },
};

export default AwardsCategory;
