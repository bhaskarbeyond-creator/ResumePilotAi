import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildInterviewPrompt,
    generateDefaultInterview,
    dedupeQuestions,
    questionKey,
    interviewDifficultyDistribution,
    cleanInterviewMetadataArtifacts,
    isGenericQuestion,
    extractCandidateProfile,
    extractJobRequirements,
    buildContextualBlueprint,
} from '../routes/ai.js';
import {
    cleanInterviewMetadataArtifacts as frontendCleaner,
    normalizeQuestions,
    sanitizeJobDescription,
} from '../../src/utils/interviewCoach.js';

test('1. cleanInterviewMetadataArtifacts strips all forms of leaked metadata, UI headers, and robotic preambles', () => {
    const leakCases = [
        {
            input: 'Target Role & Discipline: Senior Software Engineer. How would you design a distributed cache with eviction policies?',
            expected: 'How would you design a distributed cache with eviction policies?',
        },
        {
            input: 'Target Job Description (Optional — AI Tailoring) As a Senior DevOps Engineer, how do you handle zero-downtime deployments?',
            expected: 'How do you handle zero-downtime deployments?',
        },
        {
            input: 'Based on the Target Job Description and Candidate Profile, explain your approach to optimizing DV360 programmatic campaigns.',
            expected: 'Explain your approach to optimizing DV360 programmatic campaigns.',
        },
        {
            input: '[AI Tailoring]: In the context of the job description, how do you diagnose Floodlight tag conversion drop-offs in CM360?',
            expected: 'How do you diagnose Floodlight tag conversion drop-offs in CM360?',
        },
        {
            input: 'Considering the Target Job Description: Walk me through diagnosing a campaign where impressions serve but conversion tracking drops.',
            expected: 'Walk me through diagnosing a campaign where impressions serve but conversion tracking drops.',
        },
        {
            input: 'For the target role of Senior Marketing Manager, as mentioned in the job description: How would you prioritize CAC vs LTV?',
            expected: 'How would you prioritize CAC vs LTV?',
        },
        {
            input: 'Given the candidate profile and experience as a Lead Data Analyst: Describe how you handle missing event telemetry in an ETL pipeline.',
            expected: 'Describe how you handle missing event telemetry in an ETL pipeline.',
        },
        {
            input: 'Target Role: Backend Engineer. Discipline: Distributed Systems. What consistency trade-off occurs in Raft consensus?',
            expected: 'What consistency trade-off occurs in Raft consensus?',
        },
    ];

    for (const { input, expected } of leakCases) {
        const backendCleaned = cleanInterviewMetadataArtifacts(input);
        const frontendCleaned = frontendCleaner(input);
        assert.equal(backendCleaned, expected, `Backend cleaner failed on: ${input}`);
        assert.equal(frontendCleaned, expected, `Frontend cleaner failed on: ${input}`);
    }
});

test('2. cleanInterviewMetadataArtifacts preserves authentic candidate scenario questions without over-stripping', () => {
    const legitQuestions = [
        'You managed CM360 trafficking across multiple high-budget accounts. Walk me through diagnosing a campaign where impressions serve normally but conversions drop.',
        'When designing a multi-region database replication architecture, how do you prevent split-brain scenarios during network partitions?',
        'In your previous role building ETL pipelines in Python, how did you maintain data idempotency during pipeline reruns?',
        'How do you negotiate engineering technical debt reduction with executive stakeholders prioritizing new feature delivery?',
    ];

    for (const q of legitQuestions) {
        const cleaned = cleanInterviewMetadataArtifacts(q);
        assert.equal(cleaned, q, `Legitimate question was incorrectly altered: ${q}`);
    }
});

test('3. Candidate Profile extraction structures verified facts without hallucination', () => {
    const rawFacts = `
Name: Alex Rivera
Occupation: Senior Ad Operations & Programmatic Specialist
Summary: 6 years managing programmatic display, video, and audio campaigns with hands-on CM360 and DV360 execution.
Work: Senior Ad Ops Lead at MediaCorp; Trafficking Specialist at AdAgency
Skills: Campaign Manager 360 (CM360), Display & Video 360 (DV360), Google Tag Manager, Floodlight Tagging, SQL
Projects: Global Brand Launch with $2M quarterly spend; Tag Governance Migration
Certifications: Google Marketing Platform Certified, DV360 Specialist
Education: BS in Marketing — State University
    `.trim();

    const profile = extractCandidateProfile(rawFacts);
    assert.equal(profile.name, 'Alex Rivera');
    assert.equal(profile.occupation, 'Senior Ad Operations & Programmatic Specialist');
    assert.ok(profile.work.some(w => w.includes('MediaCorp')));
    assert.ok(profile.skills.includes('Campaign Manager 360 (CM360)'));
    assert.ok(profile.skills.includes('Display & Video 360 (DV360)'));
    assert.ok(profile.confirmedExperience.includes('Alex Rivera'));
    assert.ok(!profile.confirmedExperience.includes('Target Role & Discipline'));
});

test('4. Job Requirements extraction cleans raw input and preserves technical keywords', () => {
    const rawJd = `
Target Job Description (Optional — AI Tailoring):
We are seeking a Senior Programmatic Media Manager to lead DV360 bidding strategies, manage DSP/SSP private marketplace (PMP) deals, optimize viewability metrics, and troubleshoot Floodlight conversion pixels.
    `.trim();

    const jd = extractJobRequirements(rawJd, 'Senior Programmatic Media Manager');
    assert.ok(!jd.cleanRequirements.includes('Target Job Description'));
    assert.ok(jd.cleanRequirements.includes('DV360 bidding strategies'));
    assert.ok(jd.cleanRequirements.includes('Floodlight conversion pixels'));
});

test('5. Blueprint identifies high-value skill intersections between Candidate and JD', () => {
    const profile = {
        skills: ['CM360', 'DV360', 'Google Tag Manager', 'SQL'],
        work: ['Ad Ops Specialist at MediaHub'],
    };
    const jd = {
        cleanRequirements: 'Looking for DV360 and CM360 optimization expertise with Floodlight and PMP deals.',
    };

    const blueprint = buildContextualBlueprint({
        occupation: 'Senior Programmatic Specialist',
        interviewType: 'technical',
        experienceLevel: 'senior',
        difficulty: 'hard',
        candidateProfile: profile,
        jdRequirements: jd,
        questionCount: 10,
    });

    assert.ok(blueprint.intersectingSkills.includes('CM360'));
    assert.ok(blueprint.intersectingSkills.includes('DV360'));
    assert.equal(blueprint.distribution.easy + blueprint.distribution.intermediate + blueprint.distribution.advanced, 10);
    assert.ok(blueprint.distribution.advanced >= 3, 'Senior + Hard should allocate significant Advanced questions');
});

test('6. Prompt Builder enforces 4-Level Hierarchy and strict anti-leakage directives', () => {
    const promptInput = {
        occupation: 'Senior Distributed Systems Engineer',
        interviewType: 'technical',
        experienceLevel: 'Staff / Principal',
        difficulty: 'hard',
        questionCount: 12,
        resumeFacts: 'Name: Asha Rao\nOccupation: Senior Engineer\nSkills: Go, Kafka, Kubernetes, PostgreSQL\nWork: Staff Engineer at CloudScale',
        jobDescription: 'Build high-throughput event ingestion pipelines handling 500k ops/sec with sub-millisecond p99 latency.',
        language: 'en',
    };

    const built = buildInterviewPrompt(promptInput);
    assert.equal(built.validQuestionCount, 12);
    assert.ok(built.prompt.includes('[LEVEL 1: CANDIDATE VERIFIED EVIDENCE]'));
    assert.ok(built.prompt.includes('[LEVEL 2 & 3: TARGET ROLE & DISCIPLINE FRAMEWORK]'));
    assert.ok(built.prompt.includes('[LEVEL 4: TARGET JOB REQUIREMENTS SPECIFICATION]'));
    assert.ok(built.prompt.includes('ABSOLUTE BAN ON METADATA LEAKAGE'));
    assert.ok(built.prompt.includes('ZERO HALLUCINATION'));
    assert.ok(built.prompt.includes('ZERO GENERIC FLUFF'));
    assert.ok(built.prompt.includes('100% CONTEXTUAL ANCHORS'));
    assert.ok(built.prompt.includes('Difficulty distribution for this run:'));
    assert.ok(built.prompt.includes('unique run token:'));
    assert.ok(!built.prompt.includes('Target Role & Discipline:'));
});

test('7. isGenericQuestion reliably detects banned superficial questions', () => {
    assert.ok(isGenericQuestion('Tell me about yourself.'));
    assert.ok(isGenericQuestion('What are your greatest strengths and weaknesses?'));
    assert.ok(isGenericQuestion('Why should we hire you for this role?'));
    assert.ok(isGenericQuestion('What is Python?'));
    assert.ok(isGenericQuestion('What tools or technologies do you use?'));
    assert.ok(isGenericQuestion('What is your experience with Kubernetes?'));

    // Applied questions should NOT be flagged as generic
    assert.ok(!isGenericQuestion('How do you diagnose intermittent latency spikes in a Kafka consumer group processing out-of-order partitions?'));
    assert.ok(!isGenericQuestion('When trafficking video creatives in CM360 with VAST 4.0 wrappers, how do you verify companion banner click-through tags?'));
    assert.ok(!isGenericQuestion('What trade-off between customer acquisition cost and payback period would you recommend when launching a new B2B product tier?'));
});

test('8. normalizeQuestions cleans and validates options, questions, and bounds in frontend', () => {
    const rawQuestions = [
        {
            id: 'q1',
            question: 'Target Role & Discipline: Software Engineer. How do you implement idempotency keys in payment processing APIs?',
            options: [
                'Target Job Description: Store transaction tokens in a distributed lock with TTL',
                'Retry payments infinitely without tracking tokens',
                'Rely on user browser localStorage',
                'Disable retry mechanisms completely',
            ],
            correctAnswer: 0,
            category: 'API Design',
            difficulty: 'Intermediate',
            explanation: 'Distributed locks with TTL prevent duplicate transaction execution.',
        },
        {
            id: 'q2',
            question: '[AI Tailoring] Based on the job description: Explain how to configure Prometheus scrapers for Kubernetes pods.',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: 1,
            category: 'Observability',
            difficulty: 'Intermediate',
        },
    ];

    const normalized = normalizeQuestions(rawQuestions);
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].question, 'How do you implement idempotency keys in payment processing APIs?');
    assert.equal(normalized[0].options[0], 'Store transaction tokens in a distributed lock with TTL');
    assert.equal(normalized[1].question, 'Explain how to configure Prometheus scrapers for Kubernetes pods.');
});

test('9. Fallback pools provide 100% applied scenarios with zero generic items across technical/behavioral/case', () => {
    const techFallback = generateDefaultInterview({ occupation: 'Senior Data Engineer', interviewType: 'technical', questionCount: 10 });
    assert.equal(techFallback.questions.length, 10);
    for (const q of techFallback.questions) {
        assert.ok(q.question.length > 20);
        assert.ok(!isGenericQuestion(q.question), `Fallback question should not be generic: ${q.question}`);
        assert.ok(!q.question.includes('Target Role & Discipline'));
        assert.ok(!q.question.includes('Target Job Description'));
        assert.equal(q.options.length, 4);
        assert.ok(Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < 4);
    }

    const behFallback = generateDefaultInterview({ occupation: 'Product Marketing Manager', interviewType: 'behavioral', questionCount: 8 });
    assert.equal(behFallback.questions.length, 8);
    for (const q of behFallback.questions) {
        assert.ok(!isGenericQuestion(q.question), `Behavioral question should not be generic: ${q.question}`);
        assert.ok(!q.question.includes('Target Role & Discipline'));
    }
});

test('10. Multi-Scenario Validation: Ad Operations / Programmatic (DV360 / CM360)', () => {
    const facts = `
Name: Jordan Lee
Occupation: Programmatic Campaign Manager
Skills: Campaign Manager 360, DV360, Floodlight Pixels, The Trade Desk, Excel Pivot Tables
Work: Ad Operations Specialist at Horizon Media (3 years)
    `.trim();
    const jd = 'Lead programmatic activation across DV360 and CM360, managing audience targeting, bid algorithms, and conversion tracking audits.';

    const promptObj = buildInterviewPrompt({
        occupation: 'Programmatic Campaign Manager',
        interviewType: 'technical',
        experienceLevel: 'Mid-Senior',
        difficulty: 'hard',
        questionCount: 10,
        resumeFacts: facts,
        jobDescription: jd,
    });

    assert.ok(promptObj.prompt.includes('Campaign Manager 360'));
    assert.ok(promptObj.prompt.includes('DV360'));
    assert.ok(!promptObj.prompt.includes('Target Role & Discipline:'));
    assert.ok(!promptObj.prompt.includes('Target Job Description (Optional'));
});
