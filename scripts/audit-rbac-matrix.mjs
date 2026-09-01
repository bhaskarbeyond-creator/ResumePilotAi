import fs from 'fs';

const adminJsx = fs.readFileSync('src/components/admin/Admin.jsx', 'utf8');
const sidebarJsx = fs.readFileSync('src/components/admin/sidebar/sidebar.jsx', 'utf8');
const settingsJsx = fs.readFileSync('src/components/admin/settings/Settings.jsx', 'utf8');

console.log('=== ADMIN ROUTES IN ADMIN.JSX ===');
const routeMatches = [...adminJsx.matchAll(/<Route\s+path=["']([^"']+)["']\s+element=\{([\s\S]*?)\}/g)];
routeMatches.forEach(m => {
  const path = m[1];
  const elem = m[2].trim();
  const reqMatch = elem.match(/required=\{?([^}>]+)\}?/);
  const required = reqMatch ? reqMatch[1] : 'NONE';
  console.log(`Route: /adm/${path.padEnd(25)} Required: ${required}`);
});

console.log('\n=== SIDEBAR PATH PERMS IN SIDEBAR.JSX ===');
const pathPermsMatch = sidebarJsx.match(/const PATH_PERMS = Object\.freeze\(\{([\s\S]*?)\}\);/);
if (pathPermsMatch) {
  console.log(pathPermsMatch[1].trim());
}

console.log('\n=== SETTINGS GROUPS IN SIDEBAR.JSX ===');
const settingsGroupsMatch = sidebarJsx.match(/const SETTINGS_GROUPS = \[([\s\S]*?)\];/);
if (settingsGroupsMatch) {
  console.log(settingsGroupsMatch[1].trim());
}
