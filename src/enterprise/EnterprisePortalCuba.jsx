import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import CubaPortalShell from '../components/cuba/CubaPortalShell';
import { COPILOT_PORTALS } from '../components/cuba/copilotActions';
import { enterpriseNavigationFor, filterByPermissions } from '../components/cuba/portalNavigation';
import { ACCOUNT_PORTALS } from '../components/cuba/accountLinks';
import { useEnterpriseTenant } from './EnterpriseContext';
import { TenantSwitcher, WorkspaceBadge, EnterpriseRoleSimulationBanner } from './EnterpriseContextSwitchers';
import { resolveOrgRoute } from './orgRouteState';

/**
 * Cuba organization console â€” Phase 6 wrapper.
 *
 * WHY A WRAPPER AND NOT A REWRITE:
 *   `EnterpriseConsole.jsx` already implements the organization command centre,
 *   all thirteen tabs, its own permission gating, its command palette and every
 *   tenant API call. It is 45 KB of proven, tested behaviour. It is therefore
 *   rendered as-is inside the Cuba chrome; none of its internals are touched
 *   (Â§47: when uncertain, preserve it).
 *
 * TENANT ISOLATION IS NOT TOUCHED (Â§7):
 *   The slug shown here comes from `EnterpriseTenantContext`, which is populated
 *   exclusively by the server response to `/api/enterprise/context`. Nothing in
 *   this wrapper guesses, widens or caches a tenant. The browser cannot select
 *   a tenant the server did not return, and the shell adds no permission logic
 *   of its own.
 */
const EnterprisePortalCuba = ({ children }) => {
    const params = useParams();
    const location = useLocation();
    // Read through the existing public hook rather than reaching into the
    // context object, so EnterpriseContext.jsx needs no modification at all.
    const { tenant, workspace, simulatedRole, isSimulating, platformAdmin } = useEnterpriseTenant();

    // Prefer the server-resolved tenant slug; the URL slug is only a fallback so
    // a direct deep link still renders navigation rather than an empty shell.
    const slug = tenant?.slug || params.slug || '';

    // DIR-016: the sidebar must list exactly the tabs the console can actually
    // render, which now includes the platform provisioning tab. It is gated by
    // `platformAdmin` ONLY — the server-derived capability from
    // `/api/enterprise/context` (set in EnterpriseContext.jsx from
    // `active.platformAdmin === true`), never by anything computed here.
    //
    // The `['*']` grant is deliberate: it leaves every pre-existing tab's
    // visibility byte-identical to the unfiltered list this wrapper always
    // passed, so the ONLY behavioural change in this file is that `platform`
    // now appears for a platform administrator and stays hidden otherwise.
    // The console below re-checks the same capability for rendering, so this
    // narrows what is LINKED, never what is reachable (§7).
    const navigation = filterByPermissions(
        enterpriseNavigationFor(slug),
        ['*'],
        { platformAdmin: platformAdmin === true },
    );
    const tenantLabel = tenant?.name || tenant?.id || 'Organization';

    // The Cuba toolbar title must track the module the operator is actually in.
    // This is pure display resolution over the shared navigation mirror; the
    // console itself remains the single authority on what is rendered.
    const activeModule = resolveOrgRoute({
        pathname: location.pathname,
        search: location.search,
        visibleIds: navigation.flatMap((group) => group.items.map((item) => item.id)),
        slug,
    });
    const activeLabel = navigation
        .flatMap((group) => group.items)
        .find((item) => item.id === activeModule.tabId)?.label || 'Overview';

    return (
        <CubaPortalShell
            persona="Organization"
            title={activeLabel}
            navigation={navigation}
            user={{ name: tenantLabel }}
            // DIR-025: the organization console's account menu targets its OWN
            // canonical `/org/<slug>/<tab>` paths (built by the same `orgPathFor`
            // the sidebar uses), not the candidate `/dashboard/*` table.
            portal={ACCOUNT_PORTALS.ENTERPRISE}
            tenantSlug={slug}
            // DIR-021: enterprise-context chip (tenant quota usage), which routes
            // to the live Usage & Quotas module. Quota figures are read, never
            // generated, so this action dispatches no AI request at all.
            copilotPortal={COPILOT_PORTALS.ENTERPRISE}
            toolbar={(
                /* Elevated organization context band (DIR-008). Hosting the
                   Organization and Workspace switchers here is what makes the
                   tenant scope obvious at all times instead of hiding it inside a
                   second, redundant legacy top bar. Values are rendered from the
                   server-resolved context, so this band can never display another
                   tenant's data, and it adds no permission logic of its own. */
                <div className="enterprise-cuba-context-band">
                    <TenantSwitcher variant="cuba" />
                    <WorkspaceBadge variant="cuba" />
                </div>
            )}
        >
            {isSimulating && (
                <EnterpriseRoleSimulationBanner tenant={tenant} simulatedRole={simulatedRole} />
            )}
            <div className="container-fluid p-0 space-y-6">
                {/* Tenant identity strip. Values come from the server-resolved
                    context, so this can never display another tenant's data. */}
                {tenant && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-cuba-ink">{tenantLabel}</span>
                        {workspace?.name && (
                            <>
                                <span aria-hidden="true" className="text-cuba-ink-subtle">/</span>
                                <span className="text-cuba-ink-muted">{workspace.name}</span>
                            </>
                        )}
                        {tenant?.planName && (
                            <span className="ml-auto rounded-full bg-cuba-primary-soft px-2.5 py-1 text-xs font-semibold text-cuba-primary-ink-strong">
                                {tenant.planName}
                            </span>
                        )}
                    </div>
                )}
                {children}
            </div>
        </CubaPortalShell>
    );
};

export default EnterprisePortalCuba;
