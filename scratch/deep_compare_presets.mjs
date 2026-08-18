import path from 'node:path';
import fs from 'node:fs';

async function deepCompareAllPresets() {
  const { THEME_PRESETS } = await import('../src/engine/hybrid/themePresets.js');

  const keys = Object.keys(THEME_PRESETS);
  console.log(`Analyzing all ${keys.length} template presets for duplicates/redundancies...\n`);

  const duplicates = [];
  const highlySimilar = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const idA = keys[i];
      const idB = keys[j];
      const a = THEME_PRESETS[idA];
      const b = THEME_PRESETS[idB];

      // Exact match check
      const sameArchetype = a.archetype === b.archetype;
      const samePrimary = (a.primary || '').toLowerCase() === (b.primary || '').toLowerCase();
      const sameSecondary = (a.secondary || '').toLowerCase() === (b.secondary || '').toLowerCase();
      const sameSidebarBg = (a.sidebarBg || 'none').toLowerCase() === (b.sidebarBg || 'none').toLowerCase();
      const sameFont = (a.font || '').replace(/['", ]/g, '').toLowerCase() === (b.font || '').replace(/['", ]/g, '').toLowerCase();
      const sameSkillVariant = a.skillVariant === b.skillVariant;
      const sameTimelineStyle = a.timelineStyle === b.timelineStyle;
      const sameDividerStyle = a.dividerStyle === b.dividerStyle;

      if (sameArchetype && samePrimary && sameSecondary && sameSidebarBg && sameFont) {
        duplicates.push({
          pair: `${idA} ↔ ${idB}`,
          archetype: a.archetype,
          nameA: a.name,
          nameB: b.name,
          primary: a.primary,
          secondary: a.secondary,
          sidebarBg: a.sidebarBg,
          font: a.font
        });
      } else if (sameArchetype && samePrimary && sameSidebarBg) {
        highlySimilar.push({
          pair: `${idA} ↔ ${idB}`,
          archetype: a.archetype,
          nameA: a.name,
          nameB: b.name,
          primary: a.primary,
          diff: `Sec: (${a.secondary} vs ${b.secondary}), Font: (${a.font} vs ${b.font})`
        });
      }
    }
  }

  console.log('=== EXACT DUPLICATES (Identical Archetype + Colors + Layout + Font) ===');
  console.table(duplicates);

  console.log('\n=== HIGHLY SIMILAR TWINS (Identical Archetype + Primary Color + Sidebar Style) ===');
  console.table(highlySimilar);
}

deepCompareAllPresets().catch(console.error);
