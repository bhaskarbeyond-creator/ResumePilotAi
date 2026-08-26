import React from 'react';
import { ContactList, EmptyWebCv, Portrait, SafeLink, Section, SkipLink, formatRange, usePortfolioView } from './shared.jsx';

export default function Executive({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'executive');
    if (!visibility.heading && !visibility.about && !visibility.experience) {
        return <EmptyWebCv />;
    }

    const expCount = data.experiences?.filter(e => e.jobTitle || e.employer).length || 0;
    data.certifications?.filter(c => c.title).length || 0;

    return (
        <div className="webcv-executive min-h-screen bg-[#F7F5F0] text-[#1E293B] selection:bg-[#0F172A] selection:text-[#C5A880]" data-webcv-template="executive">
            <SkipLink />
            
            {/* Prestigious Executive Header Banner */}
            <header className="relative bg-[#0F172A] text-[#F8F6F0] border-b-2 border-[#C5A880]/40 overflow-hidden">
                {/* Subtle ambient luxury gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A] via-[#162033] to-[#0F172A] opacity-90" />
                <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[#C5A880]/5 blur-3xl" />

                <div className="relative mx-auto max-w-6xl px-6 py-14 sm:py-16">
                    <div className="grid gap-10 md:grid-cols-[auto_1fr] md:items-center">
                        {/* Executive Portrait Frame */}
                        <div className="flex justify-center md:justify-start">
                            {data.heading.photo ? (
                                <div className="relative">
                                    <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#C5A880] to-[#E2D4B7] opacity-80 blur-[2px]" />
                                    <Portrait 
                                        src={data.heading.photo} 
                                        name={name} 
                                        className="relative h-40 w-40 sm:h-44 sm:w-44 rounded-full object-cover border-4 border-[#0F172A] shadow-2xl" 
                                    />
                                </div>
                            ) : (
                                <div className="flex h-36 w-36 sm:h-40 sm:w-40 flex-col items-center justify-center rounded-full border-2 border-[#C5A880]/60 bg-[#162033] text-center shadow-xl">
                                    <span className="font-editorial-serif text-3xl font-bold text-[#C5A880]">
                                        {(name || 'EX').split(' ').map(n => n[0]).slice(0, 2).join('')}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Executive Identifiers */}
                        <div className="space-y-4 text-center md:text-left">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#C5A880]/30 bg-[#C5A880]/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#C5A880]">
                                <span>✦ Executive Leadership</span>
                            </div>

                            <div>
                                {name && (
                                    <h1 className="font-editorial-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#F8F6F0] leading-tight">
                                        {name}
                                    </h1>
                                )}
                                {data.heading.occupation && (
                                    <p className="mt-2 text-base sm:text-lg font-medium text-[#C5A880] tracking-wide">
                                        {data.heading.occupation}
                                    </p>
                                )}
                            </div>

                            {location && (
                                <p className="text-xs sm:text-sm text-[#94A3B8] font-normal">
                                    {[data.heading.address, location, data.heading.postalcode].filter(Boolean).join(' · ')}
                                </p>
                            )}

                            {/* Executive Contact Links */}
                            <div className="pt-2 flex flex-wrap justify-center md:justify-start gap-3">
                                {data.heading.email && (
                                    <SafeLink href={data.heading.email} kind="email" className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A880]/40 bg-[#162033] px-3.5 py-1.5 text-xs font-medium text-[#F8F6F0] hover:border-[#C5A880] hover:bg-[#1E293B] transition-all">
                                        <span>✉️ Direct Email</span>
                                    </SafeLink>
                                )}
                                {data.heading.phone && (
                                    <SafeLink href={data.heading.phone} kind="phone" className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A880]/40 bg-[#162033] px-3.5 py-1.5 text-xs font-medium text-[#F8F6F0] hover:border-[#C5A880] hover:bg-[#1E293B] transition-all">
                                        <span>📞 {data.heading.phone}</span>
                                    </SafeLink>
                                )}
                                {data.heading.linkedin && (
                                    <SafeLink href={data.heading.linkedin} className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A880]/40 bg-[#162033] px-3.5 py-1.5 text-xs font-medium text-[#F8F6F0] hover:border-[#C5A880] hover:bg-[#1E293B] transition-all">
                                        <span>LinkedIn Profile ↗</span>
                                    </SafeLink>
                                )}
                                {data.heading.website && (
                                    <SafeLink href={data.heading.website} className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A880]/40 bg-[#162033] px-3.5 py-1.5 text-xs font-medium text-[#F8F6F0] hover:border-[#C5A880] hover:bg-[#1E293B] transition-all">
                                        <span>Corporate Web ↗</span>
                                    </SafeLink>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stately Highlight Strip */}
                <div className="border-t border-[#C5A880]/20 bg-[#0B1120] px-6 py-4">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs font-medium text-[#94A3B8]">
                        <div className="flex items-center gap-6">
                            <span>🏛 Executive Governance</span>
                            <span>•</span>
                            <span>📈 Strategic Growth</span>
                            <span>•</span>
                            <span>🌐 Global Operations</span>
                        </div>
                        {expCount > 0 && (
                            <span className="text-[#C5A880] font-semibold">{expCount} Strategic Leadership Roles Recorded</span>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content: Editorial Split Layout */}
            <main id="main" className="mx-auto max-w-6xl px-6 py-14 grid gap-12 lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,0.95fr)]">
                {/* Left Column: Narrative, Career History, Key Initiatives */}
                <div className="space-y-14">
                    {/* Executive Summary */}
                    <Section 
                        id="about" 
                        title="Executive Profile" 
                        show={visibility.about} 
                        eyebrow="Leadership Statement"
                        headingClassName="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight"
                    >
                        <div className="mt-6 relative rounded-xl border border-[#E2D8C6] bg-white p-7 sm:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                            <div className="absolute -left-1 top-6 bottom-6 w-1.5 rounded-full bg-[#C5A880]" />
                            <blockquote className="pl-3 text-base sm:text-lg leading-relaxed text-[#334155] font-normal italic">
                                “{data.summary}”
                            </blockquote>
                        </div>
                    </Section>

                    {/* Leadership & Career Trajectory */}
                    <Section 
                        id="experience" 
                        title="Leadership & Career Trajectory" 
                        show={visibility.experience} 
                        eyebrow="Executive Track Record"
                        headingClassName="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight"
                    >
                        <div className="mt-8 relative pl-6 sm:pl-8 border-l-2 border-[#C5A880]/50 space-y-10">
                            {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                                <div key={item.id} className="relative group">
                                    {/* Gold Diamond Node */}
                                    <div className="absolute -left-[31px] sm:-left-[39px] top-2 h-3.5 w-3.5 rotate-45 border-2 border-white bg-[#C5A880] shadow-sm ring-4 ring-[#F7F5F0]" />

                                    <div className="rounded-xl border border-[#E2D8C6] bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                            <div>
                                                <h3 className="font-editorial-serif text-xl font-bold text-[#0F172A]">
                                                    {item.jobTitle}
                                                </h3>
                                                {item.employer && (
                                                    <p className="text-sm font-semibold text-[#8C7355] mt-0.5 tracking-wide">
                                                        {item.employer}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="inline-flex rounded-full border border-[#E2D8C6] bg-[#F7F5F0] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                                {formatRange(item.begin, item.end)}
                                            </span>
                                        </div>

                                        {item.description && (
                                            <p className="mt-4 text-sm leading-relaxed text-[#334155] whitespace-pre-line">
                                                {item.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Strategic Initiatives & Projects */}
                    <Section 
                        id="projects" 
                        title="Key Strategic Initiatives & Works" 
                        show={visibility.projects} 
                        eyebrow="Programs & Ventures"
                        headingClassName="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight"
                    >
                        <div className="mt-8 grid gap-6 sm:grid-cols-2">
                            {data.projects.filter((project) => project.title || project.description).map((project, idx) => (
                                <article key={project.id} className="flex flex-col justify-between rounded-xl border border-[#E2D8C6] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="font-editorial-serif text-sm font-bold text-[#C5A880]">
                                                INITIATIVE {String(idx + 1).padStart(2, '0')}
                                            </span>
                                            {project.link && (
                                                <SafeLink href={project.link} className="text-xs font-semibold text-[#8C7355] hover:text-[#0F172A] underline underline-offset-4">
                                                    Executive Brief ↗
                                                </SafeLink>
                                            )}
                                        </div>
                                        <h3 className="font-editorial-serif text-lg font-bold text-[#0F172A]">{project.title}</h3>
                                        {project.description && (
                                            <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-[#475569]">
                                                {project.description}
                                            </p>
                                        )}
                                    </div>

                                    {project.technologyList.length > 0 && (
                                        <div className="mt-5 pt-4 border-t border-[#F0EAE1] flex flex-wrap gap-1.5">
                                            {project.technologyList.map((tech, tIdx) => (
                                                <span key={tIdx} className="rounded bg-[#F7F5F0] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
                                                    {tech}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </Section>

                    {/* Academic Governance & Education */}
                    <Section 
                        id="education" 
                        title="Academic Credentials & Governance" 
                        show={visibility.education} 
                        eyebrow="Education & Alma Mater"
                        headingClassName="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight"
                    >
                        <div className="mt-8 grid gap-6 sm:grid-cols-2">
                            {data.education.filter((item) => item.school || item.degree).map((item) => (
                                <div key={item.id} className="rounded-xl border border-[#E2D8C6] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                    <h3 className="font-editorial-serif text-base font-bold text-[#0F172A]">{item.degree || item.school}</h3>
                                    {item.school && <p className="text-xs font-semibold text-[#8C7355] mt-1">{item.school}</p>}
                                    {formatRange(item.started, item.finished) && (
                                        <p className="text-xs text-[#94A3B8] mt-0.5">{formatRange(item.started, item.finished)}</p>
                                    )}
                                    {item.description && <p className="mt-3 text-xs leading-relaxed text-[#475569]">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>

                {/* Right Column: Executive Sidebar Dossier */}
                <aside className="space-y-8">
                    {/* Core Capabilities */}
                    <Section 
                        id="skills" 
                        title="Strategic Competencies" 
                        show={visibility.skills} 
                        headingClassName="font-editorial-serif text-lg font-bold text-[#0F172A] pb-3 border-b border-[#E2D8C6]"
                    >
                        <div className="mt-4 rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-2.5">
                            {data.skills.map((skill, idx) => (
                                <div key={idx} className="flex items-center justify-between border-b border-[#F0EAE1] pb-2 last:border-0 last:pb-0 text-xs sm:text-sm">
                                    <span className="font-medium text-[#1E293B]">{skill.name}</span>
                                    {skill.rating && <span className="text-[11px] font-semibold text-[#C5A880] uppercase">{skill.rating}</span>}
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Executive Certifications */}
                    <Section 
                        id="certifications" 
                        title="Board & Professional Credentials" 
                        show={visibility.certifications} 
                        headingClassName="font-editorial-serif text-lg font-bold text-[#0F172A] pb-3 border-b border-[#E2D8C6]"
                    >
                        <div className="mt-4 rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3.5">
                            {data.certifications.filter((c) => c.title).map((item) => (
                                <div key={item.id} className="border-b border-[#F0EAE1] pb-2.5 last:border-0 last:pb-0">
                                    <p className="text-xs font-bold text-[#0F172A]">{item.title}</p>
                                    <p className="text-[11px] text-[#8C7355] mt-0.5">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                    {item.description && <p className="text-[11px] text-[#64748B] mt-1">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Distinctions & Awards */}
                    <Section 
                        id="achievements" 
                        title="Distinctions & Milestones" 
                        show={visibility.achievements} 
                        headingClassName="font-editorial-serif text-lg font-bold text-[#0F172A] pb-3 border-b border-[#E2D8C6]"
                    >
                        <div className="mt-4 rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
                            {data.achievements.filter((a) => a.title || a.description).map((item) => (
                                <div key={item.id} className="border-b border-[#F0EAE1] pb-2.5 last:border-0 last:pb-0">
                                    <p className="text-xs font-bold text-[#0F172A]">🏅 {item.title}</p>
                                    {item.description && <p className="text-[11px] text-[#64748B] mt-1">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Endorsements / References */}
                    <Section 
                        id="references" 
                        title="Executive Endorsements" 
                        show={visibility.references} 
                        headingClassName="font-editorial-serif text-lg font-bold text-[#0F172A] pb-3 border-b border-[#E2D8C6]"
                    >
                        <div className="mt-4 rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
                            {data.references.filter((r) => r.name || r.reference).map((item) => (
                                <blockquote key={item.id} className="border-l-2 border-[#C5A880] pl-3">
                                    {item.reference && <p className="text-xs italic text-[#475569]">“{item.reference}”</p>}
                                    {item.name && <cite className="block text-[11px] font-bold not-italic text-[#0F172A] mt-1.5">— {item.name}</cite>}
                                </blockquote>
                            ))}
                        </div>
                    </Section>

                    {/* Languages & Interests */}
                    {(visibility.languages || visibility.hobbies) && (
                        <div className="rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
                            {visibility.languages && (
                                <div>
                                    <p className="font-editorial-serif text-sm font-bold text-[#0F172A] mb-2">Languages</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {data.languages.map((l, idx) => (
                                            <span key={idx} className="rounded bg-[#F7F5F0] border border-[#E2D8C6] px-2 py-1 text-[11px] font-medium text-[#334155]">
                                                {l.name} {l.level && `(${l.level})`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {visibility.hobbies && (
                                <div className={visibility.languages ? 'pt-3 border-t border-[#F0EAE1]' : ''}>
                                    <p className="font-editorial-serif text-sm font-bold text-[#0F172A] mb-1.5">Affiliations & Interests</p>
                                    <p className="text-xs text-[#64748B]">{data.hobbies.join(' · ')}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Custom Sections */}
                    {data.customSections.filter((s) => s.title || s.items.length).map((section) => (
                        <Section 
                            key={section.id} 
                            id={section.id} 
                            title={section.title || 'Additional Governance'} 
                            show 
                            headingClassName="font-editorial-serif text-lg font-bold text-[#0F172A] pb-3 border-b border-[#E2D8C6]"
                        >
                            <div className="mt-4 rounded-xl border border-[#E2D8C6] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
                                {section.items.map((item) => (
                                    <div key={item.id}>
                                        {item.title && <p className="text-xs font-bold text-[#0F172A]">{item.title}</p>}
                                        {item.description && <p className="text-[11px] text-[#64748B] mt-0.5">{item.description}</p>}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    ))}
                </aside>
            </main>

            {/* Stately Executive Footer */}
            <footer id="contact" className="border-t border-[#E2D8C6] bg-[#0F172A] text-[#F8F6F0] py-12">
                <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                        <p className="font-editorial-serif text-xl font-bold text-[#F8F6F0]">{name || 'Executive Profile'}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">Available for board appointments, advisory, and strategic inquiries.</p>
                    </div>
                    <ContactList 
                        heading={data.heading} 
                        className="flex flex-wrap gap-4 text-xs font-medium text-[#C5A880]" 
                        linkClassName="hover:text-white underline decoration-[#C5A880] underline-offset-4" 
                    />
                </div>
            </footer>
        </div>
    );
}
