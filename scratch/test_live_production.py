import os
import sys
import tempfile
import time
from playwright.sync_api import sync_playwright

def test_live_production():
    print("==================================================")
    print("Playwright End-to-End Live Production Verification")
    print("Target Domain: https://airesume.projectdemo.guru")
    print("==================================================")
    
    os.makedirs("scratch", exist_ok=True)
    img1_path = os.path.abspath("scratch/live_prod_01_homepage.png")
    img2_path = os.path.abspath("scratch/live_prod_02_login_modal.png")
    
    user_data_dir = tempfile.mkdtemp(prefix="playwright_profile_")
    
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=True,
            viewport={"width": 1280, "height": 800}
        )
        page = browser.pages[0]
        
        print("\n1. Navigating to live site...")
        response = page.goto("https://airesume.projectdemo.guru", wait_until="domcontentloaded", timeout=40000)
        print(f"   [+] HTTP Status: {response.status}")
        assert response.status == 200, f"Expected HTTP 200, got {response.status}"
        
        page.wait_for_timeout(3000)
        title = page.title()
        print(f"   [+] Page Title: {title}")
        
        page.screenshot(path=img1_path, full_page=False)
        print(f"   [+] Homepage Screenshot saved: {img1_path}")
        
        print("\n2. Triggering Login Modal...")
        page.evaluate("""() => {
            const elements = Array.from(document.querySelectorAll('a, button, span, div'));
            const loginEl = elements.find(e => e.innerText && e.innerText.trim().toLowerCase() === 'login');
            if (loginEl) loginEl.click();
        }""")
        
        page.wait_for_timeout(3000)
        page.screenshot(path=img2_path, full_page=False)
        print(f"   [+] Auth Modal Screenshot saved: {img2_path}")
        
        print("\n3. Inspecting Social Login Module Visibility...")
        google_btn = page.locator("#btn-login-google, .googleAuthItem")
        facebook_btn = page.locator("#btn-login-facebook, .facebookAuthItem")
        linkedin_btn = page.locator("#btn-login-linkedin, .linkedinAuthItem")
        github_btn = page.locator("#btn-login-github, .githubAuthItem")
        
        google_vis = google_btn.first.is_visible() if google_btn.count() > 0 else False
        facebook_vis = facebook_btn.first.is_visible() if facebook_btn.count() > 0 else False
        linkedin_vis = linkedin_btn.first.is_visible() if linkedin_btn.count() > 0 else False
        github_vis = github_btn.first.is_visible() if github_btn.count() > 0 else False
        
        print(f"   - Google Login Button (#btn-login-google): {'VISIBLE' if google_vis else 'HIDDEN'}")
        print(f"   - Facebook Login Button (#btn-login-facebook): {'VISIBLE' if facebook_vis else 'HIDDEN'}")
        print(f"   - LinkedIn Login Button (#btn-login-linkedin): {'VISIBLE' if linkedin_vis else 'HIDDEN'}")
        print(f"   - GitHub Login Button (#btn-login-github): {'VISIBLE' if github_vis else 'HIDDEN'}")
        
        browser.close()
        
    print("\n==================================================")
    print("Live Production Playwright Verification Complete!")
    print("==================================================")

if __name__ == "__main__":
    test_live_production()
