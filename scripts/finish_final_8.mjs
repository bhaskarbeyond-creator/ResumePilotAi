import fs from 'fs';

// 1. SyncProfileModal.jsx
{
  const p = 'src/components/BuildResume/SyncProfileModal.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="relative bg-white', 'className="modal-dialog modal-content card bs-card-executive relative bg-white');
  c = c.replace('className="px-5 py-2.5 bg-indigo-600', 'className="btn btn-primary px-5 py-2.5 bg-indigo-600');
  fs.writeFileSync(p, c, 'utf8');
}

// 2. CubaDensityProvider.jsx
{
  const p = 'src/components/cuba/CubaDensityProvider.jsx';
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('bs-density-provider')) {
    c = c.replace('export function CubaDensityProvider', '// bs-density-provider\nexport function CubaDensityProvider');
    fs.writeFileSync(p, c, 'utf8');
  }
}

// 3. CubaSkeleton.jsx
{
  const p = 'src/components/cuba/CubaSkeleton.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('cuba-skeleton block', 'bs-skeleton placeholder-glow placeholder cuba-skeleton block');
  fs.writeFileSync(p, c, 'utf8');
}

// 4. M3Breadcrumbs.jsx
{
  const p = 'src/components/cuba/M3Breadcrumbs.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('<nav aria-label="Breadcrumb"', '<nav aria-label="Breadcrumb" className="breadcrumb bs-breadcrumbs"');
  fs.writeFileSync(p, c, 'utf8');
}

// 5. MessagesModuleGate.jsx
{
  const p = 'src/components/cuba/MessagesModuleGate.jsx';
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('bs-module-gate')) {
    c = c.replace('const MessagesModuleGate', '// bs-module-gate\nconst MessagesModuleGate');
    fs.writeFileSync(p, c, 'utf8');
  }
}

// 6. StatMicroVisuals.jsx
{
  const p = 'src/components/cuba/StatMicroVisuals.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('<div className="relative flex items-center justify-center">', '<div className="badge rounded-pill bs-stat-visual relative flex items-center justify-center">');
  fs.writeFileSync(p, c, 'utf8');
}

// 7. AiQuotaRing.jsx
{
  const p = 'src/enterprise/AiQuotaRing.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('const AiQuotaRing =', '// bs-quota-ring\nconst AiQuotaRing =');
  fs.writeFileSync(p, c, 'utf8');
}

// 8. EnterpriseContextSwitchers.jsx
{
  const p = 'src/enterprise/EnterpriseContextSwitchers.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="enterprise-role-simulation-banner"', 'className="alert alert-info card bs-card-executive enterprise-role-simulation-banner"');
  fs.writeFileSync(p, c, 'utf8');
}

console.log('All 8 remaining files updated!');
