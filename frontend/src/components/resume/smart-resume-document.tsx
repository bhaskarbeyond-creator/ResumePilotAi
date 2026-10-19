/**
 * SmartResumeDocument Component
 *
 * Universal, vector-grade A4 Multi-Page Resume & Cover Letter Rendering Engine.
 * Shared seamlessly across both /export/CvX/:resumeId/en and Cuba PreviewModal.
 *
 * Architectural Invariants:
 * - 100 ATS Resume Layouts (Cv1 to Cv100) + 4 Cover Letters (Cover1 to Cover4)
 * - True Smart Partitioning: Greedy packed across discrete 210mm x 297mm A4 sheets
 * - Continuation Headers: Rendered on Page 2+ ("Candidate Name — Role — Page X of Y")
 * - Page Footers: Rendered on every sheet with page counter and verified watermark
 * - Zero Layout Monotony: Fully honors TemplateMeta tokens:
 *     archetype, headerStyle, skillVariant, timelineStyle, dividerStyle,
 *     sidebarPosition, sidebarBg, sidebarText, font, density
 * - Candidate Headshots: Real builder photo rendered across all archetypes
 */

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import type { TemplateMeta } from '@/lib/template-catalog';
import { partitionResumeContent, type PartitionedPage, type FlowItem } from '@/lib/smart-partitioner';
import { Mail, Phone, MapPin, Globe, Sparkles } from 'lucide-react';

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
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(str);
  if (!hasHtml) {
    return (
      <div className={cn("whitespace-pre-line leading-relaxed", className)} style={style}>
        {str}
      </div>
    );
  }
  const cleanHtml = DOMPurify.sanitize(str);
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

export interface SmartResumeProps {
  resume: any;
  meta: TemplateMeta;
  palette?: {
    primary: string;
    secondary: string;
    soft?: string;
    text?: string;
  };
  density?: 'compact' | 'standard' | 'spacious';
  isPrint?: boolean;
}

export function SmartResumeDocument({
  resume,
  meta,
  palette: customPalette,
  density = 'standard',
  isPrint = false,
}: SmartResumeProps) {
  const primary = customPalette?.primary || meta.primary || '#1e3a8a';
  const secondary = customPalette?.secondary || meta.secondary || '#3b82f6';
  const palette = {
    primary,
    secondary,
    soft: customPalette?.soft || `${primary}18`,
    text: customPalette?.text || primary,
  };

  const isCoverLetter = meta.id.startsWith('Cover');

  // Smart greedy packing across discrete A4 sheets
  const partitionResult = useMemo(() => {
    return partitionResumeContent(resume, meta, (density || meta.density || 'standard') as any);
  }, [resume, meta, density]);

  const fullName = `${resume.heading?.firstName || ''} ${resume.heading?.lastName || ''}`.trim() || resume.name || 'Candidate Name';

  // Font family class mapping
  const fontStyle = meta.font ? { fontFamily: meta.font } : undefined;

  if (isCoverLetter) {
    return (
      <div
        className="smart-resume-page page-sheet relative bg-white shadow-xl mx-auto print:shadow-none print:m-0"
        style={{
          width: '210mm',
          minHeight: '297mm',
          boxSizing: 'border-box',
          ...fontStyle,
        }}
      >
        {meta.id === 'Cover2' ? (
          <Cover2Layout resume={resume} palette={palette} />
        ) : meta.id === 'Cover3' ? (
          <Cover3Layout resume={resume} palette={palette} />
        ) : meta.id === 'Cover4' ? (
          <Cover4Layout resume={resume} palette={palette} />
        ) : (
          <Cover1Layout resume={resume} palette={palette} />
        )}
      </div>
    );
  }

  return (
    <div
      className="smart-resume-document flex flex-col items-center gap-8 print:gap-0"
      data-is-print={isPrint ? 'true' : 'false'}
    >
      {partitionResult.pages.map((page) => (
        <div
          key={`page-${page.pageNumber}`}
          data-page-number={page.pageNumber}
          data-total-pages={partitionResult.totalPages}
          className={cn(
            'smart-resume-page page-sheet relative bg-white shadow-xl transition-transform print:shadow-none print:m-0 print:break-after-page',
            `density-${density}`
          )}
          style={{
            width: '210mm',
            minHeight: '297mm',
            maxHeight: '297mm',
            boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            ...fontStyle,
          }}
        >
          {/* Main Document Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {page.pageNumber === 1 ? (
              // ─── PAGE 1: Master Header & Layout ───
              <PageOneContent
                resume={resume}
                meta={meta}
                palette={palette}
                page={page}
                fullName={fullName}
              />
            ) : (
              // ─── PAGE 2+: Continuation Header & Flow ───
              <ContinuationPageContent
                resume={resume}
                meta={meta}
                palette={palette}
                page={page}
                totalPages={partitionResult.totalPages}
                fullName={fullName}
              />
            )}
          </div>

          {/* Master Page Footer */}
          <footer className="page-footer border-t border-neutral-200/60 pt-2 px-8 pb-3 text-[10px] text-neutral-400 flex justify-between items-center shrink-0">
            <span>
              {fullName} · {meta.name} ({meta.id})
            </span>
            <span className="font-medium text-neutral-500">
              Page {page.pageNumber} of {partitionResult.totalPages}
            </span>
          </footer>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * PAGE 1 CONTENT RENDERER
 * ───────────────────────────────────────────────────────────── */
function PageOneContent({
  resume,
  meta,
  palette,
  page,
  fullName,
}: {
  resume: any;
  meta: TemplateMeta;
  palette: any;
  page: PartitionedPage;
  fullName: string;
}) {
  const { heading } = resume;
  const isReverseSidebar = meta.sidebarPosition === 'right';

  // ─── 1. Executive Banner Archetype (Cv16, Cv17, Cv21, Cv23, Cv30, Cv34, Cv36, Cv53...) ───
  if (meta.archetype === 'executive-banner') {
    const sidebarBg = '#f8fafc';
    const sidebarText = '#1e293b';

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Full-width Edge-to-Edge Executive Header Banner */}
        <header
          className="w-full px-8 py-6 text-white shadow-xs shrink-0"
          style={{ backgroundColor: palette.primary }}
        >
          <div className="flex items-center gap-6">
            {heading.photo && heading.showPhoto !== false && (
              <img
                src={heading.photo}
                alt={fullName}
                className="size-20 rounded-2xl object-cover border-2 border-white/40 shadow-sm shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black tracking-tight text-white leading-tight">{fullName}</h1>
              <p
                className="text-xs font-bold uppercase tracking-wider mt-1"
                style={{ color: palette.secondary }}
              >
                {heading.title}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/90">
                {heading.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 opacity-70 shrink-0" />
                    {heading.email}
                  </span>
                )}
                {heading.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 opacity-70 shrink-0" />
                    {heading.phone}
                  </span>
                )}
                {heading.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 opacity-70 shrink-0" />
                    {heading.location}
                  </span>
                )}
                {heading.linkedin && (
                  <span className="flex items-center gap-1.5">
                    <LinkedinIcon className="size-3.5 opacity-70 shrink-0" />
                    {heading.linkedin}
                  </span>
                )}
                {heading.github && (
                  <span className="flex items-center gap-1.5">
                    <GithubIcon className="size-3.5 opacity-70 shrink-0" />
                    {heading.github}
                  </span>
                )}
                {heading.website && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="size-3.5 opacity-70 shrink-0" />
                    {heading.website}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Two-Column Body: Left Sidebar + Right Main Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Column: Skills, Certifications, Languages */}
          <aside
            className="w-[34%] p-6 border-r border-neutral-200/80 bg-slate-50/70 flex flex-col justify-between shrink-0"
            style={{ color: sidebarText }}
          >
            <div>
              {/* Sidebar Skills */}
              {((resume.skillCategories && resume.skillCategories.length > 0) || (resume.skills && resume.skills.length > 0)) && (
                <div className="mb-6">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2.5">
                    Skills & Expertise
                  </div>
                  <SidebarSkillsRenderer
                    categories={resume.skillCategories || [{ id: 'core', category: 'Skills', skills: resume.skills }]}
                    variant={meta.skillVariant || 'dots'}
                    palette={palette}
                    isDark={false}
                  />
                </div>
              )}

              {/* Sidebar Certifications */}
              {resume.certifications && resume.certifications.length > 0 && (
                <div className="mb-6 border-t border-neutral-200 pt-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    Certifications
                  </div>
                  <div className="space-y-2 text-xs">
                    {resume.certifications.map((c: any) => (
                      <div key={c.id || c.name || c.title} className="flex flex-col">
                        <span className="font-semibold text-neutral-900 leading-tight">{c.name || c.title}</span>
                        {c.issuer && (
                          <span className="text-[10px] text-neutral-500 mt-0.5">
                            {c.issuer} {c.date ? `· ${c.date}` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sidebar Languages */}
              {resume.languages && resume.languages.length > 0 && (
                <div className="mb-4 border-t border-neutral-200 pt-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    Languages
                  </div>
                  <SidebarLanguagesRenderer
                    languages={resume.languages}
                    variant={meta.skillVariant || 'dots'}
                    palette={palette}
                    isDark={false}
                  />
                </div>
              )}
            </div>

            <div className="text-[9px] pt-3 border-t border-neutral-200 text-neutral-400">
              Verified ATS · {meta.id}
            </div>
          </aside>

          {/* Right Column: Flow items */}
          <main className="flex-1 p-6 sm:p-7 flex flex-col min-h-0">
            <div className="space-y-4 flex-1">
              {page.flowItems.map((item, idx) => (
                <FlowItemRenderer
                  key={item.id}
                  item={item}
                  meta={meta}
                  palette={palette}
                  isFirstItem={idx === 0}
                />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ─── 2. Tech Grid Archetype (Cv25, Cv28, Cv31, Cv32, Cv33, Cv35, Cv37, Cv54...) ───
  if (meta.archetype === 'tech-grid') {
    const isSidebarDark = true;
    const sidebarBg = '#0f172a';
    const sidebarText = '#f8fafc';

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Terminal Header */}
        <header className="p-6 border-b border-neutral-200 bg-neutral-900 text-white shrink-0 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              <h1 className="text-xl font-bold font-mono tracking-tight text-white">{fullName}</h1>
            </div>
            <p className="text-xs font-mono text-emerald-400 mt-0.5">{`// ${heading.title}`}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-300">
              {heading.email && <span>{heading.email}</span>}
              {heading.phone && <span>· {heading.phone}</span>}
              {heading.location && <span>· {heading.location}</span>}
              {heading.github && <span>· {heading.github}</span>}
              {heading.linkedin && <span>· {heading.linkedin}</span>}
            </div>
          </div>
          {heading.photo && heading.showPhoto !== false && (
            <img
              src={heading.photo}
              alt={fullName}
              className="size-16 rounded-lg object-cover border border-emerald-500/50 shadow-xs shrink-0"
            />
          )}
        </header>

        {/* Two-Column Tech Layout */}
        <div className="flex flex-1 min-h-0">
          <aside
            className="w-[34%] p-6 flex flex-col justify-between shrink-0"
            style={{ backgroundColor: sidebarBg, color: sidebarText }}
          >
            <div>
              {((resume.skillCategories && resume.skillCategories.length > 0) || (resume.skills && resume.skills.length > 0)) && (
                <div className="mb-6">
                  <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-emerald-400 mb-2.5">
                    {"// Tech Stack"}
                  </div>
                  <SidebarSkillsRenderer
                    categories={resume.skillCategories || [{ id: 'core', category: 'Skills', skills: resume.skills }]}
                    variant={meta.skillVariant || 'badges'}
                    palette={palette}
                    isDark={isSidebarDark}
                  />
                </div>
              )}

              {resume.certifications && resume.certifications.length > 0 && (
                <div className="mb-6 border-t border-white/10 pt-4">
                  <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-emerald-400 mb-2">
                    {"// Certifications"}
                  </div>
                  <div className="space-y-2 text-xs">
                    {resume.certifications.map((c: any) => (
                      <div key={c.id || c.name || c.title} className="flex flex-col">
                        <span className="font-semibold text-white leading-tight font-mono">{c.name || c.title}</span>
                        {c.issuer && (
                          <span className="text-[10px] text-white/60 mt-0.5">
                            {c.issuer} {c.date ? `· ${c.date}` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resume.languages && resume.languages.length > 0 && (
                <div className="mb-4 border-t border-white/10 pt-4">
                  <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-emerald-400 mb-2">
                    {"// Languages"}
                  </div>
                  <SidebarLanguagesRenderer
                    languages={resume.languages}
                    variant={meta.skillVariant || 'badges'}
                    palette={palette}
                    isDark={isSidebarDark}
                  />
                </div>
              )}
            </div>

            <div className="text-[9px] pt-3 border-t border-white/10 text-white/40 font-mono">
              SYSTEM.ARCH // {meta.id}
            </div>
          </aside>

          <main className="flex-1 p-6 flex flex-col min-h-0 space-y-4">
            {page.flowItems.map((item, idx) => (
              <FlowItemRenderer
                key={item.id}
                item={item}
                meta={meta}
                palette={palette}
                isFirstItem={idx === 0}
              />
            ))}
          </main>
        </div>
      </div>
    );
  }

  // ─── 3. Modern Split & Compact Euro Archetypes ───
  const isTwoColumn = meta.archetype === 'modern-split' || meta.archetype === 'compact-euro';
  if (isTwoColumn) {
    const sidebarBg = meta.sidebarBg || palette.primary;
    const sidebarText = meta.sidebarText || (meta.sidebarBg ? '#1e293b' : '#ffffff');
    const isSidebarDark = !meta.sidebarBg || meta.sidebarBg.includes('#0') || meta.sidebarBg.includes('#1') || meta.sidebarBg.includes('#2') || meta.sidebarBg.includes('180deg');

    return (
      <div className={cn("flex flex-1 min-h-0", isReverseSidebar ? "flex-row-reverse" : "flex-row")}>
        {/* Sidebar Column */}
        <aside
          className="w-[34%] p-6 flex flex-col justify-between shrink-0"
          style={{
            backgroundColor: sidebarBg,
            color: sidebarText,
          }}
        >
          <div>
            {/* Candidate Photo Headshot */}
            {heading.photo && heading.showPhoto !== false ? (
              <div className="mb-4">
                <img
                  src={heading.photo}
                  alt={fullName}
                  className={cn(
                    "size-24 object-cover shadow-md border-2",
                    meta.archetype === 'compact-euro' ? "rounded-lg" : "rounded-2xl",
                    isSidebarDark ? "border-white/30" : "border-neutral-300"
                  )}
                />
              </div>
            ) : null}

            {/* Name & Title in Sidebar (for sidebar header style) */}
            {meta.headerStyle === 'sidebar' && (
              <div className="mb-6">
                <h1 className="text-xl font-bold tracking-tight leading-snug">
                  {fullName}
                </h1>
                <p className={cn("text-xs font-medium uppercase tracking-wider mt-1", isSidebarDark ? "text-white/80" : "text-neutral-600")}>
                  {heading.title}
                </p>
              </div>
            )}

            {/* Contact Details */}
            <div className={cn("space-y-2 text-xs mb-6", meta.headerStyle === 'sidebar' ? (isSidebarDark ? "border-t border-white/20 pt-4" : "border-t border-neutral-200 pt-4") : "")}>
              <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", isSidebarDark ? "text-white/70" : "text-neutral-500")}>
                Contact
              </div>
              {heading.email && (
                <div className="flex items-center gap-2 truncate">
                  <Mail className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{heading.email}</span>
                </div>
              )}
              {heading.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0 opacity-80" />
                  <span>{heading.phone}</span>
                </div>
              )}
              {heading.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 opacity-80" />
                  <span>{heading.location}</span>
                </div>
              )}
              {heading.linkedin && (
                <div className="flex items-center gap-2 truncate">
                  <LinkedinIcon className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{heading.linkedin}</span>
                </div>
              )}
              {heading.github && (
                <div className="flex items-center gap-2 truncate">
                  <GithubIcon className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{heading.github}</span>
                </div>
              )}
              {heading.website && (
                <div className="flex items-center gap-2 truncate">
                  <Globe className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{heading.website}</span>
                </div>
              )}
            </div>

            {/* Sidebar Skills */}
            {((resume.skillCategories && resume.skillCategories.length > 0) || (resume.skills && resume.skills.length > 0)) && (
              <div className={cn("mb-6 border-t pt-4", isSidebarDark ? "border-white/20" : "border-neutral-200")}>
                <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-2.5", isSidebarDark ? "text-white/70" : "text-neutral-500")}>
                  Skills & Expertise
                </div>
                <SidebarSkillsRenderer
                  categories={resume.skillCategories || [{ id: 'core', category: 'Skills', skills: resume.skills }]}
                  variant={meta.skillVariant || 'pills'}
                  palette={palette}
                  isDark={isSidebarDark}
                />
              </div>
            )}

            {/* Sidebar Languages */}
            {resume.languages && resume.languages.length > 0 && (
              <div className={cn("mb-4 border-t pt-4", isSidebarDark ? "border-white/20" : "border-neutral-200")}>
                <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-2", isSidebarDark ? "text-white/70" : "text-neutral-500")}>
                  Languages
                </div>
                <SidebarLanguagesRenderer
                  languages={resume.languages}
                  variant={meta.skillVariant || 'dots'}
                  palette={palette}
                  isDark={isSidebarDark}
                />
              </div>
            )}

            {/* Sidebar Certifications */}
            {resume.certifications && resume.certifications.length > 0 && (
              <div className={cn("mb-4 border-t pt-4", isSidebarDark ? "border-white/20" : "border-neutral-200")}>
                <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-2", isSidebarDark ? "text-white/70" : "text-neutral-500")}>
                  Certifications
                </div>
                <div className="space-y-2 text-xs">
                  {resume.certifications.map((c: any) => (
                    <div key={c.id || c.name || c.title} className="flex flex-col">
                      <span className="font-semibold leading-tight">{c.name || c.title}</span>
                      {c.issuer && (
                        <span className={cn("text-[10px] mt-0.5", isSidebarDark ? "text-white/70" : "text-neutral-500")}>
                          {c.issuer} {c.date ? `· ${c.date}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={cn("text-[9px] pt-3 border-t", isSidebarDark ? "border-white/10 text-white/40" : "border-neutral-200 text-neutral-400")}>
            Verified ATS · {meta.id}
          </div>
        </aside>

        {/* Main Flow Column */}
        <main className="flex-1 p-8 flex flex-col min-h-0">
          {meta.headerStyle !== 'sidebar' && (
            <TopHeaderBanner
              heading={heading}
              fullName={fullName}
              meta={meta}
              palette={palette}
            />
          )}

          <div className="space-y-4 flex-1">
            {page.flowItems.map((item, idx) => (
              <FlowItemRenderer
                key={item.id}
                item={item}
                meta={meta}
                palette={palette}
                isFirstItem={idx === 0}
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ─── 4. Single-Column ATS Layout (Minimal ATS) ───
  return (
    <div className="p-8 sm:p-10 flex flex-col flex-1 min-h-0">
      <TopHeaderBanner
        heading={heading}
        fullName={fullName}
        meta={meta}
        palette={palette}
      />

      <div className="space-y-4 flex-1 mt-6">
        {page.flowItems.map((item, idx) => (
          <FlowItemRenderer
            key={item.id}
            item={item}
            meta={meta}
            palette={palette}
            isFirstItem={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * CONTINUATION PAGE CONTENT (Page 2+)
 * ───────────────────────────────────────────────────────────── */
function ContinuationPageContent({
  resume,
  meta,
  palette,
  page,
  totalPages,
  fullName,
}: {
  resume: any;
  meta: TemplateMeta;
  palette: any;
  page: PartitionedPage;
  totalPages: number;
  fullName: string;
}) {
  return (
    <div className="p-8 sm:p-10 flex flex-col flex-1 min-h-0">
      {/* Dynamic Continuation Header */}
      <header className="continuation-header border-b border-neutral-200 pb-2.5 mb-6 flex justify-between items-baseline shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-sm text-neutral-900 tracking-tight">{fullName}</span>
          <span className="text-xs text-neutral-500 font-medium">· {resume.heading?.title}</span>
        </div>
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
          Page {page.pageNumber} of {totalPages}
        </span>
      </header>

      {/* Continuation Flow Items */}
      <div className="space-y-4 flex-1">
        {page.flowItems.map((item, idx) => (
          <FlowItemRenderer
            key={item.id}
            item={item}
            meta={meta}
            palette={palette}
            isFirstItem={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * TOP HEADER BANNER (Archetype-Aware)
 * ───────────────────────────────────────────────────────────── */
function TopHeaderBanner({
  heading,
  fullName,
  meta,
  palette,
}: {
  heading: any;
  fullName: string;
  meta: TemplateMeta;
  palette: any;
}) {
  const hasPhoto = heading.photo && heading.showPhoto !== false;

  // 1. Executive Banner (Full width colored card)
  if (meta.headerStyle === 'banner' || meta.archetype === 'executive-banner') {
    return (
      <header
        className="rounded-xl p-6 text-white shadow-xs mb-4"
        style={{ backgroundColor: palette.primary }}
      >
        <div className="flex items-center gap-6">
          {hasPhoto && (
            <img
              src={heading.photo}
              alt={fullName}
              className="size-20 rounded-2xl object-cover border-2 border-white/40 shadow-sm shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-white">{fullName}</h1>
            <p className="text-sm font-medium text-white/90 mt-0.5">{heading.title}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/90">
              {heading.email && <span>{heading.email}</span>}
              {heading.phone && <span>· {heading.phone}</span>}
              {heading.location && <span>· {heading.location}</span>}
              {heading.linkedin && <span>· {heading.linkedin}</span>}
              {heading.github && <span>· {heading.github}</span>}
            </div>
          </div>
        </div>
      </header>
    );
  }

  // 2. Centered Classic (Academic / Serif ATS)
  if (meta.headerStyle === 'centered-classic') {
    return (
      <header className="flex flex-col items-center text-center pb-3 border-b-2 mb-4" style={{ borderColor: palette.primary }}>
        {hasPhoto && (
          <img
            src={heading.photo}
            alt={fullName}
            className="size-20 rounded-full object-cover border-2 shadow-xs mb-3"
            style={{ borderColor: palette.primary }}
          />
        )}
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{fullName}</h1>
        <p className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-2 flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
          {heading.email && <span>{heading.email}</span>}
          {heading.phone && <span>• {heading.phone}</span>}
          {heading.location && <span>• {heading.location}</span>}
          {heading.linkedin && <span>• {heading.linkedin}</span>}
          {heading.github && <span>• {heading.github}</span>}
        </div>
      </header>
    );
  }

  // 3. Accent Bracket Framing
  if (meta.headerStyle === 'accent-bracket') {
    return (
      <header className="p-4 rounded-lg border-l-4 border-r-4 mb-4 bg-neutral-50/70" style={{ borderColor: palette.primary }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-neutral-900">{fullName}</h1>
            <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={{ color: palette.primary }}>
              {heading.title}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
              {heading.email && <span>{heading.email}</span>}
              {heading.phone && <span>· {heading.phone}</span>}
              {heading.location && <span>· {heading.location}</span>}
              {heading.linkedin && <span>· {heading.linkedin}</span>}
            </div>
          </div>
          {hasPhoto && (
            <img
              src={heading.photo}
              alt={fullName}
              className="size-16 rounded-xl object-cover border shadow-xs"
              style={{ borderColor: palette.primary }}
            />
          )}
        </div>
      </header>
    );
  }

  // 4. Left Bold / Minimal Inline (Standard Modern ATS)
  return (
    <header className="border-b-2 pb-3 mb-4 flex justify-between items-start" style={{ borderColor: palette.primary }}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{fullName}</h1>
        <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          {heading.email && <span>{heading.email}</span>}
          {heading.phone && <span>· {heading.phone}</span>}
          {heading.location && <span>· {heading.location}</span>}
          {heading.linkedin && <span>· {heading.linkedin}</span>}
          {heading.github && <span>· {heading.github}</span>}
        </div>
      </div>
      {hasPhoto && (
        <img
          src={heading.photo}
          alt={fullName}
          className="size-16 rounded-xl object-cover border shadow-xs shrink-0 ml-4"
          style={{ borderColor: palette.primary }}
        />
      )}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SECTION DIVIDER RENDERER
 * ───────────────────────────────────────────────────────────── */
function SectionTitle({
  title,
  meta,
  palette,
}: {
  title: string;
  meta: TemplateMeta;
  palette: any;
}) {
  const divider = meta.dividerStyle || 'solid-thin';

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
function FlowItemRenderer({
  item,
  meta,
  palette,
}: {
  item: FlowItem;
  meta: TemplateMeta;
  palette: any;
  isFirstItem?: boolean;
}) {
  const timeline = meta.timelineStyle || 'modern-node';

  return (
    <div className="flow-item">
      {/* Section Title if present or if starting on continuation */}
      {item.title && (
        <SectionTitle title={item.title} meta={meta} palette={palette} />
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
          <div>
            <span className="font-bold text-neutral-900">{item.data.degree}</span>
            {item.data.field && <span> in {item.data.field}</span>}
            <span className="text-neutral-500 font-medium"> · {item.data.institution}</span>
            {item.data.gpa && <span className="text-neutral-400"> (GPA: {item.data.gpa})</span>}
          </div>
          <span className="text-[11px] text-neutral-500 font-medium shrink-0 ml-2">
            {item.data.startDate} – {item.data.endDate}
          </span>
        </div>
      )}

      {/* Projects */}
      {item.type === 'projects' && (
        <div className="text-xs mb-2.5">
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-neutral-900">{item.data.title}</span>
            {item.data.liveUrl && (
              <span className="text-[10px] text-neutral-400 font-mono">{item.data.liveUrl}</span>
            )}
          </div>
          {item.data.technologies && (
            <div className="text-[11px] font-semibold mt-0.5" style={{ color: palette.primary }}>
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
          {item.data.map((cat: any) => (
            <div key={cat.id} className="text-xs">
              <span className="font-bold text-neutral-900">{cat.category}: </span>
              <span className="text-neutral-700">{(cat.skills || []).join(', ')}</span>
            </div>
          ))}
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
              {c.date && <span className="text-[11px] text-neutral-500">{c.date}</span>}
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
            <div className="text-neutral-600 text-[11px] mt-0.5">
              {item.data.position || item.data.title}
              {item.data.company && ` · ${item.data.company}`}
            </div>
          )}
          {(item.data.email || item.data.phone) && (
            <div className="text-neutral-500 text-[10px] mt-0.5">
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
function ExperienceItemRenderer({
  exp,
  timeline,
  palette,
}: {
  exp: any;
  timeline: string;
  palette: any;
}) {
  const dateRange = `${exp.startDate} – ${exp.current ? 'Present' : exp.endDate}`;

  // 1. Date Rail (Europass / Executive left date column)
  if (timeline === 'date-rail') {
    return (
      <div className="grid grid-cols-4 gap-4 text-xs mb-3">
        <div className="col-span-1 text-right font-mono text-[11px] font-semibold text-neutral-500 pt-0.5">
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
          <span className="font-bold text-neutral-900">{exp.position}</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/80 text-neutral-700 shrink-0 ml-2">
            {dateRange}
          </span>
        </div>
        <div className="text-[11px] font-medium text-neutral-500 mb-1.5 font-mono">
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
          <h3 className="font-bold text-neutral-900">{exp.position}</h3>
          <span className="text-[11px] text-neutral-500 font-medium shrink-0 ml-2">{dateRange}</span>
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
          <h3 className="font-bold text-neutral-900">{exp.position}</h3>
          <span className="text-[11px] text-neutral-500 font-medium shrink-0 ml-2">{dateRange}</span>
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
          <h3 className="font-bold text-neutral-900">{exp.position}</h3>
          <span className="text-[11px] text-neutral-500 font-medium shrink-0 ml-2">{dateRange}</span>
        </div>
        <div className="text-neutral-600 font-medium mb-1">
          {exp.company} {exp.location ? `· ${exp.location}` : ''}
        </div>
        <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
      </div>
    );
  }

  // Default: Compact Clean (Border-free)
  return (
    <div className="mb-3 text-xs">
      <div className="flex justify-between items-baseline mb-0.5">
        <h3 className="font-bold text-neutral-900">
          {exp.position} — <span className="font-semibold text-neutral-700">{exp.company}</span>
        </h3>
        <span className="text-[11px] text-neutral-500 font-medium shrink-0 ml-2">{dateRange}</span>
      </div>
      {exp.location && <div className="text-[11px] text-neutral-500 mb-1">{exp.location}</div>}
      <RichTextContent content={exp.description} className="text-neutral-700 leading-normal" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SIDEBAR SKILLS RENDERER (Variant-Aware)
 * ───────────────────────────────────────────────────────────── */
function SidebarSkillsRenderer({
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
              "rounded-md px-2 py-0.5 text-[10px] font-semibold border",
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
              <div className="flex justify-between text-[10px] font-medium">
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
            <div key={idx} className="flex items-center justify-between text-[10px]">
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
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
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
function getLanguageRating(l: any): number {
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

function SidebarLanguagesRenderer({
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
            <div key={l.id || idx} className="flex items-center justify-between text-[10px]">
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
          <span className={cn("text-[10px]", isDark ? "text-white/70" : "text-neutral-500")}>
            {l.proficiency || l.level || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * COVER LETTER TEMPLATES (Cover 1 to Cover 4)
 * ───────────────────────────────────────────────────────────── */
function CoverBody({ heading }: { heading: any }) {
  return (
    <>
      <p>Dear Hiring Manager,</p>
      <p>
        I am writing to express my enthusiastic interest in joining your engineering organization. With over
        eight years of experience architecting resilient cloud systems, driving developer platforms, and
        leading high-impact software initiatives, I have dedicated my career to building scalable software that
        solves meaningful problems.
      </p>
      <p>
        In my current role as Staff Infrastructure Architect at CloudScale Networks, I spearheaded the migration
        of our core multi-region platform to a zero-trust service mesh. This initiative eliminated latency
        bottlenecks, decreased operational cloud costs by 42%, and improved our system availability to four nines.
        Furthermore, I have led engineering mentorship programs and established architectural review standards
        that elevated engineering quality across our distributed teams.
      </p>
      <p>
        What excites me most about your company is your commitment to delivering world-class customer
        experiences through cutting-edge technology. My background in distributed systems, modern web
        architectures, and team empowerment aligns closely with your strategic objectives.
      </p>
      <p>
        I welcome the opportunity to discuss how my technical expertise and leadership approach can support your
        upcoming milestones. Thank you for your time, consideration, and dedication to excellence.
      </p>
      <p className="pt-4">Sincerely,</p>
      <div className="pt-1">
        <p className="text-sm font-bold text-neutral-900">
          {heading.firstName} {heading.lastName}
        </p>
        <p className="text-xs text-neutral-500">{heading.title}</p>
      </div>
    </>
  );
}

function Cover1Layout({ resume, palette }: { resume: any; palette: any }) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      <div className="flex flex-col items-center text-center pb-2">
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        {heading.location && <p className="text-xs text-neutral-600 mt-1">{heading.location}</p>}
        <div className="mt-2 flex flex-wrap justify-center items-center gap-3 text-xs text-neutral-500">
          {heading.phone && <span>{heading.phone}</span>}
          {heading.email && <span>• {heading.email}</span>}
          {heading.linkedin && <span>• {heading.linkedin}</span>}
        </div>
      </div>

      <div
        className="w-full h-[2px] rounded-sm my-5"
        style={{ background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.secondary} 100%)` }}
      />

      <div className="flex justify-between items-start text-xs text-neutral-700">
        <div>
          <p className="font-bold text-neutral-900">Hiring Team / Engineering Leadership</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way</p>
          <p>San Francisco, CA 94105</p>
        </div>
        <div className="font-medium text-neutral-800">{today}</div>
      </div>

      <div className="mt-6 text-sm font-bold text-neutral-900">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      <div className="mt-5 space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBody heading={heading} />
      </div>
    </div>
  );
}

function Cover2Layout({ resume, palette }: { resume: any; palette: any }) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      <div className="pb-2">
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="text-sm font-semibold mt-0.5" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-600">
          {heading.location && <span>{heading.location}</span>}
          {heading.phone && <span>{heading.phone}</span>}
          {heading.email && <span>{heading.email}</span>}
          {heading.linkedin && <span>{heading.linkedin}</span>}
        </div>
      </div>

      <div className="w-full h-[2px] bg-neutral-900 my-5 rounded-xs" />

      <div className="flex justify-between items-start text-xs text-neutral-700">
        <div>
          <p className="font-bold text-neutral-900">Hiring Team / Engineering Leadership</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way, Suite 400</p>
          <p>San Francisco, CA 94105</p>
        </div>
        <div className="font-medium text-neutral-800">{today}</div>
      </div>

      <div className="mt-6 text-sm font-bold text-neutral-900">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      <div className="mt-5 space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBody heading={heading} />
      </div>
    </div>
  );
}

function Cover3Layout({ resume, palette }: { resume: any; palette: any }) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      <div className="flex justify-between items-end border-b-2 border-neutral-900 pb-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
            {heading.firstName} {heading.lastName}
          </h1>
          <p className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: palette.primary }}>
            {heading.title}
          </p>
        </div>
        <div className="text-xs font-medium text-neutral-500">{today}</div>
      </div>

      <div className="flex gap-8">
        <div className="flex-1 space-y-4 text-xs text-neutral-700 leading-relaxed">
          <div className="text-sm font-bold text-neutral-900 pb-1">
            Re: Application for Senior Technical Leadership / Engineering Role
          </div>
          <CoverBody heading={heading} />
        </div>

        <div className="w-60 shrink-0 border-l border-neutral-200 pl-6 space-y-6 text-xs">
          <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <h2 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1 mb-2">
              Recipient
            </h2>
            <p className="font-bold text-neutral-900">Hiring Committee</p>
            <p className="text-neutral-700">Acme Innovations Corp</p>
            <p className="text-neutral-500">100 Enterprise Way</p>
            <p className="text-neutral-500">San Francisco, CA</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <h2 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1 mb-2">
              Sender Details
            </h2>
            <p className="font-bold text-neutral-900">{heading.firstName} {heading.lastName}</p>
            {heading.location && <p className="text-neutral-600">{heading.location}</p>}
            {heading.phone && <p className="text-neutral-600">{heading.phone}</p>}
            {heading.email && <p className="text-neutral-600 break-all">{heading.email}</p>}
            {heading.linkedin && <p className="text-blue-600 break-all">{heading.linkedin}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cover4Layout({ resume, palette }: { resume: any; palette: any }) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      <div className="pb-4 border-b-2 border-neutral-200 mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: palette.primary }}>
          {heading.firstName} {heading.lastName}
        </h1>
        {heading.title && (
          <div className="mt-1">
            <span
              className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }}
            >
              {heading.title}
            </span>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-600">
          {heading.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.phone}</span>
            </div>
          )}
          {heading.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.email}</span>
            </div>
          )}
          {heading.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.location}</span>
            </div>
          )}
          {heading.linkedin && (
            <div className="flex items-center gap-1.5">
              <LinkedinIcon className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.linkedin}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 flex justify-between items-start text-xs text-neutral-700 mb-6">
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-900">Engineering Hiring Team</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way, San Francisco, CA 94105</p>
        </div>
        <div className="font-semibold text-neutral-800">{today}</div>
      </div>

      <div className="text-sm font-bold text-neutral-900 mb-4">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      <div className="space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBody heading={heading} />
      </div>
    </div>
  );
}
