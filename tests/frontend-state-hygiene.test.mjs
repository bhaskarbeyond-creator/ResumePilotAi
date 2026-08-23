import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname;
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/**
 * Strip comments before scanning for anti-patterns.
 *
 * Several of these files document, in prose, the `alert()` calls that were
 * REMOVED from them. Matching raw text flags that documentation as the defect
 * it describes, which pressures a maintainer to delete the explanation instead
 * of keeping the guarantee. Only executable code is analysed.
 */
function executableCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Also drop string/template literals, which can embed generated markup. */
function codeWithoutLiterals(source) {
  return executableCode(source)
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/**
 * REGRESSION COVERAGE — stale frontend state (§8 of the closure audit).
 *
 * The reported production symptom was "sometimes the view is not correct until
 * I hard reload". Most of that was the CSS cascade defect, but a stale-state
 * audit found a second, independent mechanism that a reload could NOT clear.
 */

/* ── Enterprise tenant/workspace selection ────────────────────────────────── */

test('a rejected tenant selection is not persisted', () => {
  const source = read('src/enterprise/EnterpriseContext.jsx');
  const selectTenant = source.slice(source.indexOf('const selectTenant'), source.indexOf('const selectWorkspace'));

  // Defect: the requested id was written to sessionStorage BEFORE load() ran, so
  // a server rejection left the bad id persisted and every later mount replayed
  // it. The write must now follow a successful load.
  const writeIndex = selectTenant.indexOf('writeStorage(key');
  const awaitIndex = selectTenant.indexOf('await load(');
  assert.ok(awaitIndex > -1, 'selectTenant must await the server');
  assert.ok(writeIndex > awaitIndex, 'the selection must only be persisted after the server accepts it');
  assert.match(selectTenant, /catch[\s\S]*writeStorage\(key, previous\)/, 'a failed selection must roll back to the previous accepted context');
});

test('a rejected workspace selection is not persisted', () => {
  const source = read('src/enterprise/EnterpriseContext.jsx');
  const selectWorkspace = source.slice(source.indexOf('const selectWorkspace'), source.indexOf('const value = useMemo'));
  const writeIndex = selectWorkspace.indexOf('writeStorage(key');
  const awaitIndex = selectWorkspace.indexOf('await load(');
  assert.ok(awaitIndex > -1 && writeIndex > awaitIndex, 'workspace selection must persist only after acceptance');
  assert.match(selectWorkspace, /catch[\s\S]*writeStorage\(key, previous\)/);
});

test('a failed context load clears the persisted request so the next mount recovers', () => {
  const source = read('src/enterprise/EnterpriseContext.jsx');
  const loadCatch = source.slice(source.indexOf('} catch (error) {'), source.indexOf('}, [user?.uid]);'));
  assert.match(
    loadCatch,
    /writeStorage\(tenantStorageKey\(user\.uid\), ''\)/,
    'a rejected context must be cleared, otherwise the console reopens into the same failure forever'
  );
  assert.match(loadCatch, /error,/, 'the error must still be surfaced in context state');
  assert.match(loadCatch, /throw error/, 'callers must still be able to react to the failure');
});

test('the persisted selection is derived from the server response, not the request', () => {
  const source = read('src/enterprise/EnterpriseContext.jsx');
  // Storing `result.tenant.id` rather than the requested `tenantId` means a
  // server-side substitution (e.g. falling back to a default tenant) is what
  // gets remembered.
  assert.match(source, /writeStorage\(key, result\?\.tenant\?\.id \|\| ''\)/);
  assert.match(source, /writeStorage\(key, result\?\.workspace\?\.id \|\| ''\)/);
});

/* ── Route-level component identity ───────────────────────────────────────── */

test('authenticated route components remount when the signed-in user changes', () => {
  const main = read('src/main.jsx');
  // Without a key tied to the uid, React reuses the component instance across a
  // sign-out/sign-in and the previous account's state bleeds into the new
  // session — a stale view that only a hard reload clears.
  const AUTHENTICATED_ROUTES = ['/dashboard/*', '/enterprise/*', '/adm/*', '/portfolio/builder', '/dashboard2/*'];
  for (const routePath of AUTHENTICATED_ROUTES) {
    const marker = `path="${routePath}"`;
    const start = main.indexOf(marker);
    assert.ok(start > -1, `route ${routePath} must exist`);
    // The element spans until the end of this JSX Route element.
    const element = main.slice(start, main.indexOf('/>', start));
    assert.match(
      element,
      /key=\{user\?\.uid \|\| 'unauthenticated'\}/,
      `${routePath} must be keyed on the signed-in uid so state cannot survive an account switch`
    );
  }
});

/* ── Effect-dependency hygiene on the surfaces this audit touched ─────────── */

const AUDITED_COMPONENTS = [
  'src/components/admin/Admin.jsx',
  'src/components/admin/tenants/PlatformTenants.jsx',
  'src/enterprise/EnterpriseContext.jsx',
];

test('audited components clean up their subscriptions and listeners', () => {
  for (const file of AUDITED_COMPONENTS) {
    const source = read(file);
    const listeners = (source.match(/addEventListener\(/g) || []).length;
    const removals = (source.match(/removeEventListener\(/g) || []).length;
    assert.ok(removals >= listeners, `${file} registers ${listeners} listeners but removes only ${removals}`);
  }
});

test('the Admin shell unsubscribes from the Firebase auth listener', () => {
  const admin = read('src/components/admin/Admin.jsx');
  // onAuthStateChanged returns an unsubscribe function; the effect must return
  // it, or every remount stacks another listener that keeps writing state.
  assert.match(
    admin,
    /useEffect\(\(\) => fire\.auth\(\)\.onAuthStateChanged\(/,
    'the auth listener effect must return the unsubscribe handle'
  );
});

test('no audited admin surface swallows an error without any signal', () => {
  for (const file of [...AUDITED_COMPONENTS, 'src/components/admin/settings/subscriptionsSettings.jsx']) {
    const source = read(file);
    // Strip string/template literals only, KEEPING comments: the invoice printer
    // embeds `catch(e){}` inside generated HTML (markup, not an error path),
    // while a `catch { /* deliberately ignored because ... */ }` is an explicit,
    // reviewable decision. What must never appear is a catch with nothing in it
    // at all — no handling and no stated reason.
    const withoutLiterals = source
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
      .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
    const emptyCatches = withoutLiterals.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) || [];
    assert.deepEqual(
      emptyCatches,
      [],
      `${file} contains a catch with neither handling nor a documented reason: ${emptyCatches.join(' ')}`
    );
  }
});

test('no admin or enterprise surface uses a blocking native alert for errors', () => {
  const roots = ['src/components/admin', 'src/enterprise'];
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (/\.jsx?$/.test(entry.name)) {
        const source = codeWithoutLiterals(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
        // `alert(` but not `alertdialog`, `setAlert(`, or `foo.alert(`.
        if (/(?<![A-Za-z.$_])alert\s*\(/.test(source.replace(/alertdialog/g, ''))) offenders.push(relative);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, [], `native alert() blocks the thread and cannot be asserted on: ${offenders.join(', ')}`);
});
