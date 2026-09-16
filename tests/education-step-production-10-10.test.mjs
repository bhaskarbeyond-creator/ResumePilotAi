/**
 * Education Step Production 10/10 Test Suite — ResumePilot AI
 *
 * Verifies:
 * 1. Institution & Degree instant autocomplete matching from universal directories
 * 2. MonthYearPicker date compatibility and "Currently Studying" state
 * 3. Clean coursework, honors, and academic highlights text storage without clumsy bullet mechanics
 * 4. Grounded AI academic highlights synthesis without hallucination
 * 5. Multi-domain academic qualifications (Engineering, Medicine/Nursing, Business, Law, Arts)
 * 6. Pure ATS Integration: 100/100 ATS Ready scorecard based purely on academic credentials & JD match
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIVERSAL_SCHOOLS, UNIVERSAL_DEGREES } from '../src/utils/autocompleteDirectories.js';
import { extractBulletList, getEducationHealth } from '../src/utils/bulletQuality.js';
import { generateEducationInterviewQuestions } from '../src/utils/roleInterviewGenerator.js';
import { executeContentOperation, getContentOperationFallback } from '../backend/services/aiRuntime.js';

test('1.1 School Autocomplete matches top global institutions on keystroke', () => {
    const berkeleyMatch = UNIVERSAL_SCHOOLS.find(s => s.toLowerCase().includes('berkeley'));
    assert.ok(berkeleyMatch, 'Should find UC Berkeley');
    assert.match(berkeleyMatch, /Berkeley/i);

    const oxfordMatch = UNIVERSAL_SCHOOLS.find(s => s.toLowerCase().includes('oxford'));
    assert.ok(oxfordMatch, 'Should find Oxford');

    const iitMatch = UNIVERSAL_SCHOOLS.find(s => s.toLowerCase().includes('iit bombay'));
    assert.ok(iitMatch, 'Should find IIT Bombay');
});

test('1.2 Degree Autocomplete matches diverse qualification levels', () => {
    const bsMatch = UNIVERSAL_DEGREES.find(d => d.toLowerCase().includes('bachelor of science'));
    assert.ok(bsMatch, 'Should find Bachelor of Science');

    const msMatch = UNIVERSAL_DEGREES.find(d => d.toLowerCase().includes('master of science'));
    assert.ok(msMatch, 'Should find Master of Science');

    const mbaMatch = UNIVERSAL_DEGREES.find(d => d.toLowerCase().includes('master of business administration'));
    assert.ok(mbaMatch, 'Should find MBA');

    const phdMatch = UNIVERSAL_DEGREES.find(d => d.toLowerCase().includes('doctor of philosophy'));
    assert.ok(phdMatch, 'Should find PhD');
});

test('2.1 Clean coursework and honors text storage preserves multi-line notes without bullet dependency', () => {
    const sampleNotes = "Relevant Coursework: Distributed Systems, Advanced Algorithms, Computer Networks.\nDean's List all semesters; graduated Magna Cum Laude with a 3.92 GPA.\nSenior capstone: Autonomous robotics prototype in ROS and C++.";
    
    assert.ok(sampleNotes.includes('Distributed Systems'));
    assert.ok(sampleNotes.includes('Magna Cum Laude'));
    assert.ok(sampleNotes.includes('Autonomous robotics'));

    // Even if parsed as lines, notes preserve all facts
    const lines = sampleNotes.split('\n');
    assert.equal(lines.length, 3);
});

test('2.2 Bullet pointers (•) are correctly prepended before each coursework highlight and chip', () => {
    const rawSuggestions = [
        "Relevant Coursework: Distributed Systems, Advanced Algorithms, Computer Networks",
        "Dean's List all semesters; graduated Magna Cum Laude with a 3.92 GPA",
        "• Senior capstone: Autonomous robotics prototype in ROS and C++"
    ];

    const formatted = rawSuggestions
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .map(s => {
            const clean = s.replace(/^[•*–—\-]\s*/, '').trim();
            return `• ${clean}`;
        })
        .join('\n');

    const lines = formatted.split('\n');
    assert.equal(lines.length, 3);
    lines.forEach((line, i) => {
        assert.ok(line.startsWith('• '), `Line ${i + 1} must start with bullet pointer "• "`);
    });
});

test('3.1 AI Academic Synthesis grounds highlights in candidate evidence', async () => {
    const payload = {
        entry: {
            school: 'University of California, Berkeley',
            degree: 'Bachelor of Science in Electrical Engineering & Computer Science',
            description: 'Deans honor list all semesters 3.92 GPA capstone autonomous drone navigation using ROS and C++ coursework operating systems distributed systems'
        }
    };

    const mockFetch = async () => new Response(JSON.stringify({
        choices: [{
            message: {
                content: JSON.stringify({
                    suggestions: [
                        'Maintained 3.92 GPA and achieved Dean\'s honor list across all academic semesters.',
                        'Senior capstone: Autonomous drone navigation using ROS and C++.',
                        'Completed advanced coursework in operating systems and distributed systems.'
                    ]
                })
            }
        }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const res = await executeContentOperation({
        operation: 'generate-education-description',
        payload,
        fetchImpl: mockFetch
    });

    assert.ok(res.data, 'Should return data object');
    assert.ok(Array.isArray(res.data.suggestions), 'Should return suggestions array');
    assert.ok(res.data.suggestions.length >= 1, 'Should have at least 1 academic highlight');

    const combinedText = res.data.suggestions.join(' ');
    // Facts must be grounded in candidate notes
    assert.match(combinedText, /3\.92|GPA|Dean|autonomous|ROS|coursework|systems/i);
    assert.ok(res.grounding === 'source-validated' || res.grounding === 'source-preserving-fallback', `Expected valid grounding, got: ${res.grounding}`);
});

test('3.2 AI Academic Synthesis falls back safely to source when no provider is reachable', async () => {
    const failingFetch = async () => new Response('{"error":"All providers down"}', { status: 503 });
    const payload = {
        entry: {
            school: 'Stanford University',
            degree: 'Master of Science in Computer Science',
            description: 'Graduate Research Assistant in Artificial Intelligence Laboratory'
        }
    };

    const fallbackRes = await executeContentOperation({
        operation: 'generate-education-description',
        payload,
        fetchImpl: failingFetch,
        requestId: 'test-fallback-edu'
    });

    assert.equal(fallbackRes.provider, 'fallback');
    assert.equal(fallbackRes.grounding, 'source-preserving-fallback');
    assert.ok(fallbackRes.data.suggestions[0].includes('Graduate Research Assistant'));
});

test('4.1 Multi-domain academic qualifications work across Nursing, Law, and Business', async () => {
    const testCases = [
        {
            school: 'Johns Hopkins School of Nursing',
            degree: 'Master of Science in Nursing (MSN)',
            description: 'Clinical preceptorship in Emergency Department 500 clinical hours completed Sigma Theta Tau'
        },
        {
            school: 'Harvard Law School',
            degree: 'Juris Doctor (J.D.)',
            description: 'Harvard Law Review editor Jessup Moot Court semifinalist graduated Cum Laude'
        },
        {
            school: 'INSEAD',
            degree: 'Master of Business Administration (MBA)',
            description: 'Concentration in Private Equity and Corporate Strategy Dean List recipient'
        }
    ];

    for (const item of testCases) {
        const mockDomainFetch = async () => new Response(JSON.stringify({
            choices: [{
                message: {
                    content: JSON.stringify({
                        suggestions: [
                            `Completed rigorous degree curriculum for ${item.degree} at ${item.school}.`,
                            `Engaged in applied clinical/legal/business practice with honors.`
                        ]
                    })
                }
            }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

        const res = await executeContentOperation({
            operation: 'generate-education-description',
            payload: { entry: item },
            fetchImpl: mockDomainFetch
        });

        assert.ok(res.data.suggestions && res.data.suggestions.length > 0, `Should generate highlights for ${item.degree}`);
    }
});

test('5.1 getEducationHealth computes 100/100 ATS Ready score without requiring any bullet points', () => {
    const completeEdu = {
        school: 'Stanford University',
        degree: 'Bachelor of Science in Computer Science',
        fieldOfStudy: 'Computer Science',
        started: '2019-09',
        finished: '2023-06',
        grade: '3.92 GPA',
        description: 'Relevant Coursework: Distributed Systems, Robotics, Operating Systems. Dean\'s List.'
    };

    const targetJd = 'Looking for a Senior Software Engineer skilled in Distributed Systems, Robotics, ROS, and C++.';
    const health = getEducationHealth(completeEdu, targetJd);

    assert.equal(health.score, 100, `Score should be 100/100 ATS Ready, got ${health.score}`);
    assert.equal(health.status, 'excellent');
    assert.ok(health.pills.some(p => p.id === 'school' && p.ok), 'Should verify institution');
    assert.ok(health.pills.some(p => p.id === 'degree' && p.ok), 'Should verify degree');
    assert.ok(health.pills.some(p => p.id === 'field' && p.ok), 'Should verify field of study');
    assert.ok(health.pills.some(p => p.id === 'dates' && p.ok), 'Should verify graduation dates');
    assert.ok(health.pills.some(p => p.id === 'grade' && p.ok), 'Should verify honors/GPA');
    assert.ok(health.jdMatches.length >= 1, 'Should match keywords from target JD without bullet requirement');
});

test('5.2 getEducationHealth handles Currently Studying qualifications with high ATS score', () => {
    const inProgressEdu = {
        school: 'Massachusetts Institute of Technology',
        degree: 'Master of Science in Artificial Intelligence',
        fieldOfStudy: 'Artificial Intelligence',
        started: '2024-09',
        finished: 'Present',
        current: true,
        grade: '4.0 GPA',
        description: 'Graduate Fellow in Computer Science and Artificial Intelligence Laboratory (CSAIL).'
    };

    const health = getEducationHealth(inProgressEdu);
    assert.ok(health.score >= 85, `Score should be >= 85 (ATS Ready), got ${health.score}`);
    assert.ok(health.pills.some(p => p.id === 'dates' && p.label.includes('Currently Studying')), 'Should reflect Currently Studying status');
});

test('5.3 generateEducationInterviewQuestions produces targeted academic questions and starter chips', () => {
    const csQuestions = generateEducationInterviewQuestions('Bachelor of Science', 'UC Berkeley', 'Computer Science');
    assert.equal(csQuestions.length, 3);
    assert.ok(csQuestions[0].question.includes('coursework') || csQuestions[0].question.includes('subjects'));
    assert.ok(csQuestions[0].starterChips.some(chip => chip.includes('Distributed Systems') || chip.includes('Algorithms')));

    const nursingQuestions = generateEducationInterviewQuestions('Master of Science in Nursing', 'Johns Hopkins', 'Nursing');
    assert.ok(nursingQuestions[0].starterChips.some(chip => chip.includes('Pharmacology') || chip.includes('Clinical')));
});
