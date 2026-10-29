import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  type AdminInvoiceSummary,
  type BillingInvoice,
  fetchAdminInvoices,
  fetchInvoicePrintableHtml,
  formatInvoiceCurrency,
  formatInvoiceDate,
  formatInvoiceTaxBreakdown,
  printAuthenticatedInvoiceHtml,
} from '@/lib/billing-invoices';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { InvoiceDetailDialog } from '@/components/billing/invoice-detail-dialog';

const ADMIN_INVOICE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function AdminInvoicesExplorer() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [offset, setOffset] = useState(0);

  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState<AdminInvoiceSummary | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  // Debounce search input and reset offset when search changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch((prev) => {
        const next = searchInput.trim();
        if (prev !== next) {
          setOffset(0);
        }
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const dateRangeInvalid = Boolean(startDate && endDate && endDate < startDate);

  const loadAdminInvoices = useCallback(
    async (query: string, fromDate: string, toDate: string, pageOffset: number) => {
      if (fromDate && toDate && toDate < fromDate) return;

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const seq = ++requestSeqRef.current;

      setLoading(true);
      setError(null);

      try {
        const result = await fetchAdminInvoices(
          {
            search: query || undefined,
            startDate: fromDate || undefined,
            endDate: toDate || undefined,
            limit: ADMIN_INVOICE_LIMIT,
            offset: pageOffset,
          },
          controller.signal,
        );
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setInvoices(result.invoices);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setSummary(result.summary);
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
    if (dateRangeInvalid) return;
    void loadAdminInvoices(debouncedSearch, startDate, endDate, offset);
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [debouncedSearch, startDate, endDate, offset, dateRangeInvalid, loadAdminInvoices]);

  const hasActiveFilters = Boolean(searchInput.trim() || startDate || endDate);

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStartDate('');
    setEndDate('');
    setOffset(0);
  };

  const handlePrint = async (invoice: BillingInvoice) => {
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

  // Group displayed page totals by currency when backend summary is not returned.
  const pageTotalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      map.set(inv.currency, (map.get(inv.currency) ?? 0) + inv.totalAmount);
    }
    return [...map.entries()];
  }, [invoices]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-ink">Administrative Tax Invoices Explorer</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Search issued invoices, filter by issuance date range, inspect GST breakdowns, and print authorized tax receipts.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || dateRangeInvalid}
          aria-busy={loading}
          onClick={() => void loadAdminInvoices(debouncedSearch, startDate, endDate, offset)}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
          Refresh Invoices
        </Button>
      </div>

      {/* Search & Date Range Filter Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="admin-invoice-search" className="mb-1 block text-xs font-semibold text-ink">
            Search Invoices
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              id="admin-invoice-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Invoice #, customer email, or customer ID…"
              className="pl-9 text-xs"
            />
          </div>
        </div>

        <div>
          <label htmlFor="admin-invoice-start-date" className="mb-1 block text-xs font-semibold text-ink">
            Start Date
          </label>
          <Input
            id="admin-invoice-start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setOffset(0);
            }}
            className="text-xs"
          />
        </div>

        <div>
          <label htmlFor="admin-invoice-end-date" className="mb-1 block text-xs font-semibold text-ink">
            End Date
          </label>
          <Input
            id="admin-invoice-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => {
              setEndDate(e.target.value);
              setOffset(0);
            }}
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-ink-muted">
          {hasLoadedOnce && (
            <span>
              Matching invoices: <strong className="text-ink">{total}</strong>
            </span>
          )}
          {summary?.totalAmount !== null && summary?.totalAmount !== undefined && (
            <span>
              Total billed:{' '}
              <strong className="text-ink">
                {formatInvoiceCurrency(summary.totalAmount, summary.currency)}
              </strong>
            </span>
          )}
          {!summary && pageTotalsByCurrency.length > 0 && (
            <span>
              Page total:{' '}
              <strong className="text-ink">
                {pageTotalsByCurrency
                  .map(([curr, amt]) => formatInvoiceCurrency(amt, curr))
                  .join(' + ')}
              </strong>
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <Button type="button" size="sm" variant="ghost" onClick={handleClearFilters}>
            <X className="size-3.5" aria-hidden="true" />
            Clear Filters
          </Button>
        )}
      </div>

      {dateRangeInvalid && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          End date must be on or after the start date.
        </div>
      )}

      {printError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-error-200 bg-error-50 p-3 text-xs text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{printError}</span>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPrintError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {error && hasLoadedOnce && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-3.5 text-xs text-error-800 sm:flex-row sm:items-center sm:justify-between dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Could not refresh administrative invoices: {error}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadAdminInvoices(debouncedSearch, startDate, endDate, offset)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {loading && !hasLoadedOnce ? (
        <div className="space-y-2.5" role="status" aria-label="Loading administrative invoices">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : error && !hasLoadedOnce ? (
        <div
          role="alert"
          className="rounded-xl border border-error-200 bg-error-50 p-5 text-xs text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-2.5">
              <p className="font-semibold text-sm">Failed to load administrative invoices</p>
              <p>{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadAdminInvoices(debouncedSearch, startDate, endDate, offset)}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto size-8 text-ink-muted" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink">
            {hasActiveFilters ? 'No invoices match the current filters' : 'No tax invoices recorded yet'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {hasActiveFilters
              ? 'Clear or broaden your search query and date range to view more billing records.'
              : 'Invoices appear automatically once customer payment orders are settled.'}
          </p>
          {hasActiveFilters && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={handleClearFilters}
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <div className={cn('space-y-3', loading && 'opacity-75 transition-opacity')}>
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full text-left text-xs" aria-label="Administrative invoices">
              <thead className="border-b border-border bg-neutral-50/70 text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:bg-neutral-800/40">
                <tr>
                  <th scope="col" className="px-4 py-3">Invoice #</th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Issued</th>
                  <th scope="col" className="px-4 py-3">GST / Tax</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {invoices.map((invoice) => {
                  const tax = formatInvoiceTaxBreakdown(invoice);
                  const isPrinting = printingId === invoice.id;
                  return (
                    <tr
                      key={invoice.id}
                      className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-ink break-all max-w-[180px]">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink break-words">
                          {invoice.customerName || invoice.customerEmail || 'Customer Account'}
                        </p>
                        {(invoice.customerEmail || invoice.customerId) && (
                          <p className="font-mono text-[11px] text-ink-muted break-all">
                            {invoice.customerEmail || invoice.customerId}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        {formatInvoiceDate(invoice.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
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
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-ink">
                        {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedInvoice(invoice)}
                            aria-label={`Inspect invoice ${invoice.invoiceNumber}`}
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
                            onClick={() => void handlePrint(invoice)}
                            aria-label={`Print invoice ${invoice.invoiceNumber}`}
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

          {/* Mobile responsive stacked cards */}
          <ul className="space-y-2.5 md:hidden" aria-label="Administrative invoices">
            {invoices.map((invoice) => {
              const isPrinting = printingId === invoice.id;
              return (
                <li
                  key={invoice.id}
                  className="rounded-xl border border-border bg-surface p-3.5 space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-ink break-all">{invoice.invoiceNumber}</p>
                      <p className="mt-0.5 text-ink-muted break-all">
                        {invoice.customerEmail || invoice.customerName || invoice.customerId || 'Customer'}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={invoice.status} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-ink-muted">{formatInvoiceDate(invoice.issuedAt)}</span>
                    <strong className="text-sm text-ink">
                      {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                    </strong>
                  </div>
                  <div className="flex gap-2">
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
                      onClick={() => void handlePrint(invoice)}
                    >
                      <Printer className="size-3.5" aria-hidden="true" />
                      {isPrinting ? 'Printing…' : 'Print'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {(offset > 0 || hasMore) && (
            <div className="flex items-center justify-between gap-3 pt-2 text-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((prev) => Math.max(0, prev - ADMIN_INVOICE_LIMIT))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="text-ink-muted">
                Page {Math.floor(offset / ADMIN_INVOICE_LIMIT) + 1}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasMore || loading}
                onClick={() => setOffset((prev) => prev + ADMIN_INVOICE_LIMIT)}
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
    </Card>
  );
}
