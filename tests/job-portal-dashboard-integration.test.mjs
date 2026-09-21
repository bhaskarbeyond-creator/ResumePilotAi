import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Job Portal Dashboard Integration & Shell Encapsulation Suite', () => {
    const rootPath = path.resolve('.');

    test('1. DashboardMain.jsx mounts Job Portal sub-routes with isInsideDashboard=true', () => {
        const fileContent = fs.readFileSync(path.join(rootPath, 'src/components/Dashboard/DashboardMain/DashboardMain.jsx'), 'utf8');

        // Verify lazy import of MainJobListings
        assert.match(fileContent, /lazy\(\(\)\s*=>\s*import\('\.\.\/\.\.\/JobsListings\/MainJobListings'\)\)/, 'MainJobListings lazy imported');

        // Verify sub-routes
        assert.match(fileContent, /<Route\s+path="jobs"\s+element={<MainJobListings\s+isInsideDashboard={true}/, 'Route path="jobs" mounted with isInsideDashboard={true}');
        assert.match(fileContent, /<Route\s+path="jobs\/portal"\s+element={<MainJobListings\s+isInsideDashboard={true}/, 'Route path="jobs/portal" mounted with isInsideDashboard={true}');
        assert.match(fileContent, /<Route\s+path="jobs\/portal\/:jobId"\s+element={<MainJobListings\s+isInsideDashboard={true}/, 'Route path="jobs/portal/:jobId" mounted with isInsideDashboard={true}');
        assert.match(fileContent, /<Route\s+path="jobs\/browse"\s+element={<MainJobListings\s+isInsideDashboard={true}/, 'Route path="jobs/browse" mounted with isInsideDashboard={true}');
        assert.match(fileContent, /<Route\s+path="jobs\/category\/:catName"\s+element={<MainJobListings\s+isInsideDashboard={true}/, 'Route path="jobs/category/:catName" mounted with isInsideDashboard={true}');
    });

    test('2. ProfileDisplay.jsx routes Browse Job Portal to /dashboard/jobs and auto-expands jobIntel group', () => {
        const fileContent = fs.readFileSync(path.join(rootPath, 'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx'), 'utf8');

        // Auto-expand includes /dashboard/jobs
        assert.match(fileContent, /p\.startsWith\('\/dashboard\/jobs'\)/, 'Accordion auto-expands on /dashboard/jobs');

        // Sidebar link routes to /dashboard/jobs
        assert.match(fileContent, /<Link\s+to="\/dashboard\/jobs"/, 'Job Portal link points to /dashboard/jobs');
        assert.match(fileContent, /location\.pathname === '\/dashboard\/jobs' \|\| location\.pathname\.startsWith\('\/dashboard\/jobs'\)/, 'Active state includes /dashboard/jobs');
    });

    test('3. MainJobListings.jsx conditionally encapsulates layout when inside dashboard', () => {
        const fileContent = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/MainJobListings.jsx'), 'utf8');

        // Check props and detection
        assert.match(fileContent, /isInsideDashboard: propIsInsideDashboard/, 'Accepts isInsideDashboard prop');
        assert.match(fileContent, /const isInsideDashboard = Boolean\(propIsInsideDashboard \|\| pathname\.startsWith\('\/dashboard'\)\);/, 'Computes isInsideDashboard correctly');

        // Navbar and Footer conditionally omitted
        assert.match(fileContent, /\{!isInsideDashboard && <HomepageNavbar/, 'HomepageNavbar omitted inside dashboard');
        assert.match(fileContent, /\{!isInsideDashboard && <HomepageFooter \/>\}/, 'HomepageFooter omitted inside dashboard');

        // Dashboard responsive padding applied
        assert.match(fileContent, /isInsideDashboard \? 'py-6 sm:py-8 max-lg:pt-16' : 'pt-\[110px\] pb-12'/, 'Applies dashboard padding without fixed navbar offset');
    });

    test('4. src/main.jsx routes authenticated users to dashboard jobs while maintaining guest access', () => {
        const fileContent = fs.readFileSync(path.join(rootPath, 'src/main.jsx'), 'utf8');

        // Check JobsPortalRoute definition
        assert.match(fileContent, /function JobsPortalRoute\(\{ user \}\)/, 'JobsPortalRoute helper defined');
        assert.match(fileContent, /\/dashboard\/jobs\/portal\/\$\{subpath\}/, 'Forwards jobId subpath to dashboard');
        assert.match(fileContent, /<Navigate to=\{`\$\{target\}\$\{location\.search\}\$\{location\.hash\}`\} replace \/>/, 'Redirects authenticated users to dashboard jobs');

        // Check Route registrations
        assert.match(fileContent, /<Route path="\/jobs\/portal" element={<JobsPortalRoute user=\{user\} \/>} \/>/, '/jobs/portal uses JobsPortalRoute');
        assert.match(fileContent, /<Route path="\/jobs\/portal\/:jobId" element={<JobsPortalRoute user=\{user\} \/>} \/>/, '/jobs/portal/:jobId uses JobsPortalRoute');
        assert.match(fileContent, /<Route path="\/jobs\/browse" element={<JobsBrowseRoute user=\{user\} \/>} \/>/, '/jobs/browse uses JobsBrowseRoute');
        assert.match(fileContent, /<Route path="\/jobs\/category\/:catName" element={<JobsBrowseRoute user=\{user\} \/>} \/>/, '/jobs/category/:catName uses JobsBrowseRoute');
    });

    test('5. Census controls (CTRL-1696 to CTRL-1700) and interactive modals remain intact', () => {
        const fileContent = fs.readFileSync(path.join(rootPath, 'src/components/JobsListings/MainJobListings.jsx'), 'utf8');

        // Verify all 5 controls
        assert.match(fileContent, /clearAllFilters/, 'CTRL-1696 clearAllFilters button intact');
        assert.match(fileContent, /loadJobs\(currentPage - 1\)/, 'CTRL-1697 previous page button intact');
        assert.match(fileContent, /loadJobs\(pageNum\)/, 'CTRL-1698 page numbers button intact');
        assert.match(fileContent, /loadJobs\(currentPage \+ 1\)/, 'CTRL-1699 next page button intact');
        assert.match(fileContent, /<select/, 'CTRL-1700 select dropdown intact');

        // Verify modals
        assert.match(fileContent, /<JobDetailsModal/, 'JobDetailsModal present');
        assert.match(fileContent, /<JobApplicationModal/, 'JobApplicationModal present');
        assert.match(fileContent, /<CreateJobModal/, 'CreateJobModal present');
        assert.match(fileContent, /<FavoritesModal/, 'FavoritesModal present');
    });
});
