import requests, sys, time, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

print('Testing LIVE PDF export and inspecting text content...')
try:
    r = requests.post(
        'https://airesume.projectdemo.guru/api/export',
        json={'resumeName': 'Cv3', 'resumeId': 'live_verify_font_text', 'language': 'en'},
        timeout=90,
        verify=False
    )
    if r.status_code == 200 and r.content.startswith(b'%PDF'):
        with open('scratch/live_test_output.pdf', 'wb') as f:
            f.write(r.content)
        print(f'PDF saved to scratch/live_test_output.pdf ({len(r.content):,} bytes)')
        
        # Try reading text with pypdf or pypdf2 or pdfminer or fits
        try:
            from pypdf import PdfReader
            reader = PdfReader('scratch/live_test_output.pdf')
            text = "".join([page.extract_text() for page in reader.pages])
            print('Extracted Text snippet:')
            print(repr(text[:200]))
            if any(ord(c) > 127 and c not in '’“”–—' for c in text[:100]):
                print('Warning: unusual non-ASCII characters found in PDF text extract.')
            else:
                print('Text extracted cleanly!')
        except Exception as pe:
            print(f'PDF reader check note: {pe}')
    else:
        print(f'Export failed with status {r.status_code}: {r.content[:200]}')
except Exception as e:
    print(f'Error: {e}')
