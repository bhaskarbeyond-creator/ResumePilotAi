import asyncio
import json
import urllib.request
import urllib.parse
from playwright.async_api import async_playwright

BASE_URL = "https://airesume.projectdemo.guru"
TEST_EMAIL = "bhaskar.beyond@gmail.com"
TEST_PASSWORD = "Bhaskar002!"
FIREBASE_API_KEY = "AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc"


def firebase_sign_in(email, password):
    """Sign in via Firebase Auth REST API and return UID and idToken."""
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    payload = json.dumps({"email": email, "password": password, "returnSecureToken": True}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def firestore_get_user_doc(uid, id_token):
    """Fetch user doc from Firestore REST API."""
    project_id = "ai-resume-builder-424cf"
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/users/{uid}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {id_token}"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}


async def main():
    print("=== ENTERPRISE PASSWORD RESET VERIFICATION ===\n")

    # --- Step 1: Check what UID Firebase Auth assigns for this email ---
    print("--- Step 1: Firebase Auth sign-in for bhaskar.beyond@gmail.com ---")
    try:
        auth_data = firebase_sign_in(TEST_EMAIL, TEST_PASSWORD)
        uid = auth_data.get("localId", "UNKNOWN")
        id_token = auth_data.get("idToken", "")
        print(f"  Firebase Auth UID: {uid}")
        print(f"  Display Name from Auth: {auth_data.get('displayName', '(none)')}")
        print(f"  Email: {auth_data.get('email', '')}")

        # --- Step 2: Check Firestore user doc for this UID ---
        print(f"\n--- Step 2: Firestore users/{uid} doc ---")
        user_doc = firestore_get_user_doc(uid, id_token)
        if "fields" in user_doc:
            fields = user_doc["fields"]
            firstname = fields.get("firstname", {}).get("stringValue", "(none)")
            lastname = fields.get("lastname", {}).get("stringValue", "(none)")
            membership = fields.get("membership", {}).get("stringValue", "(none)")
            email_field = fields.get("email", {}).get("stringValue", "(none)")
            is_admin = fields.get("isA", {}).get("booleanValue", False)
            print(f"  firstname: {firstname}")
            print(f"  lastname: {lastname}")
            print(f"  email: {email_field}")
            print(f"  membership: {membership}")
            print(f"  isA (admin): {is_admin}")
        else:
            print(f"  ERROR or missing doc: {user_doc}")
    except Exception as e:
        print(f"  Firebase Auth/Firestore error: {e}")

    # --- Step 3: Run Playwright reset flow and capture UID from dashboard ---
    print("\n--- Step 3: Playwright Reset Flow ---")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # Collect console.log messages
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        reset_url = f"{BASE_URL}/login?mode=resetPassword&email={urllib.parse.quote(TEST_EMAIL)}"
        print(f"  Navigating to: {reset_url}")
        await page.goto(reset_url, wait_until="domcontentloaded")

        try:
            await page.wait_for_selector("form", timeout=10000)
        except Exception:
            pass
        await asyncio.sleep(1)

        heading = await page.evaluate("() => document.querySelector('h3')?.innerText || ''")
        print(f"  Modal: '{heading}'")

        inputs = await page.query_selector_all("input[type='password']")
        if len(inputs) >= 2:
            await inputs[0].fill(TEST_PASSWORD)
            await inputs[1].fill(TEST_PASSWORD)
            await page.evaluate("() => document.querySelector('button[type=submit]').click()")

        try:
            await page.wait_for_url("**/dashboard**", timeout=12000)
        except Exception:
            pass

        await asyncio.sleep(3)
        curr_url = page.url
        body_text = await page.evaluate("() => document.body.innerText")

        print(f"\n  Final URL: {curr_url}")
        print(f"  Page snippet: {body_text[:600]}")

        # Check what UID is in localStorage after login
        ls_user = await page.evaluate("() => localStorage.getItem('user') || 'NOT SET'")
        print(f"\n  localStorage 'user' (UID): {ls_user}")

        # Check relevant console logs
        uid_logs = [l for l in console_logs if "User" in l or "uid" in l.lower() or "auth" in l.lower() or "master" in l.lower() or "Merge" in l]
        if uid_logs:
            print(f"\n  Relevant console logs:")
            for l in uid_logs[:15]:
                print(f"    {l}")

        await browser.close()

    print("\n=== DONE ===")


if __name__ == "__main__":
    asyncio.run(main())
