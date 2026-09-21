import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProfileData } from '../src/utils/profileData.js';
import profileSanitizerPkg from '../backend/services/profileSanitizer.js';
const { sanitizeProfilePatch } = profileSanitizerPkg;

test('1. DashboardSettings Achievements subtab strictly matches AchievementsStep card architecture', () => {
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    // 1. Must contain the canonical classification pills
    assert.match(settingsContent, /Category & Recognition Type|Category &amp; Recognition Type/, 'Must contain Category & Recognition Type label');
    assert.match(settingsContent, /ACHIEVEMENT_TYPES\.map/, 'Must iterate canonical ACHIEVEMENT_TYPES');
    assert.match(settingsContent, /updateAchievement\(originalIndex, 'achievementType', type\.id\)/, 'Must update achievementType on category click');

    // 2. Must contain standardized fields: Title, Date, Issuer/Organization
    assert.match(settingsContent, /label="Award or Honor Title"/, 'Must contain Award or Honor Title label');
    assert.match(settingsContent, /label="Date Received"/, 'Must contain Date Received label');
    assert.match(settingsContent, /label="Awarding Organization or Issuer"/, 'Must contain Awarding Organization or Issuer label');

    // 3. Must contain Description with AI Polish & Quick Starter Chips
    assert.match(settingsContent, /Accomplishment & Significance|Accomplishment &amp; Significance/, 'Must contain Accomplishment & Significance label');
    assert.match(settingsContent, /polishAchievementDescription\(originalIndex\)/, 'Must wire polishAchievementDescription');
    assert.match(settingsContent, /🪄 Enhance with AI/, 'Must render AI polish button');
    assert.match(settingsContent, /SUGGESTION_CHIPS\.map/, 'Must iterate canonical SUGGESTION_CHIPS');

    // 4. Must contain Card Header controls: Index badge, Move Up, Move Down, Duplicate, Delete
    assert.match(settingsContent, /#{originalIndex \+ 1}/, 'Must render card index badge');
    assert.match(settingsContent, /moveItem\('achievements', originalIndex, -1\)/, 'Must wire Move Up button');
    assert.match(settingsContent, /moveItem\('achievements', originalIndex, 1\)/, 'Must wire Move Down button');
    assert.match(settingsContent, /duplicateAchievement\(originalIndex\)/, 'Must wire Duplicate button');
    assert.match(settingsContent, /removeAchievement\(originalIndex\)/, 'Must wire Delete button');

    // 5. Must contain Live Search and Category Filter pills
    assert.match(settingsContent, /Search honors, awards, or organizations\.\.\./, 'Must have live search input');
    assert.match(settingsContent, /setAchievementTypeFilter/, 'Must support category filtering');
    assert.match(settingsContent, /Reset filters/, 'Must support resetting search and filter');
    assert.match(settingsContent, /Add Another Achievement/, 'Must have Add Another Achievement button');
});

test('2. profileData.js preserves and normalizes achievementType in achievements list', () => {
    const raw = {
        achievements: [
            {
                title: 'First Place Hackathon Winner',
                issuer: 'TechCrunch Disrupt',
                date: '2024',
                description: 'Built generative AI agent in 24 hours.',
                achievementType: 'Competition'
            },
            {
                title: 'Summa Cum Laude Honors',
                awarder: 'MIT',
                date: '2022',
                description: 'Graduated in top 1% of class.',
                achievementType: 'Academic'
            }
        ]
    };

    const normalized = normalizeProfileData(raw);
    assert.equal(normalized.achievements.length, 2);

    // Achievement 1
    assert.equal(normalized.achievements[0].title, 'First Place Hackathon Winner');
    assert.equal(normalized.achievements[0].issuer, 'TechCrunch Disrupt');
    assert.equal(normalized.achievements[0].date, '2024');
    assert.equal(normalized.achievements[0].description, 'Built generative AI agent in 24 hours.');
    assert.equal(normalized.achievements[0].achievementType, 'Competition');

    // Achievement 2
    assert.equal(normalized.achievements[1].title, 'Summa Cum Laude Honors');
    assert.equal(normalized.achievements[1].awarder, 'MIT');
    assert.equal(normalized.achievements[1].achievementType, 'Academic');
});

test('3. backend profileSanitizer.js preserves achievementType in achievements whitelist', () => {
    const raw = {
        achievements: [
            {
                id: 'ach_1',
                title: 'Employee of the Year',
                issuer: 'Acme Corp',
                date: '2023',
                description: 'Recognized for engineering excellence.',
                achievementType: 'Award'
            }
        ]
    };

    const sanitized = sanitizeProfilePatch(raw);
    assert.equal(sanitized.achievements.length, 1);
    assert.equal(sanitized.achievements[0].title, 'Employee of the Year');
    assert.equal(sanitized.achievements[0].issuer, 'Acme Corp');
    assert.equal(sanitized.achievements[0].date, '2023');
    assert.equal(sanitized.achievements[0].achievementType, 'Award');
});

test('4. AchievementsStep and DashboardSettings share canonical ACHIEVEMENT_TYPES, SUGGESTION_CHIPS, and TYPE_STYLE_MAP', () => {
    const stepContent = fs.readFileSync('src/components/BuildResume/steps/AchievementsStep.jsx', 'utf8');
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    assert.match(stepContent, /export const ACHIEVEMENT_TYPES =/, 'AchievementsStep must export ACHIEVEMENT_TYPES');
    assert.match(stepContent, /export const SUGGESTION_CHIPS =/, 'AchievementsStep must export SUGGESTION_CHIPS');
    assert.match(stepContent, /export const TYPE_STYLE_MAP =/, 'AchievementsStep must export TYPE_STYLE_MAP');

    assert.match(settingsContent, /import \{ ACHIEVEMENT_TYPES, SUGGESTION_CHIPS, TYPE_STYLE_MAP \} from '\.\.\/\.\.\/BuildResume\/steps\/AchievementsStep'/, 'DashboardSettings must import canonical constants from AchievementsStep');
});

test('5. DashboardSettings normalizeAchievements preserves achievementType', () => {
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');
    assert.match(settingsContent, /achievementType:\s*String\(item\.achievementType\s*\|\|\s*item\.type\s*\|\|\s*'Award'\)/, 'normalizeAchievements must preserve achievementType');
});
