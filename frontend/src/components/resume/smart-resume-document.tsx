/** Shared preview, public-view and export document. */
import { useMemo } from 'react';
import type { TemplateMeta } from '@/lib/template-catalog';
import { tryGetTemplateMeta } from '@/lib/template-catalog';
import { getLayoutSpec } from '@/lib/template-layouts';
import { normalizeDocumentResume, text, getContrastTextColor, readableAccent } from '@/cv-templates/templateUtils';
import ResumePageComposer, { type ResumeWatermark } from '@/components/ResumePageComposer';
import { ComposableResumeLayout } from './smart-layout-families';
import { RichTextContent } from './smart-render-primitives';

export { RichTextContent } from './smart-render-primitives';

export interface SmartResumeProps {
  // The view-model adapter is the boundary for legacy API / builder payloads.
  resume: unknown;
  meta: TemplateMeta;
  palette?: { primary: string; secondary: string; soft?: string; text?: string };
  density?: 'compact' | 'standard' | 'spacious';
  isPrint?: boolean;
  watermark?: ResumeWatermark;
}

const DOCUMENT_STYLES = `
.resume-composer-source { position:fixed; left:-10000px; top:0; width:210mm; visibility:hidden; pointer-events:none; }
.resume-composer-source.resume-source-fallback { position:static; visibility:visible; pointer-events:auto; }
.resume-compose-scratch { position:fixed; left:-10000px; top:0; width:210mm; visibility:hidden; pointer-events:none; }
.resume-compose-warning { max-width:210mm; margin:0 auto 12px; padding:10px; color:#7f1d1d; background:#fef2f2; border:1px solid #fca5a5; font:600 13px sans-serif; }
.resume-pages { display:flex; flex-direction:column; align-items:center; gap:24px; }
.resume-page { position:relative; width:210mm; height:297mm; min-height:297mm; max-height:none; box-sizing:border-box; display:flex; flex-direction:column; overflow:visible; background:white; color:#172033; box-shadow:0 8px 25px rgba(15,23,42,.16); font-size:12.5px; line-height:1.45; }
.resume-page *, [data-resume-source] * { box-sizing:border-box; min-width:0; overflow-wrap:anywhere; word-break:normal; }
.resume-identity { flex:none; display:flex; align-items:center; gap:18px; padding:26px 34px 20px; border-bottom:2px solid var(--resume-primary); color:#172033; }
.resume-page[data-template-id='Cv1'] .resume-identity { background:#f8fafc; }
.resume-page[data-template-id='Cv34'] .resume-identity { background:white; color:#172033; border-bottom:5px solid transparent; border-image:linear-gradient(90deg, var(--resume-primary), var(--resume-secondary), var(--resume-tertiary)) 1; }
.resume-page[data-template-id='Cv34'] .resume-identity h1 { color:var(--resume-accent-text); }
.resume-identity h1 { margin:0; color:inherit; font-size:var(--resume-name-size); font-weight:750; line-height:1.12; }
.resume-identity p { margin:4px 0 0; }
.resume-identity-executive-banner, .resume-identity-tech-grid { background:var(--resume-primary); color:var(--resume-header-text); border:0; }
.resume-identity-centered { justify-content:center; text-align:center; }
.resume-identity-compact-euro { border-left:8px solid var(--resume-primary); background:#f8fafc; }
.resume-identity-minimal-ats { border-bottom:1px solid #334155; }
.resume-page[data-template-id='Cover1'] .resume-identity { text-align:center; border-bottom:4px solid var(--resume-primary); }
.resume-page[data-template-id='Cover2'] .resume-identity { border-bottom:2px solid #172033; }
.resume-page[data-template-id='Cover3'] .resume-identity { border-bottom:2px solid var(--resume-primary); }
.resume-page[data-template-id='Cover4'] .resume-identity { background:var(--resume-primary); color:var(--resume-header-text); border-bottom:4px solid var(--resume-secondary); }
.resume-page[data-template-id='Cover1'] .resume-contact-row { justify-content:center; }
.resume-page[data-header-style='centered'] .resume-identity, .resume-page[data-header-style='letterhead'] .resume-identity { justify-content:center; text-align:center; }
.resume-page[data-header-style='bracket'] .resume-identity { border-inline-start:6px solid var(--resume-primary); }
.resume-page[data-accent-bar='true']:not([data-template-id='Cv34']) .resume-identity { border-bottom:4px solid var(--resume-secondary); }
.resume-page[data-contact-layout='stack'] .resume-contact-row { flex-direction:column; align-items:start; }
.resume-page[data-contact-layout='grid'] .resume-contact-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.resume-identity-copy { flex:1; }
.resume-occupation { font-weight:650; font-size:12px; }
.resume-contact-row { display:flex; flex-wrap:wrap; gap:3px 14px; margin-top:9px; font-size:11px; }
.resume-contact-row a, .resume-contact-row span { color:inherit; }
.resume-photo { width:70px; height:70px; flex:none; object-fit:cover; }
.resume-photo-circle { border-radius:50%; } .resume-photo-rounded { border-radius:10px; }
.resume-initials { width:70px; height:70px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--resume-primary); color:var(--resume-header-text); font-size:24px; font-weight:700; }
.resume-columns { display:flex; flex:1 1 0; min-height:0; width:100%; }
.resume-column { height:100%; min-height:0; overflow:visible; padding:20px 30px; }
.resume-main { flex:1 1 0; }
.resume-rail { flex:0 0 var(--resume-rail-width); background:var(--resume-rail-bg); color:var(--resume-rail-text); padding:20px 20px; }
.resume-block { padding:0 0 var(--resume-block-space); }
.resume-block h2 { margin:0 0 7px; font-size:11px; line-height:1.3; font-weight:750; letter-spacing:.08em; text-transform:uppercase; color:var(--resume-accent-text); border-bottom:1px solid currentColor; padding-bottom:3px; }
.resume-rail .resume-block h2 { color:inherit; }
.resume-title-bar, .resume-title-bracket { border-left:3px solid currentColor; padding-left:7px; }
.resume-title-double { border-bottom:3px double currentColor !important; }
.resume-title-plain, .resume-title-micro { border:0 !important; }
.resume-page[data-divider-style='double-line'] .resume-block h2 { border-bottom:3px double currentColor; }
.resume-page[data-divider-style='solid-thick'] .resume-block h2 { border-bottom:2px solid currentColor; }
.resume-page[data-divider-style='left-bar'] .resume-block h2 { border-inline-start:3px solid currentColor; padding-inline-start:7px; }
.resume-block h3 { font-size:12.5px; line-height:1.35; font-weight:700; margin:0; color:inherit; }
.resume-block p { margin:0 0 4px; } .resume-block p:last-child { margin-bottom:0; }
.resume-block ul, .resume-block ol { padding-left:18px; margin:3px 0; }
.resume-block ul { list-style:disc; } .resume-block ol { list-style:decimal; }
.resume-block a { color:inherit; text-decoration:underline; }
.resume-muted { color:inherit; }
.resume-role { display:flex; flex-direction:row-reverse; gap:10px; justify-content:space-between; }
.resume-role-details { flex:1; } .resume-role-date { flex:0 1 auto; font-size:11px; text-align:right; }
.resume-page[data-timeline-style='subtle-line'] .resume-role-details, .resume-page[data-timeline-style='modern-node'] .resume-role-details { border-inline-start:1px solid currentColor; padding-inline-start:9px; }
.resume-page[data-timeline-style='code-tag'] .resume-role-date { font-family:monospace; }
.resume-page[data-timeline-style='accent-bullet'] .resume-role-details h3::before { content:'• '; color:var(--resume-accent-text); }
.resume-role[data-date-rail=true] { display:grid; grid-template-columns:minmax(75px, 25%) 1fr; gap:14px; }
.resume-role[data-date-rail=true] .resume-role-date { text-align:left; font-weight:600; }
.resume-project-card { padding:9px 11px; border:1px solid #cbd5e1; border-inline-start:3px solid var(--resume-secondary); border-radius:5px; }
.resume-skill-list { display:flex; flex-wrap:wrap; gap:5px; margin-top:3px; }
.resume-skill-list .resume-skill { display:inline-block; border:1px solid currentColor; border-radius:var(--resume-badge-radius); padding:1px 6px; }
.resume-page[data-skill-variant='pills'] .resume-skill { border-radius:999px; }
.resume-page[data-skill-variant='dots'] .resume-skill::before { content:'• '; }
.resume-page[data-skill-variant='bars'] .resume-skill { border-inline-start:3px solid currentColor; }
.resume-contact-list > div { margin-bottom:3px; }
.resume-continuation-header { display:flex; justify-content:space-between; gap:14px; flex:none; margin:0 30px; padding:18px 0 9px; border-bottom:1px solid #cbd5e1; font-size:11px; font-weight:650; }
.resume-continuation-header span:last-child { flex:none; }
.resume-watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; pointer-events:none; z-index:1; }
.resume-watermark span { color:#0f172a; font:900 38px sans-serif; letter-spacing:.2em; text-transform:uppercase; white-space:nowrap; user-select:none; }
.resume-page-footer { flex:none; border-top:1px solid #e2e8f0; padding:7px 30px; text-align:right; color:#475569; font-size:10px; }
@media print {
  @page { size:A4; margin:0; }
  html, body { margin:0 !important; padding:0 !important; background:white !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .resume-composer-source, .resume-compose-scratch { display:none !important; }
  .resume-pages { display:block !important; }
  .resume-page.page-sheet { width:210mm !important; height:297mm !important; min-height:297mm !important; max-height:297mm !important; margin:0 !important; box-shadow:none !important; break-after:page !important; page-break-after:always !important; }
  .resume-page.page-sheet:last-child { break-after:auto !important; page-break-after:auto !important; }
  #printable-document, [data-preview-scale] { transform:none !important; zoom:1 !important; }
  main:has(> #printable-document) { display:block !important; overflow:visible !important; padding:0 !important; }
  body:has([data-testid="cuba-preview-modal"]) > :not([data-testid="cuba-preview-modal"]) { display:none !important; }
  [data-testid="cuba-preview-modal"] { position:static !important; transform:none !important; width:auto !important; max-width:none !important; height:auto !important; max-height:none !important; overflow:visible !important; display:block !important; padding:0 !important; border:0 !important; }
  [data-preview-controls], [data-testid="cuba-preview-modal"] > button { display:none !important; }
  [data-preview-canvas] { display:block !important; overflow:visible !important; padding:0 !important; background:white !important; }
}
`;

export function SmartResumeDocument({ resume, meta, palette, density, isPrint = false, watermark }: SmartResumeProps) {
  const model = useMemo(() => normalizeDocumentResume(resume), [resume]);
  const resolved = tryGetTemplateMeta(meta?.id || '');
  const fullName = [model.heading.firstName, model.heading.lastName].filter(Boolean).join(' ').trim();
  const composerValues = useMemo(() => ({ fullName }), [fullName]);
  const raw = resume && typeof resume === 'object' ? resume as Record<string, unknown> : {};
  // The export route supplies its locale in the URL after an upstream model
  // normalizer has removed transport-only fields.
  const routeLanguage = typeof window !== 'undefined' ? window.location.pathname.match(/^\/export\/[^/]+\/[^/]+\/([^/]+)$/)?.[1] : '';
  const language = text(raw.language) || routeLanguage || 'en';
  if (!resolved) return <div role="alert">Unsupported template layout. Choose a registered template to preview this resume.</div>;
  const effectivePalette = {
    primary: palette?.primary || resolved.primary,
    secondary: palette?.secondary || resolved.secondary,
    soft: palette?.soft,
    text: palette?.text,
  };

  if (resolved.id.startsWith('Cover')) {
    // The separate cover builder keeps its own persistence and UI. This export
    // uses only supplied candidate/recipient fields and the actual letter body.
    const body = text(model.letterBody || raw.letterBody || raw.body);
    const details = model.coverDetails;
    const recipient = [details?.recipientName, details?.companyName, details?.companyAddress,
      [details?.companyCity, details?.companyPostalCode].filter(Boolean).join(' ')].filter(Boolean);
    const contacts = [model.heading.email, model.heading.phone, details?.candidateAddress,
      model.heading.location].filter(Boolean);
    const recipientBlock = recipient.length ? (
      <section className="resume-block" data-resume-block="true" data-section="recipient">
        <h2>Recipient</h2>{recipient.map((line, index) => <div key={index}>{line}</div>)}
      </section>
    ) : null;
    const isSplitCover = resolved.id === 'Cover3';
    const coverStyle = {
      fontFamily: resolved.font || "'Inter', sans-serif",
      '--resume-primary': effectivePalette.primary,
      '--resume-secondary': effectivePalette.secondary,
      '--resume-accent-text': readableAccent(effectivePalette.primary),
      '--resume-header-text': getContrastTextColor(effectivePalette.primary),
      '--resume-rail-bg': '#f1f5f9', '--resume-rail-text': '#172033', '--resume-rail-width': '30%',
      '--resume-name-size': '29px', '--resume-block-space': '12px',
    } as React.CSSProperties;
    return (
      <div className="smart-resume-document" data-is-print={isPrint}>
        <style>{DOCUMENT_STYLES}</style>
        <ResumePageComposer enabled templateId={resolved.id} values={composerValues} language={language} watermark={watermark}>
          <div data-resume-source="true" data-template-id={resolved.id} data-archetype={resolved.archetype} data-layout-family={resolved.archetype} style={coverStyle}>
            <header className="resume-identity" data-resume-header="true">
              <div className="resume-identity-copy">
                <h1>{fullName || 'Cover letter'}</h1>
                {model.heading.title && <p className="resume-occupation">{model.heading.title}</p>}
                {contacts.length > 0 && <div className="resume-contact-row">{contacts.map((contact, index) => <span key={index}>{contact}</span>)}</div>}
              </div>
            </header>
            <div className="resume-columns" data-resume-columns="true" data-sidebar-position={isSplitCover ? 'right' : 'none'}>
              <main className="resume-column resume-main" data-resume-column="main">
                {!isSplitCover && recipientBlock}
                {details?.jobTitle && <section className="resume-block" data-resume-block="true"><p>Re: {details.jobTitle}</p></section>}
                <section className="resume-block" data-resume-block="true" data-section="letter">{body ? <RichTextContent content={body} /> : <p>No cover letter body is available in this export.</p>}</section>
              </main>
              {isSplitCover && <aside className="resume-column resume-rail" data-resume-column="rail">{recipientBlock}</aside>}
            </div>
          </div>
        </ResumePageComposer>
      </div>
    );
  }
  const layout = getLayoutSpec(resolved.id);
  return (
    <div className="smart-resume-document" data-is-print={isPrint}>
      <style>{DOCUMENT_STYLES}</style>
      <ResumePageComposer enabled templateId={resolved.id} values={composerValues} language={language} watermark={watermark}>
        <ComposableResumeLayout resume={model} meta={resolved} layout={layout} palette={effectivePalette} fullName={fullName} density={density || resolved.density || layout.density} />
      </ResumePageComposer>
    </div>
  );
}
