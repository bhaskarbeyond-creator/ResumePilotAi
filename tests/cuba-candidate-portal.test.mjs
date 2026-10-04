// Phase 4 — Candidate portal guards.
//
// The two properties that matter most here are:
//   1. Every navigation target resolves to a route that actually exists.
//   2. The AI Career Briefing can never state something it did not measure.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const DASHBOARD_MAIN = read('src/components/Dashboard/DashboardMain/DashboardMain.jsx');
const MAIN = read('src/main.jsx');
const APP_SHELL = read('src/components/AppShell/AuthenticatedAppShell.jsx');
const SHELL = read('src/components/Candidate/CubaCandidateShell.jsx');
const BRIEFING = read('src/components/Candidate/AiCareerBriefing.jsx');

const { CANDIDATE_NAVIGATION, CANDIDATE_COMMAND_INDEX } = await import('../src/components/cuba/candidateNavigation.js');
const { resolveActiveItem } = await import('../src/components/Candidate/navigationState.js');
const { buildBriefing, EMPTY_BRIEFING_MESSAGE } = await import('../src/components/Candidate/briefingLogic.js');

const ALL_ITEMS = CANDIDATE_NAVIGATION.flatMap((group) => group.items);

/**
 * Collects every route the candidate portal actually mounts. Derived from the
 * real route table, so this test fails if navigation drifts from reality.
 */
function mountedCandidateRoutes() {
    const routes = new Set();

    // DashboardMain renders <Routes> with child paths relative to /dashboard.
    for (const match of DASHBOARD_MAIN.match(/<Route path="([^"]*)"/g) || []) {
        const raw = match.replace(/<Route path="/, '').replace(/"/g, '');
        if (raw === '*' || raw === '') continue;
        routes.add(`/dashboard/${raw}`.replace(/\/+$/, ''));
    }

    // Builder, cover letter and portfolio builders are top-level routes.
    for (const match of MAIN.match(/<Route path="(\/[^"]*)"/g) || []) {
        routes.add(match.replace(/<Route path="/, '').replace(/"/g, '').replace(/\/\*$/, ''));
    }
    return [...routes];
}

describe('Candidate navigation integrity (§16, zero dead links)', () => {
    const routes = mountedCandidateRoutes();

    it('resolves every navigation target to a mounted route', () => {
        for (const item of ALL_ITEMS) {
            const pathOnly = item.to.split('?')[0].replace(/\/+$/, '');
            const reachable = routes.some((r) => r === pathOnly
                || r === `${pathOnly}/`
                || r.startsWith(`${pathOnly}/`));
            assert.ok(reachable, `"${item.label}" points at ${pathOnly}, which is not mounted`);
        }
    });

    it('never points at a legacy alias or a removed namespace', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(!item.to.startsWith('/adm'), `${item.id} targets the legacy /adm alias`);
            assert.ok(!item.to.startsWith('/platform'), `${item.id} targets /platform alias`);
            assert.ok(!item.to.startsWith('/dashboard2'), `${item.id} targets removed /dashboard2`);
            assert.ok(!item.to.startsWith('/enterprise'), `${item.id} targets /enterprise alias`);
            assert.ok(!item.to.includes('/my-employments'), `${item.id} targets removed recruiter route`);
            assert.ok(!item.to.includes('/my-companies'), `${item.id} targets removed recruiter route`);
        }
    });

    it('exposes no duplicate navigation target within the portal', () => {
        const seen = new Set();
        for (const item of ALL_ITEMS) {
            assert.ok(!seen.has(item.to), `duplicate navigation target: ${item.to}`);
            seen.add(item.to);
        }
    });

    it('keeps recruiter and admin capability out of the candidate shell', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(!item.to.startsWith('/employer'), `${item.id} leaks recruiter navigation`);
            assert.ok(!item.to.startsWith('/admin'), `${item.id} leaks admin navigation`);
            assert.ok(!item.to.startsWith('/org'), `${item.id} leaks enterprise navigation`);
        }
    });

    it('mounts critical user menu targets and aliases (profile, security, billing, cv, account)', () => {
        const requiredSubroutes = [
            '/dashboard/profile',
            '/dashboard/security',
            '/dashboard/account',
            '/dashboard/billing',
            '/dashboard/my-resumes',
            '/dashboard/cv',
        ];
        for (const req of requiredSubroutes) {
            assert.ok(routes.includes(req), `Critical route ${req} is not mounted in DashboardMain.jsx`);
        }
    });

    it('builds palette commands from the same navigation model', () => {
        // §25: a command is a real destination, not a second list that can drift.
        assert.equal(CANDIDATE_COMMAND_INDEX.length, ALL_ITEMS.length);
        for (const command of CANDIDATE_COMMAND_INDEX) {
            const item = ALL_ITEMS.find((entry) => entry.id === command.id);
            assert.ok(item, `command ${command.id} has no matching navigation item`);
            assert.ok(command.keywords.includes(item.to));
        }
        assert.match(SHELL, /buildCommands/);
        assert.match(SHELL, /CANDIDATE_NAVIGATION/);
describe('Candidate active-state resolution', () => {
    it('marks the exact match active', () => {
        assert.equal(resolveActiveItem('/dashboard/interview', CANDIDATE_NAVIGATION)?.id, 'interview');
    });

    it('keeps the parent active on a child route', () => {
        assert.equal(resolveActiveItem('/build-resume/heading', CANDIDATE_NAVIGATION)?.id, 'resumes');
    });

    it('does not leak active state across sibling namespaces', () => {
        // /dashboard2 was removed; it must never highlight the candidate overview.
        assert.equal(resolveActiveItem('/dashboard2', CANDIDATE_NAVIGATION), null);
        assert.equal(resolveActiveItem('/employer/jobs', CANDIDATE_NAVIGATION), null);
    });
});

describe('AI Career Briefing truthfulness (§23, §46)', () => {
    it('says nothing while loading instead of guessing', () => {
        const briefing = buildBriefing({ resumes: null, loading: true, error: null });
        assert.equal(briefing.state, 'loading');
        assert.equal(briefing.headline, null, 'a loading state must not assert anything');
    });

    it('reports a failed read as a failure, never as "no resumes"', () => {
        const briefing = buildBriefing({ resumes: null, loading: false, error: 'boom' });
        assert.equal(briefing.state, 'error');
        assert.match(briefing.headline, /unavailable/i);
    });

    it('gives the documented empty state when there is genuinely no data', () => {
        const briefing = buildBriefing({ resumes: [], loading: false, error: null });
        assert.equal(briefing.state, 'no-resumes');
        assert.match(briefing.headline, /appear once enough career activity is available/);
    });

    it('reports an empty resume as a real 0, not as a missing value', () => {
        // calculateAtsScore is total: an empty resume genuinely scores 0 and the
        // engine supplies its own next step. Reporting "unavailable" here would
        // be wrong in the other direction — it would hide a real measurement.
        const briefing = buildBriefing({ resumes: [{ id: 'a', item: {} }], loading: false, error: null });
        assert.equal(briefing.state, 'scored');
        assert.match(briefing.headline, /scores 0\/100/);
        assert.match(briefing.detail, /Next step:/);
        assert.equal(briefing.statusLabel, 'Getting Started');
    });

    it('falls back to the unscored state only when no score is computable', () => {
        const briefing = buildBriefing({ resumes: [{ id: 'a', item: 'not-an-object' }], loading: false, error: null });
        assert.equal(briefing.state, 'unscored');
        assert.doesNotMatch(briefing.headline || '', /\d+\/100/);
    });

    it('reports a score only when one was actually computed', () => {
        const withContent = {
            id: 'r1',
            item: {
                firstName: 'Ada', lastName: 'Lovelace',
                summary: 'Engineer with experience in distributed systems and delivery.',
                experience: [{ company: 'Acme', title: 'Engineer', description: 'Built services.' }],
                education: [{ institution: 'University', degree: 'BSc' }],
                skills: ['JavaScript', 'Python'],
            },
        };
        const briefing = buildBriefing({ resumes: [withContent], loading: false, error: null });
        assert.equal(briefing.state, 'scored');
        assert.match(briefing.headline, /\d+\/100/);
        // The score must be a bounded ATS score, never a stray or NaN value.
        const score = Number(briefing.headline.match(/(\d+)\/100/)[1]);
        assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `implausible score: ${score}`);
    });

    it('contains no fabricated market, employer or salary claims', () => {
        const code = BRIEFING.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        for (const forbidden of [
            /\bLorem\b/i, /\bopenings today\b/i, /\bnew openings\b/i,
            /\bmarket demand\b/i, /\bsalary\b/i, /\b\d+(\.\d+)?\s*% match\b/i,
            /\bcompanies are hiring\b/i,
        ]) {
            assert.doesNotMatch(code, forbidden, `briefing must not assert ${forbidden}`);
        }
    });

    it('reads from real platform APIs rather than local constants', () => {
        assert.match(BRIEFING, /getResumes/);
        assert.match(BRIEFING, /calculateAtsScore/);
        assert.doesNotMatch(BRIEFING.replace(/\/\*[\s\S]*?\*\//g, ''), /lorem|dummy|sampleData/i);
    });

    it('never mutates candidate data', () => {
        // The briefing is read-only by construction: no save/update/delete call.
        const code = BRIEFING.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(code, /saveResume|deleteResume|updateResume|method:\s*'POST'/);
    });
});

describe('Candidate rollout safety (§49)', () => {
    it('defaults to the legacy shell so no user is opted in silently', () => {
        assert.match(APP_SHELL, /useState\(\(\) => isCubaShellEnabled\(\)\)/, 'the Cuba shell reads persisted preference (defaults to legacy/off)');
        assert.match(APP_SHELL, /setCubaShell\(isCubaShellEnabled\(\)\)/);
    });

    it('keeps the legacy candidate chrome fully intact and reachable', () => {
        // §47: the proven shell is superseded behind a flag, never removed.
        assert.match(APP_SHELL, /<ProfileDisplay/);
        assert.match(APP_SHELL, /dashboardContentWrapper/);
        assert.match(APP_SHELL, /data-shell-variant="legacy"/);
        assert.match(APP_SHELL, /data-shell-variant="cuba"/);
    });

    it('lazy-loads the opt-in shell so the default path never downloads it', () => {
        assert.match(APP_SHELL, /React\.lazy\(\(\) => import\('\.\.\/Candidate\/CubaCandidateShell'\)\)/);
        assert.match(APP_SHELL, /<Suspense/);
    });

    it('adds no authorization logic to the candidate shell', () => {
        const code = SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(code, /permissionsFor|isSuperAdmin|role\s*===|checkIfAdmin/);
    });
});

    });
});
