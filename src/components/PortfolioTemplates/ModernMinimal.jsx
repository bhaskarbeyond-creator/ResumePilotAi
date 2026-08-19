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

export default function ModernMinimal({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'modernMinimal');
    if (!visibility.heading && !visibility.about && !visibility.experience && !visibility.projects) {
        return <EmptyWebCv />;
    }

    return (
        <div className="webcv-modern min-h-screen bg-[#fbfbfa] text-neutral-800" data-webcv-template="modernMinimal">
            <SkipLink />
            <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-[#fbfbfa]/90 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
                    <a href="#main" className="text-sm font-medium tracking-[0.18em] uppercase text-neutral-900">{name || 'Portfolio'}</a>
                    <NavLinks visibility={visibility} className="hidden md:flex items-center gap-6" linkClassName="text-xs tracking-wide text-neutral-500 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900" />
                </div>
            </header>

            <main id="main">
                <section className="mx-auto grid max-w-5xl gap-10 px-6 pb-16 pt-16 md:grid-cols-[1.4fr_0.8fr] md:items-end">
                    <div>
                        {data.heading.occupation ? <p className="text-xs uppercase tracking-[0.28em] text-neutral-500">{data.heading.occupation}</p> : null}
                        {name ? <h1 className="mt-4 text-5xl font-semibold tracking-tight text-neutral-950 sm:text-6xl">{name}</h1> : null}
                        {data.extras.tagline && data.extras.tagline !== data.heading.occupation ? <p className="mt-5 max-w-xl text-lg text-neutral-600">{data.extras.tagline}</p> : null}
                        {location ? <p className="mt-6 text-sm text-neutral-500">{location}</p> : null}
                    </div>
                    <Portrait src={data.heading.photo} name={name} className="h-48 w-48 justify-self-start rounded-2xl object-cover md:justify-self-end" />
                </section>

                <Section id="about" title="About" show={visibility.about} className="mx-auto max-w-5xl px-6 pb-20" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <p className="mt-6 max-w-3xl text-xl leading-8 text-neutral-700">{data.summary}</p>
                </Section>

                <Section id="projects" title="Selected work" show={visibility.projects} className="mx-auto max-w-5xl px-6 pb-20" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <div className="mt-8 grid gap-6 md:grid-cols-2">
                        {data.projects.filter((project) => project.title || project.description).map((project) => (
                            <article key={project.id} className="rounded-2xl border border-neutral-200 bg-white p-6">
                                <h3 className="text-xl font-semibold text-neutral-950">{project.title}</h3>
                                {project.description ? <p className="mt-3 text-sm leading-6 text-neutral-600">{project.description}</p> : null}
                                {project.technologyList.length ? <p className="mt-4 text-xs uppercase tracking-[0.16em] text-neutral-400">{project.technologyList.join(' · ')}</p> : null}
                                <SafeLink href={project.link} className="mt-5 inline-flex text-sm font-medium text-neutral-950 underline underline-offset-4">View project</SafeLink>
                            </article>
                        ))}
                    </div>
                </Section>

                <Section id="experience" title="Experience" show={visibility.experience} className="mx-auto max-w-5xl px-6 pb-20" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <ol className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
                        {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                            <li key={item.id} className="grid gap-3 py-6 md:grid-cols-[8rem_1fr]">
                                <p className="text-xs uppercase tracking-[0.14em] text-neutral-400">{formatRange(item.begin, item.end)}</p>
                                <div>
                                    <h3 className="text-lg font-semibold text-neutral-950">{item.jobTitle}</h3>
                                    {item.employer ? <p className="text-sm text-neutral-500">{item.employer}</p> : null}
                                    {item.description ? <p className="mt-3 text-sm leading-6 text-neutral-600">{item.description}</p> : null}
                                </div>
                            </li>
                        ))}
                    </ol>
                </Section>

                <Section id="skills" title="Skills" show={visibility.skills} className="mx-auto max-w-5xl px-6 pb-20" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <p className="mt-6 max-w-4xl text-lg leading-8 text-neutral-700">{data.skills.map((skill) => skill.name).join('  ·  ')}</p>
                </Section>

                <Section id="education" title="Education" show={visibility.education} className="mx-auto max-w-5xl px-6 pb-20" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <ul className="mt-8 space-y-6">
                        {data.education.filter((item) => item.school || item.degree).map((item) => (
                            <li key={item.id}>
                                <h3 className="text-lg font-semibold">{item.degree || item.school}</h3>
                                <p className="text-sm text-neutral-500">{[item.school, formatRange(item.started, item.finished)].filter(Boolean).join(' · ')}</p>
                                {item.description ? <p className="mt-2 text-sm text-neutral-600">{item.description}</p> : null}
                            </li>
                        ))}
                    </ul>
                </Section>

                <div className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 md:grid-cols-3">
                    <Section id="certifications" title="Certifications" show={visibility.certifications} headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                        <ul className="mt-4 space-y-3 text-sm">
                            {data.certifications.filter((item) => item.title).map((item) => (
                                <li key={item.id}>
                                    <p className="font-medium text-neutral-900">{item.title}</p>
                                    <p className="text-neutral-500">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                    {item.description ? <p className="mt-1 text-neutral-600">{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="achievements" title="Achievements" show={visibility.achievements} headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                        <ul className="mt-4 space-y-3 text-sm">
                            {data.achievements.filter((item) => item.title || item.description).map((item) => (
                                <li key={item.id}>
                                    <p className="font-medium text-neutral-900">{item.title}</p>
                                    {item.description ? <p className="text-neutral-600">{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="languages" title="Languages & interests" show={visibility.languages || visibility.hobbies} headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                        {visibility.languages ? <p className="mt-4 text-sm text-neutral-700">{data.languages.map((item) => [item.name, item.level].filter(Boolean).join(' — ')).join(' · ')}</p> : null}
                        {visibility.hobbies ? <p className="mt-3 text-sm text-neutral-500">{data.hobbies.join(' · ')}</p> : null}
                    </Section>
                </div>

                <Section id="references" title="References" show={visibility.references} className="mx-auto max-w-5xl px-6 pb-16" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                        {data.references.filter((item) => item.name || item.reference).map((item) => (
                            <blockquote key={item.id} className="border-l border-neutral-300 pl-4">
                                {item.reference ? <p className="text-sm leading-6 text-neutral-700">“{item.reference}”</p> : null}
                                {item.name ? <footer className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-400">{item.name}</footer> : null}
                            </blockquote>
                        ))}
                    </div>
                </Section>

                {data.customSections.filter((section) => section.title || section.items.length).map((section) => (
                    <Section key={section.id} id={section.id} title={section.title || 'More'} show className="mx-auto max-w-5xl px-6 pb-16" headingClassName="text-sm font-medium uppercase tracking-[0.22em] text-neutral-400">
                        <ul className="mt-6 space-y-4">
                            {section.items.map((item) => (
                                <li key={item.id}>
                                    {item.title ? <h3 className="font-medium text-neutral-900">{item.title}</h3> : null}
                                    {item.description ? <p className="text-sm text-neutral-600">{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                ))}
            </main>

            <footer id="contact" className="border-t border-neutral-200 bg-white">
                <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-medium text-neutral-900">{name || 'Contact'}</p>
                        {location ? <p className="text-sm text-neutral-500">{[data.heading.address, location, data.heading.postalcode].filter(Boolean).join(' · ')}</p> : null}
                    </div>
                    <ContactList heading={data.heading} className="flex flex-wrap gap-4 text-sm" linkClassName="text-neutral-700 underline underline-offset-4 hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900" />
                </div>
            </footer>
        </div>
    );
}
