/**
 * Admin AI Multi-Provider Engine Orchestrator
 *
 * Decomposed architecture:
 * - Orchestrator (< 300 lines): layout composition, context provider, subtab router
 * - Leaf components (< 500 lines each): providers, quotas, gateway, discovery, metrics, playground
 * - Shared context: AiSettingsContext provides central state & mutations without prop drilling
 */

import React from 'react';
import type { AdminAiSettingsTabProps } from './types/ai-settings.types';
import { AiSettingsProvider, useAiSettingsContext } from './context/AiSettingsContext';
import { SettingsShell, SubtabErrorBoundary } from './layout/SettingsShell';
import { SettingsHeader } from './layout/SettingsHeader';
import { SettingsSubNav } from './layout/SettingsSubNav';
import { RuntimeModelStrip } from './providers/RuntimeModelStrip';
import { AiSettingsDialogs } from './layout/AiSettingsDialogs';
import { AdminScopedView } from './layout/AdminScopedView';
import { ProvidersTab } from './providers/ProvidersTab';
import { KeyPoolTab } from './providers/KeyPoolTab';
import { DiscoveryTab } from './discovery/DiscoveryTab';
import { SystemMetricsTab } from './metrics/SystemMetricsTab';
import { UnifiedGatewayTab } from './gateway/UnifiedGatewayTab';
import { ClaudeCodeTab } from './gateway/ClaudeCodeTab';
import { PlaygroundTab } from './playground/PlaygroundTab';

function AdminAiSettingsContent() {
  const { isSuperAdmin, activeSubtab } = useAiSettingsContext();

  if (!isSuperAdmin) {
    return <AdminScopedView />;
  }

  const isDiscoveryOrModels = activeSubtab === 'discovery' || activeSubtab === 'models';
  const isMetricsOrQuotas = activeSubtab === 'metrics' || activeSubtab === 'quotas';
  const isGateway = activeSubtab === 'unified-gateway';
  const isClaude = activeSubtab === 'claude';

  return (
    <SettingsShell>
      <SettingsHeader />
      <RuntimeModelStrip />
      <SettingsSubNav />

      {activeSubtab === 'providers' && (
        <SubtabErrorBoundary fallbackTitle="Providers Management Error">
          <ProvidersTab />
        </SubtabErrorBoundary>
      )}

      {activeSubtab === 'key-pool' && (
        <SubtabErrorBoundary fallbackTitle="Key Pool Manager Error">
          <KeyPoolTab />
        </SubtabErrorBoundary>
      )}

      {isDiscoveryOrModels && (
        <SubtabErrorBoundary fallbackTitle="Model Catalog & Discovery Error">
          <DiscoveryTab />
        </SubtabErrorBoundary>
      )}

      {isMetricsOrQuotas && (
        <SubtabErrorBoundary fallbackTitle="Quotas & Telemetry Error">
          <SystemMetricsTab />
        </SubtabErrorBoundary>
      )}

      {isGateway && (
        <SubtabErrorBoundary fallbackTitle="Unified Gateway Error">
          <UnifiedGatewayTab />
        </SubtabErrorBoundary>
      )}

      {isClaude && (
        <SubtabErrorBoundary fallbackTitle="Claude Code CLI Error">
          <ClaudeCodeTab />
        </SubtabErrorBoundary>
      )}

      {activeSubtab === 'playground' && (
        <SubtabErrorBoundary fallbackTitle="Router Playground Error">
          <PlaygroundTab />
        </SubtabErrorBoundary>
      )}

      <AiSettingsDialogs />
    </SettingsShell>
  );
}

export function AdminAiSettingsTab(props: AdminAiSettingsTabProps = {}) {
  return (
    <AiSettingsProvider {...props}>
      <AdminAiSettingsContent />
    </AiSettingsProvider>
  );
}

export default AdminAiSettingsTab;
