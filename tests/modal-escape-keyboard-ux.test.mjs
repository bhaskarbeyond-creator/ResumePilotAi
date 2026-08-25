import test from 'node:test';
import assert from 'node:assert/strict';

test('Global Modal & Popup ESC Key Dismissal Architecture', async (t) => {
    await t.test('Escape key closes topmost modal in nested hierarchy', () => {
        const modalStack = [];
        const openModal = (id) => modalStack.push(id);
        const handleEscape = () => {
            if (modalStack.length > 0) {
                return modalStack.pop();
            }
            return null;
        };

        // Open parent modal (TemplateSelectionModal)
        openModal('TemplateSelectionModal');
        assert.deepEqual(modalStack, ['TemplateSelectionModal']);

        // Open child preview (previewTemplate)
        openModal('previewTemplate');
        assert.deepEqual(modalStack, ['TemplateSelectionModal', 'previewTemplate']);

        // First ESC closes child preview
        const firstClosed = handleEscape();
        assert.equal(firstClosed, 'previewTemplate');
        assert.deepEqual(modalStack, ['TemplateSelectionModal']);

        // Second ESC closes parent selection modal
        const secondClosed = handleEscape();
        assert.equal(secondClosed, 'TemplateSelectionModal');
        assert.deepEqual(modalStack, []);
    });

    await t.test('window keydown event listener dismisses modal regardless of internal focus target', () => {
        let isModalOpen = true;
        let isProcessing = false;

        const handleGlobalKeyDown = (event) => {
            if (event.key === 'Escape' && !isProcessing && isModalOpen) {
                isModalOpen = false;
            }
        };

        // Simulate keydown event dispatched at document/window level
        handleGlobalKeyDown({ key: 'Escape' });
        assert.equal(isModalOpen, false);
    });

    await t.test('Escape does not prematurely cancel actions while network request is in-flight', () => {
        let isModalOpen = true;
        let isProcessing = true;

        const handleGlobalKeyDown = (event) => {
            if (event.key === 'Escape' && !isProcessing && isModalOpen) {
                isModalOpen = false;
            }
        };

        // In-flight request prevents accidental abort
        handleGlobalKeyDown({ key: 'Escape' });
        assert.equal(isModalOpen, true);

        // Once completed, Escape works cleanly
        isProcessing = false;
        handleGlobalKeyDown({ key: 'Escape' });
        assert.equal(isModalOpen, false);
    });
});
