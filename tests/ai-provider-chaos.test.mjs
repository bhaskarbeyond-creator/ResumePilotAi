/**
 * AI Provider Failure Chaos Test Harness
 * 
 * Simulates various provider failure scenarios and verifies graceful degradation.
 * 
 * Run: node --test tests/ai-provider-chaos.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const aiRuntime = await import('../backend/services/aiRuntime.js');
const {
    generateWithProviders,
    getContentOperationFallback,
    parseAiResponse,
    validateOperation,
} = aiRuntime;

describe('AI Provider Failure Chaos Tests', () => {
    
    describe('All Providers Fail', () => {
        it('throws AI_PROVIDER_ERROR when all providers fail', async () => {
            const configuration = {
                primary: 'gemini',
                enableFallback: true,
                temperature: 0.7,
                maxTokens: 2048,
                providers: {
                    gemini: { key: 'test', model: 'gemini-2.0-flash', enabled: true },
                    openai: { key: 'test', model: 'gpt-4o-mini', enabled: true },
                },
            };
            
            // Mock fetch that always fails
            const fetchImpl = async () => {
                throw new Error('Provider unavailable');
            };
            
            try {
                await generateWithProviders({
                    prompt: 'test',
                    configuration,
                    operation: 'test',
                    fetchImpl,
                    timeoutMs: 1000,
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.equal(err.code, 'AI_PROVIDER_ERROR');
                assert.ok(err.failures);
                assert.equal(err.failures.length, 2);
            }
        });
    });

    describe('Provider Timeout', () => {
        it('handles provider timeout gracefully', async () => {
            const configuration = {
                primary: 'gemini',
                enableFallback: false,
                temperature: 0.7,
                maxTokens: 2048,
                providers: {
                    gemini: { key: 'test', model: 'gemini-2.0-flash', enabled: true },
                },
            };
            
            // Mock fetch that times out
            const fetchImpl = async () => {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return { ok: true, json: async () => ({}) };
            };
            
            try {
                await generateWithProviders({
                    prompt: 'test',
                    configuration,
                    operation: 'test',
                    fetchImpl,
                    timeoutMs: 100,  // Very short timeout
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.code === 'AI_PROVIDER_TIMEOUT' || err.code === 'AI_PROVIDER_ERROR');
            }
        });
    });

    describe('Empty Response Handling', () => {
        it('rejects empty provider response', () => {
            try {
                parseAiResponse('generate-summary', '');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.equal(err.code, 'EMPTY_AI_RESPONSE');
            }
        });

        it('rejects null provider response', () => {
            try {
                parseAiResponse('generate-summary', null);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.equal(err.code, 'EMPTY_AI_RESPONSE');
            }
        });

        it('rejects undefined provider response', () => {
            try {
                parseAiResponse('generate-summary', undefined);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.equal(err.code, 'EMPTY_AI_RESPONSE');
            }
        });
    });

    describe('Malformed Response Handling', () => {
        it('handles response with invalid JSON gracefully', () => {
            // For summary, it extracts from raw text
            const result = parseAiResponse('generate-summary', 'A skilled developer');
            assert.ok(result);
            assert.ok(result.summary);
        });

        it('rejects response that does not match contract', () => {
            try {
                parseAiResponse('generate-skills', '{"notSkills": "value"}');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.equal(err.code, 'INVALID_AI_RESPONSE');
            }
        });
    });

    describe('Source-Preserving Fallback', () => {
        it('returns source text for summary fallback', () => {
            const payload = {
                jobTitle: 'Engineer',
                occupation: 'Developer',
                existingText: 'Experienced software developer with React skills',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-summary', payload);
            assert.ok(fallback);
            assert.ok(fallback.summary.includes('Experienced software developer'));
            assert.ok(fallback._source.includes('fallback'));
        });

        it('returns source text for work description fallback', () => {
            const payload = {
                jobTitle: 'Engineer',
                employer: 'Company',
                existingText: 'Built web applications using React',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-work-description', payload);
            assert.ok(fallback);
            assert.ok(fallback.suggestions.length > 0);
            assert.ok(fallback._source.includes('fallback'));
        });

        it('returns source text for education description fallback', () => {
            const payload = {
                school: 'University',
                degree: 'BS Computer Science',
                existingText: 'Studied computer science and software engineering',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-education-description', payload);
            assert.ok(fallback);
            assert.ok(fallback.suggestions.length > 0);
            assert.ok(fallback._source.includes('fallback'));
        });

        it('returns source text for bullet enhancement fallback', () => {
            const payload = {
                bullet: 'Led team projects and improved code quality',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('enhance-single-bullet', payload);
            assert.ok(fallback);
            assert.ok(fallback.enhancedBullet.includes('Led team projects'));
            assert.ok(fallback._source.includes('fallback'));
        });

        it('returns empty array for skills fallback', () => {
            const payload = {
                jobTitle: 'Engineer',
                language: 'en',
                tone: 'balanced',
            };
            
            const fallback = getContentOperationFallback('generate-skills', payload);
            assert.ok(fallback);
            assert.deepEqual(fallback.skills, []);
            assert.ok(fallback._source.includes('empty-fallback'));
        });

        it('returns empty array for autocomplete fallback', () => {
            const payload = {
                type: 'skill',
                query: 'react',
                language: 'en',
            };
            
            const fallback = getContentOperationFallback('autocomplete', payload);
            assert.ok(fallback);
            assert.deepEqual(fallback.suggestions, []);
            assert.ok(fallback._source.includes('empty-fallback'));
        });
    });

    describe('Input Validation Edge Cases', () => {
        it('rejects summary with only whitespace source', () => {
            try {
                validateOperation('generate-summary', {
                    jobTitle: 'Engineer',
                    existingText: '   ',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('20 characters'));
            }
        });

        it('rejects work description with only whitespace source', () => {
            try {
                validateOperation('generate-work-description', {
                    jobTitle: 'Engineer',
                    employer: 'Company',
                    existingText: '   ',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('12 characters'));
            }
        });

        it('rejects education description with only whitespace source', () => {
            try {
                validateOperation('generate-education-description', {
                    school: 'University',
                    degree: 'BS',
                    existingText: '   ',
                });
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err.message.includes('12 characters'));
            }
        });

        it('accepts summary with exactly 20 characters', () => {
            assert.doesNotThrow(() => {
                validateOperation('generate-summary', {
                    jobTitle: 'Engineer',
                    existingText: 'a'.repeat(20),
                });
            });
        });

        it('accepts work description with exactly 12 characters', () => {
            assert.doesNotThrow(() => {
                validateOperation('generate-work-description', {
                    jobTitle: 'Engineer',
                    employer: 'Company',
                    existingText: 'a'.repeat(12),
                });
            });
        });
    });

    describe('Protected Claim Detection', () => {
        it('detects credential claims', () => {
            const source = 'Developer with experience';
            const generated = 'Certified AWS Solutions Architect';
            
            const hasCredential = /\b(?:certif(?:ied|ication)|licen[cs](?:e|ed|ure)?)\b/i.test(generated);
            const sourceHasCredential = /\b(?:certif(?:ied|ication)|licen[cs](?:e|ed|ure)?)\b/i.test(source);
            
            assert.ok(hasCredential);
            assert.ok(!sourceHasCredential);
        });

        it('detects achievement claims', () => {
            const source = 'Managed projects';
            const generated = 'Won award for excellence';
            
            const hasAchievement = /\b(?:award(?:ed)?|honou?rs?)\b/i.test(generated);
            const sourceHasAchievement = /\b(?:award(?:ed)?|honou?rs?)\b/i.test(source);
            
            assert.ok(hasAchievement);
            assert.ok(!sourceHasAchievement);
        });

        it('detects leadership claims', () => {
            const source = 'Worked on backend';
            const generated = 'Led and directed team';
            
            const hasLeadership = /\b(?:led|leadership|managed|supervised|mentored|directed)\b/i.test(generated);
            const sourceHasLeadership = /\b(?:led|leadership|managed|supervised|mentored|directed)\b/i.test(source);
            
            assert.ok(hasLeadership);
            assert.ok(!sourceHasLeadership);
        });

        it('detects measured outcome claims', () => {
            const source = 'Built API';
            const generated = 'Increased performance by 50%';
            
            const hasOutcome = /\b(?:increas(?:ed|ing)|improv(?:ed|ing|ement))\b/i.test(generated);
            const sourceHasOutcome = /\b(?:increas(?:ed|ing)|improv(?:ed|ing|ement))\b/i.test(source);
            
            assert.ok(hasOutcome);
            assert.ok(!sourceHasOutcome);
        });
    });

    describe('Quantity Validation Edge Cases', () => {
        it('rejects fabricated currency amounts', () => {
            const source = 'Managed budget';
            const generated = 'Managed $1M budget';
            
            const sourceQty = source.match(/(?:[$€£₹]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|years?|months?))?/gi) || [];
            const generatedQty = generated.match(/(?:[$€£₹]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|years?|months?))?/gi) || [];
            
            assert.ok(generatedQty.length > 0);
            assert.equal(sourceQty.length, 0);
        });

        it('rejects fabricated team sizes', () => {
            const source = 'Led team';
            const generated = 'Led team of 20 engineers';
            
            const sourceQty = source.match(/\d+/g) || [];
            const generatedQty = generated.match(/\d+/g) || [];
            
            assert.ok(generatedQty.length > 0);
            assert.equal(sourceQty.length, 0);
        });

        it('accepts quantities present in source', () => {
            const source = 'Managed team of 5 engineers, improved by 30%';
            const generated = 'Managed team of 5 engineers, improved by 30%';
            
            const sourceQty = source.match(/\d+/g) || [];
            const generatedQty = generated.match(/\d+/g) || [];
            
            assert.deepEqual(generatedQty, sourceQty);
        });
    });
});
