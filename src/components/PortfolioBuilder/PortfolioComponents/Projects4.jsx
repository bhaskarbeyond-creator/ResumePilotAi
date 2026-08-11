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

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x300';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x300';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x300';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Projects4 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
                { value: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900', label: 'Carbon Dark' },
                { value: 'bg-gradient-to-br from-purple-900 via-gray-900 to-black', label: 'Deep Purple' },
            ],
        },
        terminalTheme: {
            type: 'select',
            label: 'Terminal Theme',
            options: [
                { value: 'matrix', label: 'Matrix (Green)' },
                { value: 'hacker', label: 'Hacker (Amber)' },
                { value: 'retro', label: 'Retro (Blue)' },
                { value: 'cyberpunk', label: 'Cyberpunk (Purple)' },
            ],
        },
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                status: { type: 'text', label: 'Project Status' },
                command: { type: 'text', label: 'Terminal Command' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x300',
                technologies: 'React, JavaScript',
                status: 'Completed',
                command: 'cat project.json',
            },
        },
    },
    defaultProps: {
        title: 'Projects',
        subtitle: 'Digital artifacts and code repositories',
        email: 'contact@terminal.dev',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
        projects: [
            {
                title: 'Neural Network Dashboard',
                description: 'AI-powered analytics dashboard with real-time data visualization and machine learning insights.',
                image: 'https://placehold.co/400x300',
                technologies: 'React, TypeScript, Python, TensorFlow',
                status: 'ACTIVE',
                command: 'docker run neural-dashboard',
            },
            {
                title: 'Blockchain Wallet',
                description: 'Secure cryptocurrency wallet with multi-chain support and DeFi integration.',
                image: 'https://placehold.co/400x300',
                technologies: 'Next.js, Solidity, Web3.js, Ethereum',
                status: 'BETA',
                command: 'npm start blockchain-wallet',
            },
            {
                title: 'Security Scanner',
                description: 'Automated vulnerability scanner for web applications and network infrastructure.',
                image: 'https://placehold.co/400x300',
                technologies: 'Python, Nmap, SQLAlchemy, Flask',
                status: 'STABLE',
                command: 'python security_scanner.py --scan',
            },
        ],
    },
    render: ({ title, subtitle, email, backgroundColor, terminalTheme, projects }) => {
        const terminalThemes = {
            matrix: {
                primary: 'text-green-400',
                secondary: 'text-green-300',
                accent: 'text-green-500',
                bg: 'bg-green-500/10',
                border: 'border-green-500/30',
                glow: 'shadow-green-500/20',
            },
            hacker: {
                primary: 'text-amber-400',
                secondary: 'text-amber-300',
                accent: 'text-amber-500',
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/30',
                glow: 'shadow-amber-500/20',
            },
            retro: {
                primary: 'text-blue-400',
                secondary: 'text-blue-300',
                accent: 'text-blue-500',
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/30',
                glow: 'shadow-blue-500/20',
            },
            cyberpunk: {
                primary: 'text-purple-400',
                secondary: 'text-purple-300',
                accent: 'text-purple-500',
                bg: 'bg-purple-500/10',
                border: 'border-purple-500/30',
                glow: 'shadow-purple-500/20',
            },
        };

        const theme = terminalThemes[terminalTheme] || terminalThemes.matrix;

        return (
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
                {/* Matrix Binary Background */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 font-mono text-xs text-gray-400 leading-tight">
                        {Array.from({ length: 50 }, (_, i) => (
                            <div key={i} className="whitespace-nowrap animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
                                {Array.from({ length: 200 }, () => (Math.random() > 0.5 ? '1' : '0')).join('')}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scanline Effect */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-1 animate-pulse" style={{ animation: 'scanline 3s linear infinite' }} />
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Terminal Header */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 bg-black/80 backdrop-blur-md rounded-lg border ${theme.border} shadow-2xl ${theme.glow} mb-8`}>
                            <div className="flex items-center gap-2 mr-4">
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            </div>
                            <span className={`font-mono text-sm ${theme.primary}`}>root@portfolio:~/projects#</span>
                        </div>

                        <div className="space-y-4">
                            <div className={`font-mono text-sm ${theme.secondary} text-left max-w-4xl mx-auto`}>
                                <div className="space-y-1">
                                    <div className={theme.primary}>$ ls -la projects/</div>
                                    <div className="text-gray-400">total {projects ? projects.length : 0}</div>
                                    <div className={theme.secondary}>drwxr-xr-x 1 root root 4096 {new Date().toLocaleDateString()} .</div>
                                    <div className={theme.secondary}>drwxr-xr-x 1 root root 4096 {new Date().toLocaleDateString()} ..</div>
                                    {projects &&
                                        projects.map((project, index) => (
                                            <div key={index} className={theme.secondary}>
                                                -rw-r--r-- 1 root root {Math.floor(Math.random() * 9999)} {new Date().toLocaleDateString()} {project.title.toLowerCase().replace(/\s+/g, '-')}.json
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-none tracking-tighter">
                                <span className={`${theme.primary} font-mono`}>$ cat </span>
                                <span className="text-white">
                                    <SecureText>{title}</SecureText>
                                </span>
                            </h2>
                            {subtitle && (
                                <p className={`text-lg ${theme.secondary} max-w-4xl mx-auto leading-relaxed font-mono italic`}>
                                    # <SecureText>{subtitle}</SecureText>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Projects Terminal Windows */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {projects &&
                            projects.map((project, index) => (
                                <div key={index} className="group relative">
                                    {/* Terminal Window */}
                                    <div
                                        className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} overflow-hidden hover:scale-[1.02] transition-all duration-300`}>
                                        {/* Terminal Header */}
                                        <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            </div>
                                            <div className={`font-mono text-xs ${theme.secondary}`}>{project.title.toLowerCase().replace(/\s+/g, '-')}.terminal</div>
                                        </div>

                                        {/* Terminal Content */}
                                        <div className="p-4 space-y-3 min-h-[400px] flex flex-col">
                                            {/* Command Line */}
                                            <div className="space-y-1">
                                                <div className={`font-mono text-sm ${theme.primary} flex items-center gap-2`}>
                                                    <span>$</span>
                                                    <span className="animate-pulse">{project.command}</span>
                                                </div>
                                            </div>

                                            {/* Project Image Terminal Style */}
                                            <div className="flex-1 space-y-2">
                                                <div className={`font-mono text-xs ${theme.secondary}`}>Output: displaying project preview...</div>
                                                <div className="relative">
                                                    <img
                                                        src={SecureUrl.validate(project.image)}
                                                        alt={project.title || 'Project'}
                                                        className="w-full h-32 object-cover rounded border border-gray-700/50 group-hover:brightness-110 transition-all duration-300"
                                                        onError={(e) => {
                                                            e.target.src = 'https://placehold.co/400x300';
                                                        }}
                                                    />
                                                    <div className="absolute top-2 right-2">
                                                        <span className={`px-2 py-1 bg-black/80 rounded text-xs font-mono ${theme.accent}`}>{project.status}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Project Details */}
                                            <div className="space-y-2">
                                                <div className={`font-mono text-sm ${theme.primary} font-bold`}>
                                                    <SecureText>{project.title}</SecureText>
                                                </div>
                                                <div className={`font-mono text-xs ${theme.secondary} leading-relaxed`}>
                                                    <SecureText>{project.description}</SecureText>
                                                </div>
                                            </div>

                                            {/* Technologies */}
                                            <div className="space-y-2">
                                                <div className={`font-mono text-xs ${theme.accent}`}>Dependencies:</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {project.technologies &&
                                                        (Array.isArray(project.technologies) ? project.technologies : project.technologies.split(',')).map((tech, techIndex) => (
                                                            <span
                                                                key={techIndex}
                                                                className={`px-2 py-1 bg-gray-800/50 border border-gray-700/50 rounded text-xs font-mono ${theme.secondary} hover:${theme.bg} transition-colors duration-200`}>
                                                                {typeof tech === 'string' ? tech.trim() : tech}
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-2 border-t border-gray-700/50">
                                                <button
                                                    onClick={() => {
                                                        const validEmail = SecureEmail.validate(email);
                                                        if (validEmail !== '#') {
                                                            window.location.href = validEmail;
                                                        }
                                                    }}
                                                    className={`flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded font-mono text-xs ${theme.primary} hover:${theme.bg} transition-all duration-200 text-center flex items-center justify-center gap-2`}>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                        />
                                                    </svg>
                                                    ./contact
                                                </button>
                                            </div>

                                            {/* Command Prompt */}
                                            <div className={`font-mono text-xs ${theme.primary} opacity-50`}>
                                                <span className="animate-pulse">$ _</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Bottom Terminal */}
                    <div className="mt-16">
                        <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} p-6`}>
                            <div className="flex items-center justify-center gap-4">
                                <div className={`font-mono text-sm ${theme.primary}`}>$ find . -name "*.project" -type f | wc -l</div>
                                <div className={`font-mono text-sm ${theme.secondary}`}>{projects ? projects.length : 0} projects found</div>
                                <div className={`font-mono text-sm ${theme.accent} animate-pulse`}>$ _</div>
                            </div>
                        </div>
                    </div>
                </div>

                <style jsx>{`
                    @keyframes scanline {
                        0% {
                            top: 0%;
                        }
                        100% {
                            top: 100%;
                        }
                    }
                `}</style>
            </div>
        );
    },
};

export default Projects4;
