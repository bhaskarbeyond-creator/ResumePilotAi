import React from 'react';

const Contact3 = {
    render: ({
        title = "Let's Create Together",
        subtitle = "Ready to bring your vision to life? Let's collaborate on something amazing",
        artistName = 'Your Name',
        email = 'hello@artist.com',
        phone = '+1 (555) 123-4567',
        location = 'New York, NY',
        linkedin = 'https://linkedin.com/in/artist',
        instagram = 'https://instagram.com/artist',
        behance = 'https://behance.net/artist',
        dribbble = 'https://dribbble.com/artist',
        website = 'https://artist.com',
        artfol = 'https://artfol.me/artist',
        accentColor = 'orange',
        backgroundColor = 'warm',
    }) => {
        // Accent color themes
        const accentColors = {
            orange: {
                primary: 'text-orange-500',
                secondary: 'text-orange-400',
                bg: 'bg-orange-500',
                bgGradient: 'bg-gradient-to-r from-orange-400 to-orange-600',
                border: 'border-orange-500',
                card: 'bg-gradient-to-br from-orange-50 to-orange-100',
                tag: 'bg-orange-100 text-orange-800',
                highlight: 'bg-orange-50 border-orange-200',
                glow: 'from-orange-400/20 to-orange-600/20',
                contact: 'bg-orange-50 text-orange-700 border-orange-200',
            },
            purple: {
                primary: 'text-purple-500',
                secondary: 'text-purple-400',
                bg: 'bg-purple-500',
                bgGradient: 'bg-gradient-to-r from-purple-400 to-purple-600',
                border: 'border-purple-500',
                card: 'bg-gradient-to-br from-purple-50 to-purple-100',
                tag: 'bg-purple-100 text-purple-800',
                highlight: 'bg-purple-50 border-purple-200',
                glow: 'from-purple-400/20 to-purple-600/20',
                contact: 'bg-purple-50 text-purple-700 border-purple-200',
            },
            emerald: {
                primary: 'text-emerald-500',
                secondary: 'text-emerald-400',
                bg: 'bg-emerald-500',
                bgGradient: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
                border: 'border-emerald-500',
                card: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
                tag: 'bg-emerald-100 text-emerald-800',
                highlight: 'bg-emerald-50 border-emerald-200',
                glow: 'from-emerald-400/20 to-emerald-600/20',
                contact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            },
            rose: {
                primary: 'text-rose-500',
                secondary: 'text-rose-400',
                bg: 'bg-rose-500',
                bgGradient: 'bg-gradient-to-r from-rose-400 to-rose-600',
                border: 'border-rose-500',
                card: 'bg-gradient-to-br from-rose-50 to-rose-100',
                tag: 'bg-rose-100 text-rose-800',
                highlight: 'bg-rose-50 border-rose-200',
                glow: 'from-rose-400/20 to-rose-600/20',
                contact: 'bg-rose-50 text-rose-700 border-rose-200',
            },
            blue: {
                primary: 'text-blue-500',
                secondary: 'text-blue-400',
                bg: 'bg-blue-500',
                bgGradient: 'bg-gradient-to-r from-blue-400 to-blue-600',
                border: 'border-blue-500',
                card: 'bg-gradient-to-br from-blue-50 to-blue-100',
                tag: 'bg-blue-100 text-blue-800',
                highlight: 'bg-blue-50 border-blue-200',
                glow: 'from-blue-400/20 to-blue-600/20',
                contact: 'bg-blue-50 text-blue-700 border-blue-200',
            },
        };

        // Background themes - optimized for seamless stacking
        const backgroundThemes = {
            warm: 'bg-gradient-to-b from-orange-50 via-yellow-50 to-orange-50',
            cool: 'bg-gradient-to-b from-blue-50 via-indigo-50 to-blue-50',
            neutral: 'bg-gradient-to-b from-gray-50 via-stone-50 to-gray-50',
            fresh: 'bg-gradient-to-b from-emerald-50 via-teal-50 to-emerald-50',
            artistic: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50',
        };

        const currentAccent = accentColors[accentColor] || accentColors.orange;
        const currentBg = backgroundThemes[backgroundColor] || backgroundThemes.warm;

        // Contact methods
        const contactMethods = [
            {
                name: 'Email',
                value: email,
                href: `mailto:${email}`,
                icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                ),
                color: 'from-green-500 to-emerald-500',
            },
            {
                name: 'Phone',
                value: phone,
                href: `tel:${phone}`,
                icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                    </svg>
                ),
                color: 'from-blue-500 to-cyan-500',
            },
            {
                name: 'Location',
                value: location,
                href: null,
                icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                ),
                color: 'from-purple-500 to-pink-500',
            },
        ];

        // Social platforms
        const socialPlatforms = [
            {
                name: 'LinkedIn',
                url: linkedin,
                icon: (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                ),
                color: 'from-blue-600 to-blue-700',
            },
            {
                name: 'Instagram',
                url: instagram,
                icon: (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.017 0C8.396 0 7.989.013 7.041.048 6.094.082 5.48.204 4.955.388a5.42 5.42 0 0 0-1.962.836A5.44 5.44 0 0 0 .388 4.955C.204 5.48.082 6.094.048 7.041.013 7.989 0 8.396 0 12.017s.013 4.028.048 4.976c.034.947.156 1.561.34 2.086a5.44 5.44 0 0 0 .836 1.962 5.42 5.42 0 0 0 1.962.836c.525.184 1.139.306 2.086.34.948.035 1.355.048 4.976.048s4.028-.013 4.976-.048c.947-.034 1.561-.156 2.086-.34a5.42 5.42 0 0 0 1.962-.836 5.44 5.44 0 0 0 .836-1.962c.184-.525.306-1.139.34-2.086.035-.948.048-1.355.048-4.976s-.013-4.028-.048-4.976c-.034-.947-.156-1.561-.34-2.086a5.44 5.44 0 0 0-.836-1.962A5.42 5.42 0 0 0 19.086.388C18.561.204 17.947.082 17 .048 16.052.013 15.645 0 12.017 0zm0 2.16c3.555 0 3.978.013 5.385.048.876.04 1.351.186 1.668.309.42.163.72.358 1.036.674.316.316.511.616.674 1.036.123.317.269.792.309 1.668.035 1.408.048 1.831.048 5.386s-.013 3.978-.048 5.386c-.04.876-.186 1.351-.309 1.668-.163.42-.358.72-.674 1.036a2.784 2.784 0 0 1-1.036.674c-.317.123-.792.269-1.668.309-1.408.035-1.831.048-5.386.048s-3.978-.013-5.386-.048c-.876-.04-1.351-.186-1.668-.309a2.784 2.784 0 0 1-1.036-.674 2.784 2.784 0 0 1-.674-1.036c-.123-.317-.269-.792-.309-1.668C2.173 15.995 2.16 15.572 2.16 12.017s.013-3.978.048-5.386c.04-.876.186-1.351.309-1.668.163-.42.358-.72.674-1.036.316-.316.616-.511 1.036-.674.317-.123.792-.269 1.668-.309C8.04 2.173 8.462 2.16 12.017 2.16zm0 3.477a6.38 6.38 0 1 0 0 12.76 6.38 6.38 0 0 0 0-12.76zm0 10.518a4.14 4.14 0 1 1 0-8.28 4.14 4.14 0 0 1 0 8.28zM19.846 4.267a1.49 1.49 0 1 1-2.98 0 1.49 1.49 0 0 1 2.98 0z" />
                    </svg>
                ),
                color: 'from-pink-500 to-purple-600',
            },
            {
                name: 'Behance',
                url: behance,
                icon: (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M0 7.5v9c0 .8.7 1.5 1.5 1.5H9c3.3 0 6-2.7 6-6s-2.7-6-6-6H1.5C.7 6 0 6.7 0 7.5zM15 4.5h6v1.5h-6V4.5zM9 12c1.7 0 3 1.3 3 3s-1.3 3-3 3H3V9h6c1.7 0 3 1.3 3 3z" />
                        <path d="M19.5 9C17 9 15 11 15 13.5S17 18 19.5 18 24 16 24 13.5 22 9 19.5 9zm0 6c-1.4 0-2.5-1.1-2.5-2.5S18.1 10 19.5 10s2.5 1.1 2.5 2.5S20.9 15 19.5 15z" />
                    </svg>
                ),
                color: 'from-blue-500 to-indigo-600',
            },
            {
                name: 'Dribbble',
                url: dribbble,
                icon: (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.816zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702-1.81-1.61-4.19-2.586-6.795-2.586-.83 0-1.63.1-2.4.285zm10.335 3.483c-.218.29-1.935 2.493-5.724 4.04.24.49.47.985.68 1.486.08.18.15.36.22.53 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.31-6.38z" />
                    </svg>
                ),
                color: 'from-pink-400 to-rose-500',
            },
            {
                name: 'Website',
                url: website,
                icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                        />
                    </svg>
                ),
                color: 'from-gray-600 to-gray-700',
            },
        ];

        // Secure URL validator
        const secureUrl = (url) => {
            if (!url || typeof url !== 'string') return '#';
            const cleaned = url.trim();
            if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return '#';
            if (!cleaned.match(/^https?:\/\//i)) return '#';
            return cleaned;
        };

        return (
            <div className={`min-h-screen py-20 px-4 relative overflow-hidden ${currentBg}`}>
                {/* Artistic Background Elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Paint Splashes */}
                    <div className={`absolute top-20 left-10 w-32 h-32 ${currentAccent.bg} rounded-full opacity-10 blur-xl`}></div>
                    <div className={`absolute top-40 right-20 w-24 h-24 ${currentAccent.secondary.replace('text-', 'bg-')} rounded-full opacity-20 blur-lg`}></div>
                    <div className={`absolute bottom-24 left-1/4 w-32 h-32 ${currentAccent.bg} rounded-full opacity-5 blur-2xl`}></div>

                    {/* Floating Art Elements */}
                    <div className="absolute top-1/4 right-10 transform rotate-12 opacity-20">
                        <div className="w-16 h-20 bg-gradient-to-br from-gray-300 to-gray-400 rounded-sm shadow-lg"></div>
                    </div>
                    <div className="absolute bottom-1/4 left-20 transform -rotate-6 opacity-15">
                        <div className="w-12 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-sm shadow-md"></div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto relative z-10">
                    {/* Header Section */}
                    <div className="text-center mb-16">
                        <div className="mb-6">
                            <h1 className="text-5xl font-bold text-gray-800 mb-2">{title}</h1>
                            <div className={`w-24 h-1 ${currentAccent.bgGradient} mx-auto mb-4`}></div>
                            <p className="text-xl text-gray-600 max-w-2xl mx-auto">{subtitle}</p>
                        </div>

                        {/* Artist Info */}
                        <div className="flex items-center justify-center space-x-3 mb-8">
                            <div className={`w-2 h-2 ${currentAccent.bg} rounded-full`}></div>
                            <span className={`text-lg font-medium ${currentAccent.primary}`}>{artistName}</span>
                            <div className={`w-2 h-2 ${currentAccent.bg} rounded-full`}></div>
                        </div>
                    </div>

                    {/* Contact Content */}
                    <div className="grid lg:grid-cols-2 gap-12 items-start">
                        {/* Contact Information */}
                        <div className="space-y-8">
                            <div className="group relative">
                                {/* Card Glow Effect */}
                                <div className={`absolute -inset-4 bg-gradient-to-r ${currentAccent.glow} rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500`}></div>

                                {/* Main Card */}
                                <div
                                    className={`relative ${currentAccent.card} rounded-3xl border-2 ${
                                        currentAccent.highlight.split(' ')[1]
                                    } shadow-xl p-8 hover:shadow-2xl transition-all duration-500 hover:scale-105 transform`}>
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className={`w-12 h-12 ${currentAccent.bgGradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                                />
                                            </svg>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-800">Contact Information</h3>
                                    </div>

                                    <div className="space-y-6">
                                        {contactMethods.map((method, index) => (
                                            <div key={index} className={`flex items-center gap-4 p-4 ${currentAccent.contact} rounded-2xl border hover:scale-105 transition-all duration-300 group`}>
                                                <div className={`w-10 h-10 bg-gradient-to-r ${method.color} rounded-xl flex items-center justify-center shadow-sm text-white`}>{method.icon}</div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium text-gray-600 mb-1">{method.name}</div>
                                                    {method.href ? (
                                                        <a href={method.href} className={`font-semibold ${currentAccent.primary} hover:underline transition-colors`}>
                                                            {method.value}
                                                        </a>
                                                    ) : (
                                                        <div className="font-semibold text-gray-800">{method.value}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Social Links & CTA */}
                        <div className="space-y-8">
                            {/* Social Media */}
                            <div className="group relative">
                                {/* Card Glow Effect */}
                                <div className={`absolute -inset-4 bg-gradient-to-r ${currentAccent.glow} rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500`}></div>

                                {/* Main Card */}
                                <div
                                    className={`relative ${currentAccent.card} rounded-3xl border-2 ${
                                        currentAccent.highlight.split(' ')[1]
                                    } shadow-xl p-8 hover:shadow-2xl transition-all duration-500 hover:scale-105 transform`}>
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className={`w-12 h-12 ${currentAccent.bgGradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                                />
                                            </svg>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-800">Connect With Me</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {socialPlatforms.map((platform, index) => (
                                            <a
                                                key={index}
                                                href={secureUrl(platform.url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`flex items-center gap-3 p-4 ${currentAccent.contact} rounded-xl border hover:scale-105 transition-all duration-300 group`}>
                                                <div className={`w-8 h-8 bg-gradient-to-r ${platform.color} rounded-lg flex items-center justify-center shadow-sm text-white`}>{platform.icon}</div>
                                                <span className="font-medium text-gray-800">{platform.name}</span>
                                            </a>
                                        ))}
                                    </div>

                                    {/* Call to Action */}
                                    <div className="mt-8 pt-6 border-t border-gray-200">
                                        <div
                                            className={`${currentAccent.bgGradient} text-white p-6 rounded-2xl text-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 transform cursor-pointer`}>
                                            <h4 className="text-lg font-bold mb-2">Ready to Collaborate?</h4>
                                            <p className="text-sm opacity-90 mb-4">Let's discuss your project and create something extraordinary together</p>
                                            <div className="flex items-center justify-center space-x-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                                <span className="text-sm font-medium">Send Message</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Floating Art Palette */}
                    <div className="fixed bottom-8 right-8 opacity-30 hover:opacity-60 transition-opacity duration-300 pointer-events-none">
                        <div className="bg-white rounded-full p-4 shadow-lg">
                            <div className="flex space-x-2">
                                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                                <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                                <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                <div className={`w-3 h-3 ${currentAccent.bg} rounded-full`}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Contact3;
