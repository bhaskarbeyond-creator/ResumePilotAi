import asyncio
import time
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        requests_log = []
        page.on("request", lambda req: requests_log.append({
            "url": req.url,
            "method": req.method,
            "start_time": time.time()
        }))

        responses_log = []
        page.on("response", lambda res: responses_log.append({
            "url": res.url,
            "status": res.status,
            "time": time.time()
        }))

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        print("Navigating to https://airesume.projectdemo.guru ...")
        t0 = time.time()
        try:
            await page.goto("https://airesume.projectdemo.guru", wait_until="commit", timeout=20000)
            await page.wait_for_load_state("domcontentloaded")
            t_dom = time.time() - t0
            print(f"DOMContentLoaded reached in {t_dom:.2f} seconds!")
        except Exception as e:
            print("Navigation exception:", e)

        await asyncio.sleep(4)
        t_total = time.time() - t0
        print(f"Total test time: {t_total:.2f} seconds")

        print("\n--- SLOW OR FAILING REQUESTS (> 1.0s or non-200) ---")
        for req in requests_log:
            url = req["url"]
            matching_res = next((r for r in responses_log if r["url"] == url), None)
            if matching_res:
                duration = matching_res["time"] - req["start_time"]
                status = matching_res["status"]
                if duration > 1.0 or status >= 400:
                    print(f"[{status}] ({duration:.2f}s) {url[:120]}")
            else:
                print(f"[PENDING/TIMEOUT] {url[:120]}")

        print("\n--- CONSOLE LOGS ---")
        for msg in console_logs:
            if "error" in msg.lower() or "warn" in msg.lower() or "timeout" in msg.lower():
                print(msg)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
