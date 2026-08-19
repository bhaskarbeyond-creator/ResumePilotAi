import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveApplicationShell, isApplicationShellRoute } from '../src/components/AppShell/applicationShell.js';

test('shell decision ignores profile/settings hydration and waits only on authReady', () => {
  assert.deepEqual(resolveApplicationShell({ authReady: false, user: { uid: 'u1' } }), {
    phase: 'wait', mountShell: false, userId: null,
  });
  assert.deepEqual(resolveApplicationShell({ authReady: true, user: null }), {
    phase: 'guest', mountShell: false, userId: null,
  });
  assert.deepEqual(resolveApplicationShell({ authReady: true, user: { uid: 'u1' } }), {
    phase: 'authenticated', mountShell: true, userId: 'u1',
  });
});

test('simulated auth race remounts the shell once the session is known', () => {
  const frames = [
    resolveApplicationShell({ authReady: false, user: null }),
    resolveApplicationShell({ authReady: true, user: null }),
    resolveApplicationShell({ authReady: true, user: { uid: 'restored-user' } }),
  ];
  assert.equal(frames[0].mountShell, false);
  assert.equal(frames[1].mountShell, false);
  assert.equal(frames[2].mountShell, true);
  assert.equal(frames[2].userId, 'restored-user');
});

test('builder paths are application-shell routes; dashboard/settings are not double-wrapped', () => {
  for (const path of ['/build-resume', '/build-resume/heading', '/build-resume/summary', '/create-resume']) {
    assert.equal(isApplicationShellRoute(path), true, path);
  }
  assert.equal(isApplicationShellRoute('/dashboard'), false);
  assert.equal(isApplicationShellRoute('/login'), false);
});

test('router wraps authenticated builder routes in MaybeApplicationShell and does not wait on module flags', () => {
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert.match(main, /MaybeApplicationShell/);
  assert.match(main, /path="\/build-resume\/\*"/);
  assert.match(main, /<MaybeApplicationShell user=\{user\}><BuildResume/);
  assert.match(main, /if \(authLoading \|\| maintenance\.loading\) return <Spinner \/>/);
  const shell = fs.readFileSync('src/components/AppShell/AuthenticatedAppShell.jsx', 'utf8');
  assert.match(shell, /data-testid="application-shell"/);
  assert.match(shell, /ProfileDisplay/);
  assert.match(shell, /dashboardContentWrapper/);
  assert.doesNotMatch(shell, /getSystemSettings|moduleFlags|enableAts/);
  const dashboard = fs.readFileSync('src/components/Dashboard/DashboardMain/DashboardMain.jsx', 'utf8');
  assert.doesNotMatch(dashboard, /return this\.state\.user !== null \?/);
  assert.match(dashboard, /resolvedUser/);
  assert.doesNotMatch(dashboard, /\) : \(\s*' '\s*\)/);
});
