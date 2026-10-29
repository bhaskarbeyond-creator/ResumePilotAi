export interface QueueJob {
  id: string;
  queue: string;
  channel: string;
  recipient: string | null;
  templateType: string | null;
  state: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string | null;
}
export interface QueueSnapshot {
  jobs: QueueJob[];
  summary: { totalInspected: number; deadLetterCount: number; pendingCount: number; successCount: number; source: string; sampled: true };
}
export function parseQueueSnapshot(value: unknown): QueueSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid queue telemetry response.');
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.jobs) || !v.summary || typeof v.summary !== 'object') throw new Error('Invalid queue telemetry response.');
  const summary = v.summary as Record<string, unknown>;
  const counts = ['totalInspected', 'deadLetterCount', 'pendingCount', 'successCount'];
  if (summary.source !== 'MARIADB_OUTBOXES' || summary.sampled !== true || counts.some(k => !Number.isSafeInteger(summary[k]) || (summary[k] as number) < 0) || summary.totalInspected !== v.jobs.length) throw new Error('Invalid queue telemetry response.');
  for (const item of v.jobs) {
    if (!item || typeof item !== 'object') throw new Error('Invalid queue telemetry response.');
    const j = item as Record<string, unknown>;
    if (['id', 'queue', 'channel', 'state'].some(k => typeof j[k] !== 'string') || !Number.isSafeInteger(j.attemptCount) || (j.attemptCount as number) < 0 || ['recipient', 'templateType', 'lastError', 'createdAt'].some(k => j[k] != null && typeof j[k] !== 'string')) throw new Error('Invalid queue telemetry response.');
  }
  return value as QueueSnapshot;
}
