import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Experience3 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
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
        title: 'Experience',
        subtitle: 'Professional journey through code and innovation',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        experiences: [
            {
                position: 'Senior Full Stack Developer',
                company: 'TechCorp Solutions',
                location: 'San Francisco, CA',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description: 'Leading development of cutting-edge web applications using modern tech stack. Architecting scalable solutions and mentoring junior developers.',
                achievements: [
                    { achievement: 'Boosted app performance by 65% through optimization' },
                    { achievement: 'Led cross-functional team of 8 engineers' },
                    { achievement: 'Implemented microservices architecture' },
                ],
                technologies: 'React, TypeScript, Node.js, PostgreSQL, Docker, AWS',
                companyLogo: '',
            },
            {
                position: 'Frontend Engineer',
                company: 'Digital Innovations',
                location: 'New York, NY',
                startDate: 'Jun 2020',
                endDate: 'Dec 2021',
                description: 'Developed responsive web applications with focus on user experience and performance optimization.',
                achievements: [{ achievement: 'Built 15+ client applications' }, { achievement: 'Reduced loading times by 70%' }],
                technologies: 'JavaScript, Vue.js, React, SCSS, Firebase',
                companyLogo: '',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, accentColor, experiences }) => {
        const accentColors = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'from-cyan-500 to-teal-500',
                border: 'border-cyan-400/30',
                text: 'text-cyan-400',
                glow: 'shadow-cyan-500/20',
                bg: 'bg-cyan-500/10',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'from-purple-500 to-fuchsia-500',
                border: 'border-purple-400/30',
                text: 'text-purple-400',
                glow: 'shadow-purple-500/20',
                bg: 'bg-purple-500/10',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'from-green-500 to-teal-500',
                border: 'border-green-400/30',
                text: 'text-green-400',
                glow: 'shadow-green-500/20',
                bg: 'bg-green-500/10',
            },
            pink: {
                primary: 'from-pink-400 to-rose-500',
                secondary: 'from-pink-500 to-purple-500',
                border: 'border-pink-400/30',
                text: 'text-pink-400',
                glow: 'shadow-pink-500/20',
                bg: 'bg-pink-500/10',
            },
            yellow: {
                primary: 'from-yellow-400 to-orange-500',
                secondary: 'from-yellow-500 to-amber-500',
                border: 'border-yellow-400/30',
                text: 'text-yellow-400',
                glow: 'shadow-yellow-500/20',
                bg: 'bg-yellow-500/10',
            },
        };

        const colors = accentColors[accentColor] || accentColors.cyan;

        return (
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
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

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className={`inline-flex items-center px-6 py-3 bg-white/5 backdrop-blur-md rounded-full border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-3 animate-pulse`} />
                                <span className={`text-sm font-medium ${colors.text} uppercase tracking-wider font-mono`}>Experience.load()</span>
                            </div>
                            <div className={`h-px bg-gradient-to-r ${colors.primary} flex-1 max-w-20 opacity-50`} />
                        </div>

                        <h2 className="text-6xl md:text-7xl lg:text-8xl font-black text-white leading-none tracking-tighter mb-6">
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mb-2 font-mono">&lt;experience&gt;</span>
                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mt-2 font-mono">&lt;/experience&gt;</span>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-400 max-w-4xl mx-auto leading-relaxed font-light">
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    {/* Experience Timeline */}
                    <div className="relative">
                        {/* Neon Timeline Line */}
                        <div className={`absolute left-8 top-0 bottom-0 w-1 bg-gradient-to-b ${colors.primary} opacity-60 shadow-lg blur-sm`} />
                        <div className={`absolute left-8.5 top-0 bottom-0 w-0.5 bg-gradient-to-b ${colors.primary}`} />

                        <div className="space-y-16">
                            {experiences &&
                                experiences.map((exp, index) => (
                                    <div key={index} className="relative pl-24 group">
                                        {/* Timeline Node */}
                                        <div
                                            className={`absolute left-4 w-8 h-8 bg-gradient-to-r ${colors.primary} rounded-full border-4 border-black shadow-2xl ${colors.glow} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                        </div>

                                        {/* Experience Card */}
                                        <div className="relative group/card">
                                            <div
                                                className={`absolute -inset-4 bg-gradient-to-r ${colors.primary} opacity-20 rounded-3xl blur-xl group-hover/card:opacity-30 transition-opacity duration-500`}
                                            />
                                            <div
                                                className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-8 rounded-3xl border ${colors.border} shadow-2xl ${colors.glow} hover:scale-[1.02] transition-all duration-300`}>
                                                {/* Code Editor Header */}
                                                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                                    <div className="ml-4 text-gray-400 text-sm font-mono">{exp.company.toLowerCase().replace(/\s+/g, '-')}_experience.js</div>
                                                    <div className="ml-auto">
                                                        <span className={`px-3 py-1 bg-black/50 rounded-lg border ${colors.border} font-mono text-xs ${colors.text}`}>
                                                            {exp.startDate} → {exp.endDate}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Experience Content as Code */}
                                                <div className="space-y-6">
                                                    <div className="font-mono text-sm space-y-2">
                                                        <div className="text-purple-400">
                                                            <span className="text-gray-500">const</span> <span className="text-yellow-400">experience</span> <span className="text-white">=</span>{' '}
                                                            <span className="text-white">{'{'}</span>
                                                        </div>
                                                        <div className="ml-4 space-y-1">
                                                            <div>
                                                                <span className={colors.text}>position:</span> <span className="text-green-300">"{exp.position}"</span>
                                                            </div>
                                                            <div>
                                                                <span className={colors.text}>company:</span> <span className="text-green-300">"{exp.company}"</span>
                                                            </div>
                                                            <div>
                                                                <span className={colors.text}>location:</span> <span className="text-green-300">"{exp.location}"</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-white">{'}'}</div>
                                                    </div>

                                                    {/* Description */}
                                                    <div className="bg-black/30 p-4 rounded-lg border border-gray-700/50">
                                                        <div className="text-gray-300 leading-relaxed">
                                                            <SecureText>{exp.description}</SecureText>
                                                        </div>
                                                    </div>

                                                    {/* Achievements */}
                                                    {exp.achievements && exp.achievements.length > 0 && (
                                                        <div className="space-y-3">
                                                            <h5 className={`font-bold ${colors.text} text-lg font-mono flex items-center gap-2`}>
                                                                <div className={`w-2 h-2 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                                                achievements[]
                                                            </h5>
                                                            <ul className="space-y-2">
                                                                {exp.achievements.map((achievement, i) => (
                                                                    <li key={i} className="text-gray-300 flex items-start gap-3 group/achievement">
                                                                        <span className={`${colors.text} text-lg mt-0.5 group-hover/achievement:scale-125 transition-transform`}>▶</span>
                                                                        <span className="leading-relaxed">
                                                                            <SecureText>{achievement.achievement}</SecureText>
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Technologies */}
                                                    {exp.technologies && (
                                                        <div className="space-y-3">
                                                            <h5 className={`font-bold ${colors.text} text-lg font-mono flex items-center gap-2`}>
                                                                <div className={`w-2 h-2 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                                                tech_stack:
                                                            </h5>
                                                            <div className="flex flex-wrap gap-2">
                                                                {exp.technologies.split(',').map((tech, i) => (
                                                                    <span
                                                                        key={i}
                                                                        className={`px-3 py-1 bg-black/50 border ${colors.border} rounded-lg text-sm font-mono text-gray-300 hover:${colors.bg} hover:scale-105 transition-all duration-200 cursor-default`}>
                                                                        {tech.trim()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Experience3;
