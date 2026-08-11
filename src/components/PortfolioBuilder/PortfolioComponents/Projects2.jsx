import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/600x400';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/600x400';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/600x400';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Projects2 = {
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
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                link: { type: 'text', label: 'Project Link' },
                githubLink: { type: 'text', label: 'GitHub Link' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/600x400',
                technologies: 'React, JavaScript',
                link: '#',
                githubLink: '#',
            },
        },
    },
    defaultProps: {
        title: 'Recent Work',
        subtitle: 'A collection of projects that showcase my skills and creativity',
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
        projects: [
            {
                title: 'Portfolio Website',
                description: 'A modern, responsive portfolio website built with React and Tailwind CSS. Features smooth animations, dark mode toggle, and optimized performance.',
                image: 'https://placehold.co/600x400',
                technologies: 'React, Tailwind CSS, Framer Motion',
                link: '#',
                githubLink: '#',
            },
            {
                title: 'Weather Dashboard',
                description: 'Real-time weather application with location-based forecasts, interactive maps, and weather alerts. Built with modern web technologies.',
                image: 'https://placehold.co/600x400',
                technologies: 'Vue.js, OpenWeather API, Chart.js',
                link: '#',
                githubLink: '#',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, projects }) => (
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
                            <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Portfolio</span>
                        </div>
                        <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                        <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">My Work</span>
                    </div>

                    <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-gray-900 leading-[0.9] tracking-tight mb-6">
                        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </span>
                    </h2>
                    <div className="flex items-center justify-center gap-6 mb-8">
                        <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full w-24"></div>
                    </div>
                    <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                        <SecureText className="text-gray-600">{subtitle}</SecureText>
                    </p>
                </div>

                {/* Projects List */}
                <div className="space-y-24">
                    {projects &&
                        projects.map((project, index) => (
                            <div key={index} className={`grid lg:grid-cols-2 gap-16 items-center ${index % 2 === 1 ? 'lg:grid-flow-col-dense' : ''}`}>
                                {/* Project Image */}
                                <div className={`relative group ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                                    <div className="relative">
                                        {/* Background Decorations */}
                                        <div className="absolute -inset-8 bg-gradient-to-br from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl rotate-3 group-hover:rotate-6 transition-transform duration-500"></div>
                                        <div className="absolute -inset-12 bg-gradient-to-br from-purple-100/20 to-pink-100/20 rounded-3xl -rotate-2 group-hover:-rotate-3 transition-transform duration-700"></div>

                                        {/* Main Image Container */}
                                        <div className="relative bg-gradient-to-br from-white via-gray-50 to-white p-4 rounded-3xl shadow-2xl hover:shadow-3xl transition-all duration-500 group-hover:scale-[1.02]">
                                            <img
                                                src={SecureUrl.validate(project.image)}
                                                alt={project.title || 'Project'}
                                                className="w-full rounded-2xl object-cover aspect-[4/3] shadow-xl"
                                                onError={(e) => {
                                                    e.target.src = 'https://placehold.co/600x400';
                                                }}
                                            />

                                            {/* Floating Elements */}
                                            <div className="absolute -top-4 -right-4 bg-gradient-to-br from-blue-500 to-purple-600 text-white p-4 rounded-2xl shadow-2xl hover:rotate-12 transition-transform duration-300 cursor-pointer">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                    />
                                                </svg>
                                            </div>

                                            <div className="absolute -bottom-4 -left-4 bg-white p-4 rounded-2xl shadow-2xl border-2 border-gray-100 hover:-rotate-6 transition-transform duration-300 cursor-pointer">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full animate-pulse shadow-sm"></div>
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">Live</div>
                                                        <div className="text-xs text-gray-500">Online</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Project Content */}
                                <div className={`space-y-8 ${index % 2 === 1 ? 'lg:col-start-1' : ''}`}>
                                    {/* Main Content Card */}
                                    <div className="relative group">
                                        <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                        <div className="relative bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-2xl border border-white/50 hover:shadow-3xl transition-all duration-500">
                                            <div className="flex items-start gap-6 mb-6">
                                                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                                        />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="text-3xl font-black text-gray-900 mb-3">
                                                        <SecureText className="text-gray-900">{project.title || 'Untitled Project'}</SecureText>
                                                    </h3>
                                                    <div className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full w-20"></div>
                                                </div>
                                            </div>

                                            <p className="text-lg text-gray-600 leading-relaxed mb-8">
                                                <SecureText className="text-gray-600">{project.description || 'No description available'}</SecureText>
                                            </p>

                                            {/* Technologies */}
                                            <div className="mb-8">
                                                <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">Technologies Used</h4>
                                                <div className="flex flex-wrap gap-3">
                                                    {project.technologies &&
                                                        project.technologies.split(',').map((tech, techIndex) => (
                                                            <span
                                                                key={techIndex}
                                                                className="px-4 py-2 bg-gradient-to-r from-blue-100 to-purple-100 border border-blue-200/50 text-blue-800 rounded-full text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200">
                                                                <SecureText className="text-blue-800">{tech.trim()}</SecureText>
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-wrap gap-4">
                                                <a
                                                    href={project.link || '#'}
                                                    className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30 overflow-hidden">
                                                    <span className="relative z-10 flex items-center gap-3">
                                                        View Live
                                                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                            />
                                                        </svg>
                                                    </span>
                                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                                </a>
                                                <a
                                                    href={project.githubLink || '#'}
                                                    className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 hover:shadow-lg flex items-center gap-3">
                                                    GitHub
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                                    </svg>
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {/* Bottom CTA */}
                <div className="text-center mt-20">
                    <div className="inline-flex items-center px-10 py-5 bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg border border-white/40 hover:shadow-xl hover:bg-white/80 transition-all duration-300 cursor-pointer group">
                        <span className="text-gray-700 font-semibold mr-4">Ready to start your project?</span>
                        <svg className="w-6 h-6 text-gray-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Projects2;
