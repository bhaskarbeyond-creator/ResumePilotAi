import React from 'react';
import Contact1 from './Contact1';
import Contact2 from './Contact2';
import Contact3 from './Contact3';
import Contact4 from './Contact4';
import { TemplateSelector } from './TemplateModal';

const contactTemplates = {
    simple: Contact1,
    form: Contact2,
    artist: Contact3,
    darkCyberSec: Contact4,
};

const contactTemplateOptions = [
    {
        id: 'simple',
        name: 'Simple Contact',
        description: 'Basic contact info and social links',
        preview: 'https://placehold.co/400x200/6366F1/white?text=Simple+Contact',
    },
    {
        id: 'form',
        name: 'Contact with Form',
        description: 'Full contact form and social icons',
        preview: 'https://placehold.co/400x200/14B8A6/white?text=Contact+Form',
    },
    {
        id: 'artist',
        name: 'Artist Contact',
        description: 'Artistic contact layout with creative social links',
        preview: 'https://placehold.co/400x200/F59E0B/FFFFFF?text=Artist+Contact',
    },
    {
        id: 'darkCyberSec',
        name: 'Dark Cyber Security',
        description: 'Professional cyber security contact with encrypted communication channels',
        preview: 'https://placehold.co/400x200/0F172A/00D4FF?text=Cyber+Security',
    },
];

// Define field mappings for each template
const templateFieldMappings = {
    simple: {
        // Fields for Contact1 - simple contact info (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        location: { type: 'text', label: 'Location' },
        availability: { type: 'text', label: 'Availability' },
    },
    form: {
        // Fields for Contact2 - form (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        location: { type: 'text', label: 'Location' },
        availability: { type: 'text', label: 'Availability' },
        responseTime: { type: 'text', label: 'Response Time' },
    },
    artist: {
        // Fields for Contact3 - artist contact (NO EXTERNAL LINKS)
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        artistName: { type: 'text', label: 'Artist Name' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        location: { type: 'text', label: 'Location' },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'orange', label: 'Orange' },
                { value: 'purple', label: 'Purple' },
                { value: 'emerald', label: 'Emerald' },
                { value: 'rose', label: 'Rose' },
                { value: 'blue', label: 'Blue' },
            ],
        },
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
        artStyle: { type: 'text', label: 'Art Style/Medium' },
        specialization: { type: 'text', label: 'Specialization' },
        experience: { type: 'text', label: 'Years of Experience' },
        commissionInfo: { type: 'text', label: 'Commission Information' },
        studioHours: { type: 'text', label: 'Studio Hours' },
        preferredContact: { type: 'text', label: 'Preferred Contact Method' },
    },
    darkCyberSec: {
        // Fields for Contact4 - dark cyber security theme
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        description: { type: 'textarea', label: 'Description' },
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
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Midnight Security' },
                { value: 'bg-gray-900', label: 'Digital Fortress' },
                { value: 'bg-slate-900', label: 'Shadow Network' },
                { value: 'bg-zinc-900', label: 'Quantum Shield' },
                { value: 'bg-neutral-900', label: 'Threat Hunter' },
            ],
        },

        // Section Labels
        'sectionLabels.communicationChannelsTitle': { type: 'text', label: 'Communication Channels Title' },
        'sectionLabels.operatingScheduleTitle': { type: 'text', label: 'Operating Schedule Title' },
        'sectionLabels.securityProtocolsTitle': { type: 'text', label: 'Security Protocols Title' },
        'sectionLabels.clearanceInfoTitle': { type: 'text', label: 'Clearance Information Title' },

        // Operating Hours Labels
        'operatingHoursLabels.standardHoursLabel': { type: 'text', label: 'Standard Hours Label' },
        'operatingHoursLabels.emergencyResponseLabel': { type: 'text', label: 'Emergency Response Label' },
        'operatingHoursLabels.internationalLabel': { type: 'text', label: 'International Label' },
        'operatingHoursLabels.timeZoneLabel': { type: 'text', label: 'Time Zone Label' },

        // Clearance Information Labels
        'clearanceLabels.publicInquiriesLabel': { type: 'text', label: 'Public Inquiries Label' },
        'clearanceLabels.consultingWorkLabel': { type: 'text', label: 'Consulting Work Label' },
        'clearanceLabels.governmentContractsLabel': { type: 'text', label: 'Government Contracts Label' },
        'clearanceLabels.emergencyResponseLabel': { type: 'text', label: 'Emergency Response Label' },

        // Contact Methods - Individual fields for easier editing
        'contactMethods[0].type': { type: 'text', label: 'Method 1 - Type' },
        'contactMethods[0].label': { type: 'text', label: 'Method 1 - Label' },
        'contactMethods[0].value': { type: 'text', label: 'Method 1 - Contact Value' },
        'contactMethods[0].protocol': { type: 'text', label: 'Method 1 - Security Protocol' },
        'contactMethods[0].icon': { type: 'text', label: 'Method 1 - Icon (emoji)' },
        'contactMethods[0].securityLevel': {
            type: 'select',
            label: 'Method 1 - Security Level',
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'maximum', label: 'Maximum' },
            ],
        },
        'contactMethods[0].responseTime': { type: 'text', label: 'Method 1 - Response Time' },

        'contactMethods[1].type': { type: 'text', label: 'Method 2 - Type' },
        'contactMethods[1].label': { type: 'text', label: 'Method 2 - Label' },
        'contactMethods[1].value': { type: 'text', label: 'Method 2 - Contact Value' },
        'contactMethods[1].protocol': { type: 'text', label: 'Method 2 - Security Protocol' },
        'contactMethods[1].icon': { type: 'text', label: 'Method 2 - Icon (emoji)' },
        'contactMethods[1].securityLevel': {
            type: 'select',
            label: 'Method 2 - Security Level',
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'maximum', label: 'Maximum' },
            ],
        },
        'contactMethods[1].responseTime': { type: 'text', label: 'Method 2 - Response Time' },

        'contactMethods[2].type': { type: 'text', label: 'Method 3 - Type' },
        'contactMethods[2].label': { type: 'text', label: 'Method 3 - Label' },
        'contactMethods[2].value': { type: 'text', label: 'Method 3 - Contact Value' },
        'contactMethods[2].protocol': { type: 'text', label: 'Method 3 - Security Protocol' },
        'contactMethods[2].icon': { type: 'text', label: 'Method 3 - Icon (emoji)' },
        'contactMethods[2].securityLevel': {
            type: 'select',
            label: 'Method 3 - Security Level',
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'maximum', label: 'Maximum' },
            ],
        },
        'contactMethods[2].responseTime': { type: 'text', label: 'Method 3 - Response Time' },

        'contactMethods[3].type': { type: 'text', label: 'Method 4 - Type' },
        'contactMethods[3].label': { type: 'text', label: 'Method 4 - Label' },
        'contactMethods[3].value': { type: 'text', label: 'Method 4 - Contact Value' },
        'contactMethods[3].protocol': { type: 'text', label: 'Method 4 - Security Protocol' },
        'contactMethods[3].icon': { type: 'text', label: 'Method 4 - Icon (emoji)' },
        'contactMethods[3].securityLevel': {
            type: 'select',
            label: 'Method 4 - Security Level',
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'maximum', label: 'Maximum' },
            ],
        },
        'contactMethods[3].responseTime': { type: 'text', label: 'Method 4 - Response Time' },

        // Operating Hours - Individual fields
        'operatingHours.standard': { type: 'text', label: 'Standard Hours' },
        'operatingHours.emergency': { type: 'text', label: 'Emergency Response Hours' },
        'operatingHours.international': { type: 'text', label: 'International Coverage' },
        'operatingHours.timeZone': { type: 'text', label: 'Time Zone' },

        // Security Clearance Info - Individual fields
        'clearanceInfo.publicInquiries': { type: 'text', label: 'Public Inquiries Requirement' },
        'clearanceInfo.consultingWork': { type: 'text', label: 'Consulting Work Requirement' },
        'clearanceInfo.governmentContracts': { type: 'text', label: 'Government Contracts Requirement' },
        'clearanceInfo.emergencyResponse': { type: 'text', label: 'Emergency Response Requirement' },

        // Security Protocols - Individual fields for first 6 protocols
        'securityProtocols[0]': { type: 'text', label: 'Security Protocol 1' },
        'securityProtocols[1]': { type: 'text', label: 'Security Protocol 2' },
        'securityProtocols[2]': { type: 'text', label: 'Security Protocol 3' },
        'securityProtocols[3]': { type: 'text', label: 'Security Protocol 4' },
        'securityProtocols[4]': { type: 'text', label: 'Security Protocol 5' },
        'securityProtocols[5]': { type: 'text', label: 'Security Protocol 6' },
    },
};

const ContactCategory = {
    // Use resolveFields to dynamically show fields based on selected template
    resolveFields: (data) => {
        const { template = 'simple' } = data.props || {};

        console.log('🔧 DEBUG: Contact resolveFields called with template:', template);

        // Always include the template selector field
        const baseFields = {
            template: {
                type: 'custom',
                label: 'Template',
                render: ({ name, onChange, value }) => <TemplateSelector value={value} onChange={onChange} templates={contactTemplateOptions} category="Contact" />,
            },
        };

        // Get template-specific fields
        const templateFields = templateFieldMappings[template] || templateFieldMappings.simple;

        console.log('🔧 DEBUG: Resolved fields for Contact template:', template, Object.keys(templateFields));

        return {
            ...baseFields,
            ...templateFields,
        };
    },

    defaultProps: {
        template: 'simple',
        title: 'Get In Touch',
        subtitle: 'Feel free to reach out for collaborations or just a friendly hello!',
        email: 'hello@johndoe.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        linkedin: 'https://linkedin.com/in/johndoe',
        twitter: 'https://twitter.com/johndoe',
        github: 'https://github.com/johndoe',

        // Contact4 specific defaults
        description: 'All communications are monitored, encrypted, and logged for security purposes. Response time: 24-48 hours for standard inquiries, immediate for critical security incidents.',
        accentColor: 'cyan',
        backgroundColor: 'bg-black',
        contactMethods: [
            {
                type: 'secure-email',
                label: 'Encrypted Email',
                value: 'security@cybersec.com',
                protocol: 'PGP Encrypted',
                icon: '🔐',
                securityLevel: 'high',
                responseTime: '24h',
            },
            {
                type: 'secure-phone',
                label: 'Secure Line',
                value: '+1 (555) CYBER-SEC',
                protocol: 'Signal/Wire',
                icon: '📞',
                securityLevel: 'medium',
                responseTime: 'immediate',
            },
            {
                type: 'secure-chat',
                label: 'Secure Chat',
                value: '@CyberSecPro',
                protocol: 'Element/Matrix',
                icon: '💬',
                securityLevel: 'high',
                responseTime: '1-4h',
            },
            {
                type: 'location',
                label: 'Secure Facility',
                value: 'Classified Location, DC Metro',
                protocol: 'Physical Security',
                icon: '🏢',
                securityLevel: 'maximum',
                responseTime: 'by appointment',
            },
        ],
        clearanceInfo: {
            publicInquiries: 'No clearance required',
            consultingWork: 'Secret clearance preferred',
            governmentContracts: 'Top Secret/SCI required',
            emergencyResponse: 'Immediate clearance verification',
        },
        operatingHours: {
            standard: 'Mon-Fri: 0800-1800 EST',
            emergency: '24/7 Incident Response',
            international: 'Global coverage available',
            timeZone: 'Eastern Standard Time (UTC-5)',
        },
        securityProtocols: [
            'End-to-end encryption for all communications',
            'Multi-factor authentication required',
            'Security clearance verification process',
            'Confidentiality agreements mandatory',
            'Incident response within 1 hour',
            'Secure file transfer protocols only',
        ],
    },
    render: ({ template, ...props }) => {
        const SelectedTemplate = contactTemplates[template] || Contact1;
        console.log('🔧 DEBUG: Contact template selected:', template);

        // Merge with default props to ensure all required props are available
        const mergedProps = { ...ContactCategory.defaultProps, ...props };

        // Remove template from props since it's used for template selection
        const { template: _, ...templateProps } = mergedProps;

        console.log('🔧 DEBUG: Contact merged props:', templateProps);

        return SelectedTemplate.render(templateProps);
    },
};

export default ContactCategory;
