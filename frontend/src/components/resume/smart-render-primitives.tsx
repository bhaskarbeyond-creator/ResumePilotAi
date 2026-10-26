/**
 * Smart Resume Engine — shared render primitives.
 *
 * Extracted from `smart-resume-document.tsx` so that the per-template layout
 * families (DIR-008) can compose these atoms without circular imports.
 *
 * Safety invariant: every rich-text sink passes through `DOMPurify.sanitize`
 * before `dangerouslySetInnerHTML`. Plain text never reaches an HTML sink.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { containsHtml, sanitizeRichText } from '@/lib/rich-text';
import { formatDateRange } from '@/lib/resume-format';
import type { TemplateMeta } from '@/lib/template-catalog';
import type { FlowItem } from '@/lib/smart-partitioner';
import type { TemplateLayoutSpec, TitleStyle } from '@/lib/template-layouts';
import { Mail, Phone, MapPin, Globe, Sparkles } from 'lucide-react';

export { Mail, Phone, MapPin, Globe, Sparkles };

export function RichTextContent({
  content,
  className,
  style,
}: {
  content?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!content) return null;
  const str = String(content).trim();
  if (!str) return null;
  if (!containsHtml(str)) {
    return (
      <div className={cn("whitespace-pre-line leading-relaxed", className)} style={style}>
        {str}
      </div>
    );
  }
  const cleanHtml = sanitizeRichText(str);
  return (
    <div
      className={cn(
        "rich-text-content [&>p]:mb-1 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-1 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:mb-1 leading-relaxed",
        className
      )}
      style={style}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}

export function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

export function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}


/** Families that carry a signature timeline treatment regardless of catalog token. */
function timelineForLayout(layout: TemplateLayoutSpec, meta?: TemplateMeta): string {
  switch (layout.family) {
    case 'technical':
      return 'code-tag';
    case 'europass':
      return 'date-rail';
    case 'timeline':
      return 'modern-node';
    case 'executive':
      return 'subtle-line';
    case 'accent':
      return 'accent-bullet';
    case 'compact':
    case 'minimal':
      return 'compact-clean';
    case 'editorial':
    case 'academic':
      return 'bare';
    case 'cv34':
      return 'subtle-line';
    default:
      return meta?.timelineStyle || 'modern-node';
  }
}

/* ─────────────────────────────────────────────────────────────
 * SECTION DIVIDER RENDERER
 * ───────────────────────────────────────────────────────────── */
export function SectionTitle({
  title,
  meta,
  palette,
  titleStyle,
}: {
  title: string;
  meta?: TemplateMeta;
  palette: any;
  titleStyle?: TitleStyle;
}) {
  const divider = titleStyle || meta?.dividerStyle || 'solid-thin';

  if (divider === 'pill') {
    return (
      <h2 className="mb-2.5 flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-[0.14em] text-white"
          style={{ backgroundColor: palette.primary }}
        >
          {title}
        </span>
      </h2>
    );
  }

  if (divider === 'bracket') {
    // Bracketed framing is drawn with borders, never with literal "[ ]"
    // characters: text extraction (ATS/copy) must yield the plain heading.
    return (
      <h2
        className="mb-2.5 flex items-center gap-2 border-x-2 px-2 py-0.5 text-xs font-extrabold uppercase tracking-[0.18em]"
        style={{ color: palette.primary, borderColor: palette.primary }}
      >
        <span className="whitespace-nowrap">{title}</span>
        <span className="h-px flex-1 self-center bg-neutral-200" aria-hidden="true" />
      </h2>
    );
  }

  if (divider === 'plain') {
    return (
      <h2
        className="mb-2 text-xs font-bold uppercase tracking-[0.16em]"
        style={{ color: palette.primary }}
      >
        {title}
      </h2>
    );
  }

  if (divider === 'micro') {
    return (
      <h2 className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.22em] text-neutral-500">
        <span className="h-px bg-neutral-300" />
        <span>{title}</span>
        <span className="h-px bg-neutral-300" />
      </h2>
    );
  }

  if (divider === 'solid-thick') {
    return (
      <h2
        className="text-xs font-extrabold uppercase tracking-wider pb-1 border-b-2 mb-2.5"
        style={{ color: palette.primary, borderColor: palette.primary }}
      >
        {title}
      </h2>
    );
  }

  if (divider === 'double-line') {
    return (
      <h2
        className="text-xs font-bold uppercase tracking-wider pb-1 border-b-2 border-double mb-2.5"
        style={{ color: palette.primary, borderColor: palette.primary }}
      >
        {title}
      </h2>
    );
  }

  if (divider === 'left-bar') {
    return (
      <h2
        className="text-xs font-extrabold uppercase tracking-wider pl-2.5 border-l-4 mb-2.5 flex items-center justify-between"
        style={{ color: palette.primary, borderColor: palette.primary }}
      >
        <span>{title}</span>
        <span className="h-px bg-neutral-200 flex-1 ml-3" />
      </h2>
    );
  }

  // Default: solid-thin
  return (
    <h2
      className="text-xs font-bold uppercase tracking-wider pb-1 border-b border-neutral-200 mb-2.5"
      style={{ color: palette.primary }}
    >
      {title}
    </h2>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FLOW ITEM RENDERER (Smart Partition Item)
 * ───────────────────────────────────────────────────────────── */
export function FlowItemRenderer({
  item,
  meta,
  palette,
  layout,
}: {
  item: FlowItem;
  meta: TemplateMeta;
  palette: any;
  isFirstItem?: boolean;
  layout?: TemplateLayoutSpec;
}) {
  const timeline = layout ? timelineForLayout(layout, meta) : (meta.timelineStyle || 'modern-node');

  return (
    <div className="flow-item">
      {/* Section Title if present or if starting on continuation */}
      {item.title && (
        <SectionTitle title={item.title} meta={meta} palette={palette} titleStyle={layout?.titleStyle} />
      )}
      {!item.title && item.continued && item.sectionLabel && (
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          {item.sectionLabel} (continued)
        </div>
      )}

      {/* Summary */}
      {item.type === 'summary' && (
        <RichTextContent
          content={item.data}
          className="text-xs text-neutral-700 leading-relaxed"
        />
      )}

      {/* Work Experience */}
      {item.type === 'experience' && (
        <ExperienceItemRenderer
          exp={item.data}
          timeline={timeline}
          palette={palette}
        />
      )}

      {/* Education */}
      {item.type === 'education' && (
        <div className="flex justify-between items-baseline text-xs mb-2">
          <div className="min-w-0">
            <span className="font-bold text-neutral-900">{item.data.degree}</span>
            {item.data.field && <span> in {item.data.field}</span>}
            <span className="text-neutral-500 font-medium"> · {item.data.institution}</span>
            {item.data.gpa && <span className="text-neutral-400"> (GPA: {item.data.gpa})</span>}
          </div>
          {formatDateRange(item.data.startDate, item.data.endDate) && (
            <span className="text-xs text-neutral-500 font-medium shrink-0 ml-auto whitespace-nowrap pl-2">
              {formatDateRange(item.data.startDate, item.data.endDate)}
            </span>
          )}
        </div>
      )}

      {/* Projects */}
      {item.type === 'projects' && (
        <div className="text-xs mb-2.5">
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-neutral-900">{item.data.title}</span>
            {item.data.liveUrl && (
              <span className="text-xs text-neutral-400 font-mono">{item.data.liveUrl}</span>
            )}
          </div>
          {item.data.technologies && (
            <div className="text-xs font-semibold mt-0.5" style={{ color: palette.primary }}>
              {item.data.technologies}
            </div>
          )}
          {item.data.description && (
            <RichTextContent
              content={item.data.description}
              className="text-neutral-600 mt-1"
            />
          )}
        </div>
      )}

      {/* Key Achievements */}
      {item.type === 'achievements' && (
        <div className="flex items-start gap-2.5 text-xs mb-2.5 p-2.5 rounded-lg bg-neutral-50/80 border border-neutral-200/70">
          <Sparkles className="size-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-neutral-900">{item.data.title}</div>
            <RichTextContent content={item.data.description} className="text-neutral-600 mt-0.5" />
          </div>
        </div>
      )}

      {/* Single-Column Skills */}
      {item.type === 'skills' && (
        <div className="space-y-2">
          {item.data.map((cat: any) => {
            const names = (cat.skills || [])
              .map((skill: any) =>
                typeof skill === 'string'
                  ? skill
                  : skill?.name || skill?.skillName || skill?.skill || skill?.title || ''
              )
              .filter((name: string) => name.trim().length > 0);
            if (names.length === 0) return null;
            return (
              <div key={cat.id || cat.category} className="text-xs">
                <span className="font-bold text-neutral-900">{cat.category}: </span>
                <span className="text-neutral-700">{names.join(', ')}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Single-Column Certifications */}
      {item.type === 'certifications' && (
        <div className="space-y-1.5 text-xs">
          {item.data.map((c: any) => (
            <div key={c.id} className="flex justify-between items-baseline">
              <div>
                <span className="font-bold text-neutral-900">{c.name || c.title}</span>
                {c.issuer && <span className="text-neutral-500"> · {c.issuer}</span>}
              </div>
              {c.date && <span className="text-xs text-neutral-500">{c.date}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Single-Column Languages */}
      {item.type === 'languages' && (
        <div className="flex flex-wrap gap-2 text-xs">
          {item.data.map((l: any) => (
            <span key={l.id} className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
              {l.name || l.language} {l.proficiency ? `(${l.proficiency})` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Hobbies / Interests */}
      {item.type === 'hobbies' && (
        <div className="flex flex-wrap gap-2 text-xs">
          {(Array.isArray(item.data) ? item.data : []).map((hobby: string, idx: number) => (
            <span key={idx} className="px-2.5 py-1 rounded-lg text-neutral-700 font-medium border border-neutral-200 bg-neutral-50">
              {hobby}
            </span>
          ))}
        </div>
      )}

      {/* References */}
      {item.type === 'references' && (
        <div className="text-xs mb-2.5 p-3 rounded-lg border border-neutral-200/70 bg-neutral-50/60">
          <div className="font-bold text-neutral-900">{item.data.name || item.data.referenceName || 'Reference'}</div>
          {(item.data.position || item.data.title) && (
            <div className="text-neutral-600 text-xs mt-0.5">
              {item.data.position || item.data.title}
              {item.data.company && ` · ${item.data.company}`}
            </div>
          )}
          {(item.data.email || item.data.phone) && (
            <div className="text-neutral-500 text-xs mt-0.5">
              {item.data.email}{item.data.email && item.data.phone ? ' · ' : ''}{item.data.phone}
            </div>
          )}
          {item.data.description && (
            <RichTextContent content={item.data.description} className="text-neutral-600 mt-1.5" />
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * EXPERIENCE ITEM RENDERER (Timeline-Aware)
 * ───────────────────────────────────────────────────────────── */
export function ExperienceItemRenderer({
  exp,
  timeline,
  palette,
}: {
  exp: any;
  timeline: string;
  palette: any;
}) {
  const dateRange = formatDateRange(exp.startDate, exp.endDate, exp.current);

  // 1. Date Rail (Europass / Executive left date column)
  if (timeline === 'date-rail') {
    return (
      <div className="grid grid-cols-4 gap-4 text-xs mb-3">
        <div className="col-span-1 text-right font-mono text-xs font-semibold text-neutral-500 pt-0.5">
          {dateRange}
        </div>
        <div className="col-span-3">
          <div className="font-bold text-neutral-900">{exp.position}</div>
          <div className="text-neutral-600 font-medium mb-1">
            {exp.company} {exp.location ? `· ${exp.location}` : ''}
          </div>
          <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
        </div>
      </div>
    );
  }

  // 2. Code Tag / Terminal Tech
  if (timeline === 'code-tag') {
    return (
      <div className="p-3 rounded-lg border border-neutral-200/80 bg-neutral-50/70 text-xs mb-2.5">
        <div className="flex justify-between items-baseline mb-1">
          <span className="min-w-0 break-words font-bold text-neutral-900">{exp.position}</span>
          {dateRange && (
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-200/80 text-neutral-700 shrink-0 ml-auto whitespace-nowrap pl-2">
              {dateRange}
            </span>
          )}
        </div>
        <div className="text-xs font-medium text-neutral-500 mb-1.5 font-mono">
          @{exp.company} {exp.location ? `// ${exp.location}` : ''}
        </div>
        <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
      </div>
    );
  }

  // 3. Modern Node (Vertical line with circular node dot)
  if (timeline === 'modern-node') {
    return (
      <div className="relative pl-5 border-l-2 mb-3 text-xs" style={{ borderColor: `${palette.primary}25` }}>
        <div
          className="absolute -left-[5px] top-1 size-2 rounded-full border-2 bg-white"
          style={{ borderColor: palette.primary }}
        />
        <div className="flex justify-between items-baseline mb-0.5">
          <h3 className="min-w-0 break-words font-bold text-neutral-900">{exp.position}</h3>
          {dateRange && <span className="text-xs text-neutral-500 font-medium shrink-0 ml-auto whitespace-nowrap pl-2">{dateRange}</span>}
        </div>
        <div className="text-neutral-600 font-medium mb-1">
          {exp.company} {exp.location ? `· ${exp.location}` : ''}
        </div>
        <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
      </div>
    );
  }

  // 4. Accent Bullet (Diamond rotated bullet)
  if (timeline === 'accent-bullet') {
    return (
      <div className="relative pl-4 mb-3 text-xs">
        <div
          className="absolute left-0 top-1.5 size-1.5 rotate-45"
          style={{ backgroundColor: palette.primary }}
        />
        <div className="flex justify-between items-baseline mb-0.5">
          <h3 className="min-w-0 break-words font-bold text-neutral-900">{exp.position}</h3>
          {dateRange && <span className="text-xs text-neutral-500 font-medium shrink-0 ml-auto whitespace-nowrap pl-2">{dateRange}</span>}
        </div>
        <div className="text-neutral-600 font-medium mb-1">
          {exp.company} {exp.location ? `· ${exp.location}` : ''}
        </div>
        <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
      </div>
    );
  }

  // 5. Subtle Line (Border-left indicator)
  if (timeline === 'subtle-line') {
    return (
      <div className="pl-3 border-l-2 mb-3 text-xs" style={{ borderColor: palette.secondary }}>
        <div className="flex justify-between items-baseline mb-0.5">
          <h3 className="min-w-0 break-words font-bold text-neutral-900">{exp.position}</h3>
          {dateRange && <span className="text-xs text-neutral-500 font-medium shrink-0 ml-auto whitespace-nowrap pl-2">{dateRange}</span>}
        </div>
        <div className="text-neutral-600 font-medium mb-1">
          {exp.company} {exp.location ? `· ${exp.location}` : ''}
        </div>
        <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
      </div>
    );
  }

  // 6. Bare / Academic — journal-style citation with a hanging date
  if (timeline === 'bare') {
    return (
      <div className="mb-3 text-xs grid grid-cols-[92px_1fr] gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 pt-0.5">
          {dateRange}
        </div>
        <div>
          <div className="text-[12.5px] leading-snug">
            <span className="font-semibold text-neutral-900">{exp.position}</span>
            <span className="text-neutral-500"> · {exp.company}</span>
          </div>
          {exp.location && <div className="text-xs italic text-neutral-500">{exp.location}</div>}
          <RichTextContent content={exp.description} className="text-neutral-700 leading-snug mt-0.5" />
        </div>
      </div>
    );
  }

  // Default: Compact Clean (Border-free)
  return (
    <div className="mb-3 text-xs">
      <div className="flex justify-between items-baseline mb-0.5">
        <h3 className="min-w-0 break-words font-bold text-neutral-900">
          {exp.position} — <span className="font-semibold text-neutral-700">{exp.company}</span>
        </h3>
        <span className="text-xs text-neutral-500 font-medium shrink-0 ml-2">{dateRange}</span>
      </div>
      {exp.location && <div className="text-xs text-neutral-500 mb-1">{exp.location}</div>}
      <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SIDEBAR SKILLS RENDERER (Variant-Aware)
 * ───────────────────────────────────────────────────────────── */
export function SidebarSkillsRenderer({
  categories,
  variant,
  palette,
  isDark,
}: {
  categories: any[];
  variant: string;
  palette: any;
  isDark: boolean;
}) {
  const allSkills = categories.flatMap((c) => c.skills || []);

  if (variant === 'badges') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {allSkills.map((s, idx) => (
          <span
            key={idx}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-semibold border",
              isDark
                ? "bg-white/10 text-white border-white/20"
                : "bg-neutral-100 text-neutral-800 border-neutral-300"
            )}
          >
            {typeof s === 'string' ? s : (s.name || s.skillName || '')}
          </span>
        ))}
      </div>
    );
  }

  if (variant === 'bars') {
    return (
      <div className="space-y-2">
        {allSkills.slice(0, 10).map((s, idx) => {
          const name = typeof s === 'string' ? s : (s.name || s.skillName || '');
          const pct = typeof s === 'object' && s.rating ? s.rating * 20 : 85 + (idx % 3) * 5;
          return (
            <div key={idx} className="space-y-0.5">
              <div className="flex justify-between text-xs font-medium">
                <span>{name}</span>
                <span className={isDark ? "text-white/60" : "text-neutral-400"}>{pct}%</span>
              </div>
              <div className={cn("w-full h-1 rounded-full overflow-hidden", isDark ? "bg-white/20" : "bg-neutral-200")}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isDark ? '#ffffff' : (palette.secondary || palette.primary),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'dots') {
    return (
      <div className="space-y-1.5">
        {allSkills.slice(0, 10).map((s, idx) => {
          const name = typeof s === 'string' ? s : (s.name || s.skillName || '');
          const rating = typeof s === 'object' && s.rating ? s.rating : (idx % 3 === 0 ? 5 : 4);
          return (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="font-medium truncate pr-2">{name}</span>
              <div className="flex gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        d <= rating
                          ? palette.secondary || (isDark ? '#ffffff' : palette.primary)
                          : isDark
                          ? 'rgba(255,255,255,0.25)'
                          : '#cbd5e1',
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn("text-xs leading-relaxed", isDark ? "text-white/90" : "text-neutral-700")}>
        {allSkills.map((s) => typeof s === 'string' ? s : (s.name || s.skillName || '')).join(' • ')}
      </div>
    );
  }

  // Default: Pills
  return (
    <div className="flex flex-wrap gap-1">
      {allSkills.map((s, idx) => (
        <span
          key={idx}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            isDark ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-800 border border-neutral-200"
          )}
        >
          {typeof s === 'string' ? s : (s.name || s.skillName || '')}
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SIDEBAR LANGUAGES RENDERER (Variant-Aware)
 * ───────────────────────────────────────────────────────────── */
export function getLanguageRating(l: any): number {
  if (typeof l.rating === 'number') return l.rating;
  const prof = String(l.proficiency || '').toLowerCase();
  if (prof.includes('native') || prof.includes('fluent') || prof.includes('c2') || prof.includes('c1')) {
    return 5;
  }
  if (prof.includes('advanced') || prof.includes('intermediate') || prof.includes('b2')) {
    return 4;
  }
  return 4;
}

export function SidebarLanguagesRenderer({
  languages,
  variant,
  palette,
  isDark,
}: {
  languages: any[];
  variant: string;
  palette: any;
  isDark: boolean;
}) {
  const activeColor = palette.secondary || (isDark ? '#ffffff' : palette.primary);
  const inactiveColor = isDark ? 'rgba(255,255,255,0.25)' : '#cbd5e1';

  if (variant === 'dots') {
    return (
      <div className="space-y-1.5">
        {languages.map((l: any, idx: number) => {
          const langName = l.name || l.language || (typeof l === 'string' ? l : '');
          const dotsCount = getLanguageRating(l);
          return (
            <div key={l.id || idx} className="flex items-center justify-between text-xs">
              <span className="font-medium truncate pr-2">{langName}</span>
              <div className="flex gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 rounded-full"
                    style={{
                      backgroundColor: d <= dotsCount ? activeColor : inactiveColor,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      {languages.map((l: any, idx: number) => (
        <div key={l.id || idx} className="flex justify-between items-baseline">
          <span className="font-medium">{l.name || l.language || (typeof l === 'string' ? l : '')}</span>
          <span className={cn("text-xs", isDark ? "text-white/70" : "text-neutral-500")}>
            {l.proficiency || l.level || ''}
          </span>
        </div>
      ))}
    </div>
  );
}
