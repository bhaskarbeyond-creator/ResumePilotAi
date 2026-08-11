"""
Local PDF export test script.
Tests that the backend /api/export endpoint returns a valid PDF.
Run after both servers are up:
  - npm run dev (port 5173)
  - node backend/index.js (port 8080)
"""
import requests
import time
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

BACKEND_URL = "http://localhost:8080"
RESUME_ID = "test_local_pdf"
RESUME_NAME = "Cv1"

print("=" * 50)
print("LOCAL PDF EXPORT TEST")
print("=" * 50)

# Step 1: Wait for backend to be ready
print("\n[1] Checking backend health...")
for attempt in range(10):
    try:
        r = requests.get(f"{BACKEND_URL}/api/resume", timeout=3)
        print(f"    Backend is up (status {r.status_code})")
        break
    except Exception as e:
        print(f"    Attempt {attempt+1}/10: waiting... ({e})")
        time.sleep(2)
else:
    print("    ERROR: Backend not reachable. Make sure 'node backend/index.js' is running.")
    sys.exit(1)

# Step 2: Call the export endpoint
print(f"\n[2] Calling /api/export (resumeName={RESUME_NAME}, resumeId={RESUME_ID})...")
print("    This may take 15-30 seconds as Playwright loads and captures the page...")
start = time.time()

try:
    response = requests.post(
        f"{BACKEND_URL}/api/export",
        json={
            "resumeName": RESUME_NAME,
            "resumeId": RESUME_ID,
            "language": "en"
        },
        timeout=120,
        stream=True
    )
    elapsed = time.time() - start
    print(f"    Response received in {elapsed:.1f}s")
    print(f"    Status: {response.status_code}")
    print(f"    Content-Type: {response.headers.get('content-type', 'N/A')}")
    print(f"    Content-Length: {response.headers.get('content-length', 'N/A')} bytes")

    content = response.content
    print(f"    Body size: {len(content)} bytes")

    # Step 3: Validate PDF magic bytes
    print(f"\n[3] Validating PDF magic bytes...")
    if len(content) < 4:
        print("    ERROR: Response too short to be a PDF!")
        print(f"    Body text: {content[:500]}")
        sys.exit(1)

    magic = content[:4]
    print(f"    First 4 bytes: {magic}")

    if magic == b'%PDF':
        print("    ✅ VALID PDF! File starts with %PDF magic bytes.")
        # Save it for manual inspection
        out_path = os.path.join(os.path.dirname(__file__), 'test_output.pdf')
        with open(out_path, 'wb') as f:
            f.write(content)
        print(f"\n    Saved to: {out_path}")
        print(f"    File size: {len(content):,} bytes ({len(content)/1024:.1f} KB)")
        print("\n✅ TEST PASSED - PDF is valid and should open correctly!")
    else:
        print(f"    ❌ INVALID - Not a PDF!")
        print(f"    Body (first 500 chars): {content[:500]}")
        if response.status_code == 500:
            print(f"\n    Server returned 500 error. Check backend console for Playwright errors.")
        sys.exit(1)

except requests.exceptions.Timeout:
    print("    ERROR: Request timed out after 120s. Playwright may have crashed.")
    sys.exit(1)
except Exception as e:
    print(f"    ERROR: {e}")
    sys.exit(1)
