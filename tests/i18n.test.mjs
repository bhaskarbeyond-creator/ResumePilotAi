import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';

const localeRoot = path.resolve('src/locales');
const languageCodes = fs.readdirSync(localeRoot).sort();
const expectedCodes = ['de', 'dk', 'en', 'es', 'fr', 'gk', 'hi', 'is', 'it', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'se'];
const resources = {};

function flatten(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, result);
    else result[fullKey] = child;
  }
  return result;
}

function placeholders(value) {
  return [...String(value).matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}

for (const code of languageCodes) {
  const file = path.join(localeRoot, code, `${code}.json`);
  resources[code] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('configured locale inventory is complete and every locale is valid JSON with broad English coverage', () => {
  assert.deepEqual(languageCodes, expectedCodes);
  const english = flatten(resources.en);
  assert.ok(Object.keys(english).length > 1700);
  for (const code of languageCodes) {
    const locale = flatten(resources[code]);
    const coverage = Object.keys(english).filter((key) => Object.hasOwn(locale, key)).length / Object.keys(english).length;
    assert.ok(coverage >= 0.95, `${code} translation coverage fell to ${(coverage * 100).toFixed(1)}%`);
  }
});

test('translated interpolation tokens match English wherever a translated key exists', () => {
  const english = flatten(resources.en);
  const mismatches = [];
  for (const code of languageCodes) {
    const locale = flatten(resources[code]);
    for (const [key, value] of Object.entries(locale)) {
      if (!Object.hasOwn(english, key)) continue;
      if (placeholders(value).join('|') !== placeholders(english[key]).join('|')) mismatches.push(`${code}:${key}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('i18next falls back to English and interpolates without exposing raw tokens', async () => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: {
      en: { common: resources.en },
      de: { common: resources.de },
    },
    defaultNS: 'common',
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });
  assert.equal(instance.t('DashboardHomepage.title'), resources.en.DashboardHomepage.title);
  const interpolated = instance.t('BuildResume.progress.step', { current: 2, total: 8 });
  assert.match(interpolated, /2/);
  assert.match(interpolated, /8/);
  assert.doesNotMatch(interpolated, /{{/);
});
