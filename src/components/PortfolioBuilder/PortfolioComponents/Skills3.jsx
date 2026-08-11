import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills3 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
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
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
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
                        { label: 'DevOps', value: 'devops' },
                        { label: 'Design', value: 'design' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Emoji' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 85,
                category: 'frontend',
                icon: '⚡',
            },
        },
    },
    defaultProps: {
        title: 'Tech Stack',
        subtitle: 'Advanced development expertise across multiple domains',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        skills: [
            { name: 'React & Next.js', level: 95, category: 'frontend', icon: '⚛️' },
            { name: 'TypeScript', level: 92, category: 'frontend', icon: '🔷' },
            { name: 'JavaScript', level: 98, category: 'frontend', icon: '🟨' },
            { name: 'Node.js', level: 88, category: 'backend', icon: '🟢' },
            { name: 'Python', level: 85, category: 'backend', icon: '🐍' },
            { name: 'PostgreSQL', level: 87, category: 'database', icon: '🐘' },
            { name: 'Docker', level: 80, category: 'devops', icon: '🐳' },
            { name: 'AWS', level: 78, category: 'devops', icon: '☁️' },
        ],
    },
    render: ({ title, subtitle, backgroundColor, accentColor, skills }) => {
        const colors = {
            cyan: { primary: 'from-cyan-400 to-blue-500', text: 'text-cyan-400', border: 'border-cyan-400/30' },
            purple: { primary: 'from-purple-400 to-violet-500', text: 'text-purple-400', border: 'border-purple-400/30' },
            green: { primary: 'from-green-400 to-emerald-500', text: 'text-green-400', border: 'border-green-400/30' },
            pink: { primary: 'from-pink-400 to-rose-500', text: 'text-pink-400', border: 'border-pink-400/30' },
            yellow: { primary: 'from-yellow-400 to-orange-500', text: 'text-yellow-400', border: 'border-yellow-400/30' },
        }[accentColor] || { primary: 'from-cyan-400 to-blue-500', text: 'text-cyan-400', border: 'border-cyan-400/30' };

        return (
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
                <div className="relative max-w-7xl mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="text-6xl md:text-7xl font-black text-white leading-none mb-6">
                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-400 max-w-4xl mx-auto">
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {skills &&
                            skills.map((skill, index) => (
                                <div key={index} className={`bg-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} hover:bg-white/10 transition-all duration-300`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        {skill.icon && <span className="text-2xl">{skill.icon}</span>}
                                        <h3 className="text-white font-mono text-lg">
                                            <SecureText>{skill.name}</SecureText>
                                        </h3>
                                    </div>
                                    <div className="mb-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm text-gray-400">Level</span>
                                            <span className={`text-lg font-bold ${colors.text}`}>{skill.level}%</span>
                                        </div>
                                        <div className="w-full bg-gray-800/50 rounded-full h-2">
                                            <div className={`bg-gradient-to-r ${colors.primary} h-2 rounded-full transition-all duration-1000`} style={{ width: `${skill.level}%` }} />
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-800/50 px-2 py-1 rounded font-mono">{skill.category}</div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        );
    },
};

export default Skills3;
