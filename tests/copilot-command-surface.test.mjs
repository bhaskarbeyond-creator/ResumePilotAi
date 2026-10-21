/**
 * DIR-021 — AI Career Copilot & Universal Command Surface, Node contract suite.
 *
 * WHAT THIS SUITE PROVES (the parts decidable without a browser):
 *   AC-2  Context-aware actions resolve from the REAL portal + route, never leak
 *         across portals, and every AI-bearing action names a REAL endpoint.
 *   AC-3  A free-text prompt maps onto a real operation; an unrecognised
 *         sentence resolves to null so the UI fails closed instead of guessing.
 *   INV-1 The frozen CV templates and AI runtime are untouched.
 *   INV-2 No prompt or token is written to a URL query or browser storage.
 *   INV-3 Quota stays server-authoritative; the client keeps no balance.
 *   INV-4 Only Cuba semantic ink tokens are used by the new surfaces.
 *
 * Run: node --test tests/copilot-command-surface.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
    COPILOT_PORTALS,
    getCopilotActions,
    getAiCopilotActions,
    findCopilotAction,
    actionMatchesRoute,
} from '../src/components/cuba/copilotActions.js';
import {
    resolvePromptOperation,
    buildCopilotPayload,
    isDispatchableOperation,
} from '../src/components/cuba/copilotPrompt.js';

const read = (path) => readFileSync(path, 'utf8');
const palette = read('src/components/cuba/CubaCommandPalette.jsx');
const shell = read('src/components/cuba/CubaAppShell.jsx');
const portalShell = read('src/components/cuba/CubaPortalShell.jsx');
const candidateShell = read('src/components/Candidate/CubaCandidateShell.jsx');

/** Mirrors the endpoint allow-list enforced by the real aiService. */
const REAL_OPERATIONS = new Set([
    'generate-summary', 'generate-interview',
    'generate-work-description', 'generate-education-description',
    'generate-skills', 'generate-certifications', 'check-grammar',
    'enhance-single-bullet', 'autocomplete', 'generate-ai-cover-letter',
    'generate-job-description', 'generate-content', 'generate-projects',
]);

describe('DIR-021 AC-2: context-aware actions', () => {
    test('each portal resolves only its own actions', () => {
        const portalsOf = (portal, pathname) => [
            ...new Set(getCopilotActions({ portal, pathname }).map((a) => a.portal)),
        ];
        assert.deepEqual(portalsOf(COPILOT_PORTALS.CANDIDATE, '/dashboard'), [COPILOT_PORTALS.CANDIDATE]);
        assert.deepEqual(portalsOf(COPILOT_PORTALS.RECRUITER, '/employer'), [COPILOT_PORTALS.RECRUITER]);
        assert.deepEqual(portalsOf(COPILOT_PORTALS.ENTERPRISE, '/org/x'), [COPILOT_PORTALS.ENTERPRISE]);
        assert.deepEqual(portalsOf(COPILOT_PORTALS.ADMIN, '/admin'), [COPILOT_PORTALS.ADMIN]);
    });

    test('AC-2 names the four required candidate intents somewhere in the product', () => {
        const all = ['/dashboard', '/build-resume', '/cover-letter', '/dashboard/interview']
            .flatMap((pathname) => getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname }).map((a) => a.label));
        for (const required of [
            'Tailor resume to job description',
            'Generate cover letter',
            'Start mock interview session',
            'Audit resume for ATS keywords',
        ]) {
            assert.ok(all.includes(required), `candidate portal must expose "${required}"`);
        }
    });

    test('recruiter and enterprise expose their required intents', () => {
        const recruiter = getCopilotActions({ portal: COPILOT_PORTALS.RECRUITER, pathname: '/employer' }).map((a) => a.label);
        for (const required of ['Summarize candidate pool', 'Generate interview scorecard', 'Draft outreach message']) {
            assert.ok(recruiter.includes(required), `recruiter portal must expose "${required}"`);
        }
        const enterprise = getCopilotActions({ portal: COPILOT_PORTALS.ENTERPRISE, pathname: '/org/x' }).map((a) => a.label);
        assert.ok(enterprise.includes('Summarize tenant quota usage'));
    });

    test('route scoping is segment-bounded, never a raw prefix', () => {
        assert.ok(actionMatchesRoute({ portal: 'recruiter', routes: ['/employer'] }, '/employer/pipeline'));
        assert.equal(actionMatchesRoute({ portal: 'recruiter', routes: ['/employer'] }, '/employerxyz'), false);
    });

    test('a route with no actions returns an honest empty list, never a global default', () => {
        assert.deepEqual(
            getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/portfolio-builder' }),
            [],
            'an unlisted route must not fall back to some catch-all list',
        );
    });

    test('no portal supplied yields no actions at all (no fabricated default portal)', () => {
        assert.deepEqual(getCopilotActions({}), []);
        assert.deepEqual(getCopilotActions({ pathname: '/dashboard' }), []);
    });

    test('findCopilotAction only resolves inside the supplied context', () => {
        const ctx = { portal: COPILOT_PORTALS.CANDIDATE, pathname: '/build-resume' };
        assert.ok(findCopilotAction('candidate-ats-audit', ctx));
        assert.equal(findCopilotAction('recruiter-outreach', ctx), null, 'a cross-portal id must not resolve');
        assert.equal(findCopilotAction('', ctx), null);
    });
});
describe('DIR-021 zero-fabrication: only real endpoints', () => {
    test('every AI-bearing action names an operation the backend actually serves', () => {
        const seen = new Set();
        for (const portal of Object.values(COPILOT_PORTALS)) {
            for (const pathname of ['/dashboard', '/build-resume', '/cover-letter', '/employer', '/admin', '/org/x']) {
                for (const action of getAiCopilotActions({ portal, pathname })) {
                    assert.ok(REAL_OPERATIONS.has(action.operation),
                        `action "${action.id}" names "${action.operation}", not a real ALLOWED_ENDPOINTS operation`);
                    seen.add(action.operation);
                }
            }
        }
        assert.ok(seen.size > 0, 'at least one real AI operation must be reachable');
    });

    test('navigation-owned work dispatches NO AI request', () => {
        // Pipeline aggregation, quota usage and the interview coach are owned by
        // their own modules; asking a model to "summarize" them would fabricate.
        const recruiter = getCopilotActions({ portal: COPILOT_PORTALS.RECRUITER, pathname: '/employer' });
        assert.equal(recruiter.find((a) => a.id === 'recruiter-summarize-pool').operation, null);
        assert.equal(recruiter.find((a) => a.id === 'recruiter-scorecard').operation, null);
        const enterprise = getCopilotActions({ portal: COPILOT_PORTALS.ENTERPRISE, pathname: '/org/x' });
        assert.equal(enterprise[0].operation, null);
        const interview = getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/dashboard' })
            .find((a) => a.id === 'candidate-mock-interview');
        assert.equal(interview.operation, null);
        assert.equal(interview.navigateTo, '/dashboard/interview',
            'the destination must be a route that actually exists (the live route is singular)');
    });

    test('the copilot claims no latency, token count or provider name (§20)', () => {
        assert.doesNotMatch(palette, /\b\d+\s?ms\b/, 'no invented response time');
        assert.doesNotMatch(palette, /NVIDIA|OpenAI|Anthropic|Claude|GPT-/i, 'no hardcoded provider identity');
    });
});

describe('DIR-021 AC-3: free-text prompt routing', () => {
    test('recognised prompts map to real operations only', () => {
        const cases = [
            ['write a cover letter for a nurse role', 'generate-ai-cover-letter'],
            ['polish this bullet', 'enhance-single-bullet'],
            ['check the grammar please', 'check-grammar'],
            ['tailor my resume summary', 'generate-summary'],
            ['start a mock interview practice', 'generate-interview'],
            ['which ats keywords should I add', 'generate-skills'],
        ];
        for (const [prompt, expected] of cases) {
            const resolved = resolvePromptOperation(prompt);
            assert.equal(resolved, expected, `"${prompt}" must resolve to ${expected}`);
            assert.ok(REAL_OPERATIONS.has(resolved), 'resolved operation must be a real endpoint');
            assert.ok(isDispatchableOperation(resolved));
        }
    });

    test('an unrecognised prompt fails closed instead of guessing an endpoint', () => {
        for (const prompt of ['asdkjh qwe', 'zzzz', '', '   ', 'hello there']) {
            const resolved = resolvePromptOperation(prompt);
            assert.ok(resolved === null || REAL_OPERATIONS.has(resolved),
                'a prompt may only resolve to null or a real operation, never a guess');
        }
        assert.equal(resolvePromptOperation('asdkjh qwe'), null);
        assert.equal(resolvePromptOperation(''), null);
    });

    test('an unknown operation is never dispatchable', () => {
        assert.equal(isDispatchableOperation('rm-rf'), false);
        assert.equal(isDispatchableOperation(''), false);
        assert.equal(isDispatchableOperation(undefined), false);
    });
});
describe('DIR-021 AC-3: payloads are grounded and fail closed', () => {
    test("a real payload carries only the operation's documented fields", () => {
        const { payload, missing } = buildCopilotPayload('generate-ai-cover-letter', {
            targetRole: 'Nurse', companyName: 'St Mary', prompt: ' emphasise triage',
        });
        assert.deepEqual(missing, []);
        assert.equal(payload.jobTitle, 'Nurse');
        assert.equal(payload.companyName, 'St Mary');
        assert.equal(payload.userInstructions, 'emphasise triage',
            'the prompt is trimmed like every other field, so no stray whitespace is forwarded');
    });

    test('missing context is reported, never filled with a placeholder', () => {
        const cover = buildCopilotPayload('generate-ai-cover-letter', {});
        assert.deepEqual(cover.missing, ['targetRole']);
        assert.equal(cover.payload.jobTitle, '', 'must stay empty rather than invent a role');
        assert.deepEqual(buildCopilotPayload('enhance-single-bullet', { targetRole: 'Nurse' }).missing, ['bullet']);
        assert.deepEqual(buildCopilotPayload('check-grammar', {}).missing, ['text']);
        assert.deepEqual(buildCopilotPayload('generate-summary', {}).missing, ['targetRole', 'experience']);
    });

    test('a summary grounded in any one real fact is dispatchable', () => {
        assert.deepEqual(buildCopilotPayload('generate-summary', { targetRole: 'Nurse' }).missing, []);
        assert.deepEqual(buildCopilotPayload('generate-summary', { experience: '5 years ICU' }).missing, []);
        assert.deepEqual(buildCopilotPayload('generate-summary', { skills: ['Triage'] }).missing, []);
    });

    test('non-string context is coerced to empty rather than crashing or leaking an object', () => {
        const { payload, missing } = buildCopilotPayload('generate-ai-cover-letter', {
            targetRole: { evil: true }, companyName: 42,
        });
        assert.deepEqual(missing, ['targetRole']);
        assert.equal(payload.jobTitle, '');
        assert.equal(payload.companyName, '');
    });

    test('an unknown operation produces an empty payload and no missing fields', () => {
        assert.deepEqual(buildCopilotPayload('not-an-operation', {}), { payload: {}, missing: [] });
    });
});
describe('DIR-021 AC-1 + AC-4: surface wiring and keyboard contract', () => {
    test('the copilot is opt-in: it renders only when a portal AND dispatcher exist', () => {
        assert.match(palette, /const copilotEnabled = Boolean\(copilotPortal && copilotDispatch\)/,
            'the switcher must be gated on a real portal and a real dispatcher');
        assert.match(palette, /\{copilotEnabled && \(\s*<div role="tablist"/,
            'the tablist must be gated so an unsupplied portal sees no dead affordance');
    });

    test('AC-4 keyboard contract is present on the shared key handler', () => {
        assert.match(palette, /event\.key === 'Tab' && !event\.shiftKey/, 'Tab switches mode');
        assert.match(palette, /event\.key === '\/' && !query/, 'Slash selects Navigation');
        assert.match(palette, /event\.key === ' ' && !query/, 'Space selects AI Copilot');
        assert.match(palette, /aria-activedescendant=/, 'the combobox tracks the active option');
        assert.match(palette, /role="combobox"/, 'the input keeps its combobox role');
    });

    test('a11y: the copilot announces progress and failure through live regions', () => {
        assert.match(palette, /data-testid="cuba-copilot-progress"/);
        assert.match(palette, /data-testid="cuba-copilot-error"/);
        assert.match(palette, /role="alert"/, 'a refusal must be announced, not silently swallowed');
        assert.match(palette, /role="status"/, 'the in-flight state must be announced');
    });

    test('the two listboxes can never both exist (no duplicate id)', () => {
        assert.equal((palette.match(/id="cuba-command-list"/g) || []).length, 2);
        assert.match(palette, /\{mode === MODE_NAVIGATION && \(/, 'the navigation list is gated on mode');
        assert.match(palette, /copilotEnabled && mode === MODE_COPILOT/, 'the copilot list is gated on mode');
    });

    test('all four portals opt in with a real portal id', () => {
        for (const [file, portal] of [
            ['src/components/Candidate/CubaCandidateShell.jsx', 'CANDIDATE'],
            ['src/components/EmployerPortal/EmployerPortalCuba.jsx', 'RECRUITER'],
            ['src/enterprise/EnterprisePortalCuba.jsx', 'ENTERPRISE'],
            ['src/components/admin/AdminPortalCuba.jsx', 'ADMIN'],
        ]) {
            assert.match(read(file), new RegExp(`copilotPortal=\\{COPILOT_PORTALS\\.${portal}\\}`),
                `${file} must opt into the ${portal} copilot`);
        }
    });

    test('the shell forwards the real route so chips are context-aware, not static', () => {
        assert.match(shell, /copilotPathname=\{copilotPathname\}/);
        assert.match(shell, /const copilotPathname = location\?\.pathname \|\| ''/);
    });
});
describe('DIR-021 INV-1/2/3/4: frozen surfaces, leakage, quota and contrast', () => {
    test('INV-1: the frozen CV template modules and AI runtime are byte-identical to the baseline', () => {
        // DIR-071 re-scoped this: the freeze covers the 55 TEMPLATE MODULES
        // (cv1..cv51, cover1..cover4) plus the AI runtime. `templateUtils.js` is a
        // SHARED utility that a directive may legitimately change (DIR-071 enforces
        // global photo-visibility suppression there), so it is asserted separately
        // below instead of silently widening the freeze.
        // A shallow clone does not contain the baseline object. Try once to
        // deepen rather than reporting a freeze VIOLATION that never happened.
        try {
            execFileSync('git', ['cat-file', '-e', 'e314f715'], { stdio: 'ignore' });
        } catch {
            try {
                execFileSync('git', ['fetch', '--deepen=500', 'origin'], { stdio: 'ignore', timeout: 60_000 });
            } catch { /* offline: the assertion below reports the missing object */ }
        }
        const diff = execFileSync('git', [
            '--no-pager', 'diff', 'e314f715', '--',
            'src/cv-templates/cv*', 'src/cv-templates/cover*',
            'backend/services/aiRuntime.js',
        ], { encoding: 'utf8', cwd: process.cwd() });
        assert.equal(diff.trim(), '', 'the frozen template modules and AI runtime must show a zero-byte diff');
        // Nothing else under src/cv-templates may change unnoticed.
        const changed = execFileSync('git', [
            '--no-pager', 'diff', '--name-only', 'e314f715', '--', 'src/cv-templates/',
        ], { encoding: 'utf8', cwd: process.cwd() }).trim().split('\n').filter(Boolean)
            .map((file) => file.replace(/\\/g, '/'));
        const allowed = new Set(['src/cv-templates/templateUtils.js']);
        assert.deepEqual(
            changed.filter((file) => !allowed.has(file)),
            [],
            `only the shared utility may differ under src/cv-templates, found: ${changed.join(', ')}`,
        );
    });

    test('INV-2: no prompt, token or candidate PII is put in a URL or browser storage', () => {
        for (const [name, src] of [['palette', palette], ['shell', shell], ['portalShell', portalShell], ['candidateShell', candidateShell]]) {
            assert.doesNotMatch(src, /sessionStorage\.setItem/, `${name} must not persist the prompt`);
            assert.doesNotMatch(src, /[?&]prompt=/, `${name} must not put a prompt in a URL query`);
            assert.doesNotMatch(src, /console\.(log|info|debug)\([^)]*\bprompt\b/i,
                `${name} must not log the prompt (candidate PII)`);
        }
        assert.match(portalShell, /generateUserAiContent\(operation, payload\)/,
            'the copilot must go through the authenticated aiService wrapper');
    });

    test('INV-3: quota stays server-authoritative and the real 429 verdict is surfaced', () => {
        assert.match(palette, /caught\?\.code === 'AI_DAILY_QUOTA_EXCEEDED'/,
            'the server quota verdict must be rendered verbatim');
        assert.doesNotMatch(palette, /quotaRemaining|remainingQuota|dailyLimit/,
            'the client must not keep or predict a local balance');
    });

    test('INV-4: the copilot surface uses semantic Cuba tokens, never arbitrary colours', () => {
        // Sliced from the copilot listbox onward: that is the region DIR-021 added.
        const start = palette.indexOf('data-testid="cuba-copilot-actions"');
        assert.ok(start > -1, 'the copilot surface must exist to be audited');
        const copilotSurface = palette.slice(start);
        const rawColours = copilotSurface.match(/(?:bg|text|border)-\[(?:#|rgb|hsl)/g) || [];
        assert.deepEqual(rawColours, [], 'no arbitrary colour utilities on the copilot surface');
        assert.match(copilotSurface, /text-cuba-ink/, 'the surface must use the AA-proven ink tokens');
        // INV-4 in practice: the whole surface must not fall back to an unlayered
        // literal colour, which is what the design tokens exist to prevent.
        assert.doesNotMatch(copilotSurface, /color:\s*#[0-9a-f]{3,8}/i, 'no inline hex colour on the copilot surface');
    });
});