import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const hub = read('src/components/Dashboard/DashboardResumes/DashboardResumes.jsx');
const platform = read('src/services/api/platform.js');

test('hub turns the platform outage marker into a retryable error instead of an empty account', () => {
    assert.match(platform, /apiError:\s*true/);
    assert.match(hub, /if\s*\(result\?\.apiError\)/);
    assert.match(hub, /Your resumes could not be loaded/);
    assert.match(hub, /CubaErrorState[\s\S]*?onRetry=\{reload\}/);
    assert.match(hub, /Count unavailable/);
});

test('new-draft action opts out of the builder recovery lookup for an existing untitled resume', () => {
    assert.match(hub, /navigate\('\/build-resume\/heading\?new=1'\)/);
    assert.match(read('src/components/BuildResume/BuildResume.jsx'), /const forceNew = urlParams\.get\('new'\) === '1'/);
});

test('restored resume gallery uses the reference title, live thumbnails, four-column desktop grid, and bounded pagination', () => {
    assert.match(hub, /DashboardResumes\.title', 'My Resumes'/);
    assert.match(hub, /const ResumeThumbnail = React\.memo/);
    assert.match(hub, /<TemplateRenderer templateId=\{template\} values=\{values\}/);
    assert.match(hub, /data-testid="resume-thumbnail"/);
    assert.match(hub, /const RESUME_PAGE_SIZE = 8/);
    assert.match(hub, /pageResumes\.map\(/);
    assert.match(hub, /md:grid-cols-2 xl:grid-cols-4/);
    assert.match(hub, /Download Word \(DOCX\)/);
    assert.match(hub, /Download PDF/);
    assert.match(hub, /Share Resume/);
    assert.match(hub, /Edit Resume/);
});

test('resume hub keeps labelled search, sort, ATS, and template controls available on demand', () => {
    assert.match(hub, /aria-controls="resume-hub-tools"/);
    assert.match(hub, /data-testid="resume-search"/);
    assert.match(hub, /data-testid="resume-sort"/);
    assert.match(hub, /data-testid="resume-ats-filter"/);
    assert.match(hub, /data-testid="resume-template-filter"/);
    assert.match(hub, /No matching resumes/);
});

test('resume actions preserve builder/profile destinations and cannot misreport a local-storage failure', () => {
    assert.match(hub, /setItem\('currentResumeId', String\(doc\.id\)\)/);
    assert.match(hub, /navigate\('\/build-resume\/heading'\)/);
    assert.match(hub, /navigate\('\/dashboard\/settings\?tab=Profile'\)/);
    assert.match(hub, /Your browser could not access local storage/);
    assert.match(hub, /await deleteResumeDraft\(userId, target\.id\)[\s\S]*?catch\s*\(deleteFailure\)/);
});

test('share and export reuse the authoritative publication, entitlement, and validated download services', () => {
    assert.match(hub, /publishResume\(/);
    assert.match(hub, /downloadResumePdf\(/);
    assert.match(hub, /downloadResumeDocx\(/);
    assert.match(hub, /allowFreePdfDownload/);
    assert.match(hub, /allowFreeDocxDownload/);
    assert.match(hub, /allowFreeShareLink/);
});

test('isolated browser harness marks simulated data and intercepts all resume persistence calls', () => {
    const harness = read('template-lab/candidate-resumes.jsx');
    assert.match(harness, /DEV-ONLY isolated harness/);
    assert.match(harness, /window\.fetch\s*=\s*async/);
    assert.match(harness, /SIMULATED read failure/);
    assert.match(harness, /SIMULATED save failure/);
    assert.match(harness, /SIMULATED delete failure/);
    assert.match(harness, /AuthContext\.Provider/);
});
