import React from 'react';
import Testimonials1 from './Testimonials1';
import Testimonials2 from './Testimonials2';
import { TemplateSelector } from './TemplateModal';

const testimonialsTemplates = {
    slider: Testimonials1,
    grid: Testimonials2,
};

const testimonialsTemplateOptions = [
    {
        id: 'slider',
        name: 'Testimonial Slider',
        description: 'Carousel slider with testimonials',
        preview: 'https://placehold.co/400x200/EC4899/white?text=Testimonial+Slider',
    },
    {
        id: 'grid',
        name: 'Grid Layout',
        description: 'Grid layout with client testimonials',
        preview: 'https://placehold.co/400x200/14B8A6/white?text=Grid+Layout',
    },
];

const TestimonialsCategory = {
    fields: {
        template: {
            type: 'custom',
            label: 'Template',
            render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={testimonialsTemplateOptions} category="Testimonials" />,
        },
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        testimonials: {
            type: 'array',
            label: 'Testimonials',
            getItemSummary: (item) => `${item.name} - ${item.company}`,
            arrayFields: {
                name: { type: 'text', label: 'Client Name' },
                position: { type: 'text', label: 'Position/Title' },
                company: { type: 'text', label: 'Company' },
                testimonial: { type: 'textarea', label: 'Testimonial Text' },
                rating: {
                    type: 'select',
                    label: 'Rating',
                    options: [
                        { value: 5, label: '5 Stars' },
                        { value: 4, label: '4 Stars' },
                        { value: 3, label: '3 Stars' },
                        { value: 2, label: '2 Stars' },
                        { value: 1, label: '1 Star' },
                    ],
                },
                avatar: { type: 'text', label: 'Client Photo URL' },
                project: { type: 'text', label: 'Project/Service' },
            },
            defaultItemProps: {
                name: 'Client Name',
                position: 'CEO',
                company: 'Company Name',
                testimonial: 'This is an amazing testimonial about the work done.',
                rating: 5,
                avatar: 'https://placehold.co/60x60',
                project: 'Web Development',
            },
        },
    },
    defaultProps: {
        template: 'slider',
        title: 'Testimonials',
        subtitle: 'What my clients say about working with me',
        testimonials: [
            {
                name: 'Sarah Johnson',
                position: 'Marketing Director',
                company: 'TechStart Inc.',
                testimonial: 'Working with John was an absolute pleasure. He delivered our project on time and exceeded our expectations. The attention to detail and professionalism was outstanding.',
                rating: 5,
                avatar: 'https://placehold.co/60x60',
                project: 'E-commerce Website',
            },
            {
                name: 'Michael Chen',
                position: 'Founder',
                company: 'Digital Solutions',
                testimonial: 'Excellent work on our mobile app. The user interface is intuitive and the performance is flawless. Highly recommend for any development project.',
                rating: 5,
                avatar: 'https://placehold.co/60x60',
                project: 'Mobile App Development',
            },
            {
                name: 'Emily Davis',
                position: 'Product Manager',
                company: 'InnovateCorp',
                testimonial: 'The redesign of our website was exactly what we needed. Great communication throughout the project and delivered beautiful results.',
                rating: 5,
                avatar: 'https://placehold.co/60x60',
                project: 'Website Redesign',
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = testimonialsTemplates[template] || Testimonials1;
        return SelectedTemplate.render(props);
    },
};

export default TestimonialsCategory;
