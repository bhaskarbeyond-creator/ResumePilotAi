import React from 'react';
import Navbar1 from './Navbar1';
import Navbar2 from './Navbar2';
import NavbarDarkCyber from './NavbarDarkCyber';
import NavbarDarkTerminal from './NavbarDarkTerminal';
import NavbarDarkCyberSec from './NavbarDarkCyberSec';
import { TemplateSelector } from './TemplateModal';

const navbarTemplates = {
    horizontal: Navbar1,
    centered: Navbar2,
    darkCyber: NavbarDarkCyber,
    darkTerminal: NavbarDarkTerminal,
    darkCyberSec: NavbarDarkCyberSec,
};

const navbarTemplateOptions = [
    {
        id: 'horizontal',
        name: 'Modern Horizontal',
        description: 'Enhanced horizontal layout with glass effect and modern gradients',
        preview: 'https://placehold.co/400x200/3B82F6/white?text=Modern+Horizontal',
    },
    {
        id: 'centered',
        name: 'Elegant Centered',
        description: 'Beautiful centered layout with floating elements and smooth animations',
        preview: 'https://placehold.co/400x200/8B5CF6/white?text=Elegant+Centered',
    },
    {
        id: 'darkCyber',
        name: 'Dark Cyber',
        description: 'Futuristic cyberpunk navbar with neon accents and glitch effects',
        preview: 'https://placehold.co/400x200/000000/00FFFF?text=Dark+Cyber',
    },
    {
        id: 'darkTerminal',
        name: 'Dark Terminal',
        description: 'Command-line inspired navbar with terminal aesthetics and matrix theme',
        preview: 'https://placehold.co/400x200/000000/00FF00?text=Dark+Terminal',
    },
    {
        id: 'darkCyberSec',
        name: 'Dark Cyber Security',
        description: 'Professional security navbar with encrypted design and threat indicators',
        preview: 'https://placehold.co/400x200/000000/FF0000?text=Cyber+Security',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    horizontal: {
        // Fields for Navbar1 - horizontal layout
        logoText: {
            type: 'text',
            label: 'Logo Text',
            placeholder: 'Your Brand Name',
        },
        logoImage: {
            type: 'text',
            label: 'Logo Image URL (optional)',
            placeholder: 'https://example.com/logo.png',
        },
        menuItems: {
            type: 'textarea',
            label: 'Menu Items (one per line)',
            placeholder: 'Home\nAbout\nServices\nPortfolio\nContact',
        },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                // Light Glass Effects
                { value: 'bg-white/95 backdrop-blur-md border-b border-gray-100/50', label: '🤍 Glass White' },
                { value: 'bg-gradient-to-r from-blue-50/95 via-white/95 to-purple-50/95 backdrop-blur-md border-b border-blue-100/30', label: '💙 Soft Blue Glass' },
                { value: 'bg-gradient-to-br from-indigo-50/95 via-white/95 to-cyan-50/95 backdrop-blur-md border-b border-indigo-100/30', label: '🔵 Indigo Cyan Glass' },
                { value: 'bg-gradient-to-br from-rose-50/95 via-white/95 to-teal-50/95 backdrop-blur-md border-b border-rose-100/30', label: '🌹 Warm Glass' },
                { value: 'bg-gradient-to-br from-violet-50/95 via-white/95 to-pink-50/95 backdrop-blur-md border-b border-violet-100/30', label: '💜 Purple Pink Glass' },

                // Vibrant Glass Effects
                { value: 'bg-gradient-to-r from-indigo-600/95 to-purple-600/95 backdrop-blur-md', label: '🎨 Blue Purple Glass' },
                { value: 'bg-gradient-to-r from-emerald-500/95 to-cyan-500/95 backdrop-blur-md', label: '🌊 Emerald Cyan Glass' },
                { value: 'bg-gradient-to-r from-orange-500/95 to-pink-500/95 backdrop-blur-md', label: '🌅 Sunset Glass' },

                // Dark Glass Effects
                { value: 'bg-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: '🌙 Dark Glass' },
                { value: 'bg-gradient-to-r from-slate-900/95 to-gray-900/95 backdrop-blur-md', label: '⚫ Dark Gradient Glass' },
                { value: 'bg-gradient-to-r from-gray-800/95 to-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: '🔳 Charcoal Glass' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-gray-800', label: '⚫ Dark Gray' },
                { value: 'text-white', label: '⚪ White' },
                { value: 'text-blue-600', label: '🔵 Blue' },
                { value: 'text-gray-600', label: '🔘 Medium Gray' },
                { value: 'text-purple-600', label: '🟣 Purple' },
                { value: 'text-emerald-600', label: '🟢 Emerald' },
            ],
        },
    },
    centered: {
        // Fields for Navbar2 - centered layout (same fields)
        logoText: {
            type: 'text',
            label: 'Logo Text',
            placeholder: 'Your Brand Name',
        },
        logoImage: {
            type: 'text',
            label: 'Logo Image URL (optional)',
            placeholder: 'https://example.com/logo.png',
        },
        menuItems: {
            type: 'textarea',
            label: 'Menu Items (one per line)',
            placeholder: 'Home\nAbout\nServices\nPortfolio\nContact',
        },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                // Light Glass Effects
                { value: 'bg-white/95 backdrop-blur-md border-b border-gray-100/50', label: '🤍 Glass White' },
                { value: 'bg-gradient-to-r from-blue-50/95 via-white/95 to-purple-50/95 backdrop-blur-md border-b border-blue-100/30', label: '💙 Soft Blue Glass' },
                { value: 'bg-gradient-to-br from-indigo-50/95 via-white/95 to-cyan-50/95 backdrop-blur-md border-b border-indigo-100/30', label: '🔵 Indigo Cyan Glass' },
                { value: 'bg-gradient-to-br from-rose-50/95 via-white/95 to-teal-50/95 backdrop-blur-md border-b border-rose-100/30', label: '🌹 Warm Glass' },
                { value: 'bg-gradient-to-br from-violet-50/95 via-white/95 to-pink-50/95 backdrop-blur-md border-b border-violet-100/30', label: '💜 Purple Pink Glass' },

                // Vibrant Glass Effects
                { value: 'bg-gradient-to-r from-indigo-600/95 to-purple-600/95 backdrop-blur-md', label: '🎨 Blue Purple Glass' },
                { value: 'bg-gradient-to-r from-emerald-500/95 to-cyan-500/95 backdrop-blur-md', label: '🌊 Emerald Cyan Glass' },
                { value: 'bg-gradient-to-r from-orange-500/95 to-pink-500/95 backdrop-blur-md', label: '🌅 Sunset Glass' },

                // Dark Glass Effects
                { value: 'bg-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: '🌙 Dark Glass' },
                { value: 'bg-gradient-to-r from-slate-900/95 to-gray-900/95 backdrop-blur-md', label: '⚫ Dark Gradient Glass' },
                { value: 'bg-gradient-to-r from-gray-800/95 to-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: '🔳 Charcoal Glass' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-gray-800', label: '⚫ Dark Gray' },
                { value: 'text-white', label: '⚪ White' },
                { value: 'text-blue-600', label: '🔵 Blue' },
                { value: 'text-gray-600', label: '🔘 Medium Gray' },
                { value: 'text-purple-600', label: '🟣 Purple' },
                { value: 'text-emerald-600', label: '🟢 Emerald' },
            ],
        },
    },
    darkCyber: {
        logoText: {
            type: 'text',
            label: 'Logo Text',
            placeholder: 'CYBER.DEV',
        },
        logoImage: {
            type: 'text',
            label: 'Logo Image URL (optional)',
            placeholder: 'https://example.com/logo.png',
        },
        menuItems: {
            type: 'textarea',
            label: 'Menu Items (one per line)',
            placeholder: 'Home\nAbout\nSkills\nProjects\nContact',
        },
        glitchEffect: {
            type: 'select',
            label: 'Glitch Effect Intensity',
            options: [
                { value: 'none', label: '🚫 None' },
                { value: 'subtle', label: '🌟 Subtle' },
                { value: 'medium', label: '⚡ Medium' },
                { value: 'intense', label: '💥 Intense' },
            ],
        },
        neonColor: {
            type: 'select',
            label: 'Neon Accent Color',
            options: [
                { value: 'cyan', label: '🔵 Cyan' },
                { value: 'blue', label: '💙 Blue' },
                { value: 'purple', label: '💜 Purple' },
                { value: 'pink', label: '💗 Pink' },
                { value: 'red', label: '❤️ Red' },
            ],
        },
    },
    darkTerminal: {
        logoText: {
            type: 'text',
            label: 'Terminal Prompt',
            placeholder: '$ terminal.dev',
        },
        logoImage: {
            type: 'text',
            label: 'Logo Image URL (optional)',
            placeholder: 'https://example.com/logo.png',
        },
        menuItems: {
            type: 'textarea',
            label: 'Terminal Commands (one per line)',
            placeholder: 'whoami\nls skills/\ncat projects/\ncontact --help',
        },
        terminalStyle: {
            type: 'select',
            label: 'Terminal Style',
            options: [
                { value: 'matrix', label: '🟢 Matrix Green' },
                { value: 'amber', label: '🟡 Amber Classic' },
                { value: 'cyan', label: '🔵 Cyan Modern' },
                { value: 'white', label: '⚪ White Minimal' },
            ],
        },
        showCursor: {
            type: 'select',
            label: 'Show Blinking Cursor',
            options: [
                { value: true, label: '✅ Yes' },
                { value: false, label: '❌ No' },
            ],
        },
    },
    darkCyberSec: {
        logoText: {
            type: 'text',
            label: 'Security Brand',
            placeholder: 'SECURE.TECH',
        },
        logoImage: {
            type: 'text',
            label: 'Logo Image URL (optional)',
            placeholder: 'https://example.com/logo.png',
        },
        menuItems: {
            type: 'textarea',
            label: 'Security Sections (one per line)',
            placeholder: 'Home\nAbout\nExpertise\nProjects\nCertifications\nContact',
        },
        securityLevel: {
            type: 'select',
            label: 'Security Indication Level',
            options: [
                { value: 'low', label: '🟢 Low' },
                { value: 'medium', label: '🟡 Medium' },
                { value: 'high', label: '🟠 High' },
                { value: 'critical', label: '🔴 Critical' },
            ],
        },
        encryptionStyle: {
            type: 'select',
            label: 'Encryption Visual Style',
            options: [
                { value: 'minimal', label: '🔒 Minimal' },
                { value: 'matrix', label: '📊 Matrix' },
                { value: 'hexadecimal', label: '🔢 Hexadecimal' },
                { value: 'binary', label: '💾 Binary' },
            ],
        },
    },
};

const NavbarCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'horizontal' } = data.props || {};


        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template Style',
                render: ({ _name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={navbarTemplateOptions} category="Navbar" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.horizontal;


        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'horizontal',
        logoText: 'Portfolio',
        logoImage: '',
        menuItems: 'Home\nAbout\nSkills\nProjects\nContact',
        backgroundColor: 'bg-white/95 backdrop-blur-md border-b border-gray-100/50',
        textColor: 'text-gray-800',
        // Dark Cyber props
        glitchEffect: 'medium',
        neonColor: 'cyan',
        // Dark Terminal props
        terminalStyle: 'matrix',
        showCursor: true,
        // Dark Cyber Security props
        securityLevel: 'high',
        encryptionStyle: 'hexadecimal',
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = navbarTemplates[template] || Navbar1;

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...NavbarCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;


        return SelectedTemplate.render(templateProps);
    },
};

export default NavbarCategory;
