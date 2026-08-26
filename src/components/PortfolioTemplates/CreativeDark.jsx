import React from 'react';
import { ContactList, EmptyWebCv, NavLinks, Portrait, SafeLink, Section, SkipLink, formatRange, usePortfolioView } from './shared.jsx';

export default function CreativeDark({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'creativeDark');
    if (!visibility.heading && !visibility.about && !visibility.projects) {
        return <EmptyWebCv />;
    }

    return (
        <div className="webcv-creative min-h-screen bg-[#141210] text-[#F5EBE0] selection:bg-[#E07A5F] selection:text-[#141210]" data-webcv-template="creativeDark">
            <SkipLink />
            
            {/* Top Creative Nav Header */}
            <header className="sticky top-0 z-30 border-b border-[#2C2620] bg-[#141210]/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
                    <a href="#main" className="group flex items-center gap-3 text-sm font-bold tracking-tight text-[#F5EBE0]">
                        <span className="h-2 w-2 rounded-full bg-[#E07A5F]" />
                        <span className="font-editorial-serif text-lg tracking-normal">{name || 'Creative Folio'}</span>
                    </a>
                    <NavLinks 
                        visibility={visibility} 
                        className="hidden md:flex items-center gap-6 text-xs uppercase tracking-[0.25em] text-[#A89F91]" 
                        linkClassName="hover:text-[#E07A5F] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E07A5F]" 
                    />
                    {data.heading.email && (
                        <SafeLink 
                            href={data.heading.email} 
                            kind="email" 
                            className="inline-flex items-center gap-2 rounded-full border border-[#E07A5F]/40 bg-[#E07A5F]/10 px-4 py-1.5 text-xs font-semibold text-[#E07A5F] hover:bg-[#E07A5F] hover:text-[#141210] transition-all"
                        >
                            <span>Collaborate</span>
                            <span>↗</span>
                        </SafeLink>
                    )}
                </div>
            </header>

            <main id="main" className="mx-auto max-w-6xl px-6 py-12 md:py-20">
                {/* Hero Section */}
                <section className="pb-20 border-b border-[#2C2620]">
                    <div className="grid gap-12 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
                        <div className="space-y-6">
                            {data.heading.occupation && (
                                <div className="inline-flex items-center gap-2 rounded-md bg-[#231F1C] border border-[#3D352E] px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#E07A5F]">
                                    <span>✦ {data.heading.occupation}</span>
                                </div>
                            )}

                            <div>
                                {name && (
                                    <h1 className="font-editorial-serif text-5xl sm:text-7xl md:text-8xl font-normal leading-[0.92] tracking-tight text-[#F5EBE0]">
                                        {name}
                                    </h1>
                                )}
                                {data.extras.tagline && data.extras.tagline !== data.heading.occupation && (
                                    <p className="mt-6 text-xl sm:text-2xl font-light text-[#D5C7B5] leading-relaxed max-w-2xl">
                                        {data.extras.tagline}
                                    </p>
                                )}
                            </div>

                            {location && (
                                <p className="text-sm font-medium text-[#A89F91] tracking-wide">
                                    📍 Based in {location}
                                </p>
                            )}

                            {/* Creative Contact Action Strip */}
                            <div className="pt-4 flex flex-wrap items-center gap-3">
                                {data.heading.email && (
                                    <SafeLink href={data.heading.email} kind="email" className="inline-flex items-center gap-2 rounded-xl bg-[#231F1C] border border-[#3D352E] px-4 py-2 text-xs font-medium text-[#F5EBE0] hover:border-[#E07A5F] hover:text-[#E07A5F] transition-all">
                                        <span>✉️ {data.heading.email}</span>
                                    </SafeLink>
                                )}
                                {data.heading.linkedin && (
                                    <SafeLink href={data.heading.linkedin} className="inline-flex items-center gap-1.5 rounded-xl bg-[#231F1C] border border-[#3D352E] px-4 py-2 text-xs font-medium text-[#F5EBE0] hover:border-[#E07A5F] hover:text-[#E07A5F] transition-all">
                                        <span>LinkedIn ↗</span>
                                    </SafeLink>
                                )}
                                {data.heading.github && (
                                    <SafeLink href={data.heading.github} className="inline-flex items-center gap-1.5 rounded-xl bg-[#231F1C] border border-[#3D352E] px-4 py-2 text-xs font-medium text-[#F5EBE0] hover:border-[#E07A5F] hover:text-[#E07A5F] transition-all">
                                        <span>GitHub ↗</span>
                                    </SafeLink>
                                )}
                                {data.heading.website && (
                                    <SafeLink href={data.heading.website} className="inline-flex items-center gap-1.5 rounded-xl bg-[#231F1C] border border-[#3D352E] px-4 py-2 text-xs font-medium text-[#F5EBE0] hover:border-[#E07A5F] hover:text-[#E07A5F] transition-all">
                                        <span>Website ↗</span>
                                    </SafeLink>
                                )}
                            </div>
                        </div>

                        {/* Portrait Frame */}
                        <div className="flex justify-center lg:justify-end">
                            {data.heading.photo ? (
                                <div className="relative group">
                                    <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-[#E07A5F]/30 to-[#F4A261]/10 opacity-70 blur-xl transition duration-500 group-hover:opacity-100" />
                                    <Portrait 
                                        src={data.heading.photo} 
                                        name={name} 
                                        className="relative h-64 w-64 sm:h-80 sm:w-80 rounded-2xl object-cover border-2 border-[#3D352E] shadow-2xl transition duration-500 group-hover:scale-[1.02]" 
                                    />
                                </div>
                            ) : (
                                <div className="flex h-60 w-60 sm:h-72 sm:w-72 flex-col items-center justify-center rounded-2xl border border-[#3D352E] bg-[#1E1A16] p-6 text-center">
                                    <span className="font-editorial-serif text-5xl font-normal text-[#E07A5F] mb-3">
                                        {(name || 'CR').charAt(0)}
                                    </span>
                                    <p className="font-editorial-serif text-lg text-[#F5EBE0]">{name || 'Creative Work'}</p>
                                    <p className="text-xs text-[#A89F91] mt-1">{data.heading.occupation || 'Portfolio'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* 01 / STORY */}
                <Section 
                    id="about" 
                    title="01 / Story & Philosophy" 
                    show={visibility.about} 
                    className="py-16 border-b border-[#2C2620]" 
                    headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                >
                    <div className="mt-8 rounded-2xl border border-[#2C2620] bg-[#1A1714] p-8 sm:p-10 shadow-lg">
                        <p className="font-editorial-serif text-xl sm:text-2xl leading-relaxed text-[#F5EBE0] font-normal">
                            “{data.summary}”
                        </p>
                    </div>
                </Section>

                {/* 02 / SELECTED WORKS */}
                <Section 
                    id="projects" 
                    title="02 / Selected Works & Projects" 
                    show={visibility.projects} 
                    className="py-16 border-b border-[#2C2620]" 
                    headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                >
                    <div className="mt-10 space-y-10">
                        {data.projects.filter((project) => project.title || project.description).map((project, idx) => (
                            <article 
                                key={project.id} 
                                className="group grid gap-8 rounded-2xl border border-[#2C2620] bg-[#1A1714] p-7 sm:p-9 transition-all duration-300 hover:border-[#E07A5F]/60 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] md:grid-cols-[1.2fr_0.8fr] md:items-center"
                            >
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="font-editorial-serif text-base font-bold text-[#E07A5F]">
                                            WORK {String(idx + 1).padStart(2, '0')}
                                        </span>
                                        <span className="h-px flex-1 bg-[#2C2620]" />
                                    </div>

                                    <h3 className="font-editorial-serif text-2xl sm:text-3xl font-normal text-[#F5EBE0] group-hover:text-[#E07A5F] transition-colors">
                                        {project.title}
                                    </h3>

                                    {project.description && (
                                        <p className="text-sm sm:text-base leading-relaxed text-[#C5B8A5]">
                                            {project.description}
                                        </p>
                                    )}

                                    {project.technologyList.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            {project.technologyList.map((tech, tIdx) => (
                                                <span key={tIdx} className="rounded-md bg-[#241F1B] border border-[#3D352E] px-2.5 py-1 text-xs font-medium text-[#D5C7B5]">
                                                    {tech}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {project.link && (
                                        <div className="pt-2">
                                            <SafeLink 
                                                href={project.link} 
                                                className="inline-flex items-center gap-2 text-sm font-semibold text-[#E07A5F] hover:text-[#F4A261] underline underline-offset-4"
                                            >
                                                <span>View Project Case</span>
                                                <span className="transition-transform group-hover:translate-x-1">→</span>
                                            </SafeLink>
                                        </div>
                                    )}
                                </div>

                                {/* Project Visual Canvas */}
                                <div className="relative overflow-hidden rounded-xl border border-[#3D352E] bg-gradient-to-br from-[#231F1C] to-[#161310] p-6 min-h-[160px] flex flex-col justify-center items-center text-center">
                                    <div className="h-12 w-12 rounded-xl bg-[#E07A5F]/10 border border-[#E07A5F]/30 flex items-center justify-center text-xl text-[#E07A5F] mb-2">
                                        ✦
                                    </div>
                                    <p className="font-editorial-serif text-base text-[#F5EBE0]">{project.title}</p>
                                    <p className="text-xs text-[#A89F91] mt-0.5">Interactive Case Study</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </Section>

                {/* 03 / CHRONICLE & PATH */}
                <Section 
                    id="experience" 
                    title="03 / Chronicle & Experience" 
                    show={visibility.experience} 
                    className="py-16 border-b border-[#2C2620]" 
                    headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                >
                    <div className="mt-10 space-y-8">
                        {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                            <article key={item.id} className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-7 sm:p-8 transition-all hover:border-[#3D352E]">
                                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                                    <div>
                                        <h3 className="font-editorial-serif text-xl sm:text-2xl font-normal text-[#F5EBE0]">
                                            {item.jobTitle}
                                        </h3>
                                        {item.employer && (
                                            <p className="text-sm font-semibold text-[#E07A5F] mt-0.5">{item.employer}</p>
                                        )}
                                    </div>
                                    <span className="text-xs font-medium uppercase tracking-wider text-[#A89F91]">
                                        {formatRange(item.begin, item.end)}
                                    </span>
                                </div>

                                {item.description && (
                                    <p className="mt-4 text-sm leading-relaxed text-[#C5B8A5] whitespace-pre-line">
                                        {item.description}
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>
                </Section>

                {/* 04 / CRAFT & STUDY */}
                <div className="py-16 border-b border-[#2C2620] grid gap-10 md:grid-cols-2">
                    {/* Craft & Toolkit */}
                    <Section 
                        id="skills" 
                        title="04 / Craft & Disciplines" 
                        show={visibility.skills} 
                        headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                    >
                        <div className="mt-6 rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7">
                            <div className="flex flex-wrap gap-2">
                                {data.skills.map((skill, idx) => (
                                    <span 
                                        key={idx} 
                                        className="rounded-lg border border-[#3D352E] bg-[#231F1C] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-[#F5EBE0] hover:border-[#E07A5F] hover:text-[#E07A5F] transition-all"
                                    >
                                        {skill.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </Section>

                    {/* Academic Study */}
                    <Section 
                        id="education" 
                        title="05 / Academic Background" 
                        show={visibility.education} 
                        headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                    >
                        <div className="mt-6 rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7 space-y-4">
                            {data.education.filter((item) => item.school || item.degree).map((item) => (
                                <div key={item.id} className="border-b border-[#2C2620] pb-3 last:border-0 last:pb-0">
                                    <h3 className="font-editorial-serif text-lg font-normal text-[#F5EBE0]">{item.degree || item.school}</h3>
                                    <p className="text-xs text-[#E07A5F] mt-0.5">{[item.school, formatRange(item.started, item.finished)].filter(Boolean).join(' · ')}</p>
                                    {item.description && <p className="mt-2 text-xs leading-relaxed text-[#A89F91]">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </Section>
                </div>

                {/* Secondary Cards Grid */}
                {(visibility.certifications || visibility.achievements || visibility.languages || visibility.hobbies) && (
                    <div className="py-16 border-b border-[#2C2620] grid gap-8 md:grid-cols-2">
                        {visibility.certifications && (
                            <div className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]">Certifications</p>
                                <div className="space-y-3 divide-y divide-[#2C2620]">
                                    {data.certifications.filter((c) => c.title).map((item, idx) => (
                                        <div key={item.id || idx} className={idx > 0 ? 'pt-3' : ''}>
                                            <p className="text-sm font-semibold text-[#F5EBE0]">{item.title}</p>
                                            <p className="text-xs text-[#A89F91] mt-0.5">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibility.achievements && (
                            <div className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]">Honors & Recognition</p>
                                <div className="space-y-3 divide-y divide-[#2C2620]">
                                    {data.achievements.filter((a) => a.title || a.description).map((item, idx) => (
                                        <div key={item.id || idx} className={idx > 0 ? 'pt-3' : ''}>
                                            <p className="text-sm font-semibold text-[#F5EBE0]">🏆 {item.title}</p>
                                            {item.description && <p className="text-xs text-[#A89F91] mt-1">{item.description}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibility.languages && (
                            <div className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7 space-y-3">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]">Languages</p>
                                <div className="flex flex-wrap gap-2">
                                    {data.languages.map((l, idx) => (
                                        <span key={idx} className="rounded-lg bg-[#231F1C] border border-[#3D352E] px-3 py-1.5 text-xs text-[#F5EBE0]">
                                            {l.name} {l.level && `(${l.level})`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibility.hobbies && (
                            <div className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-6 sm:p-7 space-y-3">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]">Interests</p>
                                <p className="text-sm text-[#C5B8A5]">{data.hobbies.join(' · ')}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* References / Collaborator Notes */}
                <Section 
                    id="references" 
                    title="Notes From Collaborators" 
                    show={visibility.references} 
                    className="py-16 border-b border-[#2C2620]" 
                    headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                >
                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                        {data.references.filter((r) => r.name || r.reference).map((item) => (
                            <blockquote key={item.id} className="rounded-2xl border border-[#2C2620] bg-[#1A1714] p-7">
                                {item.reference && <p className="font-editorial-serif text-lg leading-relaxed text-[#F5EBE0] italic">“{item.reference}”</p>}
                                {item.name && <footer className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#E07A5F]">— {item.name}</footer>}
                            </blockquote>
                        ))}
                    </div>
                </Section>

                {/* Custom Sections */}
                {data.customSections.filter((s) => s.title || s.items.length).map((section, idx) => (
                    <Section 
                        key={section.id || idx} 
                        id={section.id} 
                        title={section.title || `0${idx + 6} / Additional Information`} 
                        show 
                        className="py-16" 
                        headingClassName="text-xs font-bold uppercase tracking-[0.3em] text-[#E07A5F]"
                    >
                        <div className="mt-8 rounded-2xl border border-[#2C2620] bg-[#1A1714] p-7 sm:p-8 space-y-4">
                            {section.items.map((item) => (
                                <div key={item.id} className="border-b border-[#2C2620] pb-3 last:border-0 last:pb-0">
                                    {item.title && <h3 className="font-editorial-serif text-lg text-[#F5EBE0]">{item.title}</h3>}
                                    {item.description && <p className="text-sm text-[#C5B8A5] mt-1">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </Section>
                ))}
            </main>

            {/* Creative Footer */}
            <footer id="contact" className="border-t border-[#2C2620] bg-[#0E0D0B] py-16">
                <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                    <div>
                        <h2 className="font-editorial-serif text-3xl sm:text-4xl text-[#F5EBE0]">Let's create together</h2>
                        <p className="text-sm text-[#A89F91] mt-1.5">Open to creative direction, design systems, and advisory.</p>
                    </div>
                    <ContactList 
                        heading={data.heading} 
                        className="flex flex-wrap gap-4 text-xs uppercase tracking-wider text-[#E07A5F]" 
                        linkClassName="hover:text-white underline underline-offset-4" 
                    />
                </div>
            </footer>
        </div>
    );
}
