import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def run():
    print("Launching Playwright Chromium for Billing History Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_logs = []
        page_errors = []
        dialog_messages = []
        popup_pages = []

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("dialog", lambda dialog: (dialog_messages.append(dialog.message), dialog.accept()))
        context.on("page", lambda p: popup_pages.append(p))

        print("Navigating to https://airesume.projectdemo.guru/dashboard/plans...")
        page.goto("https://airesume.projectdemo.guru/dashboard/plans", wait_until="domcontentloaded", timeout=60000)
        time.sleep(4)

        page.screenshot(path="scratch/billing_tab1.png")
        print("Tab 1 Screenshot saved to scratch/billing_tab1.png")

        # Click Billing History tab
        print("Clicking 'Billing History & PDF Invoices' tab...")
        invoices_tab = page.query_selector("button:has-text('Billing History')")
        if invoices_tab:
            invoices_tab.click()
            time.sleep(2)
            page.screenshot(path="scratch/billing_tab_invoices.png")
            print("Tab Invoices Screenshot saved to scratch/billing_tab_invoices.png")

            # Look for Download PDF buttons
            download_btns = page.query_selector_all("button:has-text('Download PDF')")
            print(f"Found {len(download_btns)} 'Download PDF' button(s)")

            if len(download_btns) > 0:
                print("Clicking first 'Download PDF' button...")
                download_btns[0].click()
                time.sleep(3)
                print(f"Popup pages detected: {len(popup_pages)}")
                if len(popup_pages) > 0:
                    popup = popup_pages[0]
                    print(f"Popup Title: {popup.title()}")
                    popup.screenshot(path="scratch/invoice_pdf_popup.png")
                    print("Popup Screenshot saved to scratch/invoice_pdf_popup.png")
            else:
                print("No transactions found yet in Billing History table.")
        else:
            print("Billing History tab button not found on page.")

        print("\n--- Dialog / Alert Messages ---")
        for d in dialog_messages:
            print("ALERT:", d)

        print("\n--- Console Logs ---")
        for log in console_logs:
            if "error" in log.lower() or "warn" in log.lower():
                print(log)

        print("\n--- Page Errors ---")
        for err in page_errors:
            print(err)

        browser.close()

if __name__ == "__main__":
    run()
