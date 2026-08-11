import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills2 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50', label: 'Light Blue' },
                { value: 'bg-gradient-to-br from-rose-50 via-white to-teal-50', label: 'Warm White' },
                { value: 'bg-gradient-to-br from-violet-50 via-white to-pink-50', label: 'Soft Purple' },
                { value: 'bg-gradient-to-br from-slate-50 via-white to-gray-50', label: 'Clean Gray' },
            ],
        },
        skills: {
            type: 'array',
            label: 'Skills',
            getItemSummary: (item) => `${item.name} (${item.category}) - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { label: 'Frontend', value: 'frontend' },
                        { label: 'Backend', value: 'backend' },
                        { label: 'Database', value: 'database' },
                        { label: 'Tools', value: 'tools' },
                        { label: 'Design', value: 'design' },
                        { label: 'Other', value: 'other' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 80,
                category: 'frontend',
                icon: '⚡',
            },
        },
    },
    defaultProps: {
        title: 'Technical Expertise',
        subtitle: 'Comprehensive skill set across the development stack',
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
        skills: [
            { name: 'React', level: 90, category: 'frontend', icon: '⚛️' },
            { name: 'Vue.js', level: 85, category: 'frontend', icon: '💚' },
            { name: 'JavaScript', level: 95, category: 'frontend', icon: '🟨' },
            { name: 'TypeScript', level: 85, category: 'frontend', icon: '🔷' },
            { name: 'Node.js', level: 80, category: 'backend', icon: '🟢' },
            { name: 'Python', level: 75, category: 'backend', icon: '🐍' },
            { name: 'MongoDB', level: 70, category: 'database', icon: '🍃' },
            { name: 'PostgreSQL', level: 75, category: 'database', icon: '🐘' },
            { name: 'Docker', level: 70, category: 'tools', icon: '🐳' },
            { name: 'Git', level: 85, category: 'tools', icon: '📝' },
            { name: 'Figma', level: 80, category: 'design', icon: '🎨' },
            { name: 'Adobe XD', level: 75, category: 'design', icon: '🎭' },
        ],
    },
    render: ({ title, subtitle, backgroundColor, skills }) => {
        // Group skills by category
        const groupedSkills = skills
            ? skills.reduce((acc, skill) => {
                  const category = skill.category || 'other';
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(skill);
                  return acc;
              }, {})
            : {};

        const categoryConfig = {
            frontend: {
                label: 'Frontend Development',
                icon: '💻',
                gradient: 'from-blue-500 to-cyan-500',
                bg: 'from-blue-50 to-cyan-50',
            },
            backend: {
                label: 'Backend Development',
                icon: '⚙️',
                gradient: 'from-green-500 to-emerald-500',
                bg: 'from-green-50 to-emerald-50',
            },
            database: {
                label: 'Database Management',
                icon: '🗄️',
                gradient: 'from-purple-500 to-violet-500',
                bg: 'from-purple-50 to-violet-50',
            },
            tools: {
                label: 'Development Tools',
                icon: '🔧',
                gradient: 'from-orange-500 to-red-500',
                bg: 'from-orange-50 to-red-50',
            },
            design: {
                label: 'Design & UX',
                icon: '🎨',
                gradient: 'from-pink-500 to-rose-500',
                bg: 'from-pink-50 to-rose-50',
            },
            other: {
                label: 'Other Skills',
                icon: '⭐',
                gradient: 'from-gray-500 to-slate-500',
                bg: 'from-gray-50 to-slate-50',
            },
        };

        return (
            <div className={`${backgroundColor} relative py-24 px-6`}>
                {/* Enhanced Decorative Elements */}
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/40 to-purple-200/40 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-cyan-200/30 to-teal-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-screen h-screen bg-gradient-to-r from-transparent via-white/20 to-transparent -z-10"></div>

                <div className="relative max-w-6xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full shadow-sm border border-emerald-200/50">
                                <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full mr-3 animate-pulse shadow-sm"></div>
                                <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Skills</span>
                            </div>
                            <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Expertise</span>
                        </div>

                        <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-gray-900 leading-[0.9] tracking-tight mb-6">
                            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                                <SecureText className="text-gray-900">{title}</SecureText>
                            </span>
                        </h2>
                        <div className="flex items-center justify-center gap-6 mb-8">
                            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full w-24"></div>
                        </div>
                        {subtitle && (
                            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                                <SecureText className="text-gray-600">{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    {/* Skills Categories */}
                    <div className="space-y-12">
                        {Object.entries(groupedSkills).map(([category, categorySkills]) => {
                            const config = categoryConfig[category] || categoryConfig.other;
                            return (
                                <div key={category} className="relative group">
                                    <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                    <div className={`relative bg-gradient-to-br ${config.bg} p-8 rounded-3xl shadow-2xl border border-white/50 hover:shadow-3xl transition-all duration-500`}>
                                        {/* Category Header */}
                                        <div className="flex items-center gap-6 mb-8">
                                            <div className={`w-16 h-16 bg-gradient-to-r ${config.gradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                                                <span className="text-2xl">{config.icon}</span>
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black text-gray-900 mb-2">
                                                    <SecureText className="text-gray-900">{config.label}</SecureText>
                                                </h3>
                                                <div className={`h-1 bg-gradient-to-r ${config.gradient} rounded-full w-20`}></div>
                                            </div>
                                            <div className="ml-auto text-right">
                                                <div className="text-2xl font-bold text-gray-900">
                                                    {Math.round(categorySkills.reduce((avg, skill) => avg + (skill.level || 0), 0) / categorySkills.length)}%
                                                </div>
                                                <div className="text-sm text-gray-600">Average</div>
                                            </div>
                                        </div>

                                        {/* Skills Grid */}
                                        <div className="grid md:grid-cols-2 gap-6">
                                            {categorySkills.map((skill, index) => (
                                                <div key={index} className="group/skill">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            {skill.icon && <span className="text-lg">{skill.icon}</span>}
                                                            <span className="font-bold text-gray-800 text-lg">
                                                                <SecureText className="text-gray-800">{skill.name}</SecureText>
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg font-bold text-gray-700">{skill.level}%</span>
                                                            <span
                                                                className={`px-2 py-1 rounded-full text-xs font-semibold ${
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
                                                    <div className="w-full bg-white/60 rounded-full h-4 shadow-inner border border-white/40">
                                                        <div
                                                            className={`bg-gradient-to-r ${config.gradient} h-4 rounded-full transition-all duration-1000 ease-out shadow-sm relative overflow-hidden group-hover/skill:shadow-md`}
                                                            style={{ width: `${skill.level || 0}%` }}>
                                                            <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Statistics */}
                    <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300 text-center">
                            <div className="text-3xl font-black text-gray-900 mb-2">{skills?.length || 0}</div>
                            <div className="text-sm text-gray-600 uppercase tracking-wider font-medium">Total Skills</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300 text-center">
                            <div className="text-3xl font-black text-gray-900 mb-2">{Object.keys(groupedSkills).length}</div>
                            <div className="text-sm text-gray-600 uppercase tracking-wider font-medium">Categories</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300 text-center">
                            <div className="text-3xl font-black text-gray-900 mb-2">{skills?.filter((skill) => skill.level >= 90).length || 0}</div>
                            <div className="text-sm text-gray-600 uppercase tracking-wider font-medium">Expert Level</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300 text-center">
                            <div className="text-3xl font-black text-gray-900 mb-2">{Math.round(skills?.reduce((avg, skill) => avg + (skill.level || 0), 0) / (skills?.length || 1))}%</div>
                            <div className="text-sm text-gray-600 uppercase tracking-wider font-medium">Average Score</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Skills2;
