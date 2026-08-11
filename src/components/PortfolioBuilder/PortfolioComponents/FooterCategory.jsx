import React from 'react';
import Footer1 from './Footer1';
import Footer2 from './Footer2';
import Footer3 from './Footer3';
import Footer4 from './Footer4';
import { TemplateSelector } from './TemplateModal';

const footerTemplates = {
    detailed: Footer1,
    minimal: Footer2,
    darkCyber: Footer3,
    darkTerminal: Footer4,
};

const footerTemplateOptions = [
    {
        id: 'detailed',
        name: 'Detailed Footer',
        description: 'Multi-column layout with company info, links, and contact details',
        preview: 'https://placehold.co/400x200/374151/white?text=Detailed+Footer',
    },
    {
        id: 'minimal',
        name: 'Minimal Footer',
        description: 'Centered layout with social links and simple contact info',
        preview: 'https://placehold.co/400x200/6B7280/white?text=Minimal+Footer',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Cyberpunk-themed dark footer with neon accents and code styling',
        preview: 'https://placehold.co/400x200/000000/00ffff?text=Dark+Cyber+Footer',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-style dark footer with command interface',
        preview: 'https://placehold.co/400x200/000000/00ff00?text=Dark+Terminal+Footer',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    detailed: {
        // Fields for Footer1 - detailed multi-column layout
        companyName: { type: 'text', label: 'Company/Name' },
        description: { type: 'textarea', label: 'Description' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        address: { type: 'textarea', label: 'Address' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        quickLinks: { type: 'textarea', label: 'Quick Links (one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-gray-800', label: 'Dark Gray' },
                { value: 'bg-gray-900', label: 'Darker Gray' },
                { value: 'bg-black', label: 'Black' },
                { value: 'bg-blue-800', label: 'Dark Blue' },
                { value: 'bg-purple-800', label: 'Dark Purple' },
                { value: 'bg-gradient-to-r from-gray-800 to-gray-900', label: 'Dark Gradient' },
                { value: 'bg-gradient-to-r from-blue-800 to-purple-800', label: 'Blue to Purple Gradient' },
                { value: 'bg-gradient-to-r from-purple-800 to-pink-800', label: 'Purple to Pink Gradient' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-white', label: 'White' },
                { value: 'text-gray-300', label: 'Light Gray' },
                { value: 'text-blue-200', label: 'Light Blue' },
            ],
        },
    },
    minimal: {
        // Fields for Footer2 - minimal centered layout
        companyName: { type: 'text', label: 'Company/Name' },
        tagline: { type: 'text', label: 'Tagline' },
        email: { type: 'text', label: 'Email' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-white', label: 'White' },
                { value: 'bg-gray-50', label: 'Light Gray' },
                { value: 'bg-gray-100', label: 'Gray' },
                { value: 'bg-blue-50', label: 'Light Blue' },
                { value: 'bg-gradient-to-r from-gray-50 to-gray-100', label: 'Light Gradient' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-gray-800', label: 'Dark Gray' },
                { value: 'text-gray-600', label: 'Medium Gray' },
                { value: 'text-blue-800', label: 'Dark Blue' },
            ],
        },
    },
    darkCyber: {
        // Fields for Footer3 - dark cyber theme
        companyName: { type: 'text', label: 'Company/Name' },
        description: { type: 'textarea', label: 'Description' },
        tagline: { type: 'text', label: 'Tagline' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        quickLinks: { type: 'textarea', label: 'Quick Links (one per line)' },
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
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
            ],
        },
    },
    darkTerminal: {
        // Fields for Footer4 - terminal theme
        companyName: { type: 'text', label: 'Company/Name' },
        description: { type: 'textarea', label: 'Description' },
        tagline: { type: 'text', label: 'Tagline' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        address: { type: 'textarea', label: 'Address/Location' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        quickLinks: { type: 'textarea', label: 'Quick Links (one per line)' },
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
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gray-900', label: 'Dark Gray' },
                { value: 'bg-slate-900', label: 'Slate Terminal' },
                { value: 'bg-zinc-900', label: 'Zinc Dark' },
            ],
        },
    },
};

const FooterCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'detailed' } = data.props || {};

        console.log('🔧 DEBUG: Footer resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={footerTemplateOptions} category="Footer" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.detailed;

        console.log('🔧 DEBUG: Resolved fields for Footer template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'detailed',
        companyName: 'Portfolio',
        description: 'Building amazing digital experiences with passion and creativity.',
        tagline: 'Creating digital experiences that matter',
        email: 'contact@portfolio.com',
        phone: '+1 (555) 123-4567',
        address: '123 Main Street\nNew York, NY 10001',
        socialLinks: 'LinkedIn|https://linkedin.com\nGitHub|https://github.com\nTwitter|https://twitter.com',
        quickLinks: 'About\nServices\nProjects\nContact',
        backgroundColor: 'bg-gray-800',
        textColor: 'text-white',
        accentColor: 'cyan',
        terminalTheme: 'matrix',
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = footerTemplates[template] || Footer1;
        console.log('🔧 DEBUG: Footer template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...FooterCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Footer merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default FooterCategory;
