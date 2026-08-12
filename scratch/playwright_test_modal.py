import sys
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def test_admin_modals():
    with sync_playwright() as p:
        print("=" * 60)
        print("PLAYWRIGHT AUTOMATED TEST: IN-APP MODAL RENDERING")
        print("=" * 60)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1400, 'height': 900}
        )
        page = context.new_page()

        print("Navigating to Admin Orders Management...")
        page.goto("https://airesume.projectdemo.guru/adm?tab=settings&step=ordersManagement", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        # Trigger PDF modal on React component
        print("Triggering In-App PDF Tax Invoice Modal...")
        page.evaluate("""() => {
            const sampleTxn = {
                docId: 'LIVE_TXN_001',
                transactionId: 'TXN_1786527912051_A43SF',
                customerName: 'Aarav Sharma',
                customerEmail: 'aarav.sharma@techcorp.in',
                customerGstin: '27AABCU9603R1ZM',
                planType: 'VIP Pro Lifetime Membership',
                paimentType: 'Razorpay UPI',
                price: 499,
                currency: 'INR',
                subtotal: 422.88,
                taxAmount: 76.12,
                taxRate: 18,
                status: 'Completed',
                created_at: new Date().toISOString()
            };
            const app = document.querySelector('.space-y-6');
            if (window.reactSubSettings) {
                window.reactSubSettings.setState({ pdfModalInvoice: sampleTxn });
            }
        }""")

        page.wait_for_timeout(1000)
        page.screenshot(path='scratch/admin_orders_clean_state.png')

        browser.close()

if __name__ == '__main__':
    test_admin_modals()
