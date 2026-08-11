import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x300/00FFFF/000000?text=Security+Skill';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x300/00FFFF/000000?text=Security+Skill';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x300/00FFFF/000000?text=Security+Skill';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills6 = {
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
        // Cyber Security specific skills
        skills: {
            type: 'array',
            label: 'Security Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Proficiency Level (%)' },
                category: {
                    type: 'select',
                    label: 'Security Domain',
                    options: [
                        { value: 'offensive', label: 'Offensive Security' },
                        { value: 'defensive', label: 'Defensive Security' },
                        { value: 'governance', label: 'Governance & Compliance' },
                        { value: 'forensics', label: 'Digital Forensics' },
                        { value: 'architecture', label: 'Security Architecture' },
                        { value: 'tools', label: 'Security Tools' },
                    ],
                },
                certification: { type: 'text', label: 'Related Certification (Optional)' },
                yearsExperience: { type: 'text', label: 'Years of Experience' },
                riskLevel: {
                    type: 'select',
                    label: 'Threat Level',
                    options: [
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ],
                },
            },
            defaultItemProps: {
                name: 'Threat Hunting',
                level: 90,
                category: 'defensive',
                certification: 'GCTI',
                yearsExperience: '3+',
                riskLevel: 'critical',
            },
        },
        showcaseMode: {
            type: 'radio',
            label: 'Display Mode',
            options: [
                { label: 'Security Matrix Grid', value: 'matrix' },
                { label: 'Threat Assessment View', value: 'threat' },
            ],
        },
    },
    defaultProps: {
        title: 'Security Skill Matrix',
        subtitle: 'Advanced cybersecurity capabilities across multiple domains',
        backgroundColor: 'bg-gradient-to-br from-gray-900 via-black to-gray-800',
        accentColor: 'cyan',
        showcaseMode: 'matrix',
        skills: [
            { name: 'Threat Hunting', level: 95, category: 'defensive', certification: 'GCTI', yearsExperience: '5+', riskLevel: 'critical' },
            { name: 'Penetration Testing', level: 92, category: 'offensive', certification: 'OSCP', yearsExperience: '4+', riskLevel: 'critical' },
            { name: 'Incident Response', level: 90, category: 'defensive', certification: 'GCIH', yearsExperience: '6+', riskLevel: 'critical' },
            { name: 'Malware Analysis', level: 88, category: 'forensics', certification: 'GREM', yearsExperience: '3+', riskLevel: 'high' },
            { name: 'Vulnerability Assessment', level: 85, category: 'offensive', certification: 'CEH', yearsExperience: '4+', riskLevel: 'high' },
            { name: 'Security Architecture', level: 87, category: 'architecture', certification: 'SABSA', yearsExperience: '5+', riskLevel: 'medium' },
            { name: 'Digital Forensics', level: 83, category: 'forensics', certification: 'GCFA', yearsExperience: '3+', riskLevel: 'high' },
            { name: 'Risk Assessment', level: 80, category: 'governance', certification: 'CRISC', yearsExperience: '4+', riskLevel: 'medium' },
            { name: 'Security Automation', level: 78, category: 'tools', certification: 'Python/SOAR', yearsExperience: '2+', riskLevel: 'medium' },
            { name: 'Cloud Security', level: 82, category: 'architecture', certification: 'CCSP', yearsExperience: '3+', riskLevel: 'high' },
            { name: 'Network Security', level: 89, category: 'defensive', certification: 'GCFW', yearsExperience: '5+', riskLevel: 'high' },
            { name: 'Compliance Auditing', level: 75, category: 'governance', certification: 'CISA', yearsExperience: '3+', riskLevel: 'low' },
        ],
    },
    render: ({ title, subtitle, backgroundColor, accentColor, skills = [], showcaseMode }) => {
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
                progress: 'bg-gradient-to-r from-cyan-500 to-blue-500',
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
                progress: 'bg-gradient-to-r from-red-500 to-orange-500',
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
                progress: 'bg-gradient-to-r from-green-500 to-emerald-500',
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
                progress: 'bg-gradient-to-r from-purple-500 to-violet-500',
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
                progress: 'bg-gradient-to-r from-orange-500 to-red-500',
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.cyan;

        // Risk level styling
        const getRiskStyling = (riskLevel) => {
            switch (riskLevel) {
                case 'critical':
                    return {
                        indicator: 'bg-red-500',
                        text: 'text-red-400',
                        border: 'border-red-500/30',
                        glow: 'shadow-red-500/30',
                    };
                case 'high':
                    return {
                        indicator: 'bg-orange-500',
                        text: 'text-orange-400',
                        border: 'border-orange-500/30',
                        glow: 'shadow-orange-500/30',
                    };
                case 'medium':
                    return {
                        indicator: 'bg-yellow-500',
                        text: 'text-yellow-400',
                        border: 'border-yellow-500/30',
                        glow: 'shadow-yellow-500/30',
                    };
                case 'low':
                    return {
                        indicator: 'bg-green-500',
                        text: 'text-green-400',
                        border: 'border-green-500/30',
                        glow: 'shadow-green-500/30',
                    };
                default:
                    return {
                        indicator: theme.accent,
                        text: theme.text,
                        border: theme.border,
                        glow: theme.glow,
                    };
            }
        };

        // Category icons
        const getCategoryIcon = (category) => {
            const iconClasses = `w-5 h-5 ${theme.text}`;
            switch (category) {
                case 'offensive':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                            />
                        </svg>
                    );
                case 'defensive':
                    return (
                        <svg className={iconClasses} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" />
                        </svg>
                    );
                case 'governance':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                        </svg>
                    );
                case 'forensics':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    );
                case 'architecture':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                        </svg>
                    );
                case 'tools':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    );
                default:
                    return (
                        <svg className={iconClasses} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" />
                        </svg>
                    );
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
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>

                    {/* Binary Code Effect */}
                    <div className="absolute top-1/4 right-1/4 font-mono text-xs opacity-5 animate-pulse">
                        <div className={`${theme.text}`}>01001001</div>
                        <div className={`${theme.text} delay-100`}>11010010</div>
                        <div className={`${theme.text} delay-200`}>10101100</div>
                    </div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.bg} border ${theme.border} rounded-full backdrop-blur-sm mb-8`}>
                            <div className={`w-2 h-2 ${theme.accent} rounded-full mr-3 animate-pulse`}></div>
                            <span className={`text-sm font-medium ${theme.text} uppercase tracking-wider`}>SECURITY ASSESSMENT</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
                            <SecureText className="text-white">{title}</SecureText>
                        </h2>
                        <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                            <SecureText>{subtitle}</SecureText>
                        </p>
                    </div>

                    {/* Skills Display */}
                    {showcaseMode === 'matrix' ? (
                        // Security Matrix Grid View
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {skills.map((skill, index) => {
                                const riskStyling = getRiskStyling(skill.riskLevel);
                                return (
                                    <div
                                        key={index}
                                        className={`group relative p-6 bg-black/30 rounded-2xl border ${riskStyling.border} backdrop-blur-sm hover:${riskStyling.glow} transition-all duration-300 hover:scale-105`}
                                        style={{ animationDelay: `${index * 100}ms` }}>
                                        {/* Skill Header */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center border ${theme.border}`}>{getCategoryIcon(skill.category)}</div>
                                                <div>
                                                    <h3 className="font-semibold text-white text-lg">
                                                        <SecureText>{skill.name}</SecureText>
                                                    </h3>
                                                    <p className="text-xs text-gray-400 uppercase tracking-wide">
                                                        <SecureText>{skill.category.replace(/([A-Z])/g, ' $1').trim()}</SecureText>
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Risk Level Indicator */}
                                            <div className={`w-3 h-3 ${riskStyling.indicator} rounded-full animate-pulse`}></div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mb-4">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-sm text-gray-300">Proficiency</span>
                                                <span className={`text-sm font-bold ${theme.text}`}>
                                                    <SecureText>{skill.level}</SecureText>%
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-full ${theme.progress} transition-all duration-1000 ease-out`}
                                                    style={{
                                                        width: `${skill.level}%`,
                                                        boxShadow: `0 0 10px ${theme.text.replace('text-', '')}`,
                                                    }}></div>
                                            </div>
                                        </div>

                                        {/* Skill Details */}
                                        <div className="space-y-3">
                                            {skill.certification && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-400">Certification</span>
                                                    <span className={`px-2 py-1 ${theme.bg} ${theme.text} text-xs rounded border ${theme.border}`}>
                                                        <SecureText>{skill.certification}</SecureText>
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">Experience</span>
                                                <span className="text-xs text-white font-medium">
                                                    <SecureText>{skill.yearsExperience}</SecureText>
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">Threat Level</span>
                                                <span className={`text-xs font-bold ${riskStyling.text} uppercase`}>
                                                    <SecureText>{skill.riskLevel}</SecureText>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Hover Effect Overlay */}
                                        <div className={`absolute inset-0 bg-gradient-to-r ${theme.primary} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`}></div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Threat Assessment View
                        <div className="space-y-6">
                            {['critical', 'high', 'medium', 'low'].map((riskLevel) => {
                                const riskSkills = skills.filter((skill) => skill.riskLevel === riskLevel);
                                if (riskSkills.length === 0) return null;

                                const riskStyling = getRiskStyling(riskLevel);

                                return (
                                    <div key={riskLevel} className={`p-6 bg-black/20 rounded-2xl border ${riskStyling.border} backdrop-blur-sm`}>
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className={`w-4 h-4 ${riskStyling.indicator} rounded-full animate-pulse`}></div>
                                            <h3 className={`text-2xl font-bold ${riskStyling.text} uppercase tracking-wide`}>{riskLevel} Priority Skills</h3>
                                            <span className="text-gray-400">({riskSkills.length})</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {riskSkills.map((skill, index) => (
                                                <div key={index} className={`p-4 ${theme.light} rounded-xl border border-white/5 hover:border-white/10 transition-all duration-300`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="font-semibold text-white">
                                                            <SecureText>{skill.name}</SecureText>
                                                        </h4>
                                                        <span className={`text-sm font-bold ${theme.text}`}>
                                                            <SecureText>{skill.level}</SecureText>%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
                                                        <div className={`h-full ${theme.progress} rounded-full transition-all duration-1000`} style={{ width: `${skill.level}%` }}></div>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-400">
                                                            <SecureText>{skill.yearsExperience}</SecureText> exp
                                                        </span>
                                                        {skill.certification && (
                                                            <span className={`px-2 py-1 ${theme.bg} ${theme.text} rounded`}>
                                                                <SecureText>{skill.certification}</SecureText>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Security Summary Dashboard */}
                    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{skills.length}</div>
                            <div className="text-sm text-gray-400">Total Skills</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{Math.round(skills.reduce((sum, skill) => sum + skill.level, 0) / skills.length) || 0}%</div>
                            <div className="text-sm text-gray-400">Avg Proficiency</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{skills.filter((skill) => skill.riskLevel === 'critical').length}</div>
                            <div className="text-sm text-gray-400">Critical Skills</div>
                        </div>
                        <div className={`p-6 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                            <div className={`text-3xl font-bold ${theme.text} mb-2`}>{[...new Set(skills.map((skill) => skill.category))].length}</div>
                            <div className="text-sm text-gray-400">Domains</div>
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

export default Skills6;
