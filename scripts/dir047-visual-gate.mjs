// @ts-check
/**
 * DIR-047 Vector 6 -- the gate that actually drives scripts/dir047-visual-diff.mjs.
 *
 * WHY THIS EXISTS
 *   The directive's Vector 6 asks for "pure Node.js PNG unfiltering and Euclidean delta-E
 *   colour distance comparison against certified baseline screenshot artifacts", with a
 *   0.05% drift trigger. The engine for that was written (scripts/dir047-visual-diff.mjs)
 *   but nothing ever called it, so an engine with no runner certifies nothing: a release
 *   gate that has never been executed is indistinguishable from one that always passes.
 *   This module is the runner.
 *
 * THE FOUR CHECKS, AND WHY EACH ONE IS NEEDED
 *   1. DECODER ORACLE. verifyDecoderAgainstSharp() re-decodes real captures through an
 *      independent decoder and requires byte-for-byte agreement. Without it a subtly wrong
 *      unfilter implementation would report a confident, plausible, incorrect drift figure,
 *      which is the most dangerous failure mode a visual gate can have.
 *   2. FALSE-POSITIVE CONTROL. Every current capture is diffed against ITSELF and must
 *      report exactly 0 drifted pixels. This is the check that stops the gate from crying
 *      wolf on identical bytes.
 *   3. SENSITIVITY CONTROL. A real capture is perturbed by a KNOWN amount (+12 per channel
 *      over a 60x40 block) and the engine must both detect it and place the worst samples
 *      inside the block that was actually changed. A gate that cannot fail is not a gate,
 *      and this is the only check that proves this one can.
 *   4. BASELINE vs CURRENT. Every shot is diffed against its baseline counterpart and the
 *      directive's 0.05% trigger is applied to the drifted-pixel fraction.
 *
 * HONEST SCOPE STATEMENT
 *   The baseline is established by the SAME capture run that produced the current pass
 *   (scripts/dir047-visual-capture.mjs writes baseline/ and current/ seconds apart). There
 *   was no pre-existing 4-portal two-theme baseline to diff against -- the certified set in
 *   crawl-artifacts/screenshots/baseline is a different corpus at different geometries, and
 *   diffing across those would compare different layouts rather than drift. So check 4
 *   measures RENDER REPRODUCIBILITY, which is the property that makes every future
 *   visual-regression report meaningful, and it is reported as exactly that rather than as a
 *   claim of historical stability. The baseline now exists on disk for later directives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, compareImages, verifyDecoderAgainstSharp, deltaE76 } from './dir047-visual-diff.mjs';

const EVIDENCE = path.resolve('.bridge/evidence');
const CENSUS_PATH = path.join(EVIDENCE, 'dir047-portal-visual-crawl.json');
const REPORT_PATH = path.join(EVIDENCE, 'dir047-visual-gate.json');

/** The directive's own trigger: drift above this fraction of the frame is a review item. */
const DRIFT_TRIGGER_PCT = 0.05;

const read = (p) => decodePng(fs.readFileSync(p));
const abs = (rel) => path.join(EVIDENCE, rel);

/** Perturbs a known 60x40 block by +12 per channel so drift has a known location and size. */
function perturb(decoded) {
    const clone = { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data) };
    const x0 = 100;
    const y0 = 100;
    const w = 60;
    const h = 40;
    for (let y = y0; y < y0 + h; y += 1) {
        for (let x = x0; x < x0 + w; x += 1) {
            const p = (y * clone.width + x) * 3;
            clone.data[p] = Math.min(255, clone.data[p] + 12);
            clone.data[p + 1] = Math.min(255, clone.data[p + 1] + 12);
            clone.data[p + 2] = Math.min(255, clone.data[p + 2] + 12);
        }
    }
    return { clone, block: { x: x0, y: y0, w, h, areaPx: w * h } };
}

async function main() {
    const started = Date.now();
    console.log('DIR-047 Vector 6 -- visual diff gate');
    const failures = [];

    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
    const baselineShots = census.shots.filter((s) => s.pass === 'A');
    const currentShots = census.shots.filter((s) => s.pass === 'B');
    const key = (s) => `${s.theme}/${s.breakpoint}/${s.portal}`;
    const byKey = new Map(baselineShots.map((s) => [key(s), s]));

    console.log(`census: ${census.shotCount} shots (${baselineShots.length} baseline / ${currentShots.length} current)`);

    // ---- 1. Decoder oracle ------------------------------------------------------------
    const oracleSamples = [
        currentShots[0],
        currentShots[Math.floor(currentShots.length / 2)],
        currentShots[currentShots.length - 1],
    ].filter(Boolean);
    const oracle = [];
    for (const shot of oracleSamples) {
        const verdict = await verifyDecoderAgainstSharp(abs(shot.file));
        oracle.push({ file: shot.file, verdict: verdict.verdict, width: verdict.width, height: verdict.height, bytes: verdict.bytes });
        console.log(`  oracle: ${shot.file} -> ${verdict.verdict} (${verdict.width}x${verdict.height})`);
    }
    if (oracle.some((o) => o.verdict !== 'IDENTICAL')) {
        failures.push('decoder oracle disagreed with sharp on at least one capture');
    }

    // ---- 2. False-positive control ----------------------------------------------------
    let selfDiffMax = 0;
    for (const shot of currentShots) {
        const image = read(abs(shot.file));
        const report = compareImages(image, image);
        selfDiffMax = Math.max(selfDiffMax, report.driftPct);
    }
    console.log(`  self-diff max drift: ${selfDiffMax}% (must be 0)`);
    if (selfDiffMax !== 0) failures.push(`identical inputs reported ${selfDiffMax}% drift`);

    // ---- 3. Sensitivity control -------------------------------------------------------
    const control = currentShots[0];
    const controlImage = read(abs(control.file));
    const { clone, block } = perturb(controlImage);
    const controlReport = compareImages(controlImage, clone);
    const detectedPct = (block.areaPx / (controlImage.width * controlImage.height)) * 100;
    const worstInsideBlock = controlReport.worstSamples.every(
        (s) => s.x >= block.x && s.x < block.x + block.w && s.y >= block.y && s.y < block.y + block.h,
    );
    const sensitivity = {
        file: control.file,
        injectedBlock: block,
        injectedPctOfFrame: Number(detectedPct.toFixed(4)),
        detectedDriftPct: controlReport.driftPct,
        detectedPixels: controlReport.driftedPixels,
        worstSamples: controlReport.worstSamples,
        worstSamplesInsideInjectedBlock: worstInsideBlock,
        triggerPct: DRIFT_TRIGGER_PCT,
    };
    console.log(`  sensitivity: injected ${detectedPct.toFixed(4)}% -> detected ${controlReport.driftPct}% (${controlReport.driftedPixels} px)`);
    if (controlReport.driftPct <= DRIFT_TRIGGER_PCT) {
        failures.push(`sensitivity control: a ${detectedPct.toFixed(4)}% perturbation was NOT detected above the ${DRIFT_TRIGGER_PCT}% trigger`);
    }
    if (controlReport.driftedPixels < block.areaPx * 0.5) {
        failures.push(`sensitivity control: only ${controlReport.driftedPixels} of ${block.areaPx} perturbed pixels were flagged`);
    }
    if (!worstInsideBlock) failures.push('sensitivity control: worst-diff samples were localised outside the perturbed block');


    // ---- 4. Baseline vs current -------------------------------------------------------
    const rows = [];
    for (const shot of currentShots) {
        const base = byKey.get(key(shot));
        if (!base) {
            failures.push(`no baseline counterpart for ${key(shot)}`);
            continue;
        }
        const baseImage = read(abs(base.file));
        const currImage = read(abs(shot.file));
        const report = compareImages(baseImage, currImage);
        const row = {
            theme: shot.theme,
            breakpoint: shot.breakpoint,
            portal: shot.portal,
            baselineFile: base.file,
            currentFile: shot.file,
            dimensionMismatch: report.dimensionMismatch,
            driftPct: report.driftPct,
            driftedPixels: report.driftedPixels,
            totalPixels: report.totalPixels,
            maxDeltaE: report.maxDeltaE,
            meanDeltaE: report.meanDeltaE,
            geometry: { baseline: base.geometry, current: shot.geometry },
            exceedsTrigger: report.driftPct > DRIFT_TRIGGER_PCT,
            worstSamples: report.worstSamples.slice(0, 3),
        };
        rows.push(row);
        if (row.exceedsTrigger) {
            failures.push(`visual drift ${report.driftPct}% (> ${DRIFT_TRIGGER_PCT}%) on ${shot.theme}/${shot.breakpoint}px ${shot.portal}`);
        }
    }

    const driftValues = rows.map((r) => r.driftPct);
    const report = {
        directive: 'DIR-047',
        vector: 'Vector 6 -- pure Node.js visual diffing',
        engine: 'scripts/dir047-visual-diff.mjs',
        runner: 'scripts/dir047-visual-gate.mjs',
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        driftTriggerPct: DRIFT_TRIGGER_PCT,
        distancesComputed: ['CIE76 delta-E*ab (gate)', 'Euclidean RGB (reported alongside)'],
        decoderOracle: {
            samples: oracle,
            verdict: oracle.every((o) => o.verdict === 'IDENTICAL') ? 'IDENTICAL' : 'MISMATCH',
        },
        falsePositiveControl: { selfDiffMaxDriftPct: selfDiffMax, verdict: selfDiffMax === 0 ? 'CLEAN' : 'NOISY' },
        sensitivityControl: sensitivity,
        baselineVsCurrent: {
            comparedShots: rows.length,
            minDriftPct: driftValues.length ? Math.min(...driftValues) : null,
            maxDriftPct: driftValues.length ? Math.max(...driftValues) : null,
            meanDriftPct: driftValues.length
                ? Number((driftValues.reduce((a, b) => a + b, 0) / driftValues.length).toFixed(6))
                : null,
            shotsExceedingTrigger: rows.filter((r) => r.exceedsTrigger).length,
            rows,
        },
        scopeStatement: 'Baseline and current are produced by one capture run seconds apart, because no pre-existing 4-portal two-theme baseline existed. Check 4 therefore measures render reproducibility and seeds the baseline for future directives; it is not a claim of historical pixel stability.',
        deltaESanityBlackVsWhite: deltaE76(0, 0, 0, 255, 255, 255),
        verdict: failures.length === 0 ? 'PASS' : 'FAIL',
        failures,
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nreport -> ${path.relative(process.cwd(), REPORT_PATH)}`);
    console.log(`drift: min ${report.baselineVsCurrent.minDriftPct}% / max ${report.baselineVsCurrent.maxDriftPct}% / mean ${report.baselineVsCurrent.meanDriftPct}%`);
    console.log(`exceeding ${DRIFT_TRIGGER_PCT}% trigger: ${report.baselineVsCurrent.shotsExceedingTrigger}`);
    console.log(`deltaE(black,white) sanity: ${report.deltaESanityBlackVsWhite.toFixed(2)}`);
    console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (failures.length) {
        console.error(`\nVERDICT: FAIL (${failures.length})`);
        failures.slice(0, 20).forEach((f) => console.error(`  - ${f}`));
        process.exitCode = 1;
    } else {
        console.log('\nVERDICT: PASS');
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exitCode = 1;
});

