import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to homepage...")
        await page.goto("https://airesume.projectdemo.guru", wait_until="commit", timeout=20000)
        await asyncio.sleep(3)

        print("Testing createUserWithEmailAndPassword in browser context...")
        result = await page.evaluate("""
            async () => {
                if (!window.fire || !window.fire.auth) return "window.fire auth not defined";
                try {
                    const res = await window.fire.auth().createUserWithEmailAndPassword('bhaskar.beyond@gmail.com', 'Bhaskar@002!');
                    return { success: true, uid: res.user.uid, email: res.user.email };
                } catch (err) {
                    return { success: false, code: err.code, message: err.message };
                }
            }
        """)

        print("\n==========================================")
        print("EMPIRICAL FIREBASE SIGNUP TEST RESULT:")
        print(result)
        print("==========================================\n")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
