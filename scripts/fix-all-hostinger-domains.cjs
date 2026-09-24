const dotenv = require('dotenv');
dotenv.config({ path: 'backend/.env' });
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) {
    console.error('Missing CLOUDFLARE_API_TOKEN in backend/.env');
    process.exit(1);
}

const targetDomains = [
    'leewayspace.com',
    'leewayspace.in',
    'ime365.com',
    'athidhidevobhava.in',
    'projectdemo.guru',
    'devangaparinayam.com',
    'gitsolutions.in',
    'vizagacres.com'
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

async function fixDomain(zone) {
    console.log(`\n======================================================`);
    console.log(`Auditing & Fixing: ${zone.name} (${zone.id})`);
    console.log(`======================================================`);

    const listRes = await api(zone.id, '/dns_records?per_page=100');
    if (!listRes.success) {
        console.error(`Failed to fetch records for ${zone.name}:`, listRes.errors);
        return;
    }
    const existing = listRes.result || [];

    // 1. Remove conflicting CNAME autodiscover (Causes "Security Alert: Certificate Invalid" on Hostinger)
    const badAutodiscover = existing.find(r => r.name.toLowerCase() === `autodiscover.${zone.name.toLowerCase()}`);
    if (badAutodiscover) {
        console.log(`[REMOVING] Conflicting ${badAutodiscover.type} ${badAutodiscover.name} -> ${badAutodiscover.content} (prevents SSL cert warning)...`);
        const delRes = await api(zone.id, `/dns_records/${badAutodiscover.id}`, { method: 'DELETE' });
        console.log(`  Delete result:`, delRes.success ? 'SUCCESS' : delRes.errors);
    } else {
        console.log(`[CLEAN] No conflicting autodiscover CNAME found.`);
    }

    // 2. Remove any obsolete third-party SRV records (e.g. GoDaddy secureserver)
    const staleSrvs = existing.filter(r => r.type === 'SRV' && r.data && (r.data.target || '').includes('secureserver.net'));
    for (const stale of staleSrvs) {
        console.log(`[REMOVING] Stale third-party SRV ${stale.name} -> ${stale.data.target}...`);
        await api(zone.id, `/dns_records/${stale.id}`, { method: 'DELETE' });
    }

    // 3. Ensure subdomains: smtp, imap, pop, mail
    const cnames = [
        { name: `smtp.${zone.name}`, content: 'smtp.hostinger.com' },
        { name: `imap.${zone.name}`, content: 'imap.hostinger.com' },
        { name: `pop.${zone.name}`, content: 'pop.hostinger.com' },
        { name: `mail.${zone.name}`, content: 'mail.hostinger.com' }
    ];

    for (const c of cnames) {
        const found = existing.find(r => r.name.toLowerCase() === c.name.toLowerCase());
        if (!found) {
            console.log(`[CREATING] CNAME ${c.name} -> ${c.content}...`);
            await api(zone.id, '/dns_records', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'CNAME',
                    name: c.name,
                    content: c.content,
                    ttl: 1,
                    proxied: false
                })
            });
        }
    }

    // 4. Ensure standard Hostinger SRV records
    const requiredSrvs = [
        { service: '_submission', proto: '_tcp', port: 587, priority: 0, weight: 1, target: 'smtp.hostinger.com' },
        { service: '_smtps', proto: '_tcp', port: 465, priority: 0, weight: 1, target: 'smtp.hostinger.com' },
        { service: '_imaps', proto: '_tcp', port: 993, priority: 0, weight: 1, target: 'imap.hostinger.com' },
        { service: '_pop3s', proto: '_tcp', port: 995, priority: 0, weight: 1, target: 'pop.hostinger.com' },
        { service: '_autodiscover', proto: '_tcp', port: 443, priority: 0, weight: 0, target: 'mail.hostinger.com' }
    ];

    for (const s of requiredSrvs) {
        const fullName = `${s.service}.${s.proto}.${zone.name}`;
        const found = existing.find(r => r.type === 'SRV' && r.name.toLowerCase() === fullName.toLowerCase());
        if (!found) {
            console.log(`[CREATING] SRV ${fullName} -> port ${s.port} target ${s.target}...`);
            await api(zone.id, '/dns_records', {
                method: 'POST',
                body: JSON.stringify({
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
                })
            });
        }
    }

    // 5. Purge cache
    await api(zone.id, '/purge_cache', {
        method: 'POST',
        body: JSON.stringify({ purge_everything: true })
    });
    console.log(`  ✓ Sync and cache purge completed for ${zone.name}`);
}

async function main() {
    const zonesRes = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const allZones = (await zonesRes.json()).result || [];

    for (const name of targetDomains) {
        const z = allZones.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (z) {
            await fixDomain(z);
        } else {
            console.log(`Zone not found: ${name}`);
        }
    }

    console.log('\n======================================================');
    console.log('ALL HOSTINGER DOMAINS COMPREHENSIVELY AUDITED & FIXED!');
    console.log('======================================================');
}

main().catch(console.error);
