const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) {
    console.error('Missing CLOUDFLARE_API_TOKEN in backend/.env');
    process.exit(1);
}

const zones = [
    { name: 'leewayspace.in', id: '726eeb8644c27cc632b9b61c0ea3273a' },
    { name: 'leewayspace.com', id: '3348042f97ff01c55365a2a67fc0f566' }
];

const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
};

async function api(zoneId, path, options = {}) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
    });
    return await res.json();
}

async function syncZone(zone) {
    console.log(`\n========================================`);
    console.log(`Syncing Email Auto-Discovery: ${zone.name}`);
    console.log(`========================================`);

    const listRes = await api(zone.id, '/dns_records?per_page=100');
    if (!listRes.success) {
        console.error(`Failed to list DNS records for ${zone.name}:`, listRes.errors);
        return;
    }
    const existing = listRes.result || [];

    // 1. Ensure pop CNAME
    const popName = `pop.${zone.name}`;
    const popFound = existing.find(r => r.type === 'CNAME' && r.name.toLowerCase() === popName.toLowerCase());
    if (popFound) {
        console.log(`[EXISTS] CNAME ${popName} -> ${popFound.content}`);
    } else {
        console.log(`[CREATING] CNAME ${popName} -> pop.hostinger.com...`);
        const res = await api(zone.id, '/dns_records', {
            method: 'POST',
            body: JSON.stringify({
                type: 'CNAME',
                name: popName,
                content: 'pop.hostinger.com',
                ttl: 1,
                proxied: false
            })
        });
        console.log(`  Result for ${popName}:`, res.success ? 'SUCCESS' : res.errors);
    }

    // 2. Ensure SRV records
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
        const fullName = `${s.service}.${s.proto}.${zone.name}`;
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
                    name: zone.name,
                    priority: s.priority,
                    weight: s.weight,
                    port: s.port,
                    target: s.target
                },
                ttl: 1
            };
            const res = await api(zone.id, '/dns_records', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            console.log(`  Result for ${fullName}:`, res.success ? 'SUCCESS' : res.errors);
        }
    }

    // Purge Cache
    console.log(`Purging cache for ${zone.name}...`);
    const purgeRes = await api(zone.id, '/purge_cache', {
        method: 'POST',
        body: JSON.stringify({ purge_everything: true })
    });
    console.log(`Cache purge for ${zone.name}:`, purgeRes.success ? 'SUCCESS' : purgeRes.errors);
}

async function main() {
    for (const z of zones) {
        await syncZone(z);
    }
}

main().catch(console.error);
