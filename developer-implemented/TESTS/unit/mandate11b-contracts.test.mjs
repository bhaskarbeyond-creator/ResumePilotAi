import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const loaderCode = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const frontendSrcDir = ${JSON.stringify(new URL('../../../frontend/src/', import.meta.url).pathname)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const subPath = specifier.slice(2);
    for (const ext of ['.ts', '.tsx', '.js', '/index.ts']) {
      const candidate = path.join(frontendSrcDir, subPath + ext);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parentDir, specifier);
    if (!existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '.js']) {
        if (existsSync(base + ext)) {
          return nextResolve(pathToFileURL(base + ext).href, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/firebase.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const auth = { currentUser: null }; export const isFirebaseConfigured = false;',
    };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`);

const billingMod = await import('../../../frontend/src/lib/billing-invoices.ts');
const seatsMod = await import('../../../frontend/src/lib/enterprise-seats.ts');
const queueMod = await import('../../../frontend/src/components/admin/queue-contract.ts');
const portfolioMod = await import('../../../frontend/src/lib/portfolio.ts');
const interviewsMod = await import('../../../frontend/src/lib/employer-interviews.ts');

test('Task 1 (Billing): formats dates as DD MMM YYYY and preserves real invoice currency & GST breakdown', () => {
  assert.equal(billingMod.formatInvoiceDate('2026-10-30T08:15:00.000Z'), '30 Oct 2026');
  assert.equal(billingMod.formatInvoiceDate('invalid-date'), '—');

  const inrFormatted = billingMod.formatInvoiceCurrency(1180, 'INR');
  assert.match(inrFormatted, /1,180\.00/);
  assert.ok(inrFormatted.includes('₹') || inrFormatted.includes('INR'));

  const usdFormatted = billingMod.formatInvoiceCurrency(49, 'USD');
  assert.match(usdFormatted, /49\.00/);
  assert.ok(usdFormatted.includes('$') || usdFormatted.includes('USD'));

  const normalized = billingMod.normalizeBillingInvoice({
    id: 'inv_001',
    invoiceNumber: 'IME-2026-0001',
    issuedAt: '2026-10-15T10:00:00Z',
    subtotal: 1000,
    totalTax: 180,
    totalAmount: 1180,
    currency: 'INR',
    status: 'PAID',
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
  });
  assert.ok(normalized);
  assert.equal(normalized.invoiceNumber, 'IME-2026-0001');
  assert.equal(normalized.currency, 'INR');
  assert.equal(normalized.status, 'PAID');
  assert.equal(normalized.cgstAmount, 90);
  assert.equal(normalized.sgstAmount, 90);
  assert.equal(normalized.igstAmount, 0);
});

test('Task 2 (Enterprise Seats): computes thresholds (<80% emerald, 80-99% amber, 100% crimson) safely and gates OWNER assignment', () => {
  const healthy = seatsMod.computeSeatUtilization({
    seatLimit: 20,
    seatsUsed: 12,
    seatsRemaining: 8,
    pendingInvites: 2,
  });
  assert.equal(healthy.percent, 60);
  assert.equal(healthy.tone, 'emerald');

  const warning = seatsMod.computeSeatUtilization({
    seatLimit: 20,
    seatsUsed: 17,
    seatsRemaining: 3,
    pendingInvites: 1,
  });
  assert.equal(warning.percent, 85);
  assert.equal(warning.tone, 'amber');

  const exhausted = seatsMod.computeSeatUtilization({
    seatLimit: 20,
    seatsUsed: 20,
    seatsRemaining: 0,
    pendingInvites: 0,
  });
  assert.equal(exhausted.percent, 100);
  assert.equal(exhausted.tone, 'crimson');

  // Division-by-zero / negative / NaN resilience
  const zeroLimit = seatsMod.computeSeatUtilization({
    seatLimit: 0,
    seatsUsed: 0,
    seatsRemaining: -5,
    pendingInvites: Number.NaN,
  });
  assert.equal(Number.isFinite(zeroLimit.percent), true);
  assert.equal(zeroLimit.percent, 0);
  assert.equal(zeroLimit.tone, 'emerald');

  // RBAC: only TENANT_OWNER may grant OWNER
  assert.equal(seatsMod.canCallerAssignOwnerRole(['TENANT_ADMIN']), false);
  assert.equal(seatsMod.canCallerAssignOwnerRole(['TENANT_OWNER']), true);

  assert.equal(
    seatsMod.isSeatLimitConflictError({
      status: 409,
      code: 'SEAT_LIMIT_REACHED',
      message: 'Seat limit reached',
    }),
    true,
  );
});

test('Task 3 (Outbox Queue): parses outbox stats and batch processing telemetry strictly', () => {
  const stats = queueMod.parseOutboxStats({
    stats: {
      PENDING: 14,
      SENT: 280,
      FAILED: 3,
    },
  });
  assert.deepEqual(stats, { PENDING: 14, DELIVERED: 280, DEAD_LETTER: 3 });

  assert.throws(() => queueMod.parseOutboxStats(null));
  assert.throws(() => queueMod.parseOutboxStats({ stats: {} }));

  const batchResult = queueMod.parseOutboxProcessResult({
    processed: 14,
    delivered: 13,
    failed: 1,
  });
  assert.equal(batchResult.processed, 14);
  assert.equal(batchResult.succeeded, 13);
  assert.equal(batchResult.failed, 1);
  assert.match(queueMod.formatOutboxProcessSummary(batchResult), /Processed 14/i);
});

test('Task 4 (Portfolio): validates slugs, custom domains, and strict public DTO sanitization', () => {
  assert.equal(portfolioMod.validatePortfolioSlug('ananya-rao-2026').valid, true);
  assert.equal(portfolioMod.validatePortfolioSlug('ab').valid, false);
  assert.equal(portfolioMod.validatePortfolioSlug('UpperCase').valid, false);
  assert.equal(portfolioMod.validatePortfolioSlug('-leading').valid, false);
  assert.equal(portfolioMod.validatePortfolioSlug('trailing-').valid, false);
  assert.equal(portfolioMod.validatePortfolioSlug('double--hyphen').valid, false);
  for (const reserved of ['api', 'admin', 'login', 'support', 'billing', 'enterprise', 'dashboard', 'auth']) {
    assert.equal(portfolioMod.validatePortfolioSlug(reserved).valid, false, `Expected reserved slug ${reserved} to fail`);
  }

  assert.equal(portfolioMod.validateCustomDomain('portfolio.ananyarao.dev').valid, true);
  assert.equal(portfolioMod.validateCustomDomain('https://portfolio.ananyarao.dev').valid, false);
  assert.equal(portfolioMod.validateCustomDomain('portfolio.ananyarao.dev/path').valid, false);
  assert.equal(portfolioMod.validateCustomDomain('127.0.0.1').valid, false);
  assert.equal(portfolioMod.validateCustomDomain('localhost').valid, false);

  const sanitized = portfolioMod.sanitizePublicPortfolioDto({
    portfolio: {
      id: 'pf_1',
      title: 'Ananya Rao',
      theme: 'modernMinimal',
      slug: 'ananya-rao',
      isPublished: true,
      publishedAt: '2026-10-30T00:00:00Z',
      userId: 'secret_user_99',
      privateNotes: 'Internal salary expectation',
      analyticsTokens: ['ga_secret_token'],
      revision: 9,
      metadata: { seoTitle: 'Ananya Rao', leakedSecret: 'nope' },
      data: {
        renderer: 'webcv',
        templateKey: 'modernMinimal',
        canonical: { summary: 'Distributed systems engineer' },
        draft: { secretDraft: true },
      },
    },
  });
  assert.ok(sanitized);
  assert.deepEqual(Object.keys(sanitized).sort(), [
    'data',
    'id',
    'isPublished',
    'metadata',
    'publishedAt',
    'slug',
    'theme',
    'title',
  ]);
  assert.equal('userId' in sanitized, false);
  assert.equal('privateNotes' in sanitized, false);
  assert.equal('analyticsTokens' in sanitized, false);
  assert.equal('draft' in sanitized.data, false);

  // Unpublished payloads must never be exposed by public DTO sanitizer
  assert.throws(() =>
    portfolioMod.sanitizePublicPortfolioDto({
      portfolio: { id: 'pf_2', slug: 'draft-pf', isPublished: false },
    }),
  );
});

test('Task 5 (Employer Interviews): validates slot times/durations and sorts chronologically', () => {
  assert.equal(interviewsMod.computeSlotEndTime('10:00', 30), '10:30');
  assert.equal(interviewsMod.computeSlotEndTime('23:30', 45), null);

  assert.match(
    interviewsMod.validateInterviewSlotInput(
      { date: '2026-10-29', startTime: '10:00', endTime: '10:30', duration: 30 },
      '2026-10-30',
    ) ?? '',
    /past dates/i,
  );

  assert.match(
    interviewsMod.validateInterviewSlotInput(
      { date: '2026-11-02', startTime: '14:00', endTime: '13:30', duration: 30 },
      '2026-10-30',
    ) ?? '',
    /after the start time/i,
  );

  assert.match(
    interviewsMod.validateInterviewSlotInput(
      { date: '2026-11-02', startTime: '14:00', endTime: '14:45', duration: 30 },
      '2026-10-30',
    ) ?? '',
    /30-minute duration/i,
  );

  assert.equal(
    interviewsMod.validateInterviewSlotInput(
      { date: '2026-11-02', startTime: '14:00', endTime: '14:45', duration: 45 },
      '2026-10-30',
    ),
    null,
  );

  const later = interviewsMod.normalizeInterviewSlot({
    id: 'slot_2',
    date: '2026-11-03',
    startTime: '15:00',
    endTime: '15:30',
    duration: 30,
    timezone: 'Asia/Kolkata',
    status: 'AVAILABLE',
  });
  const earlier = interviewsMod.normalizeInterviewSlot({
    id: 'slot_1',
    date: '2026-11-03',
    startTime: '09:30',
    endTime: '10:00',
    duration: 30,
    timezone: 'Asia/Kolkata',
    status: 'BOOKED',
    bookedApplicationId: 'app_99',
  });
  assert.ok(earlier && later);
  assert.equal(earlier.isBooked, true);
  assert.equal(later.isBooked, false);
  const sorted = [later, earlier].sort((a, b) => a.sortEpochMs - b.sortEpochMs);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['slot_1', 'slot_2'],
  );
});
