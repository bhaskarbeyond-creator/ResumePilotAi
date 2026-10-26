const dns = require('dns').promises;
const net = require('net');

function isPrivateV4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family !== 6) return true;
  const value = ip.toLowerCase().split('%')[0];
  // Reject non-global, transition and documentation ranges. IPv4-mapped IPv6 is
  // rejected wholesale so alternate hex forms cannot bypass IPv4 classification.
  return value === '::1' || value === '::'
    || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8')
    || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
    || value.startsWith('ff') || value.startsWith('::ffff:')
    || value.startsWith('2001:db8:') || value.startsWith('2001:db8::')
    || value.startsWith('2002:') || value.startsWith('100:')
    || value.startsWith('2001:10:') || value.startsWith('2001:2:');
}

async function assertPublicNetworkTarget(hostname) {
  if (typeof hostname !== 'string' || hostname.length > 253) throw new Error('Invalid network host');
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Internal network targets are prohibited');
  }
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Private or reserved network targets are prohibited');
  }
  return Object.freeze({ host, addresses: addresses.map(item => item.address) });
}

function assertHttpsUrl(value, allowedHosts = []) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error('Invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('HTTPS URL required');
  if (allowedHosts.length && !allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error('URL host is not allowed');
  }
  return parsed;
}

module.exports = { assertPublicNetworkTarget, assertHttpsUrl, isPrivateIp, isPrivateV4 };
