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

  // The assertion above only compared archetype + primary, which let every
  // other design token drift silently: before this was tightened the DOCX
  // registry disagreed with the PDF presets on headerStyle for 51/51
  // templates, timelineStyle for 31, dividerStyle for 11 and density for 1.
  await t.test('every DOCX design token mirrors the PDF preset (no silent drift)', async () => {
    const { THEMES: docxThemes } = await import('../backend/services/docxThemes.js');
    const drift = [];
    for (const id of CV_IDS) {
      const p = THEME_PRESETS[id];
      const d = docxThemes[id];
      const expected = {
        name: p.name,
        secondary: p.secondary.replace('#', '').toUpperCase(),
        skillVariant: p.skillVariant || 'pills',
        headerStyle: p.headerStyle || 'standard',
        dividerStyle: p.dividerStyle || 'solid-thin',
        timelineStyle: p.timelineStyle || 'modern-node',
        density: p.density || 'standard',
        sidebarPosition: p.sidebarPosition || 'left',
        sidebarWidth: p.sidebarWidth
          ? Math.min(42, Math.max(28, parseFloat(p.sidebarWidth)))
          : 34,
      };
      for (const [field, value] of Object.entries(expected)) {
        if (String(d[field]) !== String(value)) {
          drift.push(`${id}.${field}: pdf=${value} docx=${d[field]}`);
        }
      }
    }
    assert.deepEqual(drift, [], `DOCX theme registry drifted from themePresets:\n${drift.join('\n')}`);
  });

  // "Different colour" is not differentiation. Two templates that share every
  // structural token render as pixel twins once the palette is normalised.
  await t.test('no two templates share an identical structural fingerprint', () => {
    const structural = ['archetype', 'sidebarPosition', 'sidebarWidth', 'font', 'skillVariant',
      'headerStyle', 'dividerStyle', 'timelineStyle', 'density', 'badgeRadius'];
    const seen = new Map();
    const collisions = [];
    for (const id of CV_IDS) {
      const preset = THEME_PRESETS[id];
      const fingerprint = structural.map((key) => String(preset[key])).join('|');
      if (seen.has(fingerprint)) collisions.push(`${seen.get(fingerprint)} == ${id} (${fingerprint})`);
      else seen.set(fingerprint, id);
    }
    assert.deepEqual(collisions, [], `structural twins found:\n${collisions.join('\n')}`);
  });

  // Every declared design token must be consumed by the renderer, otherwise a
  // preset can promise differentiation the engine never delivers (this is how
  // `density` stayed inert across all 51 templates).
  await t.test('declared design tokens are actually consumed by the render engine', async () => {
    const fs = await import('node:fs');
    const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    const engine = [
      read('../src/engine/hybrid/SmartResumeComposer.jsx'),
      read('../src/engine/hybrid/smartPartitioner.js'),
      read('../src/engine/hybrid/components/SmartSkills.jsx'),
      read('../src/engine/hybrid/components/SmartExperience.jsx'),
      read('../src/engine/hybrid/components/SmartHeader.jsx'),
    ].join('\n');
    const css = read('../src/engine/hybrid/smartEngine.css');

    for (const token of ['density', 'skillVariant', 'dividerStyle', 'timelineStyle', 'sidebarWidth', 'sidebarPosition', 'badgeRadius']) {
      assert.ok(engine.includes(token), `theme token "${token}" is declared but never read by the engine`);
    }
    // Every skill variant and density level in use must have styling.
    const variants = new Set(CV_IDS.map((id) => THEME_PRESETS[id].skillVariant || 'pills'));
    for (const variant of variants) {
      assert.ok(css.includes(`.smart-skills-grid--${variant}`), `skill variant "${variant}" has no CSS`);
    }
    const densities = new Set(CV_IDS.map((id) => THEME_PRESETS[id].density || 'standard'));
    for (const density of densities) {
      assert.ok(css.includes(`data-density='${density}'`) || density === 'standard',
        `density "${density}" has no CSS scale`);
    }
  });

  // The A4 sheets the composer paints must survive print media: without these
  // rules Chromium's paged box carried the on-screen document padding/gap into
  // the PDF and every template produced N+1 pages with sliver/orphan pages.
  await t.test('print media neutralises the on-screen document shell', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(new URL('../src/engine/hybrid/smartEngine.css', import.meta.url), 'utf8');
    const printBlock = css.slice(css.lastIndexOf('@media print'));
    assert.match(printBlock, /\.smart-resume-document/, 'print block must neutralise the document shell');
    assert.match(printBlock, /gap:\s*0\s*!important/, 'inter-sheet gap must be removed for print');
    assert.match(printBlock, /padding:\s*0\s*!important/, 'document padding must be removed for print');
    assert.match(printBlock, /page-break-after:\s*always/, 'each sheet must map to exactly one physical page');
    assert.match(printBlock, /\.smart-resume-page:last-child/, 'the final sheet must not emit a trailing blank page');
  });
});
