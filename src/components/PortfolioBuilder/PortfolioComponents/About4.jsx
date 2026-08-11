import React from 'react';

// 🔒 SECURITY: Secure email validator
const SecureEmail = {
    validate: (email) => {
        if (typeof email !== 'string') return '#';
        const cleaned = email.trim();

        // Basic email validation
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (emailPattern.test(cleaned)) {
            return `mailto:${cleaned}`;
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

const About4 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        email: { type: 'text', label: 'Contact Email' },
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
                command: { type: 'text', label: 'Terminal Command' },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 85,
                command: 'npm install',
            },
        },
        totalCommits: { type: 'text', label: 'Total Commits' },
        linesWritten: { type: 'text', label: 'Lines Written' },
        coffeeConsumed: { type: 'text', label: 'Coffee Consumed' },
    },
    defaultProps: {
        title: 'About Me',
        content: 'Passionate developer who speaks fluent JavaScript, dreams in Python, and debugs with coffee. I turn complex problems into elegant solutions, one commit at a time.',
        email: 'developer@terminal.dev',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
        skills: [
            { skill: 'JavaScript/TypeScript', level: 95, command: 'node --version' },
            { skill: 'React & Next.js', level: 92, command: 'npx create-react-app' },
            { skill: 'Python & Django', level: 88, command: 'python manage.py runserver' },
            { skill: 'Docker & Kubernetes', level: 85, command: 'docker compose up' },
            { skill: 'AWS & DevOps', level: 80, command: 'aws s3 sync' },
            { skill: 'Database Design', level: 87, command: 'psql -U postgres' },
        ],
        totalCommits: '2.5K+',
        linesWritten: '500K+',
        coffeeConsumed: '1.2K',
    },
    render: ({ title, content, email, backgroundColor, terminalTheme, skills, totalCommits, linesWritten, coffeeConsumed }) => {
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
            <div className={`bg-black relative py-24 px-6 overflow-hidden min-h-screen`} style={{ backgroundColor: '#000000' }}>
                {/* Scanline Effect */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent animate-pulse opacity-20" />
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

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className={`inline-flex items-center px-6 py-3 bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow}`}>
                                <div className={`w-3 h-3 bg-gradient-to-r ${theme.accent} rounded-full mr-3 animate-pulse`} />
                                <span className={`text-sm font-medium ${theme.primary} font-mono`}>cat about.md</span>
                            </div>
                            <div className={`h-px bg-gradient-to-r ${theme.accent} flex-1 max-w-20 opacity-50`} />
                        </div>

                        <h2 className="text-6xl md:text-7xl lg:text-8xl font-black text-white leading-none tracking-tighter mb-6 font-mono">
                            <span className="block text-gray-500 text-2xl md:text-3xl font-light mb-2">## </span>
                            <span className={`bg-gradient-to-r ${theme.accent} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                        </h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-20 items-start">
                        {/* Terminal Section */}
                        <div className="space-y-8">
                            {/* Main Terminal Window */}
                            <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow}`}>
                                {/* Terminal Header */}
                                <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                    <div className="ml-4 text-gray-400 text-sm font-mono">terminal — about@developer</div>
                                </div>

                                {/* Terminal Content */}
                                <div className="p-6 font-mono text-sm space-y-4">
                                    <div className="space-y-2">
                                        <div className={`${theme.primary} flex items-center gap-2`}>
                                            <span>{theme.prompt}</span>
                                            <span>cat personal_info.txt</span>
                                        </div>
                                        <div className="text-white ml-4 leading-relaxed">
                                            <SecureText>{content}</SecureText>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className={`${theme.primary} flex items-center gap-2`}>
                                            <span>{theme.prompt}</span>
                                            <span>ls -la achievements/</span>
                                        </div>
                                        <div className="ml-4 space-y-1 text-gray-300">
                                            <div className="flex justify-between">
                                                <span>total_commits.log</span>
                                                <span className={theme.secondary}>{totalCommits}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>lines_written.txt</span>
                                                <span className={theme.secondary}>{linesWritten}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>coffee_consumed.db</span>
                                                <span className={theme.secondary}>{coffeeConsumed} cups</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className={`${theme.primary} flex items-center gap-2`}>
                                            <span>{theme.prompt}</span>
                                            <span>echo $PHILOSOPHY</span>
                                        </div>
                                        <div className="text-gray-300 ml-4">"Code is poetry written in logic"</div>
                                    </div>

                                    <div className={`${theme.primary} flex items-center gap-2`}>
                                        <span>{theme.prompt}</span>
                                        <span className="animate-pulse">_</span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Terminal */}
                            <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-xl`}>
                                <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                    <div className="text-gray-400 text-xs font-mono">system_stats.sh</div>
                                </div>
                                <div className="p-4 font-mono text-xs space-y-3">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="text-center group cursor-pointer">
                                            <div className={`text-2xl font-bold text-white group-hover:${theme.primary} transition-colors`}>{totalCommits}</div>
                                            <div className="text-gray-500 text-xs uppercase">commits</div>
                                        </div>
                                        <div className="text-center group cursor-pointer">
                                            <div className={`text-2xl font-bold text-white group-hover:${theme.primary} transition-colors`}>{linesWritten}</div>
                                            <div className="text-gray-500 text-xs uppercase">lines</div>
                                        </div>
                                        <div className="text-center group cursor-pointer">
                                            <div className={`text-2xl font-bold text-white group-hover:${theme.primary} transition-colors`}>{coffeeConsumed}</div>
                                            <div className="text-gray-500 text-xs uppercase">coffee</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-wrap gap-6">
                                <button
                                    onClick={() => {
                                        const validEmail = SecureEmail.validate(email);
                                        if (validEmail !== '#') {
                                            window.location.href = validEmail;
                                        }
                                    }}
                                    className={`group relative px-8 py-4 bg-gradient-to-r ${theme.accent} text-black rounded-lg font-bold text-lg transition-all duration-300 hover:scale-105 shadow-2xl ${theme.glow} overflow-hidden font-mono`}>
                                    <span className="relative z-10 flex items-center gap-3">
                                        ./contact.sh
                                        <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Skills Section */}
                        <div className="space-y-8">
                            {/* Skills Terminal */}
                            <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow}`}>
                                <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                    <div className="ml-4 text-gray-400 text-sm font-mono">skills.sh — executing...</div>
                                </div>

                                <div className="p-6 font-mono text-sm space-y-6">
                                    {skills &&
                                        skills.map((item, index) => (
                                            <div key={index} className="space-y-3">
                                                <div className="space-y-2">
                                                    <div className={`${theme.primary} flex items-center gap-2`}>
                                                        <span>{theme.prompt}</span>
                                                        <span>{item.command || 'which skill'}</span>
                                                    </div>
                                                    <div className="ml-4 flex justify-between items-center">
                                                        <span className="text-white">
                                                            <SecureText>{item.skill}</SecureText>
                                                        </span>
                                                        <span className={`${theme.secondary} font-bold`}>{item.level}%</span>
                                                    </div>
                                                </div>

                                                {/* Progress Bar as Loading Effect */}
                                                <div className="ml-4">
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-gray-500">Loading:</span>
                                                        <div className="flex-1 bg-gray-800 rounded h-1 relative overflow-hidden">
                                                            <div className={`bg-gradient-to-r ${theme.accent} h-1 transition-all duration-1000 ease-out relative`} style={{ width: `${item.level}%` }}>
                                                                <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse" />
                                                            </div>
                                                        </div>
                                                        <span className={theme.secondary}>[{item.level}%]</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                    <div className={`${theme.primary} flex items-center gap-2 mt-6`}>
                                        <span>{theme.prompt}</span>
                                        <span>skills --list-all | wc -l</span>
                                    </div>
                                    <div className="ml-4 text-white">{skills ? skills.length : 0} skills loaded successfully</div>
                                </div>
                            </div>

                            {/* System Info Card */}
                            <div className={`bg-black/90 backdrop-blur-sm p-6 rounded-2xl border ${theme.border} hover:bg-black/70 transition-all duration-300`}>
                                <div className="font-mono text-sm space-y-3">
                                    <div className={`${theme.primary} mb-3`}># System Information</div>
                                    <div className="text-gray-300 space-y-2">
                                        <div className="flex justify-between">
                                            <span>OS:</span>
                                            <span className={theme.secondary}>Developer v2024.1</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Uptime:</span>
                                            <span className={theme.secondary}>5+ years</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Memory:</span>
                                            <span className={theme.secondary}>Unlimited creativity</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Status:</span>
                                            <span className="text-green-400">● Online & Ready</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Terminal Line */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    <div className={`${theme.primary} font-mono text-sm flex items-center gap-2 animate-pulse`}>
                        <span>{theme.prompt}</span>
                        <span>let's build something amazing together...</span>
                        <span className="animate-ping">_</span>
                    </div>
                </div>
            </div>
        );
    },
};

export default About4;
