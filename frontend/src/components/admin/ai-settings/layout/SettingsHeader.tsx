import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function SettingsHeader() {
  const {
    toastMsg,
    setToastMsg,
    actionError,
    setActionError,
  } = useAiSettingsContext();

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-xs font-semibold text-success-700 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="truncate">{toastMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="underline font-bold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-xs font-semibold text-error-700 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="wrap-break-word">{actionError}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="underline font-bold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
