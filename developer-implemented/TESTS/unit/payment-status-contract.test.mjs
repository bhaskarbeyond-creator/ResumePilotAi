import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentOrderStatus } from '../../../frontend/src/pages/billing/payment-status-contract.ts';
const active = {orderId:'order_1',status:'ACTIVE',invoiceStatus:'ISSUED',invoiceNumber:'INV-1',membershipEnds:'2030-01-01T00:00:00.000Z'};
test('only an owner-bound verified ACTIVE response produces verified order state', () => {
 assert.equal(parsePaymentOrderStatus(active,'order_1').kind,'verified-order');
 assert.equal(parsePaymentOrderStatus({...active,invoiceStatus:'LEGACY_NOT_CAPTURED',invoiceNumber:null},'order_1').invoiceNumber,null);
 for (const bad of [null, {}, {...active,orderId:'other'}, {...active,invoiceNumber:null}, {...active,invoiceStatus:'NOT_ISSUED'}, {...active,membershipEnds:'bad'}, {...active,status:'nonsense'}]) assert.throws(()=>parsePaymentOrderStatus(bad,'order_1'));
});
test('pending failed cancelled refunded never indicate paid success', () => {
 for (const [status,kind] of [['PENDING_PAYMENT','pending'],['PAYMENT_CREATED','pending'],['PAYMENT_PENDING','pending'],['FAILED','failed'],['CANCELLED','cancelled'],['REFUNDED','refunded']]) assert.equal(parsePaymentOrderStatus({...active,status},'order_1').kind,kind);
});
