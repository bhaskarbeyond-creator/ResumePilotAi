import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def run():
    print("Launching Playwright Chromium for Logged-In PDF Download Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_logs = []
        page_errors = []
        dialog_messages = []
        popups = []

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("dialog", lambda dialog: (dialog_messages.append(dialog.message), dialog.accept()))
        context.on("page", lambda p: popups.append(p))

        print("Navigating to https://airesume.projectdemo.guru/...")
        page.goto("https://airesume.projectdemo.guru/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)

        # Inject sample test user & sample transaction into browser localStorage/state to simulate logged-in user with invoice
        print("Injecting test user session and navigating to /dashboard/plans...")
        page.evaluate("""
            () => {
                localStorage.setItem('user', JSON.stringify({
                    uid: 'test_candidate_123',
                    email: 'testcandidate@example.com',
                    displayName: 'John Tester'
                }));
            }
        """)

        page.goto("https://airesume.projectdemo.guru/dashboard/plans", wait_until="domcontentloaded", timeout=60000)
        time.sleep(4)

        print(f"Page Title: {page.title()}")
        print(f"Page URL: {page.url}")

        page.screenshot(path="scratch/logged_in_plans.png")

        # Click 'Billing History & PDF Invoices' tab
        invoices_tab = page.query_selector("button:has-text('Billing History')")
        if invoices_tab:
            print("Found 'Billing History' tab button. Clicking...")
            invoices_tab.click()
            time.sleep(3)
            page.screenshot(path="scratch/logged_in_invoices_tab.png")

            # Check table contents
            rows = page.query_selector_all("tbody tr")
            print(f"Found {len(rows)} transaction row(s) in table.")

            # Click Download PDF button if present
            pdf_btns = page.query_selector_all("button:has-text('Download PDF')")
            print(f"Found {len(pdf_btns)} 'Download PDF' button(s).")
            if len(pdf_btns) > 0:
                print("Clicking first 'Download PDF' button...")
                pdf_btns[0].click()
                time.sleep(3)

                print(f"Popups opened: {len(popups)}")
                for idx, pop in enumerate(popups):
                    print(f"Popup #{idx+1} URL: {pop.url}, Title: {pop.title()}")
                    pop.screenshot(path=f"scratch/popup_{idx+1}.png")
        else:
            print("Billing History tab button not found on page.")

        print("\n--- Console Logs (Errors/Warnings) ---")
        for log in console_logs:
            if "error" in log.lower() or "warn" in log.lower():
                print(log)

        print("\n--- Page Errors ---")
        for err in page_errors:
            print(err)

        browser.close()

if __name__ == "__main__":
    run()
