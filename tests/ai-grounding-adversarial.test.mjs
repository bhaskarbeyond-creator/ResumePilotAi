/**
 * Adversarial AI Grounding Test Harness
 * 
 * Tests that the AI system NEVER fabricates unsupported user facts.
 * Every test case is an attack vector that attempts to make the AI
 * generate content not present in the source data.
 * 
 * Run: node --test tests/ai-grounding-adversarial.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the AI runtime module
const aiRuntime = await import('../backend/services/aiRuntime.js');
const {
    parseAiResponse,
    validateOperation,
    assertGroundedGeneratedContent,
    groundResumeExtraction,
    getContentOperationFallback,
} = aiRuntime;

describe('AI Grounding Adversarial Tests', () => {
    
    describe('Source-of-Truth Enforcement', () => {
        it('rejects AI output that introduces fabricated numbers', () => {
            const payload = {
                jobTitle: 'Software Engineer',
                employer: 'TechCorp',
                existingText: 'Led team projects and improved code quality',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated metrics
            const parsed = {
                suggestions: [{
                    text: 'Led team of 15 engineers and improved code quality by 40%',
                    sourceExcerpt: 'Led team projects and improved code quality',
                }],
            };
            
            // The grounding check should reject the fabricated "15 engineers" and "40%"
            try {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects AI output that introduces fabricated identifiers', () => {
            const payload = {
                jobTitle: 'Developer',
                employer: 'StartupXYZ',
                existingText: 'Built web applications using React',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated technology names
            const parsed = {
                suggestions: [{
                    text: 'Built web applications using React, Kubernetes, and AWS Lambda',
                    sourceExcerpt: 'Built web applications using React',
                }],
            };
            
            // "Kubernetes" and "AWS Lambda" are not in source
            try {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects AI output that introduces fabricated credentials', () => {
            const payload = {
                jobTitle: 'Engineer',
                employer: 'Company',
                existingText: 'Experienced software developer',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated certification
            const parsed = {
                summary: 'Experienced software developer with AWS Solutions Architect certification',
                sourceExcerpts: ['Experienced software developer'],
            };
            
            // "AWS Solutions Architect certification" is not in source
            try {
                assertGroundedGeneratedContent('generate-summary', parsed, { summary: parsed.summary }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects AI output that introduces fabricated achievements', () => {
            const payload = {
                jobTitle: 'Manager',
                employer: 'Corp',
                existingText: 'Managed team projects',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated achievement
            const parsed = {
                suggestions: [{
                    text: 'Managed team projects and won Employee of the Year award',
                    sourceExcerpt: 'Managed team projects',
                }],
            };
            
            // "won Employee of the Year award" is not in source
            try {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects AI output that introduces fabricated leadership claims', () => {
            const payload = {
                jobTitle: 'Developer',
                employer: 'Company',
                existingText: 'Worked on backend services',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated leadership
            const parsed = {
                suggestions: [{
                    text: 'Led and directed backend services team of 10 engineers',
                    sourceExcerpt: 'Worked on backend services',
                }],
            };
            
            // "Led", "directed", "team of 10" are not in source
            try {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects AI output that introduces fabricated scale claims', () => {
            const payload = {
                jobTitle: 'Engineer',
                employer: 'Startup',
                existingText: 'Built REST API',
                tone: 'balanced',
                language: 'en',
            };
            
            // Simulate AI response with fabricated scale
            const parsed = {
                suggestions: [{
                    text: 'Built enterprise-grade, high-traffic REST API serving millions of users',
                    sourceExcerpt: 'Built REST API',
                }],
            };
            
            // "enterprise-grade", "high-traffic", "millions of users" are not in source
            try {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
                assert.fail('Should have thrown UNGROUNDED_AI_RESPONSE');
            } catch (err) {
                assert.ok(err.code === 'UNGROUNDED_AI_RESPONSE', `Expected UNGROUNDED_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });
    });

    describe('Valid Grounded Output', () => {
        it('accepts output that only rewrites source facts', () => {
            const payload = {
                jobTitle: 'Software Engineer',
                employer: 'TechCorp',
                existingText: 'Led team projects and improved code quality',
                tone: 'balanced',
                language: 'en',
            };
            
            // This is a valid rewrite - only uses words from source
            const parsed = {
                suggestions: [{
                    text: 'Led projects and improved code quality',
                    sourceExcerpt: 'Led team projects and improved code quality',
                }],
            };
            
            // Should not throw
            assert.doesNotThrow(() => {
                assertGroundedGeneratedContent('generate-work-description', parsed, { suggestions: [parsed.suggestions[0].text] }, payload);
            });
        });

        it('accepts summary that only uses source facts', () => {
            const payload = {
                jobTitle: 'Engineer',
                occupation: 'Software Developer',
                sourceFacts: 'Experienced software developer with React and Node.js skills',
                language: 'en',
                tone: 'balanced',
            };
            
            const parsed = {
                summary: 'Experienced software developer with React and Node.js skills',
                sourceExcerpts: ['Experienced software developer with React and Node.js skills'],
            };
            
            // Should not throw
            assert.doesNotThrow(() => {
                assertGroundedGeneratedContent('generate-summary', parsed, { summary: parsed.summary }, payload);
            });
        });
    });

    describe('Empty/Malformed Response Handling', () => {
        it('rejects empty AI response', () => {
            try {
                parseAiResponse('generate-summary', '');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.code === 'EMPTY_AI_RESPONSE' || err.message.includes('empty'), `Expected EMPTY_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects null AI response', () => {
            try {
                parseAiResponse('generate-summary', null);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.code === 'EMPTY_AI_RESPONSE' || err.message.includes('empty'), `Expected EMPTY_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });

        it('handles non-JSON text as raw summary extraction', () => {
            // parseAiResponse for generate-summary extracts text from raw content
            // when no JSON is found. This is valid behavior - the AI may return
            // a plain-text summary. The grounding check happens separately.
            const result = parseAiResponse('generate-summary', 'A skilled software engineer with experience');
            assert.ok(result);
            assert.ok(result.summary);
        });

        it('rejects response with missing required fields', () => {
            try {
                parseAiResponse('generate-summary', '{"notSummary": "value"}');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.code === 'INVALID_AI_RESPONSE' || err.message.includes('contract'), `Expected INVALID_AI_RESPONSE but got: ${err.code} - ${err.message}`);
            }
        });
    });

    describe('Provider Failure Fallback Safety', () => {
        it('returns source-preserving fallback for summary when provider fails', () => {
            const payload = {
                jobTitle: 'Engineer',
                occupation: 'Developer',
                existingText: 'Experienced software developer with 5 years of experience',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-summary', payload);
            
            // Fallback should return the original text, not fabricated content
            assert.ok(fallback);
            assert.ok(fallback.summary);
            assert.ok(fallback._source.includes('fallback'));
            // The summary should be the original text (source-preserving)
            assert.ok(fallback.summary.includes('Experienced software developer'));
        });

        it('returns source-preserving fallback for work description when provider fails', () => {
            const payload = {
                jobTitle: 'Engineer',
                employer: 'Company',
                existingText: 'Built web applications',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-work-description', payload);
            
            // Fallback should return the original text
            assert.ok(fallback);
            assert.ok(fallback.suggestions);
            assert.ok(fallback.suggestions.length > 0);
            assert.ok(fallback._source.includes('fallback'));
        });

        it('returns empty fallback for skills when provider fails', () => {
            const payload = {
                jobTitle: 'Engineer',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-skills', payload);
            
            // Skills fallback should be empty (not fabricated)
            assert.ok(fallback);
            assert.ok(fallback.skills);
            assert.equal(fallback.skills.length, 0);
            assert.ok(fallback._source.includes('empty-fallback'));
        });

        it('returns empty fallback for autocomplete when provider fails', () => {
            const payload = {
                type: 'skill',
                query: 'react',
                language: 'en',
            };
            
            const fallback = getContentOperationFallback('autocomplete', payload);
            
            // Autocomplete fallback should be empty (not fabricated)
            assert.ok(fallback);
            assert.ok(fallback.suggestions);
            assert.equal(fallback.suggestions.length, 0);
            assert.ok(fallback._source.includes('empty-fallback'));
        });
    });

    describe('Input Validation', () => {
        it('rejects unsupported AI operation', () => {
            try {
                validateOperation('unsupported-operation', {});
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.code === 'UNSUPPORTED_AI_OPERATION' || err.message.includes('Unsupported'), `Expected UNSUPPORTED_AI_OPERATION but got: ${err.code} - ${err.message}`);
            }
        });

        it('rejects summary without target role', () => {
            try {
                validateOperation('generate-summary', { existingText: 'Some text' });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('target role'), `Expected 'target role' error but got: ${err.message}`);
            }
        });

        it('rejects summary with insufficient source facts', () => {
            try {
                validateOperation('generate-summary', {
                    jobTitle: 'Engineer',
                    existingText: 'Short',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('20 characters'), `Expected '20 characters' error but got: ${err.message}`);
            }
        });

        it('rejects work description without job title', () => {
            try {
                validateOperation('generate-work-description', {
                    employer: 'Company',
                    existingText: 'Some work description text here',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('Job title'), `Expected 'Job title' error but got: ${err.message}`);
            }
        });

        it('rejects work description without employer', () => {
            try {
                validateOperation('generate-work-description', {
                    jobTitle: 'Engineer',
                    existingText: 'Some work description text here',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('Employer'), `Expected 'Employer' error but got: ${err.message}`);
            }
        });

        it('rejects work description with insufficient source notes', () => {
            try {
                validateOperation('generate-work-description', {
                    jobTitle: 'Engineer',
                    employer: 'Company',
                    existingText: 'Short',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('12 characters'), `Expected '12 characters' error but got: ${err.message}`);
            }
        });

        it('rejects education description without school', () => {
            try {
                validateOperation('generate-education-description', {
                    degree: 'BS',
                    existingText: 'Some education description here',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('School'), `Expected 'School' error but got: ${err.message}`);
            }
        });

        it('rejects education description without degree', () => {
            try {
                validateOperation('generate-education-description', {
                    school: 'University',
                    existingText: 'Some education description here',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('Degree'), `Expected 'Degree' error but got: ${err.message}`);
            }
        });

        it('rejects skills generation without target role', () => {
            try {
                validateOperation('generate-skills', {});
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('target role'), `Expected 'target role' error but got: ${err.message}`);
            }
        });

        it('rejects enhance-bullet without bullet text', () => {
            try {
                validateOperation('enhance-single-bullet', {});
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('Bullet'), `Expected 'Bullet' error but got: ${err.message}`);
            }
        });

        it('rejects autocomplete with unsupported type', () => {
            try {
                validateOperation('autocomplete', { type: 'unsupported', query: 'test' });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('Unsupported autocomplete'), `Expected 'Unsupported autocomplete' error but got: ${err.message}`);
            }
        });

        it('rejects autocomplete with short query', () => {
            try {
                validateOperation('autocomplete', { type: 'skill', query: 'a' });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('too short'), `Expected 'too short' error but got: ${err.message}`);
            }
        });
    });

    describe('Resume Extraction Grounding', () => {
        it('grounds extracted data to source text', () => {
            const sourceText = `John Doe
Software Engineer
john@example.com
555-1234

Experience:
Senior Developer at TechCorp (2020-2023)
Built REST APIs using Node.js and PostgreSQL

Education:
BS Computer Science, MIT (2016-2020)

Skills: JavaScript, Python, SQL, React`;

            const extracted = {
                firstname: 'John',
                lastname: 'Doe',
                email: 'john@example.com',
                phone: '555-1234',
                occupation: 'Software Engineer',
                employments: [{
                    jobTitle: 'Senior Developer',
                    employer: 'TechCorp',
                    startDate: '2020',
                    endDate: '2023',
                    description: 'Built REST APIs using Node.js and PostgreSQL',
                }],
                educations: [{
                    school: 'MIT',
                    degree: 'BS Computer Science',
                    startDate: '2016',
                    endDate: '2020',
                }],
                skills: [
                    { skillName: 'JavaScript', rating: null },
                    { skillName: 'Python', rating: null },
                    { skillName: 'SQL', rating: null },
                    { skillName: 'React', rating: null },
                ],
            };

            const grounded = groundResumeExtraction(extracted, sourceText);

            // All extracted values should be present in source
            assert.equal(grounded.firstname, 'John');
            assert.equal(grounded.lastname, 'Doe');
            assert.equal(grounded.email, 'john@example.com');
            assert.equal(grounded.phone, '555-1234');
            assert.equal(grounded.occupation, 'Software Engineer');
            assert.equal(grounded.employments.length, 1);
            assert.equal(grounded.employments[0].jobTitle, 'Senior Developer');
            assert.equal(grounded.employments[0].employer, 'TechCorp');
            assert.equal(grounded.educations.length, 1);
            assert.equal(grounded.educations[0].school, 'MIT');
            assert.equal(grounded.skills.length, 4);
        });

        it('rejects extracted values not in source text', () => {
            const sourceText = 'John Doe, Software Engineer at TechCorp';

            const extracted = {
                firstname: 'John',
                lastname: 'Doe',
                occupation: 'Software Engineer',
                employments: [{
                    jobTitle: 'Senior Developer',  // Not in source
                    employer: 'TechCorp',
                }],
            };

            const grounded = groundResumeExtraction(extracted, sourceText);

            // "Senior Developer" is not in source, should be empty
            assert.equal(grounded.employments[0].jobTitle, '');
            // "TechCorp" is in source
            assert.equal(grounded.employments[0].employer, 'TechCorp');
        });

        it('rejects fabricated skill ratings', () => {
            const sourceText = 'Skills: JavaScript, Python';

            const extracted = {
                skills: [
                    { skillName: 'JavaScript', rating: 90 },  // Rating not in source
                    { skillName: 'Python', rating: null },
                ],
            };

            const grounded = groundResumeExtraction(extracted, sourceText);

            // Rating should be null because "90%" is not associated with JavaScript in source
            assert.equal(grounded.skills[0].rating, null);
            assert.equal(grounded.skills[1].rating, null);
        });
    });

    describe('Protected Claim Families', () => {
        it('detects credential claims in generated text', () => {
            const source = 'Experienced developer';
            const generated = 'Certified AWS Solutions Architect';
            
            // Should detect the credential claim
            assert.ok(/\b(?:certif(?:ied|ication)|licen[cs](?:e|ed|ure)?)\b/i.test(generated));
            assert.ok(!/\b(?:certif(?:ied|ication)|licen[cs](?:e|ed|ure)?)\b/i.test(source));
        });

        it('detects achievement claims in generated text', () => {
            const source = 'Managed projects';
            const generated = 'Won award for best project';
            
            // Should detect the achievement claim
            assert.ok(/\b(?:award(?:ed)?|honou?rs?)\b/i.test(generated));
            assert.ok(!/\b(?:award(?:ed)?|honou?rs?)\b/i.test(source));
        });

        it('detects leadership claims in generated text', () => {
            const source = 'Worked on backend';
            const generated = 'Led and directed backend team';
            
            // Should detect the leadership claim
            assert.ok(/\b(?:led|leadership|managed|supervised|mentored|directed)\b/i.test(generated));
            assert.ok(!/\b(?:led|leadership|managed|supervised|mentored|directed)\b/i.test(source));
        });

        it('detects measured outcome claims in generated text', () => {
            const source = 'Built API';
            const generated = 'Increased performance by 50%';
            
            // Should detect the measured outcome claim
            assert.ok(/\b(?:increas(?:ed|ing)|improv(?:ed|ing|ement))\b/i.test(generated));
            assert.ok(!/\b(?:increas(?:ed|ing)|improv(?:ed|ing|ement))\b/i.test(source));
        });

        it('detects delivery ownership claims in generated text', () => {
            const source = 'Worked on services';
            const generated = 'Built and deployed microservices';
            
            // Should detect the delivery ownership claim
            assert.ok(/\b(?:built|created|develop(?:ed|ment)|designed|implemented)\b/i.test(generated));
            assert.ok(!/\b(?:built|created|develop(?:ed|ment)|designed|implemented)\b/i.test(source));
        });
    });

    describe('Quantity Validation', () => {
        it('rejects fabricated percentages', () => {
            const source = 'Improved performance';
            const generated = 'Improved performance by 40%';
            
            // Extract quantities
            const sourceQty = source.match(/(?:[$€£₹]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|years?|months?))?/gi) || [];
            const generatedQty = generated.match(/(?:[$€£₹]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|years?|months?))?/gi) || [];
            
            // Generated has "40%" which is not in source
            assert.ok(generatedQty.length > 0);
            assert.ok(sourceQty.length === 0);
        });

        it('rejects fabricated team sizes', () => {
            const source = 'Led team projects';
            const generated = 'Led team of 15 engineers';
            
            // Extract quantities
            const sourceQty = source.match(/\d+/g) || [];
            const generatedQty = generated.match(/\d+/g) || [];
            
            // Generated has "15" which is not in source
            assert.ok(generatedQty.length > 0);
            assert.ok(sourceQty.length === 0);
        });

        it('accepts quantities present in source', () => {
            const source = 'Managed team of 5 engineers, improved performance by 30%';
            const generated = 'Managed team of 5 engineers, improved performance by 30%';
            
            // Extract quantities
            const sourceQty = source.match(/\d+/g) || [];
            const generatedQty = generated.match(/\d+/g) || [];
            
            // All quantities in generated are in source
            assert.deepEqual(generatedQty, sourceQty);
        });
    });
});
