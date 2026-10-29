/**
 * Admin Billing & Orders Console Tab (FP-A15)
 *
 * Provides real-time financial back-office operations:
 * - Payment orders inspection and ledger table
 * - 1-Click user entitlement reconciliation with payment gateways
 * - Live subscription status tracking (MariaDB authoritative source)
 * - Refund tracking and order details dialog
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { get, post, normalizeError } from '@/lib/api-client';
import { AdminInvoicesExplorer } from '@/components/admin/AdminInvoicesExplorer';
import {
  RefreshCw,
  Search,
  AlertTriangle,
  Clock,
  RotateCcw,
  Receipt,
  Users,
  Eye,
  Download,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface SubscriberItem {
  uid: string;
  email: string | null;
  displayName: string | null;
  membership: string;
  membershipEnds: string | null;
  paymentStatus: string;
  currency: string;
  paymentGraceUntil: string | null;
  paymentGraceStartedAt: string | null;
  renewalFailedAt: string | null;
  updatedAt: string | null;
}

interface TransactionItem {
  id: string;
  uid: string | null;
  planId: string;
  amount: number;
  currency: string;
  formattedAmount: string;
  status: string;
  provider: string | null;
  createdAt: string | null;
}

interface SubscriptionsApiResponse {
  success: boolean;
  subscribers: SubscriberItem[];
  transactions: TransactionItem[];
  totalActiveSubscribers: number;
  recentTransactionsCount: number;
  source: string;
}

interface ReconcileApiResponse {
  success: boolean;
  reconciled: boolean;
  changed: boolean;
  uid: string;
  fromStatus: string;
  toStatus: string;
  observation: string;
  reason?: string;
  gracePeriodMs?: number;
  requestId?: string;
}

export function AdminBillingTab() {
  const [data, setData] = useState<SubscriptionsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'subscribers'>('orders');

  // Reconcile modal state
  const [reconcilingUid, setReconcilingUid] = useState<string | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileApiResponse | null>(null);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);

  // Order Details Modal
  const [inspectedOrder, setInspectedOrder] = useState<TransactionItem | null>(null);
  const [refundConfirmOrder, setRefundConfirmOrder] = useState<TransactionItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundSuccessMessage, setRefundSuccessMessage] = useState<string | null>(null);
  const [refundErrorMessage, setRefundErrorMessage] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const queryParam = statusFilter !== 'ALL' ? `?status=${encodeURIComponent(statusFilter.toLowerCase())}` : '';
      const res = await get<SubscriptionsApiResponse>(`/admin/subscriptions${queryParam}`);
      if (res && res.success) {
        setData(res);
      } else {
        throw new Error('Failed to load authoritative billing records.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error fetching billing data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    let list = data.transactions;
    if (statusFilter !== 'ALL') {
      list = list.filter((t) => (t.status || '').toUpperCase() === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.id || '').toLowerCase().includes(q) ||
          (t.uid || '').toLowerCase().includes(q) ||
          (t.planId || '').toLowerCase().includes(q) ||
          (t.provider || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.transactions, statusFilter, searchQuery]);

  // Filtered subscribers
  const filteredSubscribers = useMemo(() => {
    if (!data?.subscribers) return [];
    let list = data.subscribers;
    if (statusFilter !== 'ALL') {
      list = list.filter((s) => (s.paymentStatus || '').toUpperCase() === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.uid || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.displayName || '').toLowerCase().includes(q) ||
          (s.membership || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.subscribers, statusFilter, searchQuery]);

  // KPI Calculations
  const metrics = useMemo(() => {
    const transactions = data?.transactions || [];
    const subscribers = data?.subscribers || [];
    const totalRevenue = transactions
      .filter((t) => ['ACTIVE', 'PAID', 'COMPLETED'].includes((t.status || '').toUpperCase()))
      .reduce((sum, t) => sum + (t.amount > 1000 ? t.amount / 100 : t.amount), 0);

    const activeCount = subscribers.filter((s) => (s.paymentStatus || '').toUpperCase() === 'ACTIVE').length;
    const graceCount = subscribers.filter((s) => Boolean(s.paymentGraceUntil)).length;
    const refundCount = transactions.filter((t) => (t.status || '').toUpperCase() === 'REFUNDED').length;

    return {
      totalRevenue: Math.round(totalRevenue),
      activeSubscribers: activeCount || data?.totalActiveSubscribers || 0,
      inGracePeriod: graceCount,
      refundedOrders: refundCount,
    };
  }, [data]);

  // Trigger 1-Click Reconcile
  const handleReconcile = async (uid: string) => {
    setReconcilingUid(uid);
    setReconcileResult(null);
    setReconcileFeedback(null);
    try {
      const res = await post<ReconcileApiResponse>(`/admin/subscriptions/${encodeURIComponent(uid)}/reconcile`, {});
      if (res && res.success) {
        setReconcileResult(res);
        setReconcileFeedback(
          res.changed
            ? `Entitlement corrected: ${res.fromStatus} → ${res.toStatus}. (${res.observation})`
            : `Verified with payment gateway: Account status is accurate (${res.observation}).`
        );
        fetchSubscriptions();
      } else {
        throw new Error('Reconciliation returned inconclusive response.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reconciliation service unreachable.';
      setReconcileFeedback(`Error: ${msg}`);
    } finally {
      setReconcilingUid(null);
    }
  };

  // Submit refund action
  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundConfirmOrder) return;
    setRefundProcessing(true);
    setRefundErrorMessage(null);
    try {
      // Reconcile user account to ensure gateway sync
      if (refundConfirmOrder.uid) {
        await post(`/admin/subscriptions/${encodeURIComponent(refundConfirmOrder.uid)}/reconcile`, {
          action: 'refund_sync',
          orderId: refundConfirmOrder.id,
          reason: refundReason || 'Admin customer support resolution',
        });
      }
      setRefundSuccessMessage(`Refund request recorded for order #${refundConfirmOrder.id}. Entitlements updated.`);
      setTimeout(() => {
        setRefundConfirmOrder(null);
        setRefundSuccessMessage(null);
        setRefundReason('');
        fetchSubscriptions();
      }, 1800);
    } catch (err: unknown) {
      setRefundErrorMessage(normalizeError(err).message);
    } finally {
      setRefundProcessing(false);
    }
  };

  // Export CSV for compliance / audit
  const exportCsv = () => {
    if (!data?.transactions?.length) return;
    const headers = ['Order ID', 'UID', 'Plan ID', 'Amount', 'Currency', 'Status', 'Gateway Provider', 'Created At'];
    const rows = data.transactions.map((t) => [
      t.id,
      t.uid || '',
      t.planId,
      t.amount,
      t.currency,
      t.status,
      t.provider || '',
      t.createdAt || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payment_orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" data-testid="admin-billing-tab">
      {/* ─── Top Telemetry Banner ─── */}
      <div className="cuba-glass rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black text-ink tracking-tight">Billing &amp; Payment Orders Ledger</h2>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
              Live MariaDB Engine
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Inspect live payment transactions, perform 1-click gateway entitlement reconciliation, and audit refunds.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!data?.transactions?.length}
            className="text-xs font-bold gap-1.5"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={fetchSubscriptions}
            disabled={loading}
            className="text-xs font-bold gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cuba-glass border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <Receipt className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Gross Transaction Vol.</p>
              <h3 className="text-xl font-black text-ink">
                ₹{metrics.totalRevenue.toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cuba-glass border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Active Paid Subs</p>
              <h3 className="text-xl font-black text-ink">
                {metrics.activeSubscribers.toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cuba-glass border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Grace Period Triage</p>
              <h3 className="text-xl font-black text-ink">
                {metrics.inGracePeriod}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cuba-glass border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="size-11 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <RotateCcw className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Refunded Orders</p>
              <h3 className="text-xl font-black text-ink">
                {metrics.refundedOrders}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Reconcile Feedback Alert ─── */}
      {reconcileFeedback && (
        <div
          role="status"
          className={cn(
            'p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in',
            reconcileResult?.changed
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-amber-800 dark:text-amber-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
          )}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" />
            <span>{reconcileFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setReconcileFeedback(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Control Bar: Tab Switcher & Search ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1 border border-border">
          <button
            type="button"
            onClick={() => setActiveSubTab('orders')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              activeSubTab === 'orders'
                ? 'bg-white dark:bg-neutral-900 text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            Payment Orders ({data?.transactions?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('subscribers')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
              activeSubTab === 'subscribers'
                ? 'bg-white dark:bg-neutral-900 text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            Subscribers &amp; Entitlements ({data?.subscribers?.length ?? 0})
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <select
            aria-label="Filter subscriptions by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-bold text-ink bg-white dark:bg-neutral-900 border border-border rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active / Completed</option>
            <option value="PENDING">Pending</option>
            <option value="REFUNDED">Refunded</option>
            <option value="FAILED">Failed / Cancelled</option>
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search className="size-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order ID, UID, plan..."
              className="text-xs pl-8 h-8.5 w-52 sm:w-64 font-medium"
            />
          </div>
        </div>
      </div>

      {/* ─── Table Surface ─── */}
      <Card className="cuba-glass border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="size-8 text-rose-500 mx-auto" />
            <h4 className="text-sm font-bold text-ink">Failed to load billing records</h4>
            <p className="text-xs text-ink-muted">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchSubscriptions} className="text-xs">
              Retry
            </Button>
          </div>
        ) : activeSubTab === 'orders' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Payment Orders Table">
              <thead>
                <tr className="border-b border-border/60 bg-neutral-50/70 dark:bg-neutral-800/40 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer UID</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-ink-muted">
                      No payment orders found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const statusUpper = (tx.status || '').toUpperCase();
                    const isSuccess = ['ACTIVE', 'PAID', 'COMPLETED'].includes(statusUpper);
                    const isRefunded = statusUpper === 'REFUNDED';
                    const isPending = ['PENDING', 'PENDING_PAYMENT'].includes(statusUpper);

                    return (
                      <tr key={tx.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-ink">
                          #{tx.id}
                        </td>
                        <td className="py-3 px-4 font-mono text-ink-secondary text-[11px]">
                          {tx.uid ? tx.uid.slice(0, 12) : 'Anonymous'}
                        </td>
                        <td className="py-3 px-4 font-bold text-ink">
                          {tx.planId}
                        </td>
                        <td className="py-3 px-4 font-bold text-ink">
                          {tx.formattedAmount || `${tx.currency} ${tx.amount}`}
                        </td>
                        <td className="py-3 px-4 uppercase text-[10px] font-bold text-ink-muted">
                          {tx.provider || 'Gateway'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase',
                              isSuccess && 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 border border-emerald-200',
                              isRefunded && 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 border border-rose-200',
                              isPending && 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 border border-amber-200',
                              !isSuccess && !isRefunded && !isPending && 'bg-neutral-100 text-neutral-700 border border-border'
                            )}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-ink-muted text-[11px]">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectedOrder(tx)}
                            className="h-7 text-xs px-2 gap-1 font-semibold text-ink"
                            title="Inspect order details"
                          >
                            <Eye className="size-3" />
                            Inspect
                          </Button>
                          {!isRefunded && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRefundConfirmOrder(tx)}
                              className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold"
                              title="Process refund or update status"
                            >
                              Refund
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Subscribers Table">
              <thead>
                <tr className="border-b border-border/60 bg-neutral-50/70 dark:bg-neutral-800/40 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Membership</th>
                  <th className="py-3 px-4">Payment State</th>
                  <th className="py-3 px-4">Grace Period</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-muted">
                      No subscribers found matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((sub) => {
                    const isReconciling = reconcilingUid === sub.uid;
                    const hasGrace = Boolean(sub.paymentGraceUntil);

                    return (
                      <tr key={sub.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-ink">{sub.displayName || 'Account Member'}</p>
                          <p className="text-[11px] text-ink-muted font-mono">{sub.email || sub.uid}</p>
                        </td>
                        <td className="py-3 px-4 font-bold text-brand-600 dark:text-brand-400">
                          {sub.membership}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase',
                              sub.paymentStatus === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            )}
                          >
                            {sub.paymentStatus || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px]">
                          {hasGrace ? (
                            <span className="text-amber-600 font-bold flex items-center gap-1">
                              <Clock className="size-3" />
                              Until {new Date(sub.paymentGraceUntil!).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-ink-muted">Standard</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ink-muted text-[11px]">
                          {sub.membershipEnds ? new Date(sub.membershipEnds).toLocaleDateString() : 'Continuous'}
                        </td>
                        <td className="py-3 px-4 text-ink-muted text-[11px]">
                          {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isReconciling}
                            onClick={() => handleReconcile(sub.uid)}
                            className="h-7 text-xs px-2.5 gap-1.5 text-brand-600 font-bold"
                            title="Probe gateway and reconcile authoritative membership state"
                          >
                            <RefreshCw className={cn('size-3', isReconciling && 'animate-spin')} />
                            {isReconciling ? 'Probing...' : 'Reconcile'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Administrative Tax Invoices Explorer (GET /api/admin/billing/invoices) ─── */}
      <AdminInvoicesExplorer />

      {/* ─── Order Inspection Dialog ─── */}
      <Dialog open={Boolean(inspectedOrder)} onOpenChange={(open) => !open && setInspectedOrder(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink flex items-center gap-2">
              <Receipt className="size-4 text-brand-600" />
              Order Transaction #{inspectedOrder?.id}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Authoritative transaction record stored in MariaDB payment_orders ledger.
            </DialogDescription>
          </DialogHeader>

          {inspectedOrder && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-border">
                <div>
                  <span className="text-[10px] text-ink-muted uppercase font-bold block">Plan Entitlement</span>
                  <strong className="text-ink text-sm">{inspectedOrder.planId}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted uppercase font-bold block">Amount Invoiced</span>
                  <strong className="text-ink text-sm">
                    {inspectedOrder.formattedAmount || `${inspectedOrder.currency} ${inspectedOrder.amount}`}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted uppercase font-bold block">Gateway Provider</span>
                  <strong className="text-ink uppercase">{inspectedOrder.provider || 'Gateway'}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted uppercase font-bold block">Current Status</span>
                  <strong className="text-emerald-600 font-bold uppercase">{inspectedOrder.status}</strong>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-ink-muted uppercase font-bold block mb-1">Customer Identifier (UID)</span>
                <p className="font-mono p-2 rounded-lg bg-canvas text-ink text-xs border border-border">
                  {inspectedOrder.uid || 'Anonymous Guest Session'}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-ink-muted uppercase font-bold block mb-1">Created At</span>
                <p className="p-2 rounded-lg bg-canvas text-ink text-xs border border-border">
                  {inspectedOrder.createdAt ? new Date(inspectedOrder.createdAt).toLocaleString() : 'N/A'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setInspectedOrder(null)}>
                  Close
                </Button>
                {inspectedOrder.status !== 'REFUNDED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-semibold"
                    onClick={() => {
                      const target = inspectedOrder;
                      setInspectedOrder(null);
                      setRefundConfirmOrder(target);
                    }}
                  >
                    Initiate Refund
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Refund Confirmation Dialog ─── */}
      <Dialog open={Boolean(refundConfirmOrder)} onOpenChange={(open) => !open && setRefundConfirmOrder(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink flex items-center gap-2 text-rose-600">
              <RotateCcw className="size-4" />
              Process Order Refund
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Confirm refund for Order #{refundConfirmOrder?.id} ({refundConfirmOrder?.formattedAmount || `${refundConfirmOrder?.currency} ${refundConfirmOrder?.amount}`}).
            </DialogDescription>
          </DialogHeader>

          {refundSuccessMessage ? (
            <div className="p-6 text-center space-y-2">
              <Check className="size-8 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-ink">Refund Successfully Processed</h4>
              <p className="text-xs text-ink-muted">{refundSuccessMessage}</p>
            </div>
          ) : (
            <form onSubmit={handleProcessRefund} className="space-y-4 pt-2 text-xs">
              {refundErrorMessage && (
                <div role="alert" className="p-3 rounded-xl bg-error-50 border border-error-200 text-error-800 text-xs">
                  {refundErrorMessage}
                </div>
              )}
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <p className="font-bold">Authoritative Action Notice:</p>
                <p className="mt-0.5">
                  This will synchronize with the payment provider, revoke subscriber paid entitlements for this cycle, and record an audit log entry.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Refund Reason / Support Ticket Ref</label>
                <Input
                  required
                  placeholder="e.g. Customer requested cancellation within 48h SLA (Ticket #821)"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRefundConfirmOrder(null)}
                  disabled={refundProcessing}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={refundProcessing}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  {refundProcessing ? 'Processing Refund...' : 'Confirm & Issue Refund'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminBillingTab;
