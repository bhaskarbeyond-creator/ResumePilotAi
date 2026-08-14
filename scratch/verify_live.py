import urllib.request
import urllib.parse
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()

base_url = "https://airesume.projectdemo.guru"

print("1. Testing frontend root URL...")
try:
    req = urllib.request.Request(base_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as resp:
        html = resp.read().decode('utf-8')
        has_root = 'id="root"' in html or '<div' in html
        print(f"Status: {resp.status}")
        print(f"Contains React root div: {has_root}")
except Exception as e:
    print(f"Frontend Error: {e}")

print("\n2. Testing backend API health check (/healthz)...")
try:
    req = urllib.request.Request(f"{base_url}/healthz", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as resp:
        text = resp.read().decode('utf-8')
        print(f"Status: {resp.status}, Response: {text.strip()}")
except Exception as e:
    print(f"API Error: {e}")

print("\n3. Testing backend AI diagnostics endpoint (/api/admin/test-connection)...")
try:
    data = json.dumps({"type": "diagnostics"}).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/admin/test-connection", data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as resp:
        text = resp.read().decode('utf-8')
        print(f"Status: {resp.status}, Response: {text.strip()}")
except Exception as e:
    print(f"Diagnostics Error: {e}")
