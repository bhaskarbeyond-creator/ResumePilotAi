"""
Downloads Poppins WOFF2 font files from Google Fonts and
creates a self-hosted /public/fonts/poppins.css + font files.
"""
import os
import re
import urllib.request

OUTPUT_DIR = r'd:\xampp\htdocs\ai-resume-builder\public\fonts\poppins'
CSS_OUT    = r'd:\xampp\htdocs\ai-resume-builder\public\fonts\poppins.css'

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Use a modern browser UA so Google returns woff2 format
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
      'AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0.0.0 Safari/537.36')

GOOGLE_URL = (
    'https://fonts.googleapis.com/css2?'
    'family=Poppins:ital,wght@'
    '0,300;0,400;0,500;0,600;0,700;0,800;0,900;'
    '1,300;1,400;1,500;1,600;1,700'
    '&display=swap'
)

req = urllib.request.Request(GOOGLE_URL, headers={'User-Agent': UA})
with urllib.request.urlopen(req) as r:
    css_text = r.read().decode('utf-8')

print('Fetched CSS from Google Fonts')

# Find all src: url(...) lines with woff2 and their associated font descriptors
# We'll rewrite the CSS replacing remote URLs with local paths
font_url_pattern = re.compile(r'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)')
local_css = css_text

downloaded = {}
for match in font_url_pattern.finditer(css_text):
    remote_url = match.group(1)
    # Build a short filename from the URL path
    fname = remote_url.split('/')[-1]
    if fname not in downloaded:
        local_path = os.path.join(OUTPUT_DIR, fname)
        print(f'  Downloading {fname} ...')
        req2 = urllib.request.Request(remote_url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req2) as r2:
            font_data = r2.read()
        with open(local_path, 'wb') as f:
            f.write(font_data)
        downloaded[fname] = True
        print(f'    Saved {len(font_data):,} bytes')
    # Replace remote URL with local relative path
    local_css = local_css.replace(remote_url, f'/fonts/poppins/{fname}')

with open(CSS_OUT, 'w', encoding='utf-8') as f:
    f.write(local_css)

print(f'\nDone! {len(downloaded)} font files saved to {OUTPUT_DIR}')
print(f'CSS written to {CSS_OUT}')
