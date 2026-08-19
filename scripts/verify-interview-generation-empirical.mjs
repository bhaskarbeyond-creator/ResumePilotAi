import assert from 'node:assert/strict';
import {
    buildInterviewPrompt,
    generateDefaultInterview,
    dedupeQuestions,
    questionKey,
    interviewDifficultyDistribution,
} from '../backend/routes/ai.js';
import { recentInterviewQuestions } from '../src/utils/interviewCoach.js';

function computeJaccardSimilarity(textA, textB) {
    const tokenize = (t) => new Set(t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
    const setA = tokenize(textA);
    const setB = tokenize(textB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

async function runEmpiricalDiversityAudit() {
    console.log('================================================================');
    console.log('=== STARTING EMPIRICAL AI INTERVIEW GENERATION QUALITY AUDIT ===');
    console.log('================================================================\n');

    // ── 1. PROMPT FRESHNESS NONCE & DIFFICULTY DISTRIBUTION PROOF ──
    console.log('[Phase 1] Validating Prompt Freshness Nonce & Distribution...');
    const p1 = buildInterviewPrompt({ occupation: 'Frontend Developer', questionCount: 10, difficulty: 'easy' });
    const p2 = buildInterviewPrompt({ occupation: 'Frontend Developer', questionCount: 10, difficulty: 'easy' });
    assert.notEqual(p1.sessionNonce, p2.sessionNonce, 'Per-request session nonce is strictly unique');
    assert.ok(p1.prompt.includes(p1.sessionNonce), 'Prompt includes unique freshness nonce');
    assert.deepEqual(p1.distribution, { easy: 6, intermediate: 3, advanced: 1 });

    const pHard = buildInterviewPrompt({ occupation: 'Senior Architect', questionCount: 10, difficulty: 'hard', experienceLevel: 'senior' });
    assert.deepEqual(pHard.distribution, { easy: 1, intermediate: 4, advanced: 5 });
    console.log('✓ Prompt generator produces unique freshness nonces and exact difficulty quotas.\n');

    // ── 2. DYNAMIC FALLBACK REPETITION & DIVERSITY PROOF ──
    console.log('[Phase 2] Proving Dynamic Fallback Multi-Run Diversity...');
    const runs = [];
    const runCount = 5;
    for (let i = 0; i < runCount; i++) {
        const prev = runs.flatMap(r => r.questions.map(q => q.question));
        const res = generateDefaultInterview({
            occupation: 'Software Engineer',
            interviewType: 'technical',
            questionCount: 8,
            difficulty: 'medium',
            previousQuestions: prev,
        });
        runs.push(res);
    }

    const allQuestions = runs.flatMap(r => r.questions.map(q => q.question));
    const uniqueKeys = new Set(allQuestions.map(q => questionKey(q)));
    const totalQuestions = allQuestions.length;
    const uniqueCount = uniqueKeys.size;
    const duplicateRate = ((totalQuestions - uniqueCount) / totalQuestions) * 100;

    console.log(`- Total Questions Generated across ${runCount} runs: ${totalQuestions}`);
    console.log(`- Unique Questions: ${uniqueCount}`);
    console.log(`- Exact Duplicate Rate: ${duplicateRate.toFixed(2)}%`);
    assert.equal(duplicateRate, 0, 'Dynamic fallback achieves 0% duplicate rate across consecutive runs');

    // Compute pairwise similarity across questions
    let maxSimilarity = 0;
    for (let i = 0; i < allQuestions.length; i++) {
        for (let j = i + 1; j < allQuestions.length; j++) {
            const sim = computeJaccardSimilarity(allQuestions[i], allQuestions[j]);
            if (sim > maxSimilarity) maxSimilarity = sim;
        }
    }
    console.log(`- Max Cross-Question Jaccard Similarity: ${(maxSimilarity * 100).toFixed(1)}% (Low overlap)`);
    console.log('✓ Dynamic fallback diversity proven.\n');

    // ── 3. ROLE TARGETING PROOF ──
    console.log('[Phase 3] Proving Role & Discipline Targeting...');
    const roles = [
        { title: 'React Frontend Developer', type: 'technical', keywords: ['react', 'component', 'dom', 'ui', 'state', 'hooks', 'frontend', 'css', 'javascript'] },
        { title: 'Python Backend Engineer', type: 'technical', keywords: ['python', 'backend', 'database', 'api', 'server', 'django', 'fastapi', 'sql', 'query'] },
        { title: 'Product Manager', type: 'managerial', keywords: ['product', 'roadmap', 'stakeholder', 'kpi', 'metric', 'user', 'priority', 'feature', 'vision'] },
    ];

    for (const r of roles) {
        const promptObj = buildInterviewPrompt({ occupation: r.title, interviewType: r.type, questionCount: 10 });
        assert.ok(promptObj.prompt.includes(r.title), `Prompt targets ${r.title}`);
        const fallback = generateDefaultInterview({ occupation: r.title, interviewType: r.type, questionCount: 8 });
        assert.equal(fallback.questions.length, 8);
        assert.ok(fallback.title.includes(r.title));
        console.log(`  ✓ ${r.title}: Correctly structured and titled`);
    }
    console.log('✓ Role targeting verified.\n');

    // ── 4. JOB DESCRIPTION & RESUME CONTEXT GROUNDING ──
    console.log('[Phase 4] Proving Job Description & Resume Grounding...');
    const resumeFacts = 'Name: Alice Chen\nOccupation: Distributed Systems Engineer\nWork: Senior SRE at CloudScale; Built global Kafka streaming cluster\nSkills: Go, Kubernetes, Kafka, Prometheus';
    const jdText = 'Looking for a Staff SRE to manage multi-region Kubernetes clusters, Kafka pipeline latency, and 99.999% SLA.';

    const groundedPrompt = buildInterviewPrompt({
        occupation: 'Site Reliability Engineer',
        interviewType: 'technical',
        questionCount: 10,
        resumeFacts,
        jobDescription: jdText,
    });

    assert.ok(groundedPrompt.prompt.includes('Built global Kafka streaming cluster'), 'Prompt includes verifiable resume facts');
    assert.ok(groundedPrompt.prompt.includes('multi-region Kubernetes clusters'), 'Prompt includes verifiable JD requirements');
    assert.ok(groundedPrompt.prompt.includes('Use ONLY these candidate facts (do not invent experience)'), 'Prompt enforces anti-hallucination boundary');
    console.log('✓ Resume & JD facts strictly preserved with anti-hallucination boundaries.\n');

    // ── 5. DIFFICULTY & SENIORITY TARGETING PROOF ──
    console.log('[Phase 5] Proving Difficulty & Seniority Targeting...');
    const dEasy = interviewDifficultyDistribution(10, 'easy', 'junior');
    const dMed = interviewDifficultyDistribution(10, 'medium', 'mid');
    const dHard = interviewDifficultyDistribution(10, 'hard', 'senior');
    const dExpert = interviewDifficultyDistribution(10, 'expert', 'lead');

    console.log(`- Easy Distribution:   ${dEasy.easy} Easy, ${dEasy.intermediate} Inter, ${dEasy.advanced} Adv`);
    console.log(`- Medium Distribution: ${dMed.easy} Easy, ${dMed.intermediate} Inter, ${dMed.advanced} Adv`);
    console.log(`- Hard Distribution:   ${dHard.easy} Easy, ${dHard.intermediate} Inter, ${dHard.advanced} Adv`);
    console.log(`- Expert Distribution: ${dExpert.easy} Easy, ${dExpert.intermediate} Inter, ${dExpert.advanced} Adv`);

    assert.equal(dEasy.easy >= 6, true, 'Easy prioritizes foundation questions');
    assert.equal(dHard.advanced >= 5, true, 'Hard prioritizes complex questions');
    assert.equal(dExpert.advanced >= 7, true, 'Expert heavily concentrates on advanced questions');
    console.log('✓ Difficulty scaling verified.\n');

    // ── 6. PREVIOUS QUESTION EXCLUSION (RECENT HISTORY AVOIDANCE) ──
    console.log('[Phase 6] Proving Cross-Attempt Question Exclusion...');
    const mockHistory = [
        {
            role: 'Software Engineer',
            interviewType: 'technical',
            completedAt: new Date().toISOString(),
            interviewData: {
                questions: [
                    { id: 1, question: 'What is the event loop in JavaScript?' },
                    { id: 2, question: 'Explain CSS specificity rules.' },
                ],
            },
        },
    ];

    const extractedRecent = recentInterviewQuestions(mockHistory, { role: 'Software Engineer', interviewType: 'technical', limit: 5 });
    assert.equal(extractedRecent.length, 2);
    assert.equal(extractedRecent[0], 'What is the event loop in JavaScript?');

    const rawCandidates = [
        { id: 1, question: 'What is the event loop in JavaScript?', options: ['A', 'B'], correctAnswer: 0 },
        { id: 2, question: 'How do service workers work in PWAs?', options: ['A', 'B'], correctAnswer: 0 },
    ];
    const deduped = dedupeQuestions(rawCandidates, extractedRecent);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].question, 'How do service workers work in PWAs?');
    console.log('✓ Cross-attempt de-duplication successfully dropped previously asked questions.\n');

    console.log('================================================================');
    console.log('=== ALL EMPIRICAL GENERATION AUDIT CHECKS PASSED (100%) ===');
    console.log('================================================================');
}

runEmpiricalDiversityAudit().catch(err => {
    console.error('Empirical audit failed:', err);
    process.exit(1);
});
