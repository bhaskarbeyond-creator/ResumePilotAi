import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Global Modal & Popup ESC Key Dismissal Architecture', async (t) => {
    const templateSelectionPath = path.resolve('src/components/BuildResume/TemplateSelectionModal.jsx');
    const settingsPath = path.resolve('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx');
    const homepagePath = path.resolve('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
    const enterpriseModalPath = path.resolve('src/enterprise/components/EnterpriseConfirmModal.jsx');

    const templateSelectionCode = fs.readFileSync(templateSelectionPath, 'utf8');
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');
    const homepageCode = fs.readFileSync(homepagePath, 'utf8');
    const enterpriseModalCode = fs.readFileSync(enterpriseModalPath, 'utf8');

    await t.test('TemplateSelectionModal enforces two-stage child-first Escape hierarchy', () => {
        assert.ok(
            templateSelectionCode.includes("window.addEventListener('keydown', handleGlobalKey)") ||
            templateSelectionCode.includes("addEventListener('keydown'"),
            'TemplateSelectionModal must attach window-level keydown listener'
        );
        assert.ok(
            templateSelectionCode.includes('if (previewTemplate) {') && templateSelectionCode.includes('setPreviewTemplate(null)'),
            'First Escape press must dismiss child previewTemplate first before dismissing parent modal'
        );
    });

    await t.test('DashboardSettings attaches window-level Escape listener for all active modals', () => {
        assert.ok(
            settingsCode.includes("window.addEventListener('keydown', handleGlobalKey)") ||
            settingsCode.includes("addEventListener('keydown'"),
            'DashboardSettings must attach window keydown listener'
        );
        assert.ok(
            settingsCode.includes("e.key === 'Escape'") || settingsCode.includes("event.key === 'Escape'"),
            'DashboardSettings must handle Escape key explicitly'
        );
    });

    await t.test('DashboardHomepage dismisses document preview modal and delete modal on Escape', () => {
        assert.ok(
            homepageCode.includes("window.addEventListener('keydown', this.handleGlobalKeyDown)"),
            'DashboardHomepage must attach window keydown listener'
        );
        assert.ok(
            homepageCode.includes("this.closeDocumentPreview()"),
            'DashboardHomepage must close document preview on Escape'
        );
    });

    await t.test('EnterpriseConfirmModal attaches window keydown Escape listener', () => {
        assert.ok(
            enterpriseModalCode.includes("window.addEventListener('keydown', handleKeyDown)") ||
            enterpriseModalCode.includes("addEventListener('keydown'"),
            'EnterpriseConfirmModal must attach window keydown listener'
        );
    });
});
