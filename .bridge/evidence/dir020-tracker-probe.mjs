// @ts-check
/**
 * DIR-020 live probe: what does POST/GET /api/jobs-data/tracker actually return
 * for the DIR-020 executive card fields?
 *
 * This exists because the E2E suite proved the salary badge, work-mode pill and
 * relative applied date never render on a freshly created card. Rather than
 * guessing which of the four layers (form -> normalizeTrackedJob -> route ->
 * repository) drops the field, this prints the authoritative server response.
 *
 * Everything runs against the live backend on :8080 and its MariaDB. The probe
 * deletes the row it created so it leaves no residue.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR020_EMAIL || process.env.ADMIN_EMAIL;
const ORIGIN = process.env.DIR020_API_ORIGIN || 'http://localhost:8080';

const session = await mintFirebaseSession({ email: EMAIL });
if (!session) throw new Error('No live identity configured.');

const auth = { Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json' };
const stamp = `${Date.now().toString(36)}`;

const post = await fetch(`${ORIGIN}/api/jobs-data/tracker`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
        title: `Probe Engineer ${stamp}`,
        company: `Probe Co ${stamp}`,
        status: 'wishlist',
        order: 0,
        salary: '\u20b918L - \u20b924L PA',
        dateApplied: '2026-05-04',
        contactPerson: 'Dana Recruiter',
        workMode: 'Hybrid',
    }),
});
const postText = await post.text();
console.log('--- POST raw ---', post.status, post.statusText);
console.log(postText.slice(0, 3000));

let created = {};
try { created = JSON.parse(postText); } catch { /* non-JSON body already printed */ }

console.log('--- POST /tracker response job ---');
console.log(JSON.stringify(created.job, null, 2));

const get = await fetch(`${ORIGIN}/api/jobs-data/tracker`, { headers: auth });
const getText = await get.text();
console.log('\n--- GET raw ---', get.status);
console.log(getText.slice(0, 1500));

let listed = {};
try { listed = JSON.parse(getText); } catch { /* non-JSON body already printed */ }
const found = (listed.jobs || []).find((job) => job.id === created.job?.id);
console.log('\n--- GET /tracker row for the created id ---');
console.log(JSON.stringify(found, null, 2));

const fields = ['salary', 'dateApplied', 'contactPerson', 'workMode'];
console.log('\n--- field presence (POST then GET) ---');
for (const field of fields) {
    console.log(`${field.padEnd(15)} POST=${JSON.stringify(created.job?.[field])}  GET=${JSON.stringify(found?.[field])}`);
}

if (created.job?.id) {
    await fetch(`${ORIGIN}/api/jobs-data/tracker/${encodeURIComponent(created.job.id)}`, {
        method: 'DELETE',
        headers: auth,
        body: JSON.stringify({ expectedRevision: created.job.revision }),
    });
    console.log('\nProbe row deleted.');
}