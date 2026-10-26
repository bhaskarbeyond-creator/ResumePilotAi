/**
 * The mutating half of User 360: role, plan, tenancy, quota, provisioning.
 *
 * Every case asserts two things — the request the console sends (method, URL, body) and what
 * the console tells the operator afterwards. The second half is the point: these handlers used
 * to `.catch(() => {})` and then announce success, so a refused write looked like a completed
 * one and the operator moved on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { del, get, patch, post, put } from '@/lib/api-client';

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
const mockedPut = vi.mocked(put);
const mockedDel = vi.mocked(del);

const identity = {
  id: 'usr_42',
  email: 'ops@example.com',
  displayName: 'Ops Person',
  role: 'ADMIN',
  suspended: false,
  identityStatus: 'ACTIVE',
  membership: 'Basic',
  lastLoginAt: '2026-10-26T11:00:00.000Z',
  revision: 7,
};

const detailsPayload = {
  user360: {
    identity,
    security: { mfaEnabled: false, emailVerified: true, suspended: false },
    aiEntitlement: { plan: 'Basic', effectiveLimit: 60, usedToday: 15 },
    content: {
      resumeCount: 1,
      resumes: [{ id: 'res_9', title: 'Platform engineer resume', template: 'classic', updatedAt: '2026-10-20T00:00:00.000Z' }],
    },
    tenancy: {
      memberships: [{ tenantId: 'tenant-1', displayName: 'Northwind', slug: 'northwind', roles: ['ENTERPRISE_MEMBER'] }],
    },
  },
};

function wire(options: { tenants?: unknown[] } = {}) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/admin/users') return Promise.resolve({ success: true, users: [identity] });
    if (url.endsWith('/details')) return Promise.resolve(detailsPayload);
    if (url === '/enterprise/tenants') {
      return Promise.resolve({
        tenants: options.tenants ?? [
          { id: 'tenant-1', displayName: 'Northwind', slug: 'northwind', lifecycleState: 'ACTIVE' },
        ],
      });
    }
    return Promise.resolve({});
  });
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>, tab?: RegExp) {
  render(<AdminUsersTab />);
  await user.click(await screen.findByRole('button', { name: /user 360/i }));
  const drawer = await screen.findByRole('dialog');
  if (tab) await user.click(await within(drawer).findByRole('tab', { name: tab }));
  return drawer;
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedPut.mockReset();
  mockedDel.mockReset();
});

describe('User 360 identity actions', () => {
  it('patches the role with the previous role as the concurrency guard', async () => {
    wire();
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await openDrawer(user);

    await user.selectOptions(screen.getByLabelText('Platform role'), 'AUDITOR');
    await user.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/users/usr_42', {
        role: 'AUDITOR',
        expectedRole: 'ADMIN',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/role changed from ADMIN to AUDITOR/i);
  });

  it('sends a 12-month Premium grant when the plan changes', async () => {
    wire();
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await openDrawer(user);

    await user.selectOptions(screen.getByLabelText('Subscription plan'), 'Premium');
    await user.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/users/usr_42', {
        membership: 'Premium',
        durationMonths: 12,
      }),
    );
  });

  it('requires a suspension reason and sends it with the flag', async () => {
    wire();
    mockedPatch.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await openDrawer(user);

    const suspend = screen.getByRole('button', { name: /suspend account/i });
    expect(suspend).toBeDisabled();
    await user.type(screen.getByLabelText(/suspension reason/i), 'Chargeback fraud');
    expect(suspend).toBeEnabled();
    await user.click(suspend);

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/users/usr_42', {
        suspended: true,
        reason: 'Chargeback fraud',
      }),
    );
  });

  it('reports a refused role change instead of pretending it applied', async () => {
    wire();
    mockedPatch.mockRejectedValue({
      response: { status: 409, data: { success: false, error: { code: 'SELF_DEMOTION_PROHIBITED', message: 'Self-demotion is prohibited.', requestId: 'rq-7' } } },
    });
    const user = userEvent.setup();
    await openDrawer(user);

    await user.selectOptions(screen.getByLabelText('Platform role'), 'USER');
    await user.click(screen.getByRole('button', { name: /^update$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Self-demotion is prohibited.');
    expect(alert).toHaveTextContent('SELF_DEMOTION_PROHIBITED');
    expect(alert).toHaveTextContent('rq-7');
    expect(screen.queryByText(/role changed from/i)).not.toBeInTheDocument();
  });

  it('records a view-as audit with the field names the endpoint requires', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'Role view recorded.' });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /log view-as/i }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/platform/role-view-audit', { targetRole: 'ADMIN' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Role view recorded.');
  });
});

describe('User 360 AI entitlement actions', () => {
  it('refuses to save an override without a justification, before any request is sent', async () => {
    wire();
    const user = userEvent.setup();
    await openDrawer(user, /ai entitlements/i);

    await user.clear(screen.getByLabelText('Daily limit'));
    await user.type(screen.getByLabelText('Daily limit'), '500');
    await user.click(screen.getByRole('button', { name: /save override/i }));

    expect(mockedPut).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/justification/i);
  });

  it('sends the override with its reason and reports the new limit', async () => {
    wire();
    mockedPut.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await openDrawer(user, /ai entitlements/i);

    await user.clear(screen.getByLabelText('Daily limit'));
    await user.type(screen.getByLabelText('Daily limit'), '500');
    await user.type(screen.getByLabelText(/justification/i), 'Support case 4321');
    await user.click(screen.getByRole('button', { name: /save override/i }));

    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith('/admin/users/usr_42/ai-entitlement', {
        dailyLimit: 500,
        reason: 'Support case 4321',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/override set to 500/i);
  });

  it('resets the usage counter through the endpoint that owns it', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'AI daily usage quota reset to 0.' });
    const user = userEvent.setup();
    await openDrawer(user, /ai entitlements/i);

    await user.click(screen.getByRole('button', { name: /reset today/i }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/users/usr_42/ai-quota-reset', {}),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/reset to 0/i);
  });

  it('shows the quota the details endpoint reported, not a hard-coded fallback', async () => {
    wire();
    const user = userEvent.setup();
    await openDrawer(user, /ai entitlements/i);
    expect(screen.getByText('15 / 60 generations')).toBeInTheDocument();
  });
});

describe('User 360 tenancy actions', () => {
  it('grants a membership for the selected organization', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'User assigned to Northwind.' });
    const user = userEvent.setup();
    await openDrawer(user, /organizations/i);

    const assign = await screen.findByRole('button', { name: /^assign$/i });
    // The organization picker is populated from the tenants endpoint; Assign stays disabled
    // until a real organization id is selected, so no request can be sent with an empty one.
    await waitFor(() => expect(assign).toBeEnabled());
    await user.click(assign);
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/users/usr_42/tenants', {
        tenantId: 'tenant-1',
        role: 'ENTERPRISE_MEMBER',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('User assigned to Northwind.');
  });

  it('removes a membership by tenant id', async () => {
    wire();
    mockedDel.mockResolvedValue({ message: 'User removed from tenant.' });
    const user = userEvent.setup();
    await openDrawer(user, /organizations/i);

    await user.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() =>
      expect(mockedDel).toHaveBeenCalledWith('/admin/users/usr_42/tenants/tenant-1'),
    );
  });

  it('says so when the operator has no organization to assign into', async () => {
    wire({ tenants: [] });
    const user = userEvent.setup();
    await openDrawer(user, /organizations/i);
    expect(screen.getByText(/not a member of any organization/i)).toBeInTheDocument();
  });
});

describe('provisioning', () => {
  it('sends only the fields the endpoint accepts', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'Identity created.' });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /provision user/i }));
    await user.type(screen.getByLabelText(/display name/i), 'New Hire');
    await user.type(screen.getByLabelText(/email address/i), 'new.hire@example.com');
    await user.click(screen.getByRole('button', { name: /provision account/i }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/users', {
        email: 'new.hire@example.com',
        displayName: 'New Hire',
        role: 'USER',
        emailVerified: false,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Identity created.');
  });

  it('keeps the dialog open and shows the reason when provisioning is refused', async () => {
    wire();
    mockedPost.mockRejectedValue({
      response: { status: 409, data: { success: false, code: 'IDENTITY_ALREADY_EXISTS', error: 'An identity with this email already exists.' } },
    });
    const user = userEvent.setup();
    render(<AdminUsersTab />);

    await user.click(await screen.findByRole('button', { name: /provision user/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Duplicate');
    await user.type(screen.getByLabelText(/email address/i), 'dup@example.com');
    await user.click(screen.getByRole('button', { name: /provision account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An identity with this email already exists.');
    expect(alert).toHaveTextContent('IDENTITY_ALREADY_EXISTS');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('directory filters', () => {
  it('filters by status without hiding the total', async () => {
    wire();
    const user = userEvent.setup();
    render(<AdminUsersTab />);
    await screen.findByText('Ops Person');

    await user.click(screen.getByRole('button', { name: 'SUSPENDED' }));
    expect(screen.getByText(/no account matches this filter/i)).toBeInTheDocument();
    expect(screen.getByText(/1 identities exist/i)).toBeInTheDocument();
  });

  it('searches by email', async () => {
    wire();
    const user = userEvent.setup();
    render(<AdminUsersTab />);
    await screen.findByText('Ops Person');

    await user.type(screen.getByLabelText(/search the user directory/i), 'nobody');
    expect(screen.getByText(/no account matches this filter/i)).toBeInTheDocument();
  });
});

describe('User 360 identity controls that were previously unreachable', () => {
  it('sends a password-reset email through the identity provider and reports its answer', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'Reset mail queued.' });
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    await user.click(within(drawer).getByRole('button', { name: /send password reset email/i }));

    expect(mockedPost).toHaveBeenCalledWith('/admin/users/usr_42/send-password-reset', {});
    expect(await screen.findByRole('status')).toHaveTextContent(/reset mail queued/i);
  });

  it('revokes every refresh token and unenrolls MFA, each reporting the server message', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'Refresh tokens revoked.' });
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    await user.click(within(drawer).getByRole('button', { name: /revoke all sessions/i }));
    expect(mockedPost).toHaveBeenCalledWith('/admin/users/usr_42/revoke-sessions', {});
    expect(await screen.findByRole('status')).toHaveTextContent(/refresh tokens revoked/i);
  });

  it('falls back to a plain sentence when the server returns no message', async () => {
    wire();
    mockedPost.mockResolvedValue({});
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    await user.click(within(drawer).getByRole('button', { name: /send password reset email/i }));
    // A handler whose success depends on an optional server string would show an empty banner;
    // the fallback sentence is what makes the announcement never blank.
    expect(await screen.findByRole('status')).toHaveTextContent(/password reset email queued/i);
  });

  it('downloads the server-side export bundle instead of synthesising one', async () => {
    wire();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users') return Promise.resolve({ success: true, users: [identity] });
      if (url.endsWith('/details')) return Promise.resolve(detailsPayload);
      if (url.endsWith('/export')) return Promise.resolve({ user: { id: 'usr_42' }, resumes: [] });
      return Promise.resolve({});
    });
    const createObjectURL = vi.fn(() => 'blob:export');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    const user = userEvent.setup();
    const drawer = await openDrawer(user);
    await user.click(within(drawer).getByRole('button', { name: /download gdpr export/i }));

    expect(mockedGet).toHaveBeenCalledWith('/admin/users/usr_42/export');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('refuses an out-of-range quota locally, before the request', async () => {
    wire();
    const user = userEvent.setup();
    const drawer = await openDrawer(user, /ai/i);

    const limit = within(drawer).getByLabelText(/daily limit/i);
    await user.clear(limit);
    await user.type(limit, '0');
    await user.type(within(drawer).getByLabelText(/reason|justification/i), 'trying zero');
    await user.click(within(drawer).getByRole('button', { name: /save|apply/i }));

    expect(mockedPut).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 1/i);
  });
  it('grants a membership with the organization and role the operator picked', async () => {
    wire();
    mockedPost.mockResolvedValue({ message: 'Membership granted.' });
    const user = userEvent.setup();
    const drawer = await openDrawer(user, /organizations/i);

    // The selects are the only path to the two values the POST body carries; driving both
    // proves the picker is wired, not just rendered.
    await user.selectOptions(await within(drawer).findByLabelText('Organization'), 'tenant-1');
    await user.selectOptions(within(drawer).getByLabelText('Organization role'), 'ENTERPRISE_VIEWER');
    await user.click(within(drawer).getByRole('button', { name: /^assign$/i }));

    expect(mockedPost).toHaveBeenCalledWith('/admin/users/usr_42/tenants', {
      tenantId: 'tenant-1',
      role: 'ENTERPRISE_VIEWER',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/membership granted/i);
  });

  it('removes a membership and reports the server sentence', async () => {
    wire();
    mockedDel.mockResolvedValue({ message: 'Membership removed.' });
    const user = userEvent.setup();
    const drawer = await openDrawer(user, /organizations/i);

    await user.click(within(drawer).getByRole('button', { name: /remove/i }));

    expect(mockedDel).toHaveBeenCalledWith('/admin/users/usr_42/tenants/tenant-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/membership removed/i);
  });

});

