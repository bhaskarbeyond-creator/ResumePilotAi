import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
    getBulletAnalysis,
    ensureAtsOptimizedBullet,
    hasStrongActionVerb,
    detectLegitimateMetric,
} from '../src/utils/bulletQuality.js';

const require = createRequire(import.meta.url);
const { buildGroundedPrompt } = require('../backend/services/aiRuntime.js');

test('Bullet Length Calibration: 246-char bullet with metrics is Amber (not hard Red) and preserves action verb & metric', () => {
    const userScreenshotBullet = 'Led clinical investigation and protocol standardization for Clinical Quality & Patient Safety Protocol Audit, driving 25% improvement in diagnostic accuracy and care quality through optimized use of EHR, Clinical Audit, and JCAHO/NABH Guidelines.';
    
    assert.equal(userScreenshotBullet.length, 246, 'Bullet from screenshot must be 246 characters');
    assert.equal(hasStrongActionVerb(userScreenshotBullet), true, 'Must detect action verb "Led"');
    assert.equal(detectLegitimateMetric(userScreenshotBullet), true, 'Must detect metric "25%"');

    const analysis = getBulletAnalysis(userScreenshotBullet); // Default maxLength is 260
    assert.equal(analysis.hasActionVerb, true, 'hasActionVerb must NOT be wiped out to false');
    assert.equal(analysis.hasMetric, true, 'hasMetric must NOT be wiped out to false');
    assert.equal(analysis.status, 'amber', '246-char bullet must be amber warning, not broken red error');
    assert.match(analysis.badgeText, /Good/, 'Badge should reflect Good status');
    assert.match(analysis.tip, /under 220 characters/, 'Tip should advise trimming under 220 chars for 2-line layout');
});

test('Bullet Length Calibration: Over 260 characters triggers Red "Exceeds Length Limit" while preserving flags', () => {
    const veryLongBullet = 'Spearheaded comprehensive enterprise hospital modernization initiative across 15 regional trauma centers, standardizing electronic health records, reducing patient admission cycle time by 42%, training 250 clinical staff, and achieving 100% compliance with national health protocols.';
    assert.ok(veryLongBullet.length > 260, `Bullet is ${veryLongBullet.length} chars (exceeds 260)`);

    const analysis = getBulletAnalysis(veryLongBullet);
    assert.equal(analysis.status, 'red', 'Must be red when exceeding 260 chars');
    assert.equal(analysis.badgeText, 'Exceeds Length Limit');
    assert.equal(analysis.hasActionVerb, true, 'Action verb preserved even when over limit');
    assert.equal(analysis.hasMetric, true, 'Metric preserved even when over limit');
});

test('ensureAtsOptimizedBullet: Streamlines verbose AI filler phrases', () => {
    const verbose = 'Spearheaded patient protocol upgrades through optimized use of Epic Systems, improving clinical accuracy by 25%.';
    const optimized = ensureAtsOptimizedBullet(verbose);
    assert.equal(optimized.includes('through optimized use of'), false, 'Must replace "through optimized use of"');
    assert.ok(optimized.includes('utilizing Epic Systems'), 'Must use concise "utilizing"');
});

test('Backend AI Runtime Prompt Builder: Enforces 120-190 char limits and anti-repetition', () => {
    const { user } = buildGroundedPrompt('enhance-single-bullet', {
        projectName: 'Clinical Quality & Patient Safety Protocol Audit',
        technologies: 'EHR, Clinical Audit, JCAHO/NABH Guidelines',
        role: 'Clinical Lead',
    }, 'en');

    assert.match(user, /CONCISE LENGTH \(STRICT\)/, 'Must demand concise length constraint');
    assert.match(user, /120 to 190 characters/, 'Must target 120 to 190 characters');
    assert.match(user, /DO NOT REPEAT PROJECT TITLE/, 'Must instruct model not to repeat project title verbatim');
});

test('BulletPointsEditor: Default maxLength is 260 and domain-aware metrics are wired', () => {
    const editorSrc = fs.readFileSync('src/components/Form/BulletPointsEditor.jsx', 'utf-8');
    assert.match(editorSrc, /maxLength = 260/, 'Default maxLength must be 260');
    assert.match(editorSrc, /getDomainAtsMetrics/, 'Must define getDomainAtsMetrics');
    assert.match(editorSrc, /30\+ Patients\/Day/, 'Must include healthcare metrics for medical roles');
    assert.match(editorSrc, /charCount > 220\s*\?\s*'text-amber-600/, 'Must style counter as amber between 220 and 260');
});
