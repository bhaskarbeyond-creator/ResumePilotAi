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

        // Ensure StepShell and AiPromptCard are mounted
        assert.match(fileContent, /StepShell/);
        assert.match(fileContent, /AiPromptCard/);

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

        // Ensure StepShell is mounted
        assert.match(fileContent, /StepShell/);

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

        // Ensure StepShell and EntryList are mounted
        assert.match(fileContent, /StepShell/);
        assert.match(fileContent, /EntryList/);

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

        // Ensure StepShell is mounted
        assert.match(fileContent, /StepShell/);
    });

    it('Invariant 5: AchievementsStep must not auto-populate fabricated awards into candidate achievements', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'AchievementsStep.jsx'), 'utf-8');

        // Ensure old auto-population code is purged
        assert.doesNotMatch(fileContent, /setAchievements\(\[\{\s*id:\s*newId,\s*title:\s*blueprint\.title/);

        // Ensure StepShell is mounted
        assert.match(fileContent, /StepShell/);

        // Ensure blank title and description
        assert.match(fileContent, /description:\s*''/);
    });

    it('Invariant 6: CustomSectionsStep must not auto-populate fabricated blueprint items into custom section models', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'CustomSectionsStep.jsx'), 'utf-8');

        // Ensure blueprint items are not mapped directly into candidate state
        assert.doesNotMatch(fileContent, /items:\s*\(blueprint\.items\s*\|\|\s*\[\]\)\.map/);

        // Ensure StepShell is mounted
        assert.match(fileContent, /StepShell/);
    });

    it('Invariant 7: SummaryStep must route generated AI text through AiPromptCard with overwrite protection (Zero Silent Replacement)', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'SummaryStep.jsx'), 'utf-8');

        // Ensure StepShell and AiPromptCard are mounted
        assert.match(fileContent, /StepShell/);
        assert.match(fileContent, /AiPromptCard/);

        // Ensure AI draft does NOT immediately call setSummary(cleanSummary) and updateResumeData
        assert.doesNotMatch(fileContent, /setSummary\(cleanSummary\);\s*setCharCount\(cleanText\(cleanSummary\)\.length\);\s*updateResumeData\(\{ summary: cleanSummary \}\);/);
    });

    it('Invariant 8: LanguagesStep must rely on candidate-provided entries with zero hardcoded stereotypes', () => {
        const fileContent = fs.readFileSync(path.join(stepsDir, 'LanguagesStep.jsx'), 'utf-8');

        // Ensure StepShell is mounted
        assert.match(fileContent, /StepShell/);

        // Ensure candidate-driven proficiency levels and zero regional stereotyping
        assert.match(fileContent, /PROFICIENCY_LEVELS/);
        assert.doesNotMatch(fileContent, /REGIONAL_LANGUAGES/);
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
            
            // Check dynamic placeholders provide neutral non-empty string guidance
            const empPlaceholder = getDynamicPlaceholder('work-history', 'employer', ctx);
            assert.ok(typeof empPlaceholder === 'string' && empPlaceholder.length > 5, `Employer placeholder must be valid guidance for ${persona.occupation}`);

            const schoolPlaceholder = getDynamicPlaceholder('education', 'school', ctx);
            assert.ok(typeof schoolPlaceholder === 'string' && schoolPlaceholder.length > 5, `School placeholder must be valid guidance for ${persona.occupation}`);
        }
    });

    it('Invariant 10: AiPromptCard component contract verifies explicit confirmation gates', () => {
        const fileContent = fs.readFileSync(path.join(componentsDir, 'AiPromptCard.jsx'), 'utf-8');

        // Must support questions panel, suggestions panel, and draft replacement confirmation
        assert.match(fileContent, /QuestionsPanel/);
        assert.match(fileContent, /SuggestionsPanel/);
        assert.match(fileContent, /DraftPanel/);
        assert.match(fileContent, /Using this draft replaces what is currently in this field/);
        assert.match(fileContent, /Use this draft/);
    });
});
