import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def run():
    print("Launching Playwright Chromium with Email/Password Auth...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_logs = []
        page_errors = []
        popups = []

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        context.on("page", lambda p: popups.append(p))

        print("Navigating to https://airesume.projectdemo.guru/...")
        page.goto("https://airesume.projectdemo.guru/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)

        # Authenticate via Email/Password in browser
        test_email = f"test_candidate_{int(time.time())}@example.com"
        print(f"Creating & signing in test user: {test_email}...")
        user_info = page.evaluate(f"""
            async () => {{
                return new Promise((resolve) => {{
                    if (!window.fire || !window.fire.auth) {{
                        resolve({{ error: 'window.fire not found' }});
                        return;
                    }}
                    window.fire.auth().createUserWithEmailAndPassword("{test_email}", "TestUserPass123!")
                        .then(async (cred) => {{
                            const user = cred.user;
                            const db = window.fire.firestore();
                            const txnId = 'TXN_TEST_' + Date.now();
                            const txnData = {{
                                transactionId: txnId,
                                userId: user.uid,
                                planType: 'yearly',
                                planName: 'VIP Pro Membership Plan (12M)',
                                paimentType: 'Razorpay UPI',
                                paymentMethod: 'Razorpay UPI',
                                price: 499,
                                amount: 499,
                                currency: 'INR',
                                subtotal: 422.88,
                                taxAmount: 76.12,
                                taxRate: 18,
                                taxName: 'GST',
                                companyTaxId: '27AABCU9603R1ZM',
                                status: 'Completed',
                                createdDateString: new Date().toLocaleDateString('en-US', {{ month: 'short', day: 'numeric', year: 'numeric' }}),
                                created_at: new Date()
                            }};

                            await db.collection('users').doc(user.uid).set({{
                                membership: 'Premium',
                                membershipEnds: new Date(Date.now() + 365*24*60*60*1000),
                                autoRenew: true,
                                lastPaymentGateway: 'Razorpay UPI',
                                lastPaymentDate: new Date(),
                                lastPaymentAmount: 499,
                                lastPaymentCurrency: 'INR',
                                paymentStatus: 'ACTIVE',
                                email: "{test_email}",
                                firstname: "John",
                                lastname: "Tester"
                            }}, {{ merge: true }});

                            await db.collection('users').doc(user.uid).collection('transactions').add(txnData);

                            resolve({{ uid: user.uid, email: user.email, txnId: txnId }});
                        }})
                        .catch(err => resolve({{ error: err.message }}));
                }});
            }}
        """)

        print(f"Auth result: {user_info}")

        if "uid" in user_info:
            print("Navigating to /dashboard/plans...")
            page.goto("https://airesume.projectdemo.guru/dashboard/plans", wait_until="domcontentloaded", timeout=60000)
            time.sleep(4)

            invoices_tab = page.query_selector("button:has-text('Billing History')")
            if invoices_tab:
                print("Clicking 'Billing History & PDF Invoices' tab...")
                invoices_tab.click()
                time.sleep(3)
                page.screenshot(path="scratch/real_user_billing_history.png")
                print("Billing History screenshot saved to scratch/real_user_billing_history.png")

                rows = page.query_selector_all("tbody tr")
                print(f"Found {len(rows)} transaction row(s) in Billing History table.")

                download_btns = page.query_selector_all("button:has-text('Download PDF')")
                print(f"Found {len(download_btns)} 'Download PDF' button(s).")

                if len(download_btns) > 0:
                    print("Clicking 'Download PDF' button...")
                    download_btns[0].click()
                    time.sleep(4)

                    print(f"Popups captured: {len(popups)}")
                    for idx, pop in enumerate(popups):
                        print(f"Popup #{idx+1} Title: {pop.title()}")
                        pop.screenshot(path=f"scratch/real_pdf_popup_{idx+1}.png")
                        print(f"Popup screenshot saved to scratch/real_pdf_popup_{idx+1}.png")
            else:
                print("Billing History tab button not found.")

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
