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

        # Fill passwords
        inputs = await page.query_selector_all("input[type='password']")
        if len(inputs) >= 2:
            print("Filling passwords...")
            await inputs[0].fill("Bhaskar@002!")
            await inputs[1].fill("Bhaskar@002!")

            submit_btn = await page.query_selector("button[type='submit']")
            if submit_btn:
                print("Submitting password reset form...")
                await submit_btn.click()
                await asyncio.sleep(4)

        # Capture text content of alert / modal
        modal_text = await page.evaluate("() => document.querySelector('.bg-white')?.innerText || ''")
        with open("scratch/modal_result.txt", "w", encoding="utf-8") as f:
            f.write(modal_text)

        print("\n==========================================")
        print("MODAL TEXT SAVED TO scratch/modal_result.txt")
        print("==========================================\n")

        await page.screenshot(path="scratch/reset_modal_submit_result.png")
        print("Saved screenshot to scratch/reset_modal_submit_result.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
