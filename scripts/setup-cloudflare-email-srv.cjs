const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });
const token = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = 'd8ccfbd6071f6832c01ead8cef2bed3f'; // ime365.com

if (!token) {
    console.error('Missing CLOUDFLARE_API_TOKEN in backend/.env');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
};

async function api(path, options = {}) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
    });
    return await res.json();
}

async function main() {
    console.log('Fetching existing DNS records for ime365.com...');
    const listRes = await api('/dns_records?per_page=100');
    if (!listRes.success) {
        console.error('Failed to list DNS records:', listRes.errors);
        process.exit(1);
    }
    const existing = listRes.result || [];

    // 1. CNAME records for smtp, imap, pop (proxied: false)
    const cnames = [
        { name: 'smtp.ime365.com', content: 'smtp.hostinger.com' },
        { name: 'imap.ime365.com', content: 'imap.hostinger.com' },
        { name: 'pop.ime365.com', content: 'pop.hostinger.com' }
    ];

    for (const c of cnames) {
        const found = existing.find(r => r.type === 'CNAME' && r.name.toLowerCase() === c.name.toLowerCase());
        if (found) {
            console.log(`[EXISTS] CNAME ${c.name} -> ${found.content}`);
        } else {
            console.log(`[CREATING] CNAME ${c.name} -> ${c.content}...`);
            const res = await api('/dns_records', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'CNAME',
                    name: c.name,
                    content: c.content,
                    ttl: 1,
                    proxied: false
                })
            });
            console.log(`  Result for ${c.name}:`, res.success ? 'SUCCESS' : res.errors);
        }
    }

    // 2. SRV records for email autodiscovery (RFC 6186 & Microsoft Outlook)
    const srvs = [
        {
            service: '_submission',
            proto: '_tcp',
            port: 587,
            priority: 0,
            weight: 1,
            target: 'smtp.hostinger.com',
            comment: 'RFC 6186 SMTP submission autodiscovery'
        },
        {
            service: '_smtps',
            proto: '_tcp',
            port: 465,
            priority: 0,
            weight: 1,
            target: 'smtp.hostinger.com',
            comment: 'RFC 6186 SMTPS SSL autodiscovery'
        },
        {
            service: '_imaps',
            proto: '_tcp',
            port: 993,
            priority: 0,
            weight: 1,
            target: 'imap.hostinger.com',
            comment: 'RFC 6186 IMAPS SSL autodiscovery'
        },
        {
            service: '_pop3s',
            proto: '_tcp',
            port: 995,
            priority: 0,
            weight: 1,
            target: 'pop.hostinger.com',
            comment: 'RFC 6186 POP3S SSL autodiscovery'
        },
        {
            service: '_autodiscover',
            proto: '_tcp',
            port: 443,
            priority: 0,
            weight: 0,
            target: 'mail.hostinger.com',
            comment: 'Microsoft Outlook Autodiscover SRV'
        }
    ];

    for (const s of srvs) {
        const fullName = `${s.service}.${s.proto}.ime365.com`;
        const found = existing.find(r => r.type === 'SRV' && r.name.toLowerCase() === fullName.toLowerCase());
        if (found) {
            console.log(`[EXISTS] SRV ${fullName} -> ${found.content}`);
        } else {
            console.log(`[CREATING] SRV ${fullName} -> port ${s.port} target ${s.target}...`);
            const payload = {
                type: 'SRV',
                name: fullName,
                data: {
                    service: s.service,
                    proto: s.proto,
                    name: 'ime365.com',
                    priority: s.priority,
                    weight: s.weight,
                    port: s.port,
                    target: s.target
                },
                ttl: 1
            };
            const res = await api('/dns_records', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            console.log(`  Result for ${fullName}:`, res.success ? 'SUCCESS' : res.errors);
        }
    }

    console.log('\n--- Final Complete DNS Inventory for ime365.com ---');
    const finalRes = await api('/dns_records?per_page=100');
    if (finalRes.result) {
        finalRes.result.forEach(r => {
            const extra = r.data ? `[Port ${r.data.port} -> ${r.data.target}]` : (r.priority ? `[Priority: ${r.priority}]` : '');
            console.log(`${r.type.padEnd(6)} ${r.name.padEnd(38)} ${(r.content || '').padEnd(45)} Proxied: ${r.proxied ? 'YES' : 'NO '} ${extra}`);
        });
    }
}

main().catch(console.error);
