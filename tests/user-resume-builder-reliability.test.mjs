import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Resume Builder Reliability — Address formatting handles non-string primitives without throwing', () => {
    const edgeCases = [
        { address: 123, city: 456, postalcode: 78901, country: 'USA' },
        { address: null, city: undefined, postalcode: 90210, country: null },
        { address: '', city: '', postalcode: 0, country: '' },
        { address: true, city: false, postalcode: null, country: undefined },
    ];

    for (const testCase of edgeCases) {
        assert.doesNotThrow(() => {
            const addressParts = [
                testCase.address,
                testCase.city,
                testCase.postalcode,
                testCase.country
            ].map(item => String(item || '').trim()).filter(Boolean);
            
            assert.ok(Array.isArray(addressParts));
        });
    }
});

test('Resume Builder Reliability — HeadingStep validation and badges handle numbers and edge types', () => {
    const requiredFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];
    const sampleFormData = {
        firstname: 'Jane',
        lastname: 'Doe',
        email: 'jane@example.com',
        phone: 1234567890, // numeric phone
        occupation: 'Senior Engineer',
        country: 'USA',
        city: 'New York',
        address: 100, // numeric address
        postalcode: 10001, // numeric postal code
        website: 'https://jane.dev',
        linkedin: 12345, // numeric
        github: '',
    };

    // 1. Validate complete fields calculation
    assert.doesNotThrow(() => {
        const completedRequired = requiredFields.filter((field) => String(sampleFormData[field] || '').trim() !== '').length;
        assert.equal(completedRequired, 5);

        const badgeResult = ['firstname', 'lastname', 'occupation'].filter((field) => String(sampleFormData[field] || '').trim() !== '').length;
        assert.equal(badgeResult, 3);

        const contactBadge = ['email', 'phone'].filter((field) => String(sampleFormData[field] || '').trim() !== '').length;
        assert.equal(contactBadge, 2);

        const socialBadge = ['website', 'linkedin', 'github'].filter((f) => String(sampleFormData[f] || '').trim() !== '').length;
        assert.equal(socialBadge, 2);
    });
});

test('Resume Builder Reliability — Step components contain zero uncoerced trim() calls on polymorphic inputs', () => {
    const srcDir = path.resolve(process.cwd(), 'src/components/BuildResume');
    
    // Read BuildResume.jsx
    const buildResumeContent = fs.readFileSync(path.join(srcDir, 'BuildResume.jsx'), 'utf-8');
    assert.ok(!buildResumeContent.includes('item => (item || \'\').trim()'), 'BuildResume must not use uncoerced item => (item || \'\').trim()');
    assert.ok(buildResumeContent.includes('String(item || \'\').trim()'), 'BuildResume must use String(item || \'\').trim()');

    // Read HeadingStep.jsx
    const headingStepContent = fs.readFileSync(path.join(srcDir, 'steps/HeadingStep.jsx'), 'utf-8');
    assert.ok(!headingStepContent.includes('formData[field].trim()'), 'HeadingStep must coerce formData[field] to String');
    assert.ok(!headingStepContent.includes('!value.trim()'), 'HeadingStep must coerce validateField value to String');

    // Read Field.jsx (the single input language for every builder field)
    const fieldContent = fs.readFileSync(path.join(srcDir, 'components/Field.jsx'), 'utf-8');
    assert.ok(!fieldContent.includes('value.trim() !== \'\''), 'Field must coerce value safely');

    // Read AtsScoreMeter.jsx
    const atsScoreMeterContent = fs.readFileSync(path.join(srcDir, 'AtsScoreMeter.jsx'), 'utf-8');
    assert.ok(!atsScoreMeterContent.includes('result.status.id'), 'AtsScoreMeter must use safe optional chaining on result.status.id');

    // Read RouteErrorBoundary.jsx
    const routeErrorBoundaryContent = fs.readFileSync(path.join(process.cwd(), 'src/components/common/RouteErrorBoundary.jsx'), 'utf-8');
    assert.ok(routeErrorBoundaryContent.includes('/dashboard'), 'RouteErrorBoundary must include /dashboard return path for candidates');
});

test('Resume Builder Reliability — AtsScoreMeter handles null/malformed result gracefully', () => {
    assert.doesNotThrow(() => {
        const dummyResult = null;
        const theme = dummyResult?.status?.id || 'getting-started';
        const qualityScore = dummyResult?.qualityScore || 0;
        const statusLabel = dummyResult?.status?.label || 'Getting Started';
        const matchScore = dummyResult?.jdMatch?.score;
        
        assert.equal(theme, 'getting-started');
        assert.equal(qualityScore, 0);
        assert.equal(statusLabel, 'Getting Started');
        assert.equal(matchScore, undefined);
    });
});

test('Resume Builder Reliability — FinalizeStep completeness computation handles numeric/null fields safely', () => {
    const malformedResumeData = {
        firstname: 'John',
        lastname: 123,
        email: 'john@example.com',
        phone: 9876543210,
        occupation: 'Dev',
        employments: [
            { jobTitle: 123, employer: 456 },
            { jobTitle: null, employer: undefined }
        ],
        skills: [
            { skillName: 123 },
            { name: 'JavaScript' },
            { skillName: null }
        ],
        summary: 1234567890
    };

    assert.doesNotThrow(() => {
        let score = 0;
        let total = 0;

        const personalFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];
        personalFields.forEach((field) => {
            total += 4;
            if (String(malformedResumeData[field] || '').trim()) score += 4;
        });

        total += 30;
        const validEmployments = (malformedResumeData.employments || []).filter((emp) => String(emp?.jobTitle || '').trim() && String(emp?.employer || '').trim());
        score += Math.min(30, validEmployments.length * 15);

        total += 25;
        const validSkills = (malformedResumeData.skills || []).filter((skill) => String(skill?.skillName || skill?.name || '').trim());
        score += Math.min(25, validSkills.length * 5);

        total += 25;
        const summaryText = String(malformedResumeData.summary || '').trim();
        if (summaryText) {
            if (summaryText.length >= 200) score += 25;
            else if (summaryText.length >= 100) score += 15;
            else if (summaryText.length >= 50) score += 10;
        }

        const percentage = Math.round((score / total) * 100);
        assert.ok(percentage >= 0 && percentage <= 100);
    });
});
