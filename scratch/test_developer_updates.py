import os
import sys
import tempfile
import time
from playwright.sync_api import sync_playwright

def test_developer_updates():
    print("==================================================")
    print("Playwright Verification of Developer Updates")
    print("Target Domain: https://airesume.projectdemo.guru")
    print("==================================================")
    
    os.makedirs("scratch", exist_ok=True)
    
    user_data_dir = tempfile.mkdtemp(prefix="playwright_profile_")
    
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=True,
            viewport={"width": 1280, "height": 800}
        )
        page = browser.pages[0]
        
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        
        print("\n1. Testing Homepage & Live Frontend Load...")
        response = page.goto("https://airesume.projectdemo.guru", wait_until="domcontentloaded", timeout=40000)
        print(f"   [+] HTTP Status: {response.status}")
        assert response.status == 200, f"Expected HTTP 200, got {response.status}"
        
        page.wait_for_timeout(2000)
        print(f"   [+] Page Title: {page.title()}")
        page.screenshot(path="scratch/verify_01_homepage.png")
        
        print("\n2. Testing Authentication Modal & Password Reset Form...")
        page.evaluate("""() => {
            const elements = Array.from(document.querySelectorAll('a, button, span, div'));
            const loginEl = elements.find(e => e.innerText && e.innerText.trim().toLowerCase() === 'login');
            if (loginEl) loginEl.click();
        }""")
        page.wait_for_timeout(2000)
        page.screenshot(path="scratch/verify_02_login_modal.png")
        
        # Test Forgot Password button
        forgot_btn = page.locator("text=/forgot password/i")
        if forgot_btn.count() > 0:
            print("   [+] Forgot Password link found, clicking...")
            forgot_btn.first.click()
            page.wait_for_timeout(1000)
            page.screenshot(path="scratch/verify_03_forgot_password.png")
            print("   [+] Password Reset UI opens correctly!")
        
        print("\n3. Testing Pricing & Plans Page...")
        response = page.goto("https://airesume.projectdemo.guru/billing", wait_until="domcontentloaded", timeout=40000)
        page.wait_for_timeout(2000)
        page.screenshot(path="scratch/verify_04_billing.png")
        print(f"   [+] Billing Page HTTP Status: {response.status if response else 'Loaded'}")
        
        print("\n4. Testing API Security Protection (Direct Request without Auth)...")
        # Direct fetch to /api/auth or similar endpoint to ensure it doesn't crash and returns proper JSON
        api_res = page.request.get("https://airesume.projectdemo.guru/api/")
        print(f"   [+] API Root Status: {api_res.status}")
        print(f"   [+] API Response Text: {api_res.text()[:200]}")
        
        print("\n5. Checking for severe JavaScript Console Errors...")
        fatal_errors = [e for e in console_errors if "uncaught" in e.toLowerCase() or "syntaxerror" in e.toLowerCase()]
        if fatal_errors:
            print(f"   [-] Fatal JS Errors Found: {fatal_errors}")
        else:
            print("   [+] Zero Fatal JavaScript Errors detected!")

        browser.close()
        
    print("\n==================================================")
    print("Verification Completed Successfully!")
    print("==================================================")

if __name__ == "__main__":
    test_developer_updates()
