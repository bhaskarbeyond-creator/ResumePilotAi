import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/350x350';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/350x350';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/350x350';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure URL validator for resume links
const SecureResumeUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return '#';
        const cleaned = url.trim();
        
        // Only allow same-domain /shared/:resumeId URLs
        const sharedPattern = /^\/shared\/[a-zA-Z0-9_-]+$/;
        if (sharedPattern.test(cleaned)) {
            return cleaned;
        }
        
        // Default fallback
        return '#';
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const Hero5 = {
    fields: {
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        backgroundColor: {
            type: 'select',
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
        // Statistics fields
        linesOfCode: { type: 'text', label: 'Lines of Code' },
        coffeeConsumed: { type: 'text', label: 'Coffee Consumed' },
        bugsFixed: { type: 'text', label: 'Bugs Fixed' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        secondaryButtonText: { type: 'text', label: 'Download CV Button Text' },
    },
    defaultProps: {
        name: 'Morgan Smith',
        title: 'Full Stack Developer',
        description: 'Turning coffee into code since 2019. Specialized in building scalable web applications and solving complex problems with elegant solutions.',
        image: 'https://placehold.co/350x350',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
        linesOfCode: '500K+',
        coffeeConsumed: '2.5K',
        bugsFixed: '999+',
        resumeUrl: '/shared/resume123',
        secondaryButtonText: 'Download CV',
    },
    render: ({ name, title, description, image, backgroundColor, terminalTheme, linesOfCode, coffeeConsumed, bugsFixed, resumeUrl, secondaryButtonText }) => {
        const themes = {
            matrix: {
                primary: 'text-green-400',
                secondary: 'text-green-300',
                accent: 'from-green-400 to-emerald-500',
                border: 'border-green-400/30',
                glow: 'shadow-green-400/20',
                prompt: '$',
            },
            hacker: {
                primary: 'text-amber-400',
                secondary: 'text-amber-300',
                accent: 'from-amber-400 to-orange-500',
                border: 'border-amber-400/30',
                glow: 'shadow-amber-400/20',
                prompt: '>',
            },
            retro: {
                primary: 'text-cyan-400',
                secondary: 'text-cyan-300',
                accent: 'from-cyan-400 to-blue-500',
                border: 'border-cyan-400/30',
                glow: 'shadow-cyan-400/20',
                prompt: '~',
            },
            cyberpunk: {
                primary: 'text-purple-400',
                secondary: 'text-purple-300',
                accent: 'from-purple-400 to-pink-500',
                border: 'border-purple-400/30',
                glow: 'shadow-purple-400/20',
                prompt: '#',
            },
        };

        const theme = themes[terminalTheme] || themes.matrix;

        return (
            <div className={`${backgroundColor} relative min-h-screen overflow-hidden`}>
                {/* Scanline Effect */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent animate-pulse opacity-20"></div>
                    <div
                        className="absolute inset-0 opacity-10"
                        style={{
                            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
                        }}
                    />
                </div>

                {/* Background Matrix Effect */}
                <div className="absolute inset-0 opacity-5">
                    <div className="text-xs font-mono leading-none overflow-hidden h-full">
                        {Array.from({ length: 50 }).map((_, i) => (
                            <div key={i} className={`${theme.primary} animate-pulse`} style={{ animationDelay: `${i * 0.1}s` }}>
                                {Array.from({ length: 100 })
                                    .map((_, j) => (Math.random() > 0.5 ? '1' : '0'))
                                    .join('')}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative py-20 px-6 min-h-screen flex items-center">
                    <div className="max-w-7xl mx-auto w-full">
                        <div className="grid lg:grid-cols-2 gap-20 items-center">
                            {/* Terminal Section */}
                            <div className="space-y-8">
                                {/* Terminal Window */}
                                <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow}`}>
                                    {/* Terminal Header */}
                                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                        <div className="ml-4 text-gray-400 text-sm font-mono">terminal — developer@portfolio</div>
                                    </div>

                                    {/* Terminal Content */}
                                    <div className="p-6 font-mono text-sm space-y-4">
                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span className="animate-pulse">whoami</span>
                                            </div>
                                            <div className="text-white ml-4">
                                                <SecureText>{name}</SecureText>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span>cat role.txt</span>
                                            </div>
                                            <div className="text-white ml-4">
                                                <SecureText>{title}</SecureText>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span>./bio --summary</span>
                                            </div>
                                            <div className="text-gray-300 ml-4 leading-relaxed">
                                                <SecureText>{description}</SecureText>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span>ls -la stats/</span>
                                            </div>
                                            <div className="ml-4 space-y-1 text-gray-300">
                                                <div className="flex justify-between">
                                                    <span>lines_of_code.txt</span>
                                                    <span className={theme.secondary}>{linesOfCode}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>coffee_consumed.log</span>
                                                    <span className={theme.secondary}>{coffeeConsumed} cups</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>bugs_fixed.db</span>
                                                    <span className={theme.secondary}>{bugsFixed}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`${theme.primary} flex items-center gap-2`}>
                                            <span>{theme.prompt}</span>
                                            <span className="animate-pulse">_</span>
                                        </div>
                                    </div>
                                </div>

                                {/* CTA Buttons */}
                                <div className="flex flex-wrap gap-6">
                                    <button
                                        onClick={() => {
                                            const validUrl = SecureResumeUrl.validate(resumeUrl);
                                            if (validUrl !== '#') {
                                                window.open(validUrl, '_blank');
                                            }
                                        }}
                                        className={`group relative px-8 py-4 bg-gradient-to-r ${theme.accent} text-black rounded-lg font-bold text-lg transition-all duration-300 hover:scale-105 shadow-2xl ${theme.glow} overflow-hidden font-mono`}>
                                        <span className="relative z-10 flex items-center gap-3">
                                            <SecureText>{secondaryButtonText}</SecureText>
                                            <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Image & Code Section */}
                            <div className="relative">
                                <div className="relative group">
                                    {/* Main Profile Container */}
                                    <div
                                        className={`relative bg-gray-900/50 backdrop-blur-sm p-8 rounded-2xl border ${theme.border} shadow-2xl ${theme.glow} transition-all duration-500 group-hover:scale-[1.02]`}>
                                        {/* Code Editor Header */}
                                        <div className="flex items-center gap-2 mb-6 pb-3 border-b border-gray-700/50">
                                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            <div className="ml-4 text-gray-400 text-sm font-mono">developer.js</div>
                                        </div>

                                        {/* Profile Image */}
                                        <div className="relative mb-6">
                                            <img
                                                src={SecureUrl.validate(image)}
                                                alt={name}
                                                className="w-full max-w-sm mx-auto rounded-xl object-cover aspect-square shadow-xl"
                                                onError={(e) => {
                                                    e.target.src = 'https://placehold.co/350x350';
                                                }}
                                            />

                                            {/* Overlay Code */}
                                            <div className="absolute -bottom-4 -right-4 bg-black/90 backdrop-blur-sm p-4 rounded-xl border border-gray-700/50 font-mono text-xs">
                                                <div className={theme.secondary}>
                                                    <div>const developer = {'{'}</div>
                                                    <div className="ml-4">
                                                        name: "<SecureText>{name}</SecureText>",
                                                    </div>
                                                    <div className="ml-4">status: "available"</div>
                                                    <div>{'}'}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Code Snippet */}
                                        <div className="font-mono text-sm space-y-2">
                                            <div className={theme.secondary}>
                                                <span className="text-purple-400">function</span> <span className="text-yellow-400">hireDeveloper</span>
                                                <span className="text-white">() {'{'}</span>
                                            </div>
                                            <div className={`ml-4 ${theme.primary}`}>return "Let's build something amazing!";</div>
                                            <div className="text-white">{'}'}</div>
                                        </div>
                                    </div>

                                    {/* Floating Status */}
                                    <div className="absolute -top-4 -left-4 bg-black/90 backdrop-blur-sm p-3 rounded-2xl border border-gray-700/50 hover:rotate-6 transition-transform duration-300">
                                        <div className="flex items-center gap-2 font-mono text-sm">
                                            <div className={`w-3 h-3 bg-gradient-to-r ${theme.accent} rounded-full animate-pulse`}></div>
                                            <span className={theme.primary}>online</span>
                                        </div>
                                    </div>

                                    {/* Background Glow */}
                                    <div
                                        className={`absolute -inset-4 bg-gradient-to-r ${theme.accent} opacity-20 rounded-2xl blur-xl -z-10 group-hover:opacity-30 transition-opacity duration-500`}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Terminal Line */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    <div className={`${theme.primary} font-mono text-sm flex items-center gap-2 animate-pulse`}>
                        <span>{theme.prompt}</span>
                        <span>ready to collaborate...</span>
                        <span className="animate-ping">_</span>
                    </div>
                </div>
            </div>
        );
    },
};

export default Hero5;
