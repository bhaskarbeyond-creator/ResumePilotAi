import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-056 — forensic-audit remediation suite.
 *
 * One test per IMPLEMENTED sub-directive. SUB-056-4/5/6 are multi-day items
 * (L/M effort) and are intentionally NOT covered here yet; this file pins what
 * was actually changed so a silent revert fails loudly.
 */

const DASH = 'src/components/Dashboard/DashboardMain/DashboardMain.jsx';
const EMPLOYER_FORM = 'src/components/JobsListings/EmployerApplicationForm.jsx';

/** Strip comments so assertions test CODE, not prose that names the defect. */
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* ── SUB-056-1 (P0): one authoritative dashboard route table ──────────────── */
test('SUB-056-1: the dashboard declares exactly ONE <Routes> block', async () => {
  const src = await fs.readFile(DASH, 'utf8');
  const blocks = (src.match(/^\s*<Routes>\s*$/gm) || []).length;
  assert.equal(blocks, 1, `expected 1 <Routes> block, found ${blocks}`);
});

test('SUB-056-1: the route table is no longer duplicated (28 paths, not 56)', async () => {
  const src = await fs.readFile(DASH, 'utf8');
  const decls = (src.match(/<Route path="/g) || []).length;
  const distinct = new Set((src.match(/<Route path="([^"]+)"/g) || []).map((m) => m));
  assert.equal(decls, 28, `expected 28 <Route path> declarations, found ${decls}`);
  assert.equal(distinct.size, 28, `expected 28 DISTINCT paths, found ${distinct.size}`);
});

test('SUB-056-1: renderRoutes is defined once and consumed by both shells', async () => {
  const src = await fs.readFile(DASH, 'utf8');
  const defs = (src.match(/^\s{4}renderRoutes\(\)\s*\{/gm) || []).length;
  const calls = (src.match(/\{this\.renderRoutes\(\)\}/g) || []).length;
  assert.equal(defs, 1, 'renderRoutes must be defined exactly once');
  assert.equal(calls, 2, 'both the Cuba branch and the legacy branch must call it');
});

test('SUB-056-1: every path the DIR-055 resolver maps is still declared here', async () => {
  const [dash, mod] = await Promise.all([
    fs.readFile(DASH, 'utf8'),
    import('../src/components/cuba/resolveNotificationHref.js'),
  ]);
  for (const href of Object.values(mod.NOTIFICATION_ROUTE_BY_TYPE)) {
    if (!href.startsWith('/dashboard/')) continue;
    const sub = href.slice('/dashboard/'.length);
    assert.ok(dash.includes(`<Route path="${sub}"`), `${href} must still be declared`);
  }
});

/* ── SUB-056-2 (P1): no dead anchors ─────────────────────────────────────── */
test('SUB-056-2: no dead href="#" survives anywhere in src/', async () => {
  const root = 'src';
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.(jsx|js)$/.test(entry.name)) continue;
      const code = stripComments(await fs.readFile(full, 'utf8'));
      if (/href="#"/.test(code)) offenders.push(full);
    }
  };
  await walk(root);
  assert.deepEqual(offenders, [], `dead href="#" found in: ${offenders.join(', ')}`);
});

test('SUB-056-2: the employer consent gate links to the REAL terms/privacy routes', async () => {
  const src = await fs.readFile(EMPLOYER_FORM, 'utf8');
  assert.match(src, /href="\/terms"[^>]*target="_blank"/, 'Terms must link to /terms in a new tab');
  assert.match(src, /href="\/privacy"[^>]*target="_blank"/, 'Privacy must link to /privacy in a new tab');
  assert.match(src, /rel="noopener noreferrer"/, 'new-tab links must carry rel="noopener noreferrer"');
});

/* ── SUB-056-3 (P1): the stale "coming soon" gate is gone ────────────────── */
test('SUB-056-3: the dead cover-letter "coming soon" machinery is removed', async () => {
  const code = stripComments(await fs.readFile(DASH, 'utf8'));
  assert.doesNotMatch(code, /isCommingSoonShowed/, 'the unused state key must be gone');
  assert.doesNotMatch(code, /handleCoverLetter\s*\(\)/, 'the unreachable handler must be gone');
  // ...but the REAL cover-letter surface must still be routed.
  assert.match(code, /<Route path="cover-letters"/);
});

/* ── SUB-056-6 (P2): Applied Jobs must consume the CANONICAL status enum ──── */
const JOB_TRACKER = 'src/utils/jobTracker.js';
const APPLIED_JOBS = 'src/components/AppliedJobs/AppliedJobs.jsx';

const canonicalStatuses = async () => {
  const src = await fs.readFile(JOB_TRACKER, 'utf8');
  const m = src.match(/JOB_TRACKER_STATUSES = Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(m, 'JOB_TRACKER_STATUSES must be a frozen array literal');
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

test('SUB-056-6: the canonical job-tracker enum is a single, frozen vocabulary', async () => {
  assert.deepEqual(await canonicalStatuses(), ['wishlist', 'applied', 'interview', 'offer', 'rejected']);
});

test('SUB-056-6: AppliedJobs presents EVERY canonical status (no silent fall-through)', async () => {
  const applied = await fs.readFile(APPLIED_JOBS, 'utf8');
  for (const status of await canonicalStatuses()) {
    assert.match(
      applied,
      new RegExp(`\\b${status}:\\s*\\{`),
      `AppliedJobs must present the canonical status "${status}" — before this fix "applied" and "offer" fell through to default`,
    );
  }
});

test('SUB-056-6: the retired divergent vocabulary is gone', async () => {
  const code = stripComments(await fs.readFile(APPLIED_JOBS, 'utf8'));
  for (const dead of ['pending', 'accepted']) {
    assert.doesNotMatch(code, new RegExp(`case '${dead}'`), `the tracker never emits "${dead}" — that case must be gone`);
  }
  assert.doesNotMatch(code, /switch \(status\)/, 'three divergent switches must collapse into one canonical map');
});

/* ── SUB-056-5 (P2): ONE print contract, carried across the boundary ──────── */
const PRINT_CSS = 'src/styles/cuba-print.css';
const PRINT_HELPER = 'src/utils/printSurface.js';
const PIPELINE = 'src/components/EmployerPortal/EmployerApplicantPipeline.jsx';
const MAIN = 'src/main.jsx';

test('SUB-056-5: the print contract exists and covers the three named defects', async () => {
  const css = await fs.readFile(PRINT_CSS, 'utf8');
  // (1) multi-page whitespace sprawl
  assert.match(css, /@page\s*\{/, 'the contract must declare a page box');
  assert.match(css, /page-break-inside:\s*avoid/, 'page-break control is required');
  assert.match(css, /position:\s*static\s*!important/, 'sticky/fixed positioning causes repeated or blank pages');
  // (2) unconstrained avatars / photos
  assert.match(css, /max-height:\s*42mm\s*!important/, 'images must be height-bounded');
  assert.match(css, /\[class\*="avatar"\]/, 'avatars need a fixed physical box');
  assert.match(css, /object-fit:\s*cover\s*!important/);
  // (3) chrome must never reach paper
  assert.match(css, /\.no-print/, 'interactive chrome needs an exclusion hook');
  assert.match(css, /button/, 'buttons must be hidden when printing');
});

/** Strip CSS comments so assertions test RULES, not prose that names the rule. */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('SUB-056-5: the contract NEVER touches the FROZEN cv-templates', async () => {
  const rules = stripCssComments(await fs.readFile(PRINT_CSS, 'utf8'));
  assert.doesNotMatch(rules, /cv-templates/, 'the print contract must not reach into the frozen templates');
  assert.doesNotMatch(rules, /@import/, 'the contract must be self-contained');
});

test('SUB-056-5: the helper carries BOTH the live stylesheets and the contract', async () => {
  const src = await fs.readFile(PRINT_HELPER, 'utf8');
  // The live document's own CSS must come across, or the subtree loses its styling.
  assert.match(src, /querySelectorAll\('style'\)/, 'inline <style> blocks must be carried');
  assert.match(src, /querySelectorAll\('link\[rel="stylesheet"\]'\)/, '<link> stylesheets must be carried');
  // ...and the contract must be inlined, not referenced by URL (a Blob has no origin).
  assert.match(src, /import printContract from '\.\.\/styles\/cuba-print\.css\?raw'/, 'the contract must be inlined via ?raw');
  assert.match(src, /buildPrintableDocument/);
  // Untrusted applicant names must be escaped, not interpolated raw.
  assert.match(src, /export function escapeHtml/);
  assert.match(src, /escapeHtml\(title \|\| 'Document'\)/);
});

/* ── Bridge integrity: no silent directive-record loss ────────────────────── */
/**
 * DIR-057/058/059 were observed DELETED from .bridge/directives while still in a
 * non-terminal `ISSUED` state. No source path in the bridge or this repo deletes
 * directive records, so the cause could not be reproduced — but a directive
 * vanishing must never again go unnoticed. Every directive the ledger references
 * must still have its definition file on disk.
 */
test('bridge integrity: every directive in the ledger still has its record on disk', async () => {
  const ledger = await fs.readFile('.bridge/ledger.jsonl', 'utf8');
  const lines = ledger.split('\n').filter(Boolean);

  // The bridge self-test suite writes SYNTHETIC directives (DIR-041..045:
  // "SelfTest Directive", "Gate Test", "Bidi Test", "Wake Test", "Pause Test")
  // into the ledger and deliberately cleans up their files. They are fixtures,
  // not records, so they are excluded — otherwise this guard would cry wolf.
  const FIXTURE_TITLE = /(SelfTest Directive|Gate Test|Bidi Test|Wake Test|Pause Test|Fixture)/i;
  const fixtures = new Set();
  for (const line of lines) {
    if (!/DIRECTIVE_ISSUED/.test(line)) continue;
    const title = (line.match(/"title":"([^"]*)"/) || [])[1] || '';
    if (!FIXTURE_TITLE.test(title)) continue;
    for (const id of title.match(/DIR-\d{3}/g) || []) fixtures.add(id);
  }

  const referenced = new Set((ledger.match(/DIR-\d{3}/g) || []).filter((id) => !fixtures.has(id)));
  assert.ok(referenced.size > 0, 'the ledger must reference real directives');

  const present = new Set(
    (await fs.readdir('.bridge/directives'))
      .filter((f) => /^DIR-\d{3}\.json$/.test(f))
      .map((f) => f.replace('.json', '')),
  );

  const missing = [...referenced].filter((id) => !present.has(id)).sort();
  assert.deepEqual(
    missing,
    [],
    `directive record(s) referenced by the ledger are MISSING from .bridge/directives: ${missing.join(', ')}`,
  );
});

test('bridge integrity: no directive record is left as an empty stub', async () => {
  const files = (await fs.readdir('.bridge/directives')).filter((f) => /^DIR-\d{3}\.json$/.test(f));
  for (const f of files) {
    const raw = await fs.readFile(path.join('.bridge/directives', f), 'utf8');
    const rec = JSON.parse(raw);
    assert.ok(rec.id, `${f} must carry an id`);
    assert.ok(rec.status, `${f} must carry a status — an emptied record is data loss`);
    assert.ok(String(raw).length > 40, `${f} looks truncated`);
  }
});

test('SUB-056-5 / DIR-067: the print path uses the styled builder and the download is a real export', async () => {
  const src = await fs.readFile(PIPELINE, 'utf8');
  const uses = (src.match(/buildPrintableDocument\(/g) || []).length;
  // DIR-067: the recruiter DOWNLOAD no longer builds a `.html` blob — it exports a
  // real PDF/DOCX through the centralized client. Only the PRINT path keeps the
  // styled builder.
  assert.equal(uses, 1, `expected ONLY the print path to use the styled builder, found ${uses}`);
  assert.match(src, /downloadResumePdf/, 'the download must be a real PDF export');
  assert.match(src, /downloadResumeDocx/, 'the download must be a real DOCX export');
  assert.doesNotMatch(src, /resume\.html/, 'the raw .html download must be gone');
  // The old bare-document writes must be gone.
  assert.doesNotMatch(src, /frameDoc\.write\(`<!DOCTYPE html><html><head><title>/, 'the unstyled iframe write must be gone');
  assert.doesNotMatch(src, /new Blob\(\[`<!DOCTYPE html>/, 'the unstyled download blob must be gone');
});

test('SUB-056-5: the contract is ALSO loaded globally so Ctrl+P is styled', async () => {
  const src = await fs.readFile(MAIN, 'utf8');
  assert.match(src, /import '\.\/styles\/cuba-print\.css'/, 'the contract must be imported as a real stylesheet too');
});
