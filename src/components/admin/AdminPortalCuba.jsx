import React from 'react';
import CubaPortalShell from '../cuba/CubaPortalShell';
import { ADMIN_PORTAL_NAVIGATION } from '../cuba/portalNavigation';
import { ACCOUNT_PORTALS } from '../cuba/accountLinks';
import { searchAdminEntities } from './command/adminEntitySearch';

/**
 * Cuba platform admin chrome — Phase 7 wrapper.
 *
 * `AdminConsoleInner` is mounted as a child, so the entire existing control
 * plane keeps working: `RequireTabPerm` on every tab, the Super Admin role-view
 * banner, the destructive-action MFA gate, the settings detection and every
 * `/api/admin/*` call are untouched (§47).
 *
 * SECURITY POSTURE — deliberately conservative:
 *   - The wrapper performs NO permission filtering and reads no admin context.
 *     It renders the same navigation for everyone who reached the console;
 *     `RequireTabPerm` is what denies a tab and the backend policy engine is
 *     what denies the API. A second client-side filter could only disagree
 *     with the server, which is exactly the class of bug to avoid (§7).
 *   - It issues no request of its own. Platform Health continues to read
 *     `/api/platform/operational-status` through its own role-projected
 *     endpoint, so non-Super-Admin diagnostics stay stripped server-side.
 *   - It never renders, logs or forwards a secret; settings secrets stay masked
 *     inside the untouched settings components.
 *   - It never asserts an identity. The label is a static section name, not a
 *     claim about who is signed in.
 *   - DIR-012: it now HANDS OVER a search provider, which is not a decision. The
 *     wrapper still makes no permission call and still issues no request of its
 *     own: `searchAdminEntities` lives in `./command/adminEntitySearch` and reaches
 *     the role-projected platform search endpoint, which strips server-side every
 *     category the caller is not entitled to. Passing the function by reference is
 *     what keeps `tests/cuba-admin-console.test.mjs` (no `fetch(`, no `/api/` in
 *     this file) true while restoring the live search that Cuba chrome lost.
 */
import { COPILOT_PORTALS } from '../cuba/copilotActions';

const AdminPortalCuba = ({ children }) => (
  <CubaPortalShell
    persona="Platform Admin"
    title="Command Center"
    navigation={ADMIN_PORTAL_NAVIGATION}
    user={{ name: 'Control Plane' }}
    // DIR-025: the platform-admin account menu targets the admin console
    // (`/admin/settings`, `/admin/security`). It previously fell through to the
    // candidate `/dashboard/*` table, so an operator's "Security & MFA" silently
    // navigated out of the control plane into a candidate workspace.
    portal={ACCOUNT_PORTALS.ADMIN}
    commandSearchProvider={searchAdminEntities}
    // DIR-021: the admin copilot surfaces "Search user or tenant" and the
    // security audit shortcut, resolved from the live route. It carries NO
    // candidate context on purpose: no AI operation here needs one, so there is
    // nothing for the payloads to invent.
    copilotPortal={COPILOT_PORTALS.ADMIN}
  >
    {children}
  </CubaPortalShell>
);

export default AdminPortalCuba;
