import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('DashboardSettings Profile UX 10/10 Verification Suite', () => {
    const fileContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    // 1. URL Deep-Linking & Subtab Synchronization
    assert.match(fileContent, /switchProfileSubTab\s*=\s*\(tabKey\)\s*=>/, 'Must provide switchProfileSubTab helper');
    assert.match(fileContent, /navigate\(`\?tab=Profile&subtab=\$\{tabKey\}`,\s*\{\s*replace:\s*true\s*\}\)/, 'Must synchronize subtab state to URL search params');
    assert.match(fileContent, /searchParams\.get\('subtab'\)/, 'Must parse subtab query parameter on load');

    // 2. Stepper Keyboard Navigation & ARIA Accessibility
    assert.match(fileContent, /handleStepperKeyDown\s*=\s*\(e\)\s*=>/, 'Must provide handleStepperKeyDown for keyboard navigation');
    assert.match(fileContent, /e\.key === 'ArrowRight'/, 'Must support ArrowRight navigation');
    assert.match(fileContent, /e\.key === 'ArrowLeft'/, 'Must support ArrowLeft navigation');
    assert.match(fileContent, /role="tablist"/, 'Must define role="tablist" on Stepper container');
    assert.match(fileContent, /role="tab"/, 'Must define role="tab" on step buttons');
    assert.match(fileContent, /aria-selected=\{isActive\}/, 'Must provide aria-selected on active step button');

    // 3. Real-Time Animated Completion Progress Bar
    assert.match(fileContent, /bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500/, 'Must render animated gradient completion bar');
    assert.match(fileContent, /SUB_TAB_ORDER\.filter\(k => SUBTAB_CONFIG\[k\]\?\.isComplete\(profile\)\)\.length/, 'Must dynamically calculate completion percentage across 12 subtabs');

    // 4. Interactive Copilot Rail Gap Navigation
    assert.match(fileContent, /handleFocusGap\s*=\s*\(gapText\)\s*=>/, 'Must provide handleFocusGap helper');
    assert.match(fileContent, /scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'center'\s*\}\)/, 'Must smooth-scroll target field on gap click');
    assert.match(fileContent, /el\.classList\.add\('ring-2',\s*'ring-indigo-400'\)/, 'Must highlight focused field with glowing ring');
    assert.match(fileContent, /onClick=\{\(\) => handleFocusGap\(gap\)\}/, 'Must wire gap item clicks to handleFocusGap');

    // 5. 12 Canonical Subtabs Alignment & Synthesis Capstone Position
    const expectedSubTabs = ['basic', 'experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'hobbies', 'achievements', 'references', 'customSections', 'summary'];
    for (const subTab of expectedSubTabs) {
        assert.match(fileContent, new RegExp(`['"]${subTab}['"]`), `Must include subtab ${subTab} in configuration`);
    }
    // Executive Bio must be at the very end to take all previously entered data as input
    assert.match(
        fileContent,
        /const\s+SUB_TAB_ORDER\s*=\s*\[[^\]]*'summary'\s*\];/,
        'Executive Bio must be placed at the very end of SUB_TAB_ORDER to synthesize all prior data'
    );

    // 6. Navigation Buttons Continuity
    assert.match(fileContent, /handleSaveAndNext/, 'Must provide handleSaveAndNext handler');
    assert.match(fileContent, /switchProfileSubTab\(nextTab\)/, 'Save & Next must navigate via switchProfileSubTab');
});
