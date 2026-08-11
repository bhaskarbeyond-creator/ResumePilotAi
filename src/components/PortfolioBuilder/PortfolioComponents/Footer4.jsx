import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Footer4 = {
    fields: {
        companyName: { type: 'text', label: 'Company/Name' },
        description: { type: 'textarea', label: 'Description' },
        tagline: { type: 'text', label: 'Tagline' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        address: { type: 'textarea', label: 'Address' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        quickLinks: { type: 'textarea', label: 'Quick Links (one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Theme',
            options: [
                { value: 'bg-black', label: 'Pure Black' },
                { value: 'bg-gradient-to-br from-gray-900 via-black to-gray-800', label: 'Midnight Black' },
                { value: 'bg-gradient-to-br from-slate-900 via-gray-900 to-black', label: 'Slate Dark' },
                { value: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900', label: 'Carbon Dark' },
                { value: 'bg-gradient-to-br from-purple-900 via-gray-900 to-black', label: 'Deep Purple' },
            ],
        },
        terminalTheme: {
            type: 'select',
            label: 'Terminal Theme',
            options: [
                { value: 'matrix', label: 'Matrix (Green)' },
                { value: 'hacker', label: 'Hacker (Amber)' },
                { value: 'retro', label: 'Retro (Blue)' },
                { value: 'cyberpunk', label: 'Cyberpunk (Purple)' },
            ],
        },
    },
    defaultProps: {
        companyName: 'TerminalPort',
        description: 'Executing digital solutions with precision and efficiency. Every command crafted for optimal performance.',
        tagline: 'root@future:~$ innovation --execute',
        email: 'admin@terminalport.dev',
        phone: '+1 (800) TERM-CMD',
        address: 'Terminal District\n/home/cyber/workspace\nServer Room 404',
        socialLinks: 'GitHub|https://github.com\nLinkedIn|https://linkedin.com\nTwitter|https://twitter.com\nStack|https://stackoverflow.com',
        quickLinks: 'About\nProjects\nServices\nExperience\nContact',
        backgroundColor: 'bg-black',
        terminalTheme: 'matrix',
    },
    render: ({ companyName, description, tagline, email, phone, address, socialLinks, quickLinks, backgroundColor, terminalTheme }) => {
        const terminalThemes = {
            matrix: {
                primary: 'text-green-400',
                secondary: 'text-green-300',
                accent: 'text-green-500',
                bg: 'bg-green-500/10',
                border: 'border-green-500/30',
                glow: 'shadow-green-500/20',
            },
            hacker: {
                primary: 'text-amber-400',
                secondary: 'text-amber-300',
                accent: 'text-amber-500',
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/30',
                glow: 'shadow-amber-500/20',
            },
            retro: {
                primary: 'text-blue-400',
                secondary: 'text-blue-300',
                accent: 'text-blue-500',
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/30',
                glow: 'shadow-blue-500/20',
            },
            cyberpunk: {
                primary: 'text-purple-400',
                secondary: 'text-purple-300',
                accent: 'text-purple-500',
                bg: 'bg-purple-500/10',
                border: 'border-purple-500/30',
                glow: 'shadow-purple-500/20',
            },
        };

        const theme = terminalThemes[terminalTheme] || terminalThemes.matrix;

        const socialList = socialLinks
            ? Array.isArray(socialLinks)
                ? socialLinks // Already an array of objects
                : socialLinks
                      .split('\n')
                      .filter((item) => item.trim())
                      .map((item) => {
                          const [platform, url] = item.split('|');
                          return { platform: platform?.trim(), url: url?.trim() };
                      })
            : [];

        const linksList = quickLinks ? quickLinks.split('\n').filter((item) => item.trim()) : [];

        const currentDate = new Date();
        const timestamp = `${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}:${String(currentDate.getSeconds()).padStart(2, '0')}`;

        return (
            <footer className="bg-black relative py-16 px-6 overflow-hidden" style={{ backgroundColor: '#000000' }}>
                {/* Matrix Binary Background */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 font-mono text-xs text-gray-400 leading-tight">
                        {Array.from({ length: 30 }, (_, i) => (
                            <div key={i} className="whitespace-nowrap animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
                                {Array.from({ length: 200 }, () => (Math.random() > 0.5 ? '1' : '0')).join('')}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scanline Effect */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-1 animate-pulse" style={{ animation: 'scanline 4s linear infinite' }} />
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Terminal Header */}
                    <div className="mb-12">
                        <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} p-6`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>footer.terminal - {timestamp}</div>
                            </div>

                            <div className="space-y-2">
                                <div className={`font-mono text-sm ${theme.primary}`}>root@portfolio:~/footer# cat company_info.txt</div>
                                <div className="border-l-2 border-gray-700 pl-4 space-y-1">
                                    <div className="text-4xl md:text-5xl font-bold text-white">
                                        <SecureText>{companyName}</SecureText>
                                    </div>
                                    {tagline && (
                                        <div className={`font-mono ${theme.secondary} italic`}>
                                            # <SecureText>{tagline}</SecureText>
                                        </div>
                                    )}
                                    <div className="text-gray-300 mt-4">
                                        <SecureText>{description}</SecureText>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Terminal Windows Grid */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {/* Navigation Terminal */}
                        <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} overflow-hidden`}>
                            <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>navigation.sh</div>
                            </div>
                            <div className="p-4 space-y-2">
                                <div className={`font-mono text-sm ${theme.primary}`}>$ ls -la navigation/</div>
                                <div className="space-y-1">
                                    {linksList.map((link, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <span className={`font-mono text-xs ${theme.secondary}`}>-rwxr-xr-x 1 root</span>
                                            <a href={`#${link.toLowerCase()}`} className={`font-mono text-sm ${theme.primary} hover:${theme.accent} transition-colors duration-200`}>
                                                {link.toLowerCase()}
                                            </a>
                                        </div>
                                    ))}
                                </div>
                                <div className={`font-mono text-sm ${theme.primary} opacity-50 animate-pulse`}>$ _</div>
                            </div>
                        </div>

                        {/* Contact Terminal */}
                        <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} overflow-hidden`}>
                            <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>contact.json</div>
                            </div>
                            <div className="p-4 space-y-2">
                                <div className={`font-mono text-sm ${theme.primary}`}>$ cat contact.json</div>
                                <div className="font-mono text-sm space-y-1">
                                    <div className="text-white">{'{'}</div>
                                    <div className="ml-4 space-y-1">
                                        <div>
                                            <span className={theme.accent}>"email":</span> <span className="text-green-300">"{email}"</span>
                                        </div>
                                        <div>
                                            <span className={theme.accent}>"phone":</span> <span className="text-green-300">"{phone}"</span>
                                        </div>
                                        <div>
                                            <span className={theme.accent}>"location":</span> <span className="text-green-300">"{address?.replace(/\n/g, ', ')}"</span>
                                        </div>
                                    </div>
                                    <div className="text-white">{'}'}</div>
                                </div>
                                <div className={`font-mono text-sm ${theme.primary} opacity-50 animate-pulse`}>$ _</div>
                            </div>
                        </div>

                        {/* Social Links Terminal */}
                        <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} overflow-hidden`}>
                            <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>social.sh</div>
                            </div>
                            <div className="p-4 space-y-2">
                                <div className={`font-mono text-sm ${theme.primary}`}>$ ./connect_social.sh</div>
                                <div className="space-y-1">
                                    {socialList.map((social, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <span className={`font-mono text-xs ${theme.secondary}`}>→</span>
                                            <span className={`font-mono text-sm ${theme.accent}`}>{social.platform}:</span>
                                            <a
                                                href={social.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`font-mono text-sm ${theme.primary} hover:underline transition-colors duration-200`}>
                                                connect
                                            </a>
                                        </div>
                                    ))}
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>{socialList.length} connections established</div>
                                <div className={`font-mono text-sm ${theme.primary} opacity-50 animate-pulse`}>$ _</div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Status Terminal */}
                    <div className={`bg-black/90 backdrop-blur-sm rounded-lg border ${theme.border} shadow-2xl ${theme.glow} p-6`}>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className={`font-mono text-sm ${theme.primary}`}>$ uptime</div>
                                <div className={`font-mono text-sm ${theme.secondary}`}>
                                    © {new Date().getFullYear()} <SecureText>{companyName}</SecureText> - System online since startup
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 bg-green-500 rounded-full animate-pulse`} />
                                    <span className={`font-mono text-xs ${theme.primary}`}>STATUS: OPERATIONAL</span>
                                </div>
                                <div className={`font-mono text-xs ${theme.secondary}`}>[{timestamp}] All services running</div>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700/50">
                            <div className={`font-mono text-xs ${theme.secondary} text-center`}>
                                Last login: {currentDate.toLocaleDateString()} {timestamp} from portfolio.terminal
                            </div>
                        </div>
                    </div>
                </div>

                <style jsx>{`
                    @keyframes scanline {
                        0% {
                            top: 0%;
                        }
                        100% {
                            top: 100%;
                        }
                    }
                `}</style>
            </footer>
        );
    },
};

export default Footer4;
