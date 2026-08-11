"""
Local PDF export test for ai-resume-builder.local (XAMPP environment).
"""
import requests
import time
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

BACKEND_URL = "http://localhost:8080"

# Use a real-looking resume ID and a template
RESUME_NAME = "Cv1"
RESUME_ID = "test_xampp_pdf_" + str(int(time.time()))

print("=" * 55)
print("LOCAL XAMPP PDF EXPORT TEST")
print("=" * 55)

# Step 1: Check backend
print("\n[1] Checking backend at localhost:8080...")
try:
    r = requests.get(f"{BACKEND_URL}/api/resume", timeout=5)
    print(f"    Backend is up (status {r.status_code})")
except Exception as e:
    print(f"    ERROR: Backend not reachable - {e}")
    sys.exit(1)

# Step 2: Check site at ai-resume-builder.local
print("\n[2] Checking ai-resume-builder.local is reachable...")
try:
    r2 = requests.get("http://ai-resume-builder.local/", timeout=5)
    print(f"    Site status: {r2.status_code}")
    if 'text/html' in r2.headers.get('content-type', ''):
        print(f"    Content-Type: HTML ✅")
    print(f"    Content preview: {r2.text[:100].strip()}")
except Exception as e:
    print(f"    ERROR: Site not reachable - {e}")
    print("    Make sure XAMPP Apache is running!")
    sys.exit(1)

# Step 3: Call export
print(f"\n[3] Calling /api/export (template={RESUME_NAME})...")
print("    Playwright will navigate to http://ai-resume-builder.local/export/...")
print("    Waiting up to 60s...")

start = time.time()
try:
    response = requests.post(
        f"{BACKEND_URL}/api/export",
        json={
            "resumeName": RESUME_NAME,
            "resumeId": RESUME_ID,
            "language": "en"
        },
        timeout=90
    )
    elapsed = time.time() - start
    print(f"    Response in {elapsed:.1f}s | Status: {response.status_code} | Content-Type: {response.headers.get('content-type','N/A')}")

    content = response.content
    print(f"    Body size: {len(content):,} bytes")

    # Validate PDF
    print(f"\n[4] Validating PDF magic bytes...")
    magic = content[:4]
    print(f"    First 4 bytes: {magic}")

    if magic == b'%PDF':
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_xampp_output.pdf')
        with open(out_path, 'wb') as f:
            f.write(content)
        print(f"    ✅ VALID PDF! Saved to: {out_path}")
        print(f"    File size: {len(content):,} bytes ({len(content)/1024:.1f} KB)")
        print(f"\n✅ TEST PASSED!")
    else:
        print(f"    ❌ NOT a PDF! Body: {content[:300]}")
        sys.exit(1)

except requests.exceptions.Timeout:
    print(f"    ERROR: Timeout after 90s")
    sys.exit(1)
except Exception as e:
    print(f"    ERROR: {e}")
    sys.exit(1)
