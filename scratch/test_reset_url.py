import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to https://airesume.projectdemo.guru/login?reset=true&email=bhaskar.beyond%40gmail.com ...")
        await page.goto("https://airesume.projectdemo.guru/login?reset=true&email=bhaskar.beyond%40gmail.com", wait_until="commit", timeout=20000)
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(2)

        # Check if ResetPasswordModal is present and email is filled
        heading = await page.text_content("h3") if await page.query_selector("h3") else "No H3 found"
        print("Page H3 text:", heading)

        content = await page.content()
        is_email_present = "bhaskar.beyond@gmail.com" in content
        print(f"Is bhaskar.beyond@gmail.com in page HTML? {is_email_present}")

        await page.screenshot(path="scratch/reset_url_test.png")
        print("Saved screenshot to scratch/reset_url_test.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
