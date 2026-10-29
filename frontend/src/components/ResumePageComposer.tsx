/**
 * Measured A4 composer for the smart resume renderer.
 *
 * The source contains an identity header and independent, ordered columns of
 * `[data-resume-block]` elements. We measure real browser layout on unscaled
 * A4 sheets, move whole blocks between sheets, and split only blocks that are
 * too tall for an otherwise empty column. DOM Ranges preserve rich-text markup
 * and every character of oversized paragraphs/list items. No overflow is hidden.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getTemplateDirection } from '@/cv-templates/templateUtils';

export interface ResumeWatermark {
  enableFreeWatermark: boolean;
  watermarkText: string;
  opacity?: number;
  position?: string;
}

interface ResumePageComposerProps {
  templateId: string;
  language?: string;
  values?: Record<string, unknown>;
  watermark?: ResumeWatermark;
  enabled?: boolean;
  children: ReactNode;
  onComposed?: (detail: { templateId: string; pages: number }) => void;
  onError?: (detail: { templateId: string; message: string }) => void;
}

interface PageColumn {
  element: HTMLElement;
  pending: HTMLElement[];
}

function textNodes(element: HTMLElement): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** A DOM Range at a UTF-16 offset, preserving ancestor markup in each fragment. */
function boundary(nodes: Text[], position: number): [Text, number] {
  let remaining = position;
  for (const node of nodes) {
    if (remaining <= node.length) return [node, remaining];
    remaining -= node.length;
  }
  const last = nodes[nodes.length - 1];
  return [last, last.length];
}

function fragment(block: HTMLElement, nodes: Text[], start: number, end: number): HTMLElement {
  const range = document.createRange();
  const [startNode, startOffset] = boundary(nodes, start);
  const [endNode, endOffset] = boundary(nodes, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const result = block.cloneNode(false) as HTMLElement;
  result.appendChild(range.cloneContents());
  return result;
}

function columnOverflows(column: HTMLElement): boolean {
  return column.scrollHeight > column.clientHeight + 1 || column.scrollWidth > column.clientWidth + 1;
}

/**
 * Find the largest fitting prefix by measured layout, not an estimated number
 * of characters per line. A split normally ends at a word boundary; a single
 * long unbroken token may be split between characters instead of being lost.
 */
function splitToFit(block: HTMLElement, column: HTMLElement): [HTMLElement, HTMLElement] | null {
  const nodes = textNodes(block);
  if (!nodes.length) return null;
  const contents = nodes.map(node => node.data).join('');
  if (contents.length < 2) return null;
  const heading = block.querySelector('h2');
  const headingLength = heading?.textContent?.length || 0;
  const minimum = Math.min(contents.length - 1, headingLength + (heading ? 1 : 0));
  let low = Math.max(1, minimum);
  let high = contents.length - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = fragment(block, nodes, 0, middle);
    column.appendChild(candidate);
    const fits = !columnOverflows(column);
    candidate.remove();
    if (fits) { best = middle; low = middle + 1; } else high = middle - 1;
  }
  if (best < minimum || best === 0) return null;
  const whitespace = contents.lastIndexOf(' ', best);
  if (whitespace > minimum && whitespace >= best - 80) best = whitespace + 1;
  // Do not split a UTF-16 surrogate pair.
  if (best > 0 && best < contents.length && /[\uD800-\uDBFF]/.test(contents[best - 1]) && /[\uDC00-\uDFFF]/.test(contents[best])) best--;
  return [fragment(block, nodes, 0, best), fragment(block, nodes, best, contents.length)];
}

function makePage(source: HTMLElement, pageNumber: number, fullName: string, watermark?: ResumeWatermark): HTMLElement {
  const page = document.createElement('article');
  page.className = 'resume-page smart-resume-page page-sheet';
  page.setAttribute('style', source.getAttribute('style') || '');
  page.dataset.templateId = source.dataset.templateId || '';
  page.dataset.archetype = source.dataset.archetype || '';
  page.dataset.layoutFamily = source.dataset.layoutFamily || '';
  page.dataset.skillVariant = source.dataset.skillVariant || '';
  page.dataset.headerStyle = source.dataset.headerStyle || '';
  page.dataset.contactLayout = source.dataset.contactLayout || '';
  page.dataset.dividerStyle = source.dataset.dividerStyle || '';
  page.dataset.timelineStyle = source.dataset.timelineStyle || '';
  page.dataset.accentBar = source.dataset.accentBar || 'false';
  page.dataset.pageNumber = String(pageNumber);
  const documentLabel = source.dataset.templateId?.startsWith('Cover') ? 'Cover letter' : 'Resume';
  page.setAttribute('aria-label', `${documentLabel} page ${pageNumber}`);
  if (pageNumber === 1) {
    const header = source.querySelector<HTMLElement>('[data-resume-header]');
    if (header) page.appendChild(header.cloneNode(true));
  } else {
    const header = document.createElement('header');
    header.className = 'resume-continuation-header';
    const who = document.createElement('span');
    const continuationLabel = documentLabel === 'Cover letter' ? 'Cover Letter' : 'Curriculum Vitae';
    who.textContent = fullName ? `${fullName} — ${continuationLabel}` : continuationLabel;
    const number = document.createElement('span');
    number.textContent = `Page ${pageNumber}`;
    header.append(who, number);
    page.appendChild(header);
  }
  const columns = source.querySelector<HTMLElement>('[data-resume-columns]');
  if (!columns) throw new Error('Resume layout has no content columns');
  const shell = columns.cloneNode(false) as HTMLElement;
  for (const column of Array.from(columns.children)) shell.appendChild(column.cloneNode(false));
  page.appendChild(shell);
  const footer = document.createElement('footer');
  footer.className = 'resume-page-footer';
  footer.textContent = `Page ${pageNumber}`;
  page.appendChild(footer);
  if (watermark?.enableFreeWatermark && watermark.watermarkText.trim()) {
    const overlay = document.createElement('div');
    overlay.className = 'resume-watermark';
    overlay.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = watermark.watermarkText;
    label.style.opacity = String(Math.min(0.4, Math.max(0.05, Number(watermark.opacity) || 0.18)));
    label.style.transform = watermark.position === 'diagonal' ? 'rotate(-32deg)' : 'none';
    overlay.appendChild(label);
    page.appendChild(overlay);
  }
  return page;
}

export default function ResumePageComposer({
  templateId, language = 'en', values, watermark, enabled = false, children, onComposed, onError,
}: ResumePageComposerProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef('');
  const [warning, setWarning] = useState<string | null>(null);
  const callbacks = useRef({ onComposed, onError });
  callbacks.current = { onComposed, onError };

  const compose = useCallback(() => {
    const wrapper = sourceRef.current;
    const host = pagesRef.current;
    const source = wrapper?.querySelector<HTMLElement>('[data-resume-source]');
    if (!enabled || !wrapper || !host || !source) return;
    // The print stylesheet hides the measurement source and scratch area.
    // Recomposition there would measure zero-sized columns and destroy the
    // already-composed sheets while a print dialog/PDF is being produced.
    if (window.matchMedia('print').matches) return;
    const sourceColumns = source.querySelector<HTMLElement>('[data-resume-columns]');
    if (!sourceColumns) return;
    const signature = [templateId, language, source.outerHTML, source.scrollHeight, document.fonts?.status, JSON.stringify(watermark)].join('|');
    if (signatureRef.current === signature) return;
    const fullName = String(values?.fullName || '').trim();
    const scratch = document.createElement('div');
    scratch.className = 'resume-compose-scratch';
    document.body.appendChild(scratch);
    try {
      host.dataset.composeState = 'composing';
      const queues = Array.from(sourceColumns.children).map(column =>
        Array.from(column.children).map(child => child.cloneNode(true) as HTMLElement));
      const pages: HTMLElement[] = [];
      let first = true;
      do {
        const page = makePage(source, pages.length + 1, fullName, watermark);
        scratch.appendChild(page);
        const columnElements = Array.from(page.querySelector<HTMLElement>('[data-resume-columns]')!.children) as HTMLElement[];
        const columns: PageColumn[] = columnElements.map((element, index) => ({ element, pending: queues[index] }));
        let placed = 0;
        for (const { element, pending } of columns) {
          while (pending.length) {
            const block = pending[0];
            element.appendChild(block);
            if (!columnOverflows(element)) {
              pending.shift();
              placed++;
              continue;
            }
            block.remove();
            // Keep an ordinary item, including its heading, together on the next page.
            if (element.children.length) break;
            const pieces = splitToFit(block, element);
            if (pieces) {
              element.appendChild(pieces[0]);
              pending[0] = pieces[1];
              placed++;
            }
            break;
          }
        }
        // A very tall identity header can leave no room on page one. On later
        // pages an unsplittable object is deliberately left visible and flagged,
        // rather than clipped or repeatedly creating blank sheets.
        if (!placed && !first && queues.some(queue => queue.length)) {
          const index = queues.findIndex(queue => queue.length);
          columnElements[index].appendChild(queues[index].shift()!);
          page.dataset.overflow = 'true';
        }
        pages.push(page);
        first = false;
      } while (queues.some(queue => queue.length));

      pages.forEach((page, index) => {
        page.dataset.totalPages = String(pages.length);
        const footer = page.querySelector<HTMLElement>('.resume-page-footer');
        if (footer) footer.textContent = `Page ${index + 1} of ${pages.length}`;
      });
      host.replaceChildren(...pages);
      signatureRef.current = signature;
      for (const page of pages) {
        if (page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) page.dataset.overflow = 'true';
      }
      const hasOverflow = pages.some(page => page.dataset.overflow === 'true');
      const overflowMessage = 'Some content is too large to fit an A4 page. Please adjust it before printing or exporting.';
      host.dataset.composeState = hasOverflow ? 'overflow' : 'ready';
      setWarning(hasOverflow ? overflowMessage : null);
      wrapper.classList.remove('resume-source-fallback');
      wrapper.setAttribute('aria-hidden', 'true');
      if (location.pathname.startsWith('/export/')) {
        const imagesReady = Array.from(source.querySelectorAll('img')).every(image => image.complete);
        if (hasOverflow) {
          delete document.documentElement.dataset.exportReady;
          document.documentElement.dataset.exportError = overflowMessage;
        } else if (imagesReady && (!document.fonts || document.fonts.status === 'loaded')) {
          delete document.documentElement.dataset.exportError;
          document.documentElement.dataset.exportReady = 'true';
        } else {
          delete document.documentElement.dataset.exportReady;
        }
      }
      if (hasOverflow) {
        callbacks.current.onError?.({ templateId, message: overflowMessage });
        document.dispatchEvent(new CustomEvent('resume-compose-error', { detail: { templateId, message: overflowMessage } }));
      } else {
        document.dispatchEvent(new CustomEvent('resume-composed', { detail: { templateId, pages: pages.length } }));
        callbacks.current.onComposed?.({ templateId, pages: pages.length });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      signatureRef.current = '';
      host.replaceChildren();
      host.dataset.composeState = 'error';
      host.dataset.composeError = message;
      setWarning(`Could not compose A4 pages: ${message}`);
      if (location.pathname.startsWith('/export/')) {
        delete document.documentElement.dataset.exportReady;
        document.documentElement.dataset.exportError = message;
      }
      wrapper.classList.add('resume-source-fallback');
      wrapper.removeAttribute('aria-hidden');
      callbacks.current.onError?.({ templateId, message });
      document.dispatchEvent(new CustomEvent('resume-compose-error', { detail: { templateId, message } }));
    } finally {
      scratch.remove();
    }
  }, [enabled, templateId, language, values, watermark]);

  useLayoutEffect(() => {
    if (!enabled) { signatureRef.current = ''; setWarning(null); return; }
    const source = sourceRef.current;
    if (!source) return;
    let active = true;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compose);
    };
    const remeasure = () => { if (active) { signatureRef.current = ''; schedule(); } };
    schedule();
    const mutation = new MutationObserver(schedule);
    mutation.observe(source, { childList: true, subtree: true, characterData: true, attributes: true });
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(source);
    source.addEventListener('load', remeasure, true);
    source.addEventListener('error', remeasure, true);
    window.addEventListener('resize', schedule);
    const printMedia = window.matchMedia('print');
    const onPrintChange = () => { if (!printMedia.matches) remeasure(); };
    printMedia.addEventListener('change', onPrintChange);
    document.fonts?.addEventListener('loadingdone', remeasure);
    document.fonts?.addEventListener('loadingerror', remeasure);
    const fontsWereLoading = document.fonts?.status === 'loading';
    document.fonts?.ready.then(fontsWereLoading ? remeasure : schedule).catch(() => { if (active) timer = setTimeout(remeasure, 0); });
    return () => {
      active = false;
      // A dependency change can replace the source/host and clear export state;
      // force the next effect to compose and publish readiness again.
      signatureRef.current = '';
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      mutation.disconnect();
      resize?.disconnect();
      source.removeEventListener('load', remeasure, true);
      source.removeEventListener('error', remeasure, true);
      window.removeEventListener('resize', schedule);
      printMedia.removeEventListener('change', onPrintChange);
      document.fonts?.removeEventListener('loadingdone', remeasure);
      document.fonts?.removeEventListener('loadingerror', remeasure);
      if (location.pathname.startsWith('/export/')) {
        delete document.documentElement.dataset.exportReady;
        delete document.documentElement.dataset.exportError;
      }
    };
  }, [compose, enabled]);

  if (!enabled) return <>{children}</>;
  return (
    <div className="resume-document" dir={getTemplateDirection(language)} data-template-id={templateId}>
      <div ref={sourceRef} className="resume-composer-source" aria-hidden="true">{children}</div>
      {warning && <p role="alert" className="resume-compose-warning">{warning}</p>}
      <div ref={pagesRef} className="resume-pages" data-compose-state="pending" />
    </div>
  );
}
