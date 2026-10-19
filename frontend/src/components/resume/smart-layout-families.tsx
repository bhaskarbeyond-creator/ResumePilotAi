/**
 * DIR-008 — per-template page-one layout families.
 *
 * Exactly one family renders for a given catalog id, selected exclusively from
 * the typed `TemplateLayoutSpec` (never from a color or a silent fallback).
 * Each family composes genuinely different geometry: column count, identity
 * block treatment, rail contents, reading order, section framing and density.
 *
 * All content still flows from the same partitioner output, so pagination,
 * continuation headings and ATS-safe text extraction stay consistent.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { TemplateMeta } from '@/lib/template-catalog';
import type { FlowItem, PartitionedPage } from '@/lib/smart-partitioner';
import { SECTION_TITLES } from '@/lib/smart-partitioner';
import type { AsideSectionKey, SectionKey, TemplateLayoutSpec, TitleStyle } from '@/lib/template-layouts';
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

function candidateName(resume: any): string {
  const heading = resume?.heading || {};
  return `${heading.firstName || ''} ${heading.lastName || ''}`.trim() || resume?.name || resume?.fullName || 'Candidate';
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
}: {
  heading: any;
  fullName: string;
  layout: TemplateLayoutSpec;
  size?: string;
  className?: string;
  ring?: boolean;
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
        ring && 'ring-2 ring-white/40',
        className
      )}
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
            <span className="break-words">{entry.value}</span>
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
          'font-extrabold leading-[1.05] tracking-tight',
          NAME_SCALE[layout.nameScale],
          tone === 'dark' ? 'text-white' : 'text-neutral-900'
        )}
      >
        {fullName}
      </h1>
      {showTitle && heading?.title && (
        <p
          className={cn(
            'mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
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
  meta,
  palette,
  layout,
}: {
  heading: any;
  fullName: string;
  meta: TemplateMeta;
  palette: ResumePalette;
  layout: TemplateLayoutSpec;
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
            <div className="hidden shrink-0 text-right text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70 sm:block">
              {meta.category}
              <div className="mt-1 text-[13px] font-bold tracking-normal text-white">{meta.id}</div>
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
            <div className={cn('text-[9px]', muted)}>{edu.startDate} {edu.endDate ? `– ${edu.endDate}` : ''}</div>
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
      <div className={cn('px-5 pb-4 text-[8px] uppercase tracking-[0.18em]', isDark ? 'text-white/40' : 'text-neutral-400')}>
        {meta.id} · Verified ATS
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
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{meta.id}</span>
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
        <div className="mb-3 flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-neutral-500">
          <span>{resume.heading?.location || 'Curriculum Vitae'}</span>
          <span>{meta.name}</span>
        </div>
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
                {role.startDate || role.begin || '—'}
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
              Curriculum Vitae · Europass
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
          <div className="mt-4 border-t border-neutral-800 pt-2 font-mono text-[8px] text-neutral-500">
            {meta.id} :: v1.0
          </div>
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
      <footer className="shrink-0 border-t border-neutral-200 py-2 text-center text-[8px] uppercase tracking-[0.3em] text-neutral-400">
        {meta.name}
      </footer>
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
            <div className="text-[8.5px] font-bold uppercase tracking-[0.36em] text-neutral-500">{meta.category} edition</div>
            <h1 className={cn('mt-1 font-black uppercase leading-none tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>
              {fullName}
            </h1>
          </div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[70px]" />
        </div>
        <div className="flex items-center justify-between gap-4 py-1.5 text-[9px] uppercase tracking-wider text-neutral-500">
          <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'minimal' }} />
          <span className="shrink-0">{meta.id}</span>
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
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[33%] shrink-0 flex-col justify-between bg-slate-900 px-5 py-6 text-white" data-layout-rail="cv1">
        <div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[92px]" className="mb-4 rounded-lg" />
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{fullName}</h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{resume.heading?.title}</p>
          <div className="mt-4 space-y-1 border-t border-white/15 pt-3">
            <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'stack' }} />
          </div>
          <div className="mt-4 space-y-3">
            {layout.asideSections.filter((section) => section !== 'contact').map((section) => (
              <RailSection
                key={section}
                section={section}
                resume={resume}
                meta={meta}
                palette={palette}
                isDark
              />
            ))}
          </div>
        </div>
        <div className="text-[8px] uppercase tracking-[0.2em] text-white/40">{meta.id} · Classic</div>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col bg-white px-7 py-6">
        <div className="mb-3 border-b-2 pb-1.5" style={{ borderColor: palette.primary }}>
          <span className="text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: palette.primary }}>
            Professional Curriculum Vitae
          </span>
        </div>
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
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

function Cv25Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-row-reverse">
      <aside className="flex w-[31%] shrink-0 flex-col justify-between border-l border-neutral-200 bg-neutral-50 px-5 py-6" data-layout-rail="cv25">
        <div>
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[80px]" className="mb-4" ring={false} />
          <div className="mb-3 border-b border-neutral-300 pb-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Contact</div>
            <div className="mt-1">
              <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'stack' }} />
            </div>
          </div>
          <div className="space-y-3">
            {layout.asideSections.filter((section) => section !== 'contact').map((section) => (
              <RailSection
                key={section}
                section={section}
                resume={resume}
                meta={meta}
                palette={palette}
                isDark={false}
              />
            ))}
          </div>
        </div>
        <div className="text-[8px] uppercase tracking-[0.2em] text-neutral-400">{meta.id} · Minimal</div>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col px-7 py-6">
        <header className="mb-3 shrink-0">
          <h1 className={cn('font-bold tracking-tight text-neutral-900', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-500">{resume.heading?.title}</p>
          <div className="mt-2 h-[2px] w-16" style={{ backgroundColor: palette.primary }} />
        </header>
        <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
      </main>
    </div>
  );
}

function Cv34Family(props: FamilyPageProps) {
  const { resume, meta, palette, page, fullName, layout } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-8 py-6" style={{ backgroundColor: palette.primary }}>
        <div className="flex items-center gap-5 text-white">
          <Photo heading={resume.heading} fullName={fullName} layout={layout} size="size-[88px]" />
          <div className="min-w-0 flex-1">
            <h1 className={cn('font-black leading-none tracking-tight', NAME_SCALE[layout.nameScale])}>{fullName}</h1>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">{resume.heading?.title}</p>
            <div className="mt-2 border-t border-white/25 pt-2">
              <ContactRow heading={resume.heading} layout={{ ...layout, contactLayout: 'inline' }} />
            </div>
          </div>
          <div
            className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full border-2 border-white/50 text-center"
            aria-hidden="true"
          >
            <span className="text-[13px] font-black leading-none text-white">{meta.id.replace('Cv', '')}</span>
            <span className="mt-0.5 text-[6.5px] font-bold uppercase tracking-wider text-white/70">Edition</span>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col px-7 py-4">
          <FlowList items={page.flowItems} meta={meta} palette={palette} layout={layout} />
        </main>
        <aside className="flex w-[29%] shrink-0 flex-col justify-between bg-neutral-50 px-5 py-4" data-layout-rail="cv34">
          <div className="space-y-3">
            {layout.asideSections.filter((section) => section !== 'contact').map((section) => (
              <RailSection
                key={section}
                section={section}
                resume={resume}
                meta={meta}
                palette={palette}
                isDark={false}
              />
            ))}
          </div>
          <div className="text-[8px] uppercase tracking-[0.2em] text-neutral-400">{meta.name}</div>
        </aside>
      </div>
      <footer className="h-1.5 shrink-0" style={{ backgroundColor: palette.secondary }} />
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
