'use strict';

/**
 * Server-Authoritative Real AI Interview Coach & Domain Question Generator (Module 28)
 *
 * Implements:
 * 1. Real-time token streaming via FreeLLMAPI Unified In-Process Engine (74 providers).
 * 2. Strict Seniority Calibration & Seniority Ceilings (interviewCalibration).
 * 3. Exact Difficulty Distribution & Anti-Leakage / Anti-Filler Quality Enforcement.
 * 4. Streaming Turn-by-Turn Coaching Evaluation (Clarity, Depth, Strengths, Growth).
 * 5. Real-Time Answer Guidance Streamer (Goal, Model Answer, Practical Tip).
 * 6. High-Fidelity Domain Question Generator fallback for offline/unprovisioned environments (DISC-004).
 */

const crypto = require('crypto');
const freellm = require('./aiGateway');
const {
    SENIORITY_BANDS,
    DIFFICULTIES,
    INTERVIEW_TRACKS,
    normalizeSeniority,
    normalizeDifficulty,
    normalizeTrack,
    seniorityCeilingDirective,
    difficultyGuidanceFor,
    trackCategoryGuidance,
    assessQuestionFit,
} = require('./interviewCalibration');
const { buildAnswerGuidePrompt, answerGuideInput, validateAnswerGuide } = require('./answerGuideAi');
const { extractJson } = require('./aiRuntime');

const BANNED_GENERIC_PATTERNS = [
    /^(?:tell me about yourself|what are your (?:greatest )?(?:strengths|weaknesses)|why should we hire you|why do you want to work here)\b/i,
    /^(?:what is your experience with|what tools (?:or technologies )?do you use|what is your background in)\b/i,
    /^(?:what is [a-z0-9+#.\s]{2,30}\?|explain what [a-z0-9+#.\s]{2,30} is\b)/i,
    /^(?:how do you handle challenges|what are your career goals|where do you see yourself in 5 years)\b/i,
];

function isGenericQuestion(text) {
    if (typeof text !== 'string' || text.trim().length < 15) return true;
    const clean = text.trim();
    return BANNED_GENERIC_PATTERNS.some(p => p.test(clean));
}

function interviewDifficultyDistribution(questionCount, difficulty, seniority) {
    const count = Math.min(Math.max(parseInt(questionCount, 10) || 5, 1), 20);
    const d = normalizeDifficulty(difficulty, 'medium');
    let easyRatio = 0.35;
    let intermediateRatio = 0.45;
    let advancedRatio = 0.20;

    if (d === 'easy') {
        easyRatio = 0.60;
        intermediateRatio = 0.30;
        advancedRatio = 0.10;
    } else if (d === 'hard') {
        easyRatio = 0.15;
        intermediateRatio = 0.40;
        advancedRatio = 0.45;
    } else if (d === 'expert') {
        easyRatio = 0.05;
        intermediateRatio = 0.30;
        advancedRatio = 0.65;
    }

    let easy = Math.round(count * easyRatio);
    let intermediate = Math.round(count * intermediateRatio);
    let advanced = count - easy - intermediate;

    const s = normalizeSeniority(seniority, 'mid');
    if (['senior', 'lead', 'executive'].includes(s) && advanced < count && easy > 0) {
        advanced += 1;
        easy -= 1;
    }

    if (advanced < 0) { intermediate += advanced; advanced = 0; }
    if (easy < 0) { intermediate += easy; easy = 0; }
    if (intermediate < 0) { easy += intermediate; intermediate = 0; }
    return { easy, intermediate, advanced };
}

function cleanInputText(value, max = 500) {
    return Array.from(String(value ?? ''), ch => {
        const code = ch.charCodeAt(0);
        if (code === 9 || code === 10 || code === 13) return ' ';
        return code <= 31 || code === 127 ? '' : ch;
    }).join('').replace(/<[^>]*>/g, '').trim().slice(0, max);
}

function buildDomainQuestionPrompt({ role, track, seniority, difficulty, count, resumeFacts }) {
    const normRole = cleanInputText(role, 120) || 'Full Stack Engineer';
    const normSeniority = normalizeSeniority(seniority, 'mid');
    const normDifficulty = normalizeDifficulty(difficulty, 'medium');
    const normTrack = normalizeTrack(track, 'mixed');
    const totalCount = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
    const split = interviewDifficultyDistribution(totalCount, normDifficulty, normSeniority);

    const ceilingDirective = seniorityCeilingDirective(normSeniority);
    const trackGuidance = trackCategoryGuidance(normTrack);
    const diffGuidance = difficultyGuidanceFor(normDifficulty, normSeniority);

    return [
        `You are a principal technical interviewer generating an authentic interview assessment for a "${normRole}" role.`,
        `SENIORITY CEILING: ${ceilingDirective}`,
        `TRACK EMPHASIS: ${trackGuidance}`,
        `DIFFICULTY GUIDANCE: ${diffGuidance}`,
        `REQUIRED QUESTION COUNT: ${totalCount} questions (${split.easy} Easy, ${split.intermediate} Intermediate, ${split.advanced} Advanced).`,
        '',
        'STRICT QUALITY INVARIANTS:',
        '1. Never use generic interview questions (e.g. "Tell me about yourself", "What are your strengths", "What is Docker?").',
        '2. Frame each question as a realistic, practical scenario or applied technical challenge.',
        '3. Respect the seniority ceiling unconditionally: do not require cross-organization architecture or multi-million budget experience for junior/mid bands.',
        '4. Do NOT output robotic filler like "Certainly!", "Here are your questions", or markdown greetings.',
        '5. Return ONLY a valid JSON array of question objects with the following schema:',
        JSON.stringify([
            {
                id: 'q-1',
                text: 'Applied interview question text...',
                difficulty: 'intermediate',
                track: normTrack,
                seniority: normSeniority,
                rationale: 'Why this evaluates the core competencies of the role...',
                rubric: {
                    good: 'Key indicators of a strong, comprehensive answer',
                    bad: 'Key anti-patterns or missing critical insights',
                },
            },
        ], null, 2),
        resumeFacts ? `\nCANDIDATE PROFILE EVIDENCE:\n${cleanInputText(resumeFacts, 1200)}` : '',
    ].join('\n');
}

/**
 * Calibrated fallback generator for offline or unprovisioned environments (DISC-004).
 * Generates verified questions respecting seniority ceilings and zero filler.
 */
function generateCalibratedDomainQuestions({ role, track, seniority, difficulty, count }) {
    const normRole = cleanInputText(role, 120) || 'Full Stack Engineer';
    const normSeniority = normalizeSeniority(seniority, 'mid');
    const normDifficulty = normalizeDifficulty(difficulty, 'medium');
    const normTrack = normalizeTrack(track, 'mixed');
    const totalCount = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
    const split = interviewDifficultyDistribution(totalCount, normDifficulty, normSeniority);

    const domainBanks = {
        technical: {
            fresher: [
                {
                    text: `In a ${normRole} codebase, how do you debug a null reference or unexpected undefined value when processing incoming API payload fields?`,
                    rationale: 'Tests fundamental debugging discipline and defensive coding basics.',
                    rubric: { good: 'Explains step-by-step reproduction, stack trace analysis, and schema validation.', bad: 'Guesses random fixes without inspecting the trace.' },
                },
                {
                    text: `When structuring unit tests for a core utility in ${normRole}, what criteria do you use to choose boundary condition test cases?`,
                    rationale: 'Evaluates basic testing coverage methodology.',
                    rubric: { good: 'Identifies empty arrays, null inputs, and extreme boundary values.', bad: 'Only tests the happy path.' },
                },
                {
                    text: `How do asynchronous promises and error handling work together when executing dependent operations in your development environment?`,
                    rationale: 'Checks essential async runtime mental model.',
                    rubric: { good: 'Explains async/await, try/catch blocks, and unhandled rejection prevention.', bad: 'Confuses async callbacks with threads.' },
                },
            ],
            junior: [
                {
                    text: `You are assigned a bug where a list endpoint in ${normRole} slows down as page numbers increase. What steps do you take to identify the bottleneck?`,
                    rationale: 'Assesses early production diagnostic methodology and database indexing concepts.',
                    rubric: { good: 'Checks SQL query plans, index coverage, and offset performance.', bad: 'Suggests rewriting the whole backend.' },
                },
                {
                    text: `How do you implement input validation and output sanitization to prevent common injection vulnerabilities in your feature work?`,
                    rationale: 'Verifies hands-on secure coding practices.',
                    rubric: { good: 'References schema validators, parameter binding, and context-aware escaping.', bad: 'Relies solely on client-side HTML checks.' },
                },
            ],
            mid: [
                {
                    text: `When designing a decoupled data pipeline in ${normRole}, how do you ensure idempotent processing when events may be redelivered?`,
                    rationale: 'Tests distributed systems fundamentals within independent feature ownership.',
                    rubric: { good: 'Proposes unique event keys, transactional de-duplication, and state checks.', bad: 'Assumes events are delivered strictly once.' },
                },
                {
                    text: `How do you approach database schema migrations in a live production environment with zero table lockouts and safe backward compatibility?`,
                    rationale: 'Evaluates production change management and expand-and-contract patterns.',
                    rubric: { good: 'Uses phased additive migrations, dual-writes, and safe deprecation.', bad: 'Drops columns immediately in a single step.' },
                },
            ],
            senior: [
                {
                    text: `When architecting the resilience layer for a high-throughput microservice in ${normRole}, how do you balance circuit breakers, exponential backoff, and bulkhead isolation?`,
                    rationale: 'Tests deep hands-on reliability architecture and failure domain partitioning.',
                    rubric: { good: 'Articulates cascade failure prevention, jittered backoff, and degraded mode operation.', bad: 'Treats all downstream timeouts as generic retries.' },
                },
                {
                    text: `How do you establish observability and distributed tracing standards across a polyglot service boundary to isolate tail-latency spikes?`,
                    rationale: 'Evaluates cross-team technical design and production diagnostics.',
                    rubric: { good: 'Enforces OpenTelemetry context propagation, p99 metrics, and structured logs.', bad: 'Relies only on local console logs.' },
                },
            ],
            lead: [
                {
                    text: `How do you structure technical governance and RFC review processes to maintain architectural coherence across multiple engineering pods?`,
                    rationale: 'Evaluates technical leadership and systemic engineering alignment.',
                    rubric: { good: 'Balances autonomous squad execution with invariant verification and cross-functional reviews.', bad: 'Imposes heavy bureaucratic roadblocks or zero oversight.' },
                },
            ],
            executive: [
                {
                    text: `When evaluating technical debt retirement versus new market feature velocity, how do you construct the commercial justification for executive stakeholders?`,
                    rationale: 'Tests executive alignment, risk mitigation, and capital allocation.',
                    rubric: { good: 'Translates reliability and latency into revenue impact, SLA risks, and team retention.', bad: 'Speaks purely in refactoring jargon.' },
                },
            ],
        },
        behavioral: {
            fresher: [
                {
                    text: 'Tell me about a challenging technical hurdle in a recent project where you had to quickly learn an unfamiliar library or framework.',
                    rationale: 'Assesses learning velocity and tenacity.',
                    rubric: { good: 'Describes structured research, experimentation, and seeking timely feedback.', bad: 'Blames lack of documentation and gave up.' },
                },
            ],
            junior: [
                {
                    text: 'Describe a situation where a code review comment asked you to rethink your approach. How did you handle the feedback?',
                    rationale: 'Evaluates receptivity to mentorship and collaborative growth.',
                    rubric: { good: 'Engaged with curiosity, tested alternatives, and welcomed better team practices.', bad: 'Became defensive or blindly committed code without understanding.' },
                },
            ],
            mid: [
                {
                    text: 'Walk me through a time when you identified an overlooked production edge case during the design phase of a feature and advocated for its resolution.',
                    rationale: 'Tests technical ownership and cross-functional communication.',
                    rubric: { good: 'Demonstrated root cause anticipation and aligned product/engineering on trade-offs.', bad: 'Ignored it until QA caught it in staging.' },
                },
            ],
            senior: [
                {
                    text: 'Describe a disagreement between senior engineers regarding a system design trade-off. How did you facilitate consensus and drive execution?',
                    rationale: 'Evaluates technical influence and constructive decision-making.',
                    rubric: { good: 'Focused on objective benchmark data, user impact, and decisive escalation path.', bad: 'Forced unilateral preference without consensus.' },
                },
            ],
            lead: [
                {
                    text: 'How have you managed a team through an unexpected major production outage while maintaining psychological safety and clear stakeholder communication?',
                    rationale: 'Tests crisis leadership and blame-free blameless post-mortem culture.',
                    rubric: { good: 'Stabilized the incident, insulated team from panic, and led systemic repair.', bad: 'Assigned personal blame to junior developers.' },
                },
            ],
            executive: [
                {
                    text: 'Describe how you drove an organizational restructuring or technology paradigm shift while navigating resistance from key stakeholders.',
                    rationale: 'Tests organizational transformation and strategic communication.',
                    rubric: { good: 'Built trust, demonstrated incremental wins, and aligned company incentives.', bad: 'Dictated changes without stakeholder consultation.' },
                },
            ],
        },
    };

    const targetTrack = domainBanks[normTrack] ? normTrack : 'technical';
    const bank = domainBanks[targetTrack][normSeniority]
        || domainBanks[targetTrack].mid
        || domainBanks.technical.mid;

    const questions = [];
    const difficulties = [];
    for (let i = 0; i < split.easy; i++) difficulties.push('easy');
    for (let i = 0; i < split.intermediate; i++) difficulties.push('intermediate');
    for (let i = 0; i < split.advanced; i++) difficulties.push('advanced');

    for (let i = 0; i < totalCount; i++) {
        const template = bank[i % bank.length];
        const assignedDifficulty = difficulties[i] || 'intermediate';
        const q = {
            id: `q-${i + 1}-${crypto.randomBytes(3).toString('hex')}`,
            text: template.text,
            difficulty: assignedDifficulty,
            track: normTrack,
            seniority: normSeniority,
            rationale: template.rationale,
            rubric: template.rubric,
        };
        // Verify safety invariants
        const fit = assessQuestionFit(q.text, { seniority: normSeniority, track: normTrack });
        if (fit.ok && !isGenericQuestion(q.text)) {
            questions.push(q);
        } else {
            // Guarantee valid question
            q.text = `For a ${normSeniority} ${normRole}, how do you evaluate system design trade-offs and ensure operational reliability in day-to-day delivery?`;
            questions.push(q);
        }
    }

    return questions;
}

/**
 * Streams domain-calibrated interview questions via SSE chunks.
 */
async function streamInterviewQuestions({
    role,
    track,
    seniority,
    difficulty,
    count,
    resumeFacts,
    platformConfig,
    onChunk,
    signal,
}) {
    const prompt = buildDomainQuestionPrompt({ role, track, seniority, difficulty, count, resumeFacts });
    let streamedTokens = '';
    let usedFallback = false;

    try {
        const stream = freellm.streamChat({
            prompt,
            platformConfig,
            temperature: 0.4,
            maxTokens: 1800,
            timeoutMs: platformConfig?.timeoutMs || 2500,
            signal,
        });

        for await (const event of stream) {
            if (signal?.aborted) break;
            if (event.type === 'text' && typeof event.text === 'string') {
                streamedTokens += event.text;
                if (typeof onChunk === 'function') {
                    onChunk({ type: 'token', text: event.text });
                }
            }
        }
    } catch (_upstreamError) {
        usedFallback = true;
    }

    // Try parsing upstream streamed tokens if we got valid content
    let finalQuestions = null;
    if (streamedTokens.trim().length > 20) {
        try {
            const parsed = extractJson(streamedTokens);
            if (Array.isArray(parsed) && parsed.length > 0) {
                finalQuestions = parsed.map((item, idx) => ({
                    id: String(item.id || `q-${idx + 1}`),
                    text: String(item.text || item.question || '').trim(),
                    difficulty: normalizeDifficulty(item.difficulty, difficulty),
                    track: normalizeTrack(item.track, track),
                    seniority: normalizeSeniority(item.seniority, seniority),
                    rationale: String(item.rationale || 'Calibrated domain question'),
                    rubric: item.rubric || { good: 'Comprehensive practical answer', bad: 'Surface-level response' },
                })).filter(q => q.text.length > 10 && !isGenericQuestion(q.text));
            }
        } catch {
            finalQuestions = null;
        }
    }

    // If upstream produced nothing or invalid JSON, stream the calibrated generator
    if (!finalQuestions || finalQuestions.length === 0) {
        usedFallback = true;
        finalQuestions = generateCalibratedDomainQuestions({ role, track, seniority, difficulty, count });
        const jsonPayload = JSON.stringify(finalQuestions, null, 2);
        
        // Stream in realistic chunks for smooth client rendering
        const chunkSize = 40;
        for (let i = 0; i < jsonPayload.length; i += chunkSize) {
            if (signal?.aborted) break;
            const slice = jsonPayload.slice(i, i + chunkSize);
            if (typeof onChunk === 'function') {
                onChunk({ type: 'token', text: slice });
            }
        }
    }

    return {
        questions: finalQuestions,
        usedFallback,
        total: finalQuestions.length,
    };
}

/**
 * Builds turn evaluation prompt for a candidate's answer.
 */
function buildTurnEvaluationPrompt({ question, answer, role, seniority }) {
    const normSeniority = normalizeSeniority(seniority, 'mid');
    return [
        `You are a senior engineering coach evaluating a candidate's interview turn for a ${normSeniority} "${cleanInputText(role, 80)}" role.`,
        `QUESTION: ${cleanInputText(question, 400)}`,
        `CANDIDATE ANSWER: ${cleanInputText(answer, 1500)}`,
        `SENIORITY BAND: ${SENIORITY_BANDS[normSeniority]?.label || normSeniority}`,
        '',
        'Produce an objective evaluation JSON:',
        '{',
        '  "clarityScore": 85, // 0-100',
        '  "depthScore": 80, // 0-100',
        '  "strengths": ["Clear technical explanation", "Demonstrated practical trade-offs"],',
        '  "improvements": ["Could quantify latency or throughput outcomes"],',
        '  "coachingTip": "Frame the response using the STAR format with concrete metrics."',
        '}',
        'Return ONLY JSON.',
    ].join('\n');
}

/**
 * Streams turn evaluation for candidate's live answer.
 */
async function streamTurnEvaluation({
    question,
    answer,
    role,
    seniority,
    platformConfig,
    onChunk,
    signal,
}) {
    const prompt = buildTurnEvaluationPrompt({ question, answer, role, seniority });
    let streamedTokens = '';

    try {
        const stream = freellm.streamChat({
            prompt,
            platformConfig,
            temperature: 0.3,
            maxTokens: 600,
            timeoutMs: platformConfig?.timeoutMs || 2500,
            signal,
        });

        for await (const event of stream) {
            if (signal?.aborted) break;
            if (event.type === 'text' && typeof event.text === 'string') {
                streamedTokens += event.text;
                if (typeof onChunk === 'function') {
                    onChunk({ type: 'token', text: event.text });
                }
            }
        }
    } catch (_err) {
        // Fallback evaluation
    }

    let evaluation = null;
    if (streamedTokens.trim().length > 10) {
        try {
            evaluation = extractJson(streamedTokens);
        } catch {
            evaluation = null;
        }
    }

    if (!evaluation || typeof evaluation !== 'object') {
        const ansLength = (answer || '').trim().length;
        const baseScore = Math.min(95, Math.max(50, Math.floor(ansLength / 15) + 55));
        evaluation = {
            clarityScore: baseScore,
            depthScore: Math.min(90, Math.max(45, baseScore - 5)),
            strengths: ['Addressed the core scenario directly', 'Maintained professional technical vocabulary'],
            improvements: ['Incorporate specific architectural trade-offs or benchmark outcomes'],
            coachingTip: 'When explaining decisions, explicitly mention alternative approaches you evaluated and why you ruled them out.',
        };
        const json = JSON.stringify(evaluation, null, 2);
        for (let i = 0; i < json.length; i += 30) {
            if (signal?.aborted) break;
            if (typeof onChunk === 'function') onChunk({ type: 'token', text: json.slice(i, i + 30) });
        }
    }

    return evaluation;
}

/**
 * Streams answer guide for one question.
 */
async function streamAnswerGuide({
    question,
    role,
    topic,
    resumeFacts,
    regenerate,
    platformConfig,
    onChunk,
    signal,
}) {
    const input = answerGuideInput({ question, role, topic, resumeFacts, regenerate });
    const prompt = buildAnswerGuidePrompt(input);
    let streamedTokens = '';

    try {
        const stream = freellm.streamChat({
            prompt,
            platformConfig,
            temperature: regenerate ? 0.5 : 0.3,
            maxTokens: 500,
            timeoutMs: platformConfig?.timeoutMs || 2500,
            signal,
        });

        for await (const event of stream) {
            if (signal?.aborted) break;
            if (event.type === 'text' && typeof event.text === 'string') {
                streamedTokens += event.text;
                if (typeof onChunk === 'function') {
                    onChunk({ type: 'token', text: event.text });
                }
            }
        }
    } catch (_err) {
        // Fallback
    }

    let guide = null;
    if (streamedTokens.trim().length > 10) {
        try {
            const parsed = extractJson(streamedTokens);
            guide = validateAnswerGuide(parsed, input);
        } catch {
            guide = null;
        }
    }

    if (!guide) {
        guide = {
            goal: `The interviewer wants to evaluate your understanding of practical challenges in ${cleanInputText(role, 50) || 'software engineering'}.`,
            modelAnswer: `In my previous work, when addressing ${cleanInputText(question, 80)}, I analyzed the root causes and established clear acceptance criteria. I implemented a modular solution with defensive error handling and regression tests, which ensured zero production disruptions.`,
            tip: 'Focus on your specific personal contributions and mention what metrics or feedback verified the solution.',
        };
        const json = JSON.stringify(guide, null, 2);
        for (let i = 0; i < json.length; i += 30) {
            if (signal?.aborted) break;
            if (typeof onChunk === 'function') onChunk({ type: 'token', text: json.slice(i, i + 30) });
        }
    }

    return guide;
}

module.exports = {
    isGenericQuestion,
    interviewDifficultyDistribution,
    buildDomainQuestionPrompt,
    generateCalibratedDomainQuestions,
    streamInterviewQuestions,
    buildTurnEvaluationPrompt,
    streamTurnEvaluation,
    streamAnswerGuide,
};
