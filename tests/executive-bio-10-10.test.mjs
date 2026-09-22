import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeTemplateData } from '../src/cv-templates/templateUtils.js';
import { getCandidateContext } from '../src/utils/candidateContext.js';
import { stripHtml } from '../src/utils/atsScore.js';
import { hasMeaningfulText } from '../src/engine/hybrid/utils/contentSanitizer.js';
import { canRunAssistOperation, buildAssistPayload, normalizeAssistResult } from '../src/components/BuildResume/ai/aiContract.js';

test('Executive Bio 10/10: Master Profile & Build Resume Parity Suite', async (t) => {
    const dashboardSettingsSrc = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');
    const summaryStepSrc = fs.readFileSync('src/components/BuildResume/steps/SummaryStep.jsx', 'utf8');
    const buildResumeSrc = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');

    await t.test('1. Invariant 7 (Zero Silent Overwrites): AI draft review gate is present in both Master Profile and Build Resume', () => {
        // Master Profile must hold draft in state rather than immediately overwriting profile.summary
        assert.match(dashboardSettingsSrc, /setSummaryAiDraft\(summaryText\.trim\(\)\)/, 'Must store AI result in summaryAiDraft');
        assert.match(dashboardSettingsSrc, /AI Executive Bio Draft/, 'Must render AI Executive Bio Draft review card');
        assert.match(dashboardSettingsSrc, /Apply Bio to Profile/, 'Must require explicit user action to apply draft to profile');
        assert.match(dashboardSettingsSrc, /setSummaryAiDraft\(null\)/, 'Must allow dismissing AI draft without changing profile');

        // Build Resume must use AiPromptCard review gate
        assert.match(summaryStepSrc, /<AiPromptCard/, 'Must render AiPromptCard in SummaryStep');
        assert.match(summaryStepSrc, /onUseDraft=\{handleUseDraft\}/, 'Must gate draft usage behind confirmation');
        assert.match(summaryStepSrc, /onDismiss=\{\(\) => ai\.reset\(\)\}/, 'Must allow dismissing AI draft');
    });

    await t.test('2. Bidirectional Data Synchronization: Build Resume can both import from and save to Master Profile', () => {
        // Build Resume must support importing Master Profile bio
        assert.match(summaryStepSrc, /handleImportMasterBio/, 'Must implement handleImportMasterBio');
        assert.match(summaryStepSrc, /Import from Profile/, 'Must render Import from Profile button');

        // Build Resume must support saving resume summary back to Master Profile
        assert.match(summaryStepSrc, /handleSaveToMasterProfile/, 'Must implement handleSaveToMasterProfile');
        assert.match(summaryStepSrc, /executeSaveToMasterProfile/, 'Must implement executeSaveToMasterProfile');
        assert.match(summaryStepSrc, /Save to Profile/, 'Must render Save to Profile button');

        // Overwrite protection on bidirectional sync
        assert.match(summaryStepSrc, /showImportConfirm/, 'Must prompt confirmation before replacing with Master Bio');
        assert.match(summaryStepSrc, /showSaveProfileConfirm/, 'Must prompt confirmation before overwriting Master Profile Bio');
    });

    await t.test('3. Asynchronous Auth Resilience & Real-Time Event Bus Subscription', () => {
        // SummaryStep must subscribe to onAuthStateChanged so reloads on /build-resume/summary resolve
        assert.match(summaryStepSrc, /fire\.auth\(\)\.onAuthStateChanged/, 'SummaryStep must subscribe to auth state changes');

        // SummaryStep must listen to profileUpdated event for live synchronization
        assert.match(summaryStepSrc, /window\.addEventListener\('profileUpdated',/, 'SummaryStep must listen to profileUpdated event');

        // Both Master Profile and SummaryStep must dispatch profileUpdated on save
        assert.match(dashboardSettingsSrc, /window\.dispatchEvent\(new CustomEvent\('profileUpdated'/, 'DashboardSettings must dispatch profileUpdated');
        assert.match(summaryStepSrc, /window\.dispatchEvent\(new CustomEvent\('profileUpdated'/, 'SummaryStep must dispatch profileUpdated');
    });

    await t.test('4. Truthful Validation & Emptiness Detection (Zero False Positives from Rich Text Markup)', () => {
        // Empty HTML representations must be detected as empty
        const emptyParagraph = '<p class="editor-paragraph"><br></p>';
        const emptyWithSpaces = '<p>&nbsp;   &nbsp;</p>';
        const blank = '   \n\t ';

        assert.equal(hasMeaningfulText(emptyParagraph), false);
        assert.equal(hasMeaningfulText(emptyWithSpaces), false);
        assert.equal(hasMeaningfulText(blank), false);

        assert.equal(stripHtml(emptyParagraph), '');
        assert.equal(stripHtml(emptyWithSpaces), '');

        // SUBTAB_CONFIG.summary in DashboardSettings must use stripHtml so empty markup does not mark step active
        assert.match(dashboardSettingsSrc, /statusBadge:\s*\(p\)\s*=>\s*stripHtml\(p\.summary\)\.length\s*>=\s*20/, 'statusBadge must strip HTML');
        assert.match(dashboardSettingsSrc, /isComplete:\s*\(p\)\s*=>\s*Boolean\(p\.summary\s*&&\s*stripHtml\(p\.summary\)\.length\s*>=\s*20\)/, 'isComplete must strip HTML');
        assert.match(dashboardSettingsSrc, /computeGaps:\s*\(p\)\s*=>\s*\{\s*if\s*\(!p\.summary\s*\|\|\s*stripHtml\(p\.summary\)\.length\s*<\s*20\)/, 'computeGaps must strip HTML');

        // BuildResume completion check must require >= 20 characters of stripped text
        assert.match(buildResumeSrc, /case 'summary':\s*return Boolean\(resumeData\.summary && String\(resumeData\.summary\)\.replace\(\/<\[\^>\]\*\>\/g, ' '\)\.replace\(\/&nbsp;\|&#160;\/gi, ' '\)\.trim\(\)\.length >= 20\)/, 'BuildResume must require >= 20 chars of stripped summary');
    });

    await t.test('5. Template Safety: Ghost Section Headers Suppressed Across All 51 Templates', () => {
        // When summary is empty or only rich text tags, normalizeTemplateData must produce empty string
        const templateDataWithGhostSummary = normalizeTemplateData({
            firstname: 'Dev',
            lastname: 'User',
            summary: '<p class="editor-paragraph"><br></p>',
        });
        assert.equal(templateDataWithGhostSummary.summary, '', 'Empty rich-text summary must normalize to empty string');

        const templateDataWithSpaces = normalizeTemplateData({
            firstname: 'Dev',
            lastname: 'User',
            summary: '   \n   ',
        });
        assert.equal(templateDataWithSpaces.summary, '', 'Whitespace summary must normalize to empty string');

        const templateDataWithRealSummary = normalizeTemplateData({
            firstname: 'Dev',
            lastname: 'User',
            summary: '<p>Senior Executive with 15+ years experience leading global engineering organizations.</p>',
        });
        assert.match(templateDataWithRealSummary.summary, /Senior Executive/, 'Real summary must be preserved');
    });

    await t.test('6. Complete Candidate Context & Evidence Grounding for AI Executive Bio Generation', () => {
        const profile = {
            firstname: 'Maya',
            lastname: 'Lin',
            occupation: 'Chief Technology Officer',
            workExperiences: [
                { jobTitle: 'VP Engineering', company: 'Global Corp', startDate: '2020', endDate: '2024', description: 'Scaled org to 150 engineers' }
            ],
            education: [
                { degree: 'MS CS', school: 'Stanford University' }
            ],
            skills: [{ name: 'Distributed Systems' }, { name: 'Cloud Architecture' }],
            certifications: [{ title: 'AWS Solutions Architect Professional', issuer: 'Amazon' }],
            projects: [{ title: 'NextGen Platform', description: 'Real-time pipeline processing 10B events daily' }],
            summary: 'Experienced technology leader.',
        };

        const ctx = getCandidateContext(profile);
        assert.equal(ctx.facts.name, 'Maya Lin');
        assert.equal(ctx.target.role, 'Chief Technology Officer');
        assert.equal(ctx.facts.roles.length, 1);
        assert.equal(ctx.facts.education.length, 1);
        assert.equal(ctx.facts.skills.length, 2);
        assert.equal(ctx.facts.certifications.length, 1);
        assert.equal(ctx.facts.projects.length, 1);

        // Assist payload formulation for AI synthesis
        const assist = buildAssistPayload('generate-summary', { resumeData: profile, tone: 'executive' });
        assert.equal(assist.payload.targetRole, 'Chief Technology Officer');
        assert.match(assist.payload.workHistory, /VP Engineering at Global Corp/);
        assert.match(assist.payload.education, /MS CS from Stanford University/);
        assert.ok(assist.payload.sourceFacts.includes('Target Role: Chief Technology Officer'));
        assert.ok(assist.payload.sourceFacts.includes('Work History: VP Engineering at Global Corp'));

        // DashboardSettings must pass context and sourceFacts
        assert.match(dashboardSettingsSrc, /const candCtx = getCandidateContext\(profile\);/, 'DashboardSettings must call getCandidateContext');
        assert.match(dashboardSettingsSrc, /sourceFacts,/, 'DashboardSettings must pass sourceFacts');
        assert.match(dashboardSettingsSrc, /context: candCtx,/, 'DashboardSettings must pass candCtx');
    });

    await t.test('7. 10/10 UX Parity: Character Meter, Word Counter, Evidence Digest, Copy & Clear Actions', () => {
        // Master Profile must render Character Meter and progress bar
        assert.match(dashboardSettingsSrc, /\{bioCharCount\}\/400/, 'Must render bio character count');
        assert.match(dashboardSettingsSrc, /\{bioProgress\.text\}/, 'Must render bio progress text');
        assert.match(dashboardSettingsSrc, /bioProgress\.bar/, 'Must render dynamic progress bar');

        // Master Profile must render Career Evidence Digest
        assert.match(dashboardSettingsSrc, /Synthesizes:/, 'Must render Synthesizes label');
        assert.match(dashboardSettingsSrc, /bioRolesCount/, 'Must count positions');
        assert.match(dashboardSettingsSrc, /bioSkillsCount/, 'Must count skills');

        // Master Profile must provide Copy and Clear actions
        assert.match(dashboardSettingsSrc, /handleCopyBio/, 'Must implement handleCopyBio');
        assert.match(dashboardSettingsSrc, /setShowClearBioConfirm/, 'Must implement Clear confirmation');

        // Build Resume SummaryStep must also provide Copy and Clear actions
        assert.match(summaryStepSrc, /handleCopy/, 'SummaryStep must implement handleCopy');
        assert.match(summaryStepSrc, /handleClear/, 'SummaryStep must implement handleClear');
        assert.match(summaryStepSrc, /setShowClearConfirm/, 'SummaryStep must implement Clear confirmation');
    });

    await t.test('8. Capstone Ordering in Master Profile Stepper', () => {
        // Executive Bio must remain at the very end of SUB_TAB_ORDER
        assert.match(dashboardSettingsSrc, /const SUB_TAB_ORDER = \[[^\]]*'summary'\];/, 'Executive Bio must be at the end of SUB_TAB_ORDER');
    });
});
