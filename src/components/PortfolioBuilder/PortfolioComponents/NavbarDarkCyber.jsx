import React, { useState, useEffect } from 'react';

const NavbarDarkCyber = {
    fields: {
        logoText: { type: 'text', label: 'Logo Text' },
        logoImage: { type: 'text', label: 'Logo Image URL (optional)' },
        menuItems: { type: 'textarea', label: 'Menu Items (one per line)' },
        glitchEffect: {
            type: 'select',
            label: 'Glitch Effect Intensity',
            options: [
                { value: 'none', label: 'None' },
                { value: 'subtle', label: 'Subtle' },
                { value: 'medium', label: 'Medium' },
                { value: 'intense', label: 'Intense' },
            ],
        },
        neonColor: {
            type: 'select',
            label: 'Neon Accent Color',
            options: [
                { value: 'cyan', label: 'Cyan' },
                { value: 'blue', label: 'Blue' },
                { value: 'purple', label: 'Purple' },
                { value: 'pink', label: 'Pink' },
                { value: 'red', label: 'Red' },
            ],
        },
    },
    defaultProps: {
        logoText: 'CYBER.DEV',
        logoImage: '',
        menuItems: 'Home\nAbout\nSkills\nProjects\nContact',
        glitchEffect: 'medium',
        neonColor: 'cyan',
    },
    render: ({ logoText, logoImage, menuItems, glitchEffect, neonColor }) => {
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const [glitchActive, setGlitchActive] = useState(false);
        const menuList = menuItems.split('\n').filter((item) => item.trim());

        // Glitch effect trigger
        useEffect(() => {
            if (glitchEffect !== 'none') {
                const interval = setInterval(() => {
                    setGlitchActive(true);
                    setTimeout(() => setGlitchActive(false), 200);
                }, Math.random() * 3000 + 2000);
                return () => clearInterval(interval);
            }
        }, [glitchEffect]);

        const neonColors = {
            cyan: {
                primary: '#00FFFF',
                secondary: '#0080FF',
                glow: 'rgba(0, 255, 255, 0.3)',
                shadow: '0 0 20px rgba(0, 255, 255, 0.5)',
                textShadow: '0 0 10px rgba(0, 255, 255, 0.8)',
            },
            blue: {
                primary: '#0080FF',
                secondary: '#4040FF',
                glow: 'rgba(0, 128, 255, 0.3)',
                shadow: '0 0 20px rgba(0, 128, 255, 0.5)',
                textShadow: '0 0 10px rgba(0, 128, 255, 0.8)',
            },
            purple: {
                primary: '#8040FF',
                secondary: '#C040FF',
                glow: 'rgba(128, 64, 255, 0.3)',
                shadow: '0 0 20px rgba(128, 64, 255, 0.5)',
                textShadow: '0 0 10px rgba(128, 64, 255, 0.8)',
            },
            pink: {
                primary: '#FF40C0',
                secondary: '#FF80E0',
                glow: 'rgba(255, 64, 192, 0.3)',
                shadow: '0 0 20px rgba(255, 64, 192, 0.5)',
                textShadow: '0 0 10px rgba(255, 64, 192, 0.8)',
            },
            red: {
                primary: '#FF4040',
                secondary: '#FF8080',
                glow: 'rgba(255, 64, 64, 0.3)',
                shadow: '0 0 20px rgba(255, 64, 64, 0.5)',
                textShadow: '0 0 10px rgba(255, 64, 64, 0.8)',
            },
        };

        const currentNeon = neonColors[neonColor] || neonColors.cyan;

        const glitchClasses = {
            none: '',
            subtle: glitchActive ? 'animate-pulse' : '',
            medium: glitchActive ? 'animate-pulse transform translate-x-0.5' : '',
            intense: glitchActive ? 'animate-pulse transform translate-x-1 skew-x-1' : '',
        };

        const toggleMobileMenu = () => {
            setIsMobileMenuOpen(!isMobileMenuOpen);
        };

        const closeMobileMenu = () => {
            setIsMobileMenuOpen(false);
        };

        return (
            <>
                {/* Cyberpunk CSS Animations */}
                <style>{`
                    @keyframes cyber-flicker {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.8; }
                    }
                    @keyframes cyber-scan {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    .cyber-flicker {
                        animation: cyber-flicker 2s infinite;
                    }
                    .cyber-scan::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(90deg, transparent, ${currentNeon.glow}, transparent);
                        animation: cyber-scan 3s infinite;
                        pointer-events: none;
                    }
                    .cyber-grid {
                        background-image: 
                            linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
                        background-size: 20px 20px;
                    }
                    .cyber-glow {
                        box-shadow: 
                            inset 0 0 20px ${currentNeon.glow},
                            ${currentNeon.shadow};
                    }
                    .cyber-text {
                        text-shadow: ${currentNeon.textShadow};
                    }
                    .cyber-border {
                        border: 1px solid ${currentNeon.primary};
                        box-shadow: 
                            inset 0 0 10px ${currentNeon.glow},
                            0 0 15px ${currentNeon.glow};
                    }
                `}</style>

                <nav className="bg-black/95 backdrop-blur-md border-b-2 border-cyan-400/30 sticky top-0 z-50 overflow-hidden relative cyber-grid">
                    {/* Holographic overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent cyber-scan"></div>

                    {/* Floating particles effect */}
                    <div className="absolute inset-0 pointer-events-none">
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute w-1 h-1 bg-cyan-400 rounded-full animate-ping"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 100}%`,
                                    animationDelay: `${Math.random() * 2}s`,
                                    animationDuration: `${2 + Math.random() * 2}s`,
                                }}
                            />
                        ))}
                    </div>

                    <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                        <div className="flex justify-between items-center h-20">
                            {/* Cyberpunk Logo */}
                            <div className="flex items-center cursor-pointer group">
                                {logoImage && (
                                    <div className="relative mr-4">
                                        <div className="cyber-border rounded-lg p-1">
                                            <img src={logoImage} alt={logoText} className="h-10 w-10 rounded-md object-cover" />
                                        </div>
                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    </div>
                                )}
                                <div className={`relative ${glitchClasses[glitchEffect]}`}>
                                    <span className="text-2xl font-black tracking-wider cyber-text" style={{ color: currentNeon.primary }}>
                                        {logoText}
                                    </span>
                                    <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent cyber-flicker"></div>
                                    {/* Glitch duplicate text effect */}
                                    {glitchEffect !== 'none' && (
                                        <>
                                            <span className="absolute inset-0 text-2xl font-black tracking-wider text-red-500 opacity-0 group-hover:opacity-30 transform translate-x-0.5 -translate-y-0.5">
                                                {logoText}
                                            </span>
                                            <span className="absolute inset-0 text-2xl font-black tracking-wider text-blue-500 opacity-0 group-hover:opacity-20 transform -translate-x-0.5 translate-y-0.5">
                                                {logoText}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Desktop Menu - Cyberpunk Style */}
                            <div className="hidden md:flex items-center space-x-1">
                                {menuList.map((item, index) => (
                                    <a
                                        key={index}
                                        href={`#${item.toLowerCase()}`}
                                        className="relative px-6 py-3 font-semibold text-sm transition-all duration-300 group hover:scale-105"
                                        style={{ color: currentNeon.primary }}>
                                        <span className="relative z-10 cyber-text">{item}</span>

                                        {/* Cyberpunk frame */}
                                        <div className="absolute inset-0 cyber-border rounded-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-105">
                                            {/* Corner decorations */}
                                            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: currentNeon.primary }}></div>
                                            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: currentNeon.primary }}></div>
                                            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: currentNeon.primary }}></div>
                                            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: currentNeon.primary }}></div>
                                        </div>

                                        {/* Scanning line effect */}
                                        <div className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-500" style={{ backgroundColor: currentNeon.primary }}></div>

                                        {/* Background glow */}
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300" style={{ backgroundColor: currentNeon.glow }}></div>
                                    </a>
                                ))}
                            </div>

                            {/* Mobile Menu Button - Cyberpunk Style */}
                            <div className="md:hidden">
                                <button
                                    onClick={toggleMobileMenu}
                                    className="relative p-3 transition-all duration-300 hover:scale-110 focus:outline-none group cyber-border rounded-md"
                                    style={{ color: currentNeon.primary }}
                                    aria-label="Toggle mobile menu">
                                    <div className="cyber-glow absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
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

                        {/* Mobile Menu - Cyberpunk Style */}
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
                                        className="relative block px-6 py-4 font-semibold transition-all duration-300 hover:scale-[1.02] transform hover:translate-x-2 group cyber-border rounded-md"
                                        style={{
                                            color: currentNeon.primary,
                                            animationDelay: `${index * 100}ms`,
                                        }}>
                                        <span className="relative z-10 flex items-center justify-between cyber-text">
                                            {item}
                                            <svg
                                                className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                            </svg>
                                        </span>

                                        {/* Cyber background */}
                                        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-20 transition-all duration-300" style={{ backgroundColor: currentNeon.glow }}></div>

                                        {/* Left scanning line */}
                                        <div
                                            className="absolute left-0 top-1/2 transform -translate-y-1/2 w-0 h-8 group-hover:w-1 transition-all duration-300"
                                            style={{ backgroundColor: currentNeon.primary }}></div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Menu Overlay */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={closeMobileMenu} style={{ top: '80px' }} />
                    )}
                </nav>
            </>
        );
    },
};

export default NavbarDarkCyber;
