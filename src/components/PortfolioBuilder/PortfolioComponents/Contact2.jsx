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

const Contact2 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
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
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        location: { type: 'text', label: 'Location' },
        linkedin: { type: 'text', label: 'LinkedIn URL' },
        twitter: { type: 'text', label: 'Twitter URL' },
        github: { type: 'text', label: 'GitHub URL' },
        website: { type: 'text', label: 'Website URL (Optional)' },
    },
    defaultProps: {
        title: "Let's Work Together",
        subtitle: "Have a project in mind? Let's discuss how we can bring your ideas to life and create something extraordinary.",
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
        email: 'hello@johndoe.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        linkedin: 'https://linkedin.com/in/johndoe',
        twitter: 'https://twitter.com/johndoe',
        github: 'https://github.com/johndoe',
        website: 'https://johndoe.com',
    },
    render: ({ title, subtitle, backgroundColor, email, phone, location, linkedin, twitter, github, website }) => (
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
                            <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Contact</span>
                        </div>
                        <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                        <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">Collaborate</span>
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

                <div className="grid lg:grid-cols-2 gap-12">
                    {/* Contact Form */}
                    <div className="group relative">
                        {/* Card Glow Effect */}
                        <div className="absolute -inset-4 bg-gradient-to-r from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>

                        {/* Main Form Card */}
                        <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 hover:bg-white/80 transition-all duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-black text-gray-900">Send Message</h3>
                            </div>

                            <form className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-3">Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-6 py-4 bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-gray-900 placeholder-gray-500 shadow-sm"
                                            placeholder="Your full name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-3">Email</label>
                                        <input
                                            type="email"
                                            className="w-full px-6 py-4 bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-gray-900 placeholder-gray-500 shadow-sm"
                                            placeholder="your@email.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Subject</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-gray-900 placeholder-gray-500 shadow-sm"
                                        placeholder="What's this about?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Message</label>
                                    <textarea
                                        rows="5"
                                        className="w-full px-6 py-4 bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-gray-900 placeholder-gray-500 shadow-sm resize-none"
                                        placeholder="Tell me about your project, goals, and how we can work together..."></textarea>
                                </div>
                                <button
                                    type="submit"
                                    className="group/btn w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-3">
                                    <span>Send Message</span>
                                    <svg className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Contact Info & Social */}
                    <div className="space-y-8">
                        {/* Contact Information */}
                        <div className="group relative">
                            {/* Card Glow Effect */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-purple-200/30 via-cyan-200/20 to-blue-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>

                            {/* Main Card */}
                            <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 hover:bg-white/80 transition-all duration-500">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-900">Contact Information</h3>
                                </div>

                                <div className="space-y-6">
                                    {/* Email */}
                                    <div className="flex items-center gap-4 p-4 bg-white/50 rounded-2xl border border-white/40 hover:bg-white/70 transition-all duration-300">
                                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600 font-medium uppercase tracking-wide">Email</div>
                                            <a href={`mailto:${email}`} className="text-gray-900 font-bold hover:text-blue-700 transition-colors">
                                                <SecureText className="text-gray-900">{email}</SecureText>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="flex items-center gap-4 p-4 bg-white/50 rounded-2xl border border-white/40 hover:bg-white/70 transition-all duration-300">
                                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm text-gray-600 font-medium uppercase tracking-wide">Phone</div>
                                            <a href={`tel:${phone}`} className="text-gray-900 font-bold hover:text-blue-700 transition-colors">
                                                <SecureText className="text-gray-900">{phone}</SecureText>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div className="flex items-center gap-4 p-4 bg-white/50 rounded-2xl border border-white/40 hover:bg-white/70 transition-all duration-300">
                                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                            <div className="text-sm text-gray-600 font-medium uppercase tracking-wide">Location</div>
                                            <div className="text-gray-900 font-bold">
                                                <SecureText className="text-gray-900">{location}</SecureText>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Social Media */}
                        <div className="group relative">
                            {/* Card Glow Effect */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-200/30 via-blue-200/20 to-purple-200/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>

                            {/* Main Card */}
                            <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 hover:bg-white/80 transition-all duration-500">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-900">Follow Me</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* LinkedIn */}
                                    <a
                                        href={SecureUrl.validate(linkedin)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social flex flex-col items-center p-6 bg-white/50 rounded-2xl border border-white/40 hover:bg-blue-50 hover:border-blue-200 transition-all duration-300 hover:scale-105 shadow-sm">
                                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg mb-3 group-hover/social:bg-blue-700 transition-colors">
                                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-bold text-gray-900 text-center">LinkedIn</div>
                                        <div className="text-xs text-gray-600 text-center">Professional</div>
                                    </a>

                                    {/* GitHub */}
                                    <a
                                        href={SecureUrl.validate(github)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social flex flex-col items-center p-6 bg-white/50 rounded-2xl border border-white/40 hover:bg-gray-50 hover:border-gray-200 transition-all duration-300 hover:scale-105 shadow-sm">
                                        <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg mb-3 group-hover/social:bg-gray-900 transition-colors">
                                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-bold text-gray-900 text-center">GitHub</div>
                                        <div className="text-xs text-gray-600 text-center">Code</div>
                                    </a>

                                    {/* Twitter */}
                                    <a
                                        href={SecureUrl.validate(twitter)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social flex flex-col items-center p-6 bg-white/50 rounded-2xl border border-white/40 hover:bg-blue-50 hover:border-blue-200 transition-all duration-300 hover:scale-105 shadow-sm">
                                        <div className="w-12 h-12 bg-blue-400 rounded-xl flex items-center justify-center shadow-lg mb-3 group-hover/social:bg-blue-500 transition-colors">
                                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-bold text-gray-900 text-center">Twitter</div>
                                        <div className="text-xs text-gray-600 text-center">Updates</div>
                                    </a>

                                    {/* Website */}
                                    {website && (
                                        <a
                                            href={SecureUrl.validate(website)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group/social flex flex-col items-center p-6 bg-white/50 rounded-2xl border border-white/40 hover:bg-purple-50 hover:border-purple-200 transition-all duration-300 hover:scale-105 shadow-sm">
                                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-3 group-hover/social:bg-purple-700 transition-colors">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-sm font-bold text-gray-900 text-center">Website</div>
                                            <div className="text-xs text-gray-600 text-center">Portfolio</div>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Response Time */}
                        <div className="relative">
                            <div className="absolute -inset-2 bg-gradient-to-r from-green-200/30 to-emerald-200/30 rounded-2xl blur-lg"></div>
                            <div className="relative bg-white/70 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/50 text-center">
                                <div className="flex items-center justify-center gap-3 mb-2">
                                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                    <div className="text-xl font-black text-gray-900">Quick Response</div>
                                </div>
                                <div className="text-sm text-gray-600 font-medium">Usually within 24 hours</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Contact2;
