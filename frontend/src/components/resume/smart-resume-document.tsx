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
import { cn } from '@/lib/utils';
import type { TemplateMeta } from '@/lib/template-catalog';
import { partitionResumeContent, type PartitionedPage } from '@/lib/smart-partitioner';
import { getLayoutSpec } from '@/lib/template-layouts';
import { TemplatePageOne } from './smart-layout-families';
import { FlowItemRenderer, LinkedinIcon, Mail, MapPin, Phone } from './smart-render-primitives';

// Re-exported for callers/tests that historically imported the sanitizer sink
// from the document module.
export { RichTextContent } from './smart-render-primitives';

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
 *
 * DIR-008: page one is composed by the template's registered layout family
 * (see `template-layouts.ts`). There is no archetype switch here and no
 * generic fallback — an unknown template id throws before render.
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
  const layout = getLayoutSpec(meta.id);
  return (
    <TemplatePageOne
      resume={resume}
      meta={meta}
      palette={palette}
      page={page}
      fullName={fullName}
      layout={layout}
    />
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
