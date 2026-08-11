import React from 'react';
import Hero1 from './Hero1';
import Hero2 from './Hero2';
import Hero3 from './Hero3';
import Hero4 from './Hero4';
import Hero5 from './Hero5';
import Hero6 from './Hero6';
import Hero7 from './Hero7';
import { TemplateSelector } from './TemplateModal';

const heroTemplates = {
    classic: Hero1,
    split: Hero2,
    minimal: Hero3,
    darkCyber: Hero4,
    darkTerminal: Hero5,
    artist: Hero6,
    darkCyberSec: Hero7,
};

const heroTemplateOptions = [
    {
        id: 'classic',
        name: 'Classic Hero',
        description: 'Centered layout with circular profile image',
        preview: 'https://placehold.co/400x200/3B82F6/white?text=Classic+Hero',
    },
    {
        id: 'split',
        name: 'Split Layout',
        description: 'Side-by-side layout with gradient backgrounds',
        preview: 'https://placehold.co/400x200/8B5CF6/white?text=Split+Layout',
    },
    {
        id: 'minimal',
        name: 'Minimal Typography',
        description: 'Clean, typography-focused design',
        preview: 'https://placehold.co/400x200/6B7280/white?text=Minimal+Typography',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Dark theme with neon accents and futuristic design',
        preview: 'https://placehold.co/400x200/111827/00FFFF?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Terminal-inspired dark theme with code aesthetics',
        preview: 'https://placehold.co/400x200/000000/00FF00?text=Dark+Terminal',
    },
    {
        id: 'artist',
        name: 'Artist Portfolio',
        description: 'Creative layout designed for artists with artwork gallery',
        preview: 'https://placehold.co/400x200/F59E0B/white?text=Artist+Portfolio',
    },
    {
        id: 'darkCyberSec',
        name: 'Dark Cyber Security',
        description: 'Dark creative theme designed for cyber security professionals',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Cyber+Security',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    classic: {
        // Basic fields for Hero1
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900', label: 'Dark Purple' },
                { value: 'bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900', label: 'Deep Blue' },
                { value: 'bg-gradient-to-br from-emerald-900 via-teal-800 to-green-900', label: 'Deep Green' },
                { value: 'bg-gradient-to-br from-gray-900 via-gray-800 to-black', label: 'Charcoal' },
            ],
        },
    },
    split: {
        // Fields for Hero2 - includes statistics and CTA buttons
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50', label: 'Light Blue' },
                { value: 'bg-gradient-to-br from-rose-50 via-white to-teal-50', label: 'Warm White' },
                { value: 'bg-gradient-to-br from-violet-50 via-white to-pink-50', label: 'Soft Purple' },
                { value: 'bg-gradient-to-br from-slate-50 via-white to-gray-50', label: 'Clean Gray' },
            ],
        },
        // Statistics fields
        yearsCount: { type: 'text', label: 'Years Count' },
        yearsLabel: { type: 'text', label: 'Years Label' },
        projectsCount: { type: 'text', label: 'Projects Count' },
        projectsLabel: { type: 'text', label: 'Projects Label' },
        clientsCount: { type: 'text', label: 'Clients Count' },
        clientsLabel: { type: 'text', label: 'Clients Label' },
        // CTA Buttons
        primaryButtonText: { type: 'text', label: 'Primary Button Text' },
        secondaryButtonText: { type: 'text', label: 'Secondary Button Text' },
    },
    minimal: {
        // Fields for Hero3 - includes expertise and email
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        expertise: {
            type: 'text',
            label: 'Expertise (comma separated)',
            placeholder: 'React, Node.js, TypeScript, AWS, Leadership',
        },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-white', label: 'Pure White' },
                { value: 'bg-gray-50', label: 'Soft Gray' },
                { value: 'bg-slate-50', label: 'Slate' },
                { value: 'bg-zinc-950', label: 'Dark Mode' },
            ],
        },
    },
    darkCyber: {
        // Fields for Hero4 - includes accent color and statistics
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
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
        // Statistics fields
        yearsCount: { type: 'text', label: 'Years Count' },
        yearsLabel: { type: 'text', label: 'Years Label' },
        projectsCount: { type: 'text', label: 'Projects Count' },
        projectsLabel: { type: 'text', label: 'Projects Label' },
        clientsCount: { type: 'text', label: 'Clients Count' },
        clientsLabel: { type: 'text', label: 'Clients Label' },
        secondaryButtonText: { type: 'text', label: 'Contact Button Text' },
    },
    darkTerminal: {
        // Fields for Hero5 - includes terminal theme and terminal stats
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
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
        linesOfCode: { type: 'text', label: 'Lines of Code' },
        coffeeConsumed: { type: 'text', label: 'Coffee Consumed' },
        bugsFixed: { type: 'text', label: 'Bugs Fixed' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        secondaryButtonText: { type: 'text', label: 'Download CV Button Text' },
    },
    artist: {
        // Fields for Hero6 - includes artwork images and artist-specific stats
        name: { type: 'text', label: 'Artist Name' },
        title: { type: 'text', label: 'Art Specialization' },
        description: { type: 'textarea', label: 'Artist Bio' },
        image: { type: 'text', label: 'Portrait Image URL' },
        artworkImage1: { type: 'text', label: 'Featured Artwork 1 URL' },
        artworkImage2: { type: 'text', label: 'Featured Artwork 2 URL' },
        artworkImage3: { type: 'text', label: 'Featured Artwork 3 URL' },
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
        // Artist-specific fields
        yearsActive: { type: 'text', label: 'Years Active' },
        artworkCount: { type: 'text', label: 'Artworks Created' },
        exhibitionsCount: { type: 'text', label: 'Exhibitions' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        secondaryButtonText: { type: 'text', label: 'Secondary Button Text' },
    },
    darkCyberSec: {
        // Fields for Hero7 - Cyber Security Professional theme
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Cyber Security Role' },
        description: { type: 'textarea', label: 'Professional Bio' },
        image: { type: 'text', label: 'Profile Image URL' },
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
        // Cyber Security specific fields
        securityCerts: { type: 'text', label: 'Security Certifications Count' },
        threatsBlocked: { type: 'text', label: 'Threats Blocked' },
        systemsSecured: { type: 'text', label: 'Systems Secured' },
        vulnerabilitiesFound: { type: 'text', label: 'Vulnerabilities Discovered' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        specialization: { type: 'text', label: 'Security Specialization' },
        yearsExperience: { type: 'text', label: 'Years of Experience' },
    },
};

const HeroCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'classic' } = data.props || {};

        console.log('🔧 DEBUG: Hero resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={heroTemplateOptions} category="Hero" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.classic;

        console.log('🔧 DEBUG: Resolved fields for template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'classic',
        name: 'John Doe',
        title: 'Full Stack Developer',
        description: 'Passionate developer with 5+ years of experience creating amazing web applications.',
        image: 'https://placehold.co/200x200',
        email: 'hello@johndoe.dev',
        expertise: 'React, Node.js, TypeScript, AWS, Leadership',
        backgroundColor: 'bg-blue-600',
        // Statistics defaults (from Hero2)
        yearsCount: '5+',
        yearsLabel: 'Years',
        projectsCount: '50+',
        projectsLabel: 'Projects',
        clientsCount: '20+',
        clientsLabel: 'Clients',
        // CTA Buttons defaults (from Hero2)
        primaryButtonText: 'View Portfolio',
        secondaryButtonText: 'Download CV',
        // Dark theme defaults (from Hero4)
        accentColor: 'cyan',
        // Terminal theme defaults (from Hero5)
        terminalTheme: 'matrix',
        linesOfCode: '500K+',
        coffeeConsumed: '2.5K',
        bugsFixed: '999+',
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = heroTemplates[template] || Hero1;
        console.log('🔧 DEBUG: Hero template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...HeroCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        // Convert expertise array to comma-separated string for Hero3 compatibility
        if (templateProps.expertise && Array.isArray(templateProps.expertise)) {
            // Check if expertise items are objects (new format) or strings (old format)
            if (templateProps.expertise.length > 0 && typeof templateProps.expertise[0] === 'object') {
                // New format: extract names from skill objects
                templateProps.expertise = templateProps.expertise.map((skill) => skill.name).join(', ');
            } else {
                // Old format: join strings directly
                templateProps.expertise = templateProps.expertise.join(', ');
            }
        }

        console.log('🔧 DEBUG: Hero merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default HeroCategory;
