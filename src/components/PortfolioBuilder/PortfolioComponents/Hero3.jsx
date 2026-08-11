import React from 'react';

const Hero3 = {
    fields: {
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        expertise: {
            type: 'text',
            label: 'Expertise (comma separated)',
            placeholder: 'React, Node.js, TypeScript, AWS, Leadership',
        },
        email: { type: 'text', label: 'Contact Email' },
        backgroundColor: {
            type: 'select',
            options: [
                { value: 'bg-white', label: 'Pure White' },
                { value: 'bg-gray-50', label: 'Soft Gray' },
                { value: 'bg-slate-50', label: 'Slate' },
                { value: 'bg-zinc-950', label: 'Dark Mode' },
            ],
        },
    },
    defaultProps: {
        name: 'Alex Johnson',
        title: 'Software Engineer & Technical Lead',
        description: 'Building the future, one line of code at a time. Specialized in creating scalable solutions and leading high-performance teams.',
        image: 'https://placehold.co/120x120',
        expertise: 'React, Node.js, TypeScript, AWS, Leadership',
        email: 'hello@alexjohnson.dev',
        backgroundColor: 'bg-white',
    },
    render: ({ name, title, description, image, expertise, email, backgroundColor }) => {
        const isDark = backgroundColor === 'bg-zinc-950';
        const textColor = isDark ? 'text-white' : 'text-gray-900';
        const secondaryTextColor = isDark ? 'text-gray-400' : 'text-gray-600';
        const mutedTextColor = isDark ? 'text-gray-500' : 'text-gray-400';
        const accentColor = isDark ? 'text-blue-400' : 'text-blue-600';
        const borderColor = isDark ? 'border-gray-800' : 'border-gray-200';
        const bgSubtle = isDark ? 'bg-gray-900' : 'bg-gray-100';
        const bgCard = isDark ? 'bg-gray-800' : 'bg-white';
        const hoverBg = isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-200';

        // Parse expertise from comma-separated string
        const expertiseList = expertise
            ? expertise
                  .split(',')
                  .map((skill) => skill.trim())
                  .filter((skill) => skill)
            : [];

        return (
            <div className={`${backgroundColor} relative overflow-hidden min-h-screen`}>
                {/* Enhanced Background Elements */}
                <div className={`absolute inset-0 ${isDark ? 'opacity-5' : 'opacity-30'}`}>
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `linear-gradient(${isDark ? '#374151' : '#f3f4f6'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? '#374151' : '#f3f4f6'} 1px, transparent 1px)`,
                            backgroundSize: '32px 32px',
                        }}></div>
                </div>

                {/* Gradient overlay for depth */}
                <div
                    className={`absolute inset-0 ${
                        isDark ? 'bg-gradient-to-br from-zinc-950/50 via-transparent to-zinc-950/30' : 'bg-gradient-to-br from-white/80 via-transparent to-gray-50/60'
                    }`}></div>

                {/* Floating decorative elements */}
                <div className={`absolute top-20 right-20 w-64 h-64 ${isDark ? 'bg-blue-500/5' : 'bg-blue-500/10'} rounded-full blur-3xl animate-pulse`}></div>
                <div className={`absolute bottom-20 left-20 w-80 h-80 ${isDark ? 'bg-purple-500/5' : 'bg-purple-500/10'} rounded-full blur-3xl animate-pulse delay-1000`}></div>

                <div className="relative w-full py-16 px-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Enhanced Header Section */}
                        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-24 gap-10">
                            <div className="flex items-center gap-10">
                                <div className="relative group">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-300"></div>
                                    <img
                                        src={image}
                                        alt={name}
                                        className={`relative w-28 h-28 rounded-3xl object-cover ${borderColor} border-2 shadow-2xl transition-all duration-500 group-hover:scale-105`}
                                    />
                                    <div
                                        className={`absolute -bottom-4 -right-4 w-10 h-10 bg-gradient-to-r ${
                                            isDark ? 'from-emerald-400 to-green-400' : 'from-emerald-500 to-green-500'
                                        } rounded-full border-4 ${isDark ? 'border-zinc-950' : 'border-white'} shadow-xl pulse-ring flex items-center justify-center`}>
                                        <div className="w-3 h-3 bg-white rounded-full"></div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h2 className={`text-2xl font-black ${accentColor} tracking-tight`}>{title}</h2>
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`w-4 h-4 bg-gradient-to-r ${
                                                isDark ? 'from-emerald-400 to-green-400' : 'from-emerald-500 to-green-500'
                                            } rounded-full animate-pulse shadow-lg`}></div>
                                        <span className={`text-base ${secondaryTextColor} font-semibold`}>Available for opportunities</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-10">
                                <div className={`h-px ${borderColor} flex-1 max-w-48`}></div>
                                <div className="text-right space-y-1">
                                    <div className={`text-sm ${mutedTextColor} uppercase tracking-[0.2em] font-bold`}>Portfolio</div>
                                    <div className={`text-3xl font-black ${textColor} tracking-tight`}>2024</div>
                                </div>
                            </div>
                        </header>

                        {/* Enhanced Main Content */}
                        <main className="space-y-20">
                            {/* Name - Ultra Typography */}
                            <section className="space-y-10">
                                <h1 className={`text-8xl md:text-9xl lg:text-[14rem] xl:text-[16rem] font-black ${textColor} leading-[0.75] tracking-tighter select-none`}>
                                    <span className={`block font-extralight ${mutedTextColor} text-6xl md:text-7xl lg:text-8xl xl:text-9xl mb-6 opacity-60`}>I'm</span>
                                    <span className="block transform hover:scale-105 transition-transform duration-500 cursor-default">{name.split(' ')[0]}</span>
                                    {name.split(' ')[1] && (
                                        <span
                                            className={`block ${accentColor} font-light opacity-90 -mt-8 translate-y-[40px] transform hover:scale-105 transition-transform duration-500 cursor-default`}>
                                            {name.split(' ')[1]}
                                        </span>
                                    )}
                                </h1>
                            </section>

                            {/* Enhanced Description */}
                            <section className="max-w-4xl">
                                <p className={`text-3xl md:text-4xl ${secondaryTextColor} leading-relaxed font-light tracking-wide`}>{description}</p>
                            </section>

                            {/* Enhanced Expertise Section */}
                            {expertiseList.length > 0 && (
                                <section className="space-y-8">
                                    <div className="flex items-center gap-6">
                                        <h3 className={`text-base ${mutedTextColor} uppercase tracking-[0.2em] font-black`}>Core Expertise</h3>
                                        <div className={`h-px ${borderColor} flex-1 max-w-32`}></div>
                                    </div>
                                    <div className="flex flex-wrap gap-5">
                                        {expertiseList.map((skill, index) => (
                                            <span
                                                key={index}
                                                className={`group px-8 py-4 ${bgSubtle} ${secondaryTextColor} ${borderColor} border-2 rounded-3xl text-base font-bold ${hoverBg} transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-lg hover:border-opacity-70 relative overflow-hidden`}>
                                                <span className="relative z-10">{skill}</span>
                                                <div
                                                    className={`absolute inset-0 ${
                                                        isDark ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10' : 'bg-gradient-to-r from-blue-500/5 to-purple-500/5'
                                                    } opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                                            </span>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Enhanced Call to Action */}
                            <section className="flex flex-wrap gap-8 pt-16">
                                <button
                                    className={`group flex items-center gap-5 px-16 py-8 ${
                                        isDark ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'
                                    } rounded-3xl font-black text-2xl transition-all duration-500 hover:scale-105 hover:shadow-2xl transform-gpu`}>
                                    <span>View My Work</span>
                                    <svg className="w-7 h-7 group-hover:translate-x-3 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                </button>
                                <button
                                    className={`px-16 py-8 ${borderColor} ${secondaryTextColor} border-2 rounded-3xl font-black text-2xl ${hoverBg} transition-all duration-500 hover:shadow-xl hover:scale-105 transform-gpu`}>
                                    Let's Connect
                                </button>
                            </section>

                            {/* Enhanced Contact Section */}
                            <section className="pt-20">
                                <div
                                    className={`inline-flex items-center gap-8 px-10 py-6 ${bgCard} ${borderColor} border-2 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 group cursor-pointer`}>
                                    <div className={`text-sm ${mutedTextColor} uppercase tracking-[0.2em] font-black`}>Contact</div>
                                    <div className={`h-px ${borderColor} flex-1 w-12 group-hover:w-16 transition-all duration-300`}></div>
                                    <div className={`text-xl ${accentColor} font-bold hover:underline transition-all duration-300`}>{email}</div>
                                </div>
                            </section>
                        </main>

                        {/* Enhanced Scroll Indicator */}
                        <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2">
                            <div className="flex flex-col items-center group cursor-pointer">
                                <div className={`text-xs ${mutedTextColor} uppercase tracking-[0.2em] font-bold mb-4 opacity-60 group-hover:opacity-100 transition-opacity`}>Scroll</div>
                                <div className={`w-6 h-12 ${borderColor} border-2 rounded-full flex justify-center group-hover:border-blue-500 transition-colors duration-300`}>
                                    <div className={`w-1 h-4 ${isDark ? 'bg-blue-400' : 'bg-blue-600'} rounded-full mt-2 animate-bounce group-hover:animate-pulse`}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Enhanced Custom CSS */}
                <style jsx>{`
                    .pulse-ring {
                        animation: pulse-ring 3s infinite;
                    }
                    @keyframes pulse-ring {
                        0% {
                            box-shadow: 0 0 0 0 ${isDark ? 'rgba(52, 211, 153, 0.6)' : 'rgba(34, 197, 94, 0.6)'};
                        }
                        50% {
                            box-shadow: 0 0 0 15px ${isDark ? 'rgba(52, 211, 153, 0)' : 'rgba(34, 197, 94, 0)'};
                        }
                        100% {
                            box-shadow: 0 0 0 0 ${isDark ? 'rgba(52, 211, 153, 0)' : 'rgba(34, 197, 94, 0)'};
                        }
                    }
                `}</style>
            </div>
        );
    },
};

export default Hero3;
