import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/64x64';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/64x64';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/64x64';
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

const Education1 = {
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
        education: {
            type: 'array',
            label: 'Education',
            getItemSummary: (item) => `${item.degree} - ${item.institution}`,
            arrayFields: {
                degree: { type: 'text', label: 'Degree/Certification' },
                field: { type: 'text', label: 'Field of Study' },
                institution: { type: 'text', label: 'Institution' },
                location: { type: 'text', label: 'Location' },
                startDate: { type: 'text', label: 'Start Date' },
                endDate: { type: 'text', label: 'End Date' },
                gpa: { type: 'text', label: 'GPA (Optional)' },
                description: { type: 'textarea', label: 'Description' },
                logo: { type: 'text', label: 'Institution Logo URL' },
                credentialUrl: { type: 'text', label: 'Credential URL' },
                type: {
                    type: 'select',
                    label: 'Type',
                    options: [
                        { value: 'degree', label: 'Degree' },
                        { value: 'certification', label: 'Certification' },
                        { value: 'course', label: 'Course' },
                        { value: 'bootcamp', label: 'Bootcamp' },
                    ],
                },
            },
            defaultItemProps: {
                degree: 'Bachelor of Science',
                field: 'Computer Science',
                institution: 'University Name',
                location: 'City, State',
                startDate: '2020',
                endDate: '2024',
                gpa: '3.8',
                description: 'Relevant coursework and achievements',
                logo: 'https://placehold.co/64x64',
                credentialUrl: '#',
                type: 'degree',
            },
        },
    },
    defaultProps: {
        title: 'Educational Journey',
        subtitle: 'Academic achievements and continuous learning',
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        education: [
            {
                degree: 'Master of Science in Computer Science',
                field: 'Artificial Intelligence',
                institution: 'Tech University',
                location: 'San Francisco, CA',
                startDate: '2022',
                endDate: '2024',
                gpa: '3.9',
                description: 'Specialized in machine learning algorithms and neural networks with focus on natural language processing.',
                logo: 'https://placehold.co/64x64',
                credentialUrl: '#',
                type: 'degree',
            },
            {
                degree: 'Bachelor of Science in Software Engineering',
                field: 'Web Development',
                institution: 'State University',
                location: 'Austin, TX',
                startDate: '2018',
                endDate: '2022',
                gpa: '3.7',
                description: 'Comprehensive program covering full-stack development, database design, and software architecture.',
                logo: 'https://placehold.co/64x64',
                credentialUrl: '#',
                type: 'degree',
            },
            {
                degree: 'AWS Solutions Architect',
                field: 'Cloud Computing',
                institution: 'Amazon Web Services',
                location: 'Online',
                startDate: '2023',
                endDate: '2023',
                gpa: '',
                description: 'Professional certification demonstrating expertise in designing distributed systems on AWS.',
                logo: 'https://placehold.co/64x64',
                credentialUrl: '#',
                type: 'certification',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, education }) => (
        <div className={`${backgroundColor} relative overflow-hidden py-24 px-4`}>
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
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-cyan-500/15 rounded-full blur-lg animate-pulse delay-500"></div>

            <div className="relative text-gray-900 max-w-6xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-20">
                    <div className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg mb-8">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-3 animate-pulse"></div>
                        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Education</span>
                    </div>
                    <h2 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
                        <span className="text-gray-900 drop-shadow-lg">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </span>
                    </h2>
                    {subtitle && (
                        <p className="text-xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
                            <SecureText className="text-gray-700">{subtitle}</SecureText>
                        </p>
                    )}
                </div>

                {/* Education Timeline */}
                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-8 md:left-12 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-cyan-500 rounded-full shadow-lg"></div>

                    <div className="space-y-12">
                        {education &&
                            education.map((edu, index) => (
                                <div key={index} className="relative group">
                                    {/* Card Glow Effect */}
                                    <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                                    <div className="relative pl-20 md:pl-28">
                                        {/* Timeline dot */}
                                        <div className="absolute left-6 md:left-10 w-6 h-6 rounded-full border-4 border-white/30 shadow-xl backdrop-blur-sm bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse"></div>

                                        {/* Main Card */}
                                        <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl p-8 hover:bg-white/15 transition-all duration-500 group-hover:scale-[1.02]">
                                            <div className="flex flex-col lg:flex-row gap-6">
                                                {/* Education Details */}
                                                <div className="flex-1">
                                                    <div className="flex items-start gap-4 mb-4">
                                                        {/* Institution Logo */}
                                                        {edu.logo && (
                                                            <div className="w-16 h-16 bg-white/80 backdrop-blur-sm rounded-2xl border border-white/30 shadow-lg flex items-center justify-center flex-shrink-0">
                                                                <img
                                                                    src={SecureUrl.validate(edu.logo)}
                                                                    alt={edu.institution || 'Institution'}
                                                                    className="w-12 h-12 object-contain rounded-xl"
                                                                    onError={(e) => {
                                                                        e.target.style.display = 'none';
                                                                    }}
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="flex-1">
                                                            {/* Type Badge */}
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <span
                                                                    className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg ${
                                                                        edu.type === 'degree'
                                                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                                                            : edu.type === 'certification'
                                                                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                                                                            : edu.type === 'course'
                                                                            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white'
                                                                            : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                                                                    }`}>
                                                                    {edu.type ? edu.type.toUpperCase() : 'EDUCATION'}
                                                                </span>
                                                                {edu.gpa && (
                                                                    <span className="px-3 py-1 bg-white/80 backdrop-blur-sm border border-white/30 rounded-lg text-sm font-medium text-gray-700 shadow-sm">
                                                                        GPA: {edu.gpa}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                                                                <SecureText className="text-gray-900">{edu.degree}</SecureText>
                                                            </h3>
                                                            <h4 className="text-lg font-semibold text-gray-700 mb-2">
                                                                <SecureText className="text-gray-700">{edu.field}</SecureText>
                                                            </h4>
                                                            <p className="text-gray-600 font-medium mb-1">
                                                                <SecureText className="text-gray-600">{edu.institution}</SecureText>
                                                            </p>
                                                            <p className="text-gray-500 text-sm mb-4">
                                                                <SecureText className="text-gray-500">{edu.location}</SecureText>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {edu.description && (
                                                        <p className="text-gray-700 leading-relaxed mb-6 bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                                                            <SecureText className="text-gray-700">{edu.description}</SecureText>
                                                        </p>
                                                    )}

                                                    {edu.credentialUrl && (
                                                        <a
                                                            href={edu.credentialUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-105 shadow-lg">
                                                            View Credential
                                                            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                />
                                                            </svg>
                                                        </a>
                                                    )}
                                                </div>

                                                {/* Timeline Date */}
                                                <div className="lg:w-40 flex-shrink-0">
                                                    <div className="bg-white/80 backdrop-blur-sm border border-white/30 rounded-2xl p-4 shadow-lg text-center">
                                                        <div className="text-2xl font-bold text-gray-900 mb-1">{edu.startDate}</div>
                                                        <div className="text-sm text-gray-500 mb-2">to</div>
                                                        <div className="text-2xl font-bold text-gray-900">{edu.endDate}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>

                {/* Bottom Stats */}
                <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-white/80 backdrop-blur-md border border-white/30 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{education?.filter((e) => e.type === 'degree').length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Degrees</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md border border-white/30 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{education?.filter((e) => e.type === 'certification').length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Certifications</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md border border-white/30 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{education?.filter((e) => e.type === 'course').length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Courses</div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md border border-white/30 p-6 rounded-2xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                        <div className="text-3xl font-bold text-gray-900 mb-2">{education?.length || 0}</div>
                        <div className="text-sm text-gray-600 uppercase tracking-wider">Total</div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Education1;
