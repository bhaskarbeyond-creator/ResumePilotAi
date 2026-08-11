import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/80x80';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/80x80';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/80x80';
        return cleaned;
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children }) => {
    if (typeof children !== 'string') return children;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return escaped;
};

const Awards1 = {
    render: ({ title, subtitle, awards, backgroundColor = 'bg-yellow-50', accentColor = 'yellow' }) => {
        // Color theme mapping for different accent colors
        const colorThemes = {
            yellow: {
                bg: 'bg-yellow-50',
                primary: 'text-yellow-600',
                secondary: 'text-yellow-800',
                gradient: 'from-yellow-400 to-orange-400',
                badge: 'bg-yellow-100 text-yellow-800',
                light: 'text-yellow-100',
                hover: 'hover:text-yellow-800',
            },
            cyan: {
                bg: 'bg-gradient-to-br from-gray-900 via-black to-gray-800',
                primary: 'text-cyan-400',
                secondary: 'text-cyan-300',
                gradient: 'from-cyan-400 to-cyan-600',
                badge: 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30',
                light: 'text-cyan-100',
                hover: 'hover:text-cyan-300',
                card: 'bg-black/50 border border-cyan-400/30',
                text: 'text-white',
                textSecondary: 'text-gray-300',
                glow: 'shadow-cyan-500/20',
            },
            blue: {
                bg: 'bg-blue-50',
                primary: 'text-blue-600',
                secondary: 'text-blue-800',
                gradient: 'from-blue-400 to-indigo-500',
                badge: 'bg-blue-100 text-blue-800',
                light: 'text-blue-100',
                hover: 'hover:text-blue-800',
            },
            purple: {
                bg: 'bg-purple-50',
                primary: 'text-purple-600',
                secondary: 'text-purple-800',
                gradient: 'from-purple-400 to-violet-500',
                badge: 'bg-purple-100 text-purple-800',
                light: 'text-purple-100',
                hover: 'hover:text-purple-800',
            },
        };

        const theme = colorThemes[accentColor] || colorThemes.yellow;
        const isDarkTheme = accentColor === 'cyan';

        return (
            <div className={`py-16 px-4 ${backgroundColor || theme.bg} ${isDarkTheme ? 'min-h-screen' : ''}`}>
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className={`text-3xl font-bold mb-4 ${isDarkTheme ? theme.text : 'text-gray-800'}`}>
                            <SecureText>{title}</SecureText>
                        </h2>
                        {subtitle && (
                            <p className={`text-lg ${isDarkTheme ? theme.textSecondary : 'text-gray-600'}`}>
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {awards &&
                            awards.map((award, index) => (
                                <div
                                    key={index}
                                    className={`${isDarkTheme ? theme.card : 'bg-white'} rounded-lg shadow-lg p-6 text-center transform hover:scale-105 transition-all duration-300 ${
                                        isDarkTheme ? theme.glow : ''
                                    } backdrop-blur-sm`}>
                                    <div className="mb-6">
                                        <div className="text-6xl mb-4">
                                            <SecureText>{award.icon}</SecureText>
                                        </div>
                                        {award.image && (
                                            <img
                                                src={SecureUrl.validate(award.image)}
                                                alt={award.title || 'Award'}
                                                className={`w-16 h-16 mx-auto rounded-lg object-cover ${isDarkTheme ? 'border border-cyan-400/30' : ''}`}
                                                onError={(e) => {
                                                    e.target.src = 'https://placehold.co/80x80';
                                                }}
                                            />
                                        )}
                                    </div>

                                    <div className="mb-4">
                                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 ${theme.badge}`}>
                                            <SecureText>{award.category ? award.category.toUpperCase() : 'CERTIFICATION'}</SecureText>
                                        </span>
                                    </div>

                                    <h3 className={`text-xl font-bold mb-2 ${isDarkTheme ? theme.text : 'text-gray-800'}`}>
                                        <SecureText>{award.title}</SecureText>
                                    </h3>
                                    <h4 className={`text-lg font-semibold mb-2 ${theme.primary}`}>
                                        <SecureText>{award.organization}</SecureText>
                                    </h4>
                                    <p className={`text-sm mb-4 ${isDarkTheme ? theme.textSecondary : 'text-gray-600'}`}>
                                        <SecureText>{award.description}</SecureText>
                                    </p>

                                    <div className="flex justify-between items-center">
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${theme.badge}`}>
                                            <SecureText>{award.date}</SecureText>
                                        </span>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Achievement Summary */}
                    <div
                        className={`mt-16 bg-gradient-to-r ${theme.gradient} rounded-lg p-8 text-center ${isDarkTheme ? 'border border-cyan-400/30 shadow-lg shadow-cyan-500/20' : ''}`}
                        style={isDarkTheme ? { backgroundImage: 'linear-gradient(to right, rgb(34 211 238), rgb(8 145 178))' } : {}}>
                        <h3 className="text-2xl font-bold text-white mb-4">Achievement Highlights</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <div className="text-3xl font-bold text-white">{awards ? awards.length : 0}</div>
                                <div className={theme.light}>Total Awards</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{awards ? awards.filter((a) => a.category === 'professional').length : 0}</div>
                                <div className={theme.light}>Professional</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{awards ? awards.filter((a) => a.category === 'certification').length : 0}</div>
                                <div className={theme.light}>Certifications</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{awards ? awards.filter((a) => a.category === 'competition').length : 0}</div>
                                <div className={theme.light}>Competitions</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Awards1;
