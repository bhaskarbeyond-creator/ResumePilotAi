import React from 'react';

// Security utilities
const SecureText = ({ children, className = '' }) => {
    const sanitizedText = typeof children === 'string' ? children.replace(/<[^>]*>/g, '') : children;
    return <span className={className}>{sanitizedText}</span>;
};

const SecureUrl = {
    validate: (url) => {
        if (!url || typeof url !== 'string') return '';
        try {
            const validUrl = new URL(url);
            return ['http:', 'https:', 'mailto:', 'tel:'].includes(validUrl.protocol) ? url : '';
        } catch {
            return url.startsWith('/') || url.startsWith('./') ? url : '';
        }
    },
};

const Contact4 = {
    name: 'Contact4',
    templateName: 'darkCyberSec',

    // Controls for editing the component - simplified without form fields
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        description: { type: 'textarea', label: 'Description Text' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Cyber Black' },
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

        // Section Headers
        sectionLabels: {
            type: 'group',
            label: 'Section Headers',
            fields: {
                communicationChannelsTitle: { type: 'text', label: 'Communication Channels Title' },
                operatingScheduleTitle: { type: 'text', label: 'Operating Schedule Title' },
                securityProtocolsTitle: { type: 'text', label: 'Security Protocols Title' },
                clearanceInfoTitle: { type: 'text', label: 'Clearance Information Title' },
            },
        },

        // Operating Hours Labels
        operatingHoursLabels: {
            type: 'group',
            label: 'Operating Hours Labels',
            fields: {
                standardHoursLabel: { type: 'text', label: 'Standard Hours Label' },
                emergencyResponseLabel: { type: 'text', label: 'Emergency Response Label' },
                internationalLabel: { type: 'text', label: 'International Label' },
                timeZoneLabel: { type: 'text', label: 'Time Zone Label' },
            },
        },

        // Clearance Information Labels
        clearanceLabels: {
            type: 'group',
            label: 'Clearance Section Labels',
            fields: {
                publicInquiriesLabel: { type: 'text', label: 'Public Inquiries Label' },
                consultingWorkLabel: { type: 'text', label: 'Consulting Work Label' },
                governmentContractsLabel: { type: 'text', label: 'Government Contracts Label' },
                emergencyResponseLabel: { type: 'text', label: 'Emergency Response Label' },
            },
        },

        // Contact methods array
        contactMethods: {
            type: 'array',
            label: 'Contact Methods',
            getItemSummary: (item) => `${item.label} - ${item.value}`,
            arrayFields: {
                type: { type: 'text', label: 'Method Type' },
                label: { type: 'text', label: 'Display Label' },
                value: { type: 'text', label: 'Contact Value' },
                protocol: { type: 'text', label: 'Security Protocol' },
                icon: { type: 'text', label: 'Icon (emoji)' },
                securityLevel: {
                    type: 'select',
                    label: 'Security Level',
                    options: [
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'maximum', label: 'Maximum' },
                    ],
                },
                responseTime: { type: 'text', label: 'Response Time' },
            },
            defaultItemProps: {
                type: 'secure-email',
                label: 'Encrypted Email',
                value: 'security@example.com',
                protocol: 'PGP Encrypted',
                icon: '🔐',
                securityLevel: 'high',
                responseTime: '24h',
            },
        },

        // Clearance information
        clearanceInfo: {
            type: 'group',
            label: 'Security Clearance Information',
            fields: {
                publicInquiries: { type: 'text', label: 'Public Inquiries' },
                consultingWork: { type: 'text', label: 'Consulting Work' },
                governmentContracts: { type: 'text', label: 'Government Contracts' },
                emergencyResponse: { type: 'text', label: 'Emergency Response' },
            },
        },

        // Operating hours
        operatingHours: {
            type: 'group',
            label: 'Operating Hours',
            fields: {
                standard: { type: 'text', label: 'Standard Hours' },
                emergency: { type: 'text', label: 'Emergency Hours' },
                international: { type: 'text', label: 'International Coverage' },
                timeZone: { type: 'text', label: 'Time Zone' },
            },
        },

        // Security protocols
        securityProtocols: {
            type: 'array',
            label: 'Security Protocols',
            getItemSummary: (item) => item.value || item,
            arrayFields: {
                value: { type: 'text', label: 'Protocol Description' },
            },
            defaultItemProps: {
                value: 'End-to-end encryption for all communications',
            },
        },
    },

    // Default props matching the field structure - simplified
    defaultProps: {
        title: 'SECURE COMMUNICATION CHANNEL',
        subtitle: 'Establish encrypted connection for confidential discussions and security consultations',
        description: 'All communications are monitored, encrypted, and logged for security purposes. Response time: 24-48 hours for standard inquiries, immediate for critical security incidents.',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',

        // Section Headers
        sectionLabels: {
            communicationChannelsTitle: 'Communication Channels',
            operatingScheduleTitle: 'Operating Schedule',
            securityProtocolsTitle: 'Security Protocols',
            clearanceInfoTitle: 'Security Clearance Information',
        },

        // Operating Hours Labels
        operatingHoursLabels: {
            standardHoursLabel: 'Standard Hours:',
            emergencyResponseLabel: 'Emergency Response:',
            internationalLabel: 'International:',
            timeZoneLabel: 'Time Zone:',
        },

        // Clearance Information Labels
        clearanceLabels: {
            publicInquiriesLabel: 'Public Inquiries',
            consultingWorkLabel: 'Consulting Work',
            governmentContractsLabel: 'Government Contracts',
            emergencyResponseLabel: 'Emergency Response',
        },

        // Contact methods with security protocols
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

        // Security clearance requirements
        clearanceInfo: {
            publicInquiries: 'No clearance required',
            consultingWork: 'Secret clearance preferred',
            governmentContracts: 'Top Secret/SCI required',
            emergencyResponse: 'Immediate clearance verification',
        },

        // Operating hours with time zones
        operatingHours: {
            standard: 'Mon-Fri: 0800-1800 EST',
            emergency: '24/7 Incident Response',
            international: 'Global coverage available',
            timeZone: 'Eastern Standard Time (UTC-5)',
        },

        // Security protocols
        securityProtocols: [
            { value: 'End-to-end encryption for all communications' },
            { value: 'Multi-factor authentication required' },
            { value: 'Security clearance verification process' },
            { value: 'Confidentiality agreements mandatory' },
            { value: 'Incident response within 1 hour' },
            { value: 'Secure file transfer protocols only' },
        ],
    },

    render: ({
        title = Contact4.defaultProps.title,
        subtitle = Contact4.defaultProps.subtitle,
        description = Contact4.defaultProps.description,
        contactMethods = Contact4.defaultProps.contactMethods,
        clearanceInfo = Contact4.defaultProps.clearanceInfo,
        operatingHours = Contact4.defaultProps.operatingHours,
        securityProtocols = Contact4.defaultProps.securityProtocols,
        backgroundColor = Contact4.defaultProps.backgroundColor,
        accentColor = Contact4.defaultProps.accentColor,
        sectionLabels = Contact4.defaultProps.sectionLabels,
        operatingHoursLabels = Contact4.defaultProps.operatingHoursLabels,
        clearanceLabels = Contact4.defaultProps.clearanceLabels,
        ...props // Capture all individual field props
    }) => {
        // Construct contactMethods array from individual field props
        const constructedContactMethods = [];
        for (let i = 0; i < 4; i++) {
            const method = {
                type: props[`contactMethods[${i}].type`] || (contactMethods[i] && contactMethods[i].type) || 'secure-email',
                label: props[`contactMethods[${i}].label`] || (contactMethods[i] && contactMethods[i].label) || `Method ${i + 1}`,
                value: props[`contactMethods[${i}].value`] || (contactMethods[i] && contactMethods[i].value) || 'contact@example.com',
                protocol: props[`contactMethods[${i}].protocol`] || (contactMethods[i] && contactMethods[i].protocol) || 'Standard',
                icon: props[`contactMethods[${i}].icon`] || (contactMethods[i] && contactMethods[i].icon) || '📧',
                securityLevel: props[`contactMethods[${i}].securityLevel`] || (contactMethods[i] && contactMethods[i].securityLevel) || 'medium',
                responseTime: props[`contactMethods[${i}].responseTime`] || (contactMethods[i] && contactMethods[i].responseTime) || '24h',
            };
            constructedContactMethods.push(method);
        }

        // Construct sectionLabels from individual field props
        const constructedSectionLabels = {
            communicationChannelsTitle: props['sectionLabels.communicationChannelsTitle'] || sectionLabels.communicationChannelsTitle,
            operatingScheduleTitle: props['sectionLabels.operatingScheduleTitle'] || sectionLabels.operatingScheduleTitle,
            securityProtocolsTitle: props['sectionLabels.securityProtocolsTitle'] || sectionLabels.securityProtocolsTitle,
            clearanceInfoTitle: props['sectionLabels.clearanceInfoTitle'] || sectionLabels.clearanceInfoTitle,
        };

        // Construct operatingHoursLabels from individual field props
        const constructedOperatingHoursLabels = {
            standardHoursLabel: props['operatingHoursLabels.standardHoursLabel'] || operatingHoursLabels.standardHoursLabel,
            emergencyResponseLabel: props['operatingHoursLabels.emergencyResponseLabel'] || operatingHoursLabels.emergencyResponseLabel,
            internationalLabel: props['operatingHoursLabels.internationalLabel'] || operatingHoursLabels.internationalLabel,
            timeZoneLabel: props['operatingHoursLabels.timeZoneLabel'] || operatingHoursLabels.timeZoneLabel,
        };

        // Construct clearanceLabels from individual field props
        const constructedClearanceLabels = {
            publicInquiriesLabel: props['clearanceLabels.publicInquiriesLabel'] || clearanceLabels.publicInquiriesLabel,
            consultingWorkLabel: props['clearanceLabels.consultingWorkLabel'] || clearanceLabels.consultingWorkLabel,
            governmentContractsLabel: props['clearanceLabels.governmentContractsLabel'] || clearanceLabels.governmentContractsLabel,
            emergencyResponseLabel: props['clearanceLabels.emergencyResponseLabel'] || clearanceLabels.emergencyResponseLabel,
        };

        // Construct clearanceInfo from individual field props
        const constructedClearanceInfo = {
            publicInquiries: props['clearanceInfo.publicInquiries'] || clearanceInfo.publicInquiries,
            consultingWork: props['clearanceInfo.consultingWork'] || clearanceInfo.consultingWork,
            governmentContracts: props['clearanceInfo.governmentContracts'] || clearanceInfo.governmentContracts,
            emergencyResponse: props['clearanceInfo.emergencyResponse'] || clearanceInfo.emergencyResponse,
        };

        // Construct operatingHours from individual field props
        const constructedOperatingHours = {
            standard: props['operatingHours.standard'] || operatingHours.standard,
            emergency: props['operatingHours.emergency'] || operatingHours.emergency,
            international: props['operatingHours.international'] || operatingHours.international,
            timeZone: props['operatingHours.timeZone'] || operatingHours.timeZone,
        };

        // Construct securityProtocols from individual field props
        const constructedSecurityProtocols = [];
        for (let i = 0; i < 6; i++) {
            const protocol = props[`securityProtocols[${i}]`] || (securityProtocols[i] && securityProtocols[i].value) || securityProtocols[i];
            if (protocol) {
                constructedSecurityProtocols.push({ value: protocol });
            }
        }

        // Color themes for cyber security
        const colorThemes = {
            cyan: {
                primary: 'from-cyan-500 to-blue-600',
                secondary: 'from-cyan-600 to-cyan-800',
                accent: 'bg-cyan-500',
                border: 'border-cyan-500/30',
                ring: 'ring-cyan-500/20',
                glow: 'shadow-cyan-500/25',
                text: 'text-cyan-400',
                bg: 'bg-cyan-500/10',
                light: 'bg-cyan-500/5',
                timeline: 'bg-gradient-to-b from-cyan-500 to-transparent',
            },
            red: {
                primary: 'from-red-500 to-rose-600',
                secondary: 'from-red-600 to-red-800',
                accent: 'bg-red-500',
                border: 'border-red-500/30',
                ring: 'ring-red-500/20',
                glow: 'shadow-red-500/25',
                text: 'text-red-400',
                bg: 'bg-red-500/10',
                light: 'bg-red-500/5',
                timeline: 'bg-gradient-to-b from-red-500 to-transparent',
            },
            green: {
                primary: 'from-green-500 to-emerald-600',
                secondary: 'from-green-600 to-green-800',
                accent: 'bg-green-500',
                border: 'border-green-500/30',
                ring: 'ring-green-500/20',
                glow: 'shadow-green-500/25',
                text: 'text-green-400',
                bg: 'bg-green-500/10',
                light: 'bg-green-500/5',
                timeline: 'bg-gradient-to-b from-green-500 to-transparent',
            },
            purple: {
                primary: 'from-purple-500 to-violet-600',
                secondary: 'from-purple-600 to-purple-800',
                accent: 'bg-purple-500',
                border: 'border-purple-500/30',
                ring: 'ring-purple-500/20',
                glow: 'shadow-purple-500/25',
                text: 'text-purple-400',
                bg: 'bg-purple-500/10',
                light: 'bg-purple-500/5',
                timeline: 'bg-gradient-to-b from-purple-500 to-transparent',
            },
            orange: {
                primary: 'from-orange-500 to-amber-600',
                secondary: 'from-orange-600 to-orange-800',
                accent: 'bg-orange-500',
                border: 'border-orange-500/30',
                ring: 'ring-orange-500/20',
                glow: 'shadow-orange-500/25',
                text: 'text-orange-400',
                bg: 'bg-orange-500/10',
                light: 'bg-orange-500/5',
                timeline: 'bg-gradient-to-b from-orange-500 to-transparent',
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.cyan;

        const getSecurityLevelStyling = (level) => {
            switch (level) {
                case 'maximum':
                    return { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔒' };
                case 'high':
                    return { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', icon: '🛡️' };
                case 'medium':
                    return { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '⚠️' };
                case 'low':
                    return { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🌐' };
                default:
                    return { bg: theme.bg, border: theme.border, text: theme.text, icon: '🔍' };
            }
        };

        return (
            <div className={`${backgroundColor} relative py-24 px-6 overflow-hidden`}>
                {/* Animated Grid Background */}
                <div className="absolute inset-0 opacity-5">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `linear-gradient(${theme.text.replace('text-', '')} 1px, transparent 1px), linear-gradient(90deg, ${theme.text.replace(
                                'text-',
                                ''
                            )} 1px, transparent 1px)`,
                            backgroundSize: '40px 40px',
                            animation: 'grid-move 20s linear infinite',
                        }}></div>
                </div>

                {/* Security Scanner Lines */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${theme.primary} opacity-30 animate-pulse`}></div>
                    <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r ${theme.primary} opacity-30 animate-pulse delay-1000`}></div>
                    <div className={`absolute left-0 top-0 w-0.5 h-full bg-gradient-to-b ${theme.primary} opacity-20 animate-pulse delay-500`}></div>
                    <div className={`absolute right-0 top-0 w-0.5 h-full bg-gradient-to-b ${theme.primary} opacity-20 animate-pulse delay-1500`}></div>
                </div>

                {/* Floating Security Elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className={`absolute top-20 left-20 w-6 h-6 ${theme.text} opacity-10 animate-float`}>
                        <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" />
                        </svg>
                    </div>
                    <div className={`absolute bottom-32 right-16 w-4 h-4 ${theme.text} opacity-15 animate-float delay-1000`}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                    </div>

                    {/* Binary Code Effect */}
                    <div className="absolute top-1/4 right-1/4 font-mono text-xs opacity-5 animate-pulse">
                        <div className={`${theme.text}`}>01000011</div>
                        <div className={`${theme.text} delay-100`}>01001111</div>
                        <div className={`${theme.text} delay-200`}>01001101</div>
                    </div>
                    <div className="absolute bottom-1/4 left-1/4 font-mono text-xs opacity-5 animate-pulse delay-1000">
                        <div className={`${theme.text}`}>01010011</div>
                        <div className={`${theme.text} delay-100`}>01000101</div>
                        <div className={`${theme.text} delay-200`}>01000011</div>
                    </div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.bg} border ${theme.border} rounded-full backdrop-blur-sm mb-8`}>
                            <div className={`w-2 h-2 ${theme.accent} rounded-full mr-3 animate-pulse`}></div>
                            <span className={`text-sm font-medium ${theme.text} uppercase tracking-wider`}>SECURE CONTACT</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
                            <SecureText>{title}</SecureText>
                        </h2>
                        <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
                            <SecureText>{subtitle}</SecureText>
                        </p>
                        <div className={`max-w-4xl mx-auto p-4 ${theme.bg} border ${theme.border} rounded-lg backdrop-blur-sm`}>
                            <p className="text-sm text-gray-400">
                                <SecureText>{description}</SecureText>
                            </p>
                        </div>
                    </div>

                    {/* Contact Methods and Information - Full Width Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                        {/* Contact Methods */}
                        <div className="space-y-8">
                            <div className={`p-8 bg-black/40 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <span className="text-2xl">📡</span>
                                    <SecureText>{constructedSectionLabels.communicationChannelsTitle}</SecureText>
                                </h3>

                                <div className="space-y-4">
                                    {constructedContactMethods.map((method, index) => {
                                        const securityStyling = getSecurityLevelStyling(method.securityLevel);
                                        return (
                                            <div key={index} className={`p-4 ${theme.light} rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300`}>
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{method.icon}</span>
                                                        <div>
                                                            <h4 className="text-lg font-semibold text-white">
                                                                <SecureText>{method.label}</SecureText>
                                                            </h4>
                                                            <p className={`text-sm ${theme.text}`}>
                                                                <SecureText>{method.protocol}</SecureText>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className={`px-3 py-1 ${securityStyling.bg} border ${securityStyling.border} rounded-lg flex items-center gap-2`}>
                                                        <span className="text-sm">{securityStyling.icon}</span>
                                                        <span className={`text-xs font-bold ${securityStyling.text} uppercase`}>
                                                            <SecureText>{method.securityLevel}</SecureText>
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="ml-11">
                                                    <p className="text-white font-mono text-sm mb-2">
                                                        <SecureText>{method.value}</SecureText>
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        Response Time: <SecureText>{method.responseTime}</SecureText>
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Operating Hours and Security Protocols */}
                        <div className="space-y-8">
                            {/* Operating Hours */}
                            <div className={`p-8 bg-black/40 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <span className="text-2xl">⏰</span>
                                    <SecureText>{constructedSectionLabels.operatingScheduleTitle}</SecureText>
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                                        <span className="text-gray-300">
                                            <SecureText>{constructedOperatingHoursLabels.standardHoursLabel}</SecureText>
                                        </span>
                                        <span className={`${theme.text} font-mono`}>
                                            <SecureText>{constructedOperatingHours.standard}</SecureText>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                                        <span className="text-gray-300">
                                            <SecureText>{constructedOperatingHoursLabels.emergencyResponseLabel}</SecureText>
                                        </span>
                                        <span className="text-red-400 font-mono">
                                            <SecureText>{constructedOperatingHours.emergency}</SecureText>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                                        <span className="text-gray-300">
                                            <SecureText>{constructedOperatingHoursLabels.internationalLabel}</SecureText>
                                        </span>
                                        <span className={`${theme.text} font-mono`}>
                                            <SecureText>{constructedOperatingHours.international}</SecureText>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-gray-300">
                                            <SecureText>{constructedOperatingHoursLabels.timeZoneLabel}</SecureText>
                                        </span>
                                        <span className="text-gray-400 font-mono text-sm">
                                            <SecureText>{constructedOperatingHours.timeZone}</SecureText>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Security Protocols */}
                            <div className={`p-8 bg-black/40 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <span className="text-2xl">🛡️</span>
                                    <SecureText>{constructedSectionLabels.securityProtocolsTitle}</SecureText>
                                </h3>
                                <div className="space-y-3">
                                    {constructedSecurityProtocols.map((protocol, index) => (
                                        <div key={index} className="flex items-start gap-3">
                                            <div className={`w-2 h-2 ${theme.accent} rounded-full mt-2 flex-shrink-0`}></div>
                                            <span className="text-gray-300 text-sm">
                                                <SecureText>{protocol.value || protocol}</SecureText>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Security Clearance Information */}
                    <div className="space-y-8">
                        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                            <span className="text-2xl">🎖️</span>
                            <SecureText>{constructedSectionLabels.clearanceInfoTitle}</SecureText>
                        </h3>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                <div className="text-2xl mb-3">🌐</div>
                                <div className="text-sm font-semibold text-white mb-2">
                                    <SecureText>{constructedClearanceLabels.publicInquiriesLabel}</SecureText>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <SecureText>{constructedClearanceInfo.publicInquiries}</SecureText>
                                </div>
                            </div>
                            <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                <div className="text-2xl mb-3">💼</div>
                                <div className="text-sm font-semibold text-white mb-2">
                                    <SecureText>{constructedClearanceLabels.consultingWorkLabel}</SecureText>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <SecureText>{constructedClearanceInfo.consultingWork}</SecureText>
                                </div>
                            </div>
                            <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                <div className="text-2xl mb-3">🏛️</div>
                                <div className="text-sm font-semibold text-white mb-2">
                                    <SecureText>{constructedClearanceLabels.governmentContractsLabel}</SecureText>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <SecureText>{constructedClearanceInfo.governmentContracts}</SecureText>
                                </div>
                            </div>
                            <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                <div className="text-2xl mb-3">🚨</div>
                                <div className="text-sm font-semibold text-white mb-2">
                                    <SecureText>{constructedClearanceLabels.emergencyResponseLabel}</SecureText>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <SecureText>{constructedClearanceInfo.emergencyResponse}</SecureText>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CSS Animations */}
                <style jsx>{`
                    @keyframes grid-move {
                        0% {
                            transform: translate(0, 0);
                        }
                        100% {
                            transform: translate(40px, 40px);
                        }
                    }
                    @keyframes float {
                        0%,
                        100% {
                            transform: translateY(0px);
                        }
                        50% {
                            transform: translateY(-10px);
                        }
                    }
                    .animate-float {
                        animation: float 3s ease-in-out infinite;
                    }
                `}</style>
            </div>
        );
    },
};

export default Contact4;
