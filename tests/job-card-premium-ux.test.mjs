import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('JobCard Premium UX Enhancement Suite', async (t) => {
    const jobCardPath = path.resolve('src/components/JobsListings/JobCard.jsx');
    const source = fs.readFileSync(jobCardPath, 'utf8');

    await t.test('1. Verified employer badge is present in company row', () => {
        assert.match(source, /title="Verified Employer"/, 'Verified employer badge title attribute exists');
        assert.match(source, /FaCheckCircle/, 'Check circle icon used for verified badge');
    });

    await t.test('2. Duplicate date is removed from header metadata row', () => {
        // The top metadata row should only contain Location, Applicants, and Actively Hiring
        const metaRowMatch = source.match(/{\/\* Metadata Row[\s\S]*?{\/\* Bookmark Button/);
        assert.ok(metaRowMatch, 'Metadata row section found');
        const metaContent = metaRowMatch[0];
        assert.ok(!metaContent.includes('job.postedDate'), 'job.postedDate must NOT be in top metadata row');
        assert.match(metaContent, /Actively Hiring/, 'Actively Hiring status badge present in metadata');
    });

    await t.test('3. Date is formatted via formatPostedDate in the footer', () => {
        assert.match(source, /formatPostedDate/, 'formatPostedDate helper exists');
        assert.match(source, /postedDate:\s*formatPostedDate\(job\.postedDate\)/, 'formatPostedDate applied to footer date');
    });

    await t.test('4. Badges strip has unified and harmonious design tokens', () => {
        assert.match(source, /bg-gradient-to-r from-emerald-50 to-teal-50/, 'High contrast salary badge styling intact');
        assert.match(source, /capitalize/, 'Capitalization applied to job type');
        assert.match(source, /getWorkModeBadgeStyle/, 'Work mode styling intact');
    });

    await t.test('5. Requirements strip has refined header and interactive count', () => {
        assert.match(source, /visibleRequirements/, 'Limited visible requirements slice');
        assert.match(source, /remainingCount/, 'Remaining requirements counter');
        assert.match(source, /cursor-pointer/, 'More button is cursor-pointer interactive');
    });

    await t.test('6. Invariants for platform controls and image sanitization are preserved', () => {
        assert.match(source, /sanitizeImageUrl/, 'Image URL sanitizer is preserved');
        assert.match(source, /onToggleSaved/, 'onToggleSaved handler preserved');
        assert.match(source, /onViewDetails/, 'onViewDetails handler preserved');
        assert.match(source, /getApplicationStatusDisplay/, 'getApplicationStatusDisplay handler preserved');
    });
});
