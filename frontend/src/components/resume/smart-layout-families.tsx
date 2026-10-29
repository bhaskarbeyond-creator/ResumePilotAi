/**
 * DIR-008 — per-template page-one layout families.
 *
 * The legacy family components remain registered for existing callers. The
 * measured A4 document path uses ComposableResumeLayout below: five archetypes
 * driven by the per-template specifications and breakable content blocks. This
 * preserves tokens and ordering, but is not pixel-identical to every legacy family.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { formatDateRange } from '@/lib/resume-format';
import type { TemplateMeta } from '@/lib/template-catalog';
import type { FlowItem, PartitionedPage } from '@/lib/smart-partitioner';
import { SECTION_TITLES } from '@/lib/smart-partitioner';
import { SECTION_KEYS, type AsideSectionKey, type SectionKey, type TemplateLayoutSpec } from '@/lib/template-layouts';
import type { ResumeDocumentModel } from '@/lib/resume-view-model';
import { backgroundStops, contrastRatio, getContrastTextColor, readableAccent } from '@/cv-templates/templateUtils';
import {
  FlowItemRenderer,
  GithubIcon,
  Globe,
  LinkedinIcon,
  Mail,
  MapPin,
  Phone,
  RichTextContent,
  SectionTitle,
  SidebarLanguagesRenderer,
  SidebarSkillsRenderer,
} from './smart-render-primitives';

export interface ResumePalette {
  primary: string;
  secondary: string;
  soft?: string;
  text?: string;
}

export interface FamilyPageProps {
  resume: any;
  meta: TemplateMeta;
  palette: ResumePalette;
  page: PartitionedPage;
  fullName: string;
  layout: TemplateLayoutSpec;
}

const NAME_SCALE: Record<TemplateLayoutSpec['nameScale'], string> = {
  md: 'text-[19px]',
  lg: 'text-[24px]',
  xl: 'text-[30px]',
  '2xl': 'text-[36px]',
};

const DENSITY_GAP: Record<TemplateLayoutSpec['density'], string> = {
  compact: 'space-y-1.5',
  standard: 'space-y-2.5',
  spacious: 'space-y-4',
};

const PHOTO_RADIUS: Record<TemplateLayoutSpec['photoShape'], string> = {
  circle: 'rounded-full',
  rounded: 'rounded-xl',
  square: 'rounded-none',
  none: 'hidden',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CV';
}

function hasPhoto(heading: any): boolean {
  return Boolean(heading?.photo) && heading?.showPhoto !== false;
}

function skillCategories(resume: any): any[] {
  if (Array.isArray(resume?.skillCategories) && resume.skillCategories.length > 0) return resume.skillCategories;
  if (Array.isArray(resume?.skills) && resume.skills.length > 0) {
    return [{ id: 'core', category: 'Skills', skills: resume.skills }];
  }
  return [];
}

function yearsOfExperience(resume: any): number {
  const starts = (resume?.experience || [])
    .map((entry: any) => Number.parseInt(String(entry?.startDate || entry?.begin || ''), 10))
    .filter((value: number) => Number.isFinite(value));
  if (starts.length === 0) return 0;
  const earliest = Math.min(...starts);
  const currentYear = new Date().getFullYear();
  return Math.max(0, currentYear - earliest);
}

/* ─────────────────────────────────────────────────────────────
 * ATOMS
 * ───────────────────────────────────────────────────────────── */

function Photo({
  heading,
  fullName,
  layout,
  size = 'size-20',
  className,
  ring = true,
  ringClassName,
  style,
}: {
  heading: any;
  fullName: string;
  layout: TemplateLayoutSpec;
  size?: string;
  className?: string;
  ring?: boolean;
  ringClassName?: string;
  style?: React.CSSProperties;
}) {
  if (!hasPhoto(heading) || layout.photoShape === 'none') return null;
  return (
    <img
      src={heading.photo}
      alt={fullName}
      className={cn(
        'shrink-0 object-cover',
        size,
        PHOTO_RADIUS[layout.photoShape],
        ring && (ringClassName || 'ring-2 ring-white/40'),
        className
      )}
      style={style}
    />
  );
}

function ContactEntry({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  tone: 'light' | 'dark';
}) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', tone === 'dark' ? 'text-white/90' : 'text-neutral-600')}>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="min-w-0 break-words">{value}</span>
    </span>
  );
}

function contactValues(heading: any) {
  return {
    email: heading?.email,
    phone: heading?.phone,
    location: heading?.location,
    linkedin: heading?.linkedin,
    github: heading?.github,
    website: heading?.website,
  };
}

function ContactRow({
  heading,
  layout,
  tone = 'light',
  justify,
}: {
  heading: any;
  layout: TemplateLayoutSpec;
  tone?: 'light' | 'dark';
  justify?: string;
}) {
  const values = contactValues(heading);
  const entries = [
    { key: 'email', icon: <Mail className="size-3" />, value: values.email },
    { key: 'phone', icon: <Phone className="size-3" />, value: values.phone },
    { key: 'location', icon: <MapPin className="size-3" />, value: values.location },
    { key: 'linkedin', icon: <LinkedinIcon className="size-3" />, value: values.linkedin },
    { key: 'github', icon: <GithubIcon className="size-3" />, value: values.github },
    { key: 'website', icon: <Globe className="size-3" />, value: values.website },
  ].filter((entry) => Boolean(entry.value));

  if (entries.length === 0) return null;

  if (layout.contactLayout === 'minimal') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]', tone === 'dark' ? 'text-white/85' : 'text-neutral-600', justify)}>
        {entries.map((entry, index) => (
          <React.Fragment key={entry.key}>
            {index > 0 && <span aria-hidden="true" className="opacity-40">·</span>}
            <span className="break-words [overflow-wrap:anywhere]">{entry.value}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px]',
        layout.contactLayout === 'grid' && 'grid grid-cols-2 gap-x-4',
        layout.contactLayout === 'stack' && 'flex-col items-start gap-y-1',
        justify
      )}
    >
      {entries.map((entry) => (
        <ContactEntry key={entry.key} icon={entry.icon} value={entry.value} tone={tone} />
      ))}
    </div>
  );
}

function IdentityText({
  heading,
  fullName,
  layout,
  tone = 'light',
  align = 'left',
  showTitle = true,
}: {
  heading: any;
  fullName: string;
  layout: TemplateLayoutSpec;
  tone?: 'light' | 'dark';
  align?: 'left' | 'center';
  showTitle?: boolean;
}) {
  return (
    <div className={cn('min-w-0', align === 'center' && 'text-center')}>
      <h1
        className={cn(
          'break-words [overflow-wrap:anywhere] font-extrabold leading-[1.05] tracking-tight',
          NAME_SCALE[layout.nameScale],
          tone === 'dark' ? 'text-white' : 'text-neutral-900'
        )}
      >
        {fullName}
      </h1>
      {showTitle && heading?.title && (
        <p
          className={cn(
            'mt-1 break-words text-[11px] font-semibold uppercase tracking-[0.16em]',
            tone === 'dark' ? 'text-white/80' : 'text-neutral-600'
          )}
          style={tone === 'dark' ? undefined : { color: layout.accentBar ? undefined : undefined }}
        >
          {heading.title}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * IDENTITY BLOCKS (headerStyle)
 * ───────────────────────────────────────────────────────────── */

function IdentityBlock({
  heading,
  fullName,
  palette,
  layout,
}: {
  heading: any;
  fullName: string;
  palette: ResumePalette;
  layout: TemplateLayoutSpec;
  meta?: TemplateMeta;
}) {
  const photo = <Photo heading={heading} fullName={fullName} layout={layout} size="size-[74px]" />;
  const accentRule = { backgroundColor: palette.primary };

  switch (layout.header) {
    case 'banner': {
      return (
        <header className="w-full shrink-0 px-8 py-5 text-white" style={{ backgroundColor: palette.primary }}>
          <div className="flex items-center gap-5">
            {photo}
            <div className="flex-1">
              <IdentityText heading={heading} fullName={fullName} layout={layout} />
              <div className="mt-2">
                <ContactRow heading={heading} layout={layout} />
              </div>
            </div>
          </div>
        </header>
      );
    }
    case 'band': {
      return (
        <header className="shrink-0 border-b-4 px-8 pb-3 pt-5" style={{ borderColor: palette.primary }}>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <IdentityText heading={heading} fullName={fullName} layout={layout} />
            </div>
            {photo}
          </div>
          <div className="mt-2 border-t border-dashed border-neutral-300 pt-2">
            <ContactRow heading={heading} layout={layout} />
          </div>
        </header>
      );
    }
    case 'split': {
      return (
        <header className="grid shrink-0 grid-cols-[1.35fr_1fr] border-b border-neutral-200">
          <div className="flex items-center gap-4 px-8 py-5">
            {photo}
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
          </div>
          <div
            className="flex flex-col justify-center gap-1 px-6 py-4 text-[10px]"
            style={{ backgroundColor: palette.soft || `${palette.primary}12` }}
          >
            <span className="text-[8.5px] font-bold uppercase tracking-[0.2em] text-neutral-500">Contact</span>
            <ContactRow heading={heading} layout={{ ...layout, contactLayout: 'stack' }} />
          </div>
        </header>
      );
    }
    case 'bracket': {
      return (
        <header className="shrink-0 px-8 py-4">
          <div className="flex items-center gap-4 border-x-4 px-5 py-3" style={{ borderColor: palette.primary }}>
            {photo}
            <div className="min-w-0 flex-1">
              <IdentityText heading={heading} fullName={fullName} layout={layout} />
              <div className="mt-1.5">
                <ContactRow heading={heading} layout={layout} />
              </div>
            </div>
          </div>
        </header>
      );
    }
    case 'letterhead': {
      return (
        <header className="shrink-0 px-8 pb-4 pt-6">
          <div className="border-t-[3px] pt-3" style={{ borderColor: palette.primary }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <IdentityText heading={heading} fullName={fullName} layout={layout} />
                <div className="mt-1 h-[2px] w-14" style={accentRule} />
              </div>
              {photo}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-neutral-300 pt-2">
              <ContactRow heading={heading} layout={layout} />
              <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Curriculum Vitae
              </span>
            </div>
          </div>
        </header>
      );
    }
    case 'monogram': {
      return (
        <header className="flex shrink-0 items-center gap-5 px-8 py-5">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full text-[18px] font-black tracking-tight text-white"
            style={{ backgroundColor: palette.primary }}
            aria-hidden="true"
          >
            {initialsOf(fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
            <div className="mt-1.5">
              <ContactRow heading={heading} layout={layout} />
            </div>
          </div>
        </header>
      );
    }
    case 'grid': {
      return (
        <header className="grid shrink-0 grid-cols-[auto_1fr] gap-5 border-b-2 px-8 py-5" style={{ borderColor: palette.primary }}>
          {photo || <div className="size-[74px]" />}
          <div className="grid grid-cols-[1fr_auto] items-start gap-4">
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <ContactRow heading={heading} layout={{ ...layout, contactLayout: 'stack' }} />
            </div>
          </div>
        </header>
      );
    }
    case 'photo-band': {
      return (
        <header className="shrink-0" style={{ backgroundColor: palette.primary }}>
          <div className="flex items-stretch gap-5 px-8 py-5 text-white">
            <Photo heading={heading} fullName={fullName} layout={layout} size="size-[86px]" className="self-center" />
            <div className="min-w-0 flex-1 self-center">
              <IdentityText heading={heading} fullName={fullName} layout={layout} />
              <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1">
                <ContactRow heading={heading} layout={{ ...layout, contactLayout: 'stack' }} />
              </div>
            </div>
          </div>
          <div className="h-1.5 w-full" style={{ backgroundColor: palette.secondary }} />
        </header>
      );
    }
    case 'minimal': {
      return (
        <header className="shrink-0 px-8 pb-3 pt-6">
          <div className="flex items-baseline justify-between gap-4">
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
            {photo}
          </div>
          <div className="mt-2 border-t border-neutral-300 pt-1.5">
            <ContactRow heading={heading} layout={layout} />
          </div>
        </header>
      );
    }
    case 'centered': {
      return (
        <header className="shrink-0 px-8 pb-4 pt-6 text-center">
          {photo && (
            <div className="mb-3 flex justify-center">
              <Photo heading={heading} fullName={fullName} layout={layout} size="size-[72px]" />
            </div>
          )}
          <IdentityText heading={heading} fullName={fullName} layout={layout} align="center" />
          <div className="mx-auto mt-2 h-px w-24" style={{ backgroundColor: palette.primary }} />
          <div className="mt-2 flex justify-center">
            <ContactRow heading={heading} layout={layout} justify="justify-center" />
          </div>
        </header>
      );
    }
    case 'sidebar':
      // The rail owns the identity block for sidebar-led layouts.
      return null;
    default: {
      return (
        <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 px-8 pb-3 pt-6" style={{ borderColor: palette.primary }}>
          <div className="min-w-0">
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
            <div className="mt-2">
              <ContactRow heading={heading} layout={layout} />
            </div>
          </div>
          {photo}
        </header>
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────
 * RAIL
 * ───────────────────────────────────────────────────────────── */

function RailSection({
  section,
  resume,
  meta,
  palette,
  isDark,
}: {
  section: AsideSectionKey;
  resume: any;
  meta: TemplateMeta;
  palette: ResumePalette;
  isDark: boolean;
}) {
  if (section === 'contact') return null;
  const label = SECTION_TITLES[section as SectionKey] || section;
  const muted = isDark ? 'text-white/60' : 'text-neutral-500';
  const border = isDark ? 'border-white/15' : 'border-neutral-200';
  const heading = (
    <div className={cn('mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em]', muted)}>{label}</div>
  );

  let body: React.ReactNode = null;
  if (section === 'skills') {
    const categories = skillCategories(resume);
    if (categories.length === 0) return null;
    body = (
      <SidebarSkillsRenderer
        categories={categories}
        variant={meta.skillVariant || 'pills'}
        palette={palette}
        isDark={isDark}
      />
    );
  } else if (section === 'languages') {
    if (!Array.isArray(resume.languages) || resume.languages.length === 0) return null;
    body = (
      <SidebarLanguagesRenderer
        languages={resume.languages}
        variant={meta.skillVariant || 'dots'}
        palette={palette}
        isDark={isDark}
      />
    );
  } else if (section === 'certifications') {
    if (!Array.isArray(resume.certifications) || resume.certifications.length === 0) return null;
    body = (
      <ul className="space-y-1.5 text-[10px] leading-snug">
        {resume.certifications.map((cert: any) => (
          <li key={cert.id || cert.name || cert.title}>
            <div className="font-semibold">{cert.name || cert.title}</div>
            {(cert.issuer || cert.date) && (
              <div className={muted}>{[cert.issuer, cert.date].filter(Boolean).join(' · ')}</div>
            )}
          </li>
        ))}
      </ul>
    );
  } else if (section === 'education') {
    if (!Array.isArray(resume.education) || resume.education.length === 0) return null;
    body = (
      <ul className="space-y-2 text-[10px] leading-snug">
        {resume.education.map((edu: any, index: number) => (
          <li key={edu.id || index}>
            <div className="font-semibold">{edu.degree}{edu.field ? `, ${edu.field}` : ''}</div>
            <div className={muted}>{edu.institution}</div>
            <div className={cn('text-[9px] whitespace-nowrap', muted)}>{formatDateRange(edu.startDate, edu.endDate)}</div>
          </li>
        ))}
      </ul>
    );
  } else if (section === 'projects') {
    if (!Array.isArray(resume.projects) || resume.projects.length === 0) return null;
    body = (
      <ul className="space-y-1.5 text-[10px] leading-snug">
        {resume.projects.map((project: any, index: number) => (
          <li key={project.id || index}>
            <div className="font-semibold">{project.title}</div>
            {project.technologies && <div className={muted}>{project.technologies}</div>}
          </li>
        ))}
      </ul>
    );
  } else if (section === 'achievements') {
    if (!Array.isArray(resume.achievements) || resume.achievements.length === 0) return null;
    body = (
      <ul className="space-y-1.5 text-[10px] leading-snug">
        {resume.achievements.map((achievement: any, index: number) => (
          <li key={achievement.id || index} className="font-medium">{achievement.title}</li>
        ))}
      </ul>
    );
  } else if (section === 'summary') {
    if (!resume.summary) return null;
    body = <RichTextContent content={resume.summary} className="text-[10px] leading-relaxed" />;
  } else if (section === 'experience') {
    if (!Array.isArray(resume.experience) || resume.experience.length === 0) return null;
    body = (
      <ul className="space-y-1.5 text-[10px] leading-snug">
        {resume.experience.slice(0, 4).map((role: any, index: number) => (
          <li key={role.id || index}>
            <div className="font-semibold">{role.position}</div>
            <div className={muted}>{role.company}</div>
          </li>
        ))}
      </ul>
    );
  } else {
    return null;
  }

  return (
    <section className={cn('border-t pt-2.5', border)}>
      {heading}
      {body}
    </section>
  );
}

function AsideRail({
  resume,
  meta,
  palette,
  fullName,
  layout,
  variant = 'solid',
  className,
}: {
  resume: any;
  meta: TemplateMeta;
  palette: ResumePalette;
  fullName: string;
  layout: TemplateLayoutSpec;
  variant?: 'solid' | 'tint' | 'dark' | 'outline' | 'paper';
  className?: string;
}) {
  const heading = resume.heading || {};
  const style: React.CSSProperties =
    variant === 'solid'
      ? { backgroundColor: meta.sidebarBg || palette.primary, color: meta.sidebarText || '#ffffff' }
      : variant === 'dark'
        ? { backgroundColor: '#0f172a', color: '#f8fafc' }
        : variant === 'tint'
          ? { backgroundColor: meta.sidebarBg || palette.soft || `${palette.primary}10`, color: meta.sidebarText || '#1e293b' }
          : variant === 'outline'
            ? { color: '#1e293b' }
            : { backgroundColor: '#fafaf9', color: '#1c1917' };
  const isDark = variant === 'solid' || variant === 'dark';
  const sections = (layout.asideSections || []).filter((section) => section !== 'contact');
  const showPhoto = hasPhoto(heading) && layout.header !== 'photo-band' && layout.header !== 'banner';
  const showName = layout.header === 'sidebar';

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col justify-between px-0',
        variant === 'outline' && 'border-r border-neutral-200',
        className
      )}
      style={{ ...style, width: `${layout.asideWidth}%` }}
      data-layout-rail={layout.family}
    >
      <div className="px-5 py-5">
        {showPhoto && (
          <div className="mb-3">
            <Photo heading={heading} fullName={fullName} layout={layout} size="size-[86px]" ring={!isDark} />
          </div>
        )}
        {showName && (
          <div className="mb-3">
            <IdentityText heading={heading} fullName={fullName} layout={layout} tone={isDark ? 'dark' : 'light'} />
          </div>
        )}
        <div className={cn('mb-3', showName && 'border-t pt-3', isDark ? 'border-white/20' : 'border-neutral-200')}>
          <div className={cn('mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em]', isDark ? 'text-white/65' : 'text-neutral-500')}>
            Contact
          </div>
          <div className="space-y-1">
            <ContactRow heading={heading} layout={{ ...layout, contactLayout: 'stack' }} tone={isDark ? 'dark' : 'light'} />
          </div>
        </div>
        <div className="space-y-2.5">
          {sections.map((section) => (
            <RailSection
              key={section}
              section={section}
              resume={resume}
              meta={meta}
              palette={palette}
              isDark={isDark}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FLOW BUILDERS
 * ───────────────────────────────────────────────────────────── */

function FlowList({
  items,
  meta,
  palette,
  layout,
  className,
  itemClassName,
  hideSectionTitles = false,
}: {
  items: FlowItem[];
  meta: TemplateMeta;
  palette: ResumePalette;
  layout: TemplateLayoutSpec;
  className?: string;
  itemClassName?: string;
  hideSectionTitles?: boolean;
}) {
  return (
    <div className={cn(DENSITY_GAP[layout.density], className)}>
      {items.map((item, index) => (
        <div key={item.id} className={itemClassName}>
          <FlowItemRenderer
            item={hideSectionTitles && index === 0 ? { ...item, title: undefined } : item}
            meta={meta}
            palette={palette}
            layout={layout}
            isFirstItem={index === 0}
          />
        </div>
      ))}
    </div>
  );
}

/** Groups flow items by their section boundary so labels can sit in a gutter. */
function groupBySection(items: FlowItem[]): Array<{ title: string | null; items: FlowItem[] }> {
  const groups: Array<{ title: string | null; items: FlowItem[] }> = [];
  for (const item of items) {
    if (item.title) {
      groups.push({ title: item.title, items: [item] });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last) last.items.push(item);
    else groups.push({ title: null, items: [item] });
  }
  return groups;
}

function LabeledFlow({
  items,
  meta,
  palette,
  layout,
  labelWidth = 'w-[26%]',
}: {
  items: FlowItem[];
  meta: TemplateMeta;
  palette: ResumePalette;
  layout: TemplateLayoutSpec;
  labelWidth?: string;
}) {
  const groups = groupBySection(items);
  return (
    <div className={DENSITY_GAP[layout.density]}>
      {groups.map((group, index) => (
        <section
          key={`${group.title || 'group'}-${index}`}
          className="grid grid-cols-[26%_1fr] gap-4 border-t border-neutral-200 pt-2 first:border-t-0 first:pt-0"
        >
          <div className={cn('pr-2', labelWidth)}>
            {group.title && <SectionTitle title={group.title} palette={palette} titleStyle={layout.titleStyle} />}
          </div>
          <div className={DENSITY_GAP[layout.density]}>
            {group.items.map((item, itemIndex) => (
              <FlowItemRenderer
                key={item.id}
                item={{ ...item, title: undefined }}
                meta={meta}
                palette={palette}
                layout={layout}
                isFirstItem={index === 0 && itemIndex === 0}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FAMILIES
 * ───────────────────────────────────────────────────────────── */

function ProfileSidebarFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const reverse = layout.aside === 'right';
  return (
    <div className={cn('flex min-h-0 flex-1', reverse ? 'flex-row-reverse' : 'flex-row')}>
      <AsideRail
        resume={resume}
        meta={meta}
        palette={palette}
                fullName={fullName}
        layout={layout}
        variant={meta.sidebarBg ? 'tint' : 'solid'}
        className={reverse ? 'border-l border-white/10' : 'border-r border-white/10'}
      />
      <main className="flex min-h-0 flex-1 flex-col px-7 py-5">
        <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} className="mt-4 flex-1" />
      </main>
    </div>
  );
}

function BannerFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <main className="flex min-h-0 flex-1 flex-col px-8 py-5">
        <div className="mb-4 flex items-center justify-between border-b border-neutral-200 pb-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-neutral-400">
            {resume.heading?.title || 'Professional Profile'}
          </span>
        </div>
        {/* Single reading column: a banner layout must never fork the reading
            order, or ATS text extraction and screen-reader order diverge. */}
        <div className="flex-1">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </div>
      </main>
    </div>
  );
}

function BannerSidebarFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const reverse = layout.aside === 'right';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <div className={cn('flex min-h-0 flex-1', reverse ? 'flex-row-reverse' : 'flex-row')}>
        <AsideRail
          resume={resume}
          meta={meta}
          palette={palette}
                    fullName={fullName}
          layout={layout}
          variant="tint"
        />
        <main className="flex min-h-0 flex-1 flex-col px-7 py-5">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
      </div>
    </div>
  );
}

function ClassicFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <main className="mx-auto flex w-full max-w-[660px] min-h-0 flex-1 flex-col px-8 py-4">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function AcademicFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-10">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <main className="mx-auto flex w-full max-w-[620px] min-h-0 flex-1 flex-col py-4">
        {resume.heading?.location ? (
          <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-neutral-500">
            <span>{resume.heading.location}</span>
          </div>
        ) : null}
        <div className={DENSITY_GAP[layout.density]}>
          {page.flowItems.map((item) => (
            <FlowItemRenderer key={item.id} item={item} meta={meta} palette={palette} layout={layout} />
          ))}
        </div>
      </main>
    </div>
  );
}

function SplitHeaderFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <main className="flex min-h-0 flex-1 flex-col px-8 py-4">
        <LabeledFlow items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function TriColumnFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const sections = layout.asideSections.filter((section) => section !== 'contact');
  const leftSections: AsideSectionKey[] = ['contact', ...sections.filter((_, index) => index % 2 === 0)];
  const rightSections: AsideSectionKey[] = sections.filter((_, index) => index % 2 === 1);
  return (
    <div className="flex min-h-0 flex-1">
      <AsideRail
        resume={resume}
        meta={meta}
        palette={palette}
                fullName={fullName}
        layout={{ ...layout, asideSections: leftSections, asideWidth: 21 }}
        variant="outline"
        className="border-r"
      />
      <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} className="mt-3 flex-1" />
      </main>
      <AsideRail
        resume={resume}
        meta={meta}
        palette={palette}
                fullName={fullName}
        layout={{ ...layout, asideSections: rightSections, asideWidth: 21 }}
        variant="paper"
        className="border-l"
      />
    </div>
  );
}

function EditorialFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-t-[6px] px-9 pb-3 pt-5" style={{ borderColor: palette.primary }}>
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.32em] text-neutral-500">The Profile</div>
            <IdentityText heading={resume.heading} fullName={fullName} layout={layout} />
          </div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[80px]" />
        </div>
        <div className="mt-2 flex items-end justify-between gap-4 border-b border-neutral-300 pb-1.5">
          <ContactRow heading={resume.heading} layout={layout} />
          <span className="text-[9px] italic text-neutral-400">Est. professional record</span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col px-9 py-4">
        <div className="columns-2 gap-8 [column-rule:1px_solid_#e5e5e5]">
          {page.flowItems.map((item) => (
            <div key={item.id} className="mb-3 break-inside-avoid">
              <FlowItemRenderer item={item} meta={meta} palette={palette} layout={layout} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function CardGridFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <main className="flex min-h-0 flex-1 flex-col px-7 py-4">
        <div className="grid grid-cols-2 gap-3">
          {page.flowItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-lg border border-neutral-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
                item.type === 'experience' && 'col-span-2'
              )}
            >
              <FlowItemRenderer item={item} meta={meta} palette={palette} layout={layout} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function TimelineFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const roles = Array.isArray(resume.experience) ? resume.experience : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <div className="shrink-0 px-8 py-3">
        <div className="relative flex items-center justify-between border-t-2 pt-3" style={{ borderColor: palette.primary }}>
          {roles.slice(0, 5).map((role: any, index: number) => (
            <div key={role.id || index} className="flex flex-1 flex-col items-center text-center">
              <span className="size-2 rounded-full" style={{ backgroundColor: palette.primary }} />
              <span className="mt-1 text-[8.5px] font-bold uppercase tracking-wider text-neutral-500">
                {formatDateRange(role.startDate || role.begin, role.endDate || role.end, role.current)}
              </span>
              <span className="max-w-[92px] truncate text-[9px] font-medium text-neutral-700">{role.company}</span>
            </div>
          ))}
          {roles.length === 0 && <span className="text-[9px] text-neutral-400">Career timeline</span>}
        </div>
      </div>
      <main className="flex min-h-0 flex-1 flex-col px-8 pb-4">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function EuropassFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const heading = resume.heading || {};
  const details = [
    ['Nationality', heading.nationality],
    ['Date of birth', heading.dateOfBirth],
    ['Driving licence', heading.drivingLicence],
    ['Address', heading.location],
    ['Phone', heading.phone],
    ['Email', heading.email],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-8 pt-5">
        <div className="flex items-center justify-between border-b-[3px] pb-3" style={{ borderColor: palette.primary }}>
          <div className="min-w-0">
            <IdentityText heading={heading} fullName={fullName} layout={layout} />
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: palette.primary }}>
              Curriculum Vitae
            </div>
          </div>
          <Photo heading={heading} fullName={fullName} layout={layout} size="size-[88px]" />
        </div>
        {details.length > 0 && (
          <dl className="grid grid-cols-3 gap-x-4 gap-y-1 border-b border-neutral-200 py-2 text-[9.5px]">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[8px] font-bold uppercase tracking-wider text-neutral-400">{label}</dt>
                <dd className="truncate text-neutral-700">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>
      <div className={cn('flex min-h-0 flex-1', layout.aside === 'right' ? 'flex-row-reverse' : 'flex-row')}>
        <AsideRail
          resume={resume}
          meta={meta}
          palette={palette}
                    fullName={fullName}
          layout={layout}
          variant="paper"
        />
        <main className="flex min-h-0 flex-1 flex-col px-7 py-4">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
      </div>
    </div>
  );
}

function TechnicalFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const sectionTitles = groupBySection(page.flowItems).map((group) => group.title).filter(Boolean) as string[];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 bg-neutral-950 px-7 py-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="size-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
            <h1 className={cn('truncate font-mono font-bold tracking-tight', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
          </div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[58px]" />
        </div>
        <p className="mt-1 font-mono text-[10.5px] text-emerald-400">{`// ${resume.heading?.title || 'engineer'}`}</p>
        <div className="mt-1.5 font-mono text-[9.5px] text-neutral-300">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'minimal' }} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-[19%] shrink-0 border-r border-neutral-800 bg-neutral-900 px-3 py-4" aria-label="Section index">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.2em] text-neutral-500">~/sections</div>
          <ul className="space-y-1.5">
            {sectionTitles.map((title) => (
              <li key={title} className="font-mono text-[9px] leading-tight text-emerald-300">
                <span className="text-neutral-500">›</span> {title}
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
      </div>
    </div>
  );
}

function ExecutiveFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-10">
      <header className="shrink-0 pb-2 pt-6 text-center">
        <div className="mx-auto mb-3 h-[3px] w-full" style={{ backgroundColor: palette.primary }} />
        <IdentityText heading={resume.heading} fullName={fullName} layout={layout} align="center" />
        <div className="mx-auto mt-1.5 h-px w-28" style={{ backgroundColor: palette.primary }} />
        <div className="mt-2 flex justify-center">
          <ContactRow heading={resume.heading} layout={layout} justify="justify-center" />
        </div>
        <div className="mt-3 h-[3px] w-full" style={{ backgroundColor: palette.primary }} />
      </header>
      <main className="mx-auto flex w-full max-w-[680px] min-h-0 flex-1 flex-col py-3">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>

    </div>
  );
}

function InfographicFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const categories = skillCategories(resume);
  const skillsInFlow = page.flowItems.some((item) => item.type === 'skills');
  const years = yearsOfExperience(resume);
  const stats = [
    { label: 'Years', value: years > 0 ? String(years) : '—' },
    { label: 'Roles', value: String((resume.experience || []).length) },
    { label: 'Skills', value: String(categories.flatMap((category: any) => category.skills || []).length) },
    { label: 'Certifications', value: String((resume.certifications || []).length) },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
      <div className="grid shrink-0 grid-cols-4 gap-px border-b border-neutral-200 bg-neutral-200">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white px-3 py-2 text-center">
            <div className="text-[17px] font-black leading-none" style={{ color: palette.primary }}>{stat.value}</div>
            <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>
      <main className="flex min-h-0 flex-1 flex-col px-7 py-3">
        {categories.length > 0 && (
          <section className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50/60 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: palette.primary }}>
                Capability matrix
              </span>
              <span className="text-[8px] uppercase tracking-wider text-neutral-400">self-assessed</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <SidebarSkillsRenderer categories={categories.slice(0, 1)} variant="bars" palette={palette} isDark={false} />
              <SidebarSkillsRenderer categories={categories.slice(1)} variant="bars" palette={palette} isDark={false} />
            </div>
          </section>
        )}
        <FlowList
          items={skillsInFlow ? page.flowItems.filter((item) => item.type !== 'skills') : page.flowItems}
          meta={meta}
          palette={palette}
          layout={layout}
        />
      </main>
    </div>
  );
}

function BoxedFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border-2 p-3" style={{ borderColor: palette.primary }}>
        <header className="mb-3 shrink-0 rounded-lg px-4 py-3" style={{ backgroundColor: palette.soft || `${palette.primary}12` }}>
          <div className="flex items-center gap-4">
            <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[64px]" />
            <div className="min-w-0 flex-1">
              <IdentityText heading={resume.heading} fullName={fullName} layout={layout} />
              <div className="mt-1.5">
                <ContactRow heading={resume.heading} layout={layout} />
              </div>
            </div>
          </div>
        </header>
        <main className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', DENSITY_GAP[layout.density])}>
          {page.flowItems.map((item) => (
            <section key={item.id} className="rounded-lg border border-neutral-200 px-3.5 py-2.5">
              <FlowItemRenderer item={item} meta={meta} palette={palette} layout={layout} />
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

function MagazineFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-8 pt-0">
        <div className="flex h-1.5 w-full">
          <span className="flex-1" style={{ backgroundColor: palette.primary }} />
          <span className="w-16" style={{ backgroundColor: palette.secondary }} />
        </div>
        <div className="flex items-end justify-between gap-5 border-b-2 border-neutral-900 pb-2 pt-3">
          <div className="min-w-0">
            <h1 className={cn('font-black uppercase leading-none tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>
              {fullName}
            </h1>
          </div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[70px]" />
        </div>
        <div className="flex items-center justify-between gap-4 py-1.5 text-[9px] uppercase tracking-wider text-neutral-500">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'minimal' }} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col px-8 py-3">
        <div className="columns-2 gap-7 [column-rule:1px_solid_#e5e5e5]">
          {page.flowItems.map((item) => (
            <div key={item.id} className="mb-3 break-inside-avoid">
              <FlowItemRenderer item={item} meta={meta} palette={palette} layout={layout} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function CompactFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-7 py-4">
      <header
        className="mb-2 flex shrink-0 items-center justify-between gap-4 rounded-md px-3.5 py-2"
        style={{ backgroundColor: palette.soft || `${palette.primary}10` }}
      >
        <div className="min-w-0">
          <h1 className={cn('truncate font-bold tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.primary }}>
            {resume.heading?.title}
          </div>
        </div>
        <div className="max-w-[45%] shrink-0">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'stack' }} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function AccentFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-2.5 shrink-0" style={{ backgroundColor: palette.primary }} aria-hidden="true" />
      <div className="flex min-h-0 flex-1 flex-col">
        <IdentityBlock heading={resume.heading} fullName={fullName} meta={meta} palette={palette} layout={layout} />
        <main className="flex min-h-0 flex-1 flex-col px-8 py-4">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
      </div>
    </div>
  );
}

function PortfolioFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const projects = page.flowItems.filter((item) => item.type === 'projects');
  const rest = page.flowItems.filter((item) => item.type !== 'projects');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-neutral-200 px-8 py-5">
        <div
          className="flex size-[72px] items-center justify-center rounded-2xl text-[22px] font-black text-white shadow-inner"
          style={{ background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)` }}
          aria-hidden="true"
        >
          {initialsOf(fullName)}
        </div>
        <div className="min-w-0">
          <IdentityText heading={resume.heading} fullName={fullName} layout={layout} />
          <div className="mt-1.5">
            <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'grid' }} />
          </div>
        </div>
        <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[64px]" />
      </header>
      <main className="flex min-h-0 flex-1 flex-col px-8 py-4">
        {projects.length > 0 && (
          <section className="mb-3">
            <SectionTitle title={SECTION_TITLES.projects} palette={palette} titleStyle={layout.titleStyle} />
            <div className="grid grid-cols-2 gap-3">
              {projects.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <FlowItemRenderer item={{ ...item, title: undefined }} meta={meta} palette={palette} layout={layout} />
                </article>
              ))}
            </div>
          </section>
        )}
        <FlowList items={rest} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function MinimalFamily(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-10">
      <header className="flex shrink-0 items-baseline justify-between gap-5 pb-2 pt-7">
        <h1 className={cn('font-semibold leading-none tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          {resume.heading?.title}
        </span>
      </header>
      <div className="mb-3 border-t border-neutral-900" />
      <div className="mb-3">
        <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'minimal' }} />
      </div>
      <main className="flex min-h-0 flex-1 flex-col">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function Cv1Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const heading = resume.heading || {};
  const contact = contactValues(heading);
  const categories = skillCategories(resume);
  const languages = Array.isArray(resume.languages) ? resume.languages : [];

  const infoRows = [
    { label: 'Address', value: contact.location, Icon: MapPin },
    { label: 'Phone', value: contact.phone, Icon: Phone },
    { label: 'Email', value: contact.email, Icon: Mail },
    { label: 'LinkedIn', value: contact.linkedin, Icon: LinkedinIcon },
    { label: 'GitHub', value: contact.github, Icon: GithubIcon },
    { label: 'Website', value: contact.website, Icon: Globe },
  ].filter((row) => Boolean(row.value));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-cv1-layout="legacy-card">
      {/* Legacy Cv1: tinted banner at 5% primary over a 20% primary hairline. */}
      <header
        className="flex shrink-0 items-center gap-5 border-b px-8 py-5"
        style={{ backgroundColor: `${palette.primary}0d`, borderColor: `${palette.primary}33` }}
      >
        {hasPhoto(heading) ? (
          <img
            src={heading.photo}
            alt={fullName}
            className="size-[92px] shrink-0 rounded-full object-cover"
            style={{ border: `2.5px solid ${palette.primary}` }}
          />
        ) : (
          <div
            className="flex size-[92px] shrink-0 items-center justify-center rounded-full text-[26px] font-bold text-white"
            style={{ backgroundColor: palette.primary }}
            aria-hidden="true"
          >
            {initialsOf(fullName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className={cn('break-words [overflow-wrap:anywhere] font-bold leading-tight tracking-tight', NAME_SCALE[layout.nameScale])}
            style={{ color: palette.primary }}
          >
            {fullName}
          </h1>
          {heading.title && (
            <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.14em] text-neutral-500">{heading.title}</p>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[34%] shrink-0 flex-col gap-4 border-r border-[#e2e8f0] px-6 py-5"
          data-layout-rail="cv1"
          style={{ backgroundColor: meta.sidebarBg || '#f8fafc' }}
        >
          {infoRows.length > 0 && (
            <section>
              <h2
                className="mb-2 border-b-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em]"
                style={{ color: palette.primary, borderColor: palette.primary }}
              >
                Information
              </h2>
              <ul className="space-y-2">
                {infoRows.map(({ label, value, Icon }) => (
                  <li key={label} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }}
                      aria-hidden="true"
                    >
                      <Icon className="size-2.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[7.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</span>
                      <span className="block break-words [overflow-wrap:anywhere] text-[10px] font-medium text-neutral-700">{value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {categories.length > 0 && (
            <section>
              <h2
                className="mb-2 border-b-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em]"
                style={{ color: palette.primary, borderColor: palette.primary }}
              >
                Skills
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {categories.flatMap((category: any, categoryIndex: number) =>
                  (Array.isArray(category?.skills) ? category.skills : []).map((skill: any, skillIndex: number) => {
                    const label = typeof skill === 'string' ? skill : String(skill?.name || skill?.skillName || '');
                    if (!label) return null;
                    return (
                      <span
                        key={`${categoryIndex}-${skillIndex}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[9.5px] font-medium text-neutral-700"
                      >
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: palette.primary }} aria-hidden="true" />
                        {label}
                      </span>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {languages.length > 0 && (
            <section>
              <h2
                className="mb-2 border-b-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em]"
                style={{ color: palette.primary, borderColor: palette.primary }}
              >
                Languages
              </h2>
              <ul className="space-y-1">
                {languages.map((language: any, index: number) => {
                  const name = language?.language || language?.name || '';
                  if (!name) return null;
                  return (
                    <li key={language?.id || index} className="flex items-baseline justify-between gap-2 text-[10px]">
                      <span className="break-words font-medium text-neutral-700">{name}</span>
                      {language?.proficiency && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase text-neutral-500">{language.proficiency}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
        <main className="flex min-h-0 flex-1 flex-col px-7 py-5">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
      </div>
    </div>
  );
}

function Cv4Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-12">
      <header className="shrink-0 pb-3 pt-7 text-center">
        <h1 className={cn('font-serif font-semibold tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
        <div className="mx-auto mt-1.5 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.28em] text-neutral-500">
          <span className="h-px w-8 bg-neutral-300" />
          {resume.heading?.title}
          <span className="h-px w-8 bg-neutral-300" />
        </div>
        <div className="mt-2 flex justify-center">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'minimal' }} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

const CEFR_DOTS: Record<string, number> = {
  A1: 1, A2: 2, B1: 3, B2: 3, C1: 4, C2: 5, NATIVE: 5,
};

function LevelScale({
  filled,
  total = 5,
  color,
  shape,
  label,
}: {
  filled: number;
  total?: number;
  color: string;
  shape: 'box' | 'dot';
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={shape === 'dot' ? 'size-1.5 rounded-full' : 'h-1.5 w-3 rounded-[1px]'}
          style={{ backgroundColor: index < filled ? color : '#d4d4d8' }}
        />
      ))}
    </span>
  );
}

function Cv25Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  const categories = skillCategories(resume);
  const languages = Array.isArray(resume.languages) ? resume.languages : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-cv25-structure="navy-header-main-rail">
      {/* Legacy Cv25: #274472 band, white name, 4px #3d6485 avatar ring. */}
      <header className="shrink-0 px-8 py-5 text-white" style={{ backgroundColor: palette.primary }}>
        <div className="flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <h1 className={cn('break-words [overflow-wrap:anywhere] font-bold leading-tight tracking-tight', NAME_SCALE[layout.nameScale])}>
              {fullName}
            </h1>
            {resume.heading?.title && (
              <p className="mt-0.5 text-[12px] font-normal text-white/70">{resume.heading.title}</p>
            )}
            <div className="mt-2 border-t border-white/20 pt-2">
              <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'inline' }} tone="dark" />
            </div>
          </div>
          {hasPhoto(resume.heading) && (
            <img
              src={resume.heading.photo}
              alt={fullName}
              className="size-[104px] shrink-0 rounded-full object-cover"
              style={{ border: `4px solid ${palette.secondary}` }}
            />
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col border-r border-[#e0e0e0] px-7 py-5" data-cv25-main="experience-first">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
        <aside
          className="flex w-[34%] shrink-0 flex-col gap-4 px-6 py-5"
          style={{ backgroundColor: '#f5f7fa' }}
          data-layout-rail="cv25"
        >
          {categories.length > 0 && (
            <section>
              <h2
                className="mb-2 border-b-2 pb-1 text-[10px] font-bold"
                style={{ color: palette.primary, borderColor: palette.secondary }}
              >
                Skills
              </h2>
              <div className="space-y-2">
                {categories.flatMap((category: any, categoryIndex: number) =>
                  (Array.isArray(category?.skills) ? category.skills : []).map((skill: any, skillIndex: number) => {
                    const name = typeof skill === 'string' ? skill : String(skill?.name || skill?.skillName || '');
                    const rating = typeof skill === 'object' ? Number(skill?.rating) : NaN;
                    if (!name) return null;
                    const filled = Number.isFinite(rating) ? Math.round(Math.min(100, Math.max(0, rating)) / 20) : 0;
                    return (
                      <div key={`${categoryIndex}-${skillIndex}`} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="min-w-0 break-words font-medium text-neutral-700">{name}</span>
                        {Number.isFinite(rating) && (
                          <LevelScale filled={filled} color={palette.secondary} shape="box" label={`${name}: ${filled} of 5`} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {languages.length > 0 && (
            <section>
              <h2
                className="mb-2 border-b-2 pb-1 text-[10px] font-bold"
                style={{ color: palette.primary, borderColor: palette.secondary }}
              >
                Languages
              </h2>
              <div className="space-y-1.5">
                {languages.map((language: any, index: number) => {
                  const name = language?.language || language?.name || '';
                  const code = String(language?.proficiency || language?.level || '').toUpperCase();
                  const filled = CEFR_DOTS[code] ?? 0;
                  if (!name) return null;
                  return (
                    <div key={language?.id || index} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="min-w-0 break-words font-medium text-neutral-700">{name}</span>
                      {filled > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[9px] font-semibold uppercase text-neutral-500">{code}</span>
                          <LevelScale filled={filled} color={palette.secondary} shape="dot" label={`${name}: ${code}`} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {layout.asideSections
            .filter((section) => section !== 'contact' && section !== 'skills' && section !== 'summary')
            .map((section) => (
              <RailSection key={section} section={section} resume={resume} meta={meta} palette={palette} isDark={false} />
            ))}
        </aside>
      </div>
    </div>
  );
}

function Cv34Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  // Legacy Cv34 paints a 5px three-stop rule under a white header using the
  // purple/teal/pink trio from its original stylesheet, published on the
  // catalog entry so no palette is hard-coded in the renderer.
  const accentStop = meta.accent || `color-mix(in srgb, ${palette.secondary} 55%, ${palette.primary})`;
  const categories = skillCategories(resume);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-cv34-header="white">
      <header className="shrink-0 bg-white px-8 pt-6">
        <div className="flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <h1
              className={cn('break-words [overflow-wrap:anywhere] font-bold leading-tight tracking-tight', NAME_SCALE[layout.nameScale])}
              style={{ color: palette.primary }}
            >
              {fullName}
            </h1>
            {resume.heading?.title && (
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500">{resume.heading.title}</p>
            )}
          </div>
          <Photo
            heading={resume.heading}
            fullName={fullName}
            layout={{ ...layout, photoShape: 'circle' }}
            size="size-[100px]"
            ring={false}
            className="rounded-full bg-neutral-100 object-cover shadow-sm"
            style={{ border: `3px solid ${palette.secondary}` }}
          />
        </div>
        <div
          className="mt-4 h-[5px] w-full"
          data-cv34-gradient="triple"
          style={{ background: `linear-gradient(to right, ${palette.primary}, ${palette.secondary}, ${accentStop})` }}
          aria-hidden="true"
        />
        <div className="py-3">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'grid' }} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col px-7 py-4">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
        <aside
          className="flex w-[29%] shrink-0 flex-col justify-between border-l-[3px] bg-neutral-50 px-5 py-4"
          style={{ borderColor: palette.secondary }}
          data-layout-rail="cv34"
        >
          <div className="space-y-4">
            {categories.length > 0 && (
              <section data-cv34-skills="percent-bars">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500">Skills</div>
                <div className="space-y-2">
                  {categories.flatMap((category: any, categoryIndex: number) =>
                    (Array.isArray(category?.skills) ? category.skills : []).map((skill: any, skillIndex: number) => {
                      const name = typeof skill === 'string' ? skill : String(skill?.name || skill?.skillName || '');
                      const rawRating = typeof skill === 'object' ? Number(skill?.rating ?? skill?.level) : NaN;
                      const rating = Number.isFinite(rawRating) ? Math.min(100, Math.max(0, Math.round(rawRating))) : null;
                      if (!name) return null;
                      return (
                        <div key={`${categoryIndex}-${skillIndex}`} className="text-[10px]">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 break-words font-medium text-neutral-700">{name}</span>
                            {rating !== null && <span className="shrink-0 font-semibold text-neutral-500">{rating}%</span>}
                          </div>
                          {rating !== null && (
                            <div className="mt-1 h-[4px] w-full overflow-hidden rounded-full bg-neutral-200">
                              <div className="h-full rounded-full" style={{ width: `${rating}%`, backgroundColor: palette.secondary }} />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}
            <RailSection section="languages" resume={resume} meta={meta} palette={palette} isDark={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * DISPATCH — exhaustive over LAYOUT_FAMILIES
 * ───────────────────────────────────────────────────────────── */

export function TemplatePageOne(props: FamilyPageProps) {
  switch (props.layout.family) {
    case 'profile-sidebar':
      return <ProfileSidebarFamily {...props} />;
    case 'banner':
      return <BannerFamily {...props} />;
    case 'banner-sidebar':
      return <BannerSidebarFamily {...props} />;
    case 'classic':
      return <ClassicFamily {...props} />;
    case 'academic':
      return <AcademicFamily {...props} />;
    case 'split-header':
      return <SplitHeaderFamily {...props} />;
    case 'tri-column':
      return <TriColumnFamily {...props} />;
    case 'editorial':
      return <EditorialFamily {...props} />;
    case 'card-grid':
      return <CardGridFamily {...props} />;
    case 'timeline':
      return <TimelineFamily {...props} />;
    case 'europass':
      return <EuropassFamily {...props} />;
    case 'technical':
      return <TechnicalFamily {...props} />;
    case 'executive':
      return <ExecutiveFamily {...props} />;
    case 'infographic':
      return <InfographicFamily {...props} />;
    case 'boxed':
      return <BoxedFamily {...props} />;
    case 'magazine':
      return <MagazineFamily {...props} />;
    case 'compact':
      return <CompactFamily {...props} />;
    case 'accent':
      return <AccentFamily {...props} />;
    case 'portfolio':
      return <PortfolioFamily {...props} />;
    case 'minimal':
      return <MinimalFamily {...props} />;
    case 'cv1':
      return <Cv1Family {...props} />;
    case 'cv4':
      return <Cv4Family {...props} />;
    case 'cv25':
      return <Cv25Family {...props} />;
    case 'cv34':
      return <Cv34Family {...props} />;
    default:
      // Never a silent generic resume: surface an explicit, non-resume state.
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
          <p className="text-sm font-bold text-red-700">Unsupported template layout</p>
          <p className="text-xs text-neutral-600">No page composition is registered for this template.</p>
        </div>
      );
  }
}

export const LAYOUT_FAMILY_COMPONENTS: Record<string, React.ComponentType<FamilyPageProps>> = {
  'profile-sidebar': ProfileSidebarFamily,
  banner: BannerFamily,
  'banner-sidebar': BannerSidebarFamily,
  classic: ClassicFamily,
  academic: AcademicFamily,
  'split-header': SplitHeaderFamily,
  'tri-column': TriColumnFamily,
  editorial: EditorialFamily,
  'card-grid': CardGridFamily,
  timeline: TimelineFamily,
  europass: EuropassFamily,
  technical: TechnicalFamily,
  executive: ExecutiveFamily,
  infographic: InfographicFamily,
  boxed: BoxedFamily,
  magazine: MagazineFamily,
  compact: CompactFamily,
  accent: AccentFamily,
  portfolio: PortfolioFamily,
  minimal: MinimalFamily,
  cv1: Cv1Family,
  cv4: Cv4Family,
  cv25: Cv25Family,
  cv34: Cv34Family,
};


/**
 * Pagination-friendly composition of the five public archetypes. The existing
 * registered family specifications still supply ordering, rail geometry,
 * typography, density and section treatment; the blocks below are explicit
 * break opportunities, so no family can hide a long rail or omit a section.
 */
interface ComposableLayoutProps {
  resume: ResumeDocumentModel;
  meta: TemplateMeta;
  layout: TemplateLayoutSpec;
  palette: ResumePalette;
  fullName: string;
  density: 'compact' | 'standard' | 'spacious';
}

function SafeDocumentLink({ value }: { value: string }) {
  if (!value) return null;
  const href = /^https?:\/\//i.test(value) ? value : '';
  return href ? <a href={href} rel="noopener noreferrer" target="_blank">{value}</a> : <span>{value}</span>;
}

function DocumentSectionBlocks({
  section, resume, meta, layout,
}: { section: SectionKey; resume: ResumeDocumentModel; meta: TemplateMeta; layout: TemplateLayoutSpec }) {
  let entries: React.ReactNode[] = [];
  switch (section) {
    case 'summary':
      entries = resume.summary && resume.summary.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim() ? [<RichTextContent content={resume.summary} />] : [];
      break;
    case 'experience':
      entries = resume.experience.map((role) => (
        <div className="resume-role" data-date-rail={meta.archetype === 'compact-euro' || meta.timelineStyle === 'date-rail' || layout.family === 'europass' ? 'true' : undefined}>
          <div className="resume-role-date">{formatDateRange(role.startDate, role.endDate, role.current)}</div>
          <div className="resume-role-details">
            {role.position && <h3>{role.position}</h3>}
            {(role.company || role.location) && <div className="resume-muted">{[role.company, role.location].filter(Boolean).join(' · ')}</div>}
            <RichTextContent content={role.description} />
          </div>
        </div>
      ));
      break;
    case 'education':
      entries = resume.education.map((entry) => (
        <div>
          {(entry.degree || entry.field) && <h3>{[entry.degree, entry.field].filter(Boolean).join(' · ')}</h3>}
          <div className="resume-muted">{[entry.institution, entry.location, formatDateRange(entry.startDate, entry.endDate), entry.gpa ? `GPA: ${entry.gpa}` : ''].filter(Boolean).join(' · ')}</div>
          <RichTextContent content={entry.description} />
        </div>
      ));
      break;
    case 'projects':
      entries = resume.projects.map((project) => (
        <div className={meta.archetype === 'tech-grid' ? 'resume-project-card' : ''} data-project-card={meta.archetype === 'tech-grid' ? 'true' : undefined}>
          {project.title && <h3>{project.title}</h3>}
          {project.technologies && <div className="resume-muted">{project.technologies}</div>}
          {(project.startDate || project.endDate) && <div>{formatDateRange(project.startDate, project.endDate)}</div>}
          {project.liveUrl && <div><SafeDocumentLink value={project.liveUrl} /></div>}
          {project.githubUrl && project.githubUrl !== project.liveUrl && <div><SafeDocumentLink value={project.githubUrl} /></div>}
          <RichTextContent content={project.description} />
        </div>
      ));
      break;
    case 'achievements':
      entries = resume.achievements.map((achievement) => (
        <div>{achievement.title && <h3>{achievement.title}</h3>}{achievement.date && <div className="resume-muted">{achievement.date}</div>}<RichTextContent content={achievement.description} /></div>
      ));
      break;
    case 'skills':
      // Small groups are independent measured blocks, so a page boundary does
      // not cut through an otherwise ordinary skill badge.
      entries = resume.skillCategories.flatMap((category) => {
        const skills: Array<string | { name?: string; rating?: number }> = Array.isArray(category.skills) ? category.skills : [];
        const chunks: Array<Array<string | { name?: string; rating?: number }>> = [];
        for (let index = 0; index < skills.length; index += 8) chunks.push(skills.slice(index, index + 8));
        return chunks.map((chunk, chunkIndex) => (
          <div>
            {category.category && chunkIndex === 0 && <h3>{category.category}</h3>}
            <div className={meta.archetype === 'tech-grid' || meta.skillVariant !== 'inline' ? 'resume-skill-list' : 'resume-skill-inline'}>
              {chunk.map((skill, index) => (
                <React.Fragment key={index}><span className="resume-skill">{typeof skill === 'string' ? skill : <>{skill.name}{typeof skill.rating === 'number' ? ` (${skill.rating})` : ''}</>}</span>{meta.skillVariant === 'inline' && meta.archetype !== 'tech-grid' && (index < chunk.length - 1 || chunkIndex < chunks.length - 1) ? ', ' : ' '}</React.Fragment>
              ))}
            </div>
          </div>
        ));
      });
      break;
    case 'certifications':
      entries = resume.certifications.map((certificate) => (
        <div><h3>{certificate.name || certificate.title}</h3><div className="resume-muted">{[certificate.issuer, certificate.date, certificate.expiryDate ? `Expires: ${certificate.expiryDate}` : ''].filter(Boolean).join(' · ')}</div>{certificate.credentialId && <div><SafeDocumentLink value={certificate.credentialId} /></div>}{certificate.credentialUrl && certificate.credentialUrl !== certificate.credentialId && <div><SafeDocumentLink value={certificate.credentialUrl} /></div>}</div>
      ));
      break;
    case 'languages':
      entries = resume.languages.map((language) => <div>{language.name || language.language}{language.proficiency ? ` — ${language.proficiency}` : ''}</div>);
      break;
    case 'hobbies':
      entries = resume.hobbies.map((hobby) => <div>{hobby}</div>);
      break;
    case 'references':
      entries = resume.references.map((reference) => (
        <div>
          {reference.name && <h3>{reference.name}</h3>}
          <div className="resume-muted">{[reference.position, reference.company, reference.email, reference.phone, reference.relationship].filter(Boolean).join(' · ')}</div>
          <RichTextContent content={reference.description} />
        </div>
      ));
      break;
  }
  return <>{entries.map((entry, index) => (
    <section className="resume-block" data-resume-block="true" data-section={section} key={`${section}-${index}`}>
      {index === 0 && <h2 className={`resume-section-title resume-title-${layout.titleStyle}`}>{SECTION_TITLES[section]}</h2>}
      {entry}
    </section>
  ))}</>;
}

export function ComposableResumeLayout({ resume, meta, layout, palette, fullName, density }: ComposableLayoutProps) {
  const archetype = meta.archetype;
  const isSplit = archetype === 'modern-split';
  const hasRail = isSplit || (archetype !== 'minimal-ats' && Boolean(layout.aside));
  const position = meta.sidebarPosition || layout.aside || 'left';
  const asideSections = hasRail
    ? (layout.asideSections.length ? layout.asideSections : ['contact', 'skills', 'languages', 'education'] as AsideSectionKey[])
    : [];
  const asideSet = new Set<string>(asideSections);
  const orderedMain = [...layout.mainOrder, ...SECTION_KEYS].filter((key, index, all) => !asideSet.has(key) && all.indexOf(key) === index);
  const heading = resume.heading;
  const contacts = [heading.email, heading.phone, heading.address, heading.location, heading.postalCode, heading.website, heading.linkedin, heading.github].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  let sidebarBg = meta.sidebarBg && backgroundStops(meta.sidebarBg).length ? meta.sidebarBg : '#f1f5f9';
  let stops = backgroundStops(sidebarBg);
  const readableOnRail = (color: string) => stops.every(stop => contrastRatio(color, stop) >= 4.5);
  let sidebarText = meta.sidebarText && readableOnRail(meta.sidebarText) ? meta.sidebarText : getContrastTextColor(stops[0]);
  // A mixed light/dark gradient may not admit one AA foreground; use a solid
  // accessible rail rather than sacrificing readability.
  if (!readableOnRail(sidebarText)) {
    sidebarText = ['#ffffff', '#000000'].find(readableOnRail) || '';
    if (!sidebarText) { sidebarBg = '#f1f5f9'; stops = [sidebarBg]; sidebarText = '#000000'; }
  }
  const headerBg = /^#[0-9a-f]{6}$/i.test(palette.primary) ? palette.primary : '#1e293b';
  const headerText = getContrastTextColor(headerBg);
  const style = {
    fontFamily: meta.font || "'Inter', sans-serif",
    '--resume-primary': headerBg,
    '--resume-secondary': /^#[0-9a-f]{6}$/i.test(palette.secondary) ? palette.secondary : headerBg,
    '--resume-tertiary': meta.accent && /^#[0-9a-f]{6}$/i.test(meta.accent) ? meta.accent : palette.secondary,
    '--resume-badge-radius': meta.badgeRadius && /^\d+(?:\.\d+)?px$/.test(meta.badgeRadius) ? meta.badgeRadius : '4px',
    '--resume-accent-text': readableAccent(headerBg),
    '--resume-header-text': headerText,
    '--resume-rail-bg': sidebarBg,
    '--resume-rail-text': sidebarText,
    '--resume-rail-width': `${Math.min(40, Math.max(24, layout.asideWidth || 32))}%`,
    '--resume-name-size': ({ md: '23px', lg: '27px', xl: '31px', '2xl': '36px' })[layout.nameScale],
    '--resume-block-space': ({ compact: '8px', standard: '12px', spacious: '16px' })[density],
  } as React.CSSProperties;

  const contactBlock = contacts.length ? (
    <section className="resume-block" data-resume-block="true" data-section="contact">
      <h2 className="resume-section-title">Contact</h2>
      <div className="resume-contact-list">{contacts.map((contact, index) => <div key={index}><SafeDocumentLink value={contact} /></div>)}</div>
    </section>
  ) : null;
  const rail = hasRail ? (
    <aside className="resume-column resume-rail" data-resume-column="rail" data-layout-rail={layout.family}>
      {asideSections.map(section => section === 'contact' ? <React.Fragment key={section}>{contactBlock}</React.Fragment>
        : <DocumentSectionBlocks key={section} section={section} resume={resume} meta={meta} layout={layout} />)}
    </aside>
  ) : null;
  const main = (
    <main className="resume-column resume-main" data-resume-column="main">
      {orderedMain.map(section => <DocumentSectionBlocks key={section} section={section} resume={resume} meta={meta} layout={layout} />)}
      {(resume.customSections || []).flatMap((section, sectionIndex) => {
        if (!section.items.length) return section.sectionTitle ? [<section key={`custom-${sectionIndex}`} className="resume-block" data-resume-block="true" data-section="custom"><p><strong>{section.sectionTitle}</strong></p></section>] : [];
        return section.items.map((item, itemIndex) => (
          <section key={`custom-${sectionIndex}-${itemIndex}`} className="resume-block" data-resume-block="true" data-section="custom">
            {itemIndex === 0 && section.sectionTitle && <h2 className={`resume-section-title resume-title-${layout.titleStyle}`}>{section.sectionTitle}</h2>}
            {item.title && <h3>{item.title}</h3>}
            <RichTextContent content={item.description} />
          </section>
        ));
      })}
    </main>
  );
  return (
    <div data-resume-source="true" data-template-id={meta.id} data-archetype={archetype} data-layout-family={layout.family} data-skill-variant={meta.skillVariant || 'inline'} data-header-style={layout.header} data-contact-layout={layout.contactLayout} data-divider-style={meta.dividerStyle || 'solid-thin'} data-timeline-style={meta.timelineStyle || 'compact-clean'} data-accent-bar={String(layout.accentBar)} style={style}>
      <header className={`resume-identity resume-identity-${archetype} ${meta.headerStyle === 'centered-classic' ? 'resume-identity-centered' : ''}`} data-resume-header="true">
        {heading.photo && heading.showPhoto && layout.photoShape !== 'none' && <img className={`resume-photo resume-photo-${layout.photoShape}`} src={heading.photo} alt="" />}
        {meta.id === 'Cv1' && !heading.photo && fullName && <span className="resume-initials" aria-hidden="true">{fullName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>}
        <div className="resume-identity-copy">
          <h1>{fullName || 'Resume'}</h1>
          {heading.title && <p className="resume-occupation">{heading.title}</p>}
          {!asideSet.has('contact') && contacts.length > 0 && <div className="resume-contact-row">{contacts.map((contact, index) => <SafeDocumentLink key={index} value={contact} />)}</div>}
        </div>
      </header>
      <div className="resume-columns" data-resume-columns="true" data-sidebar-position={hasRail ? position : 'none'}>
        {hasRail && position === 'left' && rail}
        {main}
        {hasRail && position === 'right' && rail}
      </div>
    </div>
  );
}
