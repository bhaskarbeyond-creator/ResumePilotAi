// @ts-check
/**
 * DIR-023: TRUTH PATH -- real rasterised-pixel contrast measurement.
 *
 * WHY THIS EXISTS
 * The FAST PATH (dir023-contrast-engine.mjs) is the directive's mandated
 * ancestor alpha-compositing walk. It is mathematically exact for opaque and
 * alpha-composited backgrounds, but it is PROVABLY WRONG for anything the
 * browser composites through a paint the walk never sees:
 *
 *   - background-image gradients      (the walk reads backgroundColor =
 *     rgba(0,0,0,0) and walks past the paint to the card below, yielding
 *     white-on-white: the false ratio 1 and 1.48 recorded by
 *     dir018-contrast-diagnostic.mjs)
 *   - background-blend-mode / mix-blend-mode  (unmodellable by alpha at all;
 *     cuba-tokens.css:857 .cuba-widget-texture uses background-blend-mode:overlay)
 *   - backdrop-filter / filter       (the compositor samples the backdrop from
 *     behind the element)
 *
 * The dir012 precedent proves the danger runs BOTH ways: skipping a painted
 * layer can also manufacture a FALSE PASS (a bogus 17:1), letting a genuine
 * dark-mode inversion ship silently.
 *
 * THE FIX: stop modelling the compositor and ASK IT.
 * Playwright screenshots the page -- that is the browser's own rasteriser
 * output. sharp decodes the PNG to raw bytes. For each element we then:
 *   1. crop the element's box out of the REAL frame,
 *   2. separate GLYPH pixels from BACKGROUND pixels using the element's own
 *      declared text colour as the reference (glyph pixels cluster tightly
 *      around it; the surface clusters elsewhere),
 *   3. take the WORST (lowest-contrast) real pairing present in the crop, so a
 *      gradient readable at one end and unreadable at the other still fails,
 *   4. compute WCAG 2.1 luminance on those REAL sampled bytes.
 *
 * Ground truth by construction (INV-2): the numbers come out of pixels the
 * compositor produced, not out of a stylesheet model.
 */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** WCAG 2.1 relative luminance from 0-255 sRGB bytes. */
export function relativeLuminance([r, g, b]) {
    return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

/** WCAG 2.1 contrast ratio from 0-255 sRGB byte triples. */
export function contrastRatio(fg, bg) {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const hi = l1 > l2 ? l1 : l2;
    const lo = l1 > l2 ? l2 : l1;
    return (hi + 0.05) / (lo + 0.05);
}

const dist2 = (a, b) => {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
};

/**
 * Dominant BACKGROUND colour of a raw RGB crop, by modal quantised colour. In a
 * text crop the glyph coverage is far below 50% of the box, so the modal colour
 * is the surface behind the glyphs.
 * @param {{data: Buffer, width: number, height: number}} raw
 * @returns {[number, number, number]}
 */
function modalColour(raw) {
    const buckets = new Map();
    const { data, width, height } = raw;
    // Quantise to 16 levels/channel so antialiasing noise does not split one
    // visual colour into hundreds of near-empty buckets.
    for (let i = 0; i < width * height; i += 1) {
        const o = i * 3;
        const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { n: 0, r: 0, g: 0, b: 0 };
            buckets.set(key, bucket);
        }
        bucket.n += 1;
        bucket.r += data[o]; bucket.g += data[o + 1]; bucket.b += data[o + 2];
    }
    let best = null;
    for (const bucket of buckets.values()) {
        if (!best || bucket.n > best.n) best = bucket;
    }
    if (!best) return [255, 255, 255];
    return [
        Math.round(best.r / best.n),
        Math.round(best.g / best.n),
        Math.round(best.b / best.n),
    ];
}

/**
 * Finds the real glyph-vs-background pairing with the WORST contrast inside a
 * crop, using the element's declared text colour as the glyph reference.
 *
 * @param {{data: Buffer, width: number, height: number}} raw crop pixels
 * @param {number[]} declaredTextRgb the element's own computed colour
 */
function worstRealPairing(raw, declaredTextRgb) {
    const { data, width, height } = raw;
    const total = width * height;
    if (total === 0) return { glyph: declaredTextRgb, background: [255, 255, 255], glyphShare: 0, candidates: 0 };

    // Pixels close to the declared text colour are the rendered glyphs. The
    // tolerance admits antialiased edges and gradient-shaded text while
    // rejecting the surface.
    const glyphTolerance = 110 * 110;
    const glyphSum = [0, 0, 0];
    let glyphCount = 0;
    /** @type {Map<number, any>} */
    const bgBuckets = new Map();

    for (let i = 0; i < total; i += 1) {
        const o = i * 3;
        const px = [data[o], data[o + 1], data[o + 2]];
        if (dist2(px, declaredTextRgb) <= glyphTolerance) {
            glyphSum[0] += px[0]; glyphSum[1] += px[1]; glyphSum[2] += px[2];
            glyphCount += 1;
        } else {
            const key = ((px[0] >> 4) << 8) | ((px[1] >> 4) << 4) | (px[2] >> 4);
            let bucket = bgBuckets.get(key);
            if (!bucket) {
                bucket = { n: 0, r: 0, g: 0, b: 0 };
                bgBuckets.set(key, bucket);
            }
            bucket.n += 1;
            bucket.r += px[0]; bucket.g += px[1]; bucket.b += px[2];
        }
    }

    const glyph = glyphCount > 0
        ? [Math.round(glyphSum[0] / glyphCount), Math.round(glyphSum[1] / glyphCount), Math.round(glyphSum[2] / glyphCount)]
        : declaredTextRgb;

    // Only pixels well clear of the glyph colour are candidates for "surface".
    // Pixels adjacent to the glyph are antialiasing fringes, and treating them
    // as background is what manufactures a bogus near-1:1 reading.
    let surfaceCount = 0;
    for (const bucket of bgBuckets.values()) surfaceCount += bucket.n;

    // Evaluate the declared glyph colour against every GENUINE surface the crop
    // really contains and keep the worst, so a gradient that is readable over
    // one stop and unreadable over another still fails.
    //
    // Two guards keep this honest, and both were learned from the dir012/dir018
    // artifacts this path exists to defeat:
    //   MIN_SURFACE_SHARE -- a real backdrop occupies a large share of the box.
    //     A 1% bucket is an antialiasing fringe or a sliver of a descendant
    //     paint, not the surface the text sits on.
    //   plausible glyph share -- if the box does not actually contain this
    //     text (clipped, occluded, or a container whose children carry their
    //     own backgrounds) the crop cannot be judged at all, so we return
    //     unmeasured instead of inventing a verdict.
    const MIN_SURFACE_SHARE = 0.15;
    let worstBg = modalColour(raw);
    let worstRatio = contrastRatio(glyph, worstBg);
    let candidateCount = 0;

    for (const bucket of bgBuckets.values()) {
        if (surfaceCount > 0 && bucket.n / surfaceCount < MIN_SURFACE_SHARE) continue;
        candidateCount += 1;
        const bg = [Math.round(bucket.r / bucket.n), Math.round(bucket.g / bucket.n), Math.round(bucket.b / bucket.n)];
        const ratio = contrastRatio(glyph, bg);
        if (ratio < worstRatio) {
            worstRatio = ratio;
            worstBg = bg;
        }
    }

    return {
        glyph,
        background: worstBg,
        glyphShare: glyphCount / total,
        candidates: candidateCount,
        // Too few glyph pixels => the crop does not really show this text.
        measurable: glyphCount / total >= 0.004 && candidateCount > 0,
    };
}

/**
 * Measures real painted contrast for candidate elements against a captured PNG
 * frame of the page.
 *
 * @param {Buffer} pngBuffer PNG bytes from a Playwright screenshot
 * @param {number} devicePixelRatio
 * @param {any[]} candidates FAST-path rows needing truth verification
 * @returns {Promise<Map<number, any>>} candidate index -> truth measurement
 */
export async function measureTruthFromFrame(pngBuffer, devicePixelRatio, candidates) {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(pngBuffer).metadata();
    const frameWidth = meta.width || 0;
    const frameHeight = meta.height || 0;
    if (!frameWidth || !frameHeight) return new Map();

    /** @type {Map<number, any>} */
    const out = new Map();
    const dpr = devicePixelRatio || 1;

    for (let index = 0; index < candidates.length; index += 1) {
        const row = candidates[index];
        const rect = row.rect || {};
        // Clamp to the frame. An off-frame or zero-area element yields no
        // trustworthy sample and is reported UNMEASURED rather than guessed.
        const left = Math.max(0, Math.round(rect.x * dpr));
        const top = Math.max(0, Math.round(rect.y * dpr));
        const right = Math.min(frameWidth, Math.round((rect.x + rect.w) * dpr));
        const bottom = Math.min(frameHeight, Math.round((rect.y + rect.h) * dpr));
        const width = right - left;
        const height = bottom - top;
        if (width < 2 || height < 2) continue;

        try {
            const { data, info } = await sharp(pngBuffer)
                .extract({ left, top, width, height })
                .removeAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const pairing = worstRealPairing({ data, width: info.width, height: info.height }, row.foregroundRgb);

            // A crop that does not actually contain the text (clipped,
            // occluded, or a container whose children own their own backgrounds)
            // cannot be judged. Reporting unmeasured is correct; inventing a
            // verdict here is exactly the probe artifact this path exists to
            // prevent, so the caller falls back to the exact fast path.
            if (!pairing.measurable) continue;

            const modelRatio = typeof row.fastPath?.ratio === 'number' ? row.fastPath.ratio : null;
            const truthRatio = contrastRatio(pairing.glyph, pairing.background);

            out.set(index, {
                sampled: true,
                sample: {
                    left, top, width, height,
                    glyph: pairing.glyph,
                    background: pairing.background,
                    glyphPixelShare: Number(pairing.glyphShare.toFixed(4)),
                    backgroundCandidates: pairing.candidates,
                },
                truthRatio: Number(truthRatio.toFixed(3)),
                modelRatio,
                // A divergence beyond 0.75:1 means the alpha walk and the real
                // compositor disagree -- the artifact class behind the dir012
                // false 17:1.
                diverged: modelRatio === null ? false : Math.abs(modelRatio - truthRatio) > 0.75,
            });
        } catch (_) {
            // Unreadable crop: left unmeasured; caller falls back to fast path.
        }
    }

    return out;
}

export default measureTruthFromFrame;