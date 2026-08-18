import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

test('51 Template Differentiation & Anti-Duplication Audit', async (t) => {
  const { THEME_PRESETS, ARCHETYPES } = await import('../src/engine/hybrid/themePresets.js');

  await t.test('All 51 templates (Cv1 to Cv51) have registered theme presets', () => {
    for (const id of CV_IDS) {
      const preset = THEME_PRESETS[id];
      assert.ok(preset, `Missing preset for ${id}`);
      assert.ok(preset.name, `Missing name for ${id}`);
      assert.ok(preset.archetype, `Missing archetype for ${id}`);
      assert.ok(preset.primary, `Missing primary color for ${id}`);
      assert.ok(preset.secondary, `Missing secondary color for ${id}`);
    }
  });

  await t.test('ZERO exact duplicate templates exist across all 51 templates', () => {
    const keys = Object.keys(THEME_PRESETS);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const idA = keys[i];
        const idB = keys[j];
        const a = THEME_PRESETS[idA];
        const b = THEME_PRESETS[idB];

        const exactMatch =
          a.archetype === b.archetype &&
          (a.sidebarPosition || 'left') === (b.sidebarPosition || 'left') &&
          a.primary.toLowerCase() === b.primary.toLowerCase() &&
          a.secondary.toLowerCase() === b.secondary.toLowerCase() &&
          (a.font || '').replace(/['", ]/g, '').toLowerCase() === (b.font || '').replace(/['", ]/g, '').toLowerCase() &&
          (a.dividerStyle || 'solid-thin') === (b.dividerStyle || 'solid-thin') &&
          (a.headerStyle || 'standard') === (b.headerStyle || 'standard');

        assert.equal(
          exactMatch,
          false,
          `Templates ${idA} (${a.name}) and ${idB} (${b.name}) are exact duplicates!`
        );
      }
    }
  });

  await t.test('Cv12 (Oxford Academic) and Cv38 (Global Legal) are meaningfully differentiated', () => {
    const cv12 = THEME_PRESETS.Cv12;
    const cv38 = THEME_PRESETS.Cv38;
    assert.notEqual(cv12.primary, cv38.primary, 'Cv12 and Cv38 must have different primary colors');
    assert.notEqual(cv12.name, cv38.name, 'Cv12 and Cv38 must have different names');
    assert.notEqual(cv12.dividerStyle, cv38.dividerStyle, 'Cv12 and Cv38 must have different divider styles');
    assert.notEqual(cv12.headerStyle, cv38.headerStyle, 'Cv12 and Cv38 must have different header styles');
  });

  await t.test('Cv40 (Europass Official) and Cv51 (Europass Modern) are meaningfully differentiated', () => {
    const cv40 = THEME_PRESETS.Cv40;
    const cv51 = THEME_PRESETS.Cv51;
    assert.notEqual(cv40.archetype, cv51.archetype, 'Cv40 and Cv51 must have different layout archetypes');
    assert.notEqual(cv40.primary, cv51.primary, 'Cv40 and Cv51 must have different primary colors');
    assert.equal(cv51.archetype, ARCHETYPES.MODERN_SPLIT, 'Cv51 is a modern split layout');
  });

  await t.test('Cv50 has unique right-sidebar split layout', () => {
    const cv50 = THEME_PRESETS.Cv50;
    assert.equal(cv50.sidebarPosition, 'right', 'Cv50 must be right sidebar layout');
  });

  await t.test('DOCX themes mirror SmartResumeComposer themePresets 100%', async () => {
    const { THEMES: docxThemes } = await import('../backend/services/docxThemes.js');
    for (const id of CV_IDS) {
      const p = THEME_PRESETS[id];
      const d = docxThemes[id];
      assert.ok(d, `Missing DOCX theme for ${id}`);
      assert.equal(d.archetype, p.archetype, `Archetype mismatch for ${id}`);
      assert.equal(d.primary, p.primary.replace('#', '').toUpperCase(), `Primary color mismatch for ${id}`);
    }
  });
});
