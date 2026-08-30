import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { normalizeResumeData } from '../src/utils/resumeData.js';
import { filterMeaningfulCertifications } from '../src/engine/hybrid/utils/contentSanitizer.js';
import { partitionResumeContent } from '../src/engine/hybrid/smartPartitioner.js';
import docxPkg from '../backend/services/docxExport.js';

const { createResumeDocx } = docxPkg;

const CERT_SAMPLE = [
    { id: 'c1', title: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2024' },
    { id: 'c2', name: 'CKA', organization: 'CNCF', year: '2022' },
    { id: 'c3', title: '', issuer: '', date: '' },
    { id: 'c4', title: 'PMP', issuer: '', date: '' },
];

test('normalizeResumeData preserves certification records and their field aliases', () => {
    const result = normalizeResumeData({ certifications: CERT_SAMPLE });
    assert.equal(result.certifications.length, 4);
    assert.equal(result.certifications[0].title, 'AWS Solutions Architect');
    assert.equal(result.certifications[0].issuer, 'Amazon Web Services');
    assert.equal(result.certifications[0].date, '2024');
    // alias preservation (name/organization/year are passed through intact)
    assert.equal(result.certifications[1].name, 'CKA');
    assert.equal(result.certifications[1].organization, 'CNCF');
});

test('filterMeaningfulCertifications drops truly empty records and keeps partial valid ones', () => {
    const blank = [
        null, undefined, '', '   ', '\n\t',
        { title: '', issuer: '', date: '' },
        { title: '<p></p>', issuer: '&nbsp;', date: '' },
        { title: ' ', issuer: '<p><br></p>', date: '\t' },
        { title: 'PMP' }, // partial valid -> keep
    ];
    const kept = filterMeaningfulCertifications(blank);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].title, 'PMP');
});

test('partitioner emits one certification flow item per meaningful certification', () => {
    const values = {
        firstname: 'A', lastname: 'B',
        projects: [{ title: 'P1' }],
        certifications: CERT_SAMPLE,
        skills: [{ name: 'Node.js' }],
    };
    const { pages } = partitionResumeContent(values, { archetype: 'minimal-ats' });
    const flow = pages.flatMap((page) => page.flowItems);
    const certItems = flow.filter((item) => item.type === 'certification');
    assert.equal(certItems.length, filterMeaningfulCertifications(CERT_SAMPLE).length);
    // certifications are ordered after projects in the single-column flow
    const projectIdx = flow.findIndex((item) => item.type === 'project');
    const certIdx = flow.findIndex((item) => item.type === 'certification');
    assert.ok(projectIdx >= 0 && certIdx > projectIdx);
});

test('the Create-Resume wizard exposes Certifications between Projects and Languages', () => {
    const source = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');
    assert.match(source, /import CertificationsStep/);
    assert.match(source, /path="certifications"/);
    assert.match(source, /id: 6/);
    assert.match(source, /id: 7/);
    const certStep = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');
    assert.match(certStep, /updateResumeData\(\{\s*certifications/m);
    // languages completes step 7 (placed before summary at step 8)
    const langs = fs.readFileSync('src/components/BuildResume/steps/LanguagesStep.jsx', 'utf8');
    assert.match(langs, /completedSteps\.includes\(7\)/);
});

test('CertificationsStep is factual manual entry without generated credentials or dates', () => {
    const certStep = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');
    assert.doesNotMatch(certStep, /generateUserAiContent|generate-certifications|getRoleTailoredFallbackCerts|recommendedCert/i);
    assert.match(certStep, /updateCertification/);
    assert.match(certStep, /Certification Name/);
    assert.match(certStep, /Issuing Organization/);
    assert.match(certStep, /Date Earned/);
});

test('All 16 locales keep manual certification copy and remove retired AI recommendation copy', () => {
    const locales = ['de', 'dk', 'en', 'es', 'fr', 'gk', 'hi', 'is', 'it', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'se'];
    for (const loc of locales) {
        const filePath = path.join('src/locales', loc, `${loc}.json`);
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        assert.ok(json.CertificationsStep?.title, `Locale ${loc} missing CertificationsStep.title`);
        assert.ok(json.CertificationsStep?.subtitle, `Locale ${loc} missing CertificationsStep.subtitle`);
        assert.equal(json.CertificationsStep?.ai, undefined, `Locale ${loc} retains retired CertificationsStep.ai copy`);
    }
});

test('DOCX export renders certification name, issuer and date (PDF/DOCX parity)', async () => {
    const buffer = await createResumeDocx({
        firstname: 'Asha', lastname: 'Rao',
        template: 'Cv1',
        certifications: [{ title: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2024' }],
    });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml').async('string');
    assert.ok(xml.includes('AWS Solutions Architect'));
    assert.ok(xml.includes('Amazon Web Services'));
    assert.ok(xml.includes('2024'));
});
