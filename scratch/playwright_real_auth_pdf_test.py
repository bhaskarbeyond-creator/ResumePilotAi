import sys
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

def test_real_auth_pdf():
    with sync_playwright() as p:
        print("Launching Playwright Chromium with Email/Password Auth...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1400, 'height': 900}
        )
        page = context.new_page()

        console_logs = []
        page_errors = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        email = f"test_candidate_{int(time.time())}@example.com"
        print(f"Creating & signing in test user: {email}...")

        auth_res = {}
        try:
            req_data = json.dumps({
                "email": email,
                "password": "TestPassword123!",
                "name": "Playwright Test Candidate",
                "plan": "yearly",
                "customerState": "Maharashtra",
                "customerStateCode": "27"
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://airesume.projectdemo.guru/api/test-create-candidate-subscription",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                auth_res = json.loads(resp.read().decode("utf-8"))
                print(f"Auth success: {auth_res}")
        except Exception as e:
            print(f"Auth failed: {e}")

        # Navigate to site and inject localStorage
        print("Navigating to https://airesume.projectdemo.guru/...")
        page.goto('https://airesume.projectdemo.guru/', wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        if auth_res.get('uid'):
            page.evaluate("""(data) => {
                localStorage.setItem('user', JSON.stringify({
                    uid: data.uid,
                    email: data.email,
                    displayName: 'Playwright Test Candidate',
                    emailVerified: true
                }));
                localStorage.setItem('userEmail', data.email);
            }""", auth_res)

        # Navigate to plans
        page.goto('https://airesume.projectdemo.guru/dashboard/plans', wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        # 2. Click Billing History tab
        print("Clicking 'Billing History' tab...")
        tab = page.locator("button:has-text('Billing History')").first
        if tab.is_visible():
            tab.click()
            page.wait_for_timeout(2000)
            page.screenshot(path='scratch/real_user_billing_history.png')
            print("Billing History screenshot saved to scratch/real_user_billing_history.png")

            # Check rows
            rows = page.locator("tr:has-text('TXN_')")
            print(f"Found {rows.count()} transaction row(s) in Billing History table.")

            # Click Download PDF
            pdf_btns = page.locator("button:has-text('Download PDF'), button:has-text('Tax Invoice')")
            print(f"Found {pdf_btns.count()} 'Download PDF' button(s).")

            popups = []
            if pdf_btns.count() > 0:
                print("Clicking 'Download PDF' button...")
                with page.expect_popup() as popup_info:
                    pdf_btns.first.click()
                popup = popup_info.value
                popup.wait_for_load_state()
                popup.wait_for_timeout(2000)
                popups.append(popup)
                print(f"Popups captured: {len(popups)}")
                print(f"Popup #1 Title: {popup.title()}")
                popup.screenshot(path='scratch/real_pdf_popup_1.png')
                print("Popup screenshot saved to scratch/real_pdf_popup_1.png")
        else:
            print("Billing History tab button not found.")

        print("\n--- Console Logs (Errors/Warnings) ---")
        for log in console_logs:
            if "error" in log.lower() or "warning" in log.lower():
                print(log)

        print("\n--- Page Errors ---")
        for err in page_errors:
            print(err)

        browser.close()

if __name__ == '__main__':
    test_real_auth_pdf()
