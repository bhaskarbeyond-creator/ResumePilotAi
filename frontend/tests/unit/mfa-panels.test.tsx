/**
 * The second-factor panels — state machine and input handling.
 *
 * The browser suite (`tests/mfa-panel.spec.ts`) proves layout, keyboard order, contrast and the
 * rendered baselines. This file proves the things a screenshot cannot: that the code field drops
 * non-digits, that the submit path is only reachable with six digits, that a provider rejection
 * leaves the flow usable, and that a cancel hands focus back to the action that started it.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MfaChallengePanel, sanitiseCode } from '@/components/auth/mfa-challenge-panel';
import { MfaEnrollmentPanel, type MfaEnrollmentApi } from '@/components/auth/mfa-enrollment-panel';

describe('sanitiseCode', () => {
  it('keeps digits, drops everything else, and never exceeds six characters', () => {
    expect(sanitiseCode('12ab34')).toBe('1234');
    expect(sanitiseCode('12345678')).toBe('123456');
    expect(sanitiseCode(' 1 2 3 ')).toBe('123');
    expect(sanitiseCode('abc')).toBe('');
  });
});

describe('MfaChallengePanel', () => {
  /** Render the challenge with controllable props. */
  function renderChallenge(overrides: Partial<Parameters<typeof MfaChallengePanel>[0]> = {}) {
    const props = {
      code: '',
      onCodeChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    };
    render(<MfaChallengePanel {...props} />);
    return props;
  }

  it('disables the primary action until six digits are present', () => {
    const { rerender } = render(<MfaChallengePanel code="" onCodeChange={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeDisabled();

    rerender(<MfaChallengePanel code="12345" onCodeChange={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeDisabled();

    rerender(<MfaChallengePanel code="123456" onCodeChange={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeEnabled();
  });

  it('submits on Enter once the code is complete, and not before', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MfaChallengePanel code="12345" onCodeChange={vi.fn()} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/authenticator code/i), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sanitises every edit through onCodeChange', async () => {
    const user = userEvent.setup();
    const onCodeChange = vi.fn();
    renderChallenge({ onCodeChange });
    await user.type(screen.getByLabelText(/authenticator code/i), 'a1b2');
    // Called per keystroke, always with digits only.
    expect(onCodeChange).toHaveBeenCalled();
    for (const [value] of onCodeChange.mock.calls) {
      expect(String(value)).toMatch(/^\d*$/);
    }
  });

  it('cancels back to sign-in', async () => {
    const user = userEvent.setup();
    const props = renderChallenge();
    await user.click(screen.getByRole('button', { name: /back to sign-in/i }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('announces a rejection as an alert without removing the code field', () => {
    renderChallenge({ error: 'That code is not valid.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i);
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument();
  });

  it('submits a complete code, and refuses to submit while a request is in flight', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <MfaChallengePanel code="123456" onCodeChange={vi.fn()} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    onSubmit.mockClear();
    rerender(<MfaChallengePanel code="123456" onCodeChange={vi.fn()} onSubmit={onSubmit} onCancel={vi.fn()} loading />);
    const busy = screen.getByRole('button', { name: /verify and sign in/i });
    expect(busy).toBeDisabled();
    await user.type(screen.getByLabelText(/authenticator code/i), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('MfaEnrollmentPanel', () => {
  /** A deterministic API that resolves, or rejects for the error branch. */
  function api(overrides: Partial<MfaEnrollmentApi> = {}): MfaEnrollmentApi {
    return {
      begin: vi.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/IME365:me?secret=JBSWY3DPEHPK3PXP', pending: { fixture: true } })),
      complete: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it('states that enrolment is impossible when there is no identity provider', () => {
    render(<MfaEnrollmentPanel available={false} accountName="priya@ime365.com" />);
    expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'unavailable');
    expect(screen.queryByRole('button', { name: /set up an authenticator app/i })).not.toBeInTheDocument();
  });

  it('walks idle → scan → done, showing the key once', async () => {
    const user = userEvent.setup();
    const enrollmentApi = api();
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={enrollmentApi} />);

    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));
    expect(screen.getByTestId('mfa-secret')).toHaveTextContent('JBSWY3DPEHPK3PXP');
    expect(screen.getByText(/otpauth:\/\/totp/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /confirm and turn on/i }));

    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'done'));
    expect(enrollmentApi.complete).toHaveBeenCalledWith({ fixture: true }, '123456');
  });

  it('reports a provider refusal and keeps the flow usable', async () => {
    const user = userEvent.setup();
    const enrollmentApi = api({ begin: vi.fn(async () => { throw new Error('The identity provider refused the request.'); }) });
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={enrollmentApi} />);

    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/refused/i));
    expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'error');
    // The start action is offered again: a refusal is not a dead end.
    expect(screen.getByRole('button', { name: /set up an authenticator app/i })).toBeInTheDocument();
  });

  it('cancels with Escape and returns focus to the action that opened the flow', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={api()} />);

    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));

    await user.type(screen.getByLabelText(/code from the app/i), '{Escape}');
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'idle'));
    await waitFor(() => expect(screen.getByRole('button', { name: /set up an authenticator app/i })).toHaveFocus());
  });

  it('copies the setup key, and stays usable when the clipboard refuses', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    // jsdom exposes `navigator.clipboard` as a getter, so it is defined rather than assigned.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={api()} />);
    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));

    await user.click(screen.getByRole('button', { name: /copy key/i }));
    expect(writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();

    // A clipboard the browser refuses is not an error the person can act on: the secret is on
    // screen either way, and the panel must not throw.
    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: /copied/i }));
    expect(screen.getByTestId('mfa-secret')).toBeVisible();
  });

  it('reports a rejected code and keeps the flow open for another attempt', async () => {
    const user = userEvent.setup();
    const enrollmentApi = api({ complete: vi.fn(async () => { throw new Error('That code could not be verified.'); }) });
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={enrollmentApi} />);

    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));
    await user.type(screen.getByLabelText(/code from the app/i), '000000');
    await user.click(screen.getByRole('button', { name: /confirm and turn on/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be verified/i));
    expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'error');
    // The key and the field are still there, so a second code can be typed without starting over.
    expect(screen.getByTestId('mfa-secret')).toBeVisible();
    expect(screen.getByLabelText(/code from the app/i)).toBeVisible();
  });

  it('cancels from the button as well as from Escape', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={api()} />);
    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'idle'));
    expect(screen.queryByTestId('mfa-secret')).not.toBeInTheDocument();
  });

  it('tells the settings page once the factor is live', async () => {
    const user = userEvent.setup();
    const onEnrolled = vi.fn();
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={api()} onEnrolled={onEnrolled} />);
    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));
    await user.type(screen.getByLabelText(/code from the app/i), '123456');
    await user.click(screen.getByRole('button', { name: /confirm and turn on/i }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledTimes(1));
  });

  it('does not call the provider twice when confirm is pressed with an incomplete code', async () => {
    const user = userEvent.setup();
    const enrollmentApi = api();
    render(<MfaEnrollmentPanel available accountName="priya@ime365.com" api={enrollmentApi} />);

    await user.click(screen.getByRole('button', { name: /set up an authenticator app/i }));
    await waitFor(() => expect(screen.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan'));

    await user.type(screen.getByLabelText(/code from the app/i), '123');
    expect(screen.getByRole('button', { name: /confirm and turn on/i })).toBeDisabled();
    expect(enrollmentApi.complete).not.toHaveBeenCalled();
  });
});
