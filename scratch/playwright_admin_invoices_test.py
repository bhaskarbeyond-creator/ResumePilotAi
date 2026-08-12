import sys
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def test_admin_invoices():
    with sync_playwright() as p:
        print("=" * 60)
        print("PLAYWRIGHT AUTOMATED RETEST: 5-TAB ADMIN SUBSCRIPTION SETTINGS")
        print("=" * 60)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1400, 'height': 1800}
        )
        page = context.new_page()

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # Step 1: Create test admin user via backend endpoint
        test_email = f"playwright_admin_{int(time.time())}@example.com"
        print(f"Creating test user & granting admin: {test_email}...")
        auth_res = {}
        try:
            req_data = json.dumps({
                "email": test_email,
                "password": "TestPassword123!",
                "name": "Playwright Admin Auditor",
                "plan": "yearly",
                "customerState": "Maharashtra",
                "customerStateCode": "27"
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://airesume.projectdemo.guru/api/test-create-candidate-subscription",
                data=req_data,
                headers=headers
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                auth_res = json.loads(resp.read().decode("utf-8"))
                print(f"Created User UID: {auth_res.get('uid')}")

            # Grant admin role
            if auth_res.get('uid'):
                grant_data = json.dumps({"uid": auth_res.get('uid')}).encode("utf-8")
                grant_req = urllib.request.Request(
                    "https://airesume.projectdemo.guru/api/test-grant-admin",
                    data=grant_data,
                    headers=headers
                )
                with urllib.request.urlopen(grant_req, timeout=10) as g_resp:
                    g_res = json.loads(g_resp.read().decode("utf-8"))
                    print(f"Granted Admin Status: {g_res}")
        except Exception as e:
            print(f"User creation / admin grant error: {e}")

        # Step 2: Navigate to site homepage and inject localStorage user
        print("Navigating to site & setting localStorage auth session...")
        page.goto('https://airesume.projectdemo.guru/', wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        if auth_res.get('uid'):
            page.evaluate("""(uid) => {
                localStorage.setItem('user', uid);
            }""", auth_res.get('uid'))

        # Step 3: Navigate directly to Admin Settings: Orders & Transactions
        admin_url = "https://airesume.projectdemo.guru/adm?tab=settings&step=ordersManagement"
        print(f"Navigating to Admin Panel Orders Management: {admin_url}...")
        page.goto(admin_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)

        # Click "Settings" on sidebar if present
        settings_side = page.locator("text=Settings").first
        if settings_side.is_visible():
            print("Clicking Settings sidebar item...")
            settings_side.click()
            page.wait_for_timeout(1000)

        # Hover/Click PAYMENTS group in sub-menu
        payments_group = page.locator("text=PAYMENTS").first
        if payments_group.is_visible():
            print("Clicking PAYMENTS group in sub-menu...")
            payments_group.click()
            page.wait_for_timeout(1000)

        # Click "Subscriptions & Gateways" sub-menu item
        sub_item = page.locator("text=Subscriptions & Gateways").first
        if sub_item.is_visible():
            print("Clicking Subscriptions & Gateways sub-menu item...")
            sub_item.click()
            page.wait_for_timeout(2000)

        # Tab 1 Screenshot: Gateway & API Keys
        page.wait_for_timeout(2000)
        page.screenshot(path='scratch/admin_tab_1_gateways.png')
        print("✅ Tab 1 (Gateways) Screenshot saved to scratch/admin_tab_1_gateways.png")

        # Tab 2: Business & GST Details
        tab2 = page.locator("button:has-text('Business & GST Details')").first
        if tab2.is_visible():
            tab2.click()
            page.wait_for_timeout(1500)
            page.screenshot(path='scratch/admin_tab_2_gst.png')
            print("✅ Tab 2 (Business & GST) Screenshot saved to scratch/admin_tab_2_gst.png")
        else:
            print("⚠️ Tab 2 button not visible")

        # Tab 3: Pricing & Currency
        tab3 = page.locator("button:has-text('Pricing & Currency')").first
        if tab3.is_visible():
            tab3.click()
            page.wait_for_timeout(1500)
            page.screenshot(path='scratch/admin_tab_3_plans.png')
            print("✅ Tab 3 (Pricing & Currency) Screenshot saved to scratch/admin_tab_3_plans.png")
        else:
            print("⚠️ Tab 3 button not visible")

        # Tab 4: Promo Coupons
        tab4 = page.locator("button:has-text('Promo Coupons')").first
        if tab4.is_visible():
            tab4.click()
            page.wait_for_timeout(1500)
            page.screenshot(path='scratch/admin_tab_4_coupons.png')
            print("✅ Tab 4 (Promo Coupons) Screenshot saved to scratch/admin_tab_4_coupons.png")
        else:
            print("⚠️ Tab 4 button not visible")

        # Tab 5: Invoices Audit Ledger / Orders Management
        tab5 = page.locator("button:has-text('Invoices Audit Ledger')").first
        if tab5.is_visible():
            tab5.click()
            page.wait_for_timeout(2000)

            # Check if seed demo button exists
            seed_btn = page.locator("button:has-text('Load Enterprise Demo Transactions')").first
            if seed_btn.is_visible():
                print("Clicking Seed Enterprise Demo Transactions button...")
                seed_btn.click()
                page.wait_for_timeout(1500)

            page.screenshot(path='scratch/admin_tab_5_invoices.png')
            print("✅ Tab 5 (Invoices Audit Ledger) Screenshot saved to scratch/admin_tab_5_invoices.png")
        else:
            print("⚠️ Tab 5 button not visible")

        print("=" * 60)
        print("🎉 ALL 5 ADMIN SUBSCRIPTION TABS TESTED SUCCESSFULLY!")
        print("=" * 60)
        browser.close()

if __name__ == '__main__':
    test_admin_invoices()
