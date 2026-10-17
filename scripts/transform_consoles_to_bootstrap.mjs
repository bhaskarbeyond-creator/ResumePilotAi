import fs from 'fs';
import path from 'path';

function updateFile(filePath, transformer) {
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = transformer(original);
  if (original !== updated) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('Transformed:', filePath);
  }
}

// 1. Transform Enterprise Components
const entDir = 'src/enterprise';
function processEnterpriseDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processEnterpriseDir(full);
    } else if (entry.name.endsWith('.jsx')) {
      updateFile(full, (content) => {
        let res = content;
        // Transform tables
        res = res.replace(/className=(["'])enterprise-table\b/g, 'className=$1table enterprise-table table-hover align-middle');
        res = res.replace(/<table className=(["'])(?!.*?\btable\b)/g, '<table className=$1table table-hover align-middle ');
        
        // Transform cards
        res = res.replace(/className=(["'])enterprise-card\b/g, 'className=$1card bs-card-executive enterprise-card');
        
        // Transform pills
        res = res.replace(/className=(["'])enterprise-pill\b/g, 'className=$1badge rounded-pill enterprise-pill');
        
        // Transform buttons
        res = res.replace(/className=(["'])enterprise-button enterprise-button-primary\b/g, 'className=$1btn btn-primary enterprise-button enterprise-button-primary');
        res = res.replace(/className=(["'])enterprise-button enterprise-button-secondary\b/g, 'className=$1btn btn-outline-secondary enterprise-button enterprise-button-secondary');
        res = res.replace(/className=(["'])enterprise-button enterprise-button-danger\b/g, 'className=$1btn btn-danger enterprise-button enterprise-button-danger');
        
        // Transform modals
        res = res.replace(/className=(["'])enterprise-modal\b/g, 'className=$1modal-content enterprise-modal');
        res = res.replace(/className=(["'])enterprise-modal-header\b/g, 'className=$1modal-header enterprise-modal-header');
        res = res.replace(/className=(["'])enterprise-modal-body\b/g, 'className=$1modal-body enterprise-modal-body');
        res = res.replace(/className=(["'])enterprise-modal-footer\b/g, 'className=$1modal-footer enterprise-modal-footer');
        
        return res;
      });
    }
  }
}
processEnterpriseDir(entDir);

// 2. Transform Employer Components
const employerFiles = [
  'src/components/EmployerPortal/EmployerOverview.jsx',
  'src/components/EmployerPortal/EmployerJobPostings.jsx',
  'src/components/EmployerPortal/EmployerApplicantPipeline.jsx',
  'src/components/EmployerPortal/EmployerCandidateMessages.jsx',
  'src/components/EmployerPortal/EmployerCompanyProfile.jsx',
  'src/components/EmployerPortal/EmployerHiringPreferences.jsx',
  'src/components/EmployerPortal/EmployerOnboarding.jsx',
  'src/components/EmployerPortal/EmployerPortal.jsx',
  'src/components/EmployerPortal/EmployerPortalCuba.jsx',
  'src/components/EmployerPortal/EmployerSidebar.jsx',
  'src/components/EmployerPortal/EmployerStates.jsx',
  'src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx',
  'src/components/Dashboard/EmployerDashboard/CompaniesManagement.jsx',
  'src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx',
  'src/components/Dashboard/EmployerDashboard/AddCompanyModal.jsx',
  'src/components/Dashboard/EmployerDashboard/EditJobModal.jsx',
];

for (const ef of employerFiles) {
  updateFile(ef, (content) => {
    let res = content;
    // ensure tables have bootstrap classes
    res = res.replace(/<table className=(["'])(?!.*?\btable\b)/g, '<table className=$1table table-hover align-middle ');
    // ensure cards have card bs-card-executive
    res = res.replace(/className=(["'])bg-white rounded-lg border border-slate-200\b/g, 'className=$1card bs-card-executive bg-white rounded-lg border border-slate-200');
    // ensure pills / badges
    res = res.replace(/className=(["'])inline-flex items-center px-2 py-1 rounded-md text-xs font-medium\b/g, 'className=$1badge rounded-pill inline-flex items-center px-2.5 py-1 text-xs font-medium');
    // ensure buttons
    res = res.replace(/className=(["'])bg-slate-900 hover:bg-slate-800 text-white px-4 py-2\.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm/g, 'className=$1btn btn-primary bg-slate-900 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium shadow-sm');
    res = res.replace(/className=(["'])bg-slate-700 hover:bg-slate-600 text-white px-4 py-2\.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm/g, 'className=$1btn btn-outline-secondary bg-slate-700 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium shadow-sm');
    return res;
  });
}

// 3. Transform Admin Components
const adminDir = 'src/components/admin';
function processAdminDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processAdminDir(full);
    } else if (entry.name.endsWith('.jsx')) {
      updateFile(full, (content) => {
        let res = content;
        // Transform tables
        res = res.replace(/<table className=(["'])(?!.*?\btable\b)/g, '<table className=$1table table-hover align-middle ');
        
        // Transform cards
        res = res.replace(/className=(["'])admin-card\b/g, 'className=$1card bs-card-executive admin-card');
        
        // Transform pills / badges
        res = res.replace(/className=(["'])admin-badge\b/g, 'className=$1badge rounded-pill admin-badge');
        
        // Transform buttons
        res = res.replace(/className=(["'])admin-btn-primary\b/g, 'className=$1btn btn-primary admin-btn-primary');
        res = res.replace(/className=(["'])admin-btn-secondary\b/g, 'className=$1btn btn-outline-secondary admin-btn-secondary');
        
        return res;
      });
    }
  }
}
processAdminDir(adminDir);
console.log('Consoles transformation complete');
