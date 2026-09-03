import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateAtsScore, ATS_WEIGHTS, matchJobDescription } from '../src/utils/atsScore.js';

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
    });

    it('matches target job description keywords and surfaces gaps', () => {
        const jd = `We are looking for a Senior Staff Software Engineer experienced in Kubernetes, Go, Kafka, Distributed Systems, Rust, and GraphQL.`;
        const atsResult = calculateAtsScore(sampleResume, { jobDescription: jd });
        const match = atsResult.jdMatch;

        assert.ok(match.score > 0, `Match score should be > 0, got ${match.score}`);
        assert.ok(match.matched.length > 0, 'Should have matched keywords');
        assert.ok(match.missing.length > 0, 'Should have missing keywords');
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
    });

    it('verifies StepWorkspaceLayout component exists and exports properly', () => {
        const layoutPath = path.resolve('src/components/BuildResume/components/StepWorkspaceLayout.jsx');
        assert.ok(fs.existsSync(layoutPath), 'StepWorkspaceLayout.jsx must exist');
        const content = fs.readFileSync(layoutPath, 'utf8');

        assert.ok(content.includes('StepAtsCompanion'), 'Layout should import and render StepAtsCompanion');
        assert.ok(content.includes('lg:grid-cols-12'), 'Layout should use 12-column responsive grid');
        assert.ok(content.includes('lg:col-span-8'), 'Layout should provide 8-column main canvas');
        assert.ok(content.includes('lg:col-span-4'), 'Layout should provide 4-column sticky rail');
    });

    it('verifies StepAtsCompanion component exists with all 11 step mappings', () => {
        const companionPath = path.resolve('src/components/BuildResume/components/StepAtsCompanion.jsx');
        assert.ok(fs.existsSync(companionPath), 'StepAtsCompanion.jsx must exist');
        const content = fs.readFileSync(companionPath, 'utf8');

        const stepKeys = [
            'heading',
            'work-history',
            'education',
            'skills',
            'projects',
            'certifications',
            'languages',
            'summary',
            'achievements',
            'references',
            'custom',
            'review'
        ];

        for (const key of stepKeys) {
            assert.ok(content.includes(key), `StepAtsCompanion must support step key '${key}'`);
        }
    });

    it('verifies all 11 step files wrap their contents in StepWorkspaceLayout', () => {
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
            assert.ok(content.includes('StepWorkspaceLayout'), `${file} must import and use StepWorkspaceLayout`);
            assert.ok(content.includes('onNavigate'), `${file} must accept onNavigate prop`);
        }
    });

    it('verifies ReviewStep.jsx is upgraded into an ATS Readiness Command Center', () => {
        const reviewPath = path.resolve('src/components/BuildResume/steps/ReviewStep.jsx');
        assert.ok(fs.existsSync(reviewPath), 'ReviewStep.jsx must exist');
        const content = fs.readFileSync(reviewPath, 'utf8');

        assert.ok(content.includes('calculateAtsScore'), 'ReviewStep must calculate ATS scores');
        assert.ok(content.includes('ATS Readiness Command Center'), 'ReviewStep must display command center header');
        assert.ok(content.includes('Section Readiness & ATS Weight Distribution'), 'ReviewStep must show section readiness breakdown');
        assert.ok(content.includes('Target Job Description Matcher'), 'ReviewStep must feature JD matcher');
        assert.ok(content.includes('Key Strengths Detected'), 'ReviewStep must show key strengths');
        assert.ok(content.includes('Priority Recommendations'), 'ReviewStep must show priority recommendations');
    });
});
