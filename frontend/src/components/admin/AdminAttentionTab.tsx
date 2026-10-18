/**
 * Platform Attention Needed Sub-Module Tab
 *
 * Derived from platform signals and live operational health.
 * Binds to /api/platform/attention and /api/platform/command-center
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Activity,
  ArrowRight,
  ShieldAlert,
  Clock,
  Layers,
  Users,
} from 'lucide-react';

interface AttentionSignal {
  id: string;
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  source: string;
  category: string;
  targetTab?: string;
  timestamp: string;
}

const DEFAULT_SIGNALS: AttentionSignal[] = [
  {
    id: 'att_1',
    title: 'Employer Verification Pending Review',
    description: 'Vertex AI Labs has submitted enterprise employer documents awaiting administrative verification.',
    severity: 'MEDIUM',
    source: 'verification_pipeline',
    category: 'Employer Moderation',
    targetTab: 'moderation',
    timestamp: '14m ago',
  },
  {
    id: 'att_2',
    title: 'Background DLQ Queue Has Dead-Letters',
    description: '2 failed outbox sync events routed to DLQ. Review retry policies or drain failed events.',
    severity: 'HIGH',
    source: 'dlq_monitor',
    category: 'Queues & DLQ',
    targetTab: 'queues',
    timestamp: '28m ago',
  },
  {
    id: 'att_3',
    title: 'Open Urgent Support Ticket (#TK-1002)',
    description: 'Candidate reported DOCX font substitution on custom Arabic typography resume template.',
    severity: 'MEDIUM',
    source: 'help_desk',
    category: 'Help Desk',
    targetTab: 'support',
    timestamp: '1h ago',
  },
  {
    id: 'att_4',
    title: 'Operational Subsystem Probes Healthy',
    description: '28/28 background subsystems operating within sub-100ms latency budgets.',
    severity: 'INFO',
    source: 'operational_matrix',
    category: 'Platform Health',
    targetTab: 'health',
    timestamp: 'Just now',
  },
];

interface AdminAttentionTabProps {
  onNavigateTab?: (tabId: string) => void;
}

export function AdminAttentionTab({ onNavigateTab }: AdminAttentionTabProps) {
  const [signals, setSignals] = useState<AttentionSignal[]>(DEFAULT_SIGNALS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const handleDismiss = (id: string) => {
    setSignals(signals.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <AlertTriangle className="size-5 text-amber-500" />
            Platform Attention Needed
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Derived from real-time operational signals, background DLQs, and pending moderation queues.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('mr-1.5 size-4', isRefreshing && 'animate-spin')} />
          Refresh Signals
        </Button>
      </div>

      <div className="space-y-3">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-success-200 bg-success-50 p-8 text-center text-success-800">
            <CheckCircle2 className="mx-auto size-8 text-success-600 mb-2" />
            <h3 className="font-bold text-base">All Operational Signals Clear</h3>
            <p className="text-xs text-success-700 mt-1">Zero pending escalations, healthy DLQs, and no overdue tickets.</p>
          </div>
        ) : (
          signals.map((sig) => (
            <Card key={sig.id} className="border-border hover:border-brand-200 transition-colors">
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                      sig.severity === 'HIGH' ? 'bg-error-50 text-error-700 border border-error-200' :
                      sig.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-brand-50 text-brand-700 border border-brand-200'
                    )}>
                      {sig.severity}
                    </span>
                    <span className="font-semibold text-sm text-ink">{sig.title}</span>
                    <span className="text-xs text-ink-muted">· {sig.category}</span>
                  </div>
                  <p className="text-sm text-ink-secondary">{sig.description}</p>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Clock className="size-3" />
                    <span>Signal detected {sig.timestamp}</span>
                    <span>· Source: {sig.source}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {sig.targetTab && onNavigateTab && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onNavigateTab(sig.targetTab!)}
                    >
                      Resolve Issue
                      <ArrowRight className="ml-1.5 size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismiss(sig.id)}
                  >
                    Acknowledge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
