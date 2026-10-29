// Interprets only the owner-bound GET /api/payment-orders/:id response.
// This helper is not a provider checkout implementation and does not initiate a payment.
export type PaymentOrderState =
  | { kind: 'verified-order'; orderId: string; invoiceNumber: string | null; invoiceStatus: 'ISSUED' | 'LEGACY_NOT_CAPTURED'; membershipEnds: string | null }
  | { kind: 'pending' | 'failed' | 'cancelled' | 'refunded'; orderId: string };
export function parsePaymentOrderStatus(value: unknown, requestedId: string): PaymentOrderState {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestedId) || !value || typeof value !== 'object') throw new Error('Invalid payment order response');
  const order = value as Record<string, unknown>;
  if (order.orderId !== requestedId || typeof order.status !== 'string') throw new Error('Invalid payment order response');
  const id = requestedId;
  if (order.status === 'ACTIVE') {
    const issued = order.invoiceStatus === 'ISSUED' && typeof order.invoiceNumber === 'string' && order.invoiceNumber.trim().length > 0;
    const legacy = order.invoiceStatus === 'LEGACY_NOT_CAPTURED' && order.invoiceNumber === null;
    if (!issued && !legacy) throw new Error('Unverified invoice state');
    if (order.membershipEnds !== null && (typeof order.membershipEnds !== 'string' || !Number.isFinite(Date.parse(order.membershipEnds)))) throw new Error('Invalid membership date');
    return {kind:'verified-order', orderId:id, invoiceNumber:issued ? order.invoiceNumber as string : null, invoiceStatus:order.invoiceStatus as 'ISSUED' | 'LEGACY_NOT_CAPTURED', membershipEnds:order.membershipEnds as string | null};
  }
  if (['PENDING_PAYMENT','PAYMENT_CREATED','PAYMENT_PENDING'].includes(order.status)) return {kind:'pending',orderId:id};
  if (order.status === 'FAILED') return {kind:'failed',orderId:id};
  if (order.status === 'CANCELLED') return {kind:'cancelled',orderId:id};
  if (order.status === 'REFUNDED') return {kind:'refunded',orderId:id};
  throw new Error('Unknown payment order status');
}
