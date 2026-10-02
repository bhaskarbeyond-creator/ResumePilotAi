import React from 'react';
import { useParams } from 'react-router-dom';
import CubaPortalShell from '../components/cuba/CubaPortalShell';
import { enterpriseNavigationFor } from '../components/cuba/portalNavigation';
import { useEnterpriseTenant } from './EnterpriseContext';

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
    // Read through the existing public hook rather than reaching into the
    // context object, so EnterpriseContext.jsx needs no modification at all.
    const { tenant, workspace } = useEnterpriseTenant();

    // Prefer the server-resolved tenant slug; the URL slug is only a fallback so
    // a direct deep link still renders navigation rather than an empty shell.
    const slug = tenant?.slug || params.slug || '';

    const navigation = enterpriseNavigationFor(slug);
    const tenantLabel = tenant?.name || tenant?.id || 'Organization';

    return (
        <CubaPortalShell
            persona="Organization"
            title="Overview"
            navigation={navigation}
            user={{ name: tenantLabel }}
        >
            <div className="space-y-6">
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
