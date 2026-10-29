import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { get, post } from '@/lib/api-client';
import { parseQueueSnapshot, type QueueSnapshot } from './queue-contract';

export function AdminQueuesTab() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(parseQueueSnapshot(await get<unknown>('/platform/queues')));
    } catch {
      setSnapshot(null);
      setError('Queue telemetry is unavailable or you are not authorized to view it.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const retry = async (jobId: string) => {
    if (retrying) return;
    setRetrying(jobId); setError(''); setFeedback('');
    try {
      const result = await post<{ success?: boolean; retriedCount?: number; jobId?: string }>('/platform/queues/retry', { jobId, queue: 'notification' });
      if (result?.success !== true || result.retriedCount !== 1 || result.jobId !== jobId) throw new Error('Unexpected retry response');
      setFeedback('The notification job was queued for retry; delivery is not yet confirmed.');
      await load();
    } catch {
      setError('Retry could not be confirmed. Refresh telemetry before trying again.');
    } finally { setRetrying(null); }
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">Background queues</h2><p className="text-xs text-ink-muted">Recent sampled notification and enterprise outbox records, not live worker totals.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {loading && <p role="status">Loading queue telemetry…</p>}
    {snapshot && !loading && <Card><CardHeader><CardTitle>Recent outbox sample</CardTitle>
      <p className="text-xs text-ink-muted">{snapshot.summary.totalInspected} inspected; {snapshot.summary.deadLetterCount} dead-letter; {snapshot.summary.pendingCount} pending; {snapshot.summary.successCount} completed or otherwise resolved. Sampled from MariaDB outboxes.</p>
    </CardHeader><CardContent>
      {snapshot.jobs.length === 0 ? <p>No records in this sample.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Job</th><th>Queue</th><th>Recipient</th><th>State</th><th>Attempts</th><th>Last error</th><th>Action</th></tr></thead><tbody>
        {snapshot.jobs.map(job => <tr key={`${job.queue}:${job.id}`}><td>{job.id}<br />{job.templateType}</td><td>{job.queue} / {job.channel}</td><td>{job.recipient || 'Unavailable'}</td><td>{job.state}</td><td>{job.attemptCount}</td><td>{job.lastError || '—'}</td><td>{job.queue === 'notification' && job.state === 'DEAD_LETTER' && <Button size="sm" variant="outline" disabled={retrying !== null} onClick={() => void retry(job.id)}>Retry</Button>}</td></tr>)}
      </tbody></table></div>}
    </CardContent></Card>}
  </div>;
}
