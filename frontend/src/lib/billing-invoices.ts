import DOMPurify from 'dompurify';
import { apiClient, normalizeError } from '@/lib/api-client';

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'REFUNDED';
export type InvoiceFilterStatus = 'ALL' | InvoiceStatus;

export interface InvoiceLineItem {
  description: string;
  sacCode: string | null;
  quantity: number;
  unitPrice: number;
  taxableValue: number | null;
  gstRate: number | null;
  total: number;
}

export interface InvoicePartySnapshot {
  legalName: string | null;
  tradeName: string | null;
  name: string | null;
  company: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  country: string | null;
}

export interface InvoiceCreditNoteSummary {
  creditNoteNumber: string;
  creditNoteDate: string | null;
  refundReference: string | null;
  refundReason: string | null;
  grandTotal: number;
  currency: string;
}

export interface BillingInvoice {
  id: string;
  invoiceNumber: string;
  paymentOrderId: string | null;
  issuedAt: string | null;
  currency: string;
  subtotal: number | null;
  taxableAmount: number | null;
  cgstAmount: number | null;
  sgstAmount: number | null;
  igstAmount: number | null;
  cgstRate: number | null;
  sgstRate: number | null;
  igstRate: number | null;
  totalTax: number | null;
  totalAmount: number;
  status: string;
  invoiceTitle: string | null;
  financialYear: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  placeOfSupply: string | null;
  reverseCharge: string | null;
  sacCode: string | null;
  amountInWords: string | null;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  supplierSnapshot: InvoicePartySnapshot | null;
  customerSnapshot: InvoicePartySnapshot | null;
  lineItems: InvoiceLineItem[];
  creditNote: InvoiceCreditNoteSummary | null;
}

export interface InvoiceListParams {
  limit?: number;
  offset?: number;
  status?: InvoiceFilterStatus;
}

export interface InvoiceListResult {
  invoices: BillingInvoice[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AdminInvoiceListParams {
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AdminInvoiceSummary {
  totalAmount: number | null;
  totalTax: number | null;
  currency: string | null;
}

export interface AdminInvoiceListResult extends InvoiceListResult {
  summary: AdminInvoiceSummary | null;
}

type RawRecord = Record<string, unknown>;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCleanString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeParty(raw: unknown): InvoicePartySnapshot | null {
  if (!isRecord(raw)) return null;
  return {
    legalName: asCleanString(raw.legalName ?? raw.legal_name),
    tradeName: asCleanString(raw.tradeName ?? raw.trade_name),
    name: asCleanString(raw.name ?? raw.displayName ?? raw.fullName),
    company: asCleanString(raw.company ?? raw.organizationName),
    email: asCleanString(raw.email),
    gstin: asCleanString(raw.gstin ?? raw.gstNumber),
    pan: asCleanString(raw.pan),
    address: asCleanString(raw.address),
    city: asCleanString(raw.city),
    state: asCleanString(raw.state),
    stateCode: asCleanString(raw.stateCode ?? raw.state_code),
    pincode: asCleanString(raw.pincode ?? raw.postalCode),
    country: asCleanString(raw.country),
  };
}

function normalizeLineItem(raw: unknown): InvoiceLineItem | null {
  if (!isRecord(raw)) return null;
  const description = asCleanString(raw.description ?? raw.title ?? raw.planName ?? raw.name) ?? 'Subscription Service';
  const quantity = asFiniteNumber(raw.quantity ?? raw.qty) ?? 1;
  const unitPrice = asFiniteNumber(raw.unitPrice ?? raw.unit_price ?? raw.amount ?? raw.taxableValue) ?? 0;
  const taxableValue = asFiniteNumber(raw.taxableValue ?? raw.taxable_value ?? raw.subtotal);
  const gstRate = asFiniteNumber(raw.gstRate ?? raw.gst_rate ?? raw.taxRate);
  const total = asFiniteNumber(raw.total ?? raw.totalAmount ?? raw.lineTotal) ?? taxableValue ?? unitPrice * quantity;
  return {
    description,
    sacCode: asCleanString(raw.sacCode ?? raw.sac_code ?? raw.hsnSac),
    quantity,
    unitPrice,
    taxableValue,
    gstRate,
    total,
  };
}

function normalizeCreditNote(raw: unknown, fallbackCurrency: string): InvoiceCreditNoteSummary | null {
  if (!isRecord(raw)) return null;
  const creditNoteNumber = asCleanString(raw.creditNoteNumber ?? raw.credit_note_number ?? raw.number);
  if (!creditNoteNumber) return null;
  return {
    creditNoteNumber,
    creditNoteDate: asCleanString(raw.creditNoteDate ?? raw.credit_note_date ?? raw.issuedAt ?? raw.createdAt),
    refundReference: asCleanString(raw.refundReference ?? raw.refund_reference),
    refundReason: asCleanString(raw.refundReason ?? raw.refund_reason ?? raw.reason),
    grandTotal: asFiniteNumber(raw.grandTotal ?? raw.totalAmount ?? raw.amount) ?? 0,
    currency: (asCleanString(raw.currency) ?? fallbackCurrency).toUpperCase(),
  };
}

export function normalizeInvoiceStatus(rawStatus: unknown, hasCreditNote = false): string {
  const cleaned = asCleanString(rawStatus)?.toUpperCase();
  if (cleaned === 'REFUNDED' || cleaned === 'CREDIT_NOTE_ISSUED') return 'REFUNDED';
  if (hasCreditNote && (!cleaned || cleaned === 'PAID')) return 'REFUNDED';
  if (cleaned === 'PAID' || cleaned === 'CAPTURED' || cleaned === 'COMPLETED' || cleaned === 'SETTLED') return 'PAID';
  if (cleaned === 'ISSUED' || cleaned === 'OPEN' || cleaned === 'PENDING' || cleaned === 'UNPAID') return 'ISSUED';
  return cleaned ?? 'ISSUED';
}

export function normalizeBillingInvoice(raw: unknown): BillingInvoice | null {
  if (!isRecord(raw)) return null;
  const nestedInvoice = isRecord(raw.invoice) ? raw.invoice : raw;
  const id =
    asCleanString(
      nestedInvoice.id ??
        nestedInvoice.invoiceId ??
        nestedInvoice.invoice_id ??
        nestedInvoice.paymentOrderId ??
        nestedInvoice.payment_order_id ??
        nestedInvoice.invoiceNumber ??
        nestedInvoice.invoice_number,
    ) ?? null;

  const invoiceNumber =
    asCleanString(
      nestedInvoice.invoiceNumber ??
        nestedInvoice.invoice_number ??
        nestedInvoice.receiptNumber ??
        nestedInvoice.number ??
        id,
    ) ?? null;

  if (!id || !invoiceNumber) return null;

  const currency = (asCleanString(nestedInvoice.currency) ?? 'INR').toUpperCase();
  const creditNote = normalizeCreditNote(nestedInvoice.creditNote ?? raw.creditNote, currency);
  const taxBreakdown = isRecord(nestedInvoice.taxBreakdown) ? nestedInvoice.taxBreakdown : null;

  const cgstAmount = asFiniteNumber(
    nestedInvoice.cgstAmount ?? nestedInvoice.cgst_amount ?? nestedInvoice.cgst ?? taxBreakdown?.cgstAmount ?? taxBreakdown?.cgst,
  );
  const sgstAmount = asFiniteNumber(
    nestedInvoice.sgstAmount ?? nestedInvoice.sgst_amount ?? nestedInvoice.sgst ?? taxBreakdown?.sgstAmount ?? taxBreakdown?.sgst,
  );
  const igstAmount = asFiniteNumber(
    nestedInvoice.igstAmount ?? nestedInvoice.igst_amount ?? nestedInvoice.igst ?? taxBreakdown?.igstAmount ?? taxBreakdown?.igst,
  );
  const totalTax = asFiniteNumber(
    nestedInvoice.totalTax ??
      nestedInvoice.total_tax ??
      nestedInvoice.taxAmount ??
      nestedInvoice.tax_amount ??
      taxBreakdown?.totalTax,
  );
  const subtotal = asFiniteNumber(nestedInvoice.subtotal ?? nestedInvoice.sub_total ?? nestedInvoice.netAmount);
  const taxableAmount = asFiniteNumber(nestedInvoice.taxableAmount ?? nestedInvoice.taxable_amount ?? subtotal);
  const totalAmount =
    asFiniteNumber(
      nestedInvoice.totalAmount ??
        nestedInvoice.total_amount ??
        nestedInvoice.grandTotal ??
        nestedInvoice.grand_total ??
        nestedInvoice.amount,
    ) ?? 0;

  const supplierSnapshot = normalizeParty(nestedInvoice.supplierSnapshot ?? nestedInvoice.supplier);
  const customerSnapshot = normalizeParty(nestedInvoice.customerSnapshot ?? nestedInvoice.customer);
  const rawLineItems = Array.isArray(nestedInvoice.lineItems)
    ? nestedInvoice.lineItems
    : Array.isArray(nestedInvoice.items)
      ? nestedInvoice.items
      : [];
  const lineItems = rawLineItems.map(normalizeLineItem).filter((item): item is InvoiceLineItem => item !== null);

  return {
    id,
    invoiceNumber,
    paymentOrderId: asCleanString(nestedInvoice.paymentOrderId ?? nestedInvoice.payment_order_id),
    issuedAt: asCleanString(
      nestedInvoice.issuedAt ??
        nestedInvoice.issued_at ??
        nestedInvoice.invoiceDate ??
        nestedInvoice.invoice_date ??
        nestedInvoice.createdAt ??
        nestedInvoice.created_at,
    ),
    currency,
    subtotal,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cgstRate: asFiniteNumber(nestedInvoice.cgstRate ?? nestedInvoice.cgst_rate ?? taxBreakdown?.cgstRate),
    sgstRate: asFiniteNumber(nestedInvoice.sgstRate ?? nestedInvoice.sgst_rate ?? taxBreakdown?.sgstRate),
    igstRate: asFiniteNumber(nestedInvoice.igstRate ?? nestedInvoice.igst_rate ?? taxBreakdown?.igstRate),
    totalTax,
    totalAmount,
    status: normalizeInvoiceStatus(nestedInvoice.status ?? nestedInvoice.paymentStatus ?? nestedInvoice.payment_status, Boolean(creditNote)),
    invoiceTitle: asCleanString(nestedInvoice.invoiceTitle ?? nestedInvoice.invoice_title),
    financialYear: asCleanString(nestedInvoice.financialYear ?? nestedInvoice.financial_year),
    paymentMethod: asCleanString(nestedInvoice.paymentMethod ?? nestedInvoice.payment_method),
    paymentReference: asCleanString(nestedInvoice.paymentReference ?? nestedInvoice.payment_reference),
    placeOfSupply: asCleanString(nestedInvoice.placeOfSupply ?? nestedInvoice.place_of_supply),
    reverseCharge: asCleanString(nestedInvoice.reverseCharge ?? nestedInvoice.reverse_charge),
    sacCode: asCleanString(nestedInvoice.sacCode ?? nestedInvoice.sac_code),
    amountInWords: asCleanString(nestedInvoice.amountInWords ?? nestedInvoice.amount_in_words),
    customerId: asCleanString(
      nestedInvoice.customerId ?? nestedInvoice.customer_id ?? nestedInvoice.userId ?? nestedInvoice.uid,
    ),
    customerEmail: asCleanString(
      nestedInvoice.customerEmail ?? nestedInvoice.customer_email ?? nestedInvoice.email ?? customerSnapshot?.email,
    ),
    customerName: asCleanString(
      nestedInvoice.customerName ?? nestedInvoice.customer_name ?? customerSnapshot?.name ?? customerSnapshot?.company,
    ),
    supplierSnapshot,
    customerSnapshot,
    lineItems,
    creditNote,
  };
}

/**
 * Formats an ISO date or YYYY-MM-DD date strictly as `DD MMM YYYY` (e.g. `29 Oct 2026`).
 */
export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIndex = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    if (monthIndex >= 0 && monthIndex < 12 && day >= 1 && day <= 31) {
      return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[monthIndex]} ${year}`;
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '—';
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const month = MONTHS_SHORT[parsed.getUTCMonth()];
  const year = parsed.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats a monetary value using the invoice's actual ISO currency code.
 * Never assumes INR when another currency is provided.
 */
export function formatInvoiceCurrency(amount: number | null | undefined, currency: string | null | undefined): string {
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const code = (currency || 'INR').trim().toUpperCase() || 'INR';
  try {
    const locale = code === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${code} ${safeAmount.toFixed(2)}`;
  }
}

export interface FormattedTaxBreakdown {
  hasGstSplit: boolean;
  cgstLabel: string | null;
  sgstLabel: string | null;
  igstLabel: string | null;
  totalTaxLabel: string;
}

export function formatInvoiceTaxBreakdown(invoice: BillingInvoice): FormattedTaxBreakdown {
  const cgst = invoice.cgstAmount ?? 0;
  const sgst = invoice.sgstAmount ?? 0;
  const igst = invoice.igstAmount ?? 0;
  const hasIntraState = (invoice.cgstAmount !== null && cgst > 0) || (invoice.sgstAmount !== null && sgst > 0);
  const hasInterState = invoice.igstAmount !== null && igst > 0;

  const cgstLabel = hasIntraState
    ? `CGST${invoice.cgstRate ? ` (${invoice.cgstRate}%)` : ''}: ${formatInvoiceCurrency(cgst, invoice.currency)}`
    : null;
  const sgstLabel = hasIntraState
    ? `SGST${invoice.sgstRate ? ` (${invoice.sgstRate}%)` : ''}: ${formatInvoiceCurrency(sgst, invoice.currency)}`
    : null;
  const igstLabel = hasInterState
    ? `IGST${invoice.igstRate ? ` (${invoice.igstRate}%)` : ''}: ${formatInvoiceCurrency(igst, invoice.currency)}`
    : null;

  const computedTotalTax =
    invoice.totalTax !== null
      ? invoice.totalTax
      : hasIntraState || hasInterState
        ? cgst + sgst + igst
        : null;

  return {
    hasGstSplit: hasIntraState || hasInterState,
    cgstLabel,
    sgstLabel,
    igstLabel,
    totalTaxLabel:
      computedTotalTax !== null ? formatInvoiceCurrency(computedTotalTax, invoice.currency) : '—',
  };
}

function parseInvoiceCollection(
  payload: unknown,
  requestedLimit: number,
  requestedOffset: number,
): InvoiceListResult {
  if (Array.isArray(payload)) {
    const invoices = payload.map(normalizeBillingInvoice).filter((item): item is BillingInvoice => item !== null);
    return {
      invoices,
      total: invoices.length,
      limit: requestedLimit,
      offset: requestedOffset,
      hasMore: false,
    };
  }
  if (!isRecord(payload)) {
    throw new Error('Unexpected billing invoices response shape.');
  }

  const rawList = Array.isArray(payload.invoices)
    ? payload.invoices
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.data)
        ? payload.data
        : null;

  if (!rawList) {
    throw new Error('Billing invoices list is missing from server response.');
  }

  const invoices = rawList.map(normalizeBillingInvoice).filter((item): item is BillingInvoice => item !== null);
  const pagination = isRecord(payload.pagination) ? payload.pagination : null;
  const limit = Math.max(1, asFiniteNumber(payload.limit ?? pagination?.limit) ?? requestedLimit);
  const offset = Math.max(0, asFiniteNumber(payload.offset ?? pagination?.offset) ?? requestedOffset);
  const reportedTotal = asFiniteNumber(
    payload.total ?? payload.totalCount ?? payload.count ?? pagination?.total ?? pagination?.totalCount,
  );
  const total = reportedTotal !== null ? Math.max(invoices.length, Math.trunc(reportedTotal)) : offset + invoices.length;
  const explicitHasMore = payload.hasMore ?? pagination?.hasMore;
  const hasMore =
    typeof explicitHasMore === 'boolean' ? explicitHasMore : offset + invoices.length < total;

  return {
    invoices,
    total,
    limit,
    offset,
    hasMore,
  };
}

export async function fetchUserInvoices(
  params: InvoiceListParams = {},
  signal?: AbortSignal,
): Promise<InvoiceListResult> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  const queryParams: Record<string, string | number> = { limit, offset };
  if (params.status && params.status !== 'ALL') {
    queryParams.status = params.status;
  }

  const response = await apiClient.get<unknown>('/billing/invoices', {
    params: queryParams,
    signal,
  });
  return parseInvoiceCollection(response.data, limit, offset);
}

export async function fetchUserInvoiceDetail(
  invoiceId: string,
  signal?: AbortSignal,
): Promise<BillingInvoice> {
  const encoded = encodeURIComponent(invoiceId);
  const response = await apiClient.get<unknown>(`/billing/invoices/${encoded}`, { signal });
  const parsed = normalizeBillingInvoice(response.data);
  if (!parsed) {
    throw new Error('Invoice details returned by the server were incomplete.');
  }
  return parsed;
}

export async function fetchInvoicePrintableHtml(
  invoiceId: string,
  signal?: AbortSignal,
): Promise<string> {
  const encoded = encodeURIComponent(invoiceId);
  const response = await apiClient.get<string>(`/billing/invoices/${encoded}/html`, {
    responseType: 'text',
    headers: { Accept: 'text/html, application/json' },
    signal,
  });

  const rawBody = response.data;
  if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
    throw new Error('Printable invoice document was empty.');
  }

  // Handle JSON-wrapped HTML (`{ html: "<!doctype html>..." }`) if returned by an API gateway.
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      if (isRecord(parsedJson)) {
        if (parsedJson.success === false) {
          throw new Error(asCleanString(parsedJson.error ?? parsedJson.message) ?? 'Unable to generate printable invoice.');
        }
        const extractedHtml = asCleanString(parsedJson.html ?? parsedJson.content);
        if (extractedHtml) {
          return sanitizeInvoiceHtmlForPrint(extractedHtml);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message !== 'Unexpected token') {
        throw err;
      }
    }
  }

  return sanitizeInvoiceHtmlForPrint(rawBody);
}

/**
 * Strips scripts, active embeds, and inline event attributes from server-provided HTML
 * and enforces a non-scripting Content-Security-Policy inside the printable document.
 */
export function sanitizeInvoiceHtmlForPrint(rawHtml: string): string {
  const cleanBodyOrDoc = DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta'],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'ondblclick',
      'onmouseover',
      'onmouseenter',
      'onfocus',
      'onblur',
      'onsubmit',
    ],
  });

  const cspMeta =
    '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; font-src data:;">';

  if (/<head[\s>]/i.test(cleanBodyOrDoc)) {
    return cleanBodyOrDoc.replace(/<head([^>]*)>/i, `<head$1>${cspMeta}`);
  }
  return `<!DOCTYPE html><html lang="en"><head>${cspMeta}<title>Tax Invoice</title></head><body>${cleanBodyOrDoc}</body></html>`;
}

/**
 * Renders sanitized HTML inside a sandboxed hidden iframe without `allow-scripts`
 * so untrusted invoice content can never execute scripts in the application origin,
 * invokes native browser printing, and cleans up temporary DOM elements afterward.
 */
export async function printAuthenticatedInvoiceHtml(rawHtml: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Printing is only supported in a browser environment.');
  }

  const sanitizedHtml = sanitizeInvoiceHtmlForPrint(rawHtml);

  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    // Crucial security boundary: omit `allow-scripts` so scripts can NEVER execute.
    // `allow-same-origin` + `allow-modals` permits parent-initiated `contentWindow.print()` only.
    iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    let settled = false;
    let cleanupTimer: number | undefined;

    const cleanup = () => {
      if (cleanupTimer !== undefined) {
        window.clearTimeout(cleanupTimer);
      }
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    iframe.onload = () => {
      if (settled) return;
      settled = true;
      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow || typeof frameWindow.print !== 'function') {
          cleanup();
          reject(new Error('Browser blocked the print view. Please enable print dialogs and try again.'));
          return;
        }
        frameWindow.onafterprint = () => {
          cleanup();
        };
        frameWindow.focus();
        frameWindow.print();
        // Clean up after print dialog closes or fallback timeout if afterprint does not fire.
        cleanupTimer = window.setTimeout(cleanup, 60_000);
        resolve();
      } catch (err) {
        cleanup();
        reject(
          new Error(
            normalizeError(err).message ||
              'Unable to open the browser print dialog. Check popup/print settings and try again.',
          ),
        );
      }
    };

    iframe.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Failed to prepare printable invoice document.'));
    };

    iframe.srcdoc = sanitizedHtml;
    document.body.appendChild(iframe);
  });
}

export async function fetchAdminInvoices(
  params: AdminInvoiceListParams = {},
  signal?: AbortSignal,
): Promise<AdminInvoiceListResult> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  const queryParams: Record<string, string | number> = { limit, offset };

  const trimmedSearch = params.search?.trim();
  if (trimmedSearch) queryParams.search = trimmedSearch;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;

  const response = await apiClient.get<unknown>('/admin/billing/invoices', {
    params: queryParams,
    signal,
  });

  const base = parseInvoiceCollection(response.data, limit, offset);
  let summary: AdminInvoiceSummary | null = null;
  if (isRecord(response.data) && isRecord(response.data.summary)) {
    summary = {
      totalAmount: asFiniteNumber(response.data.summary.totalAmount ?? response.data.summary.grandTotal),
      totalTax: asFiniteNumber(response.data.summary.totalTax ?? response.data.summary.taxAmount),
      currency: asCleanString(response.data.summary.currency),
    };
  }

  return {
    ...base,
    summary,
  };
}
