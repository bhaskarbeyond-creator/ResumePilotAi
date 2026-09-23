import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryEvidenceLength } from '../backend/services/candidateContext.js';
import { getCandidateContext } from '../src/utils/candidateContext.js';
import { canRunAssistOperation, buildAssistPayload, normalizeAssistResult } from '../src/components/BuildResume/ai/aiContract.js';

test('1. summaryEvidenceLength: previous step details (role + skill) provide sufficient evidence without arbitrary 3-skill barrier', () => {
    // 1 role + 1 skill (previously failed because skillCount < 3)
    const payload = {
        context: {
            facts: {
                roles: [{ title: 'Frontend Developer', employer: 'Tech Corp', description: 'Built React apps' }],
                skills: ['React'],
            },
            target: { role: 'Frontend Developer' },
        },
    };
    const len = summaryEvidenceLength(payload);
    assert.ok(len >= 10, `Expected evidence length >= 10, got ${len}`);
});

test('2. summaryEvidenceLength: targetRole + education provides sufficient evidence', () => {
    const payload = {
        context: {
            facts: {
                education: [{ degree: 'BS Computer Science', school: 'MIT' }],
            },
            target: { role: 'Software Engineer' },
        },
    };
    const len = summaryEvidenceLength(payload);
    assert.ok(len >= 10, `Expected evidence length >= 10, got ${len}`);
});

test('3. summaryEvidenceLength: completely empty resume correctly returns 0', () => {
    const payload = {
        context: {
            facts: {
                roles: [],
                education: [],
                skills: [],
                certifications: [],
                projects: [],
            },
            target: { role: '' },
        },
    };
    const len = summaryEvidenceLength(payload);
    assert.equal(len, 0, 'Completely empty profile should have 0 evidence length');
});

test('4. getCandidateContext: polymorphically extracts workExperiences and education from previous steps', () => {
    const resumeData = {
        occupation: 'Full Stack Engineer',
        workExperiences: [
            { jobTitle: 'Full Stack Engineer', company: 'Nexus Inc', description: 'Architected microservices' }
        ],
        education: [
            { degree: 'B.Tech IT', school: 'Anna University' }
        ],
        skills: ['Node.js', 'PostgreSQL'],
    };

    const ctx = getCandidateContext(resumeData);
    assert.equal(ctx.facts.headline, 'Full Stack Engineer');
    assert.equal(ctx.facts.roles.length, 1);
    assert.equal(ctx.facts.roles[0].title, 'Full Stack Engineer');
    assert.equal(ctx.facts.roles[0].employer, 'Nexus Inc');
    assert.equal(ctx.facts.education.length, 1);
    assert.equal(ctx.facts.education[0].degree, 'B.Tech IT');
    assert.equal(ctx.facts.education[0].school, 'Anna University');
    assert.equal(ctx.facts.skills.length, 2);
});

test('5. canRunAssistOperation: generate-summary is ready when previous steps contain details', () => {
    const resumeData = {
        occupation: 'Product Manager',
        employments: [{ jobTitle: 'Associate PM', employer: 'SaaS Co' }],
        skills: ['Agile'],
    };
    const readiness = canRunAssistOperation('generate-summary', { resumeData });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.hasEvidence, true);
});

test('6. buildAssistPayload: packages full previous step facts into workHistory, education, and sourceFacts', () => {
    const resumeData = {
        firstname: 'Jordan',
        lastname: 'Lee',
        targetRole: 'Senior Data Scientist',
        employments: [
            { jobTitle: 'Data Scientist', employer: 'DataCorp', description: 'Trained predictive ML models' }
        ],
        educations: [
            { degree: 'MS Data Science', school: 'Carnegie Mellon' }
        ],
        skills: ['Python', 'PyTorch', 'SQL'],
        certifications: [{ title: 'AWS ML Specialty' }],
    };

    const assist = buildAssistPayload('generate-summary', { resumeData, tone: 'executive' });
    const { payload } = assist;

    assert.equal(payload.targetRole, 'Senior Data Scientist');
    assert.match(payload.workHistory, /Data Scientist at DataCorp/);
    assert.match(payload.education, /MS Data Science from Carnegie Mellon/);
    assert.ok(payload.skills.includes('Python'));
    assert.ok(payload.skills.includes('PyTorch'));
    assert.match(payload.sourceFacts, /Target Role: Senior Data Scientist/);
    assert.match(payload.sourceFacts, /Work History: Data Scientist at DataCorp/);
    assert.match(payload.sourceFacts, /Education: MS Data Science from Carnegie Mellon/);
});

test('7. normalizeAssistResult: correctly parses all executive summary response keys into draft with confirmation gate', () => {
    // Standard summary
    const res1 = normalizeAssistResult('generate-summary', {
        summary: 'Accomplished Senior Engineer with expertise in distributed systems.'
    });
    assert.equal(res1.kind, 'draft');
    assert.equal(res1.requiresConfirmation, true);
    assert.equal(res1.draft.text, 'Accomplished Senior Engineer with expertise in distributed systems.');

    // executiveSummary key
    const res2 = normalizeAssistResult('generate-summary', {
        executiveSummary: 'Executive leader delivering multi-million dollar transformations.'
    });
    assert.equal(res2.kind, 'draft');
    assert.equal(res2.requiresConfirmation, true);
    assert.equal(res2.draft.text, 'Executive leader delivering multi-million dollar transformations.');

    // professionalSummary key
    const res3 = normalizeAssistResult('generate-summary', {
        professionalSummary: 'Full-stack software specialist building scalable cloud architectures.'
    });
    assert.equal(res3.kind, 'draft');
    assert.equal(res3.requiresConfirmation, true);

    // bio key
    const res4 = normalizeAssistResult('generate-summary', {
        bio: 'Clinical nurse specialist focused on ICU acute patient care.'
    });
    assert.equal(res4.kind, 'draft');
    assert.equal(res4.requiresConfirmation, true);

    // Nested data.summary (from API envelope wrappers)
    const res5 = normalizeAssistResult('generate-summary', {
        data: { summary: 'Product designer crafting high-converting mobile interfaces.' }
    });
    assert.equal(res5.kind, 'draft');
    assert.equal(res5.requiresConfirmation, true);
    assert.equal(res5.draft.text, 'Product designer crafting high-converting mobile interfaces.');
});

test('8. getContentOperationFallback: asks instead of synthesizing a template summary or dumping raw facts', async () => {
    const { getContentOperationFallback } = await import('../backend/services/aiRuntime.js');
    const testPayload = {
        context: {
            facts: {
                name: 'Elena Rostova',
                roles: [{ title: 'Cloud Architect', employer: 'Nordic Cloud', description: 'Engineered serverless Kubernetes systems' }],
                education: [{ degree: 'MSc Computer Science', school: 'KTH Royal Institute' }],
                skills: ['Kubernetes', 'Go', 'Terraform', 'AWS', 'Python'],
                experienceYears: 6,
            },
            target: { role: 'Lead Cloud Architect' },
        },
        targetRole: 'Lead Cloud Architect',
        skills: ['Kubernetes', 'Go', 'Terraform', 'AWS', 'Python'],
        sourceFacts: 'Target Role: Lead Cloud Architect | Tenure: 6 years | Work History: Cloud Architect at Nordic Cloud',
    };

    const fallback = getContentOperationFallback('generate-summary', testPayload);
    // Phase 3: no template summary ("{Role} with N years…") is assembled on outage;
    // without candidate-written text the candidate is asked, and nothing raw is dumped.
    assert.equal(fallback.requiresAnswer, true);
    assert.equal(fallback.summary, undefined);
    assert.ok(!JSON.stringify(fallback).includes(' | '));
    assert.ok(!JSON.stringify(fallback).includes('Target Role:'));
});

test('9. parseAiResponse: strips gerund and phrase forms of banned clichés', async () => {
    const { parseAiResponse } = await import('../backend/services/aiRuntime.js');
    const rawAiOutput = JSON.stringify({
        summary: 'Lead Cloud Architect with 6 years directing cloud strategy, leveraging expertise in Kubernetes and Go. A results-driven professional with a proven track record playing a pivotal role in digital transformation.',
        sourceExcerpts: ['6 years', 'Kubernetes'],
    });

    const parsed = parseAiResponse('generate-summary', rawAiOutput, {
        requireGrounding: false,
        payload: { targetRole: 'Lead Cloud Architect' },
    });

    assert.ok(parsed.summary);
    assert.ok(!parsed.summary.includes('leveraging'), 'Must sanitize "leveraging" to "applying"');
    assert.ok(!parsed.summary.includes('results-driven professional with a proven track record'), 'Must sanitize results-driven cliché');
    assert.ok(!parsed.summary.includes('pivotal role'), 'Must sanitize "pivotal role" to "key role"');
    assert.match(parsed.summary, /applying expertise/i);
    assert.match(parsed.summary, /key role/i);
});

test('10. parseAiResponse: bounds overly long outputs to <= 465 chars and guarantees 10/10 ATS score', async () => {
    const { parseAiResponse } = await import('../backend/services/aiRuntime.js');
    const { calculateAtsScore } = await import('../src/utils/atsScore.js');

    // Simulated 576-character uncalibrated LLM output
    const rawAiOutput = JSON.stringify({
        summary: 'Senior Software Engineer with 5 years of experience directing software development across scalable technology landscapes, applying expertise in JavaScript, React, Node.js, and Python to architect and deliver high-performance APIs and microservices. With a strong foundation in computer science from IIT Delhi, excels in deploying Dockerized applications on AWS and driving efficient software engineering standards. Her technical prowess and software development expertise yield high-quality solutions that drive business impact and scalability.',
        sourceExcerpts: ['5 years', 'React', 'Node.js'],
    });

    const parsed = parseAiResponse('generate-summary', rawAiOutput, {
        requireGrounding: false,
        payload: { targetRole: 'Senior Software Engineer' },
    });

    assert.ok(parsed.summary);
    assert.ok(parsed.summary.length <= 465, `Summary length must be <= 465, got ${parsed.summary.length}`);
    assert.ok(parsed.summary.length >= 100, `Summary length must be >= 100, got ${parsed.summary.length}`);

    // Verify 10/10 score on ATS engine
    const ats = calculateAtsScore({
        summary: parsed.summary,
        skills: ['JavaScript', 'React', 'Node.js', 'Python', 'Docker', 'AWS'],
    });
    const summarySection = ats.sections.find(s => s.id === 'summary');
    assert.equal(summarySection.score, 10, `Expected 10/10 ATS summary score, got ${summarySection.score}/10`);
    assert.equal(summarySection.findings.every(f => f.ok), true, 'All ATS findings must be positive');
});

test('11. parseAiResponse: strips conversational "As a seasoned..." opener and preserves 10/10 ATS score', async () => {
    const { parseAiResponse } = await import('../backend/services/aiRuntime.js');
    const { calculateAtsScore } = await import('../src/utils/atsScore.js');

    const rawAiOutput = JSON.stringify({
        summary: 'As a seasoned Senior Cloud Architect with 8 years of experience architecting multi-region Kubernetes platforms across enterprise systems, specializing in Go, AWS, and Terraform. Deploys resilient infrastructure pipelines ensuring continuous delivery and high availability.',
        sourceExcerpts: ['8 years', 'Kubernetes', 'AWS'],
    });

    const parsed = parseAiResponse('generate-summary', rawAiOutput, {
        requireGrounding: false,
        payload: { targetRole: 'Senior Cloud Architect' },
    });

    assert.ok(!parsed.summary.startsWith('As a seasoned'));
    assert.ok(parsed.summary.startsWith('Senior Cloud Architect'));

    const ats = calculateAtsScore({
        summary: parsed.summary,
        skills: ['Kubernetes', 'AWS', 'Terraform', 'Go'],
    });
    const summarySection = ats.sections.find(s => s.id === 'summary');
    assert.equal(summarySection.score, 10);
});

test('12. summary fallback never assembles a template summary from structured facts (Phase 3: no canned AI text)', async () => {
    const { getContentOperationFallback } = await import('../backend/services/aiRuntime.js');
    const domainProfiles = [
        { role: 'Frontend Engineer', skills: ['React', 'TypeScript'], years: 4, company: 'Stripe' },
        { role: 'ICU Clinical Nurse Specialist', skills: ['Critical Care', 'EHR'], years: 6, company: 'Mayo Clinic' },
    ];
    for (const domain of domainProfiles) {
        const fallback = getContentOperationFallback('generate-summary', {
            context: { facts: { roles: [{ title: domain.role, employer: domain.company }], skills: domain.skills, experienceYears: domain.years }, target: { role: domain.role } },
            targetRole: domain.role,
            skills: domain.skills,
        });
        // No candidate-written summary exists, so the safe state is to ask the candidate.
        assert.equal(fallback.requiresAnswer, true, `must ask for ${domain.role}`);
        assert.ok(Array.isArray(fallback.questions) && fallback.questions.length > 0);
        assert.equal(fallback.summary, undefined, 'no synthesized summary text');
    }
    // Candidate-written text is preserved verbatim (no additions).
    const own = 'Frontend engineer who rebuilt the Stripe dashboard component library in React and TypeScript.';
    const kept = getContentOperationFallback('generate-summary', { existingText: own, targetRole: 'Frontend Engineer' });
    assert.equal(kept._source, 'source-preserving-fallback');
    assert.ok(kept.summary.startsWith(own.slice(0, 60)));
});

test('13. getContentOperationFallback: doctor profile without written summary asks instead of generating or dumping sourceFacts', async () => {
    const { getContentOperationFallback } = await import('../backend/services/aiRuntime.js');
    const resumeData = {
        targetRole: 'Doctor of Medicine',
        occupation: 'Doctor of Medicine',
        workExperiences: [{ jobTitle: 'Doctor of Medicine', company: 'Apollo Hospitals', description: 'Diagnosed and treated 25+ daily acute and complex patient cases' }],
        education: [{ degree: 'AIIMS MBBS', school: 'AIIMS New Delhi' }],
        skills: ['Clinical Protocols Development', 'Emergency Assessment and Triage'],
    };
    const assist = buildAssistPayload('generate-summary', { resumeData });
    const fallback = getContentOperationFallback('generate-summary', assist.payload);
    assert.equal(fallback.requiresAnswer, true);
    const serialized = JSON.stringify(fallback);
    assert.ok(!serialized.includes(' | '), 'Must not dump pipe-delimited sourceFacts');
    assert.ok(!serialized.includes('Work History:'), 'Must not dump raw labels');
    assert.equal(fallback.summary, undefined);
});




