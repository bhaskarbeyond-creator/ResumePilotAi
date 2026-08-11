import os, sys, urllib.request, paramiko, re

sys.stdout.reconfigure(encoding='utf-8')

# Download fonts via Google Fonts CSS API using a TTF User-Agent (like IE or old Safari)
UA_TTF = 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko'

FONT_FAMILIES = [
    'Poppins:wght@400;500;600;700',
    'Merriweather:wght@400;700',
    'Playfair+Display:wght@400;700',
    'Inter:wght@400;600;700',
    'Roboto:wght@400;700',
    'Open+Sans:wght@400;700'
]

LOCAL_FONT_DIR = r'd:\xampp\htdocs\ai-resume-builder\scratch\system_fonts'
os.makedirs(LOCAL_FONT_DIR, exist_ok=True)

print('Downloading TTF fonts via Google Fonts API...')

for fam in FONT_FAMILIES:
    url = f'https://fonts.googleapis.com/css2?family={fam}&display=swap'
    print(f'Fetching CSS for {fam}...')
    req = urllib.request.Request(url, headers={'User-Agent': UA_TTF})
    try:
        with urllib.request.urlopen(req) as r:
            css = r.read().decode('utf-8')
        
        # Find all font URLs
        font_urls = re.findall(r'src:\s*url\((https://fonts\.gstatic\.com/[^)]+)\)', css)
        for i, font_url in enumerate(font_urls):
            ext = '.ttf' if '.ttf' in font_url or 'truetype' in css else '.ttf'
            clean_fam = fam.split(':')[0].replace('+', '')
            fname = f'{clean_fam}_{i+1}{ext}'
            dest = os.path.join(LOCAL_FONT_DIR, fname)
            print(f'  Downloading {fname} from {font_url}...')
            req2 = urllib.request.Request(font_url, headers={'User-Agent': UA_TTF})
            with urllib.request.urlopen(req2) as r2, open(dest, 'wb') as f:
                f.write(r2.read())
            print(f'    Saved {os.path.getsize(dest):,} bytes')
    except Exception as e:
        print(f'  Error for {fam}: {e}')

print('\nConnecting to server via SFTP...')
hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

sftp = ssh.open_sftp()
remote_dir = '/home/u727965524/.local/share/fonts'

for fname in os.listdir(LOCAL_FONT_DIR):
    local_p = os.path.join(LOCAL_FONT_DIR, fname)
    remote_p = f'{remote_dir}/{fname}'
    print(f'Uploading {fname} to server...')
    sftp.put(local_p, remote_p)

sftp.close()

print('\nUpdating fontconfig cache on server...')
stdin, stdout, stderr = ssh.exec_command('fc-cache -fv ~/.local/share/fonts && fc-list : family | sort -u | grep -E "Poppins|Merriweather|Playfair|Inter|Roboto|Open Sans"')
out = stdout.read().decode('utf-8', errors='replace')
print('=== SERVER INSTALLED FONTS VERIFICATION ===')
print(out)

ssh.close()
print('Done!')
