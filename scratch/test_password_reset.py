import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to homepage...")
        await page.goto("https://airesume.projectdemo.guru", wait_until="commit", timeout=20000)
        await asyncio.sleep(3)

        print("Testing sendPasswordResetEmail in browser context...")
        result = await page.evaluate("""
            async () => {
                if (!window.fire || !window.fire.auth) return "window.fire auth not defined";
                try {
                    await window.fire.auth().sendPasswordResetEmail('bhaskar.beyond@gmail.com');
                    return { success: true, message: "Password reset email sent successfully!" };
                } catch (err) {
                    return { success: false, code: err.code, message: err.message };
                }
            }
        """)

        print("\n==========================================")
        print("EMPIRICAL PASSWORD RESET TEST RESULT:")
        print(result)
        print("==========================================\n")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
