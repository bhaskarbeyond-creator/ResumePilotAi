import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProfileData } from '../src/utils/profileData.js';
import profileSanitizerPkg from '../backend/services/profileSanitizer.js';
const { sanitizeProfilePatch } = profileSanitizerPkg;

test('1. DashboardSettings Certifications subtab strictly matches CertificationsStep card architecture', () => {
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    // 1. Must contain the canonical classification pills
    assert.match(settingsContent, /Credential Classification/, 'Must contain Credential Classification label');
    assert.match(settingsContent, /CERT_TYPES\.map/, 'Must iterate canonical CERT_TYPES');
    assert.match(settingsContent, /updateCertification\(idx, 'certType', type\.id\)/, 'Must update certType on classification click');
    assert.match(settingsContent, /updateCertification\(idx, 'isLicense', type\.id === 'License'\)/, 'Must update isLicense on classification click');

    // 2. Must contain AutocompleteInputField for credential title and issuing organization
    assert.match(settingsContent, /suggestionType="certification"/, 'Must use suggestionType certification');
    assert.match(settingsContent, /suggestionType="certificationIssuer"/, 'Must use suggestionType certificationIssuer');
    assert.match(settingsContent, /label="Credential name"/, 'Must contain Credential name label');
    assert.match(settingsContent, /label="Issuing organization"/, 'Must contain Issuing organization label');

    // 3. Must contain Date Earned, Expiration Date, Credential ID, and Verification URL
    assert.match(settingsContent, /label="Date earned"/, 'Must contain Date earned field');
    assert.match(settingsContent, /label="Expiration \/ Renewal Date"/, 'Must contain Expiration date field');
    assert.match(settingsContent, /label="Credential ID \/ License #"/, 'Must contain Credential ID field');
    assert.match(settingsContent, /label="Verification URL"/, 'Must contain Verification URL field');
    assert.match(settingsContent, /Test live URL/, 'Must render Test live URL link');

    // 4. Must contain Card Header controls: Index badge, Move Up, Move Down, Duplicate, Delete
    assert.match(settingsContent, /#{idx \+ 1}/, 'Must render card index badge');
    assert.match(settingsContent, /moveItem\('certifications', idx, -1\)/, 'Must wire Move Up button');
    assert.match(settingsContent, /moveItem\('certifications', idx, 1\)/, 'Must wire Move Down button');
    assert.match(settingsContent, /duplicateCertification\(idx\)/, 'Must wire Duplicate button');
    assert.match(settingsContent, /removeCertification\(idx\)/, 'Must wire Delete button');

    // 5. Must contain Auto-Recommend (AI) and Live Search with classification filter pills
    assert.match(settingsContent, /handleRecommendAiCertifications/, 'Must wire handleRecommendAiCertifications');
    assert.match(settingsContent, /Auto-Recommend \(AI\)/, 'Must have Auto-Recommend button');
    assert.match(settingsContent, /Search credentials, issuers, or IDs\.\.\./, 'Must have live search input');
    assert.match(settingsContent, /setCertTypeFilter/, 'Must support classification filtering');
});

test('2. profileData.js preserves and normalizes certification fields (endDate, credentialId, certType, isLicense)', () => {
    const raw = {
        certifications: [
            {
                title: 'AWS Certified Solutions Architect',
                issuer: 'Amazon Web Services',
                date: '2024',
                endDate: '2027',
                credentialId: 'AWS-PSA-99120',
                url: 'https://www.credly.com/badges/aws-architect',
                certType: 'Certification',
                isLicense: false,
            },
            {
                title: 'Registered Nurse (RN) License',
                issuer: 'California Board of Registered Nursing',
                date: '2021',
                endDate: '2025',
                credentialId: 'RN-883921',
                url: 'https://search.dca.ca.gov/details/rn-883921',
                certType: 'License',
                isLicense: true,
            }
        ]
    };

    const normalized = normalizeProfileData(raw);
    assert.equal(normalized.certifications.length, 2);

    // Cert 1
    assert.equal(normalized.certifications[0].title, 'AWS Certified Solutions Architect');
    assert.equal(normalized.certifications[0].issuer, 'Amazon Web Services');
    assert.equal(normalized.certifications[0].date, '2024');
    assert.equal(normalized.certifications[0].endDate, '2027');
    assert.equal(normalized.certifications[0].credentialId, 'AWS-PSA-99120');
    assert.equal(normalized.certifications[0].url, 'https://www.credly.com/badges/aws-architect');
    assert.equal(normalized.certifications[0].certType, 'Certification');
    assert.equal(normalized.certifications[0].isLicense, 'false'); // stringified in normalizeEntry

    // Cert 2
    assert.equal(normalized.certifications[1].title, 'Registered Nurse (RN) License');
    assert.equal(normalized.certifications[1].issuer, 'California Board of Registered Nursing');
    assert.equal(normalized.certifications[1].certType, 'License');
    assert.equal(normalized.certifications[1].isLicense, 'true');
});

test('3. backend profileSanitizer.js preserves certification fields (endDate, credentialId, certType, isLicense)', () => {
    const raw = {
        certifications: [
            {
                id: 'cert_1',
                title: 'Project Management Professional (PMP)',
                issuer: 'Project Management Institute',
                date: '2023',
                endDate: '2026',
                credentialId: 'PMI-298311',
                url: 'https://pmi.org/verify/298311',
                certType: 'Certification',
                isLicense: false,
            }
        ]
    };

    const sanitized = sanitizeProfilePatch(raw);
    assert.equal(sanitized.certifications.length, 1);
    assert.equal(sanitized.certifications[0].title, 'Project Management Professional (PMP)');
    assert.equal(sanitized.certifications[0].issuer, 'Project Management Institute');
    assert.equal(sanitized.certifications[0].date, '2023');
    assert.equal(sanitized.certifications[0].endDate, '2026');
    assert.equal(sanitized.certifications[0].credentialId, 'PMI-298311');
    assert.equal(sanitized.certifications[0].url, 'https://pmi.org/verify/298311');
    assert.equal(sanitized.certifications[0].certType, 'Certification');
});

test('4. CertificationsStep and DashboardSettings share the canonical CERT_TYPES and GET_CURATED_CERTIFICATION_IDEAS', () => {
    const stepContent = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    assert.match(stepContent, /export const CERT_TYPES =/, 'CertificationsStep must export CERT_TYPES');
    assert.match(stepContent, /export const GET_CURATED_CERTIFICATION_IDEAS =/, 'CertificationsStep must export GET_CURATED_CERTIFICATION_IDEAS');
    assert.match(settingsContent, /import \{ CERT_TYPES, GET_CURATED_CERTIFICATION_IDEAS \} from '\.\.\/\.\.\/BuildResume\/steps\/CertificationsStep'/, 'DashboardSettings must import canonical constants from CertificationsStep');
});
