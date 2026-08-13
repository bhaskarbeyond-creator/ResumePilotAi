import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to homepage...")
        await page.goto("https://airesume.projectdemo.guru", wait_until="commit", timeout=20000)
        await asyncio.sleep(3)

        print("Testing fetchSignInMethodsForEmail in browser context...")
        result = await page.evaluate("""
            async () => {
                if (!window.fire || !window.fire.auth) return "window.fire auth not defined";
                try {
                    const methods = await window.fire.auth().fetchSignInMethodsForEmail('bhaskar.beyond@gmail.com');
                    return { success: true, methods };
                } catch (err) {
                    return { success: false, code: err.code, message: err.message };
                }
            }
        """)

        print("\n==========================================")
        print("EMPIRICAL FETCH SIGN IN METHODS TEST RESULT:")
        print(result)
        print("==========================================\n")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
