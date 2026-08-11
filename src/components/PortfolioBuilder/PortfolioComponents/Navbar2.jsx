import React, { useState } from 'react';

const Navbar2 = {
    fields: {
        logoText: { type: 'text', label: 'Logo Text' },
        logoImage: { type: 'text', label: 'Logo Image URL (optional)' },
        menuItems: { type: 'textarea', label: 'Menu Items (one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-gradient-to-br from-indigo-50/95 via-white/95 to-cyan-50/95 backdrop-blur-md border-b border-indigo-100/30', label: 'Soft Blue Glass' },
                { value: 'bg-gradient-to-br from-rose-50/95 via-white/95 to-teal-50/95 backdrop-blur-md border-b border-rose-100/30', label: 'Warm Glass' },
                { value: 'bg-gradient-to-br from-violet-50/95 via-white/95 to-pink-50/95 backdrop-blur-md border-b border-violet-100/30', label: 'Purple Pink Glass' },
                { value: 'bg-gradient-to-r from-blue-600/95 to-purple-600/95 backdrop-blur-md', label: 'Blue Purple Glass' },
                { value: 'bg-gradient-to-r from-gray-800/95 to-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: 'Dark Glass' },
                { value: 'bg-gradient-to-r from-emerald-600/95 to-cyan-600/95 backdrop-blur-md', label: 'Emerald Cyan Glass' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-gray-800', label: 'Dark Gray' },
                { value: 'text-white', label: 'White' },
                { value: 'text-blue-600', label: 'Blue' },
                { value: 'text-gray-600', label: 'Medium Gray' },
            ],
        },
    },
    defaultProps: {
        logoText: 'Portfolio',
        logoImage: '',
        menuItems: 'Home\nAbout\nSkills\nProjects\nContact',
        backgroundColor: 'bg-gradient-to-br from-indigo-50/95 via-white/95 to-cyan-50/95 backdrop-blur-md border-b border-indigo-100/30',
        textColor: 'text-gray-800',
    },
    render: ({ logoText, logoImage, menuItems, backgroundColor, textColor }) => {
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const menuList = menuItems.split('\n').filter((item) => item.trim());

        const toggleMobileMenu = () => {
            setIsMobileMenuOpen(!isMobileMenuOpen);
        };

        const closeMobileMenu = () => {
            setIsMobileMenuOpen(false);
        };

        return (
            <nav className={`${backgroundColor} ${textColor} shadow-xl sticky top-0 z-50 transition-all duration-500`}>
                {/* Enhanced background decorations */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute -bottom-20 -left-20 w-32 h-32 bg-gradient-to-br from-cyan-200/20 to-teal-200/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
                </div>

                <div className="relative max-w-6xl mx-auto px-6 py-8">
                    {/* Enhanced Logo - Centered */}
                    <div className="flex justify-center items-center mb-8 group">
                        <div className="relative">
                            {logoImage && (
                                <div className="relative mx-auto mb-4">
                                    <img
                                        src={logoImage}
                                        alt={logoText}
                                        className="h-16 w-16 mx-auto rounded-2xl object-cover shadow-2xl ring-4 ring-white/20 group-hover:ring-blue-500/30 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"
                                    />
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                                    {/* Floating decoration around logo */}
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 delay-100"></div>
                                    <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 delay-200"></div>
                                </div>
                            )}

                            <div className="text-center">
                                <span className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300 inline-block">
                                    {logoText}
                                </span>
                                <div className="mt-2 mx-auto w-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full group-hover:w-20 transition-all duration-500"></div>
                            </div>

                            {/* Professional badge */}
                            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                                <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-emerald-100/80 to-green-100/80 backdrop-blur-sm rounded-full shadow-sm border border-emerald-200/50 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-300">
                                    <div className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full mr-2 animate-pulse"></div>
                                    <span className="text-xs font-semibold text-emerald-700">Online</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Menu - Centered */}
                    <div className="flex justify-center">
                        {/* Desktop Menu */}
                        <div className="hidden md:flex flex-wrap justify-center items-center gap-3">
                            {menuList.map((item, index) => (
                                <a
                                    key={index}
                                    href={`#${item.toLowerCase()}`}
                                    className={`${textColor} relative px-8 py-4 rounded-2xl font-semibold text-sm transition-all duration-300 group hover:scale-105 hover:-rotate-1`}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))',
                                        backdropFilter: 'blur(20px)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                                        animationDelay: `${index * 100}ms`,
                                    }}>
                                    <span className="relative z-10 flex items-center gap-2">
                                        {item}
                                        <svg
                                            className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>

                                    {/* Multiple hover effects */}
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                                    {/* Bottom indicator */}
                                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full group-hover:w-12 transition-all duration-300"></div>

                                    {/* Subtle floating effect */}
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/5 to-purple-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg transform group-hover:-translate-y-1"></div>
                                </a>
                            ))}
                        </div>

                        {/* Mobile Menu Button - Centered */}
                        <div className="md:hidden flex justify-center">
                            <button
                                onClick={toggleMobileMenu}
                                className={`${textColor} relative p-4 rounded-2xl transition-all duration-300 hover:scale-110 focus:outline-none group`}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))',
                                    backdropFilter: 'blur(20px)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                                }}
                                aria-label="Toggle mobile menu">
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                <svg
                                    className={`relative z-10 h-6 w-6 transform transition-all duration-500 ${isMobileMenuOpen ? 'rotate-180 scale-110' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor">
                                    {isMobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Enhanced Mobile Menu */}
                    <div
                        className={`md:hidden transition-all duration-500 ease-out ${
                            isMobileMenuOpen ? 'max-h-96 opacity-100 mt-8 translate-y-0' : 'max-h-0 opacity-0 overflow-hidden -translate-y-4'
                        }`}>
                        <div className="space-y-3">
                            {menuList.map((item, index) => (
                                <a
                                    key={index}
                                    href={`#${item.toLowerCase()}`}
                                    onClick={closeMobileMenu}
                                    className={`${textColor} relative block text-center px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:scale-[1.02] group`}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))',
                                        backdropFilter: 'blur(20px)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                                        animationDelay: `${index * 100}ms`,
                                    }}>
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        {item}
                                        <svg
                                            className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>

                                    {/* Enhanced hover effects */}
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                                    {/* Center indicator */}
                                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full group-hover:w-16 transition-all duration-300"></div>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Enhanced Mobile Menu Overlay */}
                {isMobileMenuOpen && <div className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={closeMobileMenu} style={{ top: '120px' }} />}
            </nav>
        );
    },
};

export default Navbar2;
