// @ts-check
/**
 * DIR-020 live probe #2 — isolates the two remaining E2E failures:
 *   (A) a freshly created card renders NO "Applied <time>" label.
 *   (B) scheduling an interview does not move the card into Interviewing.
 *
 * (A) root cause candidate: the POST /tracker response omits createdAt/updatedAt,
 *     so the client-side `relativeTimeLabel(job.dateApplied || job.updatedAt)`
 *     has nothing to render until the page is reloaded from GET.
 * (B) root cause candidate: the PATCH drops the interview_* columns or the
 *     optimistic-revision CAS rejects the write.
 *
 * Everything runs against the live backend on :8080 and its MariaDB, and the
 * probe deletes the row it created so it leaves no residue.
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
    body: JSON.stringify({ title: `Probe2 ${stamp}`, company: `Probe2 Co ${stamp}`, status: 'wishlist', order: 0 }),
});
const created = (await post.json()).job;
console.log('POST keys:', Object.keys(created).join(','));
console.log('POST createdAt:', created.createdAt, '| updatedAt:', created.updatedAt, '| revision:', created.revision);

// (A) Does the POST response carry a usable timestamp for the applied label?
const appliedSource = created.dateApplied || created.updatedAt;
console.log('(A) applied label source =>', JSON.stringify(appliedSource), '=> renders', appliedSource ? 'YES' : 'NO');

// (B) PATCH exactly what the interview scheduler sends.
const patch = {
    status: 'interview',
    interviewRound: 'Technical',
    interviewAt: '2027-05-04T09:30',
    interviewFormat: 'Video',
    interviewLink: 'https://meet.example.com/dir020probe2',
};
const patchRes = await fetch(`${ORIGIN}/api/jobs-data/tracker/${created.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ ...patch, expectedRevision: created.revision }),
});
const patchText = await patchRes.text();
console.log('\n(B) PATCH status:', patchRes.status);
console.log('(B) PATCH body:', patchText.slice(0, 1200));

// Re-read from MariaDB to see what actually persisted.
const listed = await (await fetch(`${ORIGIN}/api/jobs-data/tracker`, { headers: auth })).json();
const row = listed.jobs.find((job) => job.id === created.id);
console.log('\n(B) GET row status:', row?.status, '| round:', row?.interviewRound, '| at:', row?.interviewAt, '| revision:', row?.revision);

await fetch(`${ORIGIN}/api/jobs-data/tracker/${created.id}`, {
    method: 'DELETE',
    headers: auth,
    body: JSON.stringify({ expectedRevision: row?.revision }),
});
console.log('\nProbe row deleted.');

// DIR-020 forensics: rows left behind by the failed E2E run reveal the TRUE
// status/revision the card actually reached in MariaDB.
const { jobs } = await (await fetch(`${ORIGIN}/api/jobs-data/tracker`, { headers: auth })).json();
const leftovers = jobs.filter((j) => /Platform Engineer|Probe2|dir020/.test(String(j.title || '')));
console.log('\n=== LEFTOVER ROWS:', leftovers.length, '===');
for (const j of leftovers) {
    console.log(JSON.stringify({
        title: j.title, status: j.status, revision: j.revision,
        dateApplied: j.dateApplied, workMode: j.workMode,
        interviewRound: j.interviewRound, interviewAt: j.interviewAt,
        updatedAt: j.updatedAt,
    }));
}

// The failed runs above left E2E rows behind that collide on the shared note
// fixture text ("Recruiter confirmed a system design loop."), which breaks
// Playwright strict-mode resolution for every future run. They are pure test
// residue (titles carry the run stamp), so remove exactly those and nothing else.
let removed = 0;
for (const j of jobs) {
    if (!/dir020-\w+$/.test(String(j.title || ''))) continue;
    const del = await fetch(`${ORIGIN}/api/jobs-data/tracker/${j.id}`, {
        method: 'DELETE',
        headers: auth,
        body: JSON.stringify({ expectedRevision: j.revision }),
    });
    if (del.ok) removed += 1;
    else console.log('could not remove', j.id, del.status);
}
console.log('\ncleaned up E2E residue rows:', removed);
const after = await (await fetch(`${ORIGIN}/api/jobs-data/tracker`, { headers: auth })).json();
console.log('remaining rows:', after.jobs.length);