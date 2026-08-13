import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text} (Location: {msg.location})"))
        
        uncaught_errors = []
        page.on("pageerror", lambda err: uncaught_errors.append(str(err)))

        urls_to_test = [
            "https://airesume.projectdemo.guru/admin/settings?tab=socialAuth",
            "https://airesume.projectdemo.guru/admin",
            "https://airesume.projectdemo.guru"
        ]

        for url in urls_to_test:
            print(f"\n==========================================")
            print(f"Testing URL: {url}")
            console_errors.clear()
            uncaught_errors.clear()
            
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(2)
            except Exception as e:
                print("Navigation error:", e)

            print("--- UNCAUGHT PAGE ERRORS ---")
            for err in uncaught_errors:
                print("ERROR:", err)

            print("--- CONSOLE LOGS/ERRORS ---")
            for err in console_errors:
                if "error" in err.lower() or "exception" in err.lower() or "failed" in err.lower():
                    print(err)

            content = await page.content()
            print(f"Page content length: {len(content)} bytes")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
