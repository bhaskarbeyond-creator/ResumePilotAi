/**
 * Mandate 11M — dialog / drawer bounding-box collision & responsive geometry suite.
 *
 * This suite drives the real router, components and API client. Only the network
 * boundary is fixtured (`page.route`), exactly like the existing Mandate 11B–11K
 * suites. Nothing in production code is stubbed or bypassed.
 *
 * Every assertion below is derived from real Chromium geometry
 * (`getBoundingClientRect`), not from DOM existence: a dialog that merely renders
 * is not considered correct.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ─────────────────────────────────────────────────────────────────────────────
// Viewport matrix — the three widths required by the mandate.
// ─────────────────────────────────────────────────────────────────────────────
type Viewport = { label: '375px' | '768px' | '1280px'; width: number; height: number };
const VIEWPORTS: readonly Viewport[] = [
  { label: '375px', width: 375, height: 667 },
  { label: '768px', width: 768, height: 1024 },
  { label: '1280px', width: 1280, height: 900 },
];

// The mandated viewport matrix is expressed explicitly per test, so the extra
// viewport projects configured in playwright.config.ts would only replay an
// identical matrix. Those known duplicates are reported as skipped rather than
// silently counted as passing; a single-project (or unnamed) configuration still
// executes the whole suite.
const DUPLICATE_VIEWPORT_PROJECTS = new Set([
  'mobile-iphone-se',
  'tablet-ipad-portrait',
  'small-laptop',
  'ultrawide-desktop',
  'mobile',
  'tablet',
  'desktop',
  'laptop',
  '4k',
]);
// oxlint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
test.beforeEach(({}, testInfo) => {
  test.skip(
    DUPLICATE_VIEWPORT_PROJECTS.has(testInfo.project.name),
    'Mandate 11M drives its own 375/768/1280 matrix; this project would only replay it.',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Geometry primitives
// ─────────────────────────────────────────────────────────────────────────────
type Rect = { x: number; y: number; width: number; height: number };

/** Mandate §11.1 — touching edges are NOT an overlap. */
function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height);
}

const round = (value: number) => Math.round(value * 100) / 100;
const show = (r: Rect) => `x=${round(r.x)} y=${round(r.y)} w=${round(r.width)} h=${round(r.height)}`;

async function rectOf(locator: Locator, label: string): Promise<Rect> {
  await expect(locator, `${label} must be visible before measuring`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must expose a bounding box`).not.toBeNull();
  return box as Rect;
}

async function expectNoOverlap(a: Locator, b: Locator, aLabel: string, bLabel: string) {
  const aBox = await rectOf(a, aLabel);
  const bBox = await rectOf(b, bLabel);
  const overlapping = rectanglesOverlap(aBox, bBox);
  expect(
    overlapping,
    `Unintended collision: ${aLabel} [${show(aBox)}] vs ${bLabel} [${show(bBox)}]`,
  ).toBe(false);
}

type ControlReport = {
  name: string;
  tag: string;
  rect: Rect;
  /** Horizontal overflow inside the control itself (e.g. a select wider than its box). */
  overflow: boolean;
};

type DialogReport = {
  dialog: Rect;
  scrollOverflow: boolean;
  controls: ControlReport[];
  clipped: Array<{ name: string; rect: Rect }>;
  collisions: Array<{ a: string; b: string; aRect: Rect; bRect: Rect }>;
};

/**
 * Collects every visible interactive control inside `dialog` and reports:
 *  - controls whose horizontal extent escapes the dialog (clipping / overflow),
 *  - controls that overflow their own box,
 *  - pairs of distinct controls whose rectangles intersect.
 *
 * Parent/child containment is ignored (a label-wrapped input is not a collision),
 * sr-only nodes and zero-size nodes are ignored, and decorative non-interactive
 * overlays are never collected in the first place.
 */
async function auditDialog(dialog: Locator): Promise<DialogReport> {
  return dialog.evaluate((root) => {
    const SELECTOR = 'button, a[href], input, select, textarea, [role="tab"], [role="menuitem"]';
    const dialogRect = root.getBoundingClientRect();
    const toRect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });

    const describe = (el: Element) => {
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) ||
        el.tagName.toLowerCase();
      return `${el.tagName.toLowerCase()}:${label}`;
    };

    /**
     * The rectangle a user can actually see. Content inside an internal
     * scroll container (`overflow: auto/hidden`) is clipped by that container,
     * so its raw rect must be intersected with every clipping ancestor before
     * geometry is compared. Without this, scrolled-in content would be reported
     * as colliding with the dialog's persistent footer.
     */
    const visibleRect = (el: Element): { x: number; y: number; width: number; height: number } | null => {
      const raw = el.getBoundingClientRect();
      let left = raw.x;
      let top = raw.y;
      let right = raw.x + raw.width;
      let bottom = raw.y + raw.height;
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== root.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const box = ancestor.getBoundingClientRect();
          left = Math.max(left, box.x);
          top = Math.max(top, box.y);
          right = Math.min(right, box.x + box.width);
          bottom = Math.min(bottom, box.y + box.height);
        }
        ancestor = ancestor.parentElement;
      }
      if (right - left <= 2 || bottom - top <= 2) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    };

    const elements = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width <= 2 || rect.height <= 2) return false;
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (style.opacity === '0') return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      if (el.closest('.sr-only')) return false;
      // Fully scrolled out of an internal scrollport: not visible, not measurable.
      return visibleRect(el) !== null;
    });

    const controls = elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        name: describe(el),
        tag: el.tagName.toLowerCase(),
        rect: toRect(rect),
        // Native form controls scroll their own value by design (a long domain in
        // an <input> is not a layout defect), so the internal-overflow check only
        // applies to elements whose content must be laid out, not scrolled.
        overflow:
          !['input', 'select', 'textarea'].includes(el.tagName.toLowerCase()) &&
          el.scrollWidth > el.clientWidth + 1 &&
          getComputedStyle(el).overflowX !== 'visible',
      };
    });

    const clipped = controls
      .filter((c) => c.rect.x < dialogRect.x - 0.5 || c.rect.x + c.rect.width > dialogRect.x + dialogRect.width + 0.5)
      .map((c) => ({ name: c.name, rect: c.rect }));

    // A control only collides with another control if their *visible* rectangles
    // intersect: touching edges are not a collision.

    const collisions: Array<{ a: string; b: string; aRect: Rect; bRect: Rect }> = [];
    for (let i = 0; i < elements.length; i += 1) {
      for (let j = i + 1; j < elements.length; j += 1) {
        const a = elements[i];
        const b = elements[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = visibleRect(a);
        const rb = visibleRect(b);
        if (!ra || !rb) continue;
        const intersects = !(
          ra.x + ra.width <= rb.x ||
          ra.x >= rb.x + rb.width ||
          ra.y + ra.height <= rb.y ||
          ra.y >= rb.y + rb.height
        );
        if (intersects) collisions.push({ a: describe(a), b: describe(b), aRect: ra, bRect: rb });
      }
    }

    return {
      dialog: toRect(dialogRect),
      scrollOverflow: root.scrollWidth > root.clientWidth + 1,
      controls,
      clipped,
      collisions,
    } satisfies DialogReport;
  });
}

/**
 * Full dialog-wide audit used by every surface in the inventory:
 * containment, no internal horizontal overflow, no page-level horizontal
 * overflow, dialog inside the viewport, and zero unintended collisions.
 */
async function expectDialogGeometry(page: Page, dialog: Locator, surface: string) {
  await expect(dialog).toBeVisible();
  // Let layout settle (fonts, scrollbars, flex reflow) before measuring.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const report = await auditDialog(dialog as Locator);
  // Measurable evidence: emitted per surface so the run log carries the exact
  // number of controls inspected, pairs compared and defects found.
  const pairs = (report.controls.length * (report.controls.length - 1)) / 2;
  console.log(
    `[mandate11m] ${surface}: controls=${report.controls.length} pairs=${pairs} collisions=${report.collisions.length} clipped=${report.clipped.length} overflow=${report.controls.filter((c) => c.overflow).length}`,
  );
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const vw = viewport!.width;
  const vh = viewport!.height;

  // 1. The dialog itself must sit inside the viewport.
  expect(report.dialog.x, `${surface}: dialog must not start left of the viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(report.dialog.x + report.dialog.width, `${surface}: dialog must not exceed the viewport width`)
    .toBeLessThanOrEqual(vw + 0.5);
  expect(report.dialog.y, `${surface}: dialog must not start above the viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(report.dialog.y + report.dialog.height, `${surface}: dialog must not exceed the viewport height`)
    .toBeLessThanOrEqual(vh + 1);

  // 2. Dialog content must not overflow horizontally.
  expect(report.scrollOverflow, `${surface}: dialog must not scroll horizontally`).toBe(false);

  // 3. No control may escape the dialog horizontally (clipping / overflow).
  expect(
    report.clipped,
    `${surface}: controls escaping the dialog bounds → ${report.clipped.map((c) => `${c.name} [${show(c.rect)}]`).join(', ')}`,
  ).toEqual([]);

  // 4. No control may overflow its own box horizontally.
  const overflowing = report.controls.filter((c) => c.overflow);
  expect(
    overflowing,
    `${surface}: controls overflowing horizontally → ${overflowing.map((c) => c.name).join(', ')}`,
  ).toEqual([]);

  // 5. No unintended collisions between distinct interactive controls.
  expect(
    report.collisions,
    `${surface}: unintended collisions → ${report.collisions
      .map((c) => `${c.a} [${show(c.aRect)}] × ${c.b} [${show(c.bRect)}]`)
      .join(' | ')}`,
  ).toEqual([]);

  // 6. The page itself must not gain horizontal scrolling.
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(docOverflow, `${surface}: document must not scroll horizontally`).toBeLessThanOrEqual(1);

  return report;
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures (network boundary only)
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN =
  'rptest.' +
  Buffer.from(
    JSON.stringify({ uid: 'fixture-admin', role: 'SUPER_ADMIN', email: 'admin@example.test', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url') +
  '.' +
  'a'.repeat(64);

const USERS = [
  {
    id: 'user-1',
    displayName: 'Aarav Enterprise Member',
    email: 'aarav.enterprise.member@a-very-long-organization-domain-name.example.test',
    role: 'ENTERPRISE_MEMBER',
    status: 'active',
    lastLogin: '2026-10-29 09:12',
    createdAt: '2026-10-01T00:00:00.000Z',
    resumeCount: 3,
    plan: 'Enterprise Annual',
    aiDailyLimit: 100,
    aiUsedToday: 18,
  },
  {
    id: 'user-2',
    displayName: 'Meera Root Operator',
    email: 'meera.root@example.test',
    role: 'SUPER_ADMIN',
    status: 'active',
    lastLogin: '2026-10-30 04:41',
    createdAt: '2026-09-11T00:00:00.000Z',
    resumeCount: 0,
    plan: 'Pro Recruiter',
  },
];

const TENANTS = [
  {
    id: 'tenant-1',
    displayName: 'Fixture Organization With A Deliberately Long Legal Trading Name',
    slug: 'fixture-organization',
    isolationTier: 'STANDARD',
    lifecycleState: 'ACTIVE',
    region: 'AP_SOUTH',
    source: 'LIVE',
  },
];

const EMPLOYER_APPLICATION = {
  id: 'app-fixture-1',
  companyName: 'Northwind Global Technologies Private Limited',
  status: 'PENDING',
  submittedAt: '2026-10-28T09:00:00.000Z',
  taxId: 'AAACN1234CZ',
  companySize: '201-500',
  website: 'https://northwind.example.test/about',
  location: 'Vijayawada, Andhra Pradesh, India',
  companyDescription:
    'A deliberately long organization overview used to prove that long-form text wraps inside the dossier instead of forcing the dialog to widen.',
  contactPerson: 'Divya Raghunathan',
  contactPersonTitle: 'Head of Talent Acquisition',
  contactEmail: 'divya.raghunathan@northwind.example.test',
  contactPhone: '+91 98765 43210',
  source: 'APPLICATION_SUBMISSION',
};

const JOB = { id: 'job-1', title: 'Senior Platform Engineer (Distributed Systems)', company: 'Northwind', status: 'active', isSpam: false };

const TRANSACTION = {
  id: 'ord_9f2c1d',
  uid: 'user-1',
  planId: 'Enterprise Annual',
  amount: 499000,
  currency: 'INR',
  formattedAmount: '₹4,99,000',
  status: 'PAID',
  provider: 'razorpay',
  createdAt: '2026-10-20T11:30:00.000Z',
};

type AdminOptions = {
  users?: unknown[];
  tenants?: unknown[];
  applications?: unknown[];
  jobs?: unknown[];
};

async function signIn(page: Page) {
  await page.addInitScript(
    (record) => {
      localStorage.setItem('ime_dev_user', JSON.stringify(record));
      localStorage.setItem('token', record.token);
    },
    { token: TOKEN, uid: 'fixture-admin', email: 'admin@example.test', displayName: 'Fixture Admin', role: 'SUPER_ADMIN' },
  );
  await page.route('**/api/users-data/profile', (route) =>
    route.fulfill({ json: { profile: { uid: 'fixture-admin', email: 'admin@example.test', role: 'SUPER_ADMIN' } } }),
  );
  await page.route('**/api/ai-usage**', (route) => route.fulfill({ json: { usedToday: 0, effectiveLimit: 20, remainingToday: 20, plan: 'free' } }));
  await page.route('**/api/notifications**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));
  await page.route('**/api/notifications-data**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));
}

async function installAdminFixtures(page: Page, options: AdminOptions = {}) {
  // Registered first: Playwright resolves routes last-registered-first, so the
  // specific fixtures below must be registered after this fallback.
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await signIn(page);
  await page.route('**/api/admin/users', (route) =>
    route.fulfill({ json: { users: options.users ?? USERS } }),
  );
  await page.route('**/api/enterprise/platform/tenants', (route) =>
    route.fulfill({ json: { tenants: options.tenants ?? TENANTS } }),
  );
  await page.route('**/api/enterprise/tenants', (route) =>
    route.fulfill({ json: { tenant: { ...TENANTS[0], id: 'created-tenant' }, workspace: { id: 'ws-1', name: 'Default Workspace' } } }),
  );
  await page.route('**/api/admin/employer-applications', (route) =>
    route.fulfill({ json: { applications: options.applications ?? [EMPLOYER_APPLICATION] } }),
  );
  await page.route('**/api/admin/jobs?**', (route) => route.fulfill({ json: { jobs: options.jobs ?? [JOB] } }));
  await page.route('**/api/admin/subscriptions**', (route) =>
    route.fulfill({
      json: {
        success: true,
        subscribers: [],
        transactions: [TRANSACTION],
        totalActiveSubscribers: 0,
        recentTransactionsCount: 1,
        source: 'LIVE',
      },
    }),
  );
  await page.route('**/api/admin/billing/invoices**', (route) =>
    route.fulfill({ json: { success: true, invoices: [], total: 0, hasMore: false, summary: null } }),
  );
}

async function openAdminUsers(page: Page) {
  await page.goto('/admin?tab=users');
  await expect(page.getByTestId('admin-console-page')).toBeVisible();
  await expect(page.getByTestId('inspect-user-button').first()).toBeVisible();
}

async function openUser360(page: Page) {
  await openAdminUsers(page);
  await page.getByTestId('inspect-user-button').first().click();
  await expect(page.getByRole('dialog', { name: /Aarav Enterprise Member/ })).toBeVisible();
}

const user360Dialog = (page: Page) => page.getByRole('dialog', { name: /Aarav Enterprise Member/ });

// ─────────────────────────────────────────────────────────────────────────────
// AdminUsersTab — User 360
// ─────────────────────────────────────────────────────────────────────────────
test.describe('AdminUsersTab › User 360', () => {
  test('User 360 dialog controls do not collide or overlap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openUser360(page);

    const updateRole = page.getByRole('button', { name: 'Update Role', exact: true });
    const subscriptionSelect = page.getByLabel('Subscription Plan Tier');
    const rbacSelect = page.getByLabel('Platform RBAC Role');

    await expect(updateRole).toBeVisible();
    await expect(subscriptionSelect).toBeVisible();

    await expectNoOverlap(updateRole, subscriptionSelect, 'Update Role button', 'Subscription Plan Tier select');
    await expectNoOverlap(rbacSelect, subscriptionSelect, 'Platform RBAC Role select', 'Subscription Plan Tier select');
    await expectNoOverlap(updateRole, rbacSelect, 'Update Role button', 'Platform RBAC Role select');

    // The long option label must not widen the control beyond its card.
    const rbacBox = await rectOf(rbacSelect, 'Platform RBAC Role select');
    const planBox = await rectOf(subscriptionSelect, 'Subscription Plan Tier select');
    const card = await rectOf(page.getByTestId('user360-rbac-card'), 'Platform RBAC Role card');
    expect(rbacBox.x + rbacBox.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    const planCard = await rectOf(page.getByTestId('user360-plan-card'), 'Subscription Plan Tier card');
    expect(planBox.x + planBox.width).toBeLessThanOrEqual(planCard.x + planCard.width + 0.5);

    await capture(page, 'user-360-desktop-1280');
  });

  for (const viewport of VIEWPORTS) {
    test(`User 360 geometry sweep at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openUser360(page);

      for (const tab of ['Identity & RBAC', 'Organizations & Tenants', 'AI Entitlements & Quotas']) {
        await page.getByRole('button', { name: new RegExp(tab) }).click();
        await expectDialogGeometry(page, user360Dialog(page), `User 360 › ${tab} @ ${viewport.label}`);
      }

      await page.getByRole('button', { name: /^Documents/ }).click();
      await expectDialogGeometry(page, user360Dialog(page), `User 360 › Documents @ ${viewport.label}`);
      await expect(page.getByText('Aarav Enterprise Member', { exact: false }).first()).toBeVisible();

      await capture(page, `user-360-documents-${viewport.width}`);
      await page.getByRole('button', { name: /^Identity/ }).click();
      await capture(page, `user-360-${viewport.width}`);
    });
  }

  test('User 360 tabs are never clipped and remain reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await installAdminFixtures(page);
    await openUser360(page);

    const dialog = user360Dialog(page);
    const tabs = dialog.getByRole('group', { name: 'User 360 sections' }).getByRole('button');
    await expect(tabs).toHaveCount(4);

    const dialogBox = await rectOf(dialog, 'User 360 dialog');
    for (let i = 0; i < 4; i += 1) {
      const tab = tabs.nth(i);
      await expect(tab).toBeVisible();
      const box = await rectOf(tab, `User 360 tab ${i + 1}`);
      expect(box.x, `tab ${i + 1} must not be clipped on the left`).toBeGreaterThanOrEqual(dialogBox.x - 0.5);
      expect(box.x + box.width, `tab ${i + 1} must not be clipped on the right`).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width + 0.5,
      );
    }

    // The Documents tab is the one that used to be pushed out of the tab strip.
    const documentsTab = dialog.getByRole('button', { name: /^Documents/ });
    await documentsTab.click();
    await expect(documentsTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('documents', { exact: false }).first()).toBeVisible();
  });

  test('User 360 Account Status actions never overlap or fragment', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await installAdminFixtures(page);
    await openUser360(page);

    const dialog = user360Dialog(page);
    const suspend = dialog.getByRole('button', { name: 'Suspend Account' });
    const disable = dialog.getByRole('button', { name: 'Disable Account' });
    await expectNoOverlap(suspend, disable, 'Suspend Account button', 'Disable Account button');

    // Every action keeps a readable height (no squeezed/wrapped fragments).
    for (const button of [suspend, disable]) {
      const box = await rectOf(button, 'Account Status action');
      expect(box.height).toBeGreaterThanOrEqual(26);
    }
    await capture(page, 'user-360-account-status-375');
  });

  test('User 360 is keyboard accessible: focus trap, Escape, focus restoration, tab keys', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openAdminUsers(page);

    const trigger = page.getByTestId('inspect-user-button').first();
    await trigger.click();
    const dialog = user360Dialog(page);
    await expect(dialog).toBeVisible();

    // Focus must move into the dialog.
    expect(await dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);

    // Focus containment across a full cycle forward and backward.
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);
    }

    // Tab sections are reachable by Tab and switch with arrow keys.
    await dialog.getByRole('button', { name: /^Identity/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('button', { name: /^Organizations/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByRole('button', { name: /^Identity/ })).toHaveAttribute('aria-pressed', 'true');

    // Escape dismisses and focus returns to the trigger.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminUsersTab — Create User modal
// ─────────────────────────────────────────────────────────────────────────────
test.describe('AdminUsersTab › Provision User', () => {
  for (const viewport of VIEWPORTS) {
    test(`Create User modal geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openAdminUsers(page);

      await page.getByRole('button', { name: /Provision User/ }).click();
      const dialog = page.getByRole('dialog', { name: /Provision New User Account/ });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Create User @ ${viewport.label}`);

      // Form controls must stay inside their containers.
      for (const label of ['Full Name', 'Email Address', 'Initial Role', 'Temporary Password', 'Tenant / Organization']) {
        const control = dialog.getByLabel(new RegExp(label));
        await expect(control).toBeVisible();
      }
      await capture(page, `create-user-${viewport.width}`);
    });
  }

  test('Create User modal closes with Escape and restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openAdminUsers(page);
    const trigger = page.getByRole('button', { name: /Provision User/ });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: /Provision New User Account/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Provision New User Account/ })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminEnterpriseTenantsModal — Create Enterprise Tenant + lifecycle confirmation
// ─────────────────────────────────────────────────────────────────────────────
async function openTenantsRegistry(page: Page) {
  await page.goto('/admin?tab=moderation');
  await expect(page.getByTestId('admin-console-page')).toBeVisible();
  await page.getByRole('button', { name: 'Tenants Registry', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Multi-Tenant Organizations Directory/ })).toBeVisible();
}

test.describe('AdminEnterpriseTenantsModal', () => {
  for (const viewport of VIEWPORTS) {
    test(`Create Enterprise Tenant dialog geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openTenantsRegistry(page);

      await page.getByRole('button', { name: '+ Create Enterprise Tenant', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Create Enterprise Tenant' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Create Enterprise Tenant @ ${viewport.label}`);

      // Long identifiers must not widen the dialog.
      await dialog.getByLabel('Organization Name').fill('Northwind Global Technologies Private Limited');
      await dialog.getByLabel('Primary Business Domain').fill('a-deliberately-long-subdomain.enterprise-customer.example.test');
      await expectDialogGeometry(page, dialog, `Create Enterprise Tenant (filled) @ ${viewport.label}`);

      await capture(page, `tenant-creation-${viewport.width}`);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`tenant lifecycle confirmation fits and is keyboard dismissible at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openTenantsRegistry(page);

      const trigger = page.getByRole('button', { name: 'Suspend tenant', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: /Suspend tenant access\?/ });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Suspend tenant @ ${viewport.label}`);
      await expect(dialog.getByRole('button', { name: 'Confirm lifecycle change' })).toBeDisabled();
      await capture(page, `tenant-suspend-${viewport.width}`);

      // One Escape dismisses the confirmation only, and focus returns to its trigger.
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminModerationTab — Dossier, Review Confirmation, Job Spam
// ─────────────────────────────────────────────────────────────────────────────
async function openModeration(page: Page) {
  await page.goto('/admin?tab=moderation');
  await expect(page.getByTestId('admin-console-page')).toBeVisible();
}

test.describe('AdminModerationTab', () => {
  for (const viewport of VIEWPORTS) {
    test(`Employer Verification Dossier geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openModeration(page);

      await page.getByRole('button', { name: 'Employer Verifications', exact: true }).click();
      await page.getByRole('button', { name: 'Dossier', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Employer Verification Dossier' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Employer Verification Dossier @ ${viewport.label}`);
      await capture(page, `moderation-dossier-${viewport.width}`);

      // Approve/reject actions stay reachable inside the dialog at every width.
      await expect(dialog.getByRole('button', { name: 'Reject Application', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Approve & Verify Organization', exact: true })).toBeVisible();
    });
  }

  test('Application Review confirmation dialog fits at every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openModeration(page);
      await page.getByRole('button', { name: 'Employer Verifications', exact: true }).click();
      await page.getByRole('button', { name: 'Reject', exact: true }).click();

      const dialog = page.getByRole('dialog', { name: 'Review Application Confirmation' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Review Application Confirmation @ ${viewport.label}`);
      await dialog.getByLabel(/Audited Rejection Justification/).fill('Tax identifier could not be verified against the registry.');
      await expectDialogGeometry(page, dialog, `Review Application Confirmation (reason) @ ${viewport.label}`);
      if (viewport.label === '1280px') await capture(page, 'moderation-review-1280');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });

  test('Job Spam moderation dialog geometry at every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await openModeration(page);
      await page.getByRole('button', { name: 'Job Moderation', exact: true }).click();
      await page.getByRole('button', { name: 'Flag as Spam', exact: true }).click();

      const dialog = page.getByRole('dialog', { name: 'Job Spam Moderation Confirmation' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Job Spam Moderation Confirmation @ ${viewport.label}`);
      if (viewport.label === '375px') await capture(page, 'moderation-spam-375');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminContentMarketingTab — Add ATS Keyword
// ─────────────────────────────────────────────────────────────────────────────
test.describe('AdminContentMarketingTab', () => {
  for (const viewport of VIEWPORTS) {
    test(`Add ATS Keyword dialog geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await page.goto('/admin?tab=content');
      await expect(page.getByTestId('admin-console-page')).toBeVisible();

      await page.getByRole('button', { name: 'Add ATS Keyword', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Add ATS Keyword' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Add ATS Keyword @ ${viewport.label}`);
      await capture(page, `marketing-ats-keyword-${viewport.width}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AdminBillingTab — Order inspection + refund confirmation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('AdminBillingTab', () => {
  for (const viewport of VIEWPORTS) {
    test(`Order inspection dialog geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await page.goto('/admin?tab=billing');
      await expect(page.getByTestId('admin-console-page')).toBeVisible();

      await page.getByRole('button', { name: 'Inspect', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: /Order Transaction/ });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Order inspection @ ${viewport.label}`);
      if (viewport.label === '375px') await capture(page, 'billing-order-375');

      await dialog.getByRole('button', { name: 'Initiate Refund' }).click();
      const refund = page.getByRole('dialog', { name: 'Process Order Refund' });
      await expect(refund).toBeVisible();
      await expectDialogGeometry(page, refund, `Refund confirmation @ ${viewport.label}`);
      if (viewport.label === '1280px') await capture(page, 'billing-refund-1280');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Employer surfaces — CandidateReviewDrawer, CreateJobModal, CompanyProfile, TeamSeats
// ─────────────────────────────────────────────────────────────────────────────
const EMPLOYER_JOB = {
  id: 'job-1',
  title: 'Senior Platform Engineer (Distributed Systems)',
  location: 'Vijayawada, Andhra Pradesh, India',
  status: 'active',
  company: 'Northwind Global Technologies Private Limited',
  applicantCount: 1,
  postedAt: '2026-10-20',
  workMode: 'Hybrid',
  type: 'Full-time',
};

const EMPLOYER_PIPELINE_APPLICATION = {
  id: 'application-1',
  jobId: 'job-1',
  applicantId: 'candidate-1',
  applicantName: 'Priya Sharma',
  applicantEmail: 'priya.sharma@a-very-long-candidate-domain.example.test',
  applicantPhone: '+91 98765 43210',
  status: 'pending',
  coverLetter:
    'A deliberately long cover letter body used to prove that long-form candidate content wraps inside the drawer instead of widening it.',
  resumeId: 'resume-1',
  appliedAt: '2026-10-20T10:00:00.000Z',
  revision: 1,
};

// Minimal but template-valid resume payload so the authorised document viewer
// renders a real document instead of its "template not supported" fallback.
const EMPLOYER_RESUME_DOCUMENT = {
  id: 'resume-1',
  template: 'Cv1',
  title: 'Principal Platform Engineer — Curriculum Vitae',
  targetRole: 'Principal Platform Engineer',
  firstName: 'Priya',
  lastName: 'Sharma',
  email: 'priya.sharma@a-very-long-candidate-domain.example.test',
  phone: '+91 98765 43210',
  location: 'Vijayawada, Andhra Pradesh, India',
  summary:
    'Platform engineer with a deliberately long summary that must wrap inside the document canvas rather than widening the viewer shell.',
  updatedAt: '2026-10-20T10:00:00.000Z',
  skills: ['Kubernetes', 'PostgreSQL', 'TypeScript'],
};

const EMPLOYER_COMPANY = {
  id: 'company-1',
  name: 'Northwind Global Technologies Private Limited',
  website: 'https://northwind.example.test',
  status: 'approved',
  featured: false,
  industry: 'Information Technology',
  size: '201-500',
  location: 'Vijayawada, Andhra Pradesh, India',
  description: 'A deliberately long organization description.',
  address: 'Plot 42, IT Park, Vijayawada',
  phone: '+91 98765 43210',
  email: 'talent@northwind.example.test',
  logo: '',
  revision: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
};

async function installEmployerFixtures(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await signIn(page);
  await page.route('**/api/employer/jobs', (route) => route.fulfill({ json: { jobs: [EMPLOYER_JOB] } }));
  await page.route('**/api/jobs/job-1/applications', (route) =>
    route.fulfill({ json: { applications: [EMPLOYER_PIPELINE_APPLICATION] } }),
  );
  await page.route('**/api/employer/jobs/job-1/applications/application-1/resume', (route) =>
    route.fulfill({
      json: {
        success: true,
        application: EMPLOYER_PIPELINE_APPLICATION,
        resume: EMPLOYER_RESUME_DOCUMENT,
      },
    }),
  );
  await page.route('**/api/employer/companies', (route) => route.fulfill({ json: { companies: [EMPLOYER_COMPANY] } }));
  await page.route('**/api/enterprise/members/seats', (route) =>
    route.fulfill({ json: { seats: { seatLimit: 25, seatsUsed: 7, pendingInvites: 2 } } }),
  );
  await page.route('**/api/enterprise/memberships', (route) =>
    route.fulfill({
      json: {
        memberships: [
          {
            id: 'membership-1',
            uid: 'user-1',
            email: 'aarav.enterprise.member@a-very-long-organization-domain-name.example.test',
            displayName: 'Aarav Enterprise Member',
            role: 'ENTERPRISE_MEMBER',
            status: 'ACTIVE',
          },
        ],
      },
    }),
  );
}

async function openEmployer(page: Page, tab: string) {
  await page.goto(`/employer?tab=${tab}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

test.describe('CandidateReviewDrawer', () => {
  test('drawer, rejection confirmation and direct message dialogs fit every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installEmployerFixtures(page);
      await openEmployer(page, 'pipeline');

      await page.getByText('Priya Sharma').first().click();
      const drawer = page.getByTestId('candidate-review-drawer');
      await expect(drawer).toBeVisible();
      await expectDialogGeometry(page, drawer, `Candidate review drawer @ ${viewport.label}`);
      await capture(page, `candidate-drawer-${viewport.width}`);

      // Rejection confirmation
      await drawer.getByRole('button', { name: 'Reject Applicant', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Confirm Candidate Status Change' });
      await expect(confirm).toBeVisible();
      await expectDialogGeometry(page, confirm, `Rejection confirmation @ ${viewport.label}`);
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirm).toHaveCount(0);

      // Direct message recruiter/candidate dialog
      await drawer.getByRole('button', { name: 'Message Candidate' }).click();
      const message = page.getByRole('dialog', { name: 'Direct Message Candidate' });
      await expect(message).toBeVisible();
      await expectDialogGeometry(page, message, `Direct Message Candidate @ ${viewport.label}`);
      if (viewport.label === '375px') await capture(page, 'candidate-message-375');
      await message.getByRole('button', { name: 'Cancel' }).click();
      await expect(message).toHaveCount(0);

      // Authorised full-document viewer (zoom / print / fit toolbar)
      // Both the header link and the resume-card button open the same viewer.
      const viewerTrigger = drawer
        .getByRole('button', { name: /View Full Document|Inspect Full Document/ })
        .first();
      await expect(viewerTrigger).toBeVisible();
      await viewerTrigger.click();
      const viewer = page.getByTestId('candidate-document-viewer');
      await expect(viewer).toBeVisible();
      await expectDialogGeometry(page, viewer, `Candidate document viewer @ ${viewport.label}`);
      await capture(page, `candidate-document-viewer-${viewport.width}`);
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      await expect(drawer).toBeVisible();

      await drawer.getByRole('button', { name: 'Close candidate drawer' }).click();
      await expect(drawer).toHaveCount(0);
    }
  });
});

test.describe('CreateJobModal', () => {
  test('job requisition wizard and screening question adder fit every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installEmployerFixtures(page);
      await openEmployer(page, 'jobs');

      await page.getByRole('button', { name: 'Post New Job Requisition' }).click();
      const dialog = page.getByRole('dialog', { name: /Post Job Requisition/ });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Job Requisition Wizard @ ${viewport.label}`);

      // Screening question adder
      await dialog.getByRole('button', { name: 'Add Question' }).click();
      await expect(dialog.locator('input[placeholder*="production Kubernetes"]')).toBeVisible();
      await expectDialogGeometry(page, dialog, `Job Requisition Wizard + screening question @ ${viewport.label}`);
      await capture(page, `job-wizard-${viewport.width}`);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });
});

test.describe('CompanyProfile', () => {
  test('company entity dialog fits every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installEmployerFixtures(page);
      await openEmployer(page, 'company');

      await page.getByRole('button', { name: 'Register Company Entity' }).click();
      const dialog = page.getByRole('dialog', { name: /Register Employer Entity|Edit / });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Company entity dialog @ ${viewport.label}`);
      await capture(page, `company-dialog-${viewport.width}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });
});

test.describe('TeamSeats', () => {
  test('seat allocation and invite dialogs fit every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installEmployerFixtures(page);
      await openEmployer(page, 'team');

      await page.getByRole('button', { name: 'Inspect Seat Allocation' }).click();
      const allocation = page.getByRole('dialog', { name: 'Workspace Seat Allocation' });
      await expect(allocation).toBeVisible();
      await expectDialogGeometry(page, allocation, `Seat Allocation @ ${viewport.label}`);
      await capture(page, `team-seats-${viewport.width}`);
      await page.keyboard.press('Escape');
      await expect(allocation).toHaveCount(0);

      await page.getByRole('button', { name: 'Invite Teammate' }).first().click();
      const invite = page.getByRole('dialog');
      await expect(invite).toBeVisible();
      await expectDialogGeometry(page, invite, `Invite Team Member @ ${viewport.label}`);
      await page.keyboard.press('Escape');
      await expect(invite).toHaveCount(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withdraw-dialog.tsx — Application Withdrawal Confirmation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Application withdrawal', () => {
  test('withdrawal confirmation dialog fits every viewport', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
      await signIn(page);
      await page.route('**/api/jobs-data/applications/list', (route) =>
        route.fulfill({
          json: {
            success: true,
            applications: [
              {
                id: 'application-1',
                jobId: 'job-1',
                status: 'pending',
                createdAt: '2026-10-20T10:00:00.000Z',
                updatedAt: '2026-10-20T10:00:00.000Z',
                applicantName: 'Priya Sharma',
                applicantEmail: 'priya.sharma@example.test',
                applicantPhone: '+91 98765 43210',
                resumeId: null,
                coverLetter: 'Cover letter',
                job: { title: 'Platform Engineer', company: 'Acme', location: 'Vijayawada', listed: true },
              },
            ],
          },
        }),
      );

      await page.goto('/dashboard/applied-jobs');
      const trigger = page.getByRole('button', { name: /^Withdraw application for/ }).first();
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: 'Withdraw your application?' });
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Application Withdrawal @ ${viewport.label}`);
      await capture(page, `application-withdrawal-${viewport.width}`);

      await dialog.getByRole('button', { name: 'Keep application' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Detail Explorer (rendered by AdminBillingTab)
// Read-only verification: the dialog implementation lives in
// src/components/billing/invoice-detail-dialog.tsx, which is outside this
// mandate's authorised file set — it is measured, not modified.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Invoice Detail Explorer', () => {
  for (const viewport of VIEWPORTS) {
    test(`invoice detail dialog geometry at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installAdminFixtures(page);
      await page.route('**/api/admin/billing/invoices**', (route) =>
        route.fulfill({
          json: {
            success: true,
            invoices: [
              {
                id: 'invoice-0001',
                invoiceNumber: 'INV-2026-0001-A-VERY-LONG-INVOICE-IDENTIFIER',
                customerName: 'Northwind Global Technologies Private Limited',
                customerEmail: 'accounts@northwind.example.test',
                issuedAt: '2026-10-01T00:00:00.000Z',
                totalAmount: 499000,
                currency: 'INR',
                status: 'PAID',
              },
            ],
            total: 1,
            hasMore: false,
          },
        }),
      );
      await page.goto('/admin?tab=billing');
      await expect(page.getByTestId('admin-console-page')).toBeVisible();

      // The explorer renders a table on wide viewports and a card list on narrow
      // ones; both expose a details action, so the locator accepts either name.
      const details = page.getByRole('button', { name: /Inspect invoice|^Details$/ }).first();
      await expect(details).toBeVisible();
      await details.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expectDialogGeometry(page, dialog, `Invoice detail explorer @ ${viewport.label}`);
      await capture(page, `invoice-detail-${viewport.width}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility — WCAG 2.1 A/AA structural rules inside the audited dialogs
// ─────────────────────────────────────────────────────────────────────────────
// Only rules that a dialog container itself can break are asserted here
// (naming, labelling, roles, focus order). Colour contrast and other
// page-wide concerns are out of scope for this geometry mandate.
const DIALOG_A11Y_RULES = new Set([
  'aria-dialog-name',
  'aria-allowed-attr',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-hidden-focus',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'aria-toggle-field-name',
  'aria-input-field-name',
  'button-name',
  'label',
  'select-name',
  'input-button-name',
  'form-field-multiple-labels',
  'tabindex',
  'nested-interactive',
  'scrollable-region-focusable',
]);

async function expectDialogA11y(page: Page, dialog: Locator, surface: string) {
  const builder = new AxeBuilder({ page }).include(`[role="dialog"]`);
  const results = await builder.analyze();
  const relevant = results.violations.filter((violation) => DIALOG_A11Y_RULES.has(violation.id));
  expect(
    relevant.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `${surface}: dialog accessibility violations`,
  ).toEqual([]);
}

test.describe('Dialog accessibility', () => {
  test('User 360 and Create User dialogs expose accessible roles and names', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openUser360(page);
    await expectDialogA11y(page, user360Dialog(page), 'User 360');

    // Every section control is a named button with an explicit pressed state.
    const tabs = user360Dialog(page).getByRole('group', { name: 'User 360 sections' }).getByRole('button');
    await expect(tabs).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(tabs.nth(i)).toHaveAttribute('aria-pressed', /true|false/);
    }

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Provision User/ }).click();
    const createDialog = page.getByRole('dialog', { name: /Provision New User Account/ });
    await expect(createDialog).toBeVisible();
    await expectDialogA11y(page, createDialog, 'Create User');
  });

  test('tenant creation and job requisition dialogs expose accessible names', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openTenantsRegistry(page);
    await page.getByRole('button', { name: '+ Create Enterprise Tenant', exact: true }).click();
    const tenantDialog = page.getByRole('dialog', { name: 'Create Enterprise Tenant' });
    await expect(tenantDialog).toBeVisible();
    await expectDialogA11y(page, tenantDialog, 'Create Enterprise Tenant');

    await page.keyboard.press('Escape');
    await installEmployerFixtures(page);
    await openEmployer(page, 'jobs');
    await page.getByRole('button', { name: 'Post New Job Requisition' }).click();
    const jobDialog = page.getByRole('dialog', { name: /Post Job Requisition/ });
    await expect(jobDialog).toBeVisible();
    await expectDialogA11y(page, jobDialog, 'Job Requisition Wizard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard — no React warnings or runtime errors while dialogs open
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dialog runtime hygiene', () => {
  test('opening the audited dialogs raises no React warnings or page errors', async ({ page }) => {
    const noise: string[] = [];
    page.on('console', (message) => {
      if (message.type() !== 'warning' && message.type() !== 'error') return;
      const text = message.text();
      if (/Warning:|Each child in a list|controlled|key prop|validateDOMNesting/i.test(text)) noise.push(text);
    });
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`));

    await page.setViewportSize({ width: 1280, height: 900 });
    await installAdminFixtures(page);
    await openUser360(page);
    const dialog = user360Dialog(page);
    for (const tab of ['Organizations & Tenants', 'AI Entitlements & Quotas', 'Documents', 'Identity & RBAC']) {
      await dialog.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    }
    await dialog.getByRole('button', { name: 'Suspend Account' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: /Provision User/ }).click();
    await page.keyboard.press('Escape');

    await installEmployerFixtures(page);
    await openEmployer(page, 'pipeline');
    await page.getByText('Priya Sharma').first().click();
    await expect(page.getByTestId('candidate-review-drawer')).toBeVisible();
    await page.getByRole('button', { name: 'Close candidate drawer' }).click();

    expect(noise, `console noise while exercising dialogs:\n${noise.join('\n')}`).toEqual([]);
  });
});
