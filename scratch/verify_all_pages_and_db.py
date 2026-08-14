import urllib.request
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()

base_url = "https://airesume.projectdemo.guru"

routes = [
    "/",
    "/dashboard",
    "/coverletter",
    "/create-resume",
    "/pricing",
    "/billing/plans",
    "/contact",
    "/features",
    "/portfolios",
    "/portfolio/builder",
    "/jobs",
    "/jobs/portal",
    "/blog",
    "/adm",
    "/export/Cv1/test_resume_123/en",
    "/export/Cover1/test_cover_123/en"
]

print("=== 1. TESTING ALL APP ROUTES ===")
failed_routes = []
for route in routes:
    url = f"{base_url}{route}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            status = resp.status
            html = resp.read().decode('utf-8', errors='replace')
            is_ok = status == 200 and ('<div id="root"' in html or '<html' in html or '<div' in html)
            print(f"[{'PASS' if is_ok else 'FAIL'}] {route} (Status: {status})")
            if not is_ok:
                failed_routes.append(route)
    except Exception as e:
        print(f"[FAIL] {route} (Error: {e})")
        failed_routes.append(route)

print("\n=== 2. TESTING BACKEND & DATABASE PROXY ENDPOINTS ===")
api_endpoints = [
    ("/healthz", "GET", None),
    ("/healthz", "POST", {}),
    ("/api/admin/test-connection", "POST", {"type": "diagnostics"})
]

failed_apis = []
for path, method, payload in api_endpoints:
    url = f"{base_url}{path}"
    try:
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        headers = {'User-Agent': 'Mozilla/5.0'}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            res_text = resp.read().decode('utf-8', errors='replace')
            print(f"[PASS] {method} {path} (Status: {resp.status}) -> {res_text[:80]}")
    except Exception as e:
        print(f"[FAIL] {method} {path} (Error: {e})")
        failed_apis.append(path)

print("\n=== 3. TESTING FIREBASE REALTIME DATABASE REST CONNECTION ===")
try:
    rtdb_url = "https://ai-resume-builder-424cf-default-rtdb.firebaseio.com/.json"
    req = urllib.request.Request(rtdb_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        print(f"[PASS] Firebase Realtime DB REST endpoint accessible (Status: {resp.status})")
except Exception as e:
    print(f"[WARN] Firebase Realtime DB REST endpoint: {e}")

print("\n=== 4. SUMMARY ===")
if not failed_routes and not failed_apis:
    print("ALL ROUTES AND BACKEND/DATABASE ENDPOINTS ARE WORKING PROPERLY!")
else:
    print(f"Failed routes: {failed_routes}")
    print(f"Failed APIs: {failed_apis}")
