import React from 'react';
import {
    ContactList,
    EmptyWebCv,
    NavLinks,
    Portrait,
    SafeLink,
    Section,
    SkipLink,
    formatRange,
    usePortfolioView,
} from './shared.jsx';

export default function PremiumTech({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'premiumTech');
    if (!visibility.heading && !visibility.about && !visibility.projects) {
        return <EmptyWebCv />;
    }

    const expCount = data.experiences?.filter(e => e.jobTitle || e.employer).length || 0;
    const projectCount = data.projects?.filter(p => p.title).length || 0;
    const skillCount = data.skills?.length || 0;

    return (
        <div className="webcv-tech min-h-screen w-full max-w-full overflow-x-hidden bg-[#070A13] text-slate-100 selection:bg-sky-500 selection:text-black" data-webcv-template="premiumTech">
            <SkipLink />
            
            {/* Ambient Background Lighting Mesh */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-indigo-600/15 via-sky-600/10 to-transparent blur-[120px]" />
                <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-sky-600/10 via-cyan-600/5 to-transparent blur-[100px]" />
                <div className="absolute -bottom-40 right-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-t from-violet-600/10 to-transparent blur-[120px]" />
            </div>

            <div className="relative mx-auto grid max-w-7xl lg:grid-cols-[16rem_1fr]">
                {/* Desktop Sticky Tech Sidebar */}
                <aside className="hidden border-r border-white/5 px-6 py-10 lg:block min-h-screen">
                    <div className="sticky top-10 space-y-8">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-sky-400 ring-4 ring-sky-400/20 animate-pulse" />
                                <span className="font-tech-mono text-[11px] font-semibold uppercase tracking-wider text-sky-400">Available Now</span>
                            </div>
                            <p className="mt-3 font-bold text-lg text-white tracking-tight">{name || 'Tech Portfolio'}</p>
                            {data.heading.occupation && (
                                <p className="text-xs text-slate-400 font-medium mt-0.5">{data.heading.occupation}</p>
                            )}
                        </div>

                        {/* Navigation Links */}
                        <NavLinks 
                            visibility={visibility} 
                            className="flex flex-col gap-2 font-tech-mono text-xs text-slate-400" 
                            linkClassName="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-sky-300 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400" 
                        />

                        {/* Tech Quick Stats */}
                        <div className="rounded-xl border border-white/5 bg-[#0C1220]/80 p-4 space-y-3 font-tech-mono text-xs">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Metrics</p>
                            <div className="flex justify-between text-slate-300">
                                <span>Roles</span>
                                <span className="text-sky-400 font-semibold">{expCount}</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                                <span>Projects</span>
                                <span className="text-sky-400 font-semibold">{projectCount}</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                                <span>Tech Stack</span>
                                <span className="text-sky-400 font-semibold">{skillCount}</span>
                            </div>
                        </div>

                        {/* Contact Trigger */}
                        {data.heading.email && (
                            <SafeLink 
                                href={data.heading.email} 
                                kind="email" 
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-indigo-500 transition-all hover:scale-[1.02] active:scale-95"
                            >
                                <span>Deploy Message</span>
                                <span>↗</span>
                            </SafeLink>
                        )}
                    </div>
                </aside>

                {/* Main Tech Content Area */}
                <div className="min-w-0">
                    {/* Mobile Header Bar */}
                    <header className="sticky top-0 z-20 flex min-w-0 items-center justify-between gap-3 border-b border-white/5 bg-[#070A13]/90 backdrop-blur-md px-6 py-4 lg:hidden">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2 w-2 rounded-full bg-sky-400 shrink-0" />
                            <p className="truncate text-sm font-bold text-white">{name}</p>
                        </div>
                        <NavLinks 
                            visibility={visibility} 
                            className="flex max-w-[60%] shrink-0 gap-2 overflow-x-auto text-xs text-slate-400 font-tech-mono" 
                            linkClassName="whitespace-nowrap rounded px-2 py-1 hover:text-white" 
                        />
                    </header>

                    <main id="main" className="px-6 pb-20 pt-10 md:px-12 md:pt-16">
                        {/* High-Tech Hero Section */}
                        <section className="grid gap-10 pb-16 md:grid-cols-[1.35fr_auto] md:items-center border-b border-white/5">
                            <div className="min-w-0 space-y-6">
                                {/* Terminal Prompt Indicator */}
                                <div className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1 font-tech-mono text-xs text-sky-300 shadow-sm">
                                    <span className="text-sky-400">$</span>
                                    <span>{data.heading.occupation || 'developer.init()'}</span>
                                </div>

                                <div>
                                    {name && (
                                        <h1 className="break-words text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight">
                                            {name}
                                        </h1>
                                    )}
                                    {data.extras.tagline && data.extras.tagline !== data.heading.occupation && (
                                        <p className="mt-3 text-lg sm:text-xl font-normal text-slate-300 leading-relaxed max-w-2xl">
                                            {data.extras.tagline}
                                        </p>
                                    )}
                                </div>

                                {data.summary && (
                                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl font-normal">
                                        {data.summary}
                                    </p>
                                )}

                                {location && (
                                    <p className="font-tech-mono text-xs text-slate-400">
                                        📍 geo: {location}
                                    </p>
                                )}

                                {/* Interactive Tech Links */}
                                <div className="flex flex-wrap items-center gap-3 pt-2">
                                    {data.heading.email && (
                                        <SafeLink href={data.heading.email} kind="email" className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0C1220] px-3.5 py-2 font-tech-mono text-xs text-slate-200 hover:border-sky-500/50 hover:text-sky-300 transition-all">
                                            <span>✉️ {data.heading.email}</span>
                                        </SafeLink>
                                    )}
                                    {data.heading.github && (
                                        <SafeLink href={data.heading.github} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0C1220] px-3.5 py-2 font-tech-mono text-xs text-slate-200 hover:border-sky-500/50 hover:text-sky-300 transition-all">
                                            <span>GitHub ↗</span>
                                        </SafeLink>
                                    )}
                                    {data.heading.linkedin && (
                                        <SafeLink href={data.heading.linkedin} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0C1220] px-3.5 py-2 font-tech-mono text-xs text-slate-200 hover:border-sky-500/50 hover:text-sky-300 transition-all">
                                            <span>LinkedIn ↗</span>
                                        </SafeLink>
                                    )}
                                    {data.heading.website && (
                                        <SafeLink href={data.heading.website} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0C1220] px-3.5 py-2 font-tech-mono text-xs text-slate-200 hover:border-sky-500/50 hover:text-sky-300 transition-all">
                                            <span>Live Web ↗</span>
                                        </SafeLink>
                                    )}
                                </div>
                            </div>

                            {/* Tech Avatar Frame */}
                            <div className="flex justify-center md:justify-end">
                                {data.heading.photo ? (
                                    <div className="relative group">
                                        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500 to-indigo-600 opacity-60 blur-md transition duration-500 group-hover:opacity-100" />
                                        <Portrait 
                                            src={data.heading.photo} 
                                            name={name} 
                                            className="relative h-48 w-48 sm:h-56 sm:w-56 rounded-2xl object-cover border-2 border-white/20 bg-[#0C1220] shadow-2xl" 
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-44 w-44 sm:h-52 sm:w-52 flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0C1220] p-6 text-center font-tech-mono shadow-xl">
                                        <span className="text-3xl text-sky-400 mb-2">⚡</span>
                                        <p className="text-xs font-bold text-white uppercase tracking-wider">{name || 'Tech'}</p>
                                        <p className="text-[10px] text-slate-500 mt-1">{data.heading.occupation || 'Engineer'}</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Featured Systems & Projects (Bento Grid) */}
                        <Section 
                            id="projects" 
                            title="Featured Systems & Projects" 
                            show={visibility.projects} 
                            className="py-16 border-b border-white/5" 
                            headingClassName="text-xl sm:text-2xl font-bold text-white tracking-tight"
                            eyebrow="// ARCHITECTURE & PRODUCTS"
                        >
                            <div className="mt-8 grid gap-6 sm:grid-cols-2">
                                {data.projects.filter((p) => p.title || p.description).map((project, idx) => (
                                    <article 
                                        key={project.id} 
                                        className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0D1424]/80 p-6 sm:p-7 backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-sky-500/40 hover:shadow-[0_0_30px_rgba(14,165,233,0.15)] hover:-translate-y-1"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="font-tech-mono text-[11px] text-sky-400">
                                                    SYS_{String(idx + 1).padStart(2, '0')}
                                                </span>
                                                {project.link && (
                                                    <SafeLink 
                                                        href={project.link} 
                                                        className="inline-flex items-center gap-1 font-tech-mono text-xs text-sky-300 hover:text-white transition-colors"
                                                    >
                                                        <span>Launch</span>
                                                        <span className="transition-transform group-hover:translate-x-0.5">↗</span>
                                                    </SafeLink>
                                                )}
                                            </div>

                                            <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-sky-300 transition-colors">
                                                {project.title}
                                            </h3>

                                            {project.description && (
                                                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300">
                                                    {project.description}
                                                </p>
                                            )}
                                        </div>

                                        {project.technologyList.length > 0 && (
                                            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap gap-1.5 font-tech-mono">
                                                {project.technologyList.map((tech, tIdx) => (
                                                    <span 
                                                        key={tIdx} 
                                                        className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200"
                                                    >
                                                        {tech}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </Section>

                        {/* Engineering Experience */}
                        <Section 
                            id="experience" 
                            title="Engineering & Leadership Experience" 
                            show={visibility.experience} 
                            className="py-16 border-b border-white/5" 
                            headingClassName="text-xl sm:text-2xl font-bold text-white tracking-tight"
                            eyebrow="// CAREER TIMELINE"
                        >
                            <div className="mt-8 space-y-6">
                                {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                                    <article 
                                        key={item.id} 
                                        className="rounded-2xl border border-white/10 bg-[#0D1424]/70 p-6 sm:p-7 backdrop-blur-md transition-all hover:border-white/20"
                                    >
                                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                                            <div>
                                                <h3 className="text-lg font-bold text-white">{item.jobTitle}</h3>
                                                {item.employer && (
                                                    <p className="font-tech-mono text-xs text-sky-400 mt-0.5">{item.employer}</p>
                                                )}
                                            </div>
                                            <span className="font-tech-mono text-xs text-slate-400 rounded-md bg-white/5 px-2.5 py-1">
                                                {formatRange(item.begin, item.end)}
                                            </span>
                                        </div>

                                        {item.description && (
                                            <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                                                {item.description}
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </Section>

                        {/* Technical Stack (Skills) */}
                        <Section 
                            id="skills" 
                            title="Technical Stack & Competencies" 
                            show={visibility.skills} 
                            className="py-16 border-b border-white/5" 
                            headingClassName="text-xl sm:text-2xl font-bold text-white tracking-tight"
                            eyebrow="// SKILLS MATRIX"
                        >
                            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                {data.skills.map((skill, idx) => (
                                    <div 
                                        key={skill.id || idx} 
                                        className="rounded-xl border border-white/10 bg-[#0D1424] p-4 transition-all hover:border-sky-500/40 hover:bg-[#0F172A]"
                                    >
                                        <p className="truncate font-tech-mono text-xs font-semibold text-white">{skill.name}</p>
                                        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                                            <div 
                                                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" 
                                                style={{ width: `${Math.max(25, Math.min(100, skill.rating || 85))}%` }} 
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        {/* Education & Certifications */}
                        <div className="py-16 border-b border-white/5 grid gap-8 md:grid-cols-2">
                            {/* Academic Education */}
                            <Section 
                                id="education" 
                                title="Academic Background" 
                                show={visibility.education} 
                                headingClassName="text-lg font-bold text-white"
                                eyebrow="// DEGREES & ALMA MATER"
                            >
                                <div className="mt-6 space-y-4">
                                    {data.education.filter((item) => item.school || item.degree).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-white/10 bg-[#0D1424]/80 p-5">
                                            <h3 className="font-bold text-white text-sm sm:text-base">{item.degree || item.school}</h3>
                                            {item.school && <p className="font-tech-mono text-xs text-sky-400 mt-1">{item.school}</p>}
                                            {formatRange(item.started, item.finished) && (
                                                <p className="font-tech-mono text-[11px] text-slate-500 mt-0.5">{formatRange(item.started, item.finished)}</p>
                                            )}
                                            {item.description && <p className="mt-2 text-xs text-slate-300">{item.description}</p>}
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            {/* Certifications */}
                            <Section 
                                id="certifications" 
                                title="Certifications & Badges" 
                                show={visibility.certifications} 
                                headingClassName="text-lg font-bold text-white"
                                eyebrow="// VERIFIED CREDENTIALS"
                            >
                                <div className="mt-6 space-y-4">
                                    {data.certifications.filter((c) => c.title).map((item) => (
                                        <div key={item.id} className="rounded-xl border border-white/10 bg-[#0D1424]/80 p-5">
                                            <p className="font-bold text-white text-sm">{item.title}</p>
                                            <p className="font-tech-mono text-xs text-sky-400 mt-0.5">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                            {item.description && <p className="mt-2 text-xs text-slate-300">{item.description}</p>}
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </div>

                        {/* Secondary Highlights Grid */}
                        {(visibility.achievements || visibility.languages || visibility.hobbies) && (
                            <div className="py-16 border-b border-white/5 grid gap-8 md:grid-cols-2">
                                {visibility.achievements && (
                                    <div className="rounded-2xl border border-white/10 bg-[#0D1424]/80 p-6 space-y-4">
                                        <p className="font-tech-mono text-[11px] text-sky-400">// IMPACT & HONORS</p>
                                        <h3 className="text-lg font-bold text-white">Achievements</h3>
                                        <ul className="space-y-3 divide-y divide-white/5">
                                            {data.achievements.filter((a) => a.title || a.description).map((item, idx) => (
                                                <li key={item.id || idx} className={idx > 0 ? 'pt-3' : ''}>
                                                    <p className="text-sm font-semibold text-white">⚡ {item.title}</p>
                                                    {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {visibility.languages && (
                                    <div className="rounded-2xl border border-white/10 bg-[#0D1424]/80 p-6 space-y-4">
                                        <p className="font-tech-mono text-[11px] text-sky-400">// SPOKEN LANGUAGES</p>
                                        <h3 className="text-lg font-bold text-white">Languages</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {data.languages.map((l, idx) => (
                                                <span key={idx} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-tech-mono text-xs text-slate-200">
                                                    {l.name} {l.level && `(${l.level})`}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {visibility.hobbies && (
                                    <div className="rounded-2xl border border-white/10 bg-[#0D1424]/80 p-6 space-y-3">
                                        <p className="font-tech-mono text-[11px] text-sky-400">// INTERESTS & RESEARCH</p>
                                        <h3 className="text-lg font-bold text-white">Outside Work</h3>
                                        <p className="text-xs text-slate-300">{data.hobbies.join(' · ')}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Endorsements / References */}
                        <Section 
                            id="references" 
                            title="Recommendations & Endorsements" 
                            show={visibility.references} 
                            className="py-16 border-b border-white/5" 
                            headingClassName="text-xl font-bold text-white"
                            eyebrow="// PEER REVIEWS"
                        >
                            <div className="mt-8 grid gap-6 sm:grid-cols-2">
                                {data.references.filter((r) => r.name || r.reference).map((item) => (
                                    <blockquote key={item.id} className="rounded-2xl border border-white/10 bg-[#0D1424]/80 p-6 backdrop-blur-md">
                                        {item.reference && <p className="text-xs sm:text-sm leading-relaxed text-slate-300 italic">“{item.reference}”</p>}
                                        {item.name && <footer className="mt-4 font-tech-mono text-xs font-semibold text-sky-400">— {item.name}</footer>}
                                    </blockquote>
                                ))}
                            </div>
                        </Section>

                        {/* Custom Sections */}
                        {data.customSections.filter((s) => s.title || s.items.length).map((section) => (
                            <Section 
                                key={section.id} 
                                id={section.id} 
                                title={section.title || 'Additional Systems & Initiatives'} 
                                show 
                                className="py-16" 
                                headingClassName="text-xl font-bold text-white"
                                eyebrow="// ADDITIONAL SECTIONS"
                            >
                                <div className="mt-6 rounded-xl border border-white/10 bg-[#0D1424]/80 p-6 space-y-4">
                                    {section.items.map((item) => (
                                        <div key={item.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                                            {item.title && <h4 className="font-bold text-white text-sm">{item.title}</h4>}
                                            {item.description && <p className="text-xs text-slate-300 mt-1">{item.description}</p>}
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        ))}
                    </main>

                    {/* Tech Footer */}
                    <footer id="contact" className="border-t border-white/10 bg-[#05080F] px-6 py-12 md:px-12">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                            <div>
                                <p className="font-bold text-white">{name || 'Tech Portfolio'}</p>
                                <p className="font-tech-mono text-xs text-slate-500 mt-1">Architecture, Systems & High-Impact Engineering.</p>
                            </div>
                            <ContactList 
                                heading={data.heading} 
                                className="flex flex-wrap gap-4 font-tech-mono text-xs text-sky-400" 
                                linkClassName="hover:text-white underline underline-offset-4" 
                            />
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
