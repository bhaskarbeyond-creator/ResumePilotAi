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

const Education2 = {
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
        title: 'Academic Excellence',
        subtitle: 'Building knowledge through continuous education and professional development',
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
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
            {
                degree: 'Full Stack Web Development',
                field: 'JavaScript & React',
                institution: 'Coding Bootcamp',
                location: 'Online',
                startDate: '2023',
                endDate: '2023',
                gpa: '',
                description: 'Intensive program covering modern web development technologies and best practices.',
                logo: 'https://placehold.co/64x64',
                credentialUrl: '#',
                type: 'bootcamp',
            },
        ],
    },
    render: ({ title, subtitle, backgroundColor, education }) => (
        <div className={`${backgroundColor} relative overflow-hidden py-24 px-6`}>
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
                            <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Education</span>
                        </div>
                        <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                        <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Learning</span>
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
                        <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
                            <SecureText className="text-gray-600">{subtitle}</SecureText>
                        </p>
                    )}
                </div>

                {/* Education Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                    {education &&
                        education.map((edu, index) => (
                            <div key={index} className="group relative">
                                {/* Card Glow Effect */}
                                <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>

                                {/* Main Card */}
                                <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 hover:bg-white/80 hover:shadow-3xl transition-all duration-500 group-hover:scale-[1.02] h-full flex flex-col">
                                    {/* Card Header */}
                                    <div className="flex items-start gap-4 mb-6">
                                        {/* Institution Logo */}
                                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                                            {edu.logo ? (
                                                <img
                                                    src={SecureUrl.validate(edu.logo)}
                                                    alt={edu.institution || 'Institution'}
                                                    className="w-12 h-12 object-contain rounded-xl"
                                                    onError={(e) => {
                                                        e.target.parentElement.innerHTML = `
                                                            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18.999 7.5 18.999s3.332-.522 4.5-1.246m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18.999 16.5 18.999c-1.746 0-3.332-.522-4.5-1.246"></path>
                                                            </svg>
                                                        `;
                                                    }}
                                                />
                                            ) : (
                                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18.999 7.5 18.999s3.332-.522 4.5-1.246m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18.999 16.5 18.999c-1.746 0-3.332-.522-4.5-1.246"
                                                    />
                                                </svg>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* Type Badge */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                                                        edu.type === 'degree'
                                                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                                            : edu.type === 'certification'
                                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                                            : edu.type === 'course'
                                                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                                            : 'bg-orange-100 text-orange-700 border border-orange-200'
                                                    }`}>
                                                    {edu.type ? edu.type.toUpperCase() : 'EDUCATION'}
                                                </span>
                                                {edu.gpa && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium border border-gray-200">GPA: {edu.gpa}</span>}
                                            </div>

                                            <h3 className="text-xl font-black text-gray-900 mb-2 leading-tight group-hover:text-blue-700 transition-colors">
                                                <SecureText className="text-gray-900">{edu.degree}</SecureText>
                                            </h3>
                                            <h4 className="text-lg font-bold text-gray-700 mb-3">
                                                <SecureText className="text-gray-700">{edu.field}</SecureText>
                                            </h4>
                                        </div>
                                    </div>

                                    {/* Institution Info */}
                                    <div className="mb-4">
                                        <p className="text-gray-800 font-semibold mb-1">
                                            <SecureText className="text-gray-800">{edu.institution}</SecureText>
                                        </p>
                                        <p className="text-gray-600 text-sm">
                                            <SecureText className="text-gray-600">{edu.location}</SecureText>
                                        </p>
                                    </div>

                                    {/* Date Range */}
                                    <div className="mb-6">
                                        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-100">
                                            <span className="text-sm font-bold text-gray-800">{edu.startDate}</span>
                                            <div className="h-1 w-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                                            <span className="text-sm font-bold text-gray-800">{edu.endDate}</span>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {edu.description && (
                                        <div className="flex-1 mb-6">
                                            <p className="text-gray-700 text-sm leading-relaxed bg-white/50 rounded-2xl p-4 border border-white/40">
                                                <SecureText className="text-gray-700">{edu.description}</SecureText>
                                            </p>
                                        </div>
                                    )}

                                    {/* Credential Button */}
                                    {edu.credentialUrl && (
                                        <div className="mt-auto">
                                            <a
                                                href={edu.credentialUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group/btn flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold text-sm hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl">
                                                <span>View Credential</span>
                                                <svg className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                    />
                                                </svg>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>

                {/* Enhanced Summary Stats */}
                <div className="relative">
                    <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/20 via-purple-200/10 to-cyan-200/20 rounded-3xl blur-2xl"></div>
                    <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/50">
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-black text-gray-900 mb-2">Education Overview</h3>
                            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full w-16 mx-auto"></div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="text-center group">
                                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl font-black text-white">{education?.filter((e) => e.type === 'degree').length || 0}</span>
                                </div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider font-semibold">Degrees</div>
                            </div>
                            <div className="text-center group">
                                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl font-black text-white">{education?.filter((e) => e.type === 'certification').length || 0}</span>
                                </div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider font-semibold">Certifications</div>
                            </div>
                            <div className="text-center group">
                                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl font-black text-white">{education?.filter((e) => e.type === 'course').length || 0}</span>
                                </div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider font-semibold">Courses</div>
                            </div>
                            <div className="text-center group">
                                <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl font-black text-white">{education?.length || 0}</span>
                                </div>
                                <div className="text-sm text-gray-600 uppercase tracking-wider font-semibold">Total</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Education2;
