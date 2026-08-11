import React from 'react';

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Footer3 = {
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
        accentColor: {
            type: 'select',
            label: 'Accent Color',
            options: [
                { value: 'cyan', label: 'Cyan Neon' },
                { value: 'purple', label: 'Purple Neon' },
                { value: 'green', label: 'Green Neon' },
                { value: 'pink', label: 'Pink Neon' },
                { value: 'yellow', label: 'Yellow Neon' },
            ],
        },
    },
    defaultProps: {
        companyName: 'CyberPort',
        description: 'Crafting digital experiences at the intersection of innovation and artistry. Building the future, one line of code at a time.',
        tagline: 'Coding the future into existence',
        email: 'connect@cyberport.dev',
        phone: '+1 (555) CYBER-01',
        address: 'Digital Realm\nCyberspace Sector 7\nQuantum Building 42',
        socialLinks: 'GitHub|https://github.com\nLinkedIn|https://linkedin.com\nTwitter|https://twitter.com\nDribbble|https://dribbble.com',
        quickLinks: 'About\nProjects\nServices\nExperience\nContact',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
    },
    render: ({ companyName, description, tagline, email, phone, address, socialLinks, quickLinks, backgroundColor, accentColor }) => {
        const accentColors = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'from-cyan-500 to-teal-500',
                border: 'border-cyan-400/30',
                text: 'text-cyan-400',
                glow: 'shadow-cyan-500/20',
                bg: 'bg-cyan-500/10',
                hover: 'hover:text-cyan-300',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'from-purple-500 to-fuchsia-500',
                border: 'border-purple-400/30',
                text: 'text-purple-400',
                glow: 'shadow-purple-500/20',
                bg: 'bg-purple-500/10',
                hover: 'hover:text-purple-300',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'from-green-500 to-teal-500',
                border: 'border-green-400/30',
                text: 'text-green-400',
                glow: 'shadow-green-500/20',
                bg: 'bg-green-500/10',
                hover: 'hover:text-green-300',
            },
            pink: {
                primary: 'from-pink-400 to-rose-500',
                secondary: 'from-pink-500 to-purple-500',
                border: 'border-pink-400/30',
                text: 'text-pink-400',
                glow: 'shadow-pink-500/20',
                bg: 'bg-pink-500/10',
                hover: 'hover:text-pink-300',
            },
            yellow: {
                primary: 'from-yellow-400 to-orange-500',
                secondary: 'from-yellow-500 to-amber-500',
                border: 'border-yellow-400/30',
                text: 'text-yellow-400',
                glow: 'shadow-yellow-500/20',
                bg: 'bg-yellow-500/10',
                hover: 'hover:text-yellow-300',
            },
        };

        const colors = accentColors[accentColor] || accentColors.cyan;

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

        return (
            <footer className="bg-black relative py-16 px-6 overflow-hidden" style={{ backgroundColor: '#000000' }}>
                {/* Animated Grid Background */}
                <div className="absolute inset-0 opacity-10">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
                                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                            `,
                            backgroundSize: '50px 50px',
                        }}
                    />
                </div>

                {/* Animated Orbs */}
                <div className={`absolute top-10 left-10 w-64 h-64 bg-gradient-to-r ${colors.primary} rounded-full blur-3xl opacity-20 animate-pulse`} />
                <div className={`absolute bottom-10 right-10 w-48 h-48 bg-gradient-to-r ${colors.secondary} rounded-full blur-3xl opacity-15 animate-pulse delay-1000`} />

                {/* Floating Code Snippets */}
                <div className="absolute top-8 right-8 opacity-10 font-mono text-xs text-gray-400 animate-pulse">
                    <div>{'</> footer {'}</div>
                    <div className="ml-4">status: "active"</div>
                    <div>{'}'}</div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Header Section */}
                    <div className="text-center mb-16">
                        <div className={`inline-flex items-center px-6 py-3 bg-white/5 backdrop-blur-md rounded-full border ${colors.border} shadow-2xl ${colors.glow} mb-8`}>
                            <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-3 animate-pulse`} />
                            <span className={`text-sm font-medium ${colors.text} uppercase tracking-wider font-mono`}>Connection.establish()</span>
                        </div>

                        <h2 className="text-4xl md:text-5xl font-black text-white leading-none tracking-tighter mb-4">
                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                <SecureText>{companyName}</SecureText>
                            </span>
                        </h2>
                        {tagline && (
                            <p className={`text-lg ${colors.text} font-mono italic mb-6`}>
                                <SecureText>{tagline}</SecureText>
                            </p>
                        )}
                        <div className={`h-px bg-gradient-to-r ${colors.primary} mx-auto max-w-32 opacity-50`} />
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
                        {/* Company Info */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className={`bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-4 h-4 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                    <h3 className="text-xl font-bold text-white font-mono">System.info()</h3>
                                </div>
                                <p className="text-gray-300 leading-relaxed mb-6">
                                    <SecureText>{description}</SecureText>
                                </p>

                                {/* Social Links as Code */}
                                <div className="space-y-2">
                                    <div className={`font-mono text-sm ${colors.text}`}>social_links = {'{'}</div>
                                    <div className="ml-4 space-y-1">
                                        {socialList.map((social, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <span className="text-purple-400 font-mono text-sm">"{social.platform}":</span>
                                                <a
                                                    href={social.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`text-green-300 ${colors.hover} transition-colors duration-200 font-mono text-sm hover:underline`}>
                                                    "{social.url}"
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-white font-mono text-sm">{'}'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Links */}
                        <div className="space-y-6">
                            <div className={`bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-4 h-4 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                    <h4 className="text-lg font-bold text-white font-mono">Navigation[]</h4>
                                </div>
                                <ul className="space-y-3">
                                    {linksList.map((link, index) => (
                                        <li key={index} className="flex items-center gap-3 group">
                                            <span className={`${colors.text} text-sm group-hover:scale-125 transition-transform`}>▶</span>
                                            <a href={`#${link.toLowerCase()}`} className={`text-gray-300 ${colors.hover} transition-colors duration-200 font-mono text-sm`}>
                                                {link}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-6">
                            <div className={`bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md p-6 rounded-2xl border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-4 h-4 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                    <h4 className="text-lg font-bold text-white font-mono">Contact()</h4>
                                </div>
                                <div className="space-y-4 text-sm">
                                    <div className="font-mono">
                                        <div className="text-purple-400">const contact = {'{'}</div>
                                        <div className="ml-4 space-y-2">
                                            <div>
                                                <span className={colors.text}>email:</span> <span className="text-green-300">"{email}"</span>
                                            </div>
                                            <div>
                                                <span className={colors.text}>phone:</span> <span className="text-green-300">"{phone}"</span>
                                            </div>
                                            <div>
                                                <span className={colors.text}>location:</span> <span className="text-green-300">"{address?.replace(/\n/g, ', ')}"</span>
                                            </div>
                                        </div>
                                        <div className="text-purple-400">{'}'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Section */}
                    <div className={`border-t ${colors.border} pt-8`}>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-gray-400 font-mono text-sm">
                                © {new Date().getFullYear()} <SecureText>{companyName}</SecureText> - All systems operational
                            </div>
                            <div className="flex items-center gap-4">
                                <div className={`flex items-center gap-2 px-4 py-2 bg-black/50 rounded-lg border ${colors.border}`}>
                                    <div className={`w-2 h-2 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse`} />
                                    <span className={`font-mono text-xs ${colors.text}`}>Status: Online</span>
                                </div>
                                <div className="font-mono text-xs text-gray-500">
                                    Build: v{new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        );
    },
};

export default Footer3;
