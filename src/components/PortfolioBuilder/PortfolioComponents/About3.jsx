import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const About3 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
        resumeUrl: { type: 'text', label: 'Resume Download URL (e.g., /shared/resumeId)' },
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
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'frontend', label: 'Frontend' },
                        { value: 'backend', label: 'Backend' },
                        { value: 'database', label: 'Database' },
                        { value: 'tools', label: 'Tools' },
                        { value: 'design', label: 'Design' },
                    ],
                },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 85,
                category: 'frontend',
            },
        },
        yearsExperience: { type: 'text', label: 'Years Experience' },
        projectsCompleted: { type: 'text', label: 'Projects Completed' },
        clientsSatisfied: { type: 'text', label: 'Clients Satisfied' },
    },
    defaultProps: {
        title: 'About Me',
        content:
            'I am a passionate developer who transforms ideas into digital reality using cutting-edge technologies. My expertise spans across modern frameworks and tools, creating immersive experiences that bridge the gap between creativity and functionality.',
        resumeUrl: '/shared/your-resume-id',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        skills: [
            { skill: 'React & Next.js', level: 95, category: 'frontend' },
            { skill: 'Node.js & Express', level: 90, category: 'backend' },
            { skill: 'TypeScript', level: 88, category: 'frontend' },
            { skill: 'Three.js & WebGL', level: 80, category: 'frontend' },
            { skill: 'Docker & AWS', level: 85, category: 'tools' },
            { skill: 'UI/UX Design', level: 75, category: 'design' },
        ],
        yearsExperience: '6+',
        projectsCompleted: '100+',
        clientsSatisfied: '50+',
    },
    render: ({ title, content, resumeUrl, backgroundColor, accentColor, skills, yearsExperience, projectsCompleted, clientsSatisfied }) => {
        const accentColors = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'from-cyan-500 to-teal-500',
                border: 'border-cyan-400/30',
                text: 'text-cyan-400',
                glow: 'shadow-cyan-500/20',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'from-purple-500 to-fuchsia-500',
                border: 'border-purple-400/30',
                text: 'text-purple-400',
                glow: 'shadow-purple-500/20',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'from-green-500 to-teal-500',
                border: 'border-green-400/30',
                text: 'text-green-400',
                glow: 'shadow-green-500/20',
            },
            pink: {
                primary: 'from-pink-400 to-rose-500',
                secondary: 'from-pink-500 to-purple-500',
                border: 'border-pink-400/30',
                text: 'text-pink-400',
                glow: 'shadow-pink-500/20',
            },
            yellow: {
                primary: 'from-yellow-400 to-orange-500',
                secondary: 'from-yellow-500 to-amber-500',
                border: 'border-yellow-400/30',
                text: 'text-yellow-400',
                glow: 'shadow-yellow-500/20',
            },
        };

        const colors = accentColors[accentColor] || accentColors.cyan;

        // 🔒 SECURITY: Validate resume URL - Only allow same-domain /shared/ links
        const handleResumeDownload = () => {
            if (resumeUrl && typeof resumeUrl === 'string') {
                const cleanUrl = resumeUrl.trim();

                // Validate that it's a same-domain /shared/ URL
                const sharedUrlPattern = /^\/shared\/[a-zA-Z0-9_-]+$/;

                if (sharedUrlPattern.test(cleanUrl)) {
                    // It's a valid /shared/resumeId URL from same domain
                    window.open(cleanUrl, '_blank');
                } else {
                    console.warn('🔒 SECURITY: Only same-domain /shared/ URLs are allowed for resume download');
                    // Show user-friendly message instead of alert
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
                    errorMsg.innerHTML = 'Please provide a valid resume URL in the format: /shared/your-resume-id';
                    document.body.appendChild(errorMsg);
                    setTimeout(() => errorMsg.remove(), 4000);
                }
            } else {
                console.warn('No resume URL provided');
                // Show user-friendly message instead of alert
                const errorMsg = document.createElement('div');
                errorMsg.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
                errorMsg.innerHTML = 'Please add a resume download URL in the About section settings';
                document.body.appendChild(errorMsg);
                setTimeout(() => errorMsg.remove(), 4000);
            }
        };

        return (
            <div className={`bg-black relative py-24 px-6 overflow-hidden min-h-screen`} style={{ backgroundColor: '#000000' }}>
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

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className={`inline-flex items-center px-6 py-3 bg-white/5 backdrop-blur-md rounded-full border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-3 animate-pulse`} />
                                <span className={`text-sm font-medium ${colors.text} uppercase tracking-wider font-mono`}>About.init()</span>
                            </div>
                            <div className={`h-px bg-gradient-to-r ${colors.primary} flex-1 max-w-20 opacity-50`} />
                        </div>

                        <h2 className="text-6xl md:text-7xl lg:text-8xl font-black text-white leading-none tracking-tighter mb-6">
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mb-2 font-mono">&lt;section&gt;</span>
                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mt-2 font-mono">&lt;/section&gt;</span>
                        </h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-20 items-start">
                        {/* Content Section */}
                        <div className="space-y-12">
                            {/* Main About Card */}
                            <div className="relative group">
                                <div className={`absolute -inset-4 bg-gradient-to-r ${colors.primary} opacity-20 rounded-3xl blur-xl group-hover:opacity-30 transition-opacity duration-500`} />
                                <div className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-8 rounded-3xl border ${colors.border} shadow-2xl ${colors.glow}`}>
                                    {/* Code Editor Header */}
                                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                                        <div className="w-3 h-3 bg-red-500 rounded-full" />
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                                        <div className="ml-4 text-gray-400 text-sm font-mono">developer_profile.js</div>
                                    </div>

                                    {/* About Content as Code */}
                                    <div className="font-mono text-sm space-y-4">
                                        <div className="text-purple-400">
                                            <span className="text-gray-500">const</span> <span className="text-yellow-400">aboutMe</span> <span className="text-white">=</span>{' '}
                                            <span className="text-white">{'{'}</span>
                                        </div>
                                        <div className="ml-4 space-y-2">
                                            <div>
                                                <span className={colors.text}>description:</span> <span className="text-green-300">"{content}"</span>
                                            </div>
                                            <div>
                                                <span className={colors.text}>passion:</span> <span className="text-green-300">"Building the future"</span>
                                            </div>
                                            <div>
                                                <span className={colors.text}>mission:</span> <span className="text-green-300">"Code • Create • Inspire"</span>
                                            </div>
                                        </div>
                                        <div className="text-white">{'}'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-6">
                                <div className="group cursor-pointer">
                                    <div className={`bg-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} hover:bg-white/10 transition-all duration-300 text-center`}>
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {yearsExperience}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">Years</div>
                                    </div>
                                </div>
                                <div className="group cursor-pointer">
                                    <div className={`bg-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} hover:bg-white/10 transition-all duration-300 text-center`}>
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {projectsCompleted}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">Projects</div>
                                    </div>
                                </div>
                                <div className="group cursor-pointer">
                                    <div className={`bg-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} hover:bg-white/10 transition-all duration-300 text-center`}>
                                        <div
                                            className={`text-4xl font-black text-white group-hover:bg-gradient-to-r group-hover:${colors.primary} group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300`}>
                                            {clientsSatisfied}
                                        </div>
                                        <div className="text-sm text-gray-500 uppercase tracking-widest font-mono">Clients</div>
                                    </div>
                                </div>
                            </div>

                            {/* Download CV Button - Only one button now */}
                            <div className="flex justify-center">
                                <button
                                    onClick={handleResumeDownload}
                                    className={`group relative px-8 py-4 bg-gradient-to-r ${colors.primary} text-black rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 shadow-2xl ${colors.glow} overflow-hidden font-mono cursor-pointer`}>
                                    <span className="relative z-10 flex items-center gap-3">
                                        Download.CV()
                                        <svg className="w-6 h-6 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Skills Section */}
                        <div className="space-y-8">
                            <div className="relative group">
                                <div className={`absolute -inset-4 bg-gradient-to-r ${colors.secondary} opacity-20 rounded-3xl blur-xl group-hover:opacity-30 transition-opacity duration-500`} />
                                <div className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-8 rounded-3xl border ${colors.border} shadow-2xl ${colors.glow}`}>
                                    {/* Skills Header */}
                                    <div className="flex items-center gap-2 mb-8 pb-4 border-b border-white/10">
                                        <div className="w-3 h-3 bg-red-500 rounded-full" />
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                                        <div className="ml-4 text-gray-400 text-sm font-mono">tech_stack.json</div>
                                    </div>

                                    <div className="space-y-6">
                                        {skills &&
                                            skills.map((item, index) => (
                                                <div key={index} className="group/skill">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-2 h-2 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                                            <span className="text-white font-mono text-lg">
                                                                <SecureText>{item.skill}</SecureText>
                                                            </span>
                                                            <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-1 rounded font-mono">{item.category}</span>
                                                        </div>
                                                        <span className={`text-lg font-bold ${colors.text} font-mono`}>{item.level}%</span>
                                                    </div>

                                                    <div className="relative">
                                                        <div className="w-full bg-gray-800/50 rounded-full h-2 border border-gray-700/50">
                                                            <div
                                                                className={`bg-gradient-to-r ${colors.primary} h-2 rounded-full transition-all duration-1000 ease-out relative overflow-hidden`}
                                                                style={{ width: `${item.level}%` }}>
                                                                <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {/* Tech Philosophy Card */}
                            <div className={`bg-black/50 backdrop-blur-md p-6 rounded-2xl border ${colors.border} hover:bg-black/70 transition-all duration-300`}>
                                <div className="font-mono text-sm">
                                    <div className={`${colors.text} mb-2`}>// Tech Philosophy</div>
                                    <div className="text-gray-300 space-y-1">
                                        <div>🚀 Innovation through code</div>
                                        <div>⚡ Performance-driven solutions</div>
                                        <div>🎨 Beautiful user experiences</div>
                                        <div>🔧 Scalable architectures</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default About3;
