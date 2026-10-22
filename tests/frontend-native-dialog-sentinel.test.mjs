/**
 * Frontend native-dialog sentinel (authoritative shipped frontend).
 *
 * `frontend/` is the frontend whose build is published into the Apache
 * DocumentRoot by scripts/sync-dist.mjs, so it is the app users actually run.
 * It previously used window.alert() and window.confirm() for destructive and
 * error paths: both block the main thread, cannot carry design tokens, are not
 * announced reliably, and cannot express an in-flight/busy state (which allows
 * duplicate destructive submissions).
 *
 * The legacy tree already had tests/dir048-native-dialog-sentinel.test.mjs;
 * this is the equivalent gate for the authoritative frontend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendSrc = path.join(repoRoot, 'frontend', 'src');

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Matches a bare call to a native blocking dialog, not identifiers such as
// onConfirm(, confirmClearSingleKey(, window.confirmable(, or role="alert".
const NATIVE_DIALOG = /(?<![.\w$])(alert|confirm|prompt)\s*\(/g;

test('the shipped frontend contains no native blocking dialogs', () => {
  assert.ok(fs.existsSync(frontendSrc), `expected authoritative frontend at ${frontendSrc}`);
  const offenders = [];
  for (const file of collect(frontendSrc)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Documentation lines are not call sites.
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
      NATIVE_DIALOG.lastIndex = 0;
      let match;
      while ((match = NATIVE_DIALOG.exec(line)) !== null) {
        // `void confirm()` is this codebase's idiom for invoking a LOCAL
        // callback prop named confirm (withdraw-dialog, tracker-delete-dialog,
        // cover-letters). A genuine native dialog is either window-qualified or
        // invoked as a bare statement condition.
        const before = line.slice(Math.max(0, match.index - 6), match.index);
        if (before.endsWith('void ')) continue;
        offenders.push(`${path.relative(repoRoot, file)}:${index + 1}: ${trimmed.slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `native dialogs must be replaced by accessible UI:\n${offenders.join('\n')}`);
});

test('the declared Radix feedback primitives are actually implemented, not dead dependencies', () => {
  // Both packages were declared as production dependencies with zero usages,
  // which is why feedback regressed to window.alert()/window.confirm().
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'frontend', 'package.json'), 'utf8'));
  for (const dep of ['@radix-ui/react-toast', '@radix-ui/react-alert-dialog']) {
    assert.ok(pkg.dependencies?.[dep], `${dep} should remain a declared dependency`);
  }
  const toastPrimitive = path.join(frontendSrc, 'components', 'ui', 'toast.tsx');
  const dialogPrimitive = path.join(frontendSrc, 'components', 'ui', 'alert-dialog.tsx');
  assert.ok(fs.existsSync(toastPrimitive), 'toast primitive must exist');
  assert.ok(fs.existsSync(dialogPrimitive), 'alert-dialog primitive must exist');
  assert.match(fs.readFileSync(toastPrimitive, 'utf8'), /@radix-ui\/react-toast/);
  assert.match(fs.readFileSync(dialogPrimitive, 'utf8'), /@radix-ui\/react-alert-dialog/);

  const entry = fs.readFileSync(path.join(frontendSrc, 'main.tsx'), 'utf8');
  assert.match(entry, /ToastProvider/, 'the toast region must be mounted for the whole app');
});

test('the production dependency audit gate covers the shipped frontend', () => {
  // `audit:production` previously audited only the repo root and backend, so
  // vulnerabilities in the bundle actually served to users were never gated
  // (frontend currently reports moderate advisories through mammoth -> argparse
  // -> sprintf-js).
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts['audit:production'];
  assert.ok(script, 'audit:production must exist');
  assert.match(script, /--prefix frontend/, 'audit:production must include the shipped frontend');
});
