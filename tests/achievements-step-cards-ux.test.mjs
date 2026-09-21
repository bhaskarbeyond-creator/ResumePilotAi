import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. AchievementsStep Card UX — Component Structure & Safety Invariants', () => {
    const fileContent = fs.readFileSync(path.resolve('src/components/BuildResume/steps/AchievementsStep.jsx'), 'utf-8');

    // 1. Must use StepShell with title and onNavigate
    assert.ok(fileContent.includes('StepShell'), 'Must wrap with StepShell');
    assert.ok(fileContent.includes('onNavigate'), 'Must accept onNavigate prop');
    assert.ok(fileContent.includes('Honors, Awards & Key Achievements'), 'Must declare Honors, Awards & Key Achievements title');

    // 2. Zero-Clutter Invariant: Auto-Recommend (AI) modal removed per user requirement
    assert.doesNotMatch(fileContent, /AiRecommendationModal/, 'Must not mount AiRecommendationModal');
    assert.doesNotMatch(fileContent, /handleRecommendAiAchievements/, 'Must not have handleRecommendAiAchievements');
    assert.doesNotMatch(fileContent, /🪄 Auto-Recommend/, 'Must not render Auto-Recommend (AI) button');

    // 3. Must have recognition signals scanning from candidate experience
    assert.ok(fileContent.includes('findAchievementSignals'), 'Must compute recognition signals');
    assert.ok(fileContent.includes('Scan Experience'), 'Must offer Scan Experience trigger');

    // 4. Must provide 5 curated achievement classifications
    assert.ok(fileContent.includes("id: 'Award'"), 'Must include Award type');
    assert.ok(fileContent.includes("id: 'Honor'"), 'Must include Honor type');
    assert.ok(fileContent.includes("id: 'Competition'"), 'Must include Hackathon/Competition type');
    assert.ok(fileContent.includes("id: 'Academic'"), 'Must include Academic Distinction type');
    assert.ok(fileContent.includes("id: 'Milestone'"), 'Must include Key Milestone type');

    // 5. Must contain Card Header controls: Index badge, Move Up, Move Down, Duplicate, Delete
    assert.match(fileContent, /originalIndex \+ 1/, 'Must render card index badge');
    assert.match(fileContent, /moveAchievement\(achievement\.id, -1\)/, 'Must wire Move Up button');
    assert.match(fileContent, /moveAchievement\(achievement\.id, 1\)/, 'Must wire Move Down button');
    assert.match(fileContent, /duplicateAchievement\(achievement\.id\)/, 'Must wire Duplicate button');
    assert.match(fileContent, /removeAchievement\(achievement\.id\)/, 'Must wire Delete button');

    // 6. Must contain Award Title, Date Received, and Awarding Organization
    assert.ok(fileContent.includes('Award or Honor Title'), 'Must contain Award or Honor Title placeholder/label');
    assert.ok(fileContent.includes('Date Received'), 'Must contain Date Received label');
    assert.ok(fileContent.includes('Awarding Organization or Issuer'), 'Must contain Awarding Organization or Issuer');

    // 7. Must contain in-card AI Polish & Quick Starter Chips
    assert.ok(fileContent.includes('polishAchievementDescription'), 'Must wire polishAchievementDescription');
    assert.ok(fileContent.includes('🪄 Enhance with AI'), 'Must render Enhance with AI button');
    assert.ok(fileContent.includes('SUGGESTION_CHIPS'), 'Must provide SUGGESTION_CHIPS');

    // 8. Unmount flush & zero-fabrication invariants
    assert.ok(fileContent.includes('updateResumeDataRef.current'), 'Must maintain unmount flush ref');
    assert.ok(fileContent.includes('useEffect(() => () =>'), 'Must maintain unmount flush cleanup');
    assert.match(fileContent, /description:\s*''/, 'New achievement items must start with blank description');

    // 9. Live Search and Category Filtering
    assert.ok(fileContent.includes('searchQuery'), 'Must support live search filtering');
    assert.ok(fileContent.includes('selectedTypeFilter'), 'Must support category filtering');
});

test('2. AchievementsStep Card UX — Recognition Signals & Category Types Integrity', () => {
    const fileContent = fs.readFileSync(path.resolve('src/components/BuildResume/steps/AchievementsStep.jsx'), 'utf-8');

    // Must define 5 distinct recognition types and quick starters
    assert.ok(fileContent.includes('ACHIEVEMENT_TYPES'), 'Must define ACHIEVEMENT_TYPES');
    assert.ok(fileContent.includes('SUGGESTION_CHIPS'), 'Must define SUGGESTION_CHIPS');
    assert.ok(fileContent.includes('RECOGNITION_SIGNAL'), 'Must define RECOGNITION_SIGNAL regex');
    assert.ok(fileContent.includes('findAchievementSignals'), 'Must define findAchievementSignals');
});
