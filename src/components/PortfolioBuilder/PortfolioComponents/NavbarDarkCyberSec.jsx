import React, { useState, useEffect } from 'react';

const NavbarDarkCyberSec = {
    fields: {
        logoText: { type: 'text', label: 'Security Brand' },
        logoImage: { type: 'text', label: 'Logo Image URL (optional)' },
        menuItems: { type: 'textarea', label: 'Security Sections (one per line)' },
        securityLevel: {
            type: 'select',
            label: 'Security Indication Level',
            options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
            ],
        },
        encryptionStyle: {
            type: 'select',
            label: 'Encryption Visual Style',
            options: [
                { value: 'minimal', label: 'Minimal' },
                { value: 'matrix', label: 'Matrix' },
                { value: 'hexadecimal', label: 'Hexadecimal' },
                { value: 'binary', label: 'Binary' },
            ],
        },
    },
    defaultProps: {
        logoText: 'SECURE.TECH',
        logoImage: '',
        menuItems: 'Home\nAbout\nExpertise\nProjects\nCertifications\nContact',
        securityLevel: 'high',
        encryptionStyle: 'hexadecimal',
    },
    render: ({ logoText, logoImage, menuItems, securityLevel, encryptionStyle }) => {
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const [encryptedText, setEncryptedText] = useState('');
        const [authStatus, setAuthStatus] = useState('authenticated');
        const [threatLevel, setThreatLevel] = useState(0);
        const menuList = menuItems.split('\n').filter((item) => item.trim());

        // Encryption text animation
        useEffect(() => {
            const chars = '0123456789ABCDEF';
            const interval = setInterval(() => {
                const newText = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                setEncryptedText(newText);
            }, 150);
            return () => clearInterval(interval);
        }, []);

        // Security monitoring simulation
        useEffect(() => {
            const interval = setInterval(() => {
                setThreatLevel(Math.floor(Math.random() * 4));
            }, 3000);
            return () => clearInterval(interval);
        }, []);

        const securityLevels = {
            low: {
                color: '#00FF00',
                bg: 'rgba(0, 255, 0, 0.1)',
                border: '#004400',
                indicator: '🟢',
                status: 'SECURE',
                glow: 'rgba(0, 255, 0, 0.3)',
            },
            medium: {
                color: '#FFFF00',
                bg: 'rgba(255, 255, 0, 0.1)',
                border: '#444400',
                indicator: '🟡',
                status: 'MONITOR',
                glow: 'rgba(255, 255, 0, 0.3)',
            },
            high: {
                color: '#FF8800',
                bg: 'rgba(255, 136, 0, 0.1)',
                border: '#442200',
                indicator: '🟠',
                status: 'ELEVATED',
                glow: 'rgba(255, 136, 0, 0.3)',
            },
            critical: {
                color: '#FF0000',
                bg: 'rgba(255, 0, 0, 0.1)',
                border: '#440000',
                indicator: '🔴',
                status: 'CRITICAL',
                glow: 'rgba(255, 0, 0, 0.3)',
            },
        };

        const currentSecurity = securityLevels[securityLevel] || securityLevels.high;

        const generateEncryptionContent = () => {
            switch (encryptionStyle) {
                case 'binary':
                    return Array.from({ length: 20 }, () => (Math.random() > 0.5 ? '1' : '0')).join('');
                case 'hexadecimal':
                    return Array.from({ length: 16 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
                case 'matrix':
                    return Array.from({ length: 10 }, () => String.fromCharCode(0x30a0 + Math.random() * 96)).join('');
                default:
                    return '••••••••••••••••';
            }
        };

        const toggleMobileMenu = () => {
            setIsMobileMenuOpen(!isMobileMenuOpen);
        };

        const closeMobileMenu = () => {
            setIsMobileMenuOpen(false);
        };

        return (
            <>
                {/* Security CSS Animations */}
                <style>{`
                    @keyframes security-pulse {
                        0%, 100% { opacity: 0.7; }
                        50% { opacity: 1; }
                    }
                    @keyframes encrypt-flow {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    @keyframes threat-scan {
                        0% { transform: scaleX(0); }
                        50% { transform: scaleX(1); }
                        100% { transform: scaleX(0); }
                    }
                    .security-pulse {
                        animation: security-pulse 2s infinite;
                    }
                    .encrypt-flow {
                        animation: encrypt-flow 4s infinite linear;
                    }
                    .threat-scan {
                        animation: threat-scan 3s infinite;
                    }
                    .security-grid {
                        background-image: 
                            linear-gradient(${currentSecurity.color}22 1px, transparent 1px),
                            linear-gradient(90deg, ${currentSecurity.color}22 1px, transparent 1px);
                        background-size: 25px 25px;
                    }
                    .security-glow {
                        box-shadow: 
                            inset 0 0 20px ${currentSecurity.glow},
                            0 0 20px ${currentSecurity.glow};
                    }
                    .security-text {
                        color: ${currentSecurity.color};
                        text-shadow: 0 0 10px ${currentSecurity.glow};
                        font-family: 'Courier New', monospace;
                    }
                    .security-border {
                        border: 1px solid ${currentSecurity.color};
                        box-shadow: 
                            inset 0 0 10px ${currentSecurity.glow},
                            0 0 15px ${currentSecurity.glow};
                    }
                    .hex-pattern {
                        background: radial-gradient(circle at 1px 1px, ${currentSecurity.color}22 1px, transparent 0);
                        background-size: 20px 20px;
                    }
                `}</style>

                <nav className="bg-black/98 backdrop-blur-md border-b-2 sticky top-0 z-50 overflow-hidden relative security-grid hex-pattern" style={{ borderBottomColor: currentSecurity.border }}>
                    {/* Security scan overlay */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-0.5 threat-scan" style={{ backgroundColor: currentSecurity.color }}></div>
                    </div>

                    {/* Encryption flow */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                        <div className="absolute top-1/2 left-0 w-32 h-0.5 encrypt-flow opacity-30" style={{ backgroundColor: currentSecurity.color }}></div>
                    </div>

                    <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
                        {/* Security status bar */}
                        <div className="flex justify-between items-center py-1 text-xs border-b" style={{ borderColor: currentSecurity.border }}>
                            <div className="flex items-center space-x-4 font-mono" style={{ color: currentSecurity.color }}>
                                <span className="flex items-center">
                                    <span className="mr-1">{currentSecurity.indicator}</span>
                                    THREAT LEVEL: {currentSecurity.status}
                                </span>
                                <span>AUTH: {authStatus.toUpperCase()}</span>
                                <span>ENC: AES-256</span>
                                <span>VPN: ACTIVE</span>
                            </div>
                            <div className="flex items-center space-x-2 font-mono" style={{ color: currentSecurity.color }}>
                                <span>0x{encryptedText.slice(0, 8)}</span>
                                <div className="w-2 h-2 rounded-full security-pulse" style={{ backgroundColor: currentSecurity.color }}></div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center h-18">
                            {/* Security Logo */}
                            <div className="flex items-center cursor-pointer group">
                                {logoImage && (
                                    <div className="relative mr-4">
                                        <div className="security-border rounded-md p-2">
                                            <img src={logoImage} alt={logoText} className="h-8 w-8 rounded-sm object-cover" />
                                            {/* Security overlay */}
                                            <div
                                                className="absolute inset-0 rounded-md bg-gradient-to-br from-transparent via-current to-transparent opacity-20 pointer-events-none"
                                                style={{ color: currentSecurity.color }}></div>
                                        </div>
                                    </div>
                                )}
                                <div className="relative">
                                    <span className="text-xl font-bold tracking-wider security-text font-mono">🔒 {logoText}</span>
                                    <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-70 security-pulse"></div>
                                    {/* Authentication indicator */}
                                    <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full security-pulse" style={{ backgroundColor: currentSecurity.color }}></div>
                                </div>
                            </div>

                            {/* Desktop Menu - Security Style */}
                            <div className="hidden md:flex items-center space-x-1">
                                {menuList.map((item, index) => (
                                    <a
                                        key={index}
                                        href={`#${item.toLowerCase()}`}
                                        className="relative px-4 py-3 font-mono text-sm transition-all duration-300 group hover:scale-105"
                                        style={{ color: currentSecurity.color }}>
                                        <span className="relative z-10 flex items-center">
                                            <span className="mr-2 text-xs opacity-60">[{String(index + 1).padStart(2, '0')}]</span>
                                            {item}
                                            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">🔐</span>
                                        </span>

                                        {/* Security frame */}
                                        <div className="absolute inset-0 security-border rounded-md opacity-0 group-hover:opacity-100 transition-all duration-300">
                                            {/* Security indicators */}
                                            <div className="absolute -top-1 -left-1 w-2 h-2 border-l-2 border-t-2" style={{ borderColor: currentSecurity.color }}></div>
                                            <div className="absolute -top-1 -right-1 w-2 h-2 border-r-2 border-t-2" style={{ borderColor: currentSecurity.color }}></div>
                                            <div className="absolute -bottom-1 -left-1 w-2 h-2 border-l-2 border-b-2" style={{ borderColor: currentSecurity.color }}></div>
                                            <div className="absolute -bottom-1 -right-1 w-2 h-2 border-r-2 border-b-2" style={{ borderColor: currentSecurity.color }}></div>
                                        </div>

                                        {/* Security scan line */}
                                        <div className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-500" style={{ backgroundColor: currentSecurity.color }}></div>

                                        {/* Background encryption */}
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300" style={{ backgroundColor: currentSecurity.bg }}></div>
                                    </a>
                                ))}
                            </div>

                            {/* Mobile Menu Button - Security Style */}
                            <div className="md:hidden">
                                <button
                                    onClick={toggleMobileMenu}
                                    className="relative p-3 transition-all duration-300 hover:scale-110 focus:outline-none group security-border rounded-md"
                                    style={{ color: currentSecurity.color }}
                                    aria-label="Toggle mobile menu">
                                    <div className="security-glow absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    <div className="relative z-10 flex items-center font-mono text-xs">
                                        <span className="mr-1">🔐</span>
                                        {isMobileMenuOpen ? 'CLOSE' : 'MENU'}
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Mobile Menu - Security Style */}
                        <div
                            className={`md:hidden transition-all duration-500 ease-out ${
                                isMobileMenuOpen ? 'max-h-96 opacity-100 pb-4 translate-y-0' : 'max-h-0 opacity-0 overflow-hidden -translate-y-4'
                            }`}>
                            <div className="pt-4 space-y-2">
                                {menuList.map((item, index) => (
                                    <a
                                        key={index}
                                        href={`#${item.toLowerCase()}`}
                                        onClick={closeMobileMenu}
                                        className="relative block px-4 py-3 font-mono text-sm transition-all duration-300 hover:scale-[1.02] transform hover:translate-x-2 group security-border rounded-md"
                                        style={{
                                            color: currentSecurity.color,
                                            animationDelay: `${index * 100}ms`,
                                        }}>
                                        <span className="relative z-10 flex items-center justify-between">
                                            <span className="flex items-center">
                                                <span className="mr-2 text-xs opacity-60">[{String(index + 1).padStart(2, '0')}]</span>
                                                {item}
                                                <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">🔐</span>
                                            </span>
                                            <span className="text-xs opacity-60 font-mono">{generateEncryptionContent().slice(0, 6)}</span>
                                        </span>

                                        {/* Security background */}
                                        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-10 transition-all duration-300" style={{ backgroundColor: currentSecurity.bg }}></div>

                                        {/* Left security indicator */}
                                        <div
                                            className="absolute left-0 top-1/2 transform -translate-y-1/2 w-0 h-6 group-hover:w-1 transition-all duration-300"
                                            style={{ backgroundColor: currentSecurity.color }}></div>

                                        {/* Security status dots */}
                                        <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <div className="w-1 h-1 rounded-full security-pulse" style={{ backgroundColor: currentSecurity.color }}></div>
                                            <div className="w-1 h-1 rounded-full security-pulse" style={{ backgroundColor: currentSecurity.color, animationDelay: '0.2s' }}></div>
                                            <div className="w-1 h-1 rounded-full security-pulse" style={{ backgroundColor: currentSecurity.color, animationDelay: '0.4s' }}></div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Menu Overlay */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden fixed inset-0 bg-black/85 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={closeMobileMenu} style={{ top: '90px' }} />
                    )}
                </nav>
            </>
        );
    },
};

export default NavbarDarkCyberSec;
