import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCouponResponse } from '../../../frontend/src/pages/billing/coupon-contract.ts';
test('coupon accepts documented server response only', () => {
 assert.deepEqual(parseCouponResponse({success:true,valid:true,coupon:{code:'TEST20',discount:20}},'TEST20'),{code:'TEST20',percent:20});
 for(const v of [null, {}, {success:true,valid:true,discountPercent:20}, {success:true,valid:true,coupon:{code:'OTHER',discount:20}}, {success:true,valid:true,coupon:{code:'TEST20',discount:200}}, {success:false,valid:true,coupon:{code:'TEST20',discount:20}}]) assert.throws(() => parseCouponResponse(v,'TEST20'));
});
