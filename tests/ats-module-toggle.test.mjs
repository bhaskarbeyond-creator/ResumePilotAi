import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  evaluateAtsVisibilityMatrix,
  isAtsScoreModuleEnabled,
  isFallbackSettings,
  mergeSettingsCategory,
  resolveAtsScoreVisibility,
  resolveEnabledFlag,
} from '../src/utils/moduleFlags.js';

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
  assert.equal(isFallbackSettings({ _settingsSource: 'remote' }), false);
  assert.equal(isFallbackSettings({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(resolveAtsScoreVisibility({ _settingsSource: 'fallback' }), false);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableAtsScoreModule: true } }), true);
  assert.equal(resolveAtsScoreVisibility({ modules: {} }), true);
  assert.equal(resolveAtsScoreVisibility({ modules: { enableCouponsModule: false } }, { allowMissingDefault: false }), null);
});

test('ATS module is enabled only when the stored flag is explicitly true', () => {
  assert.equal(isAtsScoreModuleEnabled(undefined), true);
  assert.equal(isAtsScoreModuleEnabled({}), true);
  assert.equal(isAtsScoreModuleEnabled({ modules: {} }), true);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: true } }), true);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: false } }), false);
  assert.equal(isAtsScoreModuleEnabled({ modules: { enableAtsScoreModule: null } }), false);
  assert.equal(isAtsScoreModuleEnabled({ userSettings: { enableAtsScoreModule: true } }), true);
  assert.equal(isAtsScoreModuleEnabled({ features: { atsScoreEnabled: true } }), true);
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
  assert.match(build, /public_config/);
  assert.match(build, /onSnapshot/);
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
  assert.match(modules, /disabled=\{saving\}/);
  assert.match(modules, /settingsHydrated/);
  assert.match(modules, /_settingsSource === 'fallback'/);
});

test('getSystemSettings no longer times out into default-ON modules', () => {
  const operations = fs.readFileSync('src/firestore/dbOperations.js', 'utf8');
  assert.match(operations, /mergeSettingsCategory/);
  assert.match(operations, /enableAtsScoreModule: true/);
  assert.match(operations, /_settingsSource: 'remote'/);
  assert.match(operations, /_settingsSource: 'fallback'/);
  assert.doesNotMatch(operations, /setTimeout\(\(\) => resolve\(null\), 1200\)/);
  assert.doesNotMatch(operations, /enableAtsScoreModule:\s*settings/);
  assert.doesNotMatch(operations, /Promise\.race/);
});

test('backend settings persist booleans and merge partial modules payloads', () => {
  const backend = fs.readFileSync('backend/index.js', 'utf8');
  assert.match(backend, /mergeAdminSettingCategory/);
  assert.match(backend, /if \(value === null \|\| typeof value === 'boolean'\) return value;/);
  assert.match(backend, /GENERIC_ADMIN_SETTING_CATEGORIES = new Set\(\[[\s\S]*'modules'/);
  assert.match(backend, /transaction\.set\(publicRef, \{ \[category\]: publicSettings/);
});

test('users cannot write public_config or admin_configuration from the client', () => {
  const rules = fs.readFileSync('SecurityRules.txt', 'utf8');
  assert.match(rules, /allow read: if id in \['meta','frontendstats','public_config'\]/);
  assert.match(rules, /allow write: if admin\(\) && !\(id in \['meta','frontendstats','public_config'\]\)/);
  assert.match(rules, /allow write: if admin\(\) && recentAuth\(\) && !\(id in \['ai_providers','payment_providers','oauth_providers','admin_configuration'\]\)/);
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
  assert.match(cover, /public_config/);
  assert.match(cover, /onSnapshot/);
  assert.match(cover, /allowMissingDefault: false/);
  assert.match(cover, /handleCopyFormattedText = async/);
  assert.doesNotMatch(cover, /score: 95/);
  assert.match(cover, /Target Job Description \(Optional\)/);
});

test('Cover Letter module nav is hidden when enableCoverLetterModule is off', () => {
  const profile = fs.readFileSync('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx', 'utf8');
  assert.match(profile, /enableCoverLetterModule/);
  assert.match(profile, /modulesConfig\.enableCoverLetterModule &&/);
  assert.match(profile, /to=\"\/dashboard\/cover-letters\"/);
  const homepage = fs.readFileSync('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx', 'utf8');
  assert.match(homepage, /enableCoverLetterModule/);
  assert.match(homepage, /this\.state\.enableCoverLetterModule &&/);
});
