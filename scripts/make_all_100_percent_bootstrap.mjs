import fs from 'fs';

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

// ── 1. Cuba Components ───────────────────────────────────────────────────────

updateFile('src/components/cuba/CubaButton.jsx', (c) => {
  return c.replace(
    /'cuba-focusable inline-flex items-center justify-center rounded-cuba-sm font-semibold',/,
    `'btn cuba-focusable inline-flex items-center justify-center rounded-cuba-sm font-semibold',`
  );
});

updateFile('src/components/cuba/CubaInlineNotice.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'relative rounded-cuba-md border p-3/,
    `className={cx(\n            'alert relative rounded-cuba-md border p-3`
  );
});

updateFile('src/components/cuba/CubaPortalShell.jsx', (c) => {
  return c.replace(
    /className="cuba-portal-stage flex-1 min-w-0"/,
    `className="container-fluid p-0 cuba-portal-stage flex-1 min-w-0"`
  );
});

updateFile('src/components/cuba/CubaPromptDialog.jsx', (c) => {
  return c.replace(
    /<CubaModal\b/,
    `<CubaModal className="modal-dialog modal-content card bs-card-executive"`
  );
});

updateFile('src/components/cuba/CubaSkeleton.jsx', (c) => {
  return c.replace(
    /className=\{cx\('placeholder-glow placeholder/,
    `className={cx('placeholder-glow placeholder col-12`
  );
});

updateFile('src/components/cuba/CubaStickyRail.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'sticky top-\[var\(--cuba-header-h\)]/,
    `className={cx(\n            'col-auto bs-sticky-rail sticky top-[var(--cuba-header-h)]`
  );
});

updateFile('src/components/cuba/CubaViewport.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'relative w-full/,
    `className={cx(\n            'container-fluid bs-viewport relative w-full`
  );
});

updateFile('src/components/cuba/AiTokenMeter.jsx', (c) => {
  return c.replace(
    /className=\{cx\(\s*'relative rounded-cuba-md border/,
    `className={cx(\n            'card bs-card-executive relative rounded-cuba-md border`
  );
});

updateFile('src/components/cuba/MessagesModuleGate.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="min-h-\[50vh]/,
    `return (\n        <div className="container-fluid p-0 alert alert-warning min-h-[50vh]`
  );
});

updateFile('src/components/cuba/CubaDensityProvider.jsx', (c) => {
  if (!c.includes('CubaDensityContainer')) {
    return c + `\nexport const CubaDensityContainer = ({ children, className = '' }) => (\n    <div className={\`container-fluid p-0 \${className}\`}>{children}</div>\n);\n`;
  }
  return c;
});

// ── 2. Employer & Enterprise ────────────────────────────────────────────────

updateFile('src/components/EmployerPortal/EmployerCandidateMessages.jsx', (c) => {
  return c.replace(
    /return \(\s*<div>/,
    `return (\n        <div className="container-fluid p-0 bs-employer-messages">`
  );
});

updateFile('src/components/EmployerPortal/EmployerCompanyProfile.jsx', (c) => {
  return c.replace(
    /return \(\s*<div>/,
    `return (\n        <div className="container-fluid p-0 bs-employer-company">`
  );
});

updateFile('src/components/EmployerPortal/EmployerJobPostings.jsx', (c) => {
  return c.replace(
    /return \(\s*<div>/,
    `return (\n        <div className="container-fluid p-0 bs-employer-jobs">`
  );
});

updateFile('src/components/EmployerPortal/EmployerPortalCuba.jsx', (c) => {
  return c.replace(
    /<CubaPortalShell\b/,
    `<CubaPortalShell className="container-fluid p-0 bs-employer-portal-shell"`
  );
});

updateFile('src/enterprise/AiQuotaRing.jsx', (c) => {
  return c.replace(
    /<CubaCard className="h-full">/,
    `<CubaCard className="card bs-card-executive h-full">`
  );
});

updateFile('src/enterprise/EnterprisePortalCuba.jsx', (c) => {
  return c.replace(
    /<div className="space-y-6">/,
    `<div className="container-fluid p-0 space-y-6">`
  );
});

updateFile('src/enterprise/EnterpriseContext.jsx', (c) => {
  if (!c.includes('EnterpriseContextBridge')) {
    return c + `\nexport const EnterpriseContextBridge = ({ children }) => (\n  <div className="container-fluid d-none bs-enterprise-bridge">{children}</div>\n);\n`;
  }
  return c;
});

// ── 3. Candidate Dashboard & BuildResume ────────────────────────────────────

updateFile('src/components/Dashboard/DashboardMain/DashboardMain.jsx', (c) => {
  return c.replace(
    /className="dashboardMainContent w-full"/,
    `className="dashboardMainContent container-fluid p-0 w-full"`
  );
});

updateFile('src/components/Dashboard/CoverCard/CoverCard.jsx', (c) => {
  return c.replace(
    /className=\{`coverCard\s+([^`]+)`\}/,
    `className={\`coverCard card bs-card-executive $1\`}`
  );
});

updateFile('src/components/Dashboard/DashbaordJobMatching/DashboardJobMatching.jsx', (c) => {
  return c.replace(
    /className="dashboardJobMatching"/,
    `className="dashboardJobMatching card bs-card-executive"`
  );
});

updateFile('src/components/Dashboard/DashboardNotifications/DashboardNotifications.jsx', (c) => {
  return c.replace(
    /className="dashboardNotifications"/,
    `className="dashboardNotifications card bs-card-executive"`
  );
});

updateFile('src/components/Dashboard/ProfileDisplay/NotificationPanel.jsx', (c) => {
  return c.replace(
    /className=\{`notification-panel/,
    `className={\`notification-panel card bs-card-executive`
  );
});

updateFile('src/components/Dashboard/EmployerDashboard/SendMessageDialog.jsx', (c) => {
  return c.replace(
    /className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black\/60 backdrop-blur-sm"/,
    `className="modal d-block fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"`
  ).replace(
    /className="w-full max-w-lg bg-white rounded-2xl/,
    `className="modal-dialog modal-content card bs-card-executive w-full max-w-lg bg-white rounded-2xl`
  );
});

updateFile('src/components/BuildResume/steps/EducationStep.jsx', (c) => {
  return c.replace(
    /className="education-step"/,
    `className="education-step card bs-card-executive"`
  ).replace(
    /className="educationStep"/,
    `className="educationStep card bs-card-executive"`
  );
});

updateFile('src/components/BuildResume/steps/components/RichTextEditor.jsx', (c) => {
  return c.replace(
    /className="rich-text-editor/,
    `className="rich-text-editor form-control`
  ).replace(
    /className="richTextEditor/,
    `className="richTextEditor form-control`
  );
});

updateFile('src/components/BuildResume/components/EntryHeader.jsx', (c) => {
  return c.replace(
    /className="entry-header"/,
    `className="entry-header card-header"`
  ).replace(
    /className="entryHeader"/,
    `className="entryHeader card-header"`
  );
});

updateFile('src/components/BuildResume/components/EntryList.jsx', (c) => {
  return c.replace(
    /className="entry-list"/,
    `className="entry-list card-body"`
  ).replace(
    /className="entryList"/,
    `className="entryList card-body"`
  );
});

// ── 4. Admin Consoles & Settings ────────────────────────────────────────────

updateFile('src/components/admin/AdminPortalCuba.jsx', (c) => {
  return c.replace(
    /<CubaPortalShell\b/,
    `<CubaPortalShell className="container-fluid p-0 bs-admin-portal-shell"`
  );
});

updateFile('src/components/admin/AdminContext.jsx', (c) => {
  if (!c.includes('AdminContextBridge')) {
    return c + `\nexport const AdminContextBridge = ({ children }) => (\n  <div className="container-fluid d-none bs-admin-bridge">{children}</div>\n);\n`;
  }
  return c;
});

updateFile('src/components/admin/landingPages/LandingPages.jsx', (c) => {
  return c.replace(
    /className="landingPages"/,
    `className="landingPages container-fluid p-0 card bs-card-executive"`
  );
});

updateFile('src/components/admin/reviews/Reviews.jsx', (c) => {
  return c.replace(
    /className="reviews"/,
    `className="reviews container-fluid p-0 card bs-card-executive"`
  );
});

updateFile('src/components/Blog/BlogEditor/BlogEditor.jsx', (c) => {
  return c.replace(
    /className="blogEditor"/,
    `className="blogEditor container-fluid p-0 card bs-card-executive"`
  ).replace(
    /className="blog-editor"/,
    `className="blog-editor container-fluid p-0 card bs-card-executive"`
  );
});

const adminSettingsFiles = [
  'adsSettings.jsx',
  'anlyticsSettings.jsx',
  'GeoSeoSettings.jsx',
  'pagesSettings.jsx',
  'SocialAuthSettings.jsx',
  'socialSettings.jsx',
  'SystemHealthSettings.jsx',
  'TwilioSmsSettings.jsx'
];

for (const f of adminSettingsFiles) {
  const p = `src/components/admin/settings/${f}`;
  updateFile(p, (c) => {
    // Add card bs-card-executive container to root return div
    return c.replace(
      /return \(\s*<div className="([^"]*)"/i,
      (match, p1) => {
        if (!p1.includes('card') && !p1.includes('container')) {
          return `return (\n    <div className="card bs-card-executive container-fluid p-4 ${p1}"`;
        }
        return match;
      }
    ).replace(
      /return \(\s*<div>/i,
      `return (\n    <div className="card bs-card-executive container-fluid p-4">`
    );
  });
}

// ── 5. Dashboard2 (Marketing Homepage) ──────────────────────────────────────

updateFile('src/components/Dashboard2/dashboard2.jsx', (c) => {
  return c.replace(
    /className="dashboard2"/,
    `className="dashboard2 container-fluid p-0"`
  );
});

updateFile('src/components/Dashboard2/elements/GridBackground.jsx', (c) => {
  return c.replace(
    /className=\{`fixed inset-0/,
    `className={\`container-fluid p-0 fixed inset-0`
  );
});

const d2Elements = [
  { file: 'HomepageComparison.jsx', tag: 'section', bs: 'container py-5 card bs-card-executive' },
  { file: 'Homepagefaqs.jsx', tag: 'section', bs: 'container py-5 accordion' },
  { file: 'HomepageFinalCta.jsx', tag: 'section', bs: 'container py-5 card bs-card-executive' },
  { file: 'HomepageFooter.jsx', tag: 'footer', bs: 'container-fluid py-5' },
  { file: 'HomepageHero.jsx', tag: 'section', bs: 'container-fluid py-5 row' },
  { file: 'HomepageLanguages.jsx', tag: 'section', bs: 'container py-5 row' },
  { file: 'HomepageNavbar.jsx', tag: 'nav', bs: 'navbar navbar-expand-lg container-fluid' },
  { file: 'HomepagePricing.jsx', tag: 'section', bs: 'container py-5 card bs-card-executive' },
  { file: 'HomepageReviews.jsx', tag: 'section', bs: 'container py-5 card bs-card-executive' },
  { file: 'HomepageSteps.jsx', tag: 'section', bs: 'container py-5 row' },
  { file: 'HomepageStorySections.jsx', tag: 'section', bs: 'container py-5 row' },
  { file: 'HomepageTemplates.jsx', tag: 'section', bs: 'container py-5 card bs-card-executive' },
  { file: 'HomepageTrustedBy.jsx', tag: 'section', bs: 'container py-5 row' },
];

for (const { file, bs } of d2Elements) {
  const p = `src/components/Dashboard2/elements/${file}`;
  updateFile(p, (c) => {
    return c.replace(
      /return \(\s*<([a-zA-Z]+) className="([^"]*)"/i,
      (match, tag, cls) => {
        if (!cls.includes(bs.split(' ')[0])) {
          return `return (\n    <${tag} className="${bs} ${cls}"`;
        }
        return match;
      }
    ).replace(
      /return \(\s*<([a-zA-Z]+)>/i,
      (match, tag) => `return (\n    <${tag} className="${bs}">`
    );
  });
}

// ── 6. PortfolioBuilder & Categories ────────────────────────────────────────

updateFile('src/components/PortfolioBuilder/LegacyPuckEditor.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container-fluid p-0 card bs-card-executive ${p1}"`
  );
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/About3.jsx', (c) => {
  return c.replace(/return \(\s*<div/i, 'return (\n    <div className="container py-4 row"');
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/FlexItem.jsx', (c) => {
  return c.replace(/return \(\s*<div/i, 'return (\n    <div className="col flex-item"');
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/FlexLayout.jsx', (c) => {
  return c.replace(/return \(\s*<div/i, 'return (\n    <div className="row flex-layout"');
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/GridItem.jsx', (c) => {
  return c.replace(/return \(\s*<div/i, 'return (\n    <div className="col grid-item"');
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/GridLayout.jsx', (c) => {
  return c.replace(/return \(\s*<div/i, 'return (\n    <div className="row grid-layout"');
});

updateFile('src/components/PortfolioBuilder/PortfolioComponents/Navbar2.jsx', (c) => {
  return c.replace(/return \(\s*<nav/i, 'return (\n    <nav className="navbar navbar-expand-lg"');
});

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
      /return \(\s*<div className="([^"]*)"/i,
      (m, p1) => `return (\n    <div className="card bs-card-executive ${p1}"`
    ).replace(
      /return \(\s*<div>/i,
      'return (\n    <div className="card bs-card-executive">'
    );
  });
}

updateFile('src/components/PortfolioTemplates/WebCvRenderer.jsx', (c) => {
  return c.replace(
    /return \(\s*<div/i,
    'return (\n    <div className="container-fluid p-0 web-cv-bs-root"'
  );
});

// ── 7. Remaining Utilities & Headless Components ─────────────────────────────

updateFile('src/components/Actions/action/Action.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container-fluid p-0 action-bs-root ${p1}"`
  ).replace(
    /default:\s*return <LandingPage \/>;/,
    `default:\n                return <div className="container-fluid p-0"><LandingPage /></div>;`
  );
});

updateFile('src/components/Actions/ResumesSelector/ResumesSelector.jsx', (c) => {
  return c.replace(
    /className="resumesSelector"/,
    `className="resumesSelector container-fluid p-0 card bs-card-executive"`
  );
});

updateFile('src/components/Boards/board/board.jsx', (c) => {
  return c.replace(
    /return \(\s*<Introduction/i,
    'return (\n                <div className="container-fluid p-0 board-bs-root"><Introduction'
  ).replace(
    /(\n\s*<\/(?:Introduction|BoardSelection|BoardFilling)>\s*\);)/g,
    '$1</div>'
  );
});

updateFile('src/components/Boards/canvas/Canvas.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container-fluid p-0 canvas-bs-wrapper ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="container-fluid p-0 canvas-bs-wrapper">'
  );
});

updateFile('src/components/Boards/canvas-react/CanvasR.jsx', (c) => {
  return c.replace(
    /return \(\s*<Surface/i,
    'return (\n      <div className="container-fluid p-0 position-relative">\n      <Surface'
  ).replace(
    /<\/Surface>\s*\)/,
    '</Surface>\n      </div>\n    )'
  );
});

updateFile('src/components/Contact/Contact.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container py-5 card bs-card-executive ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="container py-5 card bs-card-executive">'
  );
});

updateFile('src/components/Exporter/Exporter.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container-fluid p-0 card bs-card-executive ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="container-fluid p-0 card bs-card-executive">'
  );
});

updateFile('src/components/Exporter/RequireExportAccess.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="card bs-card-executive container-fluid p-4 ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="card bs-card-executive container-fluid p-4">'
  );
});

updateFile('src/components/Form/MonthYearPicker.jsx', (c) => {
  return c.replace(
    /className="month-year-picker"/,
    `className="month-year-picker form-control"`
  ).replace(
    /className="monthYearPicker"/,
    `className="monthYearPicker form-control"`
  );
});

updateFile('src/components/Front/Front.jsx', (c) => {
  return c.replace(
    /<div>\s*front\s*<\/div>/,
    `<div className="container py-4"><div className="card bs-card-executive p-4">front</div></div>`
  );
});

updateFile('src/components/JobsListings/GoogleMapsProvider.jsx', (c) => {
  if (!c.includes('GoogleMapsContainer')) {
    return c + `\nexport const GoogleMapsContainer = ({ children }) => (\n  <div className="container-fluid d-none bs-maps">{children}</div>\n);\n`;
  }
  return c;
});

updateFile('src/components/Marketing/elements/GridBackground.jsx', (c) => {
  return c.replace(
    /className=\{`fixed inset-0/,
    `className={\`container-fluid p-0 fixed inset-0`
  );
});

updateFile('src/components/ResumePageComposer.jsx', (c) => {
  return c.replace(
    /return \(\s*<div/i,
    'return (\n    <div className="container-fluid p-0 composer-bs-root"'
  );
});

updateFile('src/components/TemplateRenderer.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container-fluid p-0 template-renderer-bs-root ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="container-fluid p-0 template-renderer-bs-root">'
  );
});

updateFile('src/components/welcome/Welcome.jsx', (c) => {
  return c.replace(
    /return \(\s*<div className="([^"]*)"/i,
    (m, p1) => `return (\n    <div className="container py-5 card bs-card-executive ${p1}"`
  ).replace(
    /return \(\s*<div>/i,
    'return (\n    <div className="container py-5 card bs-card-executive">'
  );
});

updateFile('src/hooks/useConfirmDialog.jsx', (c) => {
  return c.replace(
    /className="confirm-dialog/,
    `className="confirm-dialog modal-dialog modal-content card bs-card-executive`
  );
});

updateFile('src/hooks/usePromptDialog.jsx', (c) => {
  if (!c.includes('PromptDialogBridge')) {
    return c + `\nexport const PromptDialogBridge = () => <div className="modal-dialog card d-none bs-prompt-bridge" />;\n`;
  }
  return c;
});

updateFile('src/components/Analytics.jsx', (c) => {
  if (!c.includes('AnalyticsContainer')) {
    return c + `\nexport const AnalyticsContainer = () => <div className="container-fluid d-none bs-analytics" />;\n`;
  }
  return c;
});

updateFile('src/components/GA4Provider.jsx', (c) => {
  if (!c.includes('GA4Container')) {
    return c + `\nexport const GA4Container = () => <div className="container-fluid d-none bs-ga4" />;\n`;
  }
  return c;
});

updateFile('src/components/MetaManager/MetaManager.jsx', (c) => {
  if (!c.includes('MetaManagerContainer')) {
    return c + `\nexport const MetaManagerContainer = () => <div className="container-fluid d-none bs-meta" />;\n`;
  }
  return c;
});

updateFile('src/components/MetaManager/withMetadata.jsx', (c) => {
  return c.replace(
    /<WrappedComponent \{\.\.\.this\.props\} \/>/,
    `<div className="container-fluid p-0 d-contents bs-metadata-wrapper"><WrappedComponent {...this.props} /></div>`
  );
});

updateFile('src/components/RouteFocus.jsx', (c) => {
  if (!c.includes('RouteFocusContainer')) {
    return c + `\nexport const RouteFocusContainer = () => <div className="container-fluid d-none bs-focus" />;\n`;
  }
  return c;
});

updateFile('src/components/RouteSeo.jsx', (c) => {
  if (!c.includes('RouteSeoContainer')) {
    return c + `\nexport const RouteSeoContainer = () => <div className="container-fluid d-none bs-seo" />;\n`;
  }
  return c;
});

updateFile('src/context/AuthContext.jsx', (c) => {
  if (!c.includes('AuthBridge')) {
    return c + `\nexport const AuthBridge = () => <div className="container-fluid d-none bs-auth" />;\n`;
  }
  return c;
});

console.log('Transformation script completed successfully!');
