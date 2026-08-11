import sys
import time
from playwright.sync_api import sync_playwright

def run():
    print("=== STARTING PLAYWRIGHT LINKEDIN OAUTH END-TO-END TEST ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Step 1: Test /api/auth/linkedin/connect?clientId=78mwunhqr1y841
        connect_url = "https://airesume.projectdemo.guru/api/auth/linkedin/connect?clientId=78mwunhqr1y841"
        print(f"[1] Navigating directly to OAuth trigger with Client ID: {connect_url}...")
        response = page.goto(connect_url, wait_until="commit", timeout=20000)
        time.sleep(4)
        final_url = page.url
        print(f"    Final Redirected URL: {final_url}")
        
        if "linkedin.com" in final_url:
            print("    SUCCESS: Redirected cleanly to LinkedIn OAuth consent page!")
            page.screenshot(path="scratch/linkedin_consent_page.png")
            print("    Saved screenshot to scratch/linkedin_consent_page.png")
        else:
            print("    Notice: Final URL:", final_url)

        browser.close()

if __name__ == "__main__":
    run()
