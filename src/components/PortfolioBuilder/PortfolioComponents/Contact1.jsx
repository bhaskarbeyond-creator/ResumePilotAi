import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return '#';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return '#';
        if (cleaned && !cleaned.match(/^https?:\/\//i)) return '#';
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

const Contact1 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
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
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        location: { type: 'text', label: 'Location (Optional)' },
        linkedin: { type: 'text', label: 'LinkedIn URL' },
        github: { type: 'text', label: 'GitHub URL' },
        twitter: { type: 'text', label: 'Twitter URL (Optional)' },
        website: { type: 'text', label: 'Website URL (Optional)' },
    },
    defaultProps: {
        title: 'Get In Touch',
        subtitle: "Ready to collaborate? Let's discuss your next project and create something amazing together.",
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
        email: 'john@example.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        linkedin: 'https://linkedin.com/in/johndoe',
        github: 'https://github.com/johndoe',
        twitter: 'https://twitter.com/johndoe',
        website: 'https://johndoe.com',
    },
    render: ({ title, subtitle, backgroundColor, email, phone, location, linkedin, github, twitter, website }) => (
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
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-cyan-500/15 rounded-full blur-lg animate-pulse delay-500"></div>

            <div className="relative text-gray-900 max-w-6xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-20">
                    <div className="inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg mb-8">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-3 animate-pulse"></div>
                        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Contact</span>
                    </div>
                    <h2 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
                        <span className="text-gray-900 drop-shadow-lg">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </span>
                    </h2>
                    {subtitle && (
                        <p className="text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed">
                            <SecureText className="text-gray-700">{subtitle}</SecureText>
                        </p>
                    )}
                </div>

                {/* Contact Content */}
                <div className="grid lg:grid-cols-2 gap-12 items-start">
                    {/* Contact Information */}
                    <div className="space-y-8">
                        <div className="group relative">
                            {/* Card Glow Effect */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                            {/* Main Card */}
                            <div className="relative bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl p-8 hover:bg-white/15 transition-all duration-500">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">Contact Information</h3>
                                </div>

                                <div className="space-y-6">
                                    {/* Email */}
                                    <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-white/60 transition-all duration-300">
                                        <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600 font-medium">Email</div>
                                            <a href={`mailto:${email}`} className="text-gray-900 font-semibold hover:text-blue-700 transition-colors">
                                                <SecureText className="text-gray-900">{email}</SecureText>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-white/60 transition-all duration-300">
                                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600 font-medium">Phone</div>
                                            <a href={`tel:${phone}`} className="text-gray-900 font-semibold hover:text-blue-700 transition-colors">
                                                <SecureText className="text-gray-900">{phone}</SecureText>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Location */}
                                    {location && (
                                        <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-white/60 transition-all duration-300">
                                            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-sm">
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                                    />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600 font-medium">Location</div>
                                                <div className="text-gray-900 font-semibold">
                                                    <SecureText className="text-gray-900">{location}</SecureText>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Social Links & CTA */}
                    <div className="space-y-8">
                        {/* Social Media */}
                        <div className="group relative">
                            {/* Card Glow Effect */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                            {/* Main Card */}
                            <div className="relative bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl p-8 hover:bg-white/15 transition-all duration-500">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">Connect With Me</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    {/* LinkedIn */}
                                    <a
                                        href={SecureUrl.validate(linkedin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social flex items-center gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-blue-50 hover:border-blue-200 transition-all duration-300 hover:scale-105">
                                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm group-hover/social:bg-blue-700 transition-colors">
                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-gray-600 font-medium">LinkedIn</div>
                                            <div className="text-gray-900 font-semibold text-sm truncate">Professional</div>
                                        </div>
                                    </a>

                                    {/* GitHub */}
                                    <a
                                        href={SecureUrl.validate(github)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social flex items-center gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-gray-50 hover:border-gray-200 transition-all duration-300 hover:scale-105">
                                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shadow-sm group-hover/social:bg-gray-900 transition-colors">
                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-gray-600 font-medium">GitHub</div>
                                            <div className="text-gray-900 font-semibold text-sm truncate">Code</div>
                                        </div>
                                    </a>

                                    {/* Twitter */}
                                    {twitter && (
                                        <a
                                            href={SecureUrl.validate(twitter)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group/social flex items-center gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-blue-50 hover:border-blue-200 transition-all duration-300 hover:scale-105">
                                            <div className="w-10 h-10 bg-blue-400 rounded-xl flex items-center justify-center shadow-sm group-hover/social:bg-blue-500 transition-colors">
                                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-600 font-medium">Twitter</div>
                                                <div className="text-gray-900 font-semibold text-sm truncate">Updates</div>
                                            </div>
                                        </a>
                                    )}

                                    {/* Website */}
                                    {website && (
                                        <a
                                            href={SecureUrl.validate(website)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group/social flex items-center gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/30 hover:bg-purple-50 hover:border-purple-200 transition-all duration-300 hover:scale-105">
                                            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-sm group-hover/social:bg-purple-700 transition-colors">
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-600 font-medium">Website</div>
                                                <div className="text-gray-900 font-semibold text-sm truncate">Portfolio</div>
                                            </div>
                                        </a>
                                    )}
                                </div>

                                {/* CTA Button */}
                                <a
                                    href={`mailto:${email}`}
                                    className="group/cta flex items-center justify-center gap-3 w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl">
                                    <span>Send Message</span>
                                    <svg className="w-5 h-5 group-hover/cta:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        {/* Quick Response */}
                        <div className="bg-white/80 backdrop-blur-md border border-white/30 p-6 rounded-2xl text-center shadow-lg">
                            <div className="text-2xl font-bold text-gray-900 mb-2">Quick Response</div>
                            <div className="text-sm text-gray-600 uppercase tracking-wider">Usually within 24 hours</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Contact1;
