import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Job Portal 10/10 UI/UX Elevation Verification Suite', () => {
    const basePath = path.resolve('src/components/JobsListings');

    test('1. JobSearchBar.jsx has elevated hero, clear button, and quick trending filter pills', () => {
        const fileContent = fs.readFileSync(path.join(basePath, 'JobSearchBar.jsx'), 'utf8');

        // Check for hero badge & gradient typography
        assert.match(fileContent, /Verified Opportunities • 10,000\+ Active Roles/, 'Hero badge present');
        assert.match(fileContent, /bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600/, 'Gradient typography present');

        // Check for clear search button
        assert.match(fileContent, /FaTimes/, 'Clear cross button imported and used');
        assert.match(fileContent, /setSearchTerm\(''\)/, 'Clear search handler wired');

        // Check for quick filter pills
        assert.match(fileContent, /quickFilters/, 'quickFilters configuration array exists');
        assert.match(fileContent, /Remote/, 'Remote quick filter present');
        assert.match(fileContent, /Full-time/, 'Full-time quick filter present');
        assert.match(fileContent, /\$120k\+/, 'High salary quick filter present');
        assert.match(fileContent, /handleQuickFilterClick/, 'Quick filter click handler implemented');
    });

    test('2. JobFilters.jsx has sticky top-24, multi-open discoverability, category icons, and active counter', () => {
        const fileContent = fs.readFileSync(path.join(basePath, 'JobFilters.jsx'), 'utf8');

        // Check sticky top-24 to prevent navbar overlap
        assert.match(fileContent, /sticky top-24/, 'Sticky top offset set to top-24 for 80px navbar');

        // Check default multi-open discoverability
        assert.match(fileContent, /openSections/, 'Multi-open section state exists');
        assert.match(fileContent, /jobType:\s*true/, 'Job type open by default');
        assert.match(fileContent, /workMode:\s*true/, 'Work mode open by default');

        // Check category icons
        assert.match(fileContent, /FaBriefcase/, 'Briefcase icon used for job type');
        assert.match(fileContent, /FaLaptop/, 'Laptop icon used for work mode');
        assert.match(fileContent, /FaGraduationCap/, 'Graduation cap icon used for experience level');
        assert.match(fileContent, /FaDollarSign/, 'Dollar sign icon used for salary range');

        // Check active count badge
        assert.match(fileContent, /totalActiveFilters/, 'Total active filter calculation present');
        assert.match(fileContent, /clearAllFilters/, 'Clear all filters action wired');
    });

    test('3. JobCard.jsx has monogram branding fallback, salary badge, requirements limiter, and polished action buttons', () => {
        const fileContent = fs.readFileSync(path.join(basePath, 'JobCard.jsx'), 'utf8');

        // Check monogram fallback
        assert.match(fileContent, /companyMonogram/, 'Company monogram extraction present');

        // Check salary badge
        assert.match(fileContent, /bg-gradient-to-r from-emerald-50 to-teal-50/, 'High contrast salary badge styling');

        // Check requirements limiter (+N more)
        assert.match(fileContent, /visibleRequirements/, 'Limited visible requirements slice');
        assert.match(fileContent, /remainingCount/, 'Remaining requirements counter');

        // Check application actions
        assert.match(fileContent, /getApplicationStatusDisplay/, 'Application status display handler present');
        assert.match(fileContent, /onViewDetails/, 'View details button wired');
        assert.match(fileContent, /onToggleSaved/, 'Toggle saved bookmark wired');
    });

    test('4. MainJobListings.jsx has active filter chips strip, live indicator, proper sort state, and census controls', () => {
        const fileContent = fs.readFileSync(path.join(basePath, 'MainJobListings.jsx'), 'utf8');

        // Check active filter chips bar
        assert.match(fileContent, /hasActiveFilters/, 'hasActiveFilters check implemented');
        assert.match(fileContent, /removeSpecificFilter/, 'Specific filter removal handler present');

        // Check live pulse indicator
        assert.match(fileContent, /animate-ping/, 'Live results indicator dot present');

        // Check favorite toggle handler assignment
        assert.match(fileContent, /const handleToggleFavoriteWithRefresh = async/, 'Favorite toggle handler properly assigned');

        // Invariant: Verify all 5 census controls (CTRL-1696 to CTRL-1700)
        assert.match(fileContent, /clearAllFilters/, 'CTRL-1696 clearAllFilters button intact');
        assert.match(fileContent, /loadJobs\(currentPage - 1\)/, 'CTRL-1697 previous page button intact');
        assert.match(fileContent, /loadJobs\(pageNum\)/, 'CTRL-1698 page numbers button intact');
        assert.match(fileContent, /loadJobs\(currentPage \+ 1\)/, 'CTRL-1699 next page button intact');
        assert.match(fileContent, /<select/, 'CTRL-1700 select dropdown intact');
        assert.match(fileContent, /value="newest"/, 'Sort option newest intact');
        assert.match(fileContent, /value="salary-high"/, 'Sort option salary-high intact');
        assert.match(fileContent, /value="salary-low"/, 'Sort option salary-low intact');
        assert.match(fileContent, /value="company"/, 'Sort option company intact');
        assert.match(fileContent, /value="relevance"/, 'Sort option relevance intact');
    });

    test('5. JobDetailsModal.jsx has no orphaned expressions, wires bookmark saving, and has smooth slide-over', () => {
        const fileContent = fs.readFileSync(path.join(basePath, 'JobDetailsModal.jsx'), 'utf8');

        // Check named functions (no orphaned expressions)
        assert.match(fileContent, /const toggleSection =/, 'toggleSection is properly named');
        assert.match(fileContent, /const renderStars =/, 'renderStars is properly named');
        assert.doesNotMatch(fileContent, /\(section\)\s*=>\s*\{;/, 'No dangling unassigned section arrow function');
        assert.doesNotMatch(fileContent, /\(rating\)\s*=>\s*\{;/, 'No dangling unassigned rating arrow function');

        // Check save bookmark wiring
        assert.match(fileContent, /activeToggleSaved/, 'Bookmark toggle properly wired in drawer footer');
        assert.match(fileContent, /activeSaved/, 'Saved state properly referenced in drawer footer');
    });
});
