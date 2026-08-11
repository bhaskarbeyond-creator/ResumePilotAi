import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x400';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x400';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x400';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const Hero4 = {
    fields: {
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
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
    defaultProps: {
        name: 'Alex Carter',
        title: 'Frontend Engineer & Digital Artist',
        description: 'Crafting immersive digital experiences with cutting-edge technology and creative design. Specialized in React, Three.js, and modern web animations.',
        image: 'https://placehold.co/400x400',
        email: 'alex@cyber.dev',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        yearsCount: '6+',
        yearsLabel: 'Years',
        projectsCount: '100+',
        projectsLabel: 'Projects',
        clientsCount: '30+',
        clientsLabel: 'Clients',
        secondaryButtonText: 'Contact Me',
    },
    render: ({ name, title, description, image, email, backgroundColor, accentColor, yearsCount, yearsLabel, projectsCount, projectsLabel, clientsCount, clientsLabel, secondaryButtonText }) => {
        const accentColors = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'from-cyan-500 to-teal-500',
                shadow: 'shadow-cyan-500/30',
                border: 'border-cyan-400/30',
                text: 'text-cyan-400',
                glow: 'shadow-2xl shadow-cyan-500/20',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'from-purple-500 to-fuchsia-500',
                shadow: 'shadow-purple-500/30',
                border: 'border-purple-400/30',
                text: 'text-purple-400',
                glow: 'shadow-2xl shadow-purple-500/20',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'from-green-500 to-teal-500',
                shadow: 'shadow-green-500/30',
                border: 'border-green-400/30',
                text: 'text-green-400',
                glow: 'shadow-2xl shadow-green-500/20',
            },
            pink: {
                primary: 'from-pink-400 to-rose-500',
                secondary: 'from-pink-500 to-purple-500',
                shadow: 'shadow-pink-500/30',
                border: 'border-pink-400/30',
                text: 'text-pink-400',
                glow: 'shadow-2xl shadow-pink-500/20',
            },
            yellow: {
                primary: 'from-yellow-400 to-orange-500',
                secondary: 'from-yellow-500 to-amber-500',
                shadow: 'shadow-yellow-500/30',
                border: 'border-yellow-400/30',
                text: 'text-yellow-400',
                glow: 'shadow-2xl shadow-yellow-500/20',
            },
        };

        const colors = accentColors[accentColor] || accentColors.cyan;

        // 🔒 SECURITY: Validate email for mailto link
        const handleEmailClick = () => {
            if (email && typeof email === 'string') {
                const cleanEmail = email.trim();
                // Basic email validation
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (emailRegex.test(cleanEmail)) {
                    window.location.href = `mailto:${cleanEmail}`;
                } else {
                    console.warn('Invalid email address provided');
                }
            }
        };

        return (
            <div className={`${backgroundColor} relative min-h-screen overflow-hidden`}>
                {/* Animated Grid Background */}
                <div className="absolute inset-0 opacity-20">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                            `,
                            backgroundSize: '50px 50px',
                        }}
                    />
                </div>

                {/* Animated Orbs */}
                <div className={`absolute top-20 left-20 w-96 h-96 bg-gradient-to-r ${colors.primary} rounded-full blur-3xl opacity-20 animate-pulse`} />
                <div className={`absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-r ${colors.secondary} rounded-full blur-3xl opacity-15 animate-pulse delay-1000`} />
                <div
                    className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r ${colors.primary} rounded-full blur-3xl opacity-10 animate-pulse delay-2000`}
                />

                <div className="relative py-20 px-6 min-h-screen flex items-center">
                    <div className="max-w-7xl mx-auto w-full">
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            {/* Content Section */}
                            <div className="space-y-8">
                                {/* Status Badge */}
                                <div className="flex items-center gap-4">
                                    <div className={`inline-flex items-center px-4 py-2 bg-white/5 backdrop-blur-md rounded-full border ${colors.border} ${colors.glow}`}>
                                        <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-3 animate-pulse`} />
                                        <span className={`text-sm font-medium ${colors.text}`}>Available for work</span>
                                    </div>
                                    <div className={`h-px bg-gradient-to-r ${colors.primary} flex-1 max-w-20 opacity-50`} />
                                </div>

                                {/* Main Content */}
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-gray-400 text-lg mb-4 font-mono">console.log("Hello World");</p>
                                        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black text-white leading-none tracking-tighter">
                                            <span className="block text-gray-500 text-4xl md:text-5xl font-light mb-2">&lt;dev&gt;</span>
                                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                                <SecureText>{name}</SecureText>
                                            </span>
                                            <span className="block text-gray-500 text-4xl md:text-5xl font-light mt-2">&lt;/dev&gt;</span>
                                        </h1>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className={`h-1 w-20 bg-gradient-to-r ${colors.primary} rounded-full`} />
                                        <h2 className="text-2xl md:text-3xl text-gray-300 font-light">
                                            <SecureText>{title}</SecureText>
                                        </h2>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-xl text-gray-400 leading-relaxed font-light max-w-2xl">
                                    <SecureText>{description}</SecureText>
                                </p>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-8 py-8">
                                    <div className="group cursor-pointer">
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {yearsCount}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">{yearsLabel}</div>
                                    </div>
                                    <div className="group cursor-pointer">
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {projectsCount}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">{projectsLabel}</div>
                                    </div>
                                    <div className="group cursor-pointer">
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {clientsCount}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">{clientsLabel}</div>
                                    </div>
                                </div>

                                {/* Contact Button - Only one button now */}
                                <div className="flex pt-4">
                                    <button
                                        onClick={handleEmailClick}
                                        className={`group relative px-8 py-4 bg-gradient-to-r ${colors.primary} text-black rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 ${colors.glow} hover:shadow-3xl overflow-hidden cursor-pointer`}>
                                        <span className="relative z-10 flex items-center gap-3">
                                            {secondaryButtonText}
                                            <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Image Section */}
                            <div className="relative">
                                <div className="relative group">
                                    {/* Main Image Container */}
                                    <div
                                        className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-8 rounded-3xl border ${colors.border} ${colors.glow} transition-all duration-500 group-hover:scale-[1.02]`}>
                                        <img
                                            src={SecureUrl.validate(image)}
                                            alt={name}
                                            className="w-full max-w-lg mx-auto rounded-2xl object-cover aspect-square shadow-2xl"
                                            onError={(e) => {
                                                e.target.src = 'https://placehold.co/400x400';
                                            }}
                                        />

                                        {/* Floating Code Block */}
                                        <div className="absolute -top-6 -right-6 bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 hover:rotate-3 transition-transform duration-300 cursor-pointer">
                                            <div className="font-mono text-sm">
                                                <div className={`${colors.text}`}>function</div>
                                                <div className="text-white">createAwesome()</div>
                                                <div className="text-gray-500">{'{ ... }'}</div>
                                            </div>
                                        </div>

                                        {/* Status Indicator */}
                                        <div className="absolute -bottom-6 -left-6 bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 hover:-rotate-3 transition-transform duration-300 cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-4 h-4 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                                <div>
                                                    <div className="text-white font-mono text-sm">Online</div>
                                                    <div className="text-gray-400 text-xs">Coding...</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Background Decorations */}
                                    <div
                                        className={`absolute -inset-4 bg-gradient-to-br ${colors.primary} opacity-20 rounded-3xl blur-xl -z-10 group-hover:opacity-30 transition-opacity duration-500`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
                    <div className="flex flex-col items-center text-gray-400">
                        <span className="text-xs font-mono mb-3 uppercase tracking-wider">scroll_down()</span>
                        <div className={`w-6 h-10 border-2 ${colors.border} rounded-full flex justify-center`}>
                            <div className={`w-1 h-3 bg-gradient-to-b ${colors.primary} rounded-full mt-2 animate-pulse`} />
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Hero4;
