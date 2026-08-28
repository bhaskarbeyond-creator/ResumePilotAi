import { writeSanitizedPrintDocument } from './sanitizeHtml.js';

function text(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Unavailable';
  return `${text(currency)} ${amount.toFixed(2)}`;
}

export function isAuthoritativeInvoice(invoice) {
  return Boolean(
    invoice && typeof invoice === 'object'
    && invoice.invoiceNumber
    && invoice.paymentOrderId
    && invoice.invoiceDate
    && invoice.currency
    && invoice.supplierSnapshot?.legalName
    && invoice.customerSnapshot?.name
    && Array.isArray(invoice.lineItems)
    && Number.isFinite(Number(invoice.grandTotal))
  );
}

export function isAuthoritativeCreditNote(creditNote) {
  return Boolean(
    creditNote && typeof creditNote === 'object'
    && creditNote.documentType === 'CREDIT_NOTE'
    && creditNote.creditNoteNumber
    && creditNote.originalInvoiceNumber
    && creditNote.providerRefundId
    && creditNote.paymentOrderId
    && creditNote.creditNoteDate
    && creditNote.currency
    && creditNote.supplierSnapshot?.legalName
    && creditNote.customerSnapshot?.name
    && Array.isArray(creditNote.lineItems)
    && Number.isFinite(Number(creditNote.grandTotal))
  );
}

function printAuthoritativeBillingDocument(document, type) {
  const isCreditNote = type === 'credit-note';
  if (isCreditNote ? !isAuthoritativeCreditNote(document) : !isAuthoritativeInvoice(document)) {
    throw new Error(`The immutable ${isCreditNote ? 'credit-note' : 'invoice'} record is incomplete.`);
  }
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error(`The ${isCreditNote ? 'credit-note' : 'invoice'} window was blocked by the browser.`);
  printWindow.opener = null;

  const supplier = document.supplierSnapshot;
  const customer = document.customerSnapshot;
  const number = isCreditNote ? document.creditNoteNumber : document.invoiceNumber;
  const title = isCreditNote ? document.creditNoteTitle || 'GST Credit Note' : document.invoiceTitle;
  const date = isCreditNote ? document.creditNoteDate : document.invoiceDate;
  const numberLabel = isCreditNote ? 'Credit note number' : 'Invoice number';
  const status = isCreditNote ? 'REFUNDED' : document.paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PAID';
  const statusColor = status === 'PAID' ? '#047857' : '#7e22ce';
  const lines = document.lineItems.map(item => `
    <tr>
      <td>${text(item.description)}</td>
      <td>${text(item.sacCode)}</td>
      <td>${text(item.quantity)}</td>
      <td class="number">${money(item.taxableValue, document.currency)}</td>
      <td class="number">${money(item.total, document.currency)}</td>
    </tr>`).join('');
  const sourceReference = isCreditNote
    ? `<div><div class="label">Original invoice</div><strong>${text(document.originalInvoiceNumber)}</strong></div><div><div class="label">Provider refund reference</div><strong>${text(document.providerRefundId)}</strong></div>`
    : `<div><div class="label">Payment reference</div><strong>${text(document.paymentReference)}</strong></div>`;
  const reason = isCreditNote
    ? `<div class="box reason"><div class="label">Refund reason</div>${text(document.refundReason)}</div>`
    : '';
  const markup = `<!doctype html>
<html><head><title>${isCreditNote ? 'Credit Note' : 'Invoice'} ${text(number)}</title><style>
  body{font-family:Arial,sans-serif;color:#172033;margin:36px;line-height:1.45}
  header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #4338ca;padding-bottom:18px}
  h1{font-size:24px;margin:0;color:#312e81}.muted{color:#64748b;font-size:12px}.badge{font-weight:800;color:${statusColor}}
  .meta,.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}.box{border:1px solid #dbe2ea;border-radius:10px;padding:16px}.reason{margin-top:18px}
  .label{font-size:10px;text-transform:uppercase;font-weight:800;color:#64748b}table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px}th{background:#f8fafc}.number{text-align:right}
  .totals{margin:20px 0 0 auto;width:320px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.grand{font-size:16px;font-weight:800;border-top:2px solid #94a3b8;margin-top:6px;padding-top:8px!important}
  footer{margin-top:36px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:10px;color:#64748b}@media print{body{margin:18mm}}
</style></head><body>
<header><div><h1>${text(supplier.tradeName || supplier.legalName)}</h1><div class="muted">${text(title)}</div></div><div><div class="badge">${status}</div><div>${text(document.formattedDate || date)}</div></div></header>
<div class="meta"><div><div class="label">${numberLabel}</div><strong>${text(number)}</strong></div>${sourceReference}</div>
<div class="parties"><div class="box"><div class="label">Supplier</div><strong>${text(supplier.legalName)}</strong><br>${text(supplier.address)}, ${text(supplier.city)}, ${text(supplier.state)} ${text(supplier.pincode)}<br>GSTIN: ${text(supplier.gstin)} · PAN: ${text(supplier.pan)}<br>SAC: ${text(supplier.sacCode)}</div><div class="box"><div class="label">Customer</div><strong>${text(customer.name)}</strong>${customer.company ? `<br>${text(customer.company)}` : ''}<br>${text(customer.address)}, ${text(customer.city)}, ${text(customer.state)}<br>${text(customer.email)}${customer.gstin ? `<br>GSTIN: ${text(customer.gstin)}` : ''}</div></div>
${reason}<table><thead><tr><th>Description</th><th>SAC</th><th>Qty</th><th class="number">Taxable value</th><th class="number">Total</th></tr></thead><tbody>${lines}</tbody></table>
<div class="totals"><div><span>Taxable value</span><span>${money(document.taxableAmount, document.currency)}</span></div><div><span>CGST</span><span>${money(document.cgstAmount, document.currency)}</span></div><div><span>SGST</span><span>${money(document.sgstAmount, document.currency)}</span></div><div><span>IGST</span><span>${money(document.igstAmount, document.currency)}</span></div><div class="grand"><span>${isCreditNote ? 'Total credited' : 'Grand total'}</span><span>${money(document.grandTotal, document.currency)}</span></div></div>
<p><strong>Amount in words:</strong> ${text(document.amountInWords)}</p><footer>This document renders the immutable server-issued ${isCreditNote ? 'credit note' : 'invoice'} record for payment order ${text(document.paymentOrderId)}. Supplier and customer details are historical snapshots, not current profile settings.</footer>
</body></html>`;
  writeSanitizedPrintDocument(printWindow, markup);
  printWindow.focus();
  printWindow.print();
}

export function printAuthoritativeInvoice(invoice) {
  return printAuthoritativeBillingDocument(invoice, 'invoice');
}

export function printAuthoritativeCreditNote(creditNote) {
  return printAuthoritativeBillingDocument(creditNote, 'credit-note');
}
