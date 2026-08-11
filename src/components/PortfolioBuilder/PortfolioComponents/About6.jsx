import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x300/00FFFF/000000?text=Cyber+Security+Professional';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x300/00FFFF/000000?text=Cyber+Security+Professional';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x300/00FFFF/000000?text=Cyber+Security+Professional';
        return cleaned;
    },
};

// 🔒 SECURITY: Resume URL validator - only allows /shared/:resumeId format
const SecureResumeUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return null;
        const cleaned = url.trim();
        if (!cleaned) return null;
        // Only allow URLs that match the pattern /shared/:resumeId
        if (!cleaned.match(/^\/shared\/[a-zA-Z0-9_-]+$/)) return null;
        return cleaned;
    },
    open: (url) => {
        const validUrl = SecureResumeUrl.validate(url);
        if (!validUrl) {
            console.warn('🔒 SECURITY: Invalid resume URL format. Only /shared/:resumeId URLs are allowed.');
            return;
        }
        const fullUrl = `${window.location.origin}${validUrl}`;
        window.open(fullUrl, '_blank', 'noopener,noreferrer');
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const About6 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'Professional Bio' },
        profileImage: { type: 'text', label: 'Professional Image URL' },
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
        specializations: {
            type: 'array',
            label: 'Security Specializations',
            getItemSummary: (item) => `${item.area} - ${item.level}`,
            arrayFields: {
                area: { type: 'text', label: 'Specialization Area' },
                level: {
                    type: 'select',
                    label: 'Expertise Level',
                    options: [
                        { value: 'Expert', label: 'Expert' },
                        { value: 'Advanced', label: 'Advanced' },
                        { value: 'Intermediate', label: 'Intermediate' },
                        { value: 'Proficient', label: 'Proficient' },
                    ],
                },
                icon: {
                    type: 'select',
                    label: 'Icon Type',
                    options: [
                        { value: 'shield', label: 'Shield' },
                        { value: 'lock', label: 'Lock' },
                        { value: 'key', label: 'Key' },
                        { value: 'eye', label: 'Eye (Monitoring)' },
                        { value: 'bug', label: 'Bug (Testing)' },
                        { value: 'code', label: 'Code' },
                    ],
                },
            },
            defaultItemProps: {
                area: 'Threat Analysis',
                level: 'Expert',
                icon: 'shield',
            },
        },
        certifications: {
            type: 'array',
            label: 'Security Certifications',
            getItemSummary: (item) => item.name,
            arrayFields: {
                name: { type: 'text', label: 'Certification Name' },
                issuer: { type: 'text', label: 'Issuing Organization' },
                year: { type: 'text', label: 'Year Obtained' },
            },
            defaultItemProps: {
                name: 'CISSP',
                issuer: '(ISC)²',
                year: '2023',
            },
        },
        yearsExperience: { type: 'text', label: 'Years of Experience' },
        threatsBlocked: { type: 'text', label: 'Threats Blocked' },
        systemsSecured: { type: 'text', label: 'Systems Secured' },
        incidentsHandled: { type: 'text', label: 'Incidents Handled' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
    },
    defaultProps: {
        title: 'About My Security Expertise',
        content:
            'With extensive experience in cybersecurity, I specialize in protecting digital assets and infrastructure from evolving threats. My expertise spans threat hunting, incident response, vulnerability assessment, and security architecture. I hold multiple industry certifications and have successfully defended organizations against sophisticated cyber attacks.',
        profileImage: 'https://placehold.co/400x300/00FFFF/000000?text=Security+Professional',
        backgroundColor: 'bg-gradient-to-br from-gray-900 via-black to-gray-800',
        accentColor: 'cyan',
        specializations: [
            { area: 'Threat Intelligence', level: 'Expert', icon: 'eye' },
            { area: 'Incident Response', level: 'Expert', icon: 'shield' },
            { area: 'Vulnerability Assessment', level: 'Advanced', icon: 'bug' },
            { area: 'Security Architecture', level: 'Advanced', icon: 'lock' },
            { area: 'Penetration Testing', level: 'Expert', icon: 'key' },
            { area: 'Forensic Analysis', level: 'Advanced', icon: 'code' },
        ],
        certifications: [
            { name: 'CISSP', issuer: '(ISC)²', year: '2022' },
            { name: 'CEH', issuer: 'EC-Council', year: '2021' },
            { name: 'GCIH', issuer: 'GIAC', year: '2023' },
            { name: 'Security+', issuer: 'CompTIA', year: '2020' },
        ],
        yearsExperience: '8+',
        threatsBlocked: '50K+',
        systemsSecured: '200+',
        incidentsHandled: '500+',
        resumeUrl: '/shared/cybersec-resume-123',
    },
    render: ({
        title,
        content,
        profileImage,
        backgroundColor,
        accentColor,
        specializations = [],
        certifications = [],
        yearsExperience,
        threatsBlocked,
        systemsSecured,
        incidentsHandled,
        resumeUrl,
    }) => {
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
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.cyan;

        // Icon components for specializations
        const getIcon = (iconType) => {
            const iconClasses = `w-6 h-6 ${theme.text}`;
            switch (iconType) {
                case 'shield':
                    return (
                        <svg className={iconClasses} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.6 14.8,10.5V11.5C15.4,11.5 16,12.4 16,13V16C16,16.6 15.6,17 15,17H9C8.4,17 8,16.6 8,16V13C8,12.4 8.4,11.5 9,11.5V10.5C9,8.6 10.6,7 12,7M12,8.2C11.2,8.2 10.2,8.7 10.2,10.5V11.5H13.8V10.5C13.8,8.7 12.8,8.2 12,8.2Z" />
                        </svg>
                    );
                case 'lock':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2V9a2 2 0 00-2-2h-12a2 2 0 00-2 2v10a2 2 0 002 2zm10-12V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                    );
                case 'key':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                            />
                        </svg>
                    );
                case 'eye':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                        </svg>
                    );
                case 'bug':
                    return (
                        <svg className={iconClasses} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14,12H10V10H14M14,16H10V14H14M20,8H17.19C16.74,7.22 16.12,6.55 15.37,6.04L17,4.41L15.59,3L13.42,5.17C12.96,5.06 12.5,5 12,5C11.5,5 11.04,5.06 10.59,5.17L8.41,3L7,4.41L8.62,6.04C7.88,6.55 7.26,7.22 6.81,8H4V10H6.09C6.04,10.33 6,10.66 6,11V12H4V14H6V15C6,15.34 6.04,15.67 6.09,16H4V18H6.81C7.85,19.79 9.78,21 12,21C14.22,21 16.15,19.79 17.19,18H20V16H17.91C17.96,15.67 18,15.34 18,15V14H20V12H18V11C18,10.66 17.96,10.33 17.91,10H20V8Z" />
                        </svg>
                    );
                case 'code':
                    return (
                        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    );
                default:
                    return (
                        <svg className={iconClasses} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1Z" />
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
                                d="M12 15v2m-6 4h12a2 2 0 002-2V9a2 2 0 00-2-2h-12a2 2 0 00-2 2v10a2 2 0 002 2zm10-12V7a4 4 0 00-8 0v4h8z"
                            />
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
                            <span className={`text-sm font-medium ${theme.text} uppercase tracking-wider`}>SECURITY PROFILE</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
                            <SecureText className="text-white">{title}</SecureText>
                        </h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-16 items-start">
                        {/* Left Column - Profile & Bio */}
                        <div className="space-y-8">
                            {/* Profile Image */}
                            <div className="relative">
                                <div className={`absolute inset-0 bg-gradient-to-br ${theme.primary} rounded-2xl transform rotate-2 opacity-20 blur-sm`}></div>
                                <div className={`relative bg-black/50 p-6 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                    <img
                                        src={SecureUrl.validate(profileImage)}
                                        alt="Security Professional"
                                        className={`w-full h-80 object-cover rounded-xl border-2 ${theme.border} ${theme.glow} shadow-2xl`}
                                        onError={(e) => {
                                            e.target.src = 'https://placehold.co/400x300/00FFFF/000000?text=Security+Professional';
                                        }}
                                    />
                                    <div className={`absolute -top-2 -right-2 flex items-center px-3 py-1 ${theme.accent} text-black text-xs font-bold rounded-full`}>
                                        <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                                        VERIFIED
                                    </div>
                                </div>
                            </div>

                            {/* Bio Content */}
                            <div className={`p-8 bg-black/30 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <div className="flex items-start gap-4 mb-6">
                                    <div className={`w-12 h-12 bg-gradient-to-r ${theme.primary} rounded-xl flex items-center justify-center shadow-lg`}>
                                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className={`text-xl font-bold ${theme.text} mb-2`}>Professional Background</h3>
                                        <p className="text-gray-300 leading-relaxed">
                                            <SecureText>{content}</SecureText>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Security Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                    <div className={`text-2xl font-bold ${theme.text} mb-1`}>
                                        <SecureText>{yearsExperience}</SecureText>
                                    </div>
                                    <div className="text-sm text-gray-400">Years Experience</div>
                                </div>
                                <div className={`p-4 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                    <div className={`text-2xl font-bold ${theme.text} mb-1`}>
                                        <SecureText>{threatsBlocked}</SecureText>
                                    </div>
                                    <div className="text-sm text-gray-400">Threats Blocked</div>
                                </div>
                                <div className={`p-4 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                    <div className={`text-2xl font-bold ${theme.text} mb-1`}>
                                        <SecureText>{systemsSecured}</SecureText>
                                    </div>
                                    <div className="text-sm text-gray-400">Systems Secured</div>
                                </div>
                                <div className={`p-4 bg-black/30 rounded-xl border ${theme.border} backdrop-blur-sm text-center`}>
                                    <div className={`text-2xl font-bold ${theme.text} mb-1`}>
                                        <SecureText>{incidentsHandled}</SecureText>
                                    </div>
                                    <div className="text-sm text-gray-400">Incidents Handled</div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Specializations & Certifications */}
                        <div className="space-y-8">
                            {/* Security Specializations */}
                            <div className={`p-8 bg-black/30 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-10 h-10 bg-gradient-to-r ${theme.primary} rounded-lg flex items-center justify-center`}>
                                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" />
                                        </svg>
                                    </div>
                                    <h3 className={`text-2xl font-bold ${theme.text}`}>Security Specializations</h3>
                                </div>
                                <div className="grid gap-4">
                                    {specializations.map((spec, index) => (
                                        <div key={index} className={`flex items-center gap-4 p-4 ${theme.light} rounded-xl border border-white/5`}>
                                            <div className={`w-12 h-12 ${theme.bg} rounded-lg flex items-center justify-center border ${theme.border}`}>{getIcon(spec.icon)}</div>
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-white">
                                                    <SecureText>{spec.area}</SecureText>
                                                </h4>
                                                <p className={`text-sm ${theme.text}`}>
                                                    <SecureText>{spec.level}</SecureText>
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Certifications */}
                            <div className={`p-8 bg-black/30 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-10 h-10 bg-gradient-to-r ${theme.primary} rounded-lg flex items-center justify-center`}>
                                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className={`text-2xl font-bold ${theme.text}`}>Certifications</h3>
                                </div>
                                <div className="grid gap-4">
                                    {certifications.map((cert, index) => (
                                        <div key={index} className={`p-4 ${theme.light} rounded-xl border border-white/5`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-white mb-1">
                                                        <SecureText>{cert.name}</SecureText>
                                                    </h4>
                                                    <p className="text-gray-400 text-sm">
                                                        <SecureText>{cert.issuer}</SecureText>
                                                    </p>
                                                </div>
                                                <span className={`px-3 py-1 ${theme.bg} ${theme.text} text-xs font-semibold rounded-full border ${theme.border}`}>
                                                    <SecureText>{cert.year}</SecureText>
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Download CV Button */}
                            {resumeUrl && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => SecureResumeUrl.open(resumeUrl)}
                                        className={`px-8 py-4 bg-gradient-to-r ${theme.primary} text-black font-bold rounded-lg transition-all duration-300 hover:scale-105 ${theme.glow} shadow-lg hover:shadow-xl flex items-center gap-2`}>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        Download CV
                                    </button>
                                </div>
                            )}
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

export default About6;
