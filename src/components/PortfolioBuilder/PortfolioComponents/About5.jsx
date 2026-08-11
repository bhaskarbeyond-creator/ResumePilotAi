import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Artist+Image';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Artist+Image';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Artist+Image';
        return cleaned;
    },
    validateResume: (url) => {
        if (typeof url !== 'string') return null;
        const cleaned = url.trim();
        // Only allow same-domain resume URLs with /shared/ pattern
        if (/^\/shared\/[a-zA-Z0-9\-_]+$/.test(cleaned)) return cleaned;
        return null;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const About5 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        content: { type: 'textarea', label: 'Artist Bio' },
        studioImage: { type: 'text', label: 'Studio/Workspace Image URL' },
        processImage1: { type: 'text', label: 'Process Image 1 URL' },
        processImage2: { type: 'text', label: 'Process Image 2 URL' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50', label: 'Warm Canvas' },
                { value: 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50', label: 'Cool Palette' },
                { value: 'bg-gradient-to-br from-gray-50 via-white to-stone-50', label: 'Neutral Studio' },
                { value: 'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50', label: 'Fresh Green' },
                { value: 'bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50', label: 'Artistic Pink' },
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
        // Artist-specific fields
        artisticMediums: {
            type: 'array',
            label: 'Artistic Mediums',
            getItemSummary: (item) => item.medium,
            arrayFields: {
                medium: { type: 'text', label: 'Medium' },
                experience: { type: 'text', label: 'Experience Level' },
            },
            defaultItemProps: {
                medium: 'Digital Art',
                experience: 'Expert',
            },
        },
        yearsActive: { type: 'text', label: 'Years Active' },
        artworkCount: { type: 'text', label: 'Artworks Created' },
        exhibitionsCount: { type: 'text', label: 'Exhibitions' },
        resumeUrl: { type: 'text', label: 'Resume URL (format: /shared/resumeId)' },
        showCTA: {
            type: 'radio',
            label: 'Show Call-to-Action Buttons',
            options: [
                { label: 'Show', value: true },
                { label: 'Hide', value: false },
            ],
        },
    },
    defaultProps: {
        title: 'About My Art',
        content:
            'My artistic journey began with a fascination for color and form. I specialize in contemporary visual art, blending traditional techniques with modern digital approaches. Each piece I create tells a story, exploring themes of identity, nature, and human connection. My work has been featured in galleries worldwide, and I continue to push the boundaries of creative expression.',
        studioImage: 'https://placehold.co/500x600/8B5CF6/FFFFFF?text=Artist+Studio',
        processImage1: 'https://placehold.co/300x300/EF4444/FFFFFF?text=Art+Process',
        processImage2: 'https://placehold.co/300x300/10B981/FFFFFF?text=Creative+Tools',
        backgroundColor: 'warm',
        accentColor: 'orange',
        artisticMediums: [
            { medium: 'Digital Art', experience: 'Expert' },
            { medium: 'Oil Painting', experience: 'Advanced' },
            { medium: 'Mixed Media', experience: 'Intermediate' },
            { medium: 'Photography', experience: 'Advanced' },
        ],
        yearsActive: '8+',
        artworkCount: '150+',
        exhibitionsCount: '25',
        resumeUrl: '/shared/artist-resume',
        showCTA: true,
    },
    render: ({ title, content, studioImage, processImage1, processImage2, backgroundColor, accentColor, artisticMediums, yearsActive, artworkCount, exhibitionsCount, resumeUrl, showCTA = true }) => {
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

        // Background themes - optimized for seamless stacking
        const backgroundThemes = {
            warm: 'bg-gradient-to-b from-orange-50 via-yellow-50 to-orange-50',
            cool: 'bg-gradient-to-b from-blue-50 via-indigo-50 to-blue-50',
            neutral: 'bg-gradient-to-b from-gray-50 via-stone-50 to-gray-50',
            fresh: 'bg-gradient-to-b from-emerald-50 via-teal-50 to-emerald-50',
            artistic: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-50',
        };

        const theme = colorThemes[accentColor] || colorThemes.orange;
        const currentBg = backgroundThemes[backgroundColor] || backgroundThemes.warm;

        return (
            <div className={`${currentBg} relative py-24 px-6`}>
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
                    {/* Section Title */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.light} border ${theme.border} rounded-2xl shadow-lg mb-8`}>
                            <svg className={`w-5 h-5 ${theme.secondary} mr-3`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
                                />
                            </svg>
                            <span className={`text-sm font-semibold ${theme.secondary} uppercase tracking-wider`}>My Artistic Journey</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-4">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </h2>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-16 items-start">
                        {/* Left Column - Artist Story & Stats */}
                        <div className="space-y-8">
                            {/* Artist Story */}
                            <div className="relative">
                                <div className={`absolute -inset-4 bg-gradient-to-r ${theme.primary} opacity-10 rounded-2xl blur-xl`}></div>
                                <div className="relative bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-white/50 shadow-2xl">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className={`w-12 h-12 bg-gradient-to-r ${theme.primary} rounded-xl flex items-center justify-center shadow-lg`}>
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-semibold text-gray-900 mb-2">My Creative Story</h3>
                                            <div className={`h-1 bg-gradient-to-r ${theme.primary} rounded-full w-16`}></div>
                                        </div>
                                    </div>
                                    <p className="text-lg text-gray-700 leading-relaxed">
                                        <SecureText className="text-gray-700">{content}</SecureText>
                                    </p>
                                </div>
                            </div>

                            {/* Artist Stats */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-3xl font-bold ${theme.secondary} mb-2`}>{yearsActive}</div>
                                    <div className="text-sm text-gray-600 uppercase tracking-wider">Years Active</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-3xl font-bold ${theme.secondary} mb-2`}>{artworkCount}</div>
                                    <div className="text-sm text-gray-600 uppercase tracking-wider">Artworks</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-3xl font-bold ${theme.secondary} mb-2`}>{exhibitionsCount}</div>
                                    <div className="text-sm text-gray-600 uppercase tracking-wider">Exhibitions</div>
                                </div>
                            </div>

                            {/* Artistic Mediums */}
                            <div className="relative">
                                <div className={`absolute -inset-4 bg-gradient-to-r ${theme.primary} opacity-10 rounded-2xl blur-xl`}></div>
                                <div className="relative bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-white/50 shadow-2xl">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className={`w-12 h-12 bg-gradient-to-r ${theme.primary} rounded-xl flex items-center justify-center shadow-lg`}>
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-semibold text-gray-900 mb-2">Artistic Mediums</h3>
                                            <div className={`h-1 bg-gradient-to-r ${theme.primary} rounded-full w-16`}></div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {artisticMediums &&
                                            artisticMediums.map((item, index) => (
                                                <div key={index} className="group relative">
                                                    <div
                                                        className={`absolute -inset-1 bg-gradient-to-r ${theme.primary} opacity-20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                                                    <div className="relative bg-white/60 backdrop-blur-sm border border-white/30 p-4 rounded-xl hover:bg-white/80 transition-all duration-300 cursor-pointer">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-3 h-3 bg-gradient-to-r ${theme.primary} rounded-full`}></div>
                                                                <span className="text-gray-800 font-medium">
                                                                    <SecureText className="text-gray-800">{item.medium || 'Medium'}</SecureText>
                                                                </span>
                                                            </div>
                                                            <span className={`text-sm ${theme.secondary} font-semibold`}>
                                                                <SecureText className={theme.secondary}>{item.experience || 'Beginner'}</SecureText>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {/* Call to Action */}
                            {showCTA && (
                                <div className="flex flex-wrap gap-4">
                                    {SecureUrl.validateResume(resumeUrl) && (
                                        <button
                                            onClick={() => {
                                                const validUrl = SecureUrl.validateResume(resumeUrl);
                                                if (validUrl) {
                                                    window.open(validUrl, '_blank', 'noopener,noreferrer');
                                                }
                                            }}
                                            className={`px-8 py-4 bg-gradient-to-r ${theme.primary} text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl ${theme.hover} transition-all duration-300 transform hover:scale-105 flex items-center gap-2`}>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                            Download CV
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Column - Studio & Process Images */}
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-bold text-gray-900 mb-2">Behind the Scenes</h3>
                                <p className="text-gray-600">My creative space and artistic process</p>
                            </div>

                            {/* Studio Image */}
                            <div className="relative">
                                <div className="relative transform -rotate-1 hover:rotate-0 transition-transform duration-500">
                                    <img
                                        src={SecureUrl.validate(studioImage)}
                                        alt="Artist Studio"
                                        className="w-full h-80 object-cover rounded-2xl shadow-2xl border-4 border-white"
                                        onError={(e) => {
                                            e.target.src = 'https://placehold.co/500x600/8B5CF6/FFFFFF?text=Artist+Studio';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg">
                                            <p className="text-sm font-semibold text-gray-800">My Creative Studio</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Process Images */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative transform rotate-1 hover:rotate-0 transition-transform duration-500">
                                    <img
                                        src={SecureUrl.validate(processImage1)}
                                        alt="Creative Process"
                                        className="w-full h-48 object-cover rounded-xl shadow-lg border-4 border-white"
                                        onError={(e) => {
                                            e.target.src = 'https://placehold.co/300x300/EF4444/FFFFFF?text=Art+Process';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl"></div>
                                </div>
                                <div className="relative transform -rotate-1 hover:rotate-0 transition-transform duration-500">
                                    <img
                                        src={SecureUrl.validate(processImage2)}
                                        alt="Creative Tools"
                                        className="w-full h-48 object-cover rounded-xl shadow-lg border-4 border-white"
                                        onError={(e) => {
                                            e.target.src = 'https://placehold.co/300x300/10B981/FFFFFF?text=Creative+Tools';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl"></div>
                                </div>
                            </div>

                            {/* Floating Art Palette */}
                            <div className="absolute -top-4 -right-4 z-10">
                                <div className="relative">
                                    <div className="w-16 h-16 bg-white rounded-full shadow-xl border-4 border-gray-200 flex items-center justify-center">
                                        <div className="grid grid-cols-2 gap-1">
                                            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                                            <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                            <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                                            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default About5;
