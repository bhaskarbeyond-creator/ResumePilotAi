import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { AlertCircle, Printer, Receipt, RefreshCw } from 'lucide-react';
import { normalizeError } from '@/lib/api-client';
import {
  type BillingInvoice,
  fetchInvoicePrintableHtml,
  fetchUserInvoiceDetail,
  formatInvoiceCurrency,
  formatInvoiceDate,
  formatInvoiceTaxBreakdown,
  printAuthenticatedInvoiceHtml,
} from '@/lib/billing-invoices';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';

export interface InvoiceDetailDialogProps {
  invoiceId: string | null;
  initialInvoice?: BillingInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchDetail?: boolean;
}

export function InvoiceDetailDialog({
  invoiceId,
  initialInvoice = null,
  open,
  onOpenChange,
  fetchDetail = true,
}: InvoiceDetailDialogProps) {
  const [invoice, setInvoice] = useState<BillingInvoice | null>(initialInvoice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (signal?: AbortSignal) => {
      if (!invoiceId || !fetchDetail) return;
      setLoading(true);
      setError(null);
      try {
        const detail = await fetchUserInvoiceDetail(invoiceId, signal);
        if (!signal?.aborted) {
          setInvoice(detail);
        }
      } catch (err) {
        if (signal?.aborted) return;
        setError(normalizeError(err).message);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [invoiceId, fetchDetail],
  );

  useEffect(() => {
    if (!open || !invoiceId) {
      setError(null);
      setPrintError(null);
      return;
    }
    setInvoice(initialInvoice);
    setPrintError(null);
    if (!fetchDetail) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [open, invoiceId, initialInvoice, fetchDetail, loadDetail]);

  const handlePrint = async () => {
    const targetId = invoice?.id || invoiceId;
    if (!targetId || printing) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const html = await fetchInvoicePrintableHtml(targetId);
      await printAuthenticatedInvoiceHtml(html);
    } catch (err) {
      setPrintError(normalizeError(err).message);
    } finally {
      setPrinting(false);
    }
  };

  const tax = invoice ? formatInvoiceTaxBreakdown(invoice) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink">
            <Receipt className="size-5 text-brand-600 shrink-0" aria-hidden="true" />
            <span className="break-all">
              {invoice ? `Tax Invoice ${invoice.invoiceNumber}` : 'Invoice Details'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            {invoice?.invoiceTitle || 'Itemized subscription receipt and tax breakdown.'}
          </DialogDescription>
        </DialogHeader>

        {loading && !invoice ? (
          <div className="space-y-3 py-4" role="status" aria-label="Loading invoice details">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : error && !invoice ? (
          <div
            role="alert"
            className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p className="font-semibold">Unable to load invoice details</p>
                <p>{error}</p>
                <Button size="sm" variant="outline" onClick={() => void loadDetail()}>
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        ) : invoice ? (
          <div className="space-y-4 text-sm">
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                Showing cached summary. Full detail refresh failed: {error}
              </div>
            )}

            {printError && (
              <div
                role="alert"
                className="rounded-xl border border-error-200 bg-error-50 p-3 text-xs text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200 flex items-start gap-2"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{printError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-neutral-50/70 p-4 sm:grid-cols-3 dark:bg-neutral-900/50">
              <div>
                <p className="text-xs font-medium text-ink-muted">Issuance Date</p>
                <p className="mt-0.5 font-semibold text-ink">{formatInvoiceDate(invoice.issuedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted">Status</p>
                <div className="mt-1">
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted">Total ({invoice.currency})</p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                </p>
              </div>
              {invoice.paymentMethod && (
                <div>
                  <p className="text-xs font-medium text-ink-muted">Payment Method</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink">{invoice.paymentMethod}</p>
                </div>
              )}
              {invoice.paymentReference && (
                <div>
                  <p className="text-xs font-medium text-ink-muted">Payment Reference</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-ink break-all">
                    {invoice.paymentReference}
                  </p>
                </div>
              )}
            </div>

            {(invoice.supplierSnapshot || invoice.customerSnapshot || invoice.customerEmail) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {invoice.supplierSnapshot && (
                  <div className="rounded-xl border border-border p-3.5 text-xs">
                    <p className="font-semibold uppercase tracking-wider text-ink-muted">Issued By</p>
                    <p className="mt-1 font-semibold text-ink">
                      {invoice.supplierSnapshot.legalName ||
                        invoice.supplierSnapshot.tradeName ||
                        invoice.supplierSnapshot.name ||
                        'IME365'}
                    </p>
                    {invoice.supplierSnapshot.gstin && (
                      <p className="mt-0.5 font-mono text-ink-muted">GSTIN: {invoice.supplierSnapshot.gstin}</p>
                    )}
                    {invoice.supplierSnapshot.state && (
                      <p className="mt-0.5 text-ink-muted">
                        {[invoice.supplierSnapshot.city, invoice.supplierSnapshot.state, invoice.supplierSnapshot.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-border p-3.5 text-xs">
                  <p className="font-semibold uppercase tracking-wider text-ink-muted">Billed To</p>
                  <p className="mt-1 font-semibold text-ink break-words">
                    {invoice.customerName ||
                      invoice.customerSnapshot?.name ||
                      invoice.customerSnapshot?.company ||
                      invoice.customerEmail ||
                      'Account Holder'}
                  </p>
                  {(invoice.customerEmail || invoice.customerSnapshot?.email) && (
                    <p className="mt-0.5 text-ink-muted break-all">
                      {invoice.customerEmail || invoice.customerSnapshot?.email}
                    </p>
                  )}
                  {invoice.customerSnapshot?.gstin && (
                    <p className="mt-0.5 font-mono text-ink-muted">GSTIN: {invoice.customerSnapshot.gstin}</p>
                  )}
                  {invoice.placeOfSupply && (
                    <p className="mt-0.5 text-ink-muted">Place of supply: {invoice.placeOfSupply}</p>
                  )}
                </div>
              </div>
            )}

            {invoice.lineItems.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs" aria-label="Invoice line items">
                  <thead className="border-b border-border bg-neutral-50 text-ink-muted dark:bg-neutral-900/60">
                    <tr>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold">Description</th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold text-right">Qty</th>
                      <th scope="col" className="px-3.5 py-2.5 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.lineItems.map((item, idx) => (
                      <tr key={`${item.description}-${idx}`}>
                        <td className="px-3.5 py-2.5 text-ink">
                          <span className="font-medium">{item.description}</span>
                          {item.sacCode && (
                            <span className="ml-2 font-mono text-[11px] text-ink-muted">SAC {item.sacCode}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-ink-muted">{item.quantity}</td>
                        <td className="px-3.5 py-2.5 text-right font-medium text-ink">
                          {formatInvoiceCurrency(item.total, invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <dl className="space-y-2 rounded-xl border border-border p-4 text-xs">
              {invoice.taxableAmount !== null && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Taxable Subtotal</dt>
                  <dd className="font-medium text-ink">
                    {formatInvoiceCurrency(invoice.taxableAmount, invoice.currency)}
                  </dd>
                </div>
              )}
              {tax?.cgstLabel && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Central GST (CGST{invoice.cgstRate ? ` @ ${invoice.cgstRate}%` : ''})</dt>
                  <dd className="font-medium text-ink">
                    {formatInvoiceCurrency(invoice.cgstAmount ?? 0, invoice.currency)}
                  </dd>
                </div>
              )}
              {tax?.sgstLabel && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">State GST (SGST{invoice.sgstRate ? ` @ ${invoice.sgstRate}%` : ''})</dt>
                  <dd className="font-medium text-ink">
                    {formatInvoiceCurrency(invoice.sgstAmount ?? 0, invoice.currency)}
                  </dd>
                </div>
              )}
              {tax?.igstLabel && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Integrated GST (IGST{invoice.igstRate ? ` @ ${invoice.igstRate}%` : ''})</dt>
                  <dd className="font-medium text-ink">
                    {formatInvoiceCurrency(invoice.igstAmount ?? 0, invoice.currency)}
                  </dd>
                </div>
              )}
              {!tax?.hasGstSplit && invoice.totalTax !== null && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Total Tax</dt>
                  <dd className="font-medium text-ink">
                    {formatInvoiceCurrency(invoice.totalTax, invoice.currency)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 border-t border-border pt-2.5 text-sm">
                <dt className="font-bold text-ink">Grand Total ({invoice.currency})</dt>
                <dd className="font-bold text-ink">
                  {formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}
                </dd>
              </div>
            </dl>

            {invoice.creditNote && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-3.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="font-semibold">Credit Note Issued: {invoice.creditNote.creditNoteNumber}</p>
                <p className="mt-0.5">
                  Refunded amount: {formatInvoiceCurrency(invoice.creditNote.grandTotal, invoice.creditNote.currency)}
                  {invoice.creditNote.creditNoteDate ? ` on ${formatInvoiceDate(invoice.creditNote.creditNoteDate)}` : ''}
                </p>
                {invoice.creditNote.refundReason && (
                  <p className="mt-0.5 text-ink-muted">Reason: {invoice.creditNote.refundReason}</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {invoice && (
            <Button
              type="button"
              onClick={() => void handlePrint()}
              disabled={printing}
              aria-busy={printing}
            >
              <Printer className="size-4" aria-hidden="true" />
              {printing ? 'Preparing Print View…' : 'Print Tax Receipt'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
