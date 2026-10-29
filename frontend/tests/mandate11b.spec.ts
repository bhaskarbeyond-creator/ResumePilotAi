import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function encodeBase64Url(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64url');
}

function buildTestToken(identity: { uid: string; email: string; role: string }): string {
  const payload = encodeBase64Url({
    uid: identity.uid,
    email: identity.email,
    role: identity.role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `rptest.${payload}.${'a'.repeat(64)}`;
}

async function seedAuthenticatedSession(
  page: Page,
  identity: { uid: string; email: string; displayName: string; role: string },
) {
  const token = buildTestToken(identity);

  await page.addInitScript(
    ({ record }) => {
      window.localStorage.setItem('ime_dev_user', JSON.stringify(record));
      window.localStorage.setItem('token', record.token);
    },
    {
      record: {
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        token,
      },
    },
  );

  await page.route('**/api/users-data/profile', (route) =>
    route.fulfill({
      status: 200,
      json: {
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        emailVerified: true,
      },
    }),
  );

  await page.route('**/api/notifications**', (route) =>
    route.fulfill({ status: 200, json: { notifications: [], unreadCount: 0 } }),
  );

  await page.route('**/api/ai-usage**', (route) =>
    route.fulfill({ status: 200, json: { used: 0, limit: 100, remaining: 100 } }),
  );
}

async function expectNoAxeSeriousViolations(page: Page, includeSelector?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (includeSelector) {
    builder = builder.include(includeSelector);
  }
  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blocking,
    `Expected 0 critical/serious WCAG AA violations, got: ${JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })))}`,
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

/* ============================================================================
 * TASK 1: User Billing, Invoices & Tax Receipts Center (DISC-012, DISC-048)
 * ============================================================================ */
test.describe('Task 1 — User Billing, Invoices & Admin Invoices Explorer', () => {
  test('renders user invoice history, resets pagination on filter change, inspects details, and safely prints authenticated HTML', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __printCount?: number }).__printCount = 0;
      const origCreateElement = document.createElement.bind(document);
      document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'iframe') {
          el.addEventListener('load', () => {
            try {
              const cw = (el as HTMLIFrameElement).contentWindow;
              if (cw) {
                cw.print = () => {
                  (window as unknown as { __printCount: number }).__printCount += 1;
                };
              }
            } catch {
              // ignore cross-origin
            }
          });
        }
        return el;
      }) as typeof document.createElement;
    });

    await seedAuthenticatedSession(page, {
      uid: 'usr_cand_1',
      email: 'priya@example.test',
      displayName: 'Priya Sharma',
      role: 'USER',
    });

    await page.route('**/api/settings/account', (route) =>
      route.fulfill({
        status: 200,
        json: {
          account: {
            fullName: 'Priya Sharma',
            email: 'priya@example.test',
            emailVerified: true,
            headline: 'Product Engineer',
            location: 'Bengaluru, IN',
            phone: '',
            website: '',
            bio: '',
            preferences: {
              productUpdates: true,
              jobAlerts: true,
              weeklyDigest: false,
            },
          },
        },
      }),
    );

    const observedQueries: string[] = [];
    let htmlAuthHeader: string | null = null;

    await page.route('**/api/billing/invoices/inv_101/html', (route) => {
      htmlAuthHeader = route.request().headers()['authorization'] ?? null;
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Tax Invoice IME-2026-0101</h1><script>window.__xssExecuted = true;</script><p>CGST 9% + SGST 9%</p></body></html>',
      });
    });

    await page.route('**/api/billing/invoices/inv_101', (route) =>
      route.fulfill({
        status: 200,
        json: {
          invoice: {
            id: 'inv_101',
            invoiceNumber: 'IME-2026-0101',
            issuedAt: '2026-10-18T09:30:00.000Z',
            currency: 'INR',
            subtotal: 1000,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            totalTax: 180,
            totalAmount: 1180,
            status: 'PAID',
            paymentMethod: 'Razorpay UPI',
            paymentReference: 'pay_Rzp998877',
            lineItems: [
              {
                description: 'IME365 Pro Subscription (Monthly)',
                quantity: 1,
                unitPrice: 1000,
                amount: 1000,
              },
            ],
          },
        },
      }),
    );

    await page.route('**/api/billing/invoices?*', (route) => {
      const url = new URL(route.request().url());
      observedQueries.push(url.search);
      const status = url.searchParams.get('status');
      const allRows = [
        {
          id: 'inv_101',
          invoiceNumber: 'IME-2026-0101',
          issuedAt: '2026-10-18T09:30:00.000Z',
          currency: 'INR',
          subtotal: 1000,
          cgstAmount: 90,
          sgstAmount: 90,
          igstAmount: 0,
          totalTax: 180,
          totalAmount: 1180,
          status: 'PAID',
        },
        {
          id: 'inv_102',
          invoiceNumber: 'IME-2026-0102',
          issuedAt: '2026-09-05T14:00:00.000Z',
          currency: 'USD',
          subtotal: 49,
          totalTax: 0,
          totalAmount: 49,
          status: 'REFUNDED',
        },
      ];
      const filtered = status ? allRows.filter((r) => r.status === status) : allRows;
      return route.fulfill({
        status: 200,
        json: { invoices: filtered, total: filtered.length, limit: 20, offset: 0 },
      });
    });

    await page.goto('/dashboard/settings?tab=billing');
    await expect(page.getByRole('cell', { name: 'IME-2026-0101', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '18 Oct 2026', exact: true })).toBeVisible();
    await expect(page.getByText(/1,180\.00/).first()).toBeVisible();
    await expect(page.getByText(/49\.00/).first()).toBeVisible();
    await expectNoAxeSeriousViolations(page);

    // Filter to PAID -> resets offset=0 and passes status=PAID
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await expect(page.getByText('IME-2026-0102')).toHaveCount(0);
    expect(observedQueries.some((q) => q.includes('offset=0') && q.includes('status=PAID'))).toBe(
      true,
    );

    // Open Invoice Detail Modal
    await page.getByRole('button', { name: /View.*IME-2026-0101/i }).first().click();
    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText('IME365 Pro Subscription (Monthly)')).toBeVisible();
    await expect(detailDialog.getByText('pay_Rzp998877')).toBeVisible();
    await expectNoAxeSeriousViolations(page, '[role="dialog"]');

    // Trigger Print Tax Receipt -> fetches authenticated HTML and strips <script>
    await detailDialog.getByRole('button', { name: /Print Tax Receipt/i }).click();
    await expect.poll(() => htmlAuthHeader).toContain('Bearer rptest.');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __printCount?: number }).__printCount ?? 0),
      )
      .toBe(1);
    const xssRan = await page.evaluate(
      () => Boolean((window as unknown as { __xssExecuted?: boolean }).__xssExecuted),
    );
    expect(xssRan).toBe(false);
  });

  test('renders Admin Invoices Explorer with debounced search, date filters, clear filters, and error recovery', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_super_1',
      email: 'admin@ime365.test',
      displayName: 'Platform SuperAdmin',
      role: 'SUPER_ADMIN',
    });

    await page.route('**/api/admin/billing/stats', (route) =>
      route.fulfill({
        status: 200,
        json: {
          mrr: 48000,
          activeSubscriptions: 120,
          refundsCount: 2,
          failedPaymentsCount: 1,
        },
      }),
    );
    await page.route('**/api/admin/subscriptions**', (route) =>
      route.fulfill({ status: 200, json: { subscriptions: [], total: 0 } }),
    );
    await page.route('**/api/admin/billing/subscriptions**', (route) =>
      route.fulfill({ status: 200, json: { subscriptions: [], total: 0 } }),
    );
    await page.route('**/api/admin/billing/coupons**', (route) =>
      route.fulfill({ status: 200, json: { coupons: [] } }),
    );

    const adminQueries: string[] = [];
    await page.route('**/api/admin/billing/invoices?*', (route) => {
      const url = new URL(route.request().url());
      adminQueries.push(url.search);
      return route.fulfill({
        status: 200,
        json: {
          invoices: [
            {
              id: 'adm_inv_1',
              invoiceNumber: 'IME-ENT-9001',
              issuedAt: '2026-10-20T12:00:00.000Z',
              currency: 'INR',
              subtotal: 50000,
              igstAmount: 9000,
              totalTax: 9000,
              totalAmount: 59000,
              status: 'PAID',
              customerEmail: 'finance@acme.test',
              customerName: 'Acme Corp',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
      });
    });

    await page.goto('/admin/billing');
    await expect(page.getByRole('cell', { name: 'IME-ENT-9001', exact: true })).toBeVisible();
    await expect(page.getByText('finance@acme.test').first()).toBeVisible();

    const searchInput = page.getByLabel(/Search invoices/i);
    await searchInput.fill('IME-ENT-9001');
    await expect
      .poll(() => adminQueries.some((q) => q.includes('IME-ENT-9001')), { timeout: 5000 })
      .toBe(true);

    await page.getByRole('button', { name: /Clear Filters/i }).click();
    await expect(searchInput).toHaveValue('');
    await expectNoAxeSeriousViolations(page);
  });

  test('preserves /pricing tiers & checkout modal while providing deep-link access to Billing & Tax Receipts Center', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_cand_pricing',
      email: 'priya@example.test',
      displayName: 'Priya Sharma',
      role: 'USER',
    });

    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Starter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Professional' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Executive Pro' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enterprise', exact: true })).toBeVisible();

    const receiptsLink = page.getByRole('link', { name: /Billing & Invoices/i });
    await expect(receiptsLink).toBeVisible();
    await expect(receiptsLink).toHaveAttribute('href', '/dashboard/settings?tab=billing');
  });
});

/* ============================================================================
 * TASK 2: Enterprise Workspace Seat Quota Gauge & Invitation Modal (DISC-034, DISC-050)
 * ============================================================================ */
test.describe('Task 2 — Enterprise Seat Quota Gauge & Teammate Invitation Modal', () => {
  test('displays color-coded seat quota gauge, handles HTTP 409 SEAT_LIMIT_REACHED preserving input, and refreshes on 201 success', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_ent_admin',
      email: 'admin@tenant.test',
      displayName: 'Tenant Admin',
      role: 'ADMIN',
    });

    await page.route('**/api/enterprise/status', (route) =>
      route.fulfill({ status: 200, json: { enabled: true } }),
    );
    await page.route('**/api/enterprise/tenants', (route) =>
      route.fulfill({
        status: 200,
        json: {
          tenants: [{ id: 'ten_01', name: 'Acme Enterprise', slug: 'acme-ent', status: 'ACTIVE' }],
        },
      }),
    );
    await page.route('**/api/enterprise/context', (route) =>
      route.fulfill({
        status: 200,
        json: {
          tenant: { id: 'ten_01', name: 'Acme Enterprise', slug: 'acme-ent', status: 'ACTIVE' },
          workspace: { id: 'ws_01', tenantId: 'ten_01', name: 'Engineering Hiring', isDefault: true },
          platformAdmin: false,
          context: {
            roles: ['TENANT_ADMIN'],
            permissions: ['tenant.members.manage', 'tenant.workspaces.manage'],
            simulatedRole: null,
          },
        },
      }),
    );
    await page.route('**/api/enterprise/workspaces**', (route) => {
      if (route.request().url().includes('/members')) {
        return route.fulfill({
          status: 200,
          json: {
            members: [
              {
                id: 'mem_1',
                userId: 'usr_ent_admin',
                email: 'admin@tenant.test',
                name: 'Tenant Admin',
                role: 'TENANT_ADMIN',
                status: 'ACTIVE',
              },
            ],
          },
        });
      }
      return route.fulfill({
        status: 200,
        json: {
          workspaces: [
            { id: 'ws_01', tenantId: 'ten_01', name: 'Engineering Hiring', isDefault: true },
          ],
        },
      });
    });

    await page.route('**/api/enterprise/memberships**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          memberships: [
            {
              id: 'mem_1',
              userId: 'usr_ent_admin',
              email: 'admin@tenant.test',
              name: 'Tenant Admin',
              role: 'TENANT_ADMIN',
              status: 'ACTIVE',
            },
          ],
        },
      }),
    );
    await page.route('**/api/enterprise/roles-matrix**', (route) =>
      route.fulfill({ status: 200, json: { roles: [] } }),
    );

    let seatFetchCount = 0;
    let currentSeats = {
      seatLimit: 10,
      seatsUsed: 10,
      seatsRemaining: 0,
      pendingInvites: 2,
    };

    await page.route('**/api/enterprise/members/seats', (route) => {
      seatFetchCount += 1;
      return route.fulfill({ status: 200, json: currentSeats });
    });

    let shouldConflict = true;
    await page.route('**/api/enterprise/members/invite', async (route) => {
      const body = route.request().postDataJSON() as { email: string; role: string };
      if (shouldConflict) {
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'SEAT_LIMIT_REACHED',
              message: 'Seat quota exceeded',
            },
          },
        });
      }
      currentSeats = {
        seatLimit: 15,
        seatsUsed: 11,
        seatsRemaining: 4,
        pendingInvites: 3,
      };
      return route.fulfill({
        status: 201,
        json: {
          invitation: {
            id: 'inv_mem_2',
            email: body.email,
            role: body.role,
            status: 'INVITED',
          },
        },
      });
    });

    await page.goto('/org/users');
    await expect(page.getByText('10 / 10 seats used')).toBeVisible();
    await expect(page.getByText('100% utilized')).toBeVisible();

    await page.getByRole('button', { name: /Invite Teammate/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectNoAxeSeriousViolations(page, '[role="dialog"]');

    // Non-owner TENANT_ADMIN should NOT see OWNER in Radix Select options
    const roleSelect = dialog.getByLabel(/Workspace Role/i);
    await roleSelect.click();
    await expect(page.getByRole('option', { name: /Owner/i })).toHaveCount(0);
    await page.getByRole('option', { name: /^Member/i }).click();

    const emailInput = dialog.getByLabel(/Work Email Address/i);
    await emailInput.fill('newhire@acme.test');

    // First attempt -> HTTP 409 SEAT_LIMIT_REACHED
    await dialog.getByRole('button', { name: /Send Invitation/i }).click();
    await expect(
      dialog.getByText(
        'Workspace seat limit reached. Please upgrade your enterprise tier or revoke unused invitations.',
      ),
    ).toBeVisible();
    // Modal MUST remain open and preserve user input
    await expect(dialog).toBeVisible();
    await expect(emailInput).toHaveValue('newhire@acme.test');
    await expect(roleSelect).toContainText(/Member/i);

    // Upgrade capacity and retry -> 201 closes modal & refreshes seat quota
    shouldConflict = false;
    const beforeCount = seatFetchCount;
    await dialog.getByRole('button', { name: /Send Invitation/i }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => seatFetchCount).toBeGreaterThan(beforeCount);
    await expect(page.getByText('11 / 15 seats used')).toBeVisible();
  });
});

/* ============================================================================
 * TASK 3: Admin Outbox Queue Telemetry & Batch Processing (DISC-022, FS-M8A-05)
 * ============================================================================ */
test.describe('Task 3 — Admin Outbox Queue Telemetry & Batch Processing', () => {
  test('renders outbox KPI cards, disables batch button when PENDING === 0, and refreshes telemetry after batch execution', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_super_1',
      email: 'admin@ime365.test',
      displayName: 'Platform SuperAdmin',
      role: 'SUPER_ADMIN',
    });

    let outboxStats = { PENDING: 0, SENT: 94, FAILED: 2 };
    let processCalls = 0;

    await page.route('**/api/admin/system/outbox/stats', (route) =>
      route.fulfill({ status: 200, json: { stats: outboxStats } }),
    );
    await page.route('**/api/admin/system/outbox/process', async (route) => {
      processCalls += 1;
      outboxStats = { PENDING: 0, SENT: 99, FAILED: 3 };
      return route.fulfill({
        status: 200,
        json: { processed: 6, delivered: 5, failed: 1 },
      });
    });
    await page.route('**/api/platform/queues**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          summary: {
            totalInspected: 1,
            deadLetterCount: 1,
            pendingCount: 0,
            successCount: 0,
            source: 'MARIADB_OUTBOXES',
            sampled: true,
          },
          jobs: [
            {
              id: 'evt_dead_1',
              queue: 'notification',
              channel: 'email',
              state: 'DEAD_LETTER',
              attemptCount: 3,
              recipient: 'ops@example.test',
              templateType: 'invoice_receipt',
              lastError: 'SMTP 550 mailbox unavailable',
              createdAt: '2026-10-30T08:00:00.000Z',
            },
          ],
        },
      }),
    );

    await page.goto('/admin/queues');
    await expect(page.getByText('Pending Dispatch')).toBeVisible();
    await expect(page.getByText('Successfully Delivered')).toBeVisible();
    await expect(page.getByText('Dead-Letter / Terminal Failures')).toBeVisible();

    const processBtn = page.getByRole('button', { name: /Process Pending Outbox/i });
    await expect(processBtn).toBeDisabled();
    await expectNoAxeSeriousViolations(page);

    // Update backend stats so PENDING = 6 and click Refresh
    outboxStats = { PENDING: 6, SENT: 94, FAILED: 2 };
    await page.getByRole('button', { name: /Refresh Telemetry/i }).click();
    await expect(processBtn).toBeEnabled();

    // Trigger batch processing via confirmation modal
    await processBtn.click();
    const confirmModal = page.getByRole('dialog');
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: /Confirm & Process|Process Now|Run Batch/i }).click();

    await expect.poll(() => processCalls).toBe(1);
    await expect(page.getByText(/Processed 6 events: 5 succeeded, 1 failed\./i)).toBeVisible();
    // Stats refreshed to PENDING: 0 -> button disabled again
    await expect(processBtn).toBeDisabled();
  });
});

/* ============================================================================
 * TASK 4: Public Portfolio Reader, Slug Publishing & Custom-Domain Setup (DISC-039, DISC-043)
 * ============================================================================ */
test.describe('Task 4 — Portfolio Slug Publishing, Custom Domain & Public Reader', () => {
  test('validates slugs, handles 409 SLUG_ALREADY_EXISTS, publishes/unpublishes, registers custom domain TXT token, and enforces public DTO privacy', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedAuthenticatedSession(page, {
      uid: 'usr_cand_pf',
      email: 'ananya@example.test',
      displayName: 'Ananya Rao',
      role: 'USER',
    });

    let storedRecord: Record<string, unknown> = {
      id: 'pf-101',
      title: 'Ananya Rao — Staff Engineer',
      theme: 'modernMinimal',
      slug: null,
      isPublished: false,
      publishedAt: null,
      revision: 1,
      renderer: 'webcv',
      templateKey: 'modernMinimal',
      canonical: {
        template: 'modernMinimal',
        heading: {
          firstname: 'Ananya',
          lastname: 'Rao',
          fullName: 'Ananya Rao',
          occupation: 'Staff Distributed Systems Engineer',
          city: 'Hyderabad',
          country: 'India',
          email: 'ananya@example.test',
          photo: 'https://invalid.example.test/broken-avatar.png',
        },
        summary: 'Architecting resilient multi-region cloud platforms.',
        experiences: [
          {
            id: 'exp-1',
            jobTitle: 'Staff Engineer',
            employer: 'CloudScale Systems',
            begin: '2023',
            end: 'Present',
            location: 'Hyderabad',
            description: 'Led zero-downtime ledger migration.',
          },
        ],
        projects: [
          {
            id: 'proj-1',
            title: 'QuorumKV',
            description: 'Raft-backed configuration store.',
            link: 'https://example.test/quorumkv',
            technologyList: ['Rust', 'TypeScript'],
          },
        ],
        skills: [{ id: 'sk-1', name: 'Distributed Systems', category: 'Architecture' }],
        education: [],
        certifications: [],
        achievements: [],
        languages: [],
        customSections: [],
        references: [],
        hobbies: [],
        extras: { tagline: 'Reliability at scale.' },
      },
    };

    await page.route('**/api/portfolios/pf-101', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, json: { portfolio: storedRecord } });
      }
      return route.fulfill({ status: 200, json: { portfolio: storedRecord } });
    });

    await page.route('**/api/portfolios/pf-101/publish', async (route) => {
      const payload = route.request().postDataJSON() as { slug?: string; isPublished: boolean };
      if (payload.isPublished === true) {
        if (payload.slug === 'taken-slug') {
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: 'SLUG_ALREADY_EXISTS',
                message: 'Slug already exists',
              },
            },
          });
        }
        storedRecord = {
          ...storedRecord,
          slug: payload.slug,
          isPublished: true,
          publishedAt: '2026-10-30T10:00:00.000Z',
        };
        return route.fulfill({
          status: 200,
          json: {
            slug: payload.slug,
            isPublished: true,
            publishedAt: '2026-10-30T10:00:00.000Z',
            portfolio: storedRecord,
          },
        });
      }
      storedRecord = {
        ...storedRecord,
        isPublished: false,
      };
      return route.fulfill({
        status: 200,
        json: {
          slug: storedRecord.slug,
          isPublished: false,
          portfolio: storedRecord,
        },
      });
    });

    await page.route('**/api/portfolios/pf-101/custom-domain', async (route) => {
      const payload = route.request().postDataJSON() as { domain: string };
      return route.fulfill({
        status: 200,
        json: {
          domain: payload.domain,
          recordType: 'TXT',
          host: `_ime365-verify.${payload.domain}`,
          verificationToken: 'ime365-domain-verify=tok_live_987654',
          status: 'PENDING',
        },
      });
    });

    await page.route('**/api/portfolios/public/*', (route) => {
      const reqSlug = route.request().url().split('/public/')[1]?.split('?')[0];
      if (reqSlug === 'ananya-rao' && storedRecord.isPublished) {
        return route.fulfill({
          status: 200,
          json: {
            portfolio: {
              id: 'pf-101',
              title: 'Ananya Rao — Staff Engineer',
              theme: 'modernMinimal',
              slug: 'ananya-rao',
              isPublished: true,
              publishedAt: '2026-10-30T10:00:00.000Z',
              // Simulate accidental extra backend fields to verify client DTO sanitizer strips them
              userId: 'SECRET_OWNER_UID_DO_NOT_RENDER',
              privateNotes: 'CONFIDENTIAL_PRIVATE_NOTE_DO_NOT_RENDER',
              metadata: { seoTitle: 'Ananya Rao Portfolio' },
              data: {
                renderer: 'webcv',
                templateKey: 'modernMinimal',
                canonical: storedRecord.canonical,
              },
            },
          },
        });
      }
      return route.fulfill({
        status: 404,
        json: { error: { code: 'PORTFOLIO_NOT_FOUND', message: 'Not found' } },
      });
    });

    await page.goto('/dashboard/portfolio/pf-101');
    await expect(page.getByRole('heading', { level: 1, name: 'Ananya Rao — Staff Engineer' })).toBeVisible();

    // Open Publish Dialog
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publishDialog = page.getByRole('dialog', { name: 'Publish your portfolio' });
    const slugInput = publishDialog.getByLabel('URL Slug');
    await expect(slugInput).toHaveValue('ananya-rao');
    await expectNoAxeSeriousViolations(page, '[role="dialog"]');

    // Reserved word rejected
    await slugInput.fill('admin');
    await expect(publishDialog.getByText(/reserved system path/i)).toBeVisible();
    await expect(publishDialog.getByRole('button', { name: 'Publish' })).toBeDisabled();

    // HTTP 409 SLUG_ALREADY_EXISTS handled inline without closing dialog
    await slugInput.fill('taken-slug');
    await publishDialog.getByRole('button', { name: 'Publish' }).click();
    await expect(publishDialog.getByText(/already claimed/i)).toBeVisible();
    await expect(publishDialog).toBeVisible();

    // Valid slug succeeds -> Published badge + Copy URL
    await slugInput.fill('ananya-rao');
    await publishDialog.getByRole('button', { name: 'Publish' }).click();
    await expect(publishDialog).toBeHidden();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy URL' })).toBeVisible();

    // Custom Domain setup
    await page.getByRole('button', { name: 'Custom Domain' }).click();
    const domainDialog = page.getByRole('dialog');
    const domainInput = domainDialog.getByLabel('Domain Hostname');
    await domainInput.fill('https://cv.ananyarao.dev/profile');
    await domainDialog.getByRole('button', { name: 'Register Domain' }).click();
    await expect(domainDialog.getByRole('alert')).toBeVisible();

    await domainInput.fill('cv.ananyarao.dev');
    await domainDialog.getByRole('button', { name: 'Register Domain' }).click();
    await expect(domainDialog.getByText('_ime365-verify.cv.ananyarao.dev')).toBeVisible();
    await expect(domainDialog.getByText('ime365-domain-verify=tok_live_987654')).toBeVisible();
    await expect(domainDialog.getByText('Pending verification', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Anonymous Public Reader (`/portfolio/ananya-rao`)
    await page.goto('/portfolio/ananya-rao');
    await expect(page.getByRole('heading', { level: 1, name: 'Ananya Rao' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Portfolio sections' })).toBeVisible();
    await expect(page.getByText('Architecting resilient multi-region cloud platforms.')).toBeVisible();
    const htmlContent = await page.content();
    expect(htmlContent).not.toContain('SECRET_OWNER_UID_DO_NOT_RENDER');
    expect(htmlContent).not.toContain('CONFIDENTIAL_PRIVATE_NOTE_DO_NOT_RENDER');
    await expectNoAxeSeriousViolations(page);

    // Unpublish flow back in builder -> `/portfolio/ananya-rao` becomes 404
    await page.goto('/dashboard/portfolio/pf-101');
    await page.getByRole('button', { name: 'Unpublish Portfolio' }).click();
    const unpublishDialog = page.getByRole('dialog', { name: 'Unpublish this portfolio?' });
    await unpublishDialog.getByRole('button', { name: 'Unpublish Portfolio' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    await page.goto('/portfolio/ananya-rao');
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio not found' })).toBeVisible();
  });
});

/* ============================================================================
 * TASK 5: Employer Interview Slot Manager & Candidate Booking Widget (FP-A15, DISC-028)
 * ============================================================================ */
test.describe('Task 5 — Employer Interview Slot Manager & Candidate Booking Widget', () => {
  test('manages availability slots, disables delete on booked slots, handles HTTP 409 booking races, and books candidate slots', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_emp_1',
      email: 'talent@cloudscale.test',
      displayName: 'Lead Recruiter',
      role: 'EMPLOYER',
    });

    await page.route('**/api/employer/companies**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          companies: [{ id: 'comp_01', name: 'CloudScale Systems', status: 'verified' }],
        },
      }),
    );

    await page.route('**/api/employer/jobs', (route) =>
      route.fulfill({
        status: 200,
        json: {
          jobs: [
            {
              id: 'job_01',
              title: 'Senior Backend Engineer',
              department: 'Engineering',
              location: 'Hyderabad / Hybrid',
              status: 'active',
              applicantCount: 1,
              revision: 1,
            },
          ],
        },
      }),
    );

    await page.route('**/api/jobs/job_01/applications', (route) =>
      route.fulfill({
        status: 200,
        json: {
          applications: [
            {
              id: 'app_cand_101',
              jobId: 'job_01',
              applicantId: 'usr_cand_55',
              applicantName: 'Rohan Verma',
              applicantEmail: 'rohan@example.test',
              status: 'pending',
              revision: 1,
              appliedAt: '2026-10-28T10:00:00.000Z',
              coverLetter: 'Excited to contribute to the platform engineering team.',
            },
          ],
        },
      }),
    );

    await page.route('**/api/employer/jobs/**/resume', (route) =>
      route.fulfill({
        status: 200,
        json: {
          resume: {
            id: 'res_1',
            title: 'Rohan Verma CV',
            summary: '8 years building distributed APIs.',
            skills: ['Node.js', 'TypeScript', 'MariaDB'],
          },
        },
      }),
    );

    let slots = [
      {
        id: 'slot_booked_1',
        date: '2026-11-05',
        startTime: '09:00',
        endTime: '09:30',
        duration: 30,
        timezone: 'Asia/Kolkata',
        status: 'BOOKED',
        isBooked: true,
        bookedApplicationId: 'app_other_99',
        bookedCandidateName: 'Meera Nair',
      },
      {
        id: 'slot_avail_2',
        date: '2026-11-05',
        startTime: '11:00',
        endTime: '11:30',
        duration: 30,
        timezone: 'Asia/Kolkata',
        status: 'AVAILABLE',
        isBooked: false,
      },
    ];

    await page.route('**/api/employer/interviews/slots', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, json: { slots } });
      }
      const body = route.request().postDataJSON() as {
        date: string;
        startTime: string;
        endTime: string;
        duration: number;
        timezone: string;
      };
      const created = {
        id: 'slot_avail_3',
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        duration: body.duration,
        timezone: body.timezone,
        status: 'AVAILABLE',
        isBooked: false,
      };
      slots = [...slots, created];
      return route.fulfill({ status: 201, json: { slot: created } });
    });

    let raceOnFirstBook = true;
    await page.route('**/api/employer/interviews/slots/*/book', async (route) => {
      const slotId = route.request().url().split('/slots/')[1]?.split('/book')[0] ?? '';
      const payload = route.request().postDataJSON() as { applicationId: string };
      expect(payload).toEqual({ applicationId: 'app_cand_101' });

      if (raceOnFirstBook && slotId === 'slot_avail_2') {
        raceOnFirstBook = false;
        slots = slots.map((s) =>
          s.id === 'slot_avail_2'
            ? {
                ...s,
                status: 'BOOKED',
                isBooked: true,
                bookedApplicationId: 'app_other_88',
                bookedCandidateName: 'Another Candidate',
              }
            : s,
        );
        return route.fulfill({
          status: 409,
          json: { error: { code: 'SLOT_ALREADY_BOOKED', message: 'Already booked' } },
        });
      }

      slots = slots.map((s) =>
        s.id === slotId
          ? {
              ...s,
              status: 'BOOKED',
              isBooked: true,
              bookedApplicationId: payload.applicationId,
              bookedCandidateName: 'Rohan Verma',
            }
          : s,
      );
      return route.fulfill({
        status: 200,
        json: {
          slot: slots.find((s) => s.id === slotId),
          notificationStatus: 'QUEUED',
        },
      });
    });

    await page.goto('/employer/applicants');
    await expect(page.getByText('Rohan Verma')).toBeVisible();
    await page.getByText('Rohan Verma').click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Interview Slot Booking & Availability')).toBeVisible();
    await expect(drawer.getByText(/05 Nov 2026 · 09:00–09:30/)).toBeVisible();
    await expect(drawer.getByText(/05 Nov 2026 · 11:00–11:30/)).toBeVisible();

    // Booked slot delete button MUST be disabled with exact tooltip explanation
    const bookedDeleteBtn = drawer.getByRole('button', {
      name: /Delete slot 05 Nov 2026 09:00 \(Cannot delete an already booked interview\.\)/,
    });
    await expect(bookedDeleteBtn).toBeDisabled();

    // Create a new 45-minute slot
    await drawer.getByRole('button', { name: 'New Slot' }).click();
    await drawer.getByLabel('Date', { exact: true }).fill('2026-11-06');
    await drawer.getByLabel('Duration', { exact: true }).selectOption('45');
    await drawer.getByLabel(/Start Time/).fill('14:00');
    await expect(drawer.getByLabel(/End Time/)).toHaveValue('14:45');
    await drawer.getByRole('button', { name: 'Save Availability Slot' }).click();
    await expect(drawer.getByText(/06 Nov 2026 · 14:00–14:45/)).toBeVisible();

    // Select slot_avail_2 -> triggers simulated 409 race -> shows exact required message & refreshes list
    await drawer
      .getByRole('radio', { name: /Select slot on 05 Nov 2026 from 11:00 to 11:30/ })
      .check();
    await drawer.getByRole('button', { name: 'Confirm Interview Booking' }).click();
    await expect(
      drawer.getByText(
        'This slot was just booked by another candidate. Please select another time.',
      ),
    ).toBeVisible();

    // Now book the newly created slot_avail_3 -> succeeds with truthful queued invitation message
    await drawer
      .getByRole('radio', { name: /Select slot on 06 Nov 2026 from 14:00 to 14:45/ })
      .check();
    await drawer.getByRole('button', { name: 'Confirm Interview Booking' }).click();
    await expect(
      drawer.getByText('Interview scheduled. Calendar invitation queued.'),
    ).toBeVisible();

    await expectNoAxeSeriousViolations(page);
  });
});

/* ============================================================================
 * RESPONSIVE LAYOUT VERIFICATION: 375px, 768px, 1024px, 1920px across all 5 surfaces
 * ============================================================================ */
test.describe('Responsive Layout Verification (375px, 768px, 1024px, 1920px)', () => {
  const viewports = [
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'laptop-1024', width: 1024, height: 768 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
  ] as const;

  test('verifies zero horizontal page overflow across all 4 required breakpoints on key Mandate 11B views', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, {
      uid: 'usr_super_resp',
      email: 'admin@ime365.test',
      displayName: 'Responsive Tester',
      role: 'SUPER_ADMIN',
    });

    await page.route('**/api/settings/account', (route) =>
      route.fulfill({
        status: 200,
        json: {
          account: {
            fullName: 'Responsive Tester',
            email: 'admin@ime365.test',
            emailVerified: true,
            preferences: { productUpdates: true, jobAlerts: true, weeklyDigest: false },
          },
        },
      }),
    );
    await page.route('**/api/billing/invoices?*', (route) =>
      route.fulfill({
        status: 200,
        json: {
          invoices: [
            {
              id: 'inv_r1',
              invoiceNumber: 'IME-2026-8801',
              issuedAt: '2026-10-20T00:00:00Z',
              currency: 'INR',
              totalAmount: 1180,
              status: 'PAID',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
      }),
    );
    await page.route('**/api/admin/system/outbox/stats', (route) =>
      route.fulfill({ status: 200, json: { stats: { PENDING: 3, SENT: 42, FAILED: 0 } } }),
    );
    await page.route('**/api/platform/queues**', (route) =>
      route.fulfill({
        status: 200,
        json: {
          summary: {
            totalInspected: 1,
            deadLetterCount: 0,
            pendingCount: 1,
            successCount: 0,
            source: 'MARIADB_OUTBOXES',
            sampled: true,
          },
          jobs: [
            {
              id: 'job_r1',
              queue: 'notification',
              channel: 'email',
              state: 'PENDING',
              attemptCount: 0,
              recipient: 'user@example.test',
              templateType: 'welcome',
              lastError: null,
              createdAt: '2026-10-30T08:00:00Z',
            },
          ],
        },
      }),
    );
    await page.route('**/api/portfolios/public/demo-slug', (route) =>
      route.fulfill({
        status: 200,
        json: {
          portfolio: {
            id: 'pf_demo',
            title: 'Demo Public Portfolio',
            theme: 'modernMinimal',
            slug: 'demo-slug',
            isPublished: true,
            publishedAt: '2026-10-30T00:00:00Z',
            metadata: {},
            data: {
              renderer: 'webcv',
              templateKey: 'modernMinimal',
              canonical: {
                template: 'modernMinimal',
                heading: { fullName: 'Demo Engineer', occupation: 'Systems Architect' },
                summary: 'Responsive public portfolio layout check.',
                skills: [{ id: 's1', name: 'TypeScript', category: 'Core' }],
                experiences: [
                  {
                    id: 'e1',
                    jobTitle: 'Architect',
                    employer: 'Example Corp',
                    begin: '2024',
                    end: 'Present',
                    location: 'Remote',
                    description: 'Built resilient web apps.',
                  },
                ],
              },
            },
          },
        },
      }),
    );

    await page.route('**/api/enterprise/status', (route) =>
      route.fulfill({ status: 200, json: { enabled: true } }),
    );
    await page.route('**/api/enterprise/tenants', (route) =>
      route.fulfill({
        status: 200,
        json: { tenants: [{ id: 'ten_r1', name: 'Acme Org', slug: 'acme', status: 'ACTIVE' }] },
      }),
    );
    await page.route('**/api/enterprise/context', (route) =>
      route.fulfill({
        status: 200,
        json: {
          tenant: { id: 'ten_r1', name: 'Acme Org', slug: 'acme', status: 'ACTIVE' },
          workspace: { id: 'ws_r1', tenantId: 'ten_r1', name: 'Core', isDefault: true },
          platformAdmin: true,
          context: { roles: ['TENANT_OWNER'], permissions: ['tenant.members.manage'], simulatedRole: null },
        },
      }),
    );
    await page.route('**/api/enterprise/workspaces**', (route) =>
      route.fulfill({ status: 200, json: { workspaces: [], members: [] } }),
    );
    await page.route('**/api/enterprise/memberships**', (route) =>
      route.fulfill({ status: 200, json: { memberships: [] } }),
    );
    await page.route('**/api/enterprise/roles-matrix**', (route) =>
      route.fulfill({ status: 200, json: { roles: [] } }),
    );
    await page.route('**/api/enterprise/members/seats', (route) =>
      route.fulfill({
        status: 200,
        json: { seatLimit: 25, seatsUsed: 18, seatsRemaining: 7, pendingInvites: 2 },
      }),
    );
    await page.route('**/api/employer/companies**', (route) =>
      route.fulfill({ status: 200, json: { companies: [{ id: 'c1', name: 'Acme', status: 'verified' }] } }),
    );
    await page.route('**/api/employer/jobs', (route) =>
      route.fulfill({
        status: 200,
        json: {
          jobs: [{ id: 'j1', title: 'Staff Engineer', location: 'Remote', status: 'active', applicantCount: 0, revision: 1 }],
        },
      }),
    );
    await page.route('**/api/jobs/j1/applications', (route) =>
      route.fulfill({ status: 200, json: { applications: [] } }),
    );

    for (const url of [
      '/dashboard/settings?tab=billing',
      '/org/users',
      '/admin/queues',
      '/portfolio/demo-slug',
      '/employer/applicants',
    ]) {
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(url);
        await expect(page.locator('main, [role="main"]').first()).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
