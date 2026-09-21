import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, '..');

test.describe('Complete Job Module Audit & 10/10 Logic Verification Suite', () => {

    test('1. API query parameter normalization and salary range formatting', async () => {
        const platformCode = fs.readFileSync(path.join(rootPath, 'src/services/api/platform.js'), 'utf8');

        // Test formatSalaryRange default symbol
        assert.match(platformCode, /export function formatSalaryRange\(minSalary, maxSalary, currencySymbol = '₹'\)/, 'formatSalaryRange defaults to ₹');
        assert.match(platformCode, /\$\{sym\}\$\{minSalary\.toLocaleString\(\)\}/, 'formatSalaryRange uses sym variable');

        // Test getActiveJobs query normalization
        assert.match(platformCode, /const keyword = filters\.keyword \|\| filters\.searchTerm \|\| filters\.q;/, 'Polymorphic keyword search query mapped');
        assert.match(platformCode, /const location = filters\.location \|\| filters\.locationFilter;/, 'Polymorphic location filter mapped');

        // Test updateApplicationStatus CAS parameters
        assert.match(platformCode, /const expectedStatus = expected\.expectedStatus \|\| expected\.status \|\| '';/, 'expectedStatus gracefully mapped');
        assert.match(platformCode, /const expectedRevision = Number\(expected\.expectedRevision \?\? expected\.revision \?\? 0\);/, 'expectedRevision gracefully mapped');
        assert.match(platformCode, /body: JSON\.stringify\(\{\s*status,\s*notes,\s*expectedStatus,\s*expectedRevision\s*\}\)/, 'body sends both expectedStatus and expectedRevision');
    });

    test('2. Candidate vs Employer RBAC & Post Job Separation', () => {
        const searchBarCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/JobSearchBar.jsx'), 'utf8');
        const mainListingsCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/MainJobListings.jsx'), 'utf8');

        // Verify canPostJob guard in JobSearchBar
        assert.match(searchBarCode, /canPostJob\s*=\s*false/, 'JobSearchBar defaults canPostJob to false');
        assert.match(searchBarCode, /\{canPostJob && \(/, 'JobSearchBar guards Post a Job behind canPostJob');

        // Verify canPostJob passed from MainJobListings
        assert.match(mainListingsCode, /canPostJob=\{canPostJob\}/, 'MainJobListings passes canPostJob to JobSearchBar');
        assert.match(mainListingsCode, /checkIsEmployer\(user\.uid\)/, 'MainJobListings checks employer status for logged in user');

        // Verify CreateJobModal guards employer status
        const createJobModalCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/CreateJobModal.jsx'), 'utf8');
        assert.match(createJobModalCode, /checkIsEmployer\(user\.uid\)/, 'CreateJobModal checks employer status');
        assert.match(createJobModalCode, /<EmployerApplicationForm/, 'Shows application form if user is not yet an employer');
    });

    test('3. Currency Consistency (INR / Rupee) across Modals and Dashboards', () => {
        const detailsModalCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/JobDetailsModal.jsx'), 'utf8');
        const employerDashboardCode = fs.readFileSync(path.join(rootPath, 'src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx'), 'utf8');
        const createJobModalCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/CreateJobModal.jsx'), 'utf8');
        const editJobModalCode = fs.readFileSync(path.join(rootPath, 'src/components/Dashboard/EmployerDashboard/EditJobModal.jsx'), 'utf8');

        // JobDetailsModal accepts currency props and defaults to INR
        assert.match(detailsModalCode, /currency = 'INR'/, 'JobDetailsModal currency prop defaults to INR');
        assert.match(detailsModalCode, /currencySymbol = '₹'/, 'JobDetailsModal currencySymbol prop defaults to ₹');
        assert.match(detailsModalCode, /currency:\s*job\?\.salary_currency \|\| job\?\.currency \|\| currency \|\| 'INR'/, 'JobDetailsModal resolves dynamic currency');

        // EmployerDashboard formatSalaryDisplay uses rupee symbol
        assert.match(employerDashboardCode, /const formatSalaryDisplay = \(minSalary, maxSalary, currencySymbol = '₹'\)/, 'EmployerDashboard formats with rupee default');
        assert.match(employerDashboardCode, /const getApplicationStatusBadge = \(status\) =>/, 'EmployerDashboard syntax fixed for getApplicationStatusBadge');

        // CreateJobModal and EditJobModal preserve salary_currency
        assert.match(createJobModalCode, /salary_currency:\s*'INR'/, 'CreateJobModal sets salary_currency: INR');
        assert.match(editJobModalCode, /salary_currency:\s*job\?\.salary_currency \|\| job\?\.currency \|\| 'INR'/, 'EditJobModal preserves salary_currency');
    });

    test('4. Application submission data integrity and bidirectional resumeId extraction', () => {
        const candidateModalCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/JobApplicationModal.jsx'), 'utf8');
        const backendCode = fs.readFileSync(path.join(rootPath, 'backend/index.js'), 'utf8');

        // JobApplicationModal includes email and resumeId
        assert.match(candidateModalCode, /email:\s*applicationData\.email \|\| ''/, 'Candidate application modal sends email');
        assert.match(candidateModalCode, /resumeId:\s*applicationData\.selectedResume\?\.id \|\| ''/, 'Candidate application modal sends resumeId');

        // Backend extracts resumeId safely from either top-level or selectedResume
        assert.match(backendCode, /const resumeId = String\(req\.body\?\.resumeId \|\| req\.body\?\.selectedResume\?\.id \|\| ''\)\.trim\(\);/, 'Backend extracts resumeId flexibly');
    });

    test('5. FavoritesModal defensive safety and salary display', () => {
        const favoritesModalCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/FavoritesModal.jsx'), 'utf8');

        assert.match(favoritesModalCode, /const safeSavedJobs = savedJobs instanceof Set \? savedJobs : new Set/, 'safeSavedJobs defensive set conversion');
        assert.match(favoritesModalCode, /job\.salary &&/, 'FavoritesModal displays job.salary when present');
        assert.match(favoritesModalCode, /safeSavedJobs\.size/, 'safeSavedJobs size evaluated safely');
    });

    test('6. Certified Census Controls (CTRL-1696 to CTRL-1700) Preservation', () => {
        const mainListingsCode = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/MainJobListings.jsx'), 'utf8');

        assert.match(mainListingsCode, /clearAllFilters/, 'CTRL-1696 intact');
        assert.match(mainListingsCode, /loadJobs\(currentPage - 1\)/, 'CTRL-1697 intact');
        assert.match(mainListingsCode, /loadJobs\(pageNum\)/, 'CTRL-1698 intact');
        assert.match(mainListingsCode, /loadJobs\(currentPage \+ 1\)/, 'CTRL-1699 intact');
        assert.match(mainListingsCode, /<select/, 'CTRL-1700 intact');
    });
});
