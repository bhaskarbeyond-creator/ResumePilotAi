import React, { useState, useEffect } from 'react';

const NavbarDarkTerminal = {
    fields: {
        logoText: { type: 'text', label: 'Terminal Prompt' },
        logoImage: { type: 'text', label: 'Logo Image URL (optional)' },
        menuItems: { type: 'textarea', label: 'Terminal Commands (one per line)' },
        terminalStyle: {
            type: 'select',
            label: 'Terminal Style',
            options: [
                { value: 'matrix', label: 'Matrix Green' },
                { value: 'amber', label: 'Amber Classic' },
                { value: 'cyan', label: 'Cyan Modern' },
                { value: 'white', label: 'White Minimal' },
            ],
        },
        showCursor: {
            type: 'select',
            label: 'Show Blinking Cursor',
            options: [
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
            ],
        },
    },
    defaultProps: {
        logoText: '$ terminal.dev',
        logoImage: '',
        menuItems: 'whoami\nls skills/\ncat projects/\ncontact --help',
        terminalStyle: 'matrix',
        showCursor: true,
    },
    render: ({ logoText, logoImage, menuItems, terminalStyle, showCursor }) => {
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
        const [typingText, setTypingText] = useState('');
        const [isTyping, setIsTyping] = useState(false);
        const menuList = menuItems.split('\n').filter((item) => item.trim());

        // Update time every second
        useEffect(() => {
            const interval = setInterval(() => {
                setCurrentTime(new Date().toLocaleTimeString());
            }, 1000);
            return () => clearInterval(interval);
        }, []);

        // Typing effect for logo
        useEffect(() => {
            if (logoText) {
                setIsTyping(true);
                setTypingText('');
                let i = 0;
                const typeInterval = setInterval(() => {
                    if (i < logoText.length) {
                        setTypingText(logoText.slice(0, i + 1));
                        i++;
                    } else {
                        setIsTyping(false);
                        clearInterval(typeInterval);
                    }
                }, 100);
                return () => clearInterval(typeInterval);
            }
        }, [logoText]);

        const terminalStyles = {
            matrix: {
                primary: '#00FF00',
                secondary: '#008800',
                background: '#001100',
                border: '#004400',
                glow: 'rgba(0, 255, 0, 0.3)',
                shadow: '0 0 20px rgba(0, 255, 0, 0.5)',
                textShadow: '0 0 5px rgba(0, 255, 0, 0.8)',
            },
            amber: {
                primary: '#FFAA00',
                secondary: '#CC8800',
                background: '#221100',
                border: '#664400',
                glow: 'rgba(255, 170, 0, 0.3)',
                shadow: '0 0 20px rgba(255, 170, 0, 0.5)',
                textShadow: '0 0 5px rgba(255, 170, 0, 0.8)',
            },
            cyan: {
                primary: '#00FFFF',
                secondary: '#0088AA',
                background: '#001122',
                border: '#004466',
                glow: 'rgba(0, 255, 255, 0.3)',
                shadow: '0 0 20px rgba(0, 255, 255, 0.5)',
                textShadow: '0 0 5px rgba(0, 255, 255, 0.8)',
            },
            white: {
                primary: '#FFFFFF',
                secondary: '#CCCCCC',
                background: '#000000',
                border: '#333333',
                glow: 'rgba(255, 255, 255, 0.3)',
                shadow: '0 0 20px rgba(255, 255, 255, 0.3)',
                textShadow: '0 0 5px rgba(255, 255, 255, 0.5)',
            },
        };

        const currentStyle = terminalStyles[terminalStyle] || terminalStyles.matrix;

        const toggleMobileMenu = () => {
            setIsMobileMenuOpen(!isMobileMenuOpen);
        };

        const closeMobileMenu = () => {
            setIsMobileMenuOpen(false);
        };

        return (
            <>
                {/* Terminal CSS Animations */}
                <style>{`
                    @keyframes terminal-blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                    @keyframes terminal-scan {
                        0% { transform: translateY(-100%); opacity: 1; }
                        100% { transform: translateY(100vh); opacity: 0; }
                    }
                    @keyframes matrix-rain {
                        0% { transform: translateY(-100%); }
                        100% { transform: translateY(100vh); }
                    }
                    .terminal-cursor {
                        animation: terminal-blink 1.5s infinite;
                    }
                    .terminal-scan::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 2px;
                        background: linear-gradient(90deg, transparent, ${currentStyle.primary}, transparent);
                        animation: terminal-scan 3s infinite;
                        opacity: 0.7;
                        pointer-events: none;
                    }
                    .terminal-bg {
                        background-color: ${currentStyle.background};
                        background-image: 
                            linear-gradient(${currentStyle.primary}33 1px, transparent 1px),
                            linear-gradient(90deg, ${currentStyle.primary}33 1px, transparent 1px);
                        background-size: 20px 20px;
                    }
                    .terminal-glow {
                        box-shadow: 
                            inset 0 0 20px ${currentStyle.glow},
                            ${currentStyle.shadow};
                    }
                    .terminal-text {
                        color: ${currentStyle.primary};
                        text-shadow: ${currentStyle.textShadow};
                        font-family: 'Courier New', monospace;
                    }
                    .terminal-border {
                        border: 1px solid ${currentStyle.border};
                        box-shadow: 
                            inset 0 0 10px ${currentStyle.glow},
                            0 0 15px ${currentStyle.glow};
                    }
                    .matrix-char {
                        animation: matrix-rain 3s infinite linear;
                        opacity: 0.7;
                    }
                `}</style>

                <nav className="bg-black/98 backdrop-blur-md border-b-2 sticky top-0 z-50 overflow-hidden relative terminal-bg terminal-scan" style={{ borderBottomColor: currentStyle.border }}>
                    {/* Matrix rain effect */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {[...Array(15)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute text-xs font-mono matrix-char"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    color: currentStyle.primary,
                                    animationDelay: `${Math.random() * 3}s`,
                                    animationDuration: `${3 + Math.random() * 2}s`,
                                }}>
                                {String.fromCharCode(0x30a0 + Math.random() * 96)}
                            </div>
                        ))}
                    </div>

                    <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                        {/* Terminal status bar */}
                        <div className="flex justify-between items-center py-1 text-xs border-b" style={{ borderColor: currentStyle.border, color: currentStyle.secondary }}>
                            <div className="flex items-center space-x-4 font-mono">
                                <span>Terminal Session Active</span>
                                <span>PID: 1337</span>
                                <span>TTY: /dev/pts/0</span>
                            </div>
                            <div className="font-mono">{currentTime}</div>
                        </div>

                        <div className="flex justify-between items-center h-16">
                            {/* Terminal Logo/Prompt */}
                            <div className="flex items-center cursor-pointer group">
                                {logoImage && (
                                    <div className="relative mr-4">
                                        <div className="terminal-border rounded-sm p-1">
                                            <img
                                                src={logoImage}
                                                alt={logoText}
                                                className="h-8 w-8 rounded-sm object-cover filter"
                                                style={{ filter: `sepia(1) saturate(2) hue-rotate(${terminalStyle === 'matrix' ? '90deg' : '0deg'})` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="relative">
                                    <span className="text-lg font-mono font-bold terminal-text">
                                        {typingText}
                                        {showCursor && (isTyping || typingText) && (
                                            <span className="terminal-cursor ml-1" style={{ color: currentStyle.primary }}>
                                                █
                                            </span>
                                        )}
                                    </span>
                                    {!isTyping && <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-70"></div>}
                                </div>
                            </div>

                            {/* Desktop Menu - Terminal Style */}
                            <div className="hidden md:flex items-center space-x-1">
                                {menuList.map((item, index) => (
                                    <a
                                        key={index}
                                        href={`#${item.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                                        className="relative px-4 py-2 font-mono text-sm transition-all duration-300 group hover:scale-105 terminal-text">
                                        <span className="relative z-10 flex items-center">
                                            <span className="mr-2 opacity-60">$</span>
                                            {item}
                                            {showCursor && (
                                                <span className="terminal-cursor ml-1 opacity-0 group-hover:opacity-100" style={{ color: currentStyle.primary }}>
                                                    █
                                                </span>
                                            )}
                                        </span>

                                        {/* Terminal window frame */}
                                        <div className="absolute inset-0 terminal-border rounded-sm opacity-0 group-hover:opacity-100 transition-all duration-300">
                                            {/* Terminal dots */}
                                            <div className="absolute top-1 left-1 flex space-x-1">
                                                <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                                                <div className="w-1 h-1 bg-yellow-500 rounded-full"></div>
                                                <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                                            </div>
                                        </div>

                                        {/* Command line effect */}
                                        <div className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-500" style={{ backgroundColor: currentStyle.primary }}></div>

                                        {/* Background glow */}
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300" style={{ backgroundColor: currentStyle.glow }}></div>
                                    </a>
                                ))}
                            </div>

                            {/* Mobile Menu Button - Terminal Style */}
                            <div className="md:hidden">
                                <button
                                    onClick={toggleMobileMenu}
                                    className="relative p-2 transition-all duration-300 hover:scale-110 focus:outline-none group terminal-border rounded-sm"
                                    style={{ color: currentStyle.primary }}
                                    aria-label="Toggle mobile menu">
                                    <div className="terminal-glow absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    <div className="relative z-10 font-mono text-xs">{isMobileMenuOpen ? '[X]' : '[≡]'}</div>
                                </button>
                            </div>
                        </div>

                        {/* Mobile Menu - Terminal Style */}
                        <div
                            className={`md:hidden transition-all duration-500 ease-out ${
                                isMobileMenuOpen ? 'max-h-96 opacity-100 pb-4 translate-y-0' : 'max-h-0 opacity-0 overflow-hidden -translate-y-4'
                            }`}>
                            <div className="pt-2 space-y-1">
                                {menuList.map((item, index) => (
                                    <a
                                        key={index}
                                        href={`#${item.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                                        onClick={closeMobileMenu}
                                        className="relative block px-4 py-3 font-mono text-sm transition-all duration-300 hover:scale-[1.02] transform hover:translate-x-2 group terminal-border rounded-sm"
                                        style={{
                                            color: currentStyle.primary,
                                            animationDelay: `${index * 100}ms`,
                                        }}>
                                        <span className="relative z-10 flex items-center justify-between">
                                            <span className="flex items-center">
                                                <span className="mr-2 opacity-60">$</span>
                                                {item}
                                                {showCursor && (
                                                    <span className="terminal-cursor ml-2 opacity-0 group-hover:opacity-100" style={{ color: currentStyle.primary }}>
                                                        █
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-xs opacity-60">[ENTER]</span>
                                        </span>

                                        {/* Terminal background */}
                                        <div className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-10 transition-all duration-300" style={{ backgroundColor: currentStyle.glow }}></div>

                                        {/* Left prompt indicator */}
                                        <div
                                            className="absolute left-0 top-1/2 transform -translate-y-1/2 w-0 h-6 group-hover:w-0.5 transition-all duration-300"
                                            style={{ backgroundColor: currentStyle.primary }}></div>

                                        {/* Terminal dots */}
                                        <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                                            <div className="w-1 h-1 bg-yellow-500 rounded-full"></div>
                                            <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Menu Overlay */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={closeMobileMenu} style={{ top: '84px' }} />
                    )}
                </nav>
            </>
        );
    },
};

export default NavbarDarkTerminal;
