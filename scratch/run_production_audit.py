import requests, time, sys, urllib3
urllib3.disable_warnings()

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = 'https://airesume.projectdemo.guru'

print('=== RUNNING PRODUCTION AUDIT & END-TO-END SUITE ===\n')

tests = []

# Test 1: Frontend SPA Availability
try:
    r = requests.get(BASE_URL, timeout=15, verify=False)
    success = r.status_code == 200 and '<div id="root">' in r.text
    tests.append(('Frontend SPA Home Page', success, f'Status {r.status_code}, length {len(r.text):,}'))
except Exception as e:
    tests.append(('Frontend SPA Home Page', False, str(e)))

# Test 2: Dashboard Route SPA Routing
try:
    r = requests.get(f'{BASE_URL}/dashboard', timeout=15, verify=False)
    success = r.status_code == 200 and 'index.html' in r.url or '<div id="root">' in r.text
    tests.append(('SPA Client-Side Routing', success, f'Status {r.status_code}'))
except Exception as e:
    tests.append(('SPA Client-Side Routing', False, str(e)))

# Test 3: Self-Hosted Font Delivery (Poppins CSS & WOFF2)
try:
    r_css = requests.get(f'{BASE_URL}/fonts/poppins.css', timeout=10, verify=False)
    r_woff = requests.get(f'{BASE_URL}/fonts/poppins/pxiDyp8kv8JHgFVrJJLm21lVFteOcEg.woff2', timeout=10, verify=False)
    success = r_css.status_code == 200 and r_woff.status_code == 200 and r_woff.headers.get('content-type') == 'font/woff2'
    tests.append(('Self-Hosted Font Delivery', success, f'CSS: {r_css.status_code}, WOFF2: {r_woff.status_code} ({len(r_woff.content):,} bytes)'))
except Exception as e:
    tests.append(('Self-Hosted Font Delivery', False, str(e)))

# Test 4: PHP API Proxy & Backend Health
try:
    r = requests.post(f'{BASE_URL}/api/date', timeout=15, verify=False)
    success = r.status_code == 200 and 'date' in r.json()
    tests.append(('PHP API Proxy -> Node Backend', success, f'Status {r.status_code}, response {r.text[:60]}'))
except Exception as e:
    tests.append(('PHP API Proxy -> Node Backend', False, str(e)))

# Test 5: Live PDF Export & Subset Font Embedding (Cv3)
try:
    start = time.time()
    r = requests.post(
        f'{BASE_URL}/api/export',
        json={'resumeName': 'Cv3', 'resumeId': 'audit_test_cv3', 'language': 'en'},
        timeout=90,
        verify=False
    )
    elapsed = time.time() - start
    is_pdf = r.status_code == 200 and r.content.startswith(b'%PDF')
    
    # Check for DroidSansFallback absence
    no_fallback = b'DroidSans' not in r.content
    success = is_pdf and no_fallback
    tests.append(('Playwright PDF Export & Font Subsets', success, f'Status {r.status_code}, Size {len(r.content):,} bytes, Time {elapsed:.1f}s, Real Fonts Embedded: {no_fallback}'))
except Exception as e:
    tests.append(('Playwright PDF Export & Font Subsets', False, str(e)))

print('=== AUDIT RESULTS SUMMARY ===')
passed_count = 0
for name, passed, details in tests:
    status = '✅ PASS' if passed else '❌ FAIL'
    print(f'[{status}] {name}: {details}')
    if passed:
        passed_count += 1

score = (passed_count / len(tests)) * 10
print(f'\nOverall Production Readiness Score: {score:.1f} / 10')
