// @ts-check
/**
 * DIR-023: In-page contrast measurement core (FAST PATH).
 *
 * `contrastKernelFactory()` returns a self-contained function serialised into
 * the live browser via page.evaluate. It holds NO closure over module scope, so
 * it crosses the Playwright boundary intact.
 *
 * THE TWO PATHS (explicitly approved by the Lead in evt_mut8zgqp_cb3ef63a):
 *
 *   FAST PATH (this file) - the mandated ancestor alpha-compositing walk
 *   (DIR-023 spec section 2.1). Reads getComputedStyle(node).backgroundColor up
 *   the ancestor chain and composites A*C_fg + (1-A)*C_bg down to the :root
 *   --cuba-canvas. Exact for opaque and alpha-composited cards, and the only
 *   path that honours the semantic token system.
 *
 *   TRUTH PATH (dir023-paint-truth.mjs) - REAL rasterised pixels. A node whose
 *   ancestor chain carries a gradient, background-blend-mode, backdrop-filter or
 *   filter is composited by the browser in a way no backgroundColor walk can
 *   model. This is not hypothetical:
 *     - dir012-admin-console.spec.js:766 documented the INVERSE artifact (a
 *       false 17:1 pass),
 *     - dir018-contrast-diagnostic.mjs documented false ratios of 1 and 1.48,
 *     - cuba-tokens.css:857 .cuba-widget-texture sets
 *       background-blend-mode:overlay, unmodellable by alpha compositing.
 *   A violation is only reported when BOTH paths agree.
 *
 * Nothing here is regex-based or synthetic (INV-2): every colour comes from
 * getComputedStyle on a live, rendered, authenticated DOM.
 */

 

/** @type {() => (opts: { theme: string }) => any} */
export function contrastKernelFactory() {
    return function runContrastAudit(opts) {
        const theme = opts && opts.theme ? opts.theme : 'light';

        /* ---------------- colour resolution ---------------- */

        // Tailwind v4 emits oklch(), and modern Chromium also resolves
        // color(srgb ...)/lab()/oklab(). Rather than hand-rolling the OKLab
        // matrix -- exactly how dir017-contrast-triage.mjs hit its documented
        // "double-gamma oklch bug" -- we let the BROWSER flatten the colour to
        // sRGB bytes via a 1x1 canvas. One transfer, applied by the platform.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        /** @type {Map<string, any>} */
        const cache = new Map();

        /**
         * @param {string} value a computed CSS colour string
         * @returns {{rgb: number[], a: number}|null}
         */
        function resolveColor(value) {
            const s = String(value || '').trim();
            if (!s) return null;
            if (cache.has(s)) return cache.get(s) || null;
            let out = null;

            const legacy = s.match(/^rgba?\(([^)]+)\)$/i);
            if (legacy) {
                const parts = legacy[1].split(/[,\s/]+/).filter(Boolean).map(Number);
                if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
                    out = {
                        rgb: [parts[0], parts[1], parts[2]].map((v) => Math.round(v)),
                        a: parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1,
                    };
                }
            }

            if (!out) {
                let alpha = 1;
                const aMatch = s.match(/\/\s*([0-9.]+%?)\s*\)?\s*$/);
                if (aMatch) {
                    const raw = aMatch[1];
                    const parsed = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
                    if (!Number.isNaN(parsed)) alpha = parsed;
                }
                const opaque = alpha === 1 ? s : s.replace(/\/\s*[0-9.]+%?\s*\)?\s*$/, '');
                try {
                    ctx.clearRect(0, 0, 1, 1);
                    ctx.fillStyle = '#000000';
                    ctx.fillStyle = opaque;
                    ctx.fillRect(0, 0, 1, 1);
                    const px = ctx.getImageData(0, 0, 1, 1).data;
                    out = { rgb: [px[0], px[1], px[2]], a: alpha };
                } catch (_) {
                    out = null;
                }
            }

            cache.set(s, out);
            return out;
        }

        /* ---------------- WCAG 2.1 maths ---------------- */

        const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

        /** WCAG relative luminance: L = 0.2126R + 0.7152G + 0.0722B. */
        const luminance = (rgb) => (
            0.2126 * toLinear(rgb[0] / 255)
            + 0.7152 * toLinear(rgb[1] / 255)
            + 0.0722 * toLinear(rgb[2] / 255)
        );

        /** WCAG contrast: (L_bright + 0.05) / (L_dark + 0.05). */
        const contrastRatio = (fg, bg) => {
            const l1 = luminance(fg);
            const l2 = luminance(bg);
            const hi = l1 > l2 ? l1 : l2;
            const lo = l1 > l2 ? l2 : l1;
            return (hi + 0.05) / (lo + 0.05);
        };

        /** Source-over alpha compositing: A*C_fg + (1-A)*C_bg. */
        const composite = (fg, bg, alpha) => [
            fg[0] * alpha + bg[0] * (1 - alpha),
            fg[1] * alpha + bg[1] * (1 - alpha),
            fg[2] * alpha + bg[2] * (1 - alpha),
        ];

        const asRgb = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(', ')})`;

        /* ---------------- root canvas token ---------------- */

        const rootStyle = getComputedStyle(document.documentElement);
        const canvasToken = resolveColor(rootStyle.getPropertyValue('--cuba-canvas').trim());
        const ROOT_CANVAS = (canvasToken && canvasToken.a > 0 ? canvasToken.rgb : [255, 255, 255]).map(Math.round);

        /* ---------------- helpers ---------------- */

        /**
         * TRUE when any node in the ancestor chain is painted by something the
         * backgroundColor walk cannot represent. Those nodes are escalated to
         * the rasterised TRUTH path.
         */
        function chainNeedsTruthPath(node, maxDepth) {
            let n = node;
            let depth = 0;
            while (n && depth < maxDepth) {
                const cs = getComputedStyle(n);
                if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
                if (cs.backgroundBlendMode && cs.backgroundBlendMode !== 'normal') return true;
                if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return true;
                if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
                if (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') return true;
                if (cs.filter && cs.filter !== 'none') return true;
                n = n.parentElement;
                depth += 1;
            }
            return false;
        }

        /**
 * Parses the colour stops out of a computed `background-image` gradient.
 *
 * dir018 recorded the exact artifact this prevents: an element painted with a
 * linear-gradient reports `backgroundColor: rgba(0, 0, 0, 0)`, so the ancestor
 * walk skips straight past the paint to whatever card lies underneath and
 * reports a bogus white-on-white 1:1. The enterprise primary button
 * (`.enterprise-button-primary`) is a live instance: white ink on a
 * #4f46e5->#6366f1 gradient is really 4.47-6.29:1, yet the walk calls it 1.0.
 *
 * @param {string} backgroundImage a computed background-image value
 * @returns {Array<{rgb: number[], a: number}>}
 */
function gradientStops(backgroundImage) {
            if (!backgroundImage || backgroundImage === 'none') return [];
            const matches = backgroundImage.match(/rgba?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|#[0-9a-f]{3,8}/gi);
            if (!matches) return [];
            /** @type {Array<{rgb: number[], a: number}>} */
            const stops = [];
            for (const m of matches) {
                const parsed = resolveColor(m);
                if (parsed) stops.push(parsed);
            }
            return stops;
        }

        /**
         * FAST PATH: composite ancestor backgrounds down to the root canvas.
         *
         * WHY THIS IS TWO PHASES AND NOT ONE LOOP
         * A single upward loop that folds `backgroundColor` and `backgroundImage`
         * into one list conflates two different things. The ELEMENT'S OWN paint
         * sits ON TOP of its ancestors; the ancestors sit UNDERNEATH it. So the
         * backdrop is resolved to opacity FIRST, and only then is the element's
         * own paint composited over it.
         *
         * The previous single loop reset `gradientCandidates` the moment it met an
         * opaque ancestor, which also erased the ELEMENT'S OWN gradient -- an
         * ancestor's opaque fill cannot hide paint painted on top of it. That
         * manufactured white-on-white 1.0 readings on 124 elements that are really
         * 4.47-7.90:1 (`.enterprise-matrix-all-grant` x92,
         * `.enterprise-button-primary` x20, `.enterprise-chip-count` x4), because a
         * gradient-filled node reports `backgroundColor: rgba(0,0,0,0)` and the old
         * walk skipped straight past its own paint to the white card underneath.
         *
         * Splitting the phases removes the whole defect class rather than patching
         * its symptom: no ancestor can discard a nearer element's paint, because
         * the ancestor backdrop is finished before the element's own layers are
         * considered.
         *
         * Where a layer provides several stops the WORST stop wins, because a chip
         * that is readable at one end of its gradient and unreadable at the other
         * still fails for a real user.
         *
         * @param {Element} el
         * @param {number} maxDepth ancestor walk limit
         * @param {{rgb: number[]}} fg the element's own ink
         * @param {number} effAlpha effective ink alpha after ancestor opacities
         */
        function fastBackground(el, maxDepth, fg, effAlpha) {
            /* ---- phase 1: the opaque backdrop BENEATH the element ---------- */
            let backdrop = null;
            let reachedCanvas = true;
            let n = el.parentElement;
            let depth = 1;

            while (n && depth < maxDepth) {
                const cs = getComputedStyle(n);
                const c = resolveColor(cs.backgroundColor);

                if (c && c.a > 0) {
                    backdrop = backdrop === null
                        ? composite(c.rgb, ROOT_CANVAS, c.a)
                        : composite(backdrop, c.rgb, c.a);
                    if (c.a >= 1) {
                        reachedCanvas = false;
                        break;
                    }
                }

                // An ANCESTOR gradient is behind everything the element paints, so
                // it belongs to the backdrop rather than to the overlay. Its stops
                // are translucent by construction and must be resolved against
                // whatever lies behind them.
                const stops = gradientStops(cs.backgroundImage);
                if (stops.length) {
                    const under = backdrop === null ? ROOT_CANVAS : backdrop;
                    let worstStop = null;
                    for (const stop of stops) {
                        const flat = stop.a >= 1
                            ? stop.rgb.slice()
                            : composite(stop.rgb, under, stop.a);
                        if (!worstStop) { worstStop = flat; continue; }
                        const cand = contrastRatio(
                            effAlpha >= 1 ? fg.rgb : composite(fg.rgb, flat, effAlpha), flat,
                        );
                        const best = contrastRatio(
                            effAlpha >= 1 ? fg.rgb : composite(fg.rgb, worstStop, effAlpha), worstStop,
                        );
                        if (cand < best) worstStop = flat;
                    }
                    if (worstStop) backdrop = worstStop;
                }

                n = n.parentElement;
                depth += 1;
            }

            if (backdrop === null) backdrop = ROOT_CANVAS;

            /* ---- phase 2: the element's OWN paint, layered over that ------- */
            const own = getComputedStyle(el);
            /** @type {Array<{rgb: number[], a: number}>} */
            const overlays = [];

            const ownColor = resolveColor(own.backgroundColor);
            if (ownColor && ownColor.a > 0) {
                // A fully opaque own-fill IS the backdrop: nothing beneath it can
                // reach the text, so the ancestor walk above was redundant but
                // harmless and we short-circuit here.
                if (ownColor.a >= 1) {
                    const flat = ownColor.rgb.map(Math.round);
                    const fgFlat = effAlpha >= 1 ? fg.rgb : composite(fg.rgb, flat, effAlpha);
                    return {
                        rgb: flat,
                        stoppedAtDepth: 0,
                        reachedCanvas: false,
                        worstStopRatio: contrastRatio(fgFlat, flat),
                    };
                }
                overlays.push(ownColor);
            }

            for (const stop of gradientStops(own.backgroundImage)) {
                overlays.push(stop);
            }

            const base = backdrop.map(Math.round);

            if (!overlays.length) {
                const fgFlat = effAlpha >= 1 ? fg.rgb : composite(fg.rgb, base, effAlpha);
                return {
                    rgb: base,
                    stoppedAtDepth: null,
                    reachedCanvas,
                    worstStopRatio: contrastRatio(fgFlat, base),
                };
            }

            // Judge the element against the WORST pixel its own paint can produce:
            // every stop, each flattened against the backdrop resolved above. This
            // is where the element's own gradient finally gets scored -- the case
            // the previous implementation dropped on the floor.
            let worst = null;
            for (const overlay of overlays) {
                const bg = (overlay.a >= 1
                    ? overlay.rgb
                    : composite(overlay.rgb, base, overlay.a)).map(Math.round);
                const fgFlat = effAlpha >= 1 ? fg.rgb : composite(fg.rgb, bg, effAlpha);
                const ratio = contrastRatio(fgFlat, bg);
                if (!worst || ratio < worst.ratio) worst = { rgb: bg, ratio };
            }

            return {
                rgb: worst.rgb,
                stoppedAtDepth: 0,
                reachedCanvas: false,
                worstStopRatio: worst.ratio,
            };
        }

        /** Product of every effective opacity between the text and the root. */
        function effectiveTextAlpha(el, ownAlpha, maxDepth) {
            let alpha = ownAlpha;
            let n = el.parentElement;
            let depth = 0;
            while (n && depth < maxDepth) {
                const o = parseFloat(getComputedStyle(n).opacity);
                if (!Number.isNaN(o) && o < 1) alpha *= o;
                n = n.parentElement;
                depth += 1;
            }
            return alpha;
        }

        /* ---------------- text node selection ---------------- */

        const TEXT_SELECTOR = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'span', 'a', 'button', 'input', 'textarea', 'label',
            'li', 'td', 'th', 'summary', 'legend', 'caption', 'blockquote', 'dt', 'dd',
            '[role="badge"]', '[role="alert"]', '[role="status"]',
            '.cuba-pill', '.cuba-badge', '[data-cuba-badge]',
        ].join(',');

        const MAX_DEPTH = 32;

        /**
 * ASSISTIVE / VISUALLY-HIDDEN TEXT IS NOT PAINTED TEXT.
 *
 * `.cuba-sr-only`, Tailwind's `.sr-only`, Bootstrap's `.visually-hidden` and
 * anything carrying `clip: rect(0,0,0,0)` are screen-reader-only text. They are
 * deliberately painted to a 1x1 box and clipped to nothing: there is no pixel on
 * screen for a user to read, so WCAG 2.1 SC 1.4.3 (Contrast Minimum) has nothing
 * to measure. Scoring them produces false failures -- the census recorded 122 of
 * them at 7.93:1 "failing" purely because the clipped 1x1 box resolves its own
 * colours rather than its parent's.
 *
 * Detection is BEHAVIOURAL (computed style + ARIA), not a class-name regex
 * alone, so a component that hand-rolls the technique is caught too:
 *   - the standard 1x1 + overflow:hidden + clip/clip-path recipe,
 *   - clip-path: inset(50%) / inset(100%),
 *   - aria-hidden="true", which removes the subtree from the a11y tree,
 *   - display/visibility already handled by isAuditable.
 *
 * @param {Element} el
 * @param {CSSStyleDeclaration} cs
 * @returns {string|null} the matched reason, or null when it is painted
 */
        function assistiveHiddenReason(el, cs) {
            if (el.getAttribute('aria-hidden') === 'true') return 'ARIA_HIDDEN';

            const className = typeof el.className === 'string' ? el.className : '';
            if (/(^|\s)(cuba-sr-only|sr-only|visually-hidden|vh)(\s|$)/i.test(className)) {
                return 'SR_ONLY_CLASS';
            }

            // The legacy `clip` property: Chromium reports the used value.
            const clip = String(cs.clip || '').toLowerCase().replace(/\s+/g, '');
            if (/^rect\(0(?:px)?,0(?:px)?,0(?:px)?,0(?:px)?\)$/.test(clip)) return 'CLIP_RECT_ZERO';

            // The modern equivalent, and the 1x1 clip recipe.
            const clipPath = String(cs.clipPath || '').toLowerCase();
            if (/inset\(\s*(50|100)%/.test(clipPath)) return 'CLIP_PATH_INSET';

            const w = parseFloat(cs.width);
            const h = parseFloat(cs.height);
            const overflowHidden = cs.overflow === 'hidden' || cs.overflowX === 'hidden';
            if (!Number.isNaN(w) && !Number.isNaN(h) && w <= 1 && h <= 1 && overflowHidden) {
                return 'ONE_PIXEL_CLIPPED_BOX';
            }
            return null;
        }

        /**
         * INV-4 EXEMPTION. Ink-conserving printer rules legitimately hardcode
         * #ffffff / #000000 and are excluded from dark-mode judgement by
         * directive. Detection is behavioural rather than a raw-hex scan.
         */
        function isPrintOnly(node) {
            let n = node;
            let depth = 0;
            while (n && depth < 16) {
                if (typeof n.className === 'string' && /print-(only|exclusive)/i.test(n.className)) return true;
                n = n.parentElement;
                depth += 1;
            }
            return false;
        }

        /**
 * Whether this node paints its OWN text directly onto its OWN backdrop.
 *
 * A container that wraps icons, avatars or nested cards does NOT: its
 * bounding box contains other elements' paints, so sampling the box measures
 * the descendants, not the text. That is precisely how the first truth-path
 * run produced 2,738 bogus readings (a nav row picking up its avatar's pink).
 *
 * The fast path remains authoritative for containers -- it walks real
 * computed ancestry -- so restricting truth sampling to leaf text loses no
 * coverage and removes the entire false-positive class.
 */
function isLeafText(el) {
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
        return false;
    }
    // Replaced content (icons, images, SVGs) inside the box also means the box
    // is not purely this text's own paint.
    return true;
}

/** Text a node actually paints. Inputs use value/placeholder. */
        function visibleTextOf(el) {
            if (el.tagName === 'INPUT') {
                if (el.type === 'submit' || el.type === 'button') return String(el.value || '');
                return String(el.value || el.placeholder || '');
            }
            if (el.tagName === 'TEXTAREA') return String(el.placeholder || '');
            if (el.tagName === 'IMG' || el.tagName === 'SVG') return '';
            return String(el.textContent || '');
        }

        /**
         * Whether this node is scored, and if not, WHY.
         *
         * The three outcomes are genuinely different and are returned as a
         * discriminated object because collapsing them is what broke this the
         * first time: an earlier revision returned a bare string reason and
         * `null` for everything else, so "not rendered, drop it" and "rendered,
         * score it" became indistinguishable and the drop path silently started
         * SCORING decorative swatches. `skip` is the only field that decides
         * whether the node reaches the census.
         *
         * Assistive text is exempt from WCAG 2.1 SC 1.4.3 (there is no painted
         * pixel to measure) but the exemption carries a `reason`, so it is counted
         * rather than dropped -- a silent exclusion is indistinguishable from an
         * auditor that simply stopped working.
         *
         * @param {Element} el
         * @param {CSSStyleDeclaration} cs
         * @returns {{skip: true, reason: string|null}|{skip: false}}
         */
        function isAuditable(el, cs) {
            const drop = { skip: true, reason: null };
            if (!cs || !el.isConnected) return drop;
            if (cs.display === 'none' || cs.visibility === 'hidden') return drop;
            if (cs.contentVisibility === 'hidden') return drop;
            const ownOpacity = parseFloat(cs.opacity);
            if (!Number.isNaN(ownOpacity) && ownOpacity === 0) return drop;

            // Checked BEFORE the geometry gate below. `.cuba-sr-only` is a 1x1
            // box, so it passes a `rect < 1` test only marginally, and ordering it
            // first makes the assistive verdict independent of how a particular
            // browser rounds a clipped box.
            const assistive = assistiveHiddenReason(el, cs);
            if (assistive) return { skip: true, reason: `ASSISTIVE_HIDDEN:${assistive}` };

            const rect = el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return drop;

            // A node must actually PAINT text. A decorative swatch has no WCAG
            // 1.4.3 obligation: the empty status dot in JobCard.jsx
            // (`<span className="w-1.5 h-1.5 rounded-sm bg-slate-400" />`) is a
            // pure background chip, and scoring it reported its inherited colour
            // against its own fill as a 1.0:1 "failure" 40 times over. Requiring
            // text content cannot hide a real label, because a visible label
            // always contributes text of its own.
            if (!visibleTextOf(el).trim()) return drop;

            return { skip: false };
        }

        /* ---------------- main sweep ---------------- */

        /** @type {any[]} */
        const results = [];
        const nodes = Array.from(document.querySelectorAll(TEXT_SELECTOR));

        for (const el of nodes) {
            const cs = getComputedStyle(el);
            // `skip` alone decides whether the node is measured. An exemption
            // additionally carries a reason so it is COUNTED in the census --
            // dropping it silently would be indistinguishable from the auditor
            // having quietly stopped auditing that class of node.
            const verdict = isAuditable(el, cs);
            if (verdict.skip) {
                if (verdict.reason) {
                    results.push({
                        exempt: verdict.reason,
                        tag: el.tagName.toLowerCase(),
                        text: visibleTextOf(el).trim().slice(0, 60),
                        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 140),
                    });
                }
                continue;
            }
            if (isPrintOnly(el)) {
                results.push({
                    exempt: 'INV4_PRINT_MEDIA',
                    tag: el.tagName.toLowerCase(),
                    text: visibleTextOf(el).trim().slice(0, 60),
                });
                continue;
            }

            const fg = resolveColor(cs.color);
            if (!fg) continue;

            const fontSizePx = parseFloat(cs.fontSize) || 0;
            const fontWeight = parseInt(cs.fontWeight, 10) || 400;
            const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
            const requiredRatio = isLargeText ? 3.0 : 4.5;

            const effAlpha = effectiveTextAlpha(el, fg.a, MAX_DEPTH);
            const bg = fastBackground(el, MAX_DEPTH, fg, effAlpha);
            const flatFg = effAlpha >= 1 ? fg.rgb : composite(fg.rgb, bg.rgb, effAlpha);
            const ratio = contrastRatio(flatFg, bg.rgb);

            const rect = el.getBoundingClientRect();
            const className = typeof el.className === 'string' ? el.className : '';

            results.push({
                exempt: null,
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role') || '',
                text: visibleTextOf(el).trim().slice(0, 80),
                cls: className.slice(0, 140),
                fontSizePx,
                fontWeight,
                isLargeText,
                requiredRatio,
                color: cs.color,
                foregroundRgb: fg.rgb.map(Math.round),
                foregroundAlpha: Number(effAlpha.toFixed(4)),
                rect: {
                    x: Math.round(rect.x), y: Math.round(rect.y),
                    w: Math.round(rect.width), h: Math.round(rect.height),
                },
                // Escalation flag for the rasterised TRUTH path. Only a LEAF text node can be
                // pixel-sampled honestly; a container's box also holds its
                // descendants' paints, so sampling it would measure them.
                leafText: isLeafText(el),
                needsTruthPath: chainNeedsTruthPath(el, MAX_DEPTH),
                fastPath: {
                    background: asRgb(bg.rgb),
                    foreground: asRgb(flatFg),
                    ratio: Number(ratio.toFixed(3)),
                    reachedCanvas: bg.reachedCanvas,
                },
            });
        }

        return {
            theme,
            dataThemeAttr: document.documentElement.getAttribute('data-theme'),
            htmlClass: typeof document.documentElement.className === 'string' ? document.documentElement.className : '',
            colorScheme: rootStyle.colorScheme,
            rootCanvas: asRgb(ROOT_CANVAS),
            devicePixelRatio: window.devicePixelRatio || 1,
            scroll: {
                x: Math.round(window.scrollX), y: Math.round(window.scrollY),
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
            },
            candidatesScanned: nodes.length,
            results,
        };
    };
}

export default contrastKernelFactory;