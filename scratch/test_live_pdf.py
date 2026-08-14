import requests, sys, time, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

print('Testing LIVE PDF export at airesume.projectdemo.guru...')
start = time.time()
try:
    r = requests.post(
        'https://airesume.projectdemo.guru/api/export',
        json={'resumeName': 'Cv1', 'resumeId': 'live_verify_final', 'language': 'en'},
        timeout=90,
        verify=True
    )
    elapsed = time.time() - start
    ct = r.headers.get('content-type', 'N/A')
    print(f'Status: {r.status_code} | Size: {len(r.content):,} bytes | Time: {elapsed:.1f}s')
    print(f'Content-Type: {ct}')
    magic = r.content[:4]
    print(f'First 4 bytes: {magic}')
    if magic == b'%PDF':
        print('\nLIVE TEST PASSED - Valid PDF!')
    elif r.status_code in (500, 200) and b'error' in r.content[:200].lower():
        print('\nServer error: ' + r.content[:300].decode('utf-8', errors='replace'))
    else:
        print('\nUnexpected response: ' + r.content[:300].decode('utf-8', errors='replace'))
except Exception as e:
    print(f'Error: {e}')
