/**
 * Session expiry and sign-out confirmation — the two surfaces a person reaches when a session
 * ends, either because it expired or because they asked to leave.
 *
 * The browser tests (`tests/session-lifecycle.spec.ts`) prove the keyboard contract in a real
 * engine. This file proves the behaviour that a screenshot cannot: that the signal is delivered
 * to every listener, that one broken listener cannot swallow it, that the expiry dialog is
 * dismissible, and that confirming sign-out actually calls the sign-out path.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __clearSessionExpiredListeners, onSessionExpired, reportSessionExpired } from '@/lib/session-events';

/**
 * The dialog ends the session through the auth provider, not through storage: the provider holds
 * the accepted identity in React state, and clearing storage alone leaves `/login` believing the
 * person is signed in. Mocking the hook keeps this a test of the dialog's contract — "call
 * signOut, then navigate" — without booting Firebase in jsdom.
 */
const signOutSpy = vi.fn(async () => {});
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ signOut: signOutSpy }),
}));
import { PREVIEW_SESSION_KEY } from '@/lib/preview-session';
import { SessionExpiredDialog } from '@/components/auth/session-expired-dialog';
import { LogoutConfirmDialog } from '@/components/auth/logout-confirm-dialog';

/** Renders the current location so a navigation assertion can read it as text. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

beforeEach(() => {
  __clearSessionExpiredListeners();
  localStorage.clear();
  signOutSpy.mockClear();
});

afterEach(() => {
  __clearSessionExpiredListeners();
});

describe('session-events', () => {
  it('notifies every subscriber, and stops notifying after unsubscribe', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = onSessionExpired(first);
    onSessionExpired(second);

    reportSessionExpired();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    reportSessionExpired();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('survives a listener that throws, so one bad subscriber cannot hide the dialog', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const healthy = vi.fn();
    onSessionExpired(() => {
      throw new Error('listener exploded');
    });
    onSessionExpired(healthy);

    expect(() => reportSessionExpired('unit')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('listener failed for unit'), expect.any(Error));
  });

  it('is a no-op when nothing is listening', () => {
    expect(() => reportSessionExpired()).not.toThrow();
  });
});

describe('SessionExpiredDialog', () => {
  /** Render the dialog over a route table, with a location probe for the redirect assertion. */
  function renderDialog() {
    return render(
      <MemoryRouter initialEntries={['/dashboard/resumes']}>
        <SessionExpiredDialog />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('stays closed until a session expiry is reported', () => {
    renderDialog();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on a report and can be dismissed without signing the person out', async () => {
    const user = userEvent.setup();
    renderDialog();
    reportSessionExpired();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/your session ended/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stay on this page/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Dismissal must not navigate anywhere: a flapping network is not a sign-out.
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/resumes');
  });

  it('signs in again by ending the session through the provider, then explaining the reason', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify({ token: 'rptest.expired.session' }));
    renderDialog();
    reportSessionExpired();

    await user.click(await screen.findByRole('button', { name: /sign in again/i }));

    // The provider's signOut is what clears both the Firebase user and the stored preview session;
    // calling it is the contract. A dialog that only cleared storage left `/login` redirecting
    // back into the dead screen, which the browser suite caught on its first run.
    await waitFor(() => expect(signOutSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?reason=session_expired'));
  });

});

describe('LogoutConfirmDialog', () => {
  function renderLogout(onConfirm: () => void) {
    return render(
      <MemoryRouter>
        <LogoutConfirmDialog onConfirm={onConfirm}>
          <button type="button">Sign Out</button>
        </LogoutConfirmDialog>
      </MemoryRouter>,
    );
  }

  it('asks before signing out, and cancelling does not call the sign-out path', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderLogout(onConfirm);

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stay signed in/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls the sign-out path exactly once when confirmed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderLogout(onConfirm);

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await user.click(await screen.findByRole('button', { name: /^sign out$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
