import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/200x200';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/200x200';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/200x200';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    // Escape any potential HTML/JS in text content
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const Hero1 = {
    fields: {
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        backgroundColor: {
            type: 'select',
            options: [
                { value: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900', label: 'Dark Purple' },
                { value: 'bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900', label: 'Deep Blue' },
                { value: 'bg-gradient-to-br from-emerald-900 via-teal-800 to-green-900', label: 'Deep Green' },
                { value: 'bg-gradient-to-br from-gray-900 via-gray-800 to-black', label: 'Charcoal' },
            ],
        },
    },
    defaultProps: {
        name: 'John Doe',
        title: 'Full Stack Developer',
        description: 'Passionate developer with 5+ years of experience creating amazing web applications and digital solutions.',
        image: 'https://placehold.co/200x200',
        backgroundColor: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
    },
    render: ({ name, title, description, image, backgroundColor }) => (
        <div className={`${backgroundColor} relative min-h-screen`}>
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
            <div className="absolute top-1/4 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-xl animate-pulse delay-1000"></div>

            <div className="relative text-white py-16 px-4 min-h-screen flex items-center">
                <div className="max-w-6xl mx-auto text-center">
                    {/* Profile Image - Cleaned up */}
                    <div className="relative inline-block mb-10">
                        <div className="relative">
                            <img
                                src={SecureUrl.validate(image)}
                                alt={name || 'Profile'}
                                className="w-40 h-40 rounded-full object-cover border-4 border-white/20 shadow-2xl backdrop-blur-sm"
                                onError={(e) => {
                                    e.target.src = 'https://placehold.co/200x200';
                                }}
                            />
                            {/* Status indicator */}
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full border-4 border-white/30 shadow-lg"></div>
                        </div>
                    </div>

                    {/* Name with Enhanced Typography */}
                    <h1 className="text-6xl md:text-7xl lg:text-8xl font-extrabold mb-6 leading-tight">
                        <span className="bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                            <SecureText>{name}</SecureText>
                        </span>
                    </h1>

                    {/* Professional Title - Enhanced */}
                    <div className="mb-10">
                        <div className="inline-flex items-center px-8 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg">
                            <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full mr-4 animate-pulse"></div>
                            <h2 className="text-xl md:text-2xl font-semibold text-white/90">
                                <SecureText>{title}</SecureText>
                            </h2>
                        </div>
                    </div>

                    {/* Description - Enhanced */}
                    <p className="text-xl md:text-2xl text-white/80 max-w-4xl mx-auto leading-relaxed mb-14 font-light">
                        <SecureText>{description}</SecureText>
                    </p>

                    {/* Call to Action Buttons - Enhanced */}
                    <div className="flex flex-wrap justify-center gap-6 mb-16">
                        <button className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30 overflow-hidden">
                            <span className="relative z-10 flex items-center gap-3">
                                View Portfolio
                                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </button>
                        <button className="px-10 py-5 border-2 border-white/30 text-white rounded-2xl font-bold text-lg hover:bg-white/10 hover:border-white/50 transition-all duration-300 backdrop-blur-sm">
                            Contact Me
                        </button>
                    </div>

                    {/* Scroll Indicator - Enhanced */}
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
                        <div className="flex flex-col items-center text-white/50">
                            <span className="text-sm font-medium mb-3 uppercase tracking-wide">Scroll</span>
                            <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
                                <div className="w-1 h-3 bg-white/40 rounded-full mt-2 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Hero1;
