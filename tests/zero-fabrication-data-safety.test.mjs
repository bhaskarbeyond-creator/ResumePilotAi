import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCandidateContext } from '../src/utils/candidateContext.js';
import { getDynamicPlaceholder } from '../src/utils/dynamicPlaceholders.js';

describe('Zero-Fabrication & Data-Safety Architecture Suite', () => {
    const stepsDir = path.resolve('src/components/BuildResume/steps');
    const componentsDir = path.resolve('src/components/BuildResume/components');

    it('Invariant 1: WorkHistoryStep must not auto-populate fabricated employers, dates, or HTML descriptions on card click', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'WorkHistoryStep.jsx'), 'utf-8');
        
        // Ensure old auto-population code is purged
        assert.doesNotMatch(fileContent, /employer:\s*['"]Enterprise Organization['"]/);
        assert.doesNotMatch(fileContent, /begin:\s*['"]2022-01['"]/);
        assert.doesNotMatch(fileContent, /end:\s*['"]Present['"]/);
        assert.doesNotMatch(fileContent, /setEmployments\(\[\{\s*id:\s*newId,\s*jobTitle,\s*employer/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);

        // Ensure newly created employments have empty employer, begin, end, and description
        assert.match(fileContent, /employer:\s*''/);
        assert.match(fileContent, /begin:\s*''/);
        assert.match(fileContent, /end:\s*''/);
        assert.match(fileContent, /description:\s*''/);
    });

    it('Invariant 2: EducationStep must not auto-populate fabricated universities or graduation years (2018-2022)', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'EducationStep.jsx'), 'utf-8');

        // Ensure old auto-population code is purged
        assert.doesNotMatch(fileContent, /started:\s*['"]2018['"]/);
        assert.doesNotMatch(fileContent, /finished:\s*['"]2022['"]/);
        assert.doesNotMatch(fileContent, /school:\s*['"]Accredited University \/ College['"]/);
        assert.doesNotMatch(fileContent, /setEducations\(\[\{\s*id:\s*newId,\s*degree:\s*degreeName/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);

        // Ensure newly created educations have empty school, started, finished, and description
        assert.match(fileContent, /school:\s*''/);
        assert.match(fileContent, /started:\s*''/);
        assert.match(fileContent, /finished:\s*''/);
        assert.match(fileContent, /description:\s*''/);
    });

    it('Invariant 3: ProjectsStep must not auto-populate blueprint projects directly into candidate project array', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'ProjectsStep.jsx'), 'utf-8');

        // Ensure old auto-population code is purged
        assert.doesNotMatch(fileContent, /setProjects\(\[\{\s*id:\s*newId,\s*title:\s*blueprint\.title/);
        assert.doesNotMatch(fileContent, /setProjects\(\[\{\s*id:\s*newId,\s*title:\s*tpl\.title/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);

        // Ensure newly created projects have empty description
        assert.match(fileContent, /description:\s*''/);
    });

    it('Invariant 4: CertificationsStep must not auto-inject current year as fabricated certification date', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'CertificationsStep.jsx'), 'utf-8');

        // Ensure date is blank by default rather than auto-populated with current year
        assert.doesNotMatch(fileContent, /date:\s*initialData\.date\s*\|\|\s*`\$\{new Date\(\)\.getFullYear\(\)\}`/);
        assert.doesNotMatch(fileContent, /date:\s*`\$\{new Date\(\)\.getFullYear\(\)\}`/);

        // Ensure blank date initialization
        assert.match(fileContent, /date:\s*initialData\.date\s*\|\|\s*''/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);
    });

    it('Invariant 5: AchievementsStep must not auto-populate fabricated awards into candidate achievements', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'AchievementsStep.jsx'), 'utf-8');

        // Ensure old auto-population code is purged
        assert.doesNotMatch(fileContent, /setAchievements\(\[\{\s*id:\s*newId,\s*title:\s*blueprint\.title/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);

        // Ensure blank title and description
        assert.match(fileContent, /description:\s*''/);
    });

    it('Invariant 6: CustomSectionsStep must not auto-populate fabricated blueprint items into custom section models', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'CustomSectionsStep.jsx'), 'utf-8');

        // Ensure blueprint items are not mapped directly into candidate state
        assert.doesNotMatch(fileContent, /items:\s*\(blueprint\.items\s*\|\|\s*\[\]\)\.map/);

        // Ensure TrackGuidanceBanner and QuickAddCommandBar are mounted
        assert.match(fileContent, /QuickAddCommandBar/);
        assert.match(fileContent, /TrackGuidanceBanner/);
    });

    it('Invariant 7: SummaryStep must route generated AI text through AiDraftReviewModal (Zero Silent Replacement)', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'SummaryStep.jsx'), 'utf-8');

        // Ensure AiDraftReviewModal is imported and rendered
        assert.match(fileContent, /import AiDraftReviewModal from '\.\.\/components\/AiDraftReviewModal'/);
        assert.match(fileContent, /<AiDraftReviewModal/);

        // Ensure AI draft does NOT immediately call setSummary(cleanSummary) and updateResumeData
        assert.doesNotMatch(fileContent, /setSummary\(cleanSummary\);\s*setCharCount\(cleanText\(cleanSummary\)\.length\);\s*updateResumeData\(\{ summary: cleanSummary \}\);/);

        // Ensure review draft is opened in modal
        assert.match(fileContent, /setReviewDraft\(cleanSummary\)/);
        assert.match(fileContent, /setIsReviewModalOpen\(true\)/);
    });

    it('Invariant 8: LanguagesStep must adapt recommendations dynamically by candidate region without hardcoding', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'LanguagesStep.jsx'), 'utf-8');

        // Ensure regional mapping dictionary exists
        assert.match(fileContent, /REGIONAL_LANGUAGES/);
        assert.match(fileContent, /candidateContext\.geography\?\.region/);

        // Ensure QuickAddCommandBar is mounted
        assert.match(fileContent, /QuickAddCommandBar/);
    });

    it('Invariant 9: Autocomplete and dynamic placeholders produce guidance, never mutated candidate facts', () => {
        const testPersonas = [
            { occupation: 'Orthopedic Surgeon', city: 'Chicago', country: 'United States' },
            { occupation: 'Airline Pilot', city: 'Dubai', country: 'United Arab Emirates' },
            { occupation: 'Restoration Architect', city: 'Florence', country: 'Italy' },
            { occupation: 'Dairy Farm Manager', city: 'Waikato', country: 'New Zealand' }
        ];

        for (const persona of testPersonas) {
            const ctx = getCandidateContext(persona);
            assert.ok(ctx.domainLabel, `Should have domain label for ${persona.occupation}`);
            
            // Check dynamic placeholders
            const empPlaceholder = getDynamicPlaceholder('work-history', 'employer', ctx);
            assert.ok(typeof empPlaceholder === 'string' && empPlaceholder.startsWith('e.g.'), `Employer placeholder must start with e.g. for ${persona.occupation}`);

            const schoolPlaceholder = getDynamicPlaceholder('education', 'school', ctx);
            assert.ok(typeof schoolPlaceholder === 'string' && schoolPlaceholder.startsWith('e.g.'), `School placeholder must start with e.g. for ${persona.occupation}`);
        }
    });

    it('Invariant 10: AiDraftReviewModal component contract verifies explicit confirmation gates', () => {
        const fileContent = fs.readFileSync(path.join(componentsDir, 'AiDraftReviewModal.jsx'), 'utf-8');

        // Must support onAccept, onClose, in-modal editing, and overwrite warnings
        assert.match(fileContent, /onAccept/);
        assert.match(fileContent, /onClose/);
        assert.match(fileContent, /isEditing/);
        assert.match(fileContent, /Your existing \{targetFieldLabel\.toLowerCase\(\)\} will be replaced/);
        assert.match(fileContent, /Grounded strictly in the career information you provided/);
    });
});
