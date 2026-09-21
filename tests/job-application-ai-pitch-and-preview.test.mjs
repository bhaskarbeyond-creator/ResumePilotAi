import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, '..');

test.describe('Job Application Modal: AI 1-Click Quick Pitch & In-Modal Preview Suite', () => {
    const modalPath = path.join(rootPath, 'src/components/JobsListings/JobApplicationModal.jsx');
    const modalSource = fs.readFileSync(modalPath, 'utf8');

    test('1. ⚡ 1-Click Quick Pitch is integrated with AI (generate-ai-cover-letter)', () => {
        // Must import generateUserAiContent
        assert.match(modalSource, /import\s*\{[^}]*generateUserAiContent[^}]*\}\s*from\s*['"]\.\.\/\.\.\/services\/aiService['"]/, 'Imports generateUserAiContent');
        
        // Must call generate-ai-cover-letter
        assert.match(modalSource, /generateUserAiContent\(\s*['"]generate-ai-cover-letter['"]/, 'Calls generate-ai-cover-letter operation');
        
        // Must pass rich candidate and job context
        assert.match(modalSource, /jobTitle:\s*role/, 'Passes jobTitle');
        assert.match(modalSource, /companyName:\s*company/, 'Passes companyName');
        assert.match(modalSource, /userSkills/, 'Passes userSkills');
        assert.match(modalSource, /candidateName:\s*candidate/, 'Passes candidateName');
        assert.match(modalSource, /tone:\s*['"]impact['"]/, 'Passes ATS-optimized impact tone');
    });

    test('2. ⚡ 1-Click Quick Pitch has robust offline/unauthenticated fallback', () => {
        // Fallback synthesized pitch must be present
        assert.match(modalSource, /Fallback to synthesized ATS template/, 'Logs fallback warning gracefully');
        assert.match(modalSource, /if\s*\(!pitchText\)\s*\{[\s\S]*?Dear Hiring Team at/, 'Contains fallback ATS elevator pitch template');
        assert.match(modalSource, /isAiGenerating/, 'Has isAiGenerating state guard against double-clicks');
        assert.match(modalSource, /FaSpinner/, 'Displays loading spinner while generating');
    });

    test('3. Preview Resume on apply popup triggers internal modal preview instead of external 404 link', () => {
        // External link anchor tag to shareableLink has been replaced with internal handleShowPreview button
        assert.doesNotMatch(modalSource, /<a[^>]*href=\{sanitizeUrl\(applicationData\.selectedResume\.shareableLink\)\}[^>]*>[\s\S]*?Preview Resume/, 'External shareableLink anchor is replaced');
        assert.match(modalSource, /handleShowPreview\(resumeToPreview\)/, 'Preview button triggers in-modal handleShowPreview');
        assert.match(modalSource, /applicationData\.selectedResume\?\.data\s*\|\|\s*applicationData\.selectedResume/, 'Extracts resume document from selectedResume for preview');
    });

    test('4. Preview rendering utilizes canonical TemplateRenderer and normalizeResumeData', () => {
        // Must import TemplateRenderer and normalizeResumeData
        assert.match(modalSource, /import\s+TemplateRenderer\s+from\s+['"]\.\.\/TemplateRenderer['"]/, 'Imports canonical TemplateRenderer');
        assert.match(modalSource, /import\s*\{[^}]*normalizeResumeData[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/resumeData['"]/, 'Imports normalizeResumeData');

        // Must normalize template ID (e.g. cv1 -> Cv1)
        assert.match(modalSource, /getCanonicalTemplateId/, 'Contains template ID canonicalizer');
        assert.match(modalSource, /<TemplateRenderer[\s\S]*?templateId=\{templateId\}[\s\S]*?values=\{cvData\}/, 'Renders template using TemplateRenderer');
    });

    test('5. Preview modal displays resilient candidate metadata and handles escape key', () => {
        assert.match(modalSource, /previewDisplayName/, 'Resolves clean candidate display name');
        assert.match(modalSource, /if\s*\(showPreviewModal\)\s*\{\s*setShowPreviewModal\(false\);/, 'Escape key gracefully closes preview modal first');
        assert.match(modalSource, /handleResumeSelect\(previewResume\)/, 'Preview modal provides 1-click Select This Resume action');
    });
});
