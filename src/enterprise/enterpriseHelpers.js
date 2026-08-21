/**
 * Enterprise Helpers & Formatting Engine
 * Centralized utility for humanizing identities, role access levels, and badge styles.
 */

export const ROLE_HIERARCHY = {
  TENANT_OWNER: {
    level: 5,
    title: 'Tenant Owner',
    badge: 'Owner',
    tag: 'Level 5 · Sovereign Owner',
    desc: 'Full root authority over tenant lifecycle, co-owners, billing, security keys, and destructive actions.',
    badgeClass: 'enterprise-pill-success',
    color: '#059669',
  },
  TENANT_ADMIN: {
    level: 4,
    title: 'Administrator',
    badge: 'Admin',
    tag: 'Level 4 · Administrator',
    desc: 'Full authority to manage memberships, workspaces, teams, AI policies, security credentials, and audit logs.',
    badgeClass: 'enterprise-pill-primary',
    color: '#4f46e5',
  },
  WORKSPACE_MANAGER: {
    level: 3,
    title: 'Workspace Manager',
    badge: 'Manager',
    tag: 'Level 3 · Workspace Manager',
    desc: 'Manage departmental workspaces, assign team leads, and oversee workspace document resources.',
    badgeClass: 'enterprise-pill-warning',
    color: '#d97706',
  },
  BILLING_ADMIN: {
    level: 2,
    title: 'Billing Administrator',
    badge: 'Billing',
    tag: 'Level 2 · Billing Admin',
    desc: 'Inspect and manage subscription tiers, billing contacts, payment receipts, and token quota allocations.',
    badgeClass: 'enterprise-pill-secondary',
    color: '#0284c7',
  },
  MEMBER: {
    level: 1,
    title: 'Enterprise Member',
    badge: 'Member',
    tag: 'Level 1 · Enterprise Member',
    desc: 'Standard workspace access to create, edit, optimize resumes, share documents, and perform AI generation.',
    badgeClass: 'enterprise-pill-secondary',
    color: '#64748b',
  },
  VIEWER: {
    level: 0,
    title: 'Read-Only Viewer',
    badge: 'Viewer',
    tag: 'Level 0 · Read-Only Viewer',
    desc: 'Read-only access to inspect published documents, reports, and team rosters without modification rights.',
    badgeClass: 'enterprise-pill-secondary',
    color: '#94a3b8',
  }
};

export const ALL_STANDARD_ROLES = [
  'TENANT_ADMIN',
  'WORKSPACE_MANAGER',
  'BILLING_ADMIN',
  'MEMBER',
  'VIEWER'
];

/**
 * Humanizes role identifier to title
 */
export function formatRoleLabel(role, customRoles = null) {
  if (!role) return 'Enterprise Member';
  if (customRoles && typeof customRoles === 'object' && customRoles[role]?.label) {
    return customRoles[role].label;
  }
  if (ROLE_HIERARCHY[role]) return ROLE_HIERARCHY[role].title;
  if (role.startsWith('CUSTOM_')) return `Custom: ${role.replace(/^CUSTOM_/, '').replace(/_/g, ' ')}`;
  return role;
}

/**
 * Returns numeric hierarchy level (0 to 5)
 */
export function getRoleLevel(role) {
  return ROLE_HIERARCHY[role]?.level ?? 1;
}

/**
 * Formats a member's human identity (Name, Email, or readable snippet)
 * 
 * @param {Object|string} member - Member object or principalId string
 * @param {Object} [currentUser] - Active Firebase Auth user
 * @param {Array} [allMemberships] - Optional cached list of all tenant memberships to resolve ID
 * @returns {string} Humanized string representation
 */
export function formatMemberIdentity(member, currentUser = null, allMemberships = []) {
  if (!member) return 'Unknown Member';

  // Handle case where raw principalId string is passed
  if (typeof member === 'string') {
    const principalId = member;
    if (currentUser && (principalId === currentUser.uid || principalId === currentUser.email)) {
      return currentUser.displayName
        ? `${currentUser.displayName} (${currentUser.email})`
        : currentUser.email || 'You (Current User)';
    }

    if (Array.isArray(allMemberships)) {
      const match = allMemberships.find(m => m.principalId === principalId);
      if (match) return formatMemberIdentity(match, currentUser);
    }

    // Full principal identifier: administrators must be able to read and verify
    // the exact identity; opaque truncation hides who holds access.
    return `Member (${principalId})`;
  }

  const isCurrent = currentUser && (member.principalId === currentUser.uid || member.principalId === currentUser.email);

  if (isCurrent) {
    if (currentUser.displayName && currentUser.email) {
      return `${currentUser.displayName} (${currentUser.email}) · You`;
    }
    if (currentUser.email) return `${currentUser.email} · You`;
    return `You (${member.principalId})`;
  }

  if (member.displayName && (member.email || member.invitationEmail)) {
    return `${member.displayName} (${member.email || member.invitationEmail})`;
  }

  if (member.invitationEmail) {
    return member.invitationEmail;
  }

  if (member.email) {
    return member.email;
  }

  if (member.displayName) {
    return member.displayName;
  }

  return `Member (${String(member.principalId)})`;
}
