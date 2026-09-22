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

test('8. getContentOperationFallback: synthesizes evidence-grounded 3-pillar summary rather than raw dump', async () => {
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
    assert.equal(fallback._source, 'evidence-grounded-fallback');
    assert.ok(fallback.summary.length >= 100);
    assert.match(fallback.summary, /Lead Cloud Architect with 6 years of experience at Nordic Cloud/);
    assert.match(fallback.summary, /Kubernetes, Go, Terraform/);
    assert.ok(!fallback.summary.includes(' | '));
    assert.ok(!fallback.summary.includes('Target Role:'));
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

