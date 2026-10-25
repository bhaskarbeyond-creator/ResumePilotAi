/**
 * ResumePageComposer — True A4 Multi-Page Document Engine (TypeScript Port)
 *
 * Ported from src/components/ResumePageComposer.jsx with full feature parity:
 * - Partitions rendered templates into discrete 210 x 297 mm `.resume-page` sheets
 * - Two-column layouts: first-page sidebar strategy; continuation pages use full A4 width
 * - Section atomicity: blocks that exceed page boundaries move whole or split cleanly with `(continued)` labels
 * - Guarantee 1:1 on-screen to print pagination (`break-after: page`)
 * - MutationObserver + font/image settling for accurate composition
 * - Reflow correction passes for post-render overflow fixing
 *
 * Usage:
 * ```tsx
 * <ResumePageComposer
 *   templateId="1"
 *   language="en"
 *   values={resumeData}
 *   enabled={true}
 * >
 *   <TemplateComponent resume={resumeData} palette={activePalette} />
 * </ResumePageComposer>
 * ```
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { getTemplateDirection } from '@/cv-templates/templateUtils';

const PAGE_H = '297mm';
const SIDEBAR_HINT = /(^|[-_\s])(sidebar|aside|profile([-_\s]?(section|panel|column))?|contact([-_\s]?(section|panel|column))?)$|(?<![\w])left([-_ ]?side)?$/i;

interface ComposeOptions {
  blocks: HTMLElement[];
  layout: ColumnLayout | null;
  flowRoot: HTMLElement | null;
  values: Record<string, unknown>;
  scratch: HTMLElement;
  boardStyle: BoardStyle;
  board: HTMLElement;
}

interface ColumnLayout {
  wrapper: HTMLElement | null;
  row: HTMLElement;
  sidebar: HTMLElement;
  main: HTMLElement;
}

interface BoardStyle {
  fontFamily: string;
  color: string;
  background: string;
}

interface ComposeResult {
  pages: HTMLElement[];
  overflowLeaves: OverflowLeaf[];
}

interface OverflowLeaf {
  page: number;
  cls: string;
}

interface ResumePageComposerProps {
  templateId: string;
  language?: string;
  values?: Record<string, unknown>;
  enabled?: boolean;
  children: React.ReactNode;
  onComposed?: (detail: { templateId: string; pages: number }) => void;
  onError?: (detail: { templateId: string; message: string }) => void;
}

interface BlockEntry {
  el: HTMLElement;
  continued: boolean;
}

function visibleChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && getComputedStyle(child).display !== 'none'
  );
}

function isHeaderElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  const cls = String(el.className || '').toLowerCase();
  const id = String(el.id || '').toLowerCase();
  return (
    tag === 'header' ||
    /header|cv\d+-head\b|top-head|name-title|diagonal-header/.test(cls) ||
    /header/.test(id)
  );
}

function looksLikeSidebar(el: HTMLElement | null, boardWidth: number): boolean {
  if (!el) return false;
  const name = `${el.className || ''} ${el.id || ''}`;
  if (SIDEBAR_HINT.test(name)) return true;
  if (String(el.className || '').endsWith('Left')) return true;
  const cs = getComputedStyle(el);
  const width = el.getBoundingClientRect().width;
  if (width > 0 && boardWidth > 0 && width < boardWidth * 0.45 && cs.flexGrow === '0') return true;
  return false;
}

function findColumnLayout(board: HTMLElement): ColumnLayout | null {
  const boardWidth = board.getBoundingClientRect().width;
  const boardHeight = board.getBoundingClientRect().height || 1;
  const candidates: Array<{ container: HTMLElement; depth: number; height: number }> = [];
  const layoutKids = (container: HTMLElement) =>
    visibleChildren(container).filter((el) => !String(el.className || '').includes('resume-'));

  const add = (container: HTMLElement, depth: number) => {
    if (!container || isHeaderElement(container)) return;
    const cs = getComputedStyle(container);
    const isFlexRow = cs.display === 'flex' && (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
    const isGrid = cs.display === 'grid';
    const kids = layoutKids(container);
    if (kids.length < 2) return;
    const rect = container.getBoundingClientRect();
    if (isFlexRow || isGrid) {
      candidates.push({ container, depth, height: rect.height });
      return;
    }
    for (let i = 0; i < kids.length - 1; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const ra = kids[i].getBoundingClientRect();
        const rb = kids[j].getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) < 24 && Math.max(ra.height, rb.height) >= boardHeight * 0.25) {
          candidates.push({ container, depth, height: rect.height });
          return;
        }
      }
    }
  };

  add(board, 0);
  for (const child of board.children) {
    add(child as HTMLElement, 1);
    for (const grandchild of (child as HTMLElement).children || []) {
      add(grandchild as HTMLElement, 2);
      for (const greatGrandchild of (grandchild as HTMLElement).children || []) {
        add(greatGrandchild as HTMLElement, 3);
      }
    }
  }

  candidates.sort((a, b) => b.height - a.height);

  for (const { container, height } of candidates) {
    if (height < 150 && height < boardHeight * 0.2) continue;
    const kids = layoutKids(container);
    if (kids.length >= 2 && kids.some((el) => looksLikeSidebar(el, boardWidth))) {
      const sidebar = kids.find((el) => looksLikeSidebar(el, boardWidth));
      const main = kids.find((el) => el !== sidebar);
      if (sidebar && main) {
        let realWrapper: HTMLElement | null = null;
        for (const child of board.children) {
          if (child === container || child.contains(container)) {
            realWrapper = child as HTMLElement;
            break;
          }
        }
        return { wrapper: realWrapper, row: container, sidebar, main };
      }
    }
  }
  return null;
}

function findFlowRootAndBlocks(
  board: HTMLElement,
  layout: ColumnLayout | null
): { wrapper: HTMLElement | null; flowRoot: HTMLElement; blocks: HTMLElement[] } {
  if (layout && layout.main) {
    return { wrapper: layout.wrapper, flowRoot: layout.main, blocks: visibleChildren(layout.main) };
  }

  const isBodyContainer = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    const cls = String(el.className || '').toLowerCase();
    const tag = el.tagName.toLowerCase();
    return tag === 'main' || /body|main|content-body|grid-container/.test(cls);
  };

  const boardKids = visibleChildren(board).filter((el) => !String(el.className || '').includes('resume-'));

  let container: HTMLElement = board;
  if (boardKids.length === 1) {
    container = boardKids[0];
  }
  const containerKids = visibleChildren(container).filter((el) => !String(el.className || '').includes('resume-'));

  const bodyEl = containerKids.find(isBodyContainer);
  if (bodyEl && visibleChildren(bodyEl).length > 1) {
    return { wrapper: container !== board ? container : bodyEl, flowRoot: bodyEl, blocks: visibleChildren(bodyEl) };
  }

  const header = containerKids.find(isHeaderElement);
  const nonHeaders = containerKids.filter((el) => el !== header);
  if (nonHeaders.length === 1 && visibleChildren(nonHeaders[0]).length > 1) {
    return { wrapper: container !== board ? container : nonHeaders[0], flowRoot: nonHeaders[0], blocks: nonHeaders };
  }

  return { wrapper: container !== board ? container : null, flowRoot: container, blocks: nonHeaders.length ? nonHeaders : containerKids };
}

function headingText(block: HTMLElement): string {
  const heading = block.querySelector('h1, h2, h3, h4');
  return heading ? (heading.textContent || '').trim().slice(0, 48) : '';
}

function makeContinuationLabel(text: string): HTMLElement {
  const label = document.createElement('div');
  label.className = 'resume-section-continuation';
  label.textContent = `${text} (continued)`;
  return label;
}

function makeChrome(
  kind: 'continuation' | 'footer',
  opts: { name: string; occupation: string; accent: string; pageNumber: number; pageCount: number }
): HTMLElement {
  const { name, occupation, accent, pageNumber, pageCount } = opts;
  if (kind === 'continuation') {
    const header = document.createElement('div');
    header.className = 'resume-continuation-header';
    header.style.setProperty('--resume-accent', accent || '#2563eb');
    const inner = document.createElement('div');
    inner.className = 'resume-continuation-header-inner';
    const who = document.createElement('div');
    who.className = 'resume-continuation-who';
    const nameEl = document.createElement('span');
    nameEl.className = 'resume-continuation-name';
    nameEl.textContent = name || '';
    who.appendChild(nameEl);
    if (occupation) {
      const roleEl = document.createElement('span');
      roleEl.className = 'resume-continuation-role';
      roleEl.textContent = occupation;
      who.appendChild(roleEl);
    }
    inner.appendChild(who);
    const pageEl = document.createElement('span');
    pageEl.className = 'resume-continuation-page';
    pageEl.textContent = pageCount > 0 ? `${pageNumber} / ${pageCount}` : `${pageNumber}`;
    inner.appendChild(pageEl);
    header.appendChild(inner);
    return header;
  }
  const footer = document.createElement('div');
  footer.className = 'resume-page-footer';
  const left = document.createElement('span');
  left.className = 'resume-footer-name';
  left.textContent = name || '';
  const right = document.createElement('span');
  right.className = 'resume-footer-page';
  right.textContent = pageCount > 0 ? `${pageNumber} / ${pageCount}` : `${pageNumber}`;
  footer.appendChild(left);
  footer.appendChild(right);
  return footer;
}

function nestChain(el: HTMLElement, stop: HTMLElement | null): HTMLElement | null {
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== stop && node !== document.body) {
    chain.push(node.cloneNode(false) as HTMLElement);
    node = node.parentElement;
  }
  chain.reverse();
  let root: HTMLElement | null = null;
  let current: HTMLElement | null = null;
  for (const wrapper of chain) {
    if (!root) {
      root = wrapper;
      current = wrapper;
    } else {
      current.appendChild(wrapper);
      current = wrapper;
    }
  }
  return root;
}

function applyBoardIdentity(page: HTMLElement, boardClasses: string, boardStyle: BoardStyle): HTMLElement {
  page.setAttribute('data-cv-board', 'true');
  if (boardClasses) page.classList.add(...boardClasses.split(/\s+/).filter(Boolean));
  if (boardStyle.fontFamily) page.style.fontFamily = boardStyle.fontFamily;
  if (boardStyle.color) page.style.color = boardStyle.color;
  page.style.background = boardStyle.background || '#ffffff';
  return page;
}

function splitBlockIntoEntries(
  block: HTMLElement,
  depth = 0,
  ancestors: HTMLElement[] = []
): Array<{ el: HTMLElement; continued: boolean }> | null {
  const kids = visibleChildren(block);
  if (kids.length === 0) return null;
  if (depth >= 2) return null;
  if (kids.length === 1) return splitBlockIntoEntries(kids[0], depth + 1, [...ancestors, block]);
  return kids.map((child, index) => {
    let el = child.cloneNode(true) as HTMLElement;
    const chain = [...ancestors, block];
    for (let j = chain.length - 1; j >= 0; j--) {
      const wrapper = chain[j].cloneNode(false) as HTMLElement;
      wrapper.appendChild(el);
      el = wrapper;
    }
    el.setAttribute('data-split-from', 'true');
    return { el, continued: index > 0 };
  });
}

function composePages(options: ComposeOptions): ComposeResult {
  const { blocks, layout, flowRoot, values, scratch, boardStyle, board } = options;
  const name = [values?.firstname, values?.lastname].filter(Boolean).join(' ') || (values?.name as string) || '';
  const occupation = (values?.occupation as string) || '';
  const accent = (values?.colors as Record<string, string>)?.primary || '#2563eb';
  const wrapper = layout ? layout.wrapper : board.firstElementChild || board;
  const { row, sidebar, main } = layout || {};
  const overflowLeaves: OverflowLeaf[] = [];
  const pages: HTMLElement[] = [];
  const boardClasses = String(board.className);

  const extraOriginals = [...board.children].filter(
    (el) => !([wrapper, row, sidebar, main].filter(Boolean) as HTMLElement[]).includes(el as HTMLElement) && getComputedStyle(el).display !== 'none'
  );

  const wrapperIndex = wrapper ? [...board.children].indexOf(wrapper) : -1;

  // ── Page 1: deep clone of the original board, trimmed to fit one sheet ──
  const page1 = applyBoardIdentity(document.createElement('div'), boardClasses, boardStyle);
  page1.className = 'resume-page resume-page-first';
  const boardDeep = board.cloneNode(true) as HTMLElement;
  boardDeep.setAttribute('data-cv-board', 'true');
  page1.appendChild(boardDeep);

  const contentDeep = wrapperIndex >= 0 ? boardDeep.children[wrapperIndex] : boardDeep;

  // Prune board-level extras clones that appear after content
  if (wrapperIndex >= 0) {
    while (boardDeep.children.length > wrapperIndex + 1) {
      boardDeep.children[boardDeep.children.length - 1].remove();
    }
  } else {
    const keepCount = main ? Math.max(1, [...board.children].indexOf(main) + 1) : 1;
    while (boardDeep.children.length > keepCount) boardDeep.children[boardDeep.children.length - 1].remove();
  }

  // Extras are re-appended to page 1 after content so they can be trimmed if needed
  for (const extra of extraOriginals) {
    if ([...board.children].indexOf(extra) > wrapperIndex) {
      boardDeep.appendChild(extra.cloneNode(true));
    }
  }

  const extraRemovable = () => {
    if (wrapperIndex >= 0) return [...boardDeep.children].slice(wrapperIndex + 1);
    const keepCount = main ? Math.max(1, [...board.children].indexOf(main) + 1) : 1;
    return [...boardDeep.children].slice(keepCount);
  };

  // Locate the flow container inside the deep clone
  let flowDeep: HTMLElement | null = contentDeep as HTMLElement;
  if (main && row) {
    flowDeep = boardDeep.querySelector(`.${main.className.split(/\s+/)[0]}`) as HTMLElement || (contentDeep as HTMLElement);
  } else if (flowRoot && flowRoot !== board && flowRoot !== wrapper) {
    flowDeep = boardDeep.querySelector(`.${flowRoot.className.split(/\s+/)[0]}`) as HTMLElement || (contentDeep as HTMLElement);
  }
  const flowOriginals = blocks;

  // Cap the first-page sidebar at one sheet (first-page sidebar strategy)
  if (sidebar) {
    const sidebarIndex = [...(row || wrapper || board).children].indexOf(sidebar);
    const sidebarDeep = sidebarIndex >= 0 ? (flowDeep?.parentElement?.children?.[sidebarIndex] as HTMLElement | null) : null;
    if (sidebarDeep) {
      sidebarDeep.classList.add('resume-sidebar-clone');
      const headerHeight = wrapperIndex > 0
        ? [...boardDeep.children].slice(0, wrapperIndex).reduce((sum, el) => sum + (el as HTMLElement).getBoundingClientRect().height, 0)
        : 0;
      const maxSidebarH = Math.max(350, Math.floor(1050 - headerHeight));
      sidebarDeep.style.maxHeight = `${maxSidebarH}px`;
      sidebarDeep.style.overflow = 'hidden';
    }
  }

  const removableInFlow = () => {
    if (!flowDeep) return [];
    const out: HTMLElement[] = [];
    for (const child of flowDeep.children) {
      if (child.classList?.contains('resume-page-footer')) continue;
      if (child.classList?.contains('resume-continuation-header')) continue;
      out.push(child as HTMLElement);
    }
    return out;
  };

  // Trim original flow children that don't fit page 1; they continue on page 2+
  flowDeep?.appendChild(makeChrome('footer', { name, occupation, accent, pageNumber: 1, pageCount: 0 }));
  scratch.appendChild(page1);
  const pending: BlockEntry[] = [];
  let trimGuard = 0;
  while (page1.scrollHeight > page1.clientHeight + 2 && trimGuard++ < 200) {
    // Try removing board-level extras (which sit below flow) before touching flow blocks
    const extras = extraRemovable();
    if (extras.length) {
      const lastExtra = extras[extras.length - 1];
      const original = extraOriginals[extras.indexOf(lastExtra)];
      lastExtra.remove();
      if (original) pending.push({ el: original as HTMLElement, continued: false });
      continue;
    }
    const removable = removableInFlow();
    if (removable.length > 0) {
      const last = removable[removable.length - 1];
      const original = flowOriginals[removable.length - 1];
      last.remove();
      if (original) pending.unshift({ el: original as HTMLElement, continued: false });
      continue;
    }
    // Nothing removable left — first-page chrome (header/sidebar) exceeds one sheet
    page1.style.overflow = 'visible';
    page1.style.minHeight = PAGE_H;
    page1.setAttribute('data-sidebar-clipped', 'true');
    overflowLeaves.push({ page: 1, cls: 'page-1-chrome-exceeds-sheet' });
    break;
  }
  pages.push(page1);

  // ── Continuation pages: full-width flow with the template's chain ──
  const buildContinuationShell = () => {
    const page = applyBoardIdentity(document.createElement('div'), boardClasses, boardStyle);
    page.className = 'resume-page';
    const continuation = makeChrome('continuation', { name, occupation, accent, pageNumber: pages.length + 1, pageCount: 0 });
    page.appendChild(continuation);

    const shell = (wrapper && wrapper !== board) ? wrapper.cloneNode(false) : document.createElement('div');
    page.appendChild(shell);
    let flow = shell as HTMLElement;
    if (main && row) {
      const chain = nestChain(main as HTMLElement, ((wrapper && wrapper !== board) ? wrapper : board) as HTMLElement);
      if (chain) {
        shell.appendChild(chain);
        flow = chain;
      }
    } else if (flowRoot && flowRoot !== board && flowRoot !== wrapper) {
      const chain = nestChain(flowRoot as HTMLElement, ((wrapper && wrapper !== board) ? wrapper : board) as HTMLElement);
      if (chain) {
        shell.appendChild(chain);
        flow = chain;
      }
    }
    flow.appendChild(makeChrome('footer', { name, occupation, accent, pageNumber: pages.length + 1, pageCount: 0 }));
    scratch.appendChild(page);
    return { page, flow };
  };

  const chainBlocks: BlockEntry[] = pending.map((el) => ({ el: el.el, continued: false }));
  while (chainBlocks.length) {
    const { page, flow } = buildContinuationShell();

    do {
      let overflowed = false;
      while (chainBlocks.length) {
        const next = chainBlocks.shift()!;
        const clone = next.el.cloneNode(true) as HTMLElement;
        if (next.continued) flow.appendChild(makeContinuationLabel(headingText(next.el) || 'Section'));
        flow.appendChild(clone);
        if (globalThis.__resumeComposeDebug) {
          (globalThis.__resumeComposeDebug.fill ||= []).push(`${pages.length + 1}:${String(next.el.className).slice(0, 26)}=${flow.scrollHeight}/${page.clientHeight}`);
        }
        if (flow.scrollHeight > page.clientHeight - 28) {
          flow.removeChild(clone);
          const prev = flow.lastElementChild as HTMLElement;
          if (prev && prev.classList?.contains('resume-section-continuation')) flow.removeChild(prev);
          chainBlocks.unshift(next);
          overflowed = true;
          break;
        }
      }
      if (!overflowed) break;
      const blockEntry = chainBlocks.shift()!;
      const entries = splitBlockIntoEntries(blockEntry.el);
      if (!entries) {
        flow.appendChild(blockEntry.el.cloneNode(true));
        page.style.overflow = 'visible';
        page.style.minHeight = PAGE_H;
        overflowLeaves.push({ page: pages.length + 1, cls: String(blockEntry.el.className).slice(0, 40) });
        break;
      }
      flow.appendChild(entries[0].el.cloneNode(true));
      if (flow.scrollHeight > page.clientHeight - 28) {
        flow.removeChild(flow.lastElementChild as HTMLElement);
        chainBlocks.unshift(...entries);
        break;
      }
      chainBlocks.unshift(...entries.slice(1));
      // eslint-disable-next-line no-constant-condition -- F-25: deliberate do/while pagination loop; every path exits via the break/return guards above.
    } while (true);

    pages.push(page);
  }

  // Page numbers (totals) once the page count is known
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const continuation = page.querySelector('.resume-continuation-page');
    if (continuation) continuation.textContent = `${i + 1} / ${total}`;
    const footerPage = page.querySelector('.resume-footer-page');
    if (footerPage) footerPage.textContent = `${i + 1} / ${total}`;
  }

  // ── Reflow correction ──
  const flowOf = (page: HTMLElement): HTMLElement => {
    const footer = page.querySelector('.resume-page-footer');
    return footer ? (footer.parentElement as HTMLElement) : page;
  };

  for (let pass = 0; pass < 60; pass++) {
    let movedAny = false;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (page.scrollHeight <= page.clientHeight + 4) continue;
      const flow = flowOf(page);
      const kids = Array.from(flow.children) as HTMLElement[];
      let chromeCount = 0;
      for (const kid of kids) {
        if (kid.classList?.contains('resume-page-footer') || kid.classList?.contains('resume-continuation-header')) chromeCount++;
        else break;
      }
      const movable = kids.slice(chromeCount);
      if (!movable.length) continue;
      if (movable.length === 1) {
        // Try splitting the lone oversized block first
        const entries = splitBlockIntoEntries(movable[0]);
        if (entries && entries.length > 1) {
          const blockEl = movable[0];
          flow.replaceChild(entries[0].el, blockEl);
          let targetFlow: HTMLElement;
          if (i === pages.length - 1) {
            const built = buildContinuationShell();
            pages.push(built.page);
            targetFlow = built.flow;
          } else {
            targetFlow = flowOf(pages[i + 1]);
          }
          const targetKids = Array.from(targetFlow.children) as HTMLElement[];
          let targetChrome = 0;
          for (const kid of targetKids) {
            if (kid.classList?.contains('resume-page-footer') || kid.classList?.contains('resume-continuation-header')) targetChrome++;
            else break;
          }
          const anchor = targetKids[targetChrome] || null;
          for (const entry of entries.slice(1)) {
            if (anchor) targetFlow.insertBefore(makeContinuationLabel(headingText(entry.el) || 'Section'), anchor);
            targetFlow.insertBefore(entry.el, anchor);
          }
          movedAny = true;
          continue;
        }
        // A single block that overflows its own page can never fit
        page.style.overflow = 'visible';
        page.style.minHeight = PAGE_H;
        overflowLeaves.push({ page: i + 1, cls: String(movable[0].className).slice(0, 40) });
        continue;
      }
      const block = movable[movable.length - 1];
      const pieces: HTMLElement[] = [];
      const blockIndex = kids.indexOf(block);
      if (blockIndex > chromeCount && kids[blockIndex - 1].classList?.contains('resume-section-continuation')) pieces.push(kids[blockIndex - 1]);
      pieces.push(block);
      let targetFlow: HTMLElement;
      if (i === pages.length - 1) {
        // Grow a new final page when the last sheet overflows
        const built = buildContinuationShell();
        pages.push(built.page);
        targetFlow = built.flow;
      } else {
        targetFlow = flowOf(pages[i + 1]);
      }
      const nextKids = Array.from(targetFlow.children) as HTMLElement[];
      let nextChrome = 0;
      for (const kid of nextKids) {
        if (kid.classList?.contains('resume-page-footer') || kid.classList?.contains('resume-continuation-header')) nextChrome++;
        else break;
      }
      const anchor = nextKids[nextChrome] || null;
      for (const piece of pieces) targetFlow.insertBefore(piece, anchor);
      movedAny = true;
    }
    if (!movedAny) break;
  }

  // Drop trailing shells left empty by reflow cascades
  const isEmptyFlow = (page: HTMLElement): boolean => {
    const flow = flowOf(page);
    return ![...flow.children].some(
      (kid) => !kid.classList?.contains('resume-page-footer') && !kid.classList?.contains('resume-continuation-header')
    );
  };
  while (pages.length > 1 && isEmptyFlow(pages[pages.length - 1])) pages.pop();

  // Re-number after reflow (page count may have grown)
  const finalTotal = pages.length;
  for (let i = 0; i < finalTotal; i++) {
    const page = pages[i];
    const continuation = page.querySelector('.resume-continuation-page');
    if (continuation) continuation.textContent = `${i + 1} / ${finalTotal}`;
    const footerPage = page.querySelector('.resume-footer-page');
    if (footerPage) footerPage.textContent = `${i + 1} / ${finalTotal}`;
  }

  return { pages, overflowLeaves };
}

export default function ResumePageComposer({
  templateId,
  language = 'en',
  values,
  enabled = false,
  children,
  onComposed,
  onError,
}: ResumePageComposerProps) {
  const liveRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const composedSignatureRef = useRef('');
  const composingRef = useRef(false);

  const compose = useCallback(() => {
    if (!enabled) return;
    const live = liveRef.current;
    const pagesHost = pagesRef.current;
    const board = (live?.querySelector('#resumen') || live?.querySelector('[class*="board"], [class*="Board"], [class*="container"]')) as HTMLElement | null;
    if (!live || !pagesHost || !board || composingRef.current) return;

    const signature = [
      templateId,
      language,
      board.childElementCount,
      board.scrollHeight,
      (board.textContent || '').length,
      (board.innerHTML || '').length,
    ].join('|');
    if (signature === composedSignatureRef.current) return;

    composingRef.current = true;
    document.documentElement.removeAttribute('data-export-paginated');

    let scratch: HTMLElement | null = null;
    try {
      board.setAttribute('data-cv-board', 'true');
      const layout = findColumnLayout(board);
      if (globalThis.__resumeComposeDebug) {
        globalThis.__resumeComposeDebug.layout = layout
          ? {
              wrapper: String(layout.wrapper?.className || null).slice(0, 30),
              row: String(layout.row?.className || null).slice(0, 30),
              sidebar: String(layout.sidebar?.className).slice(0, 30),
              main: String(layout.main?.className).slice(0, 30),
            }
          : null;
      }
      const flowInfo = findFlowRootAndBlocks(board, layout);
      const { wrapper, flowRoot: flowRootEl, blocks } = flowInfo;
      const effectiveLayout = layout ? { ...layout, wrapper } : null;

      // In-document scratch host: height measurements require real layout
      scratch = document.createElement('div');
      scratch.className = 'resume-pages resume-scratch';
      pagesHost.parentElement?.appendChild(scratch);

      const boardStyle: BoardStyle = (() => {
        const cs = getComputedStyle(board);
        return {
          fontFamily: cs.fontFamily,
          color: cs.color,
          background: cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#ffffff',
        };
      })();

      const { pages, overflowLeaves } = composePages({
        blocks,
        layout: effectiveLayout || null,
        flowRoot: flowRootEl,
        values: values || {},
        scratch,
        boardStyle,
        board,
      });

      if (globalThis.__resumeComposeDebug) {
        globalThis.__resumeComposeDebug.scratchHeights = pages.map((p) => ({ over: p.scrollHeight - p.clientHeight, kids: p.children.length }));
        globalThis.__resumeComposeDebug.result = pages.map((p) => {
          const flow = p.querySelector('[class*="main"], [class*="rightSide"]') || p.firstElementChild || p;
          return {
            kids: Array.from(flow.children).map((c) => String(c.className).slice(0, 26)).slice(0, 10),
            over: p.scrollHeight - p.clientHeight,
          };
        });
      }

      pagesHost.replaceChildren(...pages);
      if (globalThis.__resumeComposeDebug) {
        globalThis.__resumeComposeDebug.swapHeights = pages.map((p) => ({ over: p.scrollHeight - p.clientHeight }));
      }
      composedSignatureRef.current = signature;
      if (overflowLeaves.length) pagesHost.setAttribute('data-overflow-leaves', String(overflowLeaves.length));
      else pagesHost.removeAttribute('data-overflow-leaves');

      // Post-swap self-checks: fonts/images may settle after compose; rebuild if any sheet then overflows
      const verify = () => {
        if (!pagesHost.isConnected) return;
        const overflow = [...pagesHost.querySelectorAll('.resume-page')].some(
          (p) => p.scrollHeight > p.clientHeight + 4 && getComputedStyle(p).overflow === 'hidden'
        );
        if (overflow) {
          composedSignatureRef.current = '';
          composingRef.current = false;
          document.documentElement.removeAttribute('data-export-paginated');
          compose();
        }
      };
      requestAnimationFrame(verify);
      setTimeout(verify, 350);

      document.documentElement.setAttribute('data-export-paginated', 'true');
      document.dispatchEvent(new CustomEvent('resume-composed', { detail: { templateId, pages: pages.length } }));
      onComposed?.({ templateId, pages: pages.length });
    } catch (error) {
      // Never break the resume product on pagination failure: fall back to the live layer
      live.classList.add('resume-live-fallback');
      live.removeAttribute('aria-hidden');
      pagesHost.setAttribute('data-compose-error', String(error?.message || error).slice(0, 200));
      document.dispatchEvent(new CustomEvent('resume-compose-error', { detail: { templateId, message: String(error?.message || error) } }));
      onError?.({ templateId, message: String(error?.message || error) });
    } finally {
      scratch?.remove();
      composingRef.current = false;
    }
  }, [enabled, templateId, language, values, onComposed, onError]);

  useEffect(() => {
    if (!enabled) return undefined;
    const live = liveRef.current;
    if (!live) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delay = 140) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(compose, delay);
    };
    const observer = new MutationObserver(() => schedule());
    observer.observe(live, { subtree: true, childList: true, characterData: true });
    const onImageLoad = () => schedule(80);
    live.addEventListener('load', onImageLoad, true);
    if (document.fonts?.ready) document.fonts.ready.then(() => schedule(0)).catch(() => schedule(0));
    else schedule(250);
    const onResize = () => schedule(200);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      live.removeEventListener('load', onImageLoad, true);
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
      document.documentElement.removeAttribute('data-export-paginated');
    };
  }, [compose, enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className="container-fluid p-0 composer-bs-root resume-document"
      dir={getTemplateDirection(language)}
      data-template-id={templateId}
    >
      <div className="resume-live" ref={liveRef} aria-hidden="true">
        {children}
      </div>
      <div className="resume-pages" ref={pagesRef} data-compose-state="pending" />
    </div>
  );
}