import React from 'react';

const Experience5 = {
    render: ({
        title = 'My Artistic Journey',
        subtitle = 'Explore my professional experience and creative milestones',
        artistName = 'Your Name',
        experiences = [],
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
                timeline: 'bg-gradient-to-b from-orange-400 to-orange-600',
                timelineDot: 'bg-orange-500 border-orange-200',
                highlight: 'bg-orange-50 border-orange-200',
                card: 'bg-gradient-to-br from-orange-50 to-orange-100',
                tag: 'bg-orange-100 text-orange-800',
                achievement: 'bg-orange-50 text-orange-700',
            },
            purple: {
                primary: 'text-purple-500',
                secondary: 'text-purple-400',
                bg: 'bg-purple-500',
                bgGradient: 'bg-gradient-to-r from-purple-400 to-purple-600',
                border: 'border-purple-500',
                timeline: 'bg-gradient-to-b from-purple-400 to-purple-600',
                timelineDot: 'bg-purple-500 border-purple-200',
                highlight: 'bg-purple-50 border-purple-200',
                card: 'bg-gradient-to-br from-purple-50 to-purple-100',
                tag: 'bg-purple-100 text-purple-800',
                achievement: 'bg-purple-50 text-purple-700',
            },
            emerald: {
                primary: 'text-emerald-500',
                secondary: 'text-emerald-400',
                bg: 'bg-emerald-500',
                bgGradient: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
                border: 'border-emerald-500',
                timeline: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
                timelineDot: 'bg-emerald-500 border-emerald-200',
                highlight: 'bg-emerald-50 border-emerald-200',
                card: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
                tag: 'bg-emerald-100 text-emerald-800',
                achievement: 'bg-emerald-50 text-emerald-700',
            },
            rose: {
                primary: 'text-rose-500',
                secondary: 'text-rose-400',
                bg: 'bg-rose-500',
                bgGradient: 'bg-gradient-to-r from-rose-400 to-rose-600',
                border: 'border-rose-500',
                timeline: 'bg-gradient-to-b from-rose-400 to-rose-600',
                timelineDot: 'bg-rose-500 border-rose-200',
                highlight: 'bg-rose-50 border-rose-200',
                card: 'bg-gradient-to-br from-rose-50 to-rose-100',
                tag: 'bg-rose-100 text-rose-800',
                achievement: 'bg-rose-50 text-rose-700',
            },
            blue: {
                primary: 'text-blue-500',
                secondary: 'text-blue-400',
                bg: 'bg-blue-500',
                bgGradient: 'bg-gradient-to-r from-blue-400 to-blue-600',
                border: 'border-blue-500',
                timeline: 'bg-gradient-to-b from-blue-400 to-blue-600',
                timelineDot: 'bg-blue-500 border-blue-200',
                highlight: 'bg-blue-50 border-blue-200',
                card: 'bg-gradient-to-br from-blue-50 to-blue-100',
                tag: 'bg-blue-100 text-blue-800',
                achievement: 'bg-blue-50 text-blue-700',
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

        // Default experiences for display
        const defaultExperiences = [
            {
                position: 'Lead Digital Artist',
                company: 'Creative Studio Pro',
                type: 'Full-time',
                location: 'New York, NY',
                startDate: 'Jan 2022',
                endDate: 'Present',
                description:
                    'Leading a team of digital artists in creating compelling visual narratives for high-profile clients. Managing multiple projects while maintaining creative vision and meeting tight deadlines.',
                achievements: [
                    { achievement: 'Increased client satisfaction by 40% through innovative artistic approaches' },
                    { achievement: 'Led the creation of award-winning digital art campaigns' },
                    { achievement: 'Mentored 8 junior artists in advanced digital techniques' },
                ],
                skills: 'Photoshop, Illustrator, Procreate, Digital Painting, Team Leadership',
                category: 'Digital Art',
                projectImage: 'https://placehold.co/400x250/8B5CF6/FFFFFF?text=Digital+Campaign',
            },
            {
                position: 'Freelance Mixed Media Artist',
                company: 'Independent',
                type: 'Freelance',
                location: 'Remote',
                startDate: 'Mar 2020',
                endDate: 'Dec 2021',
                description: 'Created custom artwork for private collectors and small businesses. Specialized in mixed media pieces combining traditional and digital techniques.',
                achievements: [
                    { achievement: 'Completed 50+ commissioned artworks' },
                    { achievement: 'Established recurring client base of 20+ collectors' },
                    { achievement: 'Featured in 3 local art exhibitions' },
                ],
                skills: 'Mixed Media, Oil Painting, Digital Art, Client Relations',
                category: 'Traditional Art',
                projectImage: 'https://placehold.co/400x250/10B981/FFFFFF?text=Mixed+Media',
            },
            {
                position: 'Art Director',
                company: 'Boutique Design Agency',
                type: 'Full-time',
                location: 'Los Angeles, CA',
                startDate: 'Jun 2018',
                endDate: 'Feb 2020',
                description: 'Directed creative vision for brand identity projects and marketing campaigns. Collaborated with clients to translate their vision into compelling visual stories.',
                achievements: [
                    { achievement: 'Delivered 25+ successful brand identity projects' },
                    { achievement: 'Improved project delivery time by 30%' },
                    { achievement: 'Won 2 regional design awards' },
                ],
                skills: 'Brand Identity, Creative Direction, Adobe Creative Suite, Project Management',
                category: 'Design',
                projectImage: 'https://placehold.co/400x250/EF4444/FFFFFF?text=Brand+Identity',
            },
        ];

        const displayExperiences = experiences.length > 0 ? experiences : defaultExperiences;

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

                    {/* Timeline Section */}
                    <div className="relative">
                        {/* Main Timeline Line */}
                        <div className={`absolute left-8 top-0 bottom-0 w-1 ${currentAccent.timeline} rounded-full shadow-lg`}></div>

                        <div className="space-y-12">
                            {displayExperiences.map((exp, index) => (
                                <div key={index} className="relative pl-20">
                                    {/* Timeline Dot */}
                                    <div className={`absolute left-4 w-8 h-8 ${currentAccent.timelineDot} rounded-full border-4 shadow-lg z-10 flex items-center justify-center`}>
                                        <div className={`w-2 h-2 ${currentAccent.bg} rounded-full`}></div>
                                    </div>

                                    {/* Experience Card */}
                                    <div
                                        className={`${currentAccent.card} rounded-2xl p-8 border-2 ${
                                            currentAccent.highlight.split(' ')[1]
                                        } shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 transform group`}>
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                            {/* Main Content */}
                                            <div className="lg:col-span-2">
                                                {/* Header */}
                                                <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6">
                                                    <div className="flex-1">
                                                        <h3 className="text-2xl font-bold text-gray-800 mb-2">{exp.position}</h3>
                                                        <div className="flex items-center space-x-3 mb-2">
                                                            <h4 className={`text-xl font-semibold ${currentAccent.primary}`}>{exp.company}</h4>
                                                            {exp.type && <span className={`px-3 py-1 rounded-full text-sm font-medium ${currentAccent.tag}`}>{exp.type}</span>}
                                                        </div>
                                                        <p className="text-gray-600 mb-2">{exp.location}</p>
                                                    </div>
                                                    <div className="mt-2 md:mt-0 flex flex-col items-start md:items-end">
                                                        <span className={`${currentAccent.bgGradient} text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg mb-2`}>
                                                            {exp.startDate} - {exp.endDate}
                                                        </span>
                                                        {exp.category && <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentAccent.tag}`}>{exp.category}</span>}
                                                    </div>
                                                </div>

                                                {/* Description */}
                                                <p className="text-gray-700 mb-6 leading-relaxed">{exp.description}</p>

                                                {/* Achievements */}
                                                {exp.achievements && exp.achievements.length > 0 && (
                                                    <div className="mb-6">
                                                        <h5 className="font-bold text-gray-800 mb-3 flex items-center">
                                                            <div className={`w-2 h-2 ${currentAccent.bg} rounded-full mr-2`}></div>
                                                            Key Achievements
                                                        </h5>
                                                        <div className="space-y-2">
                                                            {exp.achievements.map((achievement, i) => (
                                                                <div key={i} className={`${currentAccent.achievement} p-3 rounded-lg border-l-4 ${currentAccent.border}`}>
                                                                    <p className="text-sm font-medium">{achievement.achievement}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Skills/Technologies */}
                                                {exp.skills && (
                                                    <div>
                                                        <h5 className="font-bold text-gray-800 mb-3 flex items-center">
                                                            <div className={`w-2 h-2 ${currentAccent.bg} rounded-full mr-2`}></div>
                                                            Skills & Tools
                                                        </h5>
                                                        <div className="flex flex-wrap gap-2">
                                                            {exp.skills.split(',').map((skill, i) => (
                                                                <span
                                                                    key={i}
                                                                    className={`${currentAccent.tag} px-3 py-1 rounded-full text-sm font-medium hover:scale-105 transition-transform cursor-default`}>
                                                                    {skill.trim()}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Project Image */}
                                            {exp.projectImage && (
                                                <div className="lg:col-span-1">
                                                    <div className="relative group">
                                                        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent rounded-xl z-10"></div>
                                                        <img
                                                            src={exp.projectImage}
                                                            alt={`${exp.position} project`}
                                                            className="w-full h-48 lg:h-full object-cover rounded-xl shadow-lg transform group-hover:scale-105 group-hover:rotate-1 transition-all duration-300"
                                                        />
                                                        <div className="absolute bottom-4 left-4 z-20">
                                                            <div className={`${currentAccent.bgGradient} text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg`}>Featured Work</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
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

export default Experience5;
