import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Printer,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  type BillingInvoice,
  type InvoiceFilterStatus,
  fetchInvoicePrintableHtml,
  fetchUserInvoices,
  formatInvoiceCurrency,
  formatInvoiceDate,
  formatInvoiceTaxBreakdown,
  printAuthenticatedInvoiceHtml,
} from '@/lib/billing-invoices';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { InvoiceDetailDialog } from '@/components/billing/invoice-detail-dialog';

const PAGE_LIMIT = 20;

const STATUS_FILTERS: ReadonlyArray<{ id: InvoiceFilterStatus; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'ISSUED', label: 'Issued' },
  { id: 'PAID', label: 'Paid' },
  { id: 'REFUNDED', label: 'Refunded' },
];

export interface BillingInvoicesPanelProps {
  active: boolean;
}

export function BillingInvoicesPanel({ active }: BillingInvoicesPanelProps) {
  const [activated, setActivated] = useState(active);
  const [statusFilter, setStatusFilter] = useState<InvoiceFilterStatus>('ALL');
  const [offset, setOffset] = useState(0);

  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (active && !activated) {
      setActivated(true);
    }
  }, [active, activated]);

  const loadInvoices = useCallback(
    async (targetStatus: InvoiceFilterStatus, targetOffset: number) => {
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const seq = ++requestSeqRef.current;

      setLoading(true);
      setError(null);

      try {
        const result = await fetchUserInvoices(
          {
            limit: PAGE_LIMIT,
            offset: targetOffset,
            status: targetStatus,
          },
          controller.signal,
        );
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setInvoices(result.invoices);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setHasLoadedOnce(true);
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setError(normalizeError(err).message);
      } finally {
        if (!controller.signal.aborted && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!activated) return;
    void loadInvoices(statusFilter, offset);
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [activated, statusFilter, offset, loadInvoices]);

  const handleFilterChange = (nextStatus: InvoiceFilterStatus) => {
    if (nextStatus === statusFilter && offset === 0) return;
    setPrintError(null);
    setOffset(0);
    setStatusFilter(nextStatus);
  };

  const handlePrintInvoice = async (invoice: BillingInvoice) => {
    if (printingId) return;
    setPrintingId(invoice.id);
    setPrintError(null);
    try {
      const html = await fetchInvoicePrintableHtml(invoice.id);
      await printAuthenticatedInvoiceHtml(html);
    } catch (err) {
      setPrintError(normalizeError(err).message);
    } finally {
      setPrintingId(null);
    }
  };

  const rangeStart = invoices.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + invoices.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Receipt className="size-4 text-brand-600 shrink-0" aria-hidden="true" />
            <span>Invoices &amp; Tax Receipts</span>
          </h3>
          <p className="mt-1 text-sm text-ink-secondary">
            View subscription invoices, GST tax breakdowns, and print official receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/pricing">Manage Plan</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadInvoices(statusFilter, offset)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Filter invoices by status"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1"
        >
          {STATUS_FILTERS.map((filter) => {
            const isSelected = statusFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleFilterChange(filter.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isSelected
                    ? 'bg-brand-600 text-white shadow-2xs'
                    : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800',
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {hasLoadedOnce && total > 0 && (
          <p className="text-xs text-ink-muted" aria-live="polite">
            Showing {rangeStart}–{rangeEnd} of {total} {total === 1 ? 'invoice' : 'invoices'}
            {loading ? ' (updating…)' : ''}
          </p>
        )}
      </div>

      {printError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Unable to print tax receipt</p>
              <p className="mt-0.5 text-xs">{printError}</p>
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPrintError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Recoverable refresh failure while preserving loaded list */}
      {error && hasLoadedOnce && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 sm:flex-row sm:items-center sm:justify-between dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Could not refresh invoices</p>
              <p className="mt-0.5 text-xs">{error}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadInvoices(statusFilter, offset)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {/* Initial loading state */}
      {loading && !hasLoadedOnce ? (
        <div
          role="status"
          aria-label="Loading billing invoices"
          className="space-y-3 rounded-2xl border border-border bg-surface p-5"
        >
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : error && !hasLoadedOnce ? (
        /* Initial error state */
        <div
          role="alert"
          className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold">Billing history could not be loaded</h4>
                <p className="mt-1">{error}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadInvoices(statusFilter, offset)}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      ) : invoices.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <FileText className="mx-auto size-9 text-ink-muted" aria-hidden="true" />
          <h4 className="mt-3 text-base font-semibold text-ink">
            {statusFilter === 'ALL'
              ? 'No invoices on your account yet'
              : `No ${statusFilter.toLowerCase()} invoices found`}
          </h4>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
            {statusFilter === 'ALL'
              ? 'When you subscribe to a paid plan, your itemized GST invoices and printable receipts will appear here.'
              : 'Try switching back to All invoices to review your complete billing history.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {statusFilter !== 'ALL' ? (
              <Button type="button" size="sm" variant="outline" onClick={() => handleFilterChange('ALL')}>
                Show All Invoices
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to="/pricing">Explore Subscription Plans</Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Loaded invoice list — Desktop table + Mobile stacked cards */
        <div className={cn('space-y-4', loading && 'opacity-75 transition-opacity')}>
          {/* Desktop / Tablet semantic table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left text-xs" aria-label="Billing invoices">
              <thead className="border-b border-border bg-neutral-50/80 text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:bg-neutral-900/50">
                <tr>
                  <th scope="col" className="px-4 py-3">Invoice #</th>
                  <th scope="col" className="px-4 py-3">Issued Date</th>
                  <th scope="col" className="px-4 py-3">GST / Tax Breakdown</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => {
                  const tax = formatInvoiceTaxBreakdown(invoice);
                  const isPrinting = printingId === invoice.id;
                  return (
                    <tr
                      key={invoice.id}
                      className="transition-colors hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-3.5 font-mono font-semibold text-ink break-all max-w-[200px]">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-ink-secondary">
                        {formatInvoiceDate(invoice.issuedAt)}
                      </td>
                      <td className="px-4 py-3.5 text-ink-secondary">
                        {tax.hasGstSplit ? (
                          <div className="space-y-0.5 text-[11px]">
                            {tax.cgstLabel && <p>{tax.cgstLabel}</p>}
                            {tax.sgstLabel && <p>{tax.sgstLabel}</p>}
                            {tax.igstLabel && <p>{tax.igstLabel}</p>}
                          </div>
                        ) : (
                          <span>{tax.totalTaxLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-bold text-ink">
                        {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedInvoice(invoice)}
                            aria-label={`View details for invoice ${invoice.invoiceNumber}`}
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                            Details
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(printingId)}
                            aria-busy={isPrinting}
                            onClick={() => void handlePrintInvoice(invoice)}
                            aria-label={`Print receipt for invoice ${invoice.invoiceNumber}`}
                          >
                            <Printer className="size-3.5" aria-hidden="true" />
                            {isPrinting ? 'Printing…' : 'Print'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile responsive stacked cards (375px+) */}
          <ul className="space-y-3 md:hidden" aria-label="Billing invoices">
            {invoices.map((invoice) => {
              const tax = formatInvoiceTaxBreakdown(invoice);
              const isPrinting = printingId === invoice.id;
              return (
                <li
                  key={invoice.id}
                  className="rounded-2xl border border-border bg-surface p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-ink break-all">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Issued {formatInvoiceDate(invoice.issuedAt)}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={invoice.status} className="shrink-0" />
                  </div>

                  <dl className="grid grid-cols-2 gap-2 border-t border-border pt-2.5 text-xs">
                    <div>
                      <dt className="text-ink-muted">Total ({invoice.currency})</dt>
                      <dd className="mt-0.5 font-bold text-ink">
                        {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">GST / Tax</dt>
                      <dd className="mt-0.5 text-ink-secondary">
                        {tax.hasGstSplit
                          ? [tax.cgstLabel, tax.sgstLabel, tax.igstLabel].filter(Boolean).join(' · ')
                          : tax.totalTaxLabel}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedInvoice(invoice)}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={Boolean(printingId)}
                      aria-busy={isPrinting}
                      onClick={() => void handlePrintInvoice(invoice)}
                    >
                      <Printer className="size-3.5" aria-hidden="true" />
                      {isPrinting ? 'Printing…' : 'Print Receipt'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination controls */}
          {(offset > 0 || hasMore) && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_LIMIT))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="text-ink-muted">
                Page {Math.floor(offset / PAGE_LIMIT) + 1}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasMore || loading}
                onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}

      <InvoiceDetailDialog
        invoiceId={selectedInvoice?.id ?? null}
        initialInvoice={selectedInvoice}
        open={Boolean(selectedInvoice)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoice(null);
        }}
      />
    </div>
  );
}
