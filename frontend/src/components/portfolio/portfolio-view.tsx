/**
 * Renders a canonical Web CV portfolio. The public page and the builder preview
 * both use it, so a candidate previews exactly what visitors will see.
 *
 * Only what the candidate entered is shown, and empty sections are omitted.
 * For privacy the street address and postal code are never rendered, only
 * city and country. Links are allowed only for http(s) and mailto, and images
 * only for http(s) or inline raster data.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, FolderGit2, Globe, Link2, Mail, MapPin, Phone } from 'lucide-react';
import {
  displayName,
  hasContent,
  safeHttpUrl,
  safeMailto,
  templateMeta,
  type PortfolioCanonical,
  type PortfolioSkill,
} from '@/lib/portfolio-document';
import { cn } from '@/lib/utils';

interface Palette {
  page: string;
  card: string;
  muted: string;
  accent: string;
  chip: string;
  rule: string;
}

/** Each template keeps WCAG AA text contrast on its own background. */
const PALETTES: Record<string, Palette> = {
  modernMinimal: { page: 'bg-surface text-ink', card: 'border border-border bg-surface', muted: 'text-ink-secondary', accent: 'text-brand-700', chip: 'bg-brand-50 text-brand-800', rule: 'border-border' },
  executive: { page: 'bg-canvas text-ink', card: 'border border-border bg-surface shadow-sm', muted: 'text-ink-secondary', accent: 'text-neutral-900', chip: 'bg-neutral-200 text-neutral-900', rule: 'border-neutral-300' },
  creativeDark: { page: 'bg-neutral-950 text-neutral-50', card: 'border border-neutral-800 bg-neutral-900', muted: 'text-neutral-300', accent: 'text-amber-300', chip: 'bg-neutral-800 text-amber-200', rule: 'border-neutral-800' },
  premiumTech: { page: 'bg-slate-950 text-slate-50', card: 'border border-slate-800 bg-slate-900', muted: 'text-slate-300', accent: 'text-cyan-300', chip: 'bg-slate-800 text-cyan-200', rule: 'border-slate-800' },
};

type Level = 1 | 2 | 3 | 4;
const Heading = ({ level, className, children }: { level: Level; className?: string; children: ReactNode }) => {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  return <Tag className={className}>{children}</Tag>;
};

function safeImageUrl(value: string): string | null {
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value.trim())) return value.trim();
  return safeHttpUrl(value);
}

const dateRange = (start: string, end: string) => [start, end].filter(Boolean).join(' – ');

interface PortfolioViewProps {
  canonical: PortfolioCanonical;
  /** Level of the candidate's name: 1 on the public page, 2 inside the dashboard preview. */
  headingLevel?: 1 | 2;
  className?: string;
}

export function PortfolioView({ canonical, headingLevel = 1, className }: PortfolioViewProps) {
  const palette = PALETTES[templateMeta(canonical.template).id] ?? PALETTES.modernMinimal;
  const section = (headingLevel + 1) as Level;
  const item = (headingLevel + 2) as Level;
  const { heading } = canonical;
  const name = displayName(canonical);
  const location = [heading.city, heading.country].filter(Boolean).join(', ');
  const photo = heading.photo ? safeImageUrl(heading.photo) : null;
  const contact = [
    { key: 'email', href: safeMailto(heading.email), label: heading.email, icon: Mail },
    { key: 'phone', href: heading.phone ? `tel:${heading.phone.replace(/[^\d+]/g, '')}` : null, label: heading.phone, icon: Phone },
    { key: 'website', href: safeHttpUrl(heading.website), label: 'Website', icon: Globe },
    { key: 'linkedin', href: safeHttpUrl(heading.linkedin), label: 'LinkedIn', icon: Link2 },
    { key: 'github', href: safeHttpUrl(heading.github), label: 'GitHub', icon: FolderGit2 },
  ].filter((entry) => entry.href);
  const skillGroups = groupSkills(canonical.skills);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [photo]);

  const initials = (name || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const navSections = [
    canonical.summary ? { id: 'portfolio-section-about', label: 'About' } : null,
    canonical.experiences.length > 0 ? { id: 'portfolio-section-experience', label: 'Experience' } : null,
    canonical.projects.length > 0 ? { id: 'portfolio-section-projects', label: 'Projects' } : null,
    skillGroups.length > 0 ? { id: 'portfolio-section-skills', label: 'Skills' } : null,
    canonical.education.length > 0 ? { id: 'portfolio-section-education', label: 'Education' } : null,
    canonical.certifications.length > 0 ? { id: 'portfolio-section-certifications', label: 'Certifications' } : null,
    canonical.achievements.length > 0 ? { id: 'portfolio-section-achievements', label: 'Achievements' } : null,
    canonical.languages.length > 0 ? { id: 'portfolio-section-languages', label: 'Languages' } : null,
    canonical.hobbies.length > 0 ? { id: 'portfolio-section-interests', label: 'Interests' } : null,
  ].filter((entry): entry is { id: string; label: string } => entry !== null);

  return (
    <div className={cn('min-w-0', palette.page, className)}>
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {photo && !photoFailed ? (
            <img
              src={photo}
              alt={name ? `Photo of ${name}` : 'Profile photo'}
              onError={() => setPhotoFailed(true)}
              className="size-24 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className={cn(
                'flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold sm:size-24',
                palette.chip,
              )}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <Heading level={headingLevel} className="text-3xl font-bold tracking-tight break-words sm:text-4xl">{name || 'Unnamed portfolio'}</Heading>
            {heading.occupation && <p className={cn('mt-1 text-lg font-medium break-words', palette.accent)}>{heading.occupation}</p>}
            {canonical.extras.tagline && <p className={cn('mt-2 break-words', palette.muted)}>{canonical.extras.tagline}</p>}
            {(location || contact.length > 0) && (
              <ul className={cn('mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm', palette.muted)}>
                {location && <li className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{location}</li>}
                {contact.map(({ key, href, label, icon: Icon }) => (
                  <li key={key}>
                    <a href={href!} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline break-all" {...(href!.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                      <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>

        {navSections.length >= 2 && (
          <nav aria-label="Portfolio sections" className={cn('rounded-2xl px-4 py-2.5', palette.card)}>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-medium">
              {navSections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className={cn('underline-offset-4 hover:underline', palette.accent)}>
                    {sec.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {!hasContent(canonical) && <p className={cn('rounded-2xl p-5', palette.card, palette.muted)}>This portfolio has no content yet.</p>}

        {canonical.summary && (
          <ViewSection id="portfolio-section-about" level={section} palette={palette} title="About">
            <p className={cn('whitespace-pre-line break-words', palette.muted)}>{canonical.summary}</p>
          </ViewSection>
        )}

        {canonical.experiences.length > 0 && (
          <ViewSection id="portfolio-section-experience" level={section} palette={palette} title="Experience">
            <ol className="space-y-5">
              {canonical.experiences.map((entry) => (
                <li key={entry.id} className={cn('border-l-2 pl-4', palette.rule)}>
                  <Heading level={item} className="font-semibold break-words">{[entry.jobTitle, entry.employer].filter(Boolean).join(' · ') || 'Role'}</Heading>
                  {(entry.begin || entry.end || entry.location) && (
                    <p className={cn('text-sm', palette.muted)}>{[dateRange(entry.begin, entry.end), entry.location].filter(Boolean).join(' · ')}</p>
                  )}
                  {entry.description && <p className={cn('mt-2 whitespace-pre-line break-words text-sm', palette.muted)}>{entry.description}</p>}
                </li>
              ))}
            </ol>
          </ViewSection>
        )}

        {canonical.projects.length > 0 && (
          <ViewSection id="portfolio-section-projects" level={section} palette={palette} title="Projects">
            <ul className="grid gap-4 sm:grid-cols-2">
              {canonical.projects.map((project) => {
                const link = safeHttpUrl(project.link);
                return (
                  <li key={project.id} className={cn('rounded-xl border p-4', palette.rule)}>
                    <Heading level={item} className="font-semibold break-words">{project.title || 'Project'}</Heading>
                    {project.description && <p className={cn('mt-1 whitespace-pre-line break-words text-sm', palette.muted)}>{project.description}</p>}
                    {project.technologyList.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Technologies used in ${project.title || 'this project'}`}>
                        {project.technologyList.map((tech) => <li key={tech} className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', palette.chip)}>{tech}</li>)}
                      </ul>
                    )}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className={cn('mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline', palette.accent)}>
                        View {project.title || 'project'}<ExternalLink className="size-3.5" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </ViewSection>
        )}

        {skillGroups.length > 0 && (
          <ViewSection id="portfolio-section-skills" level={section} palette={palette} title="Skills">
            <div className="space-y-3">
              {skillGroups.map(([category, skills]) => (
                <div key={category || 'skills'}>
                  {category && <p className={cn('mb-1.5 text-sm font-medium', palette.muted)}>{category}</p>}
                  <ul className="flex flex-wrap gap-1.5">
                    {skills.map((skill) => <li key={skill.id} className={cn('rounded-full px-3 py-1 text-sm', palette.chip)}>{skill.name}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </ViewSection>
        )}

        {canonical.education.length > 0 && (
          <ViewSection id="portfolio-section-education" level={section} palette={palette} title="Education">
            <ul className="space-y-4">
              {canonical.education.map((entry) => (
                <li key={entry.id}>
                  <Heading level={item} className="font-semibold break-words">{[entry.degree, entry.school].filter(Boolean).join(' · ') || 'Education'}</Heading>
                  {(entry.started || entry.finished) && <p className={cn('text-sm', palette.muted)}>{dateRange(entry.started, entry.finished)}</p>}
                  {entry.description && <p className={cn('mt-1 whitespace-pre-line break-words text-sm', palette.muted)}>{entry.description}</p>}
                </li>
              ))}
            </ul>
          </ViewSection>
        )}

        {canonical.certifications.length > 0 && (
          <ViewSection id="portfolio-section-certifications" level={section} palette={palette} title="Certifications">
            <ul className="space-y-3">
              {canonical.certifications.map((entry) => {
                const link = safeHttpUrl(entry.link);
                return (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium break-words">{entry.title || 'Certification'}</span>
                    {(entry.issuer || entry.date) && <span className={palette.muted}> · {[entry.issuer, entry.date].filter(Boolean).join(' · ')}</span>}
                    {link && <> · <a href={link} target="_blank" rel="noopener noreferrer" className={cn('underline-offset-4 hover:underline', palette.accent)}>Credential<span className="sr-only"> for {entry.title} (opens in a new tab)</span></a></>}
                  </li>
                );
              })}
            </ul>
          </ViewSection>
        )}

        {canonical.achievements.length > 0 && (
          <ViewSection id="portfolio-section-achievements" level={section} palette={palette} title="Achievements">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {canonical.achievements.map((entry) => (
                <li key={entry.id}><span className="font-medium">{entry.title}</span>{entry.description && <span className={palette.muted}> — {entry.description}</span>}</li>
              ))}
            </ul>
          </ViewSection>
        )}

        {canonical.languages.length > 0 && (
          <ViewSection id="portfolio-section-languages" level={section} palette={palette} title="Languages">
            <ul className="flex flex-wrap gap-2 text-sm">
              {canonical.languages.map((entry) => <li key={entry.id} className={cn('rounded-full px-3 py-1', palette.chip)}>{entry.name}{entry.level && ` · ${entry.level}`}</li>)}
            </ul>
          </ViewSection>
        )}

        {canonical.customSections.map((custom) => (
          custom.items.length > 0 && (
            <ViewSection level={section} palette={palette} key={custom.id} title={custom.title || 'More'}>
              <ul className="space-y-2 text-sm">
                {custom.items.map((entry) => (
                  <li key={entry.id}>{entry.title && <span className="font-medium">{entry.title}</span>}{entry.title && entry.description && ' — '}{entry.description && <span className={cn('whitespace-pre-line', palette.muted)}>{entry.description}</span>}</li>
                ))}
              </ul>
            </ViewSection>
          )
        ))}

        {canonical.references.length > 0 && (
          <ViewSection level={section} palette={palette} title="References">
            <ul className="space-y-3 text-sm">
              {canonical.references.map((entry) => (
                <li key={entry.id}><span className="font-medium">{entry.name}</span>{entry.reference && <p className={cn('mt-0.5 whitespace-pre-line', palette.muted)}>{entry.reference}</p>}</li>
              ))}
            </ul>
          </ViewSection>
        )}

        {canonical.hobbies.length > 0 && (
          <ViewSection id="portfolio-section-interests" level={section} palette={palette} title="Interests">
            <p className={cn('text-sm', palette.muted)}>{canonical.hobbies.join(' · ')}</p>
          </ViewSection>
        )}
      </div>
    </div>
  );
}

function ViewSection({ id, title, level, palette, children }: { id?: string; title: string; level: Level; palette: Palette; children: ReactNode }) {
  return (
    <section id={id} className={cn('scroll-mt-6 rounded-2xl p-5 sm:p-6', palette.card)}>
      <Heading level={level} className={cn('text-lg font-semibold', palette.accent)}>{title}</Heading>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function groupSkills(skills: PortfolioSkill[]): Array<[string, PortfolioSkill[]]> {
  const groups = new Map<string, PortfolioSkill[]>();
  for (const skill of skills) {
    const key = skill.category.trim();
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return [...groups.entries()];
}
