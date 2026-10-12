/**
 * DIR-105 — settings authorization + grouping primitives.
 *
 * Deliberately a plain `.js` module (not `.jsx`) so the test suite can import and
 * exercise the predicate directly, rather than asserting against source text.
 *
 * This is the ONE place that decides whether an operator may see a settings panel.
 * `Settings.jsx` (the denial gate) and `SettingsNavigator.jsx` (the hub) both call
 * it, so the navigator can never offer a panel the gate would refuse, nor hide one
 * it would allow. It narrows presentation only — the route's `RequireTabPerm
 * required="*"` and the backend policy engine remain the sole authorities.
 */

/** Canonical group order, matching the legacy sidebar so parity is exact. */
export const SETTINGS_GROUP_ORDER = Object.freeze([
    'Modules',
    'General',
    'AI & Services',
    'Payments',
    'Security & Health',
    'Content & Media',
]);

/**
 * The single authorization predicate for a settings entry.
 *
 * Mirrors the pre-DIR-105 inline helper exactly:
 *  - a Super Admin passes everything;
 *  - otherwise `superAdminOnly` entries are denied outright;
 *  - a `permission` entry requires that permission, a `*` grant, or — for
 *    array-form permissions — at least one match (OR semantics).
 */
export function canAccessSetting(setting, { isSuperAdmin = false, permissions = [] } = {}) {
    if (!setting) return false;
    if (isSuperAdmin) return true;
    if (setting.superAdminOnly) return false;
    if (!setting.permission) return true;
    const granted = Array.isArray(permissions) ? permissions : [];
    if (granted.includes('*')) return true;
    const required = Array.isArray(setting.permission) ? setting.permission : [setting.permission];
    return required.some((p) => granted.includes(p));
}

/**
 * THE settings inventory. Single source of truth.
 *
 * Historically this lived inside `Settings.jsx` while the legacy sidebar kept a
 * parallel `SETTINGS_GROUPS`. The two drifted: 33 keys here vs 31 there
 * (`facebookAuthSettings` and `paymentSettings` existed only in this list), so the
 * sidebar could never navigate to them. DIR-105 hoisted this list into a
 * dependency-free module so the settings hub, the denial gate and the command
 * palette all read the SAME inventory — the drift is now structurally impossible.
 */
export const ALL_SETTINGS = Object.freeze([
    { key: 'modulesSettings', label: 'Addon Modules', group: 'Modules', description: 'Feature toggles & addon modules', permission: 'system.config.write' },
    { key: 'websiteSettings', label: 'Brand Identity & Meta', group: 'General', description: 'Site title, description & SEO', permission: 'system.config.write' },
    { key: 'brandingSettings', label: 'Branding', group: 'General', description: 'Logos, icons & avatars', permission: 'system.config.write' },
    { key: 'geoSeoSettings', label: 'Indian Geo-SEO', group: 'General', description: 'Google India SEO & Geo tags', permission: 'system.config.write' },
    { key: 'llmGeoSettings', label: 'LLM GEO (AI Search)', group: 'General', description: 'ChatGPT, Perplexity & llms.txt', permission: 'system.config.write' },
    { key: 'firebaseSettings', label: 'Firebase Identity', group: 'General', description: 'Authentication & OAuth credentials', superAdminOnly: true },
    { key: 'databaseSettings', label: 'Database & Persistence Engine', group: 'General', description: 'Authoritative MariaDB storage and durable outboxes', superAdminOnly: true },
    { key: 'socialAuthSettings', label: 'Social Sign-On & OAuth', group: 'General', description: 'Facebook, LinkedIn & GitHub OAuth', superAdminOnly: true },
    { key: 'facebookAuthSettings', label: 'Social Sign-On & OAuth', group: 'General', description: 'Facebook, LinkedIn & GitHub OAuth', superAdminOnly: true },
    { key: 'emailSettings', label: 'Email & SMTP', group: 'General', description: 'Outbound SMTP, Inbound IMAP & Dynamic Templates', permission: 'email.template.manage' },
    { key: 'storageSettings', label: 'Cloud Storage', group: 'AI & Services', description: 'S3 & Cloudinary CDN', superAdminOnly: true },
    { key: 'aiSettings', label: 'AI & Gemini', group: 'AI & Services', description: 'AI model & API key', superAdminOnly: true },
    { key: 'exportPdfSettings', label: 'PDF Exporter', group: 'AI & Services', description: 'Puppeteer render engine', permission: 'system.config.write' },
    { key: 'jobScraperSettings', label: 'Job & Naukri Scraper', group: 'AI & Services', description: 'Naukri & LinkedIn config', superAdminOnly: true },
    { key: 'twilioSmsSettings', label: 'Twilio SMS', group: 'AI & Services', description: 'SMS Notification alerts', superAdminOnly: true },
    { key: 'currencySettings', label: 'Platform Currency', group: 'Payments', description: 'Authoritative currency standard, ISO-4217 & multi-currency', permission: 'system.config.read' },
    { key: 'ordersManagement', label: 'Orders & Transactions', group: 'Payments', description: 'Master customer invoices & 1-Click refunds', permission: 'payments.read' },
    { key: 'watermarkSettings', label: 'PDF Watermark', group: 'Payments', description: 'Free Tier Watermarks', permission: 'system.config.write' },
    { key: 'subscriptionsSettings', label: 'Subscriptions & Gateways', group: 'Payments', description: 'Razorpay, Stripe, pricing & GST', permission: 'payments.read' },
    { key: 'paymentSettings', label: 'Subscriptions & Gateways', group: 'Payments', description: 'Razorpay, Stripe, pricing & GST', permission: 'payments.read' },
    { key: 'integrationsSettings', label: 'Maps & Keys', group: 'Security & Health', description: 'Google Maps & reCAPTCHA', superAdminOnly: true },
    { key: 'securityLimitsSettings', label: 'Security & Limits', group: 'Security & Health', description: 'Upload caps & rate limits', superAdminOnly: true },
    { key: 'systemHealthSettings', label: 'System Health', group: 'Security & Health', description: 'Maintenance & Diagnostics', permission: 'security.read' },
    { key: 'featureFlagsSettings', label: 'Feature Flags', group: 'Security & Health', description: 'Platform-wide feature gates & rollout controls', superAdminOnly: true },
    { key: 'platformConfigSettings', label: 'Platform Config', group: 'Security & Health', description: 'Infrastructure & runtime configuration census', superAdminOnly: true },
    { key: 'codeInjectionSettings', label: 'Code Injection', group: 'Security & Health', description: 'Head & Body Scripting', superAdminOnly: true },
    { key: 'gdprLegalSettings', label: 'GDPR & Legal', group: 'Security & Health', description: 'Cookie Banner & Policies', permission: 'system.config.write' },
    { key: 'templateManagerSettings', label: 'Templates', group: 'Content & Media', description: '51 CV & Cover controls', permission: 'system.config.write' },
    { key: 'pages', label: 'Pages', group: 'Content & Media', description: 'Page management', permission: 'system.config.write' },
    { key: 'blog', label: 'Blog Engine', group: 'Content & Media', description: 'Blog settings & categories', permission: 'system.config.write' },
    { key: 'socialSettings', label: 'Social Links', group: 'Content & Media', description: 'Social media links', permission: 'system.config.write' },
    { key: 'analytics', label: 'Analytics', group: 'Content & Media', description: 'Tracking & metrics', permission: 'system.config.write' },
    { key: 'ads', label: 'Ads Manager', group: 'Content & Media', description: 'Advertisement settings', permission: 'system.config.write' },
]);

/** Groups present in an inventory, in canonical order. */
export function presentGroups(settings = []) {
    const present = new Set(settings.map((s) => s.group));
    return SETTINGS_GROUP_ORDER.filter((g) => present.has(g));
}
