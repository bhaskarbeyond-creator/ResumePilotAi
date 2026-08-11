import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const About1 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
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
            getItemSummary: (item) => item.skill,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
            },
            defaultItemProps: {
                skill: 'New Skill',
            },
        },
    },
    defaultProps: {
        title: 'About Me',
        content:
            'I am a passionate developer with expertise in modern web technologies. I love creating beautiful, functional applications that solve real-world problems. My journey in tech has been driven by curiosity and a desire to build meaningful solutions.',
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        skills: [{ skill: 'React' }, { skill: 'Node.js' }, { skill: 'JavaScript' }, { skill: 'TypeScript' }],
    },
    render: ({ title, content, backgroundColor, skills, showCTA = true }) => (
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
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-2xl"></div>

            <div className="relative text-gray-900 max-w-6xl mx-auto">
                {/* Section Title */}
                <div className="text-center mb-16">
                    <div className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg mb-8">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-3 animate-pulse"></div>
                        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Get to know me</span>
                    </div>
                    <h2 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
                        <span className="text-gray-900 drop-shadow-lg">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </span>
                    </h2>
                </div>

                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    {/* Content Section */}
                    <div className="space-y-8">
                        <div className="relative">
                            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-xl"></div>
                            <div className="relative bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-2xl">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900 mb-2">My Story</h3>
                                        <div className="h-1 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full w-16"></div>
                                    </div>
                                </div>
                                <p className="text-lg text-gray-700 leading-relaxed">
                                    <SecureText className="text-gray-700">{content}</SecureText>
                                </p>
                            </div>
                        </div>

                        {/* Call to Action */}
                        {showCTA && (
                            <div className="flex flex-wrap gap-4">
                                <button className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30 overflow-hidden">
                                    <span className="relative z-10 flex items-center gap-3">
                                        Let's Connect
                                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </button>
                                <button className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 backdrop-blur-sm">
                                    Download CV
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Skills Section */}
                    <div className="space-y-8">
                        <div className="relative">
                            <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-2xl blur-xl"></div>
                            <div className="relative bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-2xl">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-900 mb-2">Tech Stack</h3>
                                        <div className="h-1 bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full w-16"></div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {skills &&
                                        skills.map((item, index) => (
                                            <div key={index} className="group relative">
                                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-400/50 to-purple-400/50 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-3 rounded-xl hover:bg-white/10 transition-all duration-300 cursor-pointer">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"></div>
                                                        <span className="text-gray-700 font-medium">
                                                            <SecureText className="text-gray-700">{item.skill || 'Skill'}</SecureText>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>

                        {/* Achievement Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                <div className="text-3xl font-bold text-gray-900 mb-2">50+</div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider">Projects</div>
                            </div>
                            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 p-6 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                <div className="text-3xl font-bold text-gray-900 mb-2">5+</div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider">Years</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default About1;
