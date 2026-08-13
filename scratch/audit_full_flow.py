import asyncio
import time
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type in ["error", "warning"] else None)

        # 1. Test Homepage
        print("\n--- 1. Testing Homepage Load ---")
        t0 = time.time()
        res = await page.goto("https://airesume.projectdemo.guru", wait_until="domcontentloaded")
        t_load = time.time() - t0
        print(f"Homepage HTTP Status: {res.status} | DOMContentLoaded in {t_load:.2f}s")
        await page.screenshot(path="scratch/audit_01_homepage.png")

        # 2. Test Custom Password Reset API directly
        print("\n--- 2. Testing Custom Password Reset API ---")
        reset_res = await page.request.post(
            "https://airesume.projectdemo.guru/api/auth/custom-password-reset",
            data={"email": "bhaskar.beyond@gmail.com"},
            headers={"Content-Type": "application/json"}
        )
        print(f"Custom Password Reset API Status: {reset_res.status}")
        print(f"Custom Password Reset API Response: {await reset_res.text()}")

        # 3. Test Reset Password Modal page URL
        print("\n--- 3. Testing Reset Password Modal Page (/login?reset=true&email=bhaskar.beyond%40gmail.com) ---")
        await page.goto("https://airesume.projectdemo.guru/login?reset=true&email=bhaskar.beyond%40gmail.com", wait_until="domcontentloaded")
        await asyncio.sleep(2)

        modal_heading = await page.evaluate("() => document.querySelector('h3')?.innerText || ''")
        print(f"Modal Heading: '{modal_heading}'")
        await page.screenshot(path="scratch/audit_02_reset_modal.png")

        # 4. Fill passwords and submit
        inputs = await page.query_selector_all("input[type='password']")
        if len(inputs) >= 2:
            print("Filling passwords: Bhaskar@002!")
            await inputs[0].fill("Bhaskar@002!")
            await inputs[1].fill("Bhaskar@002!")

            submit_btn = await page.query_selector("button[type='submit']")
            if submit_btn:
                print("Submitting password reset form...")
                await submit_btn.click()
                await asyncio.sleep(4)

        # 5. Capture post-submit modal text
        modal_text = await page.evaluate("() => document.body.innerText || ''")
        with open("scratch/audit_modal_submit_text.txt", "w", encoding="utf-8") as f:
            f.write(modal_text)

        await page.screenshot(path="scratch/audit_03_post_submit.png")
        print("Captured post-submit screenshot to scratch/audit_03_post_submit.png")

        # 6. Audit Console Errors
        print("\n--- 4. Console Warnings & Errors Logged ---")
        if console_errors:
            for err in console_errors[:10]:
                print(" ->", err[:120])
        else:
            print("Zero console errors detected!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
