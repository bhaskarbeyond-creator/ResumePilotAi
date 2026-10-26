/**
 * Test harness entry for the second-factor panels.
 *
 * Mounts the real components with the props a real screen would pass, and gives the browser test a
 * way to drive the asynchronous branches without Firebase: the enrolment API is injected
 * (`MfaEnrollmentApi`), which is the seam the component already exposes.
 *
 * Query parameters:
 *   ?panel=challenge   the sign-in challenge (default)
 *   ?panel=enroll      the enrolment flow
 *   ?available=0       forces the "no identity provider" branch of the enrolment panel
 *   ?error=1          makes the injected API reject, so the error branch is reachable
 *
 * This file is test infrastructure; `vite build` has a single entry (`index.html`), so nothing here
 * ships.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';
import { MfaChallengePanel } from '@/components/auth/mfa-challenge-panel';
import { MfaEnrollmentPanel, type MfaEnrollmentApi } from '@/components/auth/mfa-enrollment-panel';
import type { MfaEnrollment } from '@/lib/mfa';

const params = new URLSearchParams(window.location.search);

/*
 * Resolve the theme exactly as the app shell does.
 *
 * `ThemeProvider` writes the `.dark` class from the system preference when the theme is "system"
 * (`providers/theme-provider.tsx:36-47`), and the design tokens key off that class. The harness has
 * no provider, so without this the page would render dark-mode *utilities* against light-mode
 * *tokens* — a combination that never occurs in the product, and one that axe correctly reports as
 * a contrast failure. `?theme=light|dark` overrides the system preference for a targeted run.
 */
const themeOverride = params.get('theme');
const wantsDark = themeOverride ? themeOverride === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', wantsDark);
const panel = params.get('panel') ?? 'challenge';
const available = params.get('available') !== '0';
const fail = params.get('error') === '1';

/** A stable secret so the baseline screenshots are not sensitive to randomness. */
const FIXTURE: MfaEnrollment = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/IME365:priya%40ime365.com?secret=JBSWY3DPEHPK3PXP&issuer=IME365',
  pending: { fixture: true },
};

/** The injected API: resolves immediately, or rejects to reach the error branch. */
const api: MfaEnrollmentApi = {
  begin: async () => {
    if (fail) throw new Error('The identity provider refused the enrolment request.');
    return FIXTURE;
  },
  complete: async () => {
    if (fail) throw new Error('That code could not be verified. Check the app and try again.');
  },
};

function ChallengeHarness() {
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  return (
    <div className="space-y-4">
      {verified ? (
        <p role="status" className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">
          Verified. This harness would now navigate.
        </p>
      ) : (
        <MfaChallengePanel
          code={code}
          onCodeChange={setCode}
          onSubmit={() => {
            if (fail) return;
            setVerified(true);
          }}
          onCancel={() => setVerified(false)}
          error={fail && code.length === 6 ? 'That code is not valid. Check your authenticator app and try again.' : null}
        />
      )}
    </div>
  );
}

function App() {
  return panel === 'enroll'
    ? <MfaEnrollmentPanel available={available} accountName="priya@ime365.com" api={api} />
    : <ChallengeHarness />;
}

const root = document.getElementById('root');
if (!root) throw new Error('The harness page lost its mount point.');
createRoot(root).render(<App />);
