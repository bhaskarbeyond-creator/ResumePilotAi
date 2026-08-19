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

export default function CreativeDark({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'creativeDark');
    if (!visibility.heading && !visibility.about && !visibility.projects) {
        return <EmptyWebCv />;
    }

    return (
        <div className="webcv-creative min-h-screen bg-[#161310] text-[#f4ead8]" data-webcv-template="creativeDark">
            <SkipLink />
            <div className="mx-auto grid max-w-6xl lg:grid-cols-[7rem_1fr]">
                <aside className="hidden border-r border-[#2c261f] px-4 py-10 lg:block">
                    <p className="sticky top-10 origin-top-left translate-y-64 -rotate-90 text-xs uppercase tracking-[0.5em] text-[#d4764e]">{name || 'Portfolio'}</p>
                </aside>
                <div>
                    <header className="flex items-start justify-between gap-6 px-6 py-8 md:px-10">
                        <NavLinks visibility={visibility} className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.22em] text-[#c8b79a]" linkClassName="hover:text-[#f4ead8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4764e]" />
                        <Portrait src={data.heading.photo} name={name} className="h-20 w-20 rounded-full object-cover grayscale" />
                    </header>

                    <main id="main" className="px-6 pb-20 md:px-10">
                        <section className="max-w-4xl pb-16 pt-6">
                            {data.heading.occupation ? <p className="text-sm uppercase tracking-[0.35em] text-[#d4764e]">{data.heading.occupation}</p> : null}
                            {name ? <h1 className="mt-4 font-serif text-6xl leading-[0.95] md:text-8xl">{name}</h1> : null}
                            {location ? <p className="mt-6 text-sm text-[#c8b79a]">{location}</p> : null}
                        </section>

                        <Section id="about" title="01 / Story" show={visibility.about} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]" className="max-w-3xl pb-16">
                            <p className="mt-6 text-2xl leading-10 text-[#f4ead8]">{data.summary}</p>
                        </Section>

                        <Section id="projects" title="02 / Work" show={visibility.projects} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]" className="pb-16">
                            <div className="mt-8 space-y-8">
                                {data.projects.filter((project) => project.title || project.description).map((project, index) => (
                                    <article key={project.id} className={`grid gap-6 border border-[#2c261f] bg-[#1c1814] p-6 md:grid-cols-[1.1fr_0.9fr] ${index % 2 ? 'md:translate-x-8' : ''}`}>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.24em] text-[#d4764e]">{String(index + 1).padStart(2, '0')}</p>
                                            <h3 className="mt-3 font-serif text-3xl">{project.title}</h3>
                                            {project.description ? <p className="mt-4 text-sm leading-7 text-[#c8b79a]">{project.description}</p> : null}
                                            {project.technologyList.length ? <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[#8d7d66]">{project.technologyList.join(' / ')}</p> : null}
                                            <SafeLink href={project.link} className="mt-5 inline-flex text-sm text-[#d4764e] underline underline-offset-4">Open case</SafeLink>
                                        </div>
                                        {project.image ? <img src={project.image} alt="" className="h-48 w-full object-cover" /> : <div className="min-h-40 bg-[radial-gradient(circle_at_top,_#d4764e33,_transparent_55%)]" aria-hidden="true" />}
                                    </article>
                                ))}
                            </div>
                        </Section>

                        <Section id="experience" title="03 / Path" show={visibility.experience} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]" className="pb-16">
                            <div className="mt-8 columns-1 gap-8 md:columns-2">
                                {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                                    <article key={item.id} className="mb-8 break-inside-avoid">
                                        <p className="text-xs text-[#8d7d66]">{formatRange(item.begin, item.end)}</p>
                                        <h3 className="mt-1 font-serif text-2xl">{item.jobTitle}</h3>
                                        {item.employer ? <p className="text-sm text-[#d4764e]">{item.employer}</p> : null}
                                        {item.description ? <p className="mt-3 text-sm leading-7 text-[#c8b79a]">{item.description}</p> : null}
                                    </article>
                                ))}
                            </div>
                        </Section>

                        <div className="grid gap-10 pb-16 md:grid-cols-2">
                            <Section id="skills" title="04 / Craft" show={visibility.skills} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]">
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {data.skills.map((skill) => (
                                        <span key={skill.id} className="rounded-full border border-[#3a3229] px-3 py-1 text-sm">{skill.name}</span>
                                    ))}
                                </div>
                            </Section>
                            <Section id="education" title="05 / Study" show={visibility.education} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]">
                                <ul className="mt-5 space-y-4">
                                    {data.education.filter((item) => item.school || item.degree).map((item) => (
                                        <li key={item.id}>
                                            <h3 className="font-serif text-xl">{item.degree || item.school}</h3>
                                            <p className="text-sm text-[#c8b79a]">{[item.school, formatRange(item.started, item.finished)].filter(Boolean).join(' · ')}</p>
                                            {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        </div>

                        <div className="grid gap-10 pb-16 md:grid-cols-3">
                            <Section id="certifications" title="Certifications" show={visibility.certifications} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]">
                                <ul className="mt-4 space-y-3 text-sm">
                                    {data.certifications.filter((item) => item.title).map((item) => (
                                        <li key={item.id}>
                                            <p>{item.title}</p>
                                            <p className="text-[#8d7d66]">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                            {item.description ? <p className="mt-1">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                            <Section id="achievements" title="Signals" show={visibility.achievements} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]">
                                <ul className="mt-4 space-y-3 text-sm">
                                    {data.achievements.filter((item) => item.title || item.description).map((item) => (
                                        <li key={item.id}>
                                            <p>{item.title}</p>
                                            {item.description ? <p className="text-[#c8b79a]">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                            <Section id="languages" title="Voice" show={visibility.languages || visibility.hobbies} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]">
                                {visibility.languages ? <p className="mt-4 text-sm">{data.languages.map((item) => [item.name, item.level].filter(Boolean).join(' — ')).join(' · ')}</p> : null}
                                {visibility.hobbies ? <p className="mt-3 text-sm text-[#c8b79a]">{data.hobbies.join(' · ')}</p> : null}
                            </Section>
                        </div>

                        <Section id="references" title="Notes from others" show={visibility.references} headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]" className="pb-16">
                            <div className="mt-6 grid gap-6 md:grid-cols-2">
                                {data.references.filter((item) => item.name || item.reference).map((item) => (
                                    <blockquote key={item.id} className="bg-[#1c1814] p-5">
                                        {item.reference ? <p className="font-serif text-xl leading-8">“{item.reference}”</p> : null}
                                        {item.name ? <footer className="mt-3 text-xs uppercase tracking-[0.2em] text-[#d4764e]">{item.name}</footer> : null}
                                    </blockquote>
                                ))}
                            </div>
                        </Section>

                        {data.customSections.filter((section) => section.title || section.items.length).map((section, index) => (
                            <Section key={section.id} id={section.id} title={section.title || `More ${index + 1}`} show headingClassName="text-xs uppercase tracking-[0.3em] text-[#d4764e]" className="pb-12">
                                <ul className="mt-5 space-y-3">
                                    {section.items.map((item) => (
                                        <li key={item.id}>
                                            {item.title ? <h3 className="font-serif text-xl">{item.title}</h3> : null}
                                            {item.description ? <p className="text-sm text-[#c8b79a]">{item.description}</p> : null}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        ))}
                    </main>

                    <footer id="contact" className="border-t border-[#2c261f] px-6 py-10 md:px-10">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#d4764e]">Contact</p>
                        <ContactList heading={data.heading} className="mt-4 flex flex-wrap gap-5 text-sm" linkClassName="text-[#f4ead8] underline decoration-[#d4764e] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4764e]" />
                    </footer>
                </div>
            </div>
        </div>
    );
}
