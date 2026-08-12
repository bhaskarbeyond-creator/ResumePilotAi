import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def run():
    print("Launching Playwright Chromium...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_logs = []
        page_errors = []

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print("Navigating to https://airesume.projectdemo.guru/...")
        page.goto("https://airesume.projectdemo.guru/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(5)

        print(f"Page Title: {page.title()}")
        print(f"Current URL: {page.url}")

        page.screenshot(path="scratch/homepage.png")
        print("Screenshot saved to scratch/homepage.png")

        print("\n--- Console Logs ---")
        for log in console_logs:
            print(log)

        print("\n--- Page Errors ---")
        for err in page_errors:
            print(err)

        browser.close()

if __name__ == "__main__":
    run()
