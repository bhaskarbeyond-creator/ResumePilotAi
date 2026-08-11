import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Experience4 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
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
        experiences: {
            type: 'array',
            label: 'Work Experience',
            getItemSummary: (item) => `${item.position} at ${item.company}`,
            arrayFields: {
                position: { type: 'text', label: 'Job Title/Position' },
                company: { type: 'text', label: 'Company Name' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date (or "Present")' },
                description: { type: 'textarea', label: 'Job Description' },
                achievements: {
                    type: 'array',
                    label: 'Key Achievements',
                    arrayFields: {
                        achievement: { type: 'text', label: 'Achievement' },
                    },
                    defaultItemProps: {
                        achievement: 'New achievement',
                    },
                },
                technologies: { type: 'text', label: 'Technologies Used (comma-separated)' },
                companyLogo: { type: 'text', label: 'Company Logo URL (Optional)' },
            },
            defaultItemProps: {
                position: 'Job Title',
                company: 'Company Name',
                location: 'City, Country',
                startDate: 'Month Year',
                endDate: 'Month Year',
                description: 'Brief description of your role and responsibilities.',
                achievements: [{ achievement: 'Key accomplishment or achievement' }],
                technologies: 'React, Node.js, MongoDB',
                companyLogo: '',
            },
        },
    },
    defaultProps: {
        title: 'Work History',
        subtitle: 'Career path documented in the terminal',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
        experiences: [
            {
                position: 'Senior Software Engineer',
                company: 'DevTech Systems',
                location: 'Austin, TX',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Developing enterprise-grade applications and leading technical initiatives. Architecting cloud solutions and optimizing system performance.',
                achievements: [
                    { achievement: 'Architected microservices handling 1M+ requests/day' },
                    { achievement: 'Reduced infrastructure costs by 45%' },
                    { achievement: 'Mentored 6 junior developers' },
                ],
                technologies: 'React, TypeScript, Kubernetes, PostgreSQL, AWS',
                companyLogo: '',
            },
            {
                position: 'Full Stack Developer',
                company: 'StartupLab Inc',
                location: 'Remote',
                startDate: 'Mar 2020',
                endDate: 'Dec 2021',
                description: 'Built scalable web applications from conception to deployment. Worked across the entire technology stack.',
                achievements: [{ achievement: 'Launched 5 production applications' }, { achievement: 'Improved deployment pipeline efficiency by 80%' }],
                technologies: 'JavaScript, Node.js, MongoDB, Docker, GCP',
                companyLogo: '',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, terminalTheme, experiences }) => {
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
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
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
                                <span className={`text-sm font-medium ${theme.primary} font-mono`}>cat career.log</span>
                            </div>
                            <div className={`h-px bg-gradient-to-r ${theme.accent} flex-1 max-w-20 opacity-50`} />
                        </div>

                        <h2 className="text-6xl md:text-7xl lg:text-8xl font-black text-white leading-none tracking-tighter mb-6 font-mono">
                            <span className="block text-gray-500 text-2xl md:text-3xl font-light mb-2">## </span>
                            <span className={`bg-gradient-to-r ${theme.accent} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed font-mono">
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    {/* Experience Terminals */}
                    <div className="space-y-8">
                        {experiences &&
                            experiences.map((exp, index) => (
                                <div key={index} className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow}`}>
                                    {/* Terminal Header */}
                                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                        <div className="w-3 h-3 bg-red-500 rounded-full" />
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                                        <div className="ml-4 text-gray-400 text-sm font-mono">{exp.company.toLowerCase().replace(/\s+/g, '-')}_experience.sh</div>
                                        <div className="ml-auto">
                                            <span className={`${theme.secondary} text-xs`}>
                                                {exp.startDate} → {exp.endDate}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Terminal Content */}
                                    <div className="p-6 font-mono text-sm space-y-6">
                                        {/* Job Info */}
                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span>cat job_info.txt</span>
                                            </div>
                                            <div className="ml-4 space-y-1 text-gray-300">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Position:</span>
                                                    <span className="text-white font-semibold">
                                                        <SecureText>{exp.position}</SecureText>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Company:</span>
                                                    <span className={theme.secondary}>
                                                        <SecureText>{exp.company}</SecureText>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Location:</span>
                                                    <span className="text-gray-300">
                                                        <SecureText>{exp.location}</SecureText>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="space-y-2">
                                            <div className={`${theme.primary} flex items-center gap-2`}>
                                                <span>{theme.prompt}</span>
                                                <span>cat role_description.md</span>
                                            </div>
                                            <div className="ml-4 text-gray-300 leading-relaxed">
                                                <SecureText>{exp.description}</SecureText>
                                            </div>
                                        </div>

                                        {/* Achievements */}
                                        {exp.achievements && exp.achievements.length > 0 && (
                                            <div className="space-y-2">
                                                <div className={`${theme.primary} flex items-center gap-2`}>
                                                    <span>{theme.prompt}</span>
                                                    <span>ls -la achievements/</span>
                                                </div>
                                                <div className="ml-4 space-y-1">
                                                    {exp.achievements.map((achievement, i) => (
                                                        <div key={i} className="flex items-start gap-3 text-gray-300">
                                                            <span className={`${theme.secondary} text-xs mt-1`}>[{i + 1}]</span>
                                                            <span>
                                                                <SecureText>{achievement.achievement}</SecureText>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Technologies */}
                                        {exp.technologies && (
                                            <div className="space-y-2">
                                                <div className={`${theme.primary} flex items-center gap-2`}>
                                                    <span>{theme.prompt}</span>
                                                    <span>npm list --depth=0</span>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="flex flex-wrap gap-2">
                                                        {exp.technologies.split(',').map((tech, i) => (
                                                            <span
                                                                key={i}
                                                                className={`px-2 py-1 bg-gray-800 border ${theme.border} rounded text-xs ${theme.secondary} hover:bg-gray-700 transition-colors`}>
                                                                {tech.trim()}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Command Prompt */}
                                        <div className={`${theme.primary} flex items-center gap-2`}>
                                            <span>{theme.prompt}</span>
                                            <span className="animate-pulse">_</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Summary Terminal */}
                    <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} mt-16`}>
                        <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                            <div className="w-3 h-3 bg-red-500 rounded-full" />
                            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                            <div className="w-3 h-3 bg-green-500 rounded-full" />
                            <div className="ml-4 text-gray-400 text-sm font-mono">career_summary.sh</div>
                        </div>
                        <div className="p-6 font-mono text-sm space-y-4">
                            <div className={`${theme.primary} flex items-center gap-2`}>
                                <span>{theme.prompt}</span>
                                <span>grep -r "total_experience" .</span>
                            </div>
                            <div className="ml-4 text-center py-8">
                                <div className="grid md:grid-cols-3 gap-8">
                                    <div className="text-center">
                                        <div className={`text-3xl font-bold ${theme.primary} mb-2`}>{experiences ? experiences.length : 0}</div>
                                        <div className="text-gray-500 text-xs uppercase">Positions</div>
                                    </div>
                                    <div className="text-center">
                                        <div className={`text-3xl font-bold ${theme.primary} mb-2`}>
                                            {experiences ? experiences.reduce((total, exp) => total + (exp.achievements?.length || 0), 0) : 0}
                                        </div>
                                        <div className="text-gray-500 text-xs uppercase">Achievements</div>
                                    </div>
                                    <div className="text-center">
                                        <div className={`text-3xl font-bold ${theme.primary} mb-2`}>5+</div>
                                        <div className="text-gray-500 text-xs uppercase">Years</div>
                                    </div>
                                </div>
                            </div>
                            <div className={`${theme.primary} text-center`}>
                                <span>Ready for next challenge...</span>
                                <span className="animate-ping ml-2">_</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Terminal Info */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    <div className={`${theme.primary} font-mono text-sm flex items-center gap-2 animate-pulse`}>
                        <span>{theme.prompt}</span>
                        <span>echo "Experience loaded successfully"</span>
                    </div>
                </div>
            </div>
        );
    },
};

export default Experience4;
