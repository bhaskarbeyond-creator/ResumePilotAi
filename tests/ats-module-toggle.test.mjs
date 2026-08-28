import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildModuleSettingsPatch, evaluateAtsVisibilityMatrix, isAtsScoreModuleEnabled, isFallbackSettings, mergeSettingsCategory, resolveAtsScoreVisibility, resolveEnabledFlag } from '../src/utils/moduleFlags.js';

const require = createRequire(import.meta.url);
const { mergeAdminSettingCategory } = require('../backend/services/adminSettingsMerge.js');

const FOUR_STATES = [
  { ats: true, optimization: true, expectedAts: true, expectedOpt: true },
  { ats: true, optimization: false, expectedAts: true, expectedOpt: true },
  { ats: false, optimization: true, expectedAts: false, expectedOpt: false },
  { ats: false, optimization: false, expectedAts: false, expectedOpt: false },
];

test('explicit false never becomes true through flag resolution', () => {
  assert.equal(resolveEnabledFlag(undefined, true), true);
  assert.equal(resolveEnabledFlag(null, true), false);
  assert.equal(resolveEnabledFlag(false, true), false);
  assert.equal(resolveEnabledFlag(true, true), true);
  assert.equal(resolveEnabledFlag(0, true), false);
  assert.equal(resolveEnabledFlag('', true), false);
  assert.equal(resolveEnabledFlag('false', true), false);
});

test('fallback settings never enable ATS and partial patches keep the last known flag', () => {
  assert.equal(isFallbackSettings({ _settingsSource: 'fallback' }), true);
  assert.equal(isFallbackSettings({ _settingsSource: 'safe-defaults', _settingsStale: true }), true);
  assert.equal(isFallbackSettings({ _settingsSource: 'stale-cache', _settingsStale: true }), true);
  assert.equal(isFallbackSettings({ _settingsSource: 'unavailable', _settingsStale: true }), true);
  assert.equal(isFallbackSettings({ _settingsSource: 'remote', _settingsStale: false }), false);
  assert.equal(isFallbackSettings({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(resolveAtsScoreVisibility({ _settingsSource: 'fallback' }), false);
  // The real outage payload itself is disabled and its provenance independently
  // forces consumers closed.
  assert.equal(resolveAtsScoreVisibility({
    _settingsSource: 'unavailable',
    _settingsStale: true,
    modules: { enableAtsScoreModule: false },
  }), false);
  assert.equal(resolveAtsScoreVisibility({
    _settingsSource: 'stale-cache',
    _settingsStale: true,
    modules: { enableAtsScoreModule: true },
  }), false);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableAtsScoreModule: true } }), true);
  assert.equal(resolveAtsScoreVisibility({ modules: {} }), false);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableCouponsModule: false } }, { allowMissingDefault: false }), null);
});

test('configuration provenance rejects defaults and stale snapshots, and accepts backend-confirmed values', () => {
  const fallback = { _settingsSource: 'fallback', modules: { enableAtsScoreModule: true } };
  const remote = { _settingsSource: 'remote', _settingsStale: false, modules: { enableAtsScoreModule: true } };
  const priorServerValue = { _settingsSource: 'stale-cache', _settingsStale: true, modules: { enableAtsScoreModule: true } };
  assert.equal(resolveAtsScoreVisibility(fallback), false);
  assert.equal(resolveAtsScoreVisibility(remote), true);
  assert.equal(resolveAtsScoreVisibility(priorServerValue), false);
});

test('ATS module is enabled only when the stored flag is explicitly true', () => {
  assert.equal(isAtsScoreModuleEnabled(undefined), false);
  assert.equal(isAtsScoreModuleEnabled({}), false);
  assert.equal(isAtsScoreModuleEnabled({ modules: {} }), false);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: true } }), true);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: null } }), false);
  assert.equal(isAtsScoreModuleEnabled({ _settingsSource: 'fallback', modules: { enableAtsScoreModule: true } }), false);
  assert.equal(isAtsScoreModuleEnabled({ userSettings: { enableAtsScoreModule: true } }), false);
  assert.equal(isAtsScoreModuleEnabled({ features: { atsScoreEnabled: true } }), false);
});

test('default-object merge preserves explicit false', () => {
  const defaults = { enableAtsScoreModule: true, enableImportModule: false };
  const remoteOff = { enableAtsScoreModule: false, enableCouponsModule: true };
  const merged = mergeSettingsCategory(defaults, remoteOff);
  assert.equal(merged.enableAtsScoreModule, false);
  assert.equal(merged.enableImportModule, false);
  assert.equal(merged.enableCouponsModule, true);

  const fallbackOverFalse = mergeSettingsCategory(
    { enableAtsScoreModule: false },
    { enableAtsScoreModule: true },
  );
  assert.equal(fallbackOverFalse.enableAtsScoreModule, true);
});

test('partial admin modules writes must not resurrect ATS after OFF', () => {
  const storedOff = {
    enableAtsScoreModule: false,
    enableImportModule: false,
    enableCouponsModule: true,
    enableCoverLetterModule: true,
  };
  const socialAuthPartial = {
    enableLinkedinLogin: true,
    enableGithubLogin: false,
  };
  const afterSocialSave = mergeAdminSettingCategory(storedOff, socialAuthPartial);
  assert.equal(afterSocialSave.enableAtsScoreModule, false);
  assert.equal(afterSocialSave.enableLinkedinLogin, true);

  const couponPartial = { enableCouponsModule: false };
  const afterCouponSave = mergeAdminSettingCategory(afterSocialSave, couponPartial);
  assert.equal(afterCouponSave.enableAtsScoreModule, false);
  assert.equal(afterCouponSave.enableCouponsModule, false);
});

test('auto-save patches only the touched module so stale siblings cannot overwrite ATS OFF', () => {
  const staleTab = {
    enableAtsScoreModule: true,
    enableCoverLetterModule: true,
    enableJobScraperModule: false,
  };
  const patch = buildModuleSettingsPatch(staleTab, 'enableJobScraperModule');
  assert.deepEqual(patch, { enableJobScraperModule: false });

  const currentServer = {
    enableAtsScoreModule: false,
    enableCoverLetterModule: true,
    enableJobScraperModule: true,
  };
  const merged = mergeAdminSettingCategory(currentServer, patch);
  assert.equal(merged.enableAtsScoreModule, false);
  assert.equal(merged.enableJobScraperModule, false);
});

test('four-state matrix: ATS and Optimization share enableAtsScoreModule', () => {
  for (const row of FOUR_STATES) {
    const result = evaluateAtsVisibilityMatrix(row.ats);
    assert.equal(result.sharedFlag, 'enableAtsScoreModule');
    assert.equal(result.atsScoreChecker, row.expectedAts, `ATS visibility for ${JSON.stringify(row)}`);
    assert.equal(result.optimizationMeter, row.expectedOpt, `Optimization visibility for ${JSON.stringify(row)}`);
  }
});

test('BuildResume gates both ATS meter mounts and fail-closes on load errors', () => {
  const build = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');
  assert.match(build, /resolveAtsScoreVisibility/);
  const flags = fs.readFileSync('src/utils/moduleFlags.js', 'utf8');
  assert.match(flags, /enableAtsScoreModule/);
  assert.match(build, /isAtsEnabled === true/);
  assert.match(build, /setIsAtsEnabled\(false\)/);
  assert.match(build, /getSystemSettings\(\)/);
  assert.match(build, /systemSettingsUpdated/);
  assert.doesNotMatch(build, /onSnapshot|settingsFromSnapshot|includeMetadataChanges/);
  assert.equal((build.match(/<AtsScoreMeter /g) || []).length, 2);
  assert.match(build, /\{isAtsEnabled === true && \(/);
  assert.doesNotMatch(build, /setIsAtsEnabled\(true\)/);
  assert.match(build, /allowMissingDefault: false/);
});

test('Modules Manager auto-saves the same flag users consume and reverts a failed OFF', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enableAtsScoreModule/);
  assert.match(modules, /ATS Score Checker & Optimization Meter/);
  assert.match(modules, /persistModules/);
  assert.match(modules, /saveSystemSettings\('modules'/);
  assert.match(modules, /systemSettingsUpdated/);
  assert.match(modules, /setModulesConfig\(previousConfig\)/);
  assert.match(modules, /disabled=\{saving \|\| !settingsHydrated\}/);
  assert.match(modules, /buildModuleSettingsPatch/);
  assert.match(modules, /moduleSave\.settings/);
  assert.doesNotMatch(modules, /saveSystemSettings\('ai'/);
  assert.match(modules, /settingsHydrated/);
  assert.match(modules, /_settingsSource === 'remote'/);
});

test('getSystemSettings returns an explicitly unavailable, default-OFF module payload on outage', () => {
  const operations = fs.readFileSync('src/services/api/platform.js', 'utf8');
  assert.match(operations, /enableAtsScoreModule: false/);
  assert.match(operations, /_settingsSource: 'remote'/);
  assert.match(operations, /fallbackSource = 'unavailable'/);
  assert.match(operations, /modules: \{ \.\.\.envDefaults\.modules \}/);
  // Settings are read from the MySQL-backed platform config API, never Firestore.
  assert.match(operations, /apiJson\('\/api\/platform\/public-config'\)/);
  assert.doesNotMatch(operations, /body: JSON\.stringify\(\{ data, expectedRevision: -1 \}\)/);
  assert.doesNotMatch(operations, /setTimeout\(\(\) => resolve\(null\), 1200\)/);
  assert.doesNotMatch(operations, /enableAtsScoreModule:\s*true/);
  assert.doesNotMatch(operations, /Promise\.race/);
});

test('backend settings persist booleans and merge partial modules payloads', () => {
  const backend = fs.readFileSync('backend/index.js', 'utf8');
  assert.match(backend, /mergeAdminSettingCategory/);
  assert.match(backend, /if \(value === null \|\| typeof value === 'boolean'\) return value;/);
  assert.match(backend, /GENERIC_ADMIN_SETTING_CATEGORIES = new Set\(\[[\s\S]*'modules'/);
  assert.match(backend, /publicAdminSettings\(category, persisted\)/);
  assert.match(backend, /system_settings.*ON DUPLICATE KEY UPDATE data = VALUES\(data\)/s);
});

test('browser users can read the public projection but only authorized admins can mutate settings', () => {
  const index = fs.readFileSync('backend/index.js', 'utf8');
  const policy = fs.readFileSync('backend/security/policy.js', 'utf8');
  const platform = fs.readFileSync('backend/routes/platform.js', 'utf8');
  assert.match(index, /'\/platform\/public-config'/);
  assert.match(index, /app\.post\('\/api\/admin\/settings\/:category'/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /hasPermission\(req, 'system\.config\.write'\)/);
  assert.match(platform, /repo\.getSetting\('public_config'\)/);
  assert.doesNotMatch(platform, /router\.post\('\/public-config'/);
});

test('no second Optimization Meter flag exists in the modules manager', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.doesNotMatch(modules, /enableOptimizationMeterModule|optimizationMeterEnabled|showOptimizationMeter/);
  assert.equal((modules.match(/enableAtsScoreModule/g) || []).length >= 3, true);
});

test('coupon toggle writes only its own flag so backend merge keeps ATS OFF', () => {
  const subscriptions = fs.readFileSync('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8');
  assert.match(subscriptions, /saveSystemSettings\('modules', \{ enableCouponsModule: nextState \}\)/);
  assert.doesNotMatch(subscriptions, /updatedMods = \{ \.\.\.mods, enableCouponsModule/);
});

test('Cover Letter ATS UI is fail-closed on the same enableAtsScoreModule flag', () => {
  const cover = fs.readFileSync('src/components/CoverLetter/CoverLetter.jsx', 'utf8');
  assert.match(cover, /resolveAtsScoreVisibility/);
  assert.match(cover, /isAtsEnabled: null/);
  assert.match(cover, /setState\(\{ isAtsEnabled: false \}\)/);
  assert.match(cover, /isAtsEnabled === true/);
  assert.match(cover, /getSystemSettings\(\)/);
  assert.match(cover, /systemSettingsUpdated/);
  assert.doesNotMatch(cover, /onSnapshot|settingsFromSnapshot|includeMetadataChanges/);
  assert.match(cover, /allowMissingDefault: false/);
  assert.match(cover, /handleCopyFormattedText = async/);
  assert.doesNotMatch(cover, /score: 95/);
  assert.match(cover, /Target Job Description \(Optional\)/);
});

test('the app shell relays validated backend module settings to every consumer', () => {
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert.match(main, /fetch\('\/api\/platform\/public-config'\)/);
  assert.match(main, /if \(!response\.ok\) throw/);
  assert.match(main, /settings\?\.modules/);
  assert.match(main, /source: 'backend-api'/);
  assert.match(main, /new CustomEvent\('systemSettingsUpdated'/);
  assert.doesNotMatch(main, /onSnapshot|settingsFromSnapshot|firestore-server/);
});

test('Cover Letter module nav is hidden when enableCoverLetterModule is off', () => {
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enableCoverLetterModule/);
  assert.match(profile, /modulesConfig\.enableCoverLetterModule &&/);
  assert.match(profile, /to="\/dashboard\/cover-letters"/);
  const homepage = fs.readFileSync('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx', 'utf8');
  assert.match(homepage, /enableCoverLetterModule/);
  assert.match(homepage, /this\.state\.enableCoverLetterModule &&/);
});

test('Portfolios & Web CV module toggle is off by default and controllable via admin Addon Modules', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enablePortfolioModule:\s*false/);
  assert.match(modules, /Portfolios & Web CV Module/);
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enablePortfolioModule:\s*false/);
  assert.match(profile, /modulesConfig\.enablePortfolioModule &&/);
  assert.match(profile, /to="\/dashboard\/portfolios"/);
  const dbOps = fs.readFileSync('src/services/api/platform.js', 'utf8');
  assert.match(dbOps, /enablePortfolioModule:\s*false/);
});

test('Messages & Chat module toggle is off by default and controllable via admin Addon Modules', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enableMessagesModule:\s*false/);
  assert.match(modules, /Messages & Chat Module/);
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enableMessagesModule:\s*false/);
  assert.match(profile, /modulesConfig\.enableMessagesModule &&/);
  assert.match(profile, /to="\/dashboard\/messages"/);
  const dbOps = fs.readFileSync('src/services/api/platform.js', 'utf8');
  assert.match(dbOps, /enableMessagesModule:\s*false/);
});

test('Job Tracker module toggle is off by default and controllable via admin Addon Modules', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enableJobTrackerModule:\s*false/);
  assert.match(modules, /Job Tracker Module/);
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enableJobTrackerModule:\s*false/);
  assert.match(profile, /modulesConfig\.enableJobTrackerModule &&/);
  assert.match(profile, /to="\/dashboard\/job-tracker"/);
  const dbOps = fs.readFileSync('src/services/api/platform.js', 'utf8');
  assert.match(dbOps, /enableJobTrackerModule:\s*false/);
});

test('My Applications module toggle is off by default and controllable via admin Addon Modules', () => {
  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enableAppliedJobsModule:\s*false/);
  assert.match(modules, /My Applications Module/);
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enableAppliedJobsModule:\s*false/);
  assert.match(profile, /modulesConfig\.enableAppliedJobsModule &&/);
  assert.match(profile, /to="\/dashboard\/applied-jobs"/);
  const dbOps = fs.readFileSync('src/services/api/platform.js', 'utf8');
  assert.match(dbOps, /enableAppliedJobsModule:\s*false/);
});


