import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/80x80/00FFFF/000000?text=Company';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/80x80/00FFFF/000000?text=Company';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/80x80/00FFFF/000000?text=Company';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Experience6 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
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
        experiences: {
            type: 'array',
            label: 'Security Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Position/Role' },
                company: { type: 'text', label: 'Company/Organization' },
                securityLevel: {
                    type: 'select',
                    label: 'Security Clearance Level',
                    options: [
                        { value: 'public', label: 'Public' },
                        { value: 'confidential', label: 'Confidential' },
                        { value: 'secret', label: 'Secret' },
                        { value: 'top-secret', label: 'Top Secret' },
                    ],
                },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Role Description' },
                threatsHandled: { type: 'text', label: 'Threats Handled (e.g., "500+")' },
                incidentsResolved: { type: 'text', label: 'Incidents Resolved' },
                securityDomains: {
                    type: 'array',
                    label: 'Security Domains',
                    arrayFields: {
                        domain: { type: 'text', label: 'Security Domain' },
                        level: {
                            type: 'select',
                            label: 'Expertise Level',
                            options: [
                                { value: 'expert', label: 'Expert' },
                                { value: 'advanced', label: 'Advanced' },
                                { value: 'intermediate', label: 'Intermediate' },
                                { value: 'basic', label: 'Basic' },
                            ],
                        },
                    },
                    defaultItemProps: {
                        domain: 'Threat Hunting',
                        level: 'advanced',
                    },
                },
                certifications: {
                    type: 'array',
                    label: 'Certifications Earned',
                    arrayFields: {
                        certification: { type: 'text', label: 'Certification Name' },
                        year: { type: 'text', label: 'Year Obtained' },
                    },
                    defaultItemProps: {
                        certification: 'CISSP',
                        year: '2023',
                    },
                },
                tools: { type: 'text', label: 'Security Tools Used' },
                companyLogo: { type: 'text', label: 'Company Logo URL (Optional)' },
                companyType: {
                    type: 'select',
                    label: 'Organization Type',
                    options: [
                        { value: 'enterprise', label: 'Enterprise' },
                        { value: 'government', label: 'Government' },
                        { value: 'consulting', label: 'Consulting' },
                        { value: 'startup', label: 'Startup' },
                        { value: 'healthcare', label: 'Healthcare' },
                        { value: 'finance', label: 'Finance' },
                        { value: 'education', label: 'Education' },
                        { value: 'military', label: 'Military/Defense' },
                    ],
                },
            },
            defaultItemProps: {
                position: 'Senior Security Analyst',
                company: 'CyberSecure Corp',
                securityLevel: 'confidential',
                location: 'Washington, DC',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Lead security operations including threat hunting, incident response, and vulnerability management across enterprise infrastructure.',
                threatsHandled: '1,200+',
                incidentsResolved: '150+',
                securityDomains: [
                    { domain: 'Threat Hunting', level: 'expert' },
                    { domain: 'Incident Response', level: 'advanced' },
                ],
                certifications: [
                    { certification: 'CISSP', year: '2023' },
                    { certification: 'GCIH', year: '2022' },
                ],
                tools: 'Splunk, Wireshark, Metasploit, Nessus, CrowdStrike',
                companyLogo: 'https://placehold.co/80x80/00FFFF/000000?text=Company',
                companyType: 'enterprise',
            },
        },
    },
    defaultProps: {
        title: 'Security Operations Timeline',
        subtitle: 'Professional cybersecurity experience defending against evolving threats',
        backgroundColor: 'bg-gradient-to-br from-gray-900 via-black to-gray-800',
        accentColor: 'cyan',
        experiences: [
            {
                position: 'Senior Security Architect',
                company: 'SecureNet Solutions',
                securityLevel: 'secret',
                location: 'San Francisco, CA',
                startDate: 'Mar 2023',
                endDate: 'Present',
                description: 'Leading security architecture design for enterprise clients, implementing zero-trust frameworks, and conducting advanced threat modeling.',
                threatsHandled: '2,500+',
                incidentsResolved: '200+',
                securityDomains: [
                    { domain: 'Security Architecture', level: 'expert' },
                    { domain: 'Zero Trust Implementation', level: 'expert' },
                    { domain: 'Threat Modeling', level: 'advanced' },
                ],
                certifications: [
                    { certification: 'SABSA', year: '2023' },
                    { certification: 'CISSP', year: '2021' },
                ],
                tools: 'TOGAF, Threat Dragon, Microsoft Threat Modeling Tool, Splunk Enterprise Security',
                companyLogo: 'https://placehold.co/80x80/00FFFF/000000?text=SN',
                companyType: 'consulting',
            },
            {
                position: 'Threat Hunter',
                company: 'CyberDefense Inc',
                securityLevel: 'confidential',
                location: 'Austin, TX',
                startDate: 'Jan 2021',
                endDate: 'Feb 2023',
                description: 'Proactive threat hunting across hybrid cloud environments, developing custom detection rules, and leading incident response efforts.',
                threatsHandled: '1,800+',
                incidentsResolved: '350+',
                securityDomains: [
                    { domain: 'Threat Hunting', level: 'expert' },
                    { domain: 'Digital Forensics', level: 'advanced' },
                    { domain: 'Malware Analysis', level: 'advanced' },
                ],
                certifications: [
                    { certification: 'GCTI', year: '2022' },
                    { certification: 'GCIH', year: '2021' },
                ],
                tools: 'YARA, Sigma, ELK Stack, Volatility, Autopsy, CrowdStrike Falcon',
                companyLogo: 'https://placehold.co/80x80/FF6B6B/FFFFFF?text=CD',
                companyType: 'enterprise',
            },
            {
                position: 'Security Analyst II',
                company: 'FinTech Security',
                securityLevel: 'public',
                location: 'New York, NY',
                startDate: 'Jun 2019',
                endDate: 'Dec 2020',
                description: 'Monitored security events, conducted vulnerability assessments, and implemented security controls for financial services infrastructure.',
                threatsHandled: '900+',
                incidentsResolved: '180+',
                securityDomains: [
                    { domain: 'SIEM Operations', level: 'advanced' },
                    { domain: 'Vulnerability Management', level: 'advanced' },
                    { domain: 'Compliance Auditing', level: 'intermediate' },
                ],
                certifications: [
                    { certification: 'Security+', year: '2020' },
                    { certification: 'CySA+', year: '2019' },
                ],
                tools: 'QRadar, Nessus, Burp Suite, Wireshark, Nmap, Metasploit',
                companyLogo: 'https://placehold.co/80x80/4ECDC4/FFFFFF?text=FT',
                companyType: 'finance',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, accentColor, experiences = [] }) => {
        const colorThemes = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'text-cyan-400',
                accent: 'bg-cyan-500',
                border: 'border-cyan-400',
                ring: 'ring-cyan-400/20',
                glow: 'shadow-cyan-500/50',
                text: 'text-cyan-400',
                bg: 'bg-cyan-500/10',
                light: 'bg-cyan-500/5',
                timeline: 'bg-gradient-to-b from-cyan-500 to-blue-600',
                dot: 'bg-cyan-500',
            },
            red: {
                primary: 'from-red-400 to-red-600',
                secondary: 'text-red-400',
                accent: 'bg-red-500',
                border: 'border-red-400',
                ring: 'ring-red-400/20',
                glow: 'shadow-red-500/50',
                text: 'text-red-400',
                bg: 'bg-red-500/10',
                light: 'bg-red-500/5',
                timeline: 'bg-gradient-to-b from-red-500 to-orange-600',
                dot: 'bg-red-500',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'text-green-400',
                accent: 'bg-green-500',
                border: 'border-green-400',
                ring: 'ring-green-400/20',
                glow: 'shadow-green-500/50',
                text: 'text-green-400',
                bg: 'bg-green-500/10',
                light: 'bg-green-500/5',
                timeline: 'bg-gradient-to-b from-green-500 to-emerald-600',
                dot: 'bg-green-500',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'text-purple-400',
                accent: 'bg-purple-500',
                border: 'border-purple-400',
                ring: 'ring-purple-400/20',
                glow: 'shadow-purple-500/50',
                text: 'text-purple-400',
                bg: 'bg-purple-500/10',
                light: 'bg-purple-500/5',
                timeline: 'bg-gradient-to-b from-purple-500 to-violet-600',
                dot: 'bg-purple-500',
            },
            orange: {
                primary: 'from-orange-400 to-red-500',
                secondary: 'text-orange-400',
                accent: 'bg-orange-500',
                border: 'border-orange-400',
                ring: 'ring-orange-400/20',
                glow: 'shadow-orange-500/50',
                text: 'text-orange-400',
                bg: 'bg-orange-500/10',
                light: 'bg-orange-500/5',
                timeline: 'bg-gradient-to-b from-orange-500 to-red-600',
                dot: 'bg-orange-500',
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.cyan;

        // Security level styling
        const getSecurityLevelStyling = (level) => {
            const normalizedLevel = level ? level.toLowerCase() : 'public';
            switch (normalizedLevel) {
                case 'top-secret':
                    return {
                        bg: 'bg-red-500/20',
                        border: 'border-red-500',
                        text: 'text-red-400',
                        icon: '🔒',
                    };
                case 'secret':
                    return {
                        bg: 'bg-orange-500/20',
                        border: 'border-orange-500',
                        text: 'text-orange-400',
                        icon: '🛡️',
                    };
                case 'confidential':
                    return {
                        bg: 'bg-yellow-500/20',
                        border: 'border-yellow-500',
                        text: 'text-yellow-400',
                        icon: '🔐',
                    };
                case 'public':
                    return {
                        bg: 'bg-green-500/20',
                        border: 'border-green-500',
                        text: 'text-green-400',
                        icon: '🌐',
                    };
                default:
                    return {
                        bg: 'bg-green-500/20',
                        border: 'border-green-500',
                        text: 'text-green-400',
                        icon: '🌐',
                    };
            }
        };

        // Company type icons
        const getCompanyIcon = (type) => {
            switch (type) {
                case 'government':
                    return '🏛️';
                case 'military':
                    return '⚔️';
                case 'finance':
                    return '🏦';
                case 'healthcare':
                    return '🏥';
                case 'consulting':
                    return '💼';
                case 'startup':
                    return '🚀';
                case 'education':
                    return '🎓';
                case 'enterprise':
                    return '🏢';
                default:
                    return '🔐';
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
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                        </svg>
                    </div>

                    {/* Binary Code Effect */}
                    <div className="absolute top-1/4 right-1/4 font-mono text-xs opacity-5 animate-pulse">
                        <div className={`${theme.text}`}>01010011</div>
                        <div className={`${theme.text} delay-100`}>01100101</div>
                        <div className={`${theme.text} delay-200`}>01100011</div>
                    </div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.bg} border ${theme.border} rounded-full backdrop-blur-sm mb-8`}>
                            <div className={`w-2 h-2 ${theme.accent} rounded-full mr-3 animate-pulse`}></div>
                            <span className={`text-sm font-medium ${theme.text} uppercase tracking-wider`}>SECURITY TIMELINE</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
                            <SecureText className="text-white">{title}</SecureText>
                        </h2>
                        <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                            <SecureText>{subtitle}</SecureText>
                        </p>
                    </div>

                    {/* Experience Timeline */}
                    <div className="relative">
                        {/* Main Timeline Line */}
                        <div className={`absolute left-8 top-0 bottom-0 w-1 ${theme.timeline} rounded-full shadow-lg opacity-50`}></div>

                        <div className="space-y-12">
                            {experiences.map((exp, index) => {
                                const securityStyling = getSecurityLevelStyling(exp.securityLevel);
                                return (
                                    <div key={index} className="relative pl-20" style={{ animationDelay: `${index * 200}ms` }}>
                                        {/* Timeline Dot */}
                                        <div className={`absolute left-4 w-8 h-8 ${theme.dot} rounded-full border-4 border-gray-800 shadow-xl z-10 flex items-center justify-center animate-pulse`}>
                                            <div className={`w-2 h-2 bg-white rounded-full`}></div>
                                        </div>

                                        {/* Experience Card */}
                                        <div
                                            className={`group relative p-8 bg-black/40 rounded-2xl border ${theme.border} backdrop-blur-sm hover:${theme.glow} transition-all duration-500 hover:scale-[1.02]`}>
                                            {/* Card Header */}
                                            <div className="flex items-start justify-between mb-6">
                                                <div className="flex items-center gap-4">
                                                    {exp.companyLogo && (
                                                        <div className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${theme.border} bg-black/50`}>
                                                            <img src={SecureUrl.validate(exp.companyLogo)} alt={`${exp.company} logo`} className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h3 className="text-2xl font-bold text-white mb-1">
                                                            <SecureText>{exp.position}</SecureText>
                                                        </h3>
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className={`text-lg ${theme.text} font-semibold`}>
                                                                <SecureText>{exp.company}</SecureText>
                                                            </span>
                                                            <span className="text-2xl">{getCompanyIcon(exp.companyType)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                                            <span>
                                                                📍 <SecureText>{exp.location}</SecureText>
                                                            </span>
                                                            <span>
                                                                📅 <SecureText>{exp.startDate}</SecureText> - <SecureText>{exp.endDate}</SecureText>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Security Clearance Badge */}
                                                <div className={`px-4 py-2 ${securityStyling.bg} border ${securityStyling.border} rounded-lg flex items-center gap-2 backdrop-blur-sm`}>
                                                    <span className="text-lg">{securityStyling.icon}</span>
                                                    <span className={`text-sm font-bold ${securityStyling.text} uppercase`}>
                                                        <SecureText>{exp.securityLevel ? exp.securityLevel.replace('-', ' ') : 'Public'}</SecureText>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-gray-300 text-lg leading-relaxed mb-6">
                                                <SecureText>{exp.description}</SecureText>
                                            </p>

                                            {/* Security Metrics */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                <div className={`p-4 ${theme.light} rounded-xl border border-white/10`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
                                                            <svg className={`w-5 h-5 ${theme.text}`} fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <div className={`text-2xl font-bold ${theme.text}`}>
                                                                <SecureText>{exp.threatsHandled}</SecureText>
                                                            </div>
                                                            <div className="text-sm text-gray-400">Threats Handled</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`p-4 ${theme.light} rounded-xl border border-white/10`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
                                                            <svg className={`w-5 h-5 ${theme.text}`} fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <div className={`text-2xl font-bold ${theme.text}`}>
                                                                <SecureText>{exp.incidentsResolved}</SecureText>
                                                            </div>
                                                            <div className="text-sm text-gray-400">Incidents Resolved</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Security Domains */}
                                            {exp.securityDomains && exp.securityDomains.length > 0 && (
                                                <div className="mb-6">
                                                    <h4 className="text-lg font-semibold text-white mb-3">Security Domains</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {exp.securityDomains.map((domain, idx) => (
                                                            <div key={idx} className={`p-3 ${theme.light} rounded-lg border border-white/5 flex items-center justify-between`}>
                                                                <span className="text-white font-medium">
                                                                    <SecureText>{domain.domain}</SecureText>
                                                                </span>
                                                                <span className={`px-2 py-1 text-xs rounded ${theme.bg} ${theme.text} font-bold uppercase`}>
                                                                    <SecureText>{domain.level}</SecureText>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Certifications */}
                                            {exp.certifications && exp.certifications.length > 0 && (
                                                <div className="mb-6">
                                                    <h4 className="text-lg font-semibold text-white mb-3">Certifications Earned</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {exp.certifications.map((cert, idx) => (
                                                            <div key={idx} className={`px-3 py-2 ${theme.bg} border ${theme.border} rounded-lg flex items-center gap-2`}>
                                                                <span className="text-lg">🏆</span>
                                                                <span className={`text-sm font-semibold ${theme.text}`}>
                                                                    <SecureText>{cert.certification}</SecureText>
                                                                </span>
                                                                <span className="text-xs text-gray-400">
                                                                    (<SecureText>{cert.year}</SecureText>)
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Security Tools */}
                                            <div className="mb-6">
                                                <h4 className="text-lg font-semibold text-white mb-3">Security Tools & Technologies</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {exp.tools ? (
                                                        exp.tools.split(',').map((tool, idx) => (
                                                            <span key={idx} className={`px-3 py-1 text-sm ${theme.light} border border-white/10 rounded-full text-gray-300`}>
                                                                <SecureText>{tool.trim()}</SecureText>
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className={`px-3 py-1 text-sm ${theme.light} border border-white/10 rounded-full text-gray-300`}>
                                                            <SecureText>No tools specified</SecureText>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Hover Effect Overlay */}
                                            <div className={`absolute inset-0 bg-gradient-to-r ${theme.primary} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Career Summary */}
                    <div className="mt-20 grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{experiences.length}</div>
                            <div className="text-sm text-gray-400">Security Roles</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{experiences.reduce((total, exp) => total + (exp.certifications ? exp.certifications.length : 0), 0)}</div>
                            <div className="text-sm text-gray-400">Certifications</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{experiences.reduce((total, exp) => total + (exp.securityDomains ? exp.securityDomains.length : 0), 0)}</div>
                            <div className="text-sm text-gray-400">Security Domains</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{new Date().getFullYear() - 2018}+</div>
                            <div className="text-sm text-gray-400">Years Experience</div>
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

export default Experience6;
