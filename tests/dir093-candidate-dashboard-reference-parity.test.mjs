import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-093 — Candidate Workspace (/dashboard) reference parity, Part A.
 *
 * These assertions cover the areas that ACTUALLY LANDED and nothing else. Areas 3 (the workspace
 * toolbar taxonomy) and 4 (the resume-card badges) are NOT delivered, and no assertion here
 * pretends otherwise — that is recorded in the submitted evidence instead.
 */

const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
const HUD = 'src/components/Candidate/CopilotHeroHud.jsx';
const CARDS = 'src/components/Candidate/CubaMetricCardRow.jsx';
const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';
const SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const HOMEPAGE = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';

const read = (p) => fs.readFile(p, 'utf8');

test('DIR-093 AC1: the welcome header renders the real greeting, subtext, quote and three CTAs', async () => {
    const hud = await read(HUD);

    // The greeting is the page's single h1, built from the REAL first name and the local clock.
    // DIR-092 supersedes the DIR-093 truncate pin: the greeting must render in FULL, so the h1
    // no longer clips and the `truncate` utility was deliberately removed. The assertion follows
    // the surface instead of pinning the retired clipping class.
    assert.match(hud, /<h1 className="text-base font-bold/);
    assert.match(hud, /data-testid="cuba-welcome-greeting"/);
    assert.match(hud, /const greetingFor = \(date = new Date\(\)\) => \{/);
    assert.match(hud, /const firstName = String\(displayName \|\| 'Candidate'\)/);

    // The reference subtext and quote.
    assert.match(hud, /Take the next step towards your dream career\. Your candidate workspace at a glance\./);
    assert.match(hud, /Better resumes\. Brighter opportunities\./);

    // The three reference CTAs, in the reference order.
    assert.match(hud, /label: 'Create Resume'/);
    assert.match(hud, /label: 'Explore Jobs'/);
    assert.match(hud, /label: 'Mock Interview'/);

    // DIR-092b supersedes the DIR-093 chevron-menu pin: on user request the primary Create Resume
    // CTA is now a SINGLE button, so the toggle + CREATE_MENU were removed. Its real route stays,
    // and no dropdown affordance may survive.
    assert.match(hud, /to: '\/build-resume\/heading\?new=1'/);
    assert.doesNotMatch(hud, /cuba-copilot-create-toggle/);
    assert.doesNotMatch(hud, /CREATE_MENU/);
    assert.doesNotMatch(hud, /aria-haspopup="menu"/);
});

test('DIR-093 AC1b: the DIR-085/086/091 HUD contract is PRESERVED, not replaced', async () => {
    const [hud, hero] = await Promise.all([read(HUD), read(HERO)]);

    // Every certified hook survives the restyle.
    assert.match(hud, /data-testid="cuba-copilot-hud"/);
    assert.match(hud, /aria-label="AI Copilot"/);
    assert.match(hud, /data-testid="cuba-copilot-insight"/);
    assert.match(hud, /data-testid=\{`cuba-copilot-cta-\$\{id\}`\}/);
    assert.match(hud, /cuba-focusable/);

    // Exactly one h1 on the Overview, and it now lives in the HUD's visible greeting.
    assert.doesNotMatch(hero, /<h1/);
    assert.match(hero, /<CopilotHeroHud insight=\{insight\} onNavigate=\{onNavigate\} displayName=\{displayName\} \/>/);
});

test('DIR-093 AC2: the metric cards carry the reference affordances and a REAL trend guard', async () => {
    const cards = await read(CARDS);

    // The trailing chevron and the per-card destination.
    assert.match(cards, /FiChevronRight/);
    assert.match(cards, /onOpen=\{\(\) => go\('\/build-resume'\)\}/);
    assert.match(cards, /onOpen=\{\(\) => go\('\/dashboard\/applied-jobs'\)\}/);
    assert.match(cards, /onOpen=\{\(\) => go\('\/dashboard\/interview'\)\}/);

    // The reference's "Target 80%+" and "Start a session" lines.
    assert.match(cards, /'Target 80%\+'/);
    assert.match(cards, /caption="Start a session"/);

    // A trend chip renders ONLY for a finite, positive, REAL delta - never a fabricated 0.
    assert.match(cards, /const TrendChip = \(\{ delta, unit \}\) => \{/);
    assert.match(cards, /if \(typeof delta !== 'number' \|\| !Number\.isFinite\(delta\) \|\| delta <= 0\) return null;/);

    // The DIR-091 honesty contract is untouched: an unresolved read is a dash, not a zero.
    assert.match(cards, /count === null \? '--' : String\(count\)/);
    assert.match(cards, /applications === null \? '--' : String\(applications\)/);

    // No raw palette utilities crept in with the new markup.
    assert.doesNotMatch(cards, /#[0-9a-fA-F]{3,6}/, 'no hardcoded hex colours');
    assert.doesNotMatch(cards, /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|green|blue|amber|yellow|indigo|purple|pink)-\d{2,3}\b/);
});

test('DIR-093 AC2b: the trend delta is MEASURED from real timestamps, never estimated', async () => {
    const hero = await read(HERO);

    // The window is real: 30 days against the resumes' OWN timestamps.
    assert.match(hero, /const windowMs = 30 \* 24 \* 60 \* 60 \* 1000;/);
    assert.match(hero, /toEpochMs\(/);
    // No usable timestamps at all means NO chip, not a zero.
    assert.match(hero, /return dated === 0 \? null : \{ resumes: recent \};/);
    assert.match(hero, /trends=\{loading \? null : trends\}/);
});

test('DIR-093 AC3: the rail is the reference AI Career Assistant, over real reads', async () => {
    const [rail, shell] = await Promise.all([read(RAIL), read(SHELL)]);

    // The certified wrapper/card testids survive.
    assert.match(rail, /className="space-y-2\.5" data-testid="cuba-executive-rail"/);
    assert.match(rail, /testId="cuba-rail-copilot"/);

    // The reference surface.
    assert.match(rail, /title="AI Career Assistant"/);
    assert.match(rail, /Your Career Co-pilot/);
    assert.match(rail, /Get personalised insights, improve your resume, and prepare for interviews\./);
    assert.match(rail, /\bLive\b/);
    for (const tabId of ['suggestions', 'insights', 'match']) {
        assert.ok(rail.includes(`id: '${tabId}'`), `the rail must expose the ${tabId} tab`);
    }
    assert.match(rail, /role="tablist"/);
    assert.match(rail, /placeholder="Ask me anything about your career\.\.\."/);
    assert.match(rail, /data-testid="cuba-rail-prompt-send"/);
    for (const chip of ['Improve my resume', 'Find jobs for me', 'Interview tips']) {
        assert.ok(rail.includes(`'${chip}'`), `the rail must expose the "${chip}" chip`);
    }
    assert.match(rail, /title="Today's Insights"/);

    // The prompt really runs the shell's authenticated dispatcher - no second AI path.
    assert.match(rail, /await onAsk\(\{ operation: 'generate-summary', prompt: value \}\);/);
    assert.match(shell, /const handleAsk = useCallback\(/);
    assert.match(shell, /copilotDispatch\(operation, \{ prompt: askPrompt \}\)/);

    // Today's Insights is derived, and an unknown value OMITS the row instead of inventing it.
    assert.match(rail, /if \(resumeState\.resumes === null\) return rows;/);
    assert.match(rail, /const insights = useMemo\(\(\) => \{/);
    // The retired duplicate widgets stay retired.
    assert.doesNotMatch(rail, /<WidgetCard title="ATS Keyword Strength"/);
    assert.doesNotMatch(rail, /<WidgetCard title="Application Milestones"/);
});

test('DIR-093 AC4: the fabricated resume date is gone and formatSafeDate owns the parse', async () => {
    const homepage = await read(HOMEPAGE);

    assert.match(homepage, /import \{ isPaidMembershipTier, formatSafeDate \} from "\.\.\/\.\.\/\.\.\/utils\/subscriptionUtils";/);
    assert.match(homepage, /data-testid="cuba-resume-updated"/);
    assert.match(homepage, /formatSafeDate\(\s*document\.item\?\.updated_at \|\| document\.item\?\.created_at,/);
    // The reference wording, and an explicit placeholder when the date is genuinely unknown.
    assert.match(homepage, /t\("DashboardHomepage\.card\.updated", "Updated"\)/);
    assert.match(homepage, /t\("DashboardHomepage\.card\.dateUnavailable", "Date unavailable"\)/);
    // THE DEFECT: no `Date.now()` fallback can render today as if it were the document's date.
    assert.doesNotMatch(homepage, /created_at\?\.seconds \* 1000 \|\| Date\.now\(\)/);
});

test('DIR-093 AC5: no charting dependency was added and the suite is registered', async () => {
    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir093'], 'test:dir093 must be registered');

    for (const banned of ['recharts', 'chart.js', 'd3', 'visx', 'apexcharts', 'victory']) {
        assert.ok(!pkg.dependencies?.[banned], `${banned} must not be a runtime dependency`);
        assert.ok(!pkg.devDependencies?.[banned], `${banned} must not be a dev dependency`);
    }
});

