import React from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { splitKeys } from '../utils/masking';

export function ConfigureProviderDialog() {
  const {
    activeDialog,
    closeDialog,
    resetModalDrafts,
    providers,
    modalTab,
    setModalTab,
    modalSelectedId,
    setModalSelectedId,
    platformDropdownOpen,
    setPlatformDropdownOpen,
    modalPlatformQuery,
    setModalPlatformQuery,
    modalFilteredPlatforms,
    modalSelectedPlatform,
    modalApiKey,
    setModalApiKey,
    modalShowKey,
    setModalShowKey,
    modalKeyInputRef,
    modalPoolText,
    setModalPoolText,
    modalCustomBaseUrl,
    setModalCustomBaseUrl,
    modalCustomModel,
    setModalCustomModel,
    modalError,
    setModalError,
    modalTestStatus,
    setModalTestStatus,
    modalTesting,
    canProbeInModal,
    saving,
    handleToggleProvider,
    handleModalProbeBeforeSave,
    handleModalSaveAndActivate,
  } = useAiSettingsContext();

  return (
    <Dialog
      open={activeDialog === 'configure-provider'}
      onOpenChange={(open) => {
        if (!open) {
          resetModalDrafts();
          closeDialog();
        }
      }}
    >
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Provider</DialogTitle>
          <DialogDescription>
            {providers.length} platforms supported. Keys are write-only, encrypted at rest, and
            never returned in plaintext after save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'single', label: 'Provider key' },
                { id: 'pool', label: 'Multi-key pool' },
                { id: 'endpoint', label: 'Custom endpoint' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setModalTab(t.id);
                  setModalTestStatus(null);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer',
                  modalTab === t.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-canvas text-ink-secondary border border-border'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Platform Selector */}
          <div className="space-y-1.5 relative">
            <span className="block text-xs font-semibold text-ink">Target Platform</span>
            <button
              type="button"
              data-testid="platform-selector"
              aria-expanded={platformDropdownOpen}
              onClick={() => setPlatformDropdownOpen((v) => !v)}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-left text-xs font-semibold text-ink flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="truncate">
                {modalSelectedPlatform
                  ? `${modalSelectedPlatform.name} (${modalSelectedPlatform.id})`
                  : `Select from ${providers.length} platforms...`}
              </span>
              <ChevronDown className="size-4 text-ink-muted shrink-0" />
            </button>

            {platformDropdownOpen && (
              <div className="rounded-xl border border-border bg-surface shadow-lg p-2 space-y-2 max-h-56 overflow-y-auto z-10">
                <input
                  type="search"
                  aria-label={`Search ${providers.length} platforms`}
                  placeholder={`Search ${providers.length} platforms...`}
                  value={modalPlatformQuery}
                  onChange={(e) => setModalPlatformQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink"
                />
                <div className="space-y-0.5">
                  {modalFilteredPlatforms.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`platform-option-${p.id}`}
                      onClick={() => {
                        setModalSelectedId(p.id);
                        setPlatformDropdownOpen(false);
                        setModalError(null);
                        setModalTestStatus(null);
                      }}
                      className={cn(
                        'w-full rounded-lg px-2.5 py-1.5 text-left text-xs flex items-center justify-between gap-2 cursor-pointer',
                        modalSelectedId === p.id
                          ? 'bg-brand-50 text-brand-700 font-bold'
                          : 'text-ink hover:bg-canvas'
                      )}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[11px] text-ink-muted shrink-0">
                        {p.keyless ? 'keyless' : p.hasKey ? 'configured' : p.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {modalTab === 'single' && (
            <div className="space-y-1.5">
              <label htmlFor="modal-api-key-input" className="block text-xs font-semibold text-ink">
                API Key {modalSelectedPlatform?.keyless ? '(Optional for keyless provider)' : ''}
              </label>
              <div className="relative">
                <input
                  ref={modalKeyInputRef}
                  id="modal-api-key-input"
                  type={modalShowKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    modalSelectedPlatform?.keyless
                      ? 'Keyless local/public endpoint — no key required'
                      : 'Paste provider API key...'
                  }
                  value={modalApiKey}
                  onChange={(e) => setModalApiKey(e.target.value)}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 pr-9 text-xs font-mono text-ink"
                />
                <button
                  type="button"
                  aria-label={modalShowKey ? 'Hide API key' : 'Show API key'}
                  onClick={() => setModalShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  {modalShowKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
          )}

          {modalTab === 'pool' && (
            <div className="space-y-1.5">
              <label htmlFor="modal-pool-textarea" className="block text-xs font-semibold text-ink">
                API Key Pool (one key per line)
              </label>
              <textarea
                id="modal-pool-textarea"
                rows={4}
                spellCheck={false}
                placeholder="Paste one API key per line..."
                value={modalPoolText}
                onChange={(e) => setModalPoolText(e.target.value)}
                className="w-full rounded-xl border border-border bg-canvas p-2.5 text-xs font-mono text-ink"
              />
              <p className="text-[11px] text-ink-muted">
                {splitKeys(modalPoolText).length} key(s) ready for server vault.
              </p>
            </div>
          )}

          {modalTab === 'endpoint' && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="modal-custom-endpoint"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Base URL Override
                </label>
                <Input
                  id="modal-custom-endpoint"
                  placeholder="https://my-openai-gateway.com/v1"
                  value={modalCustomBaseUrl}
                  onChange={(e) => setModalCustomBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="modal-custom-model"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Default Model Target (optional)
                </label>
                <Input
                  id="modal-custom-model"
                  placeholder="e.g. llama-3.3-70b-instruct"
                  value={modalCustomModel}
                  onChange={(e) => setModalCustomModel(e.target.value)}
                />
              </div>
            </div>
          )}

          {modalError && (
            <div
              role="alert"
              className="rounded-xl border border-error-100 bg-error-50 p-2.5 text-xs font-semibold text-error-700"
            >
              {modalError}
            </div>
          )}

          {modalTestStatus && (
            <div
              role={modalTestStatus.ok ? 'status' : 'alert'}
              className={cn(
                'rounded-xl border p-2.5 text-xs font-semibold',
                modalTestStatus.ok
                  ? 'border-success-100 bg-success-50 text-success-700'
                  : 'border-error-100 bg-error-50 text-error-700'
              )}
            >
              {modalTestStatus.msg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 flex-wrap sm:flex-nowrap">
          {modalSelectedPlatform && (modalSelectedPlatform.hasKey || modalSelectedPlatform.keyless) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={async () => {
                if (modalSelectedPlatform) {
                  await handleToggleProvider(modalSelectedPlatform, !modalSelectedPlatform.enabled);
                  closeDialog();
                }
              }}
              className={cn(
                'cursor-pointer',
                modalSelectedPlatform.enabled
                  ? 'text-warning-700 border-warning-200 hover:bg-warning-50'
                  : 'text-brand-700 border-brand-200 hover:bg-brand-50'
              )}
            >
              {modalSelectedPlatform.enabled ? 'Deactivate Provider' : 'Activate Provider'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canProbeInModal || modalTesting}
            onClick={() => void handleModalProbeBeforeSave()}
          >
            {modalTesting ? 'Testing...' : 'Test Key Before Saving'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleModalSaveAndActivate()}
          >
            {saving ? 'Saving...' : 'Add key & Activate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
