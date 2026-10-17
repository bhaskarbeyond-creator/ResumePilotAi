import fs from 'fs';

// 1. AtsScoreMeter.jsx
{
  const p = 'src/components/BuildResume/AtsScoreMeter.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center"', 'className="badge rounded-pill relative flex h-12 w-12 flex-shrink-0 items-center justify-center"');
  c = c.replace('chip: \'bg-indigo-50 border-indigo-200 text-indigo-800\'', 'chip: \'badge rounded-pill bg-indigo-50 border-indigo-200 text-indigo-800\'');
  c = c.replace('className="overflow-hidden rounded-2xl border', 'className="card bs-card-executive overflow-hidden rounded-2xl border');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed AtsScoreMeter.jsx');
}

// 2. CustomSectionsStep.jsx
{
  const p = 'src/components/BuildResume/steps/CustomSectionsStep.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2.5"', 'className="card bs-card-executive rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2.5"');
  c = c.replace('className="group flex items-center gap-1.5', 'className="btn btn-sm btn-outline-secondary group flex items-center gap-1.5');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed CustomSectionsStep.jsx');
}

// 3. LanguagesStep.jsx
{
  const p = 'src/components/BuildResume/steps/LanguagesStep.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="rounded-xl border border-[var(--cuba-line)] bg-white p-4 sm:p-5 shadow-2xs space-y-3"', 'className="card bs-card-executive rounded-xl border border-[var(--cuba-line)] bg-white p-4 sm:p-5 shadow-2xs space-y-3"');
  c = c.replace('className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border', 'className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed LanguagesStep.jsx');
}

// 4. SyncProfileModal.jsx
{
  const p = 'src/components/BuildResume/SyncProfileModal.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="relative bg-white rounded-2xl', 'className="modal-content card bs-card-executive relative bg-white rounded-2xl');
  c = c.replace('className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border', 'className="btn btn-outline-secondary px-4 py-2 text-sm font-semibold text-slate-700 bg-white border');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed SyncProfileModal.jsx');
}

// 5. CubaDensityProvider.jsx
{
  const p = 'src/components/cuba/CubaDensityProvider.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('cuba-density-root', 'container-fluid bs-density-root');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed CubaDensityProvider.jsx');
}

// 6. CubaSkeleton.jsx
{
  const p = 'src/components/cuba/CubaSkeleton.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('cuba-skeleton block', 'placeholder-glow placeholder cuba-skeleton block');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed CubaSkeleton.jsx');
}

// 7. CubaStickyRail.jsx
{
  const p = 'src/components/cuba/CubaStickyRail.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('cuba-sticky-rail', 'card bs-sticky-rail sticky-top cuba-sticky-rail');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed CubaStickyRail.jsx');
}

// 8. M3Breadcrumbs.jsx
{
  const p = 'src/components/cuba/M3Breadcrumbs.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="flex items-center gap-1.5', 'className="breadcrumb flex items-center gap-1.5');
  c = c.replace('className="inline-flex items-center gap-1', 'className="breadcrumb-item inline-flex items-center gap-1');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed M3Breadcrumbs.jsx');
}

// 9. MessagesModuleGate.jsx
{
  const p = 'src/components/cuba/MessagesModuleGate.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="rounded-xl border border-[var(--cuba-line)]', 'className="card bs-card-executive alert alert-warning rounded-xl border border-[var(--cuba-line)]');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed MessagesModuleGate.jsx');
}

// 10. StatMicroVisuals.jsx
{
  const p = 'src/components/cuba/StatMicroVisuals.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="relative flex items-center', 'className="badge rounded-pill relative flex items-center');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed StatMicroVisuals.jsx');
}

// 11. AiQuotaRing.jsx
{
  const p = 'src/enterprise/AiQuotaRing.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="relative inline-flex items-center justify-center"', 'className="badge rounded-pill relative inline-flex items-center justify-center"');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed AiQuotaRing.jsx');
}

// 12. EnterpriseContextSwitchers.jsx
{
  const p = 'src/enterprise/EnterpriseContextSwitchers.jsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('className="enterprise-context-switcher-panel"', 'className="btn-group card bs-card-executive enterprise-context-switcher-panel"');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Fixed EnterpriseContextSwitchers.jsx');
}
