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

    return (
        <div className="webcv-tech min-h-screen bg-[#070b14] text-slate-100" data-webcv-template="premiumTech">
            <SkipLink />
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(79,70,229,0.18),_transparent_32%),radial-gradient(circle_at_20%_20%,_rgba(14,165,233,0.12),_transparent_28%)]" aria-hidden="true" />
            <div className="relative mx-auto grid max-w-6xl lg:grid-cols-[15rem_1fr]">
                <aside className="hidden border-r border-white/5 px-5 py-8 lg:block">
                    <p className="text-sm font-semibold tracking-tight">{name || 'Web CV'}</p>
                    {data.heading.occupation ? <p className="mt-2 text-xs text-slate-400">{data.heading.occupation}</p> : null}
                    <NavLinks visibility={visibility} className="sticky top-8 mt-10 flex flex-col gap-3" linkClassName="text-sm text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400" />
                </aside>

                <div>
                    <header className="flex items-center justify-between px-6 py-5 lg:hidden">
                        <p className="text-sm font-semibold">{name}</p>
                        <NavLinks visibility={visibility} className="flex gap-3 overflow-x-auto text-xs text-slate-400" linkClassName="whitespace-nowrap hover:text-white" />
                    </header>

                    <main id="main" className="px-6 pb-20 pt-8 md:px-10">
                        <section className="grid items-center gap-8 pb-16 md:grid-cols-[1.3fr_auto]">
                            <div>
                                {data.heading.occupation ? <p className="text-xs uppercase tracking-[0.28em] text-sky-300">{data.heading.occupation}</p> : null}
                                {name ? <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white md:text-6xl">{name}</h1> : null}
                                {data.summary ? <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{data.summary}</p> : null}
                                {location ? <p className="mt-4 text-sm text-slate-400">{location}</p> : null}
                            </div>
                            <Portrait src={data.heading.photo} name={name} className="h-36 w-36 rounded-3xl object-cover ring-1 ring-white/10" />
                        </section>

                        <Section id="projects" title="Product work" show={visibility.projects} headingClassName="text-sm font-medium text-slate-300" className="pb-16">
                            <div className="mt-6 grid gap-5 md:grid-cols-2">
                                {data.projects.filter((project) => project.title || project.description).map((project) => (
                                    <article key={project.id} className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur">
                                        <h3 className="text-xl font-semibold text-white">{project.title}</h3>
                                        {project.description ? <p className="mt-3 text-sm leading-6 text-slate-300">{project.description}</p> : null}
                                        {project.technologyList.length ? (
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {project.technologyList.map((tech) => (
                                                    <span key={tech} className="rounded-full bg-sky-400/10 px-2.5 py-1 text-xs text-sky-200">{tech}</span>
                                                ))}
                                            </div>
                                        ) : null}
                                        <SafeLink href={project.link} className="mt-4 inline-flex text-sm text-sky-300 hover:text-white">Open project</SafeLink>
                                    </article>
                                ))}
                            </div>
                        </Section>

                        <Section id="experience" title="Experience" show={visibility.experience} headingClassName="text-sm font-medium text-slate-300" className="pb-16">
                            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
                                {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                                    <article key={item.id} className="grid gap-2 border-b border-white/10 px-5 py-5 last:border-b-0 md:grid-cols-[9rem_1fr]">
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{formatRange(item.begin, item.end)}</p>
                                        <div>
                                            <h3 className="font-semibold text-white">{item.jobTitle}</h3>
                                            {item.employer ? <p className="text-sm text-sky-200">{item.employer}</p> : null}
                                            {item.description ? <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p> : null}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </Section>

                        <Section id="skills" title="Technical stack" show={visibility.skills} headingClassName="text-sm font-medium text-slate-300" className="pb-16">
                            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {data.skills.map((skill) => (
                                    <div key={skill.id} className="rounded-2xl border border-white/10 bg-[#0d1424] px-3 py-3">
                                        <p className="text-sm font-medium">{skill.name}</p>
                                        <div className="mt-2 h-1 rounded-full bg-white/10" aria-hidden="true">
                                            <div className="h-1 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400" style={{ width: `${Math.max(12, Math.min(100, skill.rating))}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <div className="grid gap-8 pb-16 md:grid-cols-2">
                            <Section id="education" title="Education" show={visibility.education} headingClassName="text-sm font-medium text-slate-300">
                                <ul className="mt-5 space-y-4">
                                    {data.education.filter((item) => item.school || item.degree).map((item) => (
                                        <li key={item.id} className="rounded-2xl border border-white/10 p-4">
                                            <h3 className="font-medium text-white">{item.degree || item.school}</h3>
                                            <p className="text-sm text-slate-400">{[item.school, formatRange(item.started, item.finished)].filter(Boolean).join(' · ')}</p>
                                            {item.description ? <p className="mt-2 text-sm text-slate-300">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                            <Section id="certifications" title="Certifications" show={visibility.certifications} headingClassName="text-sm font-medium text-slate-300">
                                <ul className="mt-5 space-y-3">
                                    {data.certifications.filter((item) => item.title).map((item) => (
                                        <li key={item.id} className="rounded-2xl border border-white/10 p-4 text-sm">
                                            <p className="font-medium text-white">{item.title}</p>
                                            <p className="text-slate-400">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                            {item.description ? <p className="mt-1 text-slate-300">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        </div>

                        <div className="grid gap-8 pb-16 md:grid-cols-3">
                            <Section id="achievements" title="Impact" show={visibility.achievements} headingClassName="text-sm font-medium text-slate-300">
                                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                                    {data.achievements.filter((item) => item.title || item.description).map((item) => (
                                        <li key={item.id}>
                                            <p className="text-white">{item.title}</p>
                                            {item.description ? <p>{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                            <Section id="languages" title="Languages" show={visibility.languages} headingClassName="text-sm font-medium text-slate-300">
                                <ul className="mt-4 space-y-2 text-sm">
                                    {data.languages.map((item) => (
                                        <li key={item.id}>{[item.name, item.level].filter(Boolean).join(' — ')}</li>
                                    ))}
                                </ul>
                            </Section>
                            <Section id="hobbies" title="Outside work" show={visibility.hobbies} headingClassName="text-sm font-medium text-slate-300">
                                <p className="mt-4 text-sm text-slate-300">{data.hobbies.join(' · ')}</p>
                            </Section>
                        </div>

                        <Section id="references" title="References" show={visibility.references} headingClassName="text-sm font-medium text-slate-300" className="pb-16">
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                {data.references.filter((item) => item.name || item.reference).map((item) => (
                                    <blockquote key={item.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                                        {item.reference ? <p className="text-sm leading-6 text-slate-200">“{item.reference}”</p> : null}
                                        {item.name ? <footer className="mt-3 text-xs uppercase tracking-[0.16em] text-sky-300">{item.name}</footer> : null}
                                    </blockquote>
                                ))}
                            </div>
                        </Section>

                        {data.customSections.filter((section) => section.title || section.items.length).map((section) => (
                            <Section key={section.id} id={section.id} title={section.title || 'Additional'} show headingClassName="text-sm font-medium text-slate-300" className="pb-12">
                                <ul className="mt-4 space-y-3">
                                    {section.items.map((item) => (
                                        <li key={item.id} className="rounded-2xl border border-white/10 p-4">
                                            {item.title ? <h3 className="font-medium text-white">{item.title}</h3> : null}
                                            {item.description ? <p className="text-sm text-slate-300">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        ))}
                    </main>

                    <footer id="contact" className="border-t border-white/10 px-6 py-8 md:px-10">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-medium text-white">{name}</p>
                                <p className="text-xs text-slate-500">{[data.heading.address, location, data.heading.postalcode].filter(Boolean).join(' · ')}</p>
                            </div>
                            <ContactList heading={data.heading} className="flex flex-wrap gap-4 text-sm" linkClassName="text-sky-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400" />
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
