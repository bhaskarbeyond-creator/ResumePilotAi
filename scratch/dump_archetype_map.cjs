const {THEME_PRESETS} = require('./src/engine/hybrid/themePresets.js');

const ids = Object.keys(THEME_PRESETS).sort((a,b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));

const groups = {};
ids.forEach(id => {
  const a = THEME_PRESETS[id].archetype;
  if (!groups[a]) groups[a] = [];
  groups[a].push(id);
});

console.log('=== COMPLETE ARCHETYPE MAP (51 Templates) ===\n');
Object.entries(groups).forEach(([arch, list]) => {
  console.log(`${arch} (${list.length}):`);
  list.forEach(id => {
    const t = THEME_PRESETS[id];
    console.log(`  ${id}: "${t.name}" | primary=${t.primary} | sidebar=${t.sidebarBg || 'none'} | sidebarW=${t.sidebarWidth || 'none'} | header=${t.headerStyle} | skill=${t.skillVariant} | divider=${t.dividerStyle}`);
  });
  console.log('');
});

console.log(`\nTotal templates: ${ids.length}`);
