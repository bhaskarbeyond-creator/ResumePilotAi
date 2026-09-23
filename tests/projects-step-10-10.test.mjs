import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as bulletQuality from '../src/utils/bulletQuality.js';

const require = createRequire(import.meta.url);
const { buildGroundedPrompt, getContentOperationFallback, parseAiResponse } = require('../backend/services/aiRuntime.js');

test('10/10 Projects Step UX Contract & Component Verification', () => {
    const fileContent = fs.readFileSync('src/components/BuildResume/steps/ProjectsStep.jsx', 'utf-8');

    // 1. Core Architecture & Safety Invariants
    assert.match(fileContent, /StepShell/, 'Must mount StepShell');
    assert.match(fileContent, /EntryList/, 'Must mount EntryList');
    assert.doesNotMatch(fileContent, /Key Achievements & Technical Contributions/, 'Key Achievements section must be removed from Projects');
    assert.doesNotMatch(fileContent, /BulletPointsEditor/, 'BulletPointsEditor must not be mounted in Projects');
    assert.match(fileContent, /AiRecommendationModal/, 'Must mount AiRecommendationModal');
    assert.match(fileContent, /description:\s*''/, 'Must initialize description as empty string');
    assert.doesNotMatch(fileContent, /setProjects\(\[\{\s*id:\s*newId,\s*title:\s*blueprint\.title/, 'Must not auto-populate fake blueprint projects');

    // 2. 10/10 Clean Interface: Intrusive AI Banner is Removed
    assert.doesNotMatch(fileContent, /AI Bullet Assistant Active/, 'Intrusive banner must be removed');
    assert.doesNotMatch(fileContent, /Tip for AI Bullet Generation/, 'Cluttering tips banner must be removed');

    // 3. 10/10 UX Toolbar, Project Types & Search
    assert.match(fileContent, /PROJECT_TYPES/, 'Must define PROJECT_TYPES');
    assert.match(fileContent, /searchQuery/, 'Must provide live search query');
    assert.match(fileContent, /handleRecommendAiProjects/, 'Must provide AI recommendation handler');
    assert.match(fileContent, /Auto-Recommend/, 'Must have Auto-Recommend button');

    // 4. Clean 5-Field Project Structure (Name, Role, Tools, URL, Category)
    assert.match(fileContent, /Project Name/, 'Must have Project Name field');
    assert.match(fileContent, /Your Role in Project/, 'Must have Role field');
    assert.match(fileContent, /Technologies \/ Tools Used/, 'Must have Technologies field');
    assert.match(fileContent, /Project \/ Portfolio URL/, 'Must have URL field');
    assert.match(fileContent, /Project Type \/ Category/, 'Must have Category selector');

    // 5. Persistence & Sync
    assert.match(fileContent, /updateProject\(project\.id, 'title'/, 'Must support updating project title');
    assert.match(fileContent, /updateProject\(project\.id, 'role'/, 'Must support updating project role');
    assert.match(fileContent, /updateProject\(project\.id, 'technologies'/, 'Must support updating project technologies');
    assert.match(fileContent, /updateProject\(project\.id, 'url'/, 'Must support updating project url');
    assert.match(fileContent, /updateResumeData\(\{\s*projects/m, 'Must sync projects to resumeData');
    assert.match(fileContent, /duplicateResumeItem/, 'Must support duplicating project');
    assert.match(fileContent, /moveResumeItem/, 'Must support reordering project');

    // 6. Dedicated Elevated Cards View (Compact view not required)
    assert.match(fileContent, /PROJECT_TYPES\.find/, 'Must render elevated project cards with category styling');
    assert.match(fileContent, /subtitleParts/, 'Must compute dynamic project subtitle');
    assert.doesNotMatch(fileContent, /viewMode === 'compact'/, 'Compact view must not be required');
});

test('Backend AI Runtime Prompt Builder: Project-Specific Context Integration', () => {
    const { user } = buildGroundedPrompt('enhance-single-bullet', {
        projectName: 'Real-Time Chat Application',
        technologies: 'React, Node.js, WebSockets, Redis',
        role: 'Lead Backend Developer',
        candidateContext: {
            target: { role: 'Senior Software Engineer' }
        }
    }, 'en');

    assert.ok(user.includes('Real-Time Chat Application'), 'Prompt must include the specific project name');
    assert.ok(user.includes('React, Node.js, WebSockets, Redis'), 'Prompt must include the specific technologies');
    assert.ok(user.includes('GOOGLE X-Y-Z FORMULA'), 'Prompt must demand Google X-Y-Z formula');
    assert.ok(user.includes('STRICT PROJECT-SPECIFIC RELEVANCE'), 'Prompt must enforce strict project relevance');
});

test('Backend AI Runtime: generate-projects Operation & Zero IT Leakage on Non-IT Profiles', () => {
    // 1. Doctor / Healthcare Persona
    const doctorPrompt = buildGroundedPrompt('generate-projects', {
        targetRole: 'Cardiologist',
        candidateFacts: {
            workRoles: [{ title: 'Attending Cardiologist', employer: 'City Hospital' }],
            skills: ['Echocardiography', 'Cardiac Catheterization', 'Patient Care'],
        }
    }, 'en');

    assert.ok(doctorPrompt.user.includes('Cardiologist'), 'Prompt must target Cardiologist');
    assert.ok(doctorPrompt.user.includes('CRITICAL PROFILE & INDUSTRY ALIGNMENT'), 'Prompt must enforce industry alignment');
    assert.ok(doctorPrompt.user.includes('DO NOT recommend software apps'), 'Prompt must forbid software recommendations for non-IT');

    // 2. Provider outage: explicit unavailable state, no role-template project ideas (Phase 3)
    for (const role of ['Cardiologist', 'Trial Attorney']) {
        const outage = getContentOperationFallback('generate-projects', { targetRole: role, occupation: role });
        assert.deepEqual(outage.projects, [], `no template projects for ${role}`);
        assert.equal(outage.aiUnavailable, true);
        assert.equal(outage.requiresUserConfirmation, true);
    }

    // 4. Response Parser Test
    const parsed = parseAiResponse('generate-projects', JSON.stringify({
        projects: [
            { name: 'Patient Triage Optimization', role: 'Clinical Lead', technologies: 'EHR, Triage Rubrics', category: 'mandatory', projectType: 'enterprise' },
            { name: 'Hospital Protocol Review', role: 'Quality Lead', technologies: 'NABH Guidelines', category: 'recommended', projectType: 'enterprise' }
        ]
    }));

    assert.ok(parsed.projects, 'Parser must extract projects');
    assert.equal(parsed.projects.length, 2);
    assert.equal(parsed.projects[0].name, 'Patient Triage Optimization');
});

test('Client fallback bullet generator removed: no template project bullets on AI outage (Phase 3)', () => {
    assert.equal(bulletQuality.generateClientRoleBullet, undefined);
});

test('BulletPointsEditor: otherBullets is declared and empty bullet generates safely without ReferenceError', () => {
    const editorContent = fs.readFileSync('src/components/Form/BulletPointsEditor.jsx', 'utf-8');
    assert.match(editorContent, /const otherBullets = localBullets\.filter/, 'otherBullets must be declared before use');
    assert.ok(editorContent.indexOf('const otherBullets = localBullets.filter') < editorContent.indexOf('try {'), 'otherBullets must be defined before try block');
});

test('ProjectsStep: Clean Architecture with Project Tips and zero Key Achievements section', () => {
    const fileContent = fs.readFileSync('src/components/BuildResume/steps/ProjectsStep.jsx', 'utf-8');
    assert.doesNotMatch(fileContent, /Key Achievements & Technical Contributions/, 'Must not contain Key Achievements section');
    assert.doesNotMatch(fileContent, /BulletPointsEditor/, 'Must not mount BulletPointsEditor in Projects');
    assert.match(fileContent, /guideContent=\{renderGuideContent\(\)\}/, 'Must pass guideContent to StepShell');
    assert.match(fileContent, /Project Tips & Best Practices/, 'Sidebar guide must display Project Tips');
});

test('Backend Fallback: enhance-single-bullet without a draft asks the candidate instead of writing a template bullet', () => {
    const lawyerFallback = getContentOperationFallback('enhance-single-bullet', {
        jobTitle: 'Trial Attorney',
        company: 'Baker & McKenzie',
        projectName: 'Commercial Antitrust Litigation Defense',
        technologies: 'Case Management, Statutory Compliance',
    });
    assert.equal(lawyerFallback.enhancedBullet, undefined, 'no synthesized bullet');
    assert.equal(lawyerFallback.requiresAnswer, true);
    assert.ok(lawyerFallback.questions.length > 0);
});
