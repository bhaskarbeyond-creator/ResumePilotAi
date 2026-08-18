import path from 'node:path';
import fs from 'node:fs';

async function analyzeAllTemplates() {
  const { THEME_PRESETS } = await import('../src/engine/hybrid/themePresets.js');

  const templates = [];
  for (let i = 1; i <= 51; i++) {
    const id = `Cv${i}`;
    const p = THEME_PRESETS[id];
    if (p) {
      templates.push({
        id,
        name: p.name,
        archetype: p.archetype,
        primary: p.primary,
        secondary: p.secondary,
        sidebarBg: p.sidebarBg || 'none',
        headerBg: p.headerBg || 'none',
        font: p.font ? p.font.replace(/['",]/g, '').trim() : 'default',
        skillVariant: p.skillVariant || 'default',
        timelineStyle: p.timelineStyle || 'none',
        dividerStyle: p.dividerStyle || 'none',
        headerAlign: p.headerAlign || 'none',
        density: p.density || 'standard'
      });
    }
  }

  // Archetype distribution
  const byArchetype = {};
  for (const t of templates) {
    if (!byArchetype[t.archetype]) byArchetype[t.archetype] = [];
    byArchetype[t.archetype].push(t);
  }

  console.log('=== 1. ARCHETYPE DISTRIBUTION (51 Templates) ===');
  for (const [arch, list] of Object.entries(byArchetype)) {
    console.log(`\n▶ ${arch.toUpperCase()} (${list.length} templates):`);
    console.log(`  ${list.map(t => `${t.id} (${t.name}, primary:${t.primary})`).join('\n  ')}`);
  }

  // Exact duplicates / identical twins by (archetype + primary color)
  console.log('\n=== 2. PRIMARY COLOR DUPLICATES WITHIN SAME ARCHETYPE ===');
  for (const [arch, list] of Object.entries(byArchetype)) {
    const byColor = {};
    for (const t of list) {
      const col = (t.primary || '').toLowerCase();
      if (!byColor[col]) byColor[col] = [];
      byColor[col].push(t);
    }
    for (const [col, group] of Object.entries(byColor)) {
      if (group.length > 1) {
        console.log(`\n⚠ Duplicates in Archetype [${arch}] with primary color [${col}]:`);
        group.forEach(g => {
          console.log(`   - ${g.id} ("${g.name}"): secondary=${g.secondary}, sidebarBg=${g.sidebarBg}, font=${g.font}`);
        });
      }
    }
  }

  // Look at legacy template JSX components in src/components/Templates/
  console.log('\n=== 3. LEGACY COMPONENT DRIFT / CLONES IN src/components/Templates ===');
  const legacyTemplates = [];
  for (let i = 1; i <= 51; i++) {
    const id = `Cv${i}`;
    const compDir = path.resolve(`src/components/Templates/${id}`);
    if (fs.existsSync(compDir)) {
      const files = fs.readdirSync(compDir);
      legacyTemplates.push({ id, files });
    }
  }
  console.log(`Found ${legacyTemplates.length} legacy template directories in src/components/Templates/`);
}

analyzeAllTemplates().catch(console.error);
