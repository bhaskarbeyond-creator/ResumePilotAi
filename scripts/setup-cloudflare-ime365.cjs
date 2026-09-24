const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });

const token = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = 'd8ccfbd6071f6832c01ead8cef2bed3f'; // ime365.com zone
const SERVER_IP = '82.112.232.112';

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
    const json = await res.json();
    return json;
}

async function main() {
    console.log('Fetching current DNS records for ime365.com...');
    const listRes = await api('/dns_records?per_page=100');
    if (!listRes.success) {
        console.error('Failed to list DNS records:', listRes.errors);
        process.exit(1);
    }

    const existing = listRes.result || [];
    console.log(`Found ${existing.length} existing records.`);

    // 1. Update root A record to point to production server 82.112.232.112
    const rootA = existing.find(r => r.type === 'A' && r.name === 'ime365.com');
    if (rootA) {
        if (rootA.content !== SERVER_IP || !rootA.proxied) {
            console.log(`Updating A record ${rootA.id} to ${SERVER_IP} (proxied: true)...`);
            const updateRes = await api(`/dns_records/${rootA.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    content: SERVER_IP,
                    proxied: true,
                    ttl: 1
                })
            });
            console.log('Root A update result:', updateRes.success ? 'SUCCESS' : updateRes.errors);
        } else {
            console.log(`Root A record is already correctly set to ${SERVER_IP} (proxied: true).`);
        }
    } else {
        console.log(`Creating root A record for ime365.com -> ${SERVER_IP}...`);
        const createRes = await api('/dns_records', {
            method: 'POST',
            body: JSON.stringify({
                type: 'A',
                name: 'ime365.com',
                content: SERVER_IP,
                proxied: true,
                ttl: 1
            })
        });
        console.log('Root A create result:', createRes.success ? 'SUCCESS' : createRes.errors);
    }

    // 2. Ensure www CNAME exists and is proxied
    const wwwCname = existing.find(r => r.name === 'www.ime365.com');
    if (wwwCname) {
        if (!wwwCname.proxied) {
            console.log('Ensuring www.ime365.com is proxied...');
            await api(`/dns_records/${wwwCname.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ proxied: true, ttl: 1 })
            });
        }
        console.log('www.ime365.com CNAME is configured.');
    } else {
        console.log('Creating www.ime365.com CNAME -> ime365.com...');
        await api('/dns_records', {
            method: 'POST',
            body: JSON.stringify({
                type: 'CNAME',
                name: 'www.ime365.com',
                content: 'ime365.com',
                proxied: true,
                ttl: 1
            })
        });
    }

    // 3. Email records to create
    const recordsToSync = [
        // MX Records
        { type: 'MX', name: 'ime365.com', content: 'mx1.hostinger.com', priority: 5, ttl: 1, proxied: false },
        { type: 'MX', name: 'ime365.com', content: 'mx2.hostinger.com', priority: 10, ttl: 1, proxied: false },

        // SPF TXT Record
        { type: 'TXT', name: 'ime365.com', content: 'v=spf1 include:_spf.mail.hostinger.com ~all', ttl: 1 },

        // DKIM CNAME Records (Hostinger selectors a, b, c)
        { type: 'CNAME', name: 'hostingermail-a._domainkey.ime365.com', content: 'hostingermail-a.dkim.mail.hostinger.com', ttl: 1, proxied: false },
        { type: 'CNAME', name: 'hostingermail-b._domainkey.ime365.com', content: 'hostingermail-b.dkim.mail.hostinger.com', ttl: 1, proxied: false },
        { type: 'CNAME', name: 'hostingermail-c._domainkey.ime365.com', content: 'hostingermail-c.dkim.mail.hostinger.com', ttl: 1, proxied: false },

        // DMARC TXT Record
        { type: 'TXT', name: '_dmarc.ime365.com', content: 'v=DMARC1; p=none; rua=mailto:admin@ime365.com; ruf=mailto:admin@ime365.com; sp=none; fo=1', ttl: 1 },

        // Mail Client Discovery & Webmail CNAMEs
        { type: 'CNAME', name: 'mail.ime365.com', content: 'hostingermail.com', ttl: 1, proxied: false },
        { type: 'CNAME', name: 'autoconfig.ime365.com', content: 'autoconfig.hostinger.com', ttl: 1, proxied: false },
        { type: 'CNAME', name: 'autodiscover.ime365.com', content: 'autodiscover.hostinger.com', ttl: 1, proxied: false }
    ];

    for (const rec of recordsToSync) {
        const found = existing.find(r =>
            r.type === rec.type &&
            r.name.toLowerCase() === rec.name.toLowerCase() &&
            (rec.type !== 'MX' || r.priority === rec.priority) &&
            (rec.type !== 'TXT' || (r.content || '').includes('v=spf1') || (r.content || '').includes('v=DMARC1'))
        );

        if (found) {
            console.log(`[EXISTS] ${rec.type.padEnd(5)} ${rec.name} -> ${found.content}`);
        } else {
            console.log(`[CREATING] ${rec.type.padEnd(5)} ${rec.name} -> ${rec.content} (Priority: ${rec.priority || 'N/A'})...`);
            const payload = {
                type: rec.type,
                name: rec.name,
                content: rec.content,
                ttl: rec.ttl || 1,
            };
            if (rec.priority !== undefined) payload.priority = rec.priority;
            if (rec.proxied !== undefined) payload.proxied = rec.proxied;

            const createRes = await api('/dns_records', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (createRes.success) {
                console.log(`   ✓ Created ${rec.name}`);
            } else {
                console.error(`   ✗ Error creating ${rec.name}:`, createRes.errors);
            }
        }
    }

    console.log('\n--- Final Verified DNS Records for ime365.com ---');
    const finalRes = await api('/dns_records?per_page=100');
    if (finalRes.result) {
        finalRes.result.forEach(r => {
            console.log(`${r.type.padEnd(6)} ${r.name.padEnd(35)} ${(r.content || '').padEnd(45)} Proxied: ${r.proxied ? 'YES' : 'NO'}  TTL: ${r.ttl} ${r.priority ? 'Priority: ' + r.priority : ''}`);
        });
    }
}

main().catch(err => console.error(err));
