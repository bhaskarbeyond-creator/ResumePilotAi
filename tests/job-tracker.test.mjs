import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildInterviewIcs, companyMonogram, filterAndSortTrackedJobs, interviewIcsFilename, isUpcomingInterview, JOB_TRACKER_STAGES, nextStage, normalizeInterviewAtValue, normalizeTrackedJob, relativeTimeLabel, stageForStatus, summarizePipeline, validateTrackedJob } from '../src/utils/jobTracker.js';

// DIR-020: normalizeTrackedJob gained the executive card anatomy fields, so the
// strict shape assertion below is extended rather than weakened. Every new field
// keeps an empty-string/first-valid default so the object shape stays stable.
test('tracked jobs normalize malformed fields and reject required or dangerous values', () => {
  assert.deepEqual(normalizeTrackedJob({ title: '  Engineer  ', company: ' ACME ', status: 'invalid', order: -4 }), {
    title: 'Engineer', company: 'ACME', location: '', url: '', notes: '', deadline: '', status: 'wishlist', order: 0,
    salary: '', dateApplied: '', contactPerson: '', contactEmail: '', workMode: 'Remote',
    interviewRound: '', interviewAt: '', interviewFormat: '', interviewLink: '',
  });
  assert.equal(validateTrackedJob({ title: '', company: '' }).valid, false);
  assert.equal(validateTrackedJob({ title: 'Engineer', company: 'ACME', url: 'javascript:alert(1)' }).errors.url, 'Use a valid web address');
  assert.equal(validateTrackedJob({ title: 'Engineer', company: 'ACME', deadline: 'tomorrow' }).errors.deadline, 'Use a valid date');
});

test('DIR-020: the Kanban maps all five directive stages onto the untouched DB enum', () => {
  // Lead ruling: the persisted enum is load-bearing; only DISPLAY labels change,
  // and the fifth column ("Archived") binds to the canonical `rejected` value.
  assert.deepEqual(JOB_TRACKER_STAGES.map((stage) => stage.id),
    ['wishlist', 'applied', 'interview', 'offer', 'rejected']);
  assert.equal(JOB_TRACKER_STAGES[4].label, 'Archived');
  assert.equal(stageForStatus('offer').label, 'Offer Received');
  assert.equal(stageForStatus('nonsense').label, 'Wishlist', 'unknown status must not crash the board');
  assert.equal(nextStage('applied').id, 'interview');
  assert.equal(nextStage('rejected'), null, 'the last column has no forward stage');
});

test('DIR-020: the analytics ribbon reports a truthful interview rate', () => {
  const jobs = [
    { status: 'wishlist' }, { status: 'applied' }, { status: 'applied' },
    { status: 'interview' }, { status: 'offer' }, { status: 'rejected' },
  ];
  const summary = summarizePipeline(jobs);
  assert.equal(summary.total, 6);
  // Archived is excluded from "active" so the headline reflects live opportunities.
  assert.equal(summary.active, 5);
  // Rate is measured against SUBMITTED applications (applied+interview+offer = 4),
  // never against wishlist entries, which would inflate it to a meaningless 60%.
  assert.equal(summary.submitted, 4);
  assert.equal(summary.interviewRate, 50);
  assert.equal(summary.pendingResponses, 2);
  assert.equal(summary.offerCount, 1);
  assert.equal(summarizePipeline([]).interviewRate, 0, 'no applications must not divide by zero');
  assert.equal(summarizePipeline(null).total, 0, 'tolerates a null payload');
});

test('DIR-020: relative time, monogram and upcoming-interview helpers are honest', () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  assert.equal(relativeTimeLabel(threeDaysAgo), 'Applied 3 days ago');
  assert.equal(relativeTimeLabel(new Date(Date.now() - 86_400_000).toISOString()), 'Applied 1 day ago');
  assert.equal(relativeTimeLabel('not-a-date'), '');
  assert.equal(companyMonogram('Northwind Traders'), 'NT');
  assert.equal(companyMonogram('  '), '?');
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(isUpcomingInterview(soon), true);
  assert.equal(isUpcomingInterview(new Date(Date.now() + 10 * 86_400_000).toISOString()), false);
});

test('DIR-020 AC-5: the .ics export is RFC 5545 compliant and deterministic', () => {
  const ics = buildInterviewIcs({
    id: 'tracker_1',
    title: 'Senior; Engineer, Platform',
    company: 'ACME',
    interviewRound: 'System Design',
    interviewAt: '2026-05-04T09:30',
    interviewFormat: 'Video',
    interviewLink: 'https://meet.example.com/abc',
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:\d{8}T\d{6}Z/, 'start must be a UTC RFC 5545 stamp');
  assert.match(ics, /DTEND:\d{8}T\d{6}Z/);
  assert.match(ics, /UID:/);
  // Semicolons and commas in TEXT properties MUST be escaped. The round type is
  // prepended unescaped-safe ("System Design"), and the title's ";" and "," are
  // escaped rather than injected raw into the content line.
  assert.match(ics, /SUMMARY:System Design - Senior\\; Engineer\\, Platform/);
  // Newlines inside DESCRIPTION become the literal \n escape, never a raw break.
  assert.match(ics, /DESCRIPTION:Company: ACME\\nFormat: Video/);
  // Every content line ends with CRLF and the calendar is closed.
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics, buildInterviewIcs({
    id: 'tracker_1', title: 'Senior; Engineer, Platform', company: 'ACME',
    interviewRound: 'System Design', interviewAt: '2026-05-04T09:30',
    interviewFormat: 'Video', interviewLink: 'https://meet.example.com/abc',
  }), 'exporting twice must be byte-identical, not DTSTAMP-churned');
  assert.equal(buildInterviewIcs({ title: 'No date' }), '', 'an unscheduled interview exports nothing');
  assert.equal(interviewIcsFilename({ title: 'Senior Engineer', interviewAt: '2026-05-04T09:30' }),
    'senior-engineer-202605040930.ics');
});

test('DIR-020: interview timestamps normalize from driver and control shapes', () => {
  assert.equal(normalizeInterviewAtValue('2026-05-04T09:30'), '2026-05-04T09:30');
  assert.equal(normalizeInterviewAtValue(new Date(2026, 4, 4, 9, 30)), '2026-05-04T09:30');
  assert.equal(normalizeInterviewAtValue('nonsense'), '');
  assert.equal(normalizeInterviewAtValue(''), '');
});

test('tracked job search handles missing and Unicode fields without mutating board order', () => {
  const jobs = [
    { id: '2', title: 'Développeur', company: 'Équipe', location: null, status: 'wishlist', order: 2 },
    { id: '1', title: 'Engineer', company: 'ACME', notes: 'తెలుగు', status: 'applied', order: 1 },
  ];
  const snapshot = structuredClone(jobs);
  assert.deepEqual(filterAndSortTrackedJobs(jobs).map((job) => job.id), ['1', '2']);
  assert.deepEqual(filterAndSortTrackedJobs(jobs, 'équipe').map((job) => job.id), ['2']);
  assert.deepEqual(filterAndSortTrackedJobs(jobs, 'తెలుగు').map((job) => job.id), ['1']);
  assert.deepEqual(jobs, snapshot);
});

test('job tracker persistence is revisioned and destructive actions use an accessible confirmation', async () => {
  const [operations, tracker, routes, repository, migration] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/AppliedJobs/JobTracker.jsx', 'utf8'),
    fs.readFile('backend/routes/jobsData.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'),
    fs.readFile('backend/database/migrations/007_job_tracker_revision.sql', 'utf8'),
  ]);
  assert.match(operations, /\/api\/jobs-data\/tracker/);
  assert.match(operations, /expectedRevision/);
  assert.match(tracker, /JOB_TRACKER_CONFLICT/);
  assert.match(tracker, /role="alertdialog"/);
  assert.doesNotMatch(tracker, /window\.confirm/);
  assert.match(routes, /req\.repository\.getTrackedJobs\(req\.user\.uid\)/);
  assert.match(routes, /req\.repository\.updateTrackedJob\([\s\S]*req\.user\.uid/);
  assert.match(repository, /SELECT \* FROM job_tracker WHERE id = \? AND user_id = \? FOR UPDATE/);
  assert.match(repository, /JOB_TRACKER_CONFLICT/);
  assert.match(repository, /nextRevision = currentRevision \+ 1/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS revision/);
  assert.match(migration, /idx_jt_user_updated/);
});
