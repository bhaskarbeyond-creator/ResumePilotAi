import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { generateClientRoleBullet } from '../src/utils/bulletQuality.js';

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

    // 2. Doctor Fallback Test (Deterministic Profile Matching)
    const doctorFallback = getContentOperationFallback('generate-projects', {
        targetRole: 'Cardiologist',
        occupation: 'Cardiologist',
    });

    assert.ok(Array.isArray(doctorFallback.projects), 'Must return projects array');
    assert.ok(doctorFallback.projects.length >= 3, 'Must have at least 3 clinical projects');
    const doctorText = JSON.stringify(doctorFallback.projects).toLowerCase();
    assert.ok(doctorText.includes('clinical') || doctorText.includes('patient') || doctorText.includes('triage'), 'Must contain clinical initiatives');
    assert.equal(doctorText.includes('react'), false, 'Zero IT React leakage for Cardiologist');
    assert.equal(doctorText.includes('saas'), false, 'Zero SaaS leakage for Cardiologist');
    assert.equal(doctorText.includes('docker'), false, 'Zero Docker leakage for Cardiologist');

    // 3. Legal / Attorney Persona
    const lawyerFallback = getContentOperationFallback('generate-projects', {
        targetRole: 'Trial Attorney',
        occupation: 'Trial Attorney',
    });
    const lawyerText = JSON.stringify(lawyerFallback.projects).toLowerCase();
    assert.ok(lawyerText.includes('contract') || lawyerText.includes('litigation') || lawyerText.includes('compliance'), 'Must contain legal initiatives');
    assert.equal(lawyerText.includes('full-stack'), false, 'Zero full-stack leakage for Attorney');

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

test('Client Fallback Bullet Generator: Project-Specific Output', () => {
    const bullet = generateClientRoleBullet(
        'Lead Engineer',
        'Acme Corp',
        [],
        '',
        'Real-Time Chat Application',
        'React, Node.js, WebSockets, Redis'
    );

    assert.ok(
        bullet.includes('Real-Time Chat Application'),
        `Fallback bullet must mention project name. Generated: "${bullet}"`
    );
    assert.ok(
        bullet.includes('React, Node.js, WebSockets, Redis'),
        `Fallback bullet must mention technologies. Generated: "${bullet}"`
    );
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

test('Doctor/Medical Project: generateClientRoleBullet produces clinical project achievement with zero tech leakage', () => {
    const doctorProjectBullet = generateClientRoleBullet(
        'Cardiologist',
        'Mount Sinai Hospital',
        [],
        '',
        'Pediatric Cardiac Surgery Outcomes Registry',
        'Clinical Protocols, JCAHO'
    );

    assert.ok(doctorProjectBullet.includes('Pediatric Cardiac Surgery Outcomes Registry'), 'Must include project name');
    assert.match(doctorProjectBullet, /clinical|diagnostic|patient/i, 'Must contain authentic clinical terminology');
    assert.equal(/react|node\.js|api|backend|microservices|cloud|ci\/cd|pipeline/i.test(doctorProjectBullet), false, 'Zero IT leakage in medical project bullet');
});

test('Backend Fallback: enhance-single-bullet produces project-tailored bullet with zero tech leakage for non-tech roles', () => {
    const lawyerFallback = getContentOperationFallback('enhance-single-bullet', {
        jobTitle: 'Trial Attorney',
        company: 'Baker & McKenzie',
        projectName: 'Commercial Antitrust Litigation Defense',
        technologies: 'Case Management, Statutory Compliance',
    });

    assert.ok(lawyerFallback.enhancedBullet, 'Must return enhancedBullet');
    assert.ok(lawyerFallback.enhancedBullet.includes('Commercial Antitrust Litigation Defense'), 'Must mention project title');
    assert.match(lawyerFallback.enhancedBullet, /case|litigat|compliance|statutory/i, 'Must contain legal vocabulary');
    assert.equal(/react|node\.js|full-stack|docker|cloud|aws/i.test(lawyerFallback.enhancedBullet), false, 'Zero IT leakage in legal project fallback');
});
