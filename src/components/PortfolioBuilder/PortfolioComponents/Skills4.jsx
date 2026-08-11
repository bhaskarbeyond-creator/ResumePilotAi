import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills4 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        backgroundColor: {
            type: 'select',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gray-900', label: 'Dark Gray' },
                { value: 'bg-slate-900', label: 'Slate Terminal' },
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
                        { label: 'Tools', value: 'tools' },
                    ],
                },
                command: { type: 'text', label: 'Terminal Command' },
            },
            defaultItemProps: {
                name: 'New Skill',
                level: 85,
                category: 'frontend',
                command: 'which skill',
            },
        },
        totalCommits: { type: 'text', label: 'Total Commits' },
        activePRs: { type: 'text', label: 'Active PRs' },
        codeReviews: { type: 'text', label: 'Code Reviews' },
    },
    defaultProps: {
        title: 'Skill Matrix',
        subtitle: 'Advanced development capabilities across the full stack',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
        skills: [
            { name: 'JavaScript/TypeScript', level: 95, category: 'frontend', command: 'node --version' },
            { name: 'React & Next.js', level: 92, category: 'frontend', command: 'npx create-react-app' },
            { name: 'Node.js & Express', level: 90, category: 'backend', command: 'npm start server' },
            { name: 'Python & Django', level: 85, category: 'backend', command: 'python manage.py runserver' },
            { name: 'PostgreSQL', level: 87, category: 'database', command: 'psql -U postgres' },
            { name: 'Docker & K8s', level: 80, category: 'devops', command: 'docker compose up' },
            { name: 'Git & GitHub', level: 95, category: 'tools', command: 'git status' },
            { name: 'VS Code & Vim', level: 90, category: 'tools', command: 'code .' },
        ],
        totalCommits: '3.2K+',
        activePRs: '12',
        codeReviews: '450+',
    },
    render: ({ title, subtitle, backgroundColor, terminalTheme, skills, totalCommits, activePRs, codeReviews }) => {
        const themes = {
            matrix: { primary: 'text-green-400', accent: 'from-green-400 to-emerald-500', border: 'border-green-400/30', prompt: '$' },
            hacker: { primary: 'text-amber-400', accent: 'from-amber-400 to-orange-500', border: 'border-amber-400/30', prompt: '>' },
            retro: { primary: 'text-cyan-400', accent: 'from-cyan-400 to-blue-500', border: 'border-cyan-400/30', prompt: '~' },
            cyberpunk: { primary: 'text-purple-400', accent: 'from-purple-400 to-pink-500', border: 'border-purple-400/30', prompt: '#' },
        };

        const theme = themes[terminalTheme] || themes.matrix;

        return (
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
                <div className="relative max-w-7xl mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="text-6xl md:text-7xl font-black text-white leading-none mb-6 font-mono">
                            <span className={`bg-gradient-to-r ${theme.accent} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-300 max-w-4xl mx-auto font-mono">
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    <div className="space-y-8">
                        {skills && skills.map((skill, index) => (
                            <div key={index} className={`bg-gray-900/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-xl`}>
                                <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 rounded-t-lg border-b border-gray-700/50">
                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                    <div className="ml-4 text-gray-400 text-sm font-mono">{(skill.name || skill.skill || 'skill').toLowerCase().replace(/\s+/g, '-')}.sh</div>
                                    <div className="ml-auto">
                                        <span className={`${theme.primary} text-sm`}>{skill.level}%</span>
                                    </div>
                                </div>
                                <div className="p-6 font-mono text-sm space-y-4">
                                    <div className={`${theme.primary} flex items-center gap-2`}>
                                        <span>{theme.prompt}</span>
                                        <span>{skill.command || `which ${(skill.name || skill.skill || 'skill').toLowerCase()}`}</span>
                                    </div>
                                    <div className="ml-4 flex justify-between items-center">
                                        <span className="text-white">
                                            <SecureText>{skill.name || skill.skill}</SecureText>
                                        </span>
                                        <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-1 rounded">
                                            {skill.category}
                                        </span>
                                    </div>
                                    <div className="ml-4">
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-500">Loading:</span>
                                            <div className="flex-1 bg-gray-800 rounded h-1 relative overflow-hidden">
                                                <div
                                                    className={`bg-gradient-to-r ${theme.accent} h-1 transition-all duration-1000 ease-out`}
                                                    style={{ width: `${skill.level}%` }}
                                                />
                                            </div>
                                            <span className={theme.primary}>[{skill.level}%]</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    },
};

export default Skills4;
