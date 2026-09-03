import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateAtsScore, matchJobDescription } from '../src/utils/atsScore.js';

/**
 * 11-Step Resume Builder — re-architecture suite (2026-09-03).
 *
 * Pins the NEW architecture from docs/BUILD_RESUME_REARCHITECTURE_PLAN_20260903.md:
 *   - deterministic ATS scoring (7 sections) with a MATCHED / PARTIAL / MISSING
 *     JD matcher (partial = half weight, no hidden "weight distribution" UI);
 *   - StepShell + StepGuide replace StepWorkspaceLayout + StepAtsCompanion;
 *   - quick-add / card-soup chrome (QuickAddCommandBar, TrackGuidanceBanner,
 *     AiDraftReviewModal, suggestion modals, FinalizeStep) is gone;
 *   - ReviewStep is calm and factual: engine findings only, no invented
 *     statistics, no "command center" branding;
 *   - zero-fabrication: no sample/role-example content in any step.
 */
describe('11-Step Resume Builder UX & ATS Intelligence Overhaul Suite', () => {
    const sampleResume = {
        firstname: 'Jane',
        lastname: 'Doe',
        email: 'jane.doe@example.com',
        phone: '+1 555-0199',
        city: 'San Francisco',
        country: 'United States',
        occupation: 'Senior Staff Software Engineer',
        linkedin: 'https://linkedin.com/in/janedoe',
        github: 'https://github.com/janedoe',
        website: 'https://janedoe.dev',
        summary: 'Accomplished Senior Staff Software Engineer with over 10 years of experience architecting distributed cloud systems, optimizing microservices, and leading high-performance engineering teams.',
        employments: [
            {
                id: 1,
                jobTitle: 'Principal Engineer',
                employer: 'CloudScale Inc',
                city: 'San Francisco',
                state: 'CA',
                begin: '2021-01',
                end: '',
                current: true,
                description: '<ul><li>Spearheaded transition to Kubernetes microservices, reducing AWS operational spend by 35% ($1.2M annually).</li><li>Engineered event-driven distributed streaming pipeline handling 4.5 billion events daily with 99.999% uptime SLA.</li></ul>'
            },
            {
                id: 2,
                jobTitle: 'Senior Software Engineer',
                employer: 'DataCorp',
                city: 'Seattle',
                state: 'WA',
                begin: '2017-03',
                end: '2020-12',
                description: '<ul><li>Optimized MariaDB query execution latency by 42% across 80TB multi-tenant relational clusters.</li><li>Mentored a team of 8 software engineers on distributed consensus, system telemetry, and zero-downtime database migrations.</li></ul>'
            }
        ],
        educations: [
            {
                id: 1,
                degree: 'Master of Science in Computer Science',
                school: 'Stanford University',
                city: 'Stanford',
                started: '2015',
                finished: '2017'
            }
        ],
        skills: [
            { id: 1, skillName: 'Kubernetes' },
            { id: 2, skillName: 'Docker' },
            { id: 3, skillName: 'Distributed Systems' },
            { id: 4, skillName: 'Go' },
            { id: 5, skillName: 'Python' },
            { id: 6, skillName: 'TypeScript' },
            { id: 7, skillName: 'React' },
            { id: 8, skillName: 'MariaDB' },
            { id: 9, skillName: 'Kafka' },
            { id: 10, skillName: 'AWS Cloud Architecture' }
        ],
        projects: [
            {
                id: 1,
                title: 'High-Throughput Distributed Cache',
                url: 'https://github.com/janedoe/distcache',
                description: 'Engineered a lock-free distributed cache in Go supporting sub-millisecond p99 latency for over 500,000 requests per second.'
            }
        ],
        certifications: [
            {
                id: 1,
                title: 'AWS Certified Solutions Architect - Professional',
                issuer: 'Amazon Web Services',
                date: '2024'
            }
        ],
        languages: [
            { id: 1, language: 'English', proficiency: 'Native' },
            { id: 2, language: 'German', proficiency: 'Professional Working' }
        ],
        achievements: [
            {
                id: 1,
                title: 'Patent: Adaptive Sharding in Distributed Relational Storage',
                description: 'Awarded US Patent 11,234,567 for novel dynamic partition balancing under heavy write skew.'
            }
        ],
        references: [
            {
                id: 1,
                name: 'Dr. Robert Smith',
                reference: 'Former VP of Engineering at CloudScale Inc; available upon request.'
            }
        ],
        customSections: [
            {
                id: 'custom-1',
                title: 'Keynote & Speaking Engagements',
                items: [
                    { id: 1, title: 'KubeCon 2024 Speaker', description: 'Presented deep-dive on multi-cluster disaster recovery under partition isolation.' }
                ]
            }
        ]
    };

    it('calculates deterministic ATS quality score and section breakdown correctly', () => {
        const atsResult = calculateAtsScore(sampleResume);

        assert.ok(atsResult.qualityScore >= 80, `Expected qualityScore >= 80, got ${atsResult.qualityScore}`);
        assert.ok(Array.isArray(atsResult.sections), 'Expected sections array');
        assert.equal(atsResult.sections.length, 7, 'Expected 7 ATS evaluation dimensions');

        // Check contact section
        const contactSec = atsResult.sections.find(s => s.id === 'contact');
        assert.ok(contactSec, 'Contact section should exist');
        assert.equal(contactSec.score, contactSec.maxScore, 'Contact score should be max for complete profile');

        // Check experience section
        const expSec = atsResult.sections.find(s => s.id === 'experience');
        assert.ok(expSec, 'Experience section should exist');
        assert.ok(expSec.facts.verbs >= 2, `Expected verbs >= 2, got ${expSec.facts.verbs}`);
        assert.ok(expSec.facts.metrics >= 2, `Expected metrics >= 2, got ${expSec.facts.metrics}`);

        // Strengths / improvements are engine-produced, non-empty for a full profile
        assert.ok(Array.isArray(atsResult.strengths) && atsResult.strengths.length >= 1, 'Expected engine strengths');
        assert.ok(Array.isArray(atsResult.improvements), 'Expected improvements array');
    });

    it('matches target job description keywords into matched / partial / missing buckets', () => {
        const jd = 'We are looking for a Senior Staff Software Engineer experienced in Kubernetes, Go, Kafka, Distributed Systems, Rust, and GraphQL.';
        const atsResult = calculateAtsScore(sampleResume, { jobDescription: jd });
        const match = atsResult.jdMatch;

        assert.ok(match.score > 0, `Match score should be > 0, got ${match.score}`);
        assert.ok(match.matched.length > 0, 'Should have matched keywords');
        assert.ok(match.missing.length > 0, 'Should have missing keywords');
        assert.ok(Array.isArray(match.partial), 'PARTIAL bucket must always be present');
    });

    it('PARTIAL: multi-word term counts as partial when a distinctive part is present (half weight)', () => {
        // "Distributed Systems" is in the resume → matched.
        // "Kubernetes Operator Framework": resume has "Kubernetes" but not the
        // full multi-word term → partial, not missing.
        const resumeText = 'Worked with Kubernetes and wrote an operator for it; used React with native mobile modules.';
        const jd = 'Required skills: Kubernetes Operator Framework, React Native, Terraform';
        const match = matchJobDescription(resumeText, jd);

        assert.ok(match.partial.includes('Kubernetes Operator Framework'), `Expected partial for "Kubernetes Operator Framework", got ${JSON.stringify(match.partial)}`);
        assert.ok(match.partial.includes('React Native'), `Expected partial for "React Native", got ${JSON.stringify(match.partial)}`);
        assert.ok(match.missing.some((term) => term.toLowerCase() === 'terraform'), `Expected missing for terraform, got ${JSON.stringify(match.missing)}`);

        // Invariant: single-word terms can never be partial — present or missing.
        for (const term of match.partial) {
            assert.ok(term.includes(' '), `Partial terms must be multi-word, got ${JSON.stringify(term)}`);
        }

        // Partial terms carry half weight: a full-text resume must outscore the partial one.
        const fullText = 'Kubernetes Operator Framework, React Native and Terraform expertise.';
        const full = matchJobDescription(fullText, jd);
        assert.ok(full.matched.includes('Kubernetes Operator Framework'), 'full text should match the term exactly');
        assert.ok(full.score > match.score, `Full text (${full.score}) should outscore partial text (${match.score})`);
        assert.equal(match.score, Math.round((0.5 * match.partial.length) / match.total * 100), 'partial terms weight 0.5 each');
    });

    it('verifies BuildResume.jsx employments bugfix and container expansion', () => {
        const buildResumePath = path.resolve('src/components/BuildResume/BuildResume.jsx');
        const code = fs.readFileSync(buildResumePath, 'utf8');

        // Verify employments property is used, NOT workHistory
        assert.ok(code.includes('resumeData.employments || []'), 'BuildResume should use resumeData.employments');
        assert.ok(!code.includes('resumeData.workHistory || []'), 'BuildResume should NOT reference resumeData.workHistory');

        // Verify container is widened to max-w-7xl
        assert.ok(code.includes('max-w-7xl mx-auto'), 'BuildResume canvas container should use max-w-7xl');

        // Verify onNavigate is passed to step routes
        assert.ok(code.includes('onNavigate={handleStepClick}'), 'BuildResume should pass onNavigate to routes');

        // Shell must NOT call window.prompt (replaced by in-app dialog)
        assert.ok(!code.includes('window.prompt'), 'BuildResume must not use window.prompt');
    });

    it('verifies StepShell + StepGuide replace StepWorkspaceLayout / StepAtsCompanion', () => {
        const shellPath = path.resolve('src/components/BuildResume/components/StepShell.jsx');
        const guidePath = path.resolve('src/components/BuildResume/components/StepGuide.jsx');
        assert.ok(fs.existsSync(shellPath), 'StepShell.jsx must exist');
        assert.ok(fs.existsSync(guidePath), 'StepGuide.jsx must exist');

        const shell = fs.readFileSync(shellPath, 'utf8');
        assert.ok(shell.includes('getCandidateContext'), 'StepShell must derive guidance from candidate context');
        assert.ok(shell.includes('calculateAtsScore'), 'StepShell must surface real ATS findings');
        assert.ok(shell.includes('lg:grid-cols-12'), 'StepShell must use 12-column responsive grid');
        assert.ok(shell.includes('lg:col-span-8'), 'StepShell must provide main canvas column');

        const guide = fs.readFileSync(guidePath, 'utf8');
        assert.ok(guide.includes('stepPath'), 'StepGuide must be step-aware');
        assert.ok(guide.includes('gaps'), 'StepGuide must show deterministic gaps');

        // Old layout components must be gone.
        assert.ok(!fs.existsSync(path.resolve('src/components/BuildResume/components/StepWorkspaceLayout.jsx')), 'StepWorkspaceLayout must be removed');
        assert.ok(!fs.existsSync(path.resolve('src/components/BuildResume/components/StepAtsCompanion.jsx')), 'StepAtsCompanion must be removed');
    });

    it('verifies all 11 step files use StepShell (and not the old layout)', () => {
        const stepFiles = [
            'HeadingStep.jsx',
            'WorkHistoryStep.jsx',
            'EducationStep.jsx',
            'SkillsStep.jsx',
            'ProjectsStep.jsx',
            'CertificationsStep.jsx',
            'LanguagesStep.jsx',
            'SummaryStep.jsx',
            'AchievementsStep.jsx',
            'ReferencesStep.jsx',
            'CustomSectionsStep.jsx'
        ];

        for (const file of stepFiles) {
            const filePath = path.resolve(`src/components/BuildResume/steps/${file}`);
            assert.ok(fs.existsSync(filePath), `${file} must exist`);
            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.includes('StepShell'), `${file} must use StepShell`);
            assert.ok(content.includes('onNavigate'), `${file} must accept onNavigate prop`);
            assert.ok(!content.includes('StepWorkspaceLayout'), `${file} must not use StepWorkspaceLayout`);
            assert.ok(!content.includes('QuickAddCommandBar'), `${file} must not use QuickAddCommandBar`);
            assert.ok(!content.includes('TrackGuidanceBanner'), `${file} must not use TrackGuidanceBanner`);
        }
    });

    it('verifies clutter components and legacy modals are deleted', () => {
        const clutter = [
            'src/components/BuildResume/components/QuickAddCommandBar.jsx',
            'src/components/BuildResume/components/TrackGuidanceBanner.jsx',
            'src/components/BuildResume/components/AiDraftReviewModal.jsx',
            'src/components/BuildResume/steps/components/WorkHistorySuggestionModal.jsx',
            'src/components/BuildResume/steps/components/EducationSuggestionModal.jsx',
            'src/components/BuildResume/steps/FinalizeStep.jsx'
        ];
        for (const rel of clutter) {
            assert.ok(!fs.existsSync(path.resolve(rel)), `${rel} must be removed`);
        }
    });

    it('verifies ReviewStep is calm, factual, and driven by engine findings', () => {
        const reviewPath = path.resolve('src/components/BuildResume/steps/ReviewStep.jsx');
        assert.ok(fs.existsSync(reviewPath), 'ReviewStep.jsx must exist');
        const content = fs.readFileSync(reviewPath, 'utf8');

        assert.ok(content.includes('calculateAtsScore'), 'ReviewStep must calculate ATS scores');
        assert.ok(content.includes('Section readiness'), 'ReviewStep must show section readiness breakdown');
        assert.ok(content.includes('Target job description'), 'ReviewStep must feature JD matcher');
        assert.ok(content.includes('partial'), 'ReviewStep must surface the PARTIAL bucket honestly');
        assert.ok(content.includes('updateResumeData'), 'ReviewStep must persist the target JD');

        // Invented marketing must be gone.
        assert.ok(!content.includes('ATS Readiness Command Center'), 'No "command center" branding');
        assert.ok(!content.includes('ATS Weight Distribution'), 'No hidden weight-distribution UI');
        assert.ok(!content.includes('Weight:'), 'No per-section weight pills');
    });

    it('verifies zero-fabrication invariants across all steps', () => {
        const stepDir = path.resolve('src/components/BuildResume/steps');
        const files = fs.readdirSync(stepDir).filter((f) => f.endsWith('.jsx'));
        const banned = [
            /Popular (Nearby )?Universities/i,
            /Quick Grade Presets/i,
            /92% Recruiters/i,
            /Most Sought/i,
            /Suggested for (you|this role)/i
        ];
        for (const file of files) {
            const content = fs.readFileSync(path.join(stepDir, file), 'utf8');
            for (const pattern of banned) {
                assert.ok(!pattern.test(content), `${file} contains fabricated content matching ${pattern}`);
            }
        }
    });
});
