import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProfileData } from '../src/utils/profileData.js';
import profileSanitizerPkg from '../backend/services/profileSanitizer.js';
const { sanitizeProfilePatch } = profileSanitizerPkg;

test('1. DashboardSettings Projects subtab strictly matches ProjectsStep architecture', () => {
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    // 1. Must contain the 5 canonical fields
    assert.match(settingsContent, /Project Name/, 'Must contain Project Name label');
    assert.match(settingsContent, /Your Role in Project/, 'Must contain Your Role in Project label');
    assert.match(settingsContent, /Technologies \/ Tools Used/, 'Must contain Technologies label');
    assert.match(settingsContent, /Project \/ Portfolio URL/, 'Must contain Project URL label');
    assert.match(settingsContent, /Project Type \/ Category/, 'Must contain Project Type / Category selector');

    // 2. Must contain project type selection buttons
    assert.match(settingsContent, /PROJECT_TYPES\.map/, 'Must iterate PROJECT_TYPES');
    assert.match(settingsContent, /updateProject\(idx, 'projectType', type\.id\)/, 'Must update projectType on click');

    // 3. Must contain Auto-Recommend (AI) and Live Search
    assert.match(settingsContent, /handleRecommendAiProjects/, 'Must wire handleRecommendAiProjects');
    assert.match(settingsContent, /Auto-Recommend \(AI\)/, 'Must have Auto-Recommend button');
    assert.match(settingsContent, /Search projects, roles, or tools\.\.\./, 'Must have live search input');

    // 4. Must NOT contain textarea or description input for projects
    assert.doesNotMatch(settingsContent, /<textarea[^>]*proj\.description/, 'Must not render textarea for project description in Projects subtab');
    assert.doesNotMatch(settingsContent, /updateProject\(idx, 'description'/, 'Must not update project description in Projects subtab UI');
});

test('2. profileData.js preserves and normalizes project role, technologies, and projectType', () => {
    const raw = {
        projects: [
            {
                title: 'Healthcare EHR Portal',
                role: 'Lead Architect',
                technologies: 'React, Node.js, FHIR, PostgreSQL',
                projectType: 'enterprise',
                link: 'https://github.com/example/ehr',
            }
        ]
    };

    const normalized = normalizeProfileData(raw);
    assert.equal(normalized.projects.length, 1);
    assert.equal(normalized.projects[0].title, 'Healthcare EHR Portal');
    assert.equal(normalized.projects[0].role, 'Lead Architect');
    assert.equal(normalized.projects[0].technologies, 'React, Node.js, FHIR, PostgreSQL');
    assert.equal(normalized.projects[0].projectType, 'enterprise');
    assert.equal(normalized.projects[0].link, 'https://github.com/example/ehr');
});

test('3. backend profileSanitizer.js preserves project role, technologies, and projectType', () => {
    const raw = {
        projects: [
            {
                id: 'proj_123',
                title: 'Distributed Cloud Scheduler',
                role: 'Staff Systems Engineer',
                technologies: 'Go, Kubernetes, gRPC, etcd',
                projectType: 'opensource',
                url: 'https://github.com/example/scheduler',
            }
        ]
    };

    const sanitized = sanitizeProfilePatch(raw);
    assert.equal(sanitized.projects.length, 1);
    assert.equal(sanitized.projects[0].title, 'Distributed Cloud Scheduler');
    assert.equal(sanitized.projects[0].role, 'Staff Systems Engineer');
    assert.equal(sanitized.projects[0].technologies, 'Go, Kubernetes, gRPC, etcd');
    assert.equal(sanitized.projects[0].projectType, 'opensource');
    assert.equal(sanitized.projects[0].url, 'https://github.com/example/scheduler');
});

test('4. ProjectsStep and DashboardSettings share the canonical PROJECT_TYPES and GET_CURATED_PROJECT_IDEAS', () => {
    const stepContent = fs.readFileSync('src/components/BuildResume/steps/ProjectsStep.jsx', 'utf8');
    const settingsContent = fs.readFileSync('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8');

    assert.match(stepContent, /export const PROJECT_TYPES =/, 'ProjectsStep must export PROJECT_TYPES');
    assert.match(stepContent, /export const GET_CURATED_PROJECT_IDEAS =/, 'ProjectsStep must export GET_CURATED_PROJECT_IDEAS');
    assert.match(settingsContent, /import \{ PROJECT_TYPES, GET_CURATED_PROJECT_IDEAS \} from '\.\.\/\.\.\/BuildResume\/steps\/ProjectsStep'/, 'DashboardSettings must import canonical constants from ProjectsStep');
});
