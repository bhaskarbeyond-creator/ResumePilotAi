const fs = require('fs');
const root = 'D:/xampp/htdocs/IME365/';
const files = ['.bridge/capture_dashboard.mjs', '.bridge/evidence/capture_dashboard.pre-dir090.mjs'];
const patterns = {
    pem_multiline: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{100,}-----END/,
    pem_oneline: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\\+[rn]|\s|[A-Za-z0-9+/=]){100,}/,
    aws: /AKIA[0-9A-Z]{16}/,
    gh: /gh[pousr]_[A-Za-z0-9]{20,}/,
    slack: /xox[baprs]-[A-Za-z0-9-]{10,}/,
    stripe: /sk_(?:live|test)_[A-Za-z0-9]{8,}/,
    nvidia: /nvapi-[A-Za-z0-9_-]{10,}/,
    google: /AIza[0-9A-Za-z_-]{30,}/,
    razorpay: /rzp_(?:live|test)_[A-Za-z0-9]{8,}/,
    cfut: /\bcfut_[A-Za-z0-9_-]{20,}/,
    gservice: /[a-z0-9](?:[a-z0-9-]{4,})@[a-z0-9-]{4,}\.iam\.gserviceaccount\.com/,
    r2: /[0-9a-f]{32}\.r2\.cloudflarestorage\.com/,
    sg: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    passwordAssign: /\bpassword\s*=\s*['"][^'"]{8,}['"]/i,
    passwordColon: /\bpassword\s*:\s*['"][^'"{\s]{8,}['"]/i,
};
for (const f of files) {
    const c = fs.readFileSync(root + f, 'utf8');
    const hits = Object.entries(patterns).filter(([, re]) => re.test(c)).map(([k]) => k);
    console.log(f, '=>', hits.length ? hits.join(', ') : '(no match)');
    // Show a redacted sample of the first hit
    for (const [k, re] of Object.entries(patterns)) {
        const m = re.exec(c);
        if (m) console.log('    ', k, '::', JSON.stringify(String(m[0]).slice(0, 70)));
    }
}
