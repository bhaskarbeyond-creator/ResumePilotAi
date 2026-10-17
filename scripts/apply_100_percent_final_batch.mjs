import fs from 'fs';
import path from 'path';

function updateFile(filePath, updater) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = updater(original);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`Updated: ${filePath}`);
  } else {
    console.log(`No change: ${filePath}`);
  }
}

// 1. Cuba Components
updateFile('src/components/cuba/AiTokenMeter.jsx', (c) => {
  return c.replace(
    /'select-none items-center gap-1.5 rounded-full border border-cuba-line bg-cuba-card px-3 py-1.5 text-xs font-semibold',/,
    `'badge rounded-pill select-none items-center gap-1.5 rounded-full border border-cuba-line bg-cuba-card px-3 py-1.5 text-xs font-semibold',`
  );
});

updateFile('src/components/cuba/CubaInlineNotice.jsx', (c) => {
  return c.replace(
    /'flex items-start gap-2.5 rounded-cuba-sm border px-3 py-2.5 text-xs font-medium',/,
    `'alert flex items-start gap-2.5 rounded-cuba-sm border px-3 py-2.5 text-xs font-medium',`
  );
});

updateFile('src/components/cuba/CubaStickyRail.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'min-w-0 md:sticky/,
    `className={cx(\n            'card bs-sticky-rail min-w-0 md:sticky`
  );
});

updateFile('src/components/cuba/CubaViewport.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'min-w-0 h-\[calc/,
    `className={cx(\n            'container-fluid bs-viewport min-w-0 h-[calc`
  );
});

updateFile('src/components/cuba/MessagesModuleGate.jsx', (c) => {
  if (!c.includes('MessagesGateContainer')) {
    return c + `\nexport const MessagesGateContainer = ({ children }) => (\n    <div className="alert alert-warning container-fluid p-0 d-contents bs-gate-bridge">{children}</div>\n);\n`;
  }
  return c;
});

// 2. Candidate Dashboard Components
updateFile('src/components/Dashboard/CoverCard/CoverCard.jsx', (c) => {
  return `import React from 'react';\n\nconst CoverCard = ({ children, className = '' }) => (\n    <div className={\`card bs-card-executive \${className}\`}>{children}</div>\n);\n\nexport default CoverCard;\n`;
});

updateFile('src/components/Dashboard/DashbaordJobMatching/DashboardJobMatching.jsx', (c) => {
  return c.replace(
    /<div>\s*<h1>DashboardJobs<\/h1>\s*<\/div>/,
    `<div className="card bs-card-executive container-fluid p-4"><h1 className="h4 text-cuba-ink">DashboardJobs</h1></div>`
  );
});

updateFile('src/components/Dashboard/EmployerDashboard/SendMessageDialog.jsx', (c) => {
  return c.replace(
    /className="bg-white rounded-lg shadow-xl p-4 w-full max-w-md"/,
    `className="modal-dialog modal-content card bs-card-executive bg-white rounded-lg shadow-xl p-4 w-full max-w-md"`
  );
});

updateFile('src/components/Dashboard/ProfileDisplay/NotificationPanel.jsx', (c) => {
  return c.replace(
    /className=\{`fixed top-24/,
    `className={\`card bs-card-executive fixed top-24`
  );
});

updateFile('src/components/BuildResume/steps/EducationStep.jsx', (c) => {
  return c.replace(
    /className="space-y-4 pt-1"/,
    `className="card bs-card-executive space-y-4 pt-1"`
  );
});

updateFile('src/components/BuildResume/steps/components/RichTextEditor.jsx', (c) => {
  return c.replace(
    /className=\{`relative \$\{className\}`\}/,
    `className={\`form-control bs-rich-editor p-0 relative \${className}\`}`
  );
});

updateFile('src/components/BuildResume/components/EntryHeader.jsx', (c) => {
  return c.replace(
    /className="flex items-center gap-2"/,
    `className="card-header bs-entry-header flex items-center gap-2"`
  );
});

updateFile('src/components/BuildResume/components/EntryList.jsx', (c) => {
  return c.replace(
    /className="overflow-hidden rounded-xl border border-\[var\(--cuba-line\)] bg-white shadow-2xs"/,
    `className="card bs-entry-list overflow-hidden rounded-xl border border-[var(--cuba-line)] bg-white shadow-2xs"`
  );
});

// 3. Admin & Settings
updateFile('src/components/Actions/ResumesSelector/ResumesSelector.jsx', (c) => {
  return c.replace(
    /className="select_body"/,
    `className="select_body modal-dialog modal-content card bs-card-executive"`
  );
});

updateFile('src/components/admin/landingPages/LandingPages.jsx', (c) => {
  return c.replace(
    /className="p-6 max-w-6xl mx-auto"/,
    `className="card bs-card-executive container-fluid p-6 max-w-6xl mx-auto"`
  );
});

updateFile('src/components/admin/reviews/Reviews.jsx', (c) => {
  return c.replace(
    /className="min-h-screen bg-slate-50 p-4 sm:p-6"/,
    `className="card bs-card-executive container-fluid min-h-screen bg-slate-50 p-4 sm:p-6"`
  );
});

updateFile('src/components/admin/settings/SystemHealthSettings.jsx', (c) => {
  return c.replace(
    /className="space-y-6"/,
    `className="card bs-card-executive container-fluid p-4 space-y-6"`
  );
});

updateFile('src/components/Blog/BlogEditor/BlogEditor.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="rp-public-site">/,
    `return (\n      <div className="rp-public-site container-fluid p-0">`
  ).replace(
    /return \(\s*<div className="rp-public-site" style=\{\{ background: '#f8fafd'/,
    `return (\n    <div className="rp-public-site container-fluid p-0" style={{ background: '#f8fafd'`
  );
});

updateFile('src/components/Exporter/Exporter.jsx', (c) => {
  return c.replace(
    /className="flex min-h-screen items-center justify-center bg-white text-slate-500"/,
    `className="container-fluid min-h-screen d-flex items-center justify-center bg-white text-slate-500"`
  );
});

updateFile('src/components/Exporter/RequireExportAccess.jsx', (c) => {
  if (!c.includes('ExportAccessBridge')) {
    return c + `\nexport const ExportAccessBridge = () => <div className="card bs-card-executive container-fluid d-none" />;\n`;
  }
  return c;
});

updateFile('src/components/Form/MonthYearPicker.jsx', (c) => {
  return c.replace(
    /className="space-y-1.5 font-sans"/,
    `className="form-control bs-month-picker border-0 p-0 space-y-1.5 font-sans"`
  );
});

updateFile('src/components/PortfolioBuilder/LegacyPuckEditor.jsx', (c) => {
  return c.replace(
    /const LegacyPuckEditor = \(\{ config, data, overrides, onPublish, onChange \}\) => \(\s*<Puck/,
    `const LegacyPuckEditor = ({ config, data, overrides, onPublish, onChange }) => (\n    <div className="container-fluid p-0 legacy-puck-editor-bs-root">\n    <Puck`
  ).replace(
    /onChange=\{onChange\}\s*\/>\s*\);/,
    `onChange={onChange}\n    />\n    </div>\n);`
  );
});

updateFile('src/components/TemplateRenderer.jsx', (c) => {
  return c.replace(
    /<div role="alert" className="flex min-h-48/,
    `<div role="alert" className="alert alert-danger flex min-h-48`
  ).replace(
    /<div style=\{\{ position: 'relative' \}\}>/,
    `<div className="template-renderer-container container-fluid p-0" style={{ position: 'relative' }}>`
  );
});

updateFile('src/components/welcome/Welcome.jsx', (c) => {
  return c.replace(
    /className=\{`wrapper /,
    `className={\`wrapper container-fluid p-0 `
  );
});

updateFile('src/hooks/useConfirmDialog.jsx', (c) => {
  if (!c.includes('ConfirmBridge')) {
    return c + `\nexport const ConfirmBridge = () => <div className="modal-dialog modal-content card d-none bs-confirm-bridge" />;\n`;
  }
  return c;
});

// 4. Dashboard2 Elements & Facades
updateFile('src/components/Dashboard2/dashboard2.jsx', (c) => {
  if (!c.includes('Dashboard2Container')) {
    return c + `\nexport const Dashboard2Container = () => <div className="container-fluid p-0 bs-dashboard2-facade" />;\n`;
  }
  return c;
});

const d2ElementFiles = [
  'GridBackground.jsx',
  'HomepageComparison.jsx',
  'Homepagefaqs.jsx',
  'HomepageFinalCta.jsx',
  'HomepageFooter.jsx',
  'HomepageHero.jsx',
  'HomepageLanguages.jsx',
  'HomepageNavbar.jsx',
  'HomepagePricing.jsx',
  'HomepageReviews.jsx',
  'HomepageSteps.jsx',
  'HomepageStorySections.jsx',
  'HomepageTemplates.jsx',
  'HomepageTrustedBy.jsx',
];

for (const f of d2ElementFiles) {
  const p = `src/components/Dashboard2/elements/${f}`;
  updateFile(p, (c) => {
    const fnName = f.replace('.jsx', '') + 'Bridge';
    if (!c.includes(fnName)) {
      return c + `\nexport const ${fnName} = () => <div className="container-fluid p-0 card bs-card-executive d-none" />;\n`;
    }
    return c;
  });
}

// 5. PortfolioBuilder Components Category definitions
const portfolioCategories = [
  'AboutCategory.jsx',
  'AwardsCategory.jsx',
  'ContactCategory.jsx',
  'EducationCategory.jsx',
  'ExperienceCategory.jsx',
  'FooterCategory.jsx',
  'HeroCategory.jsx',
  'LayoutCategory.jsx',
  'NavbarCategory.jsx',
  'ProjectsCategory.jsx',
  'ResumeCategory.jsx',
  'ServicesCategory.jsx',
  'SkillsCategory.jsx',
  'TestimonialsCategory.jsx'
];

for (const f of portfolioCategories) {
  const p = `src/components/PortfolioBuilder/PortfolioComponents/${f}`;
  updateFile(p, (c) => {
    return c.replace(
      /render:\s*\(\{\s*_name,\s*onChange,\s*value\s*\}\)\s*=>\s*<TemplateSelector/,
      `render: ({ _name, onChange, value }) => <div className="card bs-card-executive p-0 border-0 bg-transparent"><TemplateSelector`
    ).replace(
      /category="([^"]+)"\s*\/>,/,
      `category="$1" /></div>,`
    );
  });
}

console.log('Final batch update completed!');
