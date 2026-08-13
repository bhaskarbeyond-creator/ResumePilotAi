import asyncio
import time
import json
import urllib.request
import urllib.parse
from playwright.async_api import async_playwright

BASE_URL = "https://airesume.projectdemo.guru"
TEST_EMAIL = "bhaskar.beyond@gmail.com"
TEST_PASSWORD = "Bhaskar002!"

async def request_token():
    """Call the custom-password-reset API and return the tokenized reset URL."""
    print("--- 0. Requesting fresh single-use reset token from API ---")
    payload = json.dumps({"email": TEST_EMAIL}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/custom-password-reset",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            print(f"Reset API response: {data}")
    except Exception as e:
        print(f"Reset API error: {e}")

async def main():
    # Step 0: Trigger fresh token generation (email sent to inbox)
    await request_token()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Step 1: Navigate using old-style URL (token-less, no validation enforced server-side)
        # The new tokenized URL would come from the email; we test the modal UI with direct email param.
        reset_url = f"{BASE_URL}/login?mode=resetPassword&email={urllib.parse.quote(TEST_EMAIL)}"
        print(f"\n--- 1. Navigating to Reset URL ---")
        print(f"URL: {reset_url}")
        await page.goto(reset_url, wait_until="domcontentloaded")

        # Wait for React to render the modal
        try:
            await page.wait_for_selector("h3", timeout=10000)
        except Exception:
            print("WARNING: No h3 found after 10s")

        await asyncio.sleep(2)
        await page.screenshot(path="scratch/pw_01_reset_page.png")

        # Check modal heading
        heading = await page.evaluate("() => document.querySelector('h3')?.innerText || ''")
        print(f"Modal Heading: '{heading}'")

        if "Set New Account Password" not in heading:
            body = await page.evaluate("() => document.body.innerText")
            print(f"Unexpected page content:\n{body[:500]}")
            await browser.close()
            return

        # Step 2: Wait for loading spinner to disappear
        print("Waiting for loading spinner to clear...")
        try:
            await page.wait_for_selector("form", timeout=10000)
        except Exception:
            print("WARNING: form not found")

        await asyncio.sleep(1)

        # Step 3: Fill passwords
        inputs = await page.query_selector_all("input[type='password']")
        if len(inputs) >= 2:
            print(f"Filling passwords: {TEST_PASSWORD}")
            await inputs[0].fill(TEST_PASSWORD)
            await inputs[1].fill(TEST_PASSWORD)
            await page.screenshot(path="scratch/pw_02_passwords_filled.png")

            # Step 4: Click submit using JS to bypass any overlay
            submit_btn = await page.query_selector("button[type='submit']")
            if submit_btn:
                print("Clicking Set New Password & Log In (via JS dispatch)...")
                await page.evaluate("() => document.querySelector('button[type=submit]').click()")
            else:
                print("ERROR: No submit button found!")
        else:
            print(f"ERROR: Expected 2 password inputs, found {len(inputs)}")
            body = await page.evaluate("() => document.body.innerText")
            print(body[:500])
            await browser.close()
            return

        # Step 5: Wait for redirect to dashboard
        print("Waiting up to 10 seconds for dashboard redirect...")
        try:
            await page.wait_for_url("**/dashboard**", timeout=10000)
            print("SUCCESS: Redirected to dashboard!")
        except Exception:
            print("WARNING: Did not redirect to dashboard within 10s")

        await asyncio.sleep(2)
        await page.screenshot(path="scratch/pw_03_after_redirect.png")

        curr_url = page.url
        body_text = await page.evaluate("() => document.body.innerText")
        print(f"Current URL: {curr_url}")
        print("Page snippet:\n", body_text[:800])

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
