import React from 'react';
import Education1 from './Education1';
import Education2 from './Education2';
import { TemplateSelector } from './TemplateModal';

const educationTemplates = {
    timeline: Education1,
    cards: Education2,
};

const educationTemplateOptions = [
    {
        id: 'timeline',
        name: 'Education Timeline',
        description: 'Timeline view of education and certifications',
        preview: 'https://placehold.co/400x200/1F2937/white?text=Education+Timeline',
    },
    {
        id: 'cards',
        name: 'Education Cards',
        description: 'Card-based layout with institution logos',
        preview: 'https://placehold.co/400x200/16A34A/white?text=Education+Cards',
    },
];

const EducationCategory = {
    fields: {
        template: {
            type: 'custom',
            label: 'Template',
            render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={educationTemplateOptions} category="Education" />,
        },
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        education: {
            type: 'array',
            label: 'Education & Certifications',
            getItemSummary: (item) => `${item.degree} - ${item.institution}`,
            arrayFields: {
                type: {
                    type: 'select',
                    label: 'Type',
                    options: [
                        { value: 'degree', label: 'Degree' },
                        { value: 'certification', label: 'Certification' },
                        { value: 'course', label: 'Course' },
                        { value: 'bootcamp', label: 'Bootcamp' },
                    ],
                },
                degree: { type: 'text', label: 'Degree/Certification Name' },
                field: { type: 'text', label: 'Field of Study' },
                institution: { type: 'text', label: 'Institution/Provider' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date' },
                gpa: { type: 'text', label: 'GPA/Grade (Optional)' },
                description: { type: 'textarea', label: 'Description/Achievements' },
                logo: { type: 'text', label: 'Institution Logo URL (Optional)' },
                credentialUrl: { type: 'text', label: 'Credential/Certificate URL (Optional)' },
            },
            defaultItemProps: {
                type: 'degree',
                degree: 'Bachelor of Science',
                field: 'Computer Science',
                institution: 'University Name',
                location: 'City, Country',
                startDate: '2018',
                endDate: '2022',
                gpa: '',
                description: 'Relevant coursework and achievements.',
                logo: 'https://placehold.co/60x60',
                credentialUrl: '',
            },
        },
    },
    defaultProps: {
        template: 'timeline',
        title: 'Education & Certifications',
        subtitle: 'My academic background and professional development',
        education: [
            {
                type: 'degree',
                degree: 'Bachelor of Science',
                field: 'Computer Science',
                institution: 'Stanford University',
                location: 'Stanford, CA',
                startDate: '2018',
                endDate: '2022',
                gpa: '3.8/4.0',
                description: "Specialized in software engineering and artificial intelligence. Dean's List for 3 consecutive years.",
                logo: 'https://placehold.co/60x60',
                credentialUrl: '',
            },
            {
                type: 'certification',
                degree: 'AWS Solutions Architect',
                field: 'Cloud Computing',
                institution: 'Amazon Web Services',
                location: 'Online',
                startDate: '2023',
                endDate: '2023',
                gpa: '',
                description: 'Professional certification in designing distributed systems on AWS platform.',
                logo: 'https://placehold.co/60x60',
                credentialUrl: 'https://aws.amazon.com/certification/',
            },
            {
                type: 'course',
                degree: 'Full Stack Web Development',
                field: 'Web Development',
                institution: 'FreeCodeCamp',
                location: 'Online',
                startDate: '2020',
                endDate: '2021',
                gpa: '',
                description: 'Comprehensive course covering HTML, CSS, JavaScript, React, Node.js, and databases.',
                logo: 'https://placehold.co/60x60',
                credentialUrl: 'https://freecodecamp.org',
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = educationTemplates[template] || Education1;
        return SelectedTemplate.render(props);
    },
};

export default EducationCategory;
