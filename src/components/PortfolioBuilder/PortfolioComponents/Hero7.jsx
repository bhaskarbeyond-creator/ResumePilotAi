import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x400/00FFFF/000000?text=Cyber+Security+Professional';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x400/00FFFF/000000?text=Cyber+Security+Professional';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x400/00FFFF/000000?text=Cyber+Security+Professional';
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
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const Hero7 = {
    fields: {
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
    defaultProps: {
        name: 'Alex Rodriguez',
        title: 'Senior Cybersecurity Analyst',
        description:
            'Protecting digital assets and infrastructure from evolving cyber threats. Specialized in threat hunting, incident response, and security architecture with extensive experience in enterprise security solutions.',
        image: 'https://placehold.co/400x400/00FFFF/000000?text=Cyber+Security+Expert',
        backgroundColor: 'bg-gradient-to-br from-gray-900 via-black to-gray-800',
        accentColor: 'cyan',
        securityCerts: '12+',
        threatsBlocked: '50K+',
        systemsSecured: '200+',
        vulnerabilitiesFound: '1.2K+',
        resumeUrl: '/shared/cybersec-resume-123',
        specialization: 'Threat Intelligence & Incident Response',
        yearsExperience: '8+',
    },
    render: ({ name, title, description, image, backgroundColor, accentColor, securityCerts, threatsBlocked, systemsSecured, vulnerabilitiesFound, resumeUrl, specialization, yearsExperience }) => {
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
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.cyan;

        return (
            <div className={`${backgroundColor} relative min-h-screen overflow-hidden`}>
                {/* Animated Grid Background */}
                <div className="absolute inset-0 opacity-10">
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
                    <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${theme.primary} opacity-60 animate-pulse`}></div>
                    <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r ${theme.primary} opacity-60 animate-pulse delay-1000`}></div>
                    <div className={`absolute top-0 left-0 w-0.5 h-full bg-gradient-to-b ${theme.primary} opacity-60 animate-pulse delay-500`}></div>
                    <div className={`absolute top-0 right-0 w-0.5 h-full bg-gradient-to-b ${theme.primary} opacity-60 animate-pulse delay-1500`}></div>
                </div>

                {/* Floating Security Elements */}
                <div className="absolute inset-0 overflow-hidden">
                    {/* Shield Icons */}
                    <div className={`absolute top-20 left-20 w-8 h-8 ${theme.text} opacity-20 animate-float`}>
                        <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.6 14.8,10.5V11.5C15.4,11.5 16,12.4 16,13V16C16,16.6 15.6,17 15,17H9C8.4,17 8,16.6 8,16V13C8,12.4 8.4,11.5 9,11.5V10.5C9,8.6 10.6,7 12,7M12,8.2C11.2,8.2 10.2,8.7 10.2,10.5V11.5H13.8V10.5C13.8,8.7 12.8,8.2 12,8.2Z" />
                        </svg>
                    </div>
                    <div className={`absolute bottom-32 right-16 w-6 h-6 ${theme.text} opacity-15 animate-float delay-1000`}>
                        <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1Z" />
                        </svg>
                    </div>

                    {/* Binary Code Effect */}
                    <div className="absolute top-1/4 right-1/4 font-mono text-xs opacity-10 animate-pulse">
                        <div className={`${theme.text}`}>01001001</div>
                        <div className={`${theme.text} delay-100`}>11010010</div>
                        <div className={`${theme.text} delay-200`}>10101100</div>
                    </div>
                </div>

                <div className="relative py-20 px-6 min-h-screen">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid lg:grid-cols-12 gap-12 items-center">
                            {/* Left Column - Main Content */}
                            <div className="lg:col-span-7 space-y-8">
                                {/* Security Badge */}
                                <div className={`inline-flex items-center px-4 py-2 ${theme.bg} ${theme.border} border rounded-full backdrop-blur-sm`}>
                                    <div className={`w-2 h-2 ${theme.accent} rounded-full mr-3 animate-pulse`}></div>
                                    <span className={`text-sm font-medium ${theme.text}`}>SYSTEM SECURE</span>
                                </div>

                                {/* Name & Title */}
                                <div className="space-y-4">
                                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
                                        <SecureText>{name}</SecureText>
                                    </h1>
                                    <div className={`inline-flex items-center px-6 py-3 bg-gradient-to-r ${theme.primary} text-black rounded-lg font-semibold text-lg ${theme.glow} shadow-lg`}>
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                            />
                                        </svg>
                                        <SecureText>{title}</SecureText>
                                    </div>
                                </div>

                                {/* Specialization */}
                                <div className={`p-4 ${theme.bg} rounded-lg border ${theme.border} backdrop-blur-sm`}>
                                    <h3 className={`text-sm font-semibold ${theme.text} mb-2`}>SPECIALIZATION</h3>
                                    <p className="text-white font-medium">
                                        <SecureText>{specialization}</SecureText>
                                    </p>
                                </div>

                                {/* Description */}
                                <p className="text-xl text-gray-300 leading-relaxed max-w-2xl">
                                    <SecureText>{description}</SecureText>
                                </p>

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-4">
                                    <button
                                        onClick={() => resumeUrl && SecureResumeUrl.open(resumeUrl)}
                                        className={`group relative px-8 py-4 bg-gradient-to-r ${theme.primary} text-black font-bold rounded-lg transition-all duration-300 hover:scale-105 ${theme.glow} shadow-lg hover:shadow-xl overflow-hidden`}>
                                        <span className="relative z-10 flex items-center gap-2">
                                            <SecureText>{resumeUrl ? 'Download CV' : 'View Security Portfolio'}</SecureText>
                                            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Right Column - Profile & Stats */}
                            <div className="lg:col-span-5 space-y-8">
                                {/* Profile Image with Security UI */}
                                <div className="relative">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${theme.primary} rounded-2xl transform rotate-3 opacity-20 blur-sm`}></div>
                                    <div className={`relative bg-black/50 p-6 rounded-2xl border ${theme.border} backdrop-blur-sm`}>
                                        <img
                                            src={SecureUrl.validate(image)}
                                            alt={name || 'Cyber Security Professional'}
                                            className={`w-full h-80 object-cover rounded-xl border-2 ${theme.border} ${theme.glow} shadow-2xl`}
                                            onError={(e) => {
                                                e.target.src = 'https://placehold.co/400x400/00FFFF/000000?text=Cyber+Security+Expert';
                                            }}
                                        />
                                        {/* Security Status Indicator */}
                                        <div className={`absolute -top-2 -right-2 flex items-center px-3 py-1 ${theme.accent} text-black text-xs font-bold rounded-full`}>
                                            <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                                            VERIFIED
                                        </div>
                                    </div>
                                </div>

                                {/* Security Stats Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`p-4 bg-black/50 rounded-lg border ${theme.border} backdrop-blur-sm`}>
                                        <div className={`text-2xl font-bold ${theme.text}`}>
                                            <SecureText>{securityCerts}</SecureText>
                                        </div>
                                        <div className="text-sm text-gray-400">Security Certs</div>
                                    </div>
                                    <div className={`p-4 bg-black/50 rounded-lg border ${theme.border} backdrop-blur-sm`}>
                                        <div className={`text-2xl font-bold ${theme.text}`}>
                                            <SecureText>{threatsBlocked}</SecureText>
                                        </div>
                                        <div className="text-sm text-gray-400">Threats Blocked</div>
                                    </div>
                                    <div className={`p-4 bg-black/50 rounded-lg border ${theme.border} backdrop-blur-sm`}>
                                        <div className={`text-2xl font-bold ${theme.text}`}>
                                            <SecureText>{systemsSecured}</SecureText>
                                        </div>
                                        <div className="text-sm text-gray-400">Systems Secured</div>
                                    </div>
                                    <div className={`p-4 bg-black/50 rounded-lg border ${theme.border} backdrop-blur-sm`}>
                                        <div className={`text-2xl font-bold ${theme.text}`}>
                                            <SecureText>{vulnerabilitiesFound}</SecureText>
                                        </div>
                                        <div className="text-sm text-gray-400">Vulnerabilities</div>
                                    </div>
                                </div>

                                {/* Experience Badge */}
                                <div className={`text-center p-6 bg-gradient-to-br ${theme.primary} text-black rounded-lg ${theme.glow} shadow-lg`}>
                                    <div className="text-3xl font-bold mb-2">
                                        <SecureText>{yearsExperience}</SecureText>
                                    </div>
                                    <div className="font-semibold">Years of Experience</div>
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

export default Hero7;
