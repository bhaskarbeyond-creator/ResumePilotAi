import React from 'react';
import { ContactList, EmptyWebCv, NavLinks, Portrait, SafeLink, Section, SkipLink, formatRange, usePortfolioView } from './shared.jsx';

export default function ModernMinimal({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'modernMinimal');
    if (!visibility.heading && !visibility.about && !visibility.experience && !visibility.projects) {
        return <EmptyWebCv />;
    }

    // Derive quick metrics from real data
    const expCount = data.experiences?.filter(e => e.jobTitle || e.employer).length || 0;
    const projectCount = data.projects?.filter(p => p.title).length || 0;
    const skillCount = data.skills?.length || 0;

    return (
        <div className="webcv-modern min-h-screen bg-[#FAFAFA] text-neutral-900 selection:bg-neutral-900 selection:text-white" data-webcv-template="modernMinimal">
            <SkipLink />
            
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-[#FAFAFA]/80 backdrop-blur-md transition-all">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
                    <a href="#main" className="group flex items-center gap-2.5 text-sm font-semibold tracking-tight text-neutral-900">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                        <span>{name || 'Portfolio'}</span>
                    </a>
                    <NavLinks 
                        visibility={visibility} 
                        className="hidden md:flex items-center gap-7" 
                        linkClassName="text-xs font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-950 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900" 
                    />
                    {data.heading.email && (
                        <SafeLink 
                            href={data.heading.email} 
                            kind="email" 
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition-all hover:scale-105 shadow-sm active:scale-95"
                        >
                            <span>Get in touch</span>
                            <span className="text-[10px]">→</span>
                        </SafeLink>
                    )}
                </div>
            </header>

            <main id="main">
                {/* Hero Section */}
                <section className="mx-auto max-w-5xl px-6 pt-16 pb-16 md:pt-24 md:pb-20">
                    <div className="grid gap-12 md:grid-cols-[1.35fr_0.85fr] md:items-center">
                        <div className="space-y-6">
                            {/* Availability status badge */}
                            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-3.5 py-1 text-xs font-medium text-neutral-700 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>{data.heading.occupation || 'Available for projects'}</span>
                            </div>

                            {/* Main Name & Headline */}
                            <div>
                                {name ? (
                                    <h1 className="text-4xl font-bold tracking-tight text-neutral-950 sm:text-6xl md:leading-[1.1]">
                                        {name}
                                    </h1>
                                ) : null}
                                {data.extras.tagline && data.extras.tagline !== data.heading.occupation ? (
                                    <p className="mt-4 text-xl font-normal text-neutral-600 leading-relaxed max-w-xl">
                                        {data.extras.tagline}
                                    </p>
                                ) : null}
                            </div>

                            {/* Summary snippet if present */}
                            {data.summary && (
                                <p className="text-base text-neutral-600 leading-relaxed max-w-xl font-normal">
                                    {data.summary}
                                </p>
                            )}

                            {/* Location and Quick Contact Pill Bar */}
                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                {location && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                        <span>📍</span>
                                        <span>{location}</span>
                                    </span>
                                )}
                                {data.heading.email && (
                                    <SafeLink href={data.heading.email} kind="email" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 transition-all">
                                        <span>✉️</span>
                                        <span>{data.heading.email}</span>
                                    </SafeLink>
                                )}
                                {data.heading.phone && (
                                    <SafeLink href={data.heading.phone} kind="phone" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 transition-all">
                                        <span>📞</span>
                                        <span>{data.heading.phone}</span>
                                    </SafeLink>
                                )}
                                {data.heading.linkedin && (
                                    <SafeLink href={data.heading.linkedin} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 transition-all">
                                        <span>LinkedIn ↗</span>
                                    </SafeLink>
                                )}
                                {data.heading.github && (
                                    <SafeLink href={data.heading.github} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 transition-all">
                                        <span>GitHub ↗</span>
                                    </SafeLink>
                                )}
                            </div>

                            {/* Quick Stats Bar if data exists */}
                            {(expCount > 0 || projectCount > 0 || skillCount > 0) && (
                                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-neutral-200/60 max-w-lg">
                                    {expCount > 0 && (
                                        <div>
                                            <p className="text-2xl font-bold text-neutral-950">{expCount}+</p>
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mt-0.5">Positions</p>
                                        </div>
                                    )}
                                    {projectCount > 0 && (
                                        <div>
                                            <p className="text-2xl font-bold text-neutral-950">{projectCount}</p>
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mt-0.5">Projects</p>
                                        </div>
                                    )}
                                    {skillCount > 0 && (
                                        <div>
                                            <p className="text-2xl font-bold text-neutral-950">{skillCount}+</p>
                                            <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mt-0.5">Core Skills</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Portrait Frame */}
                        <div className="flex justify-center md:justify-end">
                            {data.heading.photo ? (
                                <div className="relative group">
                                    <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-tr from-neutral-200 to-neutral-100 opacity-70 blur-lg transition duration-500 group-hover:opacity-100" />
                                    <Portrait 
                                        src={data.heading.photo} 
                                        name={name} 
                                        className="relative h-60 w-60 sm:h-72 sm:w-72 rounded-[2rem] object-cover border-4 border-white shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-transform duration-500 group-hover:scale-[1.02]" 
                                    />
                                </div>
                            ) : (
                                <div className="flex h-56 w-56 sm:h-64 sm:w-64 flex-col items-center justify-center rounded-[2rem] border border-neutral-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(0,0,0,0.03)] text-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-2xl font-bold text-neutral-800 mb-3 shadow-inner">
                                        {(name || 'CV').charAt(0).toUpperCase()}
                                    </div>
                                    <p className="text-sm font-semibold text-neutral-900">{name || 'Professional'}</p>
                                    <p className="text-xs text-neutral-500 mt-1">{data.heading.occupation || location || 'Portfolio'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Projects Section */}
                <Section 
                    id="projects" 
                    title="Featured Projects" 
                    show={visibility.projects} 
                    className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                    eyebrow="Portfolio & Works"
                    headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                >
                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                        {data.projects.filter((p) => p.title || p.description).map((project, idx) => (
                            <article 
                                key={project.id} 
                                className="group relative flex flex-col justify-between rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all duration-300 hover:-translate-y-1 hover:border-neutral-300 hover:shadow-[0_16px_36px_rgba(0,0,0,0.06)]"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-4 mb-4">
                                        <span className="font-mono text-xs font-semibold text-neutral-400">
                                            {String(idx + 1).padStart(2, '0')}
                                        </span>
                                        {project.link && (
                                            <SafeLink 
                                                href={project.link} 
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 group-hover:text-emerald-600 transition-colors"
                                            >
                                                <span>Live Demo</span>
                                                <span className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
                                            </SafeLink>
                                        )}
                                    </div>

                                    <h3 className="text-lg sm:text-xl font-bold text-neutral-950 group-hover:text-neutral-900">
                                        {project.title}
                                    </h3>

                                    {project.description ? (
                                        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                                            {project.description}
                                        </p>
                                    ) : null}
                                </div>

                                {project.technologyList.length > 0 && (
                                    <div className="mt-6 pt-5 border-t border-neutral-100 flex flex-wrap gap-1.5">
                                        {project.technologyList.map((tech, tIdx) => (
                                            <span 
                                                key={tIdx} 
                                                className="rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
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

                {/* Experience Section */}
                <Section 
                    id="experience" 
                    title="Work Experience" 
                    show={visibility.experience} 
                    className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                    eyebrow="Career Journey"
                    headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                >
                    <div className="mt-10 relative pl-6 sm:pl-8 border-l-2 border-neutral-200 space-y-12">
                        {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                            <div key={item.id} className="relative group">
                                {/* Timeline Node Dot */}
                                <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-neutral-400 ring-4 ring-[#FAFAFA] group-hover:bg-neutral-950 transition-colors" />

                                <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                        <div>
                                            <h3 className="text-lg font-bold text-neutral-950">{item.jobTitle}</h3>
                                            {item.employer ? (
                                                <p className="text-sm font-medium text-neutral-600 mt-0.5">{item.employer}</p>
                                            ) : null}
                                        </div>
                                        <span className="inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                                            {formatRange(item.begin, item.end)}
                                        </span>
                                    </div>

                                    {item.description ? (
                                        <p className="mt-4 text-sm leading-relaxed text-neutral-600 whitespace-pre-line">
                                            {item.description}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Skills Section */}
                <Section 
                    id="skills" 
                    title="Skills & Expertise" 
                    show={visibility.skills} 
                    className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                    eyebrow="Core Competencies"
                    headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                >
                    <div className="mt-8 rounded-2xl border border-neutral-200/80 bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                        <div className="flex flex-wrap gap-2.5">
                            {data.skills.map((skill, idx) => (
                                <span 
                                    key={idx} 
                                    className="inline-flex items-center rounded-xl border border-neutral-200/70 bg-neutral-50 px-3.5 py-2 text-xs sm:text-sm font-medium text-neutral-800 hover:border-neutral-400 hover:bg-white hover:shadow-sm transition-all"
                                >
                                    {skill.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* Education Section */}
                <Section 
                    id="education" 
                    title="Education" 
                    show={visibility.education} 
                    className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                    eyebrow="Academic Background"
                    headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                >
                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                        {data.education.filter((item) => item.school || item.degree).map((item) => (
                            <div key={item.id} className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-base sm:text-lg font-bold text-neutral-950">{item.degree || item.school}</h3>
                                    {formatRange(item.started, item.finished) && (
                                        <span className="text-xs font-medium text-neutral-400 shrink-0">
                                            {formatRange(item.started, item.finished)}
                                        </span>
                                    )}
                                </div>
                                {item.school && <p className="text-sm font-medium text-neutral-600 mt-1">{item.school}</p>}
                                {item.description ? <p className="mt-3 text-sm leading-relaxed text-neutral-500">{item.description}</p> : null}
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Secondary Cards Grid: Certifications, Achievements, Languages, Hobbies */}
                {(visibility.certifications || visibility.achievements || visibility.languages || visibility.hobbies) && (
                    <div className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60 grid gap-8 md:grid-cols-2">
                        {visibility.certifications && (
                            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Credentials</p>
                                <h3 className="text-xl font-bold text-neutral-950 mb-6">Certifications</h3>
                                <ul className="space-y-4 divide-y divide-neutral-100">
                                    {data.certifications.filter((item) => item.title).map((item, idx) => (
                                        <li key={item.id || idx} className={idx > 0 ? 'pt-4' : ''}>
                                            <p className="text-sm font-bold text-neutral-900">{item.title}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                            {item.description ? <p className="mt-1 text-xs text-neutral-600">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {visibility.achievements && (
                            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Recognition</p>
                                <h3 className="text-xl font-bold text-neutral-950 mb-6">Achievements</h3>
                                <ul className="space-y-4 divide-y divide-neutral-100">
                                    {data.achievements.filter((item) => item.title || item.description).map((item, idx) => (
                                        <li key={item.id || idx} className={idx > 0 ? 'pt-4' : ''}>
                                            <p className="text-sm font-bold text-neutral-900">🏆 {item.title}</p>
                                            {item.description ? <p className="mt-1 text-xs text-neutral-600">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {visibility.languages && (
                            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Communication</p>
                                <h3 className="text-xl font-bold text-neutral-950 mb-6">Languages</h3>
                                <div className="flex flex-wrap gap-2">
                                    {data.languages.map((lang, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800">
                                            <span>🌐</span>
                                            <span>{lang.name}</span>
                                            {lang.level && <span className="text-neutral-400 font-normal">({lang.level})</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibility.hobbies && (
                            <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">Interests</p>
                                <h3 className="text-xl font-bold text-neutral-950 mb-6">Hobbies & Activities</h3>
                                <div className="flex flex-wrap gap-2">
                                    {data.hobbies.map((hobby, idx) => (
                                        <span key={idx} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                            {hobby}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* References / Testimonials */}
                <Section 
                    id="references" 
                    title="Endorsements" 
                    show={visibility.references} 
                    className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                    eyebrow="Recommendations"
                    headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                >
                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                        {data.references.filter((item) => item.name || item.reference).map((item) => (
                            <blockquote key={item.id} className="relative rounded-2xl border border-neutral-200/80 bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                                <span className="text-3xl text-neutral-300 font-serif leading-none">“</span>
                                {item.reference ? <p className="mt-2 text-sm leading-relaxed text-neutral-700 italic">{item.reference}</p> : null}
                                {item.name ? (
                                    <footer className="mt-4 pt-4 border-t border-neutral-100 flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-700">
                                            {item.name.charAt(0)}
                                        </div>
                                        <cite className="text-xs font-semibold not-italic text-neutral-900">{item.name}</cite>
                                    </footer>
                                ) : null}
                            </blockquote>
                        ))}
                    </div>
                </Section>

                {/* Custom Sections */}
                {data.customSections.filter((s) => s.title || s.items.length).map((section) => (
                    <Section 
                        key={section.id} 
                        id={section.id} 
                        title={section.title || 'Additional Information'} 
                        show 
                        className="mx-auto max-w-5xl px-6 py-16 border-t border-neutral-200/60" 
                        headingClassName="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950"
                    >
                        <div className="mt-8 rounded-2xl border border-neutral-200/80 bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
                            {section.items.map((item) => (
                                <div key={item.id} className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                                    {item.title ? <h3 className="text-sm font-bold text-neutral-900">{item.title}</h3> : null}
                                    {item.description ? <p className="mt-1 text-sm text-neutral-600">{item.description}</p> : null}
                                </div>
                            ))}
                        </div>
                    </Section>
                ))}
            </main>

            {/* Footer / Contact Drawer */}
            <footer id="contact" className="border-t border-neutral-200 bg-white py-14">
                <div className="mx-auto max-w-5xl px-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 pb-8 border-b border-neutral-100">
                        <div>
                            <h2 className="text-2xl font-bold text-neutral-950 tracking-tight">Let's connect</h2>
                            <p className="text-sm text-neutral-500 mt-1 max-w-md">
                                Open to select engineering roles, advisory engagements, and collaboration.
                            </p>
                        </div>
                        {data.heading.email && (
                            <SafeLink 
                                href={data.heading.email} 
                                kind="email" 
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800 transition-all shadow-sm"
                            >
                                <span>{data.heading.email}</span>
                                <span>↗</span>
                            </SafeLink>
                        )}
                    </div>

                    <div className="pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-neutral-400">
                        <p>© {new Date().getFullYear()} {name || 'Portfolio'}. All rights reserved.</p>
                        <ContactList heading={data.heading} className="flex flex-wrap gap-4 text-xs font-medium text-neutral-600" linkClassName="hover:text-neutral-950 underline underline-offset-4" />
                    </div>
                </div>
            </footer>
        </div>
    );
}
