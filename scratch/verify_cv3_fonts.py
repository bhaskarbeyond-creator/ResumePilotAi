import requests, sys, time, warnings
warnings.filterwarnings('ignore')
sys.stdout.reconfigure(encoding='utf-8')

print('Testing LIVE PDF export for Cv3...')
try:
    r = requests.post(
        'https://airesume.projectdemo.guru/api/export',
        json={'resumeName': 'Cv3', 'resumeId': 'live_verify_cv3', 'language': 'en'},
        timeout=90,
        verify=False
    )
    print(f'Status: {r.status_code} | Size: {len(r.content):,} bytes')
    if r.status_code == 200 and r.content.startswith(b'%PDF'):
        with open('scratch/cv3_test.pdf', 'wb') as f:
            f.write(r.content)
        print('PDF saved to scratch/cv3_test.pdf')
        
        # Check text stream in PDF for glyphs / font references
        import re
        fonts = re.findall(rb'/FontName\s*/([A-Za-z0-9+-]+)', r.content)
        font_families = re.findall(rb'/BaseFont\s*/([A-Za-z0-9+-]+)', r.content)
        print('Embedded Font Names in PDF:', [f.decode('latin1') for f in set(fonts)])
        print('Embedded BaseFonts in PDF:', [f.decode('latin1') for f in set(font_families)])
        
        # Check if DroidSansFallback is used
        if any(b'DroidSans' in f for f in font_families):
            print('⚠️ WARNING: DroidSansFallback is still referenced as fallback!')
        else:
            print('✅ SUCCESS: DroidSansFallback is NO LONGER used! Real fonts embedded!')
            
except Exception as e:
    print(f'Error: {e}')
