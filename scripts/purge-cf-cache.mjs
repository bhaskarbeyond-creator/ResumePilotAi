const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_TOKEN || '';
const zoneId = 'd8ccfbd6071f6832c01ead8cef2bed3f';

const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${cfToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ purge_everything: true })
});
const cfData = await cfRes.json();
console.log('Cloudflare cache purge result:', cfData.success ? 'SUCCESS' : cfData.errors);
