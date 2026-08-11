import React from 'react';

const Hero2 = {
    fields: {
        name: { type: 'text', label: 'Name' },
        title: { type: 'text', label: 'Professional Title' },
        description: { type: 'textarea', label: 'Description' },
        image: { type: 'text', label: 'Profile Image URL' },
        backgroundColor: {
            type: 'select',
            options: [
                { value: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50', label: 'Light Blue' },
                { value: 'bg-gradient-to-br from-rose-50 via-white to-teal-50', label: 'Warm White' },
                { value: 'bg-gradient-to-br from-violet-50 via-white to-pink-50', label: 'Soft Purple' },
                { value: 'bg-gradient-to-br from-slate-50 via-white to-gray-50', label: 'Clean Gray' },
            ],
        },
        // Statistics fields
        yearsCount: { type: 'text', label: 'Years Count' },
        yearsLabel: { type: 'text', label: 'Years Label' },
        projectsCount: { type: 'text', label: 'Projects Count' },
        projectsLabel: { type: 'text', label: 'Projects Label' },
        clientsCount: { type: 'text', label: 'Clients Count' },
        clientsLabel: { type: 'text', label: 'Clients Label' },
        // CTA Buttons
        primaryButtonText: { type: 'text', label: 'Primary Button Text' },
        secondaryButtonText: { type: 'text', label: 'Secondary Button Text' },
    },
    defaultProps: {
        name: 'Jane Smith',
        title: 'UI/UX Designer & Creative Director',
        description: 'Creative designer passionate about crafting beautiful and intuitive user experiences that bridge the gap between human needs and digital solutions.',
        image: 'https://placehold.co/400x500',
        backgroundColor: 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50',
        // Statistics defaults
        yearsCount: '5+',
        yearsLabel: 'Years',
        projectsCount: '50+',
        projectsLabel: 'Projects',
        clientsCount: '20+',
        clientsLabel: 'Clients',
        // CTA Buttons defaults
        primaryButtonText: 'View Portfolio',
        secondaryButtonText: 'Download CV',
    },
    render: ({ name, title, description, image, backgroundColor, yearsCount, yearsLabel, projectsCount, projectsLabel, clientsCount, clientsLabel, primaryButtonText, secondaryButtonText }) => (
        <div className={`${backgroundColor} relative min-h-screen`}>
            {/* Enhanced Decorative Elements */}
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/40 to-purple-200/40 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-cyan-200/30 to-teal-200/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-screen h-screen bg-gradient-to-r from-transparent via-white/20 to-transparent -z-10"></div>

            <div className="relative py-20 px-6 min-h-screen flex items-center">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        {/* Content Section - Enhanced */}
                        <div className="order-2 lg:order-1 space-y-10">
                            {/* Professional Badge - Enhanced */}
                            <div className="flex items-center gap-4">
                                <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full shadow-sm border border-emerald-200/50">
                                    <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full mr-3 animate-pulse shadow-sm"></div>
                                    <span className="text-sm font-semibold text-emerald-700">Available for projects</span>
                                </div>
                                <div className="h-px bg-gradient-to-r from-gray-300 to-transparent flex-1 max-w-20"></div>
                                <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">2024</span>
                            </div>

                            {/* Main Heading - Enhanced */}
                            <div className="space-y-6">
                                <div>
                                    <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-gray-900 leading-[0.9] tracking-tight">
                                        <span className="block text-gray-400 font-light text-4xl md:text-5xl lg:text-6xl">Hello, I'm</span>
                                        <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">{name}</span>
                                    </h1>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full w-16"></div>
                                    <h2 className="text-2xl md:text-3xl text-gray-600 font-semibold">{title}</h2>
                                </div>
                            </div>

                            {/* Description - Enhanced */}
                            <p className="text-xl md:text-2xl text-gray-600 leading-relaxed max-w-2xl font-light">{description}</p>

                            {/* Statistics - Enhanced */}
                            <div className="grid grid-cols-3 gap-8 py-8 border-t border-b border-gray-200/60">
                                <div className="text-center group cursor-pointer">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-blue-600 transition-colors">{yearsCount}</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{yearsLabel}</div>
                                </div>
                                <div className="text-center group cursor-pointer">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-purple-600 transition-colors">{projectsCount}</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{projectsLabel}</div>
                                </div>
                                <div className="text-center group cursor-pointer">
                                    <div className="text-4xl font-black text-gray-900 group-hover:text-cyan-600 transition-colors">{clientsCount}</div>
                                    <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{clientsLabel}</div>
                                </div>
                            </div>

                            {/* Call to Action - Enhanced */}
                            <div className="flex flex-wrap gap-6 pt-4">
                                <button className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold text-lg transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30 overflow-hidden">
                                    <span className="relative z-10 flex items-center gap-3">
                                        {primaryButtonText}
                                        <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>
                                <button className="px-10 py-5 border-2 border-gray-300 text-gray-700 rounded-2xl font-bold text-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 hover:shadow-lg">
                                    {secondaryButtonText}
                                </button>
                            </div>
                        </div>

                        {/* Image Section - Enhanced */}
                        <div className="order-1 lg:order-2 relative">
                            <div className="relative group">
                                {/* Main Image Container */}
                                <div className="relative bg-gradient-to-br from-white via-gray-50 to-white p-8 rounded-3xl shadow-2xl hover:shadow-3xl transition-all duration-500 group-hover:scale-[1.02]">
                                    <img src={image} alt={name} className="w-full max-w-lg mx-auto rounded-2xl object-cover aspect-[4/5] shadow-xl" />

                                    {/* Enhanced Floating Elements */}
                                    <div className="absolute -top-8 -right-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white p-6 rounded-3xl shadow-2xl hover:rotate-12 transition-transform duration-300 cursor-pointer">
                                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>

                                    <div className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-2xl border-2 border-gray-100 hover:-rotate-6 transition-transform duration-300 cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <div className="w-4 h-4 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full animate-pulse shadow-sm"></div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">Online</div>
                                                <div className="text-xs text-gray-500">Ready to work</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Enhanced Background Decorations */}
                                <div className="absolute -inset-8 bg-gradient-to-br from-blue-200/30 via-purple-200/20 to-cyan-200/30 rounded-3xl -z-10 rotate-3 group-hover:rotate-6 transition-transform duration-500"></div>
                                <div className="absolute -inset-12 bg-gradient-to-br from-purple-100/20 to-pink-100/20 rounded-3xl -z-20 -rotate-2 group-hover:-rotate-3 transition-transform duration-700"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Hero2;
