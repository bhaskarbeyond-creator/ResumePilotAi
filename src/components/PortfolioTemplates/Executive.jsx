import React from 'react';
import {
    ContactList,
    EmptyWebCv,
    Portrait,
    SafeLink,
    Section,
    SkipLink,
    formatRange,
    usePortfolioView,
} from './shared.jsx';

export default function Executive({ canonical }) {
    const { data, visibility, name, location } = usePortfolioView(canonical, 'executive');
    if (!visibility.heading && !visibility.about && !visibility.experience) {
        return <EmptyWebCv />;
    }

    return (
        <div className="webcv-executive min-h-screen bg-[#f4efe6] text-[#1c2430]" data-webcv-template="executive">
            <SkipLink />
            <header className="bg-[#182033] text-[#f4efe6]">
                <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[auto_1fr] md:items-center">
                    <Portrait src={data.heading.photo} name={name} className="h-36 w-36 rounded-full object-cover ring-2 ring-[#c4a46a]" />
                    <div>
                        {name ? <h1 className="font-serif text-4xl tracking-tight md:text-5xl">{name}</h1> : null}
                        {data.heading.occupation ? <p className="mt-2 text-sm uppercase tracking-[0.28em] text-[#c4a46a]">{data.heading.occupation}</p> : null}
                        {location ? <p className="mt-4 text-sm text-[#d7d2c8]">{[data.heading.address, location, data.heading.postalcode].filter(Boolean).join(' · ')}</p> : null}
                        <ContactList heading={data.heading} className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm" linkClassName="text-[#f4efe6] underline decoration-[#c4a46a] underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c4a46a]" />
                    </div>
                </div>
            </header>

            <main id="main" className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.9fr)]">
                <div>
                    <Section id="about" title="Executive summary" show={visibility.about} headingClassName="font-serif text-2xl">
                        <blockquote className="mt-5 border-l-2 border-[#c4a46a] pl-5 text-lg leading-8 text-[#2a3342]">{data.summary}</blockquote>
                    </Section>

                    <Section id="experience" title="Leadership experience" show={visibility.experience} className="mt-14" headingClassName="font-serif text-2xl">
                        <ol className="relative mt-8 space-y-8 border-l border-[#c4a46a]/50 pl-6">
                            {data.experiences.filter((item) => item.jobTitle || item.employer || item.description).map((item) => (
                                <li key={item.id} className="relative">
                                    <span className="absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full bg-[#c4a46a]" aria-hidden="true" />
                                    <p className="text-xs uppercase tracking-[0.18em] text-[#7a6a4c]">{formatRange(item.begin, item.end)}</p>
                                    <h3 className="mt-1 font-serif text-xl">{item.jobTitle}</h3>
                                    {item.employer ? <p className="text-sm font-medium text-[#3d4a61]">{item.employer}</p> : null}
                                    {item.description ? <p className="mt-2 text-sm leading-7 text-[#394353]">{item.description}</p> : null}
                                </li>
                            ))}
                        </ol>
                    </Section>

                    <Section id="education" title="Education" show={visibility.education} className="mt-14" headingClassName="font-serif text-2xl">
                        <ul className="mt-6 space-y-5">
                            {data.education.filter((item) => item.school || item.degree).map((item) => (
                                <li key={item.id}>
                                    <h3 className="font-serif text-lg">{item.degree}</h3>
                                    <p className="text-sm text-[#5b6576]">{[item.school, formatRange(item.started, item.finished)].filter(Boolean).join(' · ')}</p>
                                    {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section id="projects" title="Selected initiatives" show={visibility.projects} className="mt-14" headingClassName="font-serif text-2xl">
                        <ol className="mt-6 space-y-5">
                            {data.projects.filter((project) => project.title || project.description).map((project, index) => (
                                <li key={project.id} className="grid grid-cols-[2rem_1fr] gap-3">
                                    <span className="font-serif text-xl text-[#c4a46a]">{String(index + 1).padStart(2, '0')}</span>
                                    <div>
                                        <h3 className="font-medium">{project.title}</h3>
                                        {project.description ? <p className="mt-1 text-sm leading-6 text-[#394353]">{project.description}</p> : null}
                                        <SafeLink href={project.link} className="mt-2 inline-block text-sm text-[#7a6a4c] underline underline-offset-4">Review</SafeLink>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Section>
                </div>

                <aside className="space-y-10 rounded-sm bg-[#ebe4d6] p-6">
                    <Section id="skills" title="Capabilities" show={visibility.skills} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <ul className="mt-4 space-y-2">
                            {data.skills.map((skill) => (
                                <li key={skill.id} className="flex items-center justify-between border-b border-[#d7cdb8] py-1 text-sm">
                                    <span>{skill.name}</span>
                                    <span className="text-xs text-[#7a6a4c]">{skill.rating}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="certifications" title="Credentials" show={visibility.certifications} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <ul className="mt-4 space-y-3 text-sm">
                            {data.certifications.filter((item) => item.title).map((item) => (
                                <li key={item.id}>
                                    <p className="font-medium">{item.title}</p>
                                    <p className="text-[#5b6576]">{[item.issuer, item.date].filter(Boolean).join(' · ')}</p>
                                    {item.description ? <p className="mt-1">{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="achievements" title="Distinctions" show={visibility.achievements} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <ul className="mt-4 space-y-3 text-sm">
                            {data.achievements.filter((item) => item.title || item.description).map((item) => (
                                <li key={item.id}>
                                    <p className="font-medium">{item.title}</p>
                                    {item.description ? <p>{item.description}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="languages" title="Languages" show={visibility.languages} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <ul className="mt-4 space-y-1 text-sm">
                            {data.languages.map((item) => (
                                <li key={item.id}>{[item.name, item.level].filter(Boolean).join(' — ')}</li>
                            ))}
                        </ul>
                    </Section>
                    <Section id="hobbies" title="Interests" show={visibility.hobbies} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <p className="mt-4 text-sm">{data.hobbies.join(', ')}</p>
                    </Section>
                    <Section id="references" title="References" show={visibility.references} headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                        <ul className="mt-4 space-y-3 text-sm">
                            {data.references.filter((item) => item.name || item.reference).map((item) => (
                                <li key={item.id}>
                                    {item.reference ? <p>“{item.reference}”</p> : null}
                                    {item.name ? <p className="mt-1 font-medium">{item.name}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Section>
                    {data.customSections.filter((section) => section.title || section.items.length).map((section) => (
                        <Section key={section.id} id={section.id} title={section.title || 'Additional'} show headingClassName="text-xs uppercase tracking-[0.24em] text-[#7a6a4c]">
                            <ul className="mt-4 space-y-3 text-sm">
                                {section.items.map((item) => (
                                    <li key={item.id}>
                                        {item.title ? <p className="font-medium">{item.title}</p> : null}
                                        {item.description ? <p>{item.description}</p> : null}
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    ))}
                </aside>
            </main>

            <footer id="contact" className="border-t border-[#d7cdb8] bg-[#ebe4d6]">
                <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm md:flex-row md:items-center md:justify-between">
                    <p className="font-serif text-lg">{name}</p>
                    <p className="text-[#5b6576]">Available for confidential conversations.</p>
                </div>
            </footer>
        </div>
    );
}
