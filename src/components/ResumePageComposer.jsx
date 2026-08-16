import React, { useCallback, useEffect, useRef } from 'react';
import { getTemplateDirection } from '../cv-templates/templateUtils';

/**
 * ResumePageComposer — true A4 multi-page document engine.
 *
 * The React tree (template + extras portal) renders inside a hidden "live"
 * layer used purely as a measurement source. The composer partitions the
 * rendered content into discrete 210 x 297 mm `.resume-page` sheets in a
 * visible layer:
 *
 *   Page 1  — template header (+ first-page sidebar for column layouts) + flow
 *   Page 2+ — continuation header, continued flow, page footer "N / M"
 *
 * Design principles:
 *  - Content determines the page count. Nothing is compressed or hidden.
 *  - Each sheet re-creates the original DOM context: the template's content
 *    wrapper (and column row for two-column templates) is shallow-cloned onto
 *    every page, so descendant CSS selectors keep matching inside fragments.
 *    The sidebar is deep-cloned intact on page one.
 *  - Two-column layouts use a first-page sidebar strategy; continuation pages
 *    use the full A4 width.
 *  - `break-inside`-style atomicity: blocks that don't fit move whole to the
 *    next page; oversized sections split into entry-level fragments that carry
 *    their full ancestor chain (shallow clones), with a "… (continued)" label.
 *  - Browser print and the headless PDF pipeline paginate 1:1 with the
 *    on-screen sheets (`break-after: page`).
 *
 * The frozen cover-letter module never passes `enabled`, so it is untouched.
 */

const PAGE_H = '297mm';
const SIDEBAR_HINT = /(^|[-_\s])(sidebar|aside|profile([-_\s]?(section|panel|column))?|contact([-_\s]?(section|panel|column))?)$|(?<![\w])left([-_ ]?side)?$/i;

function visibleChildren(el) {
    // The live measurement layer is visibility:hidden (inherited by every
    // child), so only `display: none` is a reliable exclusion here.
    return [...el.children].filter((child) => getComputedStyle(child).display !== 'none');
}

function isRowElement(el) {
    if (!el || el.children.length < 2) return false;
    const cs = getComputedStyle(el);
    return cs.display === 'flex' && (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
}

function looksLikeSidebar(el, boardWidth) {
    if (!el) return false;
    const name = `${el.className || ''} ${el.id || ''}`;
    if (SIDEBAR_HINT.test(name)) return true;
    if (/Left$/.test(String(el.className || ''))) return true; // camelCase bodyLeft, leftSide…
    const cs = getComputedStyle(el);
    const width = el.getBoundingClientRect().width;
    if (width > 0 && boardWidth > 0 && width < boardWidth * 0.45 && cs.flexGrow === '0') return true;
    return false;
}

/**
 * Detects the two-column structure:
 *   { wrapper, row, sidebar, main }
 *  - wrapper: the content wrapper element (null when the board itself hosts
 *    the columns), used to recreate DOM context on composed sheets.
 *  - row: the element whose children are the columns (wrapper, board, or a
 *    nested row).
 */
function findColumnLayout(board) {
    const boardWidth = board.getBoundingClientRect().width;
    const boardHeight = board.getBoundingClientRect().height || 1;
    const candidates = [];
    const layoutKids = (container) => visibleChildren(container)
        .filter((el) => !String(el.className || '').includes('resume-'));

    const isHeaderElement = (el) => {
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        const cls = String(el.className || '').toLowerCase();
        const id = String(el.id || '').toLowerCase();
        return tag === 'header' || /header|cv\d+-head\b|top-head|name-title|diagonal-header/.test(cls) || /header/.test(id);
    };

    const add = (container, depth) => {
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
        add(child, 1);
        for (const grandchild of child.children || []) {
            add(grandchild, 2);
            for (const greatGrandchild of grandchild.children || []) {
                add(greatGrandchild, 3);
            }
        }
    }

    candidates.sort((a, b) => b.height - a.height);

    for (const { container, depth, height } of candidates) {
        if (height < 150 && height < boardHeight * 0.2) continue;
        const kids = layoutKids(container);
        if (kids.length >= 2 && kids.some((el) => looksLikeSidebar(el, boardWidth))) {
            const sidebar = kids.find((el) => looksLikeSidebar(el, boardWidth));
            const main = kids.find((el) => el !== sidebar);
            if (sidebar && main) {
                let realWrapper = null;
                for (const child of board.children) {
                    if (child === container || child.contains(container)) {
                        realWrapper = child;
                        break;
                    }
                }
                return { wrapper: realWrapper, row: container, sidebar, main };
            }
        }
    }
    return null;
}

function findFlowRootAndBlocks(board, layout) {
    if (layout && layout.main) {
        return { wrapper: layout.wrapper, flowRoot: layout.main, blocks: visibleChildren(layout.main) };
    }

    const isHeaderEl = (el) => {
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        const cls = String(el.className || '').toLowerCase();
        return tag === 'header' || /header|cv\d+-head\b|top-head|name-title|diagonal-header|contact/.test(cls);
    };

    const isBodyContainer = (el) => {
        if (!el) return false;
        const cls = String(el.className || '').toLowerCase();
        const tag = el.tagName.toLowerCase();
        return tag === 'main' || /body|main|content-body|grid-container/.test(cls);
    };

    const boardKids = visibleChildren(board).filter((el) => !String(el.className || '').includes('resume-'));

    let container = board;
    if (boardKids.length === 1) {
        container = boardKids[0];
    }
    const containerKids = visibleChildren(container).filter((el) => !String(el.className || '').includes('resume-'));

    const bodyEl = containerKids.find(isBodyContainer);
    if (bodyEl && visibleChildren(bodyEl).length > 1) {
        return { wrapper: container !== board ? container : bodyEl, flowRoot: bodyEl, blocks: visibleChildren(bodyEl) };
    }

    const header = containerKids.find(isHeaderEl);
    const nonHeaders = containerKids.filter((el) => el !== header);
    if (nonHeaders.length === 1 && visibleChildren(nonHeaders[0]).length > 1) {
        return { wrapper: container !== board ? container : nonHeaders[0], flowRoot: nonHeaders[0], blocks: visibleChildren(nonHeaders[0]) };
    }

    return { wrapper: container !== board ? container : null, flowRoot: container, blocks: nonHeaders.length ? nonHeaders : containerKids };
}

function makeChrome(kind, { name, occupation, accent, pageNumber, pageCount }) {
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

function headingText(block) {
    const heading = block.querySelector('h1, h2, h3, h4');
    return heading ? (heading.textContent || '').trim().slice(0, 48) : '';
}

function makeContinuationLabel(text) {
    const label = document.createElement('div');
    label.className = 'resume-section-continuation';
    label.textContent = `${text} (continued)`;
    return label;
}

/**
 * Partitions blocks into fixed-height pages. Each page recreates the original
 * content wrapper (and column row for the first page) so template CSS keeps
 * matching. Returns { pages, overflowLeaves }.
 */
function composePages({ blocks, layout, flowRoot, values, scratch, boardStyle, board }) {
    const name = [values?.firstname, values?.lastname].filter(Boolean).join(' ') || values?.name || '';
    const occupation = values?.occupation || '';
    const accent = values?.colors?.primary || '#2563eb';
    const wrapper = layout ? layout.wrapper : (board.firstElementChild || board);
    const { row, sidebar, main } = layout || {};
    const overflowLeaves = [];
    const pages = [];

    const boardClasses = board ? String(board.className) : '';

    /** Shallow-clone the ancestor chain of `el` up to (exclusive) `stop`. */
    const nestChain = (el, stop) => {
        const chain = [];
        let node = el;
        while (node && node !== stop && node !== document.body) {
            chain.push(node.cloneNode(false));
            node = node.parentElement;
        }
        chain.reverse();
        let root = null;
        let current = null;
        for (const wrapper of chain) {
            if (!root) { root = wrapper; current = wrapper; }
            else { current.appendChild(wrapper); current = wrapper; }
        }
        return root;
    };

    const applyBoardIdentity = (page) => {
        page.setAttribute('data-cv-board', 'true');
        if (boardClasses) page.classList.add(...boardClasses.split(/\s+/).filter(Boolean));
        if (boardStyle) {
            if (boardStyle.fontFamily) page.style.fontFamily = boardStyle.fontFamily;
            if (boardStyle.color) page.style.color = boardStyle.color;
            page.style.background = boardStyle.background || '#ffffff';
        }
        return page;
    };

    /**
     * Splits a block into entry-level fragments, each wrapped in the block's
     * full ancestor chain (shallow clones) so descendant CSS keeps matching.
     * Returns null for unsplittable leaves.
     */
    const splitBlockIntoEntries = (block, depth = 0, ancestors = []) => {
        const kids = visibleChildren(block);
        if (kids.length === 0) return null;
        if (depth >= 2) return null;
        if (kids.length === 1) return splitBlockIntoEntries(kids[0], depth + 1, [...ancestors, block]);
        return kids.map((child, index) => {
            let el = child.cloneNode(true);
            const chain = [...ancestors, block];
            for (let j = chain.length - 1; j >= 0; j--) {
                const wrapper = chain[j].cloneNode(false);
                wrapper.appendChild(el);
                el = wrapper;
            }
            el.setAttribute('data-split-from', 'true');
            return { el, continued: index > 0 };
        });
    };

    // ── Page 1: deep clone of the original board, trimmed to fit one sheet ──
    const page1 = applyBoardIdentity(document.createElement('div'));
    page1.className = 'resume-page resume-page-first';
    const boardDeep = board.cloneNode(true);
    boardDeep.setAttribute('data-cv-board', 'true');
    page1.appendChild(boardDeep);

    const wrapperIndex = wrapper ? [...board.children].indexOf(wrapper) : -1;
    const contentDeep = wrapperIndex >= 0 ? boardDeep.children[wrapperIndex] : boardDeep;

    // Prune only the board-level extras clones that appear after content
    const columnEls = new Set([wrapper, row, sidebar, main].filter(Boolean));
    const extraOriginals = [...board.children].filter((el) => !columnEls.has(el) && getComputedStyle(el).display !== 'none');
    
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

    // Locate the flow container inside the deep clone (row/main or content).
    let flowDeep = contentDeep;
    if (main && row) {
        flowDeep = boardDeep.querySelector(`.${main.className.split(/\s+/)[0]}`) || contentDeep;
    } else if (flowRoot && flowRoot !== board && flowRoot !== wrapper) {
        flowDeep = boardDeep.querySelector(`.${flowRoot.className.split(/\s+/)[0]}`) || contentDeep;
    }
    const flowOriginals = blocks;

    // Cap the first-page sidebar at one sheet (first-page sidebar strategy).
    if (sidebar) {
        const sidebarIndex = [...(row || wrapper || board).children].indexOf(sidebar);
        const sidebarDeep = sidebarIndex >= 0 ? flowDeep.parentElement?.children?.[sidebarIndex] : null;
        if (sidebarDeep) {
            sidebarDeep.classList.add('resume-sidebar-clone');
            const headerHeight = wrapperIndex > 0 ? 
                [...boardDeep.children].slice(0, wrapperIndex).reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) : 0;
            const maxSidebarH = Math.max(350, Math.floor(1050 - headerHeight));
            sidebarDeep.style.maxHeight = `${maxSidebarH}px`;
            sidebarDeep.style.overflow = 'hidden';
        }
    }

    const removableInFlow = () => {
        if (!flowDeep) return [];
        const out = [];
        for (const child of [...flowDeep.children]) {
            if (child.classList?.contains('resume-page-footer')) continue;
            if (child.classList?.contains('resume-continuation-header')) continue;
            out.push(child);
        }
        return out;
    };

    // Trim original flow children that don't fit page 1; they continue on page 2+.
    flowDeep.appendChild(makeChrome('footer', { name, accent, pageNumber: 1, pageCount: 0 }));
    scratch.appendChild(page1);
    const pending = [];
    let trimGuard = 0;
    while (page1.scrollHeight > page1.clientHeight + 2 && trimGuard++ < 200) {
        // Try removing board-level extras (which sit below flow) before touching flow blocks.
        const extras = extraRemovable();
        if (extras.length) {
            const lastExtra = extras[extras.length - 1];
            const original = extraOriginals[extras.indexOf(lastExtra)];
            lastExtra.remove();
            if (original) pending.push(original);
            continue;
        }
        const removable = removableInFlow();
        if (removable.length > 0) {
            const last = removable[removable.length - 1];
            const original = flowOriginals[removable.length - 1];
            last.remove();
            if (original) pending.unshift(original);
            continue;
        }
        // Nothing removable left — first-page chrome (header/sidebar) exceeds
        // one sheet. Preserve it visibly and flag it; the page grows beyond
        // 297mm rather than losing user content.
        page1.style.overflow = 'visible';
        page1.style.minHeight = PAGE_H;
        page1.setAttribute('data-sidebar-clipped', 'true');
        overflowLeaves.push({ page: 1, cls: 'page-1-chrome-exceeds-sheet' });
        break;
    }
    pages.push(page1);

    // ── Continuation pages: full-width flow with the template's chain ──
    const buildContinuationShell = () => {
        const page = applyBoardIdentity(document.createElement('div'));
        page.className = 'resume-page';
        const continuation = makeChrome('continuation', { name, occupation, accent, pageNumber: pages.length + 1, pageCount: 0 });
        page.appendChild(continuation);

        const shell = (wrapper && wrapper !== board) ? wrapper.cloneNode(false) : document.createElement('div');
        page.appendChild(shell);
        let flow = shell;
        if (main && row) {
            const chain = nestChain(main, (wrapper && wrapper !== board) ? wrapper : board);
            if (chain) { shell.appendChild(chain); flow = chain; }
        } else if (flowRoot && flowRoot !== board && flowRoot !== wrapper) {
            const chain = nestChain(flowRoot, (wrapper && wrapper !== board) ? wrapper : board);
            if (chain) { shell.appendChild(chain); flow = chain; }
        }
        flow.appendChild(makeChrome('footer', { name, accent, pageNumber: pages.length + 1, pageCount: 0 }));
        scratch.appendChild(page);
        return { page, flow };
    };

    const chainBlocks = pending.map((el) => ({ el, continued: false }));
    while (chainBlocks.length) {
        const { page, flow } = buildContinuationShell();

        do {
            let overflowed = false;
            while (chainBlocks.length) {
                const next = chainBlocks.shift();
                const clone = next.el.cloneNode(true);
                if (next.continued) flow.appendChild(makeContinuationLabel(headingText(next.el) || 'Section'));
                flow.appendChild(clone);
                if (globalThis.__resumeComposeDebug) {
                    (globalThis.__resumeComposeDebug.fill ||= []).push(`${pages.length + 1}:${String(next.el.className).slice(0, 26)}=${flow.scrollHeight}/${page.clientHeight}`);
                }
                if (flow.scrollHeight > page.clientHeight - 28) {
                    flow.removeChild(clone);
                    const prev = flow.lastElementChild;
                    if (prev && prev.classList?.contains('resume-section-continuation')) flow.removeChild(prev);
                    chainBlocks.unshift(next);
                    overflowed = true;
                    break;
                }
            }
            if (!overflowed) break;
            const blockEntry = chainBlocks.shift();
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
                flow.removeChild(flow.lastElementChild);
                chainBlocks.unshift(...entries);
                break;
            }
            chainBlocks.unshift(...entries.slice(1));
        } while (true); // eslint-disable-line no-constant-condition

        pages.push(page);
    }

    // Page numbers (totals) once the page count is known.
    const total = pages.length;
    for (let i = 0; i < total; i++) {
        const page = pages[i];
        const continuation = page.querySelector('.resume-continuation-page');
        if (continuation) continuation.textContent = `${i + 1} / ${total}`;
        const footerPage = page.querySelector('.resume-footer-page');
        if (footerPage) footerPage.textContent = `${i + 1} / ${total}`;
    }

    /**
     * Reflow correction — operates on the FINAL rendered heights, so it is
     * immune to font/image settling and measurement drift: for every sheet
     * that overflows, the last flow block (with its continuation label) is
     * moved to the next sheet until every page fits the A4 frame.
     */
    const flowOf = (page) => {
        const footer = page.querySelector('.resume-page-footer');
        return footer ? footer.parentElement : page;
    };
    for (let pass = 0; pass < 60; pass++) {
        let movedAny = false;
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (page.scrollHeight <= page.clientHeight + 4) continue;
            const flow = flowOf(page);
            const kids = [...flow.children];
            let chromeCount = 0;
            for (const kid of kids) {
                if (kid.classList?.contains('resume-page-footer') || kid.classList?.contains('resume-continuation-header')) chromeCount++;
                else break;
            }
            const movable = kids.slice(chromeCount);
            if (!movable.length) continue;
            if (movable.length === 1) {
                // Try splitting the lone oversized block first.
                const entries = splitBlockIntoEntries(movable[0]);
                if (entries && entries.length > 1) {
                    const blockEl = movable[0];
                    flow.replaceChild(entries[0].el, blockEl);
                    let targetFlow;
                    if (i === pages.length - 1) {
                        const built = buildContinuationShell();
                        pages.push(built.page);
                        targetFlow = built.flow;
                    } else {
                        targetFlow = flowOf(pages[i + 1]);
                    }
                    const targetKids = [...targetFlow.children];
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
                // A single block that overflows its own page can never fit —
                // preserve it visibly and stop reflowing it.
                page.style.overflow = 'visible';
                page.style.minHeight = PAGE_H;
                overflowLeaves.push({ page: i + 1, cls: String(movable[0].className).slice(0, 40) });
                continue;
            }
            const block = movable[movable.length - 1];
            const pieces = [];
            const blockIndex = kids.indexOf(block);
            if (blockIndex > chromeCount && kids[blockIndex - 1].classList?.contains('resume-section-continuation')) pieces.push(kids[blockIndex - 1]);
            pieces.push(block);
            let targetFlow;
            if (i === pages.length - 1) {
                // Grow a new final page when the last sheet overflows.
                const built = buildContinuationShell();
                pages.push(built.page);
                targetFlow = built.flow;
            } else {
                targetFlow = flowOf(pages[i + 1]);
            }
            const nextKids = [...targetFlow.children];
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

    // Drop trailing shells left empty by reflow cascades.
    const isEmptyFlow = (page) => {
        const flow = flowOf(page);
        return ![...flow.children].some((kid) => !kid.classList?.contains('resume-page-footer') && !kid.classList?.contains('resume-continuation-header'));
    };
    while (pages.length > 1 && isEmptyFlow(pages[pages.length - 1])) pages.pop();

    // Re-number after reflow (page count may have grown).
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

export default function ResumePageComposer({ templateId, language = 'en', values, enabled, children }) {
    const liveRef = useRef(null);
    const pagesRef = useRef(null);
    const composedSignatureRef = useRef('');
    const composingRef = useRef(false);

    const compose = useCallback(() => {
        if (!enabled) return;
        const live = liveRef.current;
        const pagesHost = pagesRef.current;
        const board = live?.querySelector('#resumen') || live?.querySelector('[class*="board"], [class*="Board"], [class*="container"]');
        if (!live || !pagesHost || !board || composingRef.current) return;
        const signature = [
            templateId, language,
            board.childElementCount,
            board.scrollHeight,
            (board.textContent || '').length,
            (board.innerHTML || '').length,
        ].join('|');
        if (signature === composedSignatureRef.current) return;
        composingRef.current = true;
        document.documentElement.removeAttribute('data-export-paginated');
        let scratch = null;
        try {
            board.setAttribute('data-cv-board', 'true');
            const layout = findColumnLayout(board);
            if (globalThis.__resumeComposeDebug) {
                globalThis.__resumeComposeDebug.layout = layout ? { wrapper: String(layout.wrapper?.className || null).slice(0, 30), row: String(layout.row?.className || null).slice(0, 30), sidebar: String(layout.sidebar?.className).slice(0, 30), main: String(layout.main?.className).slice(0, 30) } : null;
            }
            const flowInfo = findFlowRootAndBlocks(board, layout);
            const { wrapper, flowRoot, blocks } = flowInfo;
            const effectiveLayout = layout ? { ...layout, wrapper } : null;
            // Board-level extras (resume-extras portal) are handled by the
            // page-1 composition itself (appended after content, trimmed into
            // continuation pages when they don't fit).

            // In-document scratch host: height measurements require real layout.
            scratch = document.createElement('div');
            scratch.className = 'resume-pages resume-scratch';
            pagesHost.parentElement?.appendChild(scratch);

            const boardStyle = (() => {
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
                flowRoot,
                values: values || {},
                scratch,
                boardStyle,
                board,
            });

            if (globalThis.__resumeComposeDebug) {
                globalThis.__resumeComposeDebug.scratchHeights = pages.map((p) => ({ over: p.scrollHeight - p.clientHeight, kids: p.children.length }));
                globalThis.__resumeComposeDebug.result = pages.map((p) => ({
                    kids: [...(p.querySelector('[class*="main"], [class*="rightSide"]') || p.firstElementChild || p).children].map((c) => String(c.className).slice(0, 26)).slice(0, 10),
                    over: p.scrollHeight - p.clientHeight,
                }));
            }
            pagesHost.replaceChildren(...pages);
            if (globalThis.__resumeComposeDebug) {
                globalThis.__resumeComposeDebug.swapHeights = pages.map((p) => ({ over: p.scrollHeight - p.clientHeight }));
            }
            composedSignatureRef.current = signature;
            if (overflowLeaves.length) pagesHost.setAttribute('data-overflow-leaves', String(overflowLeaves.length));
            else pagesHost.removeAttribute('data-overflow-leaves');
            // Post-swap self-checks: fonts/images may settle after compose;
            // rebuild (bounded retries) if any sheet then overflows the frame.
            const verify = () => {
                if (!pagesHost.isConnected) return;
                const overflow = [...pagesHost.querySelectorAll('.resume-page')].some((p) => p.scrollHeight > p.clientHeight + 4 && getComputedStyle(p).overflow === 'hidden');
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
        } catch (error) {
            // Never break the resume product on pagination failure: fall back to
            // the live (continuous) layer and surface the error for observability.
            live.classList.add('resume-live-fallback');
            live.removeAttribute('aria-hidden');
            pagesHost.setAttribute('data-compose-error', String(error?.message || error).slice(0, 200));
            document.dispatchEvent(new CustomEvent('resume-compose-error', { detail: { templateId, message: String(error?.message || error) } }));
        } finally {
            scratch?.remove();
            composingRef.current = false;
        }
    }, [enabled, templateId, language, values]);

    useEffect(() => {
        if (!enabled) return undefined;
        const live = liveRef.current;
        if (!live) return undefined;
        let timer = null;
        const schedule = (delay = 140) => { if (timer) clearTimeout(timer); timer = setTimeout(compose, delay); };
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

    if (!enabled) return children;

    return (
        <div className="resume-document" dir={getTemplateDirection(language)} data-template-id={templateId}>
            <div className="resume-live" ref={liveRef} aria-hidden="true">
                {children}
            </div>
            <div className="resume-pages" ref={pagesRef} data-compose-state="pending" />
        </div>
    );
}
