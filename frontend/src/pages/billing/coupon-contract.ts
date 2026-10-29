export function parseCouponResponse(data: unknown, requestedCode: string): { code: string; percent: number } {
  if (!data || typeof data !== 'object') throw new Error('Invalid coupon response');
  const response = data as Record<string, unknown>;
  if (response.success !== true || response.valid !== true || !response.coupon || typeof response.coupon !== 'object') throw new Error('Invalid coupon response');
  const coupon = response.coupon as Record<string, unknown>;
  if (coupon.code !== requestedCode || typeof coupon.discount !== 'number' || !Number.isFinite(coupon.discount) || coupon.discount <= 0 || coupon.discount > 100) throw new Error('Invalid coupon response');
  return { code: requestedCode, percent: coupon.discount };
}
