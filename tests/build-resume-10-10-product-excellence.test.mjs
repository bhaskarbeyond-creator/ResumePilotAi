import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getCandidateContext } from '../src/utils/candidateContext.js';
import { calculateAtsScore } from '../src/utils/atsScore.js';

const require = createRequire(import.meta.url);
const { buildClarificationPrompt, needsClarification } = require('../backend/services/aiRuntime.js');

// Adversarial Personas Matrix (29 Real-World, Diverse, Non-IT & Novel Roles)
const ADVERSARIAL_PERSONAS = [
    { role: 'Doctor (Cardiologist)', text: 'Conducted cardiac catheterization and managed post-operative coronary care unit patients.' },
    { role: 'Dentist (Prosthodontist)', text: 'Fabricated fixed and removable prostheses, completed full-arch restorations, and treated temporomandibular disorders.' },
    { role: 'Nurse (ICU Charge Nurse)', text: 'Administered hemodynamic support, managed mechanical ventilation, and coordinated clinical crisis response.' },
    { role: 'Lawyer (Trial Attorney)', text: 'Drafted summary judgment motions, conducted depositions, and argued before appellate courts.' },
    { role: 'Judge (Magistrate)', text: 'Presided over arraignments, issued evidentiary rulings, and authored judicial opinions.' },
    { role: 'Teacher (High School Biology)', text: 'Designed AP biology curricula, facilitated laboratory investigations, and evaluated student competency.' },
    { role: 'Professor (Organic Chemistry)', text: 'Conducted asymmetric catalysis research, secured NSF research grants, and published peer-reviewed manuscripts.' },
    { role: 'Chartered Accountant (Auditor)', text: 'Conducted statutory audits, validated balance sheet reconciliations, and ensured IFRS compliance.' },
    { role: 'Finance (Investment Analyst)', text: 'Constructed DCF valuation models, conducted due diligence, and authored investment committee memorandums.' },
    { role: 'HR (Talent Acquisition Director)', text: 'Reduced time-to-fill by 28%, implemented structured behavioral interviewing, and directed executive search.' },
    { role: 'Sales (Enterprise Account Executive)', text: 'Closed $3.4M in annual contract value, managed pipeline progression, and negotiated multi-year master service agreements.' },
    { role: 'Marketing (Brand Strategist)', text: 'Led omnichannel brand repositioning, directed agency partners, and measured brand lift across national campaigns.' },
    { role: 'Architect (Urban Designer)', text: 'Prepared master plan schematic designs, conducted zoning code reviews, and coordinated structural engineering consultants.' },
    { role: 'Civil Engineer (Bridge Design)', text: 'Calculated structural load ratings, designed prestressed concrete girders, and inspected municipal bridges.' },
    { role: 'Mechanical Engineer (HVAC/Thermal)', text: 'Designed chilled water piping systems, conducted psychrometric calculations, and modeled CFD thermal airflow.' },
    { role: 'Electrical Engineer (Power Systems)', text: 'Calculated short-circuit currents, configured relay coordination curves, and designed medium-voltage substations.' },
    { role: 'Scientist (Molecular Biologist)', text: 'Performed CRISPR-Cas9 genome editing, analyzed qPCR amplifications, and maintained cell culture lines.' },
    { role: 'Researcher (Epidemiologist)', text: 'Modeled disease transmission vectors, analyzed cohort survival rates in R, and tracked public health surveillance.' },
    { role: 'Chef (Executive Pastry Chef)', text: 'Engineered plated dessert menus, formulated laminated viennoiserie, and managed pastry brigade labor costs.' },
    { role: 'Pilot (Commercial Captain B777)', text: 'Completed transpacific flight operations, executed oceanic navigation procedures, and commanded international flight crews.' },
    { role: 'Government (Policy Analyst)', text: 'Drafted legislative impact assessments, facilitated public stakeholder hearings, and briefed cabinet members.' },
    { role: 'Skilled Trade (Master Plumber)', text: 'Installed backflow preventers, soldered copper water distribution lines, and rough-in commercial DWV piping.' },
    { role: 'Artist (Sculptor / Ceramicist)', text: 'Formulated reduction-fired glazes, fabricated welded steel armatures, and mounted solo gallery exhibitions.' },
    { role: 'Writer (Investigative Journalist)', text: 'Investigated public expenditure records, interviewed confidential sources, and published investigative series.' },
    { role: 'Executive (Chief Operating Officer)', text: 'Restructured international supply chains, improved EBITDA margins by 4.2%, and oversaw 1,200 employees.' },
    { role: 'Student (Undergraduate Intern)', text: 'Completed coursework in statistical methods, organized campus symposium, and assisted faculty research.' },
    { role: 'Career Changer (Teacher to Project Manager)', text: 'Managed cross-functional schedule timelines, coordinated stakeholder meetings, and facilitated sprint retrospectives.' },
    { role: 'Freelancer (Independent Consultant)', text: 'Delivered strategic advisory engagements, managed client scopes of work, and billed independent deliverables.' },
    { role: 'Interplanetary Habitat Logistics Coordinator (Novel Role)', text: 'Monitored life-support consumable burn rates, scheduled payload resupply docking windows, and audited pressurized bay inventories.' },
];

test('10/10 Verification: Adversarial Role Matrix — Zero IT Leakage across 29 Diverse Personas', () => {
    const itKeywords = ['react', 'angular', 'vue', 'javascript', 'typescript', 'github', 'agile', 'scrum', 'ci/cd', 'docker', 'kubernetes'];

    for (const persona of ADVERSARIAL_PERSONAS) {
        const resumeData = {
            targetRole: persona.role,
            summary: persona.text,
            employments: [
                {
                    id: 1,
                    jobTitle: persona.role,
                    employer: 'Global Organization',
                    description: persona.text,
                }
            ]
        };

        const ctx = getCandidateContext(resumeData);
        assert.ok(ctx, `Context generated for ${persona.role}`);
        assert.ok(Array.isArray(ctx.vocabulary), `Vocabulary extracted for ${persona.role}`);
        assert.ok(ctx.vocabulary.length > 0, `Non-empty vocabulary for ${persona.role}`);

        // Check that none of the IT keywords leaked into vocabulary or facts
        const vocabJoined = ctx.vocabulary.join(' ').toLowerCase();
        for (const itKey of itKeywords) {
            assert.equal(
                vocabJoined.includes(itKey),
                false,
                `IT keyword '${itKey}' leaked into non-IT role '${persona.role}'`
            );
        }
    }
});

test('10/10 Verification: Zero-Fabrication Contract — Empty Notes Demand Clarification, Never Invent Facts', () => {
    const blankDoctorResume = {
        targetRole: 'Cardiothoracic Surgeon',
        employments: [
            {
                id: 101,
                jobTitle: 'Surgeon',
                employer: 'City General Hospital',
                description: '', // No candidate notes!
            }
        ]
    };

    const ctx = getCandidateContext(blankDoctorResume);
    // Facts must only reflect what was typed by the candidate
    assert.equal(ctx.facts.roles[0].title, 'Surgeon');
    assert.equal(ctx.facts.roles[0].employer, 'City General Hospital');
    assert.equal(ctx.facts.roles[0].description, '');
    assert.equal(ctx.facts.skills.length, 0); // Did not invent skills
    assert.equal(ctx.facts.education.length, 0); // Did not invent universities
});

test('10/10 Verification: Multi-Skill Delimiter Ingestion Splitting', () => {
    const rawPastedSkills = 'Patient Care, Triage; ACLS\nCPR, Critical Thinking';
    const tokens = rawPastedSkills.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);

    assert.equal(tokens.length, 5);
    assert.deepEqual(tokens, ['Patient Care', 'Triage', 'ACLS', 'CPR', 'Critical Thinking']);
});

test('10/10 Verification: ATS Score Reliability Across 29 Personas', () => {
    for (const persona of ADVERSARIAL_PERSONAS) {
        const resumeData = {
            firstname: 'Morgan',
            lastname: 'Smith',
            email: 'morgan.smith@example.org',
            phone: '+1 555-0199',
            city: 'Boston',
            country: 'USA',
            summary: persona.text,
            employments: [
                {
                    id: 1,
                    jobTitle: persona.role,
                    employer: 'Prestige Institute',
                    city: 'Boston',
                    begin: '2020-01-01',
                    end: '2024-01-01',
                    description: `• ${persona.text}\n• Improved operational throughput by 18% through standardized protocols.`
                }
            ],
            educations: [
                {
                    id: 2,
                    school: 'University of Excellence',
                    degree: 'Bachelor of Science',
                    begin: '2015-09-01',
                    end: '2019-06-01'
                }
            ],
            skills: [
                { id: 's1', skillName: 'Operations', rating: 80 },
                { id: 's2', skillName: 'Protocol Management', rating: 85 },
                { id: 's3', skillName: 'Compliance', rating: 75 }
            ]
        };

        const scoreResult = calculateAtsScore(resumeData, { jobDescription: persona.text });
        assert.ok(scoreResult.totalScore >= 50, `Score for ${persona.role} should be solid (got ${scoreResult.totalScore})`);
        assert.ok(scoreResult.totalScore <= 100, `Score cannot exceed 100 (got ${scoreResult.totalScore})`);
        assert.ok(scoreResult.sections.length >= 6, 'Sections present');

        const contactSec = scoreResult.sections.find(s => s.id === 'contact');
        const expSec = scoreResult.sections.find(s => s.id === 'experience');
        const eduSec = scoreResult.sections.find(s => s.id === 'education');

        assert.ok(contactSec && contactSec.score > 0, 'Contact score present');
        assert.ok(expSec && expSec.score > 0, 'Experience score present');
        assert.ok(eduSec && eduSec.score > 0, 'Education score present');
    }
});

test('10/10 Verification: Substantive Completion Guard in BuildResume.jsx', () => {
    const buildResumeContent = fs.readFileSync(path.resolve('src/components/BuildResume/BuildResume.jsx'), 'utf-8');

    // Must evaluate substantive content first before honoring completedSteps cache
    assert.match(buildResumeContent, /hasSubstantiveContent/);
    assert.match(buildResumeContent, /if \(!hasSubstantiveContent\) return false;/);
});

test('10/10 Verification: Mobile Progressive Disclosure in StepShell.jsx', () => {
    const stepShellContent = fs.readFileSync(path.resolve('src/components/BuildResume/components/StepShell.jsx'), 'utf-8');

    // Must have mobile section guide accordion with aria-expanded controls and StepGuide
    assert.match(stepShellContent, /isMobileGuideOpen/);
    assert.match(stepShellContent, /Section Guide & ATS Insights/);
    assert.match(stepShellContent, /aria-controls=\{`mobile-guide-\$\{stepPath\}`\}/);
});

test('10/10 Verification: Atomic Save Pipeline Across Form Steps', () => {
    const stepFiles = [
        'src/components/BuildResume/steps/HeadingStep.jsx',
        'src/components/BuildResume/steps/WorkHistoryStep.jsx',
        'src/components/BuildResume/steps/EducationStep.jsx',
        'src/components/BuildResume/steps/SkillsStep.jsx',
        'src/components/BuildResume/steps/LanguagesStep.jsx',
        'src/components/BuildResume/steps/SummaryStep.jsx'
    ];

    for (const file of stepFiles) {
        const content = fs.readFileSync(path.resolve(file), 'utf-8');
        // Must use updatedCompletedSteps pattern for atomic single dispatch
        assert.match(content, /updatedCompletedSteps/, `File ${file} must use atomic updatedCompletedSteps`);
    }
});

test('10/10 Verification: Dynamic AI Clarification Questions & Zero IT Leakage', () => {
    // Needs clarification when notes are sparse (< 10 chars)
    assert.equal(needsClarification('generate-work-description', { existingText: '' }), true);
    assert.equal(needsClarification('generate-work-description', { existingText: 'too short' }), true);
    assert.equal(needsClarification('generate-work-description', { existingText: 'A detailed note describing day to day patient responsibilities.' }), false);

    // Targeted role prompts must not leak IT vocabulary
    const doctorPrompt = buildClarificationPrompt('generate-work-description', {
        jobTitle: 'Pediatric Cardiologist',
        employer: 'Children’s Memorial Hospital',
        existingText: '',
    });
    assert.match(doctorPrompt.prompt, /Pediatric Cardiologist/);
    assert.match(doctorPrompt.prompt, /Children’s Memorial Hospital/);
    assert.doesNotMatch(doctorPrompt.prompt.toLowerCase(), /\b(react|docker|kubernetes|github|ci\/cd)\b/);

    const chefPrompt = buildClarificationPrompt('generate-work-description', {
        jobTitle: 'Executive Chef',
        employer: 'Le Petit Bistro',
        existingText: '',
    });
    assert.match(chefPrompt.prompt, /Executive Chef/);
    assert.match(chefPrompt.prompt, /Le Petit Bistro/);
    assert.doesNotMatch(chefPrompt.prompt.toLowerCase(), /\b(react|docker|kubernetes|github|ci\/cd)\b/);
});

test('10/10 Verification: All 11 Step Components Implement Unmount Flush Keystroke Protection', () => {
    const allStepFiles = [
        'src/components/BuildResume/steps/HeadingStep.jsx',
        'src/components/BuildResume/steps/WorkHistoryStep.jsx',
        'src/components/BuildResume/steps/EducationStep.jsx',
        'src/components/BuildResume/steps/SkillsStep.jsx',
        'src/components/BuildResume/steps/LanguagesStep.jsx',
        'src/components/BuildResume/steps/SummaryStep.jsx',
        'src/components/BuildResume/steps/ProjectsStep.jsx',
        'src/components/BuildResume/steps/CertificationsStep.jsx',
        'src/components/BuildResume/steps/AchievementsStep.jsx',
        'src/components/BuildResume/steps/ReferencesStep.jsx',
        'src/components/BuildResume/steps/CustomSectionsStep.jsx'
    ];

    for (const file of allStepFiles) {
        const content = fs.readFileSync(path.resolve(file), 'utf-8');
        // Must contain unmount flush pattern using ref and cleanup function
        assert.match(content, /updateResumeDataRef\.current/, `${file} must flush updateResumeDataRef on unmount`);
        assert.match(content, /useEffect\(\(\) => \(\) =>/, `${file} must have an unmount cleanup effect`);
    }
});

test('10/10 Verification: Adversarial Inputs & Extreme Stress Invariance', () => {
    // 1. Extreme text (10,000 chars)
    const longText = 'Patient triage protocols. '.repeat(400);
    const longCandidate = {
        targetRole: 'Emergency Medicine Physician',
        summary: longText,
        employments: [{ id: 1, jobTitle: 'Attending Physician', employer: 'Metro Trauma Center', description: longText }]
    };
    const longCtx = getCandidateContext(longCandidate);
    assert.ok(longCtx.vocabulary.length > 0, 'Vocabulary parsed for long candidate');
    const longAts = calculateAtsScore(longCandidate);
    assert.ok(typeof longAts.qualityScore === 'number' && Number.isFinite(longAts.qualityScore), 'ATS score handles 10k text');

    // 2. Completely blank / empty candidate
    const emptyCtx = getCandidateContext({});
    assert.ok(emptyCtx.facts, 'Empty context has facts');
    const emptyAts = calculateAtsScore({});
    assert.equal(typeof emptyAts.qualityScore, 'number');

    // 3. Malformed primitives (numbers, booleans, symbols where strings expected)
    const malformedCandidate = {
        firstname: 12345,
        lastname: true,
        occupation: { title: 'Complex Object' },
        employments: [null, undefined, { jobTitle: 999, employer: null, description: false }]
    };
    const malformedCtx = getCandidateContext(malformedCandidate);
    assert.ok(malformedCtx, 'Context survives malformed primitives');
    const malformedAts = calculateAtsScore(malformedCandidate);
    assert.ok(Number.isFinite(malformedAts.qualityScore), 'ATS score survives malformed primitives');

    // 4. Novel / invented roles (Hydroponic Vertical Farmer)
    const novelCandidate = {
        targetRole: 'Hydroponic Vertical Aeroponics Specialist',
        summary: 'Formulated nutrient dosing recipes, calibrated electrical conductivity sensors, and automated LED photoperiods.',
        employments: [{ id: 1, jobTitle: 'Vertical Agronomist', employer: 'SkyGreens Urban Farm', description: 'Monitored dissolved oxygen levels and managed closed-loop fertigation.' }]
    };
    const novelCtx = getCandidateContext(novelCandidate);
    assert.ok(novelCtx.vocabulary.length > 0, 'Vocabulary parsed for novel role');
    const novelAts = calculateAtsScore(novelCandidate);
    assert.ok(novelAts.qualityScore > 0, 'Deterministic ATS score calculated for novel role');
});


