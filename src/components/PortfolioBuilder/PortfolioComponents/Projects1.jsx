import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x200';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x200';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x200';
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

// 🔒 SECURITY: Secure email validator
const SecureEmail = {
    validate: (email) => {
        if (typeof email !== 'string') return null;
        const cleaned = email.trim();
        // Basic email validation
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return cleaned;
        return null;
    },
};

const Projects1 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-b from-orange-50 via-yellow-50 to-orange-50', label: 'Warm Canvas' },
                { value: 'bg-gradient-to-b from-blue-50 via-indigo-50 to-blue-50', label: 'Cool Palette' },
                { value: 'bg-gradient-to-b from-gray-50 via-stone-50 to-gray-50', label: 'Neutral Studio' },
                { value: 'bg-gradient-to-b from-emerald-50 via-teal-50 to-emerald-50', label: 'Fresh Green' },
                { value: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50', label: 'Artistic Pink' },
            ],
        },
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'orange', label: 'Vibrant Orange' },
                { value: 'purple', label: 'Royal Purple' },
                { value: 'emerald', label: 'Emerald Green' },
                { value: 'rose', label: 'Rose Pink' },
                { value: 'blue', label: 'Ocean Blue' },
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
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x300',
                technologies: 'React, JavaScript',
            },
        },
    },
    defaultProps: {
        title: 'Featured Projects',
        email: 'artist@example.com',
        backgroundColor: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50',
        accentColor: 'orange',
        projects: [
            {
                title: 'E-Commerce Platform',
                description: 'A full-stack web application built with React and Node.js featuring user authentication, payment processing, and admin dashboard.',
                image: 'https://placehold.co/400x300',
                technologies: 'React, Node.js, MongoDB, Stripe',
            },
            {
                title: 'Task Management App',
                description: 'Mobile-first responsive website with drag-and-drop functionality and real-time collaboration features.',
                image: 'https://placehold.co/400x300',
                technologies: 'Vue.js, Firebase, Tailwind CSS',
            },
            {
                title: 'Weather Dashboard',
                description: 'Real-time weather application with location-based forecasts and interactive maps.',
                image: 'https://placehold.co/400x300',
                technologies: 'React, OpenWeather API, Chart.js',
            },
        ],
    },
    render: ({ title, email, backgroundColor, accentColor, projects }) => {
        // Color themes matching artistic aesthetic
        const colorThemes = {
            orange: {
                primary: 'from-orange-500 to-red-500',
                secondary: 'text-orange-600',
                accent: 'bg-orange-500',
                border: 'border-orange-200',
                ring: 'ring-orange-200',
                hover: 'hover:bg-orange-600',
                light: 'bg-orange-50',
            },
            purple: {
                primary: 'from-purple-500 to-violet-500',
                secondary: 'text-purple-600',
                accent: 'bg-purple-500',
                border: 'border-purple-200',
                ring: 'ring-purple-200',
                hover: 'hover:bg-purple-600',
                light: 'bg-purple-50',
            },
            emerald: {
                primary: 'from-emerald-500 to-green-500',
                secondary: 'text-emerald-600',
                accent: 'bg-emerald-500',
                border: 'border-emerald-200',
                ring: 'ring-emerald-200',
                hover: 'hover:bg-emerald-600',
                light: 'bg-emerald-50',
            },
            rose: {
                primary: 'from-rose-500 to-pink-500',
                secondary: 'text-rose-600',
                accent: 'bg-rose-500',
                border: 'border-rose-200',
                ring: 'ring-rose-200',
                hover: 'hover:bg-rose-600',
                light: 'bg-rose-50',
            },
            blue: {
                primary: 'from-blue-500 to-indigo-500',
                secondary: 'text-blue-600',
                accent: 'bg-blue-500',
                border: 'border-blue-200',
                ring: 'ring-blue-200',
                hover: 'hover:bg-blue-600',
                light: 'bg-blue-50',
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.orange;

        return (
            <div className={`${backgroundColor} relative py-24 px-6`}>
                {/* Artistic Background Elements */}
                <div className="absolute inset-0 overflow-hidden">
                    {/* Paint Splashes - Adjusted positioning to prevent clipping */}
                    <div className={`absolute top-20 left-20 w-32 h-32 bg-gradient-to-br ${theme.primary} opacity-10 rounded-full blur-2xl animate-pulse`}></div>
                    <div className={`absolute bottom-32 right-16 w-32 h-32 bg-gradient-to-br ${theme.primary} opacity-15 rounded-full blur-3xl animate-pulse delay-1000`}></div>
                    <div className={`absolute top-1/2 left-10 w-24 h-24 bg-gradient-to-br ${theme.primary} opacity-20 rounded-full blur-xl animate-pulse delay-500`}></div>

                    {/* Floating Art Elements */}
                    <div className="absolute top-1/4 right-1/4 w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-300"></div>
                    <div className="absolute bottom-1/4 left-1/3 w-3 h-3 bg-purple-400 rounded-full animate-bounce delay-700"></div>
                    <div className="absolute top-2/3 right-1/3 w-2 h-2 bg-emerald-400 rounded-full animate-bounce delay-1000"></div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.light} border ${theme.border} rounded-2xl shadow-lg mb-8`}>
                            <svg className={`w-5 h-5 ${theme.secondary} mr-3`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
                                />
                            </svg>
                            <span className={`text-sm font-semibold ${theme.secondary} uppercase tracking-wider`}>Portfolio</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </h2>
                    </div>

                    {/* Projects Grid */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {projects &&
                            projects.map((project, index) => (
                                <div key={index} className="group relative">
                                    {/* Card Glow Effect */}
                                    <div className={`absolute -inset-4 bg-gradient-to-r ${theme.primary} opacity-10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500`}></div>

                                    {/* Main Card */}
                                    <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-white/50 shadow-2xl overflow-hidden hover:bg-white/90 transition-all duration-500 group-hover:scale-105">
                                        {/* Project Image */}
                                        <div className="relative overflow-hidden">
                                            <img
                                                src={SecureUrl.validate(project.image)}
                                                alt={project.title || 'Project'}
                                                className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110"
                                                onError={(e) => {
                                                    e.target.src = 'https://placehold.co/400x300';
                                                }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                                            {/* Overlay Content */}
                                            <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0">
                                                {SecureEmail.validate(email) && (
                                                    <button
                                                        onClick={() => {
                                                            const validEmail = SecureEmail.validate(email);
                                                            if (validEmail) {
                                                                window.open(`mailto:${validEmail}?subject=Inquiry about ${project.title || 'your artwork'}`, '_self');
                                                            }
                                                        }}
                                                        className={`inline-flex items-center px-4 py-2 bg-white/90 backdrop-blur-sm rounded-xl border ${theme.border} ${theme.secondary} text-sm font-medium hover:bg-white transition-all duration-200 shadow-lg`}>
                                                        Contact Us
                                                        <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Content */}
                                        <div className="p-6">
                                            <div className="flex items-start gap-4 mb-4">
                                                <div className={`w-10 h-10 bg-gradient-to-r ${theme.primary} rounded-xl flex items-center justify-center shadow-lg flex-shrink-0`}>
                                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                        />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className={`text-xl font-bold text-gray-900 mb-2 group-hover:${theme.secondary} transition-colors`}>
                                                        <SecureText className="text-gray-900">{project.title || 'Untitled Project'}</SecureText>
                                                    </h3>
                                                </div>
                                            </div>

                                            <p className="text-gray-700 text-sm leading-relaxed mb-4">
                                                <SecureText className="text-gray-700">{project.description || 'No description available'}</SecureText>
                                            </p>

                                            {/* Technologies */}
                                            <div className="flex flex-wrap gap-2">
                                                {project.technologies &&
                                                    project.technologies.split(',').map((tech, techIndex) => (
                                                        <span
                                                            key={techIndex}
                                                            className={`px-3 py-1 ${theme.light} border ${theme.border} rounded-full text-xs font-medium ${theme.secondary} hover:bg-white transition-colors shadow-sm`}>
                                                            <SecureText className={theme.secondary}>{tech.trim()}</SecureText>
                                                        </span>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Bottom CTA */}
                    <div className="text-center mt-16">
                        <div className={`inline-flex items-center px-8 py-4 bg-white/80 backdrop-blur-md rounded-2xl border ${theme.border} shadow-lg hover:bg-white/90 transition-all duration-300 cursor-pointer group`}>
                            <span className="text-gray-700 text-sm font-medium mr-3">Want to see more artworks?</span>
                            <svg className={`w-5 h-5 ${theme.secondary} group-hover:translate-x-1 transition-transform`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Projects1;
