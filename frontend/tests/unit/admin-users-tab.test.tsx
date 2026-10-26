/**
 * The directory must show real identities and report real outcomes.
 *
 * Three historical defects are pinned here:
 *   1. the table was seeded with five sample accounts, so a failed load still looked populated;
 *   2. every mutation ended in `.catch(() => {})`, so a refused suspension still announced success;
 *   3. the password-reset fallback fabricated a reset link and told the operator to send it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { get, patch, post } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedPost = vi.mocked(post);
const mockedPatch = vi.mocked(patch);

const directory = {
  success: true,
  users: [
    {
      id: 'usr_real_1',
      email: 'real.person@example.com',
      displayName: 'Real Person',
      role: 'ADMIN',
      suspended: true,
      identityStatus: 'ACTIVE',
      membership: 'Premium',
      primaryTenant: null,
      lastLoginAt: '2026-10-26T11:30:00.000Z',
      revision: 2,
    },
  ],
};

const details = {
  user360: {
    identity: directory.users[0],
    security: { mfaEnabled: true, emailVerified: true, suspended: true },
    aiEntitlement: { plan: 'Premium', effectiveLimit: 100, usedToday: 12 },
    content: { resumeCount: 1, resumes: [{ id: 'res_1', title: 'Master resume', template: 'zurich' }] },
    tenancy: { memberships: [] },
  },
};

function routeGet(url: string) {
  if (url === '/admin/users') return Promise.resolve(directory);
  if (url.startsWith('/admin/users/') && url.endsWith('/details')) return Promise.resolve(details);
  return Promise.resolve({ tenants: [] });
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
});

describe('AdminUsersTab', () => {
  it('renders only identities the server returned', async () => {
    mockedGet.mockImplementation(routeGet);
    render(<AdminUsersTab />);

    expect(await screen.findByText('Real Person')).toBeInTheDocument();
    expect(screen.getByText('real.person@example.com')).toBeInTheDocument();
    expect(screen.getByText('suspended')).toBeInTheDocument();
    // The sample directory the tab used to ship with must be gone for good.
    expect(screen.queryByText('Alex Rivera')).not.toBeInTheDocument();
    expect(screen.queryByText('alex.rivera@example.com')).not.toBeInTheDocument();
  });

  it('reports a directory outage instead of falling back to sample rows', async () => {
    mockedGet.mockRejectedValue({
      response: {
        status: 503,
        data: { success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'Unable to read the identity directory and application profiles.' },
      },
    });
    render(<AdminUsersTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to read the identity directory');
    expect(alert).toHaveTextContent('USER_DIRECTORY_UNAVAILABLE');
    expect(screen.queryByText('Alex Rivera')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an empty state when the directory is genuinely empty', async () => {
    mockedGet.mockResolvedValue({ success: true, users: [] });
    render(<AdminUsersTab />);
    expect(await screen.findByText('No identities yet')).toBeInTheDocument();
  });

  it('reports a refused password reset as a failure and never claims a link was issued', async () => {
    mockedGet.mockImplementation(routeGet);
    mockedPost.mockRejectedValue({
      response: {
        status: 503,
        data: { success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'The identity provider is unavailable.' },
      },
    });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /user 360/i }));
    const drawer = await screen.findByRole('dialog');
    const resetButton = await within(drawer).findByRole('button', { name: /send password reset email/i });
    await user.click(resetButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The identity provider is unavailable.');
    expect(alert).toHaveTextContent('IDENTITY_DIRECTORY_UNAVAILABLE');
    expect(screen.queryByText(/reset link copied/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sec_rst_/)).not.toBeInTheDocument();
  });

  it('does not offer SUPER_ADMIN in the role picker because the API refuses it', async () => {
    mockedGet.mockImplementation(routeGet);
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /user 360/i }));
    const select = await screen.findByLabelText('Platform role');
    const options = within(select).getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.some((label) => label.startsWith('SUPER_ADMIN'))).toBe(false);
    expect(options.some((label) => label.startsWith('ADMIN'))).toBe(true);
  });

  it('sends a suspension with its reason and reloads the directory on success', async () => {
    mockedGet.mockImplementation(routeGet);
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /user 360/i }));
    const drawer = await screen.findByRole('dialog');
    // The fixture identity is suspended, so the control offered is "Lift suspension".
    await user.click(await within(drawer).findByRole('button', { name: /lift suspension/i }));

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/users/usr_real_1', expect.objectContaining({ suspended: false })),
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/suspension lifted/i);
  });

  it('requires a reason before it will offer to suspend an active account', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users') {
        return Promise.resolve({ ...directory, users: [{ ...directory.users[0], suspended: false }] });
      }
      if (url.endsWith('/details')) {
        // The drawer prefers the details payload; keep the two fixtures consistent or the
        // drawer will correctly show the suspended state the details endpoint reports.
        return Promise.resolve({
          user360: {
            ...details.user360,
            identity: { ...directory.users[0], suspended: false },
            security: { mfaEnabled: true, emailVerified: true, suspended: false },
          },
        });
      }
      return routeGet(url);
    });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /user 360/i }));
    const suspend = await screen.findByRole('button', { name: /suspend account/i });
    expect(suspend).toBeDisabled();

    await user.type(screen.getByLabelText(/suspension reason/i), 'Terms of Service violation');
    expect(suspend).toBeEnabled();
  });
});
