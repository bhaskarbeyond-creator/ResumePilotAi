import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiX, FiEdit } from 'react-icons/fi';
import {
    FaCubes, FaCog, FaPaintBrush, FaGlobeAsia, FaBrain, FaFire, FaDatabase,
    FaFacebook, FaEnvelope, FaCloud, FaRobot, FaFilePdf, FaCommentAlt,
    FaReceipt, FaStamp, FaCreditCard, FaMapMarkerAlt, FaShieldAlt,
    FaHeartbeat, FaCode, FaServer, FaCookieBite, FaFileCode, FaFile,
    FaShareAlt, FaChartLine, FaBullhorn, FaSearch,
} from 'react-icons/fa';

/**
 * DIR-105 — the Platform Settings navigation hub.
 *
 * WHY THIS EXISTS
 * Cuba chrome is the DEFAULT shell (`cubaShellFlag.js:57-58`) and `Admin.jsx:712`
 * renders the legacy sidebar ONLY when `!isCubaChrome`. That sidebar owned
 * `SETTINGS_GROUPS` (6 groups / 31 surfaces) and navigated with
 * `navigate('/admin/settings?tab=<key>')`. Under Cuba, `portalNavigation.js:177-183`
 * exposes a single `System Settings` link with NO `?tab=`, and `Settings.jsx` had no
 * in-page navigation — so an operator landed on `modulesSettings` with no control to
 * reach the other ~30 panels. This hub restores that reachability.
 *
 * AUTHORIZATION IS NOT DECIDED HERE.
 * `canAccessSetting()` is the SAME predicate `SettingsWrapper` uses for its denial
 * gate, exported from one place and imported by both, so the navigator can never
 * show a tab the gate would refuse (or hide one it would allow). The route's
 * `RequireTabPerm required="*"` and the backend policy engine remain the only
 * authorities (7); this component narrows presentation only.
 *
 * SECRETS: this file renders labels, descriptions and routes. It never reads,
 * stores or forwards a credential — the settings panels own their own masking.
 */

import { canAccessSetting, presentGroups } from './settingsAccess';

/** Icons are presentation only, keyed by the same `key` the inventory uses. */
const ICONS = Object.freeze({
    modulesSettings: FaCubes,
    websiteSettings: FaCog,
    brandingSettings: FaPaintBrush,
    geoSeoSettings: FaGlobeAsia,
    llmGeoSettings: FaBrain,
    firebaseSettings: FaFire,
    databaseSettings: FaDatabase,
    socialAuthSettings: FaFacebook,
    facebookAuthSettings: FaFacebook,
    emailSettings: FaEnvelope,
    storageSettings: FaCloud,
    aiSettings: FaRobot,
    exportPdfSettings: FaFilePdf,
    jobScraperSettings: FaSearch,
    twilioSmsSettings: FaCommentAlt,
    currencySettings: FaCog,
    ordersManagement: FaReceipt,
    watermarkSettings: FaStamp,
    subscriptionsSettings: FaCreditCard,
    paymentSettings: FaCreditCard,
    integrationsSettings: FaMapMarkerAlt,
    securityLimitsSettings: FaShieldAlt,
    systemHealthSettings: FaHeartbeat,
    featureFlagsSettings: FaCode,
    platformConfigSettings: FaServer,
    codeInjectionSettings: FaCode,
    gdprLegalSettings: FaCookieBite,
    templateManagerSettings: FaFileCode,
    pages: FaFile,
    blog: FiEdit,
    socialSettings: FaShareAlt,
    analytics: FaChartLine,
    ads: FaBullhorn,
});

/**
 * The hub. Renders category pills, a live search filter and the tab chips for
 * every panel the caller is entitled to, driving the existing `?tab=` contract
 * so deep links, browser history and the legacy sidebar all stay compatible.
 */
const SettingsNavigator = ({ settings = [], isSuperAdmin = false, permissions = [] }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('ALL');

    const accessContext = useMemo(() => ({ isSuperAdmin, permissions }), [isSuperAdmin, permissions]);

    // Only entitled entries are ever rendered — the same predicate the denial
    // gate uses, so the two cannot disagree.
    const accessible = useMemo(
        () => settings.filter((s) => canAccessSetting(s, accessContext)),
        [settings, accessContext],
    );

    const activeTab = searchParams.get('tab') || accessible[0]?.key || '';

    const visibleGroups = useMemo(() => presentGroups(accessible), [accessible]);

    const needle = query.trim().toLowerCase();
    const matches = useMemo(() => accessible.filter((s) => {
        if (group !== 'ALL' && s.group !== group) return false;
        if (!needle) return true;
        return `${s.label} ${s.description || ''} ${s.key}`.toLowerCase().includes(needle);
    }), [accessible, group, needle]);

    const select = (key) => setSearchParams({ tab: key });

    if (!accessible.length) return null;

    const pillClass = (isOn) => `cuba-focusable inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-bold transition-colors ${
        isOn
            ? 'border-cuba-primary bg-cuba-primary-soft text-cuba-primary-strong'
            : 'border-cuba-line text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink'
    }`;

    return (
        <section
            aria-label="Platform settings navigation"
            data-testid="settings-navigator"
            className="rounded-2xl border border-cuba-line bg-cuba-card p-4 shadow-cuba-sm sm:p-5"
        >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Settings categories">
                    <button
                        type="button"
                        onClick={() => setGroup('ALL')}
                        aria-pressed={group === 'ALL'}
                        data-testid="settings-group-all"
                        className={pillClass(group === 'ALL')}
                    >
                        All
                    </button>
                    {visibleGroups.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => setGroup(name)}
                            aria-pressed={group === name}
                            data-testid={`settings-group-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                            className={pillClass(group === name)}
                        >
                            {name}
                        </button>
                    ))}
                </div>

                <div className="relative w-full lg:w-72">
                    <label htmlFor="settings-search" className="cuba-sr-only">Search platform settings</label>
                    <FiSearch
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cuba-ink-subtle"
                    />
                    <input
                        id="settings-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search settings..."
                        data-testid="settings-search"
                        className="cuba-focusable h-10 w-full rounded-full border border-cuba-line bg-cuba-card pl-9 pr-9 text-sm text-cuba-ink placeholder:text-cuba-ink-subtle"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            aria-label="Clear settings search"
                            className="cuba-focusable absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-cuba-ink-subtle hover:bg-cuba-primary-soft hover:text-cuba-ink"
                        >
                            <FiX className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>


            {matches.length === 0 ? (
                <p className="mt-4 text-xs font-semibold text-cuba-ink-muted" data-testid="settings-no-results">
                    No settings match &ldquo;{query}&rdquo;.
                </p>
            ) : (
                <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="settings-tabs">
                    {matches.map((setting) => {
                        const Icon = ICONS[setting.key] || FaCog;
                        const isActive = setting.key === activeTab;
                        return (
                            <li key={setting.key} className="min-w-0">
                                <button
                                    type="button"
                                    onClick={() => select(setting.key)}
                                    aria-current={isActive ? 'page' : undefined}
                                    data-testid={`settings-tab-${setting.key}`}
                                    className={`cuba-focusable flex min-h-[44px] w-full items-center gap-3 rounded-cuba-md border px-3 py-2 text-left transition-colors ${
                                        isActive
                                            ? 'border-cuba-primary bg-cuba-primary-soft text-cuba-primary-strong'
                                            : 'border-cuba-line text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink'
                                    }`}
                                >
                                    <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-bold">{setting.label}</span>
                                        <span className="block truncate text-[11px] font-medium text-cuba-ink-subtle">
                                            {setting.description}
                                        </span>
                                    </span>
                                    {isActive && (
                                        <span className="flex-none rounded-full border border-cuba-line px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                                            Active
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default SettingsNavigator;

