import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Testing POST https://airesume.projectdemo.guru/api/auth/set-user-password ...")
        
        response = await page.request.post(
            "https://airesume.projectdemo.guru/api/auth/set-user-password",
            data={"email": "bhaskar.beyond@gmail.com", "newPassword": "REDACTED_LEAKED_PASSWORD_ROTATED"},
            headers={"Content-Type": "application/json"}
        )

        status = response.status
        text = await response.text()

        print(f"\n==========================================")
        print(f"HTTP Status: {status}")
        print(f"Response Body (first 500 chars):\n{text[:500]}")
        print(f"==========================================\n")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
