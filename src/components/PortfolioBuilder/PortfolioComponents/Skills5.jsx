import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Skill+Demo';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Skill+Demo';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Skill+Demo';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Skills5 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
        skillDemoImage: { type: 'text', label: 'Skill Demo/Artwork Image URL' },
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
        skills: {
            type: 'array',
            label: 'Artistic Skills',
            getItemSummary: (item) => `${item.name} - ${item.level}%`,
            arrayFields: {
                name: { type: 'text', label: 'Skill Name' },
                level: { type: 'number', label: 'Skill Level (%)' },
                category: {
                    type: 'select',
                    label: 'Category',
                    options: [
                        { value: 'digital', label: 'Digital Art' },
                        { value: 'traditional', label: 'Traditional Art' },
                        { value: 'design', label: 'Design' },
                        { value: 'software', label: 'Software' },
                        { value: 'photography', label: 'Photography' },
                        { value: 'other', label: 'Other' },
                    ],
                },
                icon: { type: 'text', label: 'Icon/Emoji' },
                demoImage: { type: 'text', label: 'Demo Image URL (Optional)' },
            },
            defaultItemProps: {
                name: 'Digital Painting',
                level: 85,
                category: 'digital',
                icon: '🎨',
                demoImage: '',
            },
        },
    },
    defaultProps: {
        title: 'Artistic Skills',
        subtitle: 'Creative abilities and technical expertise in various art forms',
        skillDemoImage: 'https://placehold.co/500x600/8B5CF6/FFFFFF?text=Skill+Showcase',
        backgroundColor: 'warm',
        accentColor: 'orange',
        skills: [
            { name: 'Digital Painting', level: 95, category: 'digital', icon: '🎨', demoImage: 'https://placehold.co/300x300/8B5CF6/FFFFFF?text=Digital+Art' },
            { name: 'Oil Painting', level: 85, category: 'traditional', icon: '🖌️', demoImage: 'https://placehold.co/300x300/EF4444/FFFFFF?text=Oil+Paint' },
            { name: 'Photoshop', level: 90, category: 'software', icon: '💎', demoImage: 'https://placehold.co/300x300/06B6D4/FFFFFF?text=Photoshop' },
            { name: 'Illustration', level: 88, category: 'design', icon: '✏️', demoImage: 'https://placehold.co/300x300/10B981/FFFFFF?text=Illustration' },
            { name: 'Photography', level: 80, category: 'photography', icon: '📸', demoImage: 'https://placehold.co/300x300/F59E0B/FFFFFF?text=Photography' },
            { name: 'Mixed Media', level: 75, category: 'traditional', icon: '🏛️', demoImage: 'https://placehold.co/300x300/EC4899/FFFFFF?text=Mixed+Media' },
            { name: 'Adobe Illustrator', level: 85, category: 'software', icon: '🔶', demoImage: 'https://placehold.co/300x300/F97316/FFFFFF?text=Illustrator' },
            { name: 'Concept Art', level: 82, category: 'design', icon: '🚀', demoImage: 'https://placehold.co/300x300/A855F7/FFFFFF?text=Concept+Art' },
        ],
    },
    render: ({ title, subtitle, skillDemoImage, backgroundColor, accentColor, skills }) => {
        const colorThemes = {
            orange: {
                primary: 'from-orange-500 to-red-500',
                secondary: 'text-orange-600',
                accent: 'bg-orange-500',
                border: 'border-orange-200',
                ring: 'ring-orange-200',
                hover: 'hover:bg-orange-600',
                light: 'bg-orange-50',
                categoryColors: {
                    digital: 'bg-orange-100 text-orange-800 border-orange-200',
                    traditional: 'bg-red-100 text-red-800 border-red-200',
                    design: 'bg-amber-100 text-amber-800 border-amber-200',
                    software: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                    photography: 'bg-orange-100 text-orange-800 border-orange-200',
                    other: 'bg-gray-100 text-gray-800 border-gray-200',
                },
            },
            purple: {
                primary: 'from-purple-500 to-violet-500',
                secondary: 'text-purple-600',
                accent: 'bg-purple-500',
                border: 'border-purple-200',
                ring: 'ring-purple-200',
                hover: 'hover:bg-purple-600',
                light: 'bg-purple-50',
                categoryColors: {
                    digital: 'bg-purple-100 text-purple-800 border-purple-200',
                    traditional: 'bg-violet-100 text-violet-800 border-violet-200',
                    design: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                    software: 'bg-blue-100 text-blue-800 border-blue-200',
                    photography: 'bg-purple-100 text-purple-800 border-purple-200',
                    other: 'bg-gray-100 text-gray-800 border-gray-200',
                },
            },
            emerald: {
                primary: 'from-emerald-500 to-green-500',
                secondary: 'text-emerald-600',
                accent: 'bg-emerald-500',
                border: 'border-emerald-200',
                ring: 'ring-emerald-200',
                hover: 'hover:bg-emerald-600',
                light: 'bg-emerald-50',
                categoryColors: {
                    digital: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    traditional: 'bg-green-100 text-green-800 border-green-200',
                    design: 'bg-teal-100 text-teal-800 border-teal-200',
                    software: 'bg-cyan-100 text-cyan-800 border-cyan-200',
                    photography: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    other: 'bg-gray-100 text-gray-800 border-gray-200',
                },
            },
            rose: {
                primary: 'from-rose-500 to-pink-500',
                secondary: 'text-rose-600',
                accent: 'bg-rose-500',
                border: 'border-rose-200',
                ring: 'ring-rose-200',
                hover: 'hover:bg-rose-600',
                light: 'bg-rose-50',
                categoryColors: {
                    digital: 'bg-rose-100 text-rose-800 border-rose-200',
                    traditional: 'bg-pink-100 text-pink-800 border-pink-200',
                    design: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
                    software: 'bg-purple-100 text-purple-800 border-purple-200',
                    photography: 'bg-rose-100 text-rose-800 border-rose-200',
                    other: 'bg-gray-100 text-gray-800 border-gray-200',
                },
            },
            blue: {
                primary: 'from-blue-500 to-indigo-500',
                secondary: 'text-blue-600',
                accent: 'bg-blue-500',
                border: 'border-blue-200',
                ring: 'ring-blue-200',
                hover: 'hover:bg-blue-600',
                light: 'bg-blue-50',
                categoryColors: {
                    digital: 'bg-blue-100 text-blue-800 border-blue-200',
                    traditional: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                    design: 'bg-violet-100 text-violet-800 border-violet-200',
                    software: 'bg-purple-100 text-purple-800 border-purple-200',
                    photography: 'bg-blue-100 text-blue-800 border-blue-200',
                    other: 'bg-gray-100 text-gray-800 border-gray-200',
                },
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
                    {/* Paint Splashes */}
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
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 ${theme.light} border ${theme.border} rounded-2xl shadow-lg mb-8`}>
                            <svg className={`w-5 h-5 ${theme.secondary} mr-3`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                />
                            </svg>
                            <span className={`text-sm font-semibold ${theme.secondary} uppercase tracking-wider`}>Creative Expertise</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-4">
                            <SecureText className="text-gray-900">{title}</SecureText>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                                <SecureText className="text-gray-600">{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    <div className="grid lg:grid-cols-3 gap-12 items-start">
                        {/* Left Column - Featured Skill Demo */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-bold text-gray-900 mb-2">Skills in Action</h3>
                                <p className="text-gray-600">See my abilities at work</p>
                            </div>

                            {/* Main Demo Image */}
                            <div className="relative">
                                <div className="relative transform -rotate-2 hover:rotate-0 transition-transform duration-500">
                                    <img
                                        src={SecureUrl.validate(skillDemoImage)}
                                        alt="Skill Showcase"
                                        className="w-full h-80 object-cover rounded-2xl shadow-2xl border-4 border-white"
                                        onError={(e) => {
                                            e.target.src = 'https://placehold.co/500x600/8B5CF6/FFFFFF?text=Skill+Showcase';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl"></div>
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg">
                                            <p className="text-sm font-semibold text-gray-800">Featured Work</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Skill Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>{skills?.length || 0}</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Skills</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>{skills?.filter((skill) => skill.level >= 85).length || 0}</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Expert</div>
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

                        {/* Right Column - Skills Grid */}
                        <div className="lg:col-span-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {skills &&
                                    skills.map((skill, index) => (
                                        <div key={index} className="group relative">
                                            {/* Card Glow Effect */}
                                            <div
                                                className={`absolute -inset-3 bg-gradient-to-r ${theme.primary} opacity-10 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500`}></div>

                                            {/* Main Card */}
                                            <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/50 hover:bg-white/90 transition-all duration-500 group-hover:scale-105">
                                                {/* Skill Demo Image */}
                                                {skill.demoImage && (
                                                    <div className="mb-4">
                                                        <img
                                                            src={SecureUrl.validate(skill.demoImage)}
                                                            alt={skill.name}
                                                            className="w-full h-24 object-cover rounded-lg"
                                                            onError={(e) => {
                                                                e.target.src = `https://placehold.co/300x100/${
                                                                    accentColor === 'orange'
                                                                        ? 'F59E0B'
                                                                        : accentColor === 'purple'
                                                                        ? '8B5CF6'
                                                                        : accentColor === 'emerald'
                                                                        ? '10B981'
                                                                        : accentColor === 'rose'
                                                                        ? 'EC4899'
                                                                        : '3B82F6'
                                                                }/FFFFFF?text=${encodeURIComponent(skill.name)}`;
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {/* Icon & Category */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 bg-gradient-to-r ${theme.primary} rounded-xl flex items-center justify-center shadow-lg`}>
                                                            {skill.icon ? (
                                                                <span className="text-lg">{skill.icon}</span>
                                                            ) : (
                                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={2}
                                                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                                    />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-gray-900 text-lg">
                                                                <SecureText className="text-gray-900">{skill.name}</SecureText>
                                                            </h3>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${theme.categoryColors[skill.category] || theme.categoryColors.other}`}>
                                                        {skill.category?.charAt(0).toUpperCase() + skill.category?.slice(1) || 'Other'}
                                                    </span>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="mb-4">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-sm font-medium text-gray-600">Proficiency</span>
                                                        <span className="text-sm font-bold text-gray-700">{skill.level}%</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                                                        <div
                                                            className={`bg-gradient-to-r ${theme.primary} h-3 rounded-full transition-all duration-1000 ease-out shadow-sm relative overflow-hidden`}
                                                            style={{ width: `${skill.level || 0}%` }}>
                                                            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse"></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Skill Level Badge */}
                                                <div className="text-center">
                                                    <span
                                                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                                            skill.level >= 90
                                                                ? 'bg-green-100 text-green-800'
                                                                : skill.level >= 75
                                                                ? 'bg-blue-100 text-blue-800'
                                                                : skill.level >= 60
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {skill.level >= 90 ? 'Expert' : skill.level >= 75 ? 'Advanced' : skill.level >= 60 ? 'Intermediate' : 'Beginner'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                            </div>

                            {/* Overall Stats */}
                            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>{(skills?.reduce((avg, skill) => avg + (skill.level || 0), 0) / (skills?.length || 1)) | 0}%</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Average</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>{skills?.filter((skill) => skill.category === 'digital').length || 0}</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Digital</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>{skills?.filter((skill) => skill.category === 'traditional').length || 0}</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Traditional</div>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 rounded-xl text-center hover:bg-white/90 transition-all duration-300 shadow-lg">
                                    <div className={`text-2xl font-bold ${theme.secondary} mb-1`}>8+</div>
                                    <div className="text-xs text-gray-600 uppercase tracking-wider">Years</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Skills5;
