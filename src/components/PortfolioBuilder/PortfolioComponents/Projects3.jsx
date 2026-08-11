import React from 'react';

// 🔒 SECURITY: Secure URL validator
const SecureUrl = {
    validate: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x300';
        const cleaned = url.trim();
        if (/^(javascript|data|vbscript|file):/i.test(cleaned)) return 'https://placehold.co/400x300';
        if (cleaned && !cleaned.match(/^https:\/\//i)) return 'https://placehold.co/400x300';
        return cleaned;
    },
};

// 🔒 SECURITY: Email validator and secure contact function
const SecureEmail = {
    validate: (email) => {
        if (typeof email !== 'string') return null;
        const cleaned = email.trim();
        if (!cleaned) return null;
        // Basic email validation
        if (!cleaned.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return null;
        return cleaned;
    },
    contact: (email) => {
        const validEmail = SecureEmail.validate(email);
        if (!validEmail) {
            console.warn('🔒 SECURITY: Invalid email format.');
            return;
        }
        const subject = encodeURIComponent('Project Inquiry - Cybersecurity Collaboration');
        const body = encodeURIComponent('Hello,\n\nI am interested in discussing potential cybersecurity projects or collaboration opportunities.\n\nBest regards');
        window.open(`mailto:${validEmail}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
    },
};

// 🔒 SECURITY: Secure text renderer
const SecureText = ({ children, className = '' }) => {
    if (typeof children !== 'string') return <span className={className}>{children}</span>;
    const escaped = children.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    return <span className={className} dangerouslySetInnerHTML={{ __html: escaped }} />;
};

const Projects3 = {
    fields: {
        title: { type: 'text', label: 'Section Title' },
        subtitle: { type: 'text', label: 'Section Subtitle' },
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
        projects: {
            type: 'array',
            label: 'Projects',
            getItemSummary: (item) => item.title,
            arrayFields: {
                title: { type: 'text', label: 'Project Title' },
                description: { type: 'textarea', label: 'Project Description' },
                image: { type: 'text', label: 'Project Image URL' },
                technologies: { type: 'text', label: 'Technologies (comma-separated)' },
                status: { type: 'text', label: 'Project Status' },
            },
            defaultItemProps: {
                title: 'New Project',
                description: 'Project description',
                image: 'https://placehold.co/400x300',
                technologies: 'React, JavaScript',
                status: 'Completed',
            },
        },
        email: { type: 'text', label: 'Contact Email' },
    },
    defaultProps: {
        title: 'Projects',
        subtitle: 'Code artifacts and digital creations',
        backgroundColor: 'bg-black',
        accentColor: 'cyan',
        projects: [
            {
                title: 'Neural Dashboard',
                description: 'AI-powered analytics dashboard with real-time data visualization and machine learning insights. Built with cutting-edge tech stack for maximum performance.',
                image: 'https://placehold.co/400x300',
                technologies: 'React, TypeScript, Python, TensorFlow, D3.js',
                status: 'Active',
            },
            {
                title: 'Quantum E-Commerce',
                description: 'Next-generation e-commerce platform with blockchain integration, smart contracts, and decentralized payment systems.',
                image: 'https://placehold.co/400x300',
                technologies: 'Next.js, Solidity, Web3.js, MongoDB, Redis',
                status: 'Beta',
            },
            {
                title: 'CyberChat Protocol',
                description: 'Encrypted real-time communication platform with end-to-end encryption and advanced security protocols.',
                image: 'https://placehold.co/400x300',
                technologies: 'Node.js, Socket.io, Cryptography, Docker',
                status: 'Completed',
            },
        ],
        email: 'alex.cybersec@example.com',
    },
    render: ({ title, subtitle, backgroundColor, accentColor, projects, email }) => {
        const accentColors = {
            cyan: {
                primary: 'from-cyan-400 to-blue-500',
                secondary: 'from-cyan-500 to-teal-500',
                border: 'border-cyan-400/30',
                text: 'text-cyan-400',
                glow: 'shadow-cyan-500/20',
                bg: 'bg-cyan-500/10',
                ring: 'ring-cyan-400/50',
            },
            purple: {
                primary: 'from-purple-400 to-violet-500',
                secondary: 'from-purple-500 to-fuchsia-500',
                border: 'border-purple-400/30',
                text: 'text-purple-400',
                glow: 'shadow-purple-500/20',
                bg: 'bg-purple-500/10',
                ring: 'ring-purple-400/50',
            },
            green: {
                primary: 'from-green-400 to-emerald-500',
                secondary: 'from-green-500 to-teal-500',
                border: 'border-green-400/30',
                text: 'text-green-400',
                glow: 'shadow-green-500/20',
                bg: 'bg-green-500/10',
                ring: 'ring-green-400/50',
            },
            pink: {
                primary: 'from-pink-400 to-rose-500',
                secondary: 'from-pink-500 to-purple-500',
                border: 'border-pink-400/30',
                text: 'text-pink-400',
                glow: 'shadow-pink-500/20',
                bg: 'bg-pink-500/10',
                ring: 'ring-pink-400/50',
            },
            yellow: {
                primary: 'from-yellow-400 to-orange-500',
                secondary: 'from-yellow-500 to-amber-500',
                border: 'border-yellow-400/30',
                text: 'text-yellow-400',
                glow: 'shadow-yellow-500/20',
                bg: 'bg-yellow-500/10',
                ring: 'ring-yellow-400/50',
            },
        };

        const colors = accentColors[accentColor] || accentColors.cyan;

        return (
            <div className="bg-black relative py-24 px-6 overflow-hidden min-h-screen" style={{ backgroundColor: '#000000' }}>
                {/* Animated Grid Background */}
                <div className="absolute inset-0 opacity-20">
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
                <div className={`absolute top-20 left-20 w-96 h-96 bg-gradient-to-r ${colors.primary} rounded-full blur-3xl opacity-20 animate-pulse`} />
                <div className={`absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-r ${colors.secondary} rounded-full blur-3xl opacity-15 animate-pulse delay-1000`} />

                {/* Floating Code Snippets */}
                <div className="absolute top-1/4 right-10 opacity-10 font-mono text-xs text-gray-400 animate-pulse">
                    <div>{'{ "projects": ['}</div>
                    <div className="ml-4">{'{ "status": "building..." }'}</div>
                    <div>{'] }'}</div>
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-20">
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className={`inline-flex items-center px-6 py-3 bg-white/5 backdrop-blur-md rounded-full border ${colors.border} shadow-2xl ${colors.glow}`}>
                                <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-3 animate-pulse`} />
                                <span className={`text-sm font-medium ${colors.text} uppercase tracking-wider font-mono`}>Projects.init()</span>
                            </div>
                            <div className={`h-px bg-gradient-to-r ${colors.primary} flex-1 max-w-20 opacity-50`} />
                        </div>

                        <h2 className="text-6xl md:text-7xl lg:text-8xl font-black text-white leading-none tracking-tighter mb-6">
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mb-2 font-mono">&lt;projects&gt;</span>
                            <span className={`bg-gradient-to-r ${colors.primary} bg-clip-text text-transparent`}>
                                <SecureText>{title}</SecureText>
                            </span>
                            <span className="block text-gray-500 text-3xl md:text-4xl font-light mt-2 font-mono">&lt;/projects&gt;</span>
                        </h2>
                        {subtitle && (
                            <p className="text-xl text-gray-400 max-w-4xl mx-auto leading-relaxed font-light">
                                <SecureText>{subtitle}</SecureText>
                            </p>
                        )}
                    </div>

                    {/* Projects Grid */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {projects &&
                            projects.map((project, index) => (
                                <div key={index} className="group relative">
                                    {/* Card Glow Effect */}
                                    <div className={`absolute -inset-4 bg-gradient-to-r ${colors.primary} opacity-20 rounded-3xl blur-xl group-hover:opacity-30 transition-all duration-500`} />

                                    {/* Main Card */}
                                    <div
                                        className={`relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-3xl border ${colors.border} shadow-2xl ${colors.glow} overflow-hidden hover:scale-[1.02] transition-all duration-300`}>
                                        {/* Code Editor Header */}
                                        <div className="flex items-center gap-2 p-4 pb-2 border-b border-white/10">
                                            <div className="w-3 h-3 bg-red-500 rounded-full" />
                                            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                            <div className="w-3 h-3 bg-green-500 rounded-full" />
                                            <div className="ml-4 text-gray-400 text-sm font-mono">{project.title.toLowerCase().replace(/\s+/g, '-')}.project</div>
                                            <div className="ml-auto">
                                                <span className={`px-2 py-1 bg-black/50 rounded-md border ${colors.border} font-mono text-xs ${colors.text}`}>{project.status}</span>
                                            </div>
                                        </div>

                                        {/* Project Image with Overlay */}
                                        <div className="relative overflow-hidden">
                                            <img
                                                src={SecureUrl.validate(project.image)}
                                                alt={project.title || 'Project'}
                                                className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110"
                                                onError={(e) => {
                                                    e.target.src = 'https://placehold.co/400x300';
                                                }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                            {/* Status Indicator */}
                                            <div className="absolute top-4 right-4">
                                                <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full animate-pulse ring-2 ${colors.ring}`} />
                                            </div>
                                        </div>

                                        {/* Card Content */}
                                        <div className="p-6 space-y-4">
                                            {/* Title */}
                                            <h3 className="text-2xl font-bold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-blue-500 transition-all duration-300">
                                                <SecureText>{project.title || 'Untitled Project'}</SecureText>
                                            </h3>

                                            {/* Description */}
                                            <p className="text-gray-300 text-sm leading-relaxed">
                                                <SecureText>{project.description || 'No description available'}</SecureText>
                                            </p>

                                            {/* Technologies */}
                                            <div className="space-y-2">
                                                <h5 className={`font-mono text-xs ${colors.text} uppercase tracking-wider`}>tech_stack:</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {project.technologies &&
                                                        project.technologies.split(',').map((tech, techIndex) => (
                                                            <span
                                                                key={techIndex}
                                                                className={`px-3 py-1 bg-black/50 border ${colors.border} rounded-lg text-xs font-mono text-gray-300 hover:${colors.bg} hover:scale-105 transition-all duration-200 cursor-default`}>
                                                                {tech.trim()}
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>

                                            {/* Code Snippet Decoration */}
                                            <div className="pt-2 border-t border-white/10">
                                                <div className="font-mono text-xs text-gray-500 space-y-1">
                                                    <div>
                                                        <span className="text-purple-400">const</span> <span className="text-yellow-400">project</span> <span className="text-white">=</span>{' '}
                                                        <span className="text-white">{'{'}</span>
                                                    </div>
                                                    <div className="ml-4">
                                                        <span className={colors.text}>status:</span> <span className="text-green-300">"{project.status}"</span>
                                                    </div>
                                                    <div className="text-white">{'}'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Contact CTA */}
                    {email && (
                        <div className="text-center mt-20">
                            <button
                                onClick={() => SecureEmail.contact(email)}
                                className={`inline-flex items-center px-8 py-4 bg-white/5 backdrop-blur-md rounded-2xl border ${colors.border} shadow-2xl ${colors.glow} hover:${colors.bg} transition-all duration-300 cursor-pointer group`}>
                                <div className={`w-3 h-3 bg-gradient-to-r ${colors.primary} rounded-full mr-4 animate-pulse`} />
                                <span className="text-gray-300 font-mono mr-4">~/contact_for_projects</span>
                                <svg className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    },
};

export default Projects3;
