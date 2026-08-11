import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const About2 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'About Content' },
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
            getItemSummary: (item) => `${item.skill} - ${item.level}%`,
            arrayFields: {
                skill: { type: 'text', label: 'Skill' },
                level: { type: 'number', label: 'Skill Level (%)' },
            },
            defaultItemProps: {
                skill: 'New Skill',
                level: 80,
            },
        },
    },
    defaultProps: {
        title: 'About Me',
        content:
            'I am a passionate developer with expertise in modern web technologies. I love creating beautiful, functional applications that solve real-world problems. My journey in tech has been driven by curiosity and a desire to build meaningful solutions.',
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
        skills: [
            { skill: 'React', level: 90 },
            { skill: 'Node.js', level: 85 },
            { skill: 'JavaScript', level: 95 },
            { skill: 'TypeScript', level: 80 },
        ],
    },
    render: ({ title, content, backgroundColor, skills, showCTA = true }) => (
        <div className={`${backgroundColor} relative py-24 px-6`}>
            {/* Enhanced Decorative Elements */}
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/40 to-purple-200/40 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-cyan-200/30 to-teal-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-screen h-screen bg-gradient-to-r from-transparent via-white/20 to-transparent -z-10"></div>

            <div className="relative max-w-7xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-20">
                    <div className="flex items-center justify-center gap-4 mb-8">
                        <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full shadow-sm border border-emerald-200/50">
                            <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full mr-3 animate-pulse shadow-sm"></div>
                            <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">About</span>
                        </div>
                        <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                        <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">My Story</span>
                    </div>

                    <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-gray-900 leading-[0.9] tracking-tight mb-6">
                        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                            <SecureText>{title}</SecureText>
                        </span>
                    </h2>
                    <div className="flex items-center justify-center gap-6">
                        <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full w-24"></div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-20 items-center">
                    {/* Content Section */}
                    <div className="space-y-12">
                        {/* Main Content Card */}
                        <div className="relative group">
                            <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                            <div className="relative bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-2xl border border-white/50 hover:shadow-3xl transition-all duration-500">
                                <div className="flex items-start gap-6 mb-8">
                                    <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900 mb-3">My Journey</h3>
                                        <div className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full w-20"></div>
                                    </div>
                                </div>
                                <p className="text-xl text-gray-600 leading-relaxed">
                                    <SecureText>{content}</SecureText>
                                </p>
                            </div>
                        </div>

                        {/* Statistics */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="text-center group cursor-pointer">
                                <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-blue-600 transition-colors mb-2">5+</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Years</div>
                                </div>
                            </div>
                            <div className="text-center group cursor-pointer">
                                <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-purple-600 transition-colors mb-2">50+</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Projects</div>
                                </div>
                            </div>
                            <div className="text-center group cursor-pointer">
                                <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-cyan-600 transition-colors mb-2">20+</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Clients</div>
                                </div>
                            </div>
                        </div>

                        {/* Call to Action */}
                        {showCTA && (
                            <div className="flex flex-wrap gap-6">
                                <button className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold text-lg transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30 overflow-hidden">
                                    <span className="relative z-10 flex items-center gap-3">
                                        Let's Work Together
                                        <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>
                                <button className="px-10 py-5 border-2 border-gray-300 text-gray-700 rounded-2xl font-bold text-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 hover:shadow-lg">
                                    View Resume
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Skills Section */}
                    <div className="space-y-8">
                        <div className="relative group">
                            <div className="absolute -inset-4 bg-gradient-to-r from-purple-200/30 to-pink-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                            <div className="relative bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-2xl border border-white/50 hover:shadow-3xl transition-all duration-500">
                                <div className="flex items-center gap-6 mb-10">
                                    <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900 mb-3">Technical Skills</h3>
                                        <div className="h-1 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full w-20"></div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {skills &&
                                        skills.map((item, index) => (
                                            <div key={index} className="group">
                                                <div className="flex justify-between mb-3">
                                                    <span className="text-lg font-semibold text-gray-800">
                                                        <SecureText>{item.skill || 'Skill'}</SecureText>
                                                    </span>
                                                    <span className="text-lg font-bold text-gray-600">{item.level || 0}%</span>
                                                </div>
                                                <div className="relative">
                                                    <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                                                        <div
                                                            className="bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out shadow-sm relative overflow-hidden group-hover:shadow-md"
                                                            style={{ width: `${item.level || 0}%` }}>
                                                            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>

                        {/* Additional Info Cards */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl shadow-lg border border-blue-200/50 hover:shadow-xl transition-all duration-300">
                                <div className="text-center">
                                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <h4 className="font-bold text-blue-900 mb-1">Fast Learner</h4>
                                    <p className="text-sm text-blue-700">Always adapting to new tech</p>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl shadow-lg border border-purple-200/50 hover:shadow-xl transition-all duration-300">
                                <div className="text-center">
                                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                            />
                                        </svg>
                                    </div>
                                    <h4 className="font-bold text-purple-900 mb-1">Team Player</h4>
                                    <p className="text-sm text-purple-700">Collaborative approach</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default About2;
