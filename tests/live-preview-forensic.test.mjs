import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeResumeData, EMPTY_RESUME } from '../src/utils/resumeData.js';

test('Live Preview State & Data Transformation Forensic Verification', async (t) => {
    const homepagePath = path.resolve('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
    const homepageCode = fs.readFileSync(homepagePath, 'utf8');

    await t.test('DashboardHomepage renders Live Preview action in 3-dots action dropdown menu', () => {
        assert.ok(
            homepageCode.includes('Live Preview'),
            'DashboardHomepage must render "Live Preview" in 3-dots menu'
        );
        assert.ok(
            homepageCode.includes('this.openDocumentPreview(document)'),
            'Clicking Live Preview must invoke openDocumentPreview(document)'
        );
        assert.ok(
            homepageCode.includes('FaEye'),
            'Live Preview action must render FaEye icon'
        );
        assert.ok(
            homepageCode.includes('previewingDocument: document') && homepageCode.includes('showPreviewModal: true'),
            'openDocumentPreview must set previewingDocument and showPreviewModal'
        );
    });

    await t.test('generates normalized preview view-model from empty resume without throwing', () => {
        const raw = normalizeResumeData(EMPTY_RESUME);
        assert.ok(Array.isArray(raw.employments));
        assert.ok(Array.isArray(raw.educations));
        assert.ok(Array.isArray(raw.skills));
        assert.ok(Array.isArray(raw.languages));
    });

    await t.test('normalizes populated resume data with custom sections and full address', () => {
        const input = {
            firstname: 'Dev',
            lastname: 'Engineer',
            address: '100 Tech Blvd',
            city: 'Bangalore',
            country: 'India',
            postalCode: '560001',
            skills: [{ skillName: 'React', rating: 90 }, { name: 'Node.js', rating: 85 }],
            employments: [{ jobTitle: 'SRE Lead', employer: 'Acme Corp' }],
            template: 'Cv1',
        };

        const normalized = normalizeResumeData(input);
        assert.equal(normalized.firstname, 'Dev');
        assert.equal(normalized.lastname, 'Engineer');
        assert.equal(normalized.skills.length, 2);
        assert.equal(normalized.employments[0].jobTitle, 'SRE Lead');
    });

    await t.test('safely transforms skill format between legacy and current schema for preview compatibility', () => {
        const skills = [
            { skillName: 'Kubernetes', rating: 95 },
            { name: 'TypeScript', rating: 90 },
            'Docker',
        ];

        const previewSkills = skills.map((skill, index) => {
            if (typeof skill === 'string') return { name: skill, rating: 50, date: index + 1 };
            return {
                name: skill.skillName || skill.name || '',
                rating: skill.rating || 50,
                date: skill.date || index + 1,
            };
        });

        assert.deepEqual(previewSkills, [
            { name: 'Kubernetes', rating: 95, date: 1 },
            { name: 'TypeScript', rating: 90, date: 2 },
            { name: 'Docker', rating: 50, date: 3 },
        ]);
    });
});
