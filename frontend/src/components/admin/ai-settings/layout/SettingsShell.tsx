import React, { Component, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SubtabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(_error: Error, _info: React.ErrorInfo) {
    // Isolated subtab error boundary
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-error-100 bg-error-50 p-6 space-y-3 text-ink"
        >
          <div className="flex items-center gap-2 text-error-700 font-bold text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <h3>{this.props.fallbackTitle || 'Subtab Rendering Error'}</h3>
          </div>
          <p className="text-xs text-ink-secondary">
            {this.state.error?.message || 'An unexpected error occurred in this section.'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry Section
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SettingsShell({ children }: { children: ReactNode }) {
  const {
    loading,
    isSuperAdmin,
    settingsError,
    loadSettings,
    revisionConflict,
    commitSettingsPatch,
  } = useAiSettingsContext();

  if (loading) {
    return (
      <div className="space-y-4 py-6" role="status" aria-label="Loading AI Multi-Provider Engine">
        <div className="h-24 rounded-2xl bg-canvas-soft animate-pulse border border-border" />
        <div className="h-12 rounded-xl bg-canvas-soft animate-pulse border border-border" />
        <div className="h-64 rounded-2xl bg-canvas-soft animate-pulse border border-border" />
      </div>
    );
  }

  if (isSuperAdmin && settingsError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-error-100 bg-error-50 p-6 space-y-4 text-ink"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-error-700 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-bold text-error-700">AI Engine Configuration Error</h2>
            <p className="text-sm text-ink-secondary wrap-break-word">{settingsError}</p>
          </div>
        </div>
        <Button type="button" onClick={() => void loadSettings()}>
          <RefreshCw className="size-4 mr-2" />
          Retry configuration
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0" data-testid="ai-multi-provider-engine">
      {/* 409 Revision Conflict Banner */}
      {revisionConflict && (
        <div
          role="alert"
          data-testid="revision-conflict-banner"
          className="rounded-xl border border-warning-100 bg-warning-50 p-4 space-y-2 text-ink"
        >
          <div className="flex items-center gap-2 text-warning-700 font-bold text-xs">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Concurrent Edit Detected (Server Revision #{revisionConflict.currentRevision ?? '?'})
            </span>
          </div>
          <p className="text-xs text-ink-secondary">{revisionConflict.message}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadSettings()}>
              Reload Server Settings
            </Button>
            {revisionConflict.pendingPayload && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void commitSettingsPatch(
                    revisionConflict.pendingPayload!,
                    'Configuration saved (overwrote prior revision).',
                    { force: true }
                  )
                }
              >
                Overwrite Server Version
              </Button>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
