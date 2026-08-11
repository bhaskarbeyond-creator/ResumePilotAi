import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

test_js = """
const { chromium } = require('playwright');

(async () => {
    console.log('Starting Playwright test script...');
    const launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--no-zygote']
    };
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure().errorText));
    page.on('response', res => {
        if (res.status() >= 400 || res.url().includes('font')) {
            console.log('RESPONSE:', res.status(), res.url());
        }
    });

    const targetUrl = 'https://airesume.projectdemo.guru/export/Cv3/test1234/en';
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

    const fontCheck = await page.evaluate(async () => {
        await document.fonts.ready;
        const fontStatus = document.fonts.status;
        const fontsLoaded = [];
        document.fonts.forEach(f => fontsLoaded.push({ family: f.family, status: f.status, loaded: f.loaded }));
        return { fontStatus, count: document.fonts.size, fontsLoaded };
    }).catch(e => ({ error: e.message }));

    console.log('Font Check Result:', JSON.stringify(fontCheck, null, 2));

    await browser.close();
})();
"""

sftp = ssh.open_sftp()
with sftp.open('/home/u727965524/backend/scratch_playwright_test.js', 'w') as f:
    f.write(test_js)
sftp.close()

# Run node via full path or by sourcing environment
cmd = 'NODE_PATH=$(readlink -f /proc/202058/exe); echo "Node binary: $NODE_PATH"; $NODE_PATH /home/u727965524/backend/scratch_playwright_test.js'
stdin, stdout, stderr = ssh.exec_command(cmd)
print('=== PLAYWRIGHT TEST OUTPUT ===')
print(stdout.read().decode('utf-8', errors='replace'))
print(stderr.read().decode('utf-8', errors='replace'))

ssh.close()
