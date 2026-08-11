import React, { useState } from 'react';

const Navbar1 = {
    fields: {
        logoText: { type: 'text', label: 'Logo Text' },
        logoImage: { type: 'text', label: 'Logo Image URL (optional)' },
        menuItems: { type: 'textarea', label: 'Menu Items (one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-white/95 backdrop-blur-md border-b border-gray-100/50', label: 'Glass White' },
                { value: 'bg-gradient-to-r from-blue-50/95 via-white/95 to-purple-50/95 backdrop-blur-md border-b border-blue-100/30', label: 'Soft Gradient Glass' },
                { value: 'bg-gradient-to-r from-indigo-600/95 to-purple-600/95 backdrop-blur-md', label: 'Blue Purple Glass' },
                { value: 'bg-gray-900/95 backdrop-blur-md border-b border-gray-700/30', label: 'Dark Glass' },
                { value: 'bg-gradient-to-r from-slate-900/95 to-gray-900/95 backdrop-blur-md', label: 'Dark Gradient Glass' },
                { value: 'bg-gradient-to-r from-emerald-500/95 to-cyan-500/95 backdrop-blur-md', label: 'Emerald Cyan Glass' },
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
        backgroundColor: 'bg-white/95 backdrop-blur-md border-b border-gray-100/50',
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
                {/* Subtle background decoration */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50"></div>

                <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                    <div className="flex justify-between items-center h-20">
                        {/* Enhanced Logo */}
                        <div className="flex items-center cursor-pointer group">
                            {logoImage && (
                                <div className="relative mr-4">
                                    <img
                                        src={logoImage}
                                        alt={logoText}
                                        className="h-10 w-10 rounded-xl object-cover shadow-lg ring-2 ring-white/20 group-hover:ring-blue-500/30 transition-all duration-300 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </div>
                            )}
                            <div className="relative">
                                <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300 inline-block">
                                    {logoText}
                                </span>
                                <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 group-hover:w-full transition-all duration-500"></div>
                            </div>
                        </div>

                        {/* Enhanced Desktop Menu */}
                        <div className="hidden md:flex items-center space-x-2">
                            {menuList.map((item, index) => (
                                <a
                                    key={index}
                                    href={`#${item.toLowerCase()}`}
                                    className={`${textColor} relative px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 group hover:scale-105`}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                                        backdropFilter: 'blur(10px)',
                                    }}>
                                    <span className="relative z-10">{item}</span>

                                    {/* Hover gradient background */}
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>

                                    {/* Active indicator */}
                                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full group-hover:w-8 transition-all duration-300"></div>

                                    {/* Subtle glow effect */}
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/10 to-purple-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                </a>
                            ))}
                        </div>

                        {/* Enhanced Mobile Menu Button */}
                        <div className="md:hidden">
                            <button
                                onClick={toggleMobileMenu}
                                className={`${textColor} relative p-3 rounded-xl transition-all duration-300 hover:scale-110 focus:outline-none group`}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                                    backdropFilter: 'blur(10px)',
                                }}
                                aria-label="Toggle mobile menu">
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                <svg
                                    className={`relative z-10 h-6 w-6 transform transition-all duration-300 ${isMobileMenuOpen ? 'rotate-180 scale-110' : ''}`}
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
                            isMobileMenuOpen ? 'max-h-96 opacity-100 pb-6 translate-y-0' : 'max-h-0 opacity-0 overflow-hidden -translate-y-4'
                        }`}>
                        <div className="pt-4 space-y-2">
                            {menuList.map((item, index) => (
                                <a
                                    key={index}
                                    href={`#${item.toLowerCase()}`}
                                    onClick={closeMobileMenu}
                                    className={`${textColor} relative block px-6 py-4 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] transform hover:translate-x-2 group`}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                                        backdropFilter: 'blur(10px)',
                                        animationDelay: `${index * 100}ms`,
                                    }}>
                                    <span className="relative z-10 flex items-center justify-between">
                                        {item}
                                        <svg
                                            className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>

                                    {/* Hover background */}
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-all duration-300"></div>

                                    {/* Left border indicator */}
                                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-0 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-r-full group-hover:w-1 transition-all duration-300"></div>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Enhanced Mobile Menu Overlay */}
                {isMobileMenuOpen && <div className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={closeMobileMenu} style={{ top: '80px' }} />}
            </nav>
        );
    },
};

export default Navbar1;
