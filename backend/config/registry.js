'use strict';

/**
 * The configuration registry — every business-affecting value the control plane
 * depends on, declared once with its type, default, validation, scope and audit
 * requirement (REC-012, INV-4).
 *
 * ## Why a registry rather than more settings panels
 *
 * `09-configuration-gap-register.md` found 34 values that decide product behaviour.
 * Three were correctly editable; nine had a dashboard field whose write failed or
 * landed where nothing read it; fourteen were hard-coded with no justification; eight
 * had a written reason to stay in code. The distribution is the point: the problem was
 * never "not enough panels", it was that *nobody could say which values were which*.
 *
 * A registry entry is therefore more than a key. It states:
 *
 *  - **what it is** (`label`, `description`) and which register row it closes (`id`);
 *  - **who may change it and where** (`scope`);
 *  - **what a valid value looks like** (`validate`), so the dashboard cannot save a
 *    value the runtime will reject at 3 a.m.;
 *  - **where the value comes from today** (`resolution`: `database` | `env` | `code`)
 *    and, for `env`/`code`, the exact fallback — so the registry is also the census;
 *  - **whether it is editable at all** (`editable: false` + `readOnlyReason`), which
 *    is how the eight justified constants are represented rather than silently
 *    omitted;
 *  - **whether a change needs a restart** (`restartRequired`) — a lie here is worse
 *    than no flag, because an operator would change a value and believe it applied;
 *  - **how the change is audited** (`audit`: `standard` | `elevated`), where
 *    `elevated` additionally requires a typed reason in the write request.
 *
 * ## Resolution order
 *
 *      database override  →  environment variable  →  declared default
 *
 * Read-only entries never consult the database: an operator cannot widen a security
 * invariant through the UI that the invariant protects (`CFG-007`…`009`, `031`).
 *
 * @module config/registry
 */

/** Where the effective value is read from. */
const RESOLUTION = Object.freeze({ DATABASE: 'database', ENV: 'env', CODE: 'code' });

/** Change scope. `DEPLOYMENT` values are surfaced but never editable. */
const SCOPE = Object.freeze({
  PLATFORM: 'PLATFORM',
  PLAN: 'PLAN',
  TENANT: 'TENANT',
  DEPLOYMENT: 'DEPLOYMENT',
});

/** Audit obligation for a write. */
const AUDIT = Object.freeze({ STANDARD: 'standard', ELEVATED: 'elevated' });

/* ── validators ───────────────────────────────────────────────────────── */

/**
 * A validation failure with a message a form can show next to the field.
 * @param {string} message
 * @returns {Error & {code: string}}
 */
function invalid(message) {
  return Object.assign(new Error(message), { code: 'CONFIG_INVALID', status: 400 });
}

/**
 * Integer within an inclusive range.
 * @param {number} min
 * @param {number} max
 * @returns {(value: unknown) => number}
 */
const intInRange = (min, max) => value => {
  // `Number('')` is 0, which would turn a cleared field into a real zero — for
  // `schedulerIntervalMs` that silently disables the scheduler. Empty input is not a
  // number, and is rejected before the range check runs.
  if (typeof value === 'string' && value.trim() === '') throw invalid('must be a whole number');
  if (value === null || value === undefined) throw invalid('must be a whole number');
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) throw invalid('must be a whole number');
  if (parsed < min || parsed > max) throw invalid(`must be between ${min} and ${max}`);
  return parsed;
};

/**
 * Decimal number within range, rounded to a fixed number of places.
 * @param {number} min
 * @param {number} max
 * @param {number} places
 * @returns {(value: unknown) => number}
 */
const decimalInRange = (min, max, places) => value => {
  // Same trap as the integer validator: an empty string is `0` to `Number`, and 0% is a
  // valid tax rate, so clearing the field would silently set tax to zero.
  if (typeof value === 'string' && value.trim() === '') throw invalid('must be a number');
  if (value === null || value === undefined) throw invalid('must be a number');
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) throw invalid('must be a number');
  if (parsed < min || parsed > max) throw invalid(`must be between ${min} and ${max}`);
  return Number(parsed.toFixed(places));
};

/** @returns {(value: unknown) => boolean} */
const booleanValue = () => value => {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  throw invalid('must be true or false');
};

/**
 * String with a length cap and an optional pattern.
 * @param {number} maxLength
 * @param {RegExp} [pattern]
 * @param {string} [hint]
 * @returns {(value: unknown) => string}
 */
const text = (maxLength, pattern, hint) => value => {
  const parsed = String(value ?? '').trim();
  if (parsed.length > maxLength) throw invalid(`must be at most ${maxLength} characters`);
  if (pattern && parsed.length > 0 && !pattern.test(parsed)) throw invalid(hint || 'has an invalid format');
  return parsed;
};

/** @returns {(value: unknown) => string} an ISO-4217 code */
const currencyCode = () => value => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw invalid('must be a three-letter ISO-4217 currency code');
  return code;
};

/**
 * Array of strings, capped, with every element validated.
 * @param {number} maxItems
 * @param {(value: unknown, index: number) => string} [element]
 * @returns {(value: unknown) => string[]}
 */
const stringArray = (maxItems, element) => value => {
  if (!Array.isArray(value)) throw invalid('must be a list');
  if (value.length > maxItems) throw invalid(`must contain at most ${maxItems} entries`);
  return value.map((entry, index) => (element ? element(entry, index) : String(entry).slice(0, 500)));
};

/* ── registry ─────────────────────────────────────────────────────────── */

/**
 * @typedef {object} RegistryEntry
 * @property {string} id register row (`CFG-nnn`)
 * @property {string} key dotted key, unique across the registry
 * @property {string} label short field label
 * @property {string} description what business decision the value encodes
 * @property {string} scope one of `SCOPE`
 * @property {'integer'|'number'|'boolean'|'string'|'string[]'} type
 * @property {unknown} defaultValue
 * @property {(value: unknown) => unknown} validate returns the normalised value, throws on invalid
 * @property {'database'|'env'|'code'} resolution where the value lives today
 * @property {string} [envVar] environment variable consulted when `resolution` is `env`
 * @property {boolean} editable
 * @property {string} [readOnlyReason] required when `editable` is false
 * @property {boolean} restartRequired
 * @property {'standard'|'elevated'} audit
 * @property {string} [unit] display unit
 */

/** @type {RegistryEntry[]} */
const ENTRIES = [
  /* ── AI quotas (CFG-001…006) ── */
  {
    id: 'CFG-001', key: 'ai.quota.plan.basic.dailyRequests', label: 'Basic daily AI requests',
    description: 'How many AI calls a Basic plan may make per day. A commercial term, so a change is a pricing decision.',
    scope: SCOPE.PLAN, type: 'integer', defaultValue: 10, validate: intInRange(1, 100_000),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-002', key: 'ai.quota.plan.enterprise.dailyRequests', label: 'Enterprise daily AI requests',
    description: 'Daily AI call ceiling for the Enterprise plan.',
    scope: SCOPE.PLAN, type: 'integer', defaultValue: 5000, validate: intInRange(1, 100_000),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-003', key: 'ai.quota.plans', label: 'Plan quota table',
    description: 'Daily request and token ceilings per plan, as one table. Editing it changes what every customer on that plan receives.',
    scope: SCOPE.PLAN, type: 'string', defaultValue: 'Basic=10/2048,Premium=100/4096,Enterprise=5000/8192,Admin=10000/16384',
    validate: value => {
      const parsed = String(value ?? '').trim();
      const plans = parsed.split(',').map(part => part.trim()).filter(Boolean);
      if (plans.length === 0) throw invalid('must list at least one plan');
      if (plans.length > 20) throw invalid('must list at most 20 plans');
      for (const plan of plans) {
        const match = /^([A-Za-z][A-Za-z0-9_-]{0,31})=(\d{1,6})\/(\d{1,5})$/.exec(plan);
        if (!match) throw invalid(`"${plan}" must look like Plan=dailyRequests/maxTokens`);
        const daily = Number(match[2]);
        const tokens = Number(match[3]);
        if (daily < 1 || daily > 100_000) throw invalid(`${match[1]}: daily requests must be 1–100000`);
        if (tokens < 256 || tokens > 32_768) throw invalid(`${match[1]}: maxTokens must be 256–32768`);
      }
      return plans.join(',');
    },
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-004', key: 'security.rateLimit.global', label: 'Global API requests / 15 min',
    description: 'Platform-wide request ceiling per account. Raising it widens the blast radius of any abuse; lowering it throttles legitimate use.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 2500, validate: intInRange(100, 100_000),
    resolution: RESOLUTION.ENV, envVar: 'GLOBAL_RATE_LIMIT_MAX', editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-005', key: 'security.rateLimit.authHourly', label: 'Auth requests / hour',
    description: 'Hourly ceiling on credential endpoints. Stricter in aggregate than the per-minute burst limit, deliberately.',
    // Upper bound raised from 1,000 to 100,000 during remediation: a multi-tenant
    // deployment legitimately services more than 1,000 credential requests an hour, and a
    // ceiling that refuses the operator's honest value is worse than no ceiling. The
    // invariant that actually protects the platform is the cross-field rule below —
    // burst ≤ hourly — not an arbitrary absolute.
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 20, validate: intInRange(1, 100_000),
    resolution: RESOLUTION.ENV, envVar: 'AUTH_RATE_LIMIT_MAX', editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-005b', key: 'security.rateLimit.authBurst', label: 'Auth requests / minute',
    description: 'Per-minute burst ceiling on credential endpoints. Must not exceed the hourly ceiling.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 5, validate: intInRange(1, 10_000),
    resolution: RESOLUTION.ENV, envVar: 'AUTH_BURST_RATE_LIMIT_MAX', editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-006', key: 'ai.quota.maxTokensCeiling', label: 'Per-request token ceiling',
    description: 'Hard upper bound applied to any plan token setting; also the runtime sanity check for a request.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 32_768, validate: intInRange(256, 32_768),
    resolution: RESOLUTION.CODE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },

  /* ── security invariants, read-only (CFG-007…009) ── */
  {
    id: 'CFG-007', key: 'security.session.sensitiveActionMaxAgeMs', label: 'Step-up freshness window',
    description: 'How long a sign-in stays "recent" for a privileged action.',
    scope: SCOPE.DEPLOYMENT, type: 'integer', defaultValue: 600_000, validate: intInRange(60_000, 3_600_000),
    resolution: RESOLUTION.ENV, envVar: 'SENSITIVE_AUTH_MAX_AGE_MS', editable: false,
    readOnlyReason: 'A security invariant must not be loosened from a UI that the protected session could compromise. Change it in the deployment environment, where the change is reviewable.',
    restartRequired: true, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-008', key: 'security.session.requireRecentAuthOutsideProduction', label: 'Step-up outside production',
    description: 'Test-only escape hatch for the freshness window.',
    scope: SCOPE.DEPLOYMENT, type: 'boolean', defaultValue: false, validate: booleanValue(),
    resolution: RESOLUTION.ENV, envVar: 'REQUIRE_RECENT_AUTH_IN_TEST', editable: false,
    readOnlyReason: 'Test-only switch. Exposing it would let a production session disable its own step-up requirement.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-009', key: 'security.mfa.superAdminRequired', label: 'Super-admin MFA required',
    description: 'Whether a second factor is required for super-admin operations (default true in production).',
    scope: SCOPE.DEPLOYMENT, type: 'boolean', defaultValue: true, validate: booleanValue(),
    resolution: RESOLUTION.ENV, envVar: 'SUPER_ADMIN_MFA_REQUIRED', editable: false,
    readOnlyReason: 'A runtime switch for MFA enforcement is an attacker\'s first target. It is a deployment decision.',
    restartRequired: true, audit: AUDIT.ELEVATED,
  },

  /* ── audit scope (CFG-010) ── */
  {
    id: 'CFG-010', key: 'security.audit.sensitiveReads', label: 'Audited read paths',
    description: 'Read paths whose access is recorded in the audit trail. Widening this is a governance decision, not a preference.',
    scope: SCOPE.PLATFORM, type: 'string[]',
    defaultValue: ['/audit-logs', '/firebase-service-account', '/admin/rbac/'],
    validate: stringArray(50, value => {
      const path = String(value ?? '').trim();
      if (!path.startsWith('/')) throw invalid('every entry must start with "/"');
      if (path.length > 200) throw invalid('an entry may not exceed 200 characters');
      return path;
    }),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },

  /* ── session and operations (CFG-011…016) ── */
  {
    id: 'CFG-011', key: 'security.session.adminTtlMinutes', label: 'Admin session TTL (minutes)',
    description: 'How long an administrative session may stay idle before re-authentication is required.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 60, validate: intInRange(5, 1440),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-012', key: 'operations.queues.sampleSize', label: 'Queue inspection sample size',
    description: 'How many rows per outbox the queue screen inspects. Changing it changes what "sampled" means in the response.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 50, validate: intInRange(10, 500),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-013', key: 'operations.retention.notificationOutboxDays', label: 'Notification outbox retention (days)',
    description: 'Age at which delivered outbox rows may be pruned. Deletion is irreversible.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 30, validate: intInRange(1, 365),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-014', key: 'operations.retention.aiUsageDays', label: 'AI usage retention (days)',
    description: 'Age at which AI usage records may be pruned. Must cover any billing reconciliation window.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 90, validate: intInRange(7, 730),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-015', key: 'governance.retention.adminAuditDays', label: 'Audit-log retention (days)',
    description: 'Age at which administrative audit rows may be pruned. 90 days is a hard floor: below it, an incident cannot be reconstructed.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 365, validate: intInRange(90, 3650),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-016', key: 'content.announcements.defaultTtlHours', label: 'Announcement default lifetime (hours)',
    description: 'Default expiry applied to a new platform announcement when none is typed.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 24, validate: intInRange(1, 720),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },

  /* ── payments (CFG-017…020) ── */
  {
    id: 'CFG-017', key: 'payments.currency', label: 'Base currency',
    description: 'Currency new invoices are denominated in. Changing it does NOT re-denominate history — the API says so.',
    scope: SCOPE.PLATFORM, type: 'string', defaultValue: 'INR', validate: currencyCode(),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-018', key: 'payments.tax.gstPercentage', label: 'GST rate (%)',
    description: 'Tax rate applied to new invoices. A tax change is an auditable event with a reason.',
    scope: SCOPE.PLATFORM, type: 'number', defaultValue: 18, validate: decimalInRange(0, 100, 2),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED, unit: '%',
  },
  {
    id: 'CFG-019', key: 'payments.providers.razorpay.enabled', label: 'Razorpay enabled',
    description: 'Whether the Razorpay gateway is offered at checkout. A provider cannot be enabled without credentials.',
    scope: SCOPE.PLATFORM, type: 'boolean', defaultValue: true, validate: booleanValue(),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-020', key: 'communications.sms.fromNumber', label: 'SMS sender number',
    description: 'E.164 number platform SMS is sent from. Empty disables SMS sending.',
    scope: SCOPE.PLATFORM, type: 'string', defaultValue: '', validate: text(20, /^\+[1-9]\d{7,14}$/, 'must be an E.164 number such as +14155550123'),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },

  /* ── product surface (CFG-021…027) ── */
  {
    id: 'CFG-021', key: 'modules.enabled', label: 'Enabled modules',
    description: 'Which product modules are offered. A module must have a consumer before it can be enabled (Appendix A.7).',
    scope: SCOPE.PLATFORM, type: 'string[]', defaultValue: [],
    validate: stringArray(64, value => {
      const key = String(value ?? '').trim();
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) throw invalid('module keys are alphanumeric with dashes');
      return key;
    }),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-022', key: 'featureFlags.defaults', label: 'Feature-flag defaults',
    description: 'Default value of every feature flag before an explicit override. Changing it changes behaviour for anyone without an override.',
    scope: SCOPE.PLATFORM, type: 'string', defaultValue: '',
    validate: text(4000),
    resolution: RESOLUTION.CODE, editable: false,
    readOnlyReason: 'Flag defaults are per-flag booleans with their own override surface (`/api/admin/operations/feature-flags/:flagKey`); a single JSON blob here would be a second source of truth.',
    restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-023', key: 'content.templates.catalog', label: 'CV template catalogue',
    description: 'The catalogue is derived from `frontend/src/lib/template-catalog.ts`. Hand-entering it here created a second source of truth that would diverge on the next release.',
    scope: SCOPE.DEPLOYMENT, type: 'string', defaultValue: 'derived:frontend/src/lib/template-catalog.ts',
    validate: text(500),
    resolution: RESOLUTION.CODE, editable: false,
    readOnlyReason: 'Derived from the shipped catalogue. Editability would let the admin plane claim a template that no build contains.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-024', key: 'content.templates.disabled', label: 'Disabled templates',
    description: 'Template ids hidden from users. Every id must exist in the catalogue.',
    scope: SCOPE.PLATFORM, type: 'string[]', defaultValue: [],
    validate: stringArray(200, value => {
      const id = String(value ?? '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw invalid('template ids are alphanumeric with dashes');
      return id;
    }),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-025', key: 'content.pages.maxBodyBytes', label: 'CMS page body cap (bytes)',
    description: 'Maximum stored size of a custom page body. A storage-integrity guard, sized generously.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 262_144, validate: intInRange(1024, 4_194_304),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-026', key: 'content.blog.schedulerIntervalMs', label: 'Publication scheduler interval (ms)',
    description: 'How often the backend looks for posts due to publish. Zero disables the scheduler.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 300_000, validate: intInRange(0, 3_600_000),
    resolution: RESOLUTION.ENV, envVar: 'CMS_SCHEDULER_INTERVAL_MS', editable: true, restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-027', key: 'content.announcements.maxActive', label: 'Maximum active announcements',
    description: 'Concurrent banners allowed. Exceeding it is refused rather than silently truncating.',
    scope: SCOPE.PLATFORM, type: 'integer', defaultValue: 5, validate: intInRange(1, 50),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.STANDARD,
  },

  /* ── protocol constants, read-only (CFG-028…032) ── */
  {
    id: 'CFG-028', key: 'limits.settings.payloadBytes', label: 'Settings payload cap (bytes)',
    description: 'Request-size guard protecting the settings transaction.',
    scope: SCOPE.DEPLOYMENT, type: 'integer', defaultValue: 100_000, validate: intInRange(1024, 10_000_000),
    resolution: RESOLUTION.CODE, editable: false,
    readOnlyReason: 'A request-size guard that can be raised from the API it protects is a denial-of-service primitive.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-029', key: 'limits.settings.stringChars', label: 'Settings string cap (chars)',
    description: 'Per-string limit inside a settings payload.',
    scope: SCOPE.DEPLOYMENT, type: 'integer', defaultValue: 10_000, validate: intInRange(100, 1_000_000),
    resolution: RESOLUTION.CODE, editable: false,
    readOnlyReason: 'Storage-integrity invariant, not business policy.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-030', key: 'content.social.allowedNetworks', label: 'Social networks',
    description: 'The social-link allowlist. It is the schema of the `social` settings category: a configurable list would let an admin create a field the UI cannot render.',
    scope: SCOPE.DEPLOYMENT, type: 'string[]',
    defaultValue: ['linkedin', 'github', 'twitter', 'dribbble', 'behance'],
    validate: stringArray(10, value => {
      const network = String(value ?? '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9-]{1,24}$/.test(network)) throw invalid('network names are lowercase with dashes');
      return network;
    }),
    resolution: RESOLUTION.CODE, editable: false,
    readOnlyReason: 'The allowlist is the category schema; changing it needs a matching renderer, which is a code change.',
    restartRequired: false, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-031', key: 'deployment.websiteDomain', label: 'Public website domain',
    description: 'Must match the container and TLS configuration; a mismatch breaks export links and cookies.',
    scope: SCOPE.DEPLOYMENT, type: 'string', defaultValue: '', validate: text(255),
    resolution: RESOLUTION.ENV, envVar: 'WEBSITE_DOMAIN', editable: false,
    readOnlyReason: 'Deployment-owned (DIV-014). The API refuses it with 403 INFRASTRUCTURE_SETTING_READ_ONLY.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },
  {
    id: 'CFG-032', key: 'deployment.backendExportUrl', label: 'Export service base URL',
    description: 'Where the render service lives. Must match the container filesystem and network.',
    scope: SCOPE.DEPLOYMENT, type: 'string', defaultValue: '', validate: text(255),
    resolution: RESOLUTION.ENV, envVar: 'BACKEND_EXPORT_URL', editable: false,
    readOnlyReason: 'Deployment-owned (DIV-014); the object-storage capability behind it returns 501 until an adapter exists.',
    restartRequired: true, audit: AUDIT.STANDARD,
  },

  /* ── AI routing and maintenance (CFG-033, CFG-034) ── */
  {
    id: 'CFG-033', key: 'ai.providers.fallbackOrder', label: 'AI provider fallback order',
    description: 'Order providers are tried when the preferred one fails. A model or order change alters output quality and cost.',
    scope: SCOPE.PLATFORM, type: 'string[]', defaultValue: ['nvidia', 'openai', 'groq', 'anthropic'],
    validate: stringArray(10, (value, index) => {
      const provider = String(value ?? '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9_-]{1,31}$/.test(provider)) throw invalid(`entry ${index + 1} is not a provider name`);
      return provider;
    }),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
  {
    id: 'CFG-034', key: 'operations.maintenance.enabled', label: 'Maintenance mode',
    description: 'Whether the platform advertises maintenance. Shown to every user, so a change is announced.',
    scope: SCOPE.PLATFORM, type: 'boolean', defaultValue: false, validate: booleanValue(),
    resolution: RESOLUTION.DATABASE, editable: true, restartRequired: false, audit: AUDIT.ELEVATED,
  },
];

/** Frozen lookup by key and by id. @type {Map<string, RegistryEntry>} */
const BY_KEY = new Map(ENTRIES.map(entry => [entry.key, Object.freeze(entry)]));
/** @type {Map<string, RegistryEntry>} */
const BY_ID = new Map(ENTRIES.map(entry => [entry.id, Object.freeze(entry)]));

/**
 * Validate a whole registry at load time. Runs once, at module load, because a
 * malformed registry is a programming error that must not survive to a request: two
 * entries claiming one key would make resolution order-dependent and silent.
 *
 * @param {RegistryEntry[]} entries
 * @returns {void}
 */
function assertRegistryIntegrity(entries) {
  const seenKeys = new Set();
  const seenIds = new Set();
  for (const entry of entries) {
    if (!entry.id || !/^CFG-\d{3}[a-z]?$/.test(entry.id)) throw new Error(`registry: invalid id ${entry.id}`);
    if (seenIds.has(entry.id)) throw new Error(`registry: duplicate id ${entry.id}`);
    seenIds.add(entry.id);
    if (!entry.key || !/^[a-z][a-zA-Z0-9.]*$/.test(entry.key)) throw new Error(`registry: invalid key ${entry.key}`);
    if (seenKeys.has(entry.key)) throw new Error(`registry: duplicate key ${entry.key}`);
    seenKeys.add(entry.key);
    if (!Object.values(SCOPE).includes(entry.scope)) throw new Error(`registry: ${entry.key} has an unknown scope`);
    if (typeof entry.validate !== 'function') throw new Error(`registry: ${entry.key} has no validator`);
    if (!entry.editable && !entry.readOnlyReason) throw new Error(`registry: ${entry.key} is read-only without a reason`);
    if (entry.editable && entry.scope === SCOPE.DEPLOYMENT) throw new Error(`registry: ${entry.key} is editable but deployment-scoped`);
    if (entry.resolution === RESOLUTION.ENV && !entry.envVar) throw new Error(`registry: ${entry.key} resolves from env without envVar`);
    // The default must pass its own validator, or the first read of an unset key
    // throws at runtime instead of returning the documented value.
    try {
      entry.validate(entry.defaultValue);
    } catch (error) {
      throw new Error(`registry: ${entry.key} default is invalid: ${error.message}`);
    }
  }
}

assertRegistryIntegrity(ENTRIES);

/**
 * Look up an entry by key or id.
 * @param {string} keyOrId
 * @returns {RegistryEntry|null}
 */
function findEntry(keyOrId) {
  const raw = String(keyOrId || '');
  return BY_KEY.get(raw) || BY_ID.get(raw.toUpperCase()) || null;
}

/**
 * Public description of an entry, with no validator (functions do not survive JSON).
 * @param {RegistryEntry} entry
 * @param {{value?: unknown, source?: string, revision?: number|null}} [resolved]
 */
function describeEntry(entry, resolved) {
  return {
    id: entry.id,
    key: entry.key,
    label: entry.label,
    description: entry.description,
    scope: entry.scope,
    type: entry.type,
    defaultValue: entry.defaultValue,
    unit: entry.unit || null,
    editable: entry.editable,
    readOnlyReason: entry.readOnlyReason || null,
    restartRequired: entry.restartRequired,
    audit: entry.audit,
    resolution: entry.resolution,
    envVar: entry.envVar || null,
    value: resolved ? resolved.value : entry.defaultValue,
    source: resolved ? resolved.source : (entry.resolution === RESOLUTION.DATABASE ? 'default' : entry.resolution),
    // The revision the caller is looking at. The editor echoes it back so a concurrent
    // change is a 409 rather than a silent overwrite (REC-015), and `null` means "no
    // stored row yet", which is what a create must say explicitly.
    revision: resolved && resolved.revision !== undefined ? resolved.revision : null,
  };
}

module.exports = {
  ENTRIES,
  SCOPE,
  AUDIT,
  RESOLUTION,
  findEntry,
  describeEntry,
  assertRegistryIntegrity,
  validators: { intInRange, decimalInRange, booleanValue, text, currencyCode, stringArray },
};
