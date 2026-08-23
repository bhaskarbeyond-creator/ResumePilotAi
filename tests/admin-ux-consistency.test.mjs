/**
 * Admin UI/UX consistency guards.
 *
 * The Enterprise console is the frozen reference implementation. These tests
 * stop Admin from drifting away from it in ways that are easy to reintroduce
 * during ordinary feature work.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = path.join(root, 'src/components/admin');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const adminFiles = walk(adminRoot);

/** Strips comments so a call named in prose is not mistaken for a real one. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('the admin surface contains no native browser dialogs', () => {
  // window.confirm/alert cannot be styled, block the main thread, are
  // suppressible by the browser, and are invisible to the Playwright suite as
  // page content. Enterprise already ships EnterpriseConfirmModal.
  const offenders = [];
  for (const file of adminFiles) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const matches = source.match(/(?:window\s*\.\s*)?\b(?:confirm|alert)\s*\(/g) || [];
    for (const match of matches) {
      // `await confirm({...})` is the shared hook, not the native dialog.
      const index = source.indexOf(match);
      const preceding = source.slice(Math.max(0, index - 12), index);
      if (/await\s*$/.test(preceding)) continue;
      offenders.push(`${path.relative(root, file)}: ${match.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `native dialogs must be replaced with EnterpriseConfirmModal:\n${offenders.join('\n')}`);
});

test('destructive admin confirmations reuse the frozen Enterprise modal', () => {
  const hook = fs.readFileSync(path.join(root, 'src/hooks/useConfirmDialog.jsx'), 'utf8');
  assert.match(hook, /EnterpriseConfirmModal/, 'the shared hook must reuse the Enterprise component');
  assert.match(hook, /from '\.\.\/enterprise\/components\/EnterpriseConfirmModal'/, 'it must import the frozen component, not a copy');

  // Anything that opens a confirmation must go through the shared hook or the
  // Enterprise component directly — never a bespoke second dialog style.
  const consumers = adminFiles.filter(file => {
    const source = fs.readFileSync(file, 'utf8');
    return /useConfirmDialog|EnterpriseConfirmModal/.test(source);
  });
  assert.ok(consumers.length >= 4, `expected several admin modules to use the shared confirmation, found ${consumers.length}`);
});

test('a component that calls confirm() also renders the dialog', () => {
  // Forgetting to mount `confirmationDialog` yields a promise that never
  // resolves, so the action silently does nothing.
  const broken = [];
  for (const file of adminFiles) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('useConfirmDialog')) continue;
    if (!source.includes('confirmationDialog')) {
      broken.push(path.relative(root, file));
      continue;
    }
    // Must be rendered, not merely destructured.
    const rendered = /\{\s*confirmationDialog\s*\}/.test(source);
    if (!rendered) broken.push(`${path.relative(root, file)} (destructured but never rendered)`);
  }
  assert.deepEqual(broken, [], `these components request confirmation but never render the dialog:\n${broken.join('\n')}`);
});

test('no admin settings field defaults to a credential-shaped literal', () => {
  // A credential-shaped default is written into live configuration on save if
  // the operator never edits the field.
  const offenders = [];
  const credentialFields = /\b(\w*(?:KeySecret|SecretKey|ClientSecret|ApiKey|AccessToken|Password|PrivateKey))\s*:\s*'([^']{12,})'/g;

  for (const file of adminFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(credentialFields)) {
      const [, field, value] = match;
      // Obvious human-readable guidance is not a credential.
      if (/^(?:enter|paste|your|e\.g\.|example|placeholder|https?:)/i.test(value)) continue;
      if (/\s/.test(value)) continue;
      offenders.push(`${path.relative(root, file)}: ${field} = '${value.slice(0, 8)}…'`);
    }
  }
  assert.deepEqual(offenders, [], `credential fields must default to empty:\n${offenders.join('\n')}`);
});

test('admin data mutations do not swallow their failures', () => {
  // An empty catch around a mutation hides a failed write, so the UI reports
  // nothing at all — the "API fails but UI silently does nothing" defect class.
  //
  // Deliberately narrow: an empty catch is legitimate around best-effort,
  // non-mutating browser calls (localStorage preferences, window.focus). What
  // must never be silent is a call that changes server state. So this looks
  // only at catches whose *try* block performs a mutation.
  const MUTATION = /\b(?:await\s+\w*(?:save|update|delete|remove|create|assign|provision|publish|reset|retry|replay|suspend|activate|decommission)\w*\s*\(|fetch\s*\([^)]*\)\s*,?\s*\{[^}]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE))/i;

  const offenders = [];
  for (const file of adminFiles) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    // Find each empty catch and inspect the try block immediately before it.
    for (const match of source.matchAll(/try\s*\{([\s\S]*?)\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*\}/g)) {
      const tryBody = match[1];
      if (MUTATION.test(tryBody)) {
        offenders.push(`${path.relative(root, file)}: mutation in a silently swallowed try/catch`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these admin mutations fail silently:\n${offenders.join('\n')}`);
});

/**
 * No dead buttons in the Admin console.
 *
 * A <button> that carries no onClick, is not a form submit, and is not inside
 * generated print/preview markup is a control that silently does nothing when
 * an operator clicks it. Two of these existed (a "Reset" in social settings and
 * a "Take Action" in the email preview) and both misled the operator.
 *
 * Legitimate exemptions, each narrow and justified:
 *  - buttons with type="submit" (the enclosing <form onSubmit> wires them)
 *  - string-templated HTML for a print window, which uses lowercase onclick
 */
test('every admin button is wired to a handler or submits a form', () => {
  const offenders = [];

  for (const file of walk(adminRoot)) {
    const source = fs.readFileSync(file, 'utf8');

    for (const match of source.matchAll(/<button\b([^>]*)>/gs)) {
      const attributes = match[1];

      // React handler, or a submit button driven by its form.
      if (/onClick/.test(attributes)) continue;
      if (/type=["']submit["']/.test(attributes)) continue;

      // Buttons written into a generated document (print/invoice windows) use
      // the lowercase DOM attribute and run in that document, not in React.
      if (/onclick=/.test(attributes)) continue;

      // A JSX button with no explicit type inside a <form> defaults to submit.
      const before = source.slice(0, match.index);
      const openForms = (before.match(/<form\b/g) || []).length;
      const closedForms = (before.match(/<\/form>/g) || []).length;
      if (openForms > closedForms && !/type=/.test(attributes)) continue;

      const line = before.split('\n').length;
      offenders.push(`${path.relative(root, file)}:${line}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Dead admin buttons — clicking these does nothing:\n  ${offenders.join('\n  ')}`,
  );
});
