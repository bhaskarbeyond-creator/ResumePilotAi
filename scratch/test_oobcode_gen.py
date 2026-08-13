import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Testing POST /api/auth/custom-password-reset with REST API oobCode generation...")
        response = await page.request.post(
            "https://airesume.projectdemo.guru/api/auth/custom-password-reset",
            data={"email": "bhaskar.beyond@gmail.com"},
            headers={"Content-Type": "application/json"}
        )

        status = response.status
        text = await response.text()

        print(f"\n==========================================")
        print(f"HTTP Status: {status}")
        print(f"Response Body: {text}")
        print(f"==========================================\n")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
