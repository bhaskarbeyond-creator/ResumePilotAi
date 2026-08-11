import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills1 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900', label: 'Dark Purple' },
                { value: 'bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900', label: 'Deep Blue' },
                { value: 'bg-gradient-to-br from-emerald-900 via-teal-800 to-green-900', label: 'Deep Green' },
                { value: 'bg-gradient-to-br from-gray-900 via-gray-800 to-black', label: 'Charcoal' },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 80,
                icon: '⚡',
            },
        },
    },
    defaultProps: {
        title: 'Technical Skills',
        subtitle: 'Technologies and tools I work with',
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        skills: [
            { name: 'React', level: 90, icon: '⚛️' },
            { name: 'JavaScript', level: 95, icon: '🟨' },
            { name: 'TypeScript', level: 85, icon: '🔷' },
            { name: 'Node.js', level: 80, icon: '🟢' },
            { name: 'Python', level: 75, icon: '🐍' },
            { name: 'CSS/SCSS', level: 90, icon: '🎨' },
            { name: 'Git', level: 85, icon: '📝' },
            { name: 'Docker', level: 70, icon: '🐳' },
        ],
    },
    render: ({ title, subtitle, backgroundColor, skills }) => (
        <div className={`${backgroundColor} relative py-24 px-4`}>
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
                        backgroundSize: '24px 24px',
                    }}></div>
            </div>

            {/* Floating Elements */}
            <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
            <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-cyan-500/15 rounded-full blur-lg animate-pulse delay-700"></div>

            <div className="relative text-gray-900 max-w-7xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-20">
                    <div className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg mb-8">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-3 animate-pulse"></div>
                        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Expertise</span>
                    </div>
                    <h2 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
                        <span className="text-gray-900 drop-shadow-lg">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </span>
                    </h2>
                    {subtitle && (
                        <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                            <SecureText className="text-gray-600">{subtitle}</SecureText>
                        </p>
                    )}
                </div>

                {/* Skills Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {skills &&
                        skills.map((skill, index) => (
                            <div key={index} className="group relative">
                                {/* Card Glow Effect */}
                                <div className="absolute -inset-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                                {/* Main Card */}
                                <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/50 hover:bg-white/90 transition-all duration-500 group-hover:scale-105">
                                    {/* Icon */}
                                    <div className="text-center mb-4">
                                        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-3">
                                            {skill.icon ? (
                                                <span className="text-2xl">{skill.icon}</span>
                                            ) : (
                                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-gray-900 mb-3 text-lg">
                                            <SecureText className="text-gray-900">{skill.name}</SecureText>
                                        </h3>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-medium text-gray-600">Proficiency</span>
                                            <span className="text-sm font-bold text-gray-700">{skill.level}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                                            <div
                                                className="bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out shadow-sm relative overflow-hidden"
                                                style={{ width: `${skill.level || 0}%` }}>
                                                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse"></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Skill Level Badge */}
                                    <div className="text-center">
                                        <span
                                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                                skill.level >= 90
                                                    ? 'bg-green-100 text-green-800'
                                                    : skill.level >= 75
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : skill.level >= 60
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {skill.level >= 90 ? 'Expert' : skill.level >= 75 ? 'Advanced' : skill.level >= 60 ? 'Intermediate' : 'Beginner'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {/* Bottom Stats */}
                <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{skills?.length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Skills</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{skills?.filter((skill) => skill.level >= 90).length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Expert Level</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{(skills?.reduce((avg, skill) => avg + (skill.level || 0), 0) / (skills?.length || 1)) | 0}%</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Average</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">5+</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Years</div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Skills1;
