import React from 'react';
import Services1 from './Services1';
import Services2 from './Services2';
import { TemplateSelector } from './TemplateModal';

const servicesTemplates = {
    cards: Services1,
    pricing: Services2,
};

const servicesTemplateOptions = [
    {
        id: 'cards',
        name: 'Service Cards',
        description: 'Clean cards showcasing your services',
        preview: 'https://placehold.co/400x200/7C3AED/white?text=Service+Cards',
    },
    {
        id: 'pricing',
        name: 'Pricing Table',
        description: 'Services with pricing and features',
        preview: 'https://placehold.co/400x200/F59E0B/white?text=Pricing+Table',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    cards: {
        // Fields for Services1 - service cards
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        services: {
            type: 'array',
            label: 'Services',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Service Title' },
                description: { type: 'textarea', label: 'Service Description' },
                icon: { type: 'text', label: 'Icon/Emoji' },
                features: {
                    type: 'array',
                    label: 'Features/Deliverables',
                    arrayFields: {
                        feature: { type: 'text', label: 'Feature' },
                    },
                    defaultItemProps: {
                        feature: 'New feature',
                    },
                },
            },
            defaultItemProps: {
                title: 'Service Name',
                description: 'Description of the service you provide.',
                icon: '💼',
                features: [{ feature: 'Feature 1' }, { feature: 'Feature 2' }, { feature: 'Feature 3' }],
            },
        },
    },
    pricing: {
        // Fields for Services2 - pricing table with prices
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        services: {
            type: 'array',
            label: 'Services',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Service Title' },
                description: { type: 'textarea', label: 'Service Description' },
                icon: { type: 'text', label: 'Icon/Emoji' },
                price: { type: 'text', label: 'Price' },
                duration: { type: 'text', label: 'Duration/Timeline' },
                features: {
                    type: 'array',
                    label: 'Features/Deliverables',
                    arrayFields: {
                        feature: { type: 'text', label: 'Feature' },
                    },
                    defaultItemProps: {
                        feature: 'New feature',
                    },
                },
                popular: { type: 'checkbox', label: 'Mark as Popular' },
            },
            defaultItemProps: {
                title: 'Service Name',
                description: 'Description of the service you provide.',
                icon: '💼',
                price: '$500',
                duration: '2-3 weeks',
                features: [{ feature: 'Feature 1' }, { feature: 'Feature 2' }, { feature: 'Feature 3' }],
                popular: false,
            },
        },
    },
};

const ServicesCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'cards' } = data.props || {};
        
        console.log('🔧 DEBUG: Services resolveFields called with template:', template);
        
        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => 
                    <TemplateSelector 
                        value={value} 
                        onChange={onChange} 
                        templates={servicesTemplateOptions} 
                        category="Services" 
                    />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.cards;
        
        console.log('🔧 DEBUG: Resolved fields for Services template:', template, Object.keys(templateFields));
        
        return {
            ...baseFields,
            ...templateFields,
        };
    },
    
    defaultProps: {
        template: 'cards',
        title: 'Services',
        subtitle: 'What I can help you with',
        services: [
            {
                title: 'Web Development',
                description: 'Full-stack web development using modern technologies.',
                icon: '🌐',
                price: 'Starting at $2,000',
                duration: '2-4 weeks',
                features: [
                    { feature: 'Responsive Design' },
                    { feature: 'Modern Framework (React/Vue)' },
                    { feature: 'Database Integration' },
                    { feature: 'Performance Optimization' },
                    { feature: '30 days support' },
                ],
                popular: true,
            },
            {
                title: 'UI/UX Design',
                description: 'Beautiful and intuitive user interface design.',
                icon: '🎨',
                price: 'Starting at $800',
                duration: '1-2 weeks',
                features: [{ feature: 'User Research' }, { feature: 'Wireframes & Mockups' }, { feature: 'Interactive Prototypes' }, { feature: 'Design System' }, { feature: 'Unlimited Revisions' }],
                popular: false,
            },
            {
                title: 'Consulting',
                description: 'Technical consulting and code review services.',
                icon: '💡',
                price: '$150/hour',
                duration: 'Flexible',
                features: [{ feature: 'Code Review' }, { feature: 'Architecture Planning' }, { feature: 'Performance Audit' }, { feature: 'Team Training' }, { feature: 'Best Practices' }],
                popular: false,
            },
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = servicesTemplates[template] || Services1;
        console.log('🔧 DEBUG: Services template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...ServicesCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Services merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default ServicesCategory;
