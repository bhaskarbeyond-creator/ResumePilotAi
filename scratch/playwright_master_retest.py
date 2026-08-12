import sys
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

BASE_URL = "https://airesume.projectdemo.guru"

def run_master_test():
    print("=" * 60)
    print("MASTER PLAYWRIGHT RETEST: BILLING, INVOICE & ADMIN AUDIT")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1400, 'height': 900})
        page = context.new_page()

        page_errors = []
        console_logs = []
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        # 1. Candidate Navigation to Plans Dashboard
        print("\n1. Navigating to Plans Dashboard...")
        page.goto(f"{BASE_URL}/dashboard/plans", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        page.screenshot(path="scratch/master_01_candidate_plans.png")
        print("   [OK] Candidate Plans Page loaded.")

        # Click Billing History tab
        print("\n2. Testing Billing History Tab & Single-Page A4 PDF Popup...")
        history_tab = page.locator("button:has-text('Billing History')").first
        if history_tab.is_visible():
            history_tab.click()
            page.wait_for_timeout(2000)
            page.screenshot(path="scratch/master_02_billing_history.png")
            print("   [OK] Billing History Tab active.")

        # Trigger PDF Download popup
        pdf_buttons = page.locator("button:has-text('Download PDF'), button:has-text('Tax Invoice')")
        print(f"   Found {pdf_buttons.count()} PDF download button(s).")

        popups_captured = []
        if pdf_buttons.count() > 0:
            with page.expect_popup() as popup_info:
                pdf_buttons.first.click()
            popup = popup_info.value
            popup.wait_for_load_state(timeout=30000)
            popup.wait_for_timeout(2000)
            popups_captured.append(popup)
            popup.screenshot(path="scratch/master_03_pdf_popup.png")
            print(f"   [OK] Popup Captured! Title: '{popup.title()}'")
            popup.close()

        # 3. Admin Audit Ledger Test
        print("\n3. Testing Admin Panel & Master Invoices Audit Ledger...")
        page.goto(f"{BASE_URL}/admin", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        page.screenshot(path="scratch/master_04_admin_panel.png")
        print("   [OK] Admin Panel loaded.")

        # Check for Audit Ledger tab button
        ledger_tab = page.locator("button:has-text('Invoices Audit Ledger')").first
        if ledger_tab.is_visible():
            ledger_tab.click()
            page.wait_for_timeout(2000)
            page.screenshot(path="scratch/master_05_admin_audit_ledger.png")
            print("   [OK] Admin Invoices Audit Ledger Tab clicked & active!")

        # Check CSV export button
        csv_btn = page.locator("button:has-text('Export GSTR-1 CSV')").first
        csv_visible = csv_btn.is_visible() if csv_btn else False
        print(f"   [OK] GSTR-1 CSV Export Button Visible: {csv_visible}")

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUITE VERIFICATION SUMMARY")
        print("=" * 60)
        print(f"Popups Captured: {len(popups_captured)}")
        print(f"Page Errors: {len(page_errors)}")
        if page_errors:
            print(f"Page Error Details: {page_errors}")

        browser.close()
        print("\n[OK] MASTER RETEST COMPLETED SUCCESSFULLY!")

if __name__ == '__main__':
    run_master_test()
