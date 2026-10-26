/**
 * The adapter between `GET /api/admin/users` and the directory table.
 *
 * The defects pinned here: the component used to receive `adminUserProjection` rows and treat
 * them as `AdminUserRecord`s, so `status`, `plan` and `lastLogin` were `undefined` on screen;
 * and fields the directory endpoint never returns were shown as numbers (`usedToday ?? 18`).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  deriveStatus,
  formatLastSeen,
  isAssignableRole,
  readDirectory,
  readTenantOptions,
  readUser360,
  downloadJson,
  toAdminUserRecord,
  type AdminDirectoryRow,
} from '@/components/admin/admin-users-model';

const baseRow: AdminDirectoryRow = {
  id: 'usr_1',
  email: 'a@example.com',
  displayName: 'A Person',
  role: 'ADMIN',
  suspended: false,
  identityStatus: 'ACTIVE',
  membership: 'Premium',
  membershipEnds: '2027-01-01T00:00:00.000Z',
  primaryTenant: { id: 't1', displayName: 'Northwind', role: 'ENTERPRISE_ADMIN' },
  tenantCount: 1,
  lastLoginAt: '2026-10-26T09:00:00.000Z',
  createdAt: '2025-01-05T00:00:00.000Z',
  revision: 4,
};

describe('toAdminUserRecord', () => {
  it('maps the projection the endpoint actually returns', () => {
    const record = toAdminUserRecord(baseRow, new Date('2026-10-26T10:00:00.000Z'));
    expect(record.status).toBe('active');
    expect(record.membership).toBe('Premium');
    expect(record.lastLogin).toBe('1 h ago');
    expect(record.tenantMembership).toBe('Northwind (ENTERPRISE_ADMIN)');
    expect(record.revision).toBe(4);
  });

  it('never invents the fields the directory endpoint does not return', () => {
    const record = toAdminUserRecord(baseRow);
    expect(record.resumeCount).toBeNull();
    expect(record.aiDailyLimit).toBeNull();
  });

  it('reports an unknown role as USER rather than passing it through', () => {
    expect(toAdminUserRecord({ ...baseRow, role: 'WIZARD' }).role).toBe('USER');
  });

  it('surfaces a suspended identity as suspended even when the profile is active', () => {
    expect(deriveStatus({ ...baseRow, suspended: true })).toBe('suspended');
  });

  it('reports a profile without credentials as pending, not active', () => {
    expect(deriveStatus({ ...baseRow, identityStatus: 'MISSING' })).toBe('pending');
  });
});

describe('formatLastSeen', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  it('says never when the identity has no sign-in time', () => {
    expect(formatLastSeen(null, now)).toBe('never');
  });
  it('uses minutes under an hour and days under a week', () => {
    expect(formatLastSeen('2026-10-26T11:35:00.000Z', now)).toBe('25 min ago');
    expect(formatLastSeen('2026-10-23T12:00:00.000Z', now)).toBe('3 d ago');
  });
  it('falls back to an ISO date for old sign-ins', () => {
    expect(formatLastSeen('2026-01-02T12:00:00.000Z', now)).toBe('2026-01-02');
  });
});

describe('readDirectory', () => {
  it('returns an empty list for a missing payload instead of a sample list', () => {
    expect(readDirectory(null)).toEqual([]);
    expect(readDirectory({ success: true })).toEqual([]);
  });
  it('drops rows without an identifier rather than rendering an unclickable row', () => {
    const rows = readDirectory({ users: [baseRow, { ...baseRow, id: '' }] });
    expect(rows).toHaveLength(1);
  });
});

describe('role assignability', () => {
  it('does not offer SUPER_ADMIN, which the API refuses', () => {
    expect(ASSIGNABLE_ROLES).not.toContain('SUPER_ADMIN');
    expect(isAssignableRole('SUPER_ADMIN')).toBe(false);
    expect(isAssignableRole('ADMIN')).toBe(true);
  });
});

describe('readUser360', () => {
  it('reads quota usage and documents from the details endpoint', () => {
    const view = readUser360({
      user360: {
        identity: baseRow,
        security: { mfaEnabled: true, emailVerified: true, suspended: false },
        aiEntitlement: { plan: 'Premium', effectiveLimit: 250, usedToday: 42, customOverride: { dailyLimit: 300 } },
        content: {
          resumeCount: 2,
          resumes: [{ id: 'res_1', title: 'Master', template: 'zurich', updatedAt: '2026-10-01T00:00:00.000Z' }],
        },
        tenancy: { memberships: [{ tenantId: 't1', displayName: 'Northwind', roles: ['ENTERPRISE_ADMIN'] }] },
      },
    });
    expect(view.ai).toEqual({ plan: 'Premium', effectiveLimit: 250, usedToday: 42, customLimit: 300 });
    expect(view.content.resumeCount).toBe(2);
    expect(view.content.resumes[0]?.title).toBe('Master');
    expect(view.mfaEnabled).toBe(true);
    expect(view.memberships[0]?.displayName).toBe('Northwind');
  });

  it('keeps unknown numbers null so the drawer can print an em dash', () => {
    const view = readUser360({ user360: {} });
    expect(view.ai.effectiveLimit).toBeNull();
    expect(view.ai.usedToday).toBeNull();
    expect(view.content.resumeCount).toBe(0);
  });
});

describe('readTenantOptions', () => {
  it('ignores a malformed tenant list instead of throwing inside the drawer', () => {
    expect(readTenantOptions({ tenants: 'nope' })).toEqual([]);
    expect(readTenantOptions({ tenants: [{ id: 't1', displayName: 'Northwind' }] })).toEqual([
      { id: 't1', displayName: 'Northwind', slug: 't1', lifecycleState: 'ACTIVE' },
    ]);
  });
  it('downloads the server bundle rather than re-serialising what the table had', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:bundle');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    downloadJson('user_export_usr_42.json', { user: { id: 'usr_42' } });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bundle');
    vi.unstubAllGlobals();
  });

  it('renders a future timestamp as a date instead of a negative relative time', () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    // Clock skew between the API host and the browser is normal; "-3 min ago" is not.
    expect(formatLastSeen('2026-10-26T12:05:00.000Z', now)).toBe('2026-10-26');
  });

  it('defaults every missing timeline field, so a sparse audit row still renders', () => {
    const model = readUser360({
      user360: {
        identity: { id: 'usr_42', email: 'ops@example.com', displayName: 'Ops', role: 'ADMIN', suspended: false },
        auditTimeline: [{ id: 'a-1' }],
      },
    } as unknown as Parameters<typeof readUser360>[0]);
    expect(model.timeline).toEqual([{ id: 'a-1', action: 'ADMIN_ACTION', createdAt: '', severity: 'INFO' }]);
  });

  it('drops a tenant row with no identifier instead of offering an empty option', () => {
    expect(readTenantOptions({ tenants: [{ displayName: 'No id' }, { id: 't-1', slug: 'northwind' }] })).toEqual([
      { id: 't-1', displayName: 'northwind', slug: 'northwind', lifecycleState: 'ACTIVE' },
    ]);
  });

});
