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
  summary: {
    totalInspected: number;
    deadLetterCount: number;
    pendingCount: number;
    successCount: number;
    source: string;
    sampled: true;
  };
}

export function parseQueueSnapshot(value: unknown): QueueSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid queue telemetry response.');
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.jobs) || !v.summary || typeof v.summary !== 'object') {
    throw new Error('Invalid queue telemetry response.');
  }
  const summary = v.summary as Record<string, unknown>;
  const counts = ['totalInspected', 'deadLetterCount', 'pendingCount', 'successCount'];
  if (
    summary.source !== 'MARIADB_OUTBOXES' ||
    summary.sampled !== true ||
    counts.some((k) => !Number.isSafeInteger(summary[k]) || (summary[k] as number) < 0) ||
    summary.totalInspected !== v.jobs.length
  ) {
    throw new Error('Invalid queue telemetry response.');
  }
  for (const item of v.jobs) {
    if (!item || typeof item !== 'object') throw new Error('Invalid queue telemetry response.');
    const j = item as Record<string, unknown>;
    if (
      ['id', 'queue', 'channel', 'state'].some((k) => typeof j[k] !== 'string') ||
      !Number.isSafeInteger(j.attemptCount) ||
      (j.attemptCount as number) < 0 ||
      ['recipient', 'templateType', 'lastError', 'createdAt'].some(
        (k) => j[k] != null && typeof j[k] !== 'string',
      )
    ) {
      throw new Error('Invalid queue telemetry response.');
    }
  }
  return value as QueueSnapshot;
}

export interface OutboxStats {
  PENDING: number;
  DELIVERED: number;
  DEAD_LETTER: number;
}

export interface OutboxProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonNegativeCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Outbox telemetry returned an invalid negative or non-numeric count.');
  }
  return Math.trunc(numeric);
}

/**
 * Parses `GET /api/admin/system/outbox/stats`, supporting either top-level
 * `{ PENDING, DELIVERED, DEAD_LETTER }` or `{ counts: { ... } }` / `{ stats: { ... } }` envelopes.
 */
export function parseOutboxStats(value: unknown): OutboxStats {
  if (!isObjectRecord(value)) {
    throw new Error('Outbox stats response was not a valid JSON object.');
  }

  const envelope = isObjectRecord(value.counts)
    ? value.counts
    : isObjectRecord(value.stats)
      ? value.stats
      : isObjectRecord(value.data)
        ? value.data
        : value;

  const pending = asNonNegativeCount(envelope.PENDING ?? envelope.pending);
  const delivered = asNonNegativeCount(
    envelope.DELIVERED ?? envelope.delivered ?? envelope.SENT ?? envelope.sent,
  );
  const deadLetter = asNonNegativeCount(
    envelope.DEAD_LETTER ??
      envelope.deadLetter ??
      envelope.dead_letter ??
      envelope.FAILED ??
      envelope.failed,
  );

  if (pending === null && delivered === null && deadLetter === null) {
    throw new Error('Outbox stats response did not contain recognized telemetry counters.');
  }

  return {
    PENDING: pending ?? 0,
    DELIVERED: delivered ?? 0,
    DEAD_LETTER: deadLetter ?? 0,
  };
}

/**
 * Parses `POST /api/admin/system/outbox/process` response counts without
 * fabricating delivery results.
 */
export function parseOutboxProcessResult(value: unknown): OutboxProcessResult {
  if (!isObjectRecord(value)) {
    throw new Error('Outbox batch processing response was not a valid JSON object.');
  }

  const envelope = isObjectRecord(value.result)
    ? value.result
    : isObjectRecord(value.summary)
      ? value.summary
      : isObjectRecord(value.data)
        ? value.data
        : value;

  const explicitProcessed = asNonNegativeCount(
    envelope.processed ?? envelope.totalProcessed ?? envelope.total_processed ?? envelope.count,
  );
  const explicitSucceeded = asNonNegativeCount(
    envelope.succeeded ?? envelope.delivered ?? envelope.sent ?? envelope.successCount,
  );
  const explicitFailed = asNonNegativeCount(
    envelope.failed ??
      envelope.deadLetter ??
      envelope.dead_letter ??
      envelope.errorCount ??
      envelope.errors,
  );

  if (explicitProcessed === null && explicitSucceeded === null && explicitFailed === null) {
    throw new Error('Outbox batch processing response did not include processed event counts.');
  }

  const failed = explicitFailed ?? 0;
  const succeeded =
    explicitSucceeded !== null
      ? explicitSucceeded
      : Math.max(0, (explicitProcessed ?? 0) - failed);
  const processed = explicitProcessed !== null ? explicitProcessed : succeeded + failed;

  return {
    processed,
    succeeded,
    failed,
  };
}

export function formatOutboxProcessSummary(result: OutboxProcessResult): string {
  const noun = result.processed === 1 ? 'event' : 'events';
  return `Processed ${result.processed} ${noun}: ${result.succeeded} succeeded, ${result.failed} failed.`;
}
